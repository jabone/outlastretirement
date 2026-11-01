// "Three changes that would help" (first-time user review, 2026-11-01).
//
// A plan that is not on track used to end at a label and a pointer to the
// Optimizers. Someone new to this needs the next step on the same screen:
// the three levers that move most plans, each said in plain words, each
// one click to try, each with the odds it would have. This module only
// names the changes and their patches; the card runs them through the same
// projection and the same seeded Monte Carlo as the plan itself, so the
// before and after differ in the change and nothing else.
//
// The three, in the order people usually find easiest to act on:
//   work      retire two years later (each person still working)
//   spend     spend 10% less in retirement, rounded to $500
//   claim     start Social Security at 70 (each person not yet claiming)
// A lever that does not apply to this plan (already retired, already
// claiming at 70) is left out rather than shown as a change of nothing.

export const WORK_LONGER_YEARS = 2;
export const SPEND_LESS_SHARE = 0.10;
export const MAX_RETIRE_AGE = 75;

const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function threeChanges(inputs) {
  const planYear = n(inputs.planYear, new Date().getFullYear());
  const couple = !!inputs.spouse2Enabled;
  const age1 = planYear - n(inputs.birthYear1, planYear);
  const age2 = couple ? planYear - n(inputs.birthYear2, planYear) : null;
  const name1 = inputs.spouse1Name && inputs.spouse1Name !== 'Primary' ? inputs.spouse1Name : 'you';
  const name2 = inputs.spouse2Name && inputs.spouse2Name !== 'Spouse' ? inputs.spouse2Name : 'your spouse';
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const out = [];

  // Work longer: only for someone still working, never past 75.
  const r1 = n(inputs.retireAge1);
  const r2 = couple ? n(inputs.retireAge2) : null;
  const working1 = age1 < r1 && r1 < MAX_RETIRE_AGE;
  const working2 = couple && age2 < r2 && r2 < MAX_RETIRE_AGE;
  if (working1 || working2) {
    const patch = {};
    const parts = [];
    if (working1) {
      patch.retireAge1 = Math.min(MAX_RETIRE_AGE, r1 + WORK_LONGER_YEARS);
      parts.push(couple ? `${name1 === 'you' ? 'you' : name1} at ${patch.retireAge1}` : `at ${patch.retireAge1} instead of ${r1}`);
    }
    if (working2) {
      patch.retireAge2 = Math.min(MAX_RETIRE_AGE, r2 + WORK_LONGER_YEARS);
      parts.push(`${name2} at ${patch.retireAge2}`);
    }
    out.push({
      id: 'work',
      title: `Work ${WORK_LONGER_YEARS} more years`,
      detail: couple ? `Retire later: ${parts.join(', ')}.` : `Retire ${parts[0]}.`,
      patch,
    });
  }

  // Spend less: 10% of the retirement budget, rounded to $500.
  const spend = n(inputs.lifestyleExpense);
  if (spend > 0) {
    const cut = Math.max(500, Math.round((spend * SPEND_LESS_SHARE) / 500) * 500);
    const to = Math.max(0, spend - cut);
    const ledger = inputs.lifestyleExpenseInputMode && inputs.lifestyleExpenseInputMode !== 'annual';
    out.push({
      id: 'spend',
      title: `Spend $${cut.toLocaleString('en-US')} less a year in retirement`,
      detail: `$${to.toLocaleString('en-US')} a year instead of $${spend.toLocaleString('en-US')}, in today’s dollars.`,
      patch: { lifestyleExpense: to },
      // A plan built from a monthly or category breakdown is changed there,
      // not by overwriting the total the breakdown produces.
      tryable: !ledger,
      note: ledger ? 'Your spending comes from a monthly or category breakdown; lower it there, under Plan → Spending.' : null,
    });
  }

  // Claim at 70: only for someone who has not started yet.
  const c1 = n(inputs.claimingAge1);
  const c2 = couple ? n(inputs.claimingAge2) : null;
  const canDelay1 = c1 < 70 && age1 < c1;
  const canDelay2 = couple && c2 < 70 && age2 < c2;
  if (canDelay1 || canDelay2) {
    const patch = {};
    if (canDelay1) { patch.claimingAge1 = 70; patch.claimMonth1 = 0; }
    if (canDelay2) { patch.claimingAge2 = 70; patch.claimMonth2 = 0; }
    const from = canDelay1 ? c1 : c2;
    out.push({
      id: 'claim',
      title: 'Start Social Security at 70',
      detail: couple && canDelay1 && canDelay2
        ? `Both of you, instead of ${c1} and ${c2}. Waiting means a bigger check every month for life.`
        : `${couple ? `${cap(canDelay1 ? name1 : name2)}, instead of ${from}` : `Instead of ${from}`}. Waiting means a bigger check every month for life.`,
      patch,
    });
  }

  return out.map((c) => ({ tryable: true, note: null, ...c }));
}
