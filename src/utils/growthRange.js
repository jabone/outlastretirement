// The Monte Carlo range drawn behind the Dashboard's savings chart
// (changelog 363). The chart's stacked areas are one path -- the plan run
// with its average returns -- so once the Monte Carlo has run for THIS plan
// the band shows where total savings ended up in 8 of 10 simulated markets
// (the 10th to 90th percentile each year). Nothing is drawn while the
// result is stale or missing, or while a crash test replaces the average
// path with a stressed one the band does not describe.
//
// `monteCarlo` is the display-basis copy (monteCarloForDisplay), so the
// band is in the same dollars as the stacked areas. Returns rows of
// { year, p10, p90 } or null.
export function growthRange(monteCarlo, mcRange, inputs) {
  if (!mcRange || mcRange.status !== 'fresh') return null;
  if (inputs && inputs.stressType && inputs.stressType !== 'none') return null;
  const curves = monteCarlo && Array.isArray(monteCarlo.growthCurves) ? monteCarlo.growthCurves : null;
  if (!curves || curves.length === 0) return null;
  return curves.map((c) => ({ year: c.year, p10: Math.max(0, c.p10), p90: Math.max(0, c.p90) }));
}
