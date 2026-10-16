// Changelog 218: readiness question 1 -- "could the portfolio carry this
// lifestyle if you walked away today?" -- and the cadence/tax readout on the
// budgeting screen that answers the other half of it.
import { describe, it, expect } from 'vitest';
import { runProjection, findDieWithZeroSpending, DEFAULT_INPUTS } from '../calculator';
import { walkAwayNow, walkAwayPatch } from '../utils/retirementReadiness';
import { spendingCadence } from '../utils/spendingCadence';

const plan = (over) => {
  for (const k of Object.keys(over)) {
    if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  }
  return { ...DEFAULT_INPUTS, ...over };
};
const START = DEFAULT_INPUTS.planYear;
const worker = {
  birthYear1: START - 58, retireAge1: 65, lifeExpectancy1: 92, claimingAge1: 70,
  salary1: 150000, ss1: 42000, preTaxInit: 1300000, taxableInit: 700000, rothInit: 250000,
  lifestyleExpense: 95000, stateOfResidence: 'TX', stateTaxState: 'none',
};
// A ledger: four lines, two of them ticked essential.
const ledger = {
  lifestyleExpenseInputMode: 'categories',
  spendingBlueprint: {
    lines: [
      { id: 'a', categoryId: 'housing', label: 'home', amount: 30000 },
      { id: 'b', categoryId: 'food', label: 'food', amount: 14000 },
      { id: 'c', categoryId: 'personal', label: 'travel', amount: 36000 },
      { id: 'd', categoryId: 'transport', label: 'car', amount: 15000 },
    ],
    essentialCategoryIds: ['housing', 'food'],
    unlinkedFields: [],
  },
};

describe('walking away today (Q1)', () => {
  it('moves the leaving date to this year and nothing else', () => {
    const p = plan(worker);
    const patch = walkAwayPatch(p);
    expect(patch.retireAge1).toBe(58);
    expect(Object.keys(patch)).toEqual(['retireAge1']);
    const r = walkAwayNow(p);
    expect(r.retirementYear).toBe(START);
    expect(r.alreadyRetired).toBe(false);
  });

  it('moves both spouses, and never pushes an early retirement later', () => {
    const couple = plan({ ...worker, spouse2Enabled: true, birthYear2: START - 55, retireAge2: 62 });
    expect(walkAwayPatch(couple)).toEqual({ retireAge1: 58, retireAge2: 55 });
    // Someone who already planned to stop this year is left alone, and the
    // card says the question is their plan rather than a what-if.
    const soon = plan({ ...worker, retireAge1: 58 });
    expect(walkAwayPatch(soon).retireAge1).toBe(58);
    expect(walkAwayNow(soon).alreadyRetired).toBe(true);
    // Someone who stopped work three years ago must not be sent back to
    // it: their leaving date stays where it is, and the run still starts
    // retired rather than in the year they turn 58.
    const retiredAlready = plan({ ...worker, retireAge1: 55, salary1: 0 });
    expect(walkAwayPatch(retiredAlready).retireAge1).toBe(55);
    const r = walkAwayNow(retiredAlready);
    expect(r.alreadyRetired).toBe(true);
    // The plan starts already retired, so its first year is a retired one
    // rather than three more years of the salary it no longer has.
    expect(runProjection(retiredAlready).years[0].isRetired).toBe(true);
    expect(r.firstYearTaxes).toBeGreaterThanOrEqual(0);
  });

  it('agrees with the engine about what the standing-start plan supports', () => {
    const p = plan(worker);
    const r = walkAwayNow(p);
    const direct = findDieWithZeroSpending({ ...p, ...walkAwayPatch(p) });
    expect(r.supports).toBeCloseTo(direct.dieWithZeroSpending, 6);
    expect(r.headroom).toBeCloseTo(r.supports - r.budget, 6);
  });

  it('passes a budget it can carry and fails one it cannot, naming the year', () => {
    const ok = walkAwayNow(plan({ ...worker, lifestyleExpense: 60000 }));
    expect(ok.isSuccessful).toBe(true);
    expect(ok.headroom).toBeGreaterThan(0);
    expect(ok.depletionYear).toBeNull();

    const tooMuch = walkAwayNow(plan({ ...worker, lifestyleExpense: 160000 }));
    expect(tooMuch.isSuccessful).toBe(false);
    expect(tooMuch.headroom).toBeLessThan(0);
    expect(tooMuch.depletionYear).toBeGreaterThan(START);
    // The verdict and the number have to agree: a plan that fails cannot
    // also be spending less than the ceiling.
    expect(tooMuch.budget).toBeGreaterThan(tooMuch.supports);
  });

  it('reports the floor from the ledger, and nothing at all without one', () => {
    const withLedger = walkAwayNow(plan({ ...worker, ...ledger }));
    expect(withLedger.floor).not.toBeNull();
    expect(withLedger.floor.essential).toBeGreaterThan(0);
    // 44,000 of 95,000 is essential; the floor must be that share of the
    // first year's settled cost, not the whole budget.
    expect(withLedger.floor.essential).toBeLessThan(withLedger.budget);
    expect(withLedger.floor.covered).toBe(withLedger.floor.gap === 0);
    expect(walkAwayNow(plan(worker)).floor).toBeNull();
  });

  it('charges the first year’s tax to the first retired year of the walk-away run', () => {
    const p = plan(worker);
    const r = walkAwayNow(p);
    const first = runProjection({ ...p, ...walkAwayPatch(p) }).years.find((y) => y.isRetired);
    expect(r.firstYearTaxes).toBeCloseTo(first.totalTaxesPaid, 6);
    expect(r.firstYearTaxes).toBeGreaterThan(0);
  });
});

describe('what the budget costs (the budgeting screen)', () => {
  const withLedger = plan({ ...worker, ...ledger });

  it('says the same money three ways', () => {
    const c = spendingCadence(withLedger, runProjection(withLedger));
    expect(c.total.annual).toBe(withLedger.lifestyleExpense);
    expect(c.total.monthly).toBeCloseTo(withLedger.lifestyleExpense / 12, 9);
    expect(c.total.daily).toBeCloseTo(withLedger.lifestyleExpense / 365, 9);
  });

  it('splits it by what could not be cut, and the two halves add back up', () => {
    const c = spendingCadence(withLedger, runProjection(withLedger));
    expect(c.essentialShare).toBeGreaterThan(0);
    expect(c.essential.annual + c.discretionary.annual).toBeCloseTo(c.total.annual, 6);
    // 44,000 of the 95,000 ledger is ticked essential.
    expect(c.essential.annual).toBeCloseTo(44000, 0);
  });

  it('names the tax on top from the first retired year', () => {
    const proj = runProjection(withLedger);
    const c = spendingCadence(withLedger, proj);
    const first = proj.years.find((y) => y.isRetired);
    expect(c.taxYear).toBe(first.year);
    expect(c.taxes).toBeCloseTo(first.totalTaxesPaid, 6);
    expect(c.grossNeeded).toBeCloseTo(c.total.annual + c.taxes, 6);
    expect(c.grossNeeded).toBeGreaterThan(c.total.annual);
  });

  it('says nothing rather than something wrong when there is no ledger or no budget', () => {
    const noLedger = spendingCadence(plan(worker), runProjection(plan(worker)));
    expect(noLedger.essential).toBeNull();
    expect(noLedger.discretionary).toBeNull();
    expect(noLedger.total.annual).toBe(95000);
    expect(spendingCadence(plan({ ...worker, lifestyleExpense: 0 }), null)).toBeNull();
  });
});
