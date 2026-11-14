import {
  runOptimizer,
  gridBestExtraStrategy,
  findOptimalRetirementAge,
  getSSClaimingHeatmap,
  computeStressComparisonData,
  computeOptimizerResultsReal,
  computeAgeFinderResultsReal,
  runSensitivityAnalysis,
  computeSensitivityAnalysisReal,
  getRothBracketWithdrawalHeatmap,
  getRothLadderScheduleHeatmap,
  dieWithZeroByLongevity,
  runHistoricalStarts,
  findHistoricalSafeMax,
  computeFeeComparison,
  historicalByStockShare, historicalByRiskTarget,
  getMinimumRequiredReturn,
} from './calculator.js';
import { guardrailsComparisonForDisplay } from './utils/guardrailsDisplay.js';

// Runs the seven calculations that used to live in App.jsx useMemo blocks and
// collectively fire 150+ full runProjection() calls per settings change
// (stress comparison: 5, SS claiming heatmap: up to 81, optimizer: one per
// strategy, age finder: one per candidate age, sensitivity analysis: 9, Roth
// bracket/withdrawal heatmap: 32, Roth ladder schedule heatmap: 42). Moved
// here so they run off the main thread instead of jank-ing the UI on every
// debounced input change.
//
// The actual math lives in calculator.js (computeStressComparisonData,
// computeOptimizerResultsReal, computeAgeFinderResultsReal,
// runSensitivityAnalysis/computeSensitivityAnalysisReal,
// getRothBracketWithdrawalHeatmap, getRothLadderScheduleHeatmap, plus the
// pre-existing runOptimizer/findOptimalRetirementAge/getSSClaimingHeatmap) so
// this worker and App.jsx's synchronous fallback (used only if the Worker
// fails to start) call the exact same code rather than two copies that could
// drift apart.
// Superseded requests are dropped (review 2026-09-30, H11b). Each edit
// posts a new request; the worker yields to its message queue between
// analyses, so a newer request that has arrived is seen within one analysis
// and the older job stops there instead of finishing ten analyses nobody
// will read. The app ignores stale replies as well.
let latestRequestId = null;
const yieldToQueue = () => new Promise((resolve) => setTimeout(resolve, 0));

// Results go out in two waves (performance audit 2026-11-13). The first
// ten analyses take about a second and a half and feed the Dashboard and
// the Tax pages; the history replays and the fee comparison take about ten
// more. `onPartial` receives the first wave as soon as it is done, so those
// pages fill in without waiting for the history.
//
// The two history tables only Premium shows (by stock share, by risk
// target, about two seconds) run only when `premiumTables` is set: a
// Premium key, or demo mode, which previews Premium.
export const FIRST_WAVE_STEPS = 10;

export async function runHeavyAnalyses({ requestId, inputs, useRealDollars, premiumTables = true }, { isCurrent = () => true, pause = yieldToQueue, onPartial = null } = {}) {
  const out = {};
  const steps = [
    () => { out.stressComparisonData = computeStressComparisonData(inputs, useRealDollars); },
    () => { out.ssClaimingHeatmapData = getSSClaimingHeatmap(inputs); },
    // Roth grid computed BEFORE the optimizer so its best cell can join the
    // Hub's cards as a seventh, dynamic strategy (gridBestExtraStrategy) —
    // one extra projection instead of re-running the whole 32-cell grid.
    () => { out.rothBracketHeatmapData = getRothBracketWithdrawalHeatmap(inputs, useRealDollars); },
    () => {
      const gridBestExtras = [gridBestExtraStrategy(out.rothBracketHeatmapData)];
      out.optimizerResults = useRealDollars ? computeOptimizerResultsReal(inputs, gridBestExtras) : runOptimizer(inputs, gridBestExtras);
    },
    () => { out.ageFinderResults = useRealDollars ? computeAgeFinderResultsReal(inputs) : findOptimalRetirementAge(inputs); },
    () => { out.sensitivityResults = useRealDollars ? computeSensitivityAnalysisReal(inputs) : runSensitivityAnalysis(inputs); },
    // Both Roth ladder grids follow the Real/Nominal toggle (changelog
    // 111); the SS claiming heatmap remains nominal-only (its comparisons
    // are internal to itself).
    () => { out.rothLadderScheduleHeatmapData = getRothLadderScheduleHeatmap(inputs, useRealDollars); },
    () => { out.guardrailsComparisonData = guardrailsComparisonForDisplay(inputs, useRealDollars); },
    // Changelog 255: spend-to-zero at three longevity odds (120 projections).
    () => { out.dieWithZeroLongevityData = dieWithZeroByLongevity(inputs); },
    // The lowest return the plan can live on (43 projections; the printed
    // report reads it). Moved here from the main thread, 2026-11-13.
    () => { out.minimumRequiredReturn = getMinimumRequiredReturn(inputs); },
    // Changelog 335: every real retirement since 1928, each spending rule
    // over the same starts (about 200 projections).
    () => { out.historicalStartsData = runHistoricalStarts(inputs); },
    // Changelog 358: the most the plan could spend and still last through
    // every start (and 95% / 90% of them) -- a bisection over the same
    // starts, a few hundred projections. Its own step so a newer request
    // can supersede it.
    () => {
      if (out.historicalStartsData) out.historicalStartsData = { ...out.historicalStartsData, safeMax: findHistoricalSafeMax(inputs) };
    },
    // Changelog 452: the same starts at several stock shares (Premium table).
    () => {
      if (premiumTables && out.historicalStartsData) out.historicalStartsData = { ...out.historicalStartsData, byStockShare: historicalByStockShare(inputs) };
    },
    // What's New 487: risk-based guardrails at 70/80/90% (Premium table).
    () => {
      if (premiumTables && out.historicalStartsData) out.historicalStartsData = { ...out.historicalStartsData, byRiskTarget: historicalByRiskTarget(inputs) };
    },
    // Changelog 447: what fees cost -- the plan beside the same plan with
    // (or without) an advisor fee, through the historical starts too.
    () => { out.feeComparisonData = computeFeeComparison(inputs, { historical: true }); },
  ];
  for (let i = 0; i < steps.length; i++) {
    if (!isCurrent()) return { requestId, superseded: true };
    steps[i]();
    if (i === FIRST_WAVE_STEPS - 1 && onPartial && isCurrent()) onPartial({ requestId, success: true, partial: true, ...out });
    await pause();
  }
  if (!isCurrent()) return { requestId, superseded: true };
  return { requestId, success: true, ...out };
}

// The worker entry point is engineWorker.js (job 'heavy').
