// A table in a sideways-scrolling box must be reachable from the keyboard
// (WCAG 2.1.1; axe "scrollable-region-focusable"). A box that scrolls but
// holds nothing focusable cannot be scrolled without a mouse. Every such
// wrapper is a focusable, named region, like the Estate per-heir table
// (changelog 304, then 326 for the rest).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const COMPONENTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'components');

function jsxFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? jsxFiles(p) : (p.endsWith('.jsx') ? [p] : []);
  });
}

// A <div ...overflowX: 'auto'...> whose next element is a <table>.
export function unreachableTableWrappers(src) {
  const out = [];
  for (const m of src.matchAll(/<div\b([^>]*overflowX: 'auto'[^>]*)>\s*<table\b/g)) {
    const attrs = m[1];
    if (!/tabIndex=\{0\}/.test(attrs) || !/role="region"/.test(attrs) || !/aria-label=/.test(attrs)) out.push(attrs.trim().slice(0, 80));
  }
  return out;
}

describe('sideways-scrolling tables', () => {
  for (const file of jsxFiles(COMPONENTS)) {
    const src = readFileSync(file, 'utf8');
    if (!/overflowX: 'auto'/.test(src)) continue;
    it(`${file.slice(COMPONENTS.length + 1)}: every table wrapper is a focusable, named region`, () => {
      expect(unreachableTableWrappers(src)).toEqual([]);
    });
  }

  it('self-check: flags a bare wrapper and passes a region', () => {
    expect(unreachableTableWrappers("<div style={{ overflowX: 'auto' }}>\n<table>")).toHaveLength(1);
    expect(unreachableTableWrappers("<div className=\"scroll-region\" tabIndex={0} role=\"region\" aria-label=\"X\" style={{ overflowX: 'auto' }}><table>")).toHaveLength(0);
  });
});
