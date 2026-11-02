// What a withdrawal-strategy card leaves the heirs, against the top card.
export function strategyMeasure(strat, bestLegacy, fc) {
  if (strat.ranking === 'Shortfall') return 'Runs short';
  if (!Number.isFinite(bestLegacy) || !Number.isFinite(strat.afterTaxLegacy)) return '';
  const gap = Math.round(bestLegacy - strat.afterTaxLegacy);
  if (gap <= 0) return 'Leaves heirs the most';
  return `${fc(gap)} less to heirs`;
}
