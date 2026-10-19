import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS } from '../calculator.js';
import {
  computeTaxableDividendYield,
  computeTaxableDistributionYield,
  createHolding,
  createLot,
  createDistributionEvent,
} from '../utils/portfolioHoldings.js';

describe('taxableDividendYield plan input (the tax engine\'s assumed yield on the Taxable bucket)', () => {
  const base = { ...DEFAULT_INPUTS, taxableInit: 500000 };

  it('defaults to 2% -- the figure that was hard-coded before -- so existing plans are unchanged', () => {
    expect(DEFAULT_INPUTS.taxableDividendYield).toBe(2.0);
    expect(DEFAULT_INPUTS.taxableDividendYieldSource).toBe('manual');
    const y0 = runProjection(base).years[0];
    // The bucket also takes this year's taxable contribution before the
    // yield is applied, so compare as a ratio rather than to a flat $10,000.
    expect(y0.taxableDividends / 500000).toBeCloseTo(0.02, 3);
  });

  it('exposes the year\'s taxable dividends on the projection row as balance x yield', () => {
    const y0 = runProjection({ ...base, taxableDividendYield: 3.5 }).years[0];
    expect(y0.taxableDividends / 500000).toBeCloseTo(0.035, 3);
  });

  it('a higher yield raises taxes every year; a zero yield removes the dividend tax entirely', () => {
    const at0 = runProjection({ ...base, taxableDividendYield: 0 });
    const at2 = runProjection({ ...base, taxableDividendYield: 2 });
    const at5 = runProjection({ ...base, taxableDividendYield: 5 });
    const tax = (p) => p.years.reduce((s, y) => s + (y.totalTaxesPaid || 0), 0);
    expect(tax(at5)).toBeGreaterThan(tax(at2));
    expect(tax(at2)).toBeGreaterThan(tax(at0));
    expect(at0.years[0].taxableDividends).toBe(0);
  });

  it('a plan saved before the input existed still runs with the 2% behavior', () => {
    const { taxableDividendYield: _drop, ...legacy } = base;
    const y0 = runProjection(legacy).years[0];
    expect(y0.taxableDividends / 500000).toBeCloseTo(0.02, 3);
  });
});

describe('computeTaxableDividendYield', () => {
  it('blends only Taxable-bucket holdings, skips a linked concentrated position, and is null with no taxable value', () => {
    // createHolding always mints its own id, so pin ids afterwards.
    const holdings = [
      { ...createHolding({ symbol: 'SCHD', taxTreatment: 'taxable', shares: 100, currentPrice: 100, annualDividendPerShare: 4 }), id: 'a' },   // $10k, $400 -> 4%
      { ...createHolding({ symbol: 'VOO', taxTreatment: 'taxable', shares: 10, currentPrice: 1000, annualDividendPerShare: 10 }), id: 'b' },   // $10k, $100 -> 1%
      { ...createHolding({ symbol: 'O', taxTreatment: 'roth', shares: 100, currentPrice: 100, annualDividendPerShare: 6 }), id: 'c' },         // Roth: ignored
      { ...createHolding({ symbol: 'MEGA', taxTreatment: 'taxable', shares: 1000, currentPrice: 100, annualDividendPerShare: 0 }), id: 'd' },  // concentrated: excluded
    ];
    expect(computeTaxableDividendYield(holdings, { excludeHoldingIds: ['d'] })).toBeCloseTo(500 / 20000, 6);
    expect(computeTaxableDividendYield(holdings)).toBeCloseTo(500 / 120000, 6);
    expect(computeTaxableDividendYield(holdings.filter((h) => h.taxTreatment !== 'taxable'))).toBeNull();
  });
});

describe('taxableQualifiedDividendPct -- the ordinary share of the yield (changelog 208)', () => {
  const START = DEFAULT_INPUTS.planYear;
  // A single earner squarely in the 22% bracket, $500k taxable at 4%:
  // $20,000 of distributions a year.
  const worker = {
    ...DEFAULT_INPUTS, birthYear1: START - 50, retireAge1: 65, salary1: 90000,
    taxableInit: 500000, taxableDividendYield: 4, stateOfResidence: 'CA', stateTaxState: 'ca',
  };
  // The typed share is in force only with the split-following switch off
  // (changelog 414); these cases are about the typed share.
  const y0 = (pct) => runProjection({ ...worker, taxableQualifiedDividendFollowsAllocation: false, taxableQualifiedDividendPct: pct }).years[0];

  it('the typed figure defaults to 100% qualified, which is how every plan was taxed before 414', () => {
    expect(DEFAULT_INPUTS.taxableQualifiedDividendPct).toBe(100);
    expect(y0(100).ordinaryDividends).toBe(0);
    const { taxableQualifiedDividendPct: _drop, ...legacy } = { ...worker, taxableQualifiedDividendFollowsAllocation: false, taxableQualifiedDividendPct: 100 };
    expect(runProjection(legacy).years[0].ordinaryDividends).toBe(0);
  });

  it('taxes the ordinary share at the bracket rate instead of the 15% rate', () => {
    const q = y0(100);
    const o = y0(0);
    const half = y0(50);
    expect(o.ordinaryDividends).toBeCloseTo(o.taxableDividends, 6);
    expect(half.ordinaryDividends).toBeCloseTo(half.taxableDividends / 2, 6);
    // 22% instead of 15% on about $20,000.
    expect(o.federalTax - q.federalTax).toBeCloseTo(q.taxableDividends * 0.07, -1);
    expect(half.federalTax - q.federalTax).toBeCloseTo((o.federalTax - q.federalTax) / 2, -1);
  });

  it('moves nothing else: the state, IRMAA income and Social Security see the same total either way', () => {
    const q = y0(100);
    const o = y0(0);
    // California taxes every dividend as ordinary income already.
    expect(o.stateTax).toBeCloseTo(q.stateTax, 6);
    expect(o.irmaaMagi).toBeCloseTo(q.irmaaMagi, 6);
    // ...including the MAGI the year's premium is priced on before the solve.
    expect(o.irmaaBasisMagi).toBeCloseTo(q.irmaaBasisMagi, 6);
  });

  it('the ordinary share still owes the 3.8% investment tax', () => {
    // $400k salary: well over the NIIT threshold, in the 35% bracket, with
    // $50,000 of distributions at 15% qualified. Moving it all to ordinary
    // costs 35% - 15% = 20 points -- no more, no less: the 3.8% applies
    // either way.
    const rich = { ...worker, salary1: 400000, taxableInit: 1000000, taxableDividendYield: 5 };
    const q = runProjection({ ...rich, taxableQualifiedDividendFollowsAllocation: false, taxableQualifiedDividendPct: 100 }).years[0];
    const o = runProjection({ ...rich, taxableQualifiedDividendFollowsAllocation: false, taxableQualifiedDividendPct: 0 }).years[0];
    expect((o.federalTax - q.federalTax) / q.taxableDividends).toBeCloseTo(0.20, 2);
  });

  it('the ordinary share takes up Roth-conversion bracket room, and ACA headroom the same as before', () => {
    const retiree = {
      ...DEFAULT_INPUTS, birthYear1: START - 62, retireAge1: 60, claimingAge1: 70, ss1: 30000, salary1: 0,
      taxableInit: 600000, taxableDividendYield: 4, preTaxInit: 1500000, rothInit: 0, lifestyleExpense: 50000,
      rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.22,
      acaCliffProtectionEnabled: false, // tests another mechanism; Cliff Protection is on by default since 443
    };
    const q = runProjection({ ...retiree, taxableQualifiedDividendFollowsAllocation: false, taxableQualifiedDividendPct: 100 }).years[0];
    const o = runProjection({ ...retiree, taxableQualifiedDividendFollowsAllocation: false, taxableQualifiedDividendPct: 0 }).years[0];
    expect(o.ordinaryDividends).toBeGreaterThan(20000);
    expect(q.convertAmount - o.convertAmount).toBeCloseTo(o.ordinaryDividends, -1);
    // The ACA cliff cap: MAGI counts every dividend either way.
    const aca = { ...retiree, rothConversionStrategy: 'fixed', rothConversionAmount: 400000, acaCliffProtectionEnabled: true };
    const aq = runProjection({ ...aca, taxableQualifiedDividendFollowsAllocation: false, taxableQualifiedDividendPct: 100 }).years[0];
    const ao = runProjection({ ...aca, taxableQualifiedDividendFollowsAllocation: false, taxableQualifiedDividendPct: 0 }).years[0];
    expect(aq.acaCliffCappedConversion).toBeGreaterThan(0);
    expect(ao.convertAmount).toBeCloseTo(aq.convertAmount, 6);
  });

  it('a country abroad taxes the same dividends whichever US rate applies', () => {
    const away = {
      ...worker, residencyTimeline: [{ id: 'f', fromYear: START, kind: 'foreign', countryName: 'X', stateDomicileSevered: true,
        foreign: { ordinaryRate: 10, investmentRate: 30, roth: 'respect', treatyResourcing: true } }],
    };
    const q = runProjection({ ...away, taxableQualifiedDividendFollowsAllocation: false, taxableQualifiedDividendPct: 100 }).years[0];
    const o = runProjection({ ...away, taxableQualifiedDividendFollowsAllocation: false, taxableQualifiedDividendPct: 0 }).years[0];
    expect(q.foreignLocalTax).toBeGreaterThan(0);
    expect(o.foreignLocalTax).toBeCloseTo(q.foreignLocalTax, 2);
  });

  it('counts the ordinary share in Social Security provisional income and the 3.8% investment tax base', () => {
    const retiree = {
      ...DEFAULT_INPUTS, birthYear1: START - 70, retireAge1: 60, claimingAge1: 67, ss1: 30000, salary1: 0,
      taxableInit: 2000000, taxableDividendYield: 5, preTaxInit: 0, rothInit: 0, lifestyleExpense: 40000,
    };
    const q = runProjection({ ...retiree, taxableQualifiedDividendFollowsAllocation: false, taxableQualifiedDividendPct: 100 }).years[0];
    const o = runProjection({ ...retiree, taxableQualifiedDividendFollowsAllocation: false, taxableQualifiedDividendPct: 0 }).years[0];
    expect(o.taxableSS).toBeCloseTo(q.taxableSS, 6);
    expect(q.taxableSS).toBeGreaterThan(0);
    expect(o.federalTax).toBeGreaterThan(q.federalTax);
  });
});

describe('computeTaxableDistributionYield', () => {
  const asOfDate = new Date('2026-06-15T00:00:00Z');
  // $100k taxable fund paying a $1,000/yr dividend = 1.00% on dividends alone.
  const fund = (overrides = {}) => createHolding({
    symbol: 'PRDGX', taxTreatment: 'taxable', shares: 1000, currentPrice: 100,
    annualDividendPerShare: 1, ...overrides,
  });

  it('lifts the yield by a capital gain distribution the dividend rate cannot see', () => {
    const h = fund();
    h.distributionEvents = [
      createDistributionEvent({ date: '2025-12-15', type: 'capitalGainDistribution', grossAmount: 8000 }),
      createDistributionEvent({ date: '2025-06-15', type: 'dividend', grossAmount: 1000 }),
    ];
    const res = computeTaxableDistributionYield([h], { asOfDate });
    // $9,000 actually distributed beats the $1,000 dividend estimate.
    expect(res.basisYear).toBe(2025);
    expect(res.yield).toBeCloseTo(0.09, 6);
    expect(res.dividendOnlyYield).toBeCloseTo(0.01, 6);
    expect(res.uplifted.map((u) => u.symbol)).toEqual(['PRDGX']);
  });

  it('EXCLUDES return of capital -- it is not income, it reduces basis', () => {
    const byType = fund();
    byType.distributionEvents = [
      createDistributionEvent({ date: '2025-12-15', type: 'returnOfCapital', grossAmount: 8000 }),
    ];
    expect(computeTaxableDistributionYield([byType], { asOfDate }).yield).toBeCloseTo(0.01, 6);

    // A reinvestment lot records no type, so the holding's declared
    // Distribution Character is the only thing that can say it is ROC.
    // NB: once a holding has lots, shares and market value come from the
    // lots -- so these keep the same 1,000 shares / $100k as `fund()`.
    const withLots = (h) => {
      h.lots = [
        createLot({ date: '2020-01-02', shares: 920, pricePerShare: 100, source: 'purchase' }),
        createLot({ date: '2025-12-15', shares: 80, pricePerShare: 100, source: 'drip' }),
      ];
      return h;
    };
    const byCharacter = withLots(fund({ distributionCharacter: 'returnOfCapital' }));
    // Neither the reinvestment nor (changelog 208) the forward estimate of
    // a Return of Capital fund is income.
    expect(computeTaxableDistributionYield([byCharacter], { asOfDate }).yield).toBe(0);

    // ...and the same lot on a normal fund DOES count: $8,000 reinvested.
    const normal = withLots(fund());
    expect(computeTaxableDistributionYield([normal], { asOfDate }).yield).toBeCloseTo(0.08, 6);
  });

  it('a payment logged as a Dividend on a Return of Capital fund is ROC too (changelog 205)', () => {
    const roc = fund({ distributionCharacter: 'returnOfCapital', annualDividendPerShare: 0 });
    roc.distributionEvents = [
      createDistributionEvent({ date: '2025-06-15', type: 'dividend', grossAmount: 6000 }),
      createDistributionEvent({ date: '2025-09-15', type: 'other', grossAmount: 2000 }),
    ];
    expect(computeTaxableDistributionYield([roc], { asOfDate }).yield).toBe(0);
    const plain = fund({ distributionCharacter: 'ordinaryDividend', annualDividendPerShare: 0 });
    plain.distributionEvents = roc.distributionEvents;
    expect(computeTaxableDistributionYield([plain], { asOfDate }).yield).toBeCloseTo(0.08, 6);
  });

  it('reports the qualified share of the income from each holding\'s character (changelog 208)', () => {
    // $1,000 estimate each; FUND2 also logged $4,000 of interest.
    const q = fund({ symbol: 'Q', distributionCharacter: 'qualifiedDividend' });
    const o = fund({ symbol: 'O', distributionCharacter: 'ordinaryDividend' });
    const u = fund({ symbol: 'U' }); // Kind not stated: qualified, by choice
    const m = fund({ symbol: 'M', distributionCharacter: 'mixed' }); // counts half (changelog 442)
    expect(computeTaxableDistributionYield([q, o, u, m], { asOfDate }).qualifiedShare).toBeCloseTo(0.625, 6);
    const i = fund({ symbol: 'I', distributionCharacter: 'qualifiedDividend' });
    i.distributionEvents = [
      createDistributionEvent({ date: '2025-06-15', type: 'interest', grossAmount: 4000 }),
      createDistributionEvent({ date: '2025-12-15', type: 'capitalGainDistribution', grossAmount: 1000 }),
    ];
    // I: actual $5,000 beats its $1,000 estimate, $4,000 of it ordinary.
    const r = computeTaxableDistributionYield([q, i], { asOfDate });
    expect(r.yield).toBeCloseTo(6000 / 200000, 6);
    expect(r.qualifiedShare).toBeCloseTo(1 - 4000 / 6000, 6);
    // A logged dividend on an Ordinary fund is ordinary.
    const od = fund({ symbol: 'OD', distributionCharacter: 'ordinaryDividend', annualDividendPerShare: 0 });
    od.distributionEvents = [createDistributionEvent({ date: '2025-06-15', type: 'dividend', grossAmount: 3000 })];
    expect(computeTaxableDistributionYield([od, q], { asOfDate }).qualifiedShare).toBeCloseTo(1000 / 4000, 6);
    // Nothing distributed: 100% qualified, never a divide by zero.
    expect(computeTaxableDistributionYield([fund({ annualDividendPerShare: 0 })], { asOfDate }).qualifiedShare).toBe(1);
  });

  it('never lets partial logging LOWER a holding below its dividend estimate', () => {
    // One quarter logged out of four: actuals are the thinner picture, and
    // understating taxable income is the expensive direction to be wrong.
    const h = fund();
    h.distributionEvents = [createDistributionEvent({ date: '2025-03-31', type: 'dividend', grossAmount: 250 })];
    const res = computeTaxableDistributionYield([h], { asOfDate });
    expect(res.yield).toBeCloseTo(0.01, 6);
    expect(res.uplifted).toEqual([]);
  });

  it('ignores anything sheltered -- an IRA capital gain never reaches the plan', () => {
    const ira = fund({ symbol: 'FSELX', taxTreatment: 'preTax' });
    ira.distributionEvents = [createDistributionEvent({ date: '2025-04-30', type: 'capitalGainDistribution', grossAmount: 32000 })];
    const brokerage = fund();
    const res = computeTaxableDistributionYield([ira, brokerage], { asOfDate });
    expect(res.yield).toBeCloseTo(0.01, 6);
    expect(res.uplifted).toEqual([]);
  });

  it('uses only a COMPLETE past year, and the most recent one with records', () => {
    const h = fund();
    h.distributionEvents = [
      createDistributionEvent({ date: '2024-12-15', type: 'capitalGainDistribution', grossAmount: 5000 }),
      createDistributionEvent({ date: '2025-12-15', type: 'capitalGainDistribution', grossAmount: 8000 }),
      // This year is still running -- counting it would understate.
      createDistributionEvent({ date: '2026-01-15', type: 'capitalGainDistribution', grossAmount: 99000 }),
    ];
    const res = computeTaxableDistributionYield([h], { asOfDate });
    expect(res.basisYear).toBe(2025);
    expect(res.yield).toBeCloseTo(0.08, 6);
  });

  it('falls back to the dividend estimate when nothing is recorded, and reports null with no taxable holdings', () => {
    const res = computeTaxableDistributionYield([fund()], { asOfDate });
    expect(res.basisYear).toBeNull();
    expect(res.yield).toBeCloseTo(0.01, 6);
    expect(res.yield).toBeCloseTo(computeTaxableDividendYield([fund()]), 10);

    expect(computeTaxableDistributionYield([], { asOfDate })).toBeNull();
    expect(computeTaxableDistributionYield([fund({ taxTreatment: 'roth' })], { asOfDate })).toBeNull();
  });

  it('honours excludeHoldingIds, like the dividends-only yield it replaces', () => {
    const a = fund();
    const b = fund({ symbol: 'BBB' });
    b.distributionEvents = [createDistributionEvent({ date: '2025-12-15', type: 'capitalGainDistribution', grossAmount: 8000 })];
    const res = computeTaxableDistributionYield([a, b], { asOfDate, excludeHoldingIds: [b.id] });
    expect(res.yield).toBeCloseTo(0.01, 6);
  });
});
