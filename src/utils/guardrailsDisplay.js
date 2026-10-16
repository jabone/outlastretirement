// The Risk tab's Guardrails vs Fixed Withdrawals grid in the display basis.
//
// getGuardrailsComparisonHeatmap (calculator.js) returns each cell's balances
// in future dollars and takes no basis, so under Today's Dollars the grid
// read "No Crash (Baseline) $11.1M" beside a $4.46M Ending Balance on the
// Dashboard for the same plan. Each crash scenario carries its own inflation
// (1929 deflation, 1973 stagflation), so the cells cannot be converted by
// the plan's factor: each cell's run is converted by its own price path
// through deflateProjectionForDisplay, the function every other screen uses.
// The spending-cost fields are shares of spending and need no conversion.
import { runProjection, getGuardrailsComparisonHeatmap } from '../calculator';
import { deflateProjectionForDisplay } from './displayDollars';

export function guardrailsComparisonForDisplay(inputs, useRealDollars) {
  const cells = getGuardrailsComparisonHeatmap(inputs);
  if (!useRealDollars) return cells;
  return cells.map((cell) => {
    const shown = deflateProjectionForDisplay(
      runProjection({ ...inputs, stressType: cell.stressType, spendingGuardrails: cell.guardrailsOn }),
      true,
    );
    const balances = shown.years.map((y) => y.totalPortfolioEnding);
    return {
      ...cell,
      endingBalance: shown.endingBalance,
      totalTaxesPaid: shown.totalTaxesPaid,
      worstYearBalance: balances.length ? Math.min(...balances) : 0,
    };
  });
}
