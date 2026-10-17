// Changelog 408: a chart's hover card appears in place rather than sliding
// in from the chart's corner. Recharts sets `transition: transform 400ms`
// inline on its wrapper; the stylesheet turns it off for every chart,
// outside any media query so it holds at every width.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.css'), 'utf8');

describe('chart hover cards appear in place', () => {
  it('the Recharts wrapper has no transition, at the top level of the stylesheet', () => {
    const top = css.slice(0, css.indexOf('@media'));
    expect(top).toMatch(/\.recharts-tooltip-wrapper\s*\{\s*transition:\s*none\s*!important;\s*\}/);
  });
});
