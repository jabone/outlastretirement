// Which month a click on the chart landed in, or null if it landed nowhere
// useful. Exported so it can be tested directly: Recharts hands back
// `activeTooltipIndex` as a STRING ("1"), so a `typeof === 'number'` guard
// silently rejects every click and the chart just stops responding, with no
// error to notice. jsdom gives Recharts no layout to hit-test against, so
// this is the only honest place to pin that behavior down.
export function resolveChartMonthIndex(state, data) {
  const i = Number(state?.activeTooltipIndex);
  if (!Number.isInteger(i) || i < 0) return null;
  const row = Array.isArray(data) ? data[i] : null;
  // The row's own 'YYYY-MM' key, never the array position: the window
  // rolls, so position 3 is a different month next month.
  return row && row.key ? row.key : null;
}
