import { describe, it, expect } from 'vitest';
import { computeRetirementFunding, computeRetirementRoadmap, projectDividendIncome, findSocialSecurityFull } from '../utils/retirementFunding.js';
import { runProjection, DEFAULT_INPUTS } from '../calculator.js';

describe('computeRetirementFunding', () => {
  const proj = runProjection({ ...DEFAULT_INPUTS, taxableInit: 400000 });
  const funding = computeRetirementFunding(proj, 12000, { dividendGrowthRate: 0 });

  it('carries the plan verdict and one row per retired year, from the engine\'s own fields', () => {
    expect(funding.isSuccessful).toBe(proj.isSuccessful);
    const retiredRows = proj.years.filter((y) => y.isRetired);
    expect(funding.rows).toHaveLength(retiredRows.length);
    const r = funding.rows[0]; const y = retiredRows[0];
    expect(r.year).toBe(y.year);
    expect(r.spending).toBe(y.totalExpenses);
    expect(r.guaranteed).toBeCloseTo(y.ssIncome + y.pension + y.annuityPayout, 6);
    expect(r.withdrawals).toBeCloseTo(y.drawdown, 6);
  });

  it('splits withdrawals into dividends-as-cash and share sales without inventing income', () => {
    for (const r of funding.rows) {
      expect(r.dividendsAsCash + r.shareSales).toBeCloseTo(r.neededFromPortfolio, 3);
      expect(r.neededFromPortfolio + r.forcedSurplus).toBeCloseTo(r.withdrawals, 3);
      expect(r.dividendsAsCash).toBeLessThanOrEqual(r.dividends + 1e-9);
    }
  });

  it('dividends that exceed the plan\'s withdrawals do not count as extra spending cover', () => {
    const rich = computeRetirementFunding(proj, 10_000_000, { dividendGrowthRate: 0 });
    const r = rich.rows[0];
    expect(r.dividendsAsCash).toBeCloseTo(r.neededFromPortfolio, 3);
    expect(r.shareSales).toBe(0);
    expect(r.incomePct).toBeLessThanOrEqual(100.000001);
  });

  it('grows dividends nominally or net of inflation depending on the display basis', () => {
    expect(projectDividendIncome(1000, 10, { dividendGrowthRate: 5 })).toBeCloseTo(1000 * 1.05 ** 10, 6);
    expect(projectDividendIncome(1000, 10, { dividendGrowthRate: 5, inflationRate: 2.5, realDollars: true })).toBeCloseTo(1000 * (1.05 / 1.025) ** 10, 6);
  });
});

describe('computeRetirementRoadmap', () => {
  const proj = runProjection(DEFAULT_INPUTS);
  const funding = computeRetirementFunding(proj, 5000, { dividendGrowthRate: 5 });
  const holdings = [
    { id: 'a', symbol: 'SCHD', taxTreatment: 'taxable', dripEnabled: true, shares: 100, annualDividendPerShare: 1 },
    { id: 'b', symbol: 'VOO', taxTreatment: 'preTax', dripEnabled: true, shares: 10, annualDividendPerShare: 6 },
    { id: 'c', symbol: 'O', taxTreatment: 'taxable', dripEnabled: false, shares: 100, annualDividendPerShare: 3 },
    { id: 'd', symbol: 'GROWTH', taxTreatment: 'taxable', dripEnabled: false, shares: 100, annualDividendPerShare: 0 }, // pays nothing: no DRIP advice
  ];

  it('while working: keep DRIP on, suggest turning it on where it is off, and flip Taxable DRIP to cash at retirement', () => {
    const rm = computeRetirementRoadmap({ holdings, funding, inputs: DEFAULT_INPUTS, yearsToRetirement: 21, dividendTotals: { drip: 4000, cash: 1000 } });
    expect(rm.retired).toBe(false);
    expect(rm.step1.bullets.map((b) => b.kind)).toEqual(['keepDrip', 'turnOnDrip', 'noTrim']);
    expect(rm.step1.bullets[1].symbols).toEqual(['O']);
    expect(rm.step1.bullets.some((b) => /stop drip/i.test(b.text))).toBe(false);
    expect(rm.step2.bullets[0].kind).toBe('flipDrip');
    expect(rm.step2.bullets[0].text).toMatch(/3 Taxable holdings/);
    expect(rm.step2.bullets[1].text).toMatch(/Social Security at 67/);
    expect(rm.step3.bullets[0].text).toMatch(/Taxable → Pre-Tax → Roth/);
    expect(rm.step3.bullets.at(-1).text).toMatch(proj.isSuccessful ? /last through the end of your plan/ : /Runs short/);
  });

  it('already retired: take dividends in cash now instead of "keep compounding"', () => {
    const rm = computeRetirementRoadmap({ holdings, funding, inputs: DEFAULT_INPUTS, yearsToRetirement: 0 });
    expect(rm.retired).toBe(true);
    expect(rm.step1.bullets[0].kind).toBe('dripToCash');
    expect(rm.step2.bullets[0].kind).toBe('guaranteed');
  });

  it('cites the largest real overweight position from the rebalance plan', () => {
    const rebalancePlan = { rows: [{ id: 'a', action: 'sell', diffDollars: -1500 }, { id: 'c', action: 'sell', diffDollars: -9000 }] };
    const rm = computeRetirementRoadmap({ holdings, funding, inputs: DEFAULT_INPUTS, rebalancePlan, yearsToRetirement: 5 });
    const trim = rm.step1.bullets.find((b) => b.kind === 'trim');
    expect(trim.symbol).toBe('O');
    expect(trim.amountDollars).toBe(9000);
  });
});

import { compareSsClaimingAges } from '../utils/retirementFunding.js';

describe('compareSsClaimingAges', () => {
  const inputs = { ...DEFAULT_INPUTS, retireAge1: 62, claimingAge1: 67 };
  const cmp = compareSsClaimingAges(inputs, { runProjection });

  it('runs the plan for 62 / 65 / 67 / 70 (plus the current choice), marking the current one', () => {
    expect(cmp.rows.map((r) => r.age)).toEqual([62, 65, 67, 70]);
    expect(cmp.rows.find((r) => r.isCurrent).age).toBe(67);
    expect(cmp.current).toBe(67);
  });

  it('a later claim means a larger monthly benefit, a longer bridge with more portfolio withdrawals, and a break-even age in the late 70s / early 80s', () => {
    const by = Object.fromEntries(cmp.rows.map((r) => [r.age, r]));
    expect(by[70].monthlyBenefit).toBeGreaterThan(by[67].monthlyBenefit);
    expect(by[67].monthlyBenefit).toBeGreaterThan(by[62].monthlyBenefit);
    expect(by[62].bridgeYears).toBe(0);
    expect(by[70].bridgeYears).toBe(8);
    expect(by[70].bridgeWithdrawals).toBeGreaterThan(by[62].bridgeWithdrawals);
    expect(by[70].extraBridgeVsCurrent).toBeGreaterThan(0);
    expect(by[67].extraBridgeVsCurrent).toBe(0);
    expect(cmp.breakEven).toBeGreaterThanOrEqual(76);
    expect(cmp.breakEven).toBeLessThanOrEqual(84);
  });

  it('reports each variant\'s verdict and ending balance, and which one ends highest', () => {
    for (const r of cmp.rows) expect(typeof r.isSuccessful).toBe('boolean');
    expect(cmp.rows.filter((r) => r.isBestEnding)).toHaveLength(1);
    expect(cmp.bestEnding).toBe(cmp.rows.find((r) => r.isBestEnding).age);
  });

  it('for a couple whose other spouse claims first, each row still reports THIS spouse\'s own benefit and bridge (changelog 293)', () => {
    // the owner's shape: spouse 2 is three years older and claims at 67 before
    // spouse 1 does. The household total used to start with spouse 2's
    // check in every row, so 65, 67 and 70 all showed the same monthly
    // benefit and a one-year bridge.
    const couple = {
      ...DEFAULT_INPUTS, spouse2Enabled: true,
      birthYear1: 1968, birthYear2: 1965, retireAge1: 63, retireAge2: 65,
      claimingAge1: 67, claimingAge2: 67, ss1: 55000, ss2: 25000,
      ssSpousalEnabled1: false, ssSpousalEnabled2: false,
    };
    const c = compareSsClaimingAges(couple, { runProjection });
    const by = Object.fromEntries(c.rows.map((r) => [r.age, r]));
    expect(by[65].firstBenefitYear).toBe(1968 + 65);
    expect(by[67].firstBenefitYear).toBe(1968 + 67);
    expect(by[70].firstBenefitYear).toBe(1968 + 70);
    expect(by[70].monthlyBenefit).toBeGreaterThan(by[67].monthlyBenefit);
    expect(by[67].monthlyBenefit).toBeGreaterThan(by[65].monthlyBenefit);
    // Own benefit, not the household's: about ss1/12 at full retirement age.
    expect(by[67].monthlyBenefit).toBeGreaterThan(55000 / 12 * 0.95);
    expect(by[67].bridgeYears).toBe(4);
    expect(by[70].bridgeYears).toBe(7);
    expect(by[70].bridgeWithdrawals).toBeGreaterThan(by[67].bridgeWithdrawals);
  });

  it('deflates to today\'s dollars when asked', () => {
    const real = compareSsClaimingAges(inputs, { runProjection, realDollars: true });
    const nominal = cmp;
    const r70 = real.rows.find((r) => r.age === 70); const n70 = nominal.rows.find((r) => r.age === 70);
    expect(r70.monthlyBenefit).toBeLessThan(n70.monthlyBenefit);
    expect(r70.lifetimeSs).toBeLessThan(n70.lifetimeSs);
  });
});

describe('computeRetirementFunding — RMDs beyond spending', () => {
  it('counts only the withdrawals spending consumes as funding; the rest is a forced surplus that is never stacked as spent', () => {
    // A large pre-tax balance makes RMDs exceed spending late in the plan.
    const proj = runProjection({ ...DEFAULT_INPUTS, preTaxInit: 3_000_000 });
    const funding = computeRetirementFunding(proj, 0, { dividendGrowthRate: 0 });
    const surplusRows = funding.rows.filter((r) => r.forcedSurplus > 0);
    expect(surplusRows.length).toBeGreaterThan(0);
    for (const r of funding.rows) {
      expect(r.neededFromPortfolio + r.forcedSurplus).toBeCloseTo(r.withdrawals, 3);
      expect(r.guaranteed + r.otherIncome + r.neededFromPortfolio).toBeLessThanOrEqual(r.spending + 1);
      expect(r.dividendsAsCash + r.shareSales).toBeCloseTo(r.neededFromPortfolio, 3);
    }
    expect(surplusRows[0].rmd).toBeGreaterThan(0);
    const rm = computeRetirementRoadmap({ holdings: [], funding, inputs: DEFAULT_INPUTS, yearsToRetirement: 21 });
    expect(rm.step3.bullets.some((b) => b.kind === 'rmdSurplus')).toBe(true);
  });
});


describe('Social Security, named on its own', () => {
  // Retire at 62, claim at 67: five retired years with no Social Security,
  // then the benefit starts. The single "Guaranteed income" band hid that.
  const proj = runProjection({ ...DEFAULT_INPUTS, retireAge1: 62, claimingAge1: 67, taxableInit: 900000 });
  const funding = computeRetirementFunding(proj, 12000, { dividendGrowthRate: 0 });

  it('splits guaranteed income into Social Security and pensions/annuities, summing to the whole', () => {
    const retired = proj.years.filter((y) => y.isRetired);
    funding.rows.forEach((r, i) => {
      expect(r.socialSecurity).toBeCloseTo(retired[i].ssIncome, 6);
      expect(r.pensions).toBeCloseTo(retired[i].pension + retired[i].annuityPayout, 6);
      expect(r.socialSecurity + r.pensions).toBeCloseTo(r.guaranteed, 6);
    });
  });

  it('names the year Social Security reaches its full level when that is after retirement', () => {
    const claimRow = funding.rows.find((r) => r.age1 === 67);
    expect(funding.rows[0].socialSecurity).toBe(0);
    expect(claimRow.socialSecurity).toBeGreaterThan(0);
    expect(funding.socialSecurityFull).toMatchObject({ year: claimRow.year, age1: 67 });
  });

  it('says nothing when Social Security is already at its full level at retirement', () => {
    const flat = [{ year: 2031, age1: 67, socialSecurity: 30000 }, { year: 2032, age1: 68, socialSecurity: 30900 }, { year: 2033, age1: 69, socialSecurity: 31827 }];
    expect(findSocialSecurityFull(flat)).toBeNull();
  });

  it('takes the LAST step when a spouse claims later', () => {
    const rows = [{ year: 2031, age1: 62, socialSecurity: 0 }, { year: 2032, age1: 63, socialSecurity: 20000 }, { year: 2033, age1: 64, socialSecurity: 20600 }, { year: 2034, age1: 65, socialSecurity: 45000 }];
    expect(findSocialSecurityFull(rows)).toMatchObject({ year: 2034 });
  });
});
