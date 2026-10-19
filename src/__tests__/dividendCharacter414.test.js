// Changelog 414: the qualified share of the taxable brokerage yield follows
// the plan's stock/bond split by default (the stock side pays qualified
// dividends, the bond and cash side pays interest, which is ordinary
// income), and a Detailed Holdings bond or cash holding whose Distribution
// Character is Not Set is ordinary too. 100% qualified was never true of a
// mixed account; it only understated the tax.
import { describe, it, expect } from 'vitest';
import { runProjection, sanitizeInputs, planStockShareForYear, DEFAULT_INPUTS, qualifiedShareFromAllocation } from '../calculator';
import { createHolding, computeTaxableDistributionYield, taxCharacterForHolding } from '../utils/holdingsCore';
import { createDistributionEvent } from '../utils/portfolioHoldings';
import { buildDemoInputs } from '../config/demoPlan';
import { buildParkersInputs } from '../config/demoPlanParkers';

const START = DEFAULT_INPUTS.planYear;
// A single earner in the 22% bracket, $500k taxable at 4%: $20,000 of
// distributions a year. Working: 80% stock. Retired at 65: 60%.
const worker = {
  ...DEFAULT_INPUTS, birthYear1: START - 50, retireAge1: 65, salary1: 90000,
  taxableInit: 500000, taxableDividendYield: 4,
};

describe('the free default follows the stock/bond split', () => {
  it('is on by default and reads the Working allocation while working', () => {
    expect(DEFAULT_INPUTS.taxableQualifiedDividendFollowsAllocation).toBe(true);
    const y = runProjection(worker).years[0];
    expect(y.qualifiedDividendShareSource).toBe('allocation');
    // Changelog 441: 80% stock, weighted by yield (1.3% stocks, 4% bonds):
    // 0.8 x 1.3 / (0.8 x 1.3 + 0.2 x 4) = 1.04 / 1.84 = 56.5% qualified.
    const share = qualifiedShareFromAllocation(80);
    expect(share).toBeCloseTo(1.04 / 1.84, 9);
    expect(y.qualifiedDividendShare).toBeCloseTo(share, 9);
    // The rest of the $20,000 yield is interest: ordinary income.
    expect(y.ordinaryDividends).toBeCloseTo(500000 * 0.04 * (1 - share), -2);
  });

  it('switches to the Retired allocation in retirement, and walks the glide path', () => {
    const r = runProjection({ ...worker, stockAllocationPre: 80, stockAllocationPost: 50 });
    const retired = r.years.find((y) => y.age1 === 66);
    expect(retired.qualifiedDividendShare).toBeCloseTo(qualifiedShareFromAllocation(50), 9);
    const g = runProjection({
      ...worker, stockAllocationPre: 80, stockAllocationPost: 50,
      rebalancingEnabled: true, glideAllocationEnabled: true, glideAllocationRate: 2, glideAllocationFloor: 30,
    });
    const retirementYear = g.years.find((y) => y.age1 === 65).year;
    const later = g.years.find((y) => y.year === retirementYear + 5);
    expect(later.qualifiedDividendShare).toBeCloseTo(qualifiedShareFromAllocation(40), 9);
    const floor = g.years.find((y) => y.year === retirementYear + 20);
    expect(floor.qualifiedDividendShare).toBeCloseTo(qualifiedShareFromAllocation(30), 9);
  });

  it('planStockShareForYear is the one formula: clamped, never NaN', () => {
    expect(planStockShareForYear({ ...DEFAULT_INPUTS }, false, START, null)).toBe(80);
    expect(planStockShareForYear({ ...DEFAULT_INPUTS }, true, START, START)).toBe(60);
    expect(planStockShareForYear({ ...DEFAULT_INPUTS, stockAllocationPre: '' }, false, START, null)).toBe(80);
    expect(planStockShareForYear({ ...DEFAULT_INPUTS, stockAllocationPost: 140 }, true, START, START)).toBe(100);
    // The glide needs both rebalancing and the glide switched on.
    const glide = { ...DEFAULT_INPUTS, stockAllocationPost: 60, glideAllocationEnabled: true, glideAllocationRate: 1, glideAllocationFloor: 40 };
    expect(planStockShareForYear(glide, true, START + 10, START)).toBe(60);
    expect(planStockShareForYear({ ...glide, rebalancingEnabled: true }, true, START + 10, START)).toBe(50);
  });

  it('costs real tax: the bond share moves from the 15% rate to the bracket', () => {
    const on = runProjection(worker).years[0];
    const off = runProjection({ ...worker, taxableQualifiedDividendFollowsAllocation: false }).years[0];
    expect(off.ordinaryDividends).toBe(0);
    expect(on.federalTax).toBeGreaterThan(off.federalTax);
    // About 7 points (22% - 15%) on the interest: since 441 that is the
    // bond side's share of the INCOME, 0.2 x 4 / 1.84 = 43.5% of $20,000,
    // not 20% of it.
    expect(on.federalTax - off.federalTax).toBeCloseTo(20000 * (1 - qualifiedShareFromAllocation(80)) * 0.07, -1);
  });

  it('the switch off uses the typed figure; linked to holdings, the holdings figure wins', () => {
    const typed = runProjection({ ...worker, taxableQualifiedDividendFollowsAllocation: false, taxableQualifiedDividendPct: 70 }).years[0];
    expect(typed.qualifiedDividendShareSource).toBe('manual');
    expect(typed.qualifiedDividendShare).toBeCloseTo(0.7, 9);
    const linked = runProjection({ ...worker, taxableDividendYieldSource: 'holdings', taxableQualifiedDividendPct: 55 }).years[0];
    expect(linked.qualifiedDividendShareSource).toBe('holdings');
    expect(linked.qualifiedDividendShare).toBeCloseTo(0.55, 9);
  });

  it('a plan saved before the switch follows the split only if its share was still the 100% default', () => {
    const { taxableQualifiedDividendFollowsAllocation: _a, ...untouched } = { ...DEFAULT_INPUTS };
    expect(sanitizeInputs(untouched).taxableQualifiedDividendFollowsAllocation).toBe(true);
    const { taxableQualifiedDividendFollowsAllocation: _b, ...chosen } = { ...DEFAULT_INPUTS, taxableQualifiedDividendPct: 85 };
    expect(sanitizeInputs(chosen).taxableQualifiedDividendFollowsAllocation).toBe(false);
    // A plan with no share at all is the old 100% default: follows.
    const { taxableQualifiedDividendFollowsAllocation: _c, taxableQualifiedDividendPct: _d, ...older } = { ...DEFAULT_INPUTS };
    expect(sanitizeInputs(older).taxableQualifiedDividendFollowsAllocation).toBe(true);
    // An explicit false survives sanitizing.
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, taxableQualifiedDividendFollowsAllocation: false }).taxableQualifiedDividendFollowsAllocation).toBe(false);
  });

  it('the demo households are pinned to the share their stories were written with', () => {
    expect(buildDemoInputs().taxableQualifiedDividendFollowsAllocation).toBe(false);
    expect(buildParkersInputs().taxableQualifiedDividendFollowsAllocation).toBe(false);
    expect(runProjection(buildDemoInputs()).years[0].qualifiedDividendShareSource).toBe('manual');
  });
});

describe('Detailed Holdings: a Not Set bond or cash holding is ordinary', () => {
  const asOfDate = new Date('2026-06-15T00:00:00Z');
  const fund = (overrides = {}) => createHolding({
    taxTreatment: 'taxable', shares: 1000, currentPrice: 100, annualDividendPerShare: 1, ...overrides,
  });

  it('taxCharacterForHolding falls back to the asset class only when the character is Not Set', () => {
    expect(taxCharacterForHolding(fund({ symbol: 'BND' }))).toBe('ordinaryDividend');           // bond ticker
    expect(taxCharacterForHolding(fund({ symbol: 'SPAXX' }))).toBe('ordinaryDividend');         // money market
    expect(taxCharacterForHolding(fund({ symbol: 'ZZZ', assetClass: 'cash' }))).toBe('ordinaryDividend'); // set by hand
    expect(taxCharacterForHolding(fund({ symbol: 'VTI' }))).toBe('unspecified');                // stock: as before
    expect(taxCharacterForHolding(fund({ symbol: 'ZZZ', assetClass: 'other' }))).toBe('unspecified');
    // Anything the user set is theirs, Mixed included.
    expect(taxCharacterForHolding(fund({ symbol: 'BND', distributionCharacter: 'qualifiedDividend' }))).toBe('qualifiedDividend');
    expect(taxCharacterForHolding(fund({ symbol: 'BND', distributionCharacter: 'mixed' }))).toBe('mixed');
    expect(taxCharacterForHolding(fund({ symbol: 'BND', distributionCharacter: 'returnOfCapital' }))).toBe('returnOfCapital');
  });

  it('the forward estimate and the logged payments of such a holding are ordinary', () => {
    // $1,000 estimate each: VTI (stock, not set) qualified, BND (bond, not
    // set) ordinary.
    const stock = fund({ symbol: 'VTI' });
    const bond = fund({ symbol: 'BND' });
    expect(computeTaxableDistributionYield([stock, bond], { asOfDate }).qualifiedShare).toBeCloseTo(0.5, 6);
    // Logged as plain dividends on the bond fund: still ordinary.
    const logged = fund({ symbol: 'BND', annualDividendPerShare: 0 });
    logged.distributionEvents = [createDistributionEvent({ date: '2025-06-15', type: 'dividend', grossAmount: 3000 })];
    expect(computeTaxableDistributionYield([logged, stock], { asOfDate }).qualifiedShare).toBeCloseTo(1000 / 4000, 6);
    // Setting the bond fund's character to Qualified overrides the fallback.
    const declared = fund({ symbol: 'BND', distributionCharacter: 'qualifiedDividend' });
    expect(computeTaxableDistributionYield([stock, declared], { asOfDate }).qualifiedShare).toBe(1);
  });
});

describe('the split is weighted by what each side yields (441)', () => {
  it('a 60/40 account is about a third qualified at the default yields, 60% only if the yields are equal', () => {
    expect(qualifiedShareFromAllocation(60)).toBeCloseTo((0.6 * 1.3) / (0.6 * 1.3 + 0.4 * 4), 9);
    expect(qualifiedShareFromAllocation(60)).toBeLessThan(0.34);
    expect(qualifiedShareFromAllocation(60, { taxableStockYieldPct: 2, taxableBondYieldPct: 2 })).toBeCloseTo(0.6, 9);
    expect(qualifiedShareFromAllocation(100)).toBe(1);
    expect(qualifiedShareFromAllocation(0)).toBe(0);
    // A blank, negative or missing yield reads as the default.
    expect(qualifiedShareFromAllocation(60, { taxableStockYieldPct: '', taxableBondYieldPct: -1 })).toBeCloseTo(qualifiedShareFromAllocation(60), 9);
  });

  it('the yields are plan inputs that sanitize to their defaults and change the tax', () => {
    expect(DEFAULT_INPUTS.taxableStockYieldPct).toBe(1.3);
    expect(DEFAULT_INPUTS.taxableBondYieldPct).toBe(4.0);
    const clean = sanitizeInputs({ ...DEFAULT_INPUTS, taxableStockYieldPct: '', taxableBondYieldPct: undefined });
    expect(clean.taxableStockYieldPct).toBe(1.3);
    expect(clean.taxableBondYieldPct).toBe(4.0);
    const base = runProjection({ ...worker, stockAllocationPre: 60 }).years[0];
    const equal = runProjection({ ...worker, stockAllocationPre: 60, taxableStockYieldPct: 2, taxableBondYieldPct: 2 }).years[0];
    expect(base.qualifiedDividendShare).toBeLessThan(0.34);
    expect(equal.qualifiedDividendShare).toBeCloseTo(0.6, 9);
    // More of the yield is ordinary at the default yields, so more tax.
    expect(base.federalTax).toBeGreaterThan(equal.federalTax);
  });

  it('the demo households keep their own 100%', () => {
    expect(buildDemoInputs().taxableQualifiedDividendFollowsAllocation).toBe(false);
    expect(runProjection({ ...DEFAULT_INPUTS, ...buildDemoInputs() }).years[0].qualifiedDividendShare).toBe(1);
  });
});

describe('a Not Set REIT, option-income or BDC holding is ordinary, and Mixed counts half (442)', () => {
  const taxable = (over) => createHolding({ taxTreatment: 'taxable', shares: 100, currentPrice: 100, annualDividendPerShare: 4, ...over });
  const shareOf = (h) => computeTaxableDistributionYield([h]).qualifiedShare;

  it('by ticker and by name', () => {
    expect(taxCharacterForHolding(taxable({ symbol: 'VNQ', name: 'Vanguard Real Estate ETF' }))).toBe('ordinaryDividend');
    expect(taxCharacterForHolding(taxable({ symbol: 'JEPI', name: 'JPMorgan Equity Premium Income' }))).toBe('ordinaryDividend');
    expect(taxCharacterForHolding(taxable({ symbol: 'ARCC', name: 'Ares Capital' }))).toBe('ordinaryDividend');
    expect(taxCharacterForHolding(taxable({ symbol: 'ZZZZ', name: 'Some Covered Call Strategy Fund' }))).toBe('ordinaryDividend');
    expect(taxCharacterForHolding(taxable({ symbol: 'ZZZZ', name: 'Acme Realty REIT' }))).toBe('ordinaryDividend');
    // An ordinary stock fund is still qualified by default.
    expect(taxCharacterForHolding(taxable({ symbol: 'VTI', name: 'Vanguard Total Stock Market ETF' }))).toBe('unspecified');
    expect(shareOf(taxable({ symbol: 'VTI' }))).toBe(1);
    expect(shareOf(taxable({ symbol: 'O', name: 'Realty Income' }))).toBe(0);
  });

  it('Mixed is half, a set character always wins', () => {
    expect(shareOf(taxable({ symbol: 'VTI', distributionCharacter: 'mixed' }))).toBeCloseTo(0.5, 9);
    expect(shareOf(taxable({ symbol: 'VNQ', distributionCharacter: 'qualifiedDividend' }))).toBe(1);
    expect(shareOf(taxable({ symbol: 'VTI', distributionCharacter: 'ordinaryDividend' }))).toBe(0);
    // Half REIT, half stock fund, same income each: 50% qualified.
    const both = computeTaxableDistributionYield([taxable({ symbol: 'VNQ' }), taxable({ symbol: 'VTI' })]);
    expect(both.qualifiedShare).toBeCloseTo(0.5, 9);
  });
});
