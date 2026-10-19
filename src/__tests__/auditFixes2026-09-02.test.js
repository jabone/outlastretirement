// Changelog 124: the batch of TAX_RULES_SPEC Section 6 questions closed on
// 2026-09-02 after the IRMAA work -- Q-3 (unused standard deduction against
// capital gains), Q-6 (2026 Part D base premium), Q-7 (full retirement age
// by birth year), Q-11 (capital-loss rules), Q-12 (MFS AMT breakpoint) and
// Q-23 (Additional Medicare Tax per return for MFS).
import { describe, it, expect } from 'vitest';
import {
  runProjection, DEFAULT_INPUTS,
  calculateCapitalGainsTaxes, calculateAMT, calculateFICATaxes, calculateMedicarePartD,
  getFullRetirementAge, getSSMultiplier, getSpousalSSMultiplier,
  PART_D_BASE_PREMIUM, AMT_RATE_BREAKPOINT_2026, AMT_RATE_BREAKPOINT_MFS_2026,
} from '../calculator';

describe('Q-3: the unused standard deduction shelters capital gains', () => {
  it('a couple with $10,000 of ordinary income and $60,000 of gains pays $0 -- all inside the 0% band', () => {
    // Ordinary $10,000 < $32,200 deduction: $22,200 unused. Gains after
    // shelter $37,800, stacked from taxable income $0 -> entirely under
    // the $98,900 0% ceiling.
    const tax = calculateCapitalGainsTaxes(0, 60000, 'MFJ', 1, 32200, 22200);
    expect(tax).toBe(0);
  });
  it('only the sheltered slice moves: gains above the 0% ceiling are still taxed at 15%', () => {
    // $0 ordinary taxable, $140,000 of gains, $32,200 fully unused.
    // Taxable gains 107,800; 98,900 at 0%, 8,900 at 15% = 1,335.
    expect(calculateCapitalGainsTaxes(0, 140000, 'MFJ', 1, 32200, 32200)).toBeCloseTo(8900 * 0.15, 2);
    // Without the shelter (old behavior) 41,100 would have been at 15%.
    expect(calculateCapitalGainsTaxes(0, 140000, 'MFJ', 1, 32200, 0)).toBeCloseTo(41100 * 0.15, 2);
  });
  it('NIIT is still measured on MAGI, so a sheltered gain can owe 3.8% on the excess over $250,000', () => {
    // Ordinary $0 (fully sheltered), gains $300,000: MAGI = 300,000 ->
    // NIIT on min(300,000, 50,000) = 1,900, plus rate-band tax on the
    // 267,800 of taxable gains.
    const withShelter = calculateCapitalGainsTaxes(0, 300000, 'MFJ', 1, 32200, 32200);
    const bandTax = (267800 - 98900) * 0.15;
    expect(withShelter).toBeCloseTo(bandTax + 50000 * 0.038, 2);
  });
  it('flows through the projection: a brokerage-only retiree pays no federal tax on $60,000 of gains', () => {
    const inputs = {
      ...DEFAULT_INPUTS, planYear: 2026, spouse2Enabled: true, filingStatus: 'MFJ',
      birthYear1: 1966, birthYear2: 1966, retireAge1: 60, retireAge2: 60, lifeExpectancy1: 90, lifeExpectancy2: 90,
      salary1: 0, salary2: 0, ss1: 0, ss2: 0, pension1: 0, pension2: 0, rentalIncome: 0, annuityIncome: 0,
      preTaxInit: 0, rothInit: 0, taxableInit: 1500000, taxableBasisInit: 750000, hsaInit: 0, cashFloorEnabled: false,
      lifestyleExpense: 90000, healthcareBridgeCost: 0, ltcActive1: false, ltcActive2: false,
      stateTaxState: 'none', taxBracketInflationRate: 0, inflationRate: 0,
      rothConversionStrategy: 'none', backdoorRothEnabled: false, taxLossHarvestingEnabled: false,
      lifestyleThreePhaseEnabled: false, goGoBumpEnabled: false, withdrawalStrategy: 'TaxableFirst',
      taxableContribution: 0, preTaxContribution1: 0, preTaxContribution2: 0, rothContribution1: 0, rothContribution2: 0, hsaContribution: 0,
      acaSubsidyProtectionEnabled: false, acaCliffProtectionEnabled: false,
    };
    const y0 = runProjection(inputs).years[0];
    // ~$30,000 of dividends + ~$30,000 of realized gains on a $60,000 draw at
    // a 50% basis ratio, all long-term, and no ordinary income at all: the
    // $32,200 deduction shelters the first slice and the rest sits in the
    // 0% band. Federal tax must be $0.
    expect(y0.totalTaxesPaid).toBeLessThan(1);
  });
});

describe('Q-6: 2026 Part D national base beneficiary premium', () => {
  it('is $38.99 (CMS, July 28 2025 announcement), not the 2024 $34.50', () => {
    expect(PART_D_BASE_PREMIUM).toBe(38.99);
    expect(calculateMedicarePartD(50000, 'Single', 1)).toBeCloseTo(38.99 * 12, 2);
  });
});

describe('Q-7: full retirement age by year of birth', () => {
  it('follows the SSA table', () => {
    expect(getFullRetirementAge(1954)).toBe(66);
    expect(getFullRetirementAge(1955)).toBeCloseTo(66 + 2 / 12, 9);
    expect(getFullRetirementAge(1957)).toBeCloseTo(66.5, 9);
    expect(getFullRetirementAge(1959)).toBeCloseTo(66 + 10 / 12, 9);
    expect(getFullRetirementAge(1960)).toBe(67);
    expect(getFullRetirementAge(1980)).toBe(67);
    expect(getFullRetirementAge(undefined)).toBe(67);
  });
  it('a 1957-born claimant at 66 is 6 months early (96.67%), not 12 (93.33%)', () => {
    expect(getSSMultiplier(66, getFullRetirementAge(1957))).toBeCloseTo(1 - 6 * (5 / 9) / 100, 6);
    expect(getSSMultiplier(66)).toBeCloseTo(1 - 12 * (5 / 9) / 100, 6);
  });
  it('a 1954-born claimant at 70 earns 48 months of credits (132%); at 62 loses 48 months (75%)', () => {
    expect(getSSMultiplier(70, 66)).toBeCloseTo(1.32, 6);
    expect(getSSMultiplier(62, 66)).toBeCloseTo(0.75, 6);
    // The 1960+ schedule is unchanged: 124% at 70, 70% at 62.
    expect(getSSMultiplier(70, 67)).toBeCloseTo(1.24, 6);
    expect(getSSMultiplier(62, 67)).toBeCloseTo(0.70, 6);
  });
  it('the spousal factor uses the same FRA', () => {
    expect(getSpousalSSMultiplier(66, 66)).toBe(1);
    expect(getSpousalSSMultiplier(62, 66)).toBeCloseTo(1 - 36 * (25 / 36) / 100 - 12 * (5 / 12) / 100, 6);
  });
  it('runProjection reads the FRA from the birth year', () => {
    const base = {
      ...DEFAULT_INPUTS, spouse2Enabled: false, salary1: 0, pension1: 0, ss2: 0, ssCOLA: 0, inflationRate: 0,
      retireAge1: 60, ss1: 24000, ssDepletionEnabled: false,
    };
    // Born 1958 (68 in 2026), claimed at 66 8/12 = exactly FRA -> 100%.
    const atFra = runProjection({ ...base, birthYear1: 1958, claimingAge1: 66 + 8 / 12 }).years[0];
    expect(atFra.ssIncome).toBeCloseTo(24000, 2);
    // Same person claiming at 67: 4 months of delayed credits.
    const at67 = runProjection({ ...base, birthYear1: 1958, claimingAge1: 67 }).years[0];
    expect(at67.ssIncome).toBeCloseTo(24000 * (1 + 4 * (2 / 3) / 100), 2);
  });
});

describe('Q-11: capital-loss rules', () => {
  // Changelog 429: only a loss the account holds is harvested, so the
  // account starts at its basis (a fresh purchase); the 2026 growth leaves
  // it with a small gain that the 2027 crash more than wipes out.
  const crash = {
    ...DEFAULT_INPUTS, taxableInit: 500000, taxableBasisInit: 500000, stressType: 'crashYear', stressCrashReturn: -20,
    stressStartMode: 'specific', stressStartYear: 2027, taxLossHarvestingEnabled: true,
  };
  it('the ordinary-income offset is $3,000, $1,500 for MFS, and is not indexed', () => {
    const joint = runProjection(crash).years.find(y => y.year === 2028);
    expect(joint.harvestedOrdinaryOffset).toBeCloseTo(3000, 2);
    const separate = runProjection({ ...crash, filingStatus: 'MFS' }).years.find(y => y.year === 2028);
    expect(separate.harvestedOrdinaryOffset).toBeCloseTo(1500, 2);
    // Ten years on, still $3,000 despite bracket inflation.
    const later = runProjection(crash).years.find(y => y.year === 2037);
    expect(later.taxBracketInflationFactor).toBeGreaterThan(1.1);
    expect(later.harvestedOrdinaryOffset).toBeLessThanOrEqual(3000.01);
  });
  it('a loss never absorbs qualified dividends, but does net against realized gains on a Taxable draw', () => {
    // Retired, living off Taxable: the 2027 crash takes the account under
    // its basis (changelog 429: the harvest is that loss, and the basis is
    // reset to the crashed value, so the 2028 draw has no gain to realize);
    // the 2029 draw, after a year's recovery, realizes gains that the
    // carried loss offsets before the $3,000 ordinary slice. The pension
    // keeps the year's tax above zero so the netting shows.
    const retired = {
      ...crash, spouse2Enabled: false, birthYear1: 1961, retireAge1: 60, salary1: 0, ss1: 0, ss2: 0, pension1: 60000,
      lifestyleExpense: 250000, preTaxInit: 0, rothInit: 0, taxableInit: 3000000, taxableBasisInit: 3000000,
      withdrawalStrategy: 'TaxableFirst', cashFloorEnabled: false,
    };
    const y = runProjection(retired).years.find(r => r.year === 2029);
    expect(y.harvestedGainsOffset).toBe(0); // no Life-Event gains, dividends untouched
    expect(y.lossUsedOnDraw).toBeGreaterThan(0);
    expect(y.lossCarryforward).toBeGreaterThanOrEqual(0);
    // Netting lowered tax versus the same plan with harvesting off.
    const off = runProjection({ ...retired, taxLossHarvestingEnabled: false }).years.find(r => r.year === 2029);
    expect(y.totalTaxesPaid).toBeLessThan(off.totalTaxesPaid);
  });
});

describe('Q-12: the AMT 28% breakpoint is halved for MFS', () => {
  it('$122,250 for MFS, $244,500 otherwise', () => {
    expect(AMT_RATE_BREAKPOINT_MFS_2026).toBe(AMT_RATE_BREAKPOINT_2026 / 2);
    // AMTI far above every phase-out so the exemption is 0: tax is pure rate math.
    const amti = 2000000;
    const single = calculateAMT(amti, 'Single');
    // Changelog 127 / audit Q-1: calculateAMT spreads an MFS household over
    // its two returns. The breakpoint being tested is a per-return figure,
    // so this puts the whole AMTI on one return (split 100).
    const mfs = calculateAMT(amti, 'MFS', 1, 100);
    expect(single).toBeCloseTo(244500 * 0.26 + (amti - 244500) * 0.28, 2);
    expect(mfs).toBeCloseTo(122250 * 0.26 + (amti - 122250) * 0.28, 2);
    expect(mfs).toBeGreaterThan(single);
  });
});

describe('Q-23: Additional Medicare Tax is per return for MFS', () => {
  it('each separate filer is tested against $125,000 on their own wages', () => {
    // $100,000 + $100,000: combined $200,000 exceeded the single $125,000
    // threshold and charged 0.9% on $75,000; per return neither spouse does.
    const base = (200000 * 0.0145) + (200000 * 0.062);
    expect(calculateFICATaxes(100000, 100000, 'MFS')).toBeCloseTo(base, 2);
    // $200,000 + $50,000: only the first spouse owes it, on $75,000.
    const fica = calculateFICATaxes(200000, 50000, 'MFS');
    const expectedBase = (Math.min(200000, 184500) * 0.062 + 200000 * 0.0145) + (50000 * 0.062 + 50000 * 0.0145);
    expect(fica).toBeCloseTo(expectedBase + 75000 * 0.009, 2);
  });
  it('a joint return still tests combined wages against $250,000', () => {
    const fica = calculateFICATaxes(150000, 150000, 'MFJ');
    const base = 2 * (150000 * 0.062 + 150000 * 0.0145);
    expect(fica).toBeCloseTo(base + 50000 * 0.009, 2);
  });
});
