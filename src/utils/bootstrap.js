// Historical block bootstrap for the Monte Carlo (changelog 267).
//
// The lognormal model draws each year on its own from a bell curve: no
// clustering, no fat left tail, no link between a bad market and high
// inflation. History has all three. This model builds each trial's path
// out of consecutive blocks of real years (a "moving block bootstrap"):
// pick a random start year, copy that year and the next few, pick again.
// A block of five keeps the shapes -- 1929-32, 1973-74, 2000-02, 2008 --
// and the inflation that came with them, while still producing paths
// history never ran.
//
// Each sampled year gives the plan's portfolio return at its stock/bond
// mix, and that year's inflation. By default both are re-centered on the
// plan's own assumptions -- the return path's geometric mean becomes the
// plan's stated compound return, the inflation path's mean becomes the
// plan's inflation rate -- so switching models changes the SHAPE of the
// uncertainty, not the household's view of the future. "As history" uses
// the raw figures instead.
import { HISTORICAL_RETURNS } from '../config/historicalReturns';

// Portfolio return (%) for one historical year at a stock share (0-100).
export function historicalPortfolioReturn(row, stockPct) {
  const w = Math.max(0, Math.min(100, Number(stockPct) || 0)) / 100;
  return w * row[1] + (1 - w) * row[2];
}

// Geometric mean (%) of the whole history at a stock share -- cached, as
// the trial loop asks for the same handful of allocations thousands of
// times.
const geoCache = new Map();
export function historicalGeometricMean(stockPct) {
  const key = Math.round(Number(stockPct) || 0);
  if (geoCache.has(key)) return geoCache.get(key);
  let logSum = 0;
  for (const row of HISTORICAL_RETURNS) logSum += Math.log(1 + historicalPortfolioReturn(row, key) / 100);
  const g = (Math.exp(logSum / HISTORICAL_RETURNS.length) - 1) * 100;
  geoCache.set(key, g);
  return g;
}

let meanCpi = null;
export function historicalMeanInflation() {
  if (meanCpi === null) meanCpi = HISTORICAL_RETURNS.reduce((s, r) => s + r[3], 0) / HISTORICAL_RETURNS.length;
  return meanCpi;
}

// Row indices for `years` years: blocks of `blockYears` consecutive rows
// starting at uniformly drawn rows, wrapping around the end of the table
// so every year is equally likely to start a block. `rng` is a uniform
// [0,1) source; one draw per block.
export function bootstrapPath(years, blockYears, rng) {
  const n = HISTORICAL_RETURNS.length;
  const block = Math.max(1, Math.min(n, Math.round(Number(blockYears) || 1)));
  const out = [];
  while (out.length < years) {
    const start = Math.floor(rng() * n);
    for (let k = 0; k < block && out.length < years; k++) out.push((start + k) % n);
  }
  return out;
}

// Move a historical return (%) from the history's compound mean to the
// plan's, multiplicatively, so a -37% year stays a -37%-shaped year.
export function recenterReturn(histReturnPct, histGeoMeanPct, planCompoundPct) {
  const r = (1 + histReturnPct / 100) * (1 + planCompoundPct / 100) / (1 + histGeoMeanPct / 100) - 1;
  return Math.max(-100, r * 100);
}
