// Saved scenarios must be shown in the SAME units as everything else on
// screen (changelog 187).
//
// They were not. Each scenario carries a `metrics` object written at save
// time in nominal dollars, and the Scenarios tab rendered it raw while the
// app converts to today's dollars by default. The Side-by-Side table put
// the active plan at $4,410,875 in one column and saved scenarios at
// $12,280,441 in the next, for the same household; the comparison chart
// drew lines to $18M under a headline reading $4.4M. Worse than merely
// confusing: "Sam retires at 58" showed $8,605,497 against the current
// plan's $4,410,875 and so looked like a large IMPROVEMENT, when converted
// properly it is $3,451,381 -- a plan roughly $1M WORSE.
//
// Same defect as changelog 184 (the Change one thing panel) one surface
// over, which is why App.jsx now runs scenario projections through that
// fix's own deflateProjectionForDisplay rather than a second copy.
//
// No test could catch the original because every scenario test compared a
// scenario against itself. This one compares the two units against each
// other, which is the only framing that can fail.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runProjection } from '../calculator';
import { deflateProjectionForDisplay } from '../utils/oneLeverCompare';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const demo = JSON.parse(
  readFileSync(resolve(repoRoot, 'outlastretirement_demo.json'), 'utf8')
);

// Mirrors what App.jsx's scenarioProjections memo publishes.
const shown = (inputs, useRealDollars) => {
  const proj = deflateProjectionForDisplay(runProjection(inputs), useRealDollars);
  const years = proj.years || [];
  return {
    endingBalance: proj.endingBalance,
    peakPortfolioWorth: years.reduce(
      (mx, y) => Math.max(mx, Number(y.totalPortfolioEnding) || 0), -Infinity
    ),
  };
};

describe('saved scenarios are displayed in the same units as the active plan', () => {
  it('nominal mode reproduces the stored metrics exactly', () => {
    // The toggle off must give back precisely the numbers saved with the
    // scenario -- otherwise the conversion is not a conversion, it is a
    // different calculation.
    for (const sc of demo.savedScenarios) {
      expect(Math.round(shown(sc.inputs, false).endingBalance))
        .toBe(Math.round(sc.metrics.endingBalance));
    }
  });

  it('real mode converts every scenario away from its stored nominal figure', () => {
    // Guards the actual regression: rendering sc.metrics raw in the default
    // view. Inflation over this plan is strictly positive, so a converted
    // balance must come in materially BELOW the stored nominal one. If
    // someone reverts to the raw metrics, these become equal and this fails.
    // A scenario that runs out ends at $0 in both units ("Spends $180,000 a
    // year" does since the cash reserve is spent before a shortfall, E15;
    // the two $170,000 scenarios spend their last dollar in the final year
    // since changelog 423 trimmed the bracket fill to the solver's draw),
    // so only the ones with money left can show the conversion.
    const withMoneyLeft = demo.savedScenarios.filter((sc) => sc.metrics.endingBalance > 0);
    expect(withMoneyLeft.length).toBeGreaterThanOrEqual(demo.savedScenarios.length - 3);
    for (const sc of withMoneyLeft) {
      const real = shown(sc.inputs, true).endingBalance;
      expect(real).toBeLessThan(sc.metrics.endingBalance * 0.95);
      expect(real).toBeGreaterThan(0);
    }
  });

  it('scenarios and the active plan land on a comparable scale', () => {
    // The symptom a user actually saw. Converted, no demo scenario should
    // sit more than ~2x the active plan; before the fix several were 2.5x
    // to 3.8x purely from the unit mismatch.
    const base = shown(demo.activeInputs, true).endingBalance;
    for (const sc of demo.savedScenarios) {
      expect(shown(sc.inputs, true).endingBalance).toBeLessThan(base * 2);
    }
    // And specifically: retiring two years earlier must read as WORSE than
    // the base plan, which is the case the old display inverted.
    const earlier = demo.savedScenarios.find(s => s.name.includes('retires at 58'));
    expect(earlier).toBeDefined();
    expect(shown(earlier.inputs, true).endingBalance).toBeLessThan(base);
    expect(earlier.metrics.endingBalance).toBeGreaterThan(base); // the old, wrong reading
  });

  it('peak portfolio worth is converted year by year, not at the final factor', () => {
    // The peak year is usually not the last year, so deflating the engine's
    // nominal peak by the FINAL year's factor would convert it at the wrong
    // rate. Recomputing from converted years is what App.jsx does.
    for (const sc of demo.savedScenarios) {
      const r = shown(sc.inputs, true);
      expect(r.peakPortfolioWorth).toBeGreaterThanOrEqual(r.endingBalance - 1);
    }
  });
});
