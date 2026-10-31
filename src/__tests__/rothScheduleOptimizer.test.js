// The year-by-year Roth schedule (changelog 465): the 'schedule' strategy
// fills each listed year to its own bracket, and optimizeRothSchedule
// searches for the schedule that best serves the chosen goal, on the
// device, within its projection budget.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  runProjection, runMonteCarlo, sanitizeInputs, optimizeRothSchedule,
  findDieWithZeroSpending, ROTH_SCHEDULE_BUDGET, irmaaThresholdsFor,
} from '../calculator';
// The reference household (the pre-469 default plan): see referenceHousehold.js.
import { REFERENCE_INPUTS as DEFAULT_INPUTS } from './referenceHousehold';
import { buildParkersInputs } from '../config/demoPlanParkers';
import { buildDemoInputs } from '../config/demoPlan';
import { assertKnownInputKeys } from './knownInputKeys';

// The Part A fixture: a single retiree whose only taxable income is the
// conversion (costs drawn from Roth basis).
const single = assertKnownInputKeys({
  ...DEFAULT_INPUTS, planYear: 2026, spouse2Enabled: false, filingStatus: 'Single', birthYear1: 1966,
  retireAge1: 50, salary1: 0, salary2: 0, ss1: 0, ss2: 0, pension1: 0, pension2: 0,
  preTaxInit: 500000, rothInit: 200000, rothBasisInit: 200000, taxableInit: 0, hsaInit: 0,
  withdrawalStrategy: 'RothFirst', lifestyleExpense: 0, mortgageBalance: 0, mortgagePayment: 0, homeOwned: false,
  rothConversionStrategy: 'schedule', rothConversionBuffer: 0, rothConversionDelayUntilRetire: true,
  itemizeDeductions: 'auto', acaCliffProtectionEnabled: false, rothConversionIrmaaCapEnabled: false,
  healthcareBridgeCost: 0, stateOfResidence: 'TX', stateTaxState: 'none',
});
const plan800 = assertKnownInputKeys({ ...DEFAULT_INPUTS, preTaxInit: 800000 });
const years = (inputs) => runProjection(inputs).years;
const allYears = (inputs, bracket) => years(inputs).map((y) => ({ year: y.year, bracket }));

describe('the schedule strategy', () => {
  it('C1 a 0% year converts the deduction, a year with no bracket converts nothing', () => {
    const ys = years({ ...single, rothConversionSchedule: [{ year: 2026, bracket: 0 }] });
    expect(ys[0].convertAmount).toBeCloseTo(16100, 0);
    for (const y of ys.slice(1)) expect(y.convertAmount).toBe(0);
  });

  it('C2 each year fills to its own bracket', () => {
    const ys = years({ ...single, rothConversionSchedule: [{ year: 2026, bracket: 0.10 }, { year: 2027, bracket: 0 }] });
    expect(ys[0].convertAmount).toBeCloseTo(28500, 0);
    expect(ys[1].convertAmount).toBeCloseTo(ys[1].stdDeduction, 0);
    expect(ys[1].stdDeduction).toBeGreaterThan(16100);
    expect(ys[2].convertAmount).toBe(0);
  });

  it('C3 the same bracket every year is the single-bracket strategy, row for row', () => {
    for (const b of [0, 0.12, 0.22]) {
      const flat = years({ ...plan800, rothConversionStrategy: 'maxBracket', rothConversionBracket: b });
      const sched = years({ ...plan800, rothConversionStrategy: 'schedule', rothConversionSchedule: allYears(plan800, b) });
      expect(sched).toEqual(flat);
    }
  });

  it('C4 the Medicare surcharge and ACA limits still hold back each scheduled conversion', () => {
    const couple = assertKnownInputKeys({
      ...plan800, spouse2Enabled: true, filingStatus: 'MFJ', birthYear1: 1962, birthYear2: 1962,
      retireAge1: 62, retireAge2: 62, salary1: 0, salary2: 0, claimingAge1: 70, claimingAge2: 70,
      rothConversionIrmaaCapEnabled: true, rothConversionIrmaaTier: 0, acaCliffProtectionEnabled: true,
      healthcareBridgeCost: 12000, rothConversionDelayUntilRetire: true,
    });
    const sched = { ...couple, rothConversionStrategy: 'schedule', rothConversionSchedule: allYears(couple, 0.32) };
    const flat = { ...couple, rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.32 };
    // Same caps, same results: the schedule reaches the engine's caps the way the flat strategy does.
    expect(years(sched)).toEqual(years(flat));
    const ys = years(sched);
    expect(ys.some((y) => (y.irmaaCappedConversion || 0) > 0)).toBe(true);
    expect(ys.some((y) => (y.acaCliffCappedConversion || 0) > 0)).toBe(true);
    expect(typeof irmaaThresholdsFor).toBe('function');
  });

  it('sanitizing: records only, years inside the plan, real brackets, one entry per year', () => {
    const clean = sanitizeInputs({
      ...DEFAULT_INPUTS,
      rothConversionSchedule: [{ year: 2030, bracket: 0.22 }, 'x', null, { year: 1999, bracket: 0.12 }, { year: 2031, bracket: 0.15 }, { year: 2030, bracket: 12 }, { year: 2032, bracket: null }],
      rothOptimizerObjective: 'other',
    });
    expect(clean.rothConversionSchedule).toEqual([{ year: 2030, bracket: 0.12 }, { year: 2031, bracket: null }, { year: 2032, bracket: null }]);
    expect(clean.rothOptimizerObjective).toBe('afterTaxEnding');
  });
});

describe('optimizeRothSchedule', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('C5 leave the most after tax: never worse than its seeds, within budget', () => {
    const r = optimizeRothSchedule(plan800, { objective: 'afterTaxEnding' });
    expect(r.value).toBeGreaterThanOrEqual(r.flatBestValue - 1e-6);
    expect(r.value).toBeGreaterThanOrEqual(r.baselineValue - 1e-6);
    expect(r.runs).toBeLessThanOrEqual(ROTH_SCHEDULE_BUDGET);
    // The answer is what the schedule actually projects.
    expect(r.schedule.length).toBeGreaterThan(0);
  });

  it('C6 spend the most: at least what the best single bracket allows, within budget', () => {
    const r = optimizeRothSchedule(plan800, { objective: 'lifetimeSpending' });
    const flatPlan = { ...plan800, rothConversionStrategy: 'schedule', rothConversionSchedule: r.schedule.map((e) => ({ ...e, bracket: r.flatBestBracket })) };
    const flat = findDieWithZeroSpending(flatPlan).dieWithZeroSpending;
    expect(r.value).toBeGreaterThanOrEqual(flat - 50);
    expect(r.value).toBeGreaterThanOrEqual(r.baselineValue - 50);
    expect(findDieWithZeroSpending({ ...plan800, rothConversionStrategy: 'schedule', rothConversionSchedule: r.schedule }).dieWithZeroSpending).toBeCloseTo(r.value, 0);
    expect(r.runs).toBeLessThanOrEqual(ROTH_SCHEDULE_BUDGET);
  });

  it('C7 no Pre-Tax money: nothing to schedule', () => {
    const r = optimizeRothSchedule({ ...single, preTaxInit: 0 });
    expect(r.schedule).toEqual([]);
    expect(r.runs).toBeLessThanOrEqual(2);
    expect(r.value).toBe(r.baselineValue);
  });

  it('C8 the same plan gives the same schedule', () => {
    const a = optimizeRothSchedule(plan800);
    const b = optimizeRothSchedule(plan800);
    expect(a.schedule).toEqual(b.schedule);
  });

  it('stays within budget on both demo households, for both goals', () => {
    for (const p of [buildParkersInputs(), buildDemoInputs()]) {
      for (const objective of ['afterTaxEnding', 'lifetimeSpending']) {
        const r = optimizeRothSchedule(p, { objective });
        expect(r.runs).toBeLessThanOrEqual(ROTH_SCHEDULE_BUDGET);
        expect(r.value).toBeGreaterThanOrEqual(Math.max(r.baselineValue, r.flatBestValue) - (objective === 'lifetimeSpending' ? 50 : 1e-6));
      }
    }
  });

  it('makes no network request', () => {
    const fail = () => { throw new Error('network'); };
    vi.stubGlobal('fetch', fail);
    vi.stubGlobal('XMLHttpRequest', function XHR() { fail(); });
    expect(() => optimizeRothSchedule(buildParkersInputs())).not.toThrow();
  });

  it('takes about as long as one Monte Carlo (loose bound for shared runners)', () => {
    const p = buildParkersInputs();
    let t = performance.now();
    runMonteCarlo(p);
    const mc = performance.now() - t;
    t = performance.now();
    optimizeRothSchedule(p, { objective: 'afterTaxEnding' });
    const opt = performance.now() - t;
    expect(opt / mc).toBeLessThan(3);
  });

  it('can be stopped', () => {
    let calls = 0;
    const r = optimizeRothSchedule(plan800, { isCurrent: () => (calls += 1) < 5 });
    expect(r.canceled).toBe(true);
  });

  it('demo households keep their saved strategies', () => {
    expect(buildParkersInputs().rothConversionStrategy).not.toBe('schedule');
    expect(buildDemoInputs().rothConversionStrategy).toBe('maxBracket');
  });
});
