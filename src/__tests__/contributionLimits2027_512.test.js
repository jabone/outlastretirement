// Changelog 512: the IRS's 2027 contribution and QCD limits (Notice 2026-66)
// are kept by year. A projection year uses the newest published table at or
// before it, exactly in that table's year, and carried by the plan's
// statutory inflation after it.
import { describe, it, expect } from 'vitest';
import {
  runProjection, DEFAULT_INPUTS, TAX_YEAR, QCD_LIMIT_2026,
  CONTRIBUTION_LIMIT_TABLES, contributionLimitTableYear,
  ELECTIVE_DEFERRAL_LIMIT_2026, CATCHUP_50_2026, CATCHUP_60_63_2026, ANNUAL_ADDITIONS_LIMIT_2026,
  IRA_LIMIT_2026, IRA_CATCHUP_50_2026, MANDATORY_ROTH_CATCHUP_WAGE_THRESHOLD_2026,
  ROTH_IRA_PHASEOUT_MFJ, ROTH_IRA_PHASEOUT_SINGLE,
  getElectiveDeferralLimit, getIRAContributionLimit, getMaxContributionSplit,
  HSA_LIMIT_SELF_2026, HSA_LIMIT_FAMILY_2026, getHSAContributionLimit, getContributionAdvisory, contributionLimitsForYear,
} from '../calculator';

const START = DEFAULT_INPUTS.planYear;
const g = 1 + DEFAULT_INPUTS.inflationRate / 100;

// A single worker who stays at work well past 2028, saving the most allowed.
const worker = (birthYear, extra = {}) => ({
  ...DEFAULT_INPUTS,
  spouse2Enabled: false,
  birthYear1: birthYear,
  retireAge1: 67,
  salary1: 90000,
  // No Roth entered, so 401(k) mode is all Pre-Tax (changelog 513 keeps an
  // entered Roth amount inside the limit).
  rothContribution1: 0,
  ...extra,
});
const rowFor = (proj, year) => proj.years.find((y) => y.year === year);

describe('the limit tables', () => {
  it('2026 is the figures the app already used', () => {
    const t = CONTRIBUTION_LIMIT_TABLES[2026];
    expect(t.deferral).toBe(ELECTIVE_DEFERRAL_LIMIT_2026);
    expect(t.catchup50).toBe(CATCHUP_50_2026);
    expect(t.catchup60to63).toBe(CATCHUP_60_63_2026);
    expect(t.annualAdditions).toBe(ANNUAL_ADDITIONS_LIMIT_2026);
    expect(t.ira).toBe(IRA_LIMIT_2026);
    expect(t.iraCatchup50).toBe(IRA_CATCHUP_50_2026);
    expect(t.rothCatchupWage).toBe(MANDATORY_ROTH_CATCHUP_WAGE_THRESHOLD_2026);
    expect(t.rothIraMFJ).toEqual(ROTH_IRA_PHASEOUT_MFJ);
    expect(t.rothIraSingle).toEqual(ROTH_IRA_PHASEOUT_SINGLE);
    expect(t.qcd).toBe(QCD_LIMIT_2026);
    expect(t.hsaSelf).toBe(HSA_LIMIT_SELF_2026);
    expect(t.hsaFamily).toBe(HSA_LIMIT_FAMILY_2026);
  });

  it('2027 is IRS Notice 2026-66', () => {
    expect(CONTRIBUTION_LIMIT_TABLES[2027]).toEqual({
      deferral: 25500, catchup50: 8500, catchup60to63: 11750, annualAdditions: 75000,
      ira: 7500, iraCatchup50: 1100, rothCatchupWage: 155000,
      rothIraMFJ: [250000, 260000], rothIraSingle: [158000, 173000], qcd: 114000,
      hsaSelf: 4500, hsaFamily: 9000,
    });
  });

  it('a year uses the newest table at or before it', () => {
    expect(contributionLimitTableYear(2020)).toBe(2026);
    expect(contributionLimitTableYear(2026)).toBe(2026);
    expect(contributionLimitTableYear(2027)).toBe(2027);
    expect(contributionLimitTableYear(2040)).toBe(2027);
  });

  it('the current-year helpers still read this tax year by default', () => {
    expect(TAX_YEAR).toBe(2026);
    expect(getElectiveDeferralLimit(45)).toBe(24500);
    expect(getElectiveDeferralLimit(55)).toBe(32500);
    expect(getElectiveDeferralLimit(61)).toBe(35750);
    expect(getIRAContributionLimit(55)).toBe(8600);
    const t = CONTRIBUTION_LIMIT_TABLES[2027];
    expect(getElectiveDeferralLimit(45, t)).toBe(25500);
    expect(getElectiveDeferralLimit(55, t)).toBe(34000);
    expect(getElectiveDeferralLimit(61, t)).toBe(37250);
    expect(getElectiveDeferralLimit(64, t)).toBe(34000);
    expect(getIRAContributionLimit(45, t)).toBe(7500);
    expect(getIRAContributionLimit(55, t)).toBe(8600);
  });

  it('the Roth catch-up wage test uses the table’s own threshold', () => {
    const t = CONTRIBUTION_LIMIT_TABLES[2027];
    // $152,000 is over 2026's $150,000 but under 2027's $155,000.
    expect(getMaxContributionSplit(55, 152000).mandatoryRothCatchup).toBe(true);
    expect(getMaxContributionSplit(55, 152000, 1, t)).toEqual({ preTax: 34000, roth: 0, mandatoryRothCatchup: false });
    expect(getMaxContributionSplit(55, 160000, 1, t)).toEqual({ preTax: 25500, roth: 8500, mandatoryRothCatchup: true });
  });
});

describe('in the projection', () => {
  it('2026 is unchanged, 2027 is exact, and later years grow from 2027', () => {
    const proj = runProjection(worker(START - 45, { autoMaxContribution1: '401k' }));
    expect(rowFor(proj, 2026).preTaxContribution1).toBeCloseTo(24500, 6);
    expect(rowFor(proj, 2027).preTaxContribution1).toBeCloseTo(25500, 6);
    expect(rowFor(proj, 2028).preTaxContribution1).toBeCloseTo(25500 * g, 6);
    expect(rowFor(proj, 2030).preTaxContribution1).toBeCloseTo(25500 * g ** 3, 6);
  });

  it('catch-ups: 50+ and 60 to 63, in 2027', () => {
    const at55 = runProjection(worker(2027 - 55, { autoMaxContribution1: '401k' }));
    expect(rowFor(at55, 2027).preTaxContribution1).toBeCloseTo(34000, 6);
    const at61 = runProjection(worker(2027 - 61, { autoMaxContribution1: '401k' }));
    expect(rowFor(at61, 2027).preTaxContribution1).toBeCloseTo(37250, 6);
  });

  it('IRA mode and the backdoor IRA in max mode use the 2027 IRA limit', () => {
    const ira = runProjection(worker(2027 - 55, { autoMaxContribution1: 'ira' }));
    expect(rowFor(ira, 2027).preTaxContribution1).toBeCloseTo(8600, 6);
    expect(rowFor(ira, 2028).preTaxContribution1).toBeCloseTo(8600 * g, 6);
    const max = runProjection(worker(2027 - 45, { autoMaxContribution1: 'max' }));
    expect(rowFor(max, 2027).backdoorRothContribution).toBeCloseTo(7500, 6);
  });

  it('above $155,000 of wages the 2027 catch-up goes in as Roth', () => {
    // Pay is grown by inflation, so $152,000 / g of 2026 pay is $152,000
    // of 2027 wages: over 2026's $150,000, under 2027's $155,000.
    const base = { autoMaxContribution1: 'max' };
    const under = runProjection(worker(2027 - 55, { ...base, salary1: 152000 / g }));
    const r = rowFor(under, 2027);
    expect(r.preTaxContribution1 + r.rothContribution1).toBeCloseTo(34000, 6);
    expect(r.rothContribution1).toBeCloseTo(0, 6);
    const over = runProjection(worker(2027 - 55, { ...base, salary1: 200000 }));
    const o = rowFor(over, 2027);
    expect(o.preTaxContribution1).toBeCloseTo(25500, 6);
    expect(o.rothContribution1).toBeCloseTo(8500, 6);
  });

  it('a percent match capped at the IRS limit follows the 2027 limit', () => {
    const plan = worker(START - 45, {
      autoMaxContribution1: '401k', employerMatchMode1: 'percent', employerMatchRateA1: 50, employerMatchCapAPct1: 100, employerMatchCapPayPct1: 0,
    });
    const proj = runProjection(plan);
    expect(rowFor(proj, 2027).employerMatchAmount).toBeCloseTo(12750, 6);
  });

  it('a plan that starts in 2027 uses the 2027 limits in its first year', () => {
    const proj = runProjection(worker(2027 - 45, { planYear: 2027, autoMaxContribution1: '401k' }));
    expect(proj.years[0].year).toBe(2027);
    expect(proj.years[0].preTaxContribution1).toBeCloseTo(25500, 6);
    expect(rowFor(proj, 2028).preTaxContribution1).toBeCloseTo(25500 * g, 6);
  });

  it('the QCD limit is $114,000 in 2027', () => {
    const giver = {
      ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: 2027 - 75, retireAge1: 65, salary1: 0,
      preTaxInit: 3000000, qcdAnnualAmount: 500000,
    };
    const proj = runProjection(giver);
    expect(rowFor(proj, 2026).qcdAmount).toBeCloseTo(111000, 0);
    expect(rowFor(proj, 2027).qcdAmount).toBeCloseTo(114000, 0);
    expect(rowFor(proj, 2028).qcdAmount).toBeCloseTo(114000 * g, 0);
  });
});

describe('HSA limits', () => {
  it('max mode puts in the 2027 HSA limit in 2027', () => {
    const fam = runProjection(worker(START - 45, { autoMaxContribution1: 'max', hsaFamilyCoverage: true }));
    expect(rowFor(fam, 2026).hsaContribution).toBeCloseTo(8750, 6);
    expect(rowFor(fam, 2027).hsaContribution).toBeCloseTo(9000, 6);
    expect(rowFor(fam, 2028).hsaContribution).toBeCloseTo(9000 * g, 6);
    expect(getHSAContributionLimit(56, false, 1, contributionLimitsForYear(2027))).toBe(5500);
  });
});

describe('the contribution checks read the plan\u2019s first year', () => {
  it('a plan starting in 2027 is checked against the 2027 limits', () => {
    const plan = worker(2027 - 55, { planYear: 2027, preTaxContribution1: 30000, rothContribution1: 0 });
    const a = getContributionAdvisory(plan);
    expect(a.year).toBe(2027);
    expect(a.spouse1.deferralLimit).toBe(34000);
    expect(a.annualAdditionsLimit).toBe(75000);
    expect(a.rothIra.phaseFloor).toBe(plan.filingStatus === 'MFJ' ? 250000 : 158000);
    const now = getContributionAdvisory(worker(START - 55, { preTaxContribution1: 30000 }));
    expect(now.year).toBe(2026);
    expect(now.spouse1.deferralLimit).toBe(32500);
  });
});
