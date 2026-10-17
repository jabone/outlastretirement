// The engine's today's-dollar helpers must convert an ENDING balance the way
// the Dashboard does (utils/displayDollars.js: by the END-of-year price
// level), and must discount every flow year by year. Before this, the Risk >
// Sensitivity baseline, the Tax Optimizer Hub, the Age Finder, the Roth
// ladder grids and Historical Starts divided the ending balance by the
// start-of-year factor and read one year of inflation above the Dashboard,
// and the Hub's survivor-phase taxes stayed a nominal sum.
import { describe, it, expect } from 'vitest';
import {
  sanitizeInputs, runProjection, computeSensitivityAnalysisReal,
  computeOptimizerResultsReal, getRothBracketWithdrawalHeatmap,
} from '../calculator';
import { buildDemoInputs } from '../config/demoPlan';
import { deflateProjectionForDisplay } from '../utils/displayDollars';

const demo = sanitizeInputs(buildDemoInputs());
const dashboardEnding = deflateProjectionForDisplay(runProjection(demo), demo).endingBalance;

describe('engine today\'s-dollar helpers match the Dashboard (demo plan)', () => {
  it('Sensitivity baseline ending balance equals the Dashboard ending balance', () => {
    const sens = computeSensitivityAnalysisReal(demo);
    expect(sens.baseline.endingBalance).toBeCloseTo(dashboardEnding, 2);
  });

  it('Hub survivor-phase taxes and ending balance equal the Roth Ladder Inspector\'s for the active strategy', () => {
    expect(demo.rothConversionStrategy).toBe('maxBracket');
    const hub = computeOptimizerResultsReal(demo);
    const active = hub.find((s) => s.config.rothConversionStrategy === 'maxBracket'
      && s.config.rothConversionBracket === demo.rothConversionBracket
      && s.config.withdrawalStrategy === demo.withdrawalStrategy);
    expect(active).toBeTruthy();
    const cell = getRothBracketWithdrawalHeatmap(demo, true).find((c) => c.bracket === demo.rothConversionBracket
      && c.withdrawalStrategy === demo.withdrawalStrategy);
    expect(cell).toBeTruthy();
    expect(active.survivorPhaseTaxes).toBeGreaterThan(0);
    expect(active.survivorPhaseTaxes).toBeCloseTo(cell.survivorPhaseTaxes, 2);
    expect(active.endingBalance).toBeCloseTo(cell.endingBalance, 2);
    expect(active.endingBalance).toBeCloseTo(dashboardEnding, 2);
  }, 120000);
});

describe('rmdStartAge (the one copy of the SECURE 2.0 start-age rule)', () => {
  it('is 73 before 1960 and 75 from 1960, and drives the engine\'s first RMD year', async () => {
    const { rmdStartAge, DEFAULT_INPUTS } = await import('../calculator');
    expect(rmdStartAge(1959)).toBe(73);
    expect(rmdStartAge(1960)).toBe(75);
    expect(rmdStartAge('1955')).toBe(73);
    for (const birthYear1 of [1958, 1962]) {
      const inputs = sanitizeInputs({
        ...DEFAULT_INPUTS, birthYear1, retireAge1: 60, lifeExpectancy1: 95,
        spouse2Enabled: false, preTaxInit: 1000000, salary1: 0,
      });
      const first = runProjection(inputs).years.find((y) => (y.rmdAmount || 0) > 0);
      expect(first.year - birthYear1).toBe(rmdStartAge(birthYear1));
    }
  });
});

describe('Sensitivity names the person whose life expectancy moves', () => {
  it('uses the plan\'s name, or Your', () => {
    const label = (inputs) => computeSensitivityAnalysisReal(inputs).results.find((r) => r.key === 'longevity').label;
    expect(label(demo)).toBe(`${demo.spouse1Name}'s Life Expectancy`);
    expect(label({ ...demo, spouse1Name: '' })).toBe('Your Life Expectancy');
    expect(label({ ...demo, spouse1Name: 'Chris' })).toBe("Chris' Life Expectancy");
  });
});
