// The equal-split label (changelog 259): "1/3 (33.3%)" -- the fraction is
// the honest figure, the percent the familiar one. One heir is simply the
// whole estate.
export function equalShare(n) {
  if (!(n > 1)) return '100%';
  const pct = 100 / n;
  const pctText = Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
  return `1/${n} (${pctText})`;
}
