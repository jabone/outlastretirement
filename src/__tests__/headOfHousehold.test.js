// What's New 503: head of household once the qualifying surviving spouse
// years end, while a child is still a dependent; the child counts in the
// marketplace household; Arizona's 65+ add-on follows the federal status.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection, calculateTaxes, BRACKETS_HOH, DEDUCTION_HOH, calculateCapitalGainsTaxes } from '../calculator';
import { REFERENCE_INPUTS } from './referenceHousehold';

const START = DEFAULT_INPUTS.planYear;
const couple = (over = {}) => ({
  ...DEFAULT_INPUTS, ...REFERENCE_INPUTS, stateTaxState: 'none',
  spouse2Enabled: true, filingStatus: 'MFJ',
  birthYear1: START - 45, retireAge1: 60, lifeExpectancy1: 90, salary1: 150000,
  birthYear2: START - 45, retireAge2: 60, lifeExpectancy2: 92, salary2: 120000,
  survivorStressEnabled: true, survivorStressSpouse: 1, survivorStressAge: 46,
  ...over,
});

describe('head of household', () => {
  it('has the 2026 brackets and deduction', () => {
    expect(DEDUCTION_HOH).toBe(24150);
    expect(BRACKETS_HOH[0].limit).toBe(17700);
    expect(BRACKETS_HOH[3].limit).toBe(201750);
    expect(calculateTaxes(100000, 'HOH')).toBeLessThan(calculateTaxes(100000, 'Single'));
    expect(calculateTaxes(100000, 'HOH')).toBeGreaterThan(calculateTaxes(100000, 'MFJ'));
    // 0% capital gains up to $66,200 of taxable income.
    expect(calculateCapitalGainsTaxes(40000, 20000, 'HOH')).toBe(0);
    expect(calculateCapitalGainsTaxes(40000, 20000, 'Single')).toBeGreaterThan(0);
  });

  it('follows the two QSS years while the child is a dependent', () => {
    const p = runProjection(couple({ dependentChildLastYear: START + 8 }));
    const none = runProjection(couple());
    const alone = p.years.filter((y) => !y.spouse1Alive && y.spouse2Alive);
    expect(alone.slice(0, 2).every((y) => y.qualifyingSurvivingSpouse)).toBe(true);
    const hoh = alone.filter((y) => y.headOfHousehold);
    expect(hoh.length).toBe(START + 8 - alone[2].year + 1);
    expect(hoh[0].bracketStatus).toBe('HOH');
    const same = (y) => none.years.find((r) => r.year === y.year);
    expect(hoh[0].federalTax).toBeLessThan(same(hoh[0]).federalTax - 1000);
    const after = alone.find((y) => y.year === START + 9);
    expect(after.headOfHousehold).toBe(false);
    expect(after.bracketStatus).toBe('Single');
  });

  it('counts a dependent child in the marketplace household', () => {
    const early = {
      ...DEFAULT_INPUTS, ...REFERENCE_INPUTS, stateTaxState: 'none', spouse2Enabled: true, filingStatus: 'MFJ',
      birthYear1: START - 58, retireAge1: 58, salary1: 0, birthYear2: START - 58, retireAge2: 58, salary2: 0,
      preTaxInit: 400000, taxableInit: 300000, rothInit: 0, lifestyleExpense: 60000,
    };
    const y0 = (p) => p.years[0];
    const without = y0(runProjection(early));
    const withChild = y0(runProjection({ ...early, dependentChildLastYear: START + 3 }));
    expect(without.acaCreditSettled).toBeGreaterThan(0);
    expect(withChild.acaCreditSettled).toBeGreaterThanOrEqual(without.acaCreditSettled);
    // 400% of the poverty line for three, not two.
    expect(withChild.acaCliffThreshold).toBeGreaterThan(without.acaCliffThreshold * 1.2);
  });
});

describe('the risk-based rule in a life longer than planned (measured 2026-11-05)', () => {
  it('holds spending to the planning age on the average path, then cuts as the money runs low', async () => {
    const { runProjectionWithPlanModel, riskPlanningAges } = await import('../calculator');
    const plan = {
      ...DEFAULT_INPUTS, riskGuardrailsEnabled: true, stateTaxState: 'none', spouse2Enabled: false, sex1: 'female',
      birthYear1: START - 65, retireAge1: 65, lifeExpectancy1: 90, salary1: 0, ss1: 30000, claimingAge1: 67,
      preTaxInit: 600000, rothInit: 200000, taxableInit: 200000, lifestyleExpense: 60000,
    };
    const cautious = riskPlanningAges(plan).cautious;
    const p = runProjectionWithPlanModel(plan, { ...plan, lifeExpectancy1: 104 });
    const m = (age) => p.years.find((y) => y.age1 === age).riskGuardrailMultiplier ?? 1;
    for (let a = 66; a <= cautious; a += 1) expect(m(a)).toBeGreaterThan(0.99);
    expect(m(cautious + 3)).toBeLessThan(0.9);
  });
});
