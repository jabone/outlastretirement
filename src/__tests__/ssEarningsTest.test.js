// Social Security Retirement Earnings Test -- 42 U.S.C. 403(b)/(f).
// Exempt amounts verified 2026-09-14 against ssa.gov/oact/cola/rtea.html:
// $24,480 under FRA, $65,160 in the year FRA is attained (2026).
//
// WHAT WAS WRONG BEFORE. The plan paid every claimed benefit in full no
// matter how much the household earned. Claim at 62 and keep working and it
// showed income that would not arrive -- the largest overstatement the
// engine could still produce for an ordinary plan.
//
// THE HALF THAT IS EASY TO GET WRONG. The test is not a penalty. Social
// Security recomputes the benefit at FRA "to give you credit for the months
// we reduced or withheld benefits", so withheld months come back as a
// permanently higher benefit. A model with the withholding and without the
// credit would be alarmist, and would push users away from a claiming age
// that may suit them. Both halves are asserted here.
import { describe, it, expect } from 'vitest';
import {
  runProjection, DEFAULT_INPUTS,
  ssEarningsTestWithholding, ssEffectiveClaimingAge, getSSMultiplier,
  SS_EARNINGS_TEST_EXEMPT_UNDER_FRA, SS_ANNOUNCED, SS_EARNINGS_TEST_EXEMPT_FRA_YEAR,
} from '../calculator';

describe('the withholding arithmetic, straight from the statute', () => {
  it('withholds $1 for every $2 above the lower exempt amount', () => {
    // $50,000 earned, $24,480 exempt -> $25,520 excess -> $12,760 withheld.
    const r = ssEarningsTestWithholding(50000, 21000, 63, 67, 1);
    expect(r.withheld).toBeCloseTo((50000 - SS_EARNINGS_TEST_EXEMPT_UNDER_FRA) / 2, 6);
    expect(r.withheld).toBeCloseTo(12760, 6);
    expect(r.inFraYear).toBe(false);
  });

  it('withholds $1 for every $3 above the higher amount in the FRA year', () => {
    const r = ssEarningsTestWithholding(100000, 30000, 67, 67.5, 1);
    expect(r.inFraYear).toBe(true);
    expect(r.withheld).toBeCloseTo((100000 - SS_EARNINGS_TEST_EXEMPT_FRA_YEAR) / 3, 6);
  });

  it('stops entirely after the year of full retirement age, however large the earnings', () => {
    expect(ssEarningsTestWithholding(500000, 30000, 68, 67).withheld).toBe(0);
    expect(ssEarningsTestWithholding(500000, 30000, 75, 67).withheld).toBe(0);
    expect(ssEarningsTestWithholding(500000, 30000, 67, 66.5).withheld).toBe(0);
  });

  it('tests the calendar year FRA is reached even when FRA is a whole age (born 1960+)', () => {
    // FRA 67: the year the worker turns 67 is the FRA year, $1 per $3 above
    // the higher amount. The age >= fra exit used to skip it entirely.
    const r = ssEarningsTestWithholding(100000, 30000, 67, 67, 1);
    expect(r.inFraYear).toBe(true);
    expect(r.withheld).toBeCloseTo((100000 - SS_EARNINGS_TEST_EXEMPT_FRA_YEAR) / 3, 6);
  });

  it('earnings at or below the exempt amount withhold nothing', () => {
    expect(ssEarningsTestWithholding(SS_EARNINGS_TEST_EXEMPT_UNDER_FRA, 21000, 63, 67).withheld).toBe(0);
  });

  it('never withholds more than the benefit itself', () => {
    // Enormous earnings against a small benefit: capped at the benefit, and
    // therefore at twelve months.
    const r = ssEarningsTestWithholding(5000000, 21000, 63, 67, 1);
    expect(r.withheld).toBeCloseTo(21000, 6);
    expect(r.monthsWithheld).toBeCloseTo(12, 6);
  });

  it('indexes both exempt amounts, so a distant year is not tested against 2026 dollars', () => {
    const flat = ssEarningsTestWithholding(50000, 21000, 63, 67, 1).withheld;
    const indexed = ssEarningsTestWithholding(50000, 21000, 63, 67, 2).withheld;
    expect(indexed).toBeLessThan(flat);
    expect(indexed).toBeCloseTo((50000 - SS_EARNINGS_TEST_EXEMPT_UNDER_FRA * 2) / 2, 6);
  });
});

describe('the FRA credit, which is what stops this being a penalty', () => {
  it('prices the benefit as if the claim had been made that many months later', () => {
    expect(ssEffectiveClaimingAge(62, 12, 67)).toBeCloseTo(63, 6);
    expect(ssEffectiveClaimingAge(62, 18, 67)).toBeCloseTo(63.5, 6);
  });

  it('is capped at FRA -- the credit can undo an early claim, never earn delayed credits', () => {
    expect(ssEffectiveClaimingAge(62, 120, 67)).toBeCloseTo(67, 6);
    expect(getSSMultiplier(ssEffectiveClaimingAge(62, 120, 67), 67)).toBeCloseTo(1.0, 6);
  });

  it('does nothing when nothing was withheld', () => {
    expect(ssEffectiveClaimingAge(62, 0, 67)).toBe(62);
  });
});

// ---------------------------------------------------------------------------
// End to end, against a real projection.
// ---------------------------------------------------------------------------

// Single filer who claims at 62 and keeps a $50,000 part-time job to 67.
// Nothing is inflated, so every year is tested against the 2026 amounts and
// the arithmetic above can be checked by hand.
const WORKS_WHILE_CLAIMING = {
  ...DEFAULT_INPUTS,
  planYear: 2026,
  spouse2Enabled: false,
  filingStatus: 'Single',
  birthYear1: 1964,          // 62 in 2026, FRA 67
  retireAge1: 62,
  lifeExpectancy1: 90,
  claimingAge1: 62,
  ss1: 30000,
  salary1: 0,
  partTimeIncome1: 50000,
  partTimeIncomeEndAge1: 67,
  pension1: 0,
  preTaxInit: 500000, rothInit: 0, taxableInit: 500000, hsaInit: 0,
  lifestyleExpense: 55000,
  stateTaxState: 'none',
  inflationRate: 0, taxBracketInflationRate: 0, ssCOLA: 0,
  medicarePartBInflationRate: 0, medicarePartDInflationRate: 0, medicalInflationRate: 0,
};

const at = (res, age) => res.years.find(y => y.age1 === age);

describe('the fixture is real', () => {
  it('uses only input keys the engine actually reads', () => {
    expect(Object.keys(WORKS_WHILE_CLAIMING).filter(k => !(k in DEFAULT_INPUTS))).toEqual([]);
  });
});

describe('end to end: claiming at 62 while earning $50,000', () => {
  const res = runProjection(WORKS_WHILE_CLAIMING);

  it('withholds benefit in every year before FRA, and the ledger says how much', () => {
    let yearsWithheld = 0;
    for (let age = 62; age <= 66; age++) {
      const row = at(res, age);
      if (row.ssEarningsTestWithheld > 0) yearsWithheld += 1;
    }
    // Counting the hits rather than asserting inside the loop: an empty
    // range would otherwise pass having checked nothing (DEVELOPMENT.md).
    expect(yearsWithheld).toBe(5);
  });

  it('withholds exactly $1 per $2 over the threshold, capped at the benefit', () => {
    const row = at(res, 63);
    const benefit = 30000 * getSSMultiplier(62, 67);
    // Age 63 is 2027: SSA's announced exempt amount for that year (changelog 410).
    const expected = Math.min(benefit, (50000 - SS_ANNOUNCED[2027].earningsTestUnderFra) / 2);
    expect(row.ssEarningsTestWithheld).toBeCloseTo(expected, 2);
  });

  it('the benefit actually received is net of it', () => {
    const row = at(res, 63);
    const grossBenefit = 30000 * getSSMultiplier(62, 67);
    expect(row.ssIncome).toBeCloseTo(grossBenefit - row.ssEarningsTestWithheld, 2);
    expect(row.ssIncome).toBeLessThan(grossBenefit);
  });

  it('stops the year FRA is reached, and nothing is withheld after', () => {
    expect(at(res, 67).ssEarningsTestWithheld).toBe(0);
    expect(at(res, 70).ssEarningsTestWithheld).toBe(0);
  });

  it('pays a PERMANENTLY HIGHER benefit from FRA, because the months come back', () => {
    const before = at(res, 66).ssIncome;   // reduced 62-claim benefit, net of withholding
    const after = at(res, 68).ssIncome;    // recomputed at FRA
    expect(after).toBeGreaterThan(before);
    // And higher than the un-credited 62 benefit too -- this is the part a
    // withholding-only model gets wrong.
    expect(after).toBeGreaterThan(30000 * getSSMultiplier(62, 67));
  });

  it('the credited months match the withholding actually suffered', () => {
    const finalRow = at(res, 70);
    const months = finalRow.ssEarningsTestCreditMonths1;
    expect(months).toBeGreaterThan(0);
    const effectiveAge = ssEffectiveClaimingAge(62, months, 67);
    expect(at(res, 68).ssIncome).toBeCloseTo(30000 * getSSMultiplier(effectiveAge, 67), 2);
  });
});

describe('the test reaches earned income only', () => {
  it('a retiree with no wages is untouched, however large the withdrawals', () => {
    // Same claim age, no job, living on a big Pre-Tax draw. IRA withdrawals
    // are NOT earnings -- SSA is explicit -- so nothing may be withheld.
    const noJob = {
      ...WORKS_WHILE_CLAIMING,
      partTimeIncome1: 0, preTaxInit: 3000000, lifestyleExpense: 150000,
      withdrawalStrategy: 'PreTaxFirst',
    };
    const res = runProjection(noJob);
    const withheldYears = res.years.filter(y => (y.ssEarningsTestWithheld || 0) > 0);
    expect(withheldYears).toHaveLength(0);
    expect(at(res, 63).drawPreTax).toBeGreaterThan(100000);
  });

  it('a pension is not earnings either', () => {
    const pensioner = { ...WORKS_WHILE_CLAIMING, partTimeIncome1: 0, pension1: 90000, pensionStartAge1: 62 };
    const res = runProjection(pensioner);
    expect(res.years.filter(y => (y.ssEarningsTestWithheld || 0) > 0)).toHaveLength(0);
  });

  it('a deferred-comp distribution is not earnings, though it rides in `salary`', () => {
    // The engine folds NQDC distributions into its `salary` variable before
    // the earnings test runs, so passing `salary` instead of the per-spouse
    // FICA wage figure would silently treat deferred comp as wages. It is
    // not: SSA's special-payment rule treats money earned in earlier years
    // and paid after retiring as belonging to those years, not this one.
    // This is the test that makes the ficaWages/salary distinction
    // load-bearing rather than a claim in a comment.
    const deferredComp = {
      ...WORKS_WHILE_CLAIMING,
      partTimeIncome1: 0,
      nqdcEnabled1: true,
      nqdcInit1: 600000,            // already accrued before the plan starts
      nqdcDeferralAmount1: 0,
      nqdcGrowthRate1: 0,
      nqdcDistributionStartAge1: 63,
      nqdcDistributionYears1: 3,
    };
    const res = runProjection(deferredComp);
    // Prove the distributions actually happen and are large enough to have
    // blown past the exempt amount had they been treated as wages --
    // otherwise this test passes having checked nothing.
    const distYears = res.years.filter(y => (y.nqdcDistribution1 || 0) > 0);
    expect(distYears).toHaveLength(3);
    expect(distYears[0].nqdcDistribution1).toBeGreaterThan(SS_EARNINGS_TEST_EXEMPT_UNDER_FRA * 2);
    expect(res.years.filter(y => (y.ssEarningsTestWithheld || 0) > 0)).toHaveLength(0);
  });

  it('claiming AT FRA is never touched, whatever the job pays', () => {
    const claimsAtFra = { ...WORKS_WHILE_CLAIMING, claimingAge1: 67, partTimeIncome1: 200000, partTimeIncomeEndAge1: 72 };
    const res = runProjection(claimsAtFra);
    expect(res.years.filter(y => (y.ssEarningsTestWithheld || 0) > 0)).toHaveLength(0);
  });
});
