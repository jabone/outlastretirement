// Roth basis tracking and the IRC 408A(d)(4) ordering rules (changelog
// 103). Before this, every pre-59.5 Roth dollar was penalized 10% and
// income-taxed at 0% -- wrong in both directions. Now: contributions come
// out free, conversions free once five tax years old (10% on the taxable
// part before that), earnings last (ordinary income + 10% before 59.5).
import { describe, it, expect } from 'vitest';
import {
  runProjection,
  DEFAULT_INPUTS,
  makeRothLayers,
  rothLayersBasis,
  splitRothDraw,
  consumeRothLayers,
} from '../calculator';

// Retired single, age 55, living entirely off a $500k Roth.
const ROTH_ONLY_55 = {
  ...DEFAULT_INPUTS,
  spouse2Enabled: false,
  birthYear1: 1971, // 55 in 2026
  planYear: 2026,
  retireAge1: 55,
  lifeExpectancy1: 90,
  ss1: 0, ss2: 0,
  pension1: 0, pension2: 0, pension1COLA: 0,
  annuityIncome: 0, rentalIncome: 0,
  inflationRate: 0, taxBracketInflationRate: 0, ssCOLA: 0,
  medicalInflationRate: 0, housingInflationRate: 0,
  preTaxInit: 0, rothInit: 500000, taxableInit: 0, hsaInit: 0,
  taxableContribution: 0,
  lifestyleExpense: 40000,
  healthcareBridgeCost: 0,
  withdrawalStrategy: 'RothFirst',
  rothConversionStrategy: 'none',
  stateTaxState: 'none',
  stateOfResidence: 'TX',
  cashFloorEnabled: false,
};

describe('splitRothDraw / consumeRothLayers', () => {
  it('orders contributions -> conversions (oldest first) -> earnings', () => {
    const layers = makeRothLayers(10000, [
      { year: 2024, taxable: 20000, nontaxable: 5000 },
      { year: 2020, taxable: 8000, nontaxable: 0 },
    ]);
    expect(layers.conversions[0].year).toBe(2020); // sorted oldest first
    expect(rothLayersBasis(layers)).toBe(43000);
    const s = splitRothDraw(50000, layers, 100000, 2026, 55);
    expect(s.contrib).toBe(10000);
    expect(s.convFree).toBe(8000 + 5000);     // 2020 layer is past its clock; 2024's non-taxable part is never penalized
    expect(s.convPenalized).toBe(20000);      // 2024 taxable part, clock open until 2029
    expect(s.earnings).toBe(7000);
    expect(s.taxableEarnings).toBe(7000);
    expect(s.penalized).toBe(27000);
  });
  it('never treats more than the growth above basis as earnings', () => {
    const layers = makeRothLayers(80000, []);
    const s = splitRothDraw(90000, layers, 70000, 2026, 50); // balance below basis (market dip)
    expect(s.contrib).toBe(80000);
    expect(s.earnings).toBe(0);
  });
  it('is fully qualified at 59.5 and later', () => {
    const layers = makeRothLayers(0, [{ year: 2025, taxable: 50000, nontaxable: 0 }]);
    const s = splitRothDraw(80000, layers, 200000, 2026, 60);
    expect(s.taxableEarnings).toBe(0);
    expect(s.penalized).toBe(0);
    expect(s.earnings).toBe(30000);
  });
  it('a conversion is penalty-free from the fifth tax year after it', () => {
    const layers = makeRothLayers(0, [{ year: 2022, taxable: 1000, nontaxable: 0 }]);
    expect(splitRothDraw(1000, layers, 5000, 2026, 50).penalized).toBe(1000);
    expect(splitRothDraw(1000, layers, 5000, 2027, 50).penalized).toBe(0);
  });
  it('consumes layers in the same order and drops emptied ones', () => {
    const layers = makeRothLayers(1000, [{ year: 2024, taxable: 500, nontaxable: 100 }, { year: 2025, taxable: 700, nontaxable: 0 }]);
    consumeRothLayers(1650, layers);
    expect(layers.contrib).toBe(0);
    expect(layers.conversions).toEqual([{ year: 2025, taxable: 650, nontaxable: 0 }]);
  });
});

describe('runProjection pre-59.5 Roth draws', () => {
  it('with no basis entered, the whole draw is earnings: income-taxed AND penalized', () => {
    const y = runProjection(ROTH_ONLY_55).years[0];
    expect(y.drawRoth).toBeGreaterThan(40000); // grossed up for tax + penalty
    expect(y.rothDrawEarningsTaxed).toBeCloseTo(y.drawRoth, 6);
    expect(y.rothDrawPenalized).toBeCloseTo(y.drawRoth, 6);
    expect(y.ordinaryTaxableIncome).toBeGreaterThan(0);
    // Penalty alone is 10% of the draw; total extra tax must exceed that.
    expect(y.extraTax).toBeGreaterThan(y.drawRoth * 0.10);
  });
  it('contribution basis comes out tax- and penalty-free', () => {
    const y = runProjection({ ...ROTH_ONLY_55, rothBasisInit: 300000 }).years[0];
    expect(y.drawRoth).toBeCloseTo(40000, 2);
    expect(y.rothDrawFromBasis).toBeCloseTo(40000, 2);
    expect(y.rothDrawEarningsTaxed).toBe(0);
    expect(y.rothDrawPenalized).toBe(0);
    expect(y.extraTax).toBeCloseTo(0, 2);
    expect(y.ordinaryTaxableIncome).toBe(0);
    expect(y.rothBasis).toBeCloseTo(260000, 2);
  });
  it('recent conversions carry the 10% penalty but no income tax until their clock runs out', () => {
    // $200k converted over 2022-2025 ($50k each). 2026 draws come from the
    // 2022 layer (clock open until 2027): penalized, not taxed.
    const p = runProjection({ ...ROTH_ONLY_55, rothRecentConversionsInit: 200000 });
    const y26 = p.years[0];
    expect(y26.rothDrawEarningsTaxed).toBe(0);
    expect(y26.ordinaryTaxableIncome).toBe(0);
    expect(y26.rothDrawPenalized).toBeCloseTo(y26.drawRoth, 6);
    expect(y26.extraTax).toBeCloseTo(y26.drawRoth * 0.10, 2);
    expect(y26.drawRoth).toBeCloseTo(40000 / 0.9, 2);
    // 2027: the 2022 layer's remainder (~$5.6k) is now free; the rest comes
    // from the 2023 layer, still penalized. So penalized < draw, tax < 10%.
    const y27 = p.years[1];
    expect(y27.rothDrawPenalized).toBeGreaterThan(0);
    expect(y27.rothDrawPenalized).toBeLessThan(y27.drawRoth);
    expect(y27.rothDrawEarningsTaxed).toBe(0);
  });
  it('the plan\'s own conversions become layers that age out of the penalty', () => {
    // Age 50, $300k Pre-Tax, convert $40k/yr fixed, live off Taxable until
    // it runs out, then Roth. Conversions in 2026+ are penalty-free from
    // 2031+ when drawn.
    const inputs = {
      ...ROTH_ONLY_55,
      birthYear1: 1976, retireAge1: 50,
      preTaxInit: 300000, rothInit: 0, taxableInit: 250000, taxableBasisInit: 250000,
      rothConversionStrategy: 'fixed', rothConversionAmount: 40000, rothConversionDelayUntilRetire: false,
      withdrawalStrategy: 'TaxableFirst',
      lifestyleExpense: 45000,
    };
    const p = runProjection(inputs);
    const firstRothYear = p.years.find((r) => r.drawRoth > 0 && r.age1 < 59.5);
    expect(firstRothYear).toBeTruthy();
    expect(firstRothYear.rothBasis).toBeGreaterThan(0);
    // At least the oldest conversion layers are past their clock by then,
    // so part of the draw is free and no part is income-taxed while it
    // stays inside basis.
    expect(firstRothYear.rothDrawFromBasis).toBeGreaterThan(0);
    expect(firstRothYear.rothDrawEarningsTaxed).toBe(0);
  });
  it('draws after 59.5 are untouched: no tax, no penalty, whatever the basis', () => {
    const y = runProjection({ ...ROTH_ONLY_55, birthYear1: 1964, retireAge1: 60 }).years[0]; // 62: past 59.5, before Medicare premiums
    expect(y.drawRoth).toBeCloseTo(40000, 2);
    expect(y.extraTax).toBeCloseTo(0, 2);
    expect(y.rothDrawPenalized).toBe(0);
  });
  it('leaves DEFAULT_INPUTS unchanged (no pre-59.5 Roth draws there)', () => {
    const p = runProjection(DEFAULT_INPUTS);
    expect(p.years[p.years.length - 1].totalPortfolioEnding).toBeCloseTo(131245.5150, 1);
    expect(DEFAULT_INPUTS.rothBasisInit).toBe(0);
    expect(DEFAULT_INPUTS.rothRecentConversionsInit).toBe(0);
  });
});
