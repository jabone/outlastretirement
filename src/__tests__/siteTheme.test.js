// Changelog 368: every public page follows light or dark -- the theme chosen
// in the app, else the device's -- from one shared stylesheet.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const PAGES = ['index.html', 'public/privacy.html', 'public/terms.html', 'public/accessibility.html', 'public/premium.html', 'public/verify.html', 'public/404.html', 'public/changelog.html', 'public/how-the-math-works.html', 'public/pricing-script.html'];
const COLOR_VARS = ['--bg', '--panel', '--panel-2', '--border', '--text', '--text-2', '--muted', '--accent-text'];

describe('public pages, light and dark', () => {
  for (const page of PAGES) {
    it(`${page} takes its colors from site-theme.css and loads theme.js`, () => {
      const html = readFileSync(join(ROOT, page), 'utf8');
      expect(html).toContain('<link rel="stylesheet" href="/brand/site-theme.css" />');
      expect(html).toContain('<script src="/brand/theme.js"></script>');
      // No page restates a color of its own, so none can miss the light set.
      const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
      for (const v of COLOR_VARS) expect(css, `${page} defines ${v}`).not.toMatch(new RegExp(`${v}:\\s`));
      expect(css, `${page} hardcodes a paper-on-navy color`).not.toMatch(/rgba\(234, 230, 221|var\(--or-(navy|paper|cream)\)/);
    });
  }

  it('the light set defines every color the dark set does, both by device and by choice', () => {
    const site = readFileSync(join(ROOT, 'public/brand/site-theme.css'), 'utf8');
    const names = (block) => [...block.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]).sort();
    const dark = site.slice(site.indexOf(':root {'), site.indexOf('@media'));
    const byDevice = site.slice(site.indexOf(':root:not([data-theme="dark"]) {'), site.indexOf(':root:not([data-theme="dark"]) .logo-on-dark'));
    const byChoice = site.slice(site.indexOf(':root[data-theme="light"] {'), site.indexOf('/* The lockup'));
    expect(names(byDevice)).toEqual(names(dark));
    expect(names(byChoice)).toEqual(names(dark));
  });

  it('theme.js only reads the saved choice', () => {
    const js = readFileSync(join(ROOT, 'public/brand/theme.js'), 'utf8');
    expect(js).toMatch(/localStorage\.getItem\('retire_plan_theme'\)/);
    expect(js).not.toMatch(/fetch|XMLHttpRequest|sendBeacon|setItem/);
  });
});
