// Changelog 358: the most the plan could spend and still last through every
// real retirement since 1928 (its own SAFEMAX), and at 95% / 90% of starts.
// Checked against runHistoricalStarts itself: at the figure every start
// lasts; a little above it, one does not.
import { describe, it, expect, beforeAll } from 'vitest';
import {
  findHistoricalSafeMax, runHistoricalStarts, DEFAULT_INPUTS, DIE_WITH_ZERO_CEILING, SAFEMAX_SHARES,
} from '../calculator';
import { SAFEMAX_CEILING, safeMaxHeadline, safeMaxShareLabel } from '../utils/historicalStarts';

const lastedFor = (inputs, rule) => {
  const h = runHistoricalStarts(inputs);
  return h.rules.find((r) => r.key === rule).lasted;
};

// Each search is a few hundred projections; on a busy machine that runs past
// vitest's 5-second default, so these get room (the demo tests do the same).
const SLOW = 60000;

describe('findHistoricalSafeMax', () => {
  let r;
  beforeAll(() => { r = findHistoricalSafeMax(DEFAULT_INPUTS); }, SLOW);

  it('returns a bar per share, the strictest first, each a spending level', () => {
    expect(r.bars.map((b) => b.share)).toEqual(SAFEMAX_SHARES);
    expect(r.rule).toBe('fixed');
    for (const b of r.bars) {
      expect(b.status).toBe('ok');
      expect(b.amount % 100).toBe(0);
      expect(b.need).toBe(Math.ceil(b.share * r.count - 1e-9));
      expect(b.spendingRate).toBeGreaterThan(0);
      expect(b.limitingStart).toBeGreaterThanOrEqual(r.firstStart);
    }
    // Asking fewer starts to last can only allow more spending.
    expect(r.bars[1].amount).toBeGreaterThanOrEqual(r.bars[0].amount);
    expect(r.bars[2].amount).toBeGreaterThanOrEqual(r.bars[1].amount);
  }, SLOW);

  it('every start lasts at the figure, and not all of them a little above it', () => {
    const all = r.bars[0];
    expect(lastedFor({ ...DEFAULT_INPUTS, lifestyleExpense: all.amount }, 'fixed')).toBe(r.count);
    expect(lastedFor({ ...DEFAULT_INPUTS, lifestyleExpense: Math.ceil(all.amount * 1.01) + 200 }, 'fixed')).toBeLessThan(r.count);
  }, SLOW);

  it('the 90% bar keeps at least 90% of starts', () => {
    const b = r.bars[2];
    expect(lastedFor({ ...DEFAULT_INPUTS, lifestyleExpense: b.amount }, 'fixed')).toBeGreaterThanOrEqual(b.need);
  }, SLOW);

  it('uses the plan’s own spending rule', () => {
    const guarded = findHistoricalSafeMax({ ...DEFAULT_INPUTS, spendingGuardrails: true }, { shares: [1] });
    expect(guarded.rule).toBe('crash');
    expect(lastedFor({ ...DEFAULT_INPUTS, spendingGuardrails: true, lifestyleExpense: guarded.bars[0].amount }, 'crash')).toBe(guarded.count);
  }, SLOW);

  it('the panel’s ceiling label matches the engine’s', () => {
    expect(SAFEMAX_CEILING).toBe(DIE_WITH_ZERO_CEILING);
  });
});

describe('safeMax helpers', () => {
  it('reads the every-start bar, and labels shares in plain words', () => {
    const data = { safeMax: { rule: 'fixed', count: 66, planned: 90000, bars: [{ share: 1, need: 66, status: 'ok', amount: 80000 }, { share: 0.9, need: 60, status: 'ok', amount: 90000 }] } };
    expect(safeMaxHeadline(data)).toMatchObject({ amount: 80000, count: 66, planned: 90000 });
    expect(safeMaxHeadline({})).toBe(null);
    expect(safeMaxShareLabel(1)).toBe('Every start');
    expect(safeMaxShareLabel(0.95)).toBe('95% of starts');
  });
});

// Changelog 359: the figure credits William Bengen, and a search for any of
// SAFEMAX, safe max or Bengen in the Input Dictionary lands on it.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
describe('SAFEMAX is credited and findable', () => {
  const src = (f) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', f), 'utf8');
  it('the Input Dictionary row answers SAFEMAX, safe max and Bengen', () => {
    const row = src('components/InputReference.jsx').split('<tr>').find((r) => r.includes('Every retirement since 1928 (Risk &amp; Stress tab)'));
    const text = row.replace(/<[^>]+>/g, ' ').replace(/&ldquo;|&rdquo;/g, '"').replace(/&rsquo;/g, '’').toLowerCase();
    for (const q of ['safemax', 'safe max', 'bengen']) expect(text, q).toContain(q);
  });
  it('the panel, Guide and methodology name Bengen', () => {
    expect(src('components/HistoricalStartsPanel.jsx')).toMatch(/William Bengen/);
    expect(src('components/tabs/GuideTab.jsx')).toMatch(/William Bengen introduced in 1994/);
    expect(src('config/methodology.js')).toMatch(/William Bengen’s SAFEMAX/);
  });
});
