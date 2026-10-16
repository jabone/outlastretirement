// Changelog 236: when walking away today fails, the smallest one-time sum,
// or part-time pay for 2/3/5 years, that makes it a yes. John, 2026-09-24.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, findDieWithZeroSpending } from '../calculator';
import {
  walkAwayToYes, walkAwayPatch, WINDFALL_STEP, PART_TIME_STEP, PART_TIME_YEARS, WORK_UNTIL_MAX_YEARS,
} from '../utils/retirementReadiness';

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
  lifestyleExpense: 108000, stateOfResidence: 'TX', stateTaxState: 'none',
};
// The walk-away plan, with the change typed in by hand -- the way a user
// would test the answer themselves.
const leavingNow = (p, extra) => runProjection({ ...p, ...walkAwayPatch(p), ...extra });

describe('what would make walking away a yes', () => {
  const p = plan(worker);
  const r = walkAwayToYes(p);

  it('is only asked when the answer is no', () => {
    expect(leavingNow(p, {}).isSuccessful).toBe(false);
    expect(r).not.toBeNull();
    expect(walkAwayToYes(plan({ ...worker, lifestyleExpense: 60000 }))).toBeNull();
  });

  it('finds the smallest one-time sum: that much works, a step less does not', () => {
    expect(r.windfall % WINDFALL_STEP).toBe(0);
    // A windfall is cash: every dollar of it is basis. Typed in by hand, the
    // user would raise the balance and the known basis together.
    const basis = worker.taxableInit * (1 - DEFAULT_INPUTS.taxableCapitalGainsRatio);
    const withSum = (w) => leavingNow(p, { taxableInit: worker.taxableInit + w, taxableBasisInit: basis + w });
    expect(withSum(r.windfall).isSuccessful).toBe(true);
    expect(withSum(r.windfall - WINDFALL_STEP).isSuccessful).toBe(false);
  });

  it('treats the sum as basis, not as gains the gains ratio would tax', () => {
    // With the sum left to the ratio guess, part of it is taxed as a gain
    // when spent, so the same amount leaves the plan worse off.
    const asGains = leavingNow(p, { taxableInit: worker.taxableInit + r.windfall });
    const asBasis = leavingNow(p, { taxableInit: worker.taxableInit + r.windfall, taxableBasisInit: worker.taxableInit * 0.4 + r.windfall });
    expect(asBasis.endingBalance).toBeGreaterThan(asGains.endingBalance);
  });

  it('keeps a known basis the user entered, adding the sum to it', () => {
    const known = plan({ ...worker, taxableBasisInit: 650000 });
    const k = walkAwayToYes(known);
    const ok = (w) => leavingNow(known, { taxableInit: worker.taxableInit + w, taxableBasisInit: 650000 + w }).isSuccessful;
    expect(ok(k.windfall)).toBe(true);
    expect(ok(k.windfall - WINDFALL_STEP)).toBe(false);
  });

  it('finds the smallest part-time pay for 2, 3 and 5 years, starting the year you leave', () => {
    expect(r.partTime.map((x) => x.years)).toEqual(PART_TIME_YEARS);
    for (const { years, perYear } of r.partTime) {
      expect(perYear % PART_TIME_STEP).toBe(0);
      const work = (x) => leavingNow(p, { partTimeIncome1: x, partTimeIncomeEndAge1: 58 + years });
      expect(work(perYear).isSuccessful).toBe(true);
      expect(work(perYear - PART_TIME_STEP).isSuccessful).toBe(false);
    }
    // Fewer years needs more a year.
    const [two, three, five] = r.partTime.map((x) => x.perYear);
    expect(two).toBeGreaterThan(three);
    expect(three).toBeGreaterThan(five);
  });

  it('leaves part-time out of a plan that already counts on it, rather than replacing it', () => {
    const q = walkAwayToYes(plan({ ...worker, lifestyleExpense: 140000, partTimeIncome1: 20000, partTimeIncomeEndAge1: 62 }));
    expect(q.hasPartTime).toBe(true);
    expect(q.partTime).toBeNull();
    expect(q.windfall).toBeGreaterThan(0);
  });

  it('says no windfall is enough rather than inventing one', () => {
    const hopeless = walkAwayToYes(plan({ ...worker, lifestyleExpense: 5_000_000 }));
    expect(hopeless.windfall).toBeNull();
  });
});

// Changelog 237 (John, 2026-09-24): the three numbers on the card did not
// say how they related, and "part-time work" at $106,500 a year read as a
// job most people do not have. Each lever now carries its unit.
describe('what would make it a yes, said in units you can judge', () => {
  const p = plan(worker);
  const r = walkAwayToYes(p);

  it('names the gap in the same dollars as the budget: budget less what the plan supports', () => {
    const leaving = { ...p, ...walkAwayPatch(p) };
    const supports = findDieWithZeroSpending(leaving).dieWithZeroSpending;
    expect(r.shortfall).toBeGreaterThan(0);
    expect(r.shortfall).toBe(worker.lifestyleExpense - supports);
    // Passing the ceiling in gives the same answer without a second search.
    expect(walkAwayToYes(p, { supports }).shortfall).toBe(r.shortfall);
  });

  it('compares every earnings figure to what spouse 1 earns now', () => {
    expect(r.salary).toBe(worker.salary1);
    let checked = 0;
    for (const x of r.partTime) {
      expect(x.shareOfPay).toBeCloseTo(x.perYear / worker.salary1, 10);
      expect(x.moreThanPayNow).toBe(x.perYear >= worker.salary1);
      checked++;
    }
    expect(checked).toBe(PART_TIME_YEARS.length);
  });

  it('flags a figure above current pay, and gives no share with no salary to compare', () => {
    const lowPay = walkAwayToYes(plan({ ...worker, salary1: 20000 }));
    expect(lowPay.partTime[0].moreThanPayNow).toBe(true);
    const noPay = walkAwayToYes(plan({ ...worker, salary1: 0 }));
    let hits = 0;
    for (const x of noPay.partTime) { expect(x.shareOfPay).toBeNull(); expect(x.moreThanPayNow).toBe(false); hits++; }
    expect(hits).toBe(PART_TIME_YEARS.length);
  });

  it('finds the fewest extra full-time years that work: that many do, one fewer does not', () => {
    const w = r.workUntil;
    expect(w).not.toBeNull();
    expect(w.extraYears).toBeGreaterThanOrEqual(1);
    expect(w.extraYears).toBeLessThanOrEqual(WORK_UNTIL_MAX_YEARS);
    expect(w.age).toBe(58 + w.extraYears);
    expect(w.year).toBe(START + w.extraYears);
    expect(leavingNow(p, { retireAge1: 58 + w.extraYears }).isSuccessful).toBe(true);
    // extraYears - 1 = 0 is walking away now, which fails by construction.
    expect(leavingNow(p, { retireAge1: 58 + w.extraYears - 1 }).isSuccessful).toBe(false);
    expect(w.atOrAfterPlan).toBe(58 + w.extraYears >= worker.retireAge1);
  });

  it('works one combination: half the gap cut, the least three-year pay for the rest', () => {
    const c = r.combined;
    expect(c).not.toBeNull();
    expect(c.years).toBe(3);
    expect(c.cut % PART_TIME_STEP).toBe(0);
    expect(c.cut).toBeLessThan(r.shortfall);
    const three = r.partTime.find((x) => x.years === 3).perYear;
    // Less of each: the combined pay is below the pay-only figure.
    expect(c.perYear).toBeLessThan(three);
    const both = (x) => leavingNow(p, {
      lifestyleExpense: worker.lifestyleExpense - c.cut, partTimeIncome1: x, partTimeIncomeEndAge1: 58 + 3,
    });
    expect(both(c.perYear).isSuccessful).toBe(true);
    expect(both(c.perYear - PART_TIME_STEP).isSuccessful).toBe(false);
  });

  it('offers no combination to a plan that already counts on part-time pay', () => {
    const q = walkAwayToYes(plan({ ...worker, lifestyleExpense: 140000, partTimeIncome1: 20000, partTimeIncomeEndAge1: 62 }));
    expect(q.combined).toBeNull();
  });
});

