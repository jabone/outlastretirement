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
} from './calculator.js';
import { guardrailsComparisonForDisplay } from './utils/guardrailsDisplay.js';

// Runs the seven calculations that used to live in App.jsx useMemo blocks and
// collectively fire 150+ full runProjection() calls per settings change
// (stress comparison: 5, SS claiming heatmap: up to 81, optimizer: one per
// strategy, age finder: one per candidate age, sensitivity analysis: 9, Roth
// bracket/withdrawal heatmap: 28, Roth ladder schedule heatmap: 42). Moved
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

export async function runHeavyAnalyses({ requestId, inputs, useRealDollars }, { isCurrent = () => true, pause = yieldToQueue } = {}) {
  const out = {};
  const steps = [
    () => { out.stressComparisonData = computeStressComparisonData(inputs, useRealDollars); },
    () => { out.ssClaimingHeatmapData = getSSClaimingHeatmap(inputs); },
    // Roth grid computed BEFORE the optimizer so its best cell can join the
    // Hub's cards as a seventh, dynamic strategy (gridBestExtraStrategy) —
    // one extra projection instead of re-running the whole 28-cell grid.
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
    // Changelog 447: what fees cost -- the plan beside the same plan with
    // (or without) an advisor fee, through the historical starts too.
    () => { out.feeComparisonData = computeFeeComparison(inputs, { historical: true }); },
  ];
  for (const step of steps) {
    if (!isCurrent()) return { requestId, superseded: true };
    step();
    await pause();
  }
  if (!isCurrent()) return { requestId, superseded: true };
  return { requestId, success: true, ...out };
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof window === 'undefined') {
  self.onmessage = async (e) => {
    const { requestId } = e.data;
    latestRequestId = requestId;
    try {
      const result = await runHeavyAnalyses(e.data, { isCurrent: () => latestRequestId === requestId });
      // A superseded job posts nothing: its reply would be discarded anyway.
      if (!result.superseded) self.postMessage(result);
    } catch (error) {
      self.postMessage({ requestId, success: false, error: error.message });
    }
  };
}
