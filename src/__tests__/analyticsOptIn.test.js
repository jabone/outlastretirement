// Usage analytics opt-in (changelog 149): off by default, device-local.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('analyticsOptIn', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it('defaults to OFF when nothing is stored', async () => {
    const mod = await import('../utils/analyticsOptIn.js');
    expect(mod.isAnalyticsEnabled()).toBe(false);
  });

  it('setAnalyticsEnabled(true) persists and notifies subscribers; false clears', async () => {
    const mod = await import('../utils/analyticsOptIn.js');
    let seen = null;
    const unsub = mod.subscribeAnalyticsEnabled((v) => { seen = v; });
    mod.setAnalyticsEnabled(true);
    expect(mod.isAnalyticsEnabled()).toBe(true);
    expect(seen).toBe(true);
    expect(localStorage.getItem('cfe_analytics_opt_in')).toBe('1');
    mod.setAnalyticsEnabled(false);
    expect(mod.isAnalyticsEnabled()).toBe(false);
    expect(localStorage.getItem('cfe_analytics_opt_in')).toBeNull();
    unsub();
  });

  it('reads an existing opt-in from storage at module load', async () => {
    localStorage.setItem('cfe_analytics_opt_in', '1');
    const mod = await import('../utils/analyticsOptIn.js');
    expect(mod.isAnalyticsEnabled()).toBe(true);
  });
});
