// Whole-number percentage shares that always add up to 100 (largest-remainder
// rounding). Rounding each share on its own can print 62% + 15% + 24% = 101%.
// Non-numeric or negative parts count as 0; an all-zero total gives all zeros.
export function roundedShares(parts) {
  const vals = parts.map((v) => Math.max(0, Number(v) || 0));
  const total = vals.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return vals.map(() => 0);
  const exact = vals.map((v) => (v / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k][1]] += 1;
  return out;
}
