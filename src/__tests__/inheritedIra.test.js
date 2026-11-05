// What's New 497: a survivor under 59 1/2 keeps the spouse's Pre-Tax share
// as an inherited IRA, free of the 10% penalty, until 59 1/2.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection, migrateInputs } from '../calculator';
import { REFERENCE_INPUTS } from './referenceHousehold';
import { buildSurvivorGuide } from '../utils/survivorGuide';
import { firstSteps } from '../config/survivorGuideContent';

const START = DEFAULT_INPUTS.planYear;
// Pat dies at 50; Lee, 52, has no pay and lives on Pre-Tax before 59 1/2.
const couple = (over = {}) => ({
  ...DEFAULT_INPUTS, ...REFERENCE_INPUTS, stateTaxState: 'none', rebalancingEnabled: true,
  spouse2Enabled: true, spouse1Name: 'Pat', spouse2Name: 'Lee', filingStatus: 'MFJ',
  birthYear1: START - 50, retireAge1: 50, lifeExpectancy1: 90, salary1: 0, ss1: 30000, claimingAge1: 67,
  birthYear2: START - 52, retireAge2: 52, lifeExpectancy2: 92, salary2: 0, ss2: 20000, claimingAge2: 67,
  preTaxInit: 1200000, rothInit: 0, taxableInit: 20000, hsaInit: 0, cashReserveEnabled: false,
  lifestyleExpense: 60000, rothConversionStrategy: 'none',
  survivorStressEnabled: true, survivorStressSpouse: 1, survivorStressAge: 50, ...over,
});

describe('an inherited IRA before 59 1/2', () => {
  it('is on for a new plan and off for one saved earlier', () => {
    expect(DEFAULT_INPUTS.survivorKeepsInheritedIra).toBe(true);
    expect(DEFAULT_INPUTS.preTaxOwnedPct1).toBe(50);
    expect(migrateInputs({ schemaVersion: 4, inputs: { ...couple(), survivorKeepsInheritedIra: undefined } }).survivorKeepsInheritedIra).toBe(false);
  });

  it('spares the 10% penalty on Pre-Tax drawn from the inherited share', () => {
    const own = runProjection(couple({ survivorKeepsInheritedIra: false }));
    const inh = runProjection(couple());
    const alone = (p) => p.years.filter((y) => !y.spouse1Alive && y.spouse2Alive && y.age2 < 59);
    expect(alone(inh).length).toBeGreaterThan(3);
    expect(alone(inh)[0].inheritedPreTaxShare).toBeGreaterThan(0);
    const taxes = (p) => alone(p).reduce((a, y) => a + y.totalTaxesPaid, 0);
    expect(taxes(inh)).toBeLessThan(taxes(own) - 10000);
    expect(inh.endingBalance).toBeGreaterThan(own.endingBalance);
  });

  it('moves into the survivor’s own name at 59 1/2', () => {
    const inh = runProjection(couple());
    const at60 = inh.years.find((y) => y.age2 === 60);
    expect(at60.inheritedPreTaxShare).toBe(0);
  });

  it('converts the survivor’s own share first, then moves more into their name', () => {
    // Lee owns 3%; the year's conversion is more than that.
    const conv = runProjection(couple({ rothConversionStrategy: 'fixed', rothConversionAmount: 900000, preTaxOwnedPct1: 97 }));
    const y = conv.years.find((r) => !r.spouse1Alive && r.age2 < 59 && r.convertAmount > 0);
    expect(y).toBeTruthy();
    // No cap: a partial rollover lets more than Lee’s own 3% convert.
    expect(y.convertAmount).toBeGreaterThan(0.05 * y.preTaxStart);
    // What is left is all inherited, less what moved into Lee’s name.
    expect(y.inheritedPreTaxShare).toBeGreaterThan(0.9);
    expect(y.inheritedPreTaxShare).toBeLessThanOrEqual(1);
  });

  it('needs a yearly withdrawal when the one who died was past RMD age', () => {
    // Pat would be 80; Lee is 52.
    const old = couple({ birthYear1: START - 80, retireAge1: 65, survivorStressAge: 80 });
    const p = runProjection(old);
    const y = p.years.find((r) => !r.spouse1Alive && r.age2 < 59);
    expect(y.inheritedPreTaxShare).toBeGreaterThan(0);
    expect(y.rmdAmount).toBeGreaterThan(0);
    const off = runProjection({ ...old, survivorKeepsInheritedIra: false });
    expect(off.years.find((r) => r.year === y.year).rmdAmount).toBe(0);
  });

  it('spares the penalty on a Life-Event Pre-Tax withdrawal from the inherited share', () => {
    const roof = { id: 'm1', name: 'Roof', type: 'outflow', targetAccount: 'preTax', amount: 40000, isRecurring: false, startAge: 53, endAge: 53 };
    const yr = (p) => p.years.find((r) => r.year === START + 3);
    const own = yr(runProjection(couple({ survivorKeepsInheritedIra: false, milestones: [roof] })));
    const inh = yr(runProjection(couple({ milestones: [roof] })));
    expect(inh.totalTaxesPaid).toBeLessThan(own.totalTaxesPaid - 3000);
  });

  it('reads an empty share as half and thins as the survivor adds money', () => {
    const half = runProjection(couple({ preTaxOwnedPct1: '' }));
    const first = half.years.find((r) => !r.spouse1Alive);
    expect(first.inheritedPreTaxShare).toBeGreaterThan(0.4);
    const saving = runProjection(couple({ salary2: 90000, retireAge2: 58, preTaxContribution2: 20000 }));
    const s = saving.years.filter((r) => !r.spouse1Alive && r.age2 < 58);
    expect(s[s.length - 1].inheritedPreTaxShare).toBeLessThan(s[0].inheritedPreTaxShare);
  });

  it('does nothing for a survivor past 59 1/2', () => {
    const older = couple({ birthYear2: START - 62, retireAge2: 62 });
    const a = runProjection(older);
    const b = runProjection({ ...older, survivorKeepsInheritedIra: false });
    expect(a.endingBalance).toBeCloseTo(b.endingBalance, 0);
  });

  it('the guide tells the survivor about the yearly withdrawal when it applies', () => {
    const step = (inp) => firstSteps(buildSurvivorGuide(inp, 1)).flatMap((g) => g.items).find((i) => i.id === 'retirement-accounts')?.detail || '';
    expect(step(couple({ birthYear1: START - 80, retireAge1: 65, survivorStressAge: 80 }))).toMatch(/yearly required withdrawal/);
    const young = step(couple());
    expect(young).toMatch(/inherited \(beneficiary\) IRA/);
    expect(young).not.toMatch(/yearly required withdrawal/);
  });
});
