// @vitest-environment jsdom
// The Monte Carlo result survives a reload (changelog 268).
import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_INPUTS } from '../calculator';
import { planKey, readMonteCarloCache, writeMonteCarloCache, clearMonteCarloCache, MC_CACHE_KEY } from '../utils/monteCarloCache';

beforeEach(() => localStorage.clear());

describe('planKey', () => {
  it('is the same string for equal plans whatever the field order, and differs when a value differs', () => {
    const a = { ...DEFAULT_INPUTS, salary1: 120000, retireAge1: 63 };
    const b = Object.fromEntries(Object.entries(a).reverse());
    expect(planKey(a)).toBe(planKey(b));
    expect(planKey(a)).not.toBe(planKey({ ...a, salary1: 120001 }));
    expect(planKey(a)).not.toBe(planKey({ ...a, monteCarloSeed: 2 }));
    expect(typeof planKey(a)).toBe('string');
    expect(planKey(null)).toBeNull();
  });

  it('an edit undone is the same plan again', () => {
    const k0 = planKey(DEFAULT_INPUTS);
    const edited = { ...DEFAULT_INPUTS, lifestyleExpense: 99000 };
    expect(planKey(edited)).not.toBe(k0);
    expect(planKey({ ...edited, lifestyleExpense: DEFAULT_INPUTS.lifestyleExpense })).toBe(k0);
  });
});

describe('the cache', () => {
  it('round-trips a result under its key, and clears', () => {
    const results = { successProbability: 91, endingP10: 1, endingP50: 2, endingP90: 3, seed: 1, trials: 1000, growthCurves: [] };
    writeMonteCarloCache('k1', results);
    const back = readMonteCarloCache();
    expect(back.key).toBe('k1');
    expect(back.results).toEqual(results);
    expect(typeof back.savedAt).toBe('string');
    clearMonteCarloCache();
    expect(readMonteCarloCache()).toBeNull();
    expect(localStorage.getItem(MC_CACHE_KEY)).toBeNull();
  });

  it('ignores garbage and a missing key', () => {
    localStorage.setItem(MC_CACHE_KEY, '{not json');
    expect(readMonteCarloCache()).toBeNull();
    localStorage.setItem(MC_CACHE_KEY, JSON.stringify({ results: {} }));
    expect(readMonteCarloCache()).toBeNull();
    writeMonteCarloCache(null, { a: 1 });
    expect(localStorage.getItem(MC_CACHE_KEY)).toBeNull();
  });
});
