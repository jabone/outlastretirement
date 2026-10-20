// Risk -> Monte Carlo -> Download the range (CSV) (changelog 450): the
// numbers behind the range chart, one row per year. Reads the result as
// shown (monteCarloForDisplay), so its dollars match the screen.
export const MONTE_CARLO_CSV_HEADERS = [
  'Year', 'Worst 10% (P10)', 'P25', 'Median (P50)', 'P75', 'Best 10% (P90)', 'Share of markets with money left %',
];

const round = (v) => (Number.isFinite(v) ? Math.round(v) : '');

export function buildMonteCarloCsv(mc) {
  const curves = (mc && mc.growthCurves) || [];
  const rows = curves.map((c) => [
    c.year, round(c.p10), round(c.p25), round(c.p50), round(c.p75), round(c.p90),
    Number.isFinite(c.fundedPct) ? Math.round(c.fundedPct * 10) / 10 : '',
  ]);
  return [MONTE_CARLO_CSV_HEADERS, ...rows].map((r) => r.join(',')).join('\n') + '\n';
}

// The summary lines that go in the preamble.
export function monteCarloPreambleLines(mc) {
  if (!mc) return [];
  const lines = [`Trials: ${(mc.trials || 1000).toLocaleString('en-US')}; success rate ${Number(mc.successProbability).toFixed(1)}%`];
  if (mc.seed !== undefined) lines.push(`Seed ${mc.seed} (the same plan and seed give the same result)`);
  if (mc.historyRange) lines.push(`Return model: historical bootstrap, ${mc.historyRange}`);
  return lines;
}
