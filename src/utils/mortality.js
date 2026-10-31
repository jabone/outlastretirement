// Survival odds from the SSA period life table (changelog 248). Pure
// functions over src/config/lifeTable.js; nothing here reads the plan.
//
// Conventions shared with the engine: an "age" is the whole-number age a
// person is at the start of a plan year, and the plan treats someone as
// alive in every year up to and INCLUDING lifeExpectancy (calculator.js:
// `spouseAlive = age <= lifeExpectancy`). So "the odds of reaching the
// plan's end" is P(alive at age lifeExpectancy), and a sampled death age
// d means "alive at d, dead before d+1" -- the value to hand the engine as
// lifeExpectancy for that trial.
import { MALE_QX, FEMALE_QX, LIFE_TABLE_MAX_AGE } from '../config/lifeTable';

export const SEX_OPTIONS = [
  { value: 'unstated', label: 'Not stated' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

function clampAge(age) {
  const a = Math.floor(Number(age));
  if (!Number.isFinite(a)) return 0;
  return Math.max(0, Math.min(LIFE_TABLE_MAX_AGE, a));
}

function curveFor(qx, fromAge) {
  // p[k] = P(alive at fromAge + k | alive at fromAge). p[0] = 1; the curve
  // reaches exactly 0 one step past the table's last age.
  const start = clampAge(fromAge);
  const p = [1];
  let alive = 1;
  for (let a = start; a <= LIFE_TABLE_MAX_AGE; a++) {
    alive *= (1 - qx[a]);
    p.push(alive);
  }
  p[p.length - 1] = 0;
  return p;
}

// Survival curve from `fromAge` for a sex ('male' | 'female' | anything
// else = 'unstated'). Unstated is the plain average of the two curves,
// each conditioned on being alive at fromAge -- a 50/50 mix, which is what
// "we don't know" honestly means, not a third population.
export function survivalCurve(sex, fromAge) {
  if (sex === 'male') return curveFor(MALE_QX, fromAge);
  if (sex === 'female') return curveFor(FEMALE_QX, fromAge);
  const m = curveFor(MALE_QX, fromAge);
  const f = curveFor(FEMALE_QX, fromAge);
  return m.map((v, i) => (v + f[i]) / 2);
}

// P(alive at targetAge | alive at fromAge). 1 at or below fromAge, 0 past
// the table.
export function probAliveAt(sex, fromAge, targetAge) {
  const from = clampAge(fromAge);
  const k = Math.floor(Number(targetAge)) - from;
  if (!(k > 0)) return 1;
  const p = survivalCurve(sex, from);
  return k < p.length ? p[k] : 0;
}

// The age a person of this sex and age has probability `prob` of reaching
// -- "one in four reach 92" is ageReachedWithProbability(sex, age, 0.25).
// Returns the LAST age at which survival is still >= prob, so the sentence
// reads as an age reached, never an age missed.
export function ageReachedWithProbability(sex, fromAge, prob) {
  const from = clampAge(fromAge);
  const p = survivalCurve(sex, from);
  let k = 0;
  while (k + 1 < p.length && p[k + 1] >= prob) k++;
  return from + k;
}

// P(at least one of two people is alive), independence assumed. Spouses'
// deaths are mildly correlated in reality (shared environment, the
// "broken heart" effect); independence overstates the joint odds a
// little, which is the conservative direction for a planner that asks
// "will the money last while anyone needs it".
export function probAnyAlive(p1, p2) {
  return 1 - (1 - p1) * (1 - p2);
}

// Sample an age at death from one uniform u in [0, 1): the first age at
// which the survival curve drops below u, minus one -- the last age
// alive. Never below fromAge (a plan cannot start with a dead person),
// never past the table. Pure: same u, same answer, so the Monte Carlo's
// seed reproduces it.
export function sampleDeathAge(sex, fromAge, u) {
  const from = clampAge(fromAge);
  const p = survivalCurve(sex, from);
  const target = Math.min(0.999999999, Math.max(0, Number(u) || 0));
  let k = 0;
  while (k + 1 < p.length && p[k + 1] > target) k++;
  return from + k;
}

// The sentence behind the plan's horizon, for Readiness and the Life
// Expectancy inputs. Every figure is a probability the caller formats.
export function horizonOdds({ sex, currentAge, planToAge }) {
  const from = clampAge(currentAge);
  const to = Math.floor(Number(planToAge));
  return {
    currentAge: from,
    planToAge: to,
    reachPlanTo: probAliveAt(sex, from, to),
    median: ageReachedWithProbability(sex, from, 0.5),
    oneInFour: ageReachedWithProbability(sex, from, 0.25),
    oneInTen: ageReachedWithProbability(sex, from, 0.10),
  };
}

// The couple's horizon (planner's review item 14): a plan for two people
// ends in the later of their two Life Expectancy years, and the question
// is how likely it is that SOMEONE is still alive then. Two people each
// given a coin-flip age (half reach it) leave a three-in-four chance that
// at least one is alive when the plan says both are gone. Everything is in
// plan years, since the two are different ages: `endYear` is the plan's
// last year, `reachEnd` the odds at least one is alive in it, and
// `oneInFour` / `oneInTen` the last plan years in which those odds still
// hold, with each person's age in that year, so a plan can be set to
// run until the odds are small.
export function coupleHorizonOdds({ planYear, sex1, birthYear1, lifeExpectancy1, sex2, birthYear2, lifeExpectancy2 }) {
  const y0 = Math.floor(Number(planYear));
  const b1 = Math.floor(Number(birthYear1));
  const b2 = Math.floor(Number(birthYear2));
  const le1 = Math.floor(Number(lifeExpectancy1));
  const le2 = Math.floor(Number(lifeExpectancy2));
  if (![y0, b1, b2, le1, le2].every(Number.isFinite) || !(b1 > 1800) || !(b2 > 1800)) return null;
  const now1 = y0 - b1;
  const now2 = y0 - b2;
  if (!(now1 > 0) || !(now2 > 0)) return null;
  const endYear = Math.max(b1 + le1, b2 + le2);
  if (!(endYear > y0)) return null;
  const anyAliveIn = (year) => probAnyAlive(probAliveAt(sex1, now1, year - b1), probAliveAt(sex2, now2, year - b2));
  // The last plan year in which the joint odds are still >= prob.
  const lastYearAtLeast = (prob) => {
    let year = y0;
    while (anyAliveIn(year + 1) >= prob && year - Math.min(b1, b2) < LIFE_TABLE_MAX_AGE) year++;
    return year;
  };
  const yr = (year) => ({ year, age1: year - b1, age2: year - b2 });
  return {
    endYear,
    reachEnd: anyAliveIn(endYear),
    half: yr(lastYearAtLeast(0.5)),
    oneInFour: yr(lastYearAtLeast(0.25)),
    oneInTen: yr(lastYearAtLeast(0.10)),
  };
}
