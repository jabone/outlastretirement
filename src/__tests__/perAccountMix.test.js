// A stock share for each account (asset location): each of Pre-Tax, Roth,
// Taxable and HSA grows at its own stock/bond mix.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INPUTS, runProjection, runMonteCarlo, runHistoricalStarts,
  accountStockShareForYear, householdStockShareFromAccounts, perAccountMixActive,
} from '../calculator';
import { REFERENCE_INPUTS } from './referenceHousehold';

const base = {
  ...DEFAULT_INPUTS, ...REFERENCE_INPUTS, rebalancingEnabled: true,
  stockAllocationPre: 60, stockAllocationPost: 60, glideAllocationEnabled: false,
  fundExpenseRatioPct: 0.1,
};
const same = (share) => ({
  ...base, perAccountMixEnabled: true,
  stockSharePreTax: share, stockShareRoth: share, stockShareTaxable: share, stockShareHsa: share,
});
const located = { ...base, perAccountMixEnabled: true, stockSharePreTax: 20, stockShareRoth: 100, stockShareTaxable: 90, stockShareHsa: 100 };

describe('a mix for each account', () => {
  it('is off by default, and only with the stock/bond mix model', () => {
    expect(DEFAULT_INPUTS.perAccountMixEnabled).toBe(false);
    expect(perAccountMixActive(same(60))).toBe(true);
    expect(perAccountMixActive({ ...same(60), rebalancingEnabled: false })).toBe(false);
  });

  it('every account at one share matches one mix for everything exactly', () => {
    const one = runProjection(base);
    const each = runProjection(same(60));
    expect(each.endingBalance).toBeCloseTo(one.endingBalance, 4);
    each.years.forEach((y, i) => {
      expect(y.totalTaxesPaid).toBeCloseTo(one.years[i].totalTaxesPaid, 4);
      expect(y.householdStockShare).toBeCloseTo(60, 9);
    });
  });

  it('matches with the glide on too', () => {
    const glide = { glideAllocationEnabled: true, glideAllocationRate: 1, glideAllocationFloor: 40 };
    const one = runProjection({ ...base, ...glide });
    const each = runProjection({ ...same(60), ...glide });
    expect(each.endingBalance).toBeCloseTo(one.endingBalance, 4);
  });

  it('matches in every real retirement since 1928', () => {
    const one = runHistoricalStarts(base);
    const each = runHistoricalStarts(same(60));
    expect(each.rules[0].lasted).toBe(one.rules[0].lasted);
    expect(each.starts.map((s) => Math.round(s.fixed.realEnd))).toEqual(one.starts.map((s) => Math.round(s.fixed.realEnd)));
    expect(each.perAccountMix).toBe(true);
  });

  it('grows each account at its own return', () => {
    const r = runProjection(located);
    const y = r.years[0];
    expect(y.accountReturns.preTax).toBeCloseTo((20 * base.stockReturnRate + 80 * base.bondReturnRate) / 100, 9);
    expect(y.accountReturns.roth).toBeCloseTo(base.stockReturnRate, 9);
    // The household's share follows the balances.
    expect(y.householdStockShare).toBeGreaterThan(20);
    expect(y.householdStockShare).toBeLessThan(100);
  });

  it('bonds in Pre-Tax leave less Pre-Tax and more Roth than the same mix everywhere', () => {
    const r = runProjection(located);
    const flat = runProjection(same(60));
    expect(r.years[10].rothEnd).toBeGreaterThan(flat.years[10].rothEnd);
    expect(r.years[10].preTaxEnd).toBeLessThan(flat.years[10].preTaxEnd);
  });

  it('taxes Taxable dividends by Taxable\'s own mix', () => {
    const stocky = runProjection({ ...same(60), stockShareTaxable: 100 });
    const bondy = runProjection({ ...same(60), stockShareTaxable: 0 });
    expect(bondy.years[0].ordinaryDividends ?? 0).toBeGreaterThan(stocky.years[0].ordinaryDividends ?? 0);
  });

  it('steps every account above the floor down by the glide, and leaves one below it alone', () => {
    const inp = { ...located, glideAllocationEnabled: true, glideAllocationRate: 2, glideAllocationFloor: 40 };
    expect(accountStockShareForYear(inp, 'roth', true, 2040, 2030)).toBe(80);
    expect(accountStockShareForYear(inp, 'roth', true, 2060, 2030)).toBe(40);
    expect(accountStockShareForYear(inp, 'preTax', true, 2060, 2030)).toBe(20);
    expect(accountStockShareForYear(inp, 'roth', false, 2025, 2030)).toBe(100);
  });

  it('weights the household share by balance', () => {
    expect(householdStockShareFromAccounts({ preTax: 0, roth: 100, taxable: 50, hsa: 50 }, { preTax: 300, roth: 100, taxable: 0, hsa: 0 })).toBe(25);
  });

  it('runs the Monte Carlo with separate stock and bond draws, reproducibly', () => {
    const inp = { ...located, monteCarloTrials: 200 };
    const a = runMonteCarlo(inp);
    const b = runMonteCarlo(inp);
    expect(a.successProbability).toBe(b.successProbability);
    expect(a.successProbability).toBeGreaterThan(0);
  });

  it('leaves a one-mix plan\'s Monte Carlo exactly as it was', () => {
    const inp = { ...base, monteCarloTrials: 200 };
    expect(runMonteCarlo({ ...inp, stockSharePreTax: 10 }).successProbability).toBe(runMonteCarlo(inp).successProbability);
  });
});

import { computeAssetLocationComparison, usualBondPlacement, historicalByStockShare } from '../calculator';

describe('where should my bonds go?', () => {
  it('fills Pre-Tax with bonds first, then Taxable, then HSA, then Roth', () => {
    const sh = usualBondPlacement(60, { preTax: 300, roth: 300, taxable: 300, hsa: 100 });
    // 40% of 1,000 is 400 in bonds: all 300 of Pre-Tax, then 100 of Taxable.
    expect(sh).toEqual({ preTax: 0, taxable: 66.7, hsa: 100, roth: 100 });
  });

  it('runs the same overall mix two ways, and the plan\'s own when it sets one', () => {
    const one = computeAssetLocationComparison(base);
    expect(one.available).toBe(true);
    expect(one.rows.map((r) => r.key)).toEqual(['same', 'usual']);
    const own = computeAssetLocationComparison(located);
    expect(own.rows.map((r) => r.key)).toEqual(['same', 'usual', 'yours']);
    const [same, usual] = own.rows;
    // Bonds in Pre-Tax: smaller required withdrawals.
    expect(usual.lifetimeRmds).toBeLessThan(same.lifetimeRmds);
  });

  it('the same-mix row is the plan with one mix', () => {
    const r = computeAssetLocationComparison(base);
    expect(r.overallStockShare).toBe(60);
    const plain = runProjection(base);
    const factor = plain.years[plain.years.length - 1].inflFactor;
    expect(r.rows[0].endingBalance).toBeGreaterThan(0);
    expect(Math.abs(r.rows[0].endingBalance * factor - plain.endingBalance) / plain.endingBalance).toBeLessThan(0.05);
  });

  it('is not offered with your own average return, or with savings in one account', () => {
    expect(computeAssetLocationComparison({ ...base, rebalancingEnabled: false }).available).toBe(false);
    expect(computeAssetLocationComparison({ ...base, rothInit: 0, taxableInit: 0, hsaInit: 0 }).reason).toBe('oneAccount');
  });
});

describe('independent-review fixes', () => {
  it('a mix for each account at one share has the same Monte Carlo odds as one mix, up to sampling', () => {
    const one = runMonteCarlo({ ...base, monteCarloTrials: 400 });
    const each = runMonteCarlo({ ...same(60), monteCarloTrials: 400 });
    expect(Math.abs(each.successProbability - one.successProbability)).toBeLessThan(6);
  });

  it('the stock-share table\'s own row agrees with the headline count for a per-account plan still working', () => {
    const inp = { ...DEFAULT_INPUTS, rebalancingEnabled: true, stockAllocationPre: 90, stockAllocationPost: 90, perAccountMixEnabled: true,
      stockSharePreTax: 50, stockShareRoth: 50, stockShareTaxable: 50, stockShareHsa: 50 };
    const table = historicalByStockShare(inp);
    const own = table.rows.find((r) => r.isPlan);
    expect(own.lasted).toBe(runHistoricalStarts(inp).rules[0].lasted);
  });

  it('the comparison uses the Retired share for a household already retired', () => {
    const START = DEFAULT_INPUTS.planYear;
    const retired = { ...base, birthYear1: START - 66, retireAge1: 60, stockAllocationPre: 80, stockAllocationPost: 40, spouse2Enabled: false };
    expect(computeAssetLocationComparison(retired).overallStockShare).toBe(40);
  });
});
