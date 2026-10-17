// @vitest-environment jsdom
// Account activity for a period (utils/reconciliation.js): what was held when
// it opened, what happened, what was held when it closed -- rebuilt from
// lots, distribution events, sales and recorded prices, to be checked
// against a brokerage statement.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  periodFor, periodContaining, recentPeriods, dayBefore, buildReconciliation, PERIOD_KINDS,
  readReconciliations, markReconciled, unmarkReconciled, sanitizeReconciliations, RECONCILIATION_KEY,
  statementCadences, cadenceOf, statementCovers, setStatementCadence,
} from '../utils/reconciliation';
import { createHolding, createLot, createDistributionEvent, createLiquidation, applyLiquidationToHolding } from '../utils/portfolioHoldings';

const Q3 = periodFor('quarter', 2026, 3);
const TODAY = '2026-10-05';
const snap = (date, price) => ({ id: `s-${date}`, date, price, source: 'statement' });
// Sells through the app's own functions, so the holding and the sale record
// are exactly what the app would have stored.
function sell(holding, shares, price, date) {
  const sale = createLiquidation(holding, { sharesToSell: shares, salePricePerShare: price, saleDate: new Date(`${date}T12:00:00Z`) });
  return { holding: applyLiquidationToHolding(holding, sale).updatedHolding, sale };
}
const only = (report) => { expect(report).toHaveLength(1); return report[0]; };

describe('periods', () => {
  it('a month, a quarter and a year have the right first and last days', () => {
    expect(periodFor('month', 2028, 2)).toMatchObject({ key: '2028-02', start: '2028-02-01', end: '2028-02-29', label: 'February 2028' });
    expect(periodFor('month', 2026, 2).end).toBe('2026-02-28');
    expect(Q3).toMatchObject({ key: '2026-Q3', start: '2026-07-01', end: '2026-09-30', label: 'Q3 2026 (July to September)' });
    expect(periodFor('quarter', 2026, 4)).toMatchObject({ start: '2026-10-01', end: '2026-12-31' });
    expect(periodFor('year', 2026)).toMatchObject({ key: '2026', start: '2026-01-01', end: '2026-12-31', label: '2026' });
  });

  it('finds the period a date falls in', () => {
    expect(periodContaining('month', '2026-10-05').key).toBe('2026-10');
    expect(periodContaining('quarter', '2026-10-05').key).toBe('2026-Q4');
    expect(periodContaining('quarter', '2026-03-31').key).toBe('2026-Q1');
    expect(periodContaining('year', '2026-10-05').key).toBe('2026');
  });

  it('lists recent periods newest first, the one in progress marked, across a year end', () => {
    const months = recentPeriods('month', '2026-02-10', 4);
    expect(months.map((p) => p.key)).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
    expect(months.map((p) => p.inProgress)).toEqual([true, false, false, false]);
    expect(recentPeriods('quarter', '2026-02-10', 3).map((p) => p.key)).toEqual(['2026-Q1', '2025-Q4', '2025-Q3']);
    expect(recentPeriods('year', '2026-02-10', 2).map((p) => p.key)).toEqual(['2026', '2025']);
  });

  it('the day before the first of a month is the last of the one before', () => {
    expect(dayBefore('2026-07-01')).toBe('2026-06-30');
    expect(dayBefore('2026-01-01')).toBe('2025-12-31');
    expect(PERIOD_KINDS.map((k) => k.value)).toEqual(['month', 'quarter', 'year']);
  });
});

describe('a position with lots, a reinvestment, a cash dividend and two sales', () => {
  // 100 bought in January; 2 reinvested in August; $30 cash in September;
  // 20 sold in September; 10 more sold in October (after the quarter).
  let holding = createHolding({
    symbol: 'AAA', name: 'Example Fund', account: 'Brokerage', institution: 'Example', taxTreatment: 'taxable', currentPrice: 14,
    lots: [createLot({ date: '2026-01-10', shares: 100, pricePerShare: 10, source: 'purchase' }), createLot({ date: '2026-08-15', shares: 2, pricePerShare: 12, source: 'drip' })],
    distributionEvents: [
      createDistributionEvent({ date: '2026-08-15', type: 'dividend', grossAmount: 24, destination: 'drip', sharesAdded: 2, navPrice: 12 }),
      createDistributionEvent({ date: '2026-09-20', type: 'capitalGainDistribution', grossAmount: 30, destination: 'cash' }),
    ],
    priceSnapshots: [snap('2026-06-30', 11), snap('2026-09-30', 13.5)],
  });
  const first = sell(holding, 20, 13, '2026-09-25');
  const second = sell(first.holding, 10, 14, '2026-10-02');
  holding = second.holding;
  const liquidations = [first.sale, second.sale];
  const account = only(buildReconciliation({ holdings: [holding], liquidations, period: Q3, today: TODAY }));
  const row = account.rows[0];

  it('the lots on the holding today are what is left after both sales', () => {
    expect(holding.lots.map((l) => l.shares)).toEqual([70, 2]);
  });

  it('opens with the shares held the day before, putting back what later sales took', () => {
    expect(row.opening).toEqual({ shares: 100, price: 11, priceDate: '2026-06-30', value: 1100 });
  });

  it('closes with the shares held on the last day, at the price recorded that day', () => {
    expect(row.closing).toEqual({ shares: 82, price: 13.5, priceDate: '2026-09-30', value: 1107 });
  });

  it('lists what happened in between, in date order, and nothing from outside the period', () => {
    expect(row.activity.map((a) => [a.date, a.kind, a.shares, a.amount])).toEqual([
      ['2026-08-15', 'reinvest', 2, 24],
      ['2026-09-20', 'cash', 0, 30],
      ['2026-09-25', 'sale', -20, 260],
    ]);
    expect(row.activity[0].label).toBe('Dividend reinvested');
    expect(row.activity[1].label).toBe('Capital Gain Distribution paid in cash');
    expect(row.activity[2]).toMatchObject({ price: 13, realizedGain: 60 });
  });

  it('a reinvestment logged as both an event and a lot is one line, not two', () => {
    expect(row.activity.filter((a) => a.kind === 'reinvest')).toHaveLength(1);
  });

  it('the account totals tie out: opening + money in - sales + market change = closing', () => {
    const t = account.totals;
    expect(t).toMatchObject({ openingValue: 1100, purchases: 0, reinvested: 24, cashDistributions: 30, sales: 260, closingValue: 1107, unpriced: 0, activityCount: 3 });
    expect(t.marketChange).toBe(243);
    expect(t.openingValue + t.purchases + t.reinvested - t.sales + t.marketChange).toBe(t.closingValue);
    expect(account).toMatchObject({ account: 'Brokerage', institution: 'Example', taxTreatments: ['taxable'] });
  });

  it('the next quarter opens where this one closed, and shows the October sale', () => {
    const q4 = only(buildReconciliation({ holdings: [holding], liquidations, period: periodFor('quarter', 2026, 4), today: TODAY })).rows[0];
    expect(q4.opening.shares).toBe(82);
    expect(q4.opening.value).toBe(1107);
    expect(q4.activity.map((a) => [a.date, a.kind, a.shares])).toEqual([['2026-10-02', 'sale', -10]]);
    expect(q4.closing.shares).toBe(72);
    // Nothing recorded on 31 December yet: the latest known price stands.
    expect(q4.closing.price).toBe(14);
  });

  it('the January purchase shows in the first quarter, at its full original size', () => {
    const q1 = only(buildReconciliation({ holdings: [holding], liquidations, period: periodFor('quarter', 2026, 1), today: TODAY })).rows[0];
    expect(q1.opening.shares).toBe(0);
    expect(q1.activity).toEqual([expect.objectContaining({ date: '2026-01-10', kind: 'purchase', shares: 100, price: 10, amount: 1000, label: 'Purchase' })]);
    expect(q1.closing.shares).toBe(100);
  });
});

describe('a reinvestment recorded twice', () => {
  // the owner, 2026-10-05: one 5.737-share reinvestment was on file as two lots
  // the same day (one typed in, one from the statement, their prices a
  // rounding apart), so the report closed 5.737 shares above the statement.
  const twice = () => createHolding({
    symbol: 'DUP', account: 'Brokerage', currentPrice: 32,
    lots: [
      createLot({ date: '2026-09-02', shares: 700, pricePerShare: 35 }),
      createLot({ date: '2026-09-28', shares: 5.5, pricePerShare: 33.1271, source: 'drip' }),
      createLot({ date: '2026-09-28', shares: 5.5, pricePerShare: 33.1273, source: 'drip' }),
    ],
    distributionEvents: [createDistributionEvent({ date: '2026-09-28', grossAmount: 182.2, destination: 'drip', sharesAdded: 5.5, navPrice: 33.1273 })],
  });
  it('both lines say so, and the purchase does not', () => {
    const row = only(buildReconciliation({ holdings: [twice()], period: Q3, today: TODAY })).rows[0];
    expect(row.activity.map((a) => [a.kind, a.duplicateOf])).toEqual([['purchase', null], ['reinvest', '2026-09-28'], ['reinvest', '2026-09-28']]);
    expect(row.possibleDuplicates).toBe(true);
    expect(row.closing.shares).toBeCloseTo(711, 6);
  });
  it('a position with nothing doubled is not flagged', () => {
    const h = twice();
    const row = only(buildReconciliation({ holdings: [{ ...h, lots: h.lots.slice(0, 2) }], period: Q3, today: TODAY })).rows[0];
    expect(row.activity.every((a) => a.duplicateOf === null)).toBe(true);
    expect(row.possibleDuplicates).toBe(false);
  });
});

describe('a position sold in full, which the app has since removed', () => {
  const start = createHolding({ symbol: 'ZZZ', account: 'Brokerage', taxTreatment: 'taxable', lots: [createLot({ date: '2025-01-05', shares: 5, pricePerShare: 15 })] });
  const { sale } = sell(start, 5, 20, '2026-08-01');

  it('still appears in the period it was sold in, rebuilt from the sale', () => {
    const row = only(buildReconciliation({ holdings: [], liquidations: [sale], period: Q3, today: TODAY })).rows[0];
    expect(row).toMatchObject({ symbol: 'ZZZ', holdingId: null, closed: true });
    expect(row.opening).toMatchObject({ shares: 5, price: 15, value: 75 });
    expect(row.activity).toEqual([expect.objectContaining({ kind: 'sale', shares: -5, amount: 100 })]);
    expect(row.closing.shares).toBe(0);
  });

  it('and is gone from the periods after', () => {
    expect(buildReconciliation({ holdings: [], liquidations: [sale], period: periodFor('quarter', 2026, 4), today: TODAY })).toEqual([]);
  });
});

describe('a holding with no lots', () => {
  it('with no purchase date: held from its first recorded price, flagged as having no history', () => {
    const h = createHolding({ symbol: 'IMP', account: 'IRA', taxTreatment: 'preTax', shares: 40, currentPrice: 26, priceSnapshots: [snap('2026-09-10', 25), snap('2026-09-30', 26)] });
    const q3 = only(buildReconciliation({ holdings: [h], period: Q3, today: TODAY })).rows[0];
    expect(q3.noHistory).toBe(true);
    expect(q3.opening.shares).toBe(0);
    expect(q3.activity).toEqual([expect.objectContaining({ date: '2026-09-10', kind: 'firstRecorded', shares: 40, amount: null })]);
    expect(q3.closing).toMatchObject({ shares: 40, price: 26, value: 1040 });
    const q4 = only(buildReconciliation({ holdings: [h], period: periodFor('quarter', 2026, 4), today: TODAY })).rows[0];
    expect(q4.opening.shares).toBe(40);
    expect(q4.activity).toEqual([]);
  });

  it('with a purchase date: a purchase on that date', () => {
    const h = createHolding({ symbol: 'FLAT', account: 'IRA', shares: 10, avgBuyPrice: 50, purchaseDate: '2026-07-20', currentPrice: 55 });
    const row = only(buildReconciliation({ holdings: [h], period: Q3, today: TODAY })).rows[0];
    expect(row.noHistory).toBe(false);
    expect(row.activity).toEqual([expect.objectContaining({ kind: 'purchase', shares: 10, price: 50, amount: 500 })]);
  });

  it('reinvestments logged without lots arrive on their own dates', () => {
    const h = createHolding({
      symbol: 'DRP', account: 'IRA', shares: 102, currentPrice: 12, priceSnapshots: [snap('2026-01-02', 10), snap('2026-09-30', 12)],
      distributionEvents: [createDistributionEvent({ date: '2026-08-15', grossAmount: 24, destination: 'drip', sharesAdded: 2, navPrice: 12 })],
    });
    const row = only(buildReconciliation({ holdings: [h], period: Q3, today: TODAY })).rows[0];
    expect(row.opening.shares).toBe(100);
    expect(row.activity).toEqual([expect.objectContaining({ kind: 'reinvest', shares: 2, price: 12, amount: 24 })]);
    expect(row.closing.shares).toBe(102);
  });

  it('a sale of one is put back for the periods before it', () => {
    const start = createHolding({ symbol: 'FLAT', account: 'IRA', shares: 10, avgBuyPrice: 50, purchaseDate: '2025-03-01', currentPrice: 55 });
    const { holding, sale } = sell(start, 4, 60, '2026-08-10');
    expect(holding.shares).toBe(6);
    const row = only(buildReconciliation({ holdings: [holding], liquidations: [sale], period: Q3, today: TODAY })).rows[0];
    expect(row.opening.shares).toBe(10);
    expect(row.closing.shares).toBe(6);
  });
});

describe('what is left out, and how accounts are grouped', () => {
  const a = createHolding({ symbol: 'AAA', account: 'Brokerage', lots: [createLot({ date: '2026-01-10', shares: 1, pricePerShare: 10 })], currentPrice: 10 });
  const b = createHolding({ symbol: 'BBB', account: 'Roth', taxTreatment: 'roth', lots: [createLot({ date: '2026-01-10', shares: 1, pricePerShare: 10 })], currentPrice: 10 });
  const later = createHolding({ symbol: 'NEW', account: 'Roth', lots: [createLot({ date: '2026-10-03', shares: 1, pricePerShare: 10 })], currentPrice: 10 });
  const blank = createHolding({ symbol: 'NOACCT', account: '', lots: [createLot({ date: '2026-01-10', shares: 1, pricePerShare: 10 })], currentPrice: 10 });

  it('one entry per account, in name order, and a holding bought after the period is not in it', () => {
    const report = buildReconciliation({ holdings: [b, a, later, blank], period: Q3, today: TODAY });
    expect(report.map((r) => r.account)).toEqual(['(no account)', 'Brokerage', 'Roth']);
    expect(report[2].rows.map((r) => r.symbol)).toEqual(['BBB']);
  });

  it('one account can be asked for by itself', () => {
    expect(buildReconciliation({ holdings: [a, b], period: Q3, account: 'Roth', today: TODAY }).map((r) => r.account)).toEqual(['Roth']);
    expect(buildReconciliation({ holdings: [a, b], period: Q3, account: 'Nope', today: TODAY })).toEqual([]);
  });

  it('a position with no price on record is counted as unpriced, not valued at zero silently', () => {
    const h = createHolding({ symbol: 'NOPX', account: 'Brokerage', lots: [createLot({ date: '2026-01-10', shares: 3, pricePerShare: 0 })] });
    const acct = only(buildReconciliation({ holdings: [h], period: Q3, today: TODAY }));
    expect(acct.rows[0].closing).toMatchObject({ shares: 3, price: null, value: null });
    expect(acct.totals.unpriced).toBe(1);
  });

  it('something on the first or last day of the period is activity in it, not part of the opening', () => {
    const h = createHolding({ symbol: 'EDGE', account: 'Brokerage', currentPrice: 10, lots: [createLot({ date: '2026-07-01', shares: 4, pricePerShare: 10 }), createLot({ date: '2026-09-30', shares: 1, pricePerShare: 10 })] });
    const row = only(buildReconciliation({ holdings: [h], period: Q3, today: TODAY })).rows[0];
    expect(row.opening.shares).toBe(0);
    expect(row.activity.map((a) => a.date)).toEqual(['2026-07-01', '2026-09-30']);
    expect(row.closing.shares).toBe(5);
  });

  it('survives nothing at all', () => {
    expect(buildReconciliation({ period: Q3, today: TODAY })).toEqual([]);
    expect(buildReconciliation({ holdings: [], liquidations: null, period: Q3, today: TODAY })).toEqual([]);
  });
});

describe('the reconciled record', () => {
  beforeEach(() => localStorage.clear());

  it('is empty until the person marks something', () => {
    expect(readReconciliations()).toEqual({});
  });

  it('marks and unmarks one account for one period, leaving the others', () => {
    markReconciled('2026-Q3', 'Brokerage', new Date('2026-10-05T15:00:00Z'));
    markReconciled('2026-Q3', 'Roth', new Date('2026-10-06T15:00:00Z'));
    markReconciled('2026-09', 'Brokerage', new Date('2026-10-05T15:00:00Z'));
    expect(readReconciliations()['2026-Q3']).toEqual({ Brokerage: { at: '2026-10-05T15:00:00.000Z' }, Roth: { at: '2026-10-06T15:00:00.000Z' } });
    unmarkReconciled('2026-Q3', 'Brokerage');
    expect(readReconciliations()).toEqual({ '2026-Q3': { Roth: { at: '2026-10-06T15:00:00.000Z' } }, '2026-09': { Brokerage: { at: '2026-10-05T15:00:00.000Z' } } });
    unmarkReconciled('2026-Q3', 'Roth');
    expect(Object.keys(readReconciliations())).toEqual(['2026-09']);
  });

  it('reads garbage in storage as nothing', () => {
    localStorage.setItem(RECONCILIATION_KEY, 'not json');
    expect(readReconciliations()).toEqual({});
    localStorage.setItem(RECONCILIATION_KEY, '[1,2]');
    expect(readReconciliations()).toEqual({});
  });

  it('a restored record keeps only well-formed entries', () => {
    expect(sanitizeReconciliations({
      '2026-Q3': { Brokerage: { at: '2026-10-05T15:00:00.000Z', extra: 1 }, Bad: { at: 'yesterday' }, Worse: 'x' },
      '2026-09': { Roth: { at: '2026-10-05T15:00:00.000Z' } },
      2026: { Roth: { at: '2026-10-05T15:00:00.000Z' } },
      'not-a-period': { Roth: { at: '2026-10-05T15:00:00.000Z' } },
      '2026-13': { Roth: { at: '2026-10-05T15:00:00.000Z' } },
      '2026-Q5': [],
    })).toEqual({
      '2026-Q3': { Brokerage: { at: '2026-10-05T15:00:00.000Z' } },
      '2026-09': { Roth: { at: '2026-10-05T15:00:00.000Z' } },
      2026: { Roth: { at: '2026-10-05T15:00:00.000Z' } },
    });
    expect(sanitizeReconciliations(null)).toEqual({});
    expect(sanitizeReconciliations([])).toEqual({});
  });
});

describe('how often an account’s statement comes', () => {
  beforeEach(() => localStorage.clear());

  it('is monthly unless set, and a longer schedule only has a statement for periods at least that long', () => {
    expect(statementCadences()).toEqual({});
    expect(cadenceOf({}, 'Plan')).toBe('month');
    expect(['month', 'quarter', 'year'].map((k) => statementCovers('month', k))).toEqual([true, true, true]);
    expect(['month', 'quarter', 'year'].map((k) => statementCovers('quarter', k))).toEqual([false, true, true]);
    expect(['month', 'quarter', 'year'].map((k) => statementCovers('year', k))).toEqual([false, false, true]);
  });

  it('is stored beside the marks without disturbing them, and monthly is stored as nothing', () => {
    markReconciled('2026-Q3', 'Plan', new Date('2026-10-05T15:00:00Z'));
    setStatementCadence('Plan', 'quarter');
    setStatementCadence('Old 401(k)', 'year');
    expect(statementCadences()).toEqual({ Plan: 'quarter', 'Old 401(k)': 'year' });
    expect(cadenceOf(statementCadences(), 'Plan')).toBe('quarter');
    expect(readReconciliations()['2026-Q3']).toEqual({ Plan: { at: '2026-10-05T15:00:00.000Z' } });
    unmarkReconciled('2026-Q3', 'Plan');
    expect(statementCadences()).toEqual({ Plan: 'quarter', 'Old 401(k)': 'year' });
    setStatementCadence('Plan', 'month');
    setStatementCadence('Old 401(k)', 'weekly');
    expect(readReconciliations()).toEqual({});
  });

  it('a restored record keeps well-formed schedules and drops the rest', () => {
    expect(sanitizeReconciliations({
      statementCadence: { Plan: 'quarter', Other: 'year', Odd: 'weekly', Monthly: 'month', ['x'.repeat(201)]: 'quarter' },
      '2026-Q3': { Plan: { at: '2026-10-05T15:00:00.000Z' } },
    })).toEqual({ statementCadence: { Plan: 'quarter', Other: 'year' }, '2026-Q3': { Plan: { at: '2026-10-05T15:00:00.000Z' } } });
    expect(sanitizeReconciliations({ statementCadence: ['quarter'] })).toEqual({});
    expect(sanitizeReconciliations({ statementCadence: { Odd: 'weekly' } })).toEqual({});
  });
});
