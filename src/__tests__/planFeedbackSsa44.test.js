// Changelog 131: the Dashboard's Plan Feedback card for Form SSA-44.
//
// The card exists because the SSA-44 problem is invisible by construction:
// the premium is billed on a tax return filed two years earlier, so the year
// it lands in shows an enormous Medicare cost against almost no income and
// nothing on screen explains why. These tests pin the three things that make
// the card trustworthy -- that it only fires when there is real money in it,
// that it says how much, and that it gets out of the way once the plan
// already assumes the appeal (where the Action Plan takes over).
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, rmdStartAge as getRMDAge } from '../calculator.js';
import { getPlanFeedback } from '../utils/planFeedback.js';

const SSA44_CARD = /Medicare Premiums Billed on Your Working Income/;
const findCard = (recs) => recs.find((r) => SSA44_CARD.test(r.title));

// Retires at 68, so the first Medicare years are priced off full salary and
// the plan is past the two opening years that have nothing to look back to.
const APPEALABLE = {
  ...DEFAULT_INPUTS,
  spouse2Enabled: false,
  birthYear1: 1961,
  retireAge1: 68,
  lifeExpectancy1: 90,
  salary1: 400000,
  preTaxInit: 1500000,
  rothInit: 300000,
  taxableInit: 800000,
  lifestyleExpense: 90000,
  irmaaLifeChangeAppealEnabled: false,
};

const feedbackFor = (inputs) =>
  getPlanFeedback(inputs, runProjection(inputs), null, getRMDAge);

describe('SSA-44 Plan Feedback card (changelog 131)', () => {
  it('fires on a plan whose first Medicare years are priced off salary', () => {
    const card = findCard(feedbackFor(APPEALABLE));
    expect(card).toBeTruthy();
    expect(card.type).toBe('warning');
  });

  it('quotes the projection\'s own saving and the years it covers', () => {
    const projection = runProjection(APPEALABLE);
    const appealYears = projection.years.filter((y) => (y.irmaaAppealSavings || 0) > 0);
    const total = appealYears.reduce((s, y) => s + y.irmaaAppealSavings, 0);
    const card = findCard(getPlanFeedback(APPEALABLE, projection, null, getRMDAge));

    expect(total).toBeGreaterThan(0);
    expect(card.desc).toContain(`$${Math.round(total).toLocaleString()}`);
    expect(card.desc).toContain(`${appealYears[0].year}`);
    expect(card.desc).toContain(`${appealYears[appealYears.length - 1].year}`);
  });

  it('names the form, the two-year lookback, and all eight qualifying events', () => {
    const card = findCard(feedbackFor(APPEALABLE));
    expect(card.desc).toContain('Medicare Income-Related Monthly Adjustment Amount - Life-Changing Event');
    expect(card.desc).toMatch(/two years earlier/);
    for (const ev of ['stopping work', 'marriage', 'divorce', 'death of a spouse',
      'work reduction', 'loss of income-producing property', 'loss of pension income',
      'employer settlement payment']) {
      expect(card.desc.toLowerCase()).toContain(ev);
    }
  });

  it('is framed as paperwork rather than a setting, and says the plan does not assume it', () => {
    const card = findCard(feedbackFor(APPEALABLE));
    expect(card.desc).toMatch(/paperwork you file with Social Security/);
    expect(card.desc).toMatch(/does not assume you file it/);
  });

  it('links to the Year by Year ledger, where the badge already is', () => {
    const card = findCard(feedbackFor(APPEALABLE));
    expect(card.action.tab).toBe('yearledger');
  });

  it('offers a one-click apply that only flips the modeling toggle', () => {
    const card = findCard(feedbackFor(APPEALABLE));
    expect(card.quickApply.config).toEqual({ irmaaLifeChangeAppealEnabled: true });
  });

  it('stands down once the plan already assumes the appeal', () => {
    // Not because the saving vanished -- it is still reported on the rows --
    // but because the Action Plan carries the reminder from there, and a
    // Dashboard alarm about something the plan already does is noise.
    const inputs = { ...APPEALABLE, irmaaLifeChangeAppealEnabled: true };
    const projection = runProjection(inputs);
    expect(projection.years.some((y) => (y.irmaaAppealSavings || 0) > 0)).toBe(true);
    expect(findCard(getPlanFeedback(inputs, projection, null, getRMDAge))).toBeUndefined();
  });

  it('stays silent for a household with no working income to be surcharged on', () => {
    const inputs = {
      ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: 1961, retireAge1: 62,
      lifeExpectancy1: 90, salary1: 0, preTaxInit: 200000, rothInit: 0,
      taxableInit: 100000, lifestyleExpense: 40000,
    };
    expect(findCard(feedbackFor(inputs))).toBeUndefined();
  });
});
