import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// Every public page styles its header lockup with a two-class rule such as
// ".brand .or-logo { display: block }". The rule that hides the light-ground
// lockup in dark has to outrank that, or both lockups show side by side.
const theme = readFileSync('public/brand/site-theme.css', 'utf8');

describe('public header shows one lockup', () => {
  it('hides the light-ground lockup with a selector stronger than a page rule', () => {
    expect(theme).toMatch(/img\.or-logo\.logo-on-light\s*\{\s*display:\s*none;?\s*\}/);
    expect(theme).not.toMatch(/^\.logo-on-light\s*\{\s*display:\s*none/m);
  });

  it('no page hides or shows a lockup with a rule that would outrank the theme', () => {
    const pages = ['index.html', ...readdirSync('public').filter((f) => f.endsWith('.html')).map((f) => `public/${f}`)];
    for (const page of pages) {
      const html = readFileSync(page, 'utf8');
      expect(html, page).not.toMatch(/\.logo-on-(light|dark)[^{]*\{[^}]*display/);
      expect(html, page).not.toMatch(/\.or-logo[^{]*\{[^}]*display:\s*block\s*!important/);
    }
  });
});
