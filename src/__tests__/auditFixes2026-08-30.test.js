// Regression tests for the August 30, 2026 second external logic audit
// (changelog 104). Six findings, five confirmed (one of them for two of
// its three claimed states); each block pins one so it can't come back.
import { describe, it, expect } from 'vitest';
import {
  runProjection,
  calculateHeirEstateTax,
  calculateStateEstateInheritanceTax,
  calculateFederalEstateTax,
  federal2011StateDeathTaxCredit,
} from '../calculator';
// The reference household (the pre-467 default plan): see referenceHousehold.js.
import { REFERENCE_INPUTS as DEFAULT_INPUTS } from './referenceHousehold';

// Couple where Spouse 1 dies at 80 and Spouse 2 lives to 95.
const WIDOW_PLAN = {
  ...DEFAULT_INPUTS,
  spouse2Enabled: true,
  filingStatus: 'MFJ',
  birthYear1: 1961, birthYear2: 1961,
  planYear: 2026,
  retireAge1: 65, retireAge2: 65,
  lifeExpectancy1: 80, lifeExpectancy2: 95,
  claimingAge1: 67, claimingAge2: 67,
  ss1: 0, ss2: 0,
  pension1: 0, pension2: 0, pension1COLA: 0,
  preTaxInit: 500000, rothInit: 0, taxableInit: 500000,
  lifestyleExpense: 60000,
  rothConversionStrategy: 'none',
  stateTaxState: 'none',
};

describe('F-1: life insurance pays exactly once, at the insured\'s death', () => {
  it('pays a self-owned policy to the survivor\'s Taxable in the year after the first death', () => {
    const p = runProjection({ ...WIDOW_PLAN, lifeInsuranceEnabled1: true, lifeInsuranceDeathBenefit1: 1000000, lifeInsuranceOwnership1: 'self' });
    const payoutYears = p.years.filter((y) => y.lifeInsurancePayoutToSurvivor > 0);
    expect(payoutYears).toHaveLength(1);
    const py = payoutYears[0];
    expect(py.spouse1Alive).toBe(false);
    expect(py.spouse2Alive).toBe(true);
    expect(py.lifeInsurancePayoutToSurvivor).toBeCloseTo(1000000, 2);
    // The taxable account jumps by the benefit (net of that year's flows).
    const prev = p.years[p.years.indexOf(py) - 1];
    expect(py.taxableEnd - prev.taxableEnd).toBeGreaterThan(700000);
    // The policy is gone: no death benefit remains for the estate.
    const last = p.years[p.years.length - 1];
    expect(last.lifeInsuranceNetDeathBenefit1).toBe(0);
    expect(last.lifeInsuranceNetCashValue).toBe(0);
  });
  it('the survivor\'s later years are richer than if the policy had never paid', () => {
    // Compare a few years after the payout (both plans can still deplete
    // by 95 with this spending level, which would hide the diff at the end).
    const withPolicy = runProjection({ ...WIDOW_PLAN, lifeInsuranceEnabled1: true, lifeInsuranceDeathBenefit1: 1000000, lifeInsuranceOwnership1: 'self' });
    const without = runProjection(WIDOW_PLAN);
    const at88 = (p) => p.years.find((y) => y.age2 === 88).totalPortfolioEnding;
    // The baseline depletes before 88, so the insured plan both funds the
    // spending the baseline couldn't AND still holds a large balance.
    expect(at88(without)).toBe(0);
    expect(at88(withPolicy)).toBeGreaterThan(500000);
  });
  it('a trust-owned (ILIT) policy freezes for the heirs instead of paying the survivor', () => {
    const p = runProjection({ ...WIDOW_PLAN, lifeInsuranceEnabled1: true, lifeInsuranceDeathBenefit1: 1000000, lifeInsuranceOwnership1: 'trust' });
    expect(p.years.every((y) => y.lifeInsurancePayoutToSurvivor === 0)).toBe(true);
    const last = p.years[p.years.length - 1];
    expect(last.lifeInsuranceNetDeathBenefit1).toBeCloseTo(1000000, 2);
  });
  it('a policy loan stops compounding once the insured is dead', () => {
    const p = runProjection({
      ...WIDOW_PLAN,
      lifeInsuranceEnabled1: true, lifeInsuranceDeathBenefit1: 1000000, lifeInsuranceOwnership1: 'trust',
      lifeInsuranceCashValueInit1: 200000, lifeInsuranceLoanBalance1: 50000, lifeInsuranceLoanRate1: 8,
    });
    const afterDeath = p.years.filter((y) => !y.spouse1Alive);
    const frozen = afterDeath[0].lifeInsuranceNetDeathBenefit1;
    for (const y of afterDeath) expect(y.lifeInsuranceNetDeathBenefit1).toBeCloseTo(frozen, 6);
  });
  it('a single-person plan still pays through the estate at plan end (no survivor to pay)', () => {
    const p = runProjection({ ...WIDOW_PLAN, spouse2Enabled: false, filingStatus: 'Single', lifeInsuranceEnabled1: true, lifeInsuranceDeathBenefit1: 1000000, lifeInsuranceOwnership1: 'self' });
    const last = p.years[p.years.length - 1];
    expect(last.lifeInsuranceNetDeathBenefit1).toBeCloseTo(1000000, 2);
    expect(p.years.every((y) => y.lifeInsurancePayoutToSurvivor === 0)).toBe(true);
  });
});

describe('F-2: HI and MD state portability; WA and MN stay single-exemption', () => {
  it('Maryland: married $9M estate is fully sheltered by $5M + $5M DSUE', () => {
    expect(calculateStateEstateInheritanceTax('MD', 9000000, 1, 'child', { married: true })).toBe(0);
  });
  it('Maryland: the same estate for a single decedent is taxed on the excess', () => {
    // Changelog 127 / audit Q-18(a): MD runs the pre-2001 s 2011 credit
    // table and subtracts the credit its exclusion buys, rather than a flat
    // 16% of the excess. Portability is still what this test is about --
    // the single decedent gets one $5,000,000 exclusion, not two.
    expect(calculateStateEstateInheritanceTax('MD', 9000000, 1, 'child', { married: false }))
      .toBeCloseTo(federal2011StateDeathTaxCredit(9000000) - federal2011StateDeathTaxCredit(5000000), 2);
  });
  it('Hawaii doubles for a married couple', () => {
    expect(calculateStateEstateInheritanceTax('HI', 10000000, 1, 'child', { married: true })).toBe(0);
    expect(calculateStateEstateInheritanceTax('HI', 10000000, 1, 'child', {})).toBeCloseTo((10000000 - 5490000) * 0.20, 2);
  });
  it('Washington and Minnesota do NOT double (no portability there)', () => {
    // One $3,000,000 exclusion; the $6M taxable estate runs through
    // Washington's table: $550,000 + 18% of $2M (changelog 349).
    expect(calculateStateEstateInheritanceTax('WA', 9000000, 1, 'child', { married: true })).toBeCloseTo(910000, 2);
    // MN's own graduated schedule (changelog 127) starts at 13%, applied to
    // the estate less its single $3,000,000 exclusion.
    expect(calculateStateEstateInheritanceTax('MN', 9000000, 1, 'child', { married: true })).toBeCloseTo(6000000 * 0.13, 2);
  });
});

describe('F-3: state gift add-backs', () => {
  it('Connecticut adds all lifetime taxable gifts to the estate-tax base', () => {
    // $14M estate + $2M gifts against the $15M CT exemption -> $1M @ 12%.
    expect(calculateStateEstateInheritanceTax('CT', 14000000, 1, 'child', { lifetimeTaxableGifts: 2000000 })).toBeCloseTo(120000, 2);
    expect(calculateStateEstateInheritanceTax('CT', 14000000, 1, 'child', {})).toBe(0);
  });
  it('Minnesota adds back only gifts within three years of death', () => {
    expect(calculateStateEstateInheritanceTax('MN', 2900000, 1, 'child', { recentTaxableGifts: 400000 })).toBeCloseTo(300000 * 0.13, 2);
    expect(calculateStateEstateInheritanceTax('MN', 2900000, 1, 'child', { lifetimeTaxableGifts: 400000 })).toBe(0);
  });
  it('other estate-tax states ignore gifts entirely', () => {
    expect(calculateStateEstateInheritanceTax('MA', 1900000, 1, 'child', { lifetimeTaxableGifts: 5000000, recentTaxableGifts: 5000000 })).toBe(0);
  });
});

describe('F-4: IRC 2058 state death tax deduction', () => {
  it('reduces the federal taxable estate by state death taxes paid', () => {
    // Second-audit worked example: $35M CT estate, $2.4M CT tax.
    expect(calculateFederalEstateTax(35000000, 'Single', 1, 0, 2400000)).toBeCloseTo(7040000, 2);
    expect(calculateFederalEstateTax(35000000, 'Single', 1, 0, 0)).toBeCloseTo(8000000, 2);
  });
  it('flows end-to-end: a CT estate\'s federal tax drops when state tax applies', () => {
    const mk = (state) => calculateHeirEstateTax(
      { ...DEFAULT_INPUTS, estateIndexingEnabled: false, spouse2Enabled: false, filingStatus: 'Single', stateOfResidence: state, heirs: [{ id: 1, name: 'H', filingStatus: 'Single', income: 100000, splitPct: 100, relationship: 'child' }] },
      0, 0, 35000000, 0, 0
    );
    const ct = mk('CT');
    const tx = mk('TX');
    expect(ct.totalStateEstateTax).toBeCloseTo(2400000, 0);
    expect(tx.totalFederalEstateTax - ct.totalFederalEstateTax).toBeCloseTo(2400000 * 0.40, 0);
  });
});

describe('F-5: no return below -100% can reach the balances', () => {
  it('a -150% override year wipes an account to zero, never negative', () => {
    const inputs = { ...DEFAULT_INPUTS, preTaxInit: 1000000, rothInit: 0, taxableInit: 0 };
    const ov = {}; ov[inputs.planYear] = -150;
    const p = runProjection(inputs, ov);
    for (const y of p.years) {
      expect(y.preTaxEnd).toBeGreaterThanOrEqual(0);
      expect(y.rothEnd).toBeGreaterThanOrEqual(0);
      expect(y.taxableEnd).toBeGreaterThanOrEqual(0);
      expect(y.hsaEnd).toBeGreaterThanOrEqual(0);
    }
    expect(p.years[0].preTaxEnd).toBe(0);
  });
  it('an override of exactly 0 is honoured, not skipped as falsy', () => {
    const inputs = { ...DEFAULT_INPUTS, preTaxInit: 1000000, rothInit: 0, taxableInit: 0, preTaxContribution1: 0, salary1: 0 };
    const ov = {}; ov[inputs.planYear] = 0;
    const grown = runProjection(inputs, null).years[0].preTaxEnd;
    const flat = runProjection(inputs, ov).years[0].preTaxEnd;
    expect(flat).toBeLessThan(grown); // 0% growth, not the base assumption
  });
});

describe('F-6: a charitable bequest can only be paid from assets that can fund it', () => {
  it('cannot promise the charity money that only exists as heir-bound life insurance', () => {
    const r = calculateHeirEstateTax(
      { ...DEFAULT_INPUTS, spouse2Enabled: false, filingStatus: 'Single', lifeInsuranceEnabled1: true, lifeInsuranceOwnership1: 'self', charitableBequestEnabled: true, charitableBequestMode: 'amount', charitableBequestAmount: 1000000, heirs: [{ id: 1, name: 'H', filingStatus: 'Single', income: 100000, splitPct: 100, relationship: 'child' }] },
      0, 0, 0, 1000000, 0
    );
    expect(r.charitableBequest).toBe(0);
    expect(r.totalLifeInsuranceProceeds).toBeCloseTo(1000000, 2);
  });
  it('is still fully payable when the drainable buckets cover it', () => {
    const r = calculateHeirEstateTax(
      { ...DEFAULT_INPUTS, spouse2Enabled: false, filingStatus: 'Single', charitableBequestEnabled: true, charitableBequestMode: 'amount', charitableBequestAmount: 1000000, heirs: [{ id: 1, name: 'H', filingStatus: 'Single', income: 100000, splitPct: 100, relationship: 'child' }] },
      0, 0, 3000000, 0, 0
    );
    expect(r.charitableBequest).toBe(1000000);
  });
});
