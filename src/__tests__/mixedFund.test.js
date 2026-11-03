// A mixed fund (a balanced, target-date or allocation fund) whose split the
// owner types in: its value is divided among stock, bond and cash wherever
// the app uses the holdings mix.
import { describe, it, expect } from 'vitest';
import {
  createHolding, computeAssetClassMix, holdingMixSplit, assetClassShares, assetClassLabel,
  getEffectiveAssetClass, isValidAssetClass, computeTaxableDistributionYield, sanitizeImportedHoldings,
} from '../utils/portfolioHoldings.js';
import { accountsSummaryModel } from '../components/accountsSummaryModel';

const fund = (over = {}) => createHolding({
  symbol: 'VBIAX', name: 'Vanguard Balanced Index Admiral', securityType: 'mutualFund',
  shares: 100, currentPrice: 100, taxTreatment: 'taxable', ...over,
});

describe('mixed fund split', () => {
  it('is a valid asset class, and a new holding has no split', () => {
    expect(isValidAssetClass('mixed')).toBe(true);
    const h = createHolding();
    expect(h.mixStockPct).toBeNull();
    expect(holdingMixSplit(h)).toBeNull();
  });

  it('divides the value by the split', () => {
    const h = fund({ assetClass: 'mixed', mixStockPct: 60, mixBondPct: 40, mixCashPct: 0 });
    expect(assetClassShares(h)).toEqual({ stock: 0.6, bond: 0.4, cash: 0, other: 0 });
    const mix = computeAssetClassMix([h, fund({ symbol: 'VTI', name: 'Total Stock', assetClass: 'stock' })]);
    expect(mix.stockValue).toBeCloseTo(16000, 6);
    expect(mix.bondValue).toBeCloseTo(4000, 6);
    expect(mix.otherValue).toBe(0);
    expect(mix.stockPctOfClassified).toBeCloseTo(80, 6);
  });

  it('scales a split that does not quite total 100', () => {
    const s = holdingMixSplit(fund({ assetClass: 'mixed', mixStockPct: 60, mixBondPct: 39, mixCashPct: 2 }));
    expect(s.stock + s.bond + s.cash).toBeCloseTo(100, 9);
  });

  it('counts a mixed fund with no split as Other, as before', () => {
    const h = fund({ assetClass: 'mixed' });
    expect(assetClassShares(h).other).toBe(1);
    expect(computeAssetClassMix([h]).otherValue).toBeCloseTo(10000, 6);
    expect(assetClassLabel(h)).toBe('Mixed (no split set)');
  });

  it('leaves a holding marked Other exactly as it was', () => {
    const h = fund({ assetClass: 'other' });
    expect(getEffectiveAssetClass(h)).toBe('other');
    expect(computeAssetClassMix([h]).otherValue).toBeCloseTo(10000, 6);
  });

  it('labels the split', () => {
    expect(assetClassLabel(fund({ assetClass: 'mixed', mixStockPct: 60, mixBondPct: 40 }))).toBe('Mixed 60/40');
    expect(assetClassLabel(fund({ assetClass: 'mixed', mixStockPct: 50, mixBondPct: 40, mixCashPct: 10 }))).toBe('Mixed 50/40/10');
    expect(assetClassLabel(fund({ assetClass: 'bond' }))).toBe('Bond');
  });

  it('taxes the bond and cash part of its income as ordinary when its kind is not set', () => {
    const h = fund({ assetClass: 'mixed', mixStockPct: 60, mixBondPct: 40, annualDividendPerShare: 2 });
    const r = computeTaxableDistributionYield([h], { asOfDate: new Date('2026-06-01') });
    expect(r.qualifiedShare).toBeCloseTo(0.6, 9);
    // Set to Qualified by the owner, it stays qualified.
    const q = computeTaxableDistributionYield([{ ...h, distributionCharacter: 'qualifiedDividend' }], { asOfDate: new Date('2026-06-01') });
    expect(q.qualifiedShare).toBe(1);
  });

  it('keeps the split through a backup restore', () => {
    const [h] = sanitizeImportedHoldings([fund({ assetClass: 'mixed', mixStockPct: 70, mixBondPct: 30 })]);
    expect(assetClassLabel(h)).toBe('Mixed 70/30');
  });

  it('splits the account summary mix and labels the row', () => {
    const m = accountsSummaryModel({}, [fund({ assetClass: 'mixed', mixStockPct: 60, mixBondPct: 40 })]);
    expect(m.assetMix.map((c) => [c.label, Math.round(c.pct)])).toEqual([['Stock', 60], ['Bond', 40]]);
    expect(m.buckets[0].rows[0].className).toBe('Mixed 60/40');
  });
});
