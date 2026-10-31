// Changelog 428: the optimizers rank by what the heirs keep after every
// tax, not by an ending balance that counts a Pre-Tax dollar as a Roth
// dollar. The Carter demo plan is the reproduction: by ending balance no
// conversion wins; after the heirs' tax on the inherited Pre-Tax balance,
// filling the 22% bracket wins.
import { describe, it, expect } from 'vitest';
import { runOptimizer, runProjection, legacyAfterTaxes, getRothBracketWithdrawalHeatmap, getContributionSplitOptimizer, gridBestExtraStrategy, computeOptimizerResultsReal, DEFAULT_INPUTS } from '../calculator';
import { buildDemoInputs } from '../config/demoPlan';
import { buildActionPlan } from '../utils/actionPlan';

const demo = buildDemoInputs();

describe('optimizers rank after every tax', () => {
  it('the Hub ranks by net to heirs, and that order differs from the ending balance', () => {
    const r = runOptimizer(demo);
    expect(r.every((s) => Number.isFinite(s.afterTaxLegacy))).toBe(true);
    for (let i = 1; i < r.length; i += 1) {
      if (r[i].isSuccessful === r[i - 1].isSuccessful) expect(r[i - 1].afterTaxLegacy).toBeGreaterThanOrEqual(r[i].afterTaxLegacy);
    }
    const byNominal = [...r].sort((a, b) => b.endingBalance - a.endingBalance)[0];
    expect(byNominal.id).toBe('taxable_first');
    // A 22%-bracket conversion wins on the demo; which withdrawal order
    // pairs with it has moved as the engine's tax corrections landed (435
    // made the Pre-Tax-funded fills cheaper), and the three sit within 1%
    // of each other, so the order is not pinned.
    expect(r[0].id).toMatch(/^roth_conv_22/);
    expect(r[0].ranking).toBe('Best');
  });

  it('a plan that runs short ranks below every plan that lasts', () => {
    const r = runOptimizer({ ...DEFAULT_INPUTS });
    const firstFail = r.findIndex((s) => !s.isSuccessful);
    if (firstFail >= 0) expect(r.slice(firstFail).every((s) => !s.isSuccessful)).toBe(true);
  });

  it('net to heirs prices the Pre-Tax balance at death at the heirs\' effective rate', () => {
    const plan = { ...DEFAULT_INPUTS, heirIncome: 400000, heirFilingStatus: 'Single', preTaxInit: 2000000, rothInit: 0, taxableInit: 0, salary1: 0, lifestyleExpense: 40000, acaCreditSource: 'manual', itemizeDeductions: 'never' };
    const proj = runProjection(plan);
    const last = proj.years[proj.years.length - 1];
    const legacy = legacyAfterTaxes(plan, proj);
    // Less than the balance (the heirs owe tax on it) and more than it
    // taxed at the top rate.
    expect(legacy).toBeLessThan(last.preTaxEnd + last.rothEnd + last.taxableEnd);
    expect(legacy).toBeGreaterThan((last.preTaxEnd) * 0.5 + last.rothEnd + last.taxableEnd);
    // A plan of pure Roth is worth its balance.
    const rothOnly = { ...plan, preTaxInit: 0, rothInit: 2000000 };
    const rp = runProjection(rothOnly);
    const rl = rp.years[rp.years.length - 1];
    expect(legacyAfterTaxes(rothOnly, rp)).toBeCloseTo(rl.rothEnd + rl.taxableEnd + rl.preTaxEnd, -2);
  });

  it('the Roth Ladder grid, its best card, the split optimizer and the Action Plan agree on the measure', () => {
    const grid = getRothBracketWithdrawalHeatmap(demo);
    expect(grid.every((c) => Number.isFinite(c.afterTaxLegacy))).toBe(true);
    const best = grid.reduce((b, c) => (!b || c.afterTaxLegacy > b.afterTaxLegacy ? c : b), null);
    const card = gridBestExtraStrategy(grid);
    // The grid's winner (22% + Roth First for the Carters) is chosen on the
    // same figure, and surfaces as the Hub's extra card when the Hub's own
    // nine do not already include it.
    expect(best.bracket).toBe(0.22);
    const inHub = ['TaxableFirst', 'PreTaxFirst', 'ProRata'].includes(best.withdrawalStrategy) && [0.22, 0.24].includes(best.bracket);
    if (inHub) expect(card).toBeNull();
    else expect(card.config).toMatchObject({ withdrawalStrategy: best.withdrawalStrategy, rothConversionBracket: best.bracket });
    const split = getContributionSplitOptimizer({ ...demo, retireAge1: 70, retireAge2: 70 });
    if (split.applicable) {
      expect(split.best.afterTaxLegacy).toBeGreaterThanOrEqual(Math.max(...split.results.filter((r) => r.isSuccessful).map((r) => r.afterTaxLegacy)));
      expect(split.improvement).toBeCloseTo(split.best.afterTaxLegacy - split.current.afterTaxLegacy, 6);
    }
    // The Action Plan note appears only for a gap over 2% of what the heirs
    // keep (changelog 466); the Carters' gap to the grid's best is under
    // 1%, so it is silent for them. Force a large gap to check the measure.
    const proj = runProjection(demo);
    const current = legacyAfterTaxes(demo, proj);
    const wide = grid.map((c) => (c === best ? { ...c, afterTaxLegacy: current * 1.1 } : c));
    const plan = buildActionPlan(demo, proj, null, wide, null);
    const note = [...(plan.retirementItems || []), ...(plan.sections || []).flatMap((s) => s.items || [])].find((i) => /Roth Ladder Optimizer/.test(i.detail || ''));
    expect(note).toBeTruthy();
    expect(note.detail).toMatch(/after every tax/);
    expect(buildActionPlan(demo, proj, null, grid, null).sections.flatMap((s) => s.items).find((i) => /Roth Ladder Optimizer/.test(i.detail || ''))).toBeUndefined();
  });

  it("today's dollars deflate the figure by the final-year factor", () => {
    const nominal = computeOptimizerResultsReal(demo);
    const nominalHub = runOptimizer(demo);
    for (const s of nominal) {
      const raw = nominalHub.find((x) => x.id === s.id);
      expect(s.afterTaxLegacy).toBeLessThan(raw.afterTaxLegacy);
      expect(s.afterTaxLegacy / raw.afterTaxLegacy).toBeCloseTo(s.endingBalance / raw.endingBalance, 6);
    }
  });
});
