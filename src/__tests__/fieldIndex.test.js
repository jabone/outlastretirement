// The "Find a setting" index (changelog 290) is generated from the Plan
// section sources; this keeps the committed copy from drifting.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { FIELD_INDEX } from '../config/fieldIndex';
import { DEFAULT_INPUTS } from '../calculator';
import { ROUTES } from '../utils/tabRouting';

const SCRIPT = path.resolve(__dirname, '../../scripts/generateFieldIndex.mjs');

describe('fieldIndex.js', () => {
  it('matches what the generator produces (regenerate with `node scripts/generateFieldIndex.mjs`)', () => {
    expect(() => execFileSync('node', [SCRIPT, '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('indexes every plan sub-tab with unique ids and labels the finder can show', () => {
    expect(FIELD_INDEX.length).toBeGreaterThan(250);
    const ids = FIELD_INDEX.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of FIELD_INDEX) {
      expect(e.label.length, e.id).toBeGreaterThan(2);
      expect(e.label).not.toMatch(/[{}<>]/);
      expect(e.label.trim().endsWith(':'), `${e.id} label ends with a colon`).toBe(false);
    }
    const subTabs = new Set(FIELD_INDEX.filter((e) => e.tab === 'settings').map((e) => e.subTab));
    for (const st of ['household', 'income', 'savings', 'balances', 'spending', 'taxes', 'assumptions', 'milestones']) expect(subTabs.has(st), st).toBe(true);
  });

  it('points every entry at a real tab and sub-tab', () => {
    for (const e of FIELD_INDEX) {
      expect(ROUTES[e.tab], `${e.id}: tab ${e.tab}`).toBeDefined();
      expect(ROUTES[e.tab].subTabs, `${e.id}: sub-tab ${e.subTab}`).toContain(e.subTab);
    }
  });

  it('names a plan input for nearly every entry', () => {
    const unknown = FIELD_INDEX.filter((e) => !(e.key in DEFAULT_INPUTS) && !(e.key.replace(/[12]$/, '') in DEFAULT_INPUTS)).map((e) => e.key);
    // Some controls are UI-only: the add-a-milestone and add-a-grant forms,
    // a locality selector, feature switches that set several inputs.
    expect(unknown.length, `not plan inputs: ${unknown.join(', ')}`).toBeLessThan(35);
  });

  it('records the Guided step for sections the Interview shows', () => {
    const byKey = Object.fromEntries(FIELD_INDEX.map((e) => [e.key, e]));
    expect(byKey.birthYear1.step).toBe('household');
    // Social Security has its own heading on Income and sits on the
    // Interview's Household step (it used to open "Annuities, Rentals &
    // Pensions"); withdrawal mechanics have their own fold on Spending
    // rather than living under "Special Expenses".
    expect(byKey.ss1.step).toBe('household');
    expect(byKey.ss1.folds.map((f) => f.title)).toEqual(['Social Security']);
    expect(byKey.withdrawalStrategy.folds.map((f) => f.title)).toEqual(['Withdrawals & Taxable Account']);
    expect(byKey.taxLossHarvesting.folds.map((f) => f.id)).not.toContain('specialExpenses');
    expect(byKey.healthcareBridgeCost.step).toBe('healthcare');
    expect(byKey.healthcareBridgeCost.folds.map((f) => f.id)).toContain('specialExpenses');
    // Dynamic allocation is Plan Settings only: no step, so Guided switches.
    expect(byKey.rebalancingEnabled.step).toBeNull();
  });
});
