// X-axis ticks a person can read (changelog 271): recharts' automatic
// interval on a category axis produced runs like 2030, 2031 and 2051, 2052
// jammed together. Every k-th year from the first, with k the smallest of
// 1/2/5/10 that keeps the count at or under twelve, plus the last year
// unless it would sit on top of the previous tick.
export function evenYearTicks(data, maxTicks = 12) {
  const years = (data || []).map((d) => Number(d.year)).filter(Number.isFinite);
  if (years.length === 0) return undefined;
  const first = years[0];
  const last = years[years.length - 1];
  const span = last - first;
  const step = [1, 2, 5, 10].find((k) => Math.floor(span / k) + 1 <= maxTicks) || 20;
  const ticks = [];
  for (let y = first; y <= last; y += step) ticks.push(y);
  if (last - ticks[ticks.length - 1] >= step / 2) ticks.push(last);
  return ticks;
}
