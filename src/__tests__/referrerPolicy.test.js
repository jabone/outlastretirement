// The site sends no referring address anywhere, and has no analytics at all
// (removed 2026-11-11). These pin both so neither comes back by accident.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('referrer policy', () => {
  it('every page asks the browser to send no referring address, to us or to other sites', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const all = vercel.headers.find((h) => h.source === '/(.*)').headers;
    expect(all).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' });
  });
});

describe('no analytics', () => {
  it('ships no analytics package or component', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain('@vercel/analytics');
    expect(existsSync(join(ROOT, 'src/components/GatedAnalytics.jsx'))).toBe(false);
    expect(read('src/main.jsx')).not.toMatch(/@vercel\/analytics|GatedAnalytics/);
  });

  it('clears the old opt-in setting from returning visitors', () => {
    expect(read('src/utils/storageKeys.js')).toMatch(/RETIRED_KEYS = Object\.freeze\(\[[^\]]*'cfe_analytics_opt_in'/);
  });
});
