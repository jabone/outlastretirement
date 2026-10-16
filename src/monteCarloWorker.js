import { runMonteCarlo } from './calculator.js';

self.onmessage = (e) => {
  try {
    const results = runMonteCarlo(e.data);
    self.postMessage({ success: true, results });
  } catch (error) {
    self.postMessage({ success: false, error: error.message });
  }
};
