// @vitest-environment jsdom
// Readable x-axis ticks (changelog 271).
import { describe, it, expect } from 'vitest';
import { evenYearTicks } from '../../components/chartTicks';

const years = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ year: from + i }));

describe('evenYearTicks', () => {
  it('picks the smallest step that keeps the count at or under twelve, from the first year', () => {
    expect(evenYearTicks(years(2026, 2058))).toEqual([2026, 2031, 2036, 2041, 2046, 2051, 2056]); // 33 years: step 5
    expect(evenYearTicks(years(2026, 2040))).toEqual([2026, 2028, 2030, 2032, 2034, 2036, 2038, 2040]); // 15 years: step 2
    expect(evenYearTicks(years(2026, 2033))).toEqual([2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033]);
    expect(evenYearTicks(years(2026, 2120)).length).toBeLessThanOrEqual(12);
  });

  it('adds the last year unless it would sit on top of the previous tick', () => {
    // 2026..2058 step 5 ends at 2056; 2058 is 2 away (< 2.5) so it is left off.
    expect(evenYearTicks(years(2026, 2058))).not.toContain(2058);
    // 2026..2059: 2059 is 3 away from 2056 -> added.
    expect(evenYearTicks(years(2026, 2059)).slice(-2)).toEqual([2056, 2059]);
  });

  it('never repeats a year and copes with empty data', () => {
    const t = evenYearTicks(years(2026, 2058));
    expect(new Set(t).size).toBe(t.length);
    expect(evenYearTicks([])).toBeUndefined();
  });
});
