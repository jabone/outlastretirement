// Changelog 219: readiness question 4 -- the big expenses that land in the
// years least able to absorb them.
//
// The thesis of the whole card is in the third test: the SAME expense at
// year 2 and at year 12 must not read the same. If that ever passes with
// the window logic broken, the card is decoration.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS } from '../calculator';
import { deflateProjectionForDisplay, yearFactor } from '../utils/displayDollars';
import {
  findBigExpenses, bigExpenseTiming, shiftedOutcome, BIG_SHARE, WINDOW_YEARS, MAX_FLAGGED,
} from '../utils/bigExpenses';

const plan = (over) => {
  for (const k of Object.keys(over)) {
    if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  }
  return { ...DEFAULT_INPUTS, ...over };
};
const START = DEFAULT_INPUTS.planYear;
const retiree = {
  birthYear1: START - 64, retireAge1: 65, lifeExpectancy1: 92, claimingAge1: 70,
  salary1: 120000, ss1: 42000, preTaxInit: 1500000, taxableInit: 700000, rothInit: 300000,
  lifestyleExpense: 90000, stateOfResidence: 'TX', stateTaxState: 'none',
};
const event = (over) => ({
  id: 'x', name: 'Roof', type: 'outflow', amount: 250000, isRecurring: false,
  startAge: 67, endAge: 67, targetAccount: 'auto', fundedExternally: false, ...over,
});
const withEvents = (...milestones) => plan({ ...retiree, milestones });
const found = (inputs) => findBigExpenses(inputs, runProjection(inputs));

describe('finding the big ones', () => {
  it('flags an expense worth more than the threshold share of the portfolio', () => {
    const p = withEvents(event({}));
    const f = found(p);
    expect(f).toHaveLength(1);
    expect(f[0].name).toBe('Roof');
    expect(f[0].portfolioShare).toBeGreaterThanOrEqual(BIG_SHARE);
    // The amount compared is the one the engine actually charges, which
    // inflation has grown past the figure the user typed.
    expect(f[0].amount).toBeGreaterThan(f[0].enteredAmount);
    expect(f[0].sharpEnd).toBe(true);
  });

  it('compares in the projection\'s own dollars: today\'s dollars against a converted portfolio', () => {
    const p = withEvents(event({}));
    const nominal = runProjection(p);
    const real = deflateProjectionForDisplay(nominal, true);
    const [fn] = findBigExpenses(p, nominal);
    const [fr] = findBigExpenses(p, real);
    const row = nominal.years.find((y) => y.year === fn.year);
    // Future dollars: the charge; today's dollars: the entered amount (General
    // inflation), against the converted start-of-year portfolio.
    expect(fn.amount).toBeCloseTo(250000 * row.inflFactor, 6);
    expect(fr.amount).toBeCloseTo(250000 * row.inflFactor / yearFactor(row), 6);
    expect(fr.amount).toBeCloseTo(250000, 6);
    // The share is the same fact in either dollars.
    expect(fr.portfolioShare).toBeCloseTo(fn.portfolioShare, 9);
  });

  it('follows the event\'s Inflation Category: None is the fixed amount charged', () => {
    const p = withEvents(event({ inflationCategory: 'None' }));
    const [f] = found(p);
    expect(f.amount).toBe(250000);
  });

  // Changelog 220: the same fact in a unit a person can judge.
  it('also says how many years of normal withdrawals the expense is', () => {
    const p = withEvents(event({}));
    const f = found(p)[0];
    const row = runProjection(p).years.find((y) => y.year === f.year);
    // Normal draw is the year's drawdown with the life event taken back
    // out -- what would have come out had this expense not been there.
    const normal = row.drawdown - row.milestoneOutflow;
    expect(normal).toBeGreaterThan(0);
    expect(f.drawYears).toBeCloseTo(f.amount / normal, 9);
    // And it has to be the expensive kind of big: this one is more than a
    // year of ordinary withdrawals taken at once.
    expect(f.drawYears).toBeGreaterThan(1);
  });

  it('says nothing rather than a made-up ratio when nothing is normally drawn', () => {
    // A year funded entirely by Social Security and a pension: the only
    // money leaving the portfolio IS the life event, so there is no
    // ordinary draw to compare it against.
    const covered = plan({
      ...retiree, lifestyleExpense: 30000, ss1: 60000, claimingAge1: 62,
      preTaxInit: 300000, taxableInit: 60000, rothInit: 0,
      milestones: [event({ amount: 40000, startAge: 67 })],
    });
    const f = findBigExpenses(covered, runProjection(covered));
    expect(f).toHaveLength(1);
    const row = runProjection(covered).years.find((y) => y.year === f[0].year);
    expect(row.drawdown - row.milestoneOutflow).toBeLessThanOrEqual(0);
    expect(f[0].drawYears).toBeNull();
  });

  it('ignores one too small to matter, against this portfolio', () => {
    expect(found(withEvents(event({ amount: 25000 })))).toHaveLength(0);
    // Same dollars, a much smaller portfolio: now it matters. The measure
    // is the share, not the sum.
    const poorer = plan({ ...retiree, preTaxInit: 260000, taxableInit: 60000, rothInit: 0, milestones: [event({ amount: 25000 })] });
    expect(findBigExpenses(poorer, runProjection(poorer)).length).toBe(1);
  });

  it('is the whole point: the same expense early and late are not the same', () => {
    const early = found(withEvents(event({ startAge: 67 })));
    const late = found(withEvents(event({ id: 'y', startAge: 82 })));
    expect(early).toHaveLength(1);
    expect(early[0].retiredYear).toBeLessThanOrEqual(WINDOW_YEARS);
    // Age 82 is seventeen years into retirement -- outside the window, so
    // not flagged at all.
    expect(late).toHaveLength(0);
    // And inside the window, the first five years are marked apart.
    const middle = found(withEvents(event({ id: 'z', startAge: 73 })));
    expect(middle).toHaveLength(1);
    expect(middle[0].sharpEnd).toBe(false);
  });

  it('leaves out money already set aside outside the plan', () => {
    expect(found(withEvents(event({ fundedExternally: true })))).toHaveLength(0);
    // And leaves inflows alone -- money arriving is not a risk.
    expect(found(withEvents(event({ type: 'inflow' })))).toHaveLength(0);
  });

  it('lists a recurring expense once, at its worst year, biggest bite first', () => {
    const f = found(withEvents(
      event({ id: 'care', name: 'Care', amount: 120000, isRecurring: true, startAge: 66, endAge: 72 }),
      event({ id: 'roof', name: 'Roof', amount: 300000, startAge: 68 }),
    ));
    expect(f.map((x) => x.id)).toEqual(['roof', 'care']);
    expect(f.filter((x) => x.id === 'care')).toHaveLength(1);
    expect(f[0].portfolioShare).toBeGreaterThan(f[1].portfolioShare);
  });

  it('says nothing at all when there is no retired year or no event', () => {
    expect(found(plan({ ...retiree, milestones: [] }))).toEqual([]);
    const never = plan({ ...retiree, retireAge1: 95, lifeExpectancy1: 90, milestones: [event({})] });
    expect(findBigExpenses(never, runProjection(never))).toEqual([]);
  });
});

describe('what the timing costs', () => {
  const p = withEvents(event({}));

  it('prices where it sits, calm and in a fall, and what moving it would do', () => {
    const t = bigExpenseTiming(p, runProjection(p));
    expect(t.focus.id).toBe('x');
    // A crash at retirement costs real money against the same expense.
    expect(t.asPlanned.crash.endingBalance).toBeLessThan(t.asPlanned.calm.endingBalance);
    expect(t.shifts.map((s) => s.years)).toEqual([2, 3, 5]);
    // Every shift is measured in the SAME bad market as the crash row, or
    // the comparison is between two different questions.
    for (const s of t.shifts) {
      expect(Math.abs(s.endingBalance - t.asPlanned.crash.endingBalance))
        .toBeLessThan(t.asPlanned.calm.endingBalance - t.asPlanned.crash.endingBalance);
    }
  });

  it('honours the expense the user picked, and caps how many get the treatment', () => {
    const many = withEvents(
      event({ id: 'a', name: 'A', amount: 260000, startAge: 66 }),
      event({ id: 'b', name: 'B', amount: 270000, startAge: 68 }),
      event({ id: 'c', name: 'C', amount: 280000, startAge: 70 }),
      event({ id: 'd', name: 'D', amount: 290000, startAge: 72 }),
    );
    const t = bigExpenseTiming(many, runProjection(many), { focusId: 'b' });
    expect(t.focus.id).toBe('b');
    expect(t.flagged).toHaveLength(MAX_FLAGGED);
    // An id that is not flagged falls back to the biggest rather than
    // throwing or silently reporting nothing.
    expect(bigExpenseTiming(many, runProjection(many), { focusId: 'nope' }).focus.id).toBe(t.flagged[0].id);
  });

  it('moves a copy, never the plan', () => {
    const before = JSON.stringify(p.milestones);
    shiftedOutcome(p, 'x', 5, { crash: true });
    expect(JSON.stringify(p.milestones)).toBe(before);
  });

  it('actually moves the expense, and a recurring one keeps its length', () => {
    // A shift the plan can feel: the same event five years later leaves a
    // different ending balance.
    const here = shiftedOutcome(p, 'x', 0, { crash: true });
    const later = shiftedOutcome(p, 'x', 5, { crash: true });
    expect(later.endingBalance).not.toBeCloseTo(here.endingBalance, 2);

    // Shifting must mean exactly what a user would mean by it: the same
    // event, later, for the same length of time. So a shifted plan has to
    // land on the same number as a plan with the later ages typed in by
    // hand -- which a shift that moved only one of the two ages, or
    // stretched a one-off into a five-year run, would not.
    const byHand = withEvents(event({ startAge: 72, endAge: 72 }));
    expect(shiftedOutcome(p, 'x', 5, { crash: true }).endingBalance)
      .toBeCloseTo(shiftedOutcome(byHand, 'x', 0, { crash: true }).endingBalance, 6);

    const rec = withEvents(event({ id: 'care', amount: 120000, isRecurring: true, startAge: 66, endAge: 70 }));
    const recByHand = withEvents(event({ id: 'care', amount: 120000, isRecurring: true, startAge: 69, endAge: 73 }));
    const shifted = shiftedOutcome(rec, 'care', 3, {});
    expect(shifted.endingBalance).toBeCloseTo(shiftedOutcome(recByHand, 'care', 0, {}).endingBalance, 6);
    expect(shifted.endingBalance).not.toBeCloseTo(shiftedOutcome(rec, 'care', 0, {}).endingBalance, 2);
  });

  it('returns nothing to price when nothing is flagged', () => {
    const none = plan({ ...retiree, milestones: [] });
    expect(bigExpenseTiming(none, runProjection(none))).toEqual({ flagged: [], focus: null });
  });
});
