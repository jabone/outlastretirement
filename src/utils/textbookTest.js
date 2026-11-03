// The textbook test (DIY-planner review, 2026-11-02, finding 5): the plan's
// balance and spending at retirement run through every historical start the
// way FI Calc, FIRECalc and the 4% rule research do -- no taxes, Social
// Security, pensions, Medicare or fees, nothing but a portfolio paying a
// fixed real spending. It answers "does this app match the calculator I
// already use?" in one click, and the gap between this and the plan's own
// count is what taxes, benefits and costs do to the plan.
//
// Conventions, chosen to match those calculators:
//   - spending is taken at the start of each year, then the rest earns the
//     year's return;
//   - spending rises each year by the previous year's inflation (the app's
//     own replays use the same year's from 1928, which reads a few percent
//     lower; see TAX_RULES_SPEC.md 1.7);
//   - the portfolio is rebalanced every year to the stock share, walked
//     down by the glide when it is on, exactly as the plan's own replays;
//   - a start lasts when the balance never runs out before the last year.
// Dollars are today's: the starting balance and spending as of retirement,
// deflated to today, held steady after inflation.
import { HISTORICAL_RETURNS } from '../config/historicalReturns';
import { HISTORICAL_RETURNS_PRE1928 } from '../config/historicalReturnsPre1928';

const ROWS = new Map([...HISTORICAL_RETURNS_PRE1928, ...HISTORICAL_RETURNS].map((r) => [r[0], r]));
const LAST_YEAR = HISTORICAL_RETURNS[HISTORICAL_RETURNS.length - 1][0];

function shareFor(t, { stockShare, glideEnabled, glideRate, glideFloor }) {
  let s = Number(stockShare) || 0;
  if (glideEnabled) s = Math.max(Number(glideFloor) || 0, s - t * (Number(glideRate) || 0));
  return Math.min(100, Math.max(0, s)) / 100;
}

// One start. Returns the year the money runs out, or null if it lasts.
function runStart(start, balance, spending, years, mix) {
  let bal = balance;
  let spend = spending;
  for (let t = 0; t < years; t += 1) {
    const year = start + t;
    if (t > 0) spend *= 1 + ROWS.get(year - 1)[3] / 100;
    bal -= spend;
    if (bal < -0.005) return year;
    const row = ROWS.get(year);
    const w = shareFor(t, mix);
    bal *= 1 + (w * row[1] + (1 - w) * row[2]) / 100;
  }
  return null;
}

export function textbookStartYears(years, firstYear) {
  const out = [];
  for (let s = firstYear; s + years - 1 <= LAST_YEAR; s += 1) out.push(s);
  return out;
}

// { balance, spending, years, firstYear, stockShare, glideEnabled,
//   glideRate, glideFloor } -> { lasted, count, failed: [{start, runsOutYear}],
//   safeMax, rate, safeMaxRate }
export function runTextbookTest({ balance, spending, years, firstYear = 1928, ...mix }) {
  const starts = textbookStartYears(years, firstYear);
  if (!(balance > 0) || !(years > 0) || starts.length === 0) return null;
  const failed = [];
  for (const s of starts) {
    const out = runStart(s, balance, spending, years, mix);
    if (out !== null) failed.push({ start: s, runsOutYear: out });
  }
  // The most it could spend and last every start, to the nearest $100.
  const lastsAll = (amt) => starts.every((s) => runStart(s, balance, amt, years, mix) === null);
  let lo = 0;
  let hi = balance;
  for (let i = 0; i < 40 && hi - lo > 50; i += 1) {
    const mid = (lo + hi) / 2;
    if (lastsAll(mid)) lo = mid; else hi = mid;
  }
  const safeMax = Math.floor(lo / 100) * 100;
  return {
    lasted: starts.length - failed.length,
    count: starts.length,
    firstStart: starts[0],
    lastStart: starts[starts.length - 1],
    failed,
    rate: spending / balance,
    safeMax,
    safeMaxRate: safeMax / balance,
  };
}
