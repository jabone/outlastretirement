// @vitest-environment jsdom
//
// The month chart's click target is the whole column, not the bar: a month
// worth a few dollars draws a bar a pixel or two high next to one worth
// $30k, and clicking it did nothing while the tall months worked. Recharts
// resolves the clicked column for us, but hands the index back as a STRING
// -- a `typeof === 'number'` guard therefore rejected every click and the
// chart silently stopped responding, with nothing thrown to notice.
//
// jsdom gives Recharts no layout to hit-test against, so a rendered click
// can't exercise this. resolveChartMonthIndex is exported precisely so the
// coercion can be pinned down directly.
import { describe, it, expect } from 'vitest';
import { resolveChartMonthIndex } from '../../components/chartMonthIndex';

// A rolling window, so rows are identified by their 'YYYY-MM' key rather
// than by position: position 1 means a different month next month.
const data = [
  { key: '2025-12', label: "Dec '25", value: 0 },
  { key: '2026-01', label: "Jan '26", value: 1 },
  { key: '2026-02', label: 'Feb', value: 32186 },
];

describe('resolveChartMonthIndex', () => {
  it("accepts Recharts' STRING activeTooltipIndex -- the bug that made short bars unclickable", () => {
    expect(resolveChartMonthIndex({ activeTooltipIndex: '1' }, data)).toBe('2026-01');
  });

  it('accepts a numeric index too', () => {
    expect(resolveChartMonthIndex({ activeTooltipIndex: 2 }, data)).toBe('2026-02');
  });

  it('resolves a near-zero month exactly like a tall one -- the value plays no part', () => {
    // Jan is worth $1 and Feb $32,186; both resolve from their column.
    expect(resolveChartMonthIndex({ activeTooltipIndex: '1' }, data)).toBe('2026-01');
    expect(resolveChartMonthIndex({ activeTooltipIndex: '2' }, data)).toBe('2026-02');
  });

  it("returns the ROW's own month key, never the array position", () => {
    // The window rolls, so position 0 is a different month next month.
    const partial = [{ key: '2026-08', label: 'Aug', value: 5 }];
    expect(resolveChartMonthIndex({ activeTooltipIndex: '0' }, partial)).toBe('2026-08');
  });

  it('returns null for a click that landed on nothing', () => {
    expect(resolveChartMonthIndex(null, data)).toBeNull();
    expect(resolveChartMonthIndex({}, data)).toBeNull();
    expect(resolveChartMonthIndex({ activeTooltipIndex: 'nope' }, data)).toBeNull();
    expect(resolveChartMonthIndex({ activeTooltipIndex: '-1' }, data)).toBeNull();
    expect(resolveChartMonthIndex({ activeTooltipIndex: '9' }, data)).toBeNull();
    expect(resolveChartMonthIndex({ activeTooltipIndex: '0' }, [{ label: 'no key' }])).toBeNull();
    expect(resolveChartMonthIndex({ activeTooltipIndex: '0' }, null)).toBeNull();
  });
});
