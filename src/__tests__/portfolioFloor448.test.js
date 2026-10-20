// "Keep at least" (changelog 448): a floor that Monte Carlo, the historical
// starts and the safe-spending search hold the plan to. A test, not a
// spending rule.
import { describe, it, expect } from 'vitest';
import {
  runProjection, runMonteCarlo, runHistoricalStarts, findHistoricalSafeMax, historicalLastedCount,
  sanitizeInputs, DEFAULT_INPUTS,
} from '../calculator';
import { planVerdict, floorPhrase } from '../utils/planVerdict';
import { historicalHeadline, safeMaxHeadline } from '../utils/historicalStarts';

const plan = (floor) => ({ ...DEFAULT_INPUTS, portfolioFloorReal: floor });

describe('the projection', () => {
  it('with no floor, meetsFloor is isSuccessful and nothing breaches', () => {
    const p = runProjection(plan(0));
    expect(p.floorBreachYear).toBeNull();
    expect(p.meetsFloor).toBe(p.isSuccessful);
  });

  it('the floor changes no figure in the plan: it is a test, not a spending rule', () => {
    const a = runProjection(plan(0));
    const b = runProjection(plan(250000));
    expect(b.years.map((y) => y.totalPortfolioEnding)).toEqual(a.years.map((y) => y.totalPortfolioEnding));
    expect(b.isSuccessful).toBe(a.isSuccessful);
  });

  it('names the first retired year whose year-end balance, in today\'s dollars, is under the floor', () => {
    const p = runProjection(plan(250000));
    expect(p.floorBreachYear).not.toBeNull();
    expect(p.meetsFloor).toBe(false);
    const i = p.years.findIndex((y) => y.year === p.floorBreachYear);
    const row = p.years[i];
    expect(row.isRetired).toBe(true);
    // Every retired year before it was at or above the floor.
    for (const y of p.years.slice(0, i)) {
      if (y.isRetired) expect(y.year).toBeLessThan(p.floorBreachYear);
    }
  });

  it('working years never breach: the floor applies once retired', () => {
    const p = runProjection(plan(10_000_000));
    const first = p.years.find((y) => y.isRetired);
    expect(p.floorBreachYear).toBe(first.year);
  });

  it('is clamped at zero', () => {
    expect(sanitizeInputs(plan(-5)).portfolioFloorReal).toBe(0);
  });
});

describe('the success tests', () => {
  it('a higher floor never raises the Monte Carlo success rate', () => {
    const a = runMonteCarlo(plan(0)).successProbability;
    const b = runMonteCarlo(plan(100000)).successProbability;
    const c = runMonteCarlo(plan(300000)).successProbability;
    expect(b).toBeLessThanOrEqual(a);
    expect(c).toBeLessThanOrEqual(b);
  }, 120000);

  it('the historical starts count, mark each breach, and report the floor', () => {
    const none = runHistoricalStarts(plan(0));
    const high = runHistoricalStarts(plan(300000));
    const lasted = (d) => d.rules.find((r) => r.inPlan).lasted;
    expect(lasted(high)).toBeLessThanOrEqual(lasted(none));
    expect(high.floor).toBe(300000);
    expect(none.floor).toBe(0);
    const failing = high.starts.find((s) => s.fixed.ok === false && s.fixed.floorBreachYear);
    expect(failing).toBeTruthy();
    // The headline helper carries it to the panel.
    expect(historicalHeadline(high).floor).toBe(300000);
    // historicalLastedCount (the fees card) uses the same test.
    expect(historicalLastedCount(plan(300000)).lasted).toBe(lasted(high));
  }, 120000);

  it('the safe-spending figure with a floor is never above the figure without one', () => {
    const a = findHistoricalSafeMax(plan(0), { shares: [1] }).bars[0];
    const b = findHistoricalSafeMax(plan(200000), { shares: [1] });
    expect(b.floor).toBe(200000);
    if (a.status === 'ok' && b.bars[0].status === 'ok') expect(b.bars[0].amount).toBeLessThanOrEqual(a.amount);
    expect(safeMaxHeadline({ safeMax: b }).floor).toBe(200000);
  }, 120000);
});

describe('the wording', () => {
  it('floorPhrase is empty with no floor', () => {
    expect(floorPhrase(0)).toBe('');
    expect(floorPhrase(200000)).toBe(', keeping at least $200,000');
  });

  it('the verdict says its odds keep the floor, and when average returns dip below it', () => {
    const v = planVerdict({ isSuccessful: true, mc: { status: 'fresh', successProbability: 80, trials: 1000 }, floor: 200000, floorBreachYear: 2058 });
    expect(v.detail).toMatch(/^Lasts with average returns, though it dips below \$200,000 in 2058, and 80% of 1,000 simulated markets last to the end of the plan, keeping at least \$200,000/);
    const plain = planVerdict({ isSuccessful: true, mc: { status: 'fresh', successProbability: 80, trials: 1000 } });
    expect(plain.detail).toMatch(/^Lasts with average returns, and 80% of 1,000 simulated markets last to the end of the plan;/);
  });
});
