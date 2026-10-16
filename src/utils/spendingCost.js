// What a spending rule cost, in spending (changelog 335).
//
// Every surface in the app used to judge a guardrail by whether the money
// lasted and how much was left. That makes any rule that cuts spending look
// free: a rule that quietly spends 20% less for thirty years "wins" every
// comparison of balances. This measures the other side -- what the
// household actually gave up to get there.
//
// `proj` is a run with the rule on; `ref` is the SAME run (same markets,
// same inflation) with the rule off, so the difference is the rule and
// nothing else. Pure arithmetic on published row fields.
//
// Real terms use `priceIndex`, the price level each run actually had, so a
// 1970s sequence is not deflated at the plan's 2.5%.
const EPS = 0.001;

const factor = (y) => (y && (y.priceIndex || y.inflFactor)) || 1;

export function spendingCost(proj, ref) {
  const refByYear = new Map((ref?.years || []).map((y) => [y.year, y]));
  const pairs = (proj?.years || [])
    .filter((y) => y.isRetired && refByYear.has(y.year))
    .map((y) => [y, refByYear.get(y.year)])
    .filter(([, r]) => (Number(r.lifestyleExpenses) || 0) > 0);
  if (pairs.length === 0) return null;

  let deepest = 0;
  let cutYears = 0;
  let raiseYears = 0;
  let spent = 0;
  let planned = 0;
  let essentialsKnown = false;
  let essentialsTouched = false;
  for (const [y, r] of pairs) {
    const on = Number(y.lifestyleExpenses) || 0;
    const off = Number(r.lifestyleExpenses) || 0;
    const ratio = on / off;
    if (1 - ratio > deepest) deepest = 1 - ratio;
    if (ratio < 1 - EPS) cutYears += 1;
    if (ratio > 1 + EPS) raiseYears += 1;
    spent += on / factor(y);
    planned += off / factor(r);
    // The essential floor of the UNGUARDED run is what the household said
    // it cannot go without; the guarded run's own figure already carries
    // the cut, so comparing against it would always pass.
    if (typeof r.essentialSpending === 'number') {
      essentialsKnown = true;
      if (on < r.essentialSpending - 0.01) essentialsTouched = true;
    }
  }
  return {
    // 0.2 means spending fell as far as 20% below what it would have been.
    deepestCut: deepest,
    cutYears,
    raiseYears,
    retiredYears: pairs.length,
    // Lifetime spending in real terms, as a share of the rule-off run.
    lifetimeShare: planned > 0 ? spent / planned : 1,
    // null when there is no ledger: say nothing rather than "no".
    essentialsTouched: essentialsKnown ? essentialsTouched : null,
  };
}
