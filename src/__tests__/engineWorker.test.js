// engineWorker.js is the one worker file for the engine (performance audit
// 2026-11-13: three worker files each shipped a copy of the engine).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('engine worker', () => {
  let posted;
  beforeEach(async () => {
    posted = [];
    vi.resetModules();
    globalThis.self = { postMessage: (m) => posted.push(m) };
    await import('../engineWorker.js');
  });
  const send = async (msg) => { await globalThis.self.onmessage({ data: msg }); await new Promise((r) => setTimeout(r, 0)); };

  it('runs a Monte Carlo job with progress, then the result', async () => {
    const { DEFAULT_INPUTS } = await import('../calculator');
    await send({ job: 'monteCarlo', data: { ...DEFAULT_INPUTS, monteCarloTrials: 50 } });
    const last = posted[posted.length - 1];
    expect(last.success).toBe(true);
    expect(typeof last.results.successProbability).toBe('number');
    expect(posted.slice(0, -1).every((m) => typeof m.progress === 'number')).toBe(true);
  }, 60000);

  it('answers an unknown job with an error instead of hanging', async () => {
    await send({ job: 'nope', data: {} });
    expect(posted).toEqual([{ success: false, type: 'error', error: 'unknown job nope' }]);
  });

  it('is the only worker file, and every caller uses it with a job name', () => {
    expect(existsSync(join(SRC, 'monteCarloWorker.js'))).toBe(false);
    expect(existsSync(join(SRC, 'rothScheduleWorker.js'))).toBe(false);
    const callers = {
      'App.jsx': ["job: 'heavy'", "job: 'monteCarlo'"],
      'components/tabs/StrategyTab.jsx': ["job: 'monteCarlo'"],
      'utils/monteCarloAsync.js': ["job: 'monteCarlo'"],
      'utils/rothScheduleAsync.js': ["job: 'rothSchedule'"],
    };
    for (const [file, jobs] of Object.entries(callers)) {
      const src = readFileSync(join(SRC, file), 'utf8');
      const urls = [...src.matchAll(/new Worker\(new URL\('([^']+)'/g)].map((m) => m[1]);
      expect(urls.length, file).toBeGreaterThan(0);
      for (const u of urls) expect(u.endsWith('engineWorker.js'), `${file}: ${u}`).toBe(true);
      for (const j of jobs) expect(src, file).toContain(j);
    }
  });
});
