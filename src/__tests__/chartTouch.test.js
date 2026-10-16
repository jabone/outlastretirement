// @vitest-environment jsdom
// Chart details on a phone stay open until the next tap elsewhere
// (changelog 325).
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { installChartTouchDismiss } from '../utils/chartTouch';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function chart(id) {
  const w = document.createElement('div');
  w.className = 'recharts-wrapper';
  w.id = id;
  // A legend icon (also an svg) comes before the plot, as recharts lays it out.
  w.innerHTML = '<div class="recharts-legend-wrapper"><svg class="recharts-surface legend-icon"></svg></div><svg class="recharts-surface plot"><rect class="bar"></rect></svg>';
  document.body.appendChild(w);
  const left = [];
  w.querySelector('.legend-icon').addEventListener('mouseout', () => left.push(`${id}:legend`));
  w.querySelector('.plot').addEventListener('mouseout', (e) => { if (e.relatedTarget === document.body) left.push(id); });
  return { w, left };
}

function press(target, pointerType) {
  const e = new Event('pointerdown', { bubbles: true });
  e.pointerType = pointerType;
  target.dispatchEvent(e);
}

let uninstall = () => {};
afterEach(() => { uninstall(); document.body.innerHTML = ''; });

describe('installChartTouchDismiss', () => {
  it('a tap elsewhere hides every chart’s details; a tap on a chart leaves that chart’s open', () => {
    uninstall = installChartTouchDismiss(document);
    const a = chart('a');
    const b = chart('b');
    press(a.w.querySelector('rect'), 'touch');
    expect(a.left).toEqual([]);
    expect(b.left).toEqual(['b']);
    press(document.body, 'touch');
    expect(a.left).toEqual(['a']);
  });

  it('leaves mouse and pen alone, where hover already works', () => {
    uninstall = installChartTouchDismiss(document);
    const a = chart('a');
    press(document.body, 'mouse');
    press(document.body, 'pen');
    expect(a.left).toEqual([]);
  });

  it('installs once, however many charts load it', () => {
    uninstall = installChartTouchDismiss(document);
    const again = installChartTouchDismiss(document);
    const a = chart('a');
    press(document.body, 'touch');
    expect(a.left).toEqual(['a']);
    again();
  });

  it('the Dashboard chart no longer closes its details on a timer', () => {
    const src = readFileSync(join(SRC, 'components', 'LazyCharts.jsx'), 'utf8');
    expect(src).toMatch(/^installChartTouchDismiss\(\);$/m);
    expect(src).not.toMatch(/onTouchEnd|setTimeout\([^)]*mouseleave/);
  });
});
