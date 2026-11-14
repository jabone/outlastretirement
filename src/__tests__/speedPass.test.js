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

describe('Dashboard checks follow the debounced plan', () => {
  const src = (f) => readFileSync(join(ROOT, f), 'utf8');
  it('Three changes works out its changes from the debounced plan, and tries them on the live one', () => {
    const card = src('src/components/ThreeChangesCard.jsx');
    expect(card).toMatch(/const plan = debouncedInputs \|\| inputs;/);
    expect(card).toMatch(/threeChanges\(plan\)/);
    expect(card).toMatch(/runProjection\(sanitizeForProjection\(\{ \.\.\.plan, \.\.\.c\.patch \}\)\)/);
    expect(card).toMatch(/const before = inputs;/);
  });
  it('first-safe-year follows the debounced plan', () => {
    expect(src('src/components/tabs/DashboardTab.jsx')).toMatch(/React\.useDeferredValue\(debouncedInputs \|\| inputs, null\)/);
  });
});

describe('static pages draw sooner', () => {
  it('the built static pages carry their small brand stylesheets inline', async () => {
    const { inlineLandingCss } = await import('../../vite.config.js');
    const src = readFileSync(join(ROOT, 'public/learn/will-my-money-last.html'), 'utf8');
    expect(src).toMatch(/<link rel="stylesheet" href="\/brand\/site-theme\.css" \/>/);
    const built = inlineLandingCss(src);
    expect(built).not.toMatch(/<link rel="stylesheet" href="\/brand\//);
    expect(built).toContain('<style data-from="/brand/site-theme.css">');
    const config = readFileSync(join(ROOT, 'vite.config.js'), 'utf8');
    expect(config).toMatch(/plugins: \[[\s\S]*?staticPagesCss,/);
  });
  it('a lesson\'s first slide loads first, the rest lazily', () => {
    const html = readFileSync(join(ROOT, 'public/learn/will-my-money-last.html'), 'utf8');
    const imgs = [...html.matchAll(/<img src="\/learn\/img\/[^"]+"[^>]*>/g)].map((m) => m[0]);
    expect(imgs[0]).toContain('loading="eager" fetchpriority="high"');
    expect(imgs.slice(1).every((t) => t.includes('loading="lazy"') && !t.includes('fetchpriority'))).toBe(true);
  });
  it('the site icons are cached for a week', () => {
    const v = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
    const rule = v.headers.find((h) => h.source.includes('favicon.ico'));
    expect(rule.headers).toContainEqual({ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' });
  });
});
