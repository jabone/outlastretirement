// The six Retirement Readiness answers as six sentences (changelog 253).
//
// The Readiness tab answers each question with a card; the printed report
// wants each as one line a spouse or an advisor can read without the app.
// Both come from the same engine output -- every figure here is one the
// Readiness utilities already produce, restated, never recomputed (the
// display-drift class from the 2026-09-14 roadmap). Free-tier content only:
// the question and its headline, none of the Premium detail.
//
// Costs: walkAwayNow (one projection + the spending search), crashCompare
// (three), workLongerCompare (one), plus the projection in hand. Callers
// memoize on the plan.
import {
  walkAwayNow, crashCompare, firstYearsPlan, workLongerCompare, CRASH_HEADLINE_RETURN, FIRST_YEARS,
  SPENDING_SOLVE_TEXT, paidOutFigures, joinParts,
} from './retirementReadiness';
import { invalidInputLines, CHECK_INPUTS_TITLE } from './planNotices';
import { findBigExpenses, BIG_SHARE, WINDOW_YEARS } from './bigExpenses';

const fmtDefault = (v) => '$' + Math.round(Number(v) || 0).toLocaleString();

function runsOut(outcome) {
  if (outcome.isSuccessful) return null;
  if (outcome.depletionYear) {
    return `runs out in ${outcome.depletionYear}${outcome.depletionAge ? ` (age ${outcome.depletionAge})` : ''}`;
  }
  return 'comes up short';
}

export function readinessSummary(inputs, projection, { useRealDollars = true, formatCurrency = fmtDefault, extraYears = 3 } = {}) {
  const money = (v) => formatCurrency(Math.round(Number(v) || 0));
  const lines = [];

  // A plan with no years to project (life expectancy below the current
  // age) has no answer to any of the six; say so once per line rather
  // than printing "Retiring in null".
  const invalid = invalidInputLines(projection, inputs);
  if (!((projection && projection.years) || []).length || invalid.length) {
    return [
      ['walkAway', 'If you walked away today, could the portfolio carry this lifestyle?'],
      ['crash', `If the market fell ${Math.abs(CRASH_HEADLINE_RETURN)}% right after you retire, could you stay retired without changing your lifestyle?`],
      ['paycheck', 'What replaces the paycheck?'],
      ['bigExpenses', 'Are your biggest expenses landing in the years that can least absorb them?'],
      ['firstYears', `Where does the first ${FIRST_YEARS} years of money come from?`],
      ['workLonger', 'What would working longer actually buy you?'],
    ].map(([id, question]) => ({ id, question, answer: invalid.length ? `${CHECK_INPUTS_TITLE}: ${invalid.join(' ')}` : SPENDING_SOLVE_TEXT.noRows, ok: null }));
  }

  // 1. Walk away today
  const walk = walkAwayNow(inputs, { useRealDollars });
  if (walk.alreadyRetired) {
    const out = runsOut(walk);
    lines.push({
      id: 'walkAway',
      question: 'If you walked away today, could the portfolio carry this lifestyle?',
      answer: out
        ? `This plan is already retired, and it ${out}.`
        : `This plan is already retired, and it lasts to the end with ${money(walk.endingBalance)} to spare.`,
      ok: walk.isSuccessful,
    });
  } else {
    const out = runsOut(walk);
    const support = walk.supportsStatus === 'ok'
      ? (walk.supports > 0 ? ` It supports about ${money(walk.supports)}/yr of spending against a ${money(walk.budget)}/yr budget.` : '')
      : (SPENDING_SOLVE_TEXT[walk.supportsStatus] ? ` ${SPENDING_SOLVE_TEXT[walk.supportsStatus]}` : '');
    lines.push({
      id: 'walkAway',
      question: 'If you walked away today, could the portfolio carry this lifestyle?',
      answer: walk.isSuccessful
        ? `Yes. Retiring in ${walk.retirementYear}, the plan lasts to the end.${support}`
        : `Not yet. Retiring in ${walk.retirementYear}, the plan ${out}.${support}`,
      ok: walk.isSuccessful,
    });
  }

  // 2. The 20% fall
  const crash = crashCompare(inputs, { useRealDollars });
  const heldOut = runsOut(crash.held);
  const adaptedOut = runsOut(crash.adapted);
  lines.push({
    id: 'crash',
    question: `If the market fell ${Math.abs(CRASH_HEADLINE_RETURN)}% right after you retire, could you stay retired without changing your lifestyle?`,
    answer: crash.held.isSuccessful
      ? `Yes. With spending unchanged the plan still lasts, ending with ${money(crash.held.endingBalance)} instead of ${money(crash.baseline.endingBalance)}.`
      : `No. With spending unchanged the plan ${heldOut}; with the withdrawal-rate guardrail adjusting spending it ${adaptedOut || 'lasts'}${crash.adapted.deepestCutPct ? ` (deepest cut ${crash.adapted.deepestCutPct}%)` : ''}.`,
    ok: crash.held.isSuccessful,
  });

  // 3. The paycheck
  const first = firstYearsPlan(projection, { years: FIRST_YEARS });
  if (first && first.headline) {
    const h = first.headline;
    const f = paidOutFigures(h);
    const reserve = first.reserveEnabled && h.reserveMonths > 0 ? ` The cash reserve covers about ${Math.round(h.reserveMonths)} months.` : '';
    lines.push({
      id: 'paycheck',
      question: 'What replaces the paycheck?',
      answer: `${h.year} pays out ${money(f.paidOut)}, about ${money(f.paidOut / 12)} a month: ${joinParts(f.parts, money)}. ${money(f.arrives)} arrives on its own and one transfer of ${money(f.fromPortfolio)} comes out of the portfolio${h.biggestDrawLabel ? ` (mostly from ${h.biggestDrawLabel})` : ''}${f.toReserve > 0 ? `, ${money(f.toReserve)} of it into the cash reserve` : ''}; ${money(h.taxesPerQuarter)} a quarter is the tax to set aside.${reserve}`,
      ok: null,
    });
  } else {
    lines.push({ id: 'paycheck', question: 'What replaces the paycheck?', answer: 'The plan has no retired years to show.', ok: null });
  }

  // 4. Big expenses at bad times
  const big = findBigExpenses(inputs, projection);
  lines.push({
    id: 'bigExpenses',
    question: 'Are your biggest expenses landing in the years that can least absorb them?',
    answer: big.length === 0
      ? `No life event reaches ${Math.round(BIG_SHARE * 100)}% of the portfolio in the first ${WINDOW_YEARS} retired years.`
      : `${big.length === 1 ? 'One event does' : `${big.length} events do`}: ${big.map((b) => `${b.name} in ${b.year} (${money(b.amount)}${b.sharpEnd ? ', in the first five years' : ''})`).join('; ')}.`,
    ok: big.length === 0 ? true : !big.some((b) => b.sharpEnd),
  });

  // 5. The first five years
  if (first && first.rows && first.rows.length) {
    const r0 = first.rows[0];
    const top = [...(r0.sources || [])].filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 3);
    lines.push({
      id: 'firstYears',
      question: `Where does the first ${FIRST_YEARS} years of money come from?`,
      answer: top.length
        ? `${first.startYear}–${first.endYear}, starting with ${top.map((s) => `${s.label} ${Math.round(s.share * 100)}%`).join(', ')} in ${r0.year}.`
        : `${first.startYear}–${first.endYear}.`,
      ok: null,
    });
  }

  // 6. Working longer
  const longer = workLongerCompare(inputs, { extraYears, useRealDollars });
  lines.push({
    id: 'workLonger',
    question: 'What would working longer actually buy you?',
    answer: `${extraYears} more year${extraYears === 1 ? '' : 's'}: retire in ${longer.later.retirementYear} instead of ${longer.base.retirementYear}, ending with ${money(longer.later.endingBalance)} instead of ${money(longer.base.endingBalance)}, for ${longer.yearsGivenUp} fewer retired year${longer.yearsGivenUp === 1 ? '' : 's'}.`,
    ok: null,
  });

  return lines;
}
