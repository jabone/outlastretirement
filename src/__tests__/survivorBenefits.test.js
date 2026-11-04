// Survivor benefits beyond Social Security and owned life insurance (What's New 493).
import { test, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection } from '../calculator';
import { REFERENCE_INPUTS } from './referenceHousehold';
const START = DEFAULT_INPUTS.planYear;
const c = (o={}) => ({ ...DEFAULT_INPUTS, ...REFERENCE_INPUTS, spouse2Enabled: true, birthYear1: START-50, retireAge1: 62, salary1: 200000, lifeExpectancy1: 90, birthYear2: START-50, retireAge2: 62, lifeExpectancy2: 92, survivorStressEnabled: true, survivorStressSpouse: 1, survivorStressAge: 50, ...o });
test('an employer survivor benefit pays for its years, only on a death while working; a lump sum lands in savings', () => {
  const b = { whose: 1, name: 'Employer survivor income', kind: 'yearly', amount: 100000, years: 10, whileWorking: true };
  const a = runProjection(c()); const w = runProjection(c({ survivorBenefits: [b, { whose: 1, kind: 'once', amount: 400000 }] }));
  const y = (p, i) => p.years[i];
  expect(y(w,1).survivorBenefitIncome).toBeGreaterThan(99000);
  expect(y(w,10).survivorBenefitIncome).toBeGreaterThan(99000);
  expect(y(w,11).survivorBenefitIncome).toBe(0);
  expect(y(w,1).survivorBenefitLump).toBeGreaterThan(399000);
  expect(y(w,0).survivorBenefitIncome).toBe(0);
  expect(y(w,1).totalTaxesPaid).toBeGreaterThan(y(a,1).totalTaxesPaid);
  expect(w.endingBalance).toBeGreaterThan(a.endingBalance);
  const r = runProjection(c({ survivorStressAge: 70, survivorBenefits: [b] }));
  expect(r.years.every(x => !x.survivorBenefitIncome)).toBe(true);
});

test('a working survivor in auto spending saves the benefit after its tax, rather than spending it', () => {
  const b = { id: 'g', whose: 1, kind: 'yearly', amount: 100000, years: 10, whileWorking: true };
  const base = c({ filingStatus: 'MFJ', salary2: 60000, currentSpendingMode: 'auto' });
  const without = runProjection(base);
  const withB = runProjection({ ...base, survivorBenefits: [b] });
  const i = 5;
  // Spending barely moves; savings grow by most of the benefit.
  expect(withB.years[1].lifestyleExpenses).toBeLessThan(without.years[1].lifestyleExpenses * 1.15 + 1000);
  expect(withB.years[i].totalPortfolioEnding - without.years[i].totalPortfolioEnding).toBeGreaterThan(5 * 50000);
});

test('a benefit saved without an id gets the same id every time', async () => {
  const { sanitizeSurvivorBenefit } = await import('../calculator');
  expect(sanitizeSurvivorBenefit({ amount: 1 }, 2).id).toBe(sanitizeSurvivorBenefit({ amount: 1 }, 2).id);
});
