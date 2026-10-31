// Planner's review, round 4 (changelog 469): the age-rated pre-65 bridge,
// the spousal top-up on for new plans, pension COLAs at 0, an owned
// annuity's start age and indexing, and the demo households untouched.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection, migrateInputs, sanitizeInputs, acaBenchmarkPremiumAnnual } from '../calculator';
import { buildDemoInputs } from '../config/demoPlan';
import { buildParkersInputs } from '../config/demoPlanParkers';
import { REFERENCE_INPUTS } from './referenceHousehold';

const yearAt = (proj, age) => proj.years.find((y) => y.age1 === age);

describe('the pre-65 bridge priced by age and state (item 13)', () => {
  const early = { ...DEFAULT_INPUTS, retireAge1: 58, stateOfResidence: 'TX', stateTaxState: 'none' };
  it('a new plan charges the state benchmark for the person\'s age over the premium share, rising with age', () => {
    expect(DEFAULT_INPUTS.healthcareBridgeSource).toBe('benchmark');
    const p = runProjection(early);
    const share = DEFAULT_INPUTS.healthcareBridgePremiumPct / 100;
    for (const age of [58, 61, 64]) {
      const y = yearAt(p, age);
      const expected = acaBenchmarkPremiumAnnual('TX', [age], y.medicalInflFactor || 1) / share;
      // The row carries the bridge net of the premium tax credit; the gross
      // is the benchmark over the share.
      expect(y.healthcareBridge + (y.acaSubsidyApplied || 0)).toBeCloseTo(expected, 0);
    }
    expect(yearAt(p, 65).healthcareBridge).toBe(0);
    // No "well under the benchmark" warning: the premium IS the benchmark.
    expect((p.planWarnings || []).some((w) => w.code === 'aca-premium-below-benchmark')).toBe(false);
  });
  it('a typed figure is charged as before, and a plan saved without the field keeps typing', () => {
    const manual = runProjection({ ...early, healthcareBridgeSource: 'manual' });
    const y = yearAt(manual, 58);
    expect(y.healthcareBridge + (y.acaSubsidyApplied || 0)).toBeCloseTo(12000 * (y.medicalInflFactor || 1), 0);
    const saved = { ...REFERENCE_INPUTS };
    delete saved.healthcareBridgeSource;
    expect(migrateInputs({ schemaVersion: 4, inputs: saved }).healthcareBridgeSource).toBe('manual');
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, healthcareBridgeSource: 'x' }).healthcareBridgeSource).toBe('manual');
  });
});

describe('the spousal top-up (item 22)', () => {
  it('is on for a new plan and off for one saved without it', () => {
    expect(DEFAULT_INPUTS.ssSpousalEnabled1).toBe(true);
    expect(DEFAULT_INPUTS.ssSpousalEnabled2).toBe(true);
    const saved = { ...REFERENCE_INPUTS };
    delete saved.ssSpousalEnabled1;
    delete saved.ssSpousalEnabled2;
    const back = migrateInputs({ schemaVersion: 4, inputs: saved });
    expect(back.ssSpousalEnabled1).toBe(false);
    expect(back.ssSpousalEnabled2).toBe(false);
  });
});

describe('pension COLAs and an owned annuity (item 18)', () => {
  it('both pension COLAs start at 0', () => {
    expect(DEFAULT_INPUTS.pension1COLA).toBe(0);
    expect(DEFAULT_INPUTS.pension2COLA).toBe(0);
  });
  it('an owned annuity is level and starts at its age; indexed, it rises with inflation; a saved plan keeps the indexed payment from the first year', () => {
    const base = { ...DEFAULT_INPUTS, annuityIncome: 12000 };
    const level = runProjection(base);
    expect(level.years[0].rentalAnnuity).toBe(12000);
    expect(level.years[10].rentalAnnuity).toBe(12000);
    const later = runProjection({ ...base, annuityIncomeStartAge: 60 });
    expect(yearAt(later, 59).rentalAnnuity).toBe(0);
    expect(yearAt(later, 60).rentalAnnuity).toBe(12000);
    const indexed = runProjection({ ...base, annuityIncomeIndexed: true });
    expect(indexed.years[10].rentalAnnuity).toBeCloseTo(12000 * indexed.years[10].inflFactor, 6);
    const saved = { ...REFERENCE_INPUTS, annuityIncome: 12000 };
    delete saved.annuityIncomeIndexed;
    delete saved.annuityIncomeStartAge;
    const back = migrateInputs({ schemaVersion: 4, inputs: saved });
    expect(back.annuityIncomeIndexed).toBe(true);
    expect(back.annuityIncomeStartAge).toBe(0);
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, annuityIncomeStartAge: 500 }).annuityIncomeStartAge).toBe(120);
  });
});

describe('the demo households keep their figures', () => {
  it('pin the typed bridge, no top-up, and their own COLAs', () => {
    for (const inputs of [buildDemoInputs(), buildParkersInputs()]) {
      expect(inputs.healthcareBridgeSource).toBe('manual');
      expect(inputs.ssSpousalEnabled1).toBe(false);
      expect(inputs.ssSpousalEnabled2).toBe(false);
      expect(inputs.annuityIncome).toBe(0);
    }
    expect(buildDemoInputs().pension1COLA).toBe(0);
    expect(buildDemoInputs().pension2COLA).toBe(1.5);
  });
});
