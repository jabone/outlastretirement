// A tab left open across a deploy asks for chunk file names that no longer
// exist. lazyWithRetry reloads once to pick up the new app, and never loops.
import { describe, it, expect, vi } from 'vitest';
import { importWithRetry, isChunkLoadError, CHUNK_RELOAD_KEY } from '../utils/lazyWithRetry';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};
const chunkError = () => new TypeError('Failed to fetch dynamically imported module: https://x/assets/RiskTab-abc123.js');
const settled = async (p) => {
  let state = 'pending';
  p.then(() => { state = 'resolved'; }, () => { state = 'rejected'; });
  await new Promise((r) => setTimeout(r, 0));
  return state;
};

describe('isChunkLoadError', () => {
  it('recognizes the browsers’ chunk-load messages and nothing else', () => {
    expect(isChunkLoadError(chunkError())).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('x is not a function'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('importWithRetry', () => {
  it('a chunk-load failure reloads once and never settles', async () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const p = importWithRetry(() => Promise.reject(chunkError()), { storage, reload });
    expect(await settled(p)).toBe('pending');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(CHUNK_RELOAD_KEY)).not.toBeNull();
  });

  it('after that reload, the same failure surfaces instead of reloading again', async () => {
    const storage = memoryStorage();
    storage.setItem(CHUNK_RELOAD_KEY, '1');
    const reload = vi.fn();
    await expect(importWithRetry(() => Promise.reject(chunkError()), { storage, reload })).rejects.toThrow(/dynamically imported/);
    expect(reload).not.toHaveBeenCalled();
  });

  it('a successful load clears the flag, so a later deploy gets its own reload', async () => {
    const storage = memoryStorage();
    storage.setItem(CHUNK_RELOAD_KEY, '1');
    const mod = { default: 'X' };
    await expect(importWithRetry(() => Promise.resolve(mod), { storage, reload: vi.fn() })).resolves.toBe(mod);
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
  });

  it('any other error is passed through without a reload', async () => {
    const reload = vi.fn();
    await expect(importWithRetry(() => Promise.reject(new Error('boom')), { storage: memoryStorage(), reload })).rejects.toThrow('boom');
    expect(reload).not.toHaveBeenCalled();
  });

  it('with no sessionStorage there is no loop guard, so it does not reload at all', async () => {
    const reload = vi.fn();
    await expect(importWithRetry(() => Promise.reject(chunkError()), { storage: null, reload })).rejects.toThrow();
    expect(reload).not.toHaveBeenCalled();
  });
});
