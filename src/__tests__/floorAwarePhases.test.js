// Floor-aware phases (changelog 262): with a category ledger, each
// go-go / slow-go / no-go multiplier applies to the discretionary share
// only; the essential share stays whole. Without a ledger, or with the
// option off, the multiplier scales the whole budget as it always did.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection, phaseMultiplierFor, essentialShareOf } from '../calculator';

const ledgerAt = (essentialPct) => {
  const essential = 48000 * essentialPct / 100;
  return {
    lines: [
      { id: 'e', categoryId: 'housing', amount: essential },
      { id: 'd', categoryId: 'personal', amount: 48000 - essential },
    ],
    essentialCategoryIds: ['housing'],
  };
};
const base = {
  ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxInit: 900000, taxableInit: 400000,
  lifestyleThreePhaseEnabled: true, goGoMultiplier: 1.10, slowGoMultiplier: 0.85, noGoMultiplier: 0.70,
};
const withLedger = (essentialPct, over = {}) => ({
  ...base, lifestyleExpenseInputMode: 'categories', spendingBlueprint: ledgerAt(essentialPct), ...over,
});

describe('phaseMultiplierFor', () => {
  it('defaults on, and leaves the essential share whole', () => {
    expect(DEFAULT_INPUTS.phasesFloorAware).toBe(true);
    const p = withLedger(65);
    expect(essentialShareOf(p)).toBeCloseTo(0.65, 9);
    expect(phaseMultiplierFor(p, 1.10)).toBeCloseTo(0.65 + 0.35 * 1.10, 9);
    expect(phaseMultiplierFor(p, 0.70)).toBeCloseTo(0.65 + 0.35 * 0.70, 9);
  });

  it('is the raw setting with no ledger, or with the option off', () => {
    expect(phaseMultiplierFor(base, 0.70)).toBe(0.70);
    expect(phaseMultiplierFor(withLedger(65, { phasesFloorAware: false }), 0.70)).toBe(0.70);
  });
});

describe('runProjection with floor-aware phases', () => {
  const rowsIn = (proj, phase) => proj.years.filter((r) => r.lifestylePhase === phase);

  it('No-Go years spend the essential share plus 70% of the rest, not 70% of everything', () => {
    const on = runProjection(withLedger(65));
    const off = runProjection(withLedger(65, { phasesFloorAware: false }));
    const noGoOn = rowsIn(on, 'No-Go');
    const noGoOff = rowsIn(off, 'No-Go');
    expect(noGoOn.length).toBeGreaterThan(0);
    expect(noGoOn[0].phaseMultiplier).toBeCloseTo(0.65 + 0.35 * 0.70, 9);
    expect(noGoOff[0].phaseMultiplier).toBeCloseTo(0.70, 9);
    // Same year, same inflation: the ratio of the two years' lifestyle
    // spending is the ratio of the multipliers.
    expect(noGoOn[0].lifestyleExpenses / noGoOff[0].lifestyleExpenses).toBeCloseTo((0.65 + 0.35 * 0.70) / 0.70, 6);
    // And Go-Go is a smaller lift.
    expect(rowsIn(on, 'Go-Go')[0].phaseMultiplier).toBeCloseTo(0.65 + 0.35 * 1.10, 9);
  });

  it('a plan without a ledger is untouched by the option', () => {
    const a = runProjection(base);
    const b = runProjection({ ...base, phasesFloorAware: false });
    expect(a.years.map((r) => r.lifestyleExpenses)).toEqual(b.years.map((r) => r.lifestyleExpenses));
    expect(rowsIn(a, 'No-Go')[0].phaseMultiplier).toBeCloseTo(0.70, 9);
  });
});
