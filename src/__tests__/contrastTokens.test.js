// WCAG 1.4.3 (Contrast, minimum): the text colors added after the automated
// accessibility scan must clear 4.5:1 against the card they sit on, in both
// themes, and a heatmap cell at its darkest shade must still leave its figure
// readable. Values are read from index.css so a later edit to a token is
// checked, not a copy of it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { heatCellBg } from '../utils/heatCell';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const block = (selector) => {
  const i = css.indexOf(`${selector} {`);
  return css.slice(i, css.indexOf('}', i));
};
const ROOT = block(':root');
const LIGHT = block('[data-theme="light"]');

const token = (name, theme) => {
  const read = (b) => (b.match(new RegExp(`${name}:\\s*([^;]+);`)) || [])[1]?.trim();
  let v = (theme === 'light' && read(LIGHT)) || read(ROOT);
  const ref = v && v.match(/^var\((--[\w-]+)\)$/);
  if (ref) v = token(ref[1], theme);
  return v;
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c) => {
  const [r, g, b] = c.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const over = (fg, bg, a) => fg.map((v, i) => v * a + bg[i] * (1 - a));

describe('text colors from the accessibility pass', () => {
  for (const theme of ['dark', 'light']) {
    const card = rgb(token('--card-bg', theme));
    for (const name of ['--series-2-text', '--sky-text', '--blue-text', '--text-muted', '--accent-text']) {
      it(`${name} is at least 4.5:1 on a card (${theme})`, () => {
        expect(ratio(rgb(token(name, theme)), card)).toBeGreaterThanOrEqual(4.5);
      });
    }

    it(`a heatmap cell at its darkest leaves its figure at 4.5:1 (${theme})`, () => {
      const span = parseFloat(token('--heat-span', theme));
      const text = rgb(token('--text-primary', theme));
      for (const base of [[16, 185, 129], [168, 85, 247]]) {
        expect(ratio(text, over(base, card, 0.08 + span))).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe('heatCellBg', () => {
  it('scales the shade with the value through the theme span', () => {
    expect(heatCellBg('16, 185, 129', 0.5)).toBe('rgb(16 185 129 / calc(0.08 + 0.500 * var(--heat-span, 0.72)))');
  });
  it('clamps out-of-range and missing ratios', () => {
    expect(heatCellBg('1, 2, 3', 2)).toContain('1.000 *');
    expect(heatCellBg('1, 2, 3', -1)).toContain('0.000 *');
    expect(heatCellBg('1, 2, 3', NaN)).toContain('1.000 *');
  });
});
