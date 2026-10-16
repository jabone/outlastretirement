// Changelog 129: runMonteCarloBatch pushes the simulations off the main
// thread, and — the part that actually matters — never fails just because
// the worker did. jsdom has no Worker at all, so these run the synchronous
// fallback by default; the worker paths are exercised with a stub.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { runMonteCarloBatch } from '../utils/monteCarloAsync';
import { DEFAULT_INPUTS } from '../calculator';

// Two cheap plans: a one-year horizon keeps the real simulation fast while
// still exercising the whole path.
const quickPlan = (o = {}) => ({
  ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: 1960, retireAge1: 62,
  lifeExpectancy1: 67, salary1: 0, ss1: 0, ss2: 0, pension1: 0,
  preTaxInit: 0, rothInit: 0, taxableInit: 400000, lifestyleExpense: 20000,
  ...o,
});

class StubWorker {
  constructor() {
    this.listeners = {};
    StubWorker.instances.push(this);
    this.terminated = false;
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
  emit(type, event) { (this.listeners[type] || []).forEach((fn) => fn(event)); }
  terminate() { this.terminated = true; }
  postMessage() { StubWorker.onPost(this); }
}
StubWorker.instances = [];
StubWorker.onPost = () => {};

const withWorker = (impl) => {
  StubWorker.instances = [];
  StubWorker.onPost = impl;
  vi.stubGlobal('Worker', StubWorker);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runMonteCarloBatch', () => {
  it('returns one result per plan, in order, with no Worker at all', async () => {
    expect(typeof Worker).toBe('undefined'); // jsdom baseline
    const results = await runMonteCarloBatch([quickPlan(), quickPlan({ taxableInit: 50000 })]);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(Number.isFinite(r.successProbability)).toBe(true);
    }
    // The richer plan cannot do worse than the poorer one.
    expect(results[0].successProbability).toBeGreaterThanOrEqual(results[1].successProbability);
  }, 30000);

  it('reports progress after each plan, ending at the total', async () => {
    const seen = [];
    await runMonteCarloBatch([quickPlan(), quickPlan(), quickPlan()], {
      onProgress: (done, total) => seen.push([done, total]),
    });
    expect(seen).toEqual([[1, 3], [2, 3], [3, 3]]);
  }, 30000);

  it('uses the worker when there is one, and shuts it down afterwards', async () => {
    withWorker((w) => w.emit('message', { data: { success: true, results: { successProbability: 42 } } }));
    const results = await runMonteCarloBatch([quickPlan(), quickPlan()]);
    expect(results.map((r) => r.successProbability)).toEqual([42, 42]);
    // One worker for the whole batch, terminated at the end.
    expect(StubWorker.instances).toHaveLength(1);
    expect(StubWorker.instances[0].terminated).toBe(true);
  });

  it('falls back to the main thread when the worker reports failure', async () => {
    withWorker((w) => w.emit('message', { data: { success: false, error: 'nope' } }));
    const results = await runMonteCarloBatch([quickPlan()]);
    // A real, simulated answer — not the worker's failure.
    expect(Number.isFinite(results[0].successProbability)).toBe(true);
    expect(StubWorker.instances[0].terminated).toBe(true);
  }, 30000);

  it('falls back mid-batch and still returns every result', async () => {
    let call = 0;
    withWorker((w) => {
      call += 1;
      if (call === 1) w.emit('message', { data: { success: true, results: { successProbability: 7 } } });
      else w.emit('error', new Error('worker died'));
    });
    const results = await runMonteCarloBatch([quickPlan(), quickPlan(), quickPlan()]);
    expect(results).toHaveLength(3);
    expect(results[0].successProbability).toBe(7);            // from the worker
    expect(Number.isFinite(results[1].successProbability)).toBe(true); // simulated here
    expect(Number.isFinite(results[2].successProbability)).toBe(true);
  }, 30000);

  it('survives a Worker constructor that throws', async () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('CSP'); } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const results = await runMonteCarloBatch([quickPlan()]);
    expect(Number.isFinite(results[0].successProbability)).toBe(true);
  }, 30000);

  it('handles an empty batch without creating a worker', async () => {
    withWorker(() => { throw new Error('should not be posted to'); });
    expect(await runMonteCarloBatch([])).toEqual([]);
  });
});
