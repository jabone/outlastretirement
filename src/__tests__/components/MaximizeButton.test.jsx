// @vitest-environment jsdom
// One maximize control everywhere (changelog 288): icon only, a tooltip and
// aria-label for the words, Minimize when its panel is the one open, and no
// hand-rolled maximize button left anywhere in the components.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import MaximizeButton from '../../components/MaximizeButton';

afterEach(cleanup);
const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '../..');
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : walk(p);
    return p.endsWith('.jsx') ? [p] : [];
  });
}

describe('MaximizeButton', () => {
  it('is icon-only with the words in the label, and opens its target', () => {
    const set = vi.fn();
    render(<MaximizeButton target="growthChart" current={null} setMaximizedComponent={set} label="Maximize chart" />);
    const btn = screen.getByRole('button', { name: 'Maximize chart' });
    expect(btn.textContent).toBe('');
    expect(btn.querySelector('svg.lucide-maximize-2')).not.toBeNull();
    fireEvent.click(btn);
    expect(set).toHaveBeenCalledWith('growthChart');
  });

  it('shows Minimize and closes when its panel is the open one', () => {
    const set = vi.fn();
    render(<MaximizeButton target="tabTaxBrackets" current="tabTaxBrackets" setMaximizedComponent={set} />);
    const btn = screen.getByRole('button', { name: 'Close zoom' });
    expect(btn.querySelector('svg.lucide-minimize-2')).not.toBeNull();
    fireEvent.click(btn);
    expect(set).toHaveBeenCalledWith(null);
  });

  it('no component draws its own maximize button any more', () => {
    const offenders = [];
    for (const p of walk(SRC)) {
      const rel = relative(SRC, p).split('\\').join('/');
      if (rel === 'components/MaximizeButton.jsx') continue;
      const src = readFileSync(p, 'utf8');
      if (/<Maximize2\b|<Minimize2\b/.test(src)) offenders.push(rel);
      if (/Close Zoom|>\s*Maximize\s*</.test(src)) offenders.push(`${rel}: text label`);
    }
    expect(offenders).toEqual([]);
  });
});

// A panel header puts the button in its top-right corner (changelog 288).
// A header row that wraps drops the button onto its own line, under the
// description at the left, whenever the description is long (Life Events,
// reported 2026-09-27). Panel headers are marked className="panel-header":
// they must not wrap, and their text block must be able to shrink.
describe('panel headers keep the maximize button in the corner', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../../components');
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.jsx')) files.push(p); } };
  walk(root);

  it('no panel-header row wraps, and each ends with its MaximizeButton', () => {
    const bad = [];
    let seen = 0;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<div className="panel-header" style=\{\{([^}]*)\}\}>/g)) {
        seen += 1;
        if (/flexWrap/.test(m[1])) bad.push(`${relative(root, f)}: wraps`);
        // The button is the row's last child: the next closing of this row
        // comes right after it (allowing whitespace).
        const after = src.slice(m.index, m.index + 6000);
        if (!/<MaximizeButton[^>]*\/>\s*<\/div>/.test(after)) bad.push(`${relative(root, f)}: button not last`);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(4);
    expect(bad).toEqual([]);
  });

  it('no MaximizeButton sits in a wrapping row next to a long description', () => {
    const bad = [];
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('<MaximizeButton')) return;
        const ind = line.length - line.trimStart().length;
        for (let k = i - 1; k >= Math.max(0, i - 40); k -= 1) {
          const s = lines[k]; const si = s.length - s.trimStart().length;
          if (si < ind && s.trimStart().startsWith('<div')) {
            if (/flexWrap/.test(s) && /space-between/.test(s)) bad.push(`${relative(root, f)}:${i + 1}`);
            break;
          }
        }
      });
    }
    expect(bad).toEqual([]);
  });
});
