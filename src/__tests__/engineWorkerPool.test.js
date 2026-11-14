// One engine worker kept warm between Monte Carlo runs (performance audit
// 2026-11-13).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { takeEngineWorker, giveEngineWorker, _resetEngineWorkerPool } from '../utils/engineWorkerPool';

class W { constructor() { this.terminated = false; W.made += 1; } terminate() { this.terminated = true; } }
W.made = 0;

afterEach(() => { _resetEngineWorkerPool(); vi.unstubAllGlobals(); W.made = 0; });

describe('engine worker pool', () => {
  it('gives no worker where there are none', () => {
    expect(typeof Worker).toBe('undefined');
    expect(takeEngineWorker()).toBe(null);
  });
  it('reuses a worker given back, clearing its handlers, and keeps only one waiting', () => {
    vi.stubGlobal('Worker', W);
    const a = takeEngineWorker();
    const b = takeEngineWorker();
    expect(W.made).toBe(2);
    a.onmessage = () => {};
    giveEngineWorker(a);
    expect(a.onmessage).toBe(null);
    giveEngineWorker(b); // one already waiting: this one is ended
    expect(b.terminated).toBe(true);
    expect(takeEngineWorker()).toBe(a);
    expect(takeEngineWorker()).not.toBe(a); // the pool is empty again
    expect(W.made).toBe(3);
  });
});
