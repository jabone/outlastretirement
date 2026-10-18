// Changelog 420: a Monte Carlo trial that samples inflation moves the
// brackets, the Social Security COLA, the Medicare premiums, the medical
// factors and the statutory limits by the sampled delta, compounding year
// on year -- not only the spending slices.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, SS_ANNOUNCED } from '../calculator';

const START = DEFAULT_INPUTS.planYear;
const plan = {
  ...DEFAULT_INPUTS, birthYear1: START - 68, retireAge1: 60, salary1: 0, ss1: 30000, claimingAge1: 67,
  preTaxInit: 2500000, taxableInit: 100000, lifestyleExpense: 140000, withdrawalStrategy: 'PreTaxFirst', inflationRate: 2.5, taxBracketInflationRate: 2.5,
  medicarePartBInflationRate: 5, acaCreditSource: 'manual', itemizeDeductions: 'never', taxableQualifiedDividendFollowsAllocation: false,
};
// Returns at the plan's own rate for every year, so only inflation differs.
const flatReturns = (inputs) => {
  const out = {};
  for (let y = START; y <= START + 40; y += 1) out[y] = inputs.postRetireReturn;
  return out;
};

describe('sampled inflation moves the indexing', () => {
  it('a trial sampled at the planned rate every year is bit-identical to no override', () => {
    const returns = flatReturns(plan);
    const same = {}; Object.keys(returns).forEach((y) => { same[y] = plan.inflationRate; });
    const a = runProjection(plan, returns, null).years;
    const b = runProjection(plan, returns, same).years;
    for (let i = 0; i < a.length; i += 1) {
      expect(b[i].taxBracketInflationFactor).toBeCloseTo(a[i].taxBracketInflationFactor, 12);
      expect(b[i].ssColaFactor).toBeCloseTo(a[i].ssColaFactor, 12);
      expect(b[i].partBInflFactor).toBeCloseTo(a[i].partBInflFactor, 12);
      expect(b[i].federalTax).toBeCloseTo(a[i].federalTax, 6);
    }
  });

  it('a 3-point inflation shock in year two lifts the brackets, the premiums and the COLA, and the lift persists', () => {
    const returns = flatReturns(plan);
    const shock = {}; Object.keys(returns).forEach((y) => { shock[y] = plan.inflationRate; });
    shock[START + 1] = plan.inflationRate + 3;
    const base = runProjection(plan, returns, null).years;
    const hit = runProjection(plan, returns, shock).years;
    // Year one is untouched (the shock is in year two).
    expect(hit[0].taxBracketInflationFactor).toBe(base[0].taxBracketInflationFactor);
    // Year two: the brackets index at 5.5% instead of 2.5%.
    expect(hit[1].taxBracketInflationFactor).toBeCloseTo(1.055, 9);
    expect(base[1].taxBracketInflationFactor).toBeCloseTo(1.025, 9);
    expect(hit[1].partBInflFactor).toBeCloseTo(1.08, 9); // 5% + 3
    expect(hit[1].statutoryInflFactor).toBeCloseTo(1.055, 9);
    // Year three, sampled at the planned rate again: the higher level stays
    // and compounds from there.
    expect(hit[2].taxBracketInflationFactor).toBeCloseTo(1.055 * 1.025, 9);
    expect(hit[2].taxBracketInflationFactor).toBeGreaterThan(base[2].taxBracketInflationFactor);
    // The COLA follows the sampled rate -- except in a year SSA has
    // announced, which stays at the announced figure.
    const announced = SS_ANNOUNCED[START + 1];
    if (announced && Number.isFinite(announced.cola)) {
      expect(hit[1].ssColaFactor).toBeCloseTo(1 + announced.cola / 100, 9);
      expect(hit[2].ssColaFactor).toBeCloseTo((1 + announced.cola / 100) * 1.025, 9);
    } else {
      expect(hit[1].ssColaFactor).toBeCloseTo(1.055, 9);
    }
    // The deduction (and every bracket ceiling) is a step larger that year;
    // spending rose with the shock too, so the tax itself is not comparable.
    expect(hit[1].stdDeduction).toBeCloseTo(base[1].stdDeduction * 1.055 / 1.025, 2);
  });

  it('a COLA the user set keeps following the sampled rate from their figure', () => {
    const returns = flatReturns(plan);
    const shock = {}; Object.keys(returns).forEach((y) => { shock[y] = plan.inflationRate; });
    shock[START + 1] = plan.inflationRate + 3;
    const own = runProjection({ ...plan, ssCOLA: 2.0 }, returns, shock).years;
    expect(own[1].ssColaFactor).toBeCloseTo(1.05, 9); // 2% + 3
  });

  it('outside a sampled trial nothing changes', () => {
    const a = runProjection(plan).years;
    expect(a[1].taxBracketInflationFactor).toBeCloseTo(1.025, 9);
    expect(a[1].statutoryInflFactor).toBeCloseTo(1.025, 9);
  });
});
