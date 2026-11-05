// What's New 498: in auto spending mode a working survivor keeps the
// couple's budget, less the survivor drop, instead of spending exactly what
// their own pay leaves.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection, migrateInputs } from '../calculator';
import { REFERENCE_INPUTS } from './referenceHousehold';
import { buildSurvivorGuide } from '../utils/survivorGuide';

const START = DEFAULT_INPUTS.planYear;
// Pat (45) earns most and dies at 47; Lee (45) keeps working to 60.
const couple = (over = {}) => ({
  ...DEFAULT_INPUTS, ...REFERENCE_INPUTS, stateTaxState: 'none',
  spouse2Enabled: true, spouse1Name: 'Pat', spouse2Name: 'Lee', filingStatus: 'MFJ',
  birthYear1: START - 45, retireAge1: 60, lifeExpectancy1: 90, salary1: 200000, ss1: 30000, claimingAge1: 67,
  birthYear2: START - 45, retireAge2: 60, lifeExpectancy2: 92, salary2: 50000, ss2: 15000, claimingAge2: 67,
  preTaxInit: 600000, rothInit: 100000, taxableInit: 300000, currentSpendingMode: 'auto',
  survivorStressEnabled: true, survivorStressSpouse: 1, survivorStressAge: 47, survivorExpenseDropPct: 20,
  ...over,
});
const alone = (p) => p.years.filter((y) => !y.spouse1Alive && y.spouse2Alive && y.age2 < 60);
const lastCouple = (p) => p.years.filter((y) => y.spouse1Alive && y.spouse2Alive).pop();

describe('a working survivor in auto spending mode', () => {
  it('is on for a new plan and off for one saved earlier', () => {
    expect(DEFAULT_INPUTS.survivorWorkingKeepsBudget).toBe(true);
    expect(migrateInputs({ schemaVersion: 4, inputs: { ...couple(), survivorWorkingKeepsBudget: undefined } }).survivorWorkingKeepsBudget).toBe(false);
  });

  it('keeps the couple’s budget less the drop, drawing on savings for the gap', () => {
    // A retirement budget large enough that the cap does not bind.
    const big = couple({ lifestyleExpense: 250000 });
    const p = runProjection(big);
    const before = lastCouple(p);
    const first = alone(p)[0];
    const real = (y, v) => v / y.priceIndex;
    const coupleEveryday = real(before, before.currentSpending.applied);
    // The drop, housing excepted (so a little less than 20%).
    expect(real(first, first.survivorWorkingBudget) / coupleEveryday).toBeGreaterThan(0.8 - 1e-6);
    expect(real(first, first.survivorWorkingBudget) / coupleEveryday).toBeLessThan(0.95);
    const off = runProjection({ ...big, survivorWorkingKeepsBudget: false });
    expect(alone(off)[0].survivorWorkingBudget).toBeNull();
    expect(off.years.find((y) => y.year === first.year).currentSpending.applied).toBeLessThan(first.survivorWorkingBudget * 0.8);
    // Lee keeps contributing while the accounts cover the gap.
    expect(first.currentSpending.contributions).toBeGreaterThan(0);
    expect(first.currentSpending.trimmedByDeficit).toBe(0);
  });

  it('is capped at the larger of own pay’s leftover and the retirement budget', () => {
    // Auto mode counts all of $250k pay not put away as spending; a survivor
    // does not spend that out of savings.
    const p = runProjection(couple());
    const first = alone(p)[0];
    const real = (y, v) => v / y.priceIndex;
    expect(real(first, first.survivorWorkingBudget)).toBeLessThan(0.5 * real(lastCouple(p), lastCouple(p).currentSpending.applied));
    const off = runProjection(couple({ survivorWorkingKeepsBudget: false }));
    expect(first.survivorWorkingBudget).toBeGreaterThanOrEqual(off.years.find((y) => y.year === first.year).currentSpending.applied - 1);
    expect(p.endingBalance).toBeGreaterThan(0);
    expect(p.endingBalance).toBeLessThan(off.endingBalance);
  });

  it('saves what a high-earning survivor’s pay leaves over', () => {
    // Lee earns nearly all of it; Pat dies and the budget halves.
    const big = couple({ salary1: 20000, salary2: 220000, survivorExpenseDropPct: 50 });
    const p = runProjection(big);
    const off = runProjection({ ...big, survivorWorkingKeepsBudget: false });
    const y = alone(p)[0];
    expect(y.survivorWorkingBudget).toBeLessThan(off.years.find((r) => r.year === y.year).currentSpending.derived);
    expect(p.endingBalance).toBeGreaterThan(off.endingBalance);
  });

  it('leaves a custom spending figure and a retired survivor alone', () => {
    const custom = couple({ currentSpendingMode: 'custom', currentHouseholdSpendingCustom: 90000 });
    expect(runProjection(custom).endingBalance).toBeCloseTo(runProjection({ ...custom, survivorWorkingKeepsBudget: false }).endingBalance, 0);
    const retired = couple({ retireAge1: 46, retireAge2: 46 });
    expect(runProjection(retired).endingBalance).toBeCloseTo(runProjection({ ...retired, survivorWorkingKeepsBudget: false }).endingBalance, 0);
  });

  it('the guide says the survivor keeps the household budget', () => {
    expect(buildSurvivorGuide(couple(), 1).spending.keepsBudget).toBe(true);
    expect(buildSurvivorGuide(couple({ survivorWorkingKeepsBudget: false }), 1).spending.keepsBudget).toBe(false);
  });
});
