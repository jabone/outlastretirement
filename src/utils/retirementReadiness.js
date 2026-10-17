// The Retirement Readiness cards (changelog 214).
//
// Six questions the owner wants the app to answer; these are the first two.
// Both are PURE FUNCTIONS over what the engine already publishes -- no
// second opinion about anything the projection has already worked out.
// That is deliberate: every display bug this project has shipped in the
// last month came from a surface recomputing a number the engine owns
// (changelogs 174, 176, 184, 185). A card that only reads row fields
// cannot drift from the ledger.
//
// The one thing a card DOES decide is what to call things, and in what
// order -- see FUNDING_SOURCES below.
import { runProjection, findDieWithZeroSpending, DIE_WITH_ZERO_CEILING } from '../calculator';
import { sanitizeForProjection, deflateProjectionForDisplay } from './oneLeverCompare';
import { spendingCost } from './spendingCost';
import { firstShortfallRow } from './planVerdict';
import { probAliveAt, probAnyAlive } from './mortality';

export const FIRST_YEARS = 5;

// ---------------------------------------------------------------------------
// U14: the plan's horizon and the life-table odds behind it, computed once
// for the Readiness intro, the spend-to-zero table and the printed report.
// They used to compute it three ways: the screen gave each person's chance
// of reaching their OWN planned age (Riley 94: 13%), the print gave the
// chance of being alive in the plan's LAST year (Riley 95 in 2063: 11%),
// and nothing said that a person's plan can end a year before the
// household's. Every figure is now stated with the age and year it is for.
//
// Engine conventions (mortality.js): an age is the whole age during a plan
// year, a person is in the plan through the year they reach
// lifeExpectancy, and the projection ends with the last person's year.
export function planHorizon(inputs, projection) {
  const years = (projection && projection.years) || [];
  if (!years.length) return null;
  const startYear = Number(inputs.planYear) || years[0].year;
  const lastYear = years[years.length - 1].year;
  const person = (n, fallback) => {
    const birthYear = Number(inputs[`birthYear${n}`]) || 0;
    const age = startYear - birthYear;
    const planTo = Number(inputs[`lifeExpectancy${n}`]);
    return {
      name: inputs[`spouse${n}Name`] || fallback,
      sex: inputs[`sex${n}`],
      age,
      planTo,
      // The last year this person is in the plan.
      endYear: birthYear + planTo,
      reachPlanTo: probAliveAt(inputs[`sex${n}`], age, planTo),
      ageAtEnd: age + (lastYear - startYear),
      aliveAtEnd: probAliveAt(inputs[`sex${n}`], age, age + (lastYear - startYear)),
    };
  };
  const people = [person(1, 'You')];
  if (inputs.spouse2Enabled) people.push(person(2, 'Spouse'));
  if (people.some((p) => !(p.age > 0) || !(p.planTo > p.age))) return null;
  return {
    startYear,
    lastYear,
    people,
    anyAliveAtEnd: people.length === 2 ? probAnyAlive(people[0].aliveAtEnd, people[1].aliveAtEnd) : people[0].aliveAtEnd,
  };
}

// ---------------------------------------------------------------------------
// Guards for the spend-to-zero search (E17). findDieWithZeroSpending bisects
// lifestyle spending between $0 and DIE_WITH_ZERO_CEILING (calculator.js)
// and says in `reason` which kind of answer it gave. Three are not a
// spending level and must never be printed as one:
//  - 'none-works': the plan fails even at $0 (figure null);
//  - 'above-ceiling': the plan passes at the ceiling, so the figure is where
//    the search stopped, not what the plan supports;
//  - 'no-rows': no retired year to search over (life expectancy below the
//    current age, or never retiring); every "yes" would be vacuous.
const ENGINE_REASON_STATUS = Object.freeze({
  ok: 'ok', 'above-ceiling': 'aboveCeiling', 'none-works': 'none', 'no-rows': 'noRows',
});

export const SPENDING_SOLVE_TEXT = Object.freeze({
  none: 'No spending level lasts on these inputs.',
  aboveCeiling: `Your plan supports more than $${DIE_WITH_ZERO_CEILING.toLocaleString('en-US')} a year; we stop searching there.`,
  noRows: 'Check your ages: the plan has no years to project.',
});

// { status: 'ok' | 'none' | 'aboveCeiling' | 'noRows', amount }. `amount` is
// a finite number only when status is 'ok'.
//   value   the solver's spending figure (dieWithZeroSpending)
//   reason  the solver's own `reason`; decides the status when given
//   rows    how many years the plan's projection has
export function spendingSolve(value, { reason = null, rows = 1 } = {}) {
  if (!(Number(rows) > 0)) return { status: 'noRows', amount: null };
  const fromEngine = reason ? ENGINE_REASON_STATUS[reason] : null;
  if (fromEngine && fromEngine !== 'ok') return { status: fromEngine, amount: null };
  const n = value === null || value === undefined || value === '' ? NaN : Number(value);
  if (!Number.isFinite(n) || n < 0) return { status: 'none', amount: null };
  // Bisection creeps up to the ceiling without reaching it (4,999,999.99...).
  if (n >= DIE_WITH_ZERO_CEILING - 1) return { status: 'aboveCeiling', amount: null };
  return { status: 'ok', amount: n };
}

// The same, read straight off a findDieWithZeroSpending result.
export function spendingSolveOf(dwz, rows = 1) {
  return spendingSolve(dwz ? dwz.dieWithZeroSpending : null, { reason: dwz ? dwz.reason : 'none-works', rows });
}

// True when every value is something a sentence can print: a finite number
// or a non-empty string. The Readiness copy checks this before it
// interpolates, so a missing year never renders as "retiring in instead of".
export function printable(...values) {
  return values.every((v) => (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' ? v.trim() !== '' : false));
}

// Where a retirement year's money comes from, in the order a household
// meets it: what arrives whether or not you do anything, then what you
// have to decide to take.
//
// `key` is the projection row field. Nothing here is derived or blended;
// if a figure needs arithmetic beyond adding two row fields, it does not
// belong in this table.
export const FUNDING_SOURCES = [
  { key: 'ssIncome', label: 'Social Security', kind: 'income' },
  { key: 'pension', label: 'Pension', kind: 'income' },
  { key: 'salary', label: 'Work and part-time income', kind: 'income' },
  { key: 'rentalAnnuity', label: 'Rent and annuity income', kind: 'income' },
  // Dividends taken as cash rather than reinvested (changelog 231). Zero
  // unless the plan says to take them, and money that arrives without
  // anything being sold -- which is exactly what this column is for.
  { key: 'dividendCash', label: 'Dividends taken as cash', kind: 'income' },
  { key: 'drawTaxable', label: 'Taxable brokerage', kind: 'draw' },
  { key: 'drawPreTax', label: 'Pre-Tax (IRA / 401k), RMDs included', kind: 'draw' },
  { key: 'drawRoth', label: 'Roth', kind: 'draw' },
  { key: 'cashReserveDraw', label: 'Cash reserve', kind: 'draw' },
];

const money = (row, key) => Math.max(0, Number(row && row[key]) || 0);

// Why a year looks the way it does, in plain language, from the row's own
// flags. Order matters: the reasons that EXPLAIN the withdrawal mix come
// before the ones that are merely true.
function yearNotes(row, prev) {
  const notes = [];
  if (money(row, 'convertAmount') > 0) {
    notes.push({ id: 'conversion', text: 'Converting to Roth this year, which is why the Pre-Tax draw is larger than the spending alone would need.', amount: money(row, 'convertAmount') });
  }
  if (money(row, 'rmdAmount') > 0) {
    const started = !prev || money(prev, 'rmdAmount') === 0;
    notes.push({ id: 'rmd', text: started ? 'Required minimum distributions start this year — the Pre-Tax draw is no longer entirely your choice.' : 'Required minimum distributions are part of the Pre-Tax draw.', amount: money(row, 'rmdAmount') });
  }
  if (money(row, 'healthcareBridge') > 0) {
    notes.push({ id: 'bridge', text: 'Buying your own health cover before Medicare, so this year’s income decides what it costs.', amount: money(row, 'healthcareBridge') });
  }
  if (row && row.acaCliffBreached) {
    notes.push({ id: 'acaCliff', text: 'Income is over the ACA subsidy cliff this year.', amount: 0 });
  } else if (money(row, 'acaSubsidyApplied') > 0) {
    notes.push({ id: 'acaSubsidy', text: 'An ACA subsidy is helping with the health cover, which is what keeping income down buys you.', amount: money(row, 'acaSubsidyApplied') });
  }
  if (money(row, 'irmaaCost') > 0) {
    notes.push({ id: 'irmaa', text: 'Medicare premiums this year are priced on the income from two years earlier.', amount: money(row, 'irmaaCost') });
  }
  if (money(row, 'cashReserveDraw') > 0) {
    notes.push({ id: 'reserve', text: 'The cash reserve covers part of the year, so investments are not sold into a fall.', amount: money(row, 'cashReserveDraw') });
  }
  return notes;
}

// Q5: where the first five years of spending come from, and why.
//
// `projection` is the app's own projection (already deflated if the user
// is in today's dollars), so this never runs the engine itself.
// Returns null when the plan has no retired year to describe -- a plan
// that retires past its horizon, which the card should say rather than
// render an empty table.
export function firstYearsFunding(projection, { years = FIRST_YEARS } = {}) {
  const all = (projection && projection.years) || [];
  const retired = all.filter((y) => y.isRetired);
  if (retired.length === 0) return null;
  const slice = retired.slice(0, Math.max(1, years));

  const rows = slice.map((row) => {
    const prev = all[all.indexOf(row) - 1];
    const sources = FUNDING_SOURCES
      .map((s) => ({ ...s, amount: money(row, s.key) }))
      .filter((s) => s.amount > 0);
    const total = sources.reduce((t, s) => t + s.amount, 0);
    return {
      year: row.year,
      age: row.age1,
      total,
      sources: sources.map((s) => ({ ...s, share: total > 0 ? s.amount / total : 0 })),
      guaranteed: sources.filter((s) => s.kind === 'income').reduce((t, s) => t + s.amount, 0),
      fromPortfolio: sources.filter((s) => s.kind === 'draw').reduce((t, s) => t + s.amount, 0),
      taxes: money(row, 'totalTaxesPaid'),
      spending: money(row, 'totalExpenses'),
      notes: yearNotes(row, prev),
    };
  });

  const first = rows[0];
  const biggest = [...first.sources].sort((a, b) => b.amount - a.amount)[0] || null;
  const span = rows.length;
  const guaranteed = rows.reduce((t, r) => t + r.guaranteed, 0);
  const portfolio = rows.reduce((t, r) => t + r.fromPortfolio, 0);
  return {
    rows,
    startYear: first.year,
    endYear: rows[span - 1].year,
    years: span,
    // The free headline: one sentence's worth of fact, from the first year.
    headline: {
      year: first.year,
      total: first.total,
      biggestLabel: biggest ? biggest.label : null,
      biggestShare: biggest ? biggest.share : 0,
      guaranteedShare: first.total > 0 ? first.guaranteed / first.total : 0,
    },
    guaranteedShare: guaranteed + portfolio > 0 ? guaranteed / (guaranteed + portfolio) : 0,
  };
}

// One column of the working-longer table (changelog 238 adds a third,
// "leave now", from walkAwayNow's run). A plan that runs out gets the year
// and age it runs out, and its lifetime tax is summed only through that
// year -- after it the plan has nothing left to tax, so a full-horizon
// total would make failing look cheap.
//
// Row amounts must be in the same dollars as the balances. A projection
// that went through deflateProjectionForDisplay (displayBasis 'today')
// already has every row converted; a raw one is converted here, each row by
// its own price index. Before changelog 238 the first-year draw was nominal
// next to real balances -- $155k "drawn" in 2031 against a $118k budget in
// today's dollars.
export function planSummary(proj, { useRealDollars = true } = {}) {
  const converted = !!(proj && proj.displayBasis === 'today');
  const f = (y) => (useRealDollars && !converted ? (Number(y && (y.priceIndex || y.inflFactor)) || 1) : 1);
  const years = (proj && proj.years) || [];
  const retired = years.filter((y) => y.isRetired);
  const first = retired[0] || null;
  const isSuccessful = !!(proj && proj.isSuccessful);
  // The first shortfall year, as the verdict names it (a portfolio that
  // never quite reaches $0 still runs short, and used to report no year).
  const broke = isSuccessful ? null : firstShortfallRow(years);
  const taxesThrough = broke
    ? years.filter((y) => y.year <= broke.year).reduce((t, y) => t + Math.max(0, Number(y.totalTaxesPaid) || 0) / f(y), 0)
    : null;
  return {
    endingBalance: (proj && proj.endingBalance) || 0,
    lifetimeTaxes: broke ? taxesThrough : ((proj && proj.totalTaxesPaid) || 0),
    isSuccessful,
    retirementYear: proj ? proj.householdRetirementYear : null,
    retiredYears: retired.length,
    firstYearDraw: first ? (money(first, 'drawPreTax') + money(first, 'drawRoth') + money(first, 'drawTaxable')) / f(first) : 0,
    depletionYear: broke ? broke.year : null,
    depletionAge: broke ? (broke.age1 ?? null) : null,
  };
}

export const WORK_LONGER_CHOICES = [1, 2, 3, 5];

// Q6: what working N more years actually buys.
//
// Both spouses move together -- "work longer" is a household decision, and
// moving one person's date would answer a different question. Life
// expectancy is untouched on purpose: the years you gain financially are
// the years you give up, and the card says so.
export function workLongerPatch(inputs, extraYears) {
  const n = Math.max(1, Math.trunc(Number(extraYears) || 0));
  const patch = { retireAge1: (Number(inputs.retireAge1) || 0) + n };
  if (inputs.spouse2Enabled) patch.retireAge2 = (Number(inputs.retireAge2) || 0) + n;
  return patch;
}

export function workLongerCompare(inputs, { extraYears = 3, useRealDollars = true } = {}) {
  const base = sanitizeForProjection(inputs);
  const later = { ...base, ...workLongerPatch(base, extraYears) };
  const baseProj = deflateProjectionForDisplay(runProjection(base), useRealDollars);
  const laterProj = deflateProjectionForDisplay(runProjection(later), useRealDollars);

  const baseSummary = planSummary(baseProj, { useRealDollars });
  const laterSummary = planSummary(laterProj, { useRealDollars });
  return {
    extraYears: Math.max(1, Math.trunc(Number(extraYears) || 0)),
    base: baseSummary,
    later: laterSummary,
    // The counterweight, and the reason this card exists rather than a
    // "best retirement age": the years are the price.
    yearsGivenUp: baseSummary.retiredYears - laterSummary.retiredYears,
    // Social Security here is the benefit the user entered, so it does not
    // rise with more earning years. Said out loud on the card.
    benefitUnchanged: true,
  };
}

// ---------------------------------------------------------------------------
// Question 2 (changelog 216): "if the market fell 20% right after you
// retire, could you stay retired without changing your lifestyle -- and at
// what decline would you have to change it?"
//
// Two runs answer the first half and a search answers the second.
//
//  - HELD: the crash happens and the household spends exactly as planned.
//    The withdrawal-rate guardrail is forced OFF here whatever the plan
//    says, because "without changing your lifestyle" is the question.
//  - ADAPTED: the same crash with the guardrail forced ON, so the card can
//    say what changing your lifestyle would actually have cost -- the
//    deepest cut the rule reaches, and for how long.
//
// The crash year's INFLATION is left at the plan's own general rate rather
// than the stress default. The question is about the market; bundling an
// inflation spike into it would answer a different, harder question and the
// user would have no way to tell which number moved.
export const CRASH_HEADLINE_RETURN = -20;
// The search range and resolution for the break point. -80% is worse than
// any single calendar year in the US record (1931 was -43%), so a plan that
// survives the whole range is reported as such rather than given a number.
const CRASH_SEARCH_WORST = -80;
const CRASH_SEARCH_STEP = 5;
const CRASH_BISECT_ROUNDS = 6;

// HELD (guardrails false) is "spending unchanged", so BOTH spending rules are
// off in it: the withdrawal-rate guardrail and the bad-year freeze
// (spendingGuardrails), which otherwise left "held" spending 12-15% below
// plan. stressInflationStrategy 'custom' keeps the crash year's inflation
// override off the housing and medical slices: with the default 'partial'
// the engine moves those onto the general rate for the stress year, which
// left held spending a fraction of a percent below plan for life. The
// general rate is already the plan's own (stressCrashInflation above).
export function crashPatch(base, crashReturn, guardrails) {
  return {
    ...base,
    stressType: 'crashYear',
    stressStartMode: 'retirement',
    stressCrashReturn: crashReturn,
    stressCrashInflation: Number(base.inflationRate) || 0,
    stressInflationStrategy: 'custom',
    withdrawalGuardrailsEnabled: guardrails,
    spendingGuardrails: guardrails ? !!base.spendingGuardrails : false,
  };
}

function crashOutcome(proj) {
  const years = proj.years || [];
  const retired = years.filter((y) => y.isRetired);
  const broke = proj.isSuccessful ? null : firstShortfallRow(years);
  const multipliers = retired
    .map((y) => y.wrGuardrailMultiplier)
    .filter((m) => typeof m === 'number');
  const deepest = multipliers.length ? Math.min(...multipliers) : null;
  return {
    isSuccessful: !!proj.isSuccessful,
    endingBalance: proj.endingBalance || 0,
    // The year the money runs out, null if it never does. This is the
    // sentence the card actually wants: "you'd be out at 84".
    depletionYear: broke ? broke.year : null,
    depletionAge: broke ? (broke.age1 ?? null) : null,
    // Only ever set on the ADAPTED run: 0.8 means spending settled 20%
    // below plan, and cutYears is how many retired years sat below plan.
    deepestCutPct: deepest === null ? null : Math.round((1 - deepest) * 1000) / 10,
    cutYears: multipliers.filter((m) => m < 1).length,
    raiseYears: multipliers.filter((m) => m > 1).length,
  };
}

// Does the plan still work with a crash of this size in the first year of
// retirement, spending unchanged?
function survivesHeld(base, crashReturn, useRealDollars) {
  const proj = deflateProjectionForDisplay(runProjection(crashPatch(base, crashReturn, false)), useRealDollars);
  return !!proj.isSuccessful;
}

// The deepest first-year decline the plan survives with spending unchanged.
// Coarse scan for the bracket, then bisect inside it -- monotonicity is
// assumed only WITHIN the bracket the scan found, which is why the scan
// exists rather than bisecting the whole range blind.
export function crashBreakPoint(inputs, { useRealDollars = true } = {}) {
  const base = sanitizeForProjection(inputs);
  if (!survivesHeld(base, 0, useRealDollars)) {
    // The plan does not survive even without a crash, so there is no
    // decline to find and saying "-0%" would be a lie about the cause.
    return { decline: null, reason: 'failsWithoutCrash' };
  }
  let good = 0;
  let bad = null;
  for (let r = -CRASH_SEARCH_STEP; r >= CRASH_SEARCH_WORST; r -= CRASH_SEARCH_STEP) {
    if (survivesHeld(base, r, useRealDollars)) {
      good = r;
    } else {
      bad = r;
      break;
    }
  }
  if (bad === null) return { decline: null, reason: 'survivesAll', worst: CRASH_SEARCH_WORST };
  for (let i = 0; i < CRASH_BISECT_ROUNDS; i += 1) {
    const mid = (good + bad) / 2;
    if (survivesHeld(base, mid, useRealDollars)) good = mid; else bad = mid;
  }
  return {
    // The last decline that still works, rounded the safe way (towards
    // zero), so the number on the card is one the plan genuinely survives.
    decline: Math.ceil(good * 10) / 10,
    // Rounded the OTHER way, away from zero, so each number keeps its
    // promise: the one on the card is survivable and the one past it is
    // not. Rounding both the same way can hand back a "first failing"
    // fall that the plan actually survives, since the bisection leaves
    // them less than a tenth of a point apart.
    firstFailing: Math.floor(bad * 10) / 10,
    reason: 'found',
  };
}

export function crashCompare(inputs, { crashReturn = CRASH_HEADLINE_RETURN, useRealDollars = true } = {}) {
  const base = sanitizeForProjection(inputs);
  const view = (patched) => deflateProjectionForDisplay(runProjection(patched), useRealDollars);
  const baseline = view({ ...base, stressType: 'none', withdrawalGuardrailsEnabled: false, spendingGuardrails: false });
  const held = view(crashPatch(base, crashReturn, false));
  const adapted = view(crashPatch(base, crashReturn, true));
  // Changelog 335: what the rule cost is measured against the SAME crash
  // with the rule off, in spending -- not read off the rule's own
  // multiplier, which says nothing about essentials or lifetime spending.
  const cost = spendingCost(adapted, held);
  return {
    crashReturn,
    baseline: crashOutcome(baseline),
    held: crashOutcome(held),
    adapted: {
      ...crashOutcome(adapted),
      deepestCutPct: cost ? Math.round(cost.deepestCut * 1000) / 10 : null,
      cutYears: cost ? cost.cutYears : 0,
      raiseYears: cost ? cost.raiseYears : 0,
      lifetimeSpendPct: cost ? Math.round(cost.lifetimeShare * 1000) / 10 : null,
      essentialsTouched: cost ? cost.essentialsTouched : null,
    },
    // What the household's own plan says today, so the card can tell a user
    // who has already switched the guardrail on that the ADAPTED column is
    // their plan rather than a hypothetical.
    guardrailsOnInPlan: !!base.withdrawalGuardrailsEnabled,
  };
}

// ---------------------------------------------------------------------------
// Question 3 (changelog 217): "what replaced the security of the paycheck --
// not just the money?"
//
// The money side of this is already in the plan; what is missing is the
// SHAPE of it. A salary arrived on a date, in an amount, with the tax
// already taken out, and nobody had to decide anything. Retirement income
// arrives as several streams on different schedules plus a pot you have to
// choose to sell out of, with the tax owed later in installments. The
// guesswork is the timing, not the total.
//
// So this reads the year the engine already published and restates it as a
// paycheck: what lands automatically, what you have to move once a year,
// what to hold back for tax, and how many months the reserve would cover if
// you moved nothing at all. It is arithmetic on published fields -- adding
// two of them, or dividing one by twelve -- and nothing more.
// A planned concentrated-stock sale's proceeds pay that year's bills before
// anything is drawn (E25), so the part spent arrives like dividend cash.
export const PAYCHECK_AUTOMATIC = ['ssIncome', 'pension', 'rentalAnnuity', 'dividendCash', 'concentratedStockProceedsSpent'];
export const PAYCHECK_TRANSFER = ['drawTaxable', 'drawPreTax', 'drawRoth', 'cashReserveDraw'];

// U12: what the year's money is spent ON, so the headline's total can be
// read as parts that add up. The first version called the whole total "to
// live on", and it includes the year's tax, health cover and one-time life
// events: $19,787 a month beside an $8,000-a-month lifestyle budget. Every
// part is a row field; together they account for everything that arrives
// and is moved, less what tops up the cash reserve (the engine's cash
// identity -- `other` is whatever is left, and is zero on every plan
// tested; it is listed only if it is not).
export const PAID_OUT_PARTS = [
  { id: 'living', label: 'living costs', text: 'for living costs', keys: ['lifestyleExpenses'] },
  { id: 'health', label: 'health cover', text: 'for health cover', keys: ['healthcareBridge', 'ltcCost', 'irmaaCost', 'foreignHealthcare', 'medicarePenalty'], less: ['hsaMedicalDraw'] },
  { id: 'tax', label: 'tax', text: 'in tax', keys: ['totalTaxesPaid'] },
  { id: 'oneTime', label: 'one-time life events', text: 'for one-time life events', keys: ['milestoneOutflow'] },
  { id: 'debt', label: 'debt payments', text: 'for debt payments', keys: ['mortgagePaymentThisYear', 'otherDebtPaymentThisYear'] },
  { id: 'gifts', label: 'gifts', text: 'in gifts', keys: ['giftsThisYear'] },
  { id: 'reinvested', label: 'income beyond spending, reinvested', text: 'of income beyond spending, reinvested', keys: ['surplusReinvested'] },
];

// Whole dollars that add up exactly to `total` (also rounded): each part
// rounded, and the rounding difference given to the largest part.
export function paidOutBreakdown(row, total) {
  const parts = PAID_OUT_PARTS.map((p) => ({
    id: p.id,
    label: p.label,
    text: p.text,
    amount: Math.max(0, p.keys.reduce((t, k) => t + money(row, k), 0) - (p.less || []).reduce((t, k) => t + money(row, k), 0)),
  }));
  const known = parts.reduce((t, p) => t + p.amount, 0);
  const other = total - known;
  if (Math.abs(other) >= 0.5) parts.push({ id: 'other', label: 'other', text: 'other', amount: other });
  const shown = parts.map((p) => ({ ...p, amount: Math.round(p.amount) })).filter((p) => p.amount !== 0);
  const target = Math.round(total);
  const diff = target - shown.reduce((t, p) => t + p.amount, 0);
  if (diff !== 0 && shown.length) {
    const big = shown.reduce((a, b) => (b.amount > a.amount ? b : a));
    big.amount += diff;
  }
  return { total: target, parts: shown };
}

// The headline's money, in whole dollars that reconcile exactly: what
// arrives on its own plus what is moved from the portfolio, less what goes
// into the reserve, is what is paid out -- and the parts add up to that.
export function paidOutFigures({ paidOut, automatic, replenish }) {
  const arrives = Math.round(automatic);
  const toReserve = Math.round(replenish);
  return {
    paidOut: paidOut.total,
    parts: paidOut.parts,
    arrives,
    toReserve,
    fromPortfolio: paidOut.total - arrives + toReserve,
  };
}

// "$96,000 for living costs, $30,000 for health cover and $100,000 in tax".
export function joinParts(parts, format) {
  const bits = parts.map((p) => `${format(p.amount)} ${p.text}`);
  if (bits.length <= 1) return bits.join('');
  return `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`;
}

function paycheckYear(row) {
  const automatic = PAYCHECK_AUTOMATIC.reduce((t, k) => t + money(row, k), 0);
  // Work income is still a paycheck in the ordinary sense, so it is named
  // separately rather than folded into either side.
  const working = money(row, 'salary');
  const transfer = PAYCHECK_TRANSFER.reduce((t, k) => t + money(row, k), 0);
  const taxes = money(row, 'totalTaxesPaid');
  const reserveMonths = Number(row && row.cashReserveMonthsCovered) || 0;
  return {
    year: row.year,
    age: row.age1,
    automatic,
    working,
    transfer,
    // The reserve draw is part of the transfer above, and named again here
    // because it is the part that did NOT come out of the market.
    fromReserve: money(row, 'cashReserveDraw'),
    // Two different numbers, and conflating them is the trap this card
    // exists to avoid. `moved` is what leaves the portfolio; `spendable`
    // is what the household can actually live on, which is smaller in any
    // year part of the transfer goes into the reserve rather than to the
    // grocery shop.
    moved: automatic + working + transfer,
    total: automatic + working + transfer - money(row, 'cashReserveReplenish'),
    paidOut: paidOutBreakdown(row, automatic + working + transfer - money(row, 'cashReserveReplenish')),
    monthly: (automatic + working + transfer - money(row, 'cashReserveReplenish')) / 12,
    automaticMonthly: (automatic + working) / 12,
    taxes,
    taxesPerQuarter: taxes / 4,
    // What share of the once-a-year transfer is spoken for by tax. The
    // number a retiree actually wants before moving the money.
    taxShareOfTransfer: transfer > 0 ? Math.min(1, taxes / transfer) : 0,
    reserveBalance: money(row, 'cashReserveBalance'),
    reserveMonths,
    reserveTarget: money(row, 'cashReserveTarget'),
    replenish: money(row, 'cashReserveReplenish'),
    notes: paycheckNotes(row),
  };
}

// Each note reads as "<amount> <text>", so the text starts mid-sentence and
// names the column it is talking about (changelog 229). The first version
// said "the transfer" with the figure in brackets at the end, and by the
// time a reader reached it there was nothing on screen called a transfer.
function paycheckNotes(row) {
  const notes = [];
  if (money(row, 'cashReserveDraw') > 0) {
    notes.push({ id: 'reserveDraw', text: 'came out of the cash reserve rather than the market \u2014 a down year, so investments were not sold into the fall.', amount: money(row, 'cashReserveDraw') });
  }
  if (money(row, 'cashReserveReplenish') > 0) {
    notes.push({ id: 'reserveTopUp', text: 'of what was moved from the portfolio went into the cash reserve rather than to you, topping it back up \u2014 which is why that column is larger than what you live on.', amount: money(row, 'cashReserveReplenish') });
  }
  if (money(row, 'rmdAmount') > 0) {
    notes.push({ id: 'rmd', text: 'of what was moved is a required minimum distribution, so that much of the timing is not your choice.', amount: money(row, 'rmdAmount') });
  }
  if (money(row, 'salary') > 0) {
    notes.push({ id: 'working', text: 'is still an actual paycheck this year, so less has to be moved from the portfolio.', amount: money(row, 'salary') });
  }
  return notes;
}

export function paycheckPlan(projection, { years = FIRST_YEARS } = {}) {
  const all = (projection && projection.years) || [];
  const retired = all.filter((y) => y.isRetired);
  if (retired.length === 0) return null;
  const rows = retired.slice(0, Math.max(1, years)).map(paycheckYear);
  const first = rows[0];
  return {
    rows,
    startYear: first.year,
    endYear: rows[rows.length - 1].year,
    // The free headline: the first year, as a monthly figure and one
    // transfer, which is the sentence people are missing.
    headline: {
      year: first.year,
      monthly: first.monthly,
      automaticMonthly: first.automaticMonthly,
      transfer: first.transfer,
      taxesPerQuarter: first.taxesPerQuarter,
      reserveMonths: first.reserveMonths,
    },
    // Off means every transfer comes straight out of the market, including
    // in a year the market is down -- worth saying rather than leaving as
    // an absence.
    reserveEnabled: rows.some((r) => r.reserveTarget > 0 || r.reserveBalance > 0),
  };
}

// ---------------------------------------------------------------------------
// Questions 5 and 3 as ONE card (changelog 239, the owner 2026-09-24: "I wonder
// if we merged two topics into one"). They were two cards only because they
// were two questions on the list; both described the same five years, each
// with its own table and its own notes, so a reader went through the same
// years twice. One lens is WHERE the money comes from (sources, tax, why);
// the other is HOW it reaches you (a month to live on, one transfer, tax a
// quarter, the reserve). Built on the two functions above rather than
// replacing them, so the figures are the ones they already prove.
//
// Notes are merged, and two overlaps dropped: the reserve draw and the RMD
// are each said by both. The paycheck wording wins for the reserve (it leads
// with the amount and names the column); the funding wording wins for the
// RMD (it says when they START, which the paycheck note does not).
export function firstYearsPlan(projection, { years = FIRST_YEARS } = {}) {
  const funding = firstYearsFunding(projection, { years });
  const paycheck = paycheckPlan(projection, { years });
  if (!funding || !paycheck) return null;

  const rows = paycheck.rows.map((p, i) => {
    const f = funding.rows[i];
    const draws = f.sources.filter((x) => x.kind === 'draw');
    const biggestDraw = [...draws].sort((a, b) => b.amount - a.amount)[0] || null;
    const notes = [
      ...f.notes.filter((n) => n.id !== 'reserve').map((n) => ({ ...n, amountFirst: false })),
      ...p.notes.filter((n) => n.id !== 'rmd').map((n) => ({ ...n, amountFirst: true })),
    ];
    return {
      year: p.year,
      age: p.age,
      monthly: p.monthly,
      automaticMonthly: p.automaticMonthly,
      // What you sell: the transfer, net of what arrives on its own.
      transfer: p.moved - p.automatic - p.working,
      moved: p.moved,
      // What arrives and what is moved, less what tops up the reserve, is
      // what the year pays out -- and paidOut.parts says on what.
      automatic: p.automatic + p.working,
      replenish: p.replenish,
      paidOut: p.paidOut,
      biggestDraw: biggestDraw ? { label: biggestDraw.label, amount: biggestDraw.amount } : null,
      sources: f.sources,
      taxes: p.taxes,
      taxesPerQuarter: p.taxesPerQuarter,
      reserveMonths: p.reserveMonths,
      notes,
    };
  });

  const first = rows[0];
  return {
    rows,
    startYear: first.year,
    endYear: rows[rows.length - 1].year,
    reserveEnabled: paycheck.reserveEnabled,
    headline: {
      year: first.year,
      monthly: first.monthly,
      automaticMonthly: first.automaticMonthly,
      transfer: first.transfer,
      automatic: first.automatic,
      replenish: first.replenish,
      paidOut: first.paidOut,
      biggestDrawLabel: first.biggestDraw ? first.biggestDraw.label : null,
      taxesPerQuarter: first.taxesPerQuarter,
      reserveMonths: first.reserveMonths,
    },
  };
}

// ---------------------------------------------------------------------------
// Question 1 (changelog 218): "could the portfolio support this lifestyle if
// you walked away now?"
//
// Two answers, because the honest one is not a yes or a no:
//   - CAN IT HOLD: retire this year at today's ages and run the plan. Does
//     it reach the end of the horizon, and if not, when does it run out?
//   - WHAT WOULD IT HOLD: the largest lifestyle the same walk-away plan
//     survives on, found by the engine's own binary search. Beside the
//     budget, that is either headroom or the size of the problem in
//     dollars, which is more use than a verdict.
//
// Plus the floor: whether the income that arrives regardless -- Social
// Security, pensions, an annuity -- covers the part of the budget the
// household says it could not cut.
export function walkAwayPatch(inputs) {
  const planYear = Number(inputs.planYear) || new Date().getFullYear();
  const ageNow = (birthYear) => Math.max(0, planYear - (Number(birthYear) || planYear));
  // Retiring "now" is this year, so the retirement age is the age reached
  // this year. Anyone already retired stays retired -- raising their age
  // back up would be the opposite of the question.
  const patch = { retireAge1: Math.min(Number(inputs.retireAge1) || 0, ageNow(inputs.birthYear1)) };
  if (inputs.spouse2Enabled) {
    patch.retireAge2 = Math.min(Number(inputs.retireAge2) || 0, ageNow(inputs.birthYear2));
  }
  return patch;
}

export function walkAwayNow(inputs, { useRealDollars = true } = {}) {
  const base = sanitizeForProjection(inputs);
  const patch = walkAwayPatch(base);
  const now = { ...base, ...patch };
  const proj = deflateProjectionForDisplay(runProjection(now), useRealDollars);
  const years = proj.years || [];
  const retired = years.filter((y) => y.isRetired);
  const first = retired[0] || null;
  const broke = proj.isSuccessful ? null : firstShortfallRow(years);

  // The largest lifestyle this same walk-away plan survives. The search is
  // the engine's own, so the number agrees with Die With Zero rather than
  // being a second opinion about it.
  const dwz = findDieWithZeroSpending(now);
  const budget = Math.max(0, Number(base.lifestyleExpense) || 0);
  const solve = spendingSolveOf(dwz, years.length);
  const dieWithZeroSpending = solve.amount;

  // The floor, from the first retired year of the walk-away run. null all
  // the way through when no ledger marks anything essential -- the card
  // must not invent a floor of zero.
  const floor = first && first.essentialSpending !== null ? {
    essential: first.essentialSpending,
    guaranteed: Math.max(0, Number(first.guaranteedIncome) || 0),
    covered: !!first.floorCovered,
    gap: Math.max(0, Number(first.floorGap) || 0),
  } : null;

  return {
    // Already retired in the plan as it stands, so "walk away now" is the
    // plan itself and the card says so rather than pretending to test
    // something.
    alreadyRetired: (Number(base.retireAge1) || 0) <= (Number(patch.retireAge1) || 0),
    retirementYear: proj.householdRetirementYear,
    isSuccessful: !!proj.isSuccessful,
    endingBalance: proj.endingBalance || 0,
    depletionYear: broke ? broke.year : null,
    depletionAge: broke ? (broke.age1 ?? null) : null,
    budget,
    // null unless the search found a real level (supportsStatus 'ok'):
    // 'none', 'aboveCeiling' and 'noRows' each have their own sentence in
    // SPENDING_SOLVE_TEXT.
    supports: dieWithZeroSpending,
    supportsStatus: solve.status,
    rows: years.length,
    // Positive is headroom, negative is the shortfall -- in the same
    // dollars as the budget, which is what makes it actionable.
    headroom: dieWithZeroSpending === null ? null : dieWithZeroSpending - budget,
    firstYearTaxes: first ? Math.max(0, Number(first.totalTaxesPaid) || 0) : 0,
    floor,
    // The same run, shaped as a column of the working-longer table, so
    // that card's "leave now" column costs no projection of its own.
    summary: planSummary(proj, { useRealDollars }),
  };
}

// --- Q1, when the answer is "not yet": what would make it a yes ------------
// the owner, 2026-09-24: "If the answer is shortfall, can you create an entry
// that shows what is needed to change to a yes, maybe a small windfall or
// something targetable -- maybe the user could get a part time job."
//
// Each lever is the SMALLEST change that makes the walk-away plan succeed at
// the planned budget, found by bisection on the engine itself (success is
// monotone in both: more money never makes a plan fail). Spending less is
// the third lever and already on the card -- it is walkAwayNow's `supports`.

// Part-time work for this many years after leaving, the choices the card
// shows side by side.
export const PART_TIME_YEARS = [2, 3, 5];
// Answers are rounded UP to these, so the rounded figure is still a yes.
export const WINDFALL_STEP = 1000;
export const PART_TIME_STEP = 500;
// Beyond this, "a windfall" is not the honest answer to the question.
const SEARCH_CEILING = 50_000_000;

// Smallest x in [0, ceiling], to `step`, with ok(x) true -- null when even
// the ceiling fails. ok(0) is assumed false (the plan already fails).
function smallestPassing(ok, step, ceiling = SEARCH_CEILING) {
  let hi = step;
  while (!ok(hi)) {
    if (hi >= ceiling) return null;
    hi = Math.min(ceiling, hi * 2);
  }
  let lo = 0; // failing
  while (hi - lo > step) {
    const mid = Math.floor((lo + hi) / 2 / step) * step || step;
    if (mid <= lo || mid >= hi) break;
    if (ok(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

// The one-time sum: after-tax money added to the Taxable account today --
// an inheritance, a bonus, a house sale. Its cost basis is the full amount
// (cash that was never invested has no gain in it), so the basis is set
// explicitly rather than left to the gains-ratio guess, which would tax
// part of the windfall as a gain when it is spent.
export function windfallPatch(inputs, amount) {
  const taxable = Math.max(0, Number(inputs.taxableInit) || 0);
  const known = Number(inputs.taxableBasisInit) || 0;
  const ratio = inputs.taxableCapitalGainsRatio !== undefined ? Number(inputs.taxableCapitalGainsRatio) : 0.60;
  const basisNow = known > 0 ? Math.min(known, taxable) : taxable * (1 - ratio);
  return { taxableInit: taxable + amount, taxableBasisInit: basisNow + amount };
}

// Part-time pay for the first `years` years after walking away, in today's
// dollars before tax (the engine inflates and taxes it like a salary).
export function partTimePatch(inputs, amount, years) {
  const leaving = walkAwayPatch(inputs).retireAge1;
  return { partTimeIncome1: amount, partTimeIncomeEndAge1: leaving + years };
}

// Keep working, full time, this many more years at most before the card
// stops looking -- past that, "work longer" is a different plan, not a lever.
export const WORK_UNTIL_MAX_YEARS = 15;

// Changelog 237 (the owner, 2026-09-24): a part-time figure is only meaningful
// beside what the person earns now -- $106,500 a year "part time" is more
// than many full-time jobs pay. The card compares each figure to spouse 1's
// current salary (part-time pay is spouse 1's, see partTimePatch).
function shareOfPay(perYear, salary) {
  if (perYear === null || !(salary > 0)) return null;
  return perYear / salary;
}

export function walkAwayToYes(inputs, { supports = null, supportsStatus = null } = {}) {
  const clean = sanitizeForProjection(inputs);
  const leave = walkAwayPatch(clean);
  const base = { ...clean, ...leave };
  const baseProj = runProjection(base);
  if (baseProj.isSuccessful || !(baseProj.years || []).length) return null;
  const passes = (patch) => !!runProjection({ ...base, ...patch }).isSuccessful;

  const budget = Math.max(0, Number(base.lifestyleExpense) || 0);
  let solve;
  if (supportsStatus) {
    solve = supportsStatus === 'ok' ? spendingSolve(supports) : { status: supportsStatus, amount: null };
  } else if (supports !== null) {
    solve = spendingSolve(supports);
  } else {
    const dwz = findDieWithZeroSpending(base);
    solve = spendingSolveOf(dwz, baseProj.years.length);
  }
  // No spending level lasts: spending less is not a lever at all, and the
  // gap the other levers close is the whole budget.
  const spendLess = solve.status === 'ok' ? solve.amount : null;
  const shortfall = spendLess === null ? budget : Math.max(0, budget - spendLess);
  const salary = Math.max(0, Number(base.salary1) || 0);

  const windfall = smallestPassing((x) => passes(windfallPatch(base, x)), WINDFALL_STEP);
  // A plan that already counts on part-time pay gets no part-time lever:
  // replacing the user's figure would answer a different question.
  const hasPartTime = (Number(base.partTimeIncome1) || 0) > 0;
  const partTime = hasPartTime ? null : PART_TIME_YEARS.map((years) => {
    const perYear = smallestPassing((x) => passes(partTimePatch(base, x, years)), PART_TIME_STEP);
    const share = shareOfPay(perYear, salary);
    return { years, perYear, shareOfPay: share, moreThanPayNow: share !== null && share >= 1 };
  });

  // Changelog 237: the lever "can I leave today?" most often really has --
  // stay a little longer, full time. Smallest number of extra years (both
  // spouses together, as workLongerPatch does) that makes the budget work.
  let workUntil = null;
  for (let k = 1; k <= WORK_UNTIL_MAX_YEARS; k++) {
    const patch = { retireAge1: leave.retireAge1 + k };
    if (base.spouse2Enabled) patch.retireAge2 = leave.retireAge2 + k;
    if (passes(patch)) {
      const planYear = Number(base.planYear) || new Date().getFullYear();
      workUntil = {
        extraYears: k,
        year: planYear + k,
        age: leave.retireAge1 + k,
        // At or past the date the plan already has: nothing to gain by
        // leaving early, and the card says so.
        atOrAfterPlan: leave.retireAge1 + k >= (Number(clean.retireAge1) || 0),
      };
      break;
    }
  }

  // Changelog 237: one worked combination, because "combining two means
  // less of each" is easier to believe with a number. Cut half the
  // shortfall, then the least three-year pay that covers the rest.
  let combined = null;
  const cut = Math.ceil(shortfall / 2 / PART_TIME_STEP) * PART_TIME_STEP;
  // A cut that already closes the whole gap is not a combination.
  if (!hasPartTime && shortfall > 0 && cut < shortfall) {
    const years = 3;
    const lower = { lifestyleExpense: Math.max(0, budget - cut) };
    const perYear = smallestPassing((x) => passes({ ...lower, ...partTimePatch(base, x, years) }), PART_TIME_STEP);
    if (perYear !== null) combined = { cut, years, perYear, shareOfPay: shareOfPay(perYear, salary) };
  }

  return { windfall, partTime, hasPartTime, shortfall, spendLess, salary, workUntil, combined };
}

// The first safe year to retire (changelog 284): the earliest year in
// which the household could stop work and the plan still lasts to its
// end. Answers "can I retire today?" with a yes, or with the year the
// answer becomes yes. The household stops together -- each spouse's
// retirement age becomes their age in that year -- except someone already
// retired today, who stays retired (raising their age back up would be
// the opposite of the question). Life expectancy is untouched.
//
// One projection per candidate year, from this year forward, stopping at
// the first success; most plans answer within a few runs. `maxYearsOut`
// bounds the search for a plan that never succeeds.
export function retireInYearPatch(inputs, year) {
  const planYear = Number(inputs.planYear) || new Date().getFullYear();
  const ageIn = (birthYear) => Math.max(0, year - (Number(birthYear) || planYear));
  const ageNow = (birthYear) => Math.max(0, planYear - (Number(birthYear) || planYear));
  const retiredNow = (retireAge, birthYear) => (Number(retireAge) || 0) <= ageNow(birthYear);
  const patch = {};
  patch.retireAge1 = retiredNow(inputs.retireAge1, inputs.birthYear1) ? Number(inputs.retireAge1) : ageIn(inputs.birthYear1);
  if (inputs.spouse2Enabled) {
    patch.retireAge2 = retiredNow(inputs.retireAge2, inputs.birthYear2) ? Number(inputs.retireAge2) : ageIn(inputs.birthYear2);
  }
  return patch;
}

export function plannedRetirementYear(inputs) {
  const planYear = Number(inputs.planYear) || new Date().getFullYear();
  const yearFor = (retireAge, birthYear) => (Number(birthYear) || planYear) + (Number(retireAge) || 0);
  const y1 = yearFor(inputs.retireAge1, inputs.birthYear1);
  const y2 = inputs.spouse2Enabled ? yearFor(inputs.retireAge2, inputs.birthYear2) : y1;
  // The household is retired once the later of the two has stopped.
  return Math.max(planYear, y1, y2);
}

export function firstSafeRetirementYear(inputs, { maxYearsOut = 25, run = runProjection } = {}) {
  const base = sanitizeForProjection(inputs);
  const planYear = Number(base.planYear) || new Date().getFullYear();
  const planned = plannedRetirementYear(base);
  const alreadyRetired = planned <= planYear;
  // Nobody retires past their own life expectancy; the search stops there.
  const lastYear1 = (Number(base.birthYear1) || planYear) + (Number(base.lifeExpectancy1) || 95) - 1;
  const lastYear = Math.min(planYear + maxYearsOut, lastYear1);
  let runs = 0;
  for (let year = planYear; year <= lastYear; year += 1) {
    const proj = run({ ...base, ...retireInYearPatch(base, year) });
    runs += 1;
    if (proj && proj.isSuccessful) {
      return {
        found: true,
        year,
        age1: year - (Number(base.birthYear1) || planYear),
        age2: base.spouse2Enabled ? year - (Number(base.birthYear2) || planYear) : null,
        today: year <= planYear,
        plannedYear: planned,
        alreadyRetired,
        yearsBeforePlan: planned - year,
        searchedTo: lastYear,
        runs,
      };
    }
  }
  return { found: false, year: null, age1: null, age2: null, today: false, plannedYear: planned, alreadyRetired, yearsBeforePlan: null, searchedTo: lastYear, runs };
}
