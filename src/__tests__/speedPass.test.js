// Performance audit 2026-11-13: the landing page warms the app, and the
// first Monte Carlo after the page opens does not wait.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { appPrefetchLinks } from '../../vite.config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('landing page prefetch', () => {
  it('lists the app page\'s own startup script, modules and stylesheet, same site only', () => {
    const html = `
    <script type="module" crossorigin src="/assets/app-abc.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/vendor-react-def.js">
    <link rel="modulepreload" crossorigin href="/assets/calculator-ghi.js">
    <link rel="stylesheet" crossorigin href="/assets/app-jkl.css">
    <link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/font.woff2" />
    <script src="https://example.com/x.js"></script>`;
    const links = appPrefetchLinks(html).split('\n').map((l) => l.trim());
    expect(links).toEqual([
      '<link rel="prefetch" href="/assets/app-abc.js" as="script" crossorigin>',
      '<link rel="prefetch" href="/assets/vendor-react-def.js" as="script" crossorigin>',
      '<link rel="prefetch" href="/assets/calculator-ghi.js" as="script" crossorigin>',
      '<link rel="prefetch" href="/assets/app-jkl.css" as="style" crossorigin>',
    ]);
  });
});

describe('first Monte Carlo', () => {
  const app = readFileSync(join(ROOT, 'src/App.jsx'), 'utf8');
  it('reads the stored run on the first render, so a reload does not run again', () => {
    expect(app).toMatch(/const \[monteCarlo, setMonteCarlo\] = useState\(\(\) => \{\s*const cached = readMonteCarloCache\(\);/);
  });
  it('starts at once before any edit, and waits after one', () => {
    expect(app).toMatch(/const delay = firstAutoRunRef\.current && inputs === openingInputsRef\.current \? 0 : MC_AUTO_RUN_DELAY_MS;/);
  });
});
