// Every switch must be the styled one. A "switch-slider" span has no CSS at
// all, so five switches rendered as 0x0 boxes nobody could see or click
// (Get more conservative each year in retirement, Model a gifting plan,
// Grow the gift with inflation each year, Split gifts with spouse, Lived
// with your spouse at any point during the year). A switch wrapper is only
// visible when its checkbox is followed by the styled .slider-round track.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..');
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : walk(p);
    return /\.jsx?$/.test(p) ? [p] : [];
  });
}
const FILES = walk(SRC);
const css = readFileSync(join(SRC, 'index.css'), 'utf8');

// Each <span className="custom-switch"> ... </span> block must hold an
// <input type="checkbox"> and a .slider-round span.
export function unstyledSwitches(src) {
  const out = [];
  const re = /<span className="custom-switch">([\s\S]*?)<\/span>\s*<\/span>|<span className="custom-switch">([\s\S]*?<\/span>)/g;
  let m;
  while ((m = re.exec(src))) {
    const body = m[1] ?? m[2];
    if (!/className="slider-round"/.test(body)) out.push(src.slice(0, m.index).split('\n').length);
  }
  return out;
}

describe('switches are visible', () => {
  it('scans real source', () => {
    expect(FILES.length).toBeGreaterThan(60);
    expect(css).toMatch(/\.slider-round\s*\{/);
  });

  it('nothing uses the unstyled "switch-slider" class', () => {
    const hits = FILES.filter((p) => /switch-slider/.test(readFileSync(p, 'utf8'))).map((p) => relative(SRC, p));
    expect(hits).toEqual([]);
  });

  it('every custom-switch wrapper has the styled slider-round track', () => {
    const bad = [];
    for (const p of FILES) {
      const lines = unstyledSwitches(readFileSync(p, 'utf8'));
      if (lines.length) bad.push(`${relative(SRC, p)}:${lines.join(',')}`);
    }
    expect(bad).toEqual([]);
  });

  it('the scan catches a switch without the styled track', () => {
    const src = '<span className="custom-switch">\n<input type="checkbox" />\n<span className="switch-slider"></span>\n</span>';
    expect(unstyledSwitches(src)).toEqual([1]);
  });
});
