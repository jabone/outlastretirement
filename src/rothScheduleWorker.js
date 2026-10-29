// The year-by-year Roth schedule search (changelog 465), off the main
// thread. Started only when someone presses "Find my best schedule", in
// its own worker so the debounced analyses in heavyComputeWorker.js keep
// running beside it. Progress is posted at most every 150 ms; canceling
// or starting a newer search terminates this worker (utils/rothScheduleAsync.js).
import { optimizeRothSchedule } from './calculator.js';

self.onmessage = (e) => {
  const { inputs, objective } = e.data || {};
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
};
