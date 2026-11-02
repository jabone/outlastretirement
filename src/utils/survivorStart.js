// When should a widow or widower start the survivor benefit?
// (benefits-specialist review, 2026-11-02)
//
// A survivor may start the benefit on the deceased spouse's record from 60,
// at 71.5% of it, rising to 100% at their own full retirement age (less
// when the deceased claimed early: the widow's limit caps it at the larger
// of what the deceased was paid and 82.5% of their full benefit). Starting
// early pays smaller checks for more years; waiting pays bigger checks for
// fewer. Which is better depends on the rest of the plan: someone with
// little else to live on may not be able to wait, and someone whose own
// benefit is larger may only need the survivor benefit for a few years.
//
// So instead of a rule, this runs the plan once for each start age and
// reports what each does: the yearly check, the Social Security the
// survivor collects to the end of the plan, the savings left at the end,
// any years the money runs short, and the age by which waiting has paid
// for itself. The best start age for this plan is the one with the fewest
// short years, then the most left at the end.
//
// Every figure is in today's dollars. The plan's own death (Life Expectancy,
// or the Survivor Stress Test when it is on) decides who survives and at
// what age; nothing here assumes a death the plan does not.

import { runProjection, getFullRetirementAge } from '../calculator';
import { yearFactor, finalBalanceFactor } from './displayDollars';
import { sanitizeForProjection } from './oneLeverCompare';

const SHORT_EPS = 0.5;

// The first year one spouse is alone, from a projection.
export function firstSurvivorYear(inputs, years) {
  if (!inputs || !inputs.spouse2Enabled || !Array.isArray(years)) return null;
  for (let i = 0; i < years.length; i += 1) {
    const y = years[i];
    if (y.spouse1Alive !== y.spouse2Alive) {
      const survivor = y.spouse1Alive ? 1 : 2;
      const deceased = survivor === 1 ? 2 : 1;
      const prev = i > 0 ? years[i - 1] : null;
      return {
        index: i,
        year: y.year,
        survivor,
        deceased,
        survivorAge: survivor === 1 ? y.age1 : y.age2,
        deceasedDeathAge: prev ? (deceased === 1 ? prev.age1 : prev.age2) : null,
      };
    }
  }
  return null;
}

function summarize(proj, survivor, startIndex) {
  const years = proj.years || [];
  const ageKey = survivor === 1 ? 'age1' : 'age2';
  const benefitKey = survivor === 1 ? 'survivorBenefit1' : 'survivorBenefit2';
  const startedKey = survivor === 1 ? 'survivorStartedAt1' : 'survivorStartedAt2';
  let check = 0;
  let startedAt = null;
  let ownTakesOverAt = null;
  let ssTotal = 0;
  let shortYears = 0;
  const cumulativeByAge = [];
  for (let i = startIndex; i < years.length; i += 1) {
    const y = years[i];
    const alive = survivor === 1 ? y.spouse1Alive : y.spouse2Alive;
    if (!alive) break;
    const f = yearFactor(y);
    const benefit = (Number(y[benefitKey]) || 0) / f;
    if (benefit > 0 && startedAt === null) { check = benefit; startedAt = y[startedKey] ?? y[ageKey]; }
    if (startedAt !== null && ownTakesOverAt === null && benefit === 0 && (Number(y.ssIncome) || 0) > 0) ownTakesOverAt = y[ageKey];
    ssTotal += (Number(y.ssIncome) || 0) / f;
    if ((Number(y.shortfall) || 0) > SHORT_EPS) shortYears += 1;
    cumulativeByAge.push({ age: y[ageKey], total: ssTotal });
  }
  return {
    check,
    startedAt,
    ownTakesOverAt,
    ssTotal,
    shortYears,
    endBalance: (Number(proj.endingBalance) || 0) / finalBalanceFactor(years),
    cumulativeByAge,
  };
}

// The age by which a later start has collected as much Social Security as
// the earliest one; null if it never catches up inside the plan.
function breakEvenAge(later, earliest) {
  const byAge = new Map(earliest.cumulativeByAge.map((r) => [r.age, r.total]));
  for (const r of later.cumulativeByAge) {
    const e = byAge.get(r.age);
    if (e !== undefined && r.total >= e - 1) return r.age;
  }
  return null;
}

// Returns { status, ... }:
//   'no-spouse'      a one-person plan
//   'no-survivor'    both die the same year, so no one is ever alone
//   'past-fra'       the survivor is already at full retirement age, so the
//                    benefit is unreduced whenever it starts
//   'own-larger'     the survivor's own benefit is larger at every start
//                    age, so the survivor benefit is never paid
//   'compare'        rows: one per start age, with best (index) and current
//                    (index of the plan's own choice)
export function survivorStartComparison(inputs, run = runProjection) {
  if (!inputs || !inputs.spouse2Enabled) return { status: 'no-spouse' };
  const safe = sanitizeForProjection(inputs);
  const base = run(safe);
  const first = firstSurvivorYear(safe, base.years);
  if (!first) return { status: 'no-survivor' };
  const { survivor, survivorAge } = first;
  const birthYear = survivor === 1 ? safe.birthYear1 : safe.birthYear2;
  const fra = getFullRetirementAge(birthYear);
  const scenario = { ...first, fra };
  if (survivorAge >= fra) return { status: 'past-fra', ...scenario };

  const field = survivor === 1 ? 'survivorStartAge1' : 'survivorStartAge2';
  const earliest = Math.max(60, survivorAge);
  const ages = [0];
  for (let a = earliest + 1; a <= Math.ceil(fra); a += 1) ages.push(a);

  const rows = ages.map((a) => {
    const proj = a === 0 && !(Number(safe[field]) > 0) ? base : run({ ...safe, [field]: a });
    return { startAge: a, effectiveAge: a === 0 ? earliest : a, ...summarize(proj, survivor, first.index) };
  });
  if (rows.every((r) => r.check === 0)) return { status: 'own-larger', ...scenario };
  // Past the age the check stops growing (the widow's limit, or full
  // retirement age), waiting only gives up checks: keep the first age that
  // reaches the top and drop the rest, but say where the top is.
  const top = Math.max(...rows.map((r) => r.check));
  const topIndex = rows.findIndex((r) => r.check >= top - 1);
  const cappedEarly = topIndex < rows.length - 1;
  rows.splice(topIndex + 1);

  const asap = rows[0];
  rows.forEach((r, i) => { r.breakEven = i === 0 ? null : breakEvenAge(r, asap); });

  let best = 0;
  rows.forEach((r, i) => {
    const b = rows[best];
    if (r.shortYears < b.shortYears || (r.shortYears === b.shortYears && r.endBalance > b.endBalance + 1)) best = i;
  });
  const chosen = Number(safe[field]) || 0;
  let current = rows.findIndex((r) => r.startAge === chosen);
  if (current < 0) current = chosen <= earliest ? 0 : rows.length - 1;
  // A choice past the top pays the same check as the top, a year later at
  // least; it has no row of its own, so it is flagged instead.
  const currentPastTop = chosen > rows[rows.length - 1].effectiveAge;

  return {
    status: 'compare',
    ...scenario,
    field,
    rows: rows.map(({ cumulativeByAge: _cumulative, ...r }) => r),
    best,
    current,
    // The check reaches its top before full retirement age: the deceased
    // claimed early, so the widow's limit caps it from this age on.
    topAge: rows[rows.length - 1].effectiveAge,
    cappedEarly,
    currentPastTop,
    // Waiting makes the money run short when a start age the plan could
    // afford at once leaves short years; shortFromAge is the first such age.
    cannotWait: asap.shortYears === 0 && rows.some((r) => r.shortYears > 0),
    shortFromAge: asap.shortYears === 0 ? (rows.find((r) => r.shortYears > 0) || {}).effectiveAge ?? null : null,
  };
}
