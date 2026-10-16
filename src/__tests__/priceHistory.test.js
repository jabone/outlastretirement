// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { withPriceSnapshot, computeBenchmarkTrajectory, createHolding, describePriceSnapshotSource, localIsoDate, parsePtaLedgerEntries } from '../utils/portfolioHoldings.js';
import { usePortfolioHoldings } from '../context/usePortfolioHoldings';

describe('withPriceSnapshot', () => {
  it('appends a dated snapshot, replacing an earlier one from the same day, sorted by date', () => {
    const h = { priceSnapshots: [{ id: 'a', date: '2026-01-05', price: 10 }] };
    const once = withPriceSnapshot(h, 12, '2026-03-01', 'refresh');
    expect(once.map((s) => [s.date, s.price])).toEqual([['2026-01-05', 10], ['2026-03-01', 12]]);
    const again = withPriceSnapshot({ priceSnapshots: once }, 12.5, '2026-03-01', 'refresh');
    expect(again.map((s) => [s.date, s.price])).toEqual([['2026-01-05', 10], ['2026-03-01', 12.5]]);
    expect(again[1].source).toBe('refresh');
  });

  it('ignores a non-positive price or malformed date', () => {
    expect(withPriceSnapshot({ priceSnapshots: [] }, 0, '2026-03-01')).toEqual([]);
    expect(withPriceSnapshot({ priceSnapshots: [] }, 5, 'March 1')).toEqual([]);
  });
});

describe('price history accumulates at the cadence the user updates prices', () => {
  it('Refresh, manual edits and adds all record one snapshot per day; a Refresh-supplied snapshot list is left alone', () => {
    localStorage.clear();
    const { result } = renderHook(() => usePortfolioHoldings(true));
    act(() => { result.current.addHoldings([{ id: 'h1', symbol: 'FSELX', shares: 10, currentPrice: 50 }]); });
    let h = result.current.holdings.find((x) => x.id === 'h1');
    expect(h.priceSnapshots).toHaveLength(1);
    expect(h.priceSnapshots[0].price).toBe(50);
    expect(h.priceSnapshots[0].source).toBe('added');

    act(() => { result.current.updateHolding('h1', { currentPrice: 51 }, { silent: true }); });
    h = result.current.holdings.find((x) => x.id === 'h1');
    // Same day -> replaced, not appended.
    expect(h.priceSnapshots).toHaveLength(1);
    expect(h.priceSnapshots[0].price).toBe(51);
    expect(h.priceSnapshots[0].source).toBe('refresh');

    act(() => { result.current.updateHolding('h1', { name: 'renamed' }); });
    expect(result.current.holdings.find((x) => x.id === 'h1').priceSnapshots).toHaveLength(1);
  });

  it('an import says where its price came from, instead of passing for a hand edit', () => {
    localStorage.clear();
    const { result } = renderHook(() => usePortfolioHoldings(true));
    act(() => { result.current.addHoldings([{ id: 'h1', symbol: 'YMAX', shares: 10, currentPrice: 7.53 }], { priceSource: 'statement' }); });
    expect(result.current.holdings[0].priceSnapshots[0].source).toBe('statement');
    act(() => { result.current.updateHolding('h1', { currentPrice: 7.57 }, { priceSource: 'statement' }); });
    expect(result.current.holdings[0].priceSnapshots[0].source).toBe('statement');
    act(() => { result.current.updateHolding('h1', { currentPrice: 7.6 }); });
    expect(result.current.holdings[0].priceSnapshots[0].source).toBe('manual');
  });
});

describe('Price History Snapshots: the Source column', () => {
  // The Ledger rendered `snap.label`, a field only the Portfolio Tracker
  // import ever wrote -- every Refresh, manual edit and statement import
  // stored `source` instead, so the column read "--" for all of them.
  it('names every writer the app has', () => {
    expect(describePriceSnapshotSource({ source: 'refresh' })).toBe('Live price (Google Sheet)');
    expect(describePriceSnapshotSource({ source: 'manual' })).toBe('Manual entry');
    expect(describePriceSnapshotSource({ source: 'added' })).toBe('Price when added');
    expect(describePriceSnapshotSource({ source: 'statement' })).toBe('Statement import');
    expect(describePriceSnapshotSource({ source: 'csv' })).toBe('CSV upload');
  });

  it('reads a Portfolio Tracker snapshot, new (tagged) or old (label only)', () => {
    const { priceSnapshots } = parsePtaLedgerEntries([{ id: 'e1', date: '2026-01-02', type: 'Price Update', sharesAdded: 0, navPrice: 9.5 }]);
    expect(priceSnapshots[0].source).toBe('pta');
    expect(describePriceSnapshotSource(priceSnapshots[0])).toBe('Portfolio Tracker import (Price Update)');
    expect(describePriceSnapshotSource({ label: 'Price Update' })).toBe('Portfolio Tracker import (Price Update)');
  });

  it('says so plainly when nothing was recorded', () => {
    expect(describePriceSnapshotSource({ date: '2026-01-02', price: 5 })).toBe('Not recorded');
  });
});

describe('snapshot dates are the user\'s local day, not UTC', () => {
  it('an evening update in a UTC-5 zone keeps its own date', () => {
    // 2026-09-18 23:09 local, built from local fields so the test holds in any TZ.
    expect(localIsoDate(new Date(2026, 8, 18, 23, 9))).toBe('2026-09-18');
    expect(localIsoDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });
});

describe('computeBenchmarkTrajectory reconstructs the portfolio line from lots and snapshots', () => {
  const asOf = new Date('2026-09-09T12:00:00Z');
  const fselx = createHolding({
    symbol: 'FSELX', shares: 300, currentPrice: 60,
    lots: [
      { id: 'l1', date: '2021-06-30', shares: 100, pricePerShare: 20, source: 'purchase' },
      { id: 'l2', date: '2022-06-30', shares: 100, pricePerShare: 25, source: 'drip' },
      { id: 'l3', date: '2023-06-30', shares: 100, pricePerShare: 30, source: 'drip' },
    ],
    priceSnapshots: [{ id: 's1', date: '2024-12-15', price: 40 }, { id: 's2', date: '2025-12-15', price: 50 }],
  });

  it('values each year-end at shares held then x last known price, full coverage, and today exactly', () => {
    const t = computeBenchmarkTrajectory([fselx], asOf);
    const byYear = Object.fromEntries(t.points.map((p) => [p.year, p]));
    expect(byYear[2021].portfolioValue).toBeCloseTo(100 * 20, 6);
    expect(byYear[2022].portfolioValue).toBeCloseTo(200 * 25, 6);
    expect(byYear[2023].portfolioValue).toBeCloseTo(300 * 30, 6);
    expect(byYear[2024].portfolioValue).toBeCloseTo(300 * 40, 6);   // snapshot, no lot that year
    expect(byYear[2025].portfolioValue).toBeCloseTo(300 * 50, 6);
    expect(byYear[2026].portfolioValue).toBeCloseTo(300 * 60, 6);   // today = live price
    expect(t.points.every((p) => p.coverage === 1)).toBe(true);
  });

  it('reports partial coverage when another holding has no usable price history for that year', () => {
    const bare = createHolding({ symbol: 'AAPL', shares: 10, avgBuyPrice: 100, currentPrice: 200, purchaseDate: '2021-01-15' });
    const t = computeBenchmarkTrajectory([fselx, bare], asOf);
    const byYear = Object.fromEntries(t.points.map((p) => [p.year, p]));
    // 2021: AAPL's purchase price (Jan) is within the staleness window -> both covered.
    expect(byYear[2021].coverage).toBeCloseTo(1, 6);
    // 2023: AAPL's only price is 2.5 years old -> stale, excluded: FSELX's
    // $7,500 of $8,500 invested by then.
    expect(byYear[2023].coverage).toBeCloseTo(7500 / 8500, 6);
    expect(byYear[2023].portfolioValue).toBeCloseTo(300 * 30, 6);
    expect(byYear[2026].coverage).toBe(1);
  });
});
