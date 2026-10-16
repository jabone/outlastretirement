// Running Monte Carlo off the main thread.
//
// runMonteCarlo simulates 1,000 lifetimes and takes seconds on a real
// plan. App.jsx and StrategyTab already push it into monteCarloWorker.js
// for exactly that reason, each with the same hand-rolled
// worker-with-synchronous-fallback dance. This is that dance, once, so a
// third caller doesn't have to write a fourth copy -- and so the callers
// that still run it on the main thread have somewhere to move to.
//
// The fallback matters more than it looks. A Worker can fail to construct
// for reasons that have nothing to do with this app: a strict Content
// Security Policy, a browser that refuses module workers, a test
// environment with no Worker at all (jsdom). In every one of those the
// right answer is to run the simulation synchronously and be slow rather
// than to show the user an error about something they cannot act on.
import { runMonteCarlo } from '../calculator';

// One worker, reused across a batch. Created lazily so a caller that ends
// up on the synchronous path never pays for a Worker it cannot use.
function createWorker() {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('../monteCarloWorker.js', import.meta.url), { type: 'module' });
  } catch (err) {
    console.warn('Monte Carlo worker unavailable; simulating on the main thread instead.', err);
    return null;
  }
}

// Posts one plan to the worker and resolves with its results. Only ever
// one message is outstanding at a time, so the reply needs no correlation
// id -- the worker processes messages serially and this awaits each one.
function simulateInWorker(worker, inputs) {
  return new Promise((resolve, reject) => {
    const onMessage = (e) => {
      cleanup();
      if (e.data && e.data.success) resolve(e.data.results);
      else reject(new Error(e.data?.error || 'Monte Carlo worker reported failure'));
    };
    const onError = (err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error('Monte Carlo worker error'));
    };
    function cleanup() {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    }
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage(inputs);
  });
}

// Simulates a list of plans, yielding progress as each finishes.
//
// Resolves with results in the same order as `plans`. onProgress is called
// with (completedCount, total) after each one, which is what lets a caller
// show "3 of 5" rather than an indeterminate spinner.
//
// Never rejects for worker reasons: if the worker cannot be created, or
// dies partway through, the remaining plans are simulated synchronously.
// A caller gets slower answers, not no answers.
export async function runMonteCarloBatch(plans, { onProgress } = {}) {
  const total = plans.length;
  const results = [];
  const report = () => { if (onProgress) onProgress(results.length, total); };

  let worker = createWorker();
  for (const inputs of plans) {
    if (worker) {
      try {
        results.push(await simulateInWorker(worker, inputs));
        report();
        continue;
      } catch (err) {
        // The worker let us down mid-batch. Drop it and finish on the main
        // thread rather than abandoning a job the user is waiting on.
        console.warn('Monte Carlo worker failed; finishing on the main thread.', err);
        try { worker.terminate(); } catch { /* already gone */ }
        worker = null;
      }
    }
    results.push(runMonteCarlo(inputs));
    report();
    // Hand the browser a frame between synchronous simulations so a
    // fallback batch still repaints a progress indicator instead of
    // presenting one long freeze.
    await new Promise((r) => setTimeout(r, 0));
  }
  if (worker) {
    try { worker.terminate(); } catch { /* already gone */ }
  }
  return results;
}
