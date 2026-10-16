// Far-future dollars, rounded (changelog 277).
//
// A balance thirty years out is the product of thirty guessed return and
// inflation figures; "$3,408,199" claims a precision the projection does
// not have, and a reader who changes one assumption watches the last four
// digits dance for no reason. The headline surfaces -- Dashboard KPI cards,
// Readiness, the printed report -- round a figure to three significant
// figures once it sits more than FAR_HORIZON_YEARS past the plan's first
// year: $3,408,199 reads $3,410,000, $916,432 reads $916,000. The Year by
// Year ledger and the charts keep every digit, for anyone tracing the
// arithmetic. It is a preference (Preferences -> Display -> "Round
// far-future dollars"), off by default, kept per browser under
// ROUND_FAR_DOLLARS_KEY like the theme.
export const FAR_HORIZON_YEARS = 10;
export const ROUND_FAR_DOLLARS_KEY = 'retire_plan_round_far_dollars';
export const ROUND_FAR_DOLLARS_DEFAULT = false;
export const FAR_SIGNIFICANT_FIGURES = 3;

export function roundToSignificant(value, figures = FAR_SIGNIFICANT_FIGURES) {
  const v = Number(value);
  if (!Number.isFinite(v) || v === 0) return v;
  const magnitude = Math.floor(Math.log10(Math.abs(v)));
  const unit = 10 ** (magnitude - figures + 1);
  if (unit < 1) return v; // under $100 there is nothing to round away
  return Math.round(v / unit) * unit;
}

export function isFarYear(year, fromYear) {
  return Number.isFinite(Number(year)) && Number.isFinite(Number(fromYear)) && Number(year) - Number(fromYear) > FAR_HORIZON_YEARS;
}

// formatCurrency(value), rounded first when `year` is far from `fromYear`.
export function farCurrency(formatCurrency, value, year, fromYear) {
  return formatCurrency(isFarYear(year, fromYear) ? roundToSignificant(value) : value);
}

// A formatter bound to one year pair, for a surface whose figures all sit
// in the same year (a plan's final year, say). With `enabled` false it is
// formatCurrency itself, so callers need no branch of their own.
export function farFormatter(formatCurrency, year, fromYear, enabled = true) {
  if (!enabled) return formatCurrency;
  return (value) => farCurrency(formatCurrency, value, year, fromYear);
}

// The year a projection's peak lands in, so the Peak KPI can be judged
// near or far on its own year rather than the plan's last.
export function peakYearOf(years, peak) {
  if (!Array.isArray(years)) return undefined;
  const hit = years.find((y) => y && y.totalPortfolioEnding === peak);
  return hit ? hit.year : undefined;
}
