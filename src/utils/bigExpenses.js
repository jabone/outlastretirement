// Readiness question 4 (changelog 219): are the biggest inflexible expenses
// behind you, or accounted for?
//
// Every one of them is already COSTED by the plan. None of them is TIMED.
// A $90k roof in the second year of retirement and the same roof in the
// twelfth are one identical milestone today, and they are not remotely the
// same risk: the first sells assets into a portfolio that has not recovered
// and still has the whole retirement to fund. That is the entire thesis of
// this module, and the test that must fail if the window logic breaks.
//
// Nothing here is a second opinion about the plan. The milestones are an
// INPUT, read as the user wrote them; everything else -- the portfolio at
// the start of the year, the year's spending, the essential share -- is a
// row field the engine published.
import { runProjection } from '../calculator';
import { yearFactor } from './displayDollars';
import { sanitizeForProjection, deflateProjectionForDisplay } from './oneLeverCompare';

// John's calls, 2026-09-24. A share of the portfolio rather than a dollar
// figure, so it scales with the plan instead of flagging $50k for everyone;
// and ten years, because sequence-of-returns damage is a decade-long
// problem and five would miss a home project.
export const BIG_SHARE = 0.05;
export const WINDOW_YEARS = 10;
export const SHARP_END_YEARS = 5;
// How far the what-if moves an expense. Nothing is applied to the plan --
// these runs shift a copy.
export const SHIFT_CHOICES = [2, 3, 5];
// At most this many expenses get the expensive treatment, so the card's
// projection count stays bounded however many milestones a plan carries.
export const MAX_FLAGGED = 3;

const num = (v) => Math.max(0, Number(v) || 0);
// What the year would have drawn from the portfolio without the life
// events in it. Both halves are published row fields.
const normalDraw = (row) => Math.max(0, num(row.drawdown) - num(row.milestoneOutflow));
const startTotal = (row) => num(row.preTaxStart) + num(row.rothStart) + num(row.taxableStart) + num(row.hsaStart);

// The factor the engine grows a life event's entered amount by in `row`'s
// year (calculator.js milestoneInflFactor): None is the fixed amount,
// Housing the housing rate from the plan's first year, Medical the row's
// medical factor, anything else general inflation.
function chargedFactor(milestone, row, inputs, startYear) {
  switch (milestone && milestone.inflationCategory) {
    case 'None': return 1;
    case 'Housing': {
      const rate = inputs.housingInflationRate !== undefined ? inputs.housingInflationRate : inputs.inflationRate;
      return Math.pow(1 + (Number(rate) || 0) / 100, (Number(row.year) || startYear) - startYear);
    }
    case 'Medical': return Number(row.medicalInflFactor) || Number(row.inflFactor) || 1;
    default: return Number(row.inflFactor) || 1;
  }
}

// Every year a milestone is actually charged to the plan, with the age it
// falls at. A recurring milestone spans startAge..endAge; a one-off is a
// single year the same way the engine reads it.
function chargedYears(milestone, rows) {
  const start = Number(milestone.startAge);
  const end = milestone.isRecurring ? Number(milestone.endAge) : start;
  return rows.filter((r) => r.age1 >= start && r.age1 <= (end >= start ? end : start));
}

// The expenses worth talking about: outflow milestones that land inside the
// window and take at least BIG_SHARE of the portfolio in one year.
//
// `fundedExternally` is excluded outright. That money is already set aside
// outside the accounts this app tracks, the engine never charges it to any
// of them, and flagging it would frighten a household about a bill they
// have already paid for.
export function findBigExpenses(inputs, projection, { share = BIG_SHARE, windowYears = WINDOW_YEARS } = {}) {
  const rows = (projection && projection.years) || [];
  const retired = rows.filter((y) => y.isRetired);
  if (retired.length === 0) return [];
  const windowRows = retired.slice(0, Math.max(1, windowYears));
  const firstYear = windowRows[0].year;
  const startYear = Number(rows[0].year) || Number(inputs.planYear) || 0;

  const found = [];
  for (const m of (inputs.milestones || [])) {
    if (m.type !== 'outflow' || m.fundedExternally) continue;
    for (const row of chargedYears(m, windowRows)) {
      const portfolio = startTotal(row);
      // The figure actually charged that year (the engine grows the entered
      // amount by the event's Inflation Category), in the same dollars as
      // the portfolio it is compared with: a projection converted to
      // today's dollars (displayBasis 'today') has its balances divided by
      // the year's price level, so the charge is too.
      const charged = num(m.amount) * chargedFactor(m, row, inputs, startYear);
      const amount = projection.displayBasis === 'today' ? charged / yearFactor(row) : charged;
      const portfolioShare = portfolio > 0 ? amount / portfolio : 0;
      if (portfolioShare < share) continue;
      found.push({
        id: m.id,
        name: m.name,
        year: row.year,
        age: row.age1,
        amount,
        enteredAmount: num(m.amount),
        portfolio,
        portfolioShare,
        // How far into retirement it lands. 1 is the first retired year.
        retiredYear: row.year - firstYear + 1,
        sharpEnd: (row.year - firstYear) < SHARP_END_YEARS,
        recurring: !!m.isRecurring,
        // The same fact in a unit a person can judge. "6.9% of the
        // portfolio" is a number you have to convert; "fifteen months of
        // normal withdrawals, in one go" is one you can feel.
        //
        // Normal draw is that year's own drawdown with the life events
        // taken back out -- what the household would have taken had this
        // expense not been in the plan. Null in a year funded entirely by
        // Social Security and pensions, where there is no normal draw to
        // compare against and a ratio would be an invention.
        drawYears: normalDraw(row) > 0 ? amount / normalDraw(row) : null,
        // What share of that year's spending could flex at all, when the
        // ledger says. An expense landing in a year that is nearly all
        // essentials is a different problem from one landing where half
        // the budget is travel.
        flexShare: row.essentialShare === null || row.essentialShare === undefined
          ? null
          : Math.max(0, 1 - row.essentialShare),
      });
    }
  }
  // Biggest bite first, and only ever the worst year of a recurring one --
  // listing the same milestone ten times would bury everything else.
  found.sort((a, b) => b.portfolioShare - a.portfolioShare);
  const seen = new Set();
  return found.filter((f) => (seen.has(f.id) ? false : seen.add(f.id)));
}

function shiftMilestone(milestone, years) {
  const start = Number(milestone.startAge) + years;
  return {
    ...milestone,
    startAge: start,
    endAge: milestone.isRecurring ? Number(milestone.endAge) + years : start,
  };
}

// The what-if the card runs WITHOUT touching the plan: the same milestone,
// later, in a copy of the inputs. Acting on the answer is a separate
// decision the user makes in Life Events.
export function shiftedOutcome(inputs, milestoneId, years, { useRealDollars = true, crash = false } = {}) {
  const base = sanitizeForProjection(inputs);
  const milestones = (base.milestones || []).map((m) => (m.id === milestoneId ? shiftMilestone(m, years) : m));
  const patch = crash ? {
    stressType: 'crashYear',
    stressStartMode: 'retirement',
    stressCrashReturn: -20,
    stressCrashInflation: Number(base.inflationRate) || 0,
  } : {};
  const proj = deflateProjectionForDisplay(runProjection({ ...base, ...patch, milestones }), useRealDollars);
  return { years, ...outcome(proj) };
}

// A plan that fails in every variant has an ending balance of zero in every
// variant, and zero against zero says nothing. The year the money runs out
// still moves, so it is reported beside the balance and the card leads with
// whichever one actually differs.
function outcome(proj) {
  const broke = (proj.years || []).find((y) => y.isRetired && (Number(y.totalPortfolioEnding) || 0) <= 0) || null;
  return {
    isSuccessful: !!proj.isSuccessful,
    endingBalance: proj.endingBalance || 0,
    depletionYear: broke ? broke.year : null,
  };
}

// The whole card in one call.
//
// Cost: 2 runs for the baselines, plus 2 per shift choice for the one
// expense being examined. The caller picks that expense, so the count does
// not grow with the number of milestones.
export function bigExpenseTiming(inputs, projection, { focusId = null, useRealDollars = true } = {}) {
  const flagged = findBigExpenses(inputs, projection).slice(0, MAX_FLAGGED);
  if (flagged.length === 0) return { flagged: [], focus: null };

  const focus = flagged.find((f) => f.id === focusId) || flagged[0];
  const base = sanitizeForProjection(inputs);
  const view = (patch) => deflateProjectionForDisplay(runProjection({ ...base, ...patch }), useRealDollars);
  const calm = view({});
  const crashed = view({
    stressType: 'crashYear',
    stressStartMode: 'retirement',
    stressCrashReturn: -20,
    stressCrashInflation: Number(base.inflationRate) || 0,
  });

  return {
    flagged,
    focus,
    // Where it sits today, in a normal market and in a bad one. The gap
    // between these two is what "a big withdrawal at a bad time" costs.
    asPlanned: { calm: outcome(calm), crash: outcome(crashed) },
    // And what moving it would do, in that same bad market -- the only
    // market where the timing is the question.
    shifts: SHIFT_CHOICES.map((n) => shiftedOutcome(inputs, focus.id, n, { useRealDollars, crash: true })),
  };
}
