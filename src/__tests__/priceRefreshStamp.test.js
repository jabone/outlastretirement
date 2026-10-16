// The "Last refreshed ..." line beside Refresh Prices & Dividends. A
// successful refresh used to say nothing at all, so the only way to know it
// had worked was to read the status marks.
import { describe, it, expect } from 'vitest';
import {
  PRICE_REFRESH_KEY, saveLastPriceRefresh, loadLastPriceRefresh, formatLastPriceRefresh,
} from '../utils/priceRefreshStamp';


function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

describe('formatLastPriceRefresh', () => {
  const now = new Date(2026, 8, 28, 17, 0);
  it('says today, yesterday, a date, or a date with the year', () => {
    expect(formatLastPriceRefresh(new Date(2026, 8, 28, 16, 41), now, 'en-US')).toBe('Last refreshed today at 4:41 PM');
    expect(formatLastPriceRefresh(new Date(2026, 8, 27, 9, 5), now, 'en-US')).toBe('Last refreshed yesterday at 9:05 AM');
    expect(formatLastPriceRefresh(new Date(2026, 8, 20, 9, 5), now, 'en-US')).toBe('Last refreshed Sep 20 at 9:05 AM');
    expect(formatLastPriceRefresh(new Date(2025, 8, 27, 9, 5), now, 'en-US')).toBe('Last refreshed Sep 27, 2025 at 9:05 AM');
  });
  it('treats yesterday across a month boundary as yesterday', () => {
    expect(formatLastPriceRefresh(new Date(2026, 8, 30, 22, 0), new Date(2026, 9, 1, 8, 0), 'en-US')).toBe('Last refreshed yesterday at 10:00 PM');
  });
  it('shows nothing with no refresh on record', () => {
    expect(formatLastPriceRefresh(null, now)).toBe('');
  });
});

describe('saving and loading the stamp', () => {
  it('round-trips through storage', () => {
    const s = memoryStorage();
    const at = new Date(2026, 8, 28, 16, 41, 12);
    saveLastPriceRefresh(at, s);
    expect(s.getItem(PRICE_REFRESH_KEY)).toBe(at.toISOString());
    expect(loadLastPriceRefresh(s).getTime()).toBe(at.getTime());
  });
  it('returns null for nothing saved, junk, or storage that throws', () => {
    expect(loadLastPriceRefresh(memoryStorage())).toBeNull();
    const junk = memoryStorage(); junk.setItem(PRICE_REFRESH_KEY, 'not a date');
    expect(loadLastPriceRefresh(junk)).toBeNull();
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadLastPriceRefresh(broken)).toBeNull();
    expect(() => saveLastPriceRefresh(new Date(), broken)).not.toThrow();
  });
});
