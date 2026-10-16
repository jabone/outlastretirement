// Changelog 242: the shaded Balances & draws headers went see-through when
// the table scrolled. The sticky <th> relies on its opaque background-color
// to hide the rows passing under it; changelog 241's .col-uses tint REPLACED
// that color with a translucent one. The tint must layer on top instead.
// jsdom does not compute CSS, so this reads the stylesheet itself.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const rules = (selector) => {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (m[1].split(',').map((x) => x.trim()).includes(selector)) out.push(m[2]);
  }
  return out;
};

describe('the sticky ledger header stays opaque', () => {
  it('gives every header cell a solid background', () => {
    const th = rules('.custom-table th').join(';');
    expect(th).toMatch(/position:\s*sticky/);
    expect(th).toMatch(/background-color:\s*var\(--bg-secondary\)/);
  });

  it('shades the shared columns without touching their background color', () => {
    const body = rules('.custom-table .col-uses');
    expect(body.length).toBeGreaterThan(0);
    const all = body.join(';');
    expect(all).toMatch(/background-image:/);
    // Neither background-color nor the background shorthand (which resets
    // the color) may appear on the shaded columns.
    expect(all).not.toMatch(/background-color\s*:/);
    expect(all).not.toMatch(/(^|[;\s])background\s*:/);
  });
});
