// What's New 495: housing keeps the couple's dollars after a death; the
// chance of lasting names the age it runs to; the cautious planning age is
// read from retirement.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection, riskPlanningAges, migrateInputs } from '../calculator';
import { REFERENCE_INPUTS } from './referenceHousehold';
import { chanceToLabel } from '../utils/chanceToLabel';

const START = DEFAULT_INPUTS.planYear;
const couple = (over = {}) => ({
  ...DEFAULT_INPUTS, ...REFERENCE_INPUTS, rebalancingEnabled: true, stateTaxState: 'none',
  spouse1Name: 'Pat', spouse2Name: 'Lee', spouse2Enabled: true,
  birthYear1: START - 70, retireAge1: 65, lifeExpectancy1: 85, claimingAge1: 67, salary1: 0, ss1: 30000,
  birthYear2: START - 68, retireAge2: 65, lifeExpectancy2: 92, claimingAge2: 67, salary2: 0, ss2: 20000,
  preTaxInit: 800000, rothInit: 100000, taxableInit: 200000, lifestyleExpense: 70000, housingExpensePct: 30,
  survivorExpenseDropPct: 20, survivorExpenseDropInPlan: true, ...over,
});

describe('housing keeps its full cost for the one left', () => {
  it('drops only the non-housing share after a death', () => {
    const off = runProjection(couple({ survivorDropKeepsHousing: false }));
    const on = runProjection(couple());
    const before = (p) => p.years.find((y) => y.spouse1Alive && y.spouse2Alive && y.year === START + 14);
    const after = (p) => p.years.find((y) => !y.spouse1Alive && y.spouse2Alive);
    expect(DEFAULT_INPUTS.survivorDropKeepsHousing).toBe(true);
    expect(before(on)).toBeTruthy();
    const ratioOff = after(off).lifestyleExpenses / off.years[after(off).year - START - 1].lifestyleExpenses;
    const ratioOn = after(on).lifestyleExpenses / on.years[after(on).year - START - 1].lifestyleExpenses;
    // A year's inflation on top of the drop: about 0.8 vs about 0.86.
    expect(ratioOff).toBeLessThan(0.84);
    expect(ratioOn).toBeGreaterThan(ratioOff + 0.04);
  });

  it('a plan saved before keeps the drop on the whole budget', () => {
    const migrated = migrateInputs({ schemaVersion: 4, inputs: { ...couple(), survivorDropKeepsHousing: undefined } });
    expect(migrated.survivorDropKeepsHousing).toBe(false);
  });
});

describe('the age the chance of lasting runs to', () => {
  it('each retired year names the age, for the last survivor while both are alive', () => {
    const p = runProjection(couple({ riskGuardrailsEnabled: true }));
    const y = p.years.find((r) => r.isRetired && Number.isFinite(r.riskGuardrailChance));
    expect(y.riskGuardrailToWhom).toBe(2);
    expect(y.riskGuardrailToAge).toBeGreaterThanOrEqual(92);
    expect(chanceToLabel(y, couple())).toBe(` until Lee is ${y.riskGuardrailToAge}`);
    expect(chanceToLabel({ riskGuardrailToAge: 95 }, { spouse2Enabled: false })).toBe(' until age 95');
    expect(chanceToLabel({}, {})).toBe('');
  });
});

describe('the cautious age is read from retirement', () => {
  it('a younger saver plans further than the table says from today', () => {
    const single = { ...DEFAULT_INPUTS, ...REFERENCE_INPUTS, spouse2Enabled: false, sex1: 'male', lifeExpectancy1: 85, birthYear1: START - 45, retireAge1: 67 };
    const fromRetirement = riskPlanningAges(single).cautious;
    const fromToday = riskPlanningAges({ ...single, retireAge1: 45 }).cautious;
    expect(fromRetirement).toBeGreaterThan(fromToday);
  });
});

describe('a short life expectancy is judged at today’s ages', () => {
  it('an ordinary life expectancy is not read as a health problem from a later start', async () => {
    const { coupleHorizonOdds } = await import('../utils/mortality');
    const c = { ...DEFAULT_INPUTS, spouse2Enabled: true, planYear: START, sex1: 'male', birthYear1: START - 66, lifeExpectancy1: 88, retireAge1: 66,
      sex2: 'female', birthYear2: START - 46, lifeExpectancy2: 92, retireAge2: 67 };
    const pa = riskPlanningAges(c);
    // The couple's odds from the retirement start, not Lee's own age alone.
    const startYear = START - 46 + 67 > START - 66 + 88 ? START - 66 + 88 : START - 46 + 67;
    const odds = coupleHorizonOdds({ planYear: startYear, sex1: 'male', birthYear1: START - 66, lifeExpectancy1: 88, sex2: 'female', birthYear2: START - 46, lifeExpectancy2: 92 });
    expect(pa.cautious).toBe(odds.oneInFour.age2);
  });
});
