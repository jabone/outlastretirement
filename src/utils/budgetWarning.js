// The Year by Year Budget Warning: a working year whose pay did not cover
// the year's spending, taxes and saving, so the engine cut saving (or
// spending) to make it balance.
//
// First-time user review (2026-11-01): the untouched sample plan showed it,
// in red, for its last two working years, short by about $1,700 and $2,600
// on pay of over $130,000 -- rounding against a 20-year projection, which a
// beginner read as something broken. A year is flagged only when the cut is
// a real share of that year's pay.
export const BUDGET_WARNING_SHARE = 0.03;

export function budgetCut(row) {
  return Math.max(0, Number(row?.lifestyleDeficit) || 0) + Math.max(0, Number(row?.savingsDeficit) || 0);
}

export function isBudgetShortYear(row, share = BUDGET_WARNING_SHARE) {
  const cut = budgetCut(row);
  if (cut <= 0) return false;
  const pay = Math.max(0, Number(row?.salary) || 0);
  return pay <= 0 ? cut > 500 : cut > share * pay;
}

export function budgetShortYears(years, share = BUDGET_WARNING_SHARE) {
  return (years || []).filter((y) => isBudgetShortYear(y, share));
}
