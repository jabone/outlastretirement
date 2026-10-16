// Which inputs differ between plans (changelog 270).
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS } from '../calculator';
import { diffPlans, labelForKey, formatDiffValue, samePlan, diffCells } from '../utils/planDiff';

describe('diffPlans', () => {
  it('returns only the keys whose values differ, in DEFAULT_INPUTS order, with each plan’s value', () => {
    const a = { id: 'a', inputs: { ...DEFAULT_INPUTS } };
    const b = { id: 'b', inputs: { ...DEFAULT_INPUTS, retireAge1: 62, lifestyleExpense: 72000 } };
    const rows = diffPlans([a, b]);
    expect(rows.map((r) => r.key)).toEqual(['retireAge1', 'lifestyleExpense']); // DEFAULT_INPUTS order
    expect(rows[0].values).toEqual({ a: DEFAULT_INPUTS.retireAge1, b: 62 });
    expect(rows[0].label).toBe('Retire age (you)');
  });

  it('compares arrays and objects by content, and needs two plans', () => {
    const a = { id: 'a', inputs: { ...DEFAULT_INPUTS, milestones: [{ id: 1, name: 'Roof', amount: 20000, startAge: 70 }] } };
    const same = { id: 'b', inputs: { ...DEFAULT_INPUTS, milestones: [{ id: 1, name: 'Roof', amount: 20000, startAge: 70 }] } };
    const diff = { id: 'c', inputs: { ...DEFAULT_INPUTS, milestones: [] } };
    expect(diffPlans([a, same])).toEqual([]);
    expect(diffPlans([a, diff]).map((r) => r.key)).toEqual(['milestones']);
    expect(diffPlans([a])).toEqual([]);
    // Three plans: a key counts when ANY column differs.
    const rows = diffPlans([a, same, { id: 'c', inputs: { ...same.inputs, salary1: 1 } }]);
    expect(rows.map((r) => r.key)).toEqual(['salary1']);
    expect(Object.keys(rows[0].values)).toEqual(['a', 'b', 'c']);
  });

  it('labels and values read as words', () => {
    expect(labelForKey('rothConversionStrategy')).toBe('Roth conversion strategy');
    expect(labelForKey('ss2')).toBe('SS (spouse)');
    expect(labelForKey('irmaaLifeChangeAppealEnabled')).toBe('IRMAA life change appeal enabled');
    expect(labelForKey('mcReturnModel')).toBe('Monte Carlo return model');
    expect(formatDiffValue(true)).toBe('On');
    expect(formatDiffValue(1250000)).toBe('1,250,000');
    expect(formatDiffValue(0.22)).toBe('0.22');
    expect(formatDiffValue([])).toBe('None');
    expect(formatDiffValue([1, 2])).toBe('2 items');
    expect(formatDiffValue('')).toBe('—');
  });
});

describe('samePlan and diffCells (changelog 328)', () => {
  it('samePlan is true only for identical inputs', () => {
    expect(samePlan({ retireAge1: 63 }, { retireAge1: 63 })).toBe(true);
    expect(samePlan({ retireAge1: 63 }, { retireAge1: 62 })).toBe(false);
    expect(samePlan(null, { retireAge1: 63 })).toBe(false);
  });

  it('letters cells that would otherwise all read the same', () => {
    const row = { values: { a: { x: 1 }, b: { x: 2 }, c: { x: 1 } } };
    expect(diffCells(row, ['a', 'b', 'c'])).toEqual(['Set (A)', 'Set (B)', 'Set (A)']);
    const plain = { values: { a: 63, b: 62 } };
    expect(diffCells(plain, ['a', 'b'])).toEqual(['63', '62']);
  });

  it('spells Monte Carlo properly in labels', () => {
    expect(labelForKey('monteCarloSeed')).toBe('Monte Carlo seed');
  });
});

