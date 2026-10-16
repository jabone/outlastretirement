// Short dollar labels for chart axes and dense grids (changelog 293).
// Thousands read as "$750k"; a million and up switches to "$1M" / "$3.02M"
// instead of "$1000k" / "$3019k", which is what every "/1000 + k" formatter
// in the app printed once a plan got past seven figures.
export function compactDollars(v, { digits } = {}) {
  const n = Number(v) || 0;
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e6) {
    const m = a / 1e6;
    const d = digits ?? (m >= 100 ? 0 : m >= 10 ? 1 : 2);
    return `${sign}$${m.toFixed(d).replace(/\.?0+$/, '')}M`;
  }
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}k`;
  return `${sign}$${Math.round(a)}`;
}

// One precision for a whole grid. Formatting each cell on its own printed
// "$2.75M" beside "$2.8M" and "$3M" (trailing zeros dropped, and the digit
// count following each cell's own size), so neighbors looked more or less
// precise than they were. The digits follow the grid's largest magnitude
// and trailing zeros are kept: "$2.75M", "$2.80M", "$3.00M".
export function gridCompactDollars(values) {
  const max = (values || []).reduce((m, v) => Math.max(m, Math.abs(Number(v) || 0)), 0);
  const top = max / 1e6;
  const digits = top >= 100 ? 0 : top >= 10 ? 1 : 2;
  return (v) => {
    const n = Number(v) || 0;
    if (Math.abs(n) < 1e6) return compactDollars(n);
    return `${n < 0 ? '-' : ''}$${(Math.abs(n) / 1e6).toFixed(digits)}M`;
  };
}
