// The annual review (changelog 256): what to do when a year has passed.
//
// The Plan Year page could advance the calendar and warned that "balances,
// salary and every other dollar figure were left exactly as they were --
// head into Plan Settings to bring them up to date". This is the list of
// what that means, in order, with a place to go for each and a checkbox
// that remembers what has been done for THIS plan year. Two steps can be
// done by the app itself and are offered as buttons: carrying the IRMAA
// lookback history forward one year, and saving a snapshot to compare
// against next year. Everything else needs a statement, a pay stub or an
// SSA letter -- only the person has those.
//
// Pure: the panel supplies inputs, the projection and today's year; the
// storage helpers below are the only side effects, and they are keyed by
// plan year so a review done for 2027 does not read as done for 2028.
import { TAX_YEAR } from '../calculator';
import { HISTORY_LAST_YEAR } from '../config/historicalReturns';
import { LIFE_TABLE_VINTAGE } from '../config/lifeTable';

export const REVIEW_KEY = 'retire_plan_annual_review_v1';

function readAll() {
  try { return JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}') || {}; } catch { return {}; }
}
function writeAll(all) {
  try { localStorage.setItem(REVIEW_KEY, JSON.stringify(all)); } catch { /* storage unavailable: nothing to remember */ }
}

// { done: { [stepId]: isoDate }, completedAt: isoDate|null } for a plan year.
export function readReview(planYear) {
  const r = readAll()[String(planYear)];
  return r && typeof r === 'object' ? { done: r.done || {}, completedAt: r.completedAt || null } : { done: {}, completedAt: null };
}

export function markStep(planYear, stepId, done, now = new Date()) {
  const all = readAll();
  const cur = readReview(planYear);
  const next = { ...cur.done };
  if (done) next[stepId] = now.toISOString(); else delete next[stepId];
  all[String(planYear)] = { done: next, completedAt: cur.completedAt };
  writeAll(all);
  return all[String(planYear)];
}

export function markReviewComplete(planYear, now = new Date()) {
  const all = readAll();
  const cur = readReview(planYear);
  all[String(planYear)] = { done: cur.done, completedAt: now.toISOString() };
  writeAll(all);
  return all[String(planYear)];
}

// A review is due when the plan's own year lags the real calendar. A plan
// built this year is not "unreviewed" -- it is new -- so that is the only
// trigger; the checklist itself is always there to run by choice.
export function reviewDue(inputs, realYear = new Date().getFullYear()) {
  const planYear = Number(inputs.planYear) || realYear;
  if (planYear < realYear) return { due: true, years: realYear - planYear };
  return { due: false, years: 0 };
}

// Milestones the plan has already passed: their last age is below spouse
// 1's current age. The engine simply never charges them, so they are not
// wrong -- but a "new roof, 2025" sitting in the list a year later reads
// as still to come, and this is the moment to record what it actually cost.
export function passedMilestones(inputs) {
  const age1 = (Number(inputs.planYear) || 0) - (Number(inputs.birthYear1) || 0);
  if (!(age1 > 0)) return [];
  return (inputs.milestones || []).filter((m) => {
    const end = Number(m.isRecurring ? m.endAge : m.startAge);
    return Number.isFinite(end) && end < age1;
  });
}

// Carry the Medicare lookback forward one plan year: the return for
// (newYear - 2) is what was the prior year's, and the return for
// (newYear - 1) is best estimated by what the plan modeled for its first
// year -- the person replaces it with the real 1040 figure when it exists.
// Returns the patch to apply, or null when there is nothing to carry.
export function carryIrmaaHistoryForward(inputs, projection) {
  const prior = Math.max(0, Number(inputs.irmaaPriorYearMagi) || 0);
  const firstRow = projection && projection.years && projection.years[0];
  const modeled = firstRow ? Math.max(0, Number(firstRow.irmaaMagi) || 0) : 0;
  if (!(prior > 0) && !(modeled > 0)) return null;
  return {
    irmaaTwoYearsPriorMagi: prior > 0 ? prior : 0,
    irmaaPriorYearMagi: modeled > 0 ? Math.round(modeled) : 0,
  };
}

// The checklist. `where` is a tab and, where it applies, its sub-tab --
// the panel turns it into a Go button. `auto` names an action the panel
// can perform. `autoDone` is true when the state already says the step is
// satisfied (e.g. the plan year is current), so it shows ticked without a
// click. Order is the order to do them in: the calendar first, because
// every age depends on it; the snapshot last, because it should capture
// the reviewed plan.
export function annualReviewSteps(inputs, projection, { realYear = new Date().getFullYear() } = {}) {
  const planYear = Number(inputs.planYear) || realYear;
  const passed = passedMilestones(inputs);
  const magiPatch = carryIrmaaHistoryForward(inputs, projection);
  const hasHoldings = inputs.initialBalancesSource === 'holdings';
  return [
    {
      id: 'advanceYear',
      title: `Advance the plan year to ${realYear}`,
      why: 'Every age, and the year the projection starts from, comes from the plan’s own year. Nothing else moves when you advance it.',
      auto: 'advanceYear',
      autoDone: planYear >= realYear,
      where: null,
    },
    {
      id: 'balances',
      title: 'Bring the starting balances to the January statements',
      why: hasHoldings
        ? 'Your balances are linked to Detailed Holdings: import the year-end statements there and the plan follows.'
        : 'Pre-Tax, Roth, Taxable, HSA and the cash reserve, as of the new year. Quick Update does all five in one place.',
      auto: hasHoldings ? null : 'quickUpdate',
      autoDone: false,
      where: hasHoldings ? { tab: 'portfolio' } : { tab: 'settings', subTab: 'balances' },
    },
    {
      id: 'income',
      title: 'Update salary, the Social Security estimate, and any pension figure',
      why: 'A raise, a new SSA statement (ssa.gov, each year), or a pension letter each move the plan more than most assumptions do.',
      auto: null,
      autoDone: false,
      where: { tab: 'settings', subTab: 'income' },
    },
    {
      id: 'magi',
      title: 'Carry last year’s income forward for Medicare',
      why: magiPatch
        ? `Medicare prices ${planYear + 2} off the ${planYear} return. Carry forward fills the two lookback figures from what the plan modeled; replace the ${planYear} one with your real 1040 when it exists.`
        : 'Medicare prices each year off the return from two years earlier. Enter the last two years’ MAGI under Taxes & Roth → Medicare Premiums (IRMAA) so the first Medicare years are priced right.',
      auto: magiPatch ? 'carryMagi' : null,
      autoDone: false,
      where: { tab: 'settings', subTab: 'taxes' },
      patch: magiPatch,
    },
    {
      id: 'conversions',
      title: 'Record any Roth conversion you actually made',
      why: 'Converted to Roth in the Last 4 Years drives the five-year clocks on early Roth withdrawals; the plan’s own modeled conversions are not the ones you filed.',
      auto: null,
      autoDone: false,
      where: { tab: 'settings', subTab: 'balances' },
    },
    {
      id: 'spending',
      title: 'Check the spending figures against what last year cost',
      why: 'The retirement target, the current-spending figure or the category ledger. If you use the ledger, the transaction import will do the arithmetic.',
      auto: null,
      autoDone: false,
      where: { tab: 'settings', subTab: 'spending' },
    },
    {
      id: 'milestones',
      title: passed.length ? `Clear ${passed.length} life event${passed.length === 1 ? '' : 's'} the plan has passed` : 'Review the life events',
      why: passed.length
        ? `${passed.map((m) => m.name).join(', ')} ${passed.length === 1 ? 'is' : 'are'} dated before the plan’s current age, so the plan no longer charges ${passed.length === 1 ? 'it' : 'them'}. Remove or re-date.`
        : 'Add anything now on the horizon; shift anything that slipped.',
      auto: null,
      autoDone: false,
      where: { tab: 'settings', subTab: 'milestones' },
      passed,
    },
    {
      id: 'taxTables',
      title: `Tax figures verified for ${TAX_YEAR}`,
      why: TAX_YEAR >= planYear
        ? 'Brackets, IRMAA thresholds and contribution limits are current for this plan year.'
        : `The app’s brackets, IRMAA thresholds and contribution limits were last verified for ${TAX_YEAR}. Only an app update moves them; until then the plan prices ${planYear} with ${TAX_YEAR} figures.`,
      auto: null,
      autoDone: TAX_YEAR >= planYear,
      where: null,
    },
    {
      // The two data vintages behind the Monte Carlo (changelog 269): the
      // market history the bootstrap draws from, and the life table.
      // Only an app update moves either; the step just says whether they
      // have kept up with the plan year.
      id: 'dataVintage',
      title: `Market history through ${HISTORY_LAST_YEAR}; ${LIFE_TABLE_VINTAGE}`,
      why: HISTORY_LAST_YEAR >= planYear - 1
        ? 'The bootstrap\u2019s return history runs through the last full calendar year and the life table is the latest the Trustees Report uses. Nothing to do.'
        : `The bootstrap\u2019s return history stops at ${HISTORY_LAST_YEAR}, ${planYear - 1 - HISTORY_LAST_YEAR} year${planYear - 1 - HISTORY_LAST_YEAR === 1 ? '' : 's'} short of the last full calendar year. An app update adds the missing years; until then the trials draw from what is there.`,
      auto: null,
      autoDone: HISTORY_LAST_YEAR >= planYear - 1,
      where: null,
    },
    {
      id: 'monteCarlo',
      title: 'Run the Monte Carlo again',
      why: 'The range on the Ending Balance card belongs to the plan it was run for; after a review that is a different plan.',
      auto: null,
      autoDone: false,
      where: { tab: 'risk', subTab: 'montecarlo' },
    },
    {
      id: 'snapshot',
      title: `Save a snapshot named “Annual review ${planYear}”`,
      why: 'Next year’s review compares against it on the Scenarios page: what a year did to the plan, in one row.',
      auto: 'snapshot',
      autoDone: false,
      where: { tab: 'scenarios' },
    },
  ];
}
