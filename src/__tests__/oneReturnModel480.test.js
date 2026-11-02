// One return model (DIY-planner review, changelog 480): a new plan's return
// comes from its stock/bond mix; "Use my own average return" is the
// override; saved plans and the sample families keep what they had.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection, migratePersistedInputs, planReturnRates } from '../calculator';
import { returnAssumptionSentence, historicalRealReturn } from '../utils/planVerdict';
import { buildDemoInputs } from '../config/demoPlan';
import { buildParkersInputs } from '../config/demoPlanParkers';

describe('the defaults', () => {
  it('a new plan takes its return from the mix at 6.5% stocks and 4.5% bonds', () => {
    expect(DEFAULT_INPUTS.rebalancingEnabled).toBe(true);
    expect(DEFAULT_INPUTS.stockReturnRate).toBe(6.5);
    expect(DEFAULT_INPUTS.bondReturnRate).toBe(4.5);
    const r = planReturnRates(DEFAULT_INPUTS);
    expect(r.fromMix).toBe(true);
    expect(r.working).toBeCloseTo(0.8 * 6.5 + 0.2 * 4.5, 9); // 6.1
    expect(r.retired).toBeCloseTo(0.6 * 6.5 + 0.4 * 4.5, 9); // 5.7
  });

  it('the override reads the flat pair', () => {
    expect(planReturnRates({ ...DEFAULT_INPUTS, rebalancingEnabled: false })).toMatchObject({ fromMix: false, working: 7, retired: 5 });
  });

  it('the projection grows at the mix return', () => {
    const p = runProjection({ ...DEFAULT_INPUTS, planYear: 2026, birthYear1: 1956, retireAge1: 65, salary1: 0, lifestyleExpense: 0,
      preTaxInit: 0, rothInit: 0, taxableInit: 0, hsaInit: 0, fundExpenseRatioPct: 0, spouse2Enabled: false });
    expect(p.years[0].growthRate).toBeCloseTo(5.7, 9);
  });
});

describe('saved plans keep their returns', () => {
  it('a plan saved without the keys keeps the flat model and 8% / 4%', () => {
    const { inputs } = migratePersistedInputs({ schemaVersion: 4, inputs: { lifestyleExpense: 50000 } });
    expect(inputs.rebalancingEnabled).toBe(false);
    expect(inputs.stockReturnRate).toBe(8);
    expect(inputs.bondReturnRate).toBe(4);
  });
  it('a plan saved with the keys is untouched', () => {
    const { inputs } = migratePersistedInputs({ schemaVersion: 4, inputs: { rebalancingEnabled: true, stockReturnRate: 9, bondReturnRate: 3 } });
    expect(inputs).toMatchObject({ rebalancingEnabled: true, stockReturnRate: 9, bondReturnRate: 3 });
  });
  it('a brand-new plan gets the new model', () => {
    expect(migratePersistedInputs(null).inputs.rebalancingEnabled).toBe(true);
  });
});

describe('the sample families keep their own average return', () => {
  it('the Carters and the Parkers', () => {
    for (const i of [buildDemoInputs(), buildParkersInputs()]) {
      expect(planReturnRates(i)).toMatchObject({ fromMix: false, working: 7, retired: 5 });
    }
  });
});

describe('what Will It Last? says it assumes', () => {
  it('the retired return after inflation and fees, beside 60/40 since 1928', () => {
    const s = returnAssumptionSentence(DEFAULT_INPUTS);
    expect(s).toMatch(/grow 5\.7% a year once you retire: 3\.0% after inflation and fees/);
    expect(s).toMatch(/A 60\/40 mix of stocks and bonds grew 5\.2% a year after inflation from 1928 to 2025/);
    expect(returnAssumptionSentence({ ...DEFAULT_INPUTS, rebalancingEnabled: false })).toMatch(/5\.0% a year once you retire \(your own average return\)/);
  });
  it('history: more stocks earned more', () => {
    expect(historicalRealReturn(100)).toBeGreaterThan(historicalRealReturn(60));
    expect(historicalRealReturn(60)).toBeGreaterThan(historicalRealReturn(0));
  });
});
