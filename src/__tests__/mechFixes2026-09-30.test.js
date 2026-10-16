// Projection-mechanics fixes from the 2026-09-30 review (the MECH slice).
// Each block names its finding ID; FIX_NOTES.md has the before/after numbers.
import { describe, it, expect } from 'vitest';
import {
  runProjection, DEFAULT_INPUTS, spouse2RetireAgeMatching, findOptimalRetirementAge,
  findDieWithZeroSpending, DIE_WITH_ZERO_CEILING, findTargetPortfolioSize, migrateInputs, TAX_YEAR,
  NAMED_STRESS_SCENARIOS,
} from '../calculator';
import { HISTORICAL_RETURNS } from '../config/historicalReturns';

const D = DEFAULT_INPUTS;
// A retired single person, no SS, no healthcare, zero return/inflation, no
// state tax. Every key here exists in DEFAULT_INPUTS (checked below).
const blank = (over = {}) => ({
  ...D,
  planYear: 2026, birthYear1: 1956, retireAge1: 65, lifeExpectancy1: 90, claimingAge1: 70,
  spouse2Enabled: false, filingStatus: 'Single',
  preTaxInit: 0, rothInit: 0, taxableInit: 0, hsaInit: 0,
  preRetireReturn: 0, postRetireReturn: 0, inflationRate: 0, taxBracketInflationRate: 0,
  ssCOLA: 0, medicalInflationRate: 0, medicarePartBInflationRate: 0, medicarePartDInflationRate: 0, ltcInflationRate: 0,
  housingInflationRate: 0, housingExpensePct: 0,
  salary1: 0, salary2: 0, ss1: 0, ss2: 0,
  preTaxContribution1: 0, preTaxContribution2: 0, rothContribution1: 0, rothContribution2: 0, taxableContribution: 0,
  employerMatchMode1: 'flat', employerMatch1: 0,
  lifestyleExpense: 0, healthcareBridgeCost: 0,
  taxableDividendYield: 0, taxableCapitalGainsRatio: 0, taxableBasisInit: 0,
  stateTaxState: 'none',
  ...over,
});

describe('test helper keys are real inputs', () => {
  it('every key blank() sets exists in DEFAULT_INPUTS', () => {
    const missing = Object.keys(blank()).filter((k) => !(k in D));
    expect(missing).toEqual([]);
  });
});

describe('E1: the basis share of an RMD is cash in hand, not lost', () => {
  it('a Pre-Tax account that is all after-tax basis ends the same as one with no basis, less only tax', () => {
    const base = { birthYear1: 1950, lifeExpectancy1: 80, preTaxInit: 1_000_000 };
    const noBasis = runProjection(blank({ ...base, preTaxBasisInit: 0 }));
    const fullBasis = runProjection(blank({ ...base, preTaxBasisInit: 1_000_000 }));
    // Full basis pays no income tax, so it must end at least as rich.
    expect(fullBasis.endingBalance).toBeGreaterThanOrEqual(noBasis.endingBalance);
    // The RMD left Pre-Tax and landed in Taxable (nothing to spend it on).
    const y0 = fullBasis.years[0];
    expect(y0.rmdAmount).toBeGreaterThan(40_000);
    expect(y0.rmdTaxableAmount).toBe(0);
    expect(y0.preTaxEnd + y0.taxableEnd + y0.totalExpenses).toBeCloseTo(1_000_000, -1);
  });
});

describe('E7: a life event honors its Inflation Category', () => {
  const ev = (cat) => ({
    name: 'Roof', type: 'outflow', amount: 10_000, isRecurring: false,
    startAge: 80, endAge: 80, targetAccount: 'general', isTaxable: false, fundedExternally: false,
    ...(cat ? { inflationCategory: cat } : {}),
  });
  const run = (cat) => {
    const p = runProjection(blank({
      taxableInit: 2_000_000, inflationRate: 3, housingInflationRate: 5, medicalInflationRate: 6,
      milestones: [ev(cat)],
    }));
    return p.years.find((y) => y.age1 === 80);
  };
  it('None stays the entered amount, the others grow at their own rate', () => {
    const n = 80 - (2026 - 1956);
    expect(run('None').milestoneOutflow).toBeCloseTo(10_000, 2);
    expect(run('General').milestoneOutflow).toBeCloseTo(10_000 * 1.03 ** n, 2);
    expect(run('Housing').milestoneOutflow).toBeCloseTo(10_000 * 1.05 ** n, 2);
    expect(run('Medical').milestoneOutflow).toBeCloseTo(10_000 * 1.06 ** n, 2);
    // Missing category behaves as General.
    expect(run(null).milestoneOutflow).toBeCloseTo(10_000 * 1.03 ** n, 2);
  });
});

describe('E8: a start-of-year balance is the prior year-end, even when that is $0', () => {
  it('every row after the first starts where the previous row ended', () => {
    const p = runProjection(blank({ taxableInit: 50_000, preTaxInit: 800_000, rothInit: 0, hsaInit: 5_000, lifestyleExpense: 40_000 }));
    const zeroRows = p.years.slice(0, -1).filter((y) => y.taxableEnd === 0).length;
    expect(zeroRows).toBeGreaterThan(0);
    for (let i = 1; i < p.years.length; i++) {
      const prev = p.years[i - 1];
      const row = p.years[i];
      expect(row.taxableStart).toBe(prev.taxableEnd);
      expect(row.rothStart).toBe(prev.rothEnd);
      expect(row.preTaxStart).toBe(prev.preTaxEnd);
      expect(row.hsaStart).toBe(prev.hsaEnd);
    }
    expect(p.years[0].taxableStart).toBe(50_000);
  });
});

describe('E11: a guardrail freeze never holds spending above a deflating budget', () => {
  it('under the 1929 scenario, guarded spending never exceeds unguarded', () => {
    const b = blank({
      taxableInit: 1_500_000, lifestyleExpense: 60_000, inflationRate: 3, postRetireReturn: 5,
      stressType: '1929', stressStartMode: 'specific', stressStartYear: 2026,
    });
    const on = runProjection({ ...b, spendingGuardrails: true });
    const off = runProjection({ ...b, spendingGuardrails: false });
    expect(on.years.length).toBe(off.years.length);
    on.years.forEach((y, i) => {
      expect(y.lifestyleMultiplier).toBeLessThanOrEqual(off.years[i].lifestyleMultiplier + 1e-9);
    });
  });
});

describe('E12: a history replay indexes Social Security and the brackets to the replayed CPI', () => {
  it('a 1966 start grows SS and the brackets by 1967-68 CPI, not the plan rate', () => {
    const p = runProjection(blank({
      taxableInit: 2_000_000, lifestyleExpense: 50_000, inflationRate: 2.5, ssCOLA: 2.5, taxBracketInflationRate: 2.5,
      ss1: 30_000, claimingAge1: 70,
      stressType: 'history', stressHistoryStartYear: 1966, stressStartMode: 'specific', stressStartYear: 2026,
    }));
    const [y0, y1, y2] = p.years;
    expect(y1.ssColaFactor).toBeCloseTo(1.028, 6);          // 1967 CPI 2.8%
    expect(y2.ssColaFactor).toBeCloseTo(1.028 * 1.043, 6);  // 1968 CPI 4.3%
    expect(y2.taxBracketInflationFactor).toBeCloseTo(1.028 * 1.043, 6);
    expect(y1.ssIncome / y0.ssIncome).toBeCloseTo(1.028, 4);
  });
  it('a plan with no replay keeps its own COLA', () => {
    const p = runProjection(blank({ taxableInit: 2_000_000, ssCOLA: 2.5, taxBracketInflationRate: 2.5, ss1: 30_000 }));
    expect(p.years[2].ssColaFactor).toBeCloseTo(1.025 ** 2, 9);
    expect(p.years[2].taxBracketInflationFactor).toBeCloseTo(1.025 ** 2, 9);
  });
});

describe('E13: savings a working year cannot fund are cut before they are matched, taxed or converted', () => {
  const working = {
    birthYear1: 1976, retireAge1: 60, salary1: 60_000, preTaxContribution1: 20_000,
    currentSpendingMode: 'custom', currentHouseholdSpendingCustom: 70_000,
  };
  it('a fixed conversion never drives Pre-Tax below zero', () => {
    const p = runProjection(blank({
      ...working, lifeExpectancy1: 58, preTaxInit: 100_000,
      rothConversionStrategy: 'fixed', rothConversionAmount: 50_000, rothConversionDelayUntilRetire: false,
    }));
    for (const y of p.years) expect(y.preTaxEnd).toBeGreaterThanOrEqual(0);
    // Once Pre-Tax is empty there is nothing to convert: the cancelled
    // deferral is not converted either.
    expect(p.years[3].convertAmount).toBe(0);
    expect(p.years[3].savingsDeficit).toBeCloseTo(20_000, 2);
  });
  it('no employer match on a deferral that was cut, and the cut deferral is taxed', () => {
    const base = { ...working, lifeExpectancy1: 52, employerMatchMode1: 'percent', employerMatchRateA1: 50, employerMatchCapAPct1: 100 };
    const cut = runProjection(blank(base)).years[0];
    expect(cut.savingsDeficit).toBeCloseTo(20_000, 2);
    expect(cut.employerMatchAmount).toBe(0);
    expect(cut.preTaxEnd).toBe(0);
    // Same year with no deferral planned at all: identical tax.
    const none = runProjection(blank({ ...base, preTaxContribution1: 0 })).years[0];
    expect(cut.totalTaxesPaid).toBeCloseTo(none.totalTaxesPaid, 2);
  });
});

describe('E15: the cash reserve holds only funded money and is spent before a shortfall', () => {
  it('a reserve top-up the accounts cannot pay for is not credited, and the reserve is drawn in an up year before the plan runs short', () => {
    const p = runProjection(blank({
      lifeExpectancy1: 75, rothInit: 100_000, lifestyleExpense: 50_000,
      cashFloorEnabled: true, cashFloorInit: 0, cashFloorTargetMonths: 24, cashFloorReturnRate: 0,
    }));
    const spentWithoutShortfall = p.years.reduce((t, y) => t + y.totalExpenses - y.shortfall, 0);
    // Money in: $100,000 of Roth. Nothing can be spent that was never there.
    expect(spentWithoutShortfall).toBeCloseTo(100_000, 0);
    // Year 1 tops the reserve up only with what the Roth could pay after
    // spending, and shows no draw against a phantom top-up.
    const y0 = p.years[0];
    expect(y0.cashReserveDraw).toBe(0);
    expect(y0.cashReserveReplenish).toBeCloseTo(100_000 - y0.totalExpenses, 0);
    const y1 = p.years[1];
    expect(y1.growthRate).toBeGreaterThanOrEqual(0);
    expect(y1.cashReserveDraw).toBeGreaterThan(0);
    for (const y of p.years) expect(y.cashReserveBalance).toBeGreaterThanOrEqual(0);
  });
});

describe('E16: the age finder retires a younger Spouse 2 in the same year as Spouse 1', () => {
  it('maps Spouse 1\'s age to Spouse 2\'s age that calendar year, floored at Spouse 2\'s age today', () => {
    const inputs = { ...D, planYear: 2026, birthYear1: 1966, birthYear2: 1976, spouse2Enabled: true };
    expect(spouse2RetireAgeMatching(inputs, 61)).toBe(51);
    expect(spouse2RetireAgeMatching(inputs, 55)).toBe(50);
    // An older Spouse 2 is simply older.
    expect(spouse2RetireAgeMatching({ ...inputs, birthYear2: 1960 }, 61)).toBe(67);
  });
  it('the age finder runs Spouse 2 on that age, so a younger spouse does not keep working', () => {
    const inputs = {
      ...blank(), planYear: 2026, birthYear1: 1966, birthYear2: 1976, spouse2Enabled: true, filingStatus: 'MFJ',
      retireAge1: 63, retireAge2: 53, lifeExpectancy2: 90, salary2: 100_000, taxableInit: 3_000_000, lifestyleExpense: 80_000,
    };
    const finder = findOptimalRetirementAge(inputs);
    const at61 = finder.simulations.find((s) => s.age === 61);
    const direct = runProjection({ ...inputs, retireAge1: 61, retireAge2: 51 });
    expect(at61.endingBalance).toBeCloseTo(direct.endingBalance, 0);
  });
});

describe('E17: Die with Zero says when it has no answer', () => {
  it('flags a plan that is solvent even at the ceiling, and one that never retires', () => {
    const rich = findDieWithZeroSpending(blank({ taxableInit: 900_000_000, lifestyleExpense: 100_000 }));
    expect(rich.reason).toBe('above-ceiling');
    expect(rich.dieWithZeroSpending).toBe(DIE_WITH_ZERO_CEILING);
    const working = findDieWithZeroSpending(blank({ birthYear1: 1980, retireAge1: 80, lifeExpectancy1: 75, salary1: 90_000 }));
    expect(working.reason).toBe('no-rows');
    expect(working.dieWithZeroSpending).toBeNull();
  });
  it('an ordinary plan gets a real answer', () => {
    const ok = findDieWithZeroSpending(blank({ taxableInit: 1_000_000, lifestyleExpense: 40_000 }));
    expect(ok.reason).toBe('ok');
    expect(ok.dieWithZeroSpending).toBeGreaterThan(40_000);
    expect(ok.dieWithZeroSpending).toBeLessThan(DIE_WITH_ZERO_CEILING);
  });
});

describe('A31: the target-portfolio solver flags a plan no balance up to its ceiling can fund', () => {
  it('found is false and the reason says so', () => {
    const res = findTargetPortfolioSize(blank({ taxableInit: 100_000 }), 66, 66, 5_000_000, 'taxable');
    expect(res.found).toBe(false);
    expect(res.reason).toBe('above-ceiling');
    expect(res.projection.isSuccessful).toBe(false);
  });
  it('an ordinary target is found', () => {
    const res = findTargetPortfolioSize(blank({ taxableInit: 100_000 }), 70, 70, 40_000, 'taxable');
    expect(res.found).toBe(true);
    expect(res.reason).toBe('ok');
  });
});

describe('E18: an annuity premium is capped at the source balance and a Taxable purchase realizes its gain', () => {
  const buy = (over) => runProjection(blank({
    birthYear1: 1961, lifeExpectancy1: 80, annuityPurchaseAge: 65, annuityPayoutRate: 6, annuityIndexation: 0,
    annuityIsTaxable: false, ...over,
  }));
  it('a $500,000 purchase from a $50,000 account pays on $50,000', () => {
    const p = buy({ preTaxInit: 50_000, annuityPurchaseAmount: 500_000, annuitySourceAccount: 'preTax' });
    expect(p.years[0].annuityPayout).toBeCloseTo(3_000, 2);
  });
  it('a Taxable purchase sells basis pro rata and realizes the gain that year', () => {
    const withGain = buy({ taxableInit: 200_000, taxableBasisInit: 50_000, annuityPurchaseAmount: 200_000, annuitySourceAccount: 'taxable' });
    const allBasis = buy({ taxableInit: 200_000, taxableBasisInit: 200_000, annuityPurchaseAmount: 200_000, annuitySourceAccount: 'taxable' });
    // $150,000 of gain realized: more tax than the all-basis twin.
    expect(withGain.years[0].totalTaxesPaid).toBeGreaterThan(allBasis.years[0].totalTaxesPaid + 5_000);
  });
});

describe('E25: a concentrated-stock sale pays the same year\'s bills', () => {
  it('no shortfall in a year $250,000 of proceeds arrive, and nothing is lost or doubled', () => {
    const p = runProjection(blank({
      lifeExpectancy1: 72, lifestyleExpense: 50_000,
      concentratedStockEnabled: true, concentratedStockInit: 1_000_000, concentratedStockCostBasisPct: 100,
      concentratedStockGrowthRate: 0, concentratedStockDiversifyPct: 25,
    }));
    const y0 = p.years[0];
    expect(y0.concentratedStockNetProceeds).toBeCloseTo(250_000, 0);
    expect(y0.shortfall).toBe(0);
    // Zero returns: what is left is the proceeds less what the year cost.
    expect(y0.taxableEnd).toBeCloseTo(250_000 - y0.totalExpenses, 0);
  });
});

describe('E26: a pension COLA starts with the pension', () => {
  it('a $30,000 pension from 65 pays $30,000 in its first year, then grows by the COLA', () => {
    const p = runProjection(blank({
      birthYear1: 1981, retireAge1: 65, lifeExpectancy1: 70, salary1: 50_000, taxableInit: 500_000,
      pension1: 30_000, pensionStartAge1: 65, pension1COLA: 2,
    }));
    const first = p.years.find((y) => y.age1 === 65);
    const second = p.years.find((y) => y.age1 === 66);
    expect(first.pension).toBeCloseTo(30_000, 2);
    expect(second.pension).toBeCloseTo(30_600, 2);
  });
  it('a pension already being paid keeps its entered amount in year one', () => {
    const p = runProjection(blank({ taxableInit: 500_000, pension1: 30_000, pensionStartAge1: 65, pension1COLA: 2 }));
    expect(p.years[0].pension).toBeCloseTo(30_000, 2);
    expect(p.years[1].pension).toBeCloseTo(30_600, 2);
  });
});

describe('E28: the engine clamps what it cannot run and says when a plan is impossible', () => {
  it('a runaway life expectancy is clamped to 120 instead of hanging', () => {
    const p = runProjection(blank({ taxableInit: 1_000_000, lifeExpectancy1: 1e9 }));
    expect(p.years.length).toBe(120 - 70 + 1);
  });
  it('a -150% return cannot drive balances negative', () => {
    const p = runProjection(blank({ taxableInit: 1_000_000, postRetireReturn: -150, lifeExpectancy1: 75 }));
    for (const y of p.years) expect(y.taxableEnd).toBeGreaterThanOrEqual(0);
  });
  it('negative balances and spending are read as zero', () => {
    const p = runProjection(blank({ taxableInit: -500_000, lifestyleExpense: -40_000, lifeExpectancy1: 72 }));
    expect(p.years[0].taxableStart).toBe(0);
    expect(p.years[0].lifestyleExpenses).toBe(0);
  });
  it('malformed lists do not throw, and "5,000" is 5000', () => {
    expect(() => runProjection(blank({ milestones: 'abc' }))).not.toThrow();
    expect(() => runProjection(blank({ rsuGrants: [null], salary1: 100_000, retireAge1: 80, birthYear1: 1980 }))).not.toThrow();
    expect(() => runProjection(blank({ milestones: [null] }))).not.toThrow();
    const p = runProjection(blank({
      taxableInit: 1_000_000, lifeExpectancy1: 72,
      milestones: [{ name: 'Car', type: 'outflow', amount: '5,000', startAge: 71, endAge: 71, targetAccount: 'general', isTaxable: false, inflationCategory: 'None' }],
    }));
    expect(Number.isFinite(p.endingBalance)).toBe(true);
    expect(p.years.find((y) => y.age1 === 71).milestoneOutflow).toBe(5_000);
  });
  it('a life expectancy below today\'s age is flagged, not reported as a silent success', () => {
    const p = runProjection(blank({ taxableInit: 1_000_000, lifeExpectancy1: 60 }));
    expect(p.invalidInputs).toEqual([{ key: 'lifeExpectancy1', value: 60, reason: 'below-current-age', usedValue: 70 }]);
    expect(p.years.length).toBe(1);
    const ok = runProjection(blank({ taxableInit: 1_000_000 }));
    expect(ok.invalidInputs).toEqual([]);
  });
});

describe('A21: a legacy plan saved with ages keeps them', () => {
  it('currentAge1/currentAge2 become birth years in migrateInputs', () => {
    const m = migrateInputs({ currentAge1: 50, currentAge2: 48, spouse2Enabled: true });
    expect(m.birthYear1).toBe(TAX_YEAR - 50);
    expect(m.birthYear2).toBe(TAX_YEAR - 48);
    // A plan that already has a birth year is untouched.
    expect(migrateInputs({ currentAge1: 50, birthYear1: 1970 }).birthYear1).toBe(1970);
  });
});

describe('A24/A27: plan warnings', () => {
  it('a mortgage payment below its interest is flagged; an ordinary one is not', () => {
    const bad = runProjection(blank({ taxableInit: 1_000_000, mortgageBalance: 300_000, mortgageRate: 6, mortgagePayment: 12_000 }));
    expect(bad.warnings.map((w) => w.code)).toEqual(['mortgage-payment-below-interest']);
    const ok = runProjection(blank({ taxableInit: 1_000_000, mortgageBalance: 300_000, mortgageRate: 6, mortgagePayment: 24_000 }));
    expect(ok.warnings).toEqual([]);
  });
  it('a lump-sum pension whose start age has passed is flagged as already received', () => {
    const p = runProjection(blank({ taxableInit: 1_000_000, pension1: 20_000, pension1LumpSum: true, pension1LumpSumValue: 300_000, pensionStartAge1: 65 }));
    expect(p.warnings.map((w) => w.code)).toEqual(['pension1-lump-sum-already-paid']);
    expect(p.years.every((y) => (y.pension || 0) === 0)).toBe(true);
  });
});

describe('A25: an NQDC balance whose payout window already closed is paid', () => {
  it('pays the whole balance in the first plan year', () => {
    const p = runProjection(blank({
      taxableInit: 500_000, nqdcEnabled1: true, nqdcInit1: 100_000, nqdcGrowthRate1: 0,
      nqdcDistributionStartAge1: 60, nqdcDistributionYears1: 5,
    }));
    expect(p.years[0].nqdcDistribution1).toBeCloseTo(100_000, 2);
    expect(p.years[0].nqdcBalance1).toBe(0);
  });
});

describe('A26: a reverse mortgage first pays off the forward mortgage', () => {
  it('the payoff comes out of the lump sum and the forward payments stop', () => {
    const base = {
      taxableInit: 1_000_000, homeOwned: true, homeValueInit: 400_000, homeAppreciationRate: 0,
      reverseMortgageEnabled: true, reverseMortgageStartAge: 70, reverseMortgagePrincipalLimitPct: 50,
      reverseMortgagePayoutType: 'lumpSum', reverseMortgageRate: 0,
      mortgageRate: 5, mortgagePayment: 20_000,
    };
    const withLoan = runProjection(blank({ ...base, mortgageBalance: 80_000 })).years[0];
    const without = runProjection(blank({ ...base, mortgageBalance: 0 })).years[0];
    expect(withLoan.reverseMortgageForwardPayoff).toBeCloseTo(80_000, 2);
    expect(withLoan.reverseMortgagePayoutThisYear).toBeCloseTo(without.reverseMortgagePayoutThisYear - 80_000, 2);
    expect(withLoan.mortgageBalance).toBe(0);
    expect(withLoan.mortgagePaymentThisYear).toBe(0);
  });
});

describe('A30: the named stress scenarios replay history at the plan\'s own mix', () => {
  it('1929 at 60/40 blends that year\'s stock and bond returns and takes the table\'s CPI', () => {
    const p = runProjection(blank({
      taxableInit: 1_000_000, lifestyleExpense: 40_000, stockAllocationPost: 60,
      stressType: '1929', stressStartMode: 'specific', stressStartYear: 2026,
    }));
    const rows = [1929, 1930, 1931, 1932].map((y) => HISTORICAL_RETURNS.find((r) => r[0] === y));
    rows.forEach((row, i) => {
      expect(p.years[i].growthRate).toBeCloseTo(0.6 * row[1] + 0.4 * row[2], 6);
    });
    expect(p.years[4].growthRate).toBe(0); // the plan's own 0% after the window
    // The second year's spending moves by the table's 1930 CPI.
    expect(p.years[1].lifestyleMultiplier / p.years[0].lifestyleMultiplier).toBeCloseTo(1 + rows[1][3] / 100, 9);
    expect(Object.keys(NAMED_STRESS_SCENARIOS)).toEqual(['1929', '1966', '1973', '2000', '2008']);
  });
});

describe('B3: the RMD uses the prior year-end balance', () => {
  it('a contribution made this year does not raise this year\'s RMD', () => {
    // Born 1950, still working at 76 with a Pre-Tax deferral: the deferral
    // lands this year and must not be in this year's RMD base.
    const base = { birthYear1: 1950, retireAge1: 78, lifeExpectancy1: 80, salary1: 100_000, preTaxInit: 500_000 };
    const withDeferral = runProjection(blank({ ...base, preTaxContribution1: 20_000 })).years[0];
    const without = runProjection(blank(base)).years[0];
    expect(withDeferral.rmdAmount).toBeCloseTo(without.rmdAmount, 6);
    expect(without.rmdAmount).toBeGreaterThan(0);
  });
});
