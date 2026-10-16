// heirSplitMode (changelog 259): 'equal' divides the estate 1/n and ignores
// splitPct; 'custom' (the old behavior) uses the normalized splitPct. The
// migration keeps every saved plan's division exactly as it was.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, calculateHeirEstateTax, migrateInputs } from '../calculator';
import { equalShare } from '../utils/heirSplit';

const three = (mode, pcts) => ({
  ...DEFAULT_INPUTS,
  heirSplitMode: mode,
  heirs: pcts.map((p, i) => ({ id: i + 1, name: `H${i + 1}`, filingStatus: 'Single', income: 100000, splitPct: p })),
});

describe('heirSplitMode', () => {
  it('defaults to equal', () => {
    expect(DEFAULT_INPUTS.heirSplitMode).toBe('equal');
  });

  it('equal: three heirs at 33/33/33 read as exactly one third each, and splitPct is ignored', () => {
    const r = calculateHeirEstateTax(three('equal', [33, 33, 33]), 900000, 0, 0);
    r.perHeir.forEach((h) => expect(h.splitPct).toBeCloseTo(100 / 3, 9));
    const skewed = calculateHeirEstateTax(three('equal', [100, 0, 0]), 900000, 0, 0);
    expect(skewed.perHeir.map((h) => h.grossInherited)).toEqual(r.perHeir.map((h) => h.grossInherited));
    expect(skewed.perHeir[1].grossInherited).toBeGreaterThan(0);
  });

  it('custom: splitPct still rules, normalized', () => {
    const r = calculateHeirEstateTax(three('custom', [100, 0, 0]), 900000, 0, 0);
    expect(r.perHeir[0].splitPct).toBe(100);
    expect(r.perHeir[1].grossInherited).toBe(0);
    expect(r.perHeir[2].grossInherited).toBe(0);
    const n = calculateHeirEstateTax(three('custom', [30, 30, 30]), 900000, 0, 0);
    expect(n.perHeir[0].splitPct).toBeCloseTo(100 / 3, 9);
  });

  it('migration: a plan saved before the mode keeps its division', () => {
    const saved = (heirs) => { const p = { ...DEFAULT_INPUTS, heirs }; delete p.heirSplitMode; return p; };
    const custom = migrateInputs(saved(three('x', [60, 40]).heirs));
    expect(custom.heirSplitMode).toBe('custom');
    const alike = migrateInputs(saved(three('x', [50, 50]).heirs));
    expect(alike.heirSplitMode).toBe('equal');
    const single = migrateInputs(saved(DEFAULT_INPUTS.heirs));
    expect(single.heirSplitMode).toBe('equal');
    const kept = migrateInputs({ ...DEFAULT_INPUTS, heirSplitMode: 'custom', heirs: three('x', [50, 50]).heirs });
    expect(kept.heirSplitMode).toBe('custom');
  });

  it('equalShare labels', () => {
    expect(equalShare(1)).toBe('100%');
    expect(equalShare(2)).toBe('1/2 (50%)');
    expect(equalShare(3)).toBe('1/3 (33.3%)');
    expect(equalShare(4)).toBe('1/4 (25%)');
  });
});
