import { finalBalanceFactor } from './displayDollars';

// The Monte Carlo range for the headline (changelog 254).
//
// The KPI banner's Ending Balance is one number out of a distribution.
// When the Monte Carlo has been run for THIS plan, the banner shows the
// P10-P90 band beside it; when the plan has changed since, it says so
// rather than quoting a band that belongs to a different plan; when it has
// never been run, it offers to. The Monte Carlo's figures are nominal
// (runProjection unadjusted), so under Today's Dollars they are deflated by
// the same final-year factor the Ending Balance itself is -- the two must
// share a frame or the band will not contain the number it brackets.
// `mcKey` is the plan key the result was run for and `currentKey` the
// plan's key now (utils/monteCarloCache.js planKey); since changelog 268
// they are compared as strings so a run survives a reload and an
// edit-and-undo, and goes stale only when a value actually differs.
export function monteCarloRange(monteCarlo, mcKey, currentKey, rawProjection, useRealDollars) {
  if (!monteCarlo) return { status: 'none' };
  if (mcKey !== currentKey) return { status: 'stale', seed: monteCarlo.seed };
  const factor = useRealDollars ? finalBalanceFactor(rawProjection?.years || []) : 1;
  return {
    status: 'fresh',
    p10: monteCarlo.endingP10 / factor,
    p50: monteCarlo.endingP50 / factor,
    p90: monteCarlo.endingP90 / factor,
    successProbability: monteCarlo.successProbability,
    trials: monteCarlo.trials || 1000,
    longevitySampled: !!monteCarlo.longevitySampled,
    seed: monteCarlo.seed,
  };
}
