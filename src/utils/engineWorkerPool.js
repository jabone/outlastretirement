// One engine worker kept warm between Monte Carlo runs (performance audit
// 2026-11-13). Starting a worker means downloading (or reading from the
// cache) and compiling the whole engine again, a few hundred milliseconds
// on a phone, and every run used to start a fresh one and throw it away.
//
// take() hands out the waiting worker, or a new one. give() puts a worker
// that finished cleanly back, clearing its handlers; only one waits, any
// other is ended. A run that is canceled or fails ends its worker instead
// (worker.terminate()), so a waiting worker is always idle and healthy.
//
// The heavy analyses keep their own long-lived worker (App.jsx), so these
// never queue behind them.
let waiting = null;

export function takeEngineWorker() {
  if (waiting) {
    const w = waiting;
    waiting = null;
    return w;
  }
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('../engineWorker.js', import.meta.url), { type: 'module' });
}

export function giveEngineWorker(worker) {
  if (!worker) return;
  worker.onmessage = null;
  worker.onerror = null;
  if (waiting && waiting !== worker) {
    try { worker.terminate(); } catch { /* already gone */ }
    return;
  }
  waiting = worker;
}

// For tests.
export function _resetEngineWorkerPool() {
  if (waiting) { try { waiting.terminate(); } catch { /* gone */ } }
  waiting = null;
}
