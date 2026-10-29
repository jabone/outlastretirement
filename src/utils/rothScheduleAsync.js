// Runs the Roth schedule search (changelog 465) in its own worker, with
// progress and cancel, and the same fallback as monteCarloAsync.js: when a
// Worker cannot be made (a strict Content Security Policy, an old browser,
// jsdom), the search runs on the main thread, slower but with the same
// answer. Nothing leaves the device either way.
import { optimizeRothSchedule } from '../calculator';

function createWorker() {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('../rothScheduleWorker.js', import.meta.url), { type: 'module' });
  } catch (err) {
    console.warn('Roth schedule worker unavailable; searching on the main thread instead.', err);
    return null;
  }
}

// Returns { promise, cancel }. The promise resolves with the search result,
// or with { canceled: true } after cancel(); it rejects only if the search
// itself throws.
export function startRothScheduleSearch(inputs, { objective, onProgress } = {}) {
  let canceled = false;
  const worker = createWorker();
  if (worker) {
    let settle;
    const promise = new Promise((resolve, reject) => {
      settle = resolve;
      worker.onmessage = (e) => {
        const msg = e.data || {};
        if (msg.type === 'progress') { if (onProgress && !canceled) onProgress(msg); return; }
        worker.terminate();
        if (msg.type === 'done') resolve(msg.result);
        else reject(new Error(msg.error || 'The schedule search stopped'));
      };
      worker.onerror = (err) => {
        worker.terminate();
        // A worker that dies mid-search: finish on the main thread.
        try { resolve(optimizeRothSchedule(inputs, { objective, onProgress, isCurrent: () => !canceled })); } catch (e) { reject(e instanceof Error ? e : new Error(String(err))); }
      };
      worker.postMessage({ inputs, objective });
    });
    return {
      promise,
      cancel: () => { canceled = true; worker.terminate(); settle({ canceled: true }); },
    };
  }
  const promise = new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(optimizeRothSchedule(inputs, { objective, onProgress, isCurrent: () => !canceled }));
      } catch (e) {
        reject(e);
      }
    }, 0);
  });
  return { promise, cancel: () => { canceled = true; } };
}
