import { describe, it, expect } from 'vitest';
import {
  createHolding,
  formatShares,
  computeMarketValue,
  computeBucketTotals,
  computeTaxableCostBasis,
  guessTaxTreatment,
  parsePtaBackup,
  parsePtaLedgerEntries,
  applyTaxTreatments,
  replayPendingSales,
  isLikelyRealLedger,
  parsePtaClosedPositionCandidates,
  mapPtaClosedPositions,
  computeAnnualDividendIncome,
  computeDividendYield,
  computeDividendTotals,
  computeUnrealizedGain,
  calculateHoldingCAGR,
  compoundBenchmarkGrowth,
  compoundBenchmarkCAGR,
  computeAnalytics,
  SP500_ANNUAL_RETURN_PCT,
  SP500_YTD_RETURN_PCT,
  computeYieldOnCost,
  computePerPaymentIncome,
  computeDividendTotalsByCharacter,
  isValidDistributionCharacter,
  isValidDividendFrequency,
  isSafeExternalUrl,
  generatedQuoteTicker,
  shouldRefillResearchUrl,
  paymentsPerYearForFrequency,
  createLot,
  getTotalShares,
  getTotalCostBasis,
  getWeightedAvgBuyPrice,
  getEarliestLotDate,
  calculateLotCAGR,
  getLotTermClassification,
  computeLotBreakdown,
  calculateHoldingMoneyWeightedReturn,
  computeBenchmarkTrajectory,
  NASDAQ100_ANNUAL_RETURN_PCT,
  NASDAQ100_YTD_RETURN_PCT,
  computeRebalancePlan,
  selectLotsForSale,
  computeLiquidationPreview,
  createLiquidation,
  applyLiquidationToHolding,
  sanitizeImportedLiquidations,
  SECURITY_TYPES,
  isValidSecurityType,
  DISTRIBUTION_EVENT_TYPES,
  isValidDistributionEventType,
  DISTRIBUTION_DESTINATIONS,
  isValidDistributionDestination,
  createDistributionEvent,
  computeLifetimeDistributions,
  computeProjectedPayoutSchedule,
  computeRollingDividendTimeline,
  collectActualDistributions,
  retractGuessedLotSources,
  canSyncFromHoldings,
  migrateDistributionCharacters,
  DISTRIBUTION_CHARACTERS,
  computeCashReserveFromHoldings,
  findUnspecifiedLots,
  sumActualDistributions,
  computeDistributionMatrix,
  computeRetirementIncomeBases,
  resolveRetirementIncomeBasis,
  trailingTwelveMonthKeys,
  computeDripCashSplit,
  computePortfolioDividendYield,
  STALE_ASSET_DAYS,
  getPricedTimeline,
  computeValueAsOfDate,
  computeWealthMilestones,
  computeCalendarQuarterTotals,
  computeHistoricalDecisions,
  computeTopWeightConcentration,
  computeNetWorthSummary,
  computeAllocationByType,
  computeGlidePathSimulation,
  computeGlidePathRoadmap,
  ASSET_CLASSES,
  isValidAssetClass,
  guessAssetClass,
  getEffectiveAssetClass,
  computeAssetClassMix,
  computeConcentratedStockLinkValues,
} from '../utils/portfolioHoldings.js';

describe('portfolioHoldings', () => {
  describe('createHolding', () => {
    it('defaults securityType to stock and dayChangeDollar/dayChangePct to null', () => {
      const holding = createHolding({ symbol: 'AAA' });
      expect(holding.securityType).toBe('stock');
      expect(holding.dayChangeDollar).toBeNull();
      expect(holding.dayChangePct).toBeNull();
    });

    it('accepts overrides for the new fields', () => {
      const holding = createHolding({ symbol: 'AAA', securityType: 'etf', dayChangeDollar: 1.5, dayChangePct: 0.8 });
      expect(holding.securityType).toBe('etf');
      expect(holding.dayChangeDollar).toBe(1.5);
      expect(holding.dayChangePct).toBe(0.8);
    });

    it('defaults researchUrl to an empty string, and accepts an override', () => {
      expect(createHolding({ symbol: 'AAA' }).researchUrl).toBe('');
      expect(createHolding({ symbol: 'AAA', researchUrl: 'https://example.com' }).researchUrl).toBe('https://example.com');
    });

    it('defaults manualPricing to false, and accepts an override (incl. via sanitized import)', () => {
      expect(createHolding({ symbol: 'FDRXX' }).manualPricing).toBe(false);
      expect(createHolding({ symbol: 'FDRXX', manualPricing: true }).manualPricing).toBe(true);
    });
  });

  describe('formatShares', () => {
    it('rounds away float-accumulation noise from lot sums', () => {
      // The exact values from the live report: raw lot sums rendering as
      // 16-digit floats in the Holdings table.
      expect(formatShares(2.0219999999999985)).toBe('2.022');
      expect(formatShares(1519.9999999999998)).toBe('1520');
      expect(formatShares(10.460000000000003)).toBe('10.46');
    });

    it('preserves real broker precision up to 6 decimals and trims trailing zeros', () => {
      expect(formatShares(51.13)).toBe('51.13');
      expect(formatShares(0.123456)).toBe('0.123456');
      expect(formatShares(7.208)).toBe('7.208');
      expect(formatShares(100)).toBe('100');
    });

    it('renders non-numeric input as "0" instead of NaN', () => {
      expect(formatShares(undefined)).toBe('0');
      expect(formatShares(null)).toBe('0');
      expect(formatShares('abc')).toBe('0');
    });
  });

  // the owner, 2026-10-05: a holding priced by DUK-PA kept the link generated
  // for the ticker it was first priced by, which Yahoo does not know.
  describe('a generated research link follows the ticker the holding is priced by', () => {
    it('reads the ticker out of a link the Sheet generated, and nothing else', () => {
      expect(generatedQuoteTicker('https://finance.yahoo.com/quote/DUK-PA')).toBe('DUK-PA');
      expect(generatedQuoteTicker(' https://finance.yahoo.com/quote/brk-b/ ')).toBe('BRK-B');
      expect(generatedQuoteTicker('https://finance.yahoo.com/quote/%5EGSPC')).toBe('^GSPC');
      for (const typed of ['', null, 'https://finance.yahoo.com/quote/DUK-PA/news', 'https://finance.yahoo.com/lookup/?s=DUK-A', 'https://finance.yahoo.com/quote/DUK-PA?p=DUK-PA', 'https://example.com/quote/DUK-PA', 'https://myfundfactsheet.com/aaa']) {
        expect(generatedQuoteTicker(typed)).toBe(null);
      }
    });

    it('refills an empty link', () => {
      expect(shouldRefillResearchUrl('', 'DUK-PA')).toBe(true);
      expect(shouldRefillResearchUrl(undefined, 'DUK-PA')).toBe(true);
    });

    it('replaces a generated link for a different ticker', () => {
      expect(shouldRefillResearchUrl('https://finance.yahoo.com/quote/DUK-A', 'DUK-PA')).toBe(true);
      expect(shouldRefillResearchUrl('https://finance.yahoo.com/quote/DUKPRA', 'duk-pa')).toBe(true);
    });

    it('leaves a generated link for the same ticker, and any link the person typed', () => {
      expect(shouldRefillResearchUrl('https://finance.yahoo.com/quote/DUK-PA', 'DUK-PA')).toBe(false);
      expect(shouldRefillResearchUrl('https://finance.yahoo.com/quote/duk-pa/', 'DUK-PA')).toBe(false);
      expect(shouldRefillResearchUrl('https://myfundfactsheet.com/aaa', 'DUK-PA')).toBe(false);
      expect(shouldRefillResearchUrl('https://finance.yahoo.com/quote/DUK/news', 'DUK-PA')).toBe(false);
    });
  });

  describe('isSafeExternalUrl', () => {
    it('accepts http and https URLs', () => {
      expect(isSafeExternalUrl('https://finance.yahoo.com/quote/AAPL')).toBe(true);
      expect(isSafeExternalUrl('http://example.com')).toBe(true);
    });

    it('is case-insensitive on the scheme', () => {
      expect(isSafeExternalUrl('HTTPS://example.com')).toBe(true);
    });

    it('tolerates leading/trailing whitespace', () => {
      expect(isSafeExternalUrl('  https://example.com  ')).toBe(true);
    });

    it('rejects non-http(s) schemes (e.g. javascript:) and non-URL strings', () => {
      expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isSafeExternalUrl('ftp://example.com')).toBe(false);
      expect(isSafeExternalUrl('not a url')).toBe(false);
    });

    it('rejects empty, null, undefined, and non-string values', () => {
      expect(isSafeExternalUrl('')).toBe(false);
      expect(isSafeExternalUrl(null)).toBe(false);
      expect(isSafeExternalUrl(undefined)).toBe(false);
      expect(isSafeExternalUrl(123)).toBe(false);
    });
  });

  describe('isValidSecurityType', () => {
    it('accepts every value in SECURITY_TYPES', () => {
      SECURITY_TYPES.forEach((t) => expect(isValidSecurityType(t.value)).toBe(true));
    });

    it('rejects unknown values', () => {
      expect(isValidSecurityType('bond')).toBe(false);
      expect(isValidSecurityType(undefined)).toBe(false);
    });
  });

  describe('computeMarketValue', () => {
    it('multiplies shares by currentPrice', () => {
      expect(computeMarketValue({ shares: 10, currentPrice: 5 })).toBe(50);
    });
    it('treats missing/non-numeric fields as 0', () => {
      expect(computeMarketValue({})).toBe(0);
      expect(computeMarketValue({ shares: 'x', currentPrice: 5 })).toBe(0);
    });
  });

  describe('computeBucketTotals', () => {
    it('sums market value into the correct bucket per holding', () => {
      const holdings = [
        createHolding({ taxTreatment: 'preTax', shares: 10, currentPrice: 10 }), // 100
        createHolding({ taxTreatment: 'roth', shares: 5, currentPrice: 20 }), // 100
        createHolding({ taxTreatment: 'taxable', shares: 1, currentPrice: 50 }), // 50
        createHolding({ taxTreatment: 'hsa', shares: 2, currentPrice: 25 }), // 50
      ];
      const totals = computeBucketTotals(holdings);
      expect(totals).toMatchObject({ preTax: 100, roth: 100, taxable: 50, hsa: 50, total: 300, unassignedCount: 0, count: 4 });
    });

    it('excludes an unrecognized taxTreatment from every bucket but still counts it in total', () => {
      const holdings = [createHolding({ taxTreatment: 'not-a-real-bucket', shares: 3, currentPrice: 10 })];
      const totals = computeBucketTotals(holdings);
      expect(totals.total).toBe(30);
      expect(totals.unassignedCount).toBe(1);
      expect(totals.preTax + totals.roth + totals.taxable + totals.hsa).toBe(0);
    });

    it('returns all zeros for an empty list', () => {
      expect(computeBucketTotals([])).toMatchObject({ preTax: 0, roth: 0, taxable: 0, hsa: 0, total: 0, count: 0 });
    });

    // changelog 147: a holding designated as a linked concentrated position
    // must be netted OUT of the Taxable bucket (and the total), or it is
    // counted in both the bucket and the separate concentrated sleeve.
    it('excludeHoldingId nets one holding out of the taxable bucket and the total', () => {
      const goog = createHolding({ taxTreatment: 'taxable', shares: 100, currentPrice: 2000 }); // 200000
      const vti = createHolding({ taxTreatment: 'taxable', shares: 100, currentPrice: 300 }); // 30000
      const full = computeBucketTotals([goog, vti]);
      expect(full.taxable).toBe(230000);
      const netted = computeBucketTotals([goog, vti], { excludeHoldingId: goog.id });
      expect(netted.taxable).toBe(30000);
      expect(netted.total).toBe(30000);
      expect(netted.excludedValue).toBe(200000);
    });

    it('excludeHoldingIds nets out BOTH linked concentrated positions', () => {
      const goog = createHolding({ taxTreatment: 'taxable', shares: 1, currentPrice: 200000 });
      const meta = createHolding({ taxTreatment: 'taxable', shares: 1, currentPrice: 150000 });
      const vti = createHolding({ taxTreatment: 'taxable', shares: 1, currentPrice: 50000 });
      const netted = computeBucketTotals([goog, meta, vti], { excludeHoldingIds: [goog.id, meta.id] });
      expect(netted.taxable).toBe(50000);
      expect(netted.excludedValue).toBe(350000);
    });

    it('a null/absent exclude id changes nothing', () => {
      const goog = createHolding({ taxTreatment: 'taxable', shares: 1, currentPrice: 200000 });
      expect(computeBucketTotals([goog], { excludeHoldingId: null }).taxable).toBe(200000);
      expect(computeBucketTotals([goog], { excludeHoldingIds: [] }).taxable).toBe(200000);
      expect(computeBucketTotals([goog]).taxable).toBe(200000);
    });
  });

  describe('computeTaxableCostBasis', () => {
    it('excludeHoldingId nets a linked concentrated holding out of the taxable cost basis (changelog 147)', () => {
      const goog = createHolding({ taxTreatment: 'taxable', shares: 10, avgBuyPrice: 100 }); // basis 1000
      const vti = createHolding({ taxTreatment: 'taxable', shares: 10, avgBuyPrice: 30 }); // basis 300
      expect(computeTaxableCostBasis([goog, vti])).toBe(1300);
      expect(computeTaxableCostBasis([goog, vti], { excludeHoldingId: goog.id })).toBe(300);
      expect(computeTaxableCostBasis([goog, vti], { excludeHoldingIds: [goog.id, vti.id] })).toBe(0);
    });

    it('sums getTotalCostBasis only for taxable-bucket holdings, ignoring other buckets', () => {
      const holdings = [
        createHolding({ taxTreatment: 'taxable', shares: 10, avgBuyPrice: 20 }), // 200
        createHolding({ taxTreatment: 'taxable', shares: 5, avgBuyPrice: 40 }), // 200
        createHolding({ taxTreatment: 'preTax', shares: 100, avgBuyPrice: 50 }), // excluded
        createHolding({ taxTreatment: 'roth', shares: 100, avgBuyPrice: 50 }), // excluded
        createHolding({ taxTreatment: 'hsa', shares: 100, avgBuyPrice: 50 }), // excluded
      ];
      expect(computeTaxableCostBasis(holdings)).toBe(400);
    });

    it('is lot-aware -- uses getTotalCostBasis so a lotted taxable holding sums shares*pricePerShare per lot', () => {
      const holdings = [
        createHolding({
          taxTreatment: 'taxable',
          lots: [
            { id: 'l1', shares: 10, pricePerShare: 100 }, // 1000
            { id: 'l2', shares: 5, pricePerShare: 50 }, // 250
          ],
        }),
      ];
      expect(computeTaxableCostBasis(holdings)).toBe(1250);
    });

    it('excludes an unrecognized/missing taxTreatment (not just non-taxable ones)', () => {
      const holdings = [createHolding({ taxTreatment: 'not-a-real-bucket', shares: 10, avgBuyPrice: 20 })];
      expect(computeTaxableCostBasis(holdings)).toBe(0);
    });

    it('returns 0 for an empty list', () => {
      expect(computeTaxableCostBasis([])).toBe(0);
    });
  });

  describe('isValidAssetClass', () => {
    it('accepts every value in ASSET_CLASSES', () => {
      ASSET_CLASSES.forEach((c) => expect(isValidAssetClass(c.value)).toBe(true));
    });
    it('rejects unknown values', () => {
      expect(isValidAssetClass('crypto')).toBe(false);
      expect(isValidAssetClass(undefined)).toBe(false);
      expect(isValidAssetClass(null)).toBe(false);
    });
  });

  describe('guessAssetClass', () => {
    it.each([
      ['SGOV', undefined, 'cash'],
      ['SPAXX', undefined, 'cash'],
      ['BND', undefined, 'bond'],
      ['AGG', undefined, 'bond'],
      ['TLT', undefined, 'bond'],
      ['AAPL', undefined, 'stock'],
      ['VOO', undefined, 'stock'],
    ])('guesses %s -> %s', (symbol, name, expected) => {
      expect(guessAssetClass({ symbol, name })).toBe(expected);
    });

    it('matches by name keyword when the symbol is unrecognized', () => {
      expect(guessAssetClass({ symbol: 'XYZABC', name: 'Some Total Bond Market Fund' })).toBe('bond');
      expect(guessAssetClass({ symbol: 'XYZABC', name: 'Prime Money Market Fund' })).toBe('cash');
    });

    it('is case-insensitive on symbol matching', () => {
      expect(guessAssetClass({ symbol: 'bnd' })).toBe('bond');
      expect(guessAssetClass({ symbol: ' sgov ' })).toBe('cash');
    });

    it('defaults crypto securityType to other, not stock', () => {
      expect(guessAssetClass({ symbol: 'BTC', securityType: 'crypto' })).toBe('other');
    });

    it('falls back to stock for an unrecognized symbol/name with no crypto type', () => {
      expect(guessAssetClass({ symbol: 'NOTAREALTICKER', name: 'Some Fund' })).toBe('stock');
      expect(guessAssetClass({})).toBe('stock');
    });
  });

  describe('getEffectiveAssetClass', () => {
    it('returns the explicit assetClass when validly set, ignoring what the guess would be', () => {
      const holding = createHolding({ symbol: 'BND', assetClass: 'stock' });
      expect(getEffectiveAssetClass(holding)).toBe('stock');
    });

    it('falls back to guessAssetClass when assetClass is null (the default)', () => {
      const holding = createHolding({ symbol: 'BND' });
      expect(holding.assetClass).toBeNull();
      expect(getEffectiveAssetClass(holding)).toBe('bond');
    });

    it('falls back to guessAssetClass when assetClass is an invalid/stale value', () => {
      const holding = createHolding({ symbol: 'SGOV', assetClass: 'not-a-real-class' });
      expect(getEffectiveAssetClass(holding)).toBe('cash');
    });
  });

  describe('computeAssetClassMix', () => {
    it('sums market value per effective asset class', () => {
      const holdings = [
        createHolding({ symbol: 'AAPL', shares: 10, currentPrice: 10 }), // stock, 100
        createHolding({ symbol: 'BND', shares: 10, currentPrice: 10 }), // bond, 100
        createHolding({ symbol: 'SGOV', shares: 10, currentPrice: 10 }), // cash, 100
        createHolding({ symbol: 'BTC', securityType: 'crypto', shares: 10, currentPrice: 10 }), // other, 100
      ];
      const mix = computeAssetClassMix(holdings);
      expect(mix).toMatchObject({
        stockValue: 100, bondValue: 100, cashValue: 100, otherValue: 100, total: 400,
        stockPct: 25, bondPct: 25, cashPct: 25, otherPct: 25,
        classifiedTotal: 300,
      });
      expect(mix.stockPctOfClassified).toBeCloseTo(100 / 3, 5);
    });

    it('respects an explicit assetClass override over the guess', () => {
      const holdings = [createHolding({ symbol: 'BND', shares: 10, currentPrice: 10, assetClass: 'stock' })];
      const mix = computeAssetClassMix(holdings);
      expect(mix).toMatchObject({ stockValue: 100, bondValue: 0 });
    });

    it('excludes other/crypto from classifiedTotal and stockPctOfClassified, but keeps it in total', () => {
      const holdings = [
        createHolding({ symbol: 'AAPL', shares: 10, currentPrice: 10 }), // stock, 100
        createHolding({ symbol: 'BTC', securityType: 'crypto', shares: 10, currentPrice: 10 }), // other, 100
      ];
      const mix = computeAssetClassMix(holdings);
      expect(mix.total).toBe(200);
      expect(mix.classifiedTotal).toBe(100);
      expect(mix.stockPctOfClassified).toBe(100);
      expect(mix.stockPct).toBe(50);
    });

    it('returns stockPctOfClassified null (not NaN/0) when there is nothing classified', () => {
      const holdings = [createHolding({ symbol: 'BTC', securityType: 'crypto', shares: 10, currentPrice: 10 })];
      const mix = computeAssetClassMix(holdings);
      expect(mix.classifiedTotal).toBe(0);
      expect(mix.stockPctOfClassified).toBeNull();
    });

    it('returns all zeros/null for an empty list', () => {
      const mix = computeAssetClassMix([]);
      expect(mix).toMatchObject({ stockValue: 0, bondValue: 0, cashValue: 0, otherValue: 0, total: 0, classifiedTotal: 0 });
      expect(mix.stockPctOfClassified).toBeNull();
    });
  });

  describe('computeConcentratedStockLinkValues', () => {
    it('returns label/value/costBasisPct from a single-lot holding', () => {
      const holding = createHolding({ symbol: 'GOOG', shares: 10, currentPrice: 100, avgBuyPrice: 40 }); // value 1000, basis 400
      const linked = computeConcentratedStockLinkValues(holding);
      expect(linked.label).toBe('GOOG');
      expect(linked.value).toBe(1000);
      expect(linked.costBasisPct).toBe(40);
    });

    it('is lot-aware, using getTotalShares/getTotalCostBasis so a lotted holding sums correctly', () => {
      const holding = createHolding({
        symbol: 'GOOG',
        currentPrice: 50,
        lots: [
          { id: 'l1', shares: 10, pricePerShare: 20 }, // 200 basis
          { id: 'l2', shares: 10, pricePerShare: 30 }, // 300 basis
        ],
      });
      // 20 shares * $50 = 1000 value; 500 basis -> 50% cost basis
      const linked = computeConcentratedStockLinkValues(holding);
      expect(linked.value).toBe(1000);
      expect(linked.costBasisPct).toBe(50);
    });

    it('clamps costBasisPct to 100 for a position trading underwater (cost basis exceeds current value)', () => {
      const holding = createHolding({ symbol: 'GOOG', shares: 10, currentPrice: 10, avgBuyPrice: 50 }); // value 100, basis 500
      const linked = computeConcentratedStockLinkValues(holding);
      expect(linked.costBasisPct).toBe(100);
    });

    it('returns costBasisPct 0 (not NaN) when market value is 0', () => {
      const holding = createHolding({ symbol: 'GOOG', shares: 0, currentPrice: 100, avgBuyPrice: 40 });
      const linked = computeConcentratedStockLinkValues(holding);
      expect(linked.value).toBe(0);
      expect(linked.costBasisPct).toBe(0);
    });

    it('returns an empty-string label for a holding with no symbol', () => {
      const holding = createHolding({ symbol: '', shares: 10, currentPrice: 100 });
      expect(computeConcentratedStockLinkValues(holding).label).toBe('');
    });

    it('returns null for a null/undefined holding', () => {
      expect(computeConcentratedStockLinkValues(null)).toBeNull();
      expect(computeConcentratedStockLinkValues(undefined)).toBeNull();
    });
  });

  describe('guessTaxTreatment', () => {
    it.each([
      ['Fidelity Roth IRA', 'roth'],
      ['HSA Bank', 'hsa'],
      ['Health Savings Account', 'hsa'],
      ['Rollover IRA (Horizon)', 'preTax'],
      ['Vanguard 401(k)', 'preTax'],
      ['Fidelity Brokerage', 'taxable'],
      ['', 'taxable'],
    ])('guesses %s -> %s', (account, expected) => {
      expect(guessTaxTreatment(account)).toBe(expected);
    });

    it('prefers Roth over Pre-Tax when an account name matches both keyword sets', () => {
      expect(guessTaxTreatment('Rollover Roth 401(k)')).toBe('roth');
    });
  });

  describe('parsePtaBackup', () => {
    it('parses a full backup object and extracts the portfolio array', () => {
      const backup = {
        version: 'aura_backup_v2',
        portfolio: [
          { symbol: 'schd', name: 'Schwab US Dividend Equity ETF', institution: 'Fidelity', account: 'Rollover IRA', shares: 10, avgBuyPrice: 70, currentPrice: 80 },
        ],
      };
      const result = parsePtaBackup(JSON.stringify(backup));
      expect(result.error).toBeNull();
      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0].symbol).toBe('SCHD'); // uppercased
      expect(result.accounts).toEqual([{ account: 'Rollover IRA', taxTreatment: 'preTax' }]);
    });

    it('also accepts a bare holdings array', () => {
      const result = parsePtaBackup(JSON.stringify([{ symbol: 'voo', account: 'Brokerage', shares: 1, currentPrice: 500 }]));
      expect(result.error).toBeNull();
      expect(result.holdings).toHaveLength(1);
    });

    it('returns an error string (never throws) for invalid JSON', () => {
      expect(() => parsePtaBackup('not json')).not.toThrow();
      const result = parsePtaBackup('not json');
      expect(result.error).toMatch(/not valid JSON/);
      expect(result.holdings).toEqual([]);
    });

    it('returns an error for valid JSON with no recognizable portfolio list', () => {
      const result = parsePtaBackup(JSON.stringify({ foo: 'bar' }));
      expect(result.error).toMatch(/portfolio holdings list/);
    });

    it('drops entries with no symbol rather than crashing', () => {
      const result = parsePtaBackup(JSON.stringify({ portfolio: [{ shares: 1 }, { symbol: 'AAPL', shares: 1, currentPrice: 200 }] }));
      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0].symbol).toBe('AAPL');
    });

    it('dedupes account labels across holdings', () => {
      const result = parsePtaBackup(JSON.stringify({
        portfolio: [
          { symbol: 'AAPL', account: 'Brokerage', shares: 1, currentPrice: 1 },
          { symbol: 'MSFT', account: 'Brokerage', shares: 1, currentPrice: 1 },
        ],
      }));
      expect(result.accounts).toHaveLength(1);
    });
  });

  describe('computeAnnualDividendIncome', () => {
    it('multiplies shares by annualDividendPerShare', () => {
      expect(computeAnnualDividendIncome({ shares: 100, annualDividendPerShare: 2.5 })).toBe(250);
    });
    it('treats missing/non-numeric fields as 0', () => {
      expect(computeAnnualDividendIncome({})).toBe(0);
    });
  });

  describe('computeDividendYield', () => {
    it('divides annualDividendPerShare by currentPrice', () => {
      expect(computeDividendYield({ currentPrice: 50, annualDividendPerShare: 2 })).toBeCloseTo(0.04, 5);
    });
    it('returns 0 rather than dividing by zero when price is 0', () => {
      expect(computeDividendYield({ currentPrice: 0, annualDividendPerShare: 2 })).toBe(0);
    });
  });

  describe('computeDividendTotals', () => {
    it('sums annual dividend income into the correct bucket per holding', () => {
      const holdings = [
        createHolding({ taxTreatment: 'preTax', shares: 100, annualDividendPerShare: 1 }), // 100
        createHolding({ taxTreatment: 'taxable', shares: 50, annualDividendPerShare: 2 }), // 100
      ];
      const totals = computeDividendTotals(holdings);
      expect(totals).toMatchObject({ preTax: 100, roth: 0, taxable: 100, hsa: 0, total: 200 });
    });

    it('returns all zeros for an empty list', () => {
      expect(computeDividendTotals([])).toMatchObject({ preTax: 0, roth: 0, taxable: 0, hsa: 0, total: 0 });
    });
  });

  describe('parsePtaBackup dividend mapping', () => {
    it('derives annualDividendPerShare from latestDividend.annualTotal when present', () => {
      const result = parsePtaBackup(JSON.stringify({
        portfolio: [{ symbol: 'SCHD', account: 'Brokerage', shares: 10, currentPrice: 80, latestDividend: { annualTotal: 2.68, yieldPct: 3.35 } }],
      }));
      expect(result.holdings[0].annualDividendPerShare).toBeCloseTo(2.68, 5);
    });

    it('falls back to deriving it from yieldPct * currentPrice when annualTotal is missing', () => {
      const result = parsePtaBackup(JSON.stringify({
        portfolio: [{ symbol: 'SCHD', account: 'Brokerage', shares: 10, currentPrice: 80, latestDividend: { yieldPct: 5 } }],
      }));
      expect(result.holdings[0].annualDividendPerShare).toBeCloseTo(4, 5);
    });

    it('defaults to 0 when there is no latestDividend at all', () => {
      const result = parsePtaBackup(JSON.stringify({ portfolio: [{ symbol: 'AAPL', account: 'Brokerage', shares: 10, currentPrice: 200 }] }));
      expect(result.holdings[0].annualDividendPerShare).toBe(0);
    });
  });

  describe('applyTaxTreatments', () => {
    it('assigns each holding the confirmed treatment for its account', () => {
      const holdings = [
        { symbol: 'AAPL', account: 'Brokerage', shares: 1, avgBuyPrice: 1, currentPrice: 1 },
        { symbol: 'VTSAX', account: 'Rollover IRA', shares: 1, avgBuyPrice: 1, currentPrice: 1 },
      ];
      const { holdings: mapped } = applyTaxTreatments(holdings, { Brokerage: 'taxable', 'Rollover IRA': 'preTax' });
      expect(mapped.find((h) => h.symbol === 'AAPL').taxTreatment).toBe('taxable');
      expect(mapped.find((h) => h.symbol === 'VTSAX').taxTreatment).toBe('preTax');
    });

    it('falls back to taxable for an account with no confirmed mapping', () => {
      const { holdings: mapped } = applyTaxTreatments([{ symbol: 'AAPL', account: 'Mystery Account', shares: 1, avgBuyPrice: 1, currentPrice: 1 }], {});
      expect(mapped[0].taxTreatment).toBe('taxable');
    });

    it('assigns each result a fresh id via createHolding', () => {
      const { holdings: mapped } = applyTaxTreatments([{ symbol: 'AAPL', account: 'Brokerage', shares: 1, avgBuyPrice: 1, currentPrice: 1 }], { Brokerage: 'taxable' });
      expect(mapped[0].id).toBeTruthy();
    });

    it('returns an empty liquidations array when no holding has pendingSales', () => {
      const { liquidations } = applyTaxTreatments([{ symbol: 'AAPL', account: 'Brokerage', shares: 1, avgBuyPrice: 1, currentPrice: 1 }], { Brokerage: 'taxable' });
      expect(liquidations).toEqual([]);
    });
  });

  describe('parsePtaLedgerEntries', () => {
    it('maps a positive-sharesAdded entry to a lot, sourced by destination', () => {
      const { lots } = parsePtaLedgerEntries([
        { date: '2020-01-15', type: 'Purchase / Buy', destination: 'held', sharesAdded: 10, gross: 1000, navPrice: 100 },
        { date: '2020-06-15', type: 'Fidelity Statement Ingest', destination: 'drip', sharesAdded: 5, gross: 550, navPrice: 110 },
      ]);
      expect(lots).toMatchObject([
        { date: '2020-01-15', shares: 10, pricePerShare: 100, source: 'purchase' },
        { date: '2020-06-15', shares: 5, pricePerShare: 110, source: 'drip' },
      ]);
      lots.forEach((l) => expect(l.id).toBeTruthy()); // real, unique ids -- see selectLotsForSale's FIFO map keying
      expect(new Set(lots.map((l) => l.id)).size).toBe(2);
    });

    it('falls back to first-entry-is-purchase, everything-after-is-drip when destination never says "drip" (the real statement-ingest case)', () => {
      // Confirmed against a real backup: statement-ingested ledgers use
      // destination: "held" on every entry, never "drip" -- even for
      // confirmed real-world DRIP reinvestments -- so the date-order
      // fallback (not the destination field) is what actually classifies
      // these in practice.
      const { lots } = parsePtaLedgerEntries([
        { date: '2016-11-30', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: 8236.6, navPrice: 9.424 },
        { date: '2016-12-31', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: 100.66, navPrice: 9.552 },
        { date: '2017-04-30', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: 295.92, navPrice: 9.954 },
      ]);
      // Only the first addition is asserted as a purchase; the importer no
      // longer guesses DRIP for the rest, because that label now decides
      // whether shares count as dividend income.
      expect(lots.map((l) => l.source)).toEqual(['purchase', 'unspecified', 'unspecified']);
    });

    it('still honors an explicit destination: "drip" as the first entry, rather than forcing it to "purchase"', () => {
      const { lots } = parsePtaLedgerEntries([
        { date: '2020-01-15', type: 'Dividend', destination: 'drip', sharesAdded: 2, navPrice: 50 },
      ]);
      expect(lots[0].source).toBe('drip');
    });

    it('derives price from gross/sharesAdded when navPrice is missing', () => {
      const { lots } = parsePtaLedgerEntries([
        { date: '2020-01-15', type: 'Purchase / Buy', destination: 'held', sharesAdded: 4, gross: 400 },
      ]);
      expect(lots[0].pricePerShare).toBeCloseTo(100, 5);
    });

    it('routes a negative-sharesAdded entry to pendingSales, not a negative lot', () => {
      const { lots, pendingSales } = parsePtaLedgerEntries([
        { date: '2021-01-31', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: -9500, gross: -157320, navPrice: 16.56 },
      ]);
      expect(lots).toEqual([]);
      expect(pendingSales).toEqual([{ sharesToSell: 9500, salePricePerShare: 16.56, saleDate: '2021-01-31' }]);
    });

    it('routes a zero-sharesAdded entry with a usable price to priceSnapshots', () => {
      const { priceSnapshots, lots, pendingSales } = parsePtaLedgerEntries([
        { date: '2017-03-31', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: 0, gross: 0, navPrice: 42.5 },
      ]);
      expect(priceSnapshots).toMatchObject([{ date: '2017-03-31', price: 42.5, label: 'Fidelity Statement Ingest' }]);
      expect(priceSnapshots[0].id).toBeTruthy();
      expect(lots).toEqual([]);
      expect(pendingSales).toEqual([]);
    });

    it('skips a zero-sharesAdded entry with no usable price rather than fabricating one', () => {
      const { priceSnapshots } = parsePtaLedgerEntries([
        { date: '2017-03-31', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: 0, gross: 0 },
      ]);
      expect(priceSnapshots).toEqual([]);
    });

    it('creates a matching distributionEvent only for entries whose type names a real distribution', () => {
      const { distributionEvents } = parsePtaLedgerEntries([
        { date: '2022-03-15', type: 'Dividend', destination: 'cash', sharesAdded: 0, rate: 0.5, gross: 50 },
        { date: '2022-06-15', type: 'Long-Term Capital Gain', destination: 'drip', sharesAdded: 2, rate: 1, gross: 200, navPrice: 100 },
        { date: '2022-09-15', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: 3, navPrice: 50 },
        { date: '2022-11-15', type: 'Payroll Contribution Tranche', destination: 'held', sharesAdded: 1, navPrice: 50 },
      ]);
      expect(distributionEvents).toHaveLength(2);
      expect(distributionEvents[0]).toMatchObject({ type: 'dividend', grossAmount: 50, destination: 'cash' });
      expect(distributionEvents[1]).toMatchObject({ type: 'capitalGainDistribution', grossAmount: 200, destination: 'drip', sharesAdded: 2 });
    });

    it('sorts entries by date before classifying, regardless of input order', () => {
      const { lots } = parsePtaLedgerEntries([
        { date: '2020-06-15', type: 'Purchase / Buy', destination: 'held', sharesAdded: 5, navPrice: 110 },
        { date: '2020-01-15', type: 'Purchase / Buy', destination: 'held', sharesAdded: 10, navPrice: 100 },
      ]);
      expect(lots.map((l) => l.date)).toEqual(['2020-01-15', '2020-06-15']);
    });

    it('returns all-empty for missing/non-array input rather than throwing', () => {
      expect(parsePtaLedgerEntries(undefined)).toEqual({ lots: [], distributionEvents: [], priceSnapshots: [], pendingSales: [] });
      expect(parsePtaLedgerEntries(null)).toEqual({ lots: [], distributionEvents: [], priceSnapshots: [], pendingSales: [] });
    });
  });

  describe('parsePtaBackup ledger attachment', () => {
    it('attaches lots/distributionEvents/priceSnapshots/pendingSales from data.ledgers, keyed by raw PTA id', () => {
      const backup = {
        version: 'aura_backup_v2',
        portfolio: [{ id: 'fid-rollover-ira-fselx', symbol: 'FSELX', account: 'Rollover IRA', shares: 100, currentPrice: 50 }],
        ledgers: {
          'fid-rollover-ira-fselx': [
            { date: '2016-01-15', type: 'Purchase / Buy', destination: 'held', sharesAdded: 50, navPrice: 40 },
            { date: '2017-03-31', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: 0, navPrice: 42 },
            { date: '2021-01-31', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: -20, navPrice: 45 },
          ],
        },
      };
      const result = parsePtaBackup(JSON.stringify(backup));
      const h = result.holdings[0];
      expect(h.lots).toHaveLength(1);
      expect(h.priceSnapshots).toHaveLength(1);
      expect(h.pendingSales).toHaveLength(1);
    });

    it('leaves lots/distributionEvents/priceSnapshots/pendingSales empty when the backup has no ledgers key', () => {
      const result = parsePtaBackup(JSON.stringify({ portfolio: [{ symbol: 'AAPL', account: 'Brokerage', shares: 1, currentPrice: 1 }] }));
      const h = result.holdings[0];
      expect(h.lots).toEqual([]);
      expect(h.distributionEvents).toEqual([]);
      expect(h.priceSnapshots).toEqual([]);
      expect(h.pendingSales).toEqual([]);
    });

    it('leaves ledger fields empty for the bare-array input shape (no ledgers possible)', () => {
      const result = parsePtaBackup(JSON.stringify([{ symbol: 'VOO', account: 'Brokerage', shares: 1, currentPrice: 500 }]));
      expect(result.holdings[0].lots).toEqual([]);
    });
  });

  describe('applyTaxTreatments liquidation replay', () => {
    it('replays pendingSales into real Liquidation records with correct realized gain and term', () => {
      const holdings = [{
        symbol: 'FSELX', account: 'Rollover IRA', shares: 0, avgBuyPrice: 0, currentPrice: 60,
        lots: [{ id: 'seed', date: '2016-01-15', shares: 50, pricePerShare: 40, source: 'purchase' }],
        distributionEvents: [], priceSnapshots: [],
        pendingSales: [{ sharesToSell: 20, salePricePerShare: 45, saleDate: '2021-01-31' }],
      }];
      const { holdings: mapped, liquidations } = applyTaxTreatments(holdings, { 'Rollover IRA': 'preTax' });
      expect(liquidations).toHaveLength(1);
      expect(liquidations[0]).toMatchObject({ sharesSold: 20, salePricePerShare: 45, costBasis: 800, realizedGainDollars: 100, termClassification: 'long' });
      expect(getTotalShares(mapped[0])).toBe(30);
    });

    it('synthesizes a labeled openingBalance lot when a sale exceeds the ledger-derived lots on hand', () => {
      const holdings = [{
        symbol: 'FSELX', account: 'Rollover IRA', shares: 0, avgBuyPrice: 0, currentPrice: 60,
        lots: [{ id: 'seed', date: '2020-06-01', shares: 10, pricePerShare: 40, source: 'purchase' }],
        distributionEvents: [], priceSnapshots: [],
        pendingSales: [{ sharesToSell: 9500, salePricePerShare: 16.56, saleDate: '2021-01-31' }],
      }];
      const { holdings: mapped, liquidations } = applyTaxTreatments(holdings, { 'Rollover IRA': 'preTax' });
      expect(liquidations).toHaveLength(1);
      expect(liquidations[0].sharesSold).toBe(9500);
      const openingLot = liquidations[0].lotsSold.find((l) => l.shares === 9490);
      expect(openingLot).toBeTruthy(); // the synthesized 'openingBalance' lot, sized to exactly the 10-share-available / 9500-requested shortfall
      expect(getTotalShares(mapped[0])).toBe(0); // fully consumed by the sale, not left behind as a phantom lot
      expect(mapped[0].lots).toEqual([]);
    });

    it('replays multiple pendingSales in date order against the same accumulating lot set', () => {
      const holdings = [{
        symbol: 'FSELX', account: 'Rollover IRA', shares: 0, avgBuyPrice: 0, currentPrice: 60,
        lots: [
          { id: 'l1', date: '2016-01-15', shares: 50, pricePerShare: 40, source: 'purchase' },
          { id: 'l2', date: '2018-01-15', shares: 20, pricePerShare: 45, source: 'drip' },
        ],
        distributionEvents: [], priceSnapshots: [],
        pendingSales: [
          { sharesToSell: 10, salePricePerShare: 50, saleDate: '2019-01-31' },
          { sharesToSell: 10, salePricePerShare: 55, saleDate: '2020-01-31' },
        ],
      }];
      const { holdings: mapped, liquidations } = applyTaxTreatments(holdings, { 'Rollover IRA': 'preTax' });
      expect(liquidations).toHaveLength(2);
      expect(getTotalShares(mapped[0])).toBe(50);
    });
  });

  describe('getPricedTimeline priceSnapshots merge', () => {
    it('folds zero-share priceSnapshots into the lot-derived timeline, sorted by date', () => {
      const holding = createHolding({
        lots: [{ id: 'l1', date: '2020-01-15', shares: 10, pricePerShare: 40, source: 'purchase' }],
        priceSnapshots: [{ id: 's1', date: '2020-06-15', price: 42, label: 'Statement Ingest' }],
      });
      const timeline = getPricedTimeline(holding);
      expect(timeline).toEqual([
        { date: '2020-01-15', shares: 10, price: 40 },
        { date: '2020-06-15', shares: 0, price: 42 },
      ]);
    });

    it('is unaffected by an empty/missing priceSnapshots array', () => {
      const holding = createHolding({ lots: [{ id: 'l1', date: '2020-01-15', shares: 10, pricePerShare: 40, source: 'purchase' }] });
      expect(getPricedTimeline(holding)).toEqual([{ date: '2020-01-15', shares: 10, price: 40 }]);
    });
  });

  describe('replayPendingSales', () => {
    it('sells shares FIFO against a holding\'s own lots and returns a real Liquidation, not a negative lot', () => {
      const holding = createHolding({
        symbol: 'FSELX', account: 'Rollover IRA', taxTreatment: 'preTax',
        lots: [{ id: 'l1', date: '2016-01-15', shares: 50, pricePerShare: 40, source: 'purchase' }],
      });
      const { holding: updated, liquidations } = replayPendingSales(holding, [
        { sharesToSell: 20, salePricePerShare: 45, saleDate: '2021-01-31' },
      ]);
      expect(liquidations).toHaveLength(1);
      expect(liquidations[0]).toMatchObject({ sharesSold: 20, costBasis: 800, realizedGainDollars: 100 });
      expect(getTotalShares(updated)).toBe(30);
    });

    it('passes a custom notes string through onto the resulting Liquidation record', () => {
      const holding = createHolding({ lots: [{ id: 'l1', date: '2016-01-15', shares: 50, pricePerShare: 40, source: 'purchase' }] });
      const { liquidations } = replayPendingSales(holding, [
        { sharesToSell: 10, salePricePerShare: 45, saleDate: '2021-01-31', notes: 'Closed at last recorded price -- no confirmed sale event.' },
      ]);
      expect(liquidations[0].notes).toBe('Closed at last recorded price -- no confirmed sale event.');
    });

    it('synthesizes an openingBalance lot when a sale exceeds available shares, same as before extraction', () => {
      const holding = createHolding({ lots: [{ id: 'l1', date: '2020-06-01', shares: 10, pricePerShare: 40, source: 'purchase' }] });
      const { holding: updated, liquidations } = replayPendingSales(holding, [
        { sharesToSell: 9500, salePricePerShare: 16.56, saleDate: '2021-01-31' },
      ]);
      expect(liquidations[0].sharesSold).toBe(9500);
      expect(getTotalShares(updated)).toBe(0);
    });

    it('returns the holding unchanged and no liquidations for an empty/missing pendingSales list', () => {
      const holding = createHolding({ lots: [{ id: 'l1', date: '2020-06-01', shares: 10, pricePerShare: 40, source: 'purchase' }] });
      expect(replayPendingSales(holding, [])).toEqual({ holding, liquidations: [] });
      expect(replayPendingSales(holding, undefined)).toEqual({ holding, liquidations: [] });
    });
  });

  describe('isLikelyRealLedger', () => {
    it('accepts a ledger where every entry\'s notes mention a statement date', () => {
      expect(isLikelyRealLedger([
        { notes: 'Fidelity Rollover IRA — statement dated 2016-11-30' },
        { notes: 'Fidelity Rollover IRA — statement dated 2016-12-31' },
      ])).toBe(true);
    });

    it('accepts a ledger where every entry is an explicit Full Liquidation', () => {
      expect(isLikelyRealLedger([{ notes: 'Full Liquidation / Sale executed 2026-08-10' }])).toBe(true);
    });

    it('rejects a ledger with hand-written narrative notes (no "statement dated")', () => {
      expect(isLikelyRealLedger([
        { notes: 'Employer Annual RSU Vest Tranche 1' },
        { notes: 'Employer Annual RSU Vest Tranche 2' },
      ])).toBe(false);
    });

    it('rejects a mixed ledger (not 100% statement-like) -- confirmed bimodal in real data, no partial credit', () => {
      expect(isLikelyRealLedger([
        { notes: 'Fidelity Rollover IRA — statement dated 2016-11-30' },
        { notes: 'Some narrative note' },
      ])).toBe(false);
    });

    it('rejects empty/missing input rather than throwing', () => {
      expect(isLikelyRealLedger([])).toBe(false);
      expect(isLikelyRealLedger(undefined)).toBe(false);
      expect(isLikelyRealLedger(null)).toBe(false);
    });
  });

  describe('parsePtaClosedPositionCandidates', () => {
    const baseData = () => ({
      portfolio: [{ id: 'fid-rollover-ira-fselx', symbol: 'FSELX', account: 'Fidelity Rollover IRA', shares: 100, currentPrice: 50 }],
      ledgers: {},
      closedPositions: [],
    });

    it('builds one candidate per real, ledger-only id not in portfolio or closedPositions', () => {
      const data = baseData();
      data.ledgers['fid-portfolio-advisory-fresx'] = [
        { date: '2021-01-31', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: 100, navPrice: 40, notes: 'Fidelity Portfolio Advisory Services (Managed IRA) — statement dated 2021-01-31' },
        { date: '2022-09-30', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: -20, navPrice: 37.52, notes: 'Fidelity Portfolio Advisory Services (Managed IRA) — statement dated 2022-09-30' },
      ];
      const candidates = parsePtaClosedPositionCandidates(data);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ id: 'fid-portfolio-advisory-fresx', symbol: 'FRESX', account: 'Fidelity Portfolio Advisory Services (Managed IRA)', institution: 'Fidelity', entryCount: 2, source: 'ledger' });
    });

    it('force-closes remaining shares at the last recorded price when the ledger never explicitly zeroes out', () => {
      const data = baseData();
      data.ledgers['fid-portfolio-advisory-fctdx'] = [
        { date: '2021-01-31', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: 100, navPrice: 10, notes: 'Fidelity Portfolio Advisory Services (Managed IRA) — statement dated 2021-01-31' },
        { date: '2023-12-31', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: 50, navPrice: 14.7, notes: 'Fidelity Portfolio Advisory Services (Managed IRA) — statement dated 2023-12-31' },
      ];
      const candidates = parsePtaClosedPositionCandidates(data);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].wasForceClosed).toBe(true);
      const lastLiq = candidates[0].liquidations[candidates[0].liquidations.length - 1];
      expect(lastLiq.sharesSold).toBe(150);
      expect(lastLiq.salePricePerShare).toBe(14.7);
      expect(lastLiq.notes).toMatch(/no confirmed sale event/);
    });

    it('does not force-close when the ledger already reaches zero via an explicit sale entry', () => {
      const data = baseData();
      data.ledgers['fid-secondary-nkla'] = [
        { date: '2024-03-31', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: 7, navPrice: 1, notes: 'Fidelity Account (229-595976) — statement dated 2024-03-31' },
        { date: '2025-01-31', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: -7, navPrice: 0.79, notes: 'Fidelity Account (229-595976) — statement dated 2025-01-31' },
      ];
      const candidates = parsePtaClosedPositionCandidates(data);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].wasForceClosed).toBe(false);
      expect(candidates[0].liquidations).toHaveLength(1);
    });

    it('ignores a ledger-only id whose account is still actively tracked today by a current holding', () => {
      const data = baseData();
      data.portfolio.push({
        id: 'van-401k-fid-div-int-l-com-pl-cl', symbol: 'FID-DIV-INT-L-C', account: 'Vanguard 401(k)',
        shares: 1, currentPrice: 21256.34, lastStatementDateISO: '2026-06-30',
      });
      data.ledgers['van-401k-fid-div-inter-comm-pool'] = [
        { date: '2024-09-30', type: 'Vanguard Statement Ingest', destination: 'held', sharesAdded: 1, navPrice: 15585.46, notes: 'Vanguard 401(k) — statement dated 2024-09-30' },
      ];
      expect(parsePtaClosedPositionCandidates(data)).toEqual([]);
    });

    it('skips a leftover narrative/placeholder ledger entirely (isLikelyRealLedger fails)', () => {
      const data = baseData();
      data.ledgers['ms-amzn'] = [
        { date: '2021-05-15', type: 'RSU Vesting', destination: 'vested', sharesAdded: 30, navPrice: 162.5, notes: 'Employer Annual RSU Vest Tranche 1' },
      ];
      expect(parsePtaClosedPositionCandidates(data)).toEqual([]);
    });

    it('skips an id that is already in data.closedPositions (handled separately by mapPtaClosedPositions)', () => {
      const data = baseData();
      data.closedPositions.push({ id: 'fid-individual-ftexx', symbol: 'FTEXX' });
      data.ledgers['fid-individual-ftexx'] = [
        { date: '2020-07-31', type: 'Full Liquidation / Sale', destination: 'cash', sharesAdded: -849.18, navPrice: 1, notes: 'Full Liquidation / Sale executed 2020-07-31' },
      ];
      expect(parsePtaClosedPositionCandidates(data)).toEqual([]);
    });

    it('never touches holdings -- output has no holdings-shaped side effects', () => {
      const data = baseData();
      data.ledgers['fid-secondary-nklaq'] = [
        { date: '2025-02-28', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: 7, navPrice: 0.5, notes: 'Fidelity Account (229-595976) — statement dated 2025-02-28' },
      ];
      const candidates = parsePtaClosedPositionCandidates(data);
      // The liquidation's holdingId points at the ephemeral holding shell
      // (createHolding always assigns a real id) -- but that shell is
      // discarded and never added to app state, so it can never collide
      // with a real holding's id. The actual "no side effects" guarantee
      // is that data.portfolio itself is left completely untouched.
      expect(candidates[0].liquidations[0].holdingId).toEqual(expect.any(String));
      expect(data.portfolio.map((p) => p.id)).not.toContain(candidates[0].liquidations[0].holdingId);
      expect(data.portfolio).toHaveLength(1);
    });

    it('returns [] for a bare-array input shape (no ledgers/closedPositions possible)', () => {
      expect(parsePtaClosedPositionCandidates([{ symbol: 'AAPL' }])).toEqual([]);
    });
  });

  describe('mapPtaClosedPositions', () => {
    // Field values match the real FTEXX/FSCSX records found in the user's
    // own PTA backup's data.closedPositions -- see this feature's plan for
    // how they were investigated and confirmed genuine.
    const ftexx = {
      id: 'fid-individual-ftexx', symbol: 'FTEXX', name: 'Fidelity Municipal Money Market',
      account: 'Fidelity Individual Brokerage', institution: 'Fidelity', type: 'mutualfund',
      holdingPeriod: 'Nov 2019 – Jul 2020', costBasis: 849.18, sharesSold: 849.18, sellPrice: 1,
      sellDate: '2020-07-31', totalProceeds: 849.18, realizedGain: 0, realizedGainPct: 0,
      destinationNotes: 'Account closed after Jul 2020 — no later statements on file; proceeds destination unconfirmed',
      destinationSymbol: null, lifetimeDivs: 4.39,
    };
    const fscsx = {
      id: 'fid-rollover-ira-fscsx', symbol: 'FSCSX', name: 'Fidelity Select Software & IT Services',
      account: 'Fidelity Rollover IRA', institution: 'Fidelity', type: 'mutualfund',
      holdingPeriod: 'May 2020 – Aug 2026', costBasis: 42316.14, sharesSold: 1926.594, sellPrice: 23.97,
      sellDate: '2026-08-10', totalProceeds: 46180.46, realizedGain: 3864.32, realizedGainPct: 9.13,
      destinationNotes: '100% Rolled into FDVV (724.571 shares @ $63.74)', destinationSymbol: 'FDVV', lifetimeDivs: 1618.33,
    };

    it('maps both real closedPositions records into candidates carrying AP\'s own computed totals', () => {
      const candidates = mapPtaClosedPositions([ftexx, fscsx]);
      expect(candidates).toHaveLength(2);
      const [ftexxCandidate, fscsxCandidate] = candidates;
      expect(ftexxCandidate).toMatchObject({ id: 'fid-individual-ftexx', symbol: 'FTEXX', account: 'Fidelity Individual Brokerage', institution: 'Fidelity', wasForceClosed: false, source: 'closedPositions' });
      expect(ftexxCandidate.liquidations[0]).toMatchObject({ sharesSold: 849.18, salePricePerShare: 1, proceeds: 849.18, costBasis: 849.18, realizedGainDollars: 0, isFullLiquidation: true, purchaseDate: '2019-11-01' });
      expect(fscsxCandidate.liquidations[0]).toMatchObject({ sharesSold: 1926.594, proceeds: 46180.46, realizedGainDollars: 3864.32, termClassification: 'long', purchaseDate: '2020-05-01' });
    });

    it('folds destinationNotes and a positive lifetimeDivs into the liquidation notes text', () => {
      const [candidate] = mapPtaClosedPositions([fscsx]);
      expect(candidate.liquidations[0].notes).toContain('100% Rolled into FDVV');
      expect(candidate.liquidations[0].notes).toContain('Lifetime distributions while held: $1618.33');
    });

    it('classifies term long/short correctly from the parsed holdingPeriod start vs. sellDate', () => {
      const [ftexxCandidate] = mapPtaClosedPositions([ftexx]); // Nov 2019 -> Jul 2020, well under a year
      expect(ftexxCandidate.liquidations[0].termClassification).toBe('short');
      const [fscsxCandidate] = mapPtaClosedPositions([fscsx]); // May 2020 -> Aug 2026, well over a year
      expect(fscsxCandidate.liquidations[0].termClassification).toBe('long');
    });

    it('returns [] for missing/non-array input rather than throwing', () => {
      expect(mapPtaClosedPositions(undefined)).toEqual([]);
      expect(mapPtaClosedPositions(null)).toEqual([]);
    });

    it('skips a malformed entry (no symbol, or zero/missing sharesSold) rather than crashing', () => {
      expect(mapPtaClosedPositions([{ sharesSold: 0, symbol: 'X' }, { symbol: 'AAPL' }, {}])).toEqual([]);
    });
  });

  describe('parsePtaBackup closedPositionCandidates wiring', () => {
    it('includes closedPositionCandidates in its return value, combining ledger-derived and data.closedPositions candidates', () => {
      const backup = {
        version: 'aura_backup_v2',
        portfolio: [{ id: 'fid-rollover-ira-fselx', symbol: 'FSELX', account: 'Rollover IRA', shares: 10, currentPrice: 50 }],
        ledgers: {
          'fid-portfolio-advisory-fresx': [
            { date: '2021-01-31', type: 'Fidelity Statement Ingest', destination: 'held', sharesAdded: 100, navPrice: 40, notes: 'Fidelity Portfolio Advisory Services (Managed IRA) — statement dated 2021-01-31' },
          ],
        },
        closedPositions: [{
          id: 'fid-individual-ftexx', symbol: 'FTEXX', account: 'Fidelity Individual Brokerage', institution: 'Fidelity',
          holdingPeriod: 'Nov 2019 – Jul 2020', costBasis: 849.18, sharesSold: 849.18, sellPrice: 1, sellDate: '2020-07-31',
          totalProceeds: 849.18, realizedGain: 0, realizedGainPct: 0, destinationNotes: 'Account closed', lifetimeDivs: 0,
        }],
      };
      const result = parsePtaBackup(JSON.stringify(backup));
      expect(result.closedPositionCandidates).toHaveLength(2);
      expect(result.closedPositionCandidates.map((c) => c.source).sort()).toEqual(['closedPositions', 'ledger']);
    });

    it('returns an empty closedPositionCandidates array for the bare-array input shape', () => {
      const result = parsePtaBackup(JSON.stringify([{ symbol: 'AAPL', account: 'Brokerage', shares: 1, currentPrice: 1 }]));
      expect(result.closedPositionCandidates).toEqual([]);
    });

    it('returns an empty closedPositionCandidates array when the backup has no ledgers/closedPositions at all', () => {
      const result = parsePtaBackup(JSON.stringify({ portfolio: [{ symbol: 'AAPL', account: 'Brokerage', shares: 1, currentPrice: 1 }] }));
      expect(result.closedPositionCandidates).toEqual([]);
    });
  });

  describe('computeUnrealizedGain', () => {
    it('sums market value and cost basis across all holdings', () => {
      const holdings = [
        createHolding({ shares: 10, avgBuyPrice: 5, currentPrice: 8 }), // cost 50, value 80
        createHolding({ shares: 2, avgBuyPrice: 100, currentPrice: 90 }), // cost 200, value 180
      ];
      const result = computeUnrealizedGain(holdings);
      expect(result.marketValue).toBe(260);
      expect(result.costBasis).toBe(250);
      expect(result.gainDollars).toBe(10);
      expect(result.gainPct).toBeCloseTo(4, 5);
    });

    it('returns gainPct null when there is no cost basis to divide by', () => {
      const result = computeUnrealizedGain([createHolding({ shares: 10, avgBuyPrice: 0, currentPrice: 8 })]);
      expect(result.gainPct).toBeNull();
    });
  });

  describe('calculateHoldingCAGR', () => {
    it('returns null when there is no purchaseDate', () => {
      expect(calculateHoldingCAGR({ avgBuyPrice: 100, currentPrice: 110 })).toBeNull();
    });

    it('returns null when cost basis is not positive', () => {
      expect(calculateHoldingCAGR({ avgBuyPrice: 0, currentPrice: 110, purchaseDate: '2020-01-01' })).toBeNull();
    });

    it('returns null when held under 30 days', () => {
      const purchase = new Date('2026-08-01T00:00:00Z');
      const asOf = new Date(purchase.getTime() + 10 * 86400000);
      expect(calculateHoldingCAGR({ avgBuyPrice: 100, currentPrice: 110, purchaseDate: '2026-08-01' }, asOf)).toBeNull();
    });

    it('annualizes growth over the actual holding period', () => {
      const purchase = new Date('2020-01-01T00:00:00Z');
      const asOf = new Date(purchase.getTime() + 2 * 365.25 * 86400000); // exactly 2 years
      const cagr = calculateHoldingCAGR({ avgBuyPrice: 100, currentPrice: 121, purchaseDate: '2020-01-01' }, asOf);
      expect(cagr).toBeCloseTo(10, 4); // sqrt(1.21) - 1 = 10%
    });

    it('ignores an empty lots array (createHolding\'s default) and uses the flat-field path', () => {
      const purchase = new Date('2020-01-01T00:00:00Z');
      const asOf = new Date(purchase.getTime() + 2 * 365.25 * 86400000);
      const holding = createHolding({ avgBuyPrice: 100, currentPrice: 121, purchaseDate: '2020-01-01' });
      expect(holding.lots).toEqual([]); // pinning the default -- the dispatch guard below depends on this
      expect(calculateHoldingCAGR(holding, asOf)).toBeCloseTo(10, 4);
    });

    it('dispatches to the money-weighted return once a holding has real lots, ignoring the stale flat fields', () => {
      const lotDate = new Date('2019-01-01T00:00:00Z');
      const asOf = new Date(lotDate.getTime() + 1 * 365.25 * 86400000); // exactly 1 year later
      const holding = createHolding({
        // Deliberately wrong/stale flat fields -- if the dispatch fell back
        // to these instead of the lots, the result would be wildly
        // different (a loss, not the lots' actual doubling in a year).
        avgBuyPrice: 9999, purchaseDate: '1999-01-01',
        currentPrice: 20,
        lots: [createLot({ date: lotDate.toISOString().slice(0, 10), shares: 10, pricePerShare: 10 })],
      });
      const cagr = calculateHoldingCAGR(holding, asOf);
      expect(cagr).toBeCloseTo(100, 1); // single lot, doubled in exactly 1 year -> matches the plain-CAGR formula
      expect(cagr).toBeCloseTo(calculateHoldingMoneyWeightedReturn(holding, asOf), 6);
    });
  });

  describe('multi-lot cost basis (getTotalShares / getTotalCostBasis / getWeightedAvgBuyPrice / getEarliestLotDate)', () => {
    it('falls back to the flat fields when there are no lots', () => {
      const holding = createHolding({ shares: 10, avgBuyPrice: 25, purchaseDate: '2022-06-01' });
      expect(getTotalShares(holding)).toBe(10);
      expect(getTotalCostBasis(holding)).toBe(250);
      expect(getEarliestLotDate(holding)).toBe('2022-06-01');
    });

    it('computeYieldOnCost still works from the flat avgBuyPrice even when `shares` is entirely absent from the object (regression: getWeightedAvgBuyPrice must not require a share count in the no-lots path)', () => {
      expect(computeYieldOnCost({ avgBuyPrice: 50, annualDividendPerShare: 2 })).toBeCloseTo(0.04, 5);
    });

    it('sums/weights from lots once present, ignoring the stale flat fields', () => {
      const holding = createHolding({
        shares: 999, avgBuyPrice: 999, purchaseDate: '1999-01-01', // stale, should be ignored
        lots: [
          createLot({ date: '2022-01-01', shares: 10, pricePerShare: 10 }), // $100
          createLot({ date: '2023-01-01', shares: 5, pricePerShare: 20 }), // $100
        ],
      });
      expect(getTotalShares(holding)).toBe(15);
      expect(getTotalCostBasis(holding)).toBe(200);
      expect(getWeightedAvgBuyPrice(holding)).toBeCloseTo(200 / 15, 5);
      expect(getEarliestLotDate(holding)).toBe('2022-01-01');
    });

    it('getEarliestLotDate ignores undated lots and falls back to purchaseDate only if every lot is undated', () => {
      const withOneDated = createHolding({
        purchaseDate: '2019-01-01',
        lots: [createLot({ date: null, shares: 5, pricePerShare: 10 }), createLot({ date: '2021-05-01', shares: 5, pricePerShare: 10 })],
      });
      expect(getEarliestLotDate(withOneDated)).toBe('2021-05-01');

      const allUndated = createHolding({
        purchaseDate: '2019-01-01',
        lots: [createLot({ date: null, shares: 5, pricePerShare: 10 })],
      });
      expect(getEarliestLotDate(allUndated)).toBe('2019-01-01');
    });

    it('getWeightedAvgBuyPrice returns 0 (not NaN) when lots exist but sum to 0 shares', () => {
      const holding = createHolding({ lots: [createLot({ date: '2022-01-01', shares: 0, pricePerShare: 10 })] });
      expect(getWeightedAvgBuyPrice(holding)).toBe(0);
    });
  });

  describe('calculateLotCAGR / getLotTermClassification', () => {
    it('annualizes a single lot the same way calculateHoldingCAGR does', () => {
      const lotDate = new Date('2020-01-01T00:00:00Z');
      const asOf = new Date(lotDate.getTime() + 2 * 365.25 * 86400000); // exactly 2 years -- same construction as the calculateHoldingCAGR fixture above, so day-count rounding matches exactly
      const cagr = calculateLotCAGR({ date: '2020-01-01', pricePerShare: 100 }, 121, asOf);
      expect(cagr).toBeCloseTo(10, 4); // sqrt(1.21) - 1 = 10%
    });

    it('returns null for a missing date, non-positive price, or under 30 days held', () => {
      const asOf = new Date('2026-08-16T00:00:00Z');
      expect(calculateLotCAGR({ date: null, pricePerShare: 10 }, 12, asOf)).toBeNull();
      expect(calculateLotCAGR({ date: '2020-01-01', pricePerShare: 0 }, 12, asOf)).toBeNull();
      expect(calculateLotCAGR({ date: '2026-08-01', pricePerShare: 10 }, 12, new Date('2026-08-10T00:00:00Z'))).toBeNull();
    });

    it('classifies long-term (>1yr) vs short-term (<=1yr) by the same threshold IRS Pub 550 uses', () => {
      const asOf = new Date('2026-08-16T00:00:00Z');
      expect(getLotTermClassification({ date: '2025-01-01' }, asOf)).toBe('long');
      expect(getLotTermClassification({ date: '2026-06-01' }, asOf)).toBe('short');
      expect(getLotTermClassification({ date: null }, asOf)).toBeNull();
    });
  });

  describe('computeLotBreakdown', () => {
    it('builds one row per lot with cost basis, market value, gain, term, and defaults an invalid source to purchase', () => {
      const asOf = new Date('2026-08-16T00:00:00Z');
      // createLot always mints its own fresh id (ignores any `id` passed in
      // overrides, same as createHolding) -- capture the real objects first
      // rather than asserting against hand-picked ids.
      const lot2025 = createLot({ date: '2025-01-01', shares: 10, pricePerShare: 10, source: 'drip' });
      const lot2020 = createLot({ date: '2020-01-01', shares: 5, pricePerShare: 20, source: 'not-a-real-source' });
      const holding = createHolding({ currentPrice: 15, lots: [lot2025, lot2020] }); // intentionally out of date order
      const rows = computeLotBreakdown(holding, asOf);
      // Sorted oldest-first regardless of input order.
      expect(rows.map((r) => r.id)).toEqual([lot2020.id, lot2025.id]);
      expect(rows[0]).toMatchObject({ shares: 5, pricePerShare: 20, costBasis: 100, marketValue: 75, source: 'purchase', term: 'long' });
      expect(rows[0].gainDollars).toBe(-25);
      expect(rows[1]).toMatchObject({ shares: 10, pricePerShare: 10, costBasis: 100, marketValue: 150, source: 'drip' });
    });

    it('returns an empty array for a holding with no lots', () => {
      expect(computeLotBreakdown(createHolding({}))).toEqual([]);
    });
  });

  describe('calculateHoldingMoneyWeightedReturn (XIRR across lots)', () => {
    it('returns null when there are no lots, or no lot has a valid dated positive share count', () => {
      expect(calculateHoldingMoneyWeightedReturn(createHolding({}))).toBeNull();
      expect(calculateHoldingMoneyWeightedReturn(createHolding({ lots: [createLot({ date: null, shares: 5, pricePerShare: 10 })] }))).toBeNull();
      expect(calculateHoldingMoneyWeightedReturn(createHolding({ lots: [createLot({ date: '2026-08-01', shares: 0, pricePerShare: 10 })] }))).toBeNull();
    });

    it('returns null when held under 30 days (measured from the earliest lot)', () => {
      const asOf = new Date('2026-08-10T00:00:00Z');
      const holding = createHolding({ currentPrice: 12, lots: [createLot({ date: '2026-08-01', shares: 10, pricePerShare: 10 })] });
      expect(calculateHoldingMoneyWeightedReturn(holding, asOf)).toBeNull();
    });

    it('solves a real two-lot case against a hand-computed expected rate', () => {
      // Two equal $100 lots, 2 years and 1 year before asOf respectively,
      // growing to a combined $300. Solving the XIRR equation by hand:
      // -100 - 100/(1+r) + 300/(1+r)^2 = 0 -- with x = 1/(1+r), this is
      // 3x^2 - x - 1 = 0, giving x = (1 + sqrt(13)) / 6, r = 1/x - 1.
      const asOf = new Date('2026-01-01T00:00:00Z');
      const twoYearsAgo = new Date(asOf.getTime() - 2 * 365.25 * 86400000);
      const oneYearAgo = new Date(asOf.getTime() - 1 * 365.25 * 86400000);
      const holding = createHolding({
        currentPrice: 15, // 20 total shares * $15 = $300
        lots: [
          createLot({ date: twoYearsAgo.toISOString().slice(0, 10), shares: 10, pricePerShare: 10 }),
          createLot({ date: oneYearAgo.toISOString().slice(0, 10), shares: 10, pricePerShare: 10 }),
        ],
      });
      const x = (1 + Math.sqrt(13)) / 6;
      const expectedRatePct = (1 / x - 1) * 100;
      expect(calculateHoldingMoneyWeightedReturn(holding, asOf)).toBeCloseTo(expectedRatePct, 1);
    });

    it('is not the same as naively averaging the two lots\' own individual CAGRs (confirms this is a real money-weighted solve, not a shortcut)', () => {
      const asOf = new Date('2026-01-01T00:00:00Z');
      const twoYearsAgo = new Date(asOf.getTime() - 2 * 365.25 * 86400000);
      const oneYearAgo = new Date(asOf.getTime() - 1 * 365.25 * 86400000);
      const lots = [
        createLot({ date: twoYearsAgo.toISOString().slice(0, 10), shares: 10, pricePerShare: 10 }),
        createLot({ date: oneYearAgo.toISOString().slice(0, 10), shares: 10, pricePerShare: 10 }),
      ];
      const holding = createHolding({ currentPrice: 15, lots });
      const moneyWeighted = calculateHoldingMoneyWeightedReturn(holding, asOf);
      const naiveAverage = (calculateLotCAGR(lots[0], 15, asOf) + calculateLotCAGR(lots[1], 15, asOf)) / 2;
      expect(Math.abs(moneyWeighted - naiveAverage)).toBeGreaterThan(1);
    });
  });

  describe('compoundBenchmarkGrowth / compoundBenchmarkCAGR', () => {
    it('returns null for a missing or invalid start date', () => {
      expect(compoundBenchmarkGrowth(SP500_ANNUAL_RETURN_PCT, SP500_YTD_RETURN_PCT, null)).toBeNull();
      expect(compoundBenchmarkGrowth(SP500_ANNUAL_RETURN_PCT, SP500_YTD_RETURN_PCT, 'not-a-date')).toBeNull();
    });

    it('returns null for a start date in the future relative to endDate', () => {
      const asOf = new Date('2020-01-01T00:00:00Z');
      expect(compoundBenchmarkGrowth(SP500_ANNUAL_RETURN_PCT, SP500_YTD_RETURN_PCT, '2021-01-01', asOf)).toBeNull();
    });

    it('compounds a simple synthetic table across a roughly full calendar year', () => {
      const table = { 2021: 10 };
      const growth = compoundBenchmarkGrowth(table, 10, '2021-01-01', new Date('2022-01-01T00:00:00Z'));
      // ~10% growth for the (almost entirely full) 2021 year -- the linear
      // day-count approximation means this isn't exactly 1.10.
      expect(growth).toBeGreaterThan(1.09);
      expect(growth).toBeLessThan(1.10);
    });

    it('CAGR is null for a window under 30 days', () => {
      const cagr = compoundBenchmarkCAGR(SP500_ANNUAL_RETURN_PCT, SP500_YTD_RETURN_PCT, '2026-08-01', new Date('2026-08-10T00:00:00Z'));
      expect(cagr).toBeNull();
    });
  });

  describe('computeAnalytics', () => {
    it('excludes holdings with no purchaseDate from rows but keeps qualifying ones', () => {
      const asOf = new Date('2026-08-16T00:00:00Z');
      const holdings = [
        createHolding({ symbol: 'AAA', shares: 10, avgBuyPrice: 100, currentPrice: 150, purchaseDate: '2023-01-01' }),
        createHolding({ symbol: 'BBB', shares: 5, avgBuyPrice: 50, currentPrice: 60 }), // no purchaseDate
      ];
      const result = computeAnalytics(holdings, asOf);
      expect(result.totalCount).toBe(2);
      expect(result.qualifyingCount).toBe(1);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].symbol).toBe('AAA');
      expect(result.rows[0].cagr).toBeGreaterThan(0);
      expect(result.weightedPortfolioCAGR).toBeCloseTo(result.rows[0].cagr, 5);
    });

    it('returns nulls and empty rows when no holdings qualify', () => {
      const result = computeAnalytics([createHolding({ shares: 1, avgBuyPrice: 10, currentPrice: 12 })]);
      expect(result.rows).toEqual([]);
      expect(result.weightedPortfolioCAGR).toBeNull();
      expect(result.weightedSpyCAGR).toBeNull();
    });
  });

  describe('computeBenchmarkTrajectory', () => {
    it('returns null when no holding has a dated cash flow (no purchaseDate or lots)', () => {
      const result = computeBenchmarkTrajectory([createHolding({ shares: 10, avgBuyPrice: 10, currentPrice: 12 })]);
      expect(result).toBeNull();
    });

    it('returns null when the only dated holding was purchased this same year (not enough points to plot)', () => {
      const asOf = new Date('2026-06-01T00:00:00Z');
      const result = computeBenchmarkTrajectory(
        [createHolding({ shares: 10, avgBuyPrice: 100, currentPrice: 120, purchaseDate: '2026-01-01' })],
        asOf
      );
      expect(result).toBeNull();
    });

    it('builds one point per calendar year from purchase through asOfDate for a single legacy holding', () => {
      const asOf = new Date('2022-06-15T00:00:00Z');
      const holding = createHolding({ shares: 10, avgBuyPrice: 100, currentPrice: 200, purchaseDate: '2020-01-01' });
      const result = computeBenchmarkTrajectory([holding], asOf);
      expect(result).not.toBeNull();
      expect(result.points.map((p) => p.year)).toEqual([2020, 2021, 2022]);
      // Invested is the same $1,000 at every point -- one lump-sum contribution, no new money added later.
      result.points.forEach((p) => expect(p.invested).toBeCloseTo(1000, 5));
      expect(result.totalInvested).toBeCloseTo(1000, 5);
      expect(result.portfolioValueToday).toBeCloseTo(2000, 5); // 10 shares * $200
      expect(result.portfolioGainPct).toBeCloseTo(100, 5); // doubled

      // Cross-check the 2020 year-end SPY point against compoundBenchmarkGrowth directly.
      const cutoff2020 = new Date(Date.UTC(2020, 11, 31));
      const expectedGrowth2020 = compoundBenchmarkGrowth(SP500_ANNUAL_RETURN_PCT, SP500_YTD_RETURN_PCT, '2020-01-01', cutoff2020);
      const point2020 = result.points.find((p) => p.year === 2020);
      expect(point2020.spyValue).toBeCloseTo(1000 * expectedGrowth2020, 5);
    });

    it('accumulates invested $ as new lots are added in later years, and sums across holdings', () => {
      const asOf = new Date('2022-01-15T00:00:00Z');
      const holdingWithLots = createHolding({
        shares: 0,
        currentPrice: 50,
        lots: [
          createLot({ date: '2019-06-01', shares: 10, pricePerShare: 50 }), // $500
          createLot({ date: '2021-03-01', shares: 10, pricePerShare: 50 }), // $500
        ],
      });
      const legacyHolding = createHolding({ shares: 5, avgBuyPrice: 20, currentPrice: 20, purchaseDate: '2020-01-01' }); // $100
      const undatedHolding = createHolding({ shares: 100, avgBuyPrice: 0, currentPrice: 3 }); // no purchaseDate -- $300 value, no cash-flow event

      const result = computeBenchmarkTrajectory([holdingWithLots, legacyHolding, undatedHolding], asOf);
      expect(result).not.toBeNull();
      expect(result.points.map((p) => p.year)).toEqual([2019, 2020, 2021, 2022]);

      const byYear = Object.fromEntries(result.points.map((p) => [p.year, p.invested]));
      expect(byYear[2019]).toBeCloseTo(500, 5); // just the first lot
      expect(byYear[2020]).toBeCloseTo(600, 5); // + legacy holding's $100
      expect(byYear[2021]).toBeCloseTo(1100, 5); // + second lot's $500
      expect(byYear[2022]).toBeCloseTo(1100, 5); // no new contributions

      // portfolioValueToday includes every holding's current market value, even the
      // undated one that never contributed a cash-flow event to the trajectory itself.
      expect(result.portfolioValueToday).toBeCloseTo(1000 + 100 + 300, 5); // 20*50 + 5*20 + 100*3
    });

    it('computes alpha vs SPY/QQQ as the portfolio gain % minus the benchmark gain % over the same cash-flow schedule', () => {
      const asOf = new Date('2022-06-15T00:00:00Z');
      const holding = createHolding({ shares: 10, avgBuyPrice: 100, currentPrice: 200, purchaseDate: '2020-01-01' });
      const result = computeBenchmarkTrajectory([holding], asOf);
      expect(result.alphaVsSpy).toBeCloseTo(result.portfolioGainPct - result.spyGainPct, 5);
      expect(result.alphaVsQqq).toBeCloseTo(result.portfolioGainPct - result.qqqGainPct, 5);
      // Sanity: QQQ and SPY gain figures should each independently match a direct
      // compoundBenchmarkGrowth call from the purchase date to asOf.
      const directSpyGrowth = compoundBenchmarkGrowth(SP500_ANNUAL_RETURN_PCT, SP500_YTD_RETURN_PCT, '2020-01-01', asOf);
      const directQqqGrowth = compoundBenchmarkGrowth(NASDAQ100_ANNUAL_RETURN_PCT, NASDAQ100_YTD_RETURN_PCT, '2020-01-01', asOf);
      expect(result.spyGainPct).toBeCloseTo((directSpyGrowth - 1) * 100, 5);
      expect(result.qqqGainPct).toBeCloseTo((directQqqGrowth - 1) * 100, 5);
    });
  });

  describe('computeYieldOnCost', () => {
    it('divides annualDividendPerShare by avgBuyPrice', () => {
      expect(computeYieldOnCost({ avgBuyPrice: 50, annualDividendPerShare: 2 })).toBeCloseTo(0.04, 5);
    });
    it('returns null (not 0) when there is no cost basis', () => {
      expect(computeYieldOnCost({ avgBuyPrice: 0, annualDividendPerShare: 2 })).toBeNull();
    });
  });

  describe('computePerPaymentIncome', () => {
    it('splits annual income by paymentsPerYear for a fixed-cadence frequency', () => {
      const holding = { shares: 100, annualDividendPerShare: 4, dividendFrequency: 'quarterly' };
      expect(computePerPaymentIncome(holding)).toBeCloseTo(100, 5); // 400/4
    });
    it('returns null for irregular frequency rather than guessing an even split', () => {
      expect(computePerPaymentIncome({ shares: 100, annualDividendPerShare: 4, dividendFrequency: 'irregular' })).toBeNull();
    });
    it('returns null for unspecified/missing frequency', () => {
      expect(computePerPaymentIncome({ shares: 100, annualDividendPerShare: 4 })).toBeNull();
    });
  });

  describe('paymentsPerYearForFrequency / isValidDividendFrequency / isValidDistributionCharacter', () => {
    it('maps known frequencies to a payments-per-year count', () => {
      expect(paymentsPerYearForFrequency('monthly')).toBe(12);
      expect(paymentsPerYearForFrequency('quarterly')).toBe(4);
      expect(paymentsPerYearForFrequency('semiAnnual')).toBe(2);
      expect(paymentsPerYearForFrequency('annual')).toBe(1);
    });
    it('returns null for irregular/unspecified/unknown frequencies', () => {
      expect(paymentsPerYearForFrequency('irregular')).toBeNull();
      expect(paymentsPerYearForFrequency('unspecified')).toBeNull();
      expect(paymentsPerYearForFrequency('not-a-real-frequency')).toBeNull();
    });
    it('validates frequency and distribution-character values', () => {
      expect(isValidDividendFrequency('quarterly')).toBe(true);
      expect(isValidDividendFrequency('bogus')).toBe(false);
      expect(isValidDistributionCharacter('qualifiedDividend')).toBe(true);
      expect(isValidDistributionCharacter('bogus')).toBe(false);
    });
  });

  describe('computeDividendTotalsByCharacter', () => {
    it('sums annual dividend income into the correct distribution-character bucket', () => {
      const holdings = [
        createHolding({ shares: 100, annualDividendPerShare: 1, distributionCharacter: 'qualifiedDividend' }), // 100
        createHolding({ shares: 50, annualDividendPerShare: 2, distributionCharacter: 'ltcg' }), // 100
        createHolding({ shares: 10, annualDividendPerShare: 5 }), // 50, defaults to 'unspecified'
      ];
      const totals = computeDividendTotalsByCharacter(holdings);
      expect(totals.qualifiedDividend).toBe(100);
      expect(totals.ltcg).toBe(100);
      expect(totals.unspecified).toBe(50);
      expect(totals.total).toBe(250);
    });

    it('treats an unrecognized distributionCharacter as unspecified rather than dropping it', () => {
      const totals = computeDividendTotalsByCharacter([
        { shares: 10, annualDividendPerShare: 1, distributionCharacter: 'not-a-real-character' },
      ]);
      expect(totals.unspecified).toBe(10);
      expect(totals.total).toBe(10);
    });

    it('returns all zeros for an empty list', () => {
      const totals = computeDividendTotalsByCharacter([]);
      expect(totals.total).toBe(0);
      expect(totals.qualifiedDividend).toBe(0);
    });
  });

  describe('computeRebalancePlan', () => {
    it('excludes holdings with no targetAllocationPct from rows, but counts them toward totalValue', () => {
      const holdings = [
        createHolding({ symbol: 'AAA', shares: 10, currentPrice: 50, targetAllocationPct: 50 }), // $500
        createHolding({ symbol: 'BBB', shares: 10, currentPrice: 50 }), // $500, no target
      ];
      const plan = computeRebalancePlan(holdings);
      expect(plan.totalValue).toBe(1000);
      expect(plan.totalCount).toBe(2);
      expect(plan.targetedCount).toBe(1);
      expect(plan.untargetedCount).toBe(1);
      expect(plan.rows).toHaveLength(1);
      expect(plan.rows[0].symbol).toBe('AAA');
    });

    it('flags a holding under its target as "buy" and over its target as "sell"', () => {
      const holdings = [
        createHolding({ symbol: 'UNDER', shares: 1, currentPrice: 100, targetAllocationPct: 50 }), // $100 current, wants $450 (50% of 900)
        createHolding({ symbol: 'OVER', shares: 8, currentPrice: 100, targetAllocationPct: 50 }), // $800 current, wants $450
      ];
      const plan = computeRebalancePlan(holdings);
      expect(plan.totalValue).toBe(900);
      const under = plan.rows.find((r) => r.symbol === 'UNDER');
      const over = plan.rows.find((r) => r.symbol === 'OVER');
      expect(under.action).toBe('buy');
      expect(under.diffDollars).toBeCloseTo(350, 5); // 450 target - 100 current
      expect(under.diffShares).toBeCloseTo(3.5, 5); // 350 / $100
      expect(over.action).toBe('sell');
      expect(over.diffDollars).toBeCloseTo(-350, 5); // 450 target - 800 current
    });

    it('treats a holding within the drift band as "balanced" rather than buy/sell', () => {
      // Exactly on target: current % == target %.
      const holdings = [
        createHolding({ symbol: 'ONTARGET', shares: 5, currentPrice: 100, targetAllocationPct: 100 }),
      ];
      const plan = computeRebalancePlan(holdings);
      expect(plan.rows[0].action).toBe('balanced');
      expect(plan.rows[0].diffDollars).toBeCloseTo(0, 5);
    });

    it('returns null diffShares (not a guess) when a targeted holding has no current price', () => {
      const holdings = [createHolding({ symbol: 'NOPRICE', shares: 10, currentPrice: 0, targetAllocationPct: 100 })];
      const plan = computeRebalancePlan(holdings);
      expect(plan.rows[0].diffShares).toBeNull();
    });

    it('flags isValidTotal correctly based on whether set targets sum to ~100%', () => {
      const validHoldings = [
        createHolding({ symbol: 'A', shares: 1, currentPrice: 100, targetAllocationPct: 60 }),
        createHolding({ symbol: 'B', shares: 1, currentPrice: 100, targetAllocationPct: 40 }),
      ];
      expect(computeRebalancePlan(validHoldings).isValidTotal).toBe(true);
      expect(computeRebalancePlan(validHoldings).targetPctSum).toBe(100);

      const invalidHoldings = [
        createHolding({ symbol: 'A', shares: 1, currentPrice: 100, targetAllocationPct: 60 }),
        createHolding({ symbol: 'B', shares: 1, currentPrice: 100, targetAllocationPct: 30 }),
      ];
      expect(computeRebalancePlan(invalidHoldings).isValidTotal).toBe(false);
      expect(computeRebalancePlan(invalidHoldings).targetPctSum).toBe(90);
    });

    it('treats an explicit target of 0 as a real target (included in rows), unlike null/undefined', () => {
      const holdings = [createHolding({ symbol: 'ZERO', shares: 1, currentPrice: 100, targetAllocationPct: 0 })];
      const plan = computeRebalancePlan(holdings);
      expect(plan.targetedCount).toBe(1);
      expect(plan.rows[0].action).toBe('sell'); // wants $0, has $100
    });

    it('returns empty rows and zero totals for an empty holdings list', () => {
      const plan = computeRebalancePlan([]);
      expect(plan.rows).toEqual([]);
      expect(plan.totalValue).toBe(0);
      expect(plan.targetPctSum).toBe(0);
    });
  });

  describe('selectLotsForSale (FIFO)', () => {
    it('returns null when requesting more shares than the holding has', () => {
      const holding = createHolding({ shares: 5, avgBuyPrice: 10 });
      expect(selectLotsForSale(holding, 10)).toBeNull();
    });

    it('returns null for a non-positive share count', () => {
      const holding = createHolding({ shares: 5, avgBuyPrice: 10 });
      expect(selectLotsForSale(holding, 0)).toBeNull();
      expect(selectLotsForSale(holding, -1)).toBeNull();
    });

    it('falls back to the flat shares/avgBuyPrice as one implicit lot when there are no real lots', () => {
      const holding = createHolding({ shares: 10, avgBuyPrice: 20, purchaseDate: '2020-01-01' });
      const selection = selectLotsForSale(holding, 4);
      expect(selection.sharesSold).toBe(4);
      expect(selection.costBasis).toBeCloseTo(80, 5); // 4 * $20
      expect(selection.consumed).toHaveLength(1);
      expect(selection.consumed[0].date).toBe('2020-01-01');
    });

    it('consumes the oldest lot first and splits a lot when the sale only partially drains it', () => {
      const holding = createHolding({
        shares: 0,
        lots: [
          createLot({ date: '2021-01-01', shares: 5, pricePerShare: 10 }), // oldest
          createLot({ date: '2019-01-01', shares: 5, pricePerShare: 8 }), // actually oldest by date
          createLot({ date: '2022-01-01', shares: 5, pricePerShare: 15 }), // newest
        ],
      });
      // Sell 7 shares: should drain the 2019 lot (5 sh @ $8) fully, then 2 sh from the 2021 lot (@ $10).
      const selection = selectLotsForSale(holding, 7);
      expect(selection.sharesSold).toBe(7);
      expect(selection.costBasis).toBeCloseTo(5 * 8 + 2 * 10, 5); // 40 + 20 = 60
      expect(selection.consumed).toHaveLength(2);
      expect(selection.consumed[0].date).toBe('2019-01-01');
      expect(selection.consumed[0].shares).toBe(5);
      expect(selection.consumed[1].date).toBe('2021-01-01');
      expect(selection.consumed[1].shares).toBe(2);
    });
  });

  describe('computeLiquidationPreview', () => {
    it('returns null when the sale cannot be filled', () => {
      const holding = createHolding({ shares: 1, avgBuyPrice: 10, currentPrice: 12 });
      expect(computeLiquidationPreview(holding, { sharesToSell: 5, salePricePerShare: 12 })).toBeNull();
    });

    it('computes proceeds, cost basis, and realized gain/loss for a simple flat holding', () => {
      const holding = createHolding({ shares: 10, avgBuyPrice: 20, purchaseDate: '2020-01-01' });
      const preview = computeLiquidationPreview(holding, {
        sharesToSell: 10,
        salePricePerShare: 30,
        saleDate: new Date('2022-06-01T00:00:00Z'),
      });
      expect(preview.proceeds).toBeCloseTo(300, 5);
      expect(preview.costBasis).toBeCloseTo(200, 5);
      expect(preview.realizedGainDollars).toBeCloseTo(100, 5);
      expect(preview.realizedGainPct).toBeCloseTo(50, 5);
      expect(preview.isFullLiquidation).toBe(true);
      expect(preview.termClassification).toBe('long'); // held > 1 year
    });

    it('classifies a sale as "mixed" when it draws from both a long-term and a short-term lot', () => {
      const saleDate = new Date('2022-06-01T00:00:00Z');
      const holding = createHolding({
        shares: 0,
        currentPrice: 50,
        lots: [
          createLot({ date: '2020-01-01', shares: 5, pricePerShare: 10 }), // long-term as of saleDate
          createLot({ date: '2022-01-01', shares: 5, pricePerShare: 40 }), // short-term as of saleDate
        ],
      });
      const preview = computeLiquidationPreview(holding, { sharesToSell: 10, salePricePerShare: 50, saleDate });
      expect(preview.termClassification).toBe('mixed');
      expect(preview.lotsSold.find((l) => l.date === '2020-01-01').term).toBe('long');
      expect(preview.lotsSold.find((l) => l.date === '2022-01-01').term).toBe('short');
    });

    it('flags isFullLiquidation false for a partial sale', () => {
      const holding = createHolding({ shares: 10, avgBuyPrice: 20, purchaseDate: '2020-01-01' });
      const preview = computeLiquidationPreview(holding, { sharesToSell: 3, salePricePerShare: 30, saleDate: new Date('2022-01-01') });
      expect(preview.isFullLiquidation).toBe(false);
    });
  });

  describe('createLiquidation', () => {
    it('returns null when the underlying preview is null (insufficient shares)', () => {
      const holding = createHolding({ shares: 1, avgBuyPrice: 10 });
      expect(createLiquidation(holding, { sharesToSell: 5, salePricePerShare: 10 })).toBeNull();
    });

    it('snapshots symbol/account/taxTreatment onto the record rather than only storing a holdingId reference', () => {
      const holding = createHolding({ symbol: 'AAA', account: 'Rollover IRA', taxTreatment: 'preTax', shares: 5, avgBuyPrice: 10, purchaseDate: '2020-01-01' });
      const liq = createLiquidation(holding, { sharesToSell: 5, salePricePerShare: 12, saleDate: new Date('2022-01-01') });
      expect(liq.holdingId).toBe(holding.id);
      expect(liq.symbol).toBe('AAA');
      expect(liq.account).toBe('Rollover IRA');
      expect(liq.taxTreatment).toBe('preTax');
      expect(liq.saleDate).toBe('2022-01-01');
      expect(typeof liq.id).toBe('string');
      expect(liq.id).not.toBe(holding.id);
    });

    it('snapshots purchaseDate from the flat holding field when there are no lots', () => {
      const holding = createHolding({ symbol: 'AAA', shares: 5, avgBuyPrice: 10, purchaseDate: '2020-01-01' });
      const liq = createLiquidation(holding, { sharesToSell: 5, salePricePerShare: 12, saleDate: new Date('2022-01-01') });
      expect(liq.purchaseDate).toBe('2020-01-01');
    });

    it('snapshots purchaseDate as the earliest lot date when the holding tracks lots', () => {
      const holding = createHolding({
        symbol: 'AAA',
        shares: 0,
        currentPrice: 50,
        lots: [
          createLot({ date: '2021-06-01', shares: 5, pricePerShare: 10 }),
          createLot({ date: '2019-03-15', shares: 5, pricePerShare: 8 }),
        ],
      });
      const liq = createLiquidation(holding, { sharesToSell: 10, salePricePerShare: 50, saleDate: new Date('2022-06-01') });
      expect(liq.purchaseDate).toBe('2019-03-15');
    });
  });

  describe('applyLiquidationToHolding', () => {
    it('reduces flat shares for a no-lots holding and flags full liquidation at exactly zero remaining', () => {
      const holding = createHolding({ shares: 10, avgBuyPrice: 20, purchaseDate: '2020-01-01' });
      const liq = createLiquidation(holding, { sharesToSell: 10, salePricePerShare: 30, saleDate: new Date('2022-01-01') });
      const { updatedHolding, isFullyLiquidated } = applyLiquidationToHolding(holding, liq);
      expect(updatedHolding.shares).toBe(0);
      expect(isFullyLiquidated).toBe(true);
    });

    it('partial sale on a flat holding leaves remaining shares and is not a full liquidation', () => {
      const holding = createHolding({ shares: 10, avgBuyPrice: 20, purchaseDate: '2020-01-01' });
      const liq = createLiquidation(holding, { sharesToSell: 4, salePricePerShare: 30, saleDate: new Date('2022-01-01') });
      const { updatedHolding, isFullyLiquidated } = applyLiquidationToHolding(holding, liq);
      expect(updatedHolding.shares).toBeCloseTo(6, 5);
      expect(isFullyLiquidated).toBe(false);
    });

    it('depletes only the consumed lots (fully removing a drained lot, shrinking a partially-drained one)', () => {
      const holding = createHolding({
        id: 'h1',
        shares: 0,
        currentPrice: 50,
        lots: [
          createLot({ date: '2019-01-01', shares: 5, pricePerShare: 8 }),
          createLot({ date: '2021-01-01', shares: 5, pricePerShare: 10 }),
        ],
      });
      const liq = createLiquidation(holding, { sharesToSell: 7, salePricePerShare: 50, saleDate: new Date('2022-06-01') });
      const { updatedHolding, isFullyLiquidated } = applyLiquidationToHolding(holding, liq);
      expect(isFullyLiquidated).toBe(false);
      expect(updatedHolding.lots).toHaveLength(1);
      expect(updatedHolding.lots[0].date).toBe('2021-01-01');
      expect(updatedHolding.lots[0].shares).toBeCloseTo(3, 5); // 5 - 2 sold
    });

    it('selling every share across every lot fully liquidates the holding (no lots left)', () => {
      const holding = createHolding({
        id: 'h1',
        shares: 0,
        currentPrice: 50,
        lots: [
          createLot({ date: '2019-01-01', shares: 5, pricePerShare: 8 }),
          createLot({ date: '2021-01-01', shares: 5, pricePerShare: 10 }),
        ],
      });
      const liq = createLiquidation(holding, { sharesToSell: 10, salePricePerShare: 50, saleDate: new Date('2022-06-01') });
      const { updatedHolding, isFullyLiquidated } = applyLiquidationToHolding(holding, liq);
      expect(isFullyLiquidated).toBe(true);
      expect(updatedHolding.lots).toHaveLength(0);
    });
  });

  describe('sanitizeImportedLiquidations', () => {
    it('filters out non-objects and entries missing a string id', () => {
      const result = sanitizeImportedLiquidations([
        { id: 'liq-1', symbol: 'AAA' },
        null,
        'not-an-object',
        { symbol: 'BBB' }, // no id
        { id: 42, symbol: 'CCC' }, // id not a string
      ]);
      expect(result).toEqual([{ id: 'liq-1', symbol: 'AAA' }]);
    });

    it('returns an empty array for non-array input', () => {
      expect(sanitizeImportedLiquidations(null)).toEqual([]);
      expect(sanitizeImportedLiquidations(undefined)).toEqual([]);
      expect(sanitizeImportedLiquidations({})).toEqual([]);
    });
  });

  describe('distribution event ledger', () => {
    it('createHolding defaults dripEnabled to true and distributionEvents to an empty array', () => {
      const holding = createHolding({ symbol: 'AAA' });
      expect(holding.dripEnabled).toBe(true);
      expect(holding.distributionEvents).toEqual([]);
    });

    it('createHolding accepts overrides for dripEnabled/distributionEvents', () => {
      const events = [createDistributionEvent({ date: '2026-01-01', grossAmount: 5 })];
      const holding = createHolding({ symbol: 'AAA', dripEnabled: false, distributionEvents: events });
      expect(holding.dripEnabled).toBe(false);
      expect(holding.distributionEvents).toBe(events);
    });

    it('isValidDistributionEventType / isValidDistributionDestination validate against their enums', () => {
      for (const t of DISTRIBUTION_EVENT_TYPES) expect(isValidDistributionEventType(t.value)).toBe(true);
      expect(isValidDistributionEventType('not-a-type')).toBe(false);
      for (const d of DISTRIBUTION_DESTINATIONS) expect(isValidDistributionDestination(d.value)).toBe(true);
      expect(isValidDistributionDestination('not-a-destination')).toBe(false);
    });

    it('createDistributionEvent fills in sane defaults and always mints a fresh id, ignoring any id override', () => {
      const ev = createDistributionEvent({ id: 'ignored', date: '2026-03-01' });
      expect(ev.id).not.toBe('ignored');
      expect(ev.date).toBe('2026-03-01');
      expect(ev.type).toBe('dividend');
      expect(ev.ratePerShare).toBe(0);
      expect(ev.grossAmount).toBe(0);
      expect(ev.destination).toBe('cash');
      expect(ev.sharesAdded).toBe(0);
      expect(ev.navPrice).toBeNull();
      expect(ev.notes).toBe('');
    });

    it('computeLifetimeDistributions sums grossAmount across all logged events, ignoring a holding with none', () => {
      const noEvents = createHolding({ symbol: 'AAA' });
      expect(computeLifetimeDistributions(noEvents)).toBe(0);

      const withEvents = createHolding({
        symbol: 'BBB',
        distributionEvents: [
          createDistributionEvent({ date: '2025-03-31', grossAmount: 12.5 }),
          createDistributionEvent({ date: '2025-06-30', grossAmount: 13.1 }),
        ],
      });
      expect(computeLifetimeDistributions(withEvents)).toBeCloseTo(25.6, 5);
    });

    it('computeLifetimeDistributions counts reinvestment lots too, across every year', () => {
      // The reported BAGIX/FSELX shape: everything reinvested, nothing
      // logged. This read $0 while the DRIP lots sat in the same modal.
      const reinvestOnly = createHolding({ symbol: 'BAGIX' });
      reinvestOnly.lots = [
        createLot({ date: '2025-08-01', shares: 100, pricePerShare: 9.5, source: 'drip' }),
        createLot({ date: '2026-08-01', shares: 10, pricePerShare: 9.66, source: 'drip' }),
      ];
      expect(computeLifetimeDistributions(reinvestOnly)).toBeCloseTo(1046.6, 4);
    });

    it('computeLifetimeDistributions ignores purchase lots and does not double-count a logged DRIP', () => {
      const holding = createHolding({ symbol: 'AAA' });
      holding.lots = [
        createLot({ date: '2024-01-02', shares: 500, pricePerShare: 10, source: 'purchase' }), // not income
        createLot({ date: '2025-03-31', shares: 5, pricePerShare: 20, source: 'drip' }),       // the logged one
      ];
      holding.distributionEvents = [
        createDistributionEvent({ date: '2025-03-31', grossAmount: 100, destination: 'drip', sharesAdded: 5 }),
      ];
      expect(computeLifetimeDistributions(holding)).toBeCloseTo(100, 5);
    });
  });

  describe('computeProjectedPayoutSchedule', () => {
    it('returns [] for unspecified/irregular frequency, or a non-positive annualDividendPerShare, rather than guessing', () => {
      const unspecified = createHolding({ symbol: 'AAA', dividendFrequency: 'unspecified', annualDividendPerShare: 4 });
      expect(computeProjectedPayoutSchedule(unspecified, { year: 2026 })).toEqual([]);

      const irregular = createHolding({ symbol: 'AAA', dividendFrequency: 'irregular', annualDividendPerShare: 4 });
      expect(computeProjectedPayoutSchedule(irregular, { year: 2026 })).toEqual([]);

      const zeroDividend = createHolding({ symbol: 'AAA', dividendFrequency: 'quarterly', annualDividendPerShare: 0 });
      expect(computeProjectedPayoutSchedule(zeroDividend, { year: 2026 })).toEqual([]);
    });

    it('splits a quarterly holding\'s annual dividend/share evenly across 4 quarter-end dates', () => {
      const holding = createHolding({ symbol: 'AAA', shares: 10, dividendFrequency: 'quarterly', annualDividendPerShare: 4 });
      const schedule = computeProjectedPayoutSchedule(holding, { year: 2026 });
      expect(schedule).toHaveLength(4);
      expect(schedule.map((ev) => ev.date)).toEqual(['2026-03-31', '2026-06-30', '2026-09-30', '2026-12-31']);
      for (const ev of schedule) {
        expect(ev.estimated).toBe(true);
        expect(ev.estRatePerShare).toBeCloseTo(1, 5); // $4/yr / 4 payments
        expect(ev.estGrossAmount).toBeCloseTo(10, 5); // 10 shares * $1
      }
      // Sums back to the full annual income, same source of truth
      // computeAnnualDividendIncome uses.
      const total = schedule.reduce((sum, ev) => sum + ev.estGrossAmount, 0);
      expect(total).toBeCloseTo(computeAnnualDividendIncome(holding), 5);
    });

    it('produces 12 evenly-spaced payments for a monthly holding and 1 for an annual holding', () => {
      const monthly = createHolding({ symbol: 'AAA', shares: 1, dividendFrequency: 'monthly', annualDividendPerShare: 12 });
      expect(computeProjectedPayoutSchedule(monthly, { year: 2026 })).toHaveLength(12);

      const annual = createHolding({ symbol: 'BBB', shares: 1, dividendFrequency: 'annual', annualDividendPerShare: 5 });
      const annualSchedule = computeProjectedPayoutSchedule(annual, { year: 2026 });
      expect(annualSchedule).toHaveLength(1);
      expect(annualSchedule[0].date).toBe('2026-12-31');
      expect(annualSchedule[0].estGrossAmount).toBeCloseTo(5, 5);
    });

    it('never projects a payment for a month before the position was acquired', () => {
      // Bought in September -- March and June payments would be income the
      // user provably never received.
      const bought = createHolding({
        symbol: 'AAA', shares: 10, dividendFrequency: 'quarterly', annualDividendPerShare: 4,
        purchaseDate: '2026-09-05',
      });
      const schedule = computeProjectedPayoutSchedule(bought, { year: 2026 });
      expect(schedule.map((ev) => ev.date)).toEqual(['2026-09-30', '2026-12-31']);
    });

    it('uses the earliest LOT date, not purchaseDate, once lots exist', () => {
      const holding = createHolding({
        symbol: 'AAA', dividendFrequency: 'quarterly', annualDividendPerShare: 4,
        purchaseDate: '2026-11-01',
      });
      holding.lots = [
        createLot({ date: '2026-06-02', shares: 6, pricePerShare: 10 }),
        createLot({ date: '2026-09-10', shares: 4, pricePerShare: 12 }),
      ];
      const schedule = computeProjectedPayoutSchedule(holding, { year: 2026 });
      // June is kept (the earliest lot predates it); March is not.
      expect(schedule.map((ev) => ev.date)).toEqual(['2026-06-30', '2026-09-30', '2026-12-31']);
    });

    it('projects the whole year when the acquisition date is unknown', () => {
      const holding = createHolding({ symbol: 'AAA', shares: 10, dividendFrequency: 'quarterly', annualDividendPerShare: 4 });
      expect(holding.purchaseDate).toBeNull();
      expect(computeProjectedPayoutSchedule(holding, { year: 2026 })).toHaveLength(4);
    });


    it('defaults year to the year of asOfDate when not given', () => {
      const holding = createHolding({ symbol: 'AAA', shares: 1, dividendFrequency: 'annual', annualDividendPerShare: 5 });
      const schedule = computeProjectedPayoutSchedule(holding, { asOfDate: new Date('2030-05-01T00:00:00Z') });
      expect(schedule[0].date).toBe('2030-12-31');
    });
  });

  describe('trailing twelve months', () => {
    const asOfDate = new Date('2026-06-15T00:00:00Z');

    it('spans the twelve COMPLETE months ending last month, crossing the year end', () => {
      const keys = trailingTwelveMonthKeys(asOfDate);
      expect(keys).toHaveLength(12);
      expect(keys[0]).toBe('2025-06');
      expect(keys[11]).toBe('2026-05');
      expect(keys).not.toContain('2026-06'); // the month in progress
    });

    it('gives the matrix a column that is complete where the calendar ones are partial', () => {
      const h = createHolding({ symbol: 'AAA', shares: 100, annualDividendPerShare: 2 });
      h.distributionEvents = [
        createDistributionEvent({ date: '2025-12-15', type: 'capitalGainDistribution', grossAmount: 900 }),
        createDistributionEvent({ date: '2026-02-15', type: 'dividend', grossAmount: 100 }),
        createDistributionEvent({ date: '2025-03-15', type: 'dividend', grossAmount: 500 }), // before the window
      ];
      const res = computeDistributionMatrix([h], { asOfDate });
      // Trailing picks up December AND February -- neither calendar column
      // holds both.
      expect(res.totals.trailing12).toBeCloseTo(1000, 5);
      expect(res.totals.thisYear).toBeCloseTo(100, 5);
      expect(res.totals.lastFullYear).toBeCloseTo(1400, 5);
    });
  });

  describe('computeRetirementIncomeBases', () => {
    const asOfDate = new Date('2026-06-15T00:00:00Z');
    const fund = () => createHolding({ symbol: 'AAA', shares: 100, currentPrice: 50, annualDividendPerShare: 2 });

    it('separates recurring income from capital gains and return of capital', () => {
      const h = fund();
      h.distributionEvents = [
        createDistributionEvent({ date: '2025-09-15', type: 'dividend', grossAmount: 300 }),
        createDistributionEvent({ date: '2026-01-15', type: 'interest', grossAmount: 100 }),
        createDistributionEvent({ date: '2025-12-15', type: 'capitalGainDistribution', grossAmount: 5000 }),
        createDistributionEvent({ date: '2026-02-15', type: 'returnOfCapital', grossAmount: 50 }),
      ];
      const bases = computeRetirementIncomeBases([h], { asOfDate });
      expect(bases.estimate).toBeCloseTo(200, 5);
      expect(bases.ttmRecurring).toBeCloseTo(400, 5);
      expect(bases.capitalGains).toBeCloseTo(5000, 5);
      expect(bases.returnOfCapital).toBeCloseTo(50, 5);
      expect(bases.ttmAll).toBeCloseTo(5450, 5);
    });

    it('resolves the chosen basis, and NEVER projects $0 for a portfolio with no history', () => {
      const bare = computeRetirementIncomeBases([fund()], { asOfDate });
      expect(bare.hasTrailingHistory).toBe(false);
      // Falling through to the estimate rather than zeroing someone's
      // retirement coverage because they have logged nothing yet.
      expect(resolveRetirementIncomeBasis(bare, 'ttmRecurring')).toBeCloseTo(200, 5);
      expect(resolveRetirementIncomeBasis(bare, 'ttmAll')).toBeCloseTo(200, 5);

      const h = fund();
      h.distributionEvents = [createDistributionEvent({ date: '2025-09-15', type: 'dividend', grossAmount: 300 })];
      const bases = computeRetirementIncomeBases([h], { asOfDate });
      expect(resolveRetirementIncomeBasis(bases, 'estimate')).toBeCloseTo(200, 5);
      expect(resolveRetirementIncomeBasis(bases, 'ttmRecurring')).toBeCloseTo(300, 5);
      expect(resolveRetirementIncomeBasis(bases, 'ttmAll')).toBeCloseTo(300, 5);
      // An unknown choice is the estimate, not a crash.
      expect(resolveRetirementIncomeBasis(bases, 'nonsense')).toBeCloseTo(200, 5);
      expect(resolveRetirementIncomeBasis(null, 'ttmAll')).toBe(0);
    });

    it('a Return of Capital fund\'s payments logged as dividends are not recurring income (changelog 205)', () => {
      const h = createHolding({ symbol: 'YMAX', distributionCharacter: 'returnOfCapital' });
      h.distributionEvents = [createDistributionEvent({ date: '2026-03-06', type: 'dividend', grossAmount: 40 })];
      const b = computeRetirementIncomeBases([h], { asOfDate: new Date('2026-06-15T00:00:00Z') });
      expect(b.ttmRecurring).toBe(0);
      expect(b.returnOfCapital).toBeCloseTo(40, 5);
      expect(b.ttmAll).toBeCloseTo(40, 5);
    });

    it('ignores anything outside the trailing window', () => {
      const h = fund();
      h.distributionEvents = [createDistributionEvent({ date: '2026-06-02', type: 'dividend', grossAmount: 999 })];
      // June is the month in progress -- a partial month must not set the
      // forward assumption.
      expect(computeRetirementIncomeBases([h], { asOfDate }).ttmRecurring).toBe(0);
    });
  });

  describe('computeDistributionMatrix', () => {
    const asOfDate = new Date('2026-06-15T00:00:00Z');
    const row = (res, id) => res.rows.find((r) => r.id === id);

    it('puts the ESTIMATE in the row the holding\'s Character names, since a dividend rate has no type of its own', () => {
      const h = createHolding({ symbol: 'AAA', shares: 100, annualDividendPerShare: 2, distributionCharacter: 'qualifiedDividend' });
      const res = computeDistributionMatrix([h], { asOfDate });
      expect(row(res, 'qualifiedDividend').estimated).toBeCloseTo(200, 5);
      expect(row(res, 'unspecified')).toBeUndefined(); // empty rows are not rendered
    });

    it("lets a distribution event's OWN type beat the holding's character", () => {
      const h = createHolding({ symbol: 'AAA', shares: 100, annualDividendPerShare: 2, distributionCharacter: 'qualifiedDividend' });
      h.distributionEvents = [createDistributionEvent({ date: '2025-12-15', type: 'capitalGainDistribution', grossAmount: 900 })];
      const res = computeDistributionMatrix([h], { asOfDate });
      expect(row(res, 'capitalGainDistribution').lastFullYear).toBeCloseTo(900, 5);
      expect(row(res, 'qualifiedDividend').lastFullYear).toBe(0);
      // ...and a capital gain lands on the character's TERM when it states one.
      h.distributionCharacter = 'ltcg';
      expect(row(computeDistributionMatrix([h], { asOfDate }), 'ltcg').lastFullYear).toBeCloseTo(900, 5);
    });

    it('falls back to the character for a reinvestment lot, which carries no type at all', () => {
      const h = createHolding({ symbol: 'AAA', distributionCharacter: 'ltcg' });
      h.lots = [createLot({ date: '2026-04-30', shares: 10, pricePerShare: 50, source: 'drip' })];
      expect(row(computeDistributionMatrix([h], { asOfDate }), 'ltcg').thisYear).toBeCloseTo(500, 5);
    });

    it('sorts a payment logged only as a Dividend or Other by the holding\'s character -- return of capital included (changelog 205)', () => {
      // The YMAX case: character set to Return of Capital, weekly payments
      // logged as dividends, and the matrix said "Kind not stated".
      const h = createHolding({ symbol: 'YMAX', distributionCharacter: 'returnOfCapital' });
      h.distributionEvents = [
        createDistributionEvent({ date: '2026-03-06', type: 'dividend', grossAmount: 5 }),
        createDistributionEvent({ date: '2026-03-13', type: 'other', grossAmount: 3 }),
      ];
      const res = computeDistributionMatrix([h], { asOfDate });
      expect(row(res, 'returnOfCapital').thisYear).toBeCloseTo(8, 5);
      expect(row(res, 'unspecified')).toBeUndefined();
      expect(res.totals.thisYearIncome).toBe(0);
      for (const character of ['ordinaryDividend', 'ltcg', 'mixed', 'qualifiedDividend']) {
        h.distributionCharacter = character;
        expect(row(computeDistributionMatrix([h], { asOfDate }), character).thisYear).toBeCloseTo(8, 5);
      }
      // With no character, it is still honestly unstated.
      h.distributionCharacter = 'unspecified';
      expect(row(computeDistributionMatrix([h], { asOfDate }), 'unspecified').thisYear).toBeCloseTo(8, 5);
      // The event's own specific type still wins over the character.
      h.distributionCharacter = 'returnOfCapital';
      h.distributionEvents = [createDistributionEvent({ date: '2026-03-06', type: 'interest', grossAmount: 5 })];
      expect(row(computeDistributionMatrix([h], { asOfDate }), 'interest').thisYear).toBeCloseTo(5, 5);
    });

    it('keeps return of capital OUT of the income totals while still reporting it', () => {
      const h = createHolding({ symbol: 'AAA', shares: 100, annualDividendPerShare: 2 });
      h.distributionEvents = [
        createDistributionEvent({ date: '2025-06-01', type: 'dividend', grossAmount: 300 }),
        createDistributionEvent({ date: '2025-12-01', type: 'returnOfCapital', grossAmount: 700 }),
      ];
      const res = computeDistributionMatrix([h], { asOfDate });
      expect(row(res, 'returnOfCapital').isIncome).toBe(false);
      expect(res.totals.lastFullYear).toBeCloseTo(1000, 5);
      expect(res.totals.lastFullYearIncome).toBeCloseTo(300, 5);
    });

    it('separates the year in progress from the last complete year', () => {
      const h = createHolding({ symbol: 'AAA' });
      h.distributionEvents = [
        createDistributionEvent({ date: '2026-02-01', type: 'dividend', grossAmount: 11 }),
        createDistributionEvent({ date: '2025-02-01', type: 'dividend', grossAmount: 22 }),
        createDistributionEvent({ date: '2024-02-01', type: 'dividend', grossAmount: 99 }),
      ];
      const res = computeDistributionMatrix([h], { asOfDate });
      expect(res.thisYear).toBe(2026);
      expect(res.lastFullYear).toBe(2025);
      expect(res.totals.thisYear).toBeCloseTo(11, 5);
      expect(res.totals.lastFullYear).toBeCloseTo(22, 5);
    });

    it('drops rows with nothing in them, and reports market value for the yield column', () => {
      const h = createHolding({ symbol: 'AAA', shares: 100, currentPrice: 25, annualDividendPerShare: 1 });
      const res = computeDistributionMatrix([h], { asOfDate });
      expect(res.marketValue).toBeCloseTo(2500, 5);
      expect(res.rows.every((r) => r.estimated > 0 || r.thisYear > 0 || r.lastFullYear > 0)).toBe(true);
      expect(computeDistributionMatrix([], { asOfDate }).rows).toEqual([]);
    });
  });

  describe('sumActualDistributions', () => {
    it('totals logged payments and reinvestment lots across the portfolio', () => {
      const a = createHolding({ symbol: 'AAA' });
      a.distributionEvents = [createDistributionEvent({ date: '2026-02-10', grossAmount: 100 })];
      const b = createHolding({ symbol: 'BBB' });
      b.lots = [createLot({ date: '2026-04-30', shares: 10, pricePerShare: 57.82, source: 'drip' })];
      expect(sumActualDistributions([a, b], 2026)).toBeCloseTo(678.2, 4);
    });

    it('INCLUDES the month in progress, unlike the chart', () => {
      // The chart leaves an in-progress month on its estimate so a
      // part-finished month is not drawn as a dip; a "received this year"
      // total has no such reason to hold anything back.
      const h = createHolding({ symbol: 'AAA' });
      h.distributionEvents = [
        createDistributionEvent({ date: '2026-02-10', grossAmount: 100 }),
        createDistributionEvent({ date: '2026-06-05', grossAmount: 50 }),
      ];
      expect(sumActualDistributions([h], 2026)).toBeCloseTo(150, 5);
      // ...while the chart's June row stays estimated mid-June.
      const rows = computeRollingDividendTimeline([h], { asOfDate: new Date('2026-06-15T00:00:00Z') });
      expect(rows.find((r) => r.key === '2026-06').basis).toBe('estimated');
    });

    it('ignores other years and an empty portfolio', () => {
      const h = createHolding({ symbol: 'AAA' });
      h.distributionEvents = [createDistributionEvent({ date: '2025-02-10', grossAmount: 100 })];
      expect(sumActualDistributions([h], 2026)).toBe(0);
      expect(sumActualDistributions([], 2026)).toBe(0);
    });
  });

  describe('findUnspecifiedLots', () => {
    it('counts only unspecified lots, grouped by holding, biggest first', () => {
      const a = createHolding({ symbol: 'AAA' });
      a.lots = [
        createLot({ date: '2026-01-02', shares: 1, pricePerShare: 10, source: 'unspecified' }),
        createLot({ date: '2026-02-02', shares: 1, pricePerShare: 10, source: 'purchase' }),
        createLot({ date: '2026-03-02', shares: 1, pricePerShare: 10, source: 'drip' }),
      ];
      const b = createHolding({ symbol: 'BBB' });
      b.lots = [
        createLot({ date: '2026-01-02', shares: 1, pricePerShare: 10, source: 'unspecified' }),
        createLot({ date: '2026-02-02', shares: 1, pricePerShare: 10, source: 'unspecified' }),
      ];
      const { total, byHolding } = findUnspecifiedLots([a, b]);
      expect(total).toBe(3);
      expect(byHolding.map((r) => [r.symbol, r.count])).toEqual([['BBB', 2], ['AAA', 1]]);
      expect(byHolding[0].holdingId).toBe(b.id);
    });

    it('omits a holding once every lot is labeled, and reports nothing for a clean portfolio', () => {
      const clean = createHolding({ symbol: 'AAA' });
      clean.lots = [createLot({ date: '2026-01-02', shares: 1, pricePerShare: 10, source: 'drip' })];
      expect(findUnspecifiedLots([clean])).toEqual({ total: 0, byHolding: [] });
      expect(findUnspecifiedLots([createHolding({ symbol: 'BBB' })])).toEqual({ total: 0, byHolding: [] });
      expect(findUnspecifiedLots([])).toEqual({ total: 0, byHolding: [] });
    });
  });

  describe('computeCashReserveFromHoldings', () => {
    const cash = (over) => createHolding({ symbol: 'SPAXX', taxTreatment: 'taxable', shares: 1000, currentPrice: 1, ...over });

    it('totals Taxable-account cash equivalents and reports which holdings they are', () => {
      const h = cash();
      const res = computeCashReserveFromHoldings([h]);
      expect(res.total).toBeCloseTo(1000, 5);
      expect(res.holdingIds).toEqual([h.id]);
    });

    it('EXCLUDES cash inside Pre-Tax, Roth and HSA -- the floor is already-taxed money', () => {
      // calculator.js draws the floor before any account and never taxes
      // it. Cash in a Pre-Tax account is an ordinary-income event the
      // Pre-Tax bucket already models; counting it here would spend it
      // twice and tax it never.
      const sheltered = ['preTax', 'roth', 'hsa'].map((t) => cash({ taxTreatment: t }));
      const res = computeCashReserveFromHoldings(sheltered);
      expect(res.total).toBe(0);
      expect(res.holdingIds).toEqual([]);
    });

    it('follows the EFFECTIVE asset class -- a guessed money-market fund counts, and an explicit override wins', () => {
      // SPAXX is guessed 'cash' with no assetClass set at all.
      expect(computeCashReserveFromHoldings([cash({ assetClass: null })]).total).toBeCloseTo(1000, 5);
      // ...and a user who says it is something else is believed.
      expect(computeCashReserveFromHoldings([cash({ assetClass: 'bond' })]).total).toBe(0);
      // A holding the guesser would call stock, marked cash by hand, counts.
      expect(computeCashReserveFromHoldings([cash({ symbol: 'AAPL', assetClass: 'cash' })]).total).toBeCloseTo(1000, 5);
    });

    it('honours excludeHoldingIds, so a concentrated position is never claimed twice', () => {
      const h = cash();
      expect(computeCashReserveFromHoldings([h], { excludeHoldingIds: [h.id] }).total).toBe(0);
    });

    it('skips a holding with no market value rather than listing it for netting', () => {
      // Netting out a $0 holding would achieve nothing and put a confusing
      // id in the exclusion list.
      const res = computeCashReserveFromHoldings([cash({ currentPrice: 0 })]);
      expect(res.total).toBe(0);
      expect(res.holdingIds).toEqual([]);
    });

    it('returns an empty reserve for an empty or missing portfolio', () => {
      expect(computeCashReserveFromHoldings([])).toEqual({ total: 0, holdingIds: [] });
      expect(computeCashReserveFromHoldings(null)).toEqual({ total: 0, holdingIds: [] });
    });
  });

  describe('migrateDistributionCharacters', () => {
    // 'stcg' was a category error: a fund's short-term capital gains are
    // reported on 1099-DIV in Box 1a as ordinary dividends, not in Box 2a
    // as capital gains, so there was never a separate line to model.
    it('no longer offers Short-Term Capital Gain Distribution as a choice', () => {
      expect(DISTRIBUTION_CHARACTERS.map((d) => d.value)).not.toContain('stcg');
      // Long-term stays: Box 2a is real.
      expect(DISTRIBUTION_CHARACTERS.map((d) => d.value)).toContain('ltcg');
    });

    it('remaps a holding tagged stcg to ordinary dividends, where the 1099 puts it', () => {
      // NOT to 'unspecified': that is where an invalid value would fall
      // through to, and it would look like the app had lost the answer.
      const h = createHolding({ symbol: 'AAA' });
      h.distributionCharacter = 'stcg';
      const { holdings, changed } = migrateDistributionCharacters([h]);
      expect(changed).toBe(true);
      expect(holdings[0].distributionCharacter).toBe('ordinaryDividend');
    });

    it('is idempotent and leaves every other character alone', () => {
      const kept = DISTRIBUTION_CHARACTERS.map((d) => {
        const h = createHolding({ symbol: d.value });
        h.distributionCharacter = d.value;
        return h;
      });
      const first = migrateDistributionCharacters(kept);
      expect(first.changed).toBe(false);
      expect(first.holdings).toBe(kept);
      // Running it twice over migrated data changes nothing further.
      const h = createHolding({ symbol: 'AAA' });
      h.distributionCharacter = 'stcg';
      const once = migrateDistributionCharacters([h]);
      expect(migrateDistributionCharacters(once.holdings).changed).toBe(false);
    });

    it('handles a missing or non-array portfolio', () => {
      expect(migrateDistributionCharacters(null)).toEqual({ holdings: [], changed: false });
      expect(migrateDistributionCharacters([]).changed).toBe(false);
    });
  });

  describe('canSyncFromHoldings', () => {
    // The guard that stops a holdings->plan link zeroing a plan when the
    // holdings are gone: cleared storage, a parse failure (loadHoldings
    // returns [] rather than throwing), or an entitlement lapse if reads
    // were ever gated the way mutations are.
    it('refuses to sync from an empty or unreadable portfolio', () => {
      expect(canSyncFromHoldings([])).toBe(false);
      expect(canSyncFromHoldings(null)).toBe(false);
      expect(canSyncFromHoldings(undefined)).toBe(false);
      expect(canSyncFromHoldings('not an array')).toBe(false);
    });

    it('allows a portfolio that has holdings, even one worth nothing yet', () => {
      // A holding with no price is still a statement of what you own; the
      // guard is about ABSENT data, not zero data.
      expect(canSyncFromHoldings([createHolding({ symbol: 'AAA' })])).toBe(true);
      expect(canSyncFromHoldings([createHolding({ symbol: 'AAA', shares: 10, currentPrice: 50 })])).toBe(true);
    });
  });

  describe('retractGuessedLotSources', () => {
    it("turns inherited 'drip' labels into 'unspecified' so a funding history stops reading as income", () => {
      const h = createHolding({ symbol: 'BAGIX' });
      h.lots = [
        createLot({ date: '2020-01-02', shares: 100, pricePerShare: 9, source: 'purchase' }),
        createLot({ date: '2026-08-01', shares: 775.571, pricePerShare: 9.66, source: 'drip' }),
      ];
      const { holdings, changed } = retractGuessedLotSources([h]);
      expect(changed).toBe(true);
      expect(holdings[0].lots.map((l) => l.source)).toEqual(['purchase', 'unspecified']);
      // And it no longer counts as income.
      expect(computeLifetimeDistributions(holdings[0])).toBe(0);
    });

    it('does NOT lose a reinvestment the user actually logged -- the event still carries it', () => {
      const h = createHolding({ symbol: 'AAA' });
      h.distributionEvents = [createDistributionEvent({
        date: '2026-03-31', grossAmount: 100, destination: 'drip', sharesAdded: 5,
      })];
      h.lots = [createLot({ date: '2026-03-31', shares: 5, pricePerShare: 20, source: 'drip' })];
      const { holdings } = retractGuessedLotSources([h]);
      expect(holdings[0].lots[0].source).toBe('unspecified');
      expect(computeLifetimeDistributions(holdings[0])).toBeCloseTo(100, 5);
    });

    it('leaves purchase and openingBalance lots alone, and reports no change when there is nothing to retract', () => {
      const h = createHolding({ symbol: 'AAA' });
      h.lots = [
        createLot({ date: '2020-01-02', shares: 10, pricePerShare: 5, source: 'purchase' }),
        createLot({ date: '2020-01-02', shares: 3, pricePerShare: 5, source: 'openingBalance' }),
      ];
      const { holdings, changed } = retractGuessedLotSources([h]);
      expect(changed).toBe(false);
      expect(holdings[0]).toBe(h);
      expect(holdings[0].lots.map((l) => l.source)).toEqual(['purchase', 'openingBalance']);
    });

    it('handles holdings with no lots and a non-array input', () => {
      expect(retractGuessedLotSources([createHolding({ symbol: 'AAA' })]).changed).toBe(false);
      expect(retractGuessedLotSources(null).holdings).toEqual([]);
    });
  });

  describe('collectActualDistributions', () => {
    it('counts a DRIP lot as the payment that bought it (shares x reinvestment price)', () => {
      const holding = createHolding({ symbol: 'FSELX' });
      holding.lots = [createLot({ date: '2026-04-30', shares: 10, pricePerShare: 57.82, source: 'drip' })];
      const recs = collectActualDistributions(holding, 2026);
      expect(recs).toHaveLength(1);
      expect(recs[0]).toMatchObject({ date: '2026-04-30', from: 'dripLot' });
      expect(recs[0].amount).toBeCloseTo(578.2, 5);
    });

    it('ignores lots that are not DRIP -- a purchase is not income', () => {
      const holding = createHolding({ symbol: 'AAA' });
      holding.lots = [
        createLot({ date: '2026-04-30', shares: 10, pricePerShare: 50, source: 'purchase' }),
        createLot({ date: '2026-05-31', shares: 2, pricePerShare: 50, source: 'drip' }),
      ];
      const recs = collectActualDistributions(holding, 2026);
      expect(recs.map((r) => r.date)).toEqual(['2026-05-31']);
    });

    it('does NOT double-count a logged DRIP distribution and the lot it created', () => {
      const holding = createHolding({ symbol: 'AAA' });
      // handleLogDistributionEvent appends both of these for one payment.
      holding.distributionEvents = [createDistributionEvent({
        date: '2026-04-30', grossAmount: 500, destination: 'drip', sharesAdded: 5, navPrice: 100,
      })];
      holding.lots = [createLot({ date: '2026-04-30', shares: 5, pricePerShare: 100, source: 'drip' })];
      const recs = collectActualDistributions(holding, 2026);
      expect(recs).toHaveLength(1);
      expect(recs[0].from).toBe('event');
      expect(recs[0].amount).toBeCloseTo(500, 5);
    });

    it('keeps a DRIP lot whose date or share count no event claims', () => {
      const holding = createHolding({ symbol: 'AAA' });
      holding.distributionEvents = [createDistributionEvent({
        date: '2026-04-30', grossAmount: 500, destination: 'drip', sharesAdded: 5,
      })];
      holding.lots = [
        createLot({ date: '2026-04-30', shares: 9, pricePerShare: 100, source: 'drip' }), // different shares
        createLot({ date: '2026-07-31', shares: 5, pricePerShare: 100, source: 'drip' }), // different date
      ];
      expect(collectActualDistributions(holding, 2026)).toHaveLength(3);
    });

    it('skips a DRIP lot with no usable price or share count rather than counting $0', () => {
      const holding = createHolding({ symbol: 'AAA' });
      holding.lots = [
        createLot({ date: '2026-04-30', shares: 5, pricePerShare: 0, source: 'drip' }),
        createLot({ date: '2026-05-31', shares: 0, pricePerShare: 100, source: 'drip' }),
      ];
      expect(collectActualDistributions(holding, 2026)).toEqual([]);
    });

    it('ignores other years', () => {
      const holding = createHolding({ symbol: 'AAA' });
      holding.lots = [createLot({ date: '2025-04-30', shares: 5, pricePerShare: 100, source: 'drip' })];
      expect(collectActualDistributions(holding, 2026)).toEqual([]);
    });
  });

  describe('computeRollingDividendTimeline', () => {
    // $4/share/yr, 10 shares, quarterly -> $10 estimated in Mar/Jun/Sep/Dec.
    const quarterly = () => createHolding({
      symbol: 'AAA', shares: 10, dividendFrequency: 'quarterly', annualDividendPerShare: 4,
    });
    // Mid-June 2026: the window runs 2025-06 .. 2026-11, everything before
    // 2026-06 settled.
    const asOfDate = new Date('2026-06-15T00:00:00Z');
    const rowFor = (rows, key) => rows.find((r) => r.key === key);
    const run = (holdings) => computeRollingDividendTimeline(holdings, { asOfDate });

    it('spans twelve completed months, the month in progress, and five ahead', () => {
      const rows = run([quarterly()]);
      expect(rows).toHaveLength(18);
      expect(rows[0].key).toBe('2025-06');
      expect(rows[11].key).toBe('2026-05');
      expect(rows[12].key).toBe('2026-06');
      expect(rows[17].key).toBe('2026-11');
      expect(rows.filter((r) => r.settled)).toHaveLength(12);
    });

    it('crosses the year boundary, which a Jan-Dec view could not', () => {
      const holding = quarterly();
      holding.distributionEvents = [createDistributionEvent({ date: '2025-12-10', grossAmount: 42 })];
      const december = rowFor(run([holding]), '2025-12');
      expect(december.basis).toBe('actual');
      expect(december.value).toBeCloseTo(42, 5);
      // ...and its estimate came from the 2025 projection, not 2026's.
      expect(december.estValue).toBeCloseTo(10, 5);
    });

    it('shows a settled month with logged payments as actual, not as the estimate', () => {
      const holding = quarterly();
      holding.distributionEvents = [
        createDistributionEvent({ date: '2026-03-10', grossAmount: 6 }),
        createDistributionEvent({ date: '2026-03-28', grossAmount: 5 }),
      ];
      const march = rowFor(run([holding]), '2026-03');
      expect(march.basis).toBe('actual');
      expect(march.value).toBeCloseTo(11, 5);
      expect(march.count).toBe(2);
      expect(march.estValue).toBeCloseTo(10, 5);
    });

    it('leaves a settled month with an EMPTY ledger on the estimate rather than reporting $0', () => {
      const march = rowFor(run([quarterly()]), '2026-03');
      expect(march.basis).toBe('estimated');
      expect(march.value).toBeCloseTo(10, 5);
      expect(march.actualValue).toBe(0);
    });

    it('keeps the month IN PROGRESS estimated even when payments are already logged in it', () => {
      const holding = quarterly();
      holding.distributionEvents = [createDistributionEvent({ date: '2026-06-02', grossAmount: 7 })];
      const june = rowFor(run([holding]), '2026-06');
      expect(june.basis).toBe('estimated');
      expect(june.value).toBeCloseTo(10, 5);
      expect(june.actualValue).toBeCloseTo(7, 5);
    });

    it('never marks a future month actual', () => {
      const holding = quarterly();
      holding.distributionEvents = [createDistributionEvent({ date: '2026-09-30', grossAmount: 99 })];
      expect(rowFor(run([holding]), '2026-09').basis).toBe('estimated');
    });

    it('counts every distribution type', () => {
      const holding = quarterly();
      holding.distributionEvents = [
        createDistributionEvent({ date: '2026-03-10', type: 'dividend', grossAmount: 4 }),
        createDistributionEvent({ date: '2026-03-11', type: 'capitalGainDistribution', grossAmount: 3 }),
        createDistributionEvent({ date: '2026-03-12', type: 'returnOfCapital', grossAmount: 2 }),
      ];
      const march = rowFor(run([holding]), '2026-03');
      expect(march.actualValue).toBeCloseTo(9, 5);
      expect(march.actualCount).toBe(3);
    });

    it('ignores anything outside the window entirely', () => {
      const holding = quarterly();
      holding.distributionEvents = [createDistributionEvent({ date: '2025-01-15', grossAmount: 500 })];
      const rows = run([holding]);
      expect(rows.some((r) => r.key === '2025-01')).toBe(false);
      expect(rows.reduce((n, r) => n + r.actualValue, 0)).toBe(0);
    });

    it('drops a pre-ownership month from the timeline too', () => {
      const holding = createHolding({
        symbol: 'AAA', shares: 10, dividendFrequency: 'quarterly', annualDividendPerShare: 4,
        purchaseDate: '2026-09-05',
      });
      const rows = computeRollingDividendTimeline([holding], { asOfDate: new Date('2026-10-15T00:00:00Z') });
      expect(rowFor(rows, '2026-06').estValue).toBe(0);
      expect(rowFor(rows, '2026-09').estValue).toBeCloseTo(10, 5);
    });

    it('honours a custom window', () => {
      const rows = computeRollingDividendTimeline([quarterly()], { asOfDate, backMonths: 3, forwardMonths: 1 });
      expect(rows.map((r) => r.key)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06']);
    });

    it('returns a full window of empty estimated rows for an empty portfolio', () => {
      const rows = run([]);
      expect(rows).toHaveLength(18);
      expect(rows.every((r) => r.basis === 'estimated' && r.value === 0)).toBe(true);
    });
  });

  describe('computeDripCashSplit', () => {
    it('splits total annual dividend income by dripEnabled true/false', () => {
      const holdings = [
        createHolding({ symbol: 'AAA', shares: 10, annualDividendPerShare: 2, dripEnabled: true }), // $20/yr
        createHolding({ symbol: 'BBB', shares: 5, annualDividendPerShare: 4, dripEnabled: false }), // $20/yr
      ];
      const split = computeDripCashSplit(holdings);
      expect(split.drip).toBeCloseTo(20, 5);
      expect(split.cash).toBeCloseTo(20, 5);
      expect(split.total).toBeCloseTo(40, 5);
    });

    it('an all-default-true portfolio reports its full income under drip and 0 under cash', () => {
      const holdings = [createHolding({ symbol: 'AAA', shares: 10, annualDividendPerShare: 2 })];
      const split = computeDripCashSplit(holdings);
      expect(split.drip).toBeCloseTo(20, 5);
      expect(split.cash).toBe(0);
    });

    it('returns zeroes for an empty holdings list', () => {
      expect(computeDripCashSplit([])).toEqual({ drip: 0, cash: 0, total: 0 });
    });
  });

  describe('computePortfolioDividendYield', () => {
    it('divides total annual dividend income by total market value', () => {
      const holdings = [
        createHolding({ symbol: 'AAA', shares: 10, currentPrice: 100, annualDividendPerShare: 2 }), // $1000 value, $20/yr
        createHolding({ symbol: 'BBB', shares: 10, currentPrice: 100, annualDividendPerShare: 4 }), // $1000 value, $40/yr
      ];
      // total income 60 / total value 2000 = 3%
      expect(computePortfolioDividendYield(holdings)).toBeCloseTo(0.03, 5);
    });

    it('returns 0 when total market value is 0 or the list is empty, rather than dividing by zero', () => {
      expect(computePortfolioDividendYield([])).toBe(0);
      expect(computePortfolioDividendYield([createHolding({ symbol: 'AAA', shares: 0, currentPrice: 0 })])).toBe(0);
    });
  });

  describe('getPricedTimeline', () => {
    it('returns lots sorted oldest-first, dropping any with no date or non-positive price', () => {
      const holding = createHolding({
        symbol: 'AAA',
        lots: [
          createLot({ date: '2022-01-01', shares: 5, pricePerShare: 20 }),
          createLot({ date: '2021-01-01', shares: 3, pricePerShare: 10 }),
          createLot({ date: null, shares: 1, pricePerShare: 10 }), // no date -- dropped
          createLot({ date: '2023-01-01', shares: 1, pricePerShare: 0 }), // no price -- dropped
        ],
      });
      const timeline = getPricedTimeline(holding);
      expect(timeline).toEqual([
        { date: '2021-01-01', shares: 3, price: 10 },
        { date: '2022-01-01', shares: 5, price: 20 },
      ]);
    });

    it('falls back to a single synthesized entry from purchaseDate/avgBuyPrice/shares when there are no lots', () => {
      const holding = createHolding({ symbol: 'AAA', shares: 10, avgBuyPrice: 15, purchaseDate: '2020-05-01' });
      expect(getPricedTimeline(holding)).toEqual([{ date: '2020-05-01', shares: 10, price: 15 }]);
    });

    it('returns [] when there are no lots and no purchaseDate/avgBuyPrice', () => {
      expect(getPricedTimeline(createHolding({ symbol: 'AAA' }))).toEqual([]);
    });
  });

  describe('computeValueAsOfDate', () => {
    it('values a holding at cumulative shares * the most recent priced entry on/before the date', () => {
      const holding = createHolding({
        symbol: 'AAA',
        lots: [
          createLot({ date: '2020-01-01', shares: 10, pricePerShare: 10 }), // $100
          createLot({ date: '2021-06-01', shares: 5, pricePerShare: 20 }), // $100 more, price moves to $20
        ],
      });
      const result = computeValueAsOfDate(holding, new Date('2021-12-31T00:00:00Z'));
      expect(result.cumulativeShares).toBe(15);
      expect(result.asOfPrice).toBe(20);
      expect(result.value).toBeCloseTo(300, 5); // 15 shares * $20 (last recorded price, not today's currentPrice)
    });

    it('only counts priced events on/before the given date', () => {
      const holding = createHolding({
        symbol: 'AAA',
        lots: [createLot({ date: '2020-01-01', shares: 10, pricePerShare: 10 })],
      });
      const result = computeValueAsOfDate(holding, new Date('2019-06-01T00:00:00Z'));
      expect(result).toBeNull(); // nothing has happened yet as of this date
    });

    it('excludes a holding whose most recent priced entry is more than STALE_ASSET_DAYS before the given date', () => {
      const holding = createHolding({
        symbol: 'AAA',
        lots: [createLot({ date: '2020-01-01', shares: 10, pricePerShare: 10 })],
      });
      const justUnderStale = new Date('2020-01-01T00:00:00Z');
      justUnderStale.setUTCDate(justUnderStale.getUTCDate() + STALE_ASSET_DAYS - 1);
      const justOverStale = new Date('2020-01-01T00:00:00Z');
      justOverStale.setUTCDate(justOverStale.getUTCDate() + STALE_ASSET_DAYS + 1);

      expect(computeValueAsOfDate(holding, justUnderStale)).not.toBeNull();
      expect(computeValueAsOfDate(holding, justOverStale)).toBeNull();
    });

    it('falls back to purchaseDate/avgBuyPrice/shares for a holding with no lots', () => {
      const holding = createHolding({ symbol: 'AAA', shares: 10, avgBuyPrice: 15, purchaseDate: '2020-05-01' });
      const result = computeValueAsOfDate(holding, new Date('2020-06-01T00:00:00Z'));
      expect(result.value).toBeCloseTo(150, 5);
    });

    it('returns null for an invalid date', () => {
      const holding = createHolding({ symbol: 'AAA', shares: 10, avgBuyPrice: 15, purchaseDate: '2020-05-01' });
      expect(computeValueAsOfDate(holding, 'not-a-date')).toBeNull();
    });
  });

  describe('computeCalendarQuarterTotals (changelog 207)', () => {
    it('counts what was received for a finished month and the estimate for the rest -- the chart\'s rule', () => {
      // $4/share/yr quarterly on 100 shares: $100 estimated each quarter.
      const h = createHolding({ symbol: 'AAA', shares: 100, annualDividendPerShare: 4, dividendFrequency: 'quarterly' });
      h.distributionEvents = [createDistributionEvent({ date: '2026-04-30', type: 'capitalGainDistribution', grossAmount: 32000 })];
      const asOfDate = new Date('2026-09-15T12:00:00Z');
      const { quarters, year } = computeCalendarQuarterTotals([h], { asOfDate });
      const est = computeRollingDividendTimeline([h], { asOfDate, backMonths: 8, forwardMonths: 4 });
      const estFor = (m) => est.filter((r) => Math.floor(r.month / 3) === m).reduce((t, r) => t + r.estValue, 0);
      // Q2 has a received month (April) and two finished months with
      // nothing received, which fall back to their estimate.
      const q2Received = 32000;
      const q2Est = est.filter((r) => r.month === 4 || r.month === 5).reduce((t, r) => t + r.estValue, 0);
      expect(quarters[1].actual).toBeCloseTo(q2Received, 6);
      expect(quarters[1].estimated).toBeCloseTo(q2Est, 6);
      expect(quarters[1].value).toBeCloseTo(q2Received + q2Est, 6);
      expect(quarters[0].value).toBeCloseTo(estFor(0), 6);
      expect(quarters[3].actual).toBe(0);
      expect(year.value).toBeCloseTo(quarters.reduce((t, q) => t + q.value, 0), 6);
      // A payment in the month in progress is not "finished" yet.
      h.distributionEvents = [createDistributionEvent({ date: '2026-09-02', type: 'dividend', grossAmount: 5000 })];
      expect(computeCalendarQuarterTotals([h], { asOfDate }).quarters[2].actual).toBe(0);
    });
  });

  describe('computeWealthMilestones', () => {
    it('returns insufficientHistory when fewer than 2 years have any priced activity', () => {
      const holdings = [createHolding({ symbol: 'AAA', shares: 10, avgBuyPrice: 10, currentPrice: 12, purchaseDate: '2026-01-01' })];
      const result = computeWealthMilestones(holdings, { asOfDate: new Date('2026-06-01T00:00:00Z') });
      expect(result.insufficientHistory).toBe(true);
      expect(result.rows).toEqual([]);
    });

    it('returns insufficientHistory for an empty holdings list', () => {
      const result = computeWealthMilestones([], { asOfDate: new Date('2026-06-01T00:00:00Z') });
      expect(result.insufficientHistory).toBe(true);
    });

    it('builds one row per year, grouped by institution, with growth vs the prior included year', () => {
      // AAA gets a second lot before the 2023 year-end evaluation so it's
      // still within STALE_ASSET_DAYS of both the 2023 and 2024 cutoffs --
      // otherwise a single lot from Jan 2023 would itself go stale by the
      // Dec 2024 evaluation, which is exactly the behavior the next test
      // ("excludes a stale holding...") checks on purpose.
      const holdings = [
        createHolding({
          symbol: 'AAA',
          institution: 'Fidelity',
          lots: [
            createLot({ date: '2023-01-01', shares: 10, pricePerShare: 10 }), // $100
            createLot({ date: '2023-12-01', shares: 5, pricePerShare: 12 }), // cumulative 15 sh @ $12
          ],
        }),
        createHolding({
          symbol: 'BBB',
          institution: 'Vanguard',
          lots: [createLot({ date: '2024-06-01', shares: 5, pricePerShare: 40 })], // $200
        }),
      ];
      const asOf = new Date('2024-06-01T00:00:00Z');
      const result = computeWealthMilestones(holdings, { asOfDate: asOf });

      expect(result.insufficientHistory).toBe(false);
      expect(result.institutions.sort()).toEqual(['Fidelity', 'Vanguard']);
      expect(result.rows.map((r) => r.year)).toEqual([2023, 2024]);

      const row2023 = result.rows.find((r) => r.year === 2023);
      expect(row2023.byInstitution.Fidelity).toBeCloseTo(180, 5); // 15 sh @ $12 (last recorded price)
      expect(row2023.byInstitution.Vanguard).toBeUndefined(); // BBB hasn't started yet
      expect(row2023.total).toBeCloseTo(180, 5);
      expect(row2023.growthPct).toBeNull(); // no prior included year

      const row2024 = result.rows.find((r) => r.year === 2024);
      expect(row2024.byInstitution.Fidelity).toBeCloseTo(180, 5); // no new AAA activity, same last price
      expect(row2024.byInstitution.Vanguard).toBeCloseTo(200, 5);
      expect(row2024.total).toBeCloseTo(380, 5);
      // The $200 BBB purchase is new money, not growth (changelog 204):
      // nothing on file moved in price, so growth is 0%, not +111%.
      expect(row2024.newMoney).toBeCloseTo(200, 5);
      expect(row2024.growthPct).toBeCloseTo(0, 5);
      expect(row2023.newMoney).toBeNull();
      // The current year is only partway through, and says so.
      expect(row2024.yearToDate).toBe(true);
      expect(row2023.yearToDate).toBe(false);
    });

    // Changelog 204: the Growth column used to be the change in the total,
    // so a year of heavy saving read as a great year for the market.
    const AS_OF = new Date('2025-06-01T00:00:00Z');
    it('takes new purchases out of growth, and measures price growth on the simple Dietz basis', () => {
      const h = createHolding({
        symbol: 'AAA', institution: 'Fidelity',
        lots: [
          createLot({ date: '2023-06-01', shares: 100, pricePerShare: 10 }), // $1,000
          createLot({ date: '2024-07-01', shares: 50, pricePerShare: 12 }), // +$600 new money; 150 sh @ $12 = $1,800
          createLot({ date: '2025-03-01', shares: 1, pricePerShare: 12 }),
        ],
      });
      const r = computeWealthMilestones([h], { asOfDate: AS_OF });
      const row = r.rows.find((x) => x.year === 2024);
      expect(row.total).toBeCloseTo(1800, 6);
      expect(row.newMoney).toBeCloseTo(600, 6);
      // gain = 1800 - 1000 - 600 = 200, over 1000 + 600/2.
      expect(row.growthPct).toBeCloseTo((200 / 1300) * 100, 6);
    });

    it('counts a DRIP reinvestment as growth, not new money', () => {
      const lots = (source) => [
        createLot({ date: '2023-06-01', shares: 100, pricePerShare: 10 }),
        createLot({ date: '2024-07-01', shares: 5, pricePerShare: 10, source }),
        createLot({ date: '2025-03-01', shares: 1, pricePerShare: 10 }),
      ];
      const drip = computeWealthMilestones([createHolding({ symbol: 'A', institution: 'X', lots: lots('drip') })], { asOfDate: AS_OF }).rows.find((x) => x.year === 2024);
      const buy = computeWealthMilestones([createHolding({ symbol: 'A', institution: 'X', lots: lots('purchase') })], { asOfDate: AS_OF }).rows.find((x) => x.year === 2024);
      expect(drip.newMoney).toBe(0);
      expect(drip.growthPct).toBeCloseTo(5, 6);
      expect(buy.newMoney).toBeCloseTo(50, 6);
      expect(buy.growthPct).toBeCloseTo(0, 6);
    });

    it('a holding bought during the year adds its own gain above what was paid', () => {
      const old = createHolding({ symbol: 'OLD', institution: 'X', lots: [createLot({ date: '2023-06-01', shares: 10, pricePerShare: 100 }), createLot({ date: '2024-06-01', shares: 0.0001, pricePerShare: 100 })] });
      const fresh = createHolding({ symbol: 'NEW', institution: 'X', lots: [createLot({ date: '2024-03-01', shares: 10, pricePerShare: 50 }), createLot({ date: '2024-09-01', shares: 1, pricePerShare: 60 })] });
      const row = computeWealthMilestones([old, fresh], { asOfDate: AS_OF }).rows.find((x) => x.year === 2024);
      const oldGain = 10.0001 * 100 - 1000 - 0.01;
      const freshGain = 11 * 60 - (500 + 60);
      expect(row.newMoney).toBeCloseTo(0.01 + 560, 6);
      expect(row.growthPct).toBeCloseTo(((oldGain + freshGain) / (1000 + row.newMoney / 2)) * 100, 6);
    });

    it('a holding that comes back after going stale sits out that year’s growth', () => {
      const back = createHolding({ symbol: 'BACK', institution: 'X', lots: [createLot({ date: '2021-01-01', shares: 10, pricePerShare: 10 }), createLot({ date: '2024-05-01', shares: 1, pricePerShare: 30 })] });
      const steady = createHolding({ symbol: 'S', institution: 'X', lots: [createLot({ date: '2023-06-01', shares: 10, pricePerShare: 10 }), createLot({ date: '2024-06-01', shares: 0, pricePerShare: 11 })] });
      const rows = computeWealthMilestones([back, steady], { asOfDate: AS_OF }).rows;
      const row = rows.find((x) => x.year === 2024);
      expect(rows.find((x) => x.year === 2023).total).toBeCloseTo(100, 6); // BACK stale then
      expect(row.total).toBeCloseTo(330 + 110, 6);
      // Only STEADY counts: 100 -> 110, no new money.
      expect(row.growthPct).toBeCloseTo(10, 6);
      expect(row.newMoney).toBe(0);
    });

    it('rolls a holding with no institution set into "Unassigned" rather than dropping it', () => {
      const holdings = [
        createHolding({ symbol: 'AAA', institution: '', lots: [createLot({ date: '2023-01-01', shares: 10, pricePerShare: 10 })] }),
        createHolding({ symbol: 'BBB', institution: 'Fidelity', lots: [createLot({ date: '2024-01-01', shares: 10, pricePerShare: 10 })] }),
      ];
      const result = computeWealthMilestones(holdings, { asOfDate: new Date('2024-06-01T00:00:00Z') });
      expect(result.institutions).toContain('Unassigned');
      const row2023 = result.rows.find((r) => r.year === 2023);
      expect(row2023.byInstitution.Unassigned).toBeCloseTo(100, 5);
    });

    it('values an import with no share history at its current shares from its first recorded price (changelog 207)', () => {
      // The Vanguard case: a website import -- shares and today's price,
      // no lots, no purchase date, no basis.
      const v = createHolding({ symbol: 'VFIAX', institution: 'Vanguard', shares: 100, currentPrice: 500, avgBuyPrice: 0 });
      v.priceSnapshots = [{ date: '2024-03-01', price: 450 }, { date: '2024-05-01', price: 480 }];
      const f = createHolding({ symbol: 'AAA', institution: 'Fidelity', lots: [createLot({ date: '2023-06-01', shares: 10, pricePerShare: 10 }), createLot({ date: '2024-05-01', shares: 0, pricePerShare: 10 })] });
      const r = computeWealthMilestones([v, f], { asOfDate: new Date('2024-06-01T00:00:00Z') });
      const row = r.rows.find((x) => x.year === 2024);
      expect(row.byInstitution.Vanguard).toBeCloseTo(100 * 480, 6);
      // Its arrival is new money, not a 48,000% gain.
      expect(row.newMoney).toBeCloseTo(100 * 450, 6);
      expect(row.growthPct).toBeCloseTo(((48000 - 45000) / (100 + 45000 / 2)) * 100, 6);
      // A holding WITH history is untouched by this.
      expect(row.byInstitution.Fidelity).toBeCloseTo(100, 6);
      // No shares, or no recorded price: still nothing to value.
      const none = createHolding({ symbol: 'Z', institution: 'Vanguard', shares: 0, avgBuyPrice: 0 });
      none.priceSnapshots = [{ date: '2024-03-01', price: 450 }];
      expect(computeWealthMilestones([none, f], { asOfDate: new Date('2024-06-01T00:00:00Z') }).institutions).toEqual(['Fidelity']);
    });

    it('lists the holdings behind each column, at their latest year (changelog 206)', () => {
      const a = createHolding({ symbol: 'AAA', institution: ' ', account: 'IRA', lots: [createLot({ date: '2023-01-01', shares: 10, pricePerShare: 10 }), createLot({ date: '2024-01-01', shares: 0, pricePerShare: 12 })] });
      const b = createHolding({ symbol: 'BBB', institution: 'Fidelity', lots: [createLot({ date: '2024-01-01', shares: 10, pricePerShare: 10 })] });
      const stale = createHolding({ symbol: 'OLD', institution: '', lots: [createLot({ date: '2023-02-01', shares: 1, pricePerShare: 50 })] });
      const result = computeWealthMilestones([a, b, stale], { asOfDate: new Date('2024-06-01T00:00:00Z') });
      // A whitespace-only institution is Unassigned, and it is listed.
      expect(result.members.Unassigned.map((m) => m.symbol)).toEqual(['AAA', 'OLD']);
      expect(result.members.Unassigned[0]).toMatchObject({ holdingId: a.id, account: 'IRA', year: 2024, value: 120 });
      // OLD last counted in 2023, before it went stale.
      expect(result.members.Unassigned[1]).toMatchObject({ holdingId: stale.id, year: 2023, value: 50 });
      expect(result.members.Fidelity.map((m) => m.holdingId)).toEqual([b.id]);
    });

    it('excludes a stale holding from later years but counts it toward excludedCount, not silently dropping the year', () => {
      const stale = createHolding({ symbol: 'STALE', institution: 'Fidelity', lots: [createLot({ date: '2020-01-01', shares: 10, pricePerShare: 10 })] });
      const fresh = createHolding({ symbol: 'FRESH', institution: 'Fidelity', lots: [createLot({ date: '2024-01-01', shares: 10, pricePerShare: 10 })] });
      const result = computeWealthMilestones([stale, fresh], { asOfDate: new Date('2024-06-01T00:00:00Z') });
      const row2024 = result.rows.find((r) => r.year === 2024);
      expect(row2024.excludedCount).toBe(1); // stale holding excluded but noted
      expect(row2024.total).toBeCloseTo(100, 5); // only the fresh holding counted
    });
  });

  describe('computeTopWeightConcentration', () => {
    it('returns the largest holding and its % of total market value', () => {
      const holdings = [
        createHolding({ symbol: 'AAA', shares: 10, currentPrice: 10 }), // $100
        createHolding({ symbol: 'BBB', shares: 10, currentPrice: 30 }), // $300
      ];
      const result = computeTopWeightConcentration(holdings);
      expect(result.holding.symbol).toBe('BBB');
      expect(result.pct).toBeCloseTo(75, 5);
    });

    it('returns null when there is no positive total market value', () => {
      expect(computeTopWeightConcentration([])).toBeNull();
      expect(computeTopWeightConcentration([createHolding({ symbol: 'AAA', shares: 0, currentPrice: 0 })])).toBeNull();
    });
  });

  describe('computeNetWorthSummary', () => {
    it('sums market value and counts distinct institutions/holdings', () => {
      const holdings = [
        createHolding({ symbol: 'AAA', institution: 'Fidelity', shares: 10, currentPrice: 10 }),
        createHolding({ symbol: 'BBB', institution: 'Vanguard', shares: 10, currentPrice: 10 }),
        createHolding({ symbol: 'CCC', institution: 'Fidelity', shares: 10, currentPrice: 10 }),
      ];
      const result = computeNetWorthSummary(holdings);
      expect(result.total).toBeCloseTo(300, 5);
      expect(result.institutionCount).toBe(2);
      expect(result.holdingCount).toBe(3);
    });

    it('does not count blank institutions', () => {
      const holdings = [createHolding({ symbol: 'AAA', institution: '', shares: 10, currentPrice: 10 })];
      expect(computeNetWorthSummary(holdings).institutionCount).toBe(0);
    });
  });

  describe('computeAllocationByType', () => {
    it('groups market value by securityType and computes each slice\'s % of total', () => {
      const holdings = [
        createHolding({ symbol: 'AAA', securityType: 'stock', shares: 10, currentPrice: 10 }), // $100
        createHolding({ symbol: 'BBB', securityType: 'etf', shares: 10, currentPrice: 30 }), // $300
      ];
      const result = computeAllocationByType(holdings);
      expect(result.total).toBeCloseTo(400, 5);
      const stockSlice = result.slices.find((s) => s.type === 'stock');
      const etfSlice = result.slices.find((s) => s.type === 'etf');
      expect(stockSlice.value).toBeCloseTo(100, 5);
      expect(stockSlice.pct).toBeCloseTo(25, 5);
      expect(etfSlice.value).toBeCloseTo(300, 5);
      expect(etfSlice.pct).toBeCloseTo(75, 5);
    });

    it('omits zero-value buckets from slices', () => {
      const holdings = [createHolding({ symbol: 'AAA', securityType: 'stock', shares: 10, currentPrice: 10 })];
      const result = computeAllocationByType(holdings);
      expect(result.slices).toHaveLength(1);
      expect(result.slices[0].type).toBe('stock');
    });

    it('falls back an unrecognized/missing securityType into stock', () => {
      const holdings = [createHolding({ symbol: 'AAA', securityType: 'bond', shares: 10, currentPrice: 10 })];
      const result = computeAllocationByType(holdings);
      expect(result.slices.find((s) => s.type === 'stock').value).toBeCloseTo(100, 5);
    });
  });

  describe('computeHistoricalDecisions', () => {
    const asOf = new Date('2026-08-16T00:00:00Z');

    it('returns [] for an empty holdings list', () => {
      expect(computeHistoricalDecisions([], asOf)).toEqual([]);
    });

    it('includes a longest-held card for the holding with the earliest lot/purchase date', () => {
      const holdings = [
        createHolding({ symbol: 'OLD', lots: [createLot({ date: '2018-01-01', shares: 1, pricePerShare: 10 })] }),
        createHolding({ symbol: 'NEW', lots: [createLot({ date: '2024-01-01', shares: 1, pricePerShare: 10 })] }),
      ];
      const cards = computeHistoricalDecisions(holdings, asOf);
      const longest = cards.find((c) => c.id === 'longest-held');
      expect(longest.symbol).toBe('OLD');
      expect(longest.date).toBe('2018-01-01');
    });

    it('includes a best-performer card matching computeAnalytics\' top CAGR row', () => {
      const holdings = [
        createHolding({ symbol: 'AAA', shares: 10, avgBuyPrice: 100, currentPrice: 110, purchaseDate: '2023-01-01' }),
        createHolding({ symbol: 'BBB', shares: 10, avgBuyPrice: 100, currentPrice: 300, purchaseDate: '2023-01-01' }),
      ];
      const cards = computeHistoricalDecisions(holdings, asOf);
      const best = cards.find((c) => c.id === 'best-performer');
      expect(best.symbol).toBe('BBB');
    });

    it('omits the most-reinvested card entirely when no DRIP lots exist anywhere', () => {
      const holdings = [createHolding({ symbol: 'AAA', lots: [createLot({ date: '2020-01-01', shares: 1, pricePerShare: 10, source: 'purchase' })] })];
      const cards = computeHistoricalDecisions(holdings, asOf);
      expect(cards.find((c) => c.id === 'most-reinvested')).toBeUndefined();
    });

    it('includes a most-reinvested card for the holding with the highest total DRIP lot value', () => {
      const holdings = [
        createHolding({
          symbol: 'AAA',
          lots: [
            createLot({ date: '2020-01-01', shares: 10, pricePerShare: 10, source: 'purchase' }),
            createLot({ date: '2021-01-01', shares: 1, pricePerShare: 20, source: 'drip' }), // $20
          ],
        }),
        createHolding({
          symbol: 'BBB',
          lots: [createLot({ date: '2021-01-01', shares: 5, pricePerShare: 20, source: 'drip' })], // $100
        }),
      ];
      const cards = computeHistoricalDecisions(holdings, asOf);
      const reinvested = cards.find((c) => c.id === 'most-reinvested');
      expect(reinvested.symbol).toBe('BBB');
      expect(reinvested.dripValue).toBeCloseTo(100, 5);
      expect(reinvested.lotCount).toBe(1);
    });

    it('includes a largest-holding card matching computeTopWeightConcentration', () => {
      const holdings = [
        createHolding({ symbol: 'AAA', shares: 10, currentPrice: 10 }),
        createHolding({ symbol: 'BBB', shares: 10, currentPrice: 30 }),
      ];
      const cards = computeHistoricalDecisions(holdings, asOf);
      const largest = cards.find((c) => c.id === 'largest-holding');
      expect(largest.symbol).toBe('BBB');
      expect(largest.pct).toBeCloseTo(75, 5);
    });
  });

  // Flat-rate multi-year glide-path simulation for the Retirement Income
  // sub-tab's new self-contained "Retirement Planning & Glide Path" section
  // (see PortfolioTab.jsx). Explicitly NOT calculator.js's real projection
  // engine -- no taxes, no market variance, no interaction with the app's
  // real Plan Settings inputs -- just value = value*growthFactor +
  // contributions per year, and passiveIncome = value*yieldFactor.
  describe('computeGlidePathSimulation', () => {
    it('grows the portfolio by the growth rate and adds annual contributions each year', () => {
      const result = computeGlidePathSimulation(100000, 0, {
        horizonYears: 1,
        targetMonthlyIncome: 0,
        annual401k: 10000,
        annualRsu: 0,
        growthRatePct: 6,
        sustainableYieldPct: 6.5,
      });

      // value = 100000 * 1.06 + 10000 = 116000
      expect(result.years).toHaveLength(1);
      expect(result.years[0].yearIndex).toBe(1);
      expect(result.years[0].portfolioValue).toBeCloseTo(116000, 5);
      // passiveIncomeAnnual = 116000 * 0.065 = 7540; monthly = 7540 / 12
      expect(result.years[0].passiveIncomeAnnual).toBeCloseTo(7540, 5);
      expect(result.years[0].passiveIncomeMonthly).toBeCloseTo(7540 / 12, 5);
      expect(result.finalPortfolioValue).toBeCloseTo(116000, 5);
      expect(result.finalPassiveIncomeMonthly).toBeCloseTo(7540 / 12, 5);
    });

    it('sums both 401k and RSU contributions into the same year', () => {
      const result = computeGlidePathSimulation(0, 0, {
        horizonYears: 1,
        targetMonthlyIncome: 0,
        annual401k: 20000,
        annualRsu: 15000,
        growthRatePct: 0,
        sustainableYieldPct: 5,
      });

      expect(result.years[0].portfolioValue).toBeCloseTo(35000, 5);
    });

    it('sets isFeasible true and firstYearGoalMet to the year the target is first reached, mid-horizon', () => {
      const result = computeGlidePathSimulation(0, 0, {
        horizonYears: 5,
        targetMonthlyIncome: 1000,
        annual401k: 50000,
        annualRsu: 0,
        growthRatePct: 0,
        sustainableYieldPct: 10,
      });

      // portfolioValue after year N = 50000 * N (no growth, flat contribution).
      // passiveIncomeMonthly after year N = (50000*N*0.10) / 12.
      // Year 2: 833.33 (< 1000); Year 3: 1250 (>= 1000) -- first met at year 3.
      expect(result.years[1].passiveIncomeMonthly).toBeLessThan(1000);
      expect(result.years[2].passiveIncomeMonthly).toBeGreaterThanOrEqual(1000);
      expect(result.isFeasible).toBe(true);
      expect(result.firstYearGoalMet).toBe(3);

      // fundedPct is measured against the FINAL year (5), not the year the
      // goal was first met -- final value = 250000, monthly income = 2083.33.
      expect(result.finalPassiveIncomeMonthly).toBeCloseTo((250000 * 0.10) / 12, 5);
      expect(result.fundedPct).toBeCloseTo((((250000 * 0.10) / 12) / 1000) * 100, 5);
    });

    it('sets isFeasible false and reports the correct fundedPct when the target is never reached', () => {
      const result = computeGlidePathSimulation(10000, 0, {
        horizonYears: 3,
        targetMonthlyIncome: 10000,
        annual401k: 0,
        annualRsu: 0,
        growthRatePct: 0,
        sustainableYieldPct: 5,
      });

      // Flat value (no growth, no contributions) = 10000 every year.
      // passiveIncomeMonthly = (10000 * 0.05) / 12 = 41.6666...
      const expectedMonthly = (10000 * 0.05) / 12;
      expect(result.isFeasible).toBe(false);
      expect(result.firstYearGoalMet).toBeNull();
      expect(result.finalPassiveIncomeMonthly).toBeCloseTo(expectedMonthly, 5);
      expect(result.fundedPct).toBeCloseTo((expectedMonthly / 10000) * 100, 5);
    });

    it('dedups milestone years for a 1-year horizon down to a single milestone', () => {
      const result = computeGlidePathSimulation(100000, 0, {
        horizonYears: 1,
        targetMonthlyIncome: 0,
        growthRatePct: 5,
        sustainableYieldPct: 5,
      });

      expect(result.milestones).toHaveLength(1);
      expect(result.milestones[0]).toBe(result.years[0]);
    });

    it('produces 2 distinct milestone years for a 2-year horizon', () => {
      const result = computeGlidePathSimulation(100000, 0, {
        horizonYears: 2,
        targetMonthlyIncome: 0,
        growthRatePct: 5,
        sustainableYieldPct: 5,
      });

      expect(result.milestones).toHaveLength(2);
      expect(result.milestones[0].yearIndex).toBe(1);
      expect(result.milestones[1].yearIndex).toBe(2);
    });

    it('produces 3 distinct milestone years for a longer horizon', () => {
      const result = computeGlidePathSimulation(100000, 0, {
        horizonYears: 9,
        targetMonthlyIncome: 0,
        growthRatePct: 5,
        sustainableYieldPct: 5,
      });

      expect(result.milestones).toHaveLength(3);
      expect(result.milestones.map((m) => m.yearIndex)).toEqual([3, 6, 9]);
    });

    it('falls back to the current value/income with no years when horizonYears is 0', () => {
      const result = computeGlidePathSimulation(50000, 12000, {
        horizonYears: 0,
        targetMonthlyIncome: 1000,
        growthRatePct: 6,
        sustainableYieldPct: 6.5,
      });

      expect(result.years).toEqual([]);
      expect(result.milestones).toEqual([]);
      expect(result.finalPortfolioValue).toBe(50000);
      expect(result.finalPassiveIncomeMonthly).toBeCloseTo(12000 / 12, 5);
    });

    it('reports fundedPct: 0 and isFeasible: false when targetMonthlyIncome is zero or blank', () => {
      const zeroResult = computeGlidePathSimulation(100000, 0, {
        horizonYears: 3,
        targetMonthlyIncome: 0,
        growthRatePct: 6,
        sustainableYieldPct: 6.5,
      });
      const blankResult = computeGlidePathSimulation(100000, 0, {
        horizonYears: 3,
        targetMonthlyIncome: '',
        growthRatePct: 6,
        sustainableYieldPct: 6.5,
      });

      expect(zeroResult.fundedPct).toBe(0);
      expect(zeroResult.isFeasible).toBe(false);
      expect(zeroResult.firstYearGoalMet).toBeNull();
      expect(blankResult.fundedPct).toBe(0);
      expect(blankResult.isFeasible).toBe(false);
    });
  });

  describe('computeGlidePathRoadmap', () => {
    it('cites the real biggest sell-candidate row (by dollar amount, not first-in-list) as the trim target', () => {
      const holdings = [
        createHolding({ id: 'a', symbol: 'SMALL_SELL', account: 'Taxable Brokerage', taxTreatment: 'taxable', shares: 10, currentPrice: 10, targetAllocationPct: 50 }), // value 100
        createHolding({ id: 'b', symbol: 'BIG_SELL', account: 'Rollover IRA', taxTreatment: 'preTax', shares: 100, currentPrice: 10, targetAllocationPct: 10 }), // value 1000
        createHolding({ id: 'c', symbol: 'BUY_ME', account: 'Roth IRA', taxTreatment: 'roth', shares: 1, currentPrice: 10, targetAllocationPct: 40 }), // value 10
      ];
      const rebalancePlan = computeRebalancePlan(holdings);
      const glidePathSimulation = computeGlidePathSimulation(1110, 0, { horizonYears: 0 });

      const result = computeGlidePathRoadmap(holdings, rebalancePlan, glidePathSimulation);

      expect(result.trim).not.toBeNull();
      expect(result.trim.symbol).toBe('BIG_SELL');
      expect(result.trim.account).toBe('Rollover IRA');
      expect(result.trim.taxTreatment).toBe('preTax');
      expect(result.trim.amountDollars).toBeGreaterThan(0);
    });

    it('returns trim: null when no holding has a sell action', () => {
      const holdings = [createHolding({ id: 'a', symbol: 'ONLY', shares: 10, currentPrice: 10, targetAllocationPct: 100 })];
      const rebalancePlan = computeRebalancePlan(holdings);
      const glidePathSimulation = computeGlidePathSimulation(100, 0, { horizonYears: 0 });

      const result = computeGlidePathRoadmap(holdings, rebalancePlan, glidePathSimulation);

      expect(result.trim).toBeNull();
    });

    it('returns trim: null when no holdings have a Target % set at all', () => {
      const holdings = [createHolding({ id: 'a', symbol: 'NOTARGET', shares: 10, currentPrice: 10 })];
      const rebalancePlan = computeRebalancePlan(holdings);
      const glidePathSimulation = computeGlidePathSimulation(100, 0, { horizonYears: 0 });

      const result = computeGlidePathRoadmap(holdings, rebalancePlan, glidePathSimulation);

      expect(result.trim).toBeNull();
    });

    it('lists real dripEnabled holdings and reuses computeDripCashSplit for the freed cash figure', () => {
      const holdings = [
        createHolding({ id: 'a', symbol: 'DRIP_ON', shares: 100, currentPrice: 10, annualDividendPerShare: 1, dripEnabled: true }),
        createHolding({ id: 'b', symbol: 'DRIP_OFF', shares: 100, currentPrice: 10, annualDividendPerShare: 2, dripEnabled: false }),
      ];
      const rebalancePlan = computeRebalancePlan(holdings);
      const glidePathSimulation = computeGlidePathSimulation(2000, 0, { horizonYears: 0 });

      const result = computeGlidePathRoadmap(holdings, rebalancePlan, glidePathSimulation);

      expect(result.stopDrip).not.toBeNull();
      expect(result.stopDrip.symbols).toEqual(['DRIP_ON']);
      // computeDripCashSplit's own `drip` total: 100 shares * $1/share = 100.
      expect(result.stopDrip.annualCashFreed).toBeCloseTo(100, 5);
    });

    it('returns stopDrip: null when no holding has dripEnabled true', () => {
      const holdings = [createHolding({ id: 'a', symbol: 'NODRIP', shares: 10, currentPrice: 10, dripEnabled: false })];
      const rebalancePlan = computeRebalancePlan(holdings);
      const glidePathSimulation = computeGlidePathSimulation(100, 0, { horizonYears: 0 });

      const result = computeGlidePathRoadmap(holdings, rebalancePlan, glidePathSimulation);

      expect(result.stopDrip).toBeNull();
    });

    it('reuses computeGlidePathSimulation milestones verbatim for step2/step3, introducing no new math', () => {
      const holdings = [];
      const rebalancePlan = computeRebalancePlan(holdings);
      const glidePathSimulation = computeGlidePathSimulation(100000, 0, {
        horizonYears: 9,
        targetMonthlyIncome: 0,
        growthRatePct: 5,
        sustainableYieldPct: 5,
      });

      const result = computeGlidePathRoadmap(holdings, rebalancePlan, glidePathSimulation);

      expect(glidePathSimulation.milestones).toHaveLength(3);
      expect(result.step2).toBe(glidePathSimulation.milestones[1]);
      expect(result.step3).toBe(glidePathSimulation.milestones[2]);
      expect(result.step3.yearIndex).toBe(9);
    });

    it('exposes isFeasible/firstYearGoalMet straight from the simulation', () => {
      const holdings = [];
      const rebalancePlan = computeRebalancePlan(holdings);
      const glidePathSimulation = computeGlidePathSimulation(0, 0, {
        horizonYears: 5,
        targetMonthlyIncome: 1000,
        annual401k: 50000,
        growthRatePct: 0,
        sustainableYieldPct: 10,
      });

      const result = computeGlidePathRoadmap(holdings, rebalancePlan, glidePathSimulation);

      expect(result.isFeasible).toBe(true);
      expect(result.firstYearGoalMet).toBe(3);
    });

    it('handles an empty portfolio without throwing', () => {
      const rebalancePlan = computeRebalancePlan([]);
      const glidePathSimulation = computeGlidePathSimulation(0, 0, { horizonYears: 0 });

      const result = computeGlidePathRoadmap([], rebalancePlan, glidePathSimulation);

      expect(result.trim).toBeNull();
      expect(result.stopDrip).toBeNull();
      expect(result.step2).toBeNull();
      expect(result.step3).toBeNull();
    });
  });
});

describe('weekly dividend frequency', () => {
  it('is a valid frequency with 52 payments a year, and the projected schedule buckets it by month', async () => {
    const { isValidDividendFrequency, paymentsPerYearForFrequency, computeProjectedPayoutSchedule, computePerPaymentIncome, createHolding } = await import('../utils/portfolioHoldings.js');
    expect(isValidDividendFrequency('weekly')).toBe(true);
    expect(paymentsPerYearForFrequency('weekly')).toBe(52);
    const ymax = createHolding({ symbol: 'YMAX', shares: 1000, currentPrice: 15, annualDividendPerShare: 3.12, dividendFrequency: 'weekly' });
    expect(computePerPaymentIncome(ymax)).toBeCloseTo(1000 * 3.12 / 52, 6);
    const sched = computeProjectedPayoutSchedule(ymax, { year: 2026 });
    expect(sched).toHaveLength(12);
    expect(sched.reduce((s, e) => s + e.estGrossAmount, 0)).toBeCloseTo(3120, 6);
    expect(sched[0].estPayments).toBeCloseTo(52 / 12, 6);
  });
});

// A29 review findings on Detailed Holdings.
import * as PH from '../utils/portfolioHoldings';

describe('rebalance plan with an untargeted holding', () => {
  it('is not valid while the buys outrun the sells, and says by how much', () => {
    const a = PH.createHolding({ symbol: 'AAA', shares: 100, currentPrice: 400, targetAllocationPct: 50 });
    const b = PH.createHolding({ symbol: 'BBB', shares: 100, currentPrice: 400, targetAllocationPct: 50 });
    const c = PH.createHolding({ symbol: 'CCC', shares: 100, currentPrice: 200 });
    const plan = PH.computeRebalancePlan([a, b, c]);
    expect(plan.isValidTotal).toBe(true);
    expect(plan.rows.some((r) => r.action === 'sell')).toBe(false);
    expect(plan.netTradeDollars).toBeCloseTo(20000, 6);
    expect(plan.untargetedValue).toBe(20000);
    expect(plan.isValid).toBe(false);
    expect(plan.invalidReason).toBe('untargetedValue');
    const ok = PH.computeRebalancePlan([a, b]);
    expect(ok.isValid).toBe(true);
    expect(ok.netTradeDollars).toBeCloseTo(0, 6);
  });
});

describe('selling lots', () => {
  it('lots without ids each lose their own shares', () => {
    const h = PH.createHolding({ symbol: 'X', lots: [
      { date: '2020-01-01', shares: 10, pricePerShare: 5 },
      { date: '2021-01-01', shares: 20, pricePerShare: 6 },
    ] });
    const liq = PH.createLiquidation(h, { sharesToSell: 15, salePricePerShare: 10, saleDate: '2025-01-01' });
    const { updatedHolding } = PH.applyLiquidationToHolding(h, liq);
    expect(updatedHolding.lots.map((l) => l.shares)).toEqual([15]);
    expect(updatedHolding.lots[0].date).toBe('2021-01-01');
    expect(PH.getTotalShares(updatedHolding)).toBe(15);
  });
  it('FIFO never sells a lot bought after the sale date', () => {
    const h = PH.createHolding({ symbol: 'X', lots: [
      PH.createLot({ date: '2020-01-01', shares: 10, pricePerShare: 5 }),
      PH.createLot({ date: '2026-06-01', shares: 50, pricePerShare: 9 }),
    ] });
    expect(PH.computeLiquidationPreview(h, { sharesToSell: 20, salePricePerShare: 10, saleDate: '2025-01-01' })).toBeNull();
    const p = PH.computeLiquidationPreview(h, { sharesToSell: 10, salePricePerShare: 10, saleDate: '2025-01-01' });
    expect(p.lotsSold.map((l) => l.date)).toEqual(['2020-01-01']);
    expect(p.costBasis).toBe(50);
  });
  it('exactly one year is short-term, even across a leap day; the next day is long-term', () => {
    expect(PH.holdingTerm('2023-03-01', '2024-03-01')).toBe('short'); // 366 days
    expect(PH.holdingTerm('2023-03-01', '2024-03-02')).toBe('long');
    expect(PH.holdingTerm('2022-03-01', '2023-03-01')).toBe('short');
    expect(PH.holdingTerm('2022-03-01', '2023-03-02')).toBe('long');
    expect(PH.getLotTermClassification({ date: '2023-03-01' }, new Date('2024-03-01T12:00:00Z'))).toBe('short');
    const h = PH.createHolding({ symbol: 'X', lots: [PH.createLot({ date: '2023-03-01', shares: 1, pricePerShare: 1 })] });
    expect(PH.computeLiquidationPreview(h, { sharesToSell: 1, salePricePerShare: 2, saleDate: '2024-03-01' }).termClassification).toBe('short');
  });
});

describe('sanitizeImportedHoldings', () => {
  it('coerces or drops bad types', () => {
    const [a, b] = PH.sanitizeImportedHoldings([
      { symbol: 'A', shares: '10', currentPrice: '$1,200.50', lots: 'oops' },
      { symbol: 'B', shares: -5, avgBuyPrice: 'abc', lots: [{ shares: '3', pricePerShare: '2' }, { shares: -1 }, 'x', null] },
    ]);
    expect(a.shares).toBe(10);
    expect(a.currentPrice).toBe(1200.5);
    expect(a.lots).toEqual([]);
    expect(b.shares).toBe(0);
    expect(b.avgBuyPrice).toBe(0);
    expect(b.lots).toHaveLength(1);
    expect(b.lots[0]).toMatchObject({ shares: 3, pricePerShare: 2 });
    expect(typeof b.lots[0].id).toBe('string');
    expect(PH.getTotalShares(b)).toBe(3);
  });
});
