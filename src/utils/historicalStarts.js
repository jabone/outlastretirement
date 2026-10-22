// Shared by HistoricalStartsPanel (Risk & Stress) and the Readiness
// market-fall card (changelog 335). Reads runHistoricalStarts' result.
export const RULE_LABELS = {
  fixed: 'Fixed spending',
  crash: 'Spending guardrails',
  wr: 'Withdrawal-rate guardrails',
  both: 'Both guardrails',
  // Changelog 451, compared over the same starts (Premium table).
  pct: 'Percent of portfolio',
  clyatt: 'The 95% rule (Clyatt)',
};

export function historicalHeadline(data) {
  if (!data || !data.count) return null;
  const mine = data.rules.find((r) => r.inPlan) || data.rules[0];
  return {
    rule: mine,
    lasted: mine.lasted,
    count: data.count,
    worstStart: mine.worstStart,
    worstRunsOutYear: mine.worstRunsOutYear,
    worstFloorBreachYear: mine.worstFloorBreachYear ?? null,
    floor: Number(data.floor) || 0,
  };
}


// Changelog 358: the plan's SAFEMAX, read from findHistoricalSafeMax's
// result (historicalStartsData.safeMax). Dollars are lifestyle spending in
// today's dollars, whatever the Show figures in setting, because that is
// the figure the user types into the plan.
// The search's ceiling, DIE_WITH_ZERO_CEILING in calculator.js (kept as a
// literal so this module stays out of the engine chunk; a test pins them).
export const SAFEMAX_CEILING = 5000000;
export const safeMaxMoney = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
export const safeMaxPct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : null);

// The bar for every start, or null when there is nothing to say yet.
export function safeMaxHeadline(data) {
  const sm = data && data.safeMax;
  if (!sm || !Array.isArray(sm.bars) || sm.bars.length === 0) return null;
  const all = sm.bars.find((b) => b.share === 1) || sm.bars[0];
  return { ...all, rule: sm.rule, count: sm.count, planned: sm.planned, floor: Number(sm.floor) || 0 };
}

// "for 95% of them" -- the plain-words label for a bar.
export const safeMaxShareLabel = (share) => (share >= 1 ? 'Every start' : `${Math.round(share * 100)}% of starts`);
