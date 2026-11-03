import { runMonteCarlo } from './calculator.js';

// Progress messages ({ progress: 0-1 }) arrive while the run is under way so
// the app can show how far along it is; the last message is the result.
self.onmessage = (e) => {
  try {
    const results = runMonteCarlo(e.data, { onProgress: (progress) => self.postMessage({ progress }) });
    self.postMessage({ success: true, results });
  } catch (error) {
    self.postMessage({ success: false, error: error.message });
  }
};
