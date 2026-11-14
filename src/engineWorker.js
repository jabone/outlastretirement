// The one background worker for the engine. It used to be three files
// (Monte Carlo, the heavy analyses, the Roth schedule search), and each
// shipped its own copy of the whole engine; one file ships it once, so a
// release has about a third as much for returning visitors to download
// (performance audit 2026-11-13). Each caller still starts its own worker
// instance, so the jobs still run side by side.
//
// Every message is { job, data }:
// - 'monteCarlo': data is the plan. Posts { progress: 0-1 } while it runs,
//   then { success, results } or { success: false, error }.
// - 'heavy': data is { requestId, inputs, useRealDollars, premiumTables }.
//   Posts the first wave ({ partial: true }), then the full results; a job
//   superseded by a newer requestId posts nothing (heavyComputeWorker.js).
// - 'rothSchedule': data is { inputs, objective }. Posts { type: 'progress' }
//   at most every 150 ms, then { type: 'done', result } or { type: 'error' }.
import { runMonteCarlo, optimizeRothSchedule } from './calculator.js';
import { runHeavyAnalyses } from './heavyComputeWorker.js';

let latestRequestId = 0;

function monteCarlo(data) {
  try {
    const results = runMonteCarlo(data, { onProgress: (progress) => self.postMessage({ progress }) });
    self.postMessage({ success: true, results });
  } catch (error) {
    self.postMessage({ success: false, error: error.message });
  }
}

async function heavy(data) {
  const { requestId } = data;
  latestRequestId = requestId;
  try {
    const result = await runHeavyAnalyses(data, { isCurrent: () => latestRequestId === requestId, onPartial: (p) => self.postMessage(p) });
    if (!result.superseded) self.postMessage(result);
  } catch (error) {
    self.postMessage({ requestId, success: false, error: error.message });
  }
}

function rothSchedule(data) {
  const { inputs, objective } = data || {};
  let last = 0;
  try {
    const result = optimizeRothSchedule(inputs, {
      objective,
      onProgress: (p) => {
        const now = Date.now();
        if (now - last >= 150) {
          last = now;
          self.postMessage({ type: 'progress', ...p });
        }
      },
    });
    self.postMessage({ type: 'done', result });
  } catch (error) {
    self.postMessage({ type: 'error', error: error.message });
  }
}

const JOBS = { monteCarlo, heavy, rothSchedule };

self.onmessage = (e) => {
  const { job, data } = e.data || {};
  const run = JOBS[job];
  if (run) run(data);
  else self.postMessage({ success: false, type: 'error', error: `unknown job ${job}` });
};
