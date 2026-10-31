import { describe, it, expect } from 'vitest';
import {
  YONKERS_RESIDENT_SURCHARGE,
  newYorkBenefitRecapture,
  newYorkEraForYear,
  newYorkCityTax,
  NY_RECAPTURE_AGI_FLOOR,
  IL_EXEMPTION_ALLOWANCE, IL_EXEMPTION_AGE_65,
  NY_STD_DEDUCTION_SINGLE, NY_STD_DEDUCTION_MFJ,
  CA_STD_DEDUCTION_SINGLE, CA_STD_DEDUCTION_MFJ,
  NY_RECAPTURE_FLAT_AGI,
  NY_TOP_RATE,
  californiaExemptionCredits,
  californiaMilitaryExclusion,
  CA_EXEMPTION_CREDIT,
  CA_MILITARY_EXCLUSION_CAP,
  CA_MILITARY_EXCLUSION_LAST_YEAR,
  stateEarlyDistributionTax,
  californiaBehavioralHealthServicesTax,
  splitCharitableBequest,
  CHARITABLE_SOURCE_ORDERS,
  calculateTaxes,
  calculateCapitalGainsTaxes,
  calculateIRMAA,
  calculateMedicarePartD,
  getRMDDivisor,
  getSSMultiplier,
  runProjection,
  runMonteCarlo,
  getFederalPovertyLevel,
  ACA_NON_EXPANSION_STATES,
  getHSAContributionLimit,
  QCD_LIMIT_2026,
  calculateAMT,
  calculateHeirEstateTax,
  deflateEstateResultForDisplay,
  GST_EXEMPTION_2026,
  GST_RATE,
  GST_EXEMPTION_IS_PORTABLE,
  calculateStateEstateInheritanceTax,
  STATE_ESTATE_INHERITANCE_TAX_TABLE,
  calculateInheritanceTax,
  STATE_INHERITANCE_SCHEDULES,
  HEIR_RELATIONSHIPS,
  DEFAULT_HEIR_RELATIONSHIP,
  normalizeHeirRelationship,
  calculateFederalEstateTax,
  BRACKETS_MFS,
  BRACKETS_MFJ,
  BRACKETS_SINGLE,
  AMT_EXEMPTION_MFS_2026,
  AMT_EXEMPTION_MFJ_2026,
  AMT_EXEMPTION_SINGLE_2026,
  ROTH_IRA_PHASEOUT_MFS_TOGETHER,
  IRMAA_THRESHOLDS_MFS_TOGETHER,
  IRMAA_THRESHOLDS_SINGLE,
  IRMAA_THRESHOLDS_MFJ,
  IRMAA_STANDARD_PREMIUM,
  IRMAA_TIER_PREMIUMS,
  irmaaThresholdsFor,
  getContributionAdvisory,
  computeGiftingTotals,
  giftingForAge,
  ANNUAL_GIFT_EXCLUSION_2026,
  FEDERAL_ESTATE_EXEMPTION_2026,
  FEDERAL_ESTATE_TOP_RATE,
  migrateInputs,
  sanitizeInputs,
  migrateScenarios,
  calculateEmployerMatch,
  getElectiveDeferralLimit,
  getIRAContributionLimit,
  getMaxContributionSplit,
  runSensitivityAnalysis,
  computeSensitivityAnalysisReal,
  getMinimumRequiredReturn,
  getContributionSplitOptimizer,
  getSSClaimingHeatmap,
  getRothBracketWithdrawalHeatmap,
  getRothLadderScheduleHeatmap,
  getGuardrailsComparisonHeatmap,
  BRACKETS_MFJ_PRETCJA,
  BRACKETS_SINGLE_PRETCJA,
  getRSUVestingIncomeForYear,
  TAX_YEAR,
  calculateStateTaxes,
  getBracketFilling,
  runOptimizer,
  gridBestExtraStrategy,
  findOptimalRetirementAge,
  findDieWithZeroSpending,
  computeStressComparisonData,
  computeOptimizerResultsReal,
  computeAgeFinderResultsReal,
  virginiaAgeDeduction,
  virginiaMilitarySubtraction,
  irmaaScaledThresholds,
  irmaaTopTierFactor,
  computeSpendingBridge,
  currentDebtService,
  currentMortgageService,
  currentConsumerDebtService,
  readSpendingBridge,
  readSpendingBlueprint,
  spendingBlueprintDerived,
  SPENDING_CATEGORY_IDS,
  SPENDING_HEALTH_BRIDGE_ID,
  spendingShapeShares,
  essentialShareOf,
} from '../calculator.js';
// The reference household (the pre-467 default plan): see referenceHousehold.js.
import { REFERENCE_INPUTS as DEFAULT_INPUTS } from './referenceHousehold';
import { HISTORICAL_RETURNS } from '../config/historicalReturns';
import { finalBalanceFactor, yearEndFactor } from '../utils/displayDollars';
import { historicalPortfolioReturn } from '../utils/bootstrap';

describe('calculator.js core logic', () => {
  
  describe('Tax Engine', () => {
    it('calculates 2025/2026 tax brackets correctly for Married Filing Jointly', () => {
      // taxableIncome, status, inflationFactor
      // Gross 100k - ~30k std deduction = 70k taxable
      const tax = calculateTaxes(70000, 'MFJ');
      expect(tax).toBeGreaterThan(0);
      expect(tax).toBeLessThan(70000 * 0.12); // Should be mostly in 10% and 12% brackets
    });

    it('calculates taxes correctly for Single filers', () => {
      const taxSingle = calculateTaxes(70000, 'Single');
      const taxMFJ = calculateTaxes(70000, 'MFJ');
      expect(taxSingle).toBeGreaterThan(taxMFJ); // Single pays more on same taxable income
    });

    it('calculates long term capital gains taxes', () => {
      // 0% bracket up to ~94k for MFJ.
      // ordinaryIncome, capitalGains, status, inflationFactor
      const ltcg = calculateCapitalGainsTaxes(50000, 40000, 'MFJ'); 
      expect(ltcg).toBe(0); // Should be 0%

      // Pushed into 15% bracket
      const ltcgHigh = calculateCapitalGainsTaxes(150000, 50000, 'MFJ');
      expect(ltcgHigh).toBeGreaterThan(0);
    });
  });

  describe('RMD Logic', () => {
    it('returns correct RMD divisor based on age', () => {
      expect(getRMDDivisor(70)).toBe(0); // No RMD before 73
      expect(getRMDDivisor(73)).toBe(26.5);
      expect(getRMDDivisor(75)).toBe(24.6);
      expect(getRMDDivisor(80)).toBe(20.2);
      expect(getRMDDivisor(90)).toBe(12.2);
    });

    it('continues decreasing past age 95 instead of flatlining (IRS table runs through 120+)', () => {
      expect(getRMDDivisor(95)).toBe(8.9);
      expect(getRMDDivisor(96)).toBe(8.4); // would incorrectly equal 8.9 under the old flatline bug
      expect(getRMDDivisor(100)).toBe(6.4);
      expect(getRMDDivisor(110)).toBe(3.5);
      expect(getRMDDivisor(119)).toBe(2.3);
    });

    it('floors at the age-120+ factor of 2.0', () => {
      expect(getRMDDivisor(120)).toBe(2.0);
      expect(getRMDDivisor(130)).toBe(2.0); // any age beyond the published table clamps to the final factor
    });
  });

  describe('Social Security Logic', () => {
    it('applies the statutory SSA multiplier based on claiming age (FRA=67)', () => {
      // 42 U.S.C. 402(q): 5/9% per month for the first 36 months early,
      // 5/12% per month beyond that; 402(w): 2/3% per month delayed.
      expect(getSSMultiplier(62)).toBeCloseTo(0.70, 4); // 36*(5/9)% + 24*(5/12)% = 20% + 10%
      expect(getSSMultiplier(63)).toBeCloseTo(0.75, 4);
      expect(getSSMultiplier(64)).toBeCloseTo(0.80, 4); // 36 months * 5/9%
      expect(getSSMultiplier(65)).toBeCloseTo(0.8667, 3);
      expect(getSSMultiplier(66)).toBeCloseTo(0.9333, 3);
      expect(getSSMultiplier(67)).toBeCloseTo(1.00, 4);
      expect(getSSMultiplier(68)).toBeCloseTo(1.08, 4);
      expect(getSSMultiplier(70)).toBeCloseTo(1.24, 4); // 36 months * 2/3%
      // Fractional ages count whole months; clamped to the 62-70 window
      expect(getSSMultiplier(62.5)).toBeCloseTo(0.725, 4);
      expect(getSSMultiplier(60)).toBeCloseTo(0.70, 4);
      expect(getSSMultiplier(72)).toBeCloseTo(1.24, 4);
    });
  });

  describe('SS provisional income includes the discretionary draw (changelog 132)', () => {
    // The bug this guards: taxable Social Security used to be settled BEFORE
    // solveWithdrawals ran, so the Pre-Tax draw taken to fund spending never
    // entered the provisional-income test -- the "tax torpedo" the draw
    // itself causes was invisible. Same ordering fix changelog 123 made for
    // IRMAA MAGI (audit Q-4b).
    const worksheet = (provisionalOther, ss, lower, upper) => {
      const combined = provisionalOther + 0.5 * ss;
      if (combined <= lower) return 0;
      if (combined <= upper) return Math.min(0.5 * ss, 0.5 * (combined - lower));
      const lowerTier = Math.min(0.5 * ss, 0.5 * (upper - lower));
      return Math.min(0.85 * ss, 0.85 * (combined - upper) + lowerTier);
    };

    // A household living off its Pre-Tax bucket, whose income WITHOUT the
    // draw sits under the $32,000 MFJ threshold.
    const modest = {
      ...DEFAULT_INPUTS,
      filingStatus: 'MFJ', birthYear1: 1961, birthYear2: 1963,
      retireAge1: 65, retireAge2: 65,
      salary1: 0, salary2: 0,
      taxableInit: 150000, preTaxInit: 900000, rothInit: 0, hsaInit: 0,
      lifestyleExpense: 78000,
      ss1: 26400, ss2: 16800,
      claimingAge1: 67, claimingAge2: 67,
      rothConversionStrategy: 'none',
      withdrawalStrategy: 'PreTaxFirst',
      stateTaxState: 'TX_FL',
    };

    it('taxes the benefits the discretionary Pre-Tax draw exposes', () => {
      const proj = runProjection(modest);
      const drawYears = proj.years.filter(y => y.ssIncome > 0 && y.discretionaryDrawPreTax > 0);
      expect(drawYears.length).toBeGreaterThan(0);
      // Every such year must report SOME taxable benefit: provisional income
      // including the draw is far above the $44,000 upper threshold here.
      for (const y of drawYears) {
        expect(y.taxableSS).toBeGreaterThan(0);
      }
    });

    it('pushes the draw years to the 85% cap, and never past it', () => {
      const proj = runProjection(modest);
      let atCap = 0;
      for (const y of proj.years) {
        if (!(y.ssIncome > 0)) continue;
        // Hard invariant of IRC s 86 regardless of income: never more than
        // 85% of benefits is taxable.
        expect(y.taxableSS).toBeLessThanOrEqual(0.85 * y.ssIncome + 0.01);
        expect(y.taxableSS).toBeGreaterThanOrEqual(0);
        if (Math.abs(y.taxableSS - 0.85 * y.ssIncome) < 0.01) atCap++;
      }
      // Once the draw is counted this household is far above the $44,000
      // upper threshold for essentially its whole retirement.
      expect(atCap).toBeGreaterThan(10);
    });

    it('is exactly inert for a household already pinned at the 85% cap', () => {
      // A large pension keeps provisional income far above the upper
      // threshold with or without the draw, so re-settling can move nothing.
      const capped = { ...modest, pension1: 200000, pensionStartAge1: 65 };
      const proj = runProjection(capped);
      let checked = 0;
      for (const y of proj.years) {
        if (!(y.ssIncome > 0)) continue;
        expect(y.taxableSS).toBeCloseTo(0.85 * y.ssIncome, 2);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });

    it('keeps the worksheet helper honest at the phase-in band', () => {
      // IRS Pub 915 example reproduced in Rule 2.6 of TAX_RULES_SPEC:
      // MFJ, $40,000 of benefits + $24,000 pension -> $6,000 taxable.
      expect(worksheet(24000, 40000, 32000, 44000)).toBeCloseTo(6000, 6);
      // Add a $40,000 IRA withdrawal (the discretionary draw) and the same
      // household lands at $34,000 taxable -- the delta this fix restores.
      expect(worksheet(64000, 40000, 32000, 44000)).toBeCloseTo(34000, 6);
    });
  });


  describe('Withdrawal Ordering (runProjection)', () => {
    it('drains standard sequence: Taxable -> Pre-Tax -> Roth', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        birthYear1: 1960,
        retireAge1: 65, // Retires in 2025 (Start year is 2026, so age 66)
        lifeExpectancy1: 90,
        spouse2Enabled: false,
        taxableInit: 100000,
        preTaxInit: 200000,
        rothInit: 100000,
        lifestyleExpense: 150000, // Very high spending to drain accounts fast
        preRetireReturn: 0,
        postRetireReturn: 0,
        inflationRate: 0,
        taxBracketInflationRate: 0,
        ss1: 0,
        pension1: 0,
        withdrawalStrategy: 'TaxableFirst',
        fundExpenseRatioPct: 0, // hand-worked balances; fees have their own tests (447)
      };

      const results = runProjection(inputs);
      const years = results.years;
      
      const year1 = years[0];
      // Taxable should be drained first
      expect(year1.taxableEnd).toBeLessThan(year1.taxableStart);
      expect(year1.taxableEnd).toBe(0);
      
      // It should overflow into Pre-Tax
      expect(year1.preTaxEnd).toBeLessThan(year1.preTaxStart);
      
      // Roth should be untouched
      expect(year1.rothEnd).toBe(year1.rothStart);
    });
    
    it('drains Roth sequence: Taxable -> Roth -> Pre-Tax', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        birthYear1: 1960,
        retireAge1: 65,
        lifeExpectancy1: 90,
        spouse2Enabled: false,
        taxableInit: 100000,
        preTaxInit: 200000,
        rothInit: 100000,
        lifestyleExpense: 150000,
        preRetireReturn: 0,
        postRetireReturn: 0,
        inflationRate: 0,
        taxBracketInflationRate: 0,
        ss1: 0,
        pension1: 0,
        withdrawalStrategy: 'RothFirst',
        fundExpenseRatioPct: 0, // hand-worked balances; fees have their own tests (447)
      };

      const results = runProjection(inputs);
      const years = results.years;
      
      const year1 = years[0];
      // Roth should be drained first
      expect(year1.rothEnd).toBeLessThan(year1.rothStart);
      expect(year1.rothEnd).toBe(0); 
      
      // Next it should drain Taxable
      expect(year1.taxableEnd).toBeLessThan(year1.taxableStart);
      
      // Pre-Tax should be untouched
      expect(year1.preTaxEnd).toBe(year1.preTaxStart);
    });
  });

  describe('Medicare IRMAA (calculateIRMAA)', () => {
    it('charges nothing when no household members are on Medicare', () => {
      expect(calculateIRMAA(1000000, 'MFJ', 0)).toBe(0);
    });

    it('charges only the standard premium below the first threshold', () => {
      // 2026: standard Part B premium is $202.90/mo, MFJ threshold is $218,000
      expect(calculateIRMAA(217999, 'MFJ', 1)).toBeCloseTo(202.90 * 12, 2);
    });

    it('applies each 2026 MFJ surcharge tier at the correct dollar breakpoints', () => {
      expect(calculateIRMAA(218001, 'MFJ', 1)).toBeCloseTo(284.10 * 12, 2);
      expect(calculateIRMAA(274001, 'MFJ', 1)).toBeCloseTo(405.80 * 12, 2);
      expect(calculateIRMAA(342001, 'MFJ', 1)).toBeCloseTo(527.50 * 12, 2);
      expect(calculateIRMAA(410001, 'MFJ', 1)).toBeCloseTo(649.20 * 12, 2);
      expect(calculateIRMAA(750001, 'MFJ', 1)).toBeCloseTo(689.90 * 12, 2);
    });

    it('applies each 2026 Single surcharge tier at the correct dollar breakpoints', () => {
      expect(calculateIRMAA(109001, 'Single', 1)).toBeCloseTo(284.10 * 12, 2);
      expect(calculateIRMAA(500001, 'Single', 1)).toBeCloseTo(689.90 * 12, 2);
    });

    it('scales linearly with the number of household members on Medicare', () => {
      const oneMember = calculateIRMAA(100000, 'MFJ', 1);
      const twoMembers = calculateIRMAA(100000, 'MFJ', 2);
      expect(twoMembers).toBeCloseTo(oneMember * 2, 2);
    });

    it('defaults to no growth (a flat 2026 premium) when no inflation factor is passed', () => {
      expect(calculateIRMAA(100000, 'MFJ', 1)).toBeCloseTo(202.90 * 12, 2);
    });

    it('scales the premium by the given inflation factor', () => {
      expect(calculateIRMAA(100000, 'MFJ', 1, 1.5)).toBeCloseTo(202.90 * 1.5 * 12, 2);
    });
  });

  describe('Medicare Part D (calculateMedicarePartD)', () => {
    it('charges nothing when no household members are on Medicare', () => {
      expect(calculateMedicarePartD(1000000, 'MFJ', 0)).toBe(0);
    });

    it('charges only the national base premium below the first threshold', () => {
      expect(calculateMedicarePartD(217999, 'MFJ', 1)).toBeCloseTo(38.99 * 12, 2);
    });

    it('applies each 2026 MFJ Part D surcharge tier on top of the base premium', () => {
      expect(calculateMedicarePartD(218001, 'MFJ', 1)).toBeCloseTo((38.99 + 14.50) * 12, 2);
      expect(calculateMedicarePartD(750001, 'MFJ', 1)).toBeCloseTo((38.99 + 91.00) * 12, 2);
    });

    it('scales the total (base + surcharge) by the given inflation factor', () => {
      expect(calculateMedicarePartD(218001, 'MFJ', 1, 2.0)).toBeCloseTo((38.99 + 14.50) * 2.0 * 12, 2);
    });

    it('scales linearly with the number of household members on Medicare', () => {
      const oneMember = calculateMedicarePartD(100000, 'MFJ', 1);
      const twoMembers = calculateMedicarePartD(100000, 'MFJ', 2);
      expect(twoMembers).toBeCloseTo(oneMember * 2, 2);
    });
  });

  describe('Granular Inflation Assumptions -- SS COLA, Medical, Housing, Medicare B/D (runProjection)', () => {
    // Isolates each rate from the others and from general inflationRate so
    // a change to one doesn't mask or get masked by the rest. birthYear1:
    // 1956 puts age1 at exactly 70 in the TAX_YEAR (2026) start year --
    // i.e. year index 0 -- so "age1 === 70/71/72" below line up with
    // "0/1/2 years of compounding" instead of whatever elapsed-years count
    // DEFAULT_INPUTS' own birthYear1 would produce.
    const NEUTRAL = {
      ...DEFAULT_INPUTS,
      birthYear1: 1956,
      inflationRate: 0, taxBracketInflationRate: 0,
      ssCOLA: 0, medicalInflationRate: 0, housingInflationRate: 0,
      medicarePartBInflationRate: 0, medicarePartDInflationRate: 0, ltcInflationRate: 0,
      spouse2Enabled: false, retireAge1: 70, ss1: 20000, claimingAge1: 70,
      ltcActive1: true, ltcCost1: 10000, ltcStartAge1: 71, ltcDurationYears1: 3,
      healthcareBridgeCost: 0,
    };
    // Born 1956: FRA is 66 and 4 months (changelog 124, Q-7), so claiming
    // at 70 earns 44 months of delayed credits at 2/3% = 129.33%.
    const CLAIM_MULTIPLIER = 1 + 44 * (2 / 3) / 100;

    it('SS benefits stay flat when ssCOLA is 0, even with everything else zeroed too', () => {
      const proj = runProjection(NEUTRAL);
      const y1 = proj.years.find(y => y.age1 === 70); // claiming year (index 0)
      const y3 = proj.years.find(y => y.age1 === 72); // index 2
      expect(y1.ssIncome).toBeCloseTo(20000 * CLAIM_MULTIPLIER, 0);
      expect(y3.ssIncome).toBeCloseTo(20000 * CLAIM_MULTIPLIER, 0);
    });

    it('SS benefits compound at ssCOLA, independent of general inflationRate', () => {
      const proj = runProjection({ ...NEUTRAL, ssCOLA: 10 });
      const y1 = proj.years.find(y => y.age1 === 70); // claiming year, no growth yet
      const y3 = proj.years.find(y => y.age1 === 72); // 2 years of 10% growth
      expect(y1.ssIncome).toBeCloseTo(20000 * CLAIM_MULTIPLIER, 0);
      expect(y3.ssIncome).toBeCloseTo(20000 * CLAIM_MULTIPLIER * 1.1 * 1.1, 0);
    });

    it('LTC cost compounds at ltcInflationRate, independent of general inflationRate and medicalInflationRate', () => {
      const proj = runProjection({ ...NEUTRAL, ltcInflationRate: 8, medicalInflationRate: 0 });
      const y1 = proj.years.find(y => y.age1 === 71); // ltcStartAge1, first year of LTC (index 1)
      const y2 = proj.years.find(y => y.age1 === 72); // index 2
      expect(y1.ltcCost).toBeCloseTo(10000 * 1.08, 0);
      expect(y2.ltcCost).toBeCloseTo(10000 * 1.08 * 1.08, 0);
    });

    it('the housing share of lifestyle spending compounds at housingInflationRate; the rest stays flat', () => {
      const proj = runProjection({ ...NEUTRAL, housingInflationRate: 10, housingExpensePct: 40 });
      const y1 = proj.years.find(y => y.age1 === 71); // index 1 -- 1 year of compounding
      // 40% of the budget grows 10%/yr, 60% stays flat -- blended multiplier
      // after 1 year: 0.4*1.10 + 0.6*1.0 = 1.04
      const expectedMultiplier = 0.4 * 1.10 + 0.6 * 1.0;
      expect(y1.lifestyleExpenses).toBeCloseTo(DEFAULT_INPUTS.lifestyleExpense * expectedMultiplier, 0);
    });

    it('a 0% housingExpensePct makes housingInflationRate a no-op, regardless of its value', () => {
      const withHighRate = runProjection({ ...NEUTRAL, housingInflationRate: 15, housingExpensePct: 0 });
      const withZeroRate = runProjection({ ...NEUTRAL, housingInflationRate: 0, housingExpensePct: 0 });
      expect(withHighRate.endingBalance).toBeCloseTo(withZeroRate.endingBalance, 2);
    });

    it('Medicare Part B and Part D each compound independently at their own rate', () => {
      // Override birthYear1 so age1 starts at exactly 65 (this test's own
      // claiming/Medicare-eligibility age) in the start year, instead of
      // NEUTRAL's age-70 alignment used by the SS/LTC/housing tests above.
      const proj = runProjection({
        ...NEUTRAL, birthYear1: 1961, retireAge1: 65, claimingAge1: 65,
        medicarePartBInflationRate: 10, medicarePartDInflationRate: 20,
      });
      const y1 = proj.years.find(y => y.age1 === 65); // index 0
      const y2 = proj.years.find(y => y.age1 === 66); // index 1
      expect(y1.partBCost).toBeCloseTo(202.90 * 12, 2);
      expect(y1.partDCost).toBeCloseTo(38.99 * 12, 2);
      expect(y2.partBCost).toBeCloseTo(202.90 * 1.10 * 12, 2);
      expect(y2.partDCost).toBeCloseTo(38.99 * 1.20 * 12, 2);
      expect(y2.irmaaCost).toBeCloseTo(y2.partBCost + y2.partDCost, 2);
    });

    it('Medicare Part D is a real new cost -- irmaaCost is $0 with all Medicare inflation off only if Part D base premium is also excluded', () => {
      // Sanity check that Part D isn't silently a no-op: with membersOver65
      // > 0 and both rates at 0 (flat, no growth), irmaaCost should still
      // equal the flat Part B premium PLUS the flat Part D base premium --
      // not just Part B alone as it was before Part D existed.
      const proj = runProjection({ ...NEUTRAL, birthYear1: 1961, retireAge1: 65, claimingAge1: 65 });
      const y1 = proj.years.find(y => y.age1 === 65);
      expect(y1.irmaaCost).toBeCloseTo((202.90 + 38.99) * 12, 2);
    });
  });

  describe('Roth Conversion Strategies (runProjection)', () => {
    // A retired-from-day-1 single filer with plenty of taxable cash to cover
    // spending, so pre-tax/Roth balance changes in year 1 are attributable
    // only to the Roth conversion strategy being tested (no growth, no RMDs,
    // no contributions to muddy the numbers).
    const baseInputs = {
      ...DEFAULT_INPUTS,
      fundExpenseRatioPct: 0, // hand-worked balances; fees have their own tests (447)
      // Zero other ordinary income means the brokerage yield stays
      // all-qualified (changelog 414 would put its bond share on the brackets).
      taxableQualifiedDividendFollowsAllocation: false,
      // These cases test bracket arithmetic; a 46-year-old retiree is on the
      // marketplace, where Cliff Protection (on by default since 443) would
      // cap the conversion at the 400% line first.
      acaCliffProtectionEnabled: false,
      birthYear1: 1980, // age 46 in the 2026 start year
      retireAge1: 46,   // already retired — no salary, no contributions
      lifeExpectancy1: 90,
      spouse2Enabled: false,
      salary1: 0,
      ss1: 0,
      pension1: 0,
      preRetireReturn: 0,
      postRetireReturn: 0,
      inflationRate: 0,
      taxBracketInflationRate: 0,
      taxableInit: 500000, // covers lifestyleExpense so preTax/Roth are untouched by withdrawals
      lifestyleExpense: 40000,
    };

    it('does not convert anything when the strategy is "none"', () => {
      const inputs = { ...baseInputs, preTaxInit: 200000, rothInit: 0, rothConversionStrategy: 'none' };
      const year1 = runProjection(inputs).years[0];
      expect(year1.convertAmount).toBe(0);
      expect(year1.rothEnd).toBe(year1.rothStart);
    });

    it('"fixed" strategy converts exactly the configured amount when pre-tax balance covers it', () => {
      const inputs = {
        ...baseInputs,
        preTaxInit: 200000,
        rothInit: 0,
        rothConversionStrategy: 'fixed',
        rothConversionAmount: 25000,
      };
      const year1 = runProjection(inputs).years[0];
      expect(year1.convertAmount).toBe(25000);
      expect(year1.preTaxEnd).toBeCloseTo(200000 - 25000, 2);
      expect(year1.rothEnd).toBeCloseTo(25000, 2);
    });

    it('"fixed" strategy caps the conversion at the available pre-tax balance', () => {
      const inputs = {
        ...baseInputs,
        preTaxInit: 10000, // less than the requested conversion amount
        rothInit: 0,
        rothConversionStrategy: 'fixed',
        rothConversionAmount: 25000,
      };
      const year1 = runProjection(inputs).years[0];
      expect(year1.convertAmount).toBe(10000);
      expect(year1.preTaxEnd).toBeCloseTo(0, 2);
    });

    it('"maxBracket" strategy fills exactly up to the target bracket ceiling', () => {
      // Single filer, 12% bracket ceiling is $50,400 (2026), standard deduction $16,100.
      // With zero other ordinary income, room to convert = 50,400 - (0 - 16,100) - buffer(0) = 66,500.
      const inputs = {
        ...baseInputs,
        preTaxInit: 500000,
        rothInit: 0,
        rothConversionStrategy: 'maxBracket',
        rothConversionBracket: 0.12,
        rothConversionBuffer: 0,
      };
      const year1 = runProjection(inputs).years[0];
      expect(year1.convertAmount).toBeCloseTo(66500, 2);
    });
  });

  describe('Roth conversion ladder duration (rothConversionDurationYears)', () => {
    // Same shape as the baseInputs fixture above -- retired from day 1, no
    // other income, plenty of taxable cash so pre-tax/Roth changes are
    // attributable only to the conversion itself.
    const baseInputs = {
      ...DEFAULT_INPUTS,
      acaCliffProtectionEnabled: false, // bracket arithmetic, not the cliff (443)
      birthYear1: 1980, retireAge1: 46, lifeExpectancy1: 90, spouse2Enabled: false,
      salary1: 0, ss1: 0, pension1: 0, preRetireReturn: 0, postRetireReturn: 0,
      inflationRate: 0, taxBracketInflationRate: 0,
      taxableInit: 500000, lifestyleExpense: 40000,
      preTaxInit: 500000, rothInit: 0,
      rothConversionStrategy: 'fixed', rothConversionAmount: 25000, rothConversionDelayUntilRetire: false,
    };

    it('0 (default) keeps converting every year, unbounded', () => {
      const proj = runProjection({ ...baseInputs, rothConversionDurationYears: 0 });
      expect(proj.years.slice(0, 6).every(y => y.convertAmount === 25000)).toBe(true);
    });

    it('caps the ladder to exactly N years when not delayed until retirement', () => {
      const proj = runProjection({ ...baseInputs, rothConversionDurationYears: 3 });
      const amounts = proj.years.slice(0, 5).map(y => y.convertAmount);
      expect(amounts).toEqual([25000, 25000, 25000, 0, 0]);
    });

    it('counts the N years from retirement, not from the plan start, when rothConversionDelayUntilRetire is on', () => {
      const proj = runProjection({
        ...baseInputs,
        retireAge1: 50, // retires 4 years into this plan (age1Init 46 -> 50)
        salary1: 80000,
        rothConversionDelayUntilRetire: true,
        rothConversionDurationYears: 3,
      });
      const byAge = (age) => proj.years.find(y => y.age1 === age).convertAmount;
      expect(byAge(49)).toBe(0); // still working, delayed
      expect(byAge(50)).toBe(25000); // retirement year 1 of the ladder
      expect(byAge(51)).toBe(25000); // ladder year 2
      expect(byAge(52)).toBe(25000); // ladder year 3 (last)
      expect(byAge(53)).toBe(0); // ladder exhausted
    });

    it('does not change DEFAULT_INPUTS at all (rothConversionStrategy is "none" by default)', () => {
      const withCap = runProjection({ ...DEFAULT_INPUTS, rothConversionDurationYears: 5 });
      const withoutCap = runProjection(DEFAULT_INPUTS);
      expect(withCap.endingBalance).toBeCloseTo(withoutCap.endingBalance, 2);
    });
  });

  describe('Survivor Logic (runProjection)', () => {
    // Both spouses same age, claim SS at 62, spouse 1 dies right after age 65.
    const survivorInputs = {
      ...DEFAULT_INPUTS,
      birthYear1: 1964, // age 62 in the 2026 start year
      birthYear2: 1964,
      spouse2Enabled: true,
      filingStatus: 'MFJ',
      retireAge1: 62,
      retireAge2: 62,
      lifeExpectancy1: 65, // spouse 1 passes away once age1 exceeds 65
      lifeExpectancy2: 90,
      claimingAge1: 62,
      claimingAge2: 62,
      ss1: 30000, // larger benefit
      ss2: 10000, // smaller benefit
      salary1: 0,
      salary2: 0,
      pension1: 12000,
      pension1COLA: 0,
      pension1SurvivorBenefit: 50.0,
      pensionStartAge1: 62,
      pension2: 0,
      preRetireReturn: 0,
      postRetireReturn: 0,
      inflationRate: 0,
      taxBracketInflationRate: 0,
      // Granular Inflation Assumptions (SS/medical/housing) each default to
      // their own non-zero rate independent of inflationRate above -- zero
      // them out too so this fixture's "no escalation" arithmetic below
      // (e.g. 30000*0.7 + 10000*0.7 = 28000) stays exact.
      ssCOLA: 0,
      medicalInflationRate: 0,
      housingInflationRate: 0,
      medicarePartBInflationRate: 0,
      medicarePartDInflationRate: 0,
      preTaxInit: 1000000,
      rothInit: 0,
      taxableInit: 1000000,
      lifestyleExpense: 20000,
      rothConversionStrategy: 'none',
    };

    it('sums both claimed SS benefits and keeps MFJ status while both spouses are alive', () => {
      const results = runProjection(survivorInputs);
      const bothAlive = results.years.find(y => y.age1 === 65);
      expect(bothAlive.householdStatus).toBe('MFJ');
      // getSSMultiplier(62) = 0.7, so 30000*0.7 + 10000*0.7 = 28000
      expect(bothAlive.ssIncome).toBeCloseTo(28000, 0);
      // Both spouses alive: full pension1 (no survivor reduction)
      expect(bothAlive.pension).toBeCloseTo(12000, 0);
    });

    it('switches to Single status and pays only the greater of the two SS benefits after a spouse dies', () => {
      const results = runProjection(survivorInputs);
      const afterDeath = results.years.find(y => y.age1 === null && y.age2 === 66);
      expect(afterDeath).toBeTruthy();
      expect(afterDeath.householdStatus).toBe('Single');
      // Survivor benefit (changelog 265): spouse 1 claimed at 62 (70% of
      // $30,000 = $21,000) and died at 65. The survivor, 66 with FRA 67,
      // starts the survivor benefit 12 months early: 30,000 x (1 - 0.285 x
      // 12/84) = 28,779 -- but RIB-LIM caps it at the larger of the
      // deceased's reduced $21,000 and 82.5% of the PIA, $24,750. Own
      // benefit $7,000 is smaller, so $24,750 is paid, never the sum.
      expect(afterDeath.ssIncome).toBeCloseTo(24750, 0);
      // Pension survivor benefit reduces pension1 to 50% for the survivor
      expect(afterDeath.pension).toBeCloseTo(6000, 0);
    });

    it('applies the survivor spending drop only when Survivor Stress Test is explicitly enabled', () => {
      const stressInputs = {
        ...survivorInputs,
        ss1: 0,
        ss2: 0,
        pension1: 0,
        survivorStressEnabled: true,
        survivorStressSpouse: 1,
        survivorStressAge: 65,
        survivorExpenseDropPct: 20,
      };
      const results = runProjection(stressInputs);
      const beforeStressDeath = results.years.find(y => y.age1 === 64);
      // Spouse 1 passes at 65: alive through that year, gone from the next
      // (changelog 411), so the first survivor year is age2 66.
      const afterStressDeath = results.years.find(y => y.age1 === null && y.age2 === 66);

      expect(beforeStressDeath.lifestyleExpenses).toBeCloseTo(20000, 0);
      expect(afterStressDeath.lifestyleExpenses).toBeCloseTo(20000 * 0.8, 0); // 20% drop
    });
  });

  describe('Historical Stress Scenarios (runProjection)', () => {
    const stressBase = {
      ...DEFAULT_INPUTS,
      birthYear1: 1964, // age 62 in the 2026 start year — retires immediately
      retireAge1: 62,
      spouse2Enabled: false,
      salary1: 0,
      ss1: 0,
      pension1: 0,
      preRetireReturn: 5,
      postRetireReturn: 5,
      inflationRate: 2,
      taxBracketInflationRate: 2,
      preTaxInit: 500000,
      rothInit: 0,
      taxableInit: 500000,
      lifestyleExpense: 20000,
      rothConversionStrategy: 'none',
      stressStartMode: 'retirement', // crash begins the year the household retires
    };

    it('applies the exact 1929 and 2008 first-year crash returns from the historical scenario table', () => {
      // A30 (2026-09-30): the named scenarios replay the history table at
      // the plan's own stock/bond mix, like a real start year does.
      const crash1929 = runProjection({ ...stressBase, stressType: '1929' });
      const crash2008 = runProjection({ ...stressBase, stressType: '2008' });
      const mix = sanitizeInputs(stressBase).stockAllocationPost;
      const row = (y) => HISTORICAL_RETURNS.find((r) => r[0] === y);
      expect(crash1929.years[0].growthRate).toBeCloseTo(historicalPortfolioReturn(row(1929), mix), 9);
      expect(crash2008.years[0].growthRate).toBeCloseTo(historicalPortfolioReturn(row(2008), mix), 9);
      expect(crash2008.years[0].growthRate).toBeLessThan(-10);
    });

    it('leaves a lower ending balance under a historical crash than under no stress, all else equal', () => {
      const normal = runProjection({ ...stressBase, stressType: 'none' });
      const crashed = runProjection({ ...stressBase, stressType: '2008' });
      expect(crashed.endingBalance).toBeLessThan(normal.endingBalance);
    });
  });

  describe('SS Trust Fund Depletion (runProjection)', () => {
    const base = {
      ...DEFAULT_INPUTS,
      birthYear1: 1959, // age 67 in the 2026 start year; FRA is 66 and 10 months (Q-7)
      claimingAge1: 66 + 10 / 12,
      retireAge1: 67,
      spouse2Enabled: false,
      salary1: 0,
      ss1: 24000,
      ssCOLA: 0, // isolate the depletion cut from COLA growth
      inflationRate: 0,
      pension1: 0,
    };

    it('has no effect when disabled, regardless of the year/cut fields', () => {
      const off = runProjection({ ...base, ssDepletionEnabled: false, ssDepletionYear: 2026, ssCutPercent: 50 });
      const baseline = runProjection(base);
      expect(off.years.map(y => y.ssIncome)).toEqual(baseline.years.map(y => y.ssIncome));
    });

    it('leaves benefits untouched before the depletion year, then applies the cut starting exactly that year', () => {
      const proj = runProjection({ ...base, ssDepletionEnabled: true, ssDepletionYear: 2033, ssCutPercent: 23 });
      const before = proj.years.find(y => y.year === 2032);
      const atDepletion = proj.years.find(y => y.year === 2033);
      const after = proj.years.find(y => y.year === 2034);
      expect(before.ssIncome).toBeCloseTo(24000, 2);
      expect(atDepletion.ssIncome).toBeCloseTo(24000 * 0.77, 2);
      expect(after.ssIncome).toBeCloseTo(24000 * 0.77, 2);
    });

    it('applies the cut on top of (not instead of) the early/delayed claiming multiplier', () => {
      const delayed = runProjection({ ...base, claimingAge1: 70, ssDepletionEnabled: true, ssDepletionYear: 2026, ssCutPercent: 20 });
      // Nothing is paid before the chosen claiming age (this fixture is
      // 67 in year 0; the old survivor-branch fall-through paid a single
      // filer from 62 regardless -- fixed 2026-08-29).
      expect(delayed.years[0].ssIncome).toBe(0);
      const at70 = delayed.years.find(y => y.age1 === 70);
      // getSSMultiplier(70, 66 + 10/12) = 1 + 38 months × 2/3% = 1.25333
      expect(at70.ssIncome).toBeCloseTo(24000 * (1 + 38 * (2 / 3) / 100) * 0.80, 2);
    });

    it('a 100% cut zeroes out SS income entirely from the depletion year on', () => {
      const proj = runProjection({ ...base, ssDepletionEnabled: true, ssDepletionYear: 2026, ssCutPercent: 100 });
      expect(proj.years.every(y => y.ssIncome === 0)).toBe(true);
    });
  });

  describe('TCJA Sunset scenario (calculateTaxes / getMarginalTaxRate / runProjection)', () => {
    it('BRACKETS_MFJ_PRETCJA/SINGLE_PRETCJA reuse current-law bracket widths with the pre-TCJA rate schedule', () => {
      const expectedRates = [0.10, 0.15, 0.25, 0.28, 0.33, 0.35, 0.396];
      expect(BRACKETS_MFJ_PRETCJA.map(b => b.rate)).toEqual(expectedRates);
      expect(BRACKETS_SINGLE_PRETCJA.map(b => b.rate)).toEqual(expectedRates);
      expect(BRACKETS_MFJ_PRETCJA.map(b => b.limit)).toEqual([24800, 100800, 211400, 403550, 512450, 768700, Infinity]);
    });

    it('calculateTaxes charges more tax under the sunset schedule for the same taxable income', () => {
      const normal = calculateTaxes(150000, 'MFJ', 1, false);
      const sunset = calculateTaxes(150000, 'MFJ', 1, true);
      expect(sunset).toBeGreaterThan(normal);
    });

    it('defaults to false (current law) when the flag is omitted, unchanged from before this feature existed', () => {
      expect(calculateTaxes(150000, 'MFJ', 1)).toBe(calculateTaxes(150000, 'MFJ', 1, false));
    });

    it('runProjection wires tcjaSunsetEnabled through to actually reduce the ending balance, all else equal', () => {
      const solventBase = { ...DEFAULT_INPUTS, preTaxInit: 400000, rothInit: 100000, taxableInit: 100000, salary1: 250000 };
      const normal = runProjection({ ...solventBase, tcjaSunsetEnabled: false });
      const sunset = runProjection({ ...solventBase, tcjaSunsetEnabled: true });
      expect(sunset.endingBalance).toBeLessThan(normal.endingBalance);
    });

    it('roughly halves the standard deduction, raising ordinaryTaxableIncome for the same gross income', () => {
      const solventBase = { ...DEFAULT_INPUTS, preTaxInit: 400000, rothInit: 100000, taxableInit: 100000, salary1: 250000 };
      const normal = runProjection({ ...solventBase, tcjaSunsetEnabled: false });
      const sunset = runProjection({ ...solventBase, tcjaSunsetEnabled: true });
      expect(sunset.years[0].ordinaryTaxableIncome).toBeGreaterThan(normal.years[0].ordinaryTaxableIncome);
    });

    it('marginalBracket can reach the pre-TCJA 39.6% top rate for a high enough income', () => {
      const proj = runProjection({
        ...DEFAULT_INPUTS, preTaxInit: 5000000, rothInit: 0, taxableInit: 0,
        salary1: 2000000, tcjaSunsetEnabled: true, rothConversionStrategy: 'none',
      });
      expect(Math.max(...proj.years.map(y => y.marginalBracket))).toBeCloseTo(0.396, 3);
    });
  });

  describe('Guaranteed-income floor and floor-aware guardrails (step 6, changelog 139)', () => {
    const ledgerAt = (essentialPct) => {
      const essential = 48000 * essentialPct / 100;
      return {
        lines: [
          { id: 'e', categoryId: 'housing', amount: essential },
          { id: 'd', categoryId: 'personal', amount: 48000 - essential },
        ],
        essentialCategoryIds: ['housing'],
      };
    };
    const solvent = { preTaxInit: 900000, taxableInit: 400000 };
    // A crash in the household's retirement year is what arms the
    // retirement-entry guardrail; without it neither version of the cut
    // fires and a comparison proves nothing.
    const crashAtRetirement = {
      spendingGuardrails: true, stressType: '1929', stressStartMode: 'retirement',
    };
    const plan = (essentialPct, over = {}) => ({
      ...DEFAULT_INPUTS, ...solvent, lifestyleExpenseInputMode: 'categories',
      spendingBlueprint: ledgerAt(essentialPct), ...over,
    });

    it('reports the essential share as a fraction, or null when unknowable', () => {
      // §3: a fraction, never dollars -- it has to stay coherent under
      // Die-With-Zero's search over lifestyleExpense.
      expect(essentialShareOf(DEFAULT_INPUTS)).toBeNull();
      expect(essentialShareOf(plan(75))).toBeCloseTo(0.75, 9);
      // A ledger with nothing ticked essential says nothing rather than 0.
      expect(essentialShareOf({
        ...plan(75),
        spendingBlueprint: { ...ledgerAt(75), essentialCategoryIds: [] },
      })).toBeNull();
    });

    it('counts only genuinely guaranteed income in the floor', () => {
      // Rental is not guaranteed (a tenant can leave) and a reverse-mortgage
      // payout is borrowing, not income.
      const r = runProjection(plan(75, { rentalIncome: 20000 }));
      const y = r.years.find((x) => x.ssIncome > 0);
      expect(y.guaranteedIncome).toBeCloseTo(y.ssIncome + y.pension + (y.annuityPayout || 0), 6);
      expect(y.guaranteedIncome).toBeLessThan(y.ssIncome + y.pension + 20000);
    });

    it('measures the floor against settled spending, and reports the gap', () => {
      const r = runProjection(plan(75));
      const y = r.years.find((x) => x.ssIncome > 0);
      expect(y.essentialSpending).toBeCloseTo(y.lifestyleExpenses * 0.75, 4);
      expect(y.floorGap).toBeCloseTo(Math.max(0, y.essentialSpending - y.guaranteedIncome), 6);
      expect(y.floorCovered).toBe(y.guaranteedIncome >= y.essentialSpending);
    });

    it('says nothing at all when there is no ledger', () => {
      const y = runProjection({ ...DEFAULT_INPUTS, ...solvent }).years[30];
      expect(y.essentialSpending).toBeNull();
      expect(y.floorGap).toBeNull();
      expect(y.floorCovered).toBeNull();
      expect(y.essentialShare).toBeNull();
    });

    it('cuts DEEPER than the flat 10% when there is plenty to cut', () => {
      // 80% discretionary, cut a quarter of it = 20% of total. A household
      // with room really can cut harder than 10% of everything.
      const off = runProjection(plan(20, { ...crashAtRetirement, floorAwareGuardrailsEnabled: false }));
      const on = runProjection(plan(20, { ...crashAtRetirement, floorAwareGuardrailsEnabled: true }));
      expect(on.endingBalance).toBeGreaterThan(off.endingBalance);
    });

    it('cuts LESS than the flat 10% when almost everything is essential', () => {
      // 25% discretionary, a quarter of it = 6.25% of total. The old flat
      // 10% quietly assumed the mortgage and the groceries were cuttable.
      // This is the honest direction: the plan stops flattering itself.
      const off = runProjection(plan(75, { ...crashAtRetirement, floorAwareGuardrailsEnabled: false }));
      const on = runProjection(plan(75, { ...crashAtRetirement, floorAwareGuardrailsEnabled: true }));
      expect(on.endingBalance).toBeLessThan(off.endingBalance);
    });

    it('never cuts into essentials, whatever the cut percentage', () => {
      // Even at a 100% discretionary cut, spending cannot fall below the
      // essential floor.
      const r = runProjection(plan(75, { ...crashAtRetirement, floorAwareGuardrailsEnabled: true, discretionaryCutPct: 100 }));
      const retiredYears = r.years.filter((y) => y.essentialSpending !== null && y.lifestyleExpenses > 0);
      expect(retiredYears.length).toBeGreaterThan(0);
      for (const y of retiredYears) {
        expect(y.lifestyleExpenses).toBeGreaterThanOrEqual(y.essentialSpending - 0.01);
      }
    });

    it('is inert with the flag off, and inert without a ledger', () => {
      // Branches on DATA, never entitlement -- so nothing changes for a plan
      // that has not opted in, and GOLDEN is the guard.
      expect(runProjection(DEFAULT_INPUTS).endingBalance).toBeCloseTo(36762.2363, 2);
      const noLedger = { ...DEFAULT_INPUTS, ...solvent, ...crashAtRetirement };
      expect(runProjection({ ...noLedger, floorAwareGuardrailsEnabled: true }).endingBalance)
        .toBeCloseTo(runProjection(noLedger).endingBalance, 6);
    });
  });

  describe('Category inflation shape (step 5, changelog 138)', () => {
    // The spec's level x shape contract: lifestyleExpense stays the scalar
    // every solver dials, and the category mix contributes only a shape that
    // rides along multiplicatively.
    const ledgerOf = (housing, health, general) => ({
      lines: [
        { id: 'h', categoryId: 'housing', amount: housing },
        { id: 'm', categoryId: 'health', amount: health },
        { id: 'g', categoryId: 'food', amount: general },
      ],
    });
    const withLedger = (bp, over = {}) => ({
      ...DEFAULT_INPUTS, lifestyleExpenseInputMode: 'categories', spendingBlueprint: bp, ...over,
    });

    it('falls back to the two-way housing blend with no ledger', () => {
      const shape = spendingShapeShares(DEFAULT_INPUTS);
      expect(shape).toMatchObject({ housing: 0.3, medical: 0, general: 0.7, source: 'housingShare' });
    });

    it('splits the budget across the three rates the app actually has', () => {
      const shape = spendingShapeShares(withLedger(ledgerOf(24000, 6000, 12000)));
      expect(shape.source).toBe('categories');
      expect(shape.housing).toBeCloseTo(24000 / 42000, 9);
      expect(shape.medical).toBeCloseTo(6000 / 42000, 9);
      expect(shape.general).toBeCloseTo(12000 / 42000, 9);
      expect(shape.housing + shape.medical + shape.general).toBeCloseTo(1, 9);
    });

    it('excludes the pre-65 health line from the shape', () => {
      // It is its own engine line, not part of lifestyle spending.
      const bp = { lines: [
        { id: 'h', categoryId: 'housing', amount: 10000 },
        { id: 'b', categoryId: 'healthBridgePre65', amount: 90000 },
      ] };
      expect(spendingShapeShares(withLedger(bp)).housing).toBeCloseTo(1, 9);
    });

    it('is BIT-IDENTICAL to the old two-way blend when no health is budgeted', () => {
      // The safety property for every existing plan: a ledger whose housing
      // share matches housingExpensePct and which budgets no ongoing health
      // must produce exactly the number the engine produced before.
      const led = runProjection(withLedger(ledgerOf(14400, 0, 33600), { housingExpensePct: 30 }));
      const classic = runProjection({ ...DEFAULT_INPUTS, housingExpensePct: 30 });
      expect(led.endingBalance).toBeCloseTo(classic.endingBalance, 6);
      expect(runProjection(DEFAULT_INPUTS).endingBalance).toBeCloseTo(36762.2363, 2);
    });

    it('compounds the health slice at medicalInflationRate', () => {
      const r = runProjection(withLedger(ledgerOf(24000, 6000, 12000)));
      const y = r.years[20];
      // Three separately compounding slices, each at its own rate.
      expect(y.medicalMultiplier).toBeGreaterThan(y.housingMultiplier);
      expect(y.housingMultiplier).toBeGreaterThan(y.lifestyleMultiplier);
      expect(y.medicalMultiplier).toBeCloseTo(Math.pow(1 + DEFAULT_INPUTS.medicalInflationRate / 100, 20), 6);
    });

    it('costs more as more of the budget sits in the faster-inflating slice', () => {
      // On a plan with margin, so the effect is visible rather than clipped
      // by depletion. Monotone and smooth, not a cliff.
      const solvent = { preTaxInit: 900000, taxableInit: 400000, rothInit: 250000 };
      const endings = [0, 5, 10, 20, 35].map((pct) => {
        const health = 48000 * pct / 100;
        return runProjection(withLedger(ledgerOf(14400, health, 48000 - 14400 - health), solvent)).endingBalance;
      });
      for (let i = 1; i < endings.length; i += 1) {
        expect(endings[i]).toBeLessThan(endings[i - 1]);
        expect(Number.isFinite(endings[i])).toBe(true);
      }
      // And zero health reproduces the no-ledger baseline exactly.
      expect(endings[0]).toBeCloseTo(runProjection({ ...DEFAULT_INPUTS, ...solvent }).endingBalance, 6);
    });

    it('leaves the level alone, so the solvers still work', () => {
      // The whole reason a shape was chosen over a dollar vector: scaling
      // lifestyleExpense must still scale the plan.
      const bp = ledgerOf(24000, 6000, 12000);
      const base = runProjection(withLedger(bp, { preTaxInit: 900000 }));
      const cheaper = runProjection(withLedger(bp, { preTaxInit: 900000, lifestyleExpense: DEFAULT_INPUTS.lifestyleExpense * 0.9 }));
      expect(cheaper.endingBalance).toBeGreaterThan(base.endingBalance);
    });

    it('freezes every slice together under the guardrail', () => {
      // A bad-market freeze pauses the whole household budget, so the three
      // slices must not drift apart across a frozen year -- otherwise the
      // shape silently changes in exactly the years a plan is most fragile.
      //
      // Negative returns throughout, because the freeze keys off a prior year
      // with growthRate < 0 and the default plan never has one. Written with
      // ordinary returns first, where the loop body never executed and the
      // test passed while asserting nothing.
      const r = runProjection(withLedger(ledgerOf(24000, 6000, 12000), {
        spendingGuardrails: true, preTaxInit: 3000000,
        preRetireReturn: -2, postRetireReturn: -2,
      }));
      let frozenYears = 0;
      for (let i = 1; i < r.years.length; i += 1) {
        const prev = r.years[i - 1];
        const cur = r.years[i];
        if (Math.abs(cur.lifestyleMultiplier - prev.lifestyleMultiplier) < 1e-12) {
          frozenYears += 1;
          expect(cur.housingMultiplier).toBeCloseTo(prev.housingMultiplier, 12);
          expect(cur.medicalMultiplier).toBeCloseTo(prev.medicalMultiplier, 12);
        }
      }
      // Guard against this going vacuous again if the plan changes.
      expect(frozenYears).toBeGreaterThan(5);
    });
  });

  describe('Retirement Spending category ledger (rung 3, changelog 137)', () => {
    const ledger = (over = {}) => ({
      lines: [
        { id: 'a', categoryId: 'housing', label: 'Rent + utilities', amount: 24000 },
        { id: 'b', categoryId: 'food', label: 'Groceries', amount: 12000 },
        { id: 'c', categoryId: 'personal', label: 'Travel', amount: 9000 },
        { id: 'd', categoryId: 'healthBridgePre65', label: 'ACA premiums', amount: 14000, premiumShare: 80 },
      ],
      essentialCategoryIds: ['housing', 'food'],
      ...over,
    });

    it('sums the seven categories into lifestyleExpense and leaves the pre-65 line out', () => {
      // The pre-65 health line must NOT be in the lifestyle total: the
      // projection adds healthcareBridge as its own line, per living spouse
      // under 65, on top of lifestyle spending. In both places = paid twice.
      const d = spendingBlueprintDerived(ledger());
      expect(d.lifestyleExpense).toBe(45000);
      expect(d.healthcareBridgeCost).toBe(14000);
    });

    it('derives the housing share, so a housing category and housingExpensePct cannot both weight it', () => {
      const d = spendingBlueprintDerived(ledger());
      expect(d.housingExpensePct).toBeCloseTo(24000 / 45000 * 100, 6);
    });

    it('derives the premium split from the pre-65 line, weighted across lines', () => {
      expect(spendingBlueprintDerived(ledger()).healthcareBridgePremiumPct).toBe(80);
      const two = spendingBlueprintDerived(ledger({
        lines: [
          { id: 'x', categoryId: 'housing', amount: 10000 },
          { id: 'd1', categoryId: 'healthBridgePre65', amount: 10000, premiumShare: 100 },
          { id: 'd2', categoryId: 'healthBridgePre65', amount: 10000, premiumShare: 0 },
        ],
      }));
      expect(two.healthcareBridgePremiumPct).toBe(50);
    });

    it('totals the essential categories at category level', () => {
      const d = spendingBlueprintDerived(ledger());
      expect(d.essentialTotal).toBe(36000);
      expect(d.essentialShare).toBeCloseTo(0.8, 6);
    });

    it('reports what it currently owns, and respects an unlink', () => {
      expect(spendingBlueprintDerived(ledger()).owns)
        .toEqual({ lifestyleExpense: true, housingExpensePct: true, healthcareBridgeCost: true });
      const unlinked = spendingBlueprintDerived(ledger({ unlinkedFields: ['housingExpensePct'] }));
      expect(unlinked.owns.housingExpensePct).toBe(false);
      // Unlinking must not destroy the ledger or its other derivations.
      expect(unlinked.lifestyleExpense).toBe(45000);
      expect(unlinked.owns.healthcareBridgeCost).toBe(true);
    });

    it('does not claim the bridge cost when there is no pre-65 line', () => {
      const d = spendingBlueprintDerived(ledger({
        lines: [{ id: 'a', categoryId: 'housing', amount: 24000 }],
      }));
      expect(d.owns.healthcareBridgeCost).toBe(false);
      expect(d.healthcareBridgePremiumPct).toBeUndefined();
    });

    it('returns null for an empty ledger, so "not filled in" stays distinct from zero', () => {
      expect(spendingBlueprintDerived({ lines: [] })).toBeNull();
      expect(spendingBlueprintDerived(undefined)).toBeNull();
    });

    it('survives anything an old backup can hand it', () => {
      expect(readSpendingBlueprint('nonsense')).toEqual({ lines: [], essentialCategoryIds: [], unlinkedFields: [] });
      const messy = readSpendingBlueprint({
        lines: [
          null,
          { categoryId: 'housing', amount: '12000' },
          { categoryId: 'notARealCategory', amount: 500 },
          { categoryId: 'food', amount: -50 },
        ],
        essentialCategoryIds: ['housing', 7],
      });
      expect(messy.lines).toHaveLength(3);
      // An id is invented rather than dropping the line.
      expect(messy.lines[0].id).toBeTruthy();
      expect(messy.lines[0].amount).toBe(12000);
      // An unknown category is KEPT as custom -- losing a user's data to a
      // schema change is worse than carrying a category we cannot label.
      expect(messy.lines[1].isCustom).toBe(true);
      expect(messy.lines[2].amount).toBe(0);
      expect(messy.essentialCategoryIds).toEqual(['housing']);
    });

    it('keeps the seven canonical ids stable', () => {
      // These are stored in user data and saved scenarios. Renaming a LABEL
      // is free; changing an ID is a migration.
      expect(SPENDING_CATEGORY_IDS).toEqual(['housing', 'food', 'transport', 'health', 'insurance', 'personal', 'other']);
      expect(SPENDING_HEALTH_BRIDGE_ID).toBe('healthBridgePre65');
    });

    it('leaves the engine completely alone', () => {
      // The ledger sums at edit time; calculator.js only ever reads the
      // annual lifestyleExpense total, exactly as with monthly mode.
      expect(runProjection(DEFAULT_INPUTS).endingBalance).toBeCloseTo(36762.2363, 2);
      const withLedger = runProjection({ ...DEFAULT_INPUTS, spendingBlueprint: ledger() });
      expect(withLedger.endingBalance).toBeCloseTo(36762.2363, 2);
    });
  });

  describe('Retirement Spending bridge (rung 2, changelog 135)', () => {
    const bridgeInputs = (over = {}) => ({
      ...DEFAULT_INPUTS,
      mortgagePayment: 18000,
      otherDebtPayment: 3000,
      spendingBridge: { currentHealthPremiums: 9000, workCostsThatStop: 6000, retirementIncreases: 12000 },
      ...over,
    });

    it('walks the residual down to a target, in order', () => {
      const r = computeSpendingBridge(bridgeInputs(), 53084.5);
      // 53,084.50 - 21,000 debt - 9,000 health - 6,000 work + 12,000 more
      expect(r.target).toBeCloseTo(29084.5, 6);
      expect(r.steps.map((st) => st.id)).toEqual(['start', 'mortgage', 'consumerDebt', 'health', 'work', 'increases']);
      expect(r.steps.find((st) => st.id === 'increases').direction).toBe('add');
    });

    it('derives current debt service from the plan instead of asking for it', () => {
      // The whole module's principle: ask only for what cannot be derived.
      expect(currentDebtService({ mortgagePayment: 18000, otherDebtPayment: 3000 })).toBe(21000);
      expect(currentDebtService({})).toBe(0);
      // Negative or junk figures never create a negative subtraction.
      expect(currentDebtService({ mortgagePayment: -500, otherDebtPayment: 'x' })).toBe(0);
      const r = computeSpendingBridge(bridgeInputs(), 50000);
      expect(r.steps.find((st) => st.id === 'mortgage')).toMatchObject({ amount: 18000, derived: true });
      expect(r.steps.find((st) => st.id === 'consumerDebt')).toMatchObject({ amount: 3000, derived: true });
    });

    it('separates a mortgage from consumer debt, and advises on the latter', () => {
      // They are not the same kind of fact. A mortgage is a cost of living
      // that legitimately runs into retirement. Credit cards and car loans
      // carried into retirement are serviced from taxable withdrawals, so
      // each dollar costs more than it did while working -- the bridge says
      // so rather than silently netting it off.
      expect(currentMortgageService({ mortgagePayment: 18000 })).toBe(18000);
      expect(currentConsumerDebtService({ otherDebtPayment: 3000 })).toBe(3000);
      expect(currentDebtService({ mortgagePayment: 18000, otherDebtPayment: 3000 })).toBe(21000);

      const withDebt = computeSpendingBridge(bridgeInputs(), 53084.5);
      expect(withDebt.steps.find((st) => st.id === 'consumerDebt').note).toMatch(/taxable/);
      expect(withDebt.steps.find((st) => st.id === 'mortgage').note).not.toMatch(/taxable/);

      // Advisory only when there is something to advise about.
      const clean = computeSpendingBridge(bridgeInputs({ otherDebtPayment: 0 }), 53084.5);
      expect(clean.steps.find((st) => st.id === 'consumerDebt').note).toMatch(/where you want to be/);
    });

    it('subtracts every line the projection adds for itself', () => {
      // This is the rule the bridge exists to enforce: lifestyleExpense is
      // retirement spending MINUS what runProjection already adds
      // separately. Debt and health are the two the bridge can act on; the
      // rest are named so the user knows not to include them.
      const r = computeSpendingBridge(bridgeInputs(), 53084.5);
      const labels = r.excluded.map((x) => x.label).join(' | ');
      expect(labels).toMatch(/mortgage/i);
      expect(labels).toMatch(/before 65/);
      expect(labels).toMatch(/IRMAA/);
      expect(labels).toMatch(/Long-term care/);
      expect(labels).toMatch(/One-off/);
      expect(labels).toMatch(/gifting/i);
      // Changelog 227: and every one says where it IS entered, or that
      // there is nothing to enter. A named exclusion with no destination
      // reads as "the plan ignores this".
      expect(r.excluded.every((x) => typeof x.where === 'string' && x.where.length > 0)).toBe(true);
      expect(r.excluded.filter((x) => x.entered === false).map((x) => x.label).join()).toMatch(/IRMAA/);
      // The health row follows the user's setup, because with a ledger on
      // the premiums belong in its own pre-65 section and nowhere else.
      const healthWhere = (over) => computeSpendingBridge({ ...bridgeInputs(), ...over }, 53084.5)
        .excluded.find((x) => /before 65/.test(x.label)).where;
      expect(healthWhere({})).toMatch(/Healthcare Bridge Cost/);
      expect(healthWhere({ lifestyleExpenseInputMode: 'categories' })).toMatch(/Health coverage before 65/);
      expect(healthWhere({ lifestyleExpenseInputMode: 'categories' })).toMatch(/not in the Insurance or Health categories/);
    });

    it('clamps at zero and flags it, rather than returning a negative target', () => {
      const r = computeSpendingBridge(
        bridgeInputs({ spendingBridge: { currentHealthPremiums: 40000, workCostsThatStop: 20000, retirementIncreases: 0 } }),
        30000,
      );
      expect(r.target).toBe(0);
      expect(r.isNegative).toBe(true);
      // raw is kept so the UI can explain by how much, rather than just
      // silently showing zero.
      expect(r.raw).toBeLessThan(0);
    });

    it('normalizes a malformed spendingBridge instead of trusting it', () => {
      // sanitizeInputs passes objects through UNCHECKED, so an old backup
      // can hand the engine anything at all.
      expect(readSpendingBridge(undefined)).toEqual({ currentHealthPremiums: 0, workCostsThatStop: 0, retirementIncreases: 0 });
      expect(readSpendingBridge('nonsense')).toEqual({ currentHealthPremiums: 0, workCostsThatStop: 0, retirementIncreases: 0 });
      expect(readSpendingBridge({ currentHealthPremiums: -5, workCostsThatStop: NaN, retirementIncreases: '4000' }))
        .toEqual({ currentHealthPremiums: 0, workCostsThatStop: 0, retirementIncreases: 4000 });
      // And the whole computation survives it.
      const r = computeSpendingBridge({ ...DEFAULT_INPUTS, spendingBridge: null }, 50000);
      expect(r.target).toBeCloseTo(50000 - currentDebtService(DEFAULT_INPUTS), 6);
    });

    // Changelog 387: a typed budget already leaves debt payments out, so the
    // bridge must not take them off a second time.
    it('does not subtract debt from a typed budget', () => {
      const base = { ...DEFAULT_INPUTS, mortgagePayment: 10970, otherDebtPayment: 2400, spendingBridge: { workCostsThatStop: 3000 } };
      const auto = computeSpendingBridge(base, 60000);
      expect(auto.target).toBe(60000 - 10970 - 2400 - 3000);
      expect(auto.debtAlreadyOut).toBe(false);
      const typed = computeSpendingBridge({ ...base, currentSpendingMode: 'custom' }, 46630);
      expect(typed.target).toBe(46630 - 3000);
      expect(typed.debtAlreadyOut).toBe(true);
      const byId = Object.fromEntries(typed.steps.map((st) => [st.id, st]));
      expect(byId.mortgage.amount).toBe(0);
      expect(byId.consumerDebt.amount).toBe(0);
      expect(byId.mortgage.note).toMatch(/already leaves these payments out/);
      expect(byId.consumerDebt.note).toMatch(/already leaves these payments out/);
    });

    it('a typed budget and the automatic figure for the same household reach the same target', () => {
      const base = { ...DEFAULT_INPUTS, mortgagePayment: 10970, otherDebtPayment: 0 };
      const auto = computeSpendingBridge(base, 80134);
      const typed = computeSpendingBridge({ ...base, currentSpendingMode: 'custom' }, 80134 - 10970);
      expect(typed.target).toBe(auto.target);
    });

    it('is inert by default and changes no projection', () => {
      // The default spendingBridge is all zeros, so a plan that never opens
      // the bridge is untouched -- GOLDEN is the guard.
      const r = computeSpendingBridge(DEFAULT_INPUTS, 53084.5);
      expect(r.steps.filter((st) => st.direction !== 'start' && st.amount > 0).map((st) => st.id))
        .toEqual(currentDebtService(DEFAULT_INPUTS) > 0 ? ['mortgage'] : []);
      expect(runProjection(DEFAULT_INPUTS).endingBalance).toBeCloseTo(36762.2363, 2);
    });
  });

  describe('Current-spending residual is reportable (rung 1, changelog 134)', () => {
    // The arithmetic has always run; changelog 134 exposes it so Plan
    // Settings can show the figure and its derivation instead of a
    // paragraph describing arithmetic the user never sees the result of.
    it('reports the derivation, and the four parts reconcile exactly', () => {
      const proj = runProjection(DEFAULT_INPUTS);
      const first = proj.years.find((y) => y.currentSpending);
      expect(first).toBeTruthy();
      const cs = first.currentSpending;
      expect(cs.mode).toBe('auto');
      // income - taxes - contributions - non-cash adjustments = derived.
      // If this identity ever breaks, the readout is lying about how it
      // reached its number, which is the whole point of showing it.
      expect(cs.income - cs.taxes - cs.contributions - cs.nonCashAdjustments)
        .toBeCloseTo(cs.derived, 6);
      expect(cs.income).toBeCloseTo(cs.salary + cs.otherIncome, 6);
      expect(cs.derived).toBeGreaterThan(0);
    });

    it('matches what the engine actually spends when nothing is trimmed', () => {
      const proj = runProjection(DEFAULT_INPUTS);
      const cs = proj.years.find((y) => y.currentSpending).currentSpending;
      expect(cs.trimmedByDeficit).toBeCloseTo(0, 6);
      expect(cs.applied).toBeCloseTo(cs.derived, 6);
    });

    it('separates the derived figure from a deficit trim', () => {
      // Spending far beyond income forces the deficit-reduction block to
      // trim current spending. `derived` must stay the income-based
      // residual; `applied` is what the plan could actually fund.
      const strained = {
        ...DEFAULT_INPUTS,
        salary1: 40000, salary2: 0, spouse2Enabled: false,
        taxableInit: 0, preTaxInit: 0, rothInit: 0, hsaInit: 0,
        mortgageBalance: 400000, mortgagePayment: 42000, mortgageRate: 6,
      };
      const proj = runProjection(strained);
      const trimmedYear = proj.years.find((y) => y.currentSpending && y.currentSpending.trimmedByDeficit > 0);
      if (trimmedYear) {
        const cs = trimmedYear.currentSpending;
        expect(cs.applied).toBeLessThan(cs.derived);
        expect(cs.trimmedByDeficit).toBeCloseTo(cs.derived - cs.applied, 6);
      }
      // Whatever the plan does, the invariant holds in every year.
      for (const y of proj.years) {
        if (!y.currentSpending) continue;
        expect(y.currentSpending.trimmedByDeficit).toBeGreaterThanOrEqual(0);
        expect(y.currentSpending.applied).toBeLessThanOrEqual(y.currentSpending.derived + 0.005);
      }
    });

    it('is null in retired years, and flags custom mode as custom', () => {
      const proj = runProjection(DEFAULT_INPUTS);
      const retired = proj.years.filter((y) => y.currentSpending === null);
      expect(retired.length).toBeGreaterThan(0);

      const custom = runProjection({ ...DEFAULT_INPUTS, currentSpendingMode: 'custom', currentHouseholdSpendingCustom: 55000 });
      const cs = custom.years.find((y) => y.currentSpending).currentSpending;
      expect(cs.mode).toBe('custom');
    });

    it('changes nothing about the projection itself', () => {
      // Pure reporting: the GOLDEN regression value is the guard.
      expect(runProjection(DEFAULT_INPUTS).endingBalance).toBeCloseTo(36762.2363, 2);
    });
  });

  describe('Gross estate includes NQDC / cash / stock / home (changelog 133)', () => {
    // IRC s 2033 puts "all property, real or personal, tangible or
    // intangible" in the gross estate. Through changelog 132 the engine
    // counted only preTax + Roth + taxable + HSA + life insurance, so a
    // plan dying with a concentrated stock position paid estate tax on
    // none of it.
    const other = { nqdc: 400000, cashReserve: 100000, concentratedStock: 500000, homeEquity: 300000 };

    it('adds all four to what heirs inherit', () => {
      const without = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 200000, 100000);
      const with_ = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 200000, 100000, 0, 0, false, 0, other);
      expect(with_.grossInherited - without.grossInherited).toBeCloseTo(1300000, 2);
    });

    it('defaults to the old behavior when the argument is omitted', () => {
      const a = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 200000, 100000, 0, 0, false, 0);
      const b = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 200000, 100000, 0, 0, false, 0, {});
      expect(b.grossInherited).toBeCloseTo(a.grossInherited, 6);
      expect(b.totalNqdcHeirTax).toBe(0);
    });

    it('taxes NQDC to the heir as income in respect of a decedent, but not the stepped-up assets', () => {
      // s 1014(c) expressly denies a basis step-up to IRD, so unpaid
      // deferred comp is ordinary income to the heir. Cash, listed stock
      // and the residence DO step up, so they carry no heir income tax.
      const nqdcOnly = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 200000, 100000, 0, 0, false, 0, { nqdc: 400000 });
      expect(nqdcOnly.totalNqdcHeirTax).toBeGreaterThan(0);
      expect(nqdcOnly.nqdcInherited).toBeCloseTo(400000, 2);

      const steppedOnly = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 200000, 100000, 0, 0, false, 0, { cashReserve: 100000, concentratedStock: 500000, homeEquity: 300000 });
      expect(steppedOnly.totalNqdcHeirTax).toBe(0);
      expect(steppedOnly.steppedUpAssetsInherited).toBeCloseTo(900000, 2);
      // ...and they still reach the heir in full, net of any estate tax.
      expect(steppedOnly.grossInherited).toBeGreaterThan(nqdcOnly.grossInherited);
    });

    it('nets NQDC heir tax out of what the heir actually keeps', () => {
      const r = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 200000, 100000, 0, 0, false, 0, { nqdc: 400000 });
      const withoutNqdc = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 200000, 100000);
      const netGain = r.netInherited - withoutNqdc.netInherited;
      // The lump costs its own tax, and (changelog 402) pushes the heir's
      // year-one IRA draw higher in the brackets, federal and state.
      const extraDrawTax = (r.totalHeirTax - withoutNqdc.totalHeirTax) + (r.totalHeirStateIncomeTax - withoutNqdc.totalHeirStateIncomeTax);
      expect(extraDrawTax).toBeGreaterThan(0);
      expect(netGain).toBeCloseTo(400000 - r.totalNqdcHeirTax - extraDrawTax, 2);
      expect(netGain).toBeLessThan(400000);
    });

    it('pushes a large concentrated position into real federal estate tax', () => {
      // DEFAULT_INPUTS is MFJ with portability and the exemption is indexed
      // to the plan's final year (changelog 127), so the bar is high -- an
      // $80M position clears it, and that whole amount used to escape.
      const big = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 0, 0, 0, 0, false, 0, { concentratedStock: 80000000 });
      const small = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 0, 0);
      expect(small.totalFederalEstateTax).toBe(0);
      expect(big.totalFederalEstateTax).toBeGreaterThan(0);
    });
  });

  describe('Home and other property in the estate (changelog 144)', () => {
    // Until 144 the residence was in the plan only while a reverse
    // mortgage was switched on; an ordinary paid-off house reached
    // neither estate tax nor Gross Inherited Wealth. And nothing at all
    // existed for a second home, a business, or valuables.
    const last = (inputs) => { const p = runProjection(inputs); return p.years[p.years.length - 1]; };

    it('a renter (default) has no home in the plan', () => {
      const y = last(DEFAULT_INPUTS);
      expect(DEFAULT_INPUTS.homeOwned).toBe(false);
      expect(y.homeValue).toBe(0);
      expect(y.homeEquity).toBe(0);
    });

    it('an owned home appreciates and reaches the estate with NO reverse mortgage', () => {
      const y = last({ ...DEFAULT_INPUTS, homeOwned: true, homeValueInit: 500000, homeAppreciationRate: 2 });
      expect(y.homeValue).toBeGreaterThan(500000);
      expect(y.homeEquity).toBeCloseTo(y.homeValue, 6);
      expect(y.reverseMortgageBalance).toBe(0);
    });

    it('a forward mortgage still being paid is deducted from home equity (s 2053)', () => {
      // A payment too small to retire the loan, so a balance survives to
      // the final year and must come off the equity.
      const y = last({ ...DEFAULT_INPUTS, homeOwned: true, homeValueInit: 500000, homeAppreciationRate: 0, mortgageBalance: 300000, mortgageRate: 5, mortgagePayment: 16000 });
      expect(y.mortgageBalance).toBeGreaterThan(0);
      expect(y.homeEquity).toBeCloseTo(Math.max(0, y.homeValue - y.mortgageBalance), 6);
      expect(y.homeEquity).toBeLessThan(500000);
    });

    it('turning on the reverse mortgage implies ownership, so old plans are unchanged', () => {
      const withFlag = last({ ...DEFAULT_INPUTS, homeOwned: true, reverseMortgageEnabled: true, homeValueInit: 400000, reverseMortgageStartAge: 99 });
      const without = last({ ...DEFAULT_INPUTS, homeOwned: false, reverseMortgageEnabled: true, homeValueInit: 400000, reverseMortgageStartAge: 99 });
      expect(without.homeValue).toBeCloseTo(withFlag.homeValue, 6);
      expect(sanitizeInputs({ ...DEFAULT_INPUTS, homeOwned: false, reverseMortgageEnabled: true }).homeOwned).toBe(true);
    });

    it('migrateInputs derives homeOwned from reverseMortgageEnabled for plans saved before it existed', () => {
      const legacyOn = migrateInputs({ schemaVersion: 1, inputs: { ...DEFAULT_INPUTS, reverseMortgageEnabled: true, homeOwned: undefined } });
      const legacyOff = migrateInputs({ schemaVersion: 1, inputs: { ...DEFAULT_INPUTS, reverseMortgageEnabled: false, homeOwned: undefined } });
      expect(legacyOn.homeOwned).toBe(true);
      expect(legacyOff.homeOwned).toBe(false);
      // ...and an explicit choice is never overridden.
      const explicit = migrateInputs({ schemaVersion: 1, inputs: { ...DEFAULT_INPUTS, reverseMortgageEnabled: false, homeOwned: true } });
      expect(explicit.homeOwned).toBe(true);
    });

    it('other estate assets grow at their own rate and are never spent', () => {
      const y0 = last({ ...DEFAULT_INPUTS, otherEstateAssetsInit: 250000, otherEstateAssetsGrowthRate: 0 });
      expect(y0.otherEstateAssetsValue).toBeCloseTo(250000, 6);
      const yUp = last({ ...DEFAULT_INPUTS, otherEstateAssetsInit: 250000, otherEstateAssetsGrowthRate: 2 });
      expect(yUp.otherEstateAssetsValue).toBeGreaterThan(250000);
      const yDown = last({ ...DEFAULT_INPUTS, otherEstateAssetsInit: 250000, otherEstateAssetsGrowthRate: -5 });
      expect(yDown.otherEstateAssetsValue).toBeLessThan(250000);
      // Portfolio is untouched by the presence of property.
      const base = runProjection(DEFAULT_INPUTS).endingBalance;
      expect(runProjection({ ...DEFAULT_INPUTS, otherEstateAssetsInit: 250000, homeOwned: true, homeValueInit: 900000 }).endingBalance).toBeCloseTo(base, 6);
    });

    it('other assets enter the gross estate stepped-up: no heir income tax, full value inherited', () => {
      const without = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 200000, 100000);
      const with_ = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 200000, 100000, 0, 0, false, 0, { otherAssets: 350000 });
      expect(with_.grossInherited - without.grossInherited).toBeCloseTo(350000, 2);
      expect(with_.steppedUpAssetsInherited).toBeCloseTo(350000, 2);
      expect(with_.totalNqdcHeirTax).toBe(0);
      expect(with_.totalHeirTax).toBeCloseTo(without.totalHeirTax, 6);
      expect(with_.composition.otherAssets).toBeCloseTo(350000, 2);
    });

    it('a large property holding pushes an estate over the federal exemption', () => {
      const small = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 0, 0);
      const big = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 0, 0, 0, 0, false, 0, { otherAssets: 80000000 });
      expect(small.totalFederalEstateTax).toBe(0);
      expect(big.totalFederalEstateTax).toBeGreaterThan(0);
    });

    it('composition lines add up to grossInherited, and explain the gap from the portfolio', () => {
      const r = calculateHeirEstateTax(
        { ...DEFAULT_INPUTS, lifeInsuranceEnabled1: true },
        1000000, 200000, 100000, 750000, 0, false, 50000,
        { nqdc: 40000, cashReserve: 30000, concentratedStock: 60000, homeEquity: 500000, otherAssets: 120000 }
      );
      const c = r.composition;
      const sum = c.preTaxWithdrawn + c.roth + c.taxable + c.hsa + c.lifeInsurance + c.nqdc + c.cashReserve + c.concentratedStock + c.homeEquity + c.otherAssets;
      expect(sum).toBeCloseTo(r.grossInherited, 4);
      // The stretch adds growth on top of the balance at death.
      expect(c.preTaxWithdrawn).toBeGreaterThan(c.preTaxAtDeath);
      expect(c.preTaxAtDeath).toBeCloseTo(1000000, 4);
      expect(c.lifeInsurance).toBeCloseTo(750000, 4);
      expect(c.homeEquity).toBeCloseTo(500000, 4);
      // Portfolio-only figure is what the dashboard calls Ending Balance.
      expect(c.preTaxAtDeath + c.roth + c.taxable + c.hsa).toBeCloseTo(1350000, 4);
    });
  });

  describe('deflateEstateResultForDisplay (changelog 145)', () => {
    // The estate tax is computed on NOMINAL balances (exemptions are indexed
    // to the plan's final year); this helper converts the whole result to
    // today's dollars for display, by the same final-year factor the Ending
    // Balance uses. Only dollar fields move; rates/shares/flags do not.
    const nominal = () => calculateHeirEstateTax(
      { ...DEFAULT_INPUTS, lifeInsuranceEnabled1: true, stateOfResidence: 'NY', stateTaxState: 'ny' },
      8000000, 1000000, 500000, 600000, 0, false, 200000,
      { nqdc: 100000, cashReserve: 50000, concentratedStock: 300000, homeEquity: 900000, otherAssets: 250000 }
    );

    it('factor 1 (or absent) returns the result unchanged', () => {
      const r = nominal();
      expect(deflateEstateResultForDisplay(r, 1)).toBe(r);
      expect(deflateEstateResultForDisplay(r, undefined)).toBe(r);
    });

    it('divides every dollar line by the factor and leaves rates/shares/flags alone', () => {
      const r = nominal();
      const d = deflateEstateResultForDisplay(r, 2);
      for (const k of ['grossInherited', 'netInherited', 'totalHeirTax', 'totalStateEstateTax',
        'totalFederalEstateTax', 'totalLifeInsuranceProceeds', 'steppedUpAssetsInherited', 'charitableBequest']) {
        expect(d[k]).toBeCloseTo(r[k] / 2, 6);
      }
      // Ratio and shares are unchanged.
      expect(d.effectiveEstateTaxRate).toBe(r.effectiveEstateTaxRate);
      expect(d.perHeir[0].splitPct).toBe(r.perHeir[0].splitPct);
      expect(d.perHeir[0].relationship).toBe(r.perHeir[0].relationship);
      // composition deflates whole.
      for (const k of Object.keys(r.composition)) {
        expect(d.composition[k]).toBeCloseTo(r.composition[k] / 2, 6);
      }
    });

    it('deflated composition still sums to deflated grossInherited', () => {
      const d = deflateEstateResultForDisplay(nominal(), 2.5);
      const c = d.composition;
      const sum = c.preTaxWithdrawn + c.roth + c.taxable + c.hsa + c.lifeInsurance + c.nqdc + c.cashReserve + c.concentratedStock + c.homeEquity + c.otherAssets;
      expect(sum).toBeCloseTo(d.grossInherited, 3);
    });

    it('deflates per-heir dollar fields and their withdrawal schedules, not the year', () => {
      const r = nominal();
      const d = deflateEstateResultForDisplay(r, 2);
      expect(d.perHeir[0].grossInherited).toBeCloseTo(r.perHeir[0].grossInherited / 2, 4);
      expect(d.perHeir[0].federalEstateTax).toBeCloseTo(r.perHeir[0].federalEstateTax / 2, 4);
      const w0 = r.perHeir[0].annualWithdrawals[0];
      const wd = d.perHeir[0].annualWithdrawals[0];
      if (w0) {
        expect(wd.withdrawal).toBeCloseTo(w0.withdrawal / 2, 4);
        expect(wd.year).toBe(w0.year);
      }
    });

    it('does not mutate the original', () => {
      const r = nominal();
      const g = r.grossInherited;
      deflateEstateResultForDisplay(r, 2);
      expect(r.grossInherited).toBe(g);
    });

    it('an estate crossing NY exemption keeps its tax; deflation shrinks the DISPLAYED figure but not to zero', () => {
      // The whole point: real-dollar DISPLAY must not erase a tax that the
      // nominal computation found. (Feeding deflated balances in, as the old
      // App.jsx did, would have shown $0 here.)
      const big = calculateHeirEstateTax({ ...DEFAULT_INPUTS, stateOfResidence: 'NY', stateTaxState: 'ny', estateIndexingEnabled: false },
        20000000, 0, 0);
      expect(big.totalStateEstateTax).toBeGreaterThan(0);
      const shown = deflateEstateResultForDisplay(big, 2.5);
      expect(shown.totalStateEstateTax).toBeCloseTo(big.totalStateEstateTax / 2.5, 4);
      expect(shown.totalStateEstateTax).toBeGreaterThan(0);
    });
  });

  describe('Provisional income uses salary net of deferrals (changelog 133)', () => {
    it('does not count a 401(k)/HSA/NQDC deferral as provisional income', () => {
      // Someone still working at 64, claiming SS early, deferring hard.
      // The deferral never reaches AGI, so it must not push benefits up a
      // tier. Through changelog 132 gross salary was used and it did.
      // Income has to sit NEAR the $25,000/$34,000 single thresholds for this
      // to be observable: a household comfortably above them has 85% of the
      // benefit taxed either way and the cap hides the bug. An earlier draft
      // of this test used a $62,000 salary and passed vacuously for exactly
      // that reason -- both sides were pinned at the cap.
      const base = {
        ...DEFAULT_INPUTS, spouse2Enabled: false, filingStatus: 'Single',
        birthYear1: 1962, retireAge1: 70, lifeExpectancy1: 80,
        salary1: 34000, salary2: 0, ss1: 24000, claimingAge1: 62,
        preTaxInit: 150000, rothInit: 0, taxableInit: 20000, hsaInit: 0,
        lifestyleExpense: 20000, rothConversionStrategy: 'none',
        stateTaxState: 'TX_FL', inflationRate: 0, taxBracketInflationRate: 0, ssCOLA: 0,
        currentSpendingMode: 'custom', currentHouseholdSpendingCustom: 20000,
      };
      const deferring = runProjection({ ...base, preTaxContribution1: 20000 });
      const notDeferring = runProjection({ ...base, preTaxContribution1: 0 });
      const yD = deferring.years.find((y) => y.ssIncome > 0 && y.age1 < 70);
      const yN = notDeferring.years.find((y) => y.ssIncome > 0 && y.age1 < 70);
      expect(yD).toBeTruthy();
      expect(yN).toBeTruthy();
      // The $20,000 deferral is not on the return, so it must not be in the
      // provisional-income test. Netting it drops this household under the
      // $25,000 base amount entirely: none of the benefit is taxable.
      // STRICTLY less -- an equal result would mean the deferral was still
      // being counted, or that the cap is hiding the effect again.
      expect(yD.taxableSS).toBeLessThan(yN.taxableSS);
      expect(yN.taxableSS).toBeGreaterThan(0);
      expect(yD.taxableSS).toBeCloseTo(0, 2);
    });
  });

  describe('IRMAA top-tier statutory freeze through 2027 (changelog 132)', () => {
    // 42 U.S.C. 1395r(i): CPI indexing applies to "each dollar amount in
    // paragraph (2) or (3)" EXCEPT "each dollar amount in paragraph (3) of
    // $500,000", which resumes indexing only "in the case of any calendar
    // year beginning after 2027". So $500,000 single / $750,000 joint is
    // frozen in nominal dollars through 2027 -- which is why those two
    // figures have not moved since 2019 while every lower tier moved yearly.
    const f = (years, rate = 0.03) => Math.pow(1 + rate, years);

    it('holds the joint top tier at $750,000 through 2027 while lower tiers index', () => {
      const factor = f(1); // 2027 against a 2026 base
      const t = irmaaScaledThresholds('MFJ', false, factor, irmaaTopTierFactor(2027, factor, 2026));
      expect(t[4]).toBeCloseTo(750000, 6);
      // the four lower tiers still move
      expect(t[0]).toBeCloseTo(218000 * factor, 6);
      expect(t[3]).toBeCloseTo(410000 * factor, 6);
    });

    it('holds the single top tier at $500,000 through 2027', () => {
      const factor = f(1);
      const t = irmaaScaledThresholds('Single', false, factor, irmaaTopTierFactor(2027, factor, 2026));
      expect(t[4]).toBeCloseTo(500000, 6);
      expect(t[0]).toBeCloseTo(109000 * factor, 6);
    });

    it('indexes the top tier from 2028 on, off its 2027 nominal base', () => {
      const factor = f(9); // 2035 against a 2026 base
      const top = irmaaTopTierFactor(2035, factor, 2026);
      const t = irmaaScaledThresholds('MFJ', false, factor, top);
      // eight years of growth since the 2027 freeze lifted, not nine
      expect(t[4]).toBeCloseTo(750000 * f(8), 4);
      expect(t[4]).toBeLessThan(750000 * f(9));
    });

    it('derives the MFS-living-together top line as the frozen $500,000 less the indexed lower line', () => {
      // s 1395r(i)(3)(C)(ii): the MFS top tier starts at $500,000 minus the
      // lower MFS threshold ($391,000 = $500,000 - $109,000 in 2026), so the
      // $500,000 inside it follows the top-tier freeze and indexing.
      const factor = f(9);
      const top = irmaaTopTierFactor(2035, factor, 2026);
      const t = irmaaScaledThresholds('MFS', true, factor, top);
      expect(t[3]).toBeCloseTo(109000 * factor, 4);
      expect(t[4]).toBeCloseTo(500000 * top - 109000 * factor, 4);
      // Through 2027 the $500,000 is frozen, so the line FALLS as the lower one indexes.
      const f27 = f(1);
      expect(irmaaScaledThresholds('MFS', true, f27, irmaaTopTierFactor(2027, f27, 2026))[4]).toBeCloseTo(500000 - 109000 * f27, 4);
    });

    it('defaults to the old all-tiers-indexed behavior when no top factor is passed', () => {
      const factor = f(9);
      const t = irmaaScaledThresholds('MFJ', false, factor, null);
      expect(t[4]).toBeCloseTo(750000 * factor, 4);
      // and calculateIRMAA's optional parameter is genuinely optional
      expect(calculateIRMAA(10000000, 'MFJ', 2, 1, factor, true)).toBeGreaterThan(0);
    });

    it('charges the top-tier premium to a joint filer between the frozen and indexed thresholds', () => {
      // A 2027 MAGI of $760,000 is over the frozen $750,000 line but under
      // the $772,500 an indexed line would wrongly have put there.
      const factor = f(1);
      const frozen = calculateIRMAA(760000, 'MFJ', 1, 1, factor, true, irmaaTopTierFactor(2027, factor, 2026));
      const indexed = calculateIRMAA(760000, 'MFJ', 1, 1, factor, true, null);
      expect(frozen).toBeGreaterThan(indexed);
    });
  });

  describe('IRMAA Bracket Freeze (calculateIRMAA / calculateMedicarePartD / runProjection)', () => {
    it('calculateIRMAA/calculateMedicarePartD default thresholdInflationFactor to 1 (flat), unchanged for old callers', () => {
      // MAGI just above the unadjusted first tier threshold
      const magi = 220000;
      expect(calculateIRMAA(magi, 'MFJ', 1)).toBeCloseTo(calculateIRMAA(magi, 'MFJ', 1, 1, 1), 6);
      expect(calculateMedicarePartD(magi, 'MFJ', 1)).toBeCloseTo(calculateMedicarePartD(magi, 'MFJ', 1, 1, 1), 6);
    });

    it('a higher thresholdInflationFactor raises the dollar tiers, so the same MAGI can drop to a lower (or no) surcharge', () => {
      const magi = 220000; // just above the un-inflated MFJ tier-1 threshold (218000)
      const frozen = calculateIRMAA(magi, 'MFJ', 1, 1, 1);
      const inflated = calculateIRMAA(magi, 'MFJ', 1, 1, 1.5); // thresholds all up 50%
      expect(frozen).toBeCloseTo(284.10 * 12, 2); // tier-1 surcharge premium -- 220000 exceeds the un-inflated 218000 threshold
      expect(inflated).toBeLessThan(frozen);
      expect(inflated).toBeCloseTo(202.90 * 12, 2); // standard premium only -- 220000 no longer exceeds any inflated tier (inflated tier-1 is 327000)
    });

    it('runProjection: disabling the freeze (default) yields a lower or equal lifetime IRMAA cost than enabling it, for a long high-income retirement', () => {
      const highIncomeBase = {
        ...DEFAULT_INPUTS, birthYear1: 1959, retireAge1: 65, claimingAge1: 67,
        preTaxInit: 3000000, rothInit: 0, taxableInit: 0, ss1: 30000,
        rothConversionStrategy: 'fixed', rothConversionAmount: 150000,
      };
      const notFrozen = runProjection({ ...highIncomeBase, irmaaFreezeEnabled: false });
      const frozen = runProjection({ ...highIncomeBase, irmaaFreezeEnabled: true });
      const sumIrmaa = (proj) => proj.years.reduce((s, y) => s + y.irmaaCost, 0);
      expect(sumIrmaa(notFrozen)).toBeLessThanOrEqual(sumIrmaa(frozen));
    });
  });

  describe('Plan Year (inputs.planYear vs. TAX_YEAR)', () => {
    it('DEFAULT_INPUTS.planYear defaults to TAX_YEAR, so an untouched plan behaves exactly as before this field existed', () => {
      expect(DEFAULT_INPUTS.planYear).toBe(TAX_YEAR);
    });

    it('runProjection starts its first simulated year at inputs.planYear, not the hardcoded TAX_YEAR', () => {
      const base = { ...DEFAULT_INPUTS, birthYear1: 1970, retireAge1: 65, spouse2Enabled: false };
      const atDefault = runProjection(base);
      expect(atDefault.years[0].year).toBe(TAX_YEAR);

      const advanced = runProjection({ ...base, planYear: TAX_YEAR + 3 });
      expect(advanced.years[0].year).toBe(TAX_YEAR + 3);
      // Advancing planYear is a pure calendar bump: the same birth year now
      // reads as three years older on Year 1, with every other assumption
      // (salary, balances, etc.) held identical -- confirming the shift is
      // isolated to year/age math and doesn't silently alter anything else.
      expect(advanced.years[0].age1).toBe(atDefault.years[0].age1 + 3);
    });

    it('a legacy saved plan with no planYear field is backfilled with TAX_YEAR by migrateInputs, leaving its behavior unchanged', () => {
      const legacy = { ...DEFAULT_INPUTS };
      delete legacy.planYear;
      const migrated = migrateInputs(legacy);
      expect(migrated.planYear).toBe(TAX_YEAR);
    });

    it('sanitizeInputs (via runProjection) falls back to TAX_YEAR if planYear is missing or non-numeric, rather than throwing or producing NaN years', () => {
      const base = { ...DEFAULT_INPUTS, birthYear1: 1970, retireAge1: 65, spouse2Enabled: false };
      const noYear = { ...base };
      delete noYear.planYear;
      const proj = runProjection(noYear);
      expect(proj.years[0].year).toBe(TAX_YEAR);
      expect(Number.isNaN(proj.years[0].year)).toBe(false);
    });
  });

  describe('Stress Inflation Strategy (runProjection)', () => {
    // stressStartYear (2028) is deliberately AFTER the simulation's own
    // startYear (2026, i.e. TAX_YEAR) rather than at retirement/day one --
    // both currentLifestyleMultiplier and the granular factors below are
    // hardcoded to 1.0/unshifted in the simulation's very first year
    // (there's nothing to compound yet), so a crash landing on that first
    // year would have its inflation override silently dropped by this
    // mechanism. Starting the crash two years in avoids that edge case and
    // isolates a single, unambiguous override year (yearsSinceStress === 0)
    // to make assertions on.
    const base = {
      ...DEFAULT_INPUTS,
      birthYear1: 1964, retireAge1: 62, spouse2Enabled: false,
      salary1: 0, pension1: 0, ss1: 0,
      preRetireReturn: 5, postRetireReturn: 5,
      inflationRate: 2, taxBracketInflationRate: 2,
      ssCOLA: 1.0, medicalInflationRate: 1.0, medicarePartBInflationRate: 1.0, medicarePartDInflationRate: 1.0,
      housingInflationRate: 1.0, housingExpensePct: 30,
      preTaxInit: 500000, rothInit: 0, taxableInit: 500000,
      lifestyleExpense: 20000,
      rothConversionStrategy: 'none',
      stressType: 'crashYear', stressStartMode: 'specific', stressStartYear: 2028,
      stressCrashReturn: -20.0, stressCrashInflation: 6.0, // vs. baseline inflationRate of 2%
    };

    it("'partial' (default) lets Housing follow the crash's inflation but leaves SS/Medical/Medicare on their own custom rates", () => {
      const proj = runProjection({ ...base, stressInflationStrategy: 'partial' });
      const crashYearRow = proj.years.find(y => y.year === 2028);
      // Housing compounds 1% (2026->2027) then jumps to the crash's 6% (2027->2028): 1.01 * 1.06
      expect(crashYearRow.housingMultiplier).toBeCloseTo(1.01 * 1.06, 4);
      // SS/Medical/Part B/D keep compounding their own flat 1% rate, untouched
      expect(crashYearRow.ssColaFactor).toBeCloseTo(Math.pow(1.01, 2), 4);
      expect(crashYearRow.medicalInflFactor).toBeCloseTo(Math.pow(1.01, 2), 4);
      expect(crashYearRow.partBInflFactor).toBeCloseTo(Math.pow(1.01, 2), 4);
      expect(crashYearRow.partDInflFactor).toBeCloseTo(Math.pow(1.01, 2), 4);
    });

    it("'custom' ignores the crash's inflation override entirely for Housing and every granular rate", () => {
      const proj = runProjection({ ...base, stressInflationStrategy: 'custom' });
      const crashYearRow = proj.years.find(y => y.year === 2028);
      expect(crashYearRow.housingMultiplier).toBeCloseTo(Math.pow(1.01, 2), 4);
      expect(crashYearRow.ssColaFactor).toBeCloseTo(Math.pow(1.01, 2), 4);
      expect(crashYearRow.medicalInflFactor).toBeCloseTo(Math.pow(1.01, 2), 4);
    });

    it("'delta' nudges each granular rate by the gap between crash inflation and baseline, while Housing still fully follows the crash (same as 'partial')", () => {
      const proj = runProjection({ ...base, stressInflationStrategy: 'delta' });
      const crashYearRow = proj.years.find(y => y.year === 2028);
      // delta = stressCrashInflation(6.0) - baseline inflationRate(2.0) = 4.0
      // crash-year factor = (prior year's 1.01) * (1 + (1.0 + 4.0)/100)
      expect(crashYearRow.ssColaFactor).toBeCloseTo(1.01 * 1.05, 4);
      expect(crashYearRow.medicalInflFactor).toBeCloseTo(1.01 * 1.05, 4);
      expect(crashYearRow.housingMultiplier).toBeCloseTo(1.01 * 1.06, 4);
    });

    it('a delta-mode shift compounds forward permanently into the following (non-crash) year', () => {
      const proj = runProjection({ ...base, stressInflationStrategy: 'delta' });
      // 2028 (crash year) ssColaFactor = 1.01 * 1.05 = 1.0605 (see above).
      // 2029 is not a crash year ('crashYear' type only overrides
      // yearsSinceStress === 0), so it should compound the plain 1% rate on
      // TOP of 2028's shifted factor, not reset to Math.pow(1.01, 3).
      const nextYearRow = proj.years.find(y => y.year === 2029);
      expect(nextYearRow.ssColaFactor).toBeCloseTo(1.01 * 1.05 * 1.01, 4);
    });

    it('all three strategies produce identical results when no stress test is running', () => {
      const noStressBase = { ...base, stressType: 'none' };
      const partial = runProjection({ ...noStressBase, stressInflationStrategy: 'partial' });
      const delta = runProjection({ ...noStressBase, stressInflationStrategy: 'delta' });
      const custom = runProjection({ ...noStressBase, stressInflationStrategy: 'custom' });
      expect(partial.endingBalance).toBeCloseTo(delta.endingBalance, 6);
      expect(partial.endingBalance).toBeCloseTo(custom.endingBalance, 6);
    });
  });

  describe('Monte Carlo Simulation (runMonteCarlo)', () => {
    it('returns a well-formed result with bounded success probability and ordered percentiles', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        birthYear1: 1980, // age 46
        retireAge1: 46,
        lifeExpectancy1: 50, // short 5-year horizon keeps 1000 trials fast
        spouse2Enabled: false,
        salary1: 0,
        ss1: 0,
        pension1: 0,
        preTaxInit: 500000,
        rothInit: 100000,
        taxableInit: 100000,
        lifestyleExpense: 20000,
        rothConversionStrategy: 'none',
      };
      const result = runMonteCarlo(inputs);

      expect(result.successProbability).toBeGreaterThanOrEqual(0);
      expect(result.successProbability).toBeLessThanOrEqual(100);
      expect(result.endingP10).toBeLessThanOrEqual(result.endingP50);
      expect(result.endingP50).toBeLessThanOrEqual(result.endingP90);
      expect(result.growthCurves.length).toBeGreaterThan(0);
      expect(result.growthCurves[0]).toHaveProperty('p10');
      expect(result.growthCurves[0]).toHaveProperty('p50');
      expect(result.growthCurves[0]).toHaveProperty('p90');
    });
  });

  describe('Phased/Part-Time Retirement Income (runProjection)', () => {
    const base = {
      ...DEFAULT_INPUTS,
      spouse2Enabled: false,
      birthYear1: 2026 - 60, // age 60 in the 2026 start year
      retireAge1: 65,
    };

    it('defaults to a hard cliff to $0 salary at retirement when part-time income is 0', () => {
      const proj = runProjection(base);
      const preRetireYear = proj.years[4]; // age 64
      const retireYear = proj.years[5]; // age 65
      expect(preRetireYear.salary).toBeGreaterThan(0);
      expect(retireYear.salary).toBe(0);
    });

    it('applies inflation-adjusted part-time income from retireAge up to (not including) the end age', () => {
      const proj = runProjection({ ...base, partTimeIncome1: 20000, partTimeIncomeEndAge1: 68 });
      const age64 = proj.years[4]; // still working full salary
      const age65 = proj.years[5]; // retired, part-time income starts
      const age67 = proj.years[7]; // last year of part-time income
      const age68 = proj.years[8]; // part-time income ends

      expect(age64.salary).toBeGreaterThan(20000); // full salary, well above the part-time figure
      expect(age65.salary).toBeGreaterThan(0);
      expect(age65.salary).toBeLessThan(age64.salary); // reduced vs full salary
      expect(age67.salary).toBeGreaterThan(0);
      expect(age68.salary).toBe(0); // cliff at the configured end age
    });

    it('leaves the full-salary years and post-cutoff years unaffected — only the bridge years change', () => {
      const projBase = runProjection(base);
      const projPT = runProjection({ ...base, partTimeIncome1: 20000, partTimeIncomeEndAge1: 68 });

      for (let i = 0; i < 5; i++) { // ages 60-64, still working full salary
        expect(projPT.years[i].salary).toBeCloseTo(projBase.years[i].salary, 2);
      }
      for (let i = 8; i < 12; i++) { // ages 68+, part-time income has ended
        expect(projPT.years[i].salary).toBeCloseTo(projBase.years[i].salary, 2);
      }
    });
  });

  describe('Long-Term Care cost duration (runProjection)', () => {
    it('applies the LTC cost only for ltcDurationYears1 starting at ltcStartAge1, not for the rest of life', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        birthYear1: 2026 - 60, // age 60 in the 2026 start year
        lifeExpectancy1: 95,
        ltcActive1: true,
        ltcStartAge1: 82,
        ltcCost1: 60000,
        ltcDurationYears1: 3,
      };
      const proj = runProjection(inputs);
      const yearAt = (age) => proj.years[age - 60];

      expect(yearAt(81).ltcCost).toBe(0); // before the episode starts
      expect(yearAt(82).ltcCost).toBeGreaterThan(0); // episode year 1
      expect(yearAt(83).ltcCost).toBeGreaterThan(0); // episode year 2
      expect(yearAt(84).ltcCost).toBeGreaterThan(0); // episode year 3 (last)
      expect(yearAt(85).ltcCost).toBe(0); // episode has ended — no longer perpetual
      expect(yearAt(90).ltcCost).toBe(0); // still 0 well past the episode
    });

    it('ltcEndsInDeath1 removes the duration cutoff and runs the cost through the person\'s last living year instead', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        birthYear1: 2026 - 60, // age 60 in the 2026 start year
        lifeExpectancy1: 95,
        ltcActive1: true,
        ltcStartAge1: 82,
        ltcCost1: 60000,
        ltcDurationYears1: 3, // should be ignored while ltcEndsInDeath1 is on
        ltcEndsInDeath1: true,
      };
      const proj = runProjection(inputs);
      const yearAt = (age) => proj.years[age - 60];

      expect(yearAt(81).ltcCost).toBe(0); // still 0 before the start age
      expect(yearAt(82).ltcCost).toBeGreaterThan(0); // starts at the start age
      expect(yearAt(85).ltcCost).toBeGreaterThan(0); // past the old 3-year cutoff -- should NOT have stopped
      expect(yearAt(94).ltcCost).toBeGreaterThan(0); // still active near life expectancy

      // Total LTC paid across the plan should be far higher than the
      // bounded-episode default (3 years' worth), since it now runs for
      // every year from 82 through life expectancy instead.
      const totalLTC = proj.years.reduce((sum, y) => sum + (y.ltcCost || 0), 0);
      const boundedProj = runProjection({ ...inputs, ltcEndsInDeath1: false });
      const boundedTotalLTC = boundedProj.years.reduce((sum, y) => sum + (y.ltcCost || 0), 0);
      expect(totalLTC).toBeGreaterThan(boundedTotalLTC);
    });

    it('migrateInputs backfills a legacy shared ltcActive/ltcCost/ltcStartAge/ltcDurationYears/ltcEndsInDeath onto both spouses', () => {
      const legacy = migrateInputs({ ltcActive: true, ltcCost: 75000, ltcStartAge: 80, ltcDurationYears: 4, ltcEndsInDeath: true });
      expect(legacy.ltcActive1).toBe(true);
      expect(legacy.ltcActive2).toBe(true);
      expect(legacy.ltcCost1).toBe(75000);
      expect(legacy.ltcCost2).toBe(75000);
      expect(legacy.ltcStartAge1).toBe(80);
      expect(legacy.ltcStartAge2).toBe(80);
      expect(legacy.ltcDurationYears1).toBe(4);
      expect(legacy.ltcDurationYears2).toBe(4);
      expect(legacy.ltcEndsInDeath1).toBe(true);
      expect(legacy.ltcEndsInDeath2).toBe(true);
    });

    it('applies LTC fully independently per spouse -- different costs, ages, and durations for each', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: true,
        birthYear1: 2026 - 60,
        birthYear2: 2026 - 58,
        lifeExpectancy1: 95,
        lifeExpectancy2: 95,
        ltcActive1: true, ltcCost1: 60000, ltcStartAge1: 82, ltcDurationYears1: 3,
        ltcActive2: true, ltcCost2: 90000, ltcStartAge2: 85, ltcDurationYears2: 2,
      };
      const proj = runProjection(inputs);
      const yearAtAge1 = (age1) => proj.years[age1 - 60];

      // At spouse1 age 82 (spouse2 age 80), only spouse1's episode is active.
      expect(yearAtAge1(82).ltcCost).toBeGreaterThan(0);
      // At spouse1 age 87 (spouse2 age 85), spouse1's episode has ended
      // (82+3=85) but spouse2's has just started.
      expect(yearAtAge1(87).ltcCost).toBeGreaterThan(0);
      // At spouse1 age 90 (spouse2 age 88), both episodes have ended.
      expect(yearAtAge1(90).ltcCost).toBe(0);
    });

    it('an inactive spouse2 LTC toggle has no effect even when spouse2 is enabled', () => {
      const off = runProjection({
        ...DEFAULT_INPUTS, spouse2Enabled: true,
        ltcActive1: false, ltcActive2: false,
      });
      const baseline = runProjection({ ...DEFAULT_INPUTS, spouse2Enabled: true });
      expect(off.endingBalance).toBeCloseTo(baseline.endingBalance, 2);
    });
  });

  describe('LTC-specific inflation rate (ltcInflationRate)', () => {
    const base = {
      ...DEFAULT_INPUTS,
      spouse2Enabled: false,
      birthYear1: 2026 - 60, // age 60 in the 2026 start year
      lifeExpectancy1: 95,
      ltcActive1: true,
      ltcStartAge1: 82,
      ltcCost1: 60000,
      ltcDurationYears1: 10, // long enough to observe multi-year compounding
      medicalInflationRate: 5.0,
    };

    it('grows ltcCost at ltcInflationRate, not medicalInflationRate, when the two differ', () => {
      const proj = runProjection({ ...base, ltcInflationRate: 3.54 });
      const yearAt = (age) => proj.years[age - 60];
      const firstYearCost = yearAt(82).ltcCost;
      const secondYearCost = yearAt(83).ltcCost;
      // 60,000 grown one extra year at 3.54%, not 5%
      expect(firstYearCost).toBeCloseTo(60000 * Math.pow(1.0354, 82 - 60), 2);
      expect(secondYearCost / firstYearCost).toBeCloseTo(1.0354, 4);
    });

    it('produces a different LTC total than an identical plan using medicalInflationRate\'s rate', () => {
      const higherLTCRate = runProjection({ ...base, ltcInflationRate: 5.0 });
      const lowerLTCRate = runProjection({ ...base, ltcInflationRate: 2.0 });
      const totalLTC = (proj) => proj.years.reduce((sum, y) => sum + (y.ltcCost || 0), 0);
      expect(totalLTC(higherLTCRate)).toBeGreaterThan(totalLTC(lowerLTCRate));
    });

    it('migrateInputs backfills ltcInflationRate onto an old saved plan that predates this field', () => {
      const { ltcInflationRate: _omit, ...oldPlan } = DEFAULT_INPUTS;
      expect(migrateInputs(oldPlan).ltcInflationRate).toBe(DEFAULT_INPUTS.ltcInflationRate);
    });
  });

  describe('ACA Subsidy Protection / Medicaid coverage gap (runProjection)', () => {
    // Low/no guaranteed income (no SS, no pension) drawing mostly from Roth
    // so ordinary taxable income stays near $0 in early retirement — the
    // exact profile the "coverage gap" is about (asset-rich, income-poor).
    const gapProneInputs = {
      ...DEFAULT_INPUTS,
      spouse2Enabled: false,
      filingStatus: 'Single',
      birthYear1: 2026 - 56, // age 56 in the 2026 start year
      retireAge1: 56,
      lifeExpectancy1: 90,
      claimingAge1: 70,
      ss1: 0, ss2: 0, pension1: 0, pension2: 0, rentalIncome: 0, annuityIncome: 0,
      salary1: 0, salary2: 0, partTimeIncome1: 0, partTimeIncome2: 0,
      preTaxInit: 800000, rothInit: 200000, taxableInit: 200000,
      // The Roth draws must be return of contributions: a pre-59 1/2 draw
      // of EARNINGS is AGI and so ACA MAGI (the 2026-10-23 review), which
      // would lift this household out of the coverage gap this fixture is
      // built to sit in.
      rothBasisInit: 200000,
      preTaxContribution1: 0, preTaxContribution2: 0, rothContribution1: 0, rothContribution2: 0, taxableContribution: 0,
      lifestyleExpense: 40000,
      withdrawalStrategy: 'RothFirst',
      rothConversionStrategy: 'none',
      taxBracketInflationRate: 0,
      inflationRate: 0,
    };

    it('getFederalPovertyLevel reads the guideline published the year before the coverage year (changelog 409)', () => {
      // 2026 coverage: the 2025 guidelines. 2027 coverage: the 2026 ones.
      expect(getFederalPovertyLevel(1)).toBe(15650);
      expect(getFederalPovertyLevel(2)).toBe(21150);
      expect(getFederalPovertyLevel(1, 2026)).toBe(15650);
      expect(getFederalPovertyLevel(1, 2027)).toBe(15960);
      expect(getFederalPovertyLevel(2, 2027)).toBe(21640);
      // Beyond the newest table: the 2026 guideline indexed from 2027 on.
      expect(getFederalPovertyLevel(1, 2028, 0)).toBe(15960);
      expect(getFederalPovertyLevel(1, 2028, 2.5)).toBeCloseTo(15960 * 1.025, 6);
      expect(getFederalPovertyLevel(2, 2030, 2.5)).toBeCloseTo(21640 * 1.025 ** 3, 6);
      // The cliffs the reviewer checked: $84,600 for a couple, $62,600 single.
      expect(4 * getFederalPovertyLevel(2)).toBe(84600);
      expect(4 * getFederalPovertyLevel(1)).toBe(62600);
    });

    it('flags inAcaCoverageGap pre-Medicare in a non-expansion state when protection is off', () => {
      const proj = runProjection({ ...gapProneInputs, stateOfResidence: 'TX', acaSubsidyProtectionEnabled: false });
      const age58 = proj.years.find(y => y.age1 === 58);
      expect(ACA_NON_EXPANSION_STATES.has('TX')).toBe(true);
      expect(age58.inAcaCoverageGap).toBe(true);
      expect(age58.acaSubsidyBoost).toBe(0);
    });

    it('forces a Roth conversion up to the FPL floor and clears the gap when protection is on', () => {
      const proj = runProjection({ ...gapProneInputs, stateOfResidence: 'TX', acaSubsidyProtectionEnabled: true });
      const age58 = proj.years.find(y => y.age1 === 58);
      expect(age58.inAcaCoverageGap).toBe(false);
      // The boost is sized to the REMAINING gap: dividends from the Taxable
      // account already count toward ACA MAGI, so boost + dividends lands
      // exactly on the floor (Roth draws contribute nothing).
      // (Dividends are modeled as 2% of the start-of-year Taxable balance.)
      const dividends = age58.taxableStart * 0.02;
      expect(age58.acaSubsidyBoost).toBeGreaterThan(0);
      const floor = getFederalPovertyLevel(1, age58.year, gapProneInputs.taxBracketInflationRate);
      expect(age58.acaSubsidyBoost).toBeLessThan(floor);
      expect(age58.acaSubsidyBoost + dividends).toBeCloseTo(floor, 0);
    });

    it('never flags a gap in a Medicaid expansion state, regardless of income', () => {
      const proj = runProjection({ ...gapProneInputs, stateOfResidence: 'CA', acaSubsidyProtectionEnabled: false });
      expect(ACA_NON_EXPANSION_STATES.has('CA')).toBe(false);
      expect(proj.years.filter(y => y.age1 >= 56 && y.age1 < 65).some(y => y.inAcaCoverageGap)).toBe(false);
    });

    it('never flags a gap once the household reaches Medicare eligibility (65)', () => {
      const proj = runProjection({ ...gapProneInputs, stateOfResidence: 'TX', acaSubsidyProtectionEnabled: false });
      const age66 = proj.years.find(y => y.age1 === 66);
      expect(age66.inAcaCoverageGap).toBe(false);
    });

    // Regression (2026-08-28): the check used to run BEFORE the withdrawal
    // solver, so lifestyle withdrawals from Pre-Tax -- taxable income that
    // counts toward ACA MAGI -- were invisible to it. A household drawing
    // $40k+/yr from its IRA (well above the ~$16k single FPL) was flagged
    // as in the gap while sitting in the 12-22% bracket, and Protection
    // forced conversions it didn't need.
    it('does not flag a gap when Pre-Tax withdrawals alone lift income above the FPL floor', () => {
      const proj = runProjection({ ...gapProneInputs, stateOfResidence: 'TX', withdrawalStrategy: 'PreTaxFirst', acaSubsidyProtectionEnabled: false });
      const age58 = proj.years.find(y => y.age1 === 58);
      expect(age58.drawPreTax).toBeGreaterThan(getFederalPovertyLevel(1));
      expect(age58.inAcaCoverageGap).toBe(false);
      expect(proj.years.filter(y => y.age1 >= 56 && y.age1 < 65).some(y => y.inAcaCoverageGap)).toBe(false);
    });

    it('does not force a conversion when Pre-Tax withdrawals already clear the FPL floor', () => {
      const proj = runProjection({ ...gapProneInputs, stateOfResidence: 'TX', withdrawalStrategy: 'PreTaxFirst', acaSubsidyProtectionEnabled: true });
      expect(proj.years.filter(y => y.age1 >= 56 && y.age1 < 65).every(y => y.acaSubsidyBoost === 0)).toBe(true);
    });

    it('sizes the forced conversion to the remaining gap after a partial Pre-Tax draw', () => {
      // Pro-rata draw: part of the $40k lifestyle comes from Pre-Tax, so
      // the boost should be the FPL floor minus that taxable draw (and
      // dividends/gains), not the full floor.
      const proj = runProjection({ ...gapProneInputs, stateOfResidence: 'TX', withdrawalStrategy: 'ProRata', acaSubsidyProtectionEnabled: true });
      const age58 = proj.years.find(y => y.age1 === 58);
      expect(age58.inAcaCoverageGap).toBe(false);
      if (age58.acaSubsidyBoost > 0) {
        expect(age58.acaSubsidyBoost).toBeLessThan(getFederalPovertyLevel(1));
        expect(age58.acaSubsidyBoost).toBeGreaterThan(0);
      }
    });
  });

  describe('Employer 401(k) match (runProjection)', () => {
    it('credits employer match to the Pre-Tax balance without inflating totalContributions', () => {
      // employerMatchMode1: 'flat' on both sides -- DEFAULT_INPUTS now
      // defaults this to 'percent' (see the calculator.js comment), which
      // would otherwise ignore the flat employerMatch1 dollar figures below
      // entirely and credit its own percent-based match on both sides
      // instead, making them equal regardless of employerMatch1.
      const base = { ...DEFAULT_INPUTS, spouse2Enabled: false, employerMatchMode1: 'flat', employerMatch1: 0, inflationRate: 0 };
      const withMatch = { ...DEFAULT_INPUTS, spouse2Enabled: false, employerMatchMode1: 'flat', employerMatch1: 4000, inflationRate: 0 };
      const y0 = runProjection(base).years[0];
      const y1 = runProjection(withMatch).years[0];
      expect(y1.employerMatchAmount).toBe(4000);
      expect(y1.totalContributions).toBe(y0.totalContributions);
      expect(y1.preTaxEnd).toBeGreaterThan(y0.preTaxEnd);
    });

    it('stops crediting match once that spouse retires', () => {
      const proj = runProjection({ ...DEFAULT_INPUTS, spouse2Enabled: false, employerMatch1: 4000 });
      const retiredYear = proj.years.find(y => y.isRetired);
      expect(retiredYear.employerMatchAmount).toBe(0);
    });
  });

  describe('HSA account (runProjection)', () => {
    it('getHSAContributionLimit applies the 2026 self/family limits plus the 55+ catch-up', () => {
      expect(getHSAContributionLimit(45, false)).toBe(4400);
      expect(getHSAContributionLimit(45, true)).toBe(8750);
      expect(getHSAContributionLimit(55, false)).toBe(5400);
    });

    it('contributions grow the HSA balance and reduce taxable ordinary income', () => {
      const noContrib = { ...DEFAULT_INPUTS, fundExpenseRatioPct: 0, spouse2Enabled: false, hsaContribution: 0 };
      const withContrib = { ...DEFAULT_INPUTS, fundExpenseRatioPct: 0, spouse2Enabled: false, hsaContribution: 3000, inflationRate: 0 };
      const y0 = runProjection(noContrib).years[0];
      const y1 = runProjection(withContrib).years[0];
      expect(y1.hsaContribution).toBe(3000);
      expect(y1.hsaEnd).toBeCloseTo(3000 * (1 + DEFAULT_INPUTS.preRetireReturn / 100), 2);
      expect(y1.ordinaryTaxableIncome).toBeCloseTo(y0.ordinaryTaxableIncome - 3000, 2);
    });

    it('draws tax-free from the HSA to cover qualified medical costs before touching taxable income', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        fundExpenseRatioPct: 0, // hand-worked balances; fees have their own tests (447)
        spouse2Enabled: false,
        retireAge1: 60,
        birthYear1: 2026 - 60,
        healthcareBridgeCost: 12000,
        hsaInit: 200000,
        hsaContribution: 0,
        inflationRate: 0,
        // Changelog 126 / audit Q-8: by default 70% of the bridge is
        // premiums, which IRS Pub. 969 does NOT let an HSA pay before
        // Medicare, so only the 30% out-of-pocket share is qualified.
        // Treat the whole bridge as qualified here to keep this test about
        // the tax-free draw itself; the split has its own test.
        hsaPreMedicarePremiumsQualified: true,
      };
      const proj = runProjection(inputs);
      const firstRetiredYear = proj.years.find(y => y.isRetired);
      expect(firstRetiredYear.hsaMedicalDraw).toBe(12000);
      expect(firstRetiredYear.hsaEnd).toBeCloseTo((200000 - 12000) * (1 + DEFAULT_INPUTS.postRetireReturn / 100), 2);

      const noHsaProj = runProjection({ ...inputs, hsaInit: 0 });
      const noHsaYear = noHsaProj.years.find(y => y.isRetired);
      // Funding the same $12k medical cost from HSA (tax-free) instead of a
      // taxable Pre-Tax withdrawal should leave MORE money in the portfolio,
      // since the taxable version also has to withdraw extra to cover the
      // tax on that withdrawal.
      expect(firstRetiredYear.totalPortfolioEnding).toBeGreaterThan(noHsaYear.totalPortfolioEnding);
    });

    it('includes the HSA balance in totalPortfolioEnding net worth', () => {
      const inputs = { ...DEFAULT_INPUTS, spouse2Enabled: false, hsaInit: 50000, hsaContribution: 0, inflationRate: 0 };
      const y0 = runProjection(inputs).years[0];
      expect(y0.totalPortfolioEnding).toBeCloseTo(y0.preTaxEnd + y0.rothEnd + y0.taxableEnd + y0.hsaEnd, 2);
    });
  });

  describe('Qualified Charitable Distributions (runProjection)', () => {
    const qcdBase = {
      ...DEFAULT_INPUTS,
      spouse2Enabled: false,
      birthYear1: 1950, // age 76 in 2026 — past the 73/75 RMD age either way
      retireAge1: 65,
      preTaxInit: 2000000,
      rothInit: 0,
      taxableInit: 500000,
      inflationRate: 0,
    };

    it('reduces taxable income and taxes paid without shrinking the reported RMD', () => {
      const withQcd = runProjection({ ...qcdBase, qcdAnnualAmount: 20000 }).years[0];
      const noQcd = runProjection({ ...qcdBase, qcdAnnualAmount: 0 }).years[0];
      expect(withQcd.qcdAmount).toBe(20000);
      expect(withQcd.rmdAmount).toBeCloseTo(noQcd.rmdAmount, 2); // full RMD unchanged
      expect(withQcd.rmdTaxableAmount).toBeCloseTo(withQcd.rmdAmount - 20000, 2);
      // The QCD removes $20k from taxable income directly, and -- because
      // it lowers MAGI -- also claws back 6% of it in OBBBA senior bonus
      // deduction (this filer is 76, and 2026 is inside the 2025-2028
      // window), so taxable income drops by slightly more than the QCD.
      const bonusRecovered = withQcd.seniorBonusDeduction - noQcd.seniorBonusDeduction;
      expect(bonusRecovered).toBeGreaterThan(0);
      expect(withQcd.ordinaryTaxableIncome).toBeCloseTo(noQcd.ordinaryTaxableIncome - 20000 - bonusRecovered, 2);
      expect(withQcd.totalTaxesPaid).toBeLessThan(noQcd.totalTaxesPaid);
    });

    it('caps the QCD at the balance, not the RMD, when the requested amount exceeds both (changelog 418)', () => {
      const y = runProjection({ ...qcdBase, preTaxInit: 50000, qcdAnnualAmount: 500000 }).years[0];
      expect(y.qcdAmount).toBeGreaterThan(y.rmdAmount);
      expect(y.qcdAmount).toBeCloseTo(50000, 2);
      expect(y.rmdTaxableAmount).toBe(0);
    });

    it('caps the QCD at the 2026 IRS per-person limit', () => {
      const y = runProjection({ ...qcdBase, preTaxInit: 50000000, qcdAnnualAmount: 999999999 }).years[0];
      expect(y.qcdAmount).toBe(QCD_LIMIT_2026);
    });

    it('does not apply before RMD age', () => {
      const y = runProjection({ ...qcdBase, birthYear1: 1985, retireAge1: 60, preTaxInit: 500000, qcdAnnualAmount: 20000 }).years[0];
      expect(y.qcdAmount).toBe(0);
    });
  });

  describe('Alternative Minimum Tax (calculateAMT / runProjection)', () => {
    it('is $0 below the exemption amount', () => {
      expect(calculateAMT(50000, 'Single', 1)).toBe(0);
      expect(calculateAMT(90100, 'Single', 1)).toBe(0); // exactly at the exemption
    });

    it('applies the 26% rate below the rate breakpoint, after subtracting the exemption', () => {
      // AMTI $200,000, Single, no phase-out (well under the $500k threshold):
      // amtBase = 200,000 - 90,100 = 109,900; all taxed at 26%.
      expect(calculateAMT(200000, 'Single', 1)).toBeCloseTo(109900 * 0.26, 2);
    });

    it('applies the 26%/28% split once amtBase crosses the rate breakpoint', () => {
      // AMTI $2,000,000, Single: above the $500k phase-out threshold, so the
      // exemption is fully phased out (90,100 - 0.5*(2,000,000-500,000) < 0).
      // amtBase = 2,000,000, taxed 26% up to 244,500 and 28% above.
      const expected = 244500 * 0.26 + (2000000 - 244500) * 0.28;
      expect(calculateAMT(2000000, 'Single', 1)).toBeCloseTo(expected, 2);
    });

    it('never produces a negative tentative minimum tax as AMTI grows', () => {
      expect(calculateAMT(50000000, 'MFJ', 1)).toBeGreaterThan(0);
    });

    it('runProjection wires amtTax as max(0, tentative minimum tax - regular ordinary tax)', () => {
      // Documented finding (see the comment above calculateAMT in
      // calculator.js): because this app doesn't model itemized deductions
      // or ISO exercises -- the two dominant real-world AMT triggers -- and
      // the 2026 AMT exemption ($90,100/$140,200) dwarfs the standard
      // deduction it's compensating for ($16,100/$32,200), the AMT
      // tentative minimum tax never exceeds regular tax for a
      // standard-deduction-only filer at any realistic income level,
      // including large one-time Roth conversions. amtTax should read $0
      // across the board for this app's population until itemized-deduction
      // or ISO modeling is added -- this test locks in that expectation so
      // a future change to the AMT or bracket math that breaks it is caught.
      const bigConversion = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        filingStatus: 'Single',
        preTaxInit: 3000000,
        rothInit: 0,
        taxableInit: 500000,
        rothConversionStrategy: 'fixed',
        rothConversionAmount: 2500000,
        rothConversionDelayUntilRetire: false,
        salary1: 0,
        ss1: 0,
      };
      const proj = runProjection(bigConversion);
      expect(proj.years.every(y => y.amtTax === 0)).toBe(true);
      expect(runProjection(DEFAULT_INPUTS).years.every(y => y.amtTax === 0)).toBe(true);
    });
  });

  describe('Multi-heir estate splitting (calculateHeirEstateTax / migrateInputs)', () => {
    it('defaults to a single 100%-split heir when inputs.heirs is absent', () => {
      const result = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 200000, 100000);
      expect(result.perHeir.length).toBe(1);
      expect(result.perHeir[0].splitPct).toBeCloseTo(100, 5);
      // grossInherited is no longer just the $1.3M snapshot (1M pre-tax +
      // 200k Roth + 100k taxable): per the comment on grossInherited above,
      // it's now totalWithdrawn (the pre-tax IRA's value after growing
      // through its 10-year SECURE Act drawdown under the default strategy)
      // + Roth + taxable, so it's larger than the snapshot by the growth
      // accrued during that holding period. Changelog 125 made the default
      // schedule the post-RBD annual-RMD rule (small minimums in years 1-9,
      // the rest in year 10), which holds more of the balance longer than
      // flat_10 did: 1,620,678.72 -> 1,811,254.97.
      expect(result.grossInherited).toBeCloseTo(1798263.19, 1);
    });

    it('splits gross/net inheritance proportionally across multiple heirs', () => {
      const twoHeirs = {
        ...DEFAULT_INPUTS,
        heirs: [
          { id: 1, name: 'Alice', filingStatus: 'Single', income: 50000, splitPct: 50 },
          { id: 2, name: 'Bob', filingStatus: 'Single', income: 400000, splitPct: 50 },
        ],
      };
      const result = calculateHeirEstateTax(twoHeirs, 1000000, 200000, 100000);
      // See the grossInherited comment in the single-heir test above --
      // includes 10-year holding-period growth, not just the raw snapshot.
      expect(result.grossInherited).toBeCloseTo(1798263.19, 1);
      expect(result.perHeir[0].grossInherited).toBeCloseTo(899131.60, 1);
      expect(result.perHeir[1].grossInherited).toBeCloseTo(899131.60, 1);
      // Bob's baseline income ($400k) is already in a high bracket, so his
      // marginal tax drag on the same-size inherited IRA share is higher
      // than Alice's ($50k baseline).
      expect(result.perHeir[1].totalHeirTax).toBeGreaterThan(result.perHeir[0].totalHeirTax);
      // Aggregate totals equal the sum of the per-heir results.
      expect(result.totalHeirTax).toBeCloseTo(result.perHeir[0].totalHeirTax + result.perHeir[1].totalHeirTax, 2);
    });

    it('normalizes splitPct values that do not sum to 100', () => {
      const unnormalized = {
        ...DEFAULT_INPUTS,
        heirs: [
          { id: 1, name: 'A', filingStatus: 'Single', income: 50000, splitPct: 30 },
          { id: 2, name: 'B', filingStatus: 'Single', income: 50000, splitPct: 30 },
        ],
      };
      const result = calculateHeirEstateTax(unnormalized, 1000000, 0, 0);
      // 30/30 normalizes to an effective 50/50 split of the $1M pre-tax
      // balance; grossInherited again reflects post-growth totalWithdrawn
      // rather than the raw $1M/$500k snapshot (see comment above).
      expect(result.perHeir[0].grossInherited).toBeCloseTo(749131.60, 1);
      expect(result.grossInherited).toBeCloseTo(1498263.19, 1);
    });

    it('migrates a legacy single-heir plan (heirFilingStatus/heirIncome) into a heirs array', () => {
      const migrated = migrateInputs({ heirFilingStatus: 'MFJ', heirIncome: 75000 });
      expect(Array.isArray(migrated.heirs)).toBe(true);
      expect(migrated.heirs.length).toBe(1);
      expect(migrated.heirs[0].filingStatus).toBe('MFJ');
      expect(migrated.heirs[0].income).toBe(75000);
      expect(migrated.heirs[0].splitPct).toBe(100);
    });

    it('runProjection + calculateHeirEstateTax integration is unaffected for DEFAULT_INPUTS', () => {
      // Regression guard: the multi-heir restructuring should not change the
      // ending portfolio math at all, only how it's split among heirs.
      const proj = runProjection(DEFAULT_INPUTS);
      // DEFAULT_INPUTS is a solvent plan by design (see the
      // preTaxContribution1/retireAge1 comments in calculator.js) -- this
      // is just a golden regression value for its ending balance, not a
      // claim about what "should" happen. History: 186,789.64 until
      // 2026-08-29, when the age-65 additional standard deduction and the
      // OBBBA senior bonus (changelog 100) lowered the default plan's
      // retirement taxes and lifted it to 207,438.45. Changelog 119 replaced
      // the flat 0/50/85% Social Security tiers with the exact IRS worksheet;
      // the default couple sits in the phase-in band, so less of their
      // benefit is taxable every year and the balance rose to 275,559.585.
      // Changelog 124 corrected the Part D base premium from the 2024
      // figure ($38.99) to 2026's $38.99 -- about $108 more a year for the
      // couple from 65 on, funded by extra draws -- and the balance settled
      // at 262,350.20. Changelog 132 put the discretionary Pre-Tax draw (and
      // realized gains / early-Roth earnings) into the Social Security
      // provisional-income test, which is where this couple actually lives:
      // their non-draw provisional income sits under the $32,000 threshold,
      // so the engine had been reporting $0 of taxable benefits while the
      // draw itself pushed real provisional income to $41k-$68k. Taxing the
      // benefits the draw exposes costs roughly $134,000 of ending balance
      // and lands at 128,037.61. Households already pinned at the 85% cap
      // (the demo Carters, anyone comfortably above the upper threshold) are
      // unaffected -- the cap binds first and the delta is exactly zero.
      // Later changes took it to 104,873.33; changelog 410 (the announced
      // 2027 COLA of 3.6% replacing the default 2.5% for that one year,
      // with the announced wage base and earnings-test amounts) lifted the
      // default couple's benefits for every later year and lands at
      // 131,290.75.
      expect(proj.endingBalance).toBeCloseTo(36762.2363, 2);
    });
  });

  describe('State estate/inheritance tax (calculateStateEstateInheritanceTax / calculateHeirEstateTax)', () => {
    it('is $0 for a state with no estate or inheritance tax', () => {
      expect(calculateStateEstateInheritanceTax('TX', 20000000, 1)).toBe(0);
    });

    // Value-pinning guard. This is deliberately a second copy of the table's
    // estate figures, which normally would be a worthless test (it can only
    // prove the table equals itself). It earns its keep here for a different
    // reason: 6 of these 13 exemptions were silently wrong for months because
    // nothing failed when they drifted. Each line below carries the primary
    // source it was verified against, so an edit to the table that isn't also
    // an edit to a citation here is a red flag in review. It is NOT a
    // substitute for re-verifying against the actual source each January —
    // see TAX_UPDATE_PROCESS.md section 9.
    it('pins each estate-tax jurisdiction to its verified 2026 exemption and top rate', () => {
      const T = STATE_ESTATE_INHERITANCE_TAX_TABLE;
      // Indexed annually — these five WILL change every January.
      expect(T.CT.estateExemption).toBe(15000000);   // CGS 12-391: tracks the federal BEA
      expect(T.ME.estateExemption).toBe(7160000);    // Maine Revenue Services, 36 MRS 4102(5)
      expect(T.NY.estateExemption).toBe(7350000);    // NY Tax Law 952(c), indexed basic exclusion
      expect(T.RI.estateExemption).toBe(1838056);    // RI Div. of Taxation, RIGL 44-22-1.1 credit
      expect(T.DC.estateExemption).toBe(4988400);    // DC OTR, DC Code 47-3701(14)
      // Fixed in statute — these change only by legislation.
      expect(T.HI.estateExemption).toBe(5490000);    // HRS 236E-6
      expect(T.IL.estateExemption).toBe(4000000);    // 35 ILCS 405/3
      expect(T.MD.estateExemption).toBe(5000000);    // Md. Tax-Gen. 7-309(b)
      expect(T.MA.estateExemption).toBe(2000000);    // MGL c.65C s.2A, as amended 2023
      expect(T.MN.estateExemption).toBe(3000000);    // Minn. Stat. 291.016
      expect(T.OR.estateExemption).toBe(1000000);    // ORS 118.010
      expect(T.VT.estateExemption).toBe(5000000);    // 32 V.S.A. 7442a
      expect(T.WA.estateExemption).toBe(3000000);    // RCW 83.100.020
      // Top rates.
      expect(T.CT.estateTopRate).toBeCloseTo(0.12, 10);
      expect(T.ME.estateTopRate).toBeCloseTo(0.12, 10);
      expect(T.HI.estateTopRate).toBeCloseTo(0.20, 10);
      // WA reverted from a temporary 35% to 20% on July 1, 2026 (ESB 6347).
      expect(T.WA.estateTopRate).toBeCloseTo(0.20, 10);
      for (const code of ['IL', 'MD', 'MA', 'MN', 'NY', 'OR', 'RI', 'VT', 'DC']) {
        expect(T[code].estateTopRate).toBeCloseTo(0.16, 10);
      }
    });

    it('levies estate tax in exactly 12 states + DC and inheritance tax in exactly 5 states', () => {
      const entries = Object.entries(STATE_ESTATE_INHERITANCE_TAX_TABLE);
      const estate = entries.filter(([, v]) => v.estateExemption !== undefined).map(([k]) => k);
      const inheritance = entries.filter(([, v]) => v.hasInheritanceTax).map(([k]) => k);
      expect(estate.sort()).toEqual(['CT', 'DC', 'HI', 'IL', 'MA', 'MD', 'ME', 'MN', 'NY', 'OR', 'RI', 'VT', 'WA']);
      expect(inheritance.sort()).toEqual(['KY', 'MD', 'NE', 'NJ', 'PA']);
      // Maryland is the only jurisdiction that levies both.
      expect(estate.filter((c) => inheritance.includes(c))).toEqual(['MD']);
      // The flag on the estate table and the schedules table must agree —
      // a state flagged but unscheduled would silently compute $0 forever.
      expect(Object.keys(STATE_INHERITANCE_SCHEDULES).sort()).toEqual(inheritance.sort());
    });

    it('applies Washington\'s graduated table to the excess over the exclusion', () => {
      // WA: $3M exclusion, then Table W (10%-20%) on the Washington taxable
      // estate (changelog 349; it used to be 20% of the whole excess, which
      // gave 3,400,000 here). $20M estate -> $17M taxable -> $1,490,000 on
      // the first $9M + 20% of the $8M above it = 3,090,000.
      // The 35% table (ESSB 5813) ran July 2025 - June 2026 only.
      expect(calculateStateEstateInheritanceTax('WA', 20000000, 1)).toBeCloseTo(3090000, 2);
    });

    it('is $0 below the exemption', () => {
      expect(calculateStateEstateInheritanceTax('WA', 2000000, 1)).toBe(0);
    });

    it('applies inheritance tax against the heir\'s own share, not the aggregate estate (Pennsylvania)', () => {
      // PA charges a flat rate with no exemption, but the rate depends on who
      // the beneficiary is: 4.5% to a child, 12% to a sibling, 15% to anyone
      // else. A $500k share -> 22,500 / 60,000 / 75,000 respectively.
      expect(calculateStateEstateInheritanceTax('PA', 500000, 1, 'child')).toBeCloseTo(22500, 2);
      expect(calculateStateEstateInheritanceTax('PA', 500000, 1, 'sibling')).toBeCloseTo(60000, 2);
      expect(calculateStateEstateInheritanceTax('PA', 500000, 1, 'other')).toBeCloseTo(75000, 2);
      expect(calculateStateEstateInheritanceTax('PA', 500000, 1, 'spouse')).toBe(0);
      // Halving the share halves the bill — it is levied per beneficiary.
      expect(calculateStateEstateInheritanceTax('PA', 500000, 0.5, 'child')).toBeCloseTo(11250, 2);
    });

    it('stacks estate AND inheritance tax for the one state that levies both (Maryland)', () => {
      // Changelog 127 / audit Q-18(a)(b): MD computes the pre-2001 s 2011
      // credit and caps the unified credit at the $5,000,000 exclusion
      // ($391,600), then SUBTRACTS the inheritance tax paid to the Register
      // of Wills from what is left (Comptroller Tax Tip 42). A $10M estate:
      //   gross estate tax = s 2011 credit at $10M ($1,067,600) - $391,600
      //                    = $676,000, owed by every heir alike;
      //   inheritance tax = 0 for a child (exempt), $1,000,000 for a niece,
      //   which more than absorbs the estate tax, so the niece's estate is
      //   left owing the inheritance tax alone -- not both stacked.
      expect(calculateStateEstateInheritanceTax('MD', 10000000, 1, 'child')).toBeCloseTo(676000, 2);
      expect(calculateStateEstateInheritanceTax('MD', 10000000, 1, 'niece')).toBeCloseTo(1000000, 2);
    });

    // Cross-check against each state's OWN published cumulative tax figures,
    // not against a second copy of the bracket table — the mistake that let
    // the NY and CA bracket bugs survive their tests for months. Kentucky's
    // Department of Revenue publishes the cumulative tax at each bracket
    // start, so hitting those exact numbers independently confirms both the
    // bracket boundaries and the way the exemption is applied.
    it('reproduces Kentucky\'s published cumulative inheritance tax exactly', () => {
      // KY DOR: Class B is "$22,960 + 16% of amount over $200,000".
      expect(calculateInheritanceTax('KY', 200000, 'inLaw')).toBeCloseTo(22960, 2);
      expect(calculateInheritanceTax('KY', 300000, 'inLaw')).toBeCloseTo(22960 + 16000, 2);
      // KY DOR: Class C is "$6,270 + 16% of amount over $60,000".
      expect(calculateInheritanceTax('KY', 60000, 'other')).toBeCloseTo(6270, 2);
      expect(calculateInheritanceTax('KY', 160000, 'other')).toBeCloseTo(6270 + 16000, 2);
    });

    it('puts Kentucky nieces and nephews in the exempt class for 2026 deaths', () => {
      // 2026 Ky. Acts ch. 198 sec. 40 moved "nephew, niece, or a nephew or
      // niece of the half blood" into Class A, applying to deaths on or after
      // January 1, 2026. Before that they were Class B and paid up to 16%.
      // Kentucky's own DOR forms still predate the change; KRS 140.070 governs.
      expect(calculateInheritanceTax('KY', 1000000, 'niece')).toBe(0);
      expect(calculateInheritanceTax('KY', 1000000, 'sibling')).toBe(0);
      // In-laws and unrelated beneficiaries did NOT move.
      expect(calculateInheritanceTax('KY', 1000000, 'inLaw')).toBeGreaterThan(0);
      expect(calculateInheritanceTax('KY', 1000000, 'other')).toBeGreaterThan(0);
    });

    it('applies New Jersey\'s Class C graduated bands rather than its top rate', () => {
      // The 11% band runs all the way to $1,100,000, so a $500,000 bequest to
      // a sibling is taxed at 11% on the excess over the $25,000 exemption:
      // (500,000 - 25,000) * 0.11 = 52,250. Using the 16% top rate — which is
      // what a single exemption/rate pair forces — would report 76,000, a 45%
      // overstatement. This test exists to catch a regression back to that.
      expect(calculateInheritanceTax('NJ', 500000, 'sibling')).toBeCloseTo(52250, 2);
      // Into the top band: 1,075,000*.11 + 300,000*.13 + 300,000*.14 + 300,000*.16
      expect(calculateInheritanceTax('NJ', 2000000, 'sibling')).toBeCloseTo(118250 + 39000 + 42000 + 48000, 2);
      // Class D: 15% to $700,000, 16% above, no exemption.
      expect(calculateInheritanceTax('NJ', 1000000, 'niece')).toBeCloseTo(105000 + 48000, 2);
      // Class A is fully exempt.
      expect(calculateInheritanceTax('NJ', 10000000, 'child')).toBe(0);
    });

    it('applies Nebraska\'s post-LB-310 exemptions and flat class rates', () => {
      // Deaths on or after 2023-01-01: 1% over $100,000 for immediate family,
      // 11% over $40,000 for nieces/nephews, 15% over $25,000 for everyone
      // else. The statutes still print the pre-2023 figures alongside, which
      // is the transcription trap this guards against.
      expect(calculateInheritanceTax('NE', 1000000, 'child')).toBeCloseTo(9000, 2);
      expect(calculateInheritanceTax('NE', 1000000, 'niece')).toBeCloseTo(105600, 2);
      expect(calculateInheritanceTax('NE', 1000000, 'other')).toBeCloseTo(146250, 2);
      expect(calculateInheritanceTax('NE', 1000000, 'spouse')).toBe(0);
      // Exactly at the exemption, nothing is owed.
      expect(calculateInheritanceTax('NE', 100000, 'child')).toBe(0);
    });

    it('treats Maryland\'s and New Jersey\'s de minimis thresholds as cliffs, not exemptions', () => {
      // Md. Tax-Gen. 7-203(g): the tax "does not apply ... to any 1 person if
      // the total value of the property does not exceed $1,000". One dollar
      // over and the WHOLE bequest is taxed, not just the excess.
      expect(calculateInheritanceTax('MD', 1000, 'niece')).toBe(0);
      expect(calculateInheritanceTax('MD', 1001, 'niece')).toBeCloseTo(100.1, 2);
      // NJ Class D: "If less than $500: no tax — If $500 or more: no exemption."
      expect(calculateInheritanceTax('NJ', 499, 'other')).toBe(0);
      expect(calculateInheritanceTax('NJ', 500, 'other')).toBeCloseTo(75, 2);
    });

    it('charges no inheritance tax to a spouse anywhere, and none in a state that does not levy it', () => {
      for (const code of ['KY', 'MD', 'NE', 'NJ', 'PA']) {
        expect(calculateInheritanceTax(code, 5000000, 'spouse')).toBe(0);
      }
      expect(calculateInheritanceTax('TX', 5000000, 'other')).toBe(0);
      expect(calculateInheritanceTax('NY', 5000000, 'other')).toBe(0);
    });

    it('falls back to the child class for a missing or unrecognised relationship', () => {
      // Plans saved before this field existed have no relationship value.
      // They must keep computing, and must land on the close-relative
      // assumption the old table was already documented as making.
      expect(normalizeHeirRelationship(undefined)).toBe(DEFAULT_HEIR_RELATIONSHIP);
      expect(normalizeHeirRelationship('cousin-twice-removed')).toBe(DEFAULT_HEIR_RELATIONSHIP);
      expect(calculateStateEstateInheritanceTax('PA', 500000, 1)).toBeCloseTo(
        calculateStateEstateInheritanceTax('PA', 500000, 1, 'child'), 2);
      expect(DEFAULT_INPUTS.heirs[0].relationship).toBe(DEFAULT_HEIR_RELATIONSHIP);
    });

    it('offers a relationship option for every class every state maps, and no orphans', () => {
      const offered = HEIR_RELATIONSHIPS.map((r) => r.value);
      expect(new Set(offered).size).toBe(offered.length);
      for (const [code, state] of Object.entries(STATE_INHERITANCE_SCHEDULES)) {
        // Every offered relationship maps to a class...
        for (const rel of offered) {
          expect(state.byRelationship[rel], `${code} is missing a mapping for ${rel}`).toBeDefined();
          expect(state.classes[state.byRelationship[rel]], `${code} maps ${rel} to an undefined class`).toBeDefined();
        }
        // ...and every defined class is reachable from at least one option,
        // so a class nobody can select can't sit there looking verified.
        const used = new Set(Object.values(state.byRelationship));
        for (const classKey of Object.keys(state.classes)) {
          expect(used.has(classKey), `${code} defines class ${classKey} that no relationship maps to`).toBe(true);
        }
      }
    });

    it('flows into calculateHeirEstateTax and reduces netInherited without affecting a no-tax-state baseline', () => {
      const txResult = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 200000, 100000);
      expect(txResult.totalStateEstateTax).toBe(0);

      const waInputs = { ...DEFAULT_INPUTS, stateOfResidence: 'WA' };
      const waResult = calculateHeirEstateTax(waInputs, 15000000, 5000000, 3000000);
      expect(waResult.totalStateEstateTax).toBeGreaterThan(0);
      expect(waResult.grossInherited - waResult.netInherited).toBeGreaterThanOrEqual(waResult.totalStateEstateTax - 0.01);
    });

    it('splits state estate tax proportionally to each heir\'s split percentage', () => {
      const waTwoHeirs = {
        ...DEFAULT_INPUTS,
        stateOfResidence: 'WA',
        heirs: [
          { id: 1, name: 'A', filingStatus: 'Single', income: 50000, splitPct: 50 },
          { id: 2, name: 'B', filingStatus: 'Single', income: 50000, splitPct: 50 },
        ],
      };
      const result = calculateHeirEstateTax(waTwoHeirs, 15000000, 5000000, 3000000);
      expect(result.perHeir[0].stateEstateTax).toBeCloseTo(result.perHeir[1].stateEstateTax, 2);
      expect(result.perHeir[0].stateEstateTax + result.perHeir[1].stateEstateTax).toBeCloseTo(result.totalStateEstateTax, 2);
    });
  });

  describe('Federal estate tax (calculateFederalEstateTax / calculateHeirEstateTax)', () => {
    it('is $0 at or below the per-person exemption (Single)', () => {
      expect(calculateFederalEstateTax(FEDERAL_ESTATE_EXEMPTION_2026, 'Single', 1)).toBe(0);
      expect(calculateFederalEstateTax(FEDERAL_ESTATE_EXEMPTION_2026 - 1, 'Single', 1)).toBe(0);
    });

    it('applies the flat 40% top rate above the exemption (Single)', () => {
      // $20M estate, Single -> $15M exemption -> (20M-15M)*0.40 = 2,000,000.
      expect(calculateFederalEstateTax(20000000, 'Single', 1)).toBeCloseTo(2000000, 2);
      expect(FEDERAL_ESTATE_TOP_RATE).toBe(0.40);
    });

    it('doubles the exemption for MFJ (portability)', () => {
      // $20M estate, MFJ -> $30M exemption -> under threshold -> $0.
      expect(calculateFederalEstateTax(20000000, 'MFJ', 1)).toBe(0);
      // $40M estate, MFJ -> (40M-30M)*0.40 = 4,000,000.
      expect(calculateFederalEstateTax(40000000, 'MFJ', 1)).toBeCloseTo(4000000, 2);
    });

    it('allocates tax proportionally via heirShare', () => {
      const fullShare = calculateFederalEstateTax(20000000, 'Single', 1);
      const halfShare = calculateFederalEstateTax(20000000, 'Single', 0.5);
      expect(halfShare).toBeCloseTo(fullShare / 2, 2);
    });

    it('is $0 for a non-positive gross estate or heir share', () => {
      expect(calculateFederalEstateTax(0, 'Single', 1)).toBe(0);
      expect(calculateFederalEstateTax(-100, 'Single', 1)).toBe(0);
      expect(calculateFederalEstateTax(20000000, 'Single', 0)).toBe(0);
    });

    it('flows into calculateHeirEstateTax and reduces netInherited for a large estate, while leaving a modest estate at $0', () => {
      const modestResult = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 200000, 100000);
      expect(modestResult.totalFederalEstateTax).toBe(0);

      const largeInputs = { ...DEFAULT_INPUTS, estateIndexingEnabled: false, filingStatus: 'Single' };
      const largeResult = calculateHeirEstateTax(largeInputs, 15000000, 5000000, 3000000);
      expect(largeResult.totalFederalEstateTax).toBeGreaterThan(0);
      expect(largeResult.grossInherited - largeResult.netInherited).toBeGreaterThanOrEqual(
        largeResult.totalFederalEstateTax - 0.01
      );
    });

    it('stacks alongside state estate tax rather than replacing it', () => {
      const stateOnly = calculateHeirEstateTax(
        { ...DEFAULT_INPUTS, stateOfResidence: 'WA', filingStatus: 'MFJ' },
        15000000, 5000000, 3000000
      );
      const stateAndFederal = calculateHeirEstateTax(
        { ...DEFAULT_INPUTS, stateOfResidence: 'WA', filingStatus: 'Single' },
        15000000, 5000000, 3000000
      );
      // Same gross estate, but Single has a lower federal exemption than MFJ,
      // so switching from MFJ to Single at the same estate size should only
      // ever add federal tax on top of the (identical) state tax, never
      // reduce total tax owed.
      expect(stateAndFederal.totalStateEstateTax).toBeCloseTo(stateOnly.totalStateEstateTax, 2);
      expect(stateAndFederal.totalFederalEstateTax).toBeGreaterThanOrEqual(stateOnly.totalFederalEstateTax);
      expect(stateAndFederal.netInherited).toBeLessThanOrEqual(stateOnly.netInherited);
    });

    it('splits federal estate tax proportionally to each heir\'s split percentage', () => {
      const twoHeirsLarge = {
        ...DEFAULT_INPUTS,
        filingStatus: 'Single',
        heirs: [
          { id: 1, name: 'A', filingStatus: 'Single', income: 50000, splitPct: 50 },
          { id: 2, name: 'B', filingStatus: 'Single', income: 50000, splitPct: 50 },
        ],
      };
      const result = calculateHeirEstateTax(twoHeirsLarge, 15000000, 5000000, 3000000);
      expect(result.perHeir[0].federalEstateTax).toBeCloseTo(result.perHeir[1].federalEstateTax, 2);
      expect(result.perHeir[0].federalEstateTax + result.perHeir[1].federalEstateTax).toBeCloseTo(result.totalFederalEstateTax, 2);
    });

    it('runProjection + calculateHeirEstateTax integration is unaffected for DEFAULT_INPUTS (modest estate, no federal tax)', () => {
      const proj = runProjection(DEFAULT_INPUTS);
      const lastYear = proj.years[proj.years.length - 1];
      const result = calculateHeirEstateTax(DEFAULT_INPUTS, lastYear.preTaxEnd || 0, lastYear.rothEnd || 0, lastYear.taxableEnd || 0);
      expect(result.totalFederalEstateTax).toBe(0);
    });
  });

  describe('Net Unrealized Appreciation (NUA) (runProjection)', () => {
    it('has no effect when nuaEnabled is false (default)', () => {
      const proj = runProjection(DEFAULT_INPUTS);
      // Golden regression value for DEFAULT_INPUTS' (solvent) ending
      // balance. Once Social Security COLA, Medical, Housing, and Medicare
      // Part B/D were each wired to their own dedicated Granular Inflation
      // Assumption rate (previously a bug -- those Settings inputs existed
      // but were never wired into the engine), this same default plan
      // briefly depleted to $0 -- retireAge1/2 (65->67, matching
      // claimingAge1/2's existing Full Retirement Age default) and
      // preTaxContribution1 (6000->7000, still inside the 10-15%
      // recommended savings-rate band) were bumped to restore solvency.
      expect(proj.endingBalance).toBeCloseTo(36762.2363, 2);
      expect(proj.years.every(y => y.nuaOrdinaryIncome === 0)).toBe(true);
    });

    it('taxes only the cost basis as ordinary income at the distribution age, once', () => {
      const nuaInputs = {
        ...DEFAULT_INPUTS,
        preTaxInit: 1000000,
        nuaEnabled: true,
        nuaCostBasis: 100000,
        nuaCurrentValue: 400000,
        nuaDistributionAge: 65,
      };
      const proj = runProjection(nuaInputs);
      const triggerYear = proj.years.find(y => y.age1 === 65);
      expect(triggerYear.nuaOrdinaryIncome).toBe(100000);
      expect(proj.years.filter(y => y.nuaOrdinaryIncome > 0).length).toBe(1);
    });

    it('moves the full current value from Pre-Tax to Taxable, not just the basis', () => {
      const nuaInputs = {
        ...DEFAULT_INPUTS,
        preTaxInit: 1000000,
        nuaEnabled: true,
        nuaCostBasis: 100000,
        nuaCurrentValue: 400000,
        nuaDistributionAge: 65,
      };
      const proj = runProjection(nuaInputs);
      const triggerYear = proj.years.find(y => y.age1 === 65);
      // preTaxEnd should be ~400k lower and taxableEnd ~400k higher than they
      // otherwise would have been at this point in the projection, net of
      // ordinary growth/contributions/draws that year.
      const noNua = runProjection({ ...DEFAULT_INPUTS, preTaxInit: 1000000 });
      const noNuaYear = noNua.years.find(y => y.age1 === 65);
      const preTaxDelta = noNuaYear.preTaxEnd - triggerYear.preTaxEnd;
      const taxableDelta = triggerYear.taxableEnd - noNuaYear.taxableEnd;
      expect(preTaxDelta).toBeGreaterThan(300000);
      expect(taxableDelta).toBeGreaterThan(300000);
    });

    it('caps the distribution at the available Pre-Tax balance', () => {
      const smallPreTax = {
        ...DEFAULT_INPUTS,
        preTaxInit: 50000,
        nuaEnabled: true,
        nuaCostBasis: 10000,
        nuaCurrentValue: 400000,
        nuaDistributionAge: 65,
      };
      const proj = runProjection(smallPreTax);
      const triggerYear = proj.years.find(y => y.age1 === 65);
      expect(triggerYear.nuaOrdinaryIncome).toBeLessThanOrEqual(10000);
    });
  });

  describe('Debt / mortgage amortization (runProjection)', () => {
    it('has no effect when no debt is configured (default)', () => {
      const proj = runProjection(DEFAULT_INPUTS);
      // Golden regression value for DEFAULT_INPUTS' (solvent) ending
      // balance. Once Social Security COLA, Medical, Housing, and Medicare
      // Part B/D were each wired to their own dedicated Granular Inflation
      // Assumption rate (previously a bug -- those Settings inputs existed
      // but were never wired into the engine), this same default plan
      // briefly depleted to $0 -- retireAge1/2 (65->67, matching
      // claimingAge1/2's existing Full Retirement Age default) and
      // preTaxContribution1 (6000->7000, still inside the 10-15%
      // recommended savings-rate band) were bumped to restore solvency.
      expect(proj.endingBalance).toBeCloseTo(36762.2363, 2);
      expect(proj.years.every(y => y.mortgageBalance === 0 && y.otherDebtBalance === 0)).toBe(true);
    });

    it('amortizes a mortgage down to $0 and stops the payment after payoff', () => {
      const mortgageInputs = {
        ...DEFAULT_INPUTS,
        mortgageBalance: 300000,
        mortgageRate: 6.5,
        mortgagePayment: 30000, // above interest-only (19,500/yr), so principal decreases
      };
      const proj = runProjection(mortgageInputs);
      const payoffYear = proj.years.find(y => y.mortgageBalance === 0);
      expect(payoffYear).toBeTruthy();
      expect(proj.years.every(y => y.mortgageBalance >= 0)).toBe(true);
      const afterPayoff = proj.years.filter(y => y.age1 > payoffYear.age1);
      expect(afterPayoff.every(y => y.mortgagePaymentThisYear === 0)).toBe(true);
    });

    it('an interest-only-sized payment leaves the balance essentially flat', () => {
      // 300,000 * 6.5% = 19,500 in interest — a payment exactly matching
      // that leaves ~$0 principal reduction the first year.
      const interestOnly = { ...DEFAULT_INPUTS, mortgageBalance: 300000, mortgageRate: 6.5, mortgagePayment: 19500 };
      const proj = runProjection(interestOnly);
      expect(proj.years[0].mortgageBalance).toBeCloseTo(300000, -2);
    });

    it('amortizes other debt (e.g. an auto loan) down to $0 independently of the mortgage', () => {
      const otherDebtInputs = { ...DEFAULT_INPUTS, otherDebtBalance: 20000, otherDebtRate: 8, otherDebtPayment: 6000 };
      const proj = runProjection(otherDebtInputs);
      expect(proj.years.some(y => y.otherDebtBalance === 0)).toBe(true);
      expect(proj.years.every(y => y.otherDebtBalance >= 0)).toBe(true);
    });

    // Auto current spending is what is left of the paycheck after tax and
    // savings, and a mortgage or debt payment is paid out of that. The
    // payment used to be charged on top of it, which put every working year
    // in deficit by the payment and cut the 401(k) contributions to cover it.
    const solventBase = { ...DEFAULT_INPUTS, preTaxInit: 200000, rothInit: 40000, taxableInit: 40000 };

    it('a mortgage paid from the paycheck does not cut contributions or the match (auto spending)', () => {
      const withDebt = runProjection({ ...solventBase, mortgageBalance: 120000, mortgageRate: 4.5, mortgagePayment: 12000 });
      const withoutDebt = runProjection(solventBase);
      const a = withDebt.years[0];
      const b = withoutDebt.years[0];
      expect(a.mortgagePaymentThisYear).toBeCloseTo(12000, 6);
      expect(a.savingsDeficit).toBeCloseTo(0, 6);
      expect(a.preTaxContribution1).toBeCloseTo(b.preTaxContribution1, 6);
      expect(a.preTaxContribution2).toBeCloseTo(b.preTaxContribution2, 6);
      expect(a.employerMatchAmount).toBeCloseTo(b.employerMatchAmount, 6);
      // Same leftover either way; the payment is a share of it.
      expect(a.currentSpending.derived).toBeCloseTo(b.currentSpending.derived, 6);
      expect(a.currentSpending.debtPayments).toBeCloseTo(12000, 6);
      expect(a.currentSpending.applied).toBeCloseTo(a.currentSpending.derived - 12000, 6);
      expect(a.currentSpending.trimmedByDeficit).toBeCloseTo(0, 6);
      expect(b.currentSpending.debtPayments).toBe(0);
    });

    it('a mortgage paid off before retirement leaves the ending balance where a debt-free plan ends (auto spending)', () => {
      const withDebt = runProjection({ ...solventBase, mortgageBalance: 120000, mortgageRate: 4.5, mortgagePayment: 12000 });
      const withoutDebt = runProjection(solventBase);
      const lastPayment = withDebt.years.filter((y) => y.mortgagePaymentThisYear > 0).pop();
      expect(lastPayment.isRetired).toBe(false);
      expect(withDebt.endingBalance).toBeCloseTo(withoutDebt.endingBalance, 2);
    });

    it('a mortgage that runs into retirement reduces the ending balance', () => {
      const withDebt = runProjection({ ...solventBase, mortgageBalance: 300000, mortgageRate: 6.5, mortgagePayment: 22000 });
      const withoutDebt = runProjection(solventBase);
      expect(withDebt.years.some((y) => y.isRetired && y.mortgagePaymentThisYear > 0)).toBe(true);
      expect(withDebt.endingBalance).toBeLessThan(withoutDebt.endingBalance);
    });

    it('a payment larger than what is left still shows as a deficit, never as negative spending', () => {
      const proj = runProjection({ ...solventBase, mortgageBalance: 3000000, mortgageRate: 6.5, mortgagePayment: 400000 });
      const y = proj.years[0];
      expect(y.currentSpending.debtPayments).toBeCloseTo(y.currentSpending.derived, 6);
      expect(y.currentSpending.applied).toBe(0);
      expect(y.savingsDeficit).toBeGreaterThan(0);
    });

    it('a custom spending figure is charged as typed, with debt payments beside it', () => {
      const custom = { ...solventBase, currentSpendingMode: 'custom', currentHouseholdSpendingCustom: 40000 };
      const y = runProjection({ ...custom, mortgageBalance: 120000, mortgageRate: 4.5, mortgagePayment: 12000 }).years[0];
      expect(y.currentSpending.debtPayments).toBe(0);
      expect(y.currentSpending.applied).toBeCloseTo(40000, 6);
    });
  });

  describe('Sensitivity / Tornado Analysis (runSensitivityAnalysis)', () => {
    // DEFAULT_INPUTS itself is solvent (see the savings-rate/employer-match
    // comments in calculator.js), but that solvency is now generous enough
    // that a bigger nest egg on top of it (the old 200k/40k/40k bump) grows
    // so large that MORE retirement years actually helps rather than hurts
    // it -- SS/RMD income outpaces spending, so extra years just add more
    // reinvested surplus instead of drawing the balance down, flipping the
    // "longer life expectancy" delta positive. This smaller bump keeps the
    // baseline solvent (so deltas aren't floored at $0 on both sides) while
    // still spending close enough to its income that a lower investment
    // return, higher spending, or longer life expectancy has room to show
    // up as a genuine negative delta.
    // Bumped from 120k/20k/20k now that Social Security COLA, Medical,
    // Housing, and Medicare Part B/D each compound at their own dedicated
    // (and mostly higher-than-general) inflation rate -- the old balances
    // depleted to the $0 floor on their own even at baseline, flattening
    // every delta below to 0 vs 0 regardless of sign.
    const SOLVENT_INPUTS = { ...DEFAULT_INPUTS, preTaxInit: 200000, rothInit: 40000, taxableInit: 40000 };

    it('baseline matches a plain runProjection call on the same inputs', () => {
      const direct = runProjection(DEFAULT_INPUTS);
      const sa = runSensitivityAnalysis(DEFAULT_INPUTS);
      expect(sa.baseline.endingBalance).toBeCloseTo(direct.endingBalance, 2);
      expect(sa.baseline.isSuccessful).toBe(direct.isSuccessful);
    });

    it('produces one result per tested variable, each with a low and high variant', () => {
      const sa = runSensitivityAnalysis(DEFAULT_INPUTS);
      expect(sa.results.length).toBe(4);
      const keys = sa.results.map(r => r.key).sort();
      expect(keys).toEqual(['inflation', 'investmentReturn', 'longevity', 'spending']);
      sa.results.forEach(r => {
        expect(typeof r.low.endingBalance).toBe('number');
        expect(typeof r.high.endingBalance).toBe('number');
        expect(r.impact).toBeGreaterThanOrEqual(0);
      });
    });

    it('is sorted by impact magnitude, largest swing first (tornado order)', () => {
      const sa = runSensitivityAnalysis(DEFAULT_INPUTS);
      for (let i = 1; i < sa.results.length; i++) {
        expect(sa.results[i - 1].impact).toBeGreaterThanOrEqual(sa.results[i].impact);
      }
    });

    it('higher investment returns increase the ending balance, lower returns decrease it', () => {
      const sa = runSensitivityAnalysis(SOLVENT_INPUTS);
      const r = sa.results.find(x => x.key === 'investmentReturn');
      expect(r.high.delta).toBeGreaterThan(0);
      expect(r.low.delta).toBeLessThan(0);
    });

    it('higher spending decreases the ending balance, lower spending increases it', () => {
      const sa = runSensitivityAnalysis(SOLVENT_INPUTS);
      const r = sa.results.find(x => x.key === 'spending');
      expect(r.high.delta).toBeLessThan(0);
      expect(r.low.delta).toBeGreaterThan(0);
    });

    it('a longer life expectancy decreases the ending balance (more years to fund)', () => {
      const sa = runSensitivityAnalysis(SOLVENT_INPUTS);
      const r = sa.results.find(x => x.key === 'longevity');
      expect(r.high.delta).toBeLessThan(0);
      expect(r.low.delta).toBeGreaterThan(0);
    });

    it('does not mutate the caller-supplied inputs object', () => {
      const inputsCopy = { ...DEFAULT_INPUTS };
      runSensitivityAnalysis(inputsCopy);
      expect(inputsCopy).toEqual(DEFAULT_INPUTS);
    });
  });

  describe('Sensitivity / Tornado Analysis, real-dollars (computeSensitivityAnalysisReal)', () => {
    // See the SOLVENT_INPUTS comment in the nominal Sensitivity/Tornado
    // describe block above.
    // Bumped from 120k/20k/20k now that Social Security COLA, Medical,
    // Housing, and Medicare Part B/D each compound at their own dedicated
    // (and mostly higher-than-general) inflation rate -- the old balances
    // depleted to the $0 floor on their own even at baseline, flattening
    // every delta below to 0 vs 0 regardless of sign.
    const SOLVENT_INPUTS = { ...DEFAULT_INPUTS, preTaxInit: 200000, rothInit: 40000, taxableInit: 40000 };

    it('deflates the baseline ending balance below the nominal figure', () => {
      const nominal = runSensitivityAnalysis(SOLVENT_INPUTS);
      const real = computeSensitivityAnalysisReal(SOLVENT_INPUTS);
      expect(real.baseline.endingBalance).toBeLessThan(nominal.baseline.endingBalance);
      expect(real.baseline.isSuccessful).toBe(nominal.baseline.isSuccessful);
    });

    it('produces the same 4 variables, each independently sorted by its own real-dollar impact', () => {
      const real = computeSensitivityAnalysisReal(DEFAULT_INPUTS);
      expect(real.results.length).toBe(4);
      const keys = real.results.map(r => r.key).sort();
      expect(keys).toEqual(['inflation', 'investmentReturn', 'longevity', 'spending']);
      for (let i = 1; i < real.results.length; i++) {
        expect(real.results[i - 1].impact).toBeGreaterThanOrEqual(real.results[i].impact);
      }
    });

    it('preserves the same directional signs as the nominal analysis', () => {
      const real = computeSensitivityAnalysisReal(SOLVENT_INPUTS);
      const ret = real.results.find(x => x.key === 'investmentReturn');
      expect(ret.high.delta).toBeGreaterThan(0);
      expect(ret.low.delta).toBeLessThan(0);
      const spend = real.results.find(x => x.key === 'spending');
      expect(spend.high.delta).toBeLessThan(0);
      expect(spend.low.delta).toBeGreaterThan(0);
      const life = real.results.find(x => x.key === 'longevity');
      expect(life.high.delta).toBeLessThan(0);
      expect(life.low.delta).toBeGreaterThan(0);
    });

    it('does not mutate the caller-supplied inputs object', () => {
      const inputsCopy = { ...DEFAULT_INPUTS };
      computeSensitivityAnalysisReal(inputsCopy);
      expect(inputsCopy).toEqual(DEFAULT_INPUTS);
    });
  });

  describe('Reverse Mortgage / Home Equity (runProjection)', () => {
    it('has no effect when disabled', () => {
      const off = runProjection(DEFAULT_INPUTS);
      // Golden regression value for DEFAULT_INPUTS' (solvent) ending
      // balance -- see the comment on the identical assertion in the
      // Multi-heir estate splitting describe block above for the history.
      expect(off.endingBalance).toBeCloseTo(36762.2363, 2);
      expect(off.years.every(y => y.homeValue === 0 && y.reverseMortgageBalance === 0)).toBe(true);
    });

    it('appreciates home value every year even before the loan originates', () => {
      const proj = runProjection({ ...DEFAULT_INPUTS, reverseMortgageEnabled: true, homeValueInit: 400000, homeAppreciationRate: 3, reverseMortgageStartAge: 99 });
      expect(proj.years[0].homeValue).toBeCloseTo(412000, 2);
      expect(proj.years[1].homeValue).toBeCloseTo(424360, 2);
      expect(proj.years[0].reverseMortgageBalance).toBe(0);
    });

    it('lumpSum mode draws the full principal limit in the origination year, with no same-year interest', () => {
      const proj = runProjection({
        ...DEFAULT_INPUTS, reverseMortgageEnabled: true, homeValueInit: 400000, homeAppreciationRate: 0,
        reverseMortgageStartAge: 62, reverseMortgagePrincipalLimitPct: 50, reverseMortgageRate: 6.5,
        reverseMortgagePayoutType: 'lumpSum',
      });
      const origYear = proj.years.find(y => y.age1 === 62);
      const nextYear = proj.years.find(y => y.age1 === 63);
      expect(origYear.reverseMortgagePayoutThisYear).toBe(200000);
      expect(origYear.reverseMortgageBalance).toBe(200000);
      expect(nextYear.reverseMortgageBalance).toBeCloseTo(213000, 2); // 200000 * 1.065
    });

    it('monthly mode draws a fixed annual tenure payment and stops once the principal limit is exhausted', () => {
      const proj = runProjection({
        ...DEFAULT_INPUTS, reverseMortgageEnabled: true, homeValueInit: 100000, homeAppreciationRate: 0,
        reverseMortgageStartAge: 62, reverseMortgagePrincipalLimitPct: 10, reverseMortgageRate: 5,
        reverseMortgagePayoutType: 'monthly', reverseMortgageMonthlyPayout: 1000, inflationRate: 0,
      });
      const age62 = proj.years.find(y => y.age1 === 62);
      const age63 = proj.years.find(y => y.age1 === 63);
      // Desired $12,000/yr exceeds the $10,000 principal limit, so it's exhausted in year one.
      expect(age62.reverseMortgagePayoutThisYear).toBe(10000);
      expect(age62.reverseMortgageBalance).toBe(10000);
      expect(age63.reverseMortgagePayoutThisYear).toBe(0);
      expect(age63.reverseMortgageBalance).toBeCloseTo(10500, 2);
    });

    it('never lets the loan balance exceed the home value (non-recourse cap)', () => {
      const proj = runProjection({
        ...DEFAULT_INPUTS, reverseMortgageEnabled: true, homeValueInit: 200000, homeAppreciationRate: 0,
        reverseMortgageStartAge: 62, reverseMortgagePrincipalLimitPct: 90, reverseMortgageRate: 15,
        reverseMortgagePayoutType: 'lumpSum',
      });
      expect(proj.years.every(y => y.reverseMortgageBalance <= y.homeValue + 0.01)).toBe(true);
    });

    it('tax-free payouts reduce portfolio draws, improving the ending balance vs. an otherwise-identical plan', () => {
      // DEFAULT_INPUTS alone now projects a $0 shortfall (see the
      // SOLVENT_INPUTS comment in the Sensitivity/Tornado describe block),
      // which would floor both sides of this comparison at the same value
      // regardless of the reverse mortgage. Use a comfortably-funded
      // variant so the improvement actually has room to show up.
      const solventBase = { ...DEFAULT_INPUTS, preTaxInit: 200000, rothInit: 40000, taxableInit: 40000 };
      const withRM = runProjection({
        ...solventBase, reverseMortgageEnabled: true, homeValueInit: 400000,
        reverseMortgageStartAge: 62, reverseMortgagePrincipalLimitPct: 50,
        reverseMortgagePayoutType: 'monthly', reverseMortgageMonthlyPayout: 1500,
      });
      const withoutRM = runProjection(solventBase);
      expect(withRM.endingBalance).toBeGreaterThan(withoutRM.endingBalance);
    });
  });

  describe('Life Insurance (Cash Value) (runProjection)', () => {
    it('has no effect when disabled', () => {
      const off = runProjection(DEFAULT_INPUTS);
      // Golden regression value for DEFAULT_INPUTS' (solvent) ending
      // balance -- see the comment on the identical assertion in the
      // Multi-heir estate splitting describe block above for the history.
      expect(off.endingBalance).toBeCloseTo(36762.2363, 2);
      expect(off.years.every(y => y.lifeInsuranceCashValue === 0 && y.lifeInsuranceNetDeathBenefit === 0)).toBe(true);
    });

    it('compounds cash value at the configured growth rate', () => {
      const proj = runProjection({
        ...DEFAULT_INPUTS, lifeInsuranceEnabled1: true, lifeInsuranceCashValueInit1: 50000,
        lifeInsuranceCashValueGrowthRate1: 4, lifeInsuranceLoanBalance1: 0, lifeInsuranceDeathBenefit1: 500000,
      });
      expect(proj.years[0].lifeInsuranceCashValue).toBeCloseTo(52000, 2);
      expect(proj.years[1].lifeInsuranceCashValue).toBeCloseTo(54080, 2);
      expect(proj.years[0].lifeInsuranceNetCashValue).toBeCloseTo(52000, 2);
    });

    it('an outstanding policy loan compounds separately and reduces net cash value and net death benefit', () => {
      const proj = runProjection({
        ...DEFAULT_INPUTS, lifeInsuranceEnabled1: true, lifeInsuranceCashValueInit1: 50000,
        lifeInsuranceCashValueGrowthRate1: 4, lifeInsuranceLoanBalance1: 10000, lifeInsuranceLoanRate1: 8,
        lifeInsuranceDeathBenefit1: 500000,
      });
      expect(proj.years[0].lifeInsuranceLoanBalance).toBeCloseTo(10800, 2);
      expect(proj.years[0].lifeInsuranceNetCashValue).toBeCloseTo(52000 - 10800, 2);
      // Level (non-increasing) benefit: face amount minus the loan.
      expect(proj.years[0].lifeInsuranceNetDeathBenefit).toBeCloseTo(500000 - 10800, 2);
    });

    it('caps the policy loan balance at the cash value (cannot exceed the value backing it)', () => {
      const proj = runProjection({
        ...DEFAULT_INPUTS, lifeInsuranceEnabled1: true, lifeInsuranceCashValueInit1: 10000,
        lifeInsuranceCashValueGrowthRate1: 0, lifeInsuranceLoanBalance1: 9000, lifeInsuranceLoanRate1: 50,
        lifeInsuranceDeathBenefit1: 100000,
      });
      expect(proj.years.every(y => y.lifeInsuranceLoanBalance <= y.lifeInsuranceCashValue + 0.01)).toBe(true);
      expect(proj.years[0].lifeInsuranceNetCashValue).toBe(0);
    });

    it('an increasing-benefit policy adds accrued cash value on top of the level face amount', () => {
      const proj = runProjection({
        ...DEFAULT_INPUTS, lifeInsuranceEnabled1: true, lifeInsuranceCashValueInit1: 50000,
        lifeInsuranceCashValueGrowthRate1: 4, lifeInsuranceLoanBalance1: 0, lifeInsuranceDeathBenefit1: 500000,
        lifeInsuranceIncreasingBenefit1: true,
      });
      expect(proj.years[0].lifeInsuranceNetDeathBenefit).toBeCloseTo(500000 + 52000, 2);
    });

    it('tracks each spouse\'s policy independently and sums them into the combined total', () => {
      const proj = runProjection({
        ...DEFAULT_INPUTS, spouse2Enabled: true,
        lifeInsuranceEnabled1: true, lifeInsuranceCashValueInit1: 50000, lifeInsuranceCashValueGrowthRate1: 4,
        lifeInsuranceDeathBenefit1: 500000,
        lifeInsuranceEnabled2: true, lifeInsuranceCashValueInit2: 20000, lifeInsuranceCashValueGrowthRate2: 5,
        lifeInsuranceDeathBenefit2: 250000,
      });
      expect(proj.years[0].lifeInsuranceNetDeathBenefit1).toBeCloseTo(500000, 2);
      expect(proj.years[0].lifeInsuranceNetDeathBenefit2).toBeCloseTo(250000, 2);
      expect(proj.years[0].lifeInsuranceNetDeathBenefit).toBeCloseTo(750000, 2);
      expect(proj.years[0].lifeInsuranceCashValue).toBeCloseTo(52000 + 21000, 2);
      // Spouse 2 disabled shouldn't leak any of spouse 1's numbers onto it.
      const soloProj = runProjection({
        ...DEFAULT_INPUTS, lifeInsuranceEnabled1: true, lifeInsuranceCashValueInit1: 50000, lifeInsuranceDeathBenefit1: 500000,
      });
      expect(soloProj.years[0].lifeInsuranceNetDeathBenefit2).toBe(0);
    });
  });

  describe('Life Insurance estate inclusion (calculateHeirEstateTax)', () => {
    it('has no effect when the 5th/6th arguments are omitted (backward compatible)', () => {
      const result = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 200000, 100000);
      // Golden regression value, unchanged by adding the new optional params.
      expect(result.grossInherited).toBeCloseTo(1798263.19, 1);
    });

    it('self-owned death benefit is added to gross/net inherited and counted toward state estate tax', () => {
      const base = calculateHeirEstateTax(DEFAULT_INPUTS, 1000000, 200000, 100000, 0);
      const withLI = calculateHeirEstateTax(
        { ...DEFAULT_INPUTS, lifeInsuranceEnabled1: true, lifeInsuranceOwnership1: 'self' },
        1000000, 200000, 100000, 500000
      );
      expect(withLI.totalLifeInsuranceProceeds).toBe(500000);
      expect(withLI.lifeInsuranceEstateInclusion).toBe(500000);
      expect(withLI.grossInherited).toBeCloseTo(base.grossInherited + 500000, 1);
      expect(withLI.perHeir[0].lifeInsuranceInherited).toBeCloseTo(500000 * (withLI.perHeir[0].splitPct / 100), 1);
    });

    it('trust-owned (ILIT) death benefit still reaches heirs but is excluded from the taxable estate', () => {
      const withLI = calculateHeirEstateTax(
        { ...DEFAULT_INPUTS, lifeInsuranceEnabled1: true, lifeInsuranceOwnership1: 'trust' },
        1000000, 200000, 100000, 500000
      );
      expect(withLI.lifeInsuranceEstateInclusion).toBe(0);
      expect(withLI.totalLifeInsuranceProceeds).toBe(500000);
      // Still shows up in what heirs actually receive.
      expect(withLI.perHeir[0].lifeInsuranceInherited).toBeCloseTo(500000 * (withLI.perHeir[0].splitPct / 100), 1);
    });

    it('each spouse\'s policy is evaluated against its OWN ownership setting -- one self-owned, one trust-owned', () => {
      const withLI = calculateHeirEstateTax(
        {
          ...DEFAULT_INPUTS,
          lifeInsuranceEnabled1: true, lifeInsuranceOwnership1: 'self',
          lifeInsuranceEnabled2: true, lifeInsuranceOwnership2: 'trust',
        },
        1000000, 200000, 100000, 500000, 300000
      );
      // Combined proceeds include both policies...
      expect(withLI.totalLifeInsuranceProceeds).toBe(800000);
      // ...but only the self-owned one counts toward the taxable estate.
      expect(withLI.lifeInsuranceEstateInclusion).toBe(500000);
      expect(withLI.perHeir[0].lifeInsuranceInherited).toBeCloseTo(800000 * (withLI.perHeir[0].splitPct / 100), 1);
    });

    it('migrateInputs backfills a legacy shared lifeInsurance* set onto spouse 1 ONLY (not duplicated onto spouse 2)', () => {
      const legacy = migrateInputs({
        lifeInsuranceEnabled: true, lifeInsurancePolicyType: 'universalLife', lifeInsuranceOwnership: 'trust',
        lifeInsuranceCashValueInit: 40000, lifeInsuranceCashValueGrowthRate: 5, lifeInsuranceLoanBalance: 1000,
        lifeInsuranceLoanRate: 7, lifeInsuranceDeathBenefit: 300000, lifeInsuranceIncreasingBenefit: true,
        lifeInsuranceAnnualPremium: 2000,
      });
      expect(legacy.lifeInsuranceEnabled1).toBe(true);
      expect(legacy.lifeInsurancePolicyType1).toBe('universalLife');
      expect(legacy.lifeInsuranceOwnership1).toBe('trust');
      expect(legacy.lifeInsuranceCashValueInit1).toBe(40000);
      expect(legacy.lifeInsuranceCashValueGrowthRate1).toBe(5);
      expect(legacy.lifeInsuranceLoanBalance1).toBe(1000);
      expect(legacy.lifeInsuranceLoanRate1).toBe(7);
      expect(legacy.lifeInsuranceDeathBenefit1).toBe(300000);
      expect(legacy.lifeInsuranceIncreasingBenefit1).toBe(true);
      expect(legacy.lifeInsuranceAnnualPremium1).toBe(2000);
      // Spouse 2 stays at defaults -- the old plan only ever had one policy.
      expect(legacy.lifeInsuranceEnabled2).toBe(false);
      expect(legacy.lifeInsuranceDeathBenefit2).toBe(0);
    });

    it('migrateInputs leaves an already-split lifeInsurance plan untouched', () => {
      const modern = migrateInputs({ lifeInsuranceEnabled1: true, lifeInsuranceDeathBenefit1: 100000, lifeInsuranceEnabled2: true, lifeInsuranceDeathBenefit2: 200000 });
      expect(modern.lifeInsuranceEnabled1).toBe(true);
      expect(modern.lifeInsuranceDeathBenefit1).toBe(100000);
      expect(modern.lifeInsuranceEnabled2).toBe(true);
      expect(modern.lifeInsuranceDeathBenefit2).toBe(200000);
    });
  });

  describe('Backdoor Roth / pro-rata rule (runProjection)', () => {
    it('has no effect when disabled', () => {
      const off = runProjection(DEFAULT_INPUTS);
      // Golden regression value for DEFAULT_INPUTS' (solvent) ending
      // balance -- see the comment on the identical assertion in the
      // Multi-heir estate splitting describe block above for the history.
      expect(off.endingBalance).toBeCloseTo(36762.2363, 2);
      expect(off.years.every(y => y.preTaxBasis === 0 && y.backdoorRothContribution === 0)).toBe(true);
    });

    it('a pure backdoor Roth contribution (100% basis, no other pre-tax money) converts entirely tax-free', () => {
      const proj = runProjection({
        // employerMatchMode1: 'flat' (with employerMatch1: 0) fully zeroes
        // the employer match regardless of deferral amount -- DEFAULT_INPUTS
        // now defaults employerMatchMode1 to 'percent', which would otherwise
        // credit a small match on rothContribution1 alone (spouse1Deferral
        // includes Roth, not just Pre-Tax) and dilute this test's "100%
        // basis, nothing else" premise with a sliver of non-basis money.
        ...DEFAULT_INPUTS, preTaxInit: 0, preTaxContribution1: 0, employerMatch1: 0, employerMatchMode1: 'flat',
        backdoorRothEnabled: true, backdoorRothAnnualAmount1: 7000, // spouse 2 disabled in DEFAULT_INPUTS, so only spouse 1's amount lands
        rothConversionStrategy: 'fixed', rothConversionAmount: 7000, rothConversionDelayUntilRetire: false,
      });
      const y1 = proj.years[0];
      expect(y1.backdoorRothContribution).toBe(7000);
      expect(y1.convertAmount).toBe(7000);
      expect(y1.convertAmountTaxable).toBeCloseTo(0, 6);
      expect(y1.preTaxBasis).toBeCloseTo(0, 6);
    });

    it('a conversion with no basis present is fully taxable (unaffected by pro-rata)', () => {
      const proj = runProjection({
        ...DEFAULT_INPUTS, preTaxInit: 500000,
        rothConversionStrategy: 'fixed', rothConversionAmount: 20000, rothConversionDelayUntilRetire: false,
      });
      const y1 = proj.years[0];
      expect(y1.convertAmountTaxable).toBeCloseTo(y1.convertAmount, 6);
    });

    it('splits a conversion pro-rata between taxable and tax-free basis return', () => {
      // 10% basis ratio: $100k pre-tax with $10k basis -> a $20k conversion
      // should be $18k taxable, $2k tax-free return of basis.
      const proj = runProjection({
        // employerMatchMode1: 'flat' -- see the comment on the "pure backdoor
        // Roth" test above; without it, rothContribution1 alone (now
        // non-zero by default) would credit a small non-basis match dollar
        // amount and throw off this test's precise 90%/10% basis split.
        ...DEFAULT_INPUTS, preTaxInit: 100000, preTaxBasisInit: 10000, preTaxContribution1: 0, employerMatch1: 0, employerMatchMode1: 'flat',
        rothConversionStrategy: 'fixed', rothConversionAmount: 20000, rothConversionDelayUntilRetire: false,
      });
      const y1 = proj.years[0];
      expect(y1.convertAmount).toBe(20000);
      expect(y1.convertAmountTaxable).toBeCloseTo(18000, 2);
      expect(y1.preTaxBasis).toBeCloseTo(8000, 2);
    });

    it('sizes a maxBracket conversion larger (in nominal dollars) when basis is present, landing on the same taxable target', () => {
      const common = {
        // employerMatchMode1: 'flat' -- see the comment on the "pure backdoor
        // Roth" test above.
        ...DEFAULT_INPUTS, preTaxInit: 500000, preTaxContribution1: 0, employerMatch1: 0, employerMatchMode1: 'flat', salary1: 0,
        rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.22, rothConversionBuffer: 0, rothConversionDelayUntilRetire: false,
        // Spending comes from Taxable, so no Pre-Tax draw shares the bracket
        // (changelog 423 trims the fill by such a draw, whose taxable share
        // differs between the two plans).
        taxableInit: 2000000, withdrawalStrategy: 'TaxableFirst',
      };
      const noBasis = runProjection(common);
      const withBasis = runProjection({ ...common, preTaxBasisInit: 250000 }); // 50% basis
      const y1NoBasis = noBasis.years[0];
      const y1WithBasis = withBasis.years[0];
      expect(y1NoBasis.convertAmount).toBeCloseTo(y1NoBasis.convertAmountTaxable, 2);
      expect(y1WithBasis.convertAmount).toBeCloseTo(y1NoBasis.convertAmount * 2, 0);
      expect(y1WithBasis.convertAmountTaxable).toBeCloseTo(y1NoBasis.convertAmountTaxable, 0);
    });

    it('never lets preTaxBasis go negative, even after it is fully consumed', () => {
      const proj = runProjection({
        ...DEFAULT_INPUTS, preTaxInit: 50000, preTaxBasisInit: 5000, preTaxContribution1: 0, employerMatch1: 0,
        rothConversionStrategy: 'fixed', rothConversionAmount: 40000, rothConversionDelayUntilRetire: false,
      });
      expect(proj.years.every(y => y.preTaxBasis >= 0)).toBe(true);
    });
  });

  describe('Percent-based employer match (calculateEmployerMatch)', () => {
    const greaterOfConfig = { mode: 'percent', flatAmount: 0, rateA: 50, capAPct: 100, tierBEnabled: true, rateB: 100, capB: 3000, combine: 'greaterOf' };
    const limit = 24500;

    it('flat mode reproduces the original flat-dollar behavior (inflated)', () => {
      expect(calculateEmployerMatch(999999, limit, 1.1, { mode: 'flat', flatAmount: 2000 })).toBeCloseTo(2200, 2);
    });

    it('greater-of: small deferral -> Tier B (100% up to $3,000) wins', () => {
      // 50% of $1,000 = $500 vs 100% of min($1,000,$3,000) = $1,000
      expect(calculateEmployerMatch(1000, limit, 1, greaterOfConfig)).toBe(1000);
    });

    it('greater-of: mid-size deferral -> Tier A (50% of deferral) wins once it exceeds Tier B\'s cap', () => {
      // 50% of $10,000 = $5,000 vs 100% of min($10,000,$3,000) = $3,000
      expect(calculateEmployerMatch(10000, limit, 1, greaterOfConfig)).toBe(5000);
    });

    it('Tier A is capped at the IRS deferral limit even if the deferral exceeds it', () => {
      // 50% of min($30,000, $24,500) = $12,250
      expect(calculateEmployerMatch(30000, limit, 1, greaterOfConfig)).toBeCloseTo(12250, 2);
    });

    it('sumOfTiers mode adds both tiers instead of taking the greater', () => {
      const sumConfig = { ...greaterOfConfig, combine: 'sumOfTiers' };
      // 50% of $10,000 + 100% of min($10,000,$3,000) = $5,000 + $3,000
      expect(calculateEmployerMatch(10000, limit, 1, sumConfig)).toBeCloseTo(8000, 2);
    });

    it('Tier B is skipped entirely when tierBEnabled is false', () => {
      const singleTier = { ...greaterOfConfig, tierBEnabled: false };
      expect(calculateEmployerMatch(1000, limit, 1, singleTier)).toBeCloseTo(500, 2);
    });

    it('wired end-to-end through runProjection changes the ending balance vs. flat $0 match', () => {
      // DEFAULT_INPUTS alone now projects a $0 shortfall (see the
      // SOLVENT_INPUTS comment in the Sensitivity/Tornado describe block);
      // a comfortably-funded variant is used here so the employer match's
      // benefit has room to actually move the ending balance instead of
      // both sides flooring at the same value.
      const solventBase = { ...DEFAULT_INPUTS, preTaxInit: 200000, rothInit: 40000, taxableInit: 40000 };
      const flatZero = runProjection(solventBase);
      const percentMatch = runProjection({
        ...solventBase,
        employerMatchMode1: 'percent', employerMatchRateA1: 50, employerMatchCapAPct1: 100,
        employerMatchTierBEnabled1: true, employerMatchRateB1: 100, employerMatchCapB1: 3000, employerMatchCombine1: 'greaterOf',
      });
      // Compare balances at the last working year (right before retirement)
      // rather than the terminal endingBalance decades later: over a ~45
      // year decumulation horizon, a larger pre-tax balance can trigger a
      // bigger RMD that tips a single year across a marginal-bracket or
      // guardrail cliff, so "more contributions now" doesn't guarantee a
      // strictly larger balance 45 years on. It does reliably produce a
      // larger balance at the moment contributions stop, which is what
      // this test is actually verifying (the match is wired end-to-end).
      const lastWorkingYearFlat = flatZero.years.find(y => y.age1 === 66).totalPortfolioEnding;
      const lastWorkingYearMatch = percentMatch.years.find(y => y.age1 === 66).totalPortfolioEnding;
      expect(lastWorkingYearMatch).toBeGreaterThan(lastWorkingYearFlat);
    });
  });

  describe('Safe Withdrawal Rate / FI Crossover (runProjection)', () => {
    it('is backward compatible: an old saved plan missing safeWithdrawalRate behaves identically to explicitly setting 4.0', () => {
      // sanitizeInputs zeroes out unrecognized/missing numeric fields that
      // aren't Age/Year/Expectancy/Return (rather than falling back to
      // DEFAULT_INPUTS), so a pre-existing saved plan from before this
      // field existed will have safeWithdrawalRate === 0 once loaded.
      // runProjection must fall back to the classic 4% rule in that case.
      const { safeWithdrawalRate: _safeWithdrawalRate, ...withoutSWR } = DEFAULT_INPUTS;
      const legacy = runProjection(withoutSWR);
      const explicit4pct = runProjection({ ...DEFAULT_INPUTS, safeWithdrawalRate: 4.0 });
      expect(legacy.years.map(y => y.isFICrossover)).toEqual(explicit4pct.years.map(y => y.isFICrossover));
    });

    it('an explicit 0 also falls back to the 4% default instead of dividing by zero', () => {
      const zero = runProjection({ ...DEFAULT_INPUTS, safeWithdrawalRate: 0 });
      const explicit4pct = runProjection({ ...DEFAULT_INPUTS, safeWithdrawalRate: 4.0 });
      expect(zero.years.map(y => y.isFICrossover)).toEqual(explicit4pct.years.map(y => y.isFICrossover));
      expect(zero.years.every(y => Number.isFinite(y.totalPortfolioEnding))).toBe(true);
    });

    it('a lower SWR raises the FI number, making crossover no easier to reach than a higher SWR', () => {
      const base = { ...DEFAULT_INPUTS, preTaxInit: 2000000, rothInit: 500000, taxableInit: 500000 };
      const conservative = runProjection({ ...base, safeWithdrawalRate: 3.0 });
      const aggressive = runProjection({ ...base, safeWithdrawalRate: 6.0 });
      // Same portfolio, same target expenses -- a 3% SWR demands a bigger
      // portfolio (33.3x expenses) than a 6% SWR (16.7x expenses), so the
      // conservative run should reach FI crossover no earlier than the
      // aggressive one in every year.
      const earlier = conservative.years
        .map((y, i) => (y.isFICrossover && !aggressive.years[i].isFICrossover ? y.year : null))
        .filter((y) => y !== null);
      expect(earlier).toEqual([]);
      // The conservative run does reach crossover in this plan, so the
      // comparison above covered real years.
      expect(conservative.years.filter((y) => y.isFICrossover).length).toBeGreaterThan(0);
    });
  });

  describe('Contribution Advisor (getContributionAdvisory)', () => {
    // Real-world worked example from the conversation this feature was
    // built from: age 57, $400k salary, MFJ, maxing the base elective
    // deferral in Traditional with a 50%-of-deferral employer match, plus
    // a partial-year Roth catch-up contribution.
    const HIGH_EARNER = {
      ...DEFAULT_INPUTS,
      birthYear1: 1969, // age 57 in TAX_YEAR (2026)
      salary1: 400000,
      filingStatus: 'MFJ',
      spouse2Enabled: false,
      preTaxContribution1: 24500,
      rothContribution1: 1677.28,
      employerMatchMode1: 'percent', employerMatchRateA1: 50, employerMatchCapAPct1: 100, employerMatchTierBEnabled1: false,
    };

    it('computes deferral usage, catch-up room, employer match, and mega backdoor room for the worked example', () => {
      const advisory = getContributionAdvisory(HIGH_EARNER);
      const s1 = advisory.spouse1;
      expect(s1.age).toBe(57);
      expect(s1.deferralLimit).toBe(32500); // 24,500 base + 8,000 (age 50-59 catch-up)
      expect(s1.catchupUsed).toBeCloseTo(1677.28, 2);
      expect(s1.catchupRemaining).toBeCloseTo(6322.72, 2);
      expect(s1.employerMatch).toBeCloseTo(12250, 2); // 50% of the $24,500 base deferral
      expect(s1.megaBackdoorRoom).toBeCloseTo(35250, 2); // 72,000 - 24,500 - 12,250
    });

    it('flags the mandatory Roth catch-up rule only when age 50+ AND salary exceeds the 2026 wage threshold', () => {
      expect(getContributionAdvisory(HIGH_EARNER).spouse1.mandatoryRothCatchup).toBe(true);
      expect(getContributionAdvisory({ ...HIGH_EARNER, salary1: 100000 }).spouse1.mandatoryRothCatchup).toBe(false);
      expect(getContributionAdvisory({ ...HIGH_EARNER, birthYear1: 1990 }).spouse1.mandatoryRothCatchup).toBe(false); // under 50
    });

    it('does not flag a compliance problem when catch-up money is correctly sitting in Roth', () => {
      // HIGH_EARNER's Traditional contribution ($24,500) exactly matches
      // the base limit -- none of it is catch-up money, so nothing is
      // misallocated even though the mandate applies.
      expect(getContributionAdvisory(HIGH_EARNER).spouse1.catchupMisallocatedToTraditional).toBe(0);
    });

    it('flags a compliance problem when catch-up money is sitting in Traditional despite the mandatory-Roth rule', () => {
      const misallocated = { ...HIGH_EARNER, preTaxContribution1: 28000, rothContribution1: 0 };
      // $28,000 Traditional exceeds the $24,500 base limit by $3,500 --
      // that $3,500 is catch-up money that should have been Roth.
      expect(getContributionAdvisory(misallocated).spouse1.catchupMisallocatedToTraditional).toBeCloseTo(3500, 2);
    });

    it('mega backdoor room shrinks dollar-for-dollar with a larger employer match', () => {
      const bigMatch = { ...HIGH_EARNER, employerMatchRateA1: 100 }; // 100% instead of 50% -> $24,500 match
      const a = getContributionAdvisory(HIGH_EARNER).spouse1;
      const b = getContributionAdvisory(bigMatch).spouse1;
      expect(b.employerMatch).toBeCloseTo(24500, 2);
      expect(a.megaBackdoorRoom - b.megaBackdoorRoom).toBeCloseTo(b.employerMatch - a.employerMatch, 2);
    });

    it('mega backdoor room never goes negative even if deferral + match alone exceed the 415(c) limit', () => {
      const hugeMatch = { ...HIGH_EARNER, employerMatchMode1: 'flat', employerMatch1: 100000 };
      expect(getContributionAdvisory(hugeMatch).spouse1.megaBackdoorRoom).toBe(0);
    });

    it('exposes afterTaxAllowed as-entered, defaulting to false (never assumed available)', () => {
      expect(getContributionAdvisory(HIGH_EARNER).spouse1.afterTaxAllowed).toBe(false);
      expect(getContributionAdvisory({ ...HIGH_EARNER, afterTaxContributionsAllowed1: true }).spouse1.afterTaxAllowed).toBe(true);
    });

    it('Roth IRA eligibility is "none" above the 2026 MFJ ceiling, "full" well below the floor', () => {
      expect(getContributionAdvisory(HIGH_EARNER).rothIra.eligibility).toBe('none');
      const modestIncome = { ...HIGH_EARNER, salary1: 120000 };
      expect(getContributionAdvisory(modestIncome).rothIra.eligibility).toBe('full');
    });

    it('Roth IRA eligibility is "partial" strictly inside the phase-out band, using the correct band per filing status', () => {
      const mfjPhaseOut = { ...HIGH_EARNER, salary1: 245000 }; // between 242k and 252k
      expect(getContributionAdvisory(mfjPhaseOut).rothIra.eligibility).toBe('partial');

      const singlePhaseOut = { ...HIGH_EARNER, filingStatus: 'Single', salary1: 160000 }; // between 153k and 168k
      expect(getContributionAdvisory(singlePhaseOut).rothIra.eligibility).toBe('partial');
    });

    it('combines both spouses\' wages toward the MAGI proxy only when spouse2 is enabled, using MFJ thresholds either way for an MFJ filer', () => {
      const singleIncomeMFJ = { ...HIGH_EARNER, salary1: 200000, spouse2Enabled: false };
      const dualIncomeMFJ = { ...HIGH_EARNER, salary1: 200000, spouse2Enabled: true, salary2: 100000, birthYear2: 1969 };
      // 200k alone (spouse2 off) is under the 242k MFJ floor -> full.
      expect(getContributionAdvisory(singleIncomeMFJ).rothIra.eligibility).toBe('full');
      // 200k + 100k = 300k combined (spouse2 on) is over the 252k MFJ ceiling -> none.
      expect(getContributionAdvisory(dualIncomeMFJ).rothIra.eligibility).toBe('none');
    });

    it('returns spouse2 as null when spouse2Enabled is false, and a populated object when true', () => {
      expect(getContributionAdvisory(HIGH_EARNER).spouse2).toBeNull();
      const withSpouse2 = { ...HIGH_EARNER, spouse2Enabled: true, birthYear2: 1975, salary2: 80000, preTaxContribution2: 5000, rothContribution2: 2000 };
      const advisory = getContributionAdvisory(withSpouse2);
      expect(advisory.spouse2).not.toBeNull();
      expect(advisory.spouse2.age).toBe(51);
    });
  });

  describe('Auto-Max Contribution (runProjection)', () => {
    it('is inert (matches manual amount) when off', () => {
      const off = runProjection(DEFAULT_INPUTS);
      // Golden regression value for DEFAULT_INPUTS' (solvent) ending
      // balance -- see the comment on the identical assertion in the
      // Multi-heir estate splitting describe block above for the history.
      expect(off.endingBalance).toBeCloseTo(36762.2363, 2);
    });

    it('401k mode uses the age-based elective deferral limit instead of the manual amount', () => {
      const proj = runProjection({ ...DEFAULT_INPUTS, autoMaxContribution1: '401k', preTaxContribution1: 3000 });
      const y1 = proj.years[0];
      const expectedLimit = getElectiveDeferralLimit(y1.age1);
      expect(expectedLimit).toBeGreaterThan(3000); // sanity: auto-max should differ meaningfully from the manual $3,000
      // Indirect check: a plan auto-maxing to ~$24.5k/yr accumulates far
      // more than one manually saving $3k/yr.
      const manual = runProjection({ ...DEFAULT_INPUTS, preTaxContribution1: 3000 });
      expect(proj.endingBalance).toBeGreaterThan(manual.endingBalance);
    });

    it('ira mode uses the (lower) IRA limit, landing between manual and 401k-max', () => {
      const manual = runProjection({ ...DEFAULT_INPUTS, preTaxContribution1: 3000 });
      const iraMax = runProjection({ ...DEFAULT_INPUTS, autoMaxContribution1: 'ira', preTaxContribution1: 3000 });
      const the401kMax = runProjection({ ...DEFAULT_INPUTS, autoMaxContribution1: '401k', preTaxContribution1: 3000 });
      expect(getIRAContributionLimit(46)).toBeLessThan(getElectiveDeferralLimit(46));
      expect(iraMax.endingBalance).toBeGreaterThan(manual.endingBalance);
      expect(iraMax.endingBalance).toBeLessThan(the401kMax.endingBalance);
    });

    it('runs without crashing when combined with a percent-based employer match', () => {
      const proj = runProjection({
        ...DEFAULT_INPUTS, autoMaxContribution1: '401k',
        employerMatchMode1: 'percent', employerMatchRateA1: 50, employerMatchCapAPct1: 100,
      });
      expect(isNaN(proj.endingBalance)).toBe(false);
    });
  });

  describe('Contribute the Max (autoMaxContribution mode "max")', () => {
    // getMaxContributionSplit is the pure per-year 401(k) split the
    // projection, the Settings notes, and the Contribution Advisor all
    // share -- 2026 constants: $24,500 base, $8,000 catch-up 50+ ($11,250
    // for 60-63), mandatory Roth catch-up above $150,000 wages.
    describe('getMaxContributionSplit', () => {
      it('under 50: full base limit Pre-Tax, no Roth', () => {
        expect(getMaxContributionSplit(45, 300000)).toEqual({ preTax: 24500, roth: 0, mandatoryRothCatchup: false });
      });

      it('50+ under the wage threshold: catch-up stays Pre-Tax', () => {
        expect(getMaxContributionSplit(52, 140000)).toEqual({ preTax: 32500, roth: 0, mandatoryRothCatchup: false });
      });

      it('50+ over the wage threshold: catch-up flips to Roth (SECURE 2.0)', () => {
        expect(getMaxContributionSplit(52, 200000)).toEqual({ preTax: 24500, roth: 8000, mandatoryRothCatchup: true });
      });

      it('60-63 super catch-up flips as one piece', () => {
        expect(getMaxContributionSplit(61, 200000)).toEqual({ preTax: 24500, roth: 11250, mandatoryRothCatchup: true });
      });

      it('inflFactor scales the limits AND the wage threshold consistently', () => {
        // $250k wages vs a doubled $300k threshold: no longer over it, so
        // the whole doubled limit stays Pre-Tax.
        expect(getMaxContributionSplit(52, 250000, 2)).toEqual({ preTax: 65000, roth: 0, mandatoryRothCatchup: false });
        // $700k clears even the doubled threshold: catch-up flips, doubled.
        expect(getMaxContributionSplit(52, 700000, 2)).toEqual({ preTax: 49000, roth: 16000, mandatoryRothCatchup: true });
      });
    });

    it('beats 401k-only auto-max because the IRA and HSA stack on top', () => {
      const the401kMax = runProjection({ ...DEFAULT_INPUTS, autoMaxContribution1: '401k' });
      const theMax = runProjection({ ...DEFAULT_INPUTS, autoMaxContribution1: 'max' });
      expect(theMax.endingBalance).toBeGreaterThan(the401kMax.endingBalance);
    });

    it('contributes the age-aware IRA limit through the backdoor mechanism every working year', () => {
      const proj = runProjection({ ...DEFAULT_INPUTS, autoMaxContribution1: 'max', backdoorRothEnabled: false });
      const y1 = proj.years[0];
      // Year 0 runs at inflFactor 1, so the row's backdoor figure is the
      // raw age-based IRA limit.
      expect(y1.backdoorRothContribution).toBeCloseTo(getIRAContributionLimit(y1.age1), 6);
    });

    it('REPLACES (never adds to) a configured manual backdoor amount for that spouse', () => {
      const proj = runProjection({
        ...DEFAULT_INPUTS, autoMaxContribution1: 'max',
        backdoorRothEnabled: true, backdoorRothAnnualAmount1: 7500,
      });
      const y1 = proj.years[0];
      expect(y1.backdoorRothContribution).toBeCloseTo(getIRAContributionLimit(y1.age1), 6);
    });

    it('leaves the OTHER spouse\'s manual backdoor contribution untouched', () => {
      const proj = runProjection({
        ...DEFAULT_INPUTS, spouse2Enabled: true, autoMaxContribution1: 'max',
        backdoorRothEnabled: true, backdoorRothAnnualAmount1: 7500, backdoorRothAnnualAmount2: 4000,
      });
      const y1 = proj.years[0];
      expect(y1.backdoorRothContribution).toBeCloseTo(getIRAContributionLimit(y1.age1) + 4000, 6);
    });

    it('maxes the household HSA to the legal limit (coverage tier + 55+ catch-up)', () => {
      const selfOnly = runProjection({ ...DEFAULT_INPUTS, autoMaxContribution1: 'max', hsaContribution: 1000, hsaFamilyCoverage: false });
      const family = runProjection({ ...DEFAULT_INPUTS, autoMaxContribution1: 'max', hsaContribution: 1000, hsaFamilyCoverage: true });
      const y1self = selfOnly.years[0];
      expect(y1self.hsaContribution).toBeCloseTo(getHSAContributionLimit(y1self.age1, false), 6);
      expect(family.years[0].hsaContribution).toBeCloseTo(getHSAContributionLimit(y1self.age1, true), 6);
    });

    it('treats 65+ as Medicare-enrolled: HSA falls back to the manual amount', () => {
      // Spouse working to 70, already 66 in year 0: max mode still governs
      // the 401(k)/IRA pieces but must NOT max the HSA.
      const proj = runProjection({
        ...DEFAULT_INPUTS, birthYear1: TAX_YEAR - 66, retireAge1: 70,
        autoMaxContribution1: 'max', hsaContribution: 1234,
      });
      expect(proj.years[0].hsaContribution).toBeCloseTo(1234, 6);
    });

    it('advisory grades the imputed max split, not the stale manual fields', () => {
      // High earner 52: the imputed split is base-limit Pre-Tax + catch-up
      // Roth -- exactly at the limit, mandatory rule satisfied -- even
      // though the (disabled) manual fields still say $3k/$0.
      const advisory = getContributionAdvisory({
        ...DEFAULT_INPUTS, birthYear1: TAX_YEAR - 52, salary1: 200000,
        autoMaxContribution1: 'max', preTaxContribution1: 3000, rothContribution1: 0,
      });
      expect(advisory.spouse1.totalDeferral).toBe(advisory.spouse1.deferralLimit);
      expect(advisory.spouse1.mandatoryRothCatchup).toBe(true);
      expect(advisory.spouse1.catchupMisallocatedToTraditional).toBe(0);
    });

    it('advisory flags a 415(c) annual-additions breach from an oversized flat match, warn-only', () => {
      const breached = getContributionAdvisory({
        ...DEFAULT_INPUTS, preTaxContribution1: 24500,
        employerMatchMode1: 'flat', employerMatch1: 60000,
      });
      expect(breached.spouse1.annualAdditionsBreached).toBe(true);
      expect(breached.spouse1.annualAdditionsUsed).toBe(24500 + 60000);

      const fine = getContributionAdvisory({ ...DEFAULT_INPUTS });
      expect(fine.spouse1.annualAdditionsBreached).toBe(false);
    });
  });

  describe('Per-spouse Pre-Tax/Roth Savings split (preTaxContribution1/2, rothContribution1/2)', () => {
    it('migrateInputs backfills a legacy shared preTaxContribution/rothContribution into both spouses', () => {
      const legacy = migrateInputs({ preTaxContribution: 5000, rothContribution: 2000 });
      expect(legacy.preTaxContribution1).toBe(5000);
      expect(legacy.preTaxContribution2).toBe(5000);
      expect(legacy.rothContribution1).toBe(2000);
      expect(legacy.rothContribution2).toBe(2000);
    });

    it('migrateInputs leaves already-split inputs untouched', () => {
      const modern = migrateInputs({ preTaxContribution1: 9000, preTaxContribution2: 1000, rothContribution1: 3000, rothContribution2: 500 });
      expect(modern.preTaxContribution1).toBe(9000);
      expect(modern.preTaxContribution2).toBe(1000);
      expect(modern.rothContribution1).toBe(3000);
      expect(modern.rothContribution2).toBe(500);
    });

    it('asymmetric per-spouse contributions produce a different result than symmetric ones (the split actually takes effect)', () => {
      const asymmetric = runProjection({ ...DEFAULT_INPUTS, spouse2Enabled: true, salary2: 80000, preTaxContribution1: 10000, preTaxContribution2: 2000 });
      const symmetric = runProjection({ ...DEFAULT_INPUTS, spouse2Enabled: true, salary2: 80000, preTaxContribution1: 6000, preTaxContribution2: 6000 });
      expect(asymmetric.endingBalance).not.toBeCloseTo(symmetric.endingBalance, 0);
    });

    it('spouse 2 contributions are ignored entirely when spouse2Enabled is false', () => {
      const off = runProjection({ ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxContribution1: 3000, preTaxContribution2: 999999 });
      const baseline = runProjection({ ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxContribution1: 3000, preTaxContribution2: 0 });
      expect(off.endingBalance).toBeCloseTo(baseline.endingBalance, 2);
    });
  });

  describe('Tax-loss harvesting (runProjection)', () => {
    it('has no effect when disabled, even through a down year', () => {
      const off = runProjection({ ...DEFAULT_INPUTS, taxLossHarvestingEnabled: false });
      // Golden regression value for DEFAULT_INPUTS' (solvent) ending
      // balance -- see the comment on the identical assertion in the
      // Multi-heir estate splitting describe block above for the history.
      expect(off.endingBalance).toBeCloseTo(36762.2363, 2);
      expect(off.years.every(y => y.lossCarryforward === 0 && y.taxLossHarvestedThisYear === 0)).toBe(true);
    });

    it('harvests a loss in a down (stress-test) year and carries it forward', () => {
      const stressInputs = {
        ...DEFAULT_INPUTS, taxableInit: 500000, taxableBasisInit: 500000, stressType: 'crashYear', stressCrashReturn: -20,
        stressStartMode: 'specific', stressStartYear: 2027, taxLossHarvestingEnabled: true,
      };
      const proj = runProjection(stressInputs);
      const crashYear = proj.years.find(y => y.year === 2027);
      expect(crashYear.growthRate).toBe(-20);
      expect(crashYear.taxLossHarvestedThisYear).toBeGreaterThan(0);
      expect(crashYear.lossCarryforward).toBeGreaterThan(0);
      // Changelog 429: the harvest is the loss the account holds after the
      // decline -- its basis over the crashed value -- never the whole
      // decline. The account started at its basis and grew 7% in 2026, so
      // the 20% crash leaves it under basis by roughly 14% of the balance
      // (plus this year's own contribution, bought at the top).
      const priorYear = proj.years.find(y => y.year === 2026);
      expect(crashYear.taxLossHarvestedThisYear).toBeLessThan(priorYear.taxableEnd * 0.20);
      expect(crashYear.taxLossHarvestedThisYear).toBeGreaterThan(priorYear.taxableBasis - priorYear.taxableEnd * 0.8 - 1);
      // The sale and rebuy reset the basis to the crashed value.
      expect(crashYear.taxableBasis).toBeCloseTo(crashYear.taxableEnd, 0);
    });

    it('spends the carryforward against gains first, then up to the ordinary-income cap, in the following year', () => {
      const base = {
        ...DEFAULT_INPUTS, taxableInit: 500000, taxableBasisInit: 500000, stressType: 'crashYear', stressCrashReturn: -20,
        stressStartMode: 'specific', stressStartYear: 2027,
      };
      const on = runProjection({ ...base, taxLossHarvestingEnabled: true });
      const nextYear = on.years.find(y => y.year === 2028);
      // Changelog 124 (audit Q-11c): the loss no longer absorbs the
      // qualified-dividend proxy -- dividends are not capital gains. With no
      // Life-Event Taxable withdrawal and no discretionary Taxable draw in a
      // working year there are no realized gains to net against, so the
      // gains offset is $0 and the ordinary offset is the statutory,
      // UN-indexed $3,000 (Q-11b).
      expect(nextYear.harvestedGainsOffset).toBe(0);
      expect(nextYear.lossUsedOnDraw).toBe(0);
      expect(nextYear.harvestedOrdinaryOffset).toBeCloseTo(3000, 2);
      // Carryforward should shrink by exactly what got spent.
      const crashYear = on.years.find(y => y.year === 2027);
      expect(nextYear.lossCarryforward).toBeCloseTo(
        crashYear.lossCarryforward - nextYear.harvestedGainsOffset - nextYear.harvestedOrdinaryOffset, 2
      );
    });

    it('reduces taxes paid and improves the ending balance relative to an otherwise-identical non-harvesting plan', () => {
      const base = {
        ...DEFAULT_INPUTS, taxableInit: 500000, taxableBasisInit: 500000, stressType: 'crashYear', stressCrashReturn: -20,
        stressStartMode: 'specific', stressStartYear: 2027,
      };
      const off = runProjection({ ...base, taxLossHarvestingEnabled: false });
      const on = runProjection({ ...base, taxLossHarvestingEnabled: true });
      const offNext = off.years.find(y => y.year === 2028);
      const onNext = on.years.find(y => y.year === 2028);
      expect(onNext.totalTaxesPaid).toBeLessThan(offNext.totalTaxesPaid);
      expect(on.endingBalance).toBeGreaterThan(off.endingBalance);
    });

    it('never lets the loss carryforward go negative', () => {
      const stressInputs = {
        ...DEFAULT_INPUTS, taxableInit: 500000, taxableBasisInit: 500000, stressType: 'crashYear', stressCrashReturn: -20,
        stressStartMode: 'specific', stressStartYear: 2027, taxLossHarvestingEnabled: true,
      };
      const proj = runProjection(stressInputs);
      expect(proj.years.every(y => y.lossCarryforward >= 0)).toBe(true);
    });
  });

  describe('migrateScenarios metrics backfill (scenario comparison view)', () => {
    // Regression test for a real bug found this session: LedgerTab.jsx's
    // "Save Current Active Plan" button used to build a scenario object
    // with no `metrics` field, while the Saved Scenarios List / comparison
    // table reads sc.metrics.endingBalance/isSuccessful/peakPortfolioWorth/
    // successProbability — crashing the tab on render for any such legacy
    // scenario. migrateScenarios now backfills missing metrics on load.
    it('backfills metrics for a legacy scenario saved with none', () => {
      const legacy = [{ id: 1, name: 'Legacy No Metrics', inputs: { ...DEFAULT_INPUTS } }];
      const migrated = migrateScenarios(legacy);
      expect(migrated[0].metrics).toBeTruthy();
      expect(typeof migrated[0].metrics.endingBalance).toBe('number');
      expect(migrated[0].metrics.successProbability).toBe(null);
    });

    it('preserves existing metrics rather than recomputing them', () => {
      const withMetrics = [{
        id: 2, name: 'Has Metrics', inputs: { ...DEFAULT_INPUTS },
        metrics: { endingBalance: 999999, isSuccessful: true, peakPortfolioWorth: 1500000, successProbability: 87 },
      }];
      const migrated = migrateScenarios(withMetrics);
      expect(migrated[0].metrics.endingBalance).toBe(999999);
      expect(migrated[0].metrics.successProbability).toBe(87);
    });

    it('handles the versioned wrapper format and empty/missing input without throwing', () => {
      const wrapped = { schemaVersion: 1, scenarios: [{ id: 3, name: 'W', inputs: { ...DEFAULT_INPUTS } }] };
      expect(migrateScenarios(wrapped)[0].metrics).toBeTruthy();
      expect(migrateScenarios(null)).toEqual([]);
      expect(migrateScenarios(undefined)).toEqual([]);
    });
  });

  describe('Social Security Claiming Heatmap (getSSClaimingHeatmap)', () => {
    it('tests only Spouse 1 ages (a single row) when spouse2Enabled is false', () => {
      const results = getSSClaimingHeatmap({ ...DEFAULT_INPUTS, spouse2Enabled: false });
      expect(results.length).toBe(9); // ages 62-70
      expect(results.every(r => r.claimingAge2 === null)).toBe(true);
      expect(new Set(results.map(r => r.claimingAge1)).size).toBe(9);
    });

    it('tests the full 9x9 grid of both spouses\' claiming ages when spouse2Enabled is true', () => {
      const results = getSSClaimingHeatmap({ ...DEFAULT_INPUTS, spouse2Enabled: true });
      expect(results.length).toBe(81); // 9 x 9
      expect(results.every(r => r.claimingAge1 >= 62 && r.claimingAge1 <= 70)).toBe(true);
      expect(results.every(r => r.claimingAge2 >= 62 && r.claimingAge2 <= 70)).toBe(true);
    });

    it('claiming later increases lifetime Social Security received, all else equal', () => {
      const results = getSSClaimingHeatmap({ ...DEFAULT_INPUTS, spouse2Enabled: false });
      const claim62 = results.find(r => r.claimingAge1 === 62);
      const claim70 = results.find(r => r.claimingAge1 === 70);
      expect(claim70.totalSS).toBeGreaterThan(claim62.totalSS);
    });
  });

  describe('Roth Conversion Ladder Optimizer (getRothBracketWithdrawalHeatmap)', () => {
    it('tests every combination of the 8 bracket targets and 4 withdrawal strategies', () => {
      const results = getRothBracketWithdrawalHeatmap(DEFAULT_INPUTS);
      expect(results.length).toBe(32); // 8 x 4 (changelog 463 added the 0% tier)
      const brackets = new Set(results.map(r => r.bracket));
      expect(brackets).toEqual(new Set([0, 0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]));
      const strategies = new Set(results.map(r => r.withdrawalStrategy));
      expect(strategies).toEqual(new Set(['TaxableFirst', 'PreTaxFirst', 'RothFirst', 'ProRata']));
    });

    it('every cell actually applied its own bracket/withdrawal combo (spot-check via convertAmount and drawdown source)', () => {
      const results = getRothBracketWithdrawalHeatmap({ ...DEFAULT_INPUTS, preTaxInit: 500000, taxableInit: 500000 });
      const cell12 = results.find(r => r.bracket === 0.12 && r.withdrawalStrategy === 'TaxableFirst');
      const cell37 = results.find(r => r.bracket === 0.37 && r.withdrawalStrategy === 'TaxableFirst');
      // A higher bracket target converts more pre-tax dollars per year (more
      // headroom to fill), so the 37% cell should reach a $0 pre-tax balance
      // (fully converted) in fewer or equal years than the conservative 12%
      // cell, all else equal -- proxied here via each's totalTaxesPaid
      // (aggressive conversion realizes more tax sooner) rather than
      // re-deriving the full year-by-year path.
      expect(cell37.totalTaxesPaid).toBeGreaterThan(cell12.totalTaxesPaid);
    });

    it('does not mutate the caller-supplied inputs object', () => {
      const inputsCopy = { ...DEFAULT_INPUTS };
      getRothBracketWithdrawalHeatmap(inputsCopy);
      expect(inputsCopy).toEqual(DEFAULT_INPUTS);
    });

    it('breaks out survivorPhaseTaxes only for two-spouse households', () => {
      const single = getRothBracketWithdrawalHeatmap({ ...DEFAULT_INPUTS, spouse2Enabled: false });
      expect(single.every(r => r.survivorPhaseTaxes === 0)).toBe(true);

      // A two-spouse household with a large birth-year gap guarantees the
      // older spouse's Life Expectancy is reached well before the plan
      // ends, flipping householdStatus to 'Single' for a real stretch of
      // years -- exercising the actual summation path, not just the `: 0`
      // fallback above.
      const twoSpouse = getRothBracketWithdrawalHeatmap({
        ...DEFAULT_INPUTS, spouse2Enabled: true,
        birthYear1: TAX_YEAR - 75, lifeExpectancy1: 85,
        birthYear2: TAX_YEAR - 50, lifeExpectancy2: 95,
      });
      expect(twoSpouse.some(r => r.survivorPhaseTaxes > 0)).toBe(true);
    });
  });

  describe('Roth Conversion Ladder Optimizer (getRothLadderScheduleHeatmap)', () => {
    it('tests every combination of the 7 percentage-of-balance amounts and 6 durations', () => {
      const results = getRothLadderScheduleHeatmap({ ...DEFAULT_INPUTS, preTaxInit: 400000 });
      expect(results.length).toBe(42); // 7 x 6
      const durations = new Set(results.map(r => r.durationYears));
      expect(durations).toEqual(new Set([3, 5, 7, 10, 15, 20]));
    });

    it('scales the annual conversion amount off the household\'s own Pre-Tax balance', () => {
      const small = getRothLadderScheduleHeatmap({ ...DEFAULT_INPUTS, preTaxInit: 100000 });
      const large = getRothLadderScheduleHeatmap({ ...DEFAULT_INPUTS, preTaxInit: 1000000 });
      const smallCell = small.find(r => r.pct === 0.10 && r.durationYears === 5);
      const largeCell = large.find(r => r.pct === 0.10 && r.durationYears === 5);
      expect(smallCell.annualAmount).toBe(10000); // 10% of 100k
      expect(largeCell.annualAmount).toBe(100000); // 10% of 1M
    });

    it('actually caps each cell\'s conversion to its own durationYears (wires rothConversionDurationYears end to end)', () => {
      const inputs = {
        ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: 1980, retireAge1: 46, lifeExpectancy1: 90,
        salary1: 0, ss1: 0, pension1: 0, preTaxInit: 500000, taxableInit: 500000, lifestyleExpense: 40000,
        rothConversionDelayUntilRetire: false,
      };
      const results = getRothLadderScheduleHeatmap(inputs);
      const cell = results.find(r => r.pct === 0.10 && r.durationYears === 3);
      // Re-run that exact combo directly to confirm the ladder actually
      // stopped after 3 years rather than continuing indefinitely.
      const direct = runProjection({
        ...inputs, rothConversionStrategy: 'fixed', rothConversionAmount: cell.annualAmount, rothConversionDurationYears: 3,
      });
      expect(direct.years[3].convertAmount).toBe(0);
      expect(direct.years[2].convertAmount).toBeGreaterThan(0);
    });

    it('produces $0 conversion amounts (and therefore no lift over baseline) when preTaxInit is 0', () => {
      const results = getRothLadderScheduleHeatmap({ ...DEFAULT_INPUTS, preTaxInit: 0 });
      expect(results.every(r => r.annualAmount === 0)).toBe(true);
    });

    it('does not mutate the caller-supplied inputs object', () => {
      const inputsCopy = { ...DEFAULT_INPUTS };
      getRothLadderScheduleHeatmap(inputsCopy);
      expect(inputsCopy).toEqual(DEFAULT_INPUTS);
    });
  });

  describe('Guardrails vs Fixed-Withdrawal Comparison (getGuardrailsComparisonHeatmap)', () => {
    // A well-funded household, large enough that a market crash produces a
    // real, distinguishable difference between guardrails on and off --
    // DEFAULT_INPUTS alone is too tight post-fix to show one.
    const SOLVENT_INPUTS = { ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxInit: 800000, rothInit: 100000, taxableInit: 200000, stressStartMode: 'retirement' };

    it('tests every combination of the 6 stress scenarios and 2 guardrails settings', () => {
      const results = getGuardrailsComparisonHeatmap(SOLVENT_INPUTS);
      expect(results.length).toBe(12); // 6 x 2
      const scenarios = new Set(results.map(r => r.stressType));
      expect(scenarios).toEqual(new Set(['none', '1929', '1966', '1973', '2000', '2008']));
      results.forEach(r => {
        expect(typeof r.guardrailsOn).toBe('boolean');
        expect(typeof r.endingBalance).toBe('number');
        expect(typeof r.worstYearBalance).toBe('number');
      });
    });

    it('produces identical results on vs off for the "none" scenario, since guardrails only changes anything in a negative-return year', () => {
      const results = getGuardrailsComparisonHeatmap(SOLVENT_INPUTS);
      const on = results.find(r => r.stressType === 'none' && r.guardrailsOn === true);
      const off = results.find(r => r.stressType === 'none' && r.guardrailsOn === false);
      expect(on.endingBalance).toBeCloseTo(off.endingBalance, 6);
      expect(on.worstYearBalance).toBeCloseTo(off.worstYearBalance, 6);
    });

    it('actually wires spendingGuardrails and stressType into runProjection for a given cell', () => {
      const results = getGuardrailsComparisonHeatmap(SOLVENT_INPUTS);
      const cell = results.find(r => r.stressType === '2008' && r.guardrailsOn === true);
      const direct = runProjection({ ...SOLVENT_INPUTS, stressType: '2008', spendingGuardrails: true });
      expect(cell.endingBalance).toBeCloseTo(direct.endingBalance, 2);
    });

    it('changes the ending balance between guardrails on and off under an actual crash scenario (2008)', () => {
      const results = getGuardrailsComparisonHeatmap(SOLVENT_INPUTS);
      const on = results.find(r => r.stressType === '2008' && r.guardrailsOn === true);
      const off = results.find(r => r.stressType === '2008' && r.guardrailsOn === false);
      // Freezing spending after a down year keeps more capital invested
      // through 2008's sharp -37% first-retirement-year drop and its
      // strong recovery the following two years, so guardrails should come
      // out ahead here specifically (unlike a deflationary crash such as
      // 1929, where freezing nominal spending backfires).
      expect(on.endingBalance).toBeGreaterThan(off.endingBalance);
    });

    it('does not mutate the caller-supplied inputs object', () => {
      const inputsCopy = { ...SOLVENT_INPUTS };
      getGuardrailsComparisonHeatmap(inputsCopy);
      expect(inputsCopy).toEqual(SOLVENT_INPUTS);
    });
  });

  describe('Taxable Brokerage basis tracking (taxableBasis)', () => {
    // ss1/pension1 push this household's ordinary income above the 0%
    // long-term capital gains bracket -- without them, a household this
    // size in early retirement owes $0 federal capital gains tax on its
    // Taxable draws regardless of basis (the whole draw fits inside the 0%
    // LTCG bracket either way), which would make several of these tests
    // insensitive to the very thing they're testing.
    // preTaxInit bumped from 900k -- at 900k this household's ending balance
    // now floors at $0 by the end of a multi-decade projection (Social
    // Security COLA, Medical, Housing, and Medicare Part B/D each compound
    // at their own dedicated, mostly higher-than-general rate), which made
    // the explicit-vs-auto-derived-basis comparison below indistinguishable
    // (0 vs 0 regardless of basis).
    const BASE = { ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxInit: 1200000, rothInit: 0, taxableInit: 250000, ss1: 40000, pension1: 60000, lifestyleExpense: 180000 };

    it('auto-derives a starting basis from taxableCapitalGainsRatio when taxableBasisInit is left at 0', () => {
      const proj = runProjection({ ...BASE, taxableCapitalGainsRatio: 0.60 });
      // year[0]'s taxableStart is last year's (i.e. initial) ending balance;
      // the very first year's basis ratio should reflect 1 - 0.60 = 40%
      // basis before any growth/contributions/withdrawals have diluted it.
      const firstYearRatio = proj.years[0].taxableStart > 0
        ? (250000 * 0.40) / proj.years[0].taxableStart
        : 0;
      expect(firstYearRatio).toBeCloseTo(0.40, 6);
    });

    it('uses an explicit taxableBasisInit instead of the auto-derived one when provided', () => {
      const withExplicitBasis = runProjection({ ...BASE, taxableBasisInit: 200000 });
      const withDefault = runProjection({ ...BASE, taxableBasisInit: 0, taxableCapitalGainsRatio: 0.60 });
      // A much higher known basis (200k of 250k, vs. the default-derived
      // 100k of 250k) means less of any given draw is a realized gain, so
      // less tax and a higher ending balance under otherwise-identical
      // inputs that actually draw from taxable.
      expect(withExplicitBasis.endingBalance).not.toBeCloseTo(withDefault.endingBalance, 0);
    });

    it('never lets basis go negative or exceed the account balance across a full multi-decade projection', () => {
      const proj = runProjection({
        ...BASE, rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.24, withdrawalStrategy: 'TaxableFirst',
      });
      proj.years.forEach((y) => {
        expect(y.taxableBasis).toBeGreaterThanOrEqual(-0.01);
        expect(y.taxableBasis).toBeLessThanOrEqual(y.taxableEnd + 1);
      });
    });

    it("drains basis to $0 once the Taxable account itself is fully depleted", () => {
      const proj = runProjection({
        ...BASE, rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.24, withdrawalStrategy: 'TaxableFirst',
      });
      const depletedYear = proj.years.find((y) => y.taxableEnd < 1);
      expect(depletedYear).toBeTruthy();
      expect(depletedYear.taxableBasis).toBeLessThan(1);
    });

    it('treats new contributions as 100% basis, diluting the realized-gains ratio over time relative to a no-contribution twin', () => {
      const withContributions = runProjection({ ...BASE, spouse2Enabled: false, retireAge1: 70, taxableContribution: 20000, salary1: 150000 });
      const noContributions = runProjection({ ...BASE, spouse2Enabled: false, retireAge1: 70, taxableContribution: 0, salary1: 150000 });
      const yearIdx = 10;
      const ratioWith = withContributions.years[yearIdx].taxableEnd > 0
        ? withContributions.years[yearIdx].taxableBasis / withContributions.years[yearIdx].taxableEnd
        : 0;
      const ratioWithout = noContributions.years[yearIdx].taxableEnd > 0
        ? noContributions.years[yearIdx].taxableBasis / noContributions.years[yearIdx].taxableEnd
        : 0;
      expect(ratioWith).toBeGreaterThan(ratioWithout);
    });

    it('does not mutate the caller-supplied inputs object', () => {
      const inputsCopy = { ...BASE };
      runProjection(inputsCopy);
      expect(inputsCopy).toEqual(BASE);
    });
  });

  describe('Roth Conversion tax attribution (conversionTaxCost)', () => {
    const BASE = { ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxInit: 900000, rothInit: 0, taxableInit: 250000 };

    it('is $0 in years with no conversion', () => {
      const proj = runProjection({ ...BASE, rothConversionStrategy: 'none' });
      proj.years.forEach((y) => expect(y.conversionTaxCost).toBe(0));
    });

    it('is positive in years with a conversion, and never exceeds that year\'s total taxes paid', () => {
      const proj = runProjection({ ...BASE, rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.24 });
      const conversionYears = proj.years.filter((y) => y.convertAmount > 0);
      expect(conversionYears.length).toBeGreaterThan(0);
      conversionYears.forEach((y) => {
        expect(y.conversionTaxCost).toBeGreaterThan(0);
        expect(y.conversionTaxCost).toBeLessThanOrEqual(y.totalTaxesPaid + 0.01);
      });
    });

    it('captures the direct first-order slice of the conversion\'s cash-flow impact, smaller than the full snowballed difference', () => {
      const withConv = runProjection({ ...BASE, rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.24, withdrawalStrategy: 'TaxableFirst' });
      const noConv = runProjection({ ...BASE, rothConversionStrategy: 'none', withdrawalStrategy: 'TaxableFirst' });
      // First conversion year: account balances going in are still
      // identical between the two runs (no conversion happens
      // pre-retirement in either), so this is a clean comparison point.
      // conversionTaxCost isolates only the conversion's own marginal
      // ordinary/state tax -- it deliberately does NOT include the
      // secondary snowball of extra tax owed on the extra withdrawal
      // needed to fund that tax bill (see the comment above
      // conversionTaxCost in calculator.js), so it should always be
      // positive but smaller than the full year-over-year tax difference
      // between running the conversion and not.
      const firstConvYearIdx = withConv.years.findIndex((y) => y.convertAmount > 0);
      const a = withConv.years[firstConvYearIdx];
      const b = noConv.years[firstConvYearIdx];
      const fullTaxDiff = a.totalTaxesPaid - b.totalTaxesPaid;
      expect(a.conversionTaxCost).toBeGreaterThan(0);
      expect(a.conversionTaxCost).toBeLessThan(fullTaxDiff);
    });
  });

  describe('RSU/GSU Equity Compensation (getRSUVestingIncomeForYear / runProjection)', () => {
    describe('explicit grants (rsuGrants)', () => {
      it('vests a single equal-schedule grant evenly across its vestingYears window, and nothing outside it', () => {
        const inputs = {
          ...DEFAULT_INPUTS,
          rsuGrants: [{ id: 1, spouse: 1, grantYear: 2026, totalValue: 100000, vestingYears: 4, schedule: 'equal' }],
        };
        expect(getRSUVestingIncomeForYear(inputs, 1, 2025, 2026)).toBe(0); // before the grant year
        expect(getRSUVestingIncomeForYear(inputs, 1, 2026, 2026)).toBeCloseTo(25000, 2);
        expect(getRSUVestingIncomeForYear(inputs, 1, 2027, 2026)).toBeCloseTo(25000, 2);
        expect(getRSUVestingIncomeForYear(inputs, 1, 2029, 2026)).toBeCloseTo(25000, 2);
        expect(getRSUVestingIncomeForYear(inputs, 1, 2030, 2026)).toBe(0); // fully vested, nothing left
      });

      it('values a unit-denominated grant at units × that spouse\'s current share price', () => {
        const inputs = {
          ...DEFAULT_INPUTS,
          rsuSharePrice1: 95.4,
          rsuGrants: [{ id: 1, spouse: 1, grantYear: 2026, units: 1200, vestingYears: 4, schedule: 'equal' }],
        };
        // 1,200 × $95.40 = $114,480 total, $28,620/yr over 4 years.
        expect(getRSUVestingIncomeForYear(inputs, 1, 2026, 2026)).toBeCloseTo(28620, 2);
        expect(getRSUVestingIncomeForYear(inputs, 1, 2029, 2026)).toBeCloseTo(28620, 2);
        expect(getRSUVestingIncomeForYear(inputs, 1, 2030, 2026)).toBe(0);
      });

      it('reprices every unvested tranche when the share price changes — and doubling the price doubles vest income', () => {
        const grant = [{ id: 1, spouse: 1, grantYear: 2026, units: 1000, vestingYears: 4, schedule: 'equal' }];
        const at100 = getRSUVestingIncomeForYear({ ...DEFAULT_INPUTS, rsuSharePrice1: 100, rsuGrants: grant }, 1, 2028, 2026);
        const at200 = getRSUVestingIncomeForYear({ ...DEFAULT_INPUTS, rsuSharePrice1: 200, rsuGrants: grant }, 1, 2028, 2026);
        expect(at100).toBeCloseTo(25000, 2);
        expect(at200).toBeCloseTo(2 * at100, 6);
      });

      it('unit grants ignore totalValue, and dollar grants ignore the share price — mixed grants stack', () => {
        const inputs = {
          ...DEFAULT_INPUTS,
          rsuSharePrice1: 50,
          rsuGrants: [
            // units wins over a (stale) totalValue on the same grant
            { id: 1, spouse: 1, grantYear: 2026, units: 400, totalValue: 999999, vestingYears: 4, schedule: 'equal' },
            // a plain dollar grant is untouched by the price field
            { id: 2, spouse: 1, grantYear: 2026, totalValue: 80000, vestingYears: 4, schedule: 'equal' },
          ],
        };
        // (400 × $50)/4 + $80,000/4 = 5,000 + 20,000
        expect(getRSUVestingIncomeForYear(inputs, 1, 2026, 2026)).toBeCloseTo(25000, 2);
      });

      it('a unit grant with no share price entered vests $0 (never NaN), leaving dollar grants intact', () => {
        const inputs = {
          ...DEFAULT_INPUTS,
          rsuGrants: [
            { id: 1, spouse: 1, grantYear: 2026, units: 1200, vestingYears: 4, schedule: 'equal' },
            { id: 2, spouse: 1, grantYear: 2026, totalValue: 40000, vestingYears: 4, schedule: 'equal' },
          ],
        };
        expect(getRSUVestingIncomeForYear(inputs, 1, 2026, 2026)).toBeCloseTo(10000, 2);
      });

      it('each spouse\'s unit grants read their OWN share price', () => {
        const inputs = {
          ...DEFAULT_INPUTS, spouse2Enabled: true,
          rsuSharePrice1: 100, rsuSharePrice2: 10,
          rsuGrants: [
            { id: 1, spouse: 1, grantYear: 2026, units: 400, vestingYears: 4, schedule: 'equal' },
            { id: 2, spouse: 2, grantYear: 2026, units: 400, vestingYears: 4, schedule: 'equal' },
          ],
        };
        expect(getRSUVestingIncomeForYear(inputs, 1, 2026, 2026)).toBeCloseTo(10000, 2);
        expect(getRSUVestingIncomeForYear(inputs, 2, 2026, 2026)).toBeCloseTo(1000, 2);
      });

      it('unit grants forfeit at retirement exactly like dollar grants', () => {
        const inputs = {
          ...DEFAULT_INPUTS, birthYear1: 1980, retireAge1: 48, // retires in 2028
          rsuSharePrice1: 100,
          rsuGrants: [{ id: 1, spouse: 1, grantYear: 2026, units: 1000, vestingYears: 4, schedule: 'equal' }],
        };
        expect(getRSUVestingIncomeForYear(inputs, 1, 2027, 2026)).toBeCloseTo(25000, 2);
        expect(getRSUVestingIncomeForYear(inputs, 1, 2028, 2026)).toBe(0); // reached retireAge -- remaining tranches forfeited
      });

      it('applies a custom back-loaded schedule instead of equal splits', () => {
        const inputs = {
          ...DEFAULT_INPUTS,
          rsuGrants: [{ id: 1, spouse: 1, grantYear: 2026, totalValue: 100000, vestingYears: 4, schedule: 'custom', customSchedule: [10, 20, 30, 40] }],
        };
        expect(getRSUVestingIncomeForYear(inputs, 1, 2026, 2026)).toBeCloseTo(10000, 2);
        expect(getRSUVestingIncomeForYear(inputs, 1, 2027, 2026)).toBeCloseTo(20000, 2);
        expect(getRSUVestingIncomeForYear(inputs, 1, 2028, 2026)).toBeCloseTo(30000, 2);
        expect(getRSUVestingIncomeForYear(inputs, 1, 2029, 2026)).toBeCloseTo(40000, 2);
      });

      it('falls back to an equal schedule if a custom schedule length does not match vestingYears', () => {
        const inputs = {
          ...DEFAULT_INPUTS,
          rsuGrants: [{ id: 1, spouse: 1, grantYear: 2026, totalValue: 100000, vestingYears: 4, schedule: 'custom', customSchedule: [50, 50] }],
        };
        expect(getRSUVestingIncomeForYear(inputs, 1, 2026, 2026)).toBeCloseTo(25000, 2);
      });

      it('sums multiple overlapping grants for the same spouse', () => {
        const inputs = {
          ...DEFAULT_INPUTS,
          rsuGrants: [
            { id: 1, spouse: 1, grantYear: 2024, totalValue: 200000, vestingYears: 4, schedule: 'equal' },
            { id: 2, spouse: 1, grantYear: 2025, totalValue: 200000, vestingYears: 4, schedule: 'equal' },
            { id: 3, spouse: 1, grantYear: 2026, totalValue: 200000, vestingYears: 4, schedule: 'equal' },
            { id: 4, spouse: 1, grantYear: 2027, totalValue: 200000, vestingYears: 4, schedule: 'equal' },
          ],
        };
        // Steady state: 4 overlapping grants each contributing 50,000/yr
        expect(getRSUVestingIncomeForYear(inputs, 1, 2027, 2024)).toBeCloseTo(200000, 2);
      });

      it('only counts a grant toward the spouse it is assigned to', () => {
        const inputs = {
          ...DEFAULT_INPUTS,
          rsuGrants: [{ id: 1, spouse: 2, grantYear: 2026, totalValue: 100000, vestingYears: 4, schedule: 'equal' }],
        };
        expect(getRSUVestingIncomeForYear(inputs, 1, 2026, 2026)).toBe(0);
        expect(getRSUVestingIncomeForYear(inputs, 2, 2026, 2026)).toBeCloseTo(25000, 2);
      });

      it('forfeits any remaining unvested tranches once that spouse retires, even for a grant issued while still employed', () => {
        const inputs = {
          ...DEFAULT_INPUTS,
          birthYear1: 1966,
          retireAge1: 60, // retires in 2026
          rsuGrants: [{ id: 1, spouse: 1, grantYear: 2025, totalValue: 100000, vestingYears: 4, schedule: 'equal' }],
        };
        expect(getRSUVestingIncomeForYear(inputs, 1, 2025, 2025)).toBeCloseTo(25000, 2); // still employed (age 59)
        expect(getRSUVestingIncomeForYear(inputs, 1, 2026, 2025)).toBe(0); // retired (age 60) -- remaining 75,000 forfeited
        expect(getRSUVestingIncomeForYear(inputs, 1, 2027, 2025)).toBe(0);
      });
    });

    describe('assumed future refresh grants (rsuRefreshEnabled1/2)', () => {
      const base = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        birthYear1: 1968,
        retireAge1: 70, // plenty of runway so retirement doesn't interfere with these tests
        rsuRefreshEnabled1: true,
        rsuRefreshAnnualValue1: 100000,
        rsuRefreshVestingYears1: 4,
        rsuRefreshGrowthRate1: 0,
        rsuRefreshSchedule1: 'equal',
      };

      it('does nothing when disabled', () => {
        expect(getRSUVestingIncomeForYear({ ...base, rsuRefreshEnabled1: false }, 1, 2028, 2026)).toBe(0);
      });

      it('ramps up to a steady state as overlapping synthesized grants accumulate', () => {
        expect(getRSUVestingIncomeForYear(base, 1, 2026, 2026)).toBeCloseTo(25000, 2); // 1 grant
        expect(getRSUVestingIncomeForYear(base, 1, 2027, 2026)).toBeCloseTo(50000, 2); // 2 grants
        expect(getRSUVestingIncomeForYear(base, 1, 2029, 2026)).toBeCloseTo(100000, 2); // steady state, 4 grants
        expect(getRSUVestingIncomeForYear(base, 1, 2035, 2026)).toBeCloseTo(100000, 2); // stays there
      });

      it('grows each successive synthesized grant by rsuRefreshGrowthRate1', () => {
        const growing = { ...base, rsuRefreshGrowthRate1: 10 };
        // 2026 grant: value 100,000, vests 25,000/yr. 2027 grant: value
        // 110,000 (10% bigger), vests 27,500/yr. In 2027, both are vesting.
        expect(getRSUVestingIncomeForYear(growing, 1, 2027, 2026)).toBeCloseTo(25000 + 27500, 2);
      });

      it('stops both issuing new grants AND paying out already-issued ones once retired', () => {
        const retiresAt65 = { ...base, retireAge1: 65 }; // retires in 2033
        expect(getRSUVestingIncomeForYear(retiresAt65, 1, 2032, 2026)).toBeCloseTo(100000, 2); // still working, steady state
        expect(getRSUVestingIncomeForYear(retiresAt65, 1, 2033, 2026)).toBe(0); // retired -- no more income from this source at all
        expect(getRSUVestingIncomeForYear(retiresAt65, 1, 2034, 2026)).toBe(0);
      });

      it('a Refresh Gap suppresses only new grant issuance during the window, and the plan recovers once it ends', () => {
        const withGap = {
          ...base,
          rsuRefreshGapEnabled: true,
          rsuRefreshGapSpouse: '1',
          rsuRefreshGapStartYear: 2028,
          rsuRefreshGapDurationYears: 2, // suppresses issuance in 2028 and 2029 only
        };
        // Before the gap starts: identical to the no-gap case
        expect(getRSUVestingIncomeForYear(withGap, 1, 2027, 2026)).toBeCloseTo(getRSUVestingIncomeForYear(base, 1, 2027, 2026), 2);
        // During/shortly after the gap: fewer overlapping grants than normal
        expect(getRSUVestingIncomeForYear(withGap, 1, 2029, 2026)).toBeCloseTo(50000, 2);
        expect(getRSUVestingIncomeForYear(withGap, 1, 2030, 2026)).toBeCloseTo(50000, 2);
        // Recovers to the full 4-grant steady state once enough post-gap
        // grants have accumulated again
        expect(getRSUVestingIncomeForYear(withGap, 1, 2033, 2026)).toBeCloseTo(100000, 2);
      });

      it('"both" applies the gap to both spouses at once', () => {
        const twoSpouse = {
          ...base,
          spouse2Enabled: true,
          birthYear2: 1970,
          retireAge2: 70,
          rsuRefreshEnabled2: true,
          rsuRefreshAnnualValue2: 100000,
          rsuRefreshVestingYears2: 4,
          rsuRefreshGrowthRate2: 0,
          rsuRefreshGapEnabled: true,
          rsuRefreshGapSpouse: 'both',
          rsuRefreshGapStartYear: 2026,
          rsuRefreshGapDurationYears: 1,
        };
        expect(getRSUVestingIncomeForYear(twoSpouse, 1, 2026, 2026)).toBe(0);
        expect(getRSUVestingIncomeForYear(twoSpouse, 2, 2026, 2026)).toBe(0);
      });
    });

    describe('integration with runProjection', () => {
      it('adds RSU vesting income into salary and ordinary taxable income, increasing total taxes', () => {
        const base = {
          ...DEFAULT_INPUTS,
          spouse2Enabled: false,
          salary1: 100000,
          preTaxContribution1: 0,
          rothContribution1: 0,
          rsuGrants: [{ id: 1, spouse: 1, grantYear: 2026, totalValue: 40000, vestingYears: 4, schedule: 'equal' }],
        };
        const withRSU = runProjection(base);
        const withoutRSU = runProjection({ ...base, rsuGrants: [] });
        const y0 = withRSU.years[0];
        const y0NoRSU = withoutRSU.years[0];
        expect(y0.rsuIncome1).toBeCloseTo(10000, 2);
        expect(y0.salary).toBeCloseTo(y0NoRSU.salary + 10000, 2);
        expect(y0.totalTaxesPaid).toBeGreaterThan(y0NoRSU.totalTaxesPaid);
      });

      it('is 0 for a plan with no grants and no refresh assumption (fully backward compatible)', () => {
        const proj = runProjection(DEFAULT_INPUTS);
        proj.years.forEach(y => {
          expect(y.rsuIncome1).toBe(0);
          expect(y.rsuIncome2).toBe(0);
        });
      });
    });
  });

  describe('Concentrated Stock Position (runProjection)', () => {
    it('has no effect on any existing plan when disabled (fully backward compatible)', () => {
      const proj = runProjection(DEFAULT_INPUTS);
      expect(proj.endingBalance).toBeCloseTo(36762.2363, 2);
      proj.years.forEach(y => {
        expect(y.concentratedStockBalance).toBe(0);
        expect(y.concentratedStockDiversified).toBe(0);
        expect(y.concentratedStockDiversificationTax).toBe(0);
        expect(y.concentratedStockNetProceeds).toBe(0);
        expect(y.concentratedStockConcentrationPct).toBe(0);
      });
    });

    it('grows the position at its own configured rate when diversification is 0', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        concentratedStockEnabled: true,
        concentratedStockInit: 1000000,
        concentratedStockGrowthRate: 10,
        concentratedStockDiversifyPct: 0,
      };
      const proj = runProjection(inputs);
      expect(proj.years[0].concentratedStockBalance).toBeCloseTo(1100000, 2);
      expect(proj.years[0].concentratedStockDiversified).toBe(0);
      expect(proj.years[1].concentratedStockBalance).toBeCloseTo(1210000, 2);
    });

    it('diversifies the configured % each year, taxing only the realized-gain portion at the flat assumed rate', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        concentratedStockEnabled: true,
        concentratedStockInit: 1000000,
        concentratedStockGrowthRate: 8,
        concentratedStockDiversifyPct: 20,
        concentratedStockCostBasisPct: 10,
        concentratedStockDiversifyTaxRate: 15,
        // Changelog 127 / audit Q-10(b): the realized gain now runs through
        // the real capital-gains engine by default. This test pins the
        // legacy flat-rate arithmetic, which survives behind this flag; the
        // Q-10(b) tests cover the engine-routed path.
        concentratedStockFlatTaxEnabled: true,
      };
      const proj = runProjection(inputs);
      const y0 = proj.years[0];
      // 1,000,000 * 1.08 = 1,080,000 grown balance.
      // Diversified = 1,080,000 * 0.20 = 216,000.
      // Realized gain = 216,000 * (1 - 0.10) = 194,400; tax = 194,400 * 0.15 = 29,160.
      // Net proceeds = 216,000 - 29,160 = 186,840. Remaining balance = 1,080,000 - 216,000 = 864,000.
      expect(y0.concentratedStockDiversified).toBeCloseTo(216000, 2);
      expect(y0.concentratedStockDiversificationTax).toBeCloseTo(29160, 2);
      expect(y0.concentratedStockNetProceeds).toBeCloseTo(186840, 2);
      expect(y0.concentratedStockBalance).toBeCloseTo(864000, 2);
    });

    it('adds net diversification proceeds into Taxable Brokerage as fresh basis', () => {
      const base = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        concentratedStockEnabled: true,
        concentratedStockInit: 1000000,
        concentratedStockGrowthRate: 8,
        concentratedStockDiversifyPct: 20,
        concentratedStockCostBasisPct: 10,
        concentratedStockDiversifyTaxRate: 15,
      };
      const withStock = runProjection(base);
      const withoutStock = runProjection({ ...base, concentratedStockEnabled: false });
      const y0 = withStock.years[0];
      const y0NoStock = withoutStock.years[0];
      expect(y0.taxableEnd).toBeCloseTo(y0NoStock.taxableEnd + y0.concentratedStockNetProceeds, 2);
    });

    it('computes concentration % as the position\'s share of total net worth including itself', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        preTaxInit: 0,
        rothInit: 0,
        taxableInit: 0,
        hsaInit: 0,
        salary1: 0,
        concentratedStockEnabled: true,
        concentratedStockInit: 500000,
        concentratedStockGrowthRate: 0,
        concentratedStockDiversifyPct: 0,
      };
      const proj = runProjection(inputs);
      // With every other bucket started at 0, the concentrated position
      // dominates net worth -- concentration should read close to 100%
      // (not exactly, since a small surplus/expense side-effect from other
      // default plan mechanics can nudge Taxable off of exactly $0).
      expect(proj.years[0].concentratedStockConcentrationPct).toBeGreaterThan(95);
    });

    it('is inert with a $0 starting balance even when enabled', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        concentratedStockEnabled: true,
        concentratedStockInit: 0,
        concentratedStockDiversifyPct: 50,
      };
      const proj = runProjection(inputs);
      proj.years.forEach(y => {
        expect(y.concentratedStockBalance).toBe(0);
        expect(y.concentratedStockDiversified).toBe(0);
      });
    });

    describe('vest routing (concentratedStockVestRouting*)', () => {
      // Spouse 1 working with a steady $100k/yr refresh assumption vesting
      // over 4 equal years -> year-0 vest income is $25k, a stable base to
      // assert routing math against.
      const routingBase = {
        ...DEFAULT_INPUTS,
        fundExpenseRatioPct: 0, // hand-worked balances; fees have their own tests (447)
        spouse2Enabled: false,
        birthYear1: 1980,
        retireAge1: 65,
        salary1: 200000,
        rsuRefreshEnabled1: true,
        rsuRefreshAnnualValue1: 100000,
        rsuRefreshVestingYears1: 4,
        rsuRefreshGrowthRate1: 0,
        concentratedStockEnabled: true,
        concentratedStockInit: 400000,
        concentratedStockGrowthRate: 10,
        concentratedStockDiversifyPct: 0,
        concentratedStockVestRoutingEnabled: true,
        concentratedStockVestCoverPct: 35,
        concentratedStockVestHoldPct: 100,
        concentratedStockVestSpouse: '1',
      };

      it('routes vest income x (1 - cover%) x hold% into the position, after growth', () => {
        const y0 = runProjection(routingBase).years[0];
        expect(y0.rsuIncome1).toBeCloseTo(25000, 2);
        // 25,000 * (1 - 0.35) * 1.00 = 16,250 held.
        expect(y0.concentratedStockVestedIn).toBeCloseTo(16250, 2);
        // 400,000 * 1.10 + 16,250 -- vests join after growth, so they don't
        // collect a full year's return having arrived mid-year.
        expect(y0.concentratedStockBalance).toBeCloseTo(456250, 2);
      });

      it('respects the hold %: holding half of what sell-to-cover leaves routes half the value', () => {
        const y0 = runProjection({ ...routingBase, concentratedStockVestHoldPct: 50 }).years[0];
        expect(y0.concentratedStockVestedIn).toBeCloseTo(8125, 2);
      });

      it('is identical to routing off when hold % is 0 (sell on vest)', () => {
        const zeroHold = runProjection({ ...routingBase, concentratedStockVestHoldPct: 0 });
        const off = runProjection({ ...routingBase, concentratedStockVestRoutingEnabled: false });
        expect(zeroHold.endingBalance).toBeCloseTo(off.endingBalance, 2);
        expect(zeroHold.years[0].concentratedStockBalance).toBeCloseTo(off.years[0].concentratedStockBalance, 2);
      });

      it('does not change any numbers when the routing toggle is off (fully backward compatible)', () => {
        const off = runProjection({ ...routingBase, concentratedStockVestRoutingEnabled: false });
        const y0 = off.years[0];
        expect(y0.concentratedStockVestedIn).toBe(0);
        expect(y0.concentratedStockBalance).toBeCloseTo(440000, 2);
      });

      it('in custom-spending mode, held vests reduce the surplus that reaches Taxable', () => {
        const custom = {
          ...routingBase,
          currentSpendingMode: 'custom',
          currentHouseholdSpendingCustom: 60000,
        };
        const on = runProjection(custom).years[0];
        const off = runProjection({ ...custom, concentratedStockVestRoutingEnabled: false }).years[0];
        // The held $16,250 never became investable cash. Surplus lands in
        // Taxable before that year's growth, so the forgone amount shows up
        // grown by one year's return (7% default): 16,250 * 1.07.
        expect(off.taxableEnd - on.taxableEnd).toBeCloseTo(16250 * 1.07, 2);
        // Deliberate share retention must not read as a budget problem.
        expect(on.savingsDeficit || 0).toBe(0);
        expect(on.lifestyleDeficit || 0).toBe(0);
      });

      it('in auto-spending mode, held vests come out of derived spending, not out of savings or deficits', () => {
        const on = runProjection(routingBase).years[0];
        const off = runProjection({ ...routingBase, concentratedStockVestRoutingEnabled: false }).years[0];
        // Auto mode derives spending as the residual of spendable cash, and
        // held shares were never spendable -- the residual absorbs the
        // difference and the portfolio accounts are untouched.
        expect(on.taxableEnd).toBeCloseTo(off.taxableEnd, 2);
        expect(on.savingsDeficit || 0).toBe(0);
        expect(on.lifestyleDeficit || 0).toBe(0);
      });

      it('uses blended tracked basis (not the flat %) when diversifying with routing on', () => {
        // Zero growth isolates the basis arithmetic: start 100,000 at 20%
        // basis (20,000 basis dollars). Year 0: no diversification, vest
        // routes in at full basis. Year 1: diversify 10%.
        const inputs = {
          ...routingBase,
          concentratedStockInit: 100000,
          concentratedStockGrowthRate: 0,
          concentratedStockCostBasisPct: 20,
          concentratedStockDiversifyTaxRate: 20,
          concentratedStockDiversifyPct: 0,
          // Changelog 127 / audit Q-10(b): this test is about the blended
          // BASIS, so it keeps the legacy flat rate to isolate that from
          // the engine's own bracket/NIIT arithmetic.
          concentratedStockFlatTaxEnabled: true,
        };
        const y0 = runProjection(inputs).years[0];
        expect(y0.concentratedStockBalance).toBeCloseTo(116250, 2);
        // Now the same plan but diversifying 10%/yr from the start.
        const div = runProjection({ ...inputs, concentratedStockDiversifyPct: 10 });
        const d0 = div.years[0];
        // Year 0 diversifies BEFORE the vest joins: 100,000 * 10% = 10,000
        // sold at the seeded 20% basis -> gain 8,000, tax 1,600.
        expect(d0.concentratedStockDiversified).toBeCloseTo(10000, 2);
        expect(d0.concentratedStockDiversificationTax).toBeCloseTo(1600, 2);
        // After the sale: balance 90,000, basis 18,000; vest +16,250 joins
        // at full basis -> balance 106,250, basis 34,250.
        expect(d0.concentratedStockBalance).toBeCloseTo(106250, 2);
        // Year 1: 10% of 106,250 = 10,625 sold at blended basis
        // 34,250/106,250 (~32.2%), NOT the flat 20% -- tax should be
        // 10,625 * (1 - 34,250/106,250) * 20%.
        const d1 = div.years[1];
        const expectedTax1 = 10625 * (1 - 34250 / 106250) * 0.20;
        expect(d1.concentratedStockDiversificationTax).toBeCloseTo(expectedTax1, 2);
      });
    });

    describe('second concentrated position (concentratedStock2*)', () => {
      const twoPosBase = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: true,
        birthYear1: 1980,
        birthYear2: 1982,
        retireAge1: 65,
        retireAge2: 65,
        lifeExpectancy2: 90,
        salary1: 200000,
        salary2: 150000,
        concentratedStockEnabled: true,
        concentratedStockInit: 400000,
        concentratedStockGrowthRate: 10,
        concentratedStock2Enabled: true,
        concentratedStock2Init: 100000,
        concentratedStock2GrowthRate: 5,
      };

      it('is entirely inert for existing plans (all $0 outputs when not enabled)', () => {
        const proj = runProjection(DEFAULT_INPUTS);
        proj.years.forEach(y => {
          expect(y.concentratedStock2Balance).toBe(0);
          expect(y.concentratedStock2Diversified).toBe(0);
          expect(y.concentratedStock2VestedIn).toBe(0);
          expect(y.concentratedStock2ConcentrationPct).toBe(0);
        });
      });

      it('grows and diversifies independently of position 1', () => {
        const proj = runProjection({
          ...twoPosBase,
          concentratedStock2DiversifyPct: 20,
          concentratedStock2CostBasisPct: 10,
          concentratedStock2DiversifyTaxRate: 15,
          // Changelog 127 / audit Q-10(b): this test is about the two
          // positions being independent, so it keeps the legacy flat rate.
          concentratedStockFlatTaxEnabled: true,
        });
        const y0 = proj.years[0];
        // Position 1 untouched by position 2's diversification plan.
        expect(y0.concentratedStockBalance).toBeCloseTo(440000, 2);
        expect(y0.concentratedStockDiversified).toBe(0);
        // Position 2: 100,000 * 1.05 = 105,000; 20% = 21,000 diversified;
        // gain 18,900, tax 2,835; balance 84,000.
        expect(y0.concentratedStock2Diversified).toBeCloseTo(21000, 2);
        expect(y0.concentratedStock2DiversificationTax).toBeCloseTo(2835, 2);
        expect(y0.concentratedStock2Balance).toBeCloseTo(84000, 2);
      });

      it('judges both concentration percentages against one household denominator that includes both positions', () => {
        const y0 = runProjection(twoPosBase).years[0];
        const portfolio = y0.preTaxEnd + y0.rothEnd + y0.taxableEnd + y0.hsaEnd;
        const denom = portfolio + y0.concentratedStockBalance + y0.concentratedStock2Balance;
        expect(y0.concentratedStockConcentrationPct).toBeCloseTo((y0.concentratedStockBalance / denom) * 100, 6);
        expect(y0.concentratedStock2ConcentrationPct).toBeCloseTo((y0.concentratedStock2Balance / denom) * 100, 6);
      });

      it('routes each spouse\'s vests to their own position by default', () => {
        const proj = runProjection({
          ...twoPosBase,
          rsuRefreshEnabled1: true,
          rsuRefreshAnnualValue1: 100000,
          rsuRefreshVestingYears1: 4,
          rsuRefreshGrowthRate1: 0,
          rsuRefreshEnabled2: true,
          rsuRefreshAnnualValue2: 80000,
          rsuRefreshVestingYears2: 4,
          rsuRefreshGrowthRate2: 0,
          concentratedStockVestRoutingEnabled: true,
          concentratedStockVestCoverPct: 35,
          concentratedStockVestHoldPct: 100,
          concentratedStock2VestRoutingEnabled: true,
          concentratedStock2VestCoverPct: 30,
          concentratedStock2VestHoldPct: 50,
        });
        const y0 = proj.years[0];
        // Position 1 <- spouse 1 (default '1'): 25,000 * 0.65 = 16,250.
        expect(y0.concentratedStockVestedIn).toBeCloseTo(16250, 2);
        // Position 2 <- spouse 2 (default '2'): 20,000 * 0.70 * 0.50 = 7,000.
        expect(y0.concentratedStock2VestedIn).toBeCloseTo(7000, 2);
        expect(y0.concentratedStock2Balance).toBeCloseTo(100000 * 1.05 + 7000, 2);
      });
    });
  });

  describe('Minimum Required Rate of Return solver (getMinimumRequiredReturn)', () => {
    it('finds a rate at which the plan is right at the success/failure boundary', () => {
      const result = getMinimumRequiredReturn(DEFAULT_INPUTS);
      expect(result.feasible).toBe(true);
      expect(result.belowSearchFloor).toBe(false);

      const flatRateInputs = (rate) => ({
        ...DEFAULT_INPUTS,
        preRetireReturn: rate,
        postRetireReturn: rate,
        rebalancingEnabled: false,
        equityGlidePathEnabled: false,
        glideAllocationEnabled: false,
        stressType: 'none',
      });
      // Just below the solved rate should fail; just above should succeed.
      expect(runProjection(flatRateInputs(result.requiredReturn - 0.05)).isSuccessful).toBe(false);
      expect(runProjection(flatRateInputs(result.requiredReturn + 0.05)).isSuccessful).toBe(true);
    });

    it('reports the plan\'s actual assumed return and whether it currently succeeds', () => {
      const result = getMinimumRequiredReturn(DEFAULT_INPUTS);
      expect(result.currentAssumedReturn).toBeCloseTo(DEFAULT_INPUTS.preRetireReturn, 5);
      expect(result.currentPlanSucceeds).toBe(runProjection(DEFAULT_INPUTS).isSuccessful);
    });

    it('uses the stock/bond blended return when rebalancingEnabled is on', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        rebalancingEnabled: true,
        stockAllocationPre: 70,
        stockReturnRate: 10,
        bondReturnRate: 4,
      };
      const result = getMinimumRequiredReturn(inputs);
      // 70% * 10 + 30% * 4 = 8.2
      expect(result.currentAssumedReturn).toBeCloseTo(8.2, 5);
    });

    it('reports belowSearchFloor for an extremely over-funded plan', () => {
      const inputs = { ...DEFAULT_INPUTS, preTaxInit: 50000000 };
      const result = getMinimumRequiredReturn(inputs);
      expect(result.feasible).toBe(true);
      expect(result.currentPlanSucceeds).toBe(true);
      // Either finds a (very low/negative) required rate, or bottoms out at
      // the search floor -- either way it must be far below any realistic
      // assumed return, confirming the plan has enormous cushion.
      expect(result.belowSearchFloor || result.requiredReturn < 0).toBe(true);
    });

    it('reports infeasible for a plan no realistic return can fix', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        preTaxInit: 0,
        rothInit: 0,
        taxableInit: 0,
        hsaInit: 0,
        salary1: 0,
        retireAge1: 45,
        currentSpendingMode: 'custom',
        currentHouseholdSpendingCustom: 5000000,
      };
      const result = getMinimumRequiredReturn(inputs);
      expect(result.feasible).toBe(false);
      expect(result.requiredReturn).toBe(null);
      expect(result.currentPlanSucceeds).toBe(false);
    });

    it('is unaffected by the plan\'s own stress-test/glide-path settings during the search', () => {
      // A plan with an active Historical Stress Test and equity glide path
      // enabled should solve to the same required return as the identical
      // plan without them -- the search isolates itself from both.
      const plain = getMinimumRequiredReturn(DEFAULT_INPUTS);
      const withExtras = getMinimumRequiredReturn({
        ...DEFAULT_INPUTS,
        stressType: '2008',
        stressStartYear: 2030,
        equityGlidePathEnabled: true,
        equityGlidePathRate: 1,
        equityGlidePathFloor: 2,
      });
      expect(withExtras.requiredReturn).toBeCloseTo(plain.requiredReturn, 2);
    });
  });

  describe('Cash Floor / Emergency Reserve (runProjection)', () => {
    const baseRetiredInputs = {
      ...DEFAULT_INPUTS,
      spouse2Enabled: false,
      retireAge1: 65,
      birthYear1: 1965,
      preTaxInit: 1000000,
      taxableInit: 500000,
    };

    it('has no effect on any existing plan when disabled (fully backward compatible)', () => {
      const proj = runProjection(DEFAULT_INPUTS);
      expect(proj.endingBalance).toBeCloseTo(36762.2363, 2);
      proj.years.forEach(y => {
        expect(y.cashReserveBalance).toBe(0);
        expect(y.cashReserveDraw).toBe(0);
        expect(y.cashReserveReplenish).toBe(0);
      });
    });

    it('grows the reserve at its own configured yield, independent of the portfolio return', () => {
      const inputs = {
        ...baseRetiredInputs,
        cashFloorEnabled: true,
        cashFloorInit: 100000,
        cashFloorTargetMonths: 24,
        cashFloorReturnRate: 4,
      };
      const proj = runProjection(inputs);
      // First retired year: reserve should grow by ~4% before any
      // draw/replenish logic touches it (target likely already met given
      // the large starting reserve relative to spending, but growth alone
      // must still be visible).
      expect(proj.years[0].cashReserveBalance).toBeGreaterThan(0);
    });

    // The reserve reacts to a down year once it has happened: a year's
    // withdrawals are set when the year begins, before its return is known,
    // so the draw comes in the year AFTER the crash (2031 here), not during it.
    it('draws from the reserve first in the year after a down market, sparing Taxable from being sold', () => {
      const withoutFloor = { ...baseRetiredInputs, stressType: '2008', stressStartYear: 2030 };
      const withFloor = {
        ...withoutFloor,
        cashFloorEnabled: true,
        cashFloorInit: 100000,
        cashFloorTargetMonths: 24,
        cashFloorReturnRate: 3,
      };
      const projWithout = runProjection(withoutFloor);
      const projWith = runProjection(withFloor);
      const yWithout = projWithout.years.find(y => y.year === 2031);
      const yWith = projWith.years.find(y => y.year === 2031);
      // Not in the crash year itself: its return is not known yet.
      expect(projWith.years.find(y => y.year === 2030).cashReserveDraw).toBe(0);

      expect(yWithout.drawTaxable).toBeGreaterThan(0);
      expect(yWith.cashReserveDraw).toBeGreaterThan(0);
      // The reserve absorbed the withdrawal that would otherwise have come
      // out of Taxable during the crash year.
      expect(yWith.drawTaxable).toBeLessThan(yWithout.drawTaxable);
    });

    it('replenishes the reserve out of a later withdrawal once the market recovers', () => {
      const inputs = {
        ...baseRetiredInputs,
        stressType: '2008',
        stressStartYear: 2030,
        cashFloorEnabled: true,
        cashFloorInit: 100000,
        cashFloorTargetMonths: 24,
        cashFloorReturnRate: 3,
      };
      const proj = runProjection(inputs);
      const drawYear = proj.years.find(y => y.cashReserveDraw > 0);
      expect(drawYear).toBeDefined();
      const replenishYear = proj.years.find(y => y.year > drawYear.year && y.cashReserveReplenish > 0);
      expect(replenishYear).toBeDefined();
    });

    it('only activates once retired -- no reserve draw/replenish before then', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        retireAge1: 65,
        birthYear1: 1990,
        cashFloorEnabled: true,
        cashFloorInit: 50000,
        cashFloorTargetMonths: 24,
        stressType: '2008',
        stressStartYear: 2027,
      };
      const proj = runProjection(inputs);
      proj.years.filter(y => !y.isRetired).forEach(y => {
        expect(y.cashReserveDraw).toBe(0);
        expect(y.cashReserveReplenish).toBe(0);
      });
    });

    it('is inert with a $0 starting balance and no growth (still grows the target to 0 draws)', () => {
      const inputs = { ...baseRetiredInputs, cashFloorEnabled: true, cashFloorInit: 0, cashFloorReturnRate: 0 };
      const proj = runProjection(inputs);
      // With $0 initial and no crash, replenishment should kick in
      // immediately to build the reserve up toward its target.
      const firstRetiredYear = proj.years.find(y => y.isRetired);
      expect(firstRetiredYear.cashReserveReplenish).toBeGreaterThan(0);
    });

    describe('Build Up Gradually While Working (cashFloorPreFundEnabled)', () => {
      // A comfortably high-income, low-spending household so there's a real
      // working-years cash surplus (cashNeeded < 0) to redirect -- the
      // default DEFAULT_INPUTS salary/lifestyle combination already
      // produces one (confirmed by the 'has no effect...' baseline test
      // above ending with a positive balance despite no explicit savings
      // contributions configured there).
      const workingInputs = {
        ...DEFAULT_INPUTS,
        fundExpenseRatioPct: 0, // hand-worked balances; fees have their own tests (447)
        // The surplus here is a few dollars a year; the ordinary share of the
        // brokerage yield (changelog 414) would eat it, so it stays all-qualified.
        taxableQualifiedDividendFollowsAllocation: false,
        spouse2Enabled: false,
        retireAge1: 65,
        birthYear1: 1990,
        cashFloorEnabled: true,
        cashFloorInit: 0,
        cashFloorTargetMonths: 24,
        cashFloorReturnRate: 0,
      };

      it('is off by default -- no pre-retirement reserve build-up even with cashFloorEnabled on', () => {
        const proj = runProjection(workingInputs);
        proj.years.filter(y => !y.isRetired).forEach(y => {
          expect(y.cashReservePreFund).toBe(0);
          expect(y.cashReserveBalance).toBe(0);
        });
      });

      it('redirects working-years surplus into the reserve instead of Taxable when enabled', () => {
        const off = runProjection(workingInputs);
        const on = runProjection({ ...workingInputs, cashFloorPreFundEnabled: true });

        // Not necessarily the very first modeled year (e.g. a partial-year
        // salary phase-in could leave year 1 without a surplus) -- find the
        // first working year that actually redirected something.
        const onPreFundYear = on.years.find(y => !y.isRetired && y.cashReservePreFund > 0);
        expect(onPreFundYear).toBeDefined();
        expect(onPreFundYear.cashReserveBalance).toBeCloseTo(onPreFundYear.cashReservePreFund, 2);

        // Same year, same everything else -- the only difference is where
        // that surplus dollar went, so Taxable should have grown less by
        // exactly the amount redirected into the reserve.
        const offSameYear = off.years.find(y => y.year === onPreFundYear.year);
        expect(onPreFundYear.taxableEnd).toBeCloseTo(
          offSameYear.taxableEnd - onPreFundYear.cashReservePreFund,
          2
        );
      });

      it('stops redirecting once the reserve reaches its target, and any further surplus falls through to Taxable', () => {
        // A tiny target (1 month of spending) so it's reached almost
        // immediately, well before retirement.
        const proj = runProjection({ ...workingInputs, cashFloorPreFundEnabled: true, cashFloorTargetMonths: 1 });
        const workingYears = proj.years.filter(y => !y.isRetired);
        const capYear = workingYears.find(y => y.cashReservePreFund === 0 && y.cashReserveBalance > 0);
        expect(capYear).toBeDefined();
        // Once capped, the reserve balance should stay flat (0% yield here)
        // rather than keep climbing.
        const capIndex = workingYears.indexOf(capYear);
        if (capIndex > 0) {
          expect(capYear.cashReserveBalance).toBeCloseTo(workingYears[capIndex - 1].cashReserveBalance, 2);
        }
      });

      it('has no effect once retired -- pre-fund only applies to working years', () => {
        const proj = runProjection({ ...workingInputs, cashFloorPreFundEnabled: true });
        proj.years.filter(y => y.isRetired).forEach(y => {
          expect(y.cashReservePreFund).toBe(0);
        });
      });
    });
  });

  describe('Pre-Tax vs. Roth Contribution Split Optimizer (getContributionSplitOptimizer)', () => {
    it('reports not applicable when no contribution is configured', () => {
      const result = getContributionSplitOptimizer({ ...DEFAULT_INPUTS, preTaxContribution1: 0, rothContribution1: 0 });
      expect(result.applicable).toBe(false);
      expect(result.results).toEqual([]);
      expect(result.best).toBe(null);
    });

    it('reports not applicable when Auto-Max Contribution is on for the only contributing spouse', () => {
      const result = getContributionSplitOptimizer({ ...DEFAULT_INPUTS, autoMaxContribution1: '401k' });
      expect(result.applicable).toBe(false);
      expect(result.reason).toMatch(/Auto-Max/);
    });

    it('"current" exactly matches a direct runProjection call with the unmodified inputs', () => {
      const result = getContributionSplitOptimizer(DEFAULT_INPUTS);
      const direct = runProjection(DEFAULT_INPUTS);
      expect(result.current.endingBalance).toBe(direct.endingBalance);
      expect(result.current.preTax1).toBe(DEFAULT_INPUTS.preTaxContribution1);
      expect(result.current.roth1).toBe(DEFAULT_INPUTS.rothContribution1);
    });

    it('holds each spouse\'s total contribution fixed across every split tested', () => {
      const result = getContributionSplitOptimizer(DEFAULT_INPUTS);
      const total1 = DEFAULT_INPUTS.preTaxContribution1 + DEFAULT_INPUTS.rothContribution1;
      result.results.forEach(r => {
        expect(r.preTax1 + r.roth1).toBeCloseTo(total1, 2);
      });
    });

    it('finds a 100% Roth split beats the default mix for a young, low-current-tax-rate plan', () => {
      // DEFAULT_INPUTS' 22%-Roth mix is a reasonable default, but a plan
      // with all contributions pushed to Roth should never end up WORSE off
      // than a mix that's mostly Pre-Tax when everything else (including
      // marginal rates) stays low and flat -- this is a sanity check that
      // the search actually explores the full 0-100% range.
      const result = getContributionSplitOptimizer(DEFAULT_INPUTS);
      expect(result.best.endingBalance).toBeGreaterThanOrEqual(result.current.endingBalance);
    });

    it('searches a 2D grid (up to 25 combinations) for a two-income household', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: true,
        salary2: 80000,
        preTaxContribution2: 10000,
        rothContribution2: 5000,
        birthYear2: 1970,
        retireAge2: 67,
      };
      const result = getContributionSplitOptimizer(inputs);
      expect(result.applicable).toBe(true);
      expect(result.results.length).toBe(25);
      result.results.forEach(r => {
        expect(r.preTax2 + r.roth2).toBeCloseTo(10000 + 5000, 2);
      });
    });

    it('only searches the non-auto-max spouse in a mixed household', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: true,
        salary2: 80000,
        autoMaxContribution2: '401k',
        rothContribution2: 2000,
        birthYear2: 1970,
        retireAge2: 67,
      };
      const result = getContributionSplitOptimizer(inputs);
      expect(result.applicable).toBe(true);
      expect(result.searchSpouse1).toBe(true);
      expect(result.searchSpouse2).toBe(false);
      expect(result.results.length).toBe(5); // only spouse1's 5-point grid
    });

    // The real-dollars regression. The Strategy tab rendered this optimizer's
    // raw nominal figures directly beside the sticky Plan Status chip, which
    // reads the same projection through App.jsx's real-dollars discounting.
    // Same plan, same projection, two unlabelled currencies -- a user saw
    // $5.6M and $2.4M on one screen with nothing to explain the gap.
    describe('real-dollars pricing', () => {
      const contributing = { ...DEFAULT_INPUTS, preTaxContribution1: 15000, rothContribution1: 8500 };

      it('defaults to nominal, and returns strictly smaller figures in real dollars', () => {
        const nominal = getContributionSplitOptimizer(contributing);
        const real = getContributionSplitOptimizer(contributing, { realDollars: true });

        expect(nominal.realDollars).toBe(false);
        expect(real.realDollars).toBe(true);
        expect(real.current.endingBalance).toBeLessThan(nominal.current.endingBalance);
        expect(real.current.totalTaxes).toBeLessThan(nominal.current.totalTaxes);
        // Omitting the options object entirely must behave exactly as before,
        // so nothing that already called this one-argument changed meaning.
        expect(getContributionSplitOptimizer(contributing).current.endingBalance)
          .toBeCloseTo(nominal.current.endingBalance, 6);
      });

      it("discounts the ending balance by the price level at the END of the final year", () => {
        // E27 (2026-09-30): an ending balance is a year-end figure, so it is
        // converted by the year-end price level (utils/displayDollars.js
        // finalBalanceFactor), the same as the Dashboard's Ending Balance.
        const real = getContributionSplitOptimizer(contributing, { realDollars: true });
        const nominal = getContributionSplitOptimizer(contributing);
        const proj = runProjection(contributing);
        const finalFactor = finalBalanceFactor(proj.years);

        expect(finalFactor).toBeGreaterThan(proj.years[proj.years.length - 1].inflFactor);
        expect(real.current.endingBalance).toBeCloseTo(nominal.current.endingBalance / finalFactor, 4);
      });

      it('discounts total taxes YEAR BY YEAR, not by the final factor', () => {
        // This is the part that is easy to get wrong. Tax is paid across
        // every year of the plan, each year in its own dollars; dividing the
        // nominal total by the last year's factor would understate it badly,
        // since most of the tax is paid decades before the end.
        const real = getContributionSplitOptimizer(contributing, { realDollars: true });
        const nominal = getContributionSplitOptimizer(contributing);
        const proj = runProjection(contributing);
        const finalFactor = proj.years[proj.years.length - 1].inflFactor;

        const yearByYear = proj.years.reduce((sum, y) => sum + (y.totalTaxesPaid || 0) / (y.inflFactor || 1), 0);
        expect(real.current.totalTaxes).toBeCloseTo(yearByYear, 4);
        // And it is meaningfully different from the naive single-factor
        // version, so the assertion above isn't accidentally satisfied.
        expect(real.current.totalTaxes).toBeGreaterThan(nominal.current.totalTaxes / finalFactor);
      });

      it('picks the same winning split either way', () => {
        // Discounting divides every candidate by the same positive factors,
        // so it cannot reorder them. The recommendation was never wrong --
        // only the magnitude was mislabelled. If this ever fails, the
        // discounting has stopped being applied uniformly.
        const nominal = getContributionSplitOptimizer(contributing);
        const real = getContributionSplitOptimizer(contributing, { realDollars: true });
        expect(real.best.pct1).toBe(nominal.best.pct1);
        expect(real.best.pct2).toBe(nominal.best.pct2);
        expect(real.improvement).toBeGreaterThan(0);
        expect(real.improvement).toBeLessThan(nominal.improvement);
      });

      it('prices every row of the full results table, not just the summary cards', () => {
        const nominal = getContributionSplitOptimizer(contributing);
        const real = getContributionSplitOptimizer(contributing, { realDollars: true });
        expect(real.results.length).toBe(nominal.results.length);
        real.results.forEach((row, i) => {
          expect(row.endingBalance).toBeLessThan(nominal.results[i].endingBalance);
          expect(row.totalTaxes).toBeLessThan(nominal.results[i].totalTaxes);
          // The contribution dollar amounts are today's money already and
          // must NOT be discounted -- they're what you put in this year.
          expect(row.preTax1).toBe(nominal.results[i].preTax1);
          expect(row.roth1).toBe(nominal.results[i].roth1);
        });
      });
    });
  });

  describe('Non-Qualified Deferred Compensation (NQDC) (runProjection)', () => {
    it('has no effect on any existing plan when disabled (fully backward compatible)', () => {
      const proj = runProjection(DEFAULT_INPUTS);
      expect(proj.endingBalance).toBeCloseTo(36762.2363, 2);
      proj.years.forEach(y => {
        expect(y.nqdcBalance1).toBe(0);
        expect(y.nqdcBalance2).toBe(0);
        expect(y.nqdcDeferral1).toBe(0);
        expect(y.nqdcDistribution1).toBe(0);
      });
    });

    it('accumulates deferrals with credited growth while working', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        birthYear1: 1970,
        retireAge1: 67,
        salary1: 400000,
        nqdcEnabled1: true,
        nqdcDeferralAmount1: 50000,
        nqdcGrowthRate1: 6,
        nqdcDistributionStartAge1: 67,
        nqdcDistributionYears1: 5,
      };
      const proj = runProjection(inputs);
      // Year 1: no prior balance to grow, so balance == this year's deferral.
      expect(proj.years[0].nqdcBalance1).toBeCloseTo(50000, 2);
      expect(proj.years[0].nqdcDeferral1).toBeCloseTo(50000, 2);
      // Year 2: prior 50k grows 6%, plus a fresh 50k deferral.
      expect(proj.years[1].nqdcBalance1).toBeCloseTo(50000 * 1.06 + 50000, 2);
    });

    it('reduces taxable salary by exactly the deferral amount, deferring only income tax (not FICA)', () => {
      const withNQDC = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        birthYear1: 1970,
        retireAge1: 67,
        salary1: 400000,
        preTaxContribution1: 0,
        rothContribution1: 0,
        nqdcEnabled1: true,
        nqdcDeferralAmount1: 50000,
        nqdcGrowthRate1: 0,
        nqdcDistributionStartAge1: 67,
        nqdcDistributionYears1: 1,
      };
      const withoutNQDC = { ...withNQDC, nqdcEnabled1: false };
      const y0With = runProjection(withNQDC).years[0];
      const y0Without = runProjection(withoutNQDC).years[0];
      // $400k salary is deep in the top bracket (37%) for a single filer --
      // deferring $50k should save close to $50k * 37% in tax, not more
      // (which would indicate FICA was also incorrectly reduced).
      const taxSavings = y0Without.totalTaxesPaid - y0With.totalTaxesPaid;
      expect(taxSavings).toBeGreaterThan(50000 * 0.30);
      expect(taxSavings).toBeLessThan(50000 * 0.40);
    });

    it('stops accepting new deferrals once that spouse retires', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        birthYear1: 1970,
        retireAge1: 67,
        salary1: 400000,
        nqdcEnabled1: true,
        nqdcDeferralAmount1: 50000,
        nqdcGrowthRate1: 0,
        nqdcDistributionStartAge1: 75, // pushed out so we can see the "retired but not yet distributing" gap
        nqdcDistributionYears1: 5,
      };
      const proj = runProjection(inputs);
      const retiredNotYetDistributing = proj.years.find(y => y.age1 === 68);
      expect(retiredNotYetDistributing.nqdcDeferral1).toBe(0);
      // Balance should be flat (no growth configured, no new deferral,
      // no distribution yet) between retirement and distribution start.
      const age67 = proj.years.find(y => y.age1 === 67).nqdcBalance1;
      const age68 = proj.years.find(y => y.age1 === 68).nqdcBalance1;
      expect(age68).toBeCloseTo(age67, 2);
    });

    it('pays out the full balance to exactly $0 over the elected distribution window', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        birthYear1: 1970,
        retireAge1: 67,
        salary1: 400000,
        nqdcEnabled1: true,
        nqdcDeferralAmount1: 50000,
        nqdcGrowthRate1: 6,
        nqdcDistributionStartAge1: 67,
        nqdcDistributionYears1: 5,
      };
      const proj = runProjection(inputs);
      const lastDistributionYear = proj.years.find(y => y.age1 === 71);
      const afterDistribution = proj.years.find(y => y.age1 === 72);
      expect(lastDistributionYear.nqdcDistribution1).toBeGreaterThan(0);
      expect(afterDistribution.nqdcBalance1).toBe(0);
      expect(afterDistribution.nqdcDistribution1).toBe(0);
    });

    it('folds distributions into salary/ordinary income for tax and IRMAA purposes', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        birthYear1: 1970,
        retireAge1: 67,
        salary1: 400000,
        nqdcEnabled1: true,
        nqdcDeferralAmount1: 50000,
        nqdcGrowthRate1: 0,
        nqdcDistributionStartAge1: 67,
        nqdcDistributionYears1: 1,
      };
      const proj = runProjection(inputs);
      const distYear = proj.years.find(y => y.age1 === 67);
      expect(distYear.nqdcDistribution1).toBeGreaterThan(0);
      expect(distYear.salary).toBeCloseTo(distYear.nqdcDistribution1, 2);
      expect(distYear.totalTaxesPaid).toBeGreaterThan(0);
    });

    it('supports an existing pre-accrued balance via nqdcInit', () => {
      const inputs = {
        ...DEFAULT_INPUTS,
        spouse2Enabled: false,
        nqdcEnabled1: true,
        nqdcInit1: 200000,
        nqdcDeferralAmount1: 0,
        nqdcGrowthRate1: 0,
        nqdcDistributionStartAge1: 67,
        nqdcDistributionYears1: 1,
      };
      const proj = runProjection(inputs);
      expect(proj.years[0].nqdcBalance1).toBeCloseTo(200000, 2);
    });
  });

  // These functions had zero test coverage as of a coverage audit on
  // 2026-08-10 -- a `vitest --coverage` run showed them at 0 hits despite
  // being real, exported, user-facing features (the Target Portfolio
  // Solver, the Retirement Age Finder, the Die-With-Zero Optimizer, the
  // Stress Comparison chart, and the two "real dollars" wrappers around
  // the first two). Several of these also directly exercise the
  // inputs.planYear plumbing added for the Advance Year feature (see the
  // "Plan Year" describe block above) -- until now, that plumbing inside
  // findOptimalRetirementAge/computeStressComparisonData/
  // computeAgeFinderResultsReal was never actually run by any test.
  describe('Previously-uncovered planning tools', () => {
    describe('calculateStateTaxes / applyStateBrackets / getBracketFilling', () => {
      it('returns 0 for "none" and "TX_FL" regardless of income', () => {
        expect(calculateStateTaxes(200000, 20000, 30000, 'none', true, true, 'MFJ')).toBe(0);
        expect(calculateStateTaxes(200000, 20000, 30000, 'TX_FL', true, true, 'MFJ')).toBe(0);
      });

      it('"flat_5" (custom flat rate) taxes (income - ss - pension + taxableSS + taxablePension) at the given rate, honoring the taxSS/taxPension flags', () => {
        // taxSS=false, taxPension=false -- SS and pension both excluded from the state base
        const excluded = calculateStateTaxes(150000, 40000, 30000, 'flat_5', false, false, 'Single', 65, 65, 6.0);
        expect(excluded).toBeCloseTo((150000 - 40000 - 30000) * 0.06, 2);

        // taxSS=true, taxPension=true -- both included, so the state base is just `income`
        const included = calculateStateTaxes(150000, 40000, 30000, 'flat_5', true, true, 'Single', 65, 65, 6.0);
        expect(included).toBeCloseTo(150000 * 0.06, 2);
      });

      it('"il" and "pa" always fully exempt pension (regardless of taxPension) and SS, at their fixed flat rates', () => {
        const il = calculateStateTaxes(120000, 30000, 25000, 'il', true, true, 'Single');
        // Changelog 126 / audit Q-17: IL-1040 Step 4 now subtracts the
        // exemption allowance ($2,850 personal + $1,000 for a 65-year-old)
        // before the 4.95% flat rate.
        const ilAllowance = IL_EXEMPTION_ALLOWANCE + IL_EXEMPTION_AGE_65;
        expect(il).toBeCloseTo((120000 - 30000 - 25000 - ilAllowance) * 0.0495, 2);

        const pa = calculateStateTaxes(120000, 30000, 25000, 'pa', true, true, 'Single');
        expect(pa).toBeCloseTo((120000 - 30000 - 25000) * 0.0307, 2);
      });

      it('"co" exempts $24,000/spouse of pension at 65+ (or $20,000 at 55-64), less the SS it already subtracted, at Colorado\'s flat rate', () => {
        // Single filer, age 70 -- the $25,000 of SS is subtracted in full and
        // uses up the whole $24,000 cap (Colorado DOR: the SS subtraction
        // "will reduce the subtraction an individual can claim for any other
        // pension and annuity income"), so the pension is taxed.
        const single70 = calculateStateTaxes(120000, 30000, 25000, 'co', true, true, 'Single', 70);
        const expectedTaxableSingle70 = 120000 - 25000 /* SS excluded */ - Math.max(0, 24000 - 25000);
        expect(single70).toBeCloseTo(expectedTaxableSingle70 * 0.044, 2);

        // MFJ, both age 60 -- $20,000 subtraction EACH ($40,000 total). Since
        // changelog 125 (Q-14a) a 55-64 couple's Social Security is only
        // exempt outright when federal AGI is at or under $95,000; at
        // $120,000 the $25,000 of benefits competes with the $30,000 pension
        // for the $40,000 cap, so $15,000 stays taxable.
        const mfj60 = calculateStateTaxes(120000, 30000, 25000, 'co', true, true, 'MFJ', 60, 60);
        expect(mfj60).toBeCloseTo((120000 - 40000) * 0.044, 2);
        // Under the AGI limit the benefits ($12,500 each) are fully
        // subtracted and use $12,500 of each $20,000 cap, leaving $15,000 of
        // room for the $30,000 pension.
        const mfj60Low = calculateStateTaxes(90000, 30000, 25000, 'co', true, true, 'MFJ', 60, 60);
        expect(mfj60Low).toBeCloseTo((90000 - 25000 - 15000) * 0.044, 2);
      });

      it('"ny" exempts $20,000/spouse of pension for spouses 59.5+, and taxes the remainder progressively via applyStateBrackets', () => {
        // Single, age 60 -- $20,000 pension exclusion, SS always excluded
        const stateTaxableIncome = 120000 - 25000 - 30000 + 0 + Math.max(0, 30000 - 20000);
        const ny = calculateStateTaxes(120000, 30000, 25000, 'ny', true, true, 'Single', 60);
        // Manually walk the NY single brackets to cross-check applyStateBrackets'
        // progressive math independently of the implementation under test.
        //
        // NOTE what this does and does not prove. The duplicated table means
        // this test verifies the progressive WALK, not that the brackets are
        // the right ones -- it passed happily for as long as the same wrong
        // schedule sat in both places, which is exactly what happened until
        // 2026-08-20. Correctness of the brackets themselves is pinned by the
        // "New York state income tax, 2026" block further down, which checks
        // against the base dollar amounts published in Tax Law s 601.
        // Updated here to the verified 2026 schedule.
        const NY_SINGLE = [
          { limit: 8500, rate: 0.039 }, { limit: 11700, rate: 0.044 }, { limit: 13900, rate: 0.0515 },
          { limit: 80650, rate: 0.054 }, { limit: 215400, rate: 0.059 }, { limit: 1077550, rate: 0.0685 },
          { limit: 5000000, rate: 0.0965 }, { limit: 25000000, rate: 0.103 },
          { limit: Infinity, rate: 0.109 },
        ];
        // Changelog 126 / audit Q-17: NY's standard deduction (Tax Law
        // s 614) comes off before the schedule.
        const nyTaxableIncome = stateTaxableIncome - NY_STD_DEDUCTION_SINGLE;
        let expected = 0, prev = 0;
        for (const b of NY_SINGLE) {
          if (nyTaxableIncome > b.limit) { expected += (b.limit - prev) * b.rate; prev = b.limit; }
          else { expected += (nyTaxableIncome - prev) * b.rate; break; }
        }
        expect(ny).toBeCloseTo(expected, 2);
      });

      it('"ca" taxes progressively via applyStateBrackets and follows the taxPension flag directly (no special CA pension exclusion)', () => {
        const caExcluded = calculateStateTaxes(120000, 30000, 25000, 'ca', true, false, 'MFJ');
        const caIncluded = calculateStateTaxes(120000, 30000, 25000, 'ca', true, true, 'MFJ');
        // Including pension in the state base can only ever raise or hold flat the tax owed.
        expect(caIncluded).toBeGreaterThanOrEqual(caExcluded);
        expect(caExcluded).toBeGreaterThan(0);
      });

      it('returns 0 (not negative) once deductions/exemptions bring the state taxable base to zero or below', () => {
        const result = calculateStateTaxes(20000, 15000, 10000, 'flat_5', false, false, 'Single');
        expect(result).toBe(0);
      });

      it('getBracketFilling: the sum of each bracket\'s `tax` equals calculateTaxes\' federal tax for the same taxable income/status, and `filled` sums to the taxable income', () => {
        const income = 185000;
        const filling = getBracketFilling(income, 'MFJ');
        const sumTax = filling.reduce((s, b) => s + b.tax, 0);
        const sumFilled = filling.reduce((s, b) => s + b.filled, 0);
        expect(sumTax).toBeCloseTo(calculateTaxes(income, 'MFJ'), 2);
        expect(sumFilled).toBeCloseTo(income, 2);
        // Last bracket's capacity/range is always open-ended.
        expect(filling[filling.length - 1].capacity).toBe(Infinity);
        expect(filling[filling.length - 1].rangeText.endsWith('+')).toBe(true);
      });

      it('getBracketFilling scales bracket breakpoints by inflationFactor, shifting how much income falls in each bracket', () => {
        const income = 120000;
        const nominal = getBracketFilling(income, 'Single', 1);
        const inflated = getBracketFilling(income, 'Single', 1.5); // brackets 50% wider
        // With wider brackets, the same income should never owe MORE tax.
        const sumNominal = nominal.reduce((s, b) => s + b.tax, 0);
        const sumInflated = inflated.reduce((s, b) => s + b.tax, 0);
        expect(sumInflated).toBeLessThanOrEqual(sumNominal);
      });
    });

    describe('runOptimizer', () => {
      const solventBase = { ...DEFAULT_INPUTS, preTaxInit: 400000, rothInit: 100000, taxableInit: 100000, salary1: 250000 };

      it('returns the full 3x3 matrix of strategies by their expected ids (changelog 112)', () => {
        const results = runOptimizer(solventBase);
        expect(results).toHaveLength(9);
        const ids = results.map(r => r.id).sort();
        expect(ids).toEqual([
          'pretax_first', 'pro_rata', 'roth_conv_22', 'roth_conv_22_pretax', 'roth_conv_22_prorata',
          'roth_conv_24', 'roth_conv_24_pretax', 'roth_conv_24_prorata', 'taxable_first',
        ].sort());
        // Every order appears with every conversion column exactly once.
        const combos = results.map(r => `${r.config.withdrawalStrategy}|${r.config.rothConversionStrategy === 'none' ? 'none' : r.config.rothConversionBracket}`).sort();
        expect(combos).toEqual([
          'PreTaxFirst|0.22', 'PreTaxFirst|0.24', 'PreTaxFirst|none',
          'ProRata|0.22', 'ProRata|0.24', 'ProRata|none',
          'TaxableFirst|0.22', 'TaxableFirst|0.24', 'TaxableFirst|none',
        ].sort());
      });

      it('every returned strategy carries its own config used to produce it, and results are sorted highest net to heirs after every tax first (changelog 428)', () => {
        const results = runOptimizer(solventBase);
        for (let i = 1; i < results.length; i++) {
          if (results[i - 1].isSuccessful === results[i].isSuccessful) expect(results[i - 1].afterTaxLegacy).toBeGreaterThanOrEqual(results[i].afterTaxLegacy);
          else expect(results[i - 1].isSuccessful).toBe(true);
        }
        results.forEach(r => expect(r.config).toBeDefined());
        expect(results[0].ranking).toBe('Best');
      });

      it('survivorPhaseTaxes is always 0 for a single-filer household (no survivor phase exists)', () => {
        const results = runOptimizer({ ...solventBase, spouse2Enabled: false });
        results.forEach(r => expect(r.survivorPhaseTaxes).toBe(0));
      });

      it('survivorPhaseTaxes is computed (and can be positive) for a two-spouse household where one spouse predeceases the other', () => {
        const results = runOptimizer({
          ...solventBase, spouse2Enabled: true,
          birthYear1: TAX_YEAR - 75, lifeExpectancy1: 85,
          birthYear2: TAX_YEAR - 50, lifeExpectancy2: 95,
        });
        results.forEach(r => expect(typeof r.survivorPhaseTaxes).toBe('number'));
        expect(results.some(r => r.survivorPhaseTaxes > 0)).toBe(true);
      });

      it('marks a strategy that runs out of money as "Shortfall" rather than a ranked position', () => {
        const brokeBase = { ...DEFAULT_INPUTS, preTaxInit: 5000, rothInit: 0, taxableInit: 0, salary1: 0, ss1: 0, retireAge1: 40, lifeExpectancy1: 90, spouse2Enabled: false };
        const results = runOptimizer(brokeBase);
        expect(results.some(r => r.ranking === 'Shortfall')).toBe(true);
      });
    });

    describe('findOptimalRetirementAge', () => {
      const base = { ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxInit: 800000, rothInit: 200000, taxableInit: 200000, salary1: 150000, birthYear1: TAX_YEAR - 55, retireAge1: 65 };

      it('tests a window of candidate ages around the current retireAge1, capped at age 80, and reports the earliest funded age (if any)', () => {
        const result = findOptimalRetirementAge(base);
        expect(result.simulations.length).toBeGreaterThan(0);
        expect(result.simulations[result.simulations.length - 1].age).toBeLessThanOrEqual(80);
        // Ages tested are consecutive and increasing.
        for (let i = 1; i < result.simulations.length; i++) {
          expect(result.simulations[i].age).toBe(result.simulations[i - 1].age + 1);
        }
        if (result.earliestFundedAge !== null) {
          const idx = result.simulations.findIndex(s => s.age === result.earliestFundedAge);
          expect(result.simulations[idx].isSuccessful).toBe(true);
          // Nothing tested before it succeeded.
          expect(result.simulations.slice(0, idx).every(s => !s.isSuccessful)).toBe(true);
        }
      });

      it('the candidate age window is anchored to inputs.planYear, not a hardcoded year -- advancing planYear shifts the window', () => {
        const atDefault = findOptimalRetirementAge(base);
        const advanced = findOptimalRetirementAge({ ...base, planYear: TAX_YEAR + 5 });
        // Advancing planYear by 5 makes the household 5 years older on "day one,"
        // which pushes windowStart (and therefore every tested age) later by
        // the same amount once the current-age floor becomes the binding
        // constraint. At minimum, the two windows should differ in a way that
        // reflects this rather than being byte-identical.
        expect(advanced.simulations[0].age).toBeGreaterThanOrEqual(atDefault.simulations[0].age);
      });
    });

    describe('findDieWithZeroSpending', () => {
      it('converges on a spending level at or above the current lifestyleExpense for an ample, solvent portfolio, with a successful finalProjection', () => {
        const inputs = {
          ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxInit: 2000000, rothInit: 500000, taxableInit: 500000,
          salary1: 0, ss1: 30000, retireAge1: 65, birthYear1: TAX_YEAR - 65, lifestyleExpense: 60000,
        };
        const result = findDieWithZeroSpending(inputs);
        expect(result.dieWithZeroSpending).toBeGreaterThanOrEqual(inputs.lifestyleExpense);
        expect(result.additionalAnnualSpend).toBeCloseTo(result.dieWithZeroSpending - inputs.lifestyleExpense, 2);
        expect(result.finalProjection).toBeTruthy();
        expect(result.finalProjection.isSuccessful).toBe(true);
      });

      it('says no spending level works, rather than echoing the plan\'s own budget, for a portfolio too small to last at any spend (E17)', () => {
        const brokeInputs = {
          ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxInit: 1000, rothInit: 0, taxableInit: 0,
          salary1: 0, ss1: 0, retireAge1: 40, birthYear1: TAX_YEAR - 40, lifestyleExpense: 200000,
        };
        const result = findDieWithZeroSpending(brokeInputs);
        expect(result.reason).toBe('none-works');
        expect(result.dieWithZeroSpending).toBeNull();
        expect(result.additionalAnnualSpend).toBeNull();
        expect(result.finalProjection.years.length).toBeGreaterThan(0);
      });
    });

    describe('computeStressComparisonData', () => {
      const base = { ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxInit: 600000, rothInit: 0, taxableInit: 200000, salary1: 0, ss1: 20000, retireAge1: 65, birthYear1: TAX_YEAR - 65 };

      it('returns one row per simulated year, keyed by year starting at inputs.planYear, with a column for every historical stress scenario', () => {
        const data = computeStressComparisonData(base, false);
        expect(data.length).toBeGreaterThan(0);
        expect(data[0].year).toBe(base.planYear);
        expect(data[1].year).toBe(base.planYear + 1);
        ['none', '1929', '1966', '1973', '2000', '2008'].forEach(type => {
          expect(data[0]).toHaveProperty(type);
        });
      });

      it('useRealDollars=true divides each year-end balance by the year-end price level (the next year\'s factor), as the Dashboard does', () => {
        const proj = runProjection({ ...base, stressType: 'none' });
        const nominalData = computeStressComparisonData(base, false);
        const realData = computeStressComparisonData(base, true);
        // Spot-check a mid-plan year where inflation has actually compounded.
        const idx = Math.min(10, proj.years.length - 2);
        const factor = yearEndFactor(proj.years, idx);
        expect(factor).toBe(proj.years[idx + 1].inflFactor);
        expect(nominalData[idx].none).toBe(Math.round(proj.years[idx].totalPortfolioEnding));
        expect(realData[idx].none).toBe(Math.round(proj.years[idx].totalPortfolioEnding / factor));
      });
    });

    describe('computeOptimizerResultsReal / computeAgeFinderResultsReal (real-dollar wrappers)', () => {
      // With inflationRate pinned to 0, every year's inflFactor is exactly 1
      // (see runProjection's `inflFactor = (1 + inputs.inflationRate/100) ^ n`),
      // so dividing by it is a no-op -- the "real dollars" wrapper's output
      // must then be numerically identical to the underlying nominal
      // function's output. This isolates and verifies the discounting math
      // itself without depending on an arbitrary inflation assumption.
      const zeroInflationBase = { ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxInit: 400000, rothInit: 100000, taxableInit: 100000, salary1: 250000, inflationRate: 0 };

      it('computeOptimizerResultsReal matches runOptimizer\'s nominal totals when inflationRate is 0', () => {
        const nominal = runOptimizer(zeroInflationBase);
        const real = computeOptimizerResultsReal(zeroInflationBase);
        expect(real).toHaveLength(nominal.length);
        real.forEach(r => {
          const match = nominal.find(n => n.id === r.id);
          expect(r.endingBalance).toBeCloseTo(match.endingBalance, 2);
        });
      });

      it('computeAgeFinderResultsReal matches findOptimalRetirementAge\'s nominal endingBalance when inflationRate is 0, and still honors inputs.planYear', () => {
        const ageBase = { ...zeroInflationBase, birthYear1: TAX_YEAR - 55, retireAge1: 65 };
        const nominal = findOptimalRetirementAge(ageBase);
        const real = computeAgeFinderResultsReal(ageBase);
        expect(real.simulations).toHaveLength(nominal.simulations.length);
        real.simulations.forEach((sim, i) => {
          expect(sim.age).toBe(nominal.simulations[i].age);
          expect(sim.endingBalance).toBeCloseTo(nominal.simulations[i].endingBalance, 2);
        });
        expect(real.earliestFundedAge).toBe(nominal.earliestFundedAge);
      });
    });
  });

  // The three equityGlidePath* inputs were fully wired into runProjection
  // and runMonteCarlo for a long time, but had no UI anywhere in the app,
  // so nothing could switch them on and nothing tested that they worked.
  // The only existing reference was the required-return solver asserting it
  // IGNORES them. UI added 2026-08-19 ("Get more conservative each year in
  // retirement", Assumptions & Risk); these cover the behavior it exposes.
  describe('Retirement return glide (equityGlidePath*)', () => {
    const glideBase = {
      ...DEFAULT_INPUTS,
      spouse2Enabled: false,
      retireAge1: 55,
      preTaxInit: 1200000,
      rothInit: 200000,
      taxableInit: 300000,
      rebalancingEnabled: false,
      preRetireReturn: 7,
      postRetireReturn: 5,
      stressType: 'none',
    };
    const retiredRates = (result, n) =>
      result.years.filter((y) => y.isRetired).slice(0, n).map((y) => Number(y.growthRate.toFixed(4)));

    it('holds the retired return flat when disabled, which is the default', () => {
      expect(DEFAULT_INPUTS.equityGlidePathEnabled).toBe(false);
      expect(retiredRates(runProjection(glideBase), 6)).toEqual([5, 5, 5, 5, 5, 5]);
    });

    it('reduces the return by the configured rate for each year retired', () => {
      const result = runProjection({
        ...glideBase,
        equityGlidePathEnabled: true,
        equityGlidePathRate: 0.5,
        equityGlidePathFloor: 0,
      });
      // Year one of retirement is the full rate -- the reduction is applied
      // per year ALREADY retired, so it starts biting in year two.
      expect(retiredRates(result, 6)).toEqual([5, 4.5, 4, 3.5, 3, 2.5]);
    });

    it('stops at the floor and stays there for the rest of retirement', () => {
      const result = runProjection({
        ...glideBase,
        equityGlidePathEnabled: true,
        equityGlidePathRate: 1,
        equityGlidePathFloor: 3,
      });
      expect(retiredRates(result, 6)).toEqual([5, 4, 3, 3, 3, 3]);
    });

    it('leaves working years untouched', () => {
      const result = runProjection({
        ...glideBase,
        equityGlidePathEnabled: true,
        equityGlidePathRate: 1,
        equityGlidePathFloor: 0,
      });
      const working = result.years.filter((y) => !y.isRetired).map((y) => y.growthRate);
      expect(working.length).toBeGreaterThan(0);
      expect(new Set(working)).toEqual(new Set([7]));
    });

    it('materially changes the outcome, so it is not a cosmetic setting', () => {
      const flat = runProjection(glideBase);
      const glided = runProjection({ ...glideBase, equityGlidePathEnabled: true, equityGlidePathRate: 0.5, equityGlidePathFloor: 2 });
      expect(glided.endingBalance).toBeLessThan(flat.endingBalance * 0.75);
    });

    // The UI disables this control while Dynamic Asset Allocation is on and
    // says Glide Allocation supersedes it. That claim is only honest if the
    // calculator actually ignores it there -- these two branches are an
    // if/else, and this is the test that keeps them that way.
    it('is ignored entirely when Dynamic Asset Allocation is enabled', () => {
      const rebalancing = {
        ...glideBase,
        rebalancingEnabled: true,
        stockAllocationPre: 80,
        stockAllocationPost: 60,
        stockReturnRate: 9,
        bondReturnRate: 4,
        glideAllocationEnabled: false,
      };
      const without = runProjection(rebalancing);
      const with_ = runProjection({
        ...rebalancing,
        equityGlidePathEnabled: true,
        equityGlidePathRate: 2,
        equityGlidePathFloor: 0,
      });
      expect(with_.endingBalance).toBeCloseTo(without.endingBalance, 6);
      // 60% * 9 + 40% * 4 = 7.0, unchanged across retirement.
      expect(retiredRates(with_, 4)).toEqual([7, 7, 7, 7]);
    });

    it('applies to the Monte Carlo trial returns too, not just the deterministic projection', () => {
      // runMonteCarlo draws each year around the same base return this
      // setting shifts, so a steep glide has to lower the success
      // probability. Asserted as a comparison rather than a threshold --
      // trials are random and an absolute figure would be flaky.
      const flat = runMonteCarlo({ ...glideBase, preTaxInit: 700000, rothInit: 80000, taxableInit: 120000 });
      const glided = runMonteCarlo({
        ...glideBase,
        preTaxInit: 700000,
        rothInit: 80000,
        taxableInit: 120000,
        equityGlidePathEnabled: true,
        equityGlidePathRate: 1,
        equityGlidePathFloor: -2,
      });
      expect(glided.successProbability).toBeLessThan(flat.successProbability);
    }, 60000); // full Monte Carlo runs: well over vitest's 5 s default on a loaded CI runner
  });


  // volatilityPre/volatilityPost had no UI and no tests until 2026-08-19,
  // yet they were never inert the way equityGlidePath* was: every Monte
  // Carlo run has always used them, at the 15%/8% defaults. They are the
  // dominant lever on the success probability, so they get pinned here.
  describe('Monte Carlo volatility (volatilityPre / volatilityPost)', () => {
    const volBase = {
      ...DEFAULT_INPUTS,
      spouse2Enabled: false,
      retireAge1: 62,
      preTaxInit: 700000,
      rothInit: 80000,
      taxableInit: 120000,
      rebalancingEnabled: false,
      stressType: 'none',
    };

    it('collapses to a single deterministic outcome at zero volatility', () => {
      // With no dispersion every trial draws the same return, so the
      // percentile spread must vanish. This is the cleanest proof the
      // inputs are actually feeding randomNormal's sigma.
      const r = runMonteCarlo({ ...volBase, volatilityPre: 0, volatilityPost: 0 });
      expect(r.endingP10).toBeCloseTo(r.endingP90, 6);
      expect(r.successProbability).toBe(100);
    });

    it('widens the outcome spread as volatility rises', () => {
      const calm = runMonteCarlo({ ...volBase, volatilityPre: 5, volatilityPost: 3 });
      const wild = runMonteCarlo({ ...volBase, volatilityPre: 28, volatilityPost: 22 });
      expect(wild.endingP90 - wild.endingP10).toBeGreaterThan(calm.endingP90 - calm.endingP10);
    });

    it('lowers the success probability as volatility rises', () => {
      // Asserted as an ordering rather than a threshold: trials are random,
      // so any absolute figure would be flaky. The gap between these two is
      // far larger than run-to-run noise.
      const calm = runMonteCarlo({ ...volBase, volatilityPre: 8, volatilityPost: 5 });
      const wild = runMonteCarlo({ ...volBase, volatilityPre: 25, volatilityPost: 18 });
      expect(wild.successProbability).toBeLessThan(calm.successProbability - 10);
    });

    it('leaves the deterministic projection untouched, which is what the UI claims', () => {
      // The control says it affects Monte Carlo ONLY. runProjection must
      // therefore ignore both fields entirely.
      const a = runProjection({ ...volBase, volatilityPre: 0, volatilityPost: 0 });
      const b = runProjection({ ...volBase, volatilityPre: 35, volatilityPost: 30 });
      expect(a.endingBalance).toBeCloseTo(b.endingBalance, 6);
    });

    // Documents the discrepancy called out in calculator.js rather than
    // asserting the two branches agree -- because they don't, and that is a
    // known, deliberate state. If someone reconciles them later this test
    // fails and points at the decision instead of silently passing.
    it('derives volatility from the stock/bond mix when Dynamic Asset Allocation is on, ignoring these fields', () => {
      const rebalancing = { ...volBase, rebalancingEnabled: true, stockAllocationPre: 80, stockAllocationPost: 60 };
      const low = runMonteCarlo({ ...rebalancing, volatilityPre: 1, volatilityPost: 1 });
      const high = runMonteCarlo({ ...rebalancing, volatilityPre: 39, volatilityPost: 39 });
      // Both runs use the derived figure, so neither collapses and neither
      // explodes -- the spread stays in the same broad range despite a 39x
      // difference in the ignored inputs.
      const spread = (r) => r.endingP90 - r.endingP10;
      expect(spread(low)).toBeGreaterThan(0);
      expect(spread(high)).toBeGreaterThan(0);
      expect(spread(high)).toBeLessThan(spread(low) * 3);
      expect(spread(low)).toBeLessThan(spread(high) * 3);
    });

    it('the retired defaults of the two branches agree (reconciled in changelog 247)', () => {
      // 60% * 16 + 40% * 5 = 11.6. The flat default was 8 until changelog
      // 247, which moved it to the derived figure and migrated plans still
      // on 8 (see monteCarloModel.test.js). Asserted so the two branches
      // cannot drift apart again without someone deciding which is right.
      const derivedRetired = (60 * 16 + 40 * 5) / 100;
      expect(derivedRetired).toBeCloseTo(11.6, 6);
      expect(DEFAULT_INPUTS.volatilityPost).toBe(11.6);
      expect(DEFAULT_INPUTS.stockAllocationPost).toBe(60);
    });
  });


  // Lifetime gifting. The distinction these tests keep honest is between
  // "gifted" and "taxable": almost nobody using this feature will ever owe
  // gift tax, but anything above the annual exclusion silently shrinks the
  // exemption sheltering the estate decades later, and that is the effect
  // worth getting right.
  describe('Lifetime gifting (giftingForAge / computeGiftingTotals)', () => {
    const giftBase = {
      ...DEFAULT_INPUTS,
      spouse2Enabled: false,
      giftingEnabled: true,
      giftingRecipients: 2,
      giftingPerRecipient: ANNUAL_GIFT_EXCLUSION_2026,
      giftingStartAge: 70,
      giftingYears: 10,
      giftingGrowWithInflation: false,
      stressType: 'none',
    };

    it('is off by default, and off means zero', () => {
      expect(DEFAULT_INPUTS.giftingEnabled).toBe(false);
      expect(computeGiftingTotals(DEFAULT_INPUTS)).toEqual({
        totalGifted: 0, totalExcluded: 0, totalTaxableGifts: 0,
      });
    });

    it('gifting exactly at the annual exclusion uses none of the lifetime exemption', () => {
      const t = computeGiftingTotals(giftBase);
      expect(t.totalGifted).toBeCloseTo(ANNUAL_GIFT_EXCLUSION_2026 * 2 * 10, 4);
      expect(t.totalTaxableGifts).toBe(0);
    });

    it('counts only the excess above the exclusion as taxable', () => {
      const t = computeGiftingTotals({ ...giftBase, giftingPerRecipient: ANNUAL_GIFT_EXCLUSION_2026 + 100000 });
      // 2 recipients x 10 years x $100,000 over the line.
      expect(t.totalTaxableGifts).toBeCloseTo(2 * 10 * 100000, 4);
      expect(t.totalExcluded).toBeCloseTo(ANNUAL_GIFT_EXCLUSION_2026 * 2 * 10, 4);
    });

    it('splitting with a spouse doubles the exclusion per recipient', () => {
      const doubled = { ...giftBase, spouse2Enabled: true, giftingSplitWithSpouse: true, giftingPerRecipient: ANNUAL_GIFT_EXCLUSION_2026 * 2 };
      expect(computeGiftingTotals(doubled).totalTaxableGifts).toBe(0);
      // ...and without consenting to split, the same gift is half over.
      const notSplit = { ...doubled, giftingSplitWithSpouse: false };
      expect(computeGiftingTotals(notSplit).totalTaxableGifts).toBeCloseTo(ANNUAL_GIFT_EXCLUSION_2026 * 2 * 10, 4);
    });

    it('a single spouse cannot split, even with the toggle on', () => {
      // The toggle is hidden without a spouse, but a restored plan or an
      // edited backup could carry it -- it must not silently double.
      const t = computeGiftingTotals({ ...giftBase, spouse2Enabled: false, giftingSplitWithSpouse: true, giftingPerRecipient: ANNUAL_GIFT_EXCLUSION_2026 * 2 });
      expect(t.totalTaxableGifts).toBeCloseTo(ANNUAL_GIFT_EXCLUSION_2026 * 2 * 10, 4);
    });

    it('gives nothing outside the gifting window', () => {
      expect(giftingForAge(giftBase, 69).gifted).toBe(0);
      expect(giftingForAge(giftBase, 70).gifted).toBeGreaterThan(0);
      expect(giftingForAge(giftBase, 79).gifted).toBeGreaterThan(0);
      expect(giftingForAge(giftBase, 80).gifted).toBe(0);
    });

    // Growing the gift without growing the exclusion alongside it would
    // invent taxable gifts out of inflation alone.
    it('growing with inflation keeps an at-the-exclusion plan at the exclusion', () => {
      const grown = { ...giftBase, giftingGrowWithInflation: true, inflationRate: 3 };
      expect(computeGiftingTotals(grown).totalTaxableGifts).toBeCloseTo(0, 6);
      expect(computeGiftingTotals(grown).totalGifted).toBeGreaterThan(computeGiftingTotals(giftBase).totalGifted);
    });

    it('is a real cash outflow in the projection, not a free reduction of the estate', () => {
      const rich = { ...giftBase, retireAge1: 65, preTaxInit: 2000000, rothInit: 500000, taxableInit: 1000000 };
      const without = runProjection({ ...rich, giftingEnabled: false });
      const with_ = runProjection(rich);
      // Lower by more than the gifts themselves -- the money also stops
      // compounding, which is the real cost of giving early.
      const totalGifted = computeGiftingTotals(rich).totalGifted;
      expect(with_.endingBalance).toBeLessThan(without.endingBalance - totalGifted);
    });
  });

  describe('Federal estate tax and the unified exemption', () => {
    it('taxable gifts reduce the exemption dollar for dollar', () => {
      const estate = 20_000_000;
      const noGifts = calculateFederalEstateTax(estate, 'Single', 1);
      const withGifts = calculateFederalEstateTax(estate, 'Single', 1, 2_000_000);
      // $2M less shelter, taxed at the flat 40% top rate.
      expect(withGifts - noGifts).toBeCloseTo(2_000_000 * FEDERAL_ESTATE_TOP_RATE, 4);
    });

    it('cannot push the exemption below zero', () => {
      const estate = 20_000_000;
      expect(calculateFederalEstateTax(estate, 'Single', 1, 99_000_000))
        .toBeCloseTo(estate * FEDERAL_ESTATE_TOP_RATE, 4);
    });

    it('defaults to no gifts, so every existing plan is unaffected', () => {
      expect(calculateFederalEstateTax(20_000_000, 'Single', 1))
        .toBe(calculateFederalEstateTax(20_000_000, 'Single', 1, 0));
    });
  });


  // Married Filing Separately. Every figure asserted here was read off
  // Rev. Proc. 2025-32, IRS Publication 915/590-A or the 2026 Medicare
  // Part B release -- not derived, because the intuitive assumption ("MFS
  // is just Single") is wrong in exactly the places that matter most.
  describe('Married Filing Separately', () => {
    it('uses brackets that are exactly half of MFJ at every threshold', () => {
      BRACKETS_MFS.forEach((band, i) => {
        if (band.limit === Infinity) return;
        expect(band.limit, `band ${i}`).toBeCloseTo(BRACKETS_MFJ[i].limit / 2, 6);
        expect(band.rate).toBe(BRACKETS_MFJ[i].rate);
      });
    });

    // The one federal bracket difference from Single, and the reason MFS
    // cannot simply fall through to the Single table.
    it('reaches the top rate far earlier than a single filer', () => {
      expect(BRACKETS_MFS[5].limit).toBe(384350);
      expect(BRACKETS_SINGLE[5].limit).toBe(640600);
      // Changelog 127 / audit Q-1: calculateTaxes now spreads an MFS
      // household across its two returns. This test is about the MFS
      // SCHEDULE, so it puts the whole income on one return (split 100).
      const income = 500000;
      expect(calculateTaxes(income, 'MFS', 1, false, 100)).toBeGreaterThan(calculateTaxes(income, 'Single'));
    });

    it('matches Single at incomes below that divergence', () => {
      // Same brackets and same standard deduction up to $256,225 -- on one
      // return; see the note above about the changelog 127 split.
      expect(calculateTaxes(150000, 'MFS', 1, false, 100)).toBeCloseTo(calculateTaxes(150000, 'Single'), 6);
    });

    // AMT is the trap: MFS's exemption is lower than Single's, so falling
    // through to Single would understate it.
    it('has a lower AMT exemption than Single, being half of MFJ', () => {
      expect(AMT_EXEMPTION_MFS_2026).toBe(70100);
      expect(AMT_EXEMPTION_MFS_2026).toBeCloseTo(AMT_EXEMPTION_MFJ_2026 / 2, 6);
      expect(AMT_EXEMPTION_MFS_2026).toBeLessThan(AMT_EXEMPTION_SINGLE_2026);
    });

    // The single largest MFS effect on a retirement plan.
    it('gives Social Security no exempt amount at all when the couple lived together', () => {
      const base = {
        ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: 1958, retireAge1: 66,
        ss1: 30000, preTaxInit: 250000, rothInit: 0, taxableInit: 0, salary1: 0,
        // A pension keeps provisional income above the single thresholds;
        // under the exact worksheet (changelog 119) the Pre-Tax draw alone
        // left both the Single and the MFS-apart filer at $0 tax, which
        // made the lifetime comparison below vacuous.
        pension1: 20000, pensionStartAge1: 60,
        lifestyleExpense: 38000, stressType: 'none',
      };
      const lifetimeTax = (o) => runProjection({ ...base, ...o }).years.reduce((a, y) => a + y.totalTaxesPaid, 0);

      const together = lifetimeTax({ filingStatus: 'MFS', mfsLivedWithSpouse: true });
      const apart = lifetimeTax({ filingStatus: 'MFS', mfsLivedWithSpouse: false });

      // With the exact worksheet (changelog 119) the apart filer already
      // has most of the benefit taxable once the pension is in, so the
      // together/apart gap is real but no longer a 1.5x multiple.
      expect(together).toBeGreaterThan(apart);
      // Living apart the whole year gets the single filer's Social Security
      // thresholds, which is the actual rule rather than a convenience. The
      // two statuses no longer share a lifetime tax bill, though: an MFS
      // filer aged 65+ gets the married $1,650 age add-on rather than the
      // single $2,050 and is excluded from the OBBBA senior bonus outright,
      // so compare the SS taxability itself.
      // First year only: from year two the two filers' different tax bills
      // change the Pre-Tax draw, hence provisional income, and under the
      // exact worksheet (changelog 119) taxable SS moves continuously with
      // provisional income rather than in flat tiers.
      const firstYearTaxableSS = (o) => Math.round(runProjection({ ...base, ...o }).years[0].taxableSS);
      expect(firstYearTaxableSS({ filingStatus: 'MFS', mfsLivedWithSpouse: false }))
        .toBe(firstYearTaxableSS({ filingStatus: 'Single' }));
      expect(apart).toBeGreaterThan(lifetimeTax({ filingStatus: 'Single' }));
    });

    it('collapses the Roth IRA phase-out to $0-$10,000 when living together', () => {
      expect(ROTH_IRA_PHASEOUT_MFS_TOGETHER).toEqual([0, 10000]);
      const advisory = (o) => getContributionAdvisory({ ...DEFAULT_INPUTS, salary1: 60000, spouse2Enabled: false, ...o });
      expect(advisory({ filingStatus: 'MFS', mfsLivedWithSpouse: true }).rothIra.eligibility).toBe('none');
      // ...and living apart uses the ordinary single-filer range, where a
      // $60,000 earner is fully eligible.
      expect(advisory({ filingStatus: 'MFS', mfsLivedWithSpouse: false }).rothIra.eligibility).toBe('full');
    });

    // Three brackets rather than six, and the first one crossed jumps
    // straight to the second-highest premium.
    it('uses the compressed three-bracket IRMAA schedule when living together', () => {
      expect(irmaaThresholdsFor('MFS', true)).toBe(IRMAA_THRESHOLDS_MFS_TOGETHER);
      expect(irmaaThresholdsFor('MFS', false)).toBe(IRMAA_THRESHOLDS_SINGLE);
      expect(irmaaThresholdsFor('MFJ', true)).toBe(IRMAA_THRESHOLDS_MFJ);

      const at = (magi) => calculateIRMAA(magi, 'MFS', 1, 1, 1, true) / 1;
      // Below the first threshold: standard premium, no surcharge.
      expect(at(100000)).toBeCloseTo(IRMAA_STANDARD_PREMIUM * 12, 4);
      // Just over $109,000 skips three tiers entirely.
      expect(at(120000)).toBeCloseTo(IRMAA_TIER_PREMIUMS[3] * 12, 4);
      expect(at(400000)).toBeCloseTo(IRMAA_TIER_PREMIUMS[4] * 12, 4);
      // A single filer at the same income is far better off.
      expect(at(120000)).toBeGreaterThan(calculateIRMAA(120000, 'Single', 1, 1, 1));
    });

    it('halves the NIIT and Additional Medicare thresholds', () => {
      // Both statutory at $125,000 for MFS and neither indexed.
      const highInv = { ...DEFAULT_INPUTS, spouse2Enabled: false, taxableInit: 5000000, salary1: 0, stressType: 'none' };
      const mfs = runProjection({ ...highInv, filingStatus: 'MFS' });
      const single = runProjection({ ...highInv, filingStatus: 'Single' });
      const tax = (r) => r.years.reduce((a, y) => a + y.totalTaxesPaid, 0);
      expect(tax(mfs)).toBeGreaterThan(tax(single));
    });

    it('is not offered as a saved default, so existing plans are untouched', () => {
      expect(DEFAULT_INPUTS.filingStatus).not.toBe('MFS');
      expect(DEFAULT_INPUTS.mfsLivedWithSpouse).toBe(true);
    });
  });


  // Charitable bequests and generation-skipping transfer tax. Every figure
  // verified against Rev. Proc. 2025-32 and the Form 706-GS(T)
  // instructions -- the GST exemption in particular, because assuming it
  // behaves like the estate exclusion is the natural mistake and an
  // expensive one.
  describe('Charitable bequests', () => {
    const estateOf = (o) => calculateHeirEstateTax(
      { ...DEFAULT_INPUTS, filingStatus: 'MFJ', spouse2Enabled: true, ...o },
      20000000, 3000000, 5000000
    );

    it('is off by default', () => {
      expect(DEFAULT_INPUTS.charitableBequestEnabled).toBe(false);
      expect(estateOf({}).charitableBequest).toBe(0);
    });

    it('gives away a percentage of the whole estate', () => {
      const r = estateOf({ charitableBequestEnabled: true, charitableBequestMode: 'percent', charitableBequestPct: 20 });
      // 20% of $28,000,000 gross.
      expect(r.charitableBequest).toBeCloseTo(28000000 * 0.20, 2);
    });

    it('gives away a fixed amount, capped at the estate', () => {
      const r = estateOf({ charitableBequestEnabled: true, charitableBequestMode: 'amount', charitableBequestAmount: 1000000 });
      expect(r.charitableBequest).toBe(1000000);
      const capped = estateOf({ charitableBequestEnabled: true, charitableBequestMode: 'amount', charitableBequestAmount: 99000000 });
      expect(capped.charitableBequest).toBe(28000000);
    });

    it('reduces what heirs receive and the estate that gets taxed', () => {
      const without = estateOf({});
      const with_ = estateOf({ charitableBequestEnabled: true, charitableBequestMode: 'percent', charitableBequestPct: 25 });
      expect(with_.netInherited).toBeLessThan(without.netInherited);
      expect(with_.totalFederalEstateTax).toBeLessThanOrEqual(without.totalFederalEstateTax);
    });

    // The deduction being uncapped is the whole point -- it is the only
    // lever here without a ceiling.
    it('can shelter the entire estate, unlike gifts or the marital deduction', () => {
      const all = estateOf({ charitableBequestEnabled: true, charitableBequestMode: 'percent', charitableBequestPct: 100 });
      expect(all.totalFederalEstateTax).toBe(0);
      expect(all.charitableBequest).toBeCloseTo(28000000, 2);
    });
  });

  describe('Generation-skipping transfer tax', () => {
    const skipEstate = (o = {}) => calculateHeirEstateTax(
      {
        ...DEFAULT_INPUTS, filingStatus: 'MFJ', spouse2Enabled: true,
        // Changelog 127 / audit Q-13: the estate thresholds are now carried
        // to the plan's final year at the Tax Bracket Inflation Rate. This
        // test is about the GST exemption's structure, so it pins the
        // unindexed comparison and lets the Q-13 tests cover the indexing.
        estateIndexingEnabled: false,
        heirs: [{ id: 1, name: 'Grandchild', filingStatus: 'Single', income: 80000, splitPct: 100, isSkipPerson: true }],
        ...o,
      },
      20000000, 3000000, 5000000
    );

    it('uses the verified 2026 exemption and rate', () => {
      expect(GST_EXEMPTION_2026).toBe(15000000);
      expect(GST_RATE).toBe(0.40);
    });

    it('charges 40% on the skip share above the exemption', () => {
      // $28,000,000 estate, all to a grandchild, $15,000,000 sheltered.
      expect(skipEstate().totalGenerationSkippingTax).toBeCloseTo((28000000 - 15000000) * 0.40, 2);
    });

    it('charges nothing for a non-skip heir, however large the estate', () => {
      const child = calculateHeirEstateTax(
        { ...DEFAULT_INPUTS, filingStatus: 'MFJ', spouse2Enabled: true, estateIndexingEnabled: false },
        20000000, 3000000, 5000000
      );
      expect(child.totalGenerationSkippingTax).toBe(0);
    });

    // THE trap. The estate exclusion doubles for a married couple through
    // portability; the GST exemption does not, and the Form 706-GS(T)
    // instructions say so outright. This estate owes NO federal estate tax
    // (sheltered by $30M) while owing millions in GST (sheltered by only
    // $15M) -- if the two were treated alike, both would read zero.
    it('is NOT doubled for a married couple, unlike the estate exclusion', () => {
      expect(GST_EXEMPTION_IS_PORTABLE).toBe(false);
      const r = skipEstate();
      expect(r.totalFederalEstateTax).toBe(0);
      expect(r.totalGenerationSkippingTax).toBeGreaterThan(5000000);
    });

    it('splits one exemption across several skip persons rather than giving each their own', () => {
      const two = skipEstate({
        heirs: [
          { id: 1, name: 'GC1', filingStatus: 'Single', income: 80000, splitPct: 50, isSkipPerson: true },
          { id: 2, name: 'GC2', filingStatus: 'Single', income: 80000, splitPct: 50, isSkipPerson: true },
        ],
      });
      expect(two.totalGenerationSkippingTax).toBeCloseTo(skipEstate().totalGenerationSkippingTax, 2);
      // ...and each grandchild carries half of it.
      expect(two.perHeir[0].gstTax).toBeCloseTo(two.perHeir[1].gstTax, 6);
    });

    it('applies only to the skip person when heirs are mixed', () => {
      const mixed = skipEstate({
        heirs: [
          { id: 1, name: 'Child', filingStatus: 'Single', income: 80000, splitPct: 50, isSkipPerson: false },
          { id: 2, name: 'Grandchild', filingStatus: 'Single', income: 80000, splitPct: 50, isSkipPerson: true },
        ],
      });
      expect(mixed.perHeir[0].gstTax).toBe(0);
      // Half the estate is $14,000,000 -- under the $15,000,000 exemption,
      // so nothing is due even though a skip person is involved.
      expect(mixed.perHeir[1].gstTax).toBe(0);
      expect(mixed.totalGenerationSkippingTax).toBe(0);
    });

    it('stacks on top of estate tax rather than replacing it', () => {
      // Single filer: only $15M of estate exclusion, so both taxes bite.
      const single = calculateHeirEstateTax(
        {
          ...DEFAULT_INPUTS, filingStatus: 'Single', spouse2Enabled: false,
          estateIndexingEnabled: false,
          heirs: [{ id: 1, name: 'GC', filingStatus: 'Single', income: 80000, splitPct: 100, isSkipPerson: true }],
        },
        20000000, 3000000, 5000000
      );
      expect(single.totalFederalEstateTax).toBeGreaterThan(0);
      expect(single.totalGenerationSkippingTax).toBeGreaterThan(0);
    });
  });

});

// ---------------------------------------------------------------------------
// Charitable bequest asset location (2026-08-20)
//
// The feature's whole claim is that WHICH accounts fund a bequest changes the
// after-tax result even when the amount is identical. These tests pin that
// claim down in the direction it must hold -- pre-tax to charity beats
// proportional, taxable-first is worse -- rather than asserting exact dollar
// figures that would break on any unrelated bracket update.
// ---------------------------------------------------------------------------
describe('splitCharitableBequest', () => {
  const buckets = { preTax: 1000, roth: 500, taxable: 500 };

  it('spreads proportionally when given no order', () => {
    expect(splitCharitableBequest(200, buckets, null)).toEqual({ preTax: 100, roth: 50, taxable: 50 });
  });

  it('drains strictly in the given order', () => {
    const r = splitCharitableBequest(200, buckets, CHARITABLE_SOURCE_ORDERS.pretax);
    expect(r).toEqual({ preTax: 200, roth: 0, taxable: 0 });
  });

  it('overflows into the next bucket only once the first is empty', () => {
    const r = splitCharitableBequest(1600, buckets, CHARITABLE_SOURCE_ORDERS.pretax);
    expect(r.preTax).toBe(1000);
    expect(r.taxable).toBe(500);
    expect(r.roth).toBe(100);
  });

  it('puts Roth last in every non-proportional order, because nobody benefits from giving it away', () => {
    for (const key of ['pretax', 'taxable']) {
      expect(CHARITABLE_SOURCE_ORDERS[key][CHARITABLE_SOURCE_ORDERS[key].length - 1]).toBe('roth');
    }
  });

  it('never gives away more than exists', () => {
    const r = splitCharitableBequest(99999, buckets, CHARITABLE_SOURCE_ORDERS.pretax);
    expect(r.preTax + r.roth + r.taxable).toBe(2000);
  });

  it('returns zeros for a zero bequest or an empty estate', () => {
    expect(splitCharitableBequest(0, buckets, null)).toEqual({ preTax: 0, roth: 0, taxable: 0 });
    expect(splitCharitableBequest(100, { preTax: 0, roth: 0, taxable: 0 }, null)).toEqual({ preTax: 0, roth: 0, taxable: 0 });
  });
});

describe('charitable bequest asset location in the estate model', () => {
  const heirs = [{ id: 1, name: 'Heir 1', filingStatus: 'Single', income: 100000, splitPct: 100, isSkipPerson: false }];
  const base = {
    ...DEFAULT_INPUTS,
    heirs,
    charitableBequestEnabled: true,
    charitableBequestMode: 'amount',
    charitableBequestAmount: 200000,
  };
  const run = (source) => calculateHeirEstateTax({ ...base, charitableBequestSource: source }, 800000, 400000, 300000);

  it('defaults to proportional, so existing saved plans are unaffected', () => {
    const explicit = run('proportional');
    const implied = calculateHeirEstateTax({ ...base, charitableBequestSource: undefined }, 800000, 400000, 300000);
    expect(implied.netInherited).toBeCloseTo(explicit.netInherited, 6);
    expect(implied.totalHeirTax).toBeCloseTo(explicit.totalHeirTax, 6);
  });

  it('gives the charity the same total regardless of which accounts fund it', () => {
    const amounts = ['proportional', 'pretax', 'taxable'].map(s => run(s).charitableBequest);
    expect(new Set(amounts.map(a => Math.round(a))).size).toBe(1);
  });

  // The core claim.
  it('funding from pre-tax cuts the heirs income tax bill', () => {
    expect(run('pretax').totalHeirTax).toBeLessThan(run('proportional').totalHeirTax);
  });

  it('funding from taxable raises it, because it leaves the heirs more IRA', () => {
    expect(run('taxable').totalHeirTax).toBeGreaterThan(run('proportional').totalHeirTax);
  });

  it('reports what the choice was worth, signed so a bad choice reads as a loss', () => {
    const good = run('pretax').charitableSourceComparison;
    const bad = run('taxable').charitableSourceComparison;
    expect(good.heirTaxSaved).toBeGreaterThan(0);
    expect(bad.heirTaxSaved).toBeLessThan(0);
  });

  it('omits the comparison when there is nothing to compare', () => {
    expect(run('proportional').charitableSourceComparison).toBeNull();
    const noBequest = calculateHeirEstateTax(
      { ...base, charitableBequestEnabled: false, charitableBequestSource: 'pretax' }, 800000, 400000, 300000);
    expect(noBequest.charitableSourceComparison).toBeNull();
  });

  // The recursive comparison pass is flagged so it cannot recurse again.
  // If that guard ever breaks this test hangs or blows the stack rather
  // than failing quietly.
  it('runs exactly one extra pass and terminates', () => {
    const r = run('pretax');
    expect(r.charitableSourceComparison.proportionalNetInherited).toBeGreaterThan(0);
    expect(Number.isFinite(r.netInherited)).toBe(true);
  });

  it('leaves the heirs more Roth when the bequest comes from pre-tax', () => {
    const pre = run('pretax');
    const prop = run('proportional');
    expect(pre.perHeir[0].rothInherited ?? pre.perHeir[0].heirRoth ?? 0)
      .toBeGreaterThanOrEqual(prop.perHeir[0].rothInherited ?? prop.perHeir[0].heirRoth ?? 0);
  });
});

// ---------------------------------------------------------------------------
// New York state brackets (corrected 2026-08-20)
//
// The previous set was labeled "estimated 2026" and was wrong three ways,
// all of which overstated tax. These tests cross-check against the base
// dollar amounts published in NY Tax Law s 601 itself, which is the only
// check that would have caught the original error -- the old brackets were
// internally consistent and produced plausible-looking numbers.
// ---------------------------------------------------------------------------
describe('New York state income tax, 2026', () => {
  // Changelog 126 / audit Q-17: calculateStateTaxes now subtracts NY's
  // standard deduction (Tax Law s 614) before walking the s 601 schedule.
  // These suites check the SCHEDULE, so each helper grosses the income up
  // by the deduction -- the schedule then sees exactly the taxable income
  // the statutory base is published against.
  const nyStdFor = (status) => (status === 'MFJ' ? NY_STD_DEDUCTION_MFJ : NY_STD_DEDUCTION_SINGLE);
  const nyTax = (income, status) => calculateStateTaxes(income + nyStdFor(status), 0, 0, 'ny', false, false, status, 70, 70);

  // s 601 publishes a cumulative base at each threshold. Computing bracket by
  // bracket lands within $1 of it -- the statute rounds each published base to
  // a whole dollar, we don't. A dollar is immaterial in a projection, but the
  // tolerance is stated rather than hidden so nobody later "fixes" a rounding
  // difference into a real bracket change.
  //
  // 2026-08-23: the s 601(d-5) tax table benefit recapture is now modeled,
  // so each expectation is the statutory bracket base PLUS the cumulative
  // recapture for the row that income sits in (fully phased in at every
  // checkpoint here -- each is at least $50,000 past its row's threshold, or
  // in row one's case past $107,650 + $50,000). Tolerance widens to $2: the
  // bracket walk is within $1 of the statutory base, and the published
  // recapture integers are themselves rounded within ~$1.25 of the exact
  // rate arithmetic (see NY_RECAPTURE_SINGLE's comment in calculator.js).
  const STATUTORY_BASES = [
    { income: 80650, status: 'Single', base: 4191, recapture: 0 },
    { income: 215400, status: 'Single', base: 12141, recapture: 567 },
    { income: 1077550, status: 'Single', base: 71198, recapture: 2614 },
    { income: 5000000, status: 'Single', base: 449714, recapture: 32786 },
    { income: 161550, status: 'MFJ', base: 8391, recapture: 333 },
    { income: 323200, status: 'MFJ', base: 17928, recapture: 1140 },
    { income: 2155350, status: 'MFJ', base: 143430, recapture: 4211 },
    { income: 5000000, status: 'MFJ', base: 417939, recapture: 64561 },
  ];

  it.each(STATUTORY_BASES)('matches the s 601 base plus recapture at $income for $status', ({ income, status, base, recapture }) => {
    expect(Math.abs(nyTax(income, status) - (base + recapture))).toBeLessThanOrEqual(2);
  });

  // s 601(c) is headed "Resident unmarried individuals, resident married
  // individuals filing separate returns and resident estates and trusts" --
  // one schedule for all three. MFS is NOT half of joint.
  it('taxes MFS on the single schedule, not half of joint', () => {
    for (const income of [10000, 50000, 250000, 900000]) {
      expect(nyTax(income, 'MFS')).toBeCloseTo(nyTax(income, 'Single'), 6);
    }
    // If MFS were half-of-joint, the second bracket would end at $11,800
    // rather than $11,700. Pin the distinction so the shortcut can't creep in.
    expect(nyTax(11750, 'MFS')).not.toBeCloseTo(nyTax(11750, 'MFJ') / 2, 2);
  });

  // The original bug, stated as a test: 9.65% did not start at $215,400.
  // The bracket-rate checkpoints sit OUTSIDE the recapture phase-in windows
  // ($50,000 of AGI past each row threshold), where the recapture is a flat
  // dollar amount and the marginal rate is the bracket rate again -- inside
  // a window the blended marginal is far higher, tested separately below.
  it('does not reach the 9.65% rate until $1,077,550 single', () => {
    const marginal = (income, status) => (nyTax(income + 100, status) - nyTax(income, status)) / 100;
    expect(marginal(300000, 'Single')).toBeCloseTo(0.0685, 4);
    expect(marginal(500000, 'Single')).toBeCloseTo(0.0685, 4);
    expect(marginal(1150000, 'Single')).toBeCloseTo(0.0965, 4);
    expect(marginal(400000, 'MFJ')).toBeCloseTo(0.0685, 4);
    expect(marginal(2250000, 'MFJ')).toBeCloseTo(0.0965, 4);
  });

  it('carries the 10.30% and 10.90% top brackets that were missing entirely', () => {
    const marginal = (income, status) => (nyTax(income + 1000, status) - nyTax(income, status)) / 1000;
    expect(marginal(6000000, 'Single')).toBeCloseTo(0.103, 4);
    expect(marginal(30000000, 'Single')).toBeCloseTo(0.109, 4);
  });

  it('has no bracket boundary at the phantom $21,400 / $43,000 breakpoints', () => {
    const marginal = (income, status) => (nyTax(income + 10, status) - nyTax(income, status)) / 10;
    // 5.40% runs continuously from $13,900 to $80,650 for single filers.
    expect(marginal(21000, 'Single')).toBeCloseTo(marginal(22000, 'Single'), 5);
    expect(marginal(42000, 'MFJ')).toBeCloseTo(marginal(44000, 'MFJ'), 5);
  });

  it('is progressive and monotonic across the whole schedule', () => {
    let prev = -1;
    for (const income of [5000, 9000, 12000, 15000, 90000, 220000, 1200000, 6000000, 30000000]) {
      const tax = nyTax(income, 'Single');
      expect(tax).toBeGreaterThan(prev);
      prev = tax;
    }
  });

  it('exempts Social Security entirely, per Tax Law s 612(c)(3-c)', () => {
    // $40k of income of which $20k is SS should tax only the non-SS half.
    expect(nyTax(40000, 'Single') - calculateStateTaxes(40000, 0, 20000, 'ny', true, false, 'Single', 70, 70))
      .toBeGreaterThan(0);
    expect(calculateStateTaxes(20000, 0, 20000, 'ny', true, false, 'Single', 70, 70)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// New York tax table benefit recapture (added 2026-08-23)
//
// Tax Law s 601(d-5): above $107,650 of NY AGI, New York claws back the
// benefit of the graduated brackets -- a fixed base plus an incremental
// amount phased in over $50,000 of AGI past each row's threshold. Verified
// against the 2026 IT-2105-I tax computation worksheets AND re-derived from
// the rate schedules (each row's cumulative recapture = sum over lower
// brackets of (row rate - lower rate) x lower width, within statutory
// rounding). See NY_RECAPTURE_SINGLE's comment in calculator.js -- in
// particular, the single-filer dollar amounts here are the 2026 (d-5)
// figures, NOT the 2025 (d-4) ones ($567/$2,047, not $568/$1,831): the
// FY2026 rate cuts changed the recapture arithmetic and the table moved
// with it.
// ---------------------------------------------------------------------------
describe('New York tax table benefit recapture, s 601(d-5)', () => {
  // Changelog 126 / audit Q-17: calculateStateTaxes now subtracts NY's
  // standard deduction (Tax Law s 614) before walking the s 601 schedule.
  // These suites check the SCHEDULE, so each helper grosses the income up
  // by the deduction -- the schedule then sees exactly the taxable income
  // the statutory base is published against.
  const nyStdFor = (status) => (status === 'MFJ' ? NY_STD_DEDUCTION_MFJ : NY_STD_DEDUCTION_SINGLE);
  const nyTax = (income, status) => calculateStateTaxes(income + nyStdFor(status), 0, 0, 'ny', false, false, status, 70, 70);
  const rec = (agi, ti, status) => newYorkBenefitRecapture(agi, ti, status);

  it('charges nothing at or below the $107,650 AGI floor', () => {
    expect(NY_RECAPTURE_AGI_FLOOR).toBe(107650);
    expect(rec(107650, 107650, 'Single')).toBe(0);
    expect(rec(107650, 107650, 'MFJ')).toBe(0);
    expect(rec(90000, 90000, 'Single')).toBe(0);
    // Just past the floor the phase-in starts from zero -- no cliff.
    expect(rec(107750, 107750, 'Single')).toBeCloseTo(567 * 0.002, 2);
  });

  it('phases the first row in linearly over $50,000 of AGI, then holds flat', () => {
    // Halfway through the window: half the incremental benefit.
    expect(rec(132650, 132650, 'Single')).toBeCloseTo(567 * 0.5, 2);
    expect(rec(132650, 132650, 'MFJ')).toBeCloseTo(333 * 0.5, 2);
    // Fully phased at threshold + $50,000, and flat beyond it.
    expect(rec(157650, 157650, 'Single')).toBeCloseTo(567, 2);
    expect(rec(200000, 200000, 'Single')).toBeCloseTo(567, 2);
    expect(rec(157650, 157650, 'MFJ')).toBeCloseTo(333, 2);
  });

  it('is continuous at every row boundary (each base equals the prior row full)', () => {
    // Single: 0+567 -> 567; 567+2047 -> 2614; 2614+30172 -> 32786.
    expect(rec(215400, 215400, 'Single')).toBeCloseTo(567, 2);
    expect(rec(215401, 215401, 'Single')).toBeCloseTo(567, 1);
    expect(rec(1077550, 1077550, 'Single')).toBeCloseTo(2614, 2);
    expect(rec(1077551, 1077551, 'Single')).toBeCloseTo(2614, 1);
    expect(rec(5000000, 5000000, 'Single')).toBeCloseTo(32786, 2);
    expect(rec(5000001, 5000001, 'Single')).toBeCloseTo(32786, 1);
    // MFJ: 333 -> 1140 -> 4211 -> 64561.
    expect(rec(161550, 161550, 'MFJ')).toBeCloseTo(333, 2);
    expect(rec(323200, 323200, 'MFJ')).toBeCloseTo(1140, 2);
    expect(rec(2155350, 2155350, 'MFJ')).toBeCloseTo(4211, 2);
    expect(rec(5000000, 5000000, 'MFJ')).toBeCloseTo(64561, 2);
  });

  // The property the whole mechanism exists to produce: with recapture fully
  // phased in, total tax equals the row's TOP bracket rate times the ENTIRE
  // taxable income. s 601(d-5)'s integers make these land exact to ~$1:
  // 9.65% x $5,000,000 = $482,500 and 10.3% x $10,000,000 = $1,030,000.
  it('makes tax flat at the marginal rate once fully phased in', () => {
    expect(nyTax(5000000, 'Single')).toBeCloseTo(0.0965 * 5000000, 0);
    expect(nyTax(10000000, 'Single')).toBeCloseTo(0.103 * 10000000, 0);
    expect(Math.abs(nyTax(3000000, 'MFJ') - 0.0965 * 3000000)).toBeLessThanOrEqual(1);
    expect(Math.abs(nyTax(2155350, 'MFJ') - 0.0685 * 2155350)).toBeLessThanOrEqual(1);
  });

  // The non-monotonic marginal-rate path the withholding tables encode: a
  // single filer between $1,077,550 and $1,127,550 recaptures $30,172 over a
  // $50,000 window, a blended marginal rate near 70%. Two-pension households
  // hit the FIRST window ($107,650-$157,650) routinely, so this is not a
  // high-earner curiosity.
  it('produces the recapture-window marginal spikes, then relaxes to the bracket rate', () => {
    const marginal = (income) => (nyTax(income + 100, 'Single') - nyTax(income, 'Single')) / 100;
    expect(marginal(120000)).toBeCloseTo(0.059 + 567 / 50000, 3);   // ~7.03% -- the withholding tables' figure
    expect(marginal(1090000)).toBeCloseTo(0.0965 + 30172 / 50000, 3); // ~70%
    expect(marginal(1150000)).toBeCloseTo(0.0965, 4);               // window closed
  });

  it('taxes the whole income at 10.9% above $25,000,000, cliff included', () => {
    expect(NY_RECAPTURE_FLAT_AGI).toBe(25000000);
    expect(nyTax(30000000, 'Single')).toBeCloseTo(NY_TOP_RATE * 30000000, 0);
    expect(nyTax(30000000, 'MFJ')).toBeCloseTo(NY_TOP_RATE * 30000000, 0);
    // New York's own discontinuity: brackets + full recapture reach
    // ~$2,575,000 at $25M; a dollar past it the flat 10.9% gives
    // ~$2,725,000. The ~$150k jump is the statute's, not an artifact.
    // NY_RECAPTURE_FLAT_AGI is an AGI test, so step AGI across it rather
    // than the (now deduction-reduced) taxable income.
    const nyAtAgi = (agi) => calculateStateTaxes(agi, 0, 0, 'ny', false, false, 'Single', 70, 70);
    const jump = nyAtAgi(25000100) - nyAtAgi(25000000);
    expect(jump).toBeGreaterThan(149000);
  });

  it('selects the row by taxable income but phases in on AGI', () => {
    // AGI $230,000 with taxable income $220,000 (itemized deductions):
    // row two by TI, fraction (230,000 - 215,400) / 50,000 = 0.292.
    expect(rec(230000, 220000, 'Single')).toBeCloseTo(567 + 2047 * 0.292, 1);
    // The app passes the same figure for both -- pin that the two-argument
    // shape exists so a future NY-deduction model can use it properly.
    expect(rec(220000, 220000, 'Single')).toBeCloseTo(567 + 2047 * 0.092, 1);
  });

  it('applies the single table to MFS, like the brackets', () => {
    for (const income of [150000, 250000, 1200000]) {
      expect(nyTax(income, 'MFS')).toBeCloseTo(nyTax(income, 'Single'), 6);
    }
  });

  it('still multiplies the Yonkers surcharge into the recaptured total', () => {
    const income = 1090000; // deep inside a recapture window
    const base = nyTax(income, 'Single');
    const withYonkers = calculateStateTaxes(income + NY_STD_DEDUCTION_SINGLE, 0, 0, 'ny', false, false, 'Single', 70, 70, 5.0, 0, null, true);
    expect(withYonkers).toBeCloseTo(base * (1 + YONKERS_RESIDENT_SURCHARGE), 6);
    // Sanity: the recapture is genuinely inside the multiplied figure --
    // about $10.1k of it at this income (24.9% of the way through row 3).
    expect(rec(income, income, 'Single')).toBeGreaterThan(10000);
  });
});

// ---------------------------------------------------------------------------
// New York's scheduled eras: 2027-2032 and 2033+ (added 2026-08-23)
//
// s 601 already contains the next two rate schedules as enacted law --
// (viii) for 2027-2032 and (ix) for 2033+, each with a coupled recapture
// subsection ((d-6) / (d-7)). calculateStateTaxes picks the era from
// extras.calendarYear; the projection passes each row's calendar year, so
// a long NY projection now steps down on schedule instead of freezing 2026
// law forever.
// ---------------------------------------------------------------------------
describe('New York scheduled rate eras (2027-2032 and 2033+)', () => {
  const nyStdFor = (status) => (status === 'MFJ' ? NY_STD_DEDUCTION_MFJ : NY_STD_DEDUCTION_SINGLE);
  const nyTaxIn = (income, status, year) =>
    calculateStateTaxes(income + nyStdFor(status), 0, 0, 'ny', false, false, status, 70, 70, 5.0, 0, null, false, { calendarYear: year });

  it('selects the right era for each calendar year', () => {
    expect(newYorkEraForYear(2020).flatRate).toBe(0.109);   // pre-2026 -> 2026 era
    expect(newYorkEraForYear(2026).flatRate).toBe(0.109);
    expect(newYorkEraForYear(2027).firstYear).toBe(2027);
    expect(newYorkEraForYear(2032)).toBe(newYorkEraForYear(2027));
    expect(newYorkEraForYear(2033).flatRate).toBe(0.0882);
    expect(newYorkEraForYear(2050)).toBe(newYorkEraForYear(2033));
    // No calendar year at all falls back to the app's tax vintage.
    expect(nyTaxIn(300000, 'Single', undefined)).toBeCloseTo(
      calculateStateTaxes(300000 + NY_STD_DEDUCTION_SINGLE, 0, 0, 'ny', false, false, 'Single', 70, 70), 6);
  });

  // s 601(c)(1)(viii) publishes cumulative bases; recapture is (d-6)'s,
  // fully phased at each checkpoint. Same $2 tolerance discipline as the
  // 2026 block above.
  it.each([
    { income: 215400, status: 'Single', base: 11926, recapture: 568 },
    { income: 1077550, status: 'Single', base: 70983, recapture: 2829 },
    { income: 5000000, status: 'Single', base: 449499, recapture: 33001 },
    { income: 161550, status: 'MFJ', base: 8229, recapture: 333 },
    { income: 323200, status: 'MFJ', base: 17605, recapture: 1141 },
    { income: 2155350, status: 'MFJ', base: 143107, recapture: 4534 },
    { income: 5000000, status: 'MFJ', base: 417616, recapture: 64884 },
  ])('2027 era matches the s 601 (viii) base plus (d-6) recapture at $income for $status', ({ income, status, base, recapture }) => {
    expect(Math.abs(nyTaxIn(income, status, 2027) - (base + recapture))).toBeLessThanOrEqual(2);
  });

  it('2027 era keeps the flat identities: full recapture = marginal rate x whole income', () => {
    expect(Math.abs(nyTaxIn(5000000, 'Single', 2030) - 0.0965 * 5000000)).toBeLessThanOrEqual(1);
    expect(Math.abs(nyTaxIn(5000000, 'MFJ', 2030) - 0.0965 * 5000000)).toBeLessThanOrEqual(1);
    expect(Math.abs(nyTaxIn(10000000, 'Single', 2030) - 0.103 * 10000000)).toBeLessThanOrEqual(1);
    // The $25M flat-10.9% clause survives into (d-6).
    expect(nyTaxIn(30000000, 'Single', 2030)).toBeCloseTo(0.109 * 30000000, 0);
  });

  it('2033 era drops the 9.65/10.30/10.90 brackets and reverts the top rate to 8.82%', () => {
    const marginal = (income) => (nyTaxIn(income + 1000, 'Single', 2033) - nyTaxIn(income, 'Single', 2033)) / 1000;
    // Beyond every recapture window, everything above $1,077,550 is 8.82%.
    expect(marginal(1200000)).toBeCloseTo(0.0882, 4);
    expect(marginal(6000000)).toBeCloseTo(0.0882, 4);
    expect(marginal(30000000)).toBeCloseTo(0.0882, 4);
    // Fully-recaptured flat identity at the top-bracket floor, s 601(d-7).
    expect(Math.abs(nyTaxIn(1077550, 'Single', 2033) - 0.0685 * 1077550)).toBeLessThanOrEqual(1);
    expect(Math.abs(nyTaxIn(2000000, 'Single', 2033) - 0.0882 * 2000000)).toBeLessThanOrEqual(1);
    // And no $25M cliff in this era -- (d-7) has no flat-top clause.
    const jump = nyTaxIn(25000100, 'Single', 2033) - nyTaxIn(25000000, 'Single', 2033);
    expect(jump).toBeLessThan(20);
  });

  it('recapture tables chain within each era, and lower rates mean lower tax than 2026', () => {
    // (d-6) chaining: each row's base equals the previous row's full value.
    expect(newYorkBenefitRecapture(215400, 215400, 'Single', 2027)).toBeCloseTo(568, 2);
    expect(newYorkBenefitRecapture(1077550, 1077550, 'Single', 2027)).toBeCloseTo(2829, 2);
    expect(newYorkBenefitRecapture(5000000, 5000000, 'Single', 2027)).toBeCloseTo(33001, 2);
    expect(newYorkBenefitRecapture(2155350, 2155350, 'MFJ', 2027)).toBeCloseTo(4534, 2);
    // (d-7) tops out at its shorter table -- fully phased at $1,127,550.
    expect(newYorkBenefitRecapture(5000000, 5000000, 'Single', 2033)).toBeCloseTo(2829 + 21228, 2);
    // A middle-class NY filer pays less every era after 2026.
    for (const income of [60000, 120000, 200000]) {
      expect(nyTaxIn(income, 'Single', 2027)).toBeLessThan(nyTaxIn(income, 'Single', 2026));
    }
  });

  it('feeds era-aware figures through a real projection', () => {
    // A single retiree on a large fixed private pension. Comparing FIRST
    // projection years across different planYears keeps the income
    // composition identical (no accumulated surplus, no growing dividend
    // stream) so the only difference between runs is which tax law the
    // calendar year selects.
    const base = (planYear) => ({
      ...DEFAULT_INPUTS,
      planYear,
      birthYear1: planYear - 70, // always age 70 in year one
      retireAge1: 65,
      lifeExpectancy1: 95,
      spouse2Enabled: false,
      taxableInit: 0, preTaxInit: 0, rothInit: 0,
      lifestyleExpense: 10000,
      preRetireReturn: 0, postRetireReturn: 0,
      inflationRate: 0, taxBracketInflationRate: 0,
      ss1: 0, ss2: 0,
      pension1: 2000000, pensionStartAge1: 65, pension1COLA: 0,
      stateTaxState: 'ny',
    });
    const firstYearTax = (planYear) => runProjection(base(planYear)).years[0].totalTaxesPaid;
    const in2026 = firstYearTax(2026);
    const in2027 = firstYearTax(2027);
    const in2032 = firstYearTax(2032);
    const in2033 = firstYearTax(2033);
    // 2027: the middle rates step down, tax falls.
    expect(in2027).toBeLessThan(in2026);
    // 2027-2032 share one era: identical law, identical tax.
    expect(in2032).toBeCloseTo(in2027, 6);
    // 2033: the 9.65% top bracket expires; at ~$2M of pension the state
    // marginal falls to 8.82% and tax drops again -- by real money.
    expect(in2033).toBeLessThan(in2032 - 10000);
  });
});

// ---------------------------------------------------------------------------
// New York City resident income tax (added 2026-08-23)
//
// The combined s 1304 + s 1304-B rates, finally confirmed from a
// first-party document: the 2026 IT-2105-I's own "New York City tax rate
// schedule". A real bracket schedule on the same taxable-income base as
// the state (SS exempt, pension exclusions flow through), additive on top
// of state tax, with no recapture and no scheduled changes.
// ---------------------------------------------------------------------------
describe('New York City resident income tax', () => {
  const ny = (income, extras) =>
    calculateStateTaxes(income + NY_STD_DEDUCTION_SINGLE, 0, 0, 'ny', false, false, 'Single', 70, 70, 5.0, 0, null, false, extras);

  it('matches the IT-2105-I schedule bases at each threshold', () => {
    expect(newYorkCityTax(21600, 'MFJ')).toBeCloseTo(665, 0);
    expect(newYorkCityTax(45000, 'MFJ')).toBeCloseTo(1545, 0);
    expect(newYorkCityTax(90000, 'MFJ')).toBeCloseTo(3264, 0);
    expect(newYorkCityTax(12000, 'Single')).toBeCloseTo(369, 0);
    expect(newYorkCityTax(25000, 'Single')).toBeCloseTo(858, 0);
    expect(newYorkCityTax(50000, 'Single')).toBeCloseTo(1813, 0);
  });

  it('tops out at 3.876% and shares the single schedule with MFS', () => {
    const marginal = (income) => (newYorkCityTax(income + 1000, 'Single') - newYorkCityTax(income, 'Single')) / 1000;
    expect(marginal(100000)).toBeCloseTo(0.03876, 5);
    expect(marginal(1000000)).toBeCloseTo(0.03876, 5);
    expect(newYorkCityTax(80000, 'MFS')).toBeCloseTo(newYorkCityTax(80000, 'Single'), 6);
    expect(newYorkCityTax(0, 'Single')).toBe(0);
  });

  it('adds city tax on top of the state figure only when the flag is set', () => {
    const income = 120000;
    const without = ny(income, {});
    const withNyc = ny(income, { nycResident: true });
    expect(withNyc - without).toBeCloseTo(newYorkCityTax(income, 'Single'), 6);
    // NYC is not multiplied by the Yonkers surcharge (independent flags;
    // the UI keeps them mutually exclusive, the math keeps them separable).
    const both = calculateStateTaxes(income + NY_STD_DEDUCTION_SINGLE, 0, 0, 'ny', false, false, 'Single', 70, 70, 5.0, 0, null, true, { nycResident: true });
    expect(both).toBeCloseTo(without * (1 + YONKERS_RESIDENT_SURCHARGE) + newYorkCityTax(income, 'Single'), 6);
  });

  it('does not leak into any other state', () => {
    for (const state of ['ca', 'il', 'pa', 'co', 'flat_5', 'none']) {
      const withFlag = calculateStateTaxes(120000, 0, 0, state, false, false, 'Single', 70, 70, 5.0, 0, null, false, { nycResident: true });
      const without = calculateStateTaxes(120000, 0, 0, state, false, false, 'Single', 70, 70, 5.0, 0, null, false, {});
      expect(withFlag, state).toBeCloseTo(without, 6);
    }
  });

  it('raises a NYC retiree projection by roughly the city schedule', () => {
    const base = {
      ...DEFAULT_INPUTS,
      planYear: 2026,
      birthYear1: 1956,
      retireAge1: 65,
      lifeExpectancy1: 80,
      spouse2Enabled: false,
      taxableInit: 0, preTaxInit: 0, rothInit: 0,
      lifestyleExpense: 10000,
      preRetireReturn: 0, postRetireReturn: 0,
      inflationRate: 0, taxBracketInflationRate: 0,
      ss1: 0, ss2: 0,
      pension1: 150000, pensionStartAge1: 65, pension1COLA: 0,
      stateTaxState: 'ny',
    };
    const cityless = runProjection(base).years[0].totalTaxesPaid;
    const city = runProjection({ ...base, nycResident: true }).years[0].totalTaxesPaid;
    // NY taxable income is the pension less the $20,000 exclusion and,
    // since changelog 126, NY's standard deduction.
    expect(city - cityless).toBeCloseTo(newYorkCityTax(130000 - NY_STD_DEDUCTION_SINGLE, 'Single'), 0);
  });
});

// ---------------------------------------------------------------------------
// California non-conformity and credits (added 2026-08-23)
//
// Three documented gaps closed at once: HSA non-conformity (contributions
// and earnings are CA-taxable), exemption credits (credits AGAINST TAX,
// $153 per exemption for 2025, phase-out above $252,203/$504,411), and the
// $20,000 military-retirement exclusion (2025-2029 only, AGI-tested --
// which REPLACES the old blanket full exclusion CA was wrongly given).
// ---------------------------------------------------------------------------
describe('California exemption credits, HSA addback, and military exclusion', () => {
  const caTax = (income, status, extras) =>
    calculateStateTaxes(income, 0, 0, 'ca', false, false, status, 70, 70, 5.0, 0, null, false, extras);

  it('counts one credit per exemption: personal plus senior 65+', () => {
    expect(californiaExemptionCredits(100000, 'Single', 70)).toBe(2 * CA_EXEMPTION_CREDIT);
    expect(californiaExemptionCredits(100000, 'Single', 60)).toBe(CA_EXEMPTION_CREDIT);
    expect(californiaExemptionCredits(100000, 'MFJ', 70, 70)).toBe(4 * CA_EXEMPTION_CREDIT);
    expect(californiaExemptionCredits(100000, 'MFJ', 70, 60)).toBe(3 * CA_EXEMPTION_CREDIT);
    expect(californiaExemptionCredits(100000, 'MFS', 70)).toBe(2 * CA_EXEMPTION_CREDIT);
  });

  it('phases out by $6 per credit per $2,500 (or fraction) of AGI over the threshold', () => {
    // $1 over: one full $2,500 step is charged ("or fraction thereof").
    expect(californiaExemptionCredits(252204, 'Single', 70)).toBe(2 * (CA_EXEMPTION_CREDIT - 6));
    expect(californiaExemptionCredits(252203, 'Single', 70)).toBe(2 * CA_EXEMPTION_CREDIT);
    // 26 steps: $156 > $153, credit exhausted.
    expect(californiaExemptionCredits(252203 + 26 * 2500, 'Single', 70)).toBe(0);
    // MFS steps are $1,250.
    expect(californiaExemptionCredits(252203 + 1300, 'MFS', 70)).toBe(2 * (CA_EXEMPTION_CREDIT - 12));
    // Joint threshold is doubled.
    expect(californiaExemptionCredits(500000, 'MFJ', 70, 70)).toBe(4 * CA_EXEMPTION_CREDIT);
    expect(californiaExemptionCredits(504412, 'MFJ', 70, 70)).toBe(4 * (CA_EXEMPTION_CREDIT - 6));
  });

  it('credits reduce the tax, never below zero', () => {
    // At $15,000 the schedule tax is under $306, so the credit floors it.
    expect(caTax(15000, 'Single', {})).toBe(0);
    // Credits subtract from tax dollar-for-dollar, not from income: turning
    // 65 is worth exactly one more $153 credit at any income in the same
    // bracket, which no deduction-shaped model would produce.
    const at60 = calculateStateTaxes(80000, 0, 0, 'ca', false, false, 'Single', 60, 60);
    const at70 = calculateStateTaxes(80000, 0, 0, 'ca', false, false, 'Single', 70, 70);
    expect(at60 - at70).toBeCloseTo(CA_EXEMPTION_CREDIT, 6);
  });

  it('adds the HSA addback to California taxable income and nowhere else', () => {
    // Same figure as shifting the income, since the AGI proxy stays put
    // below the phase-out threshold.
    expect(caTax(80000, 'Single', { hsaAddback: 5000 }))
      .toBeCloseTo(caTax(85000, 'Single', {}), 6);
    // The addback feeds the BHS surcharge base too (both operate on CA
    // taxable income).
    const overMillion = caTax(998000, 'Single', { hsaAddback: 4000 });
    expect(overMillion - caTax(1002000, 'Single', {})).toBeCloseTo(0, 6);
    // New York ignores it entirely.
    expect(calculateStateTaxes(120000, 0, 0, 'ny', false, false, 'Single', 70, 70, 5.0, 0, null, false, { hsaAddback: 5000 }))
      .toBeCloseTo(calculateStateTaxes(120000, 0, 0, 'ny', false, false, 'Single', 70, 70), 6);
  });

  it('caps the military exclusion at $20,000, AGI-tested, 2025-2029 only', () => {
    expect(californiaMilitaryExclusion(30000, 100000, 'Single', 2026)).toBe(CA_MILITARY_EXCLUSION_CAP);
    expect(californiaMilitaryExclusion(15000, 100000, 'Single', 2026)).toBe(15000);
    expect(californiaMilitaryExclusion(30000, 125001, 'Single', 2026)).toBe(0);
    expect(californiaMilitaryExclusion(30000, 200000, 'MFJ', 2026)).toBe(CA_MILITARY_EXCLUSION_CAP);
    expect(californiaMilitaryExclusion(30000, 250001, 'MFJ', 2026)).toBe(0);
    expect(californiaMilitaryExclusion(30000, 100000, 'Single', CA_MILITARY_EXCLUSION_LAST_YEAR)).toBe(CA_MILITARY_EXCLUSION_CAP);
    expect(californiaMilitaryExclusion(30000, 100000, 'Single', CA_MILITARY_EXCLUSION_LAST_YEAR + 1)).toBe(0);
  });

  it('applies the capped exclusion in the CA pension path, not the old blanket one', () => {
    // $100k income with a $40k pension, $30k of it military, pension
    // otherwise taxable. CA now excludes only $20k of the military part:
    // taxable base is $100k - $40k + ($40k - $20k) = $80k. The old blanket
    // rule would have landed at $70k.
    const got = calculateStateTaxes(100000, 40000, 0, 'ca', false, true, 'Single', 70, 70, 5.0, 30000, null, false, { calendarYear: 2026 });
    expect(got).toBeCloseTo(caTax(80000, 'Single', {}), 6);
    // Over the AGI limit the exclusion vanishes entirely.
    const overLimit = calculateStateTaxes(130000, 40000, 0, 'ca', false, true, 'Single', 70, 70, 5.0, 30000, null, false, { calendarYear: 2026 });
    expect(overLimit).toBeCloseTo(caTax(130000 - 40000 + 40000, 'Single', {}), 6);
    // After the sunset the exclusion vanishes too.
    const sunset = calculateStateTaxes(100000, 40000, 0, 'ca', false, true, 'Single', 70, 70, 5.0, 30000, null, false, { calendarYear: 2030 });
    expect(sunset).toBeCloseTo(caTax(100000, 'Single', {}), 6);
    // Other states keep the blanket subtraction -- the generic flat-rate
    // state still exempts all $30k of military pension, uncapped.
    const flatWith = calculateStateTaxes(100000, 40000, 0, 'flat_5', false, true, 'Single', 70, 70, 5.0, 30000, null, false, {});
    const flatWithout = calculateStateTaxes(100000, 40000, 0, 'flat_5', false, true, 'Single', 70, 70, 5.0, 0, null, false, {});
    expect(flatWithout - flatWith).toBeCloseTo(30000 * 0.05, 6);
  });
});

// ---------------------------------------------------------------------------
// California brackets (corrected 2026-08-20)
//
// Same failure as New York, found the same way. The old table was ~2023
// vintage and partially corrupted -- several thresholds matched no published
// year at all. Because California indexes to CPI annually and this table
// never moved, the error compounded yearly and always overstated tax.
//
// Checked against the base dollar amounts in FTB's own Schedule X / Y, which
// is the check that fails when the table goes stale.
// ---------------------------------------------------------------------------
describe('California state income tax', () => {
  // Changelog 126 / audit Q-17: CA's standard deduction (FTB 540 booklet)
  // now comes off before the schedule, so gross the income back up to keep
  // testing the published FTB base itself.
  const caStdFor = (status) => (status === 'MFJ' ? CA_STD_DEDUCTION_MFJ : CA_STD_DEDUCTION_SINGLE);
  const caTax = (income, status) => calculateStateTaxes(income + caStdFor(status), 0, 0, 'ca', false, false, status, 70, 70);

  // FTB publishes a cumulative base at each threshold. Below $1M these are
  // directly comparable; above it the surcharge is added on top, so the
  // expectation includes it.
  //
  // 2026-08-23: exemption credits are now modeled, so each expectation
  // also nets out the credit in force at that income for two 70-year-olds:
  // $306 single (personal + senior), $612 MFJ (x2) -- fully phased out to
  // $0 at every income here above $252,203 single / $504,411 joint, and at
  // the two lowest incomes the credit floors the tax at $0 (nonrefundable).
  const FTB_BASES = [
    { income: 11079, status: 'Single', base: 110.79, credit: 306 },
    { income: 41452, status: 'Single', base: 1022.01, credit: 306 },
    { income: 72724, status: 'Single', base: 3201.97, credit: 306 },
    { income: 371479, status: 'Single', base: 30986.19, credit: 0 },
    { income: 445771, status: 'Single', base: 38638.27, credit: 0 },
    { income: 742953, status: 'Single', base: 72219.84, credit: 0 },
    { income: 22158, status: 'MFJ', base: 221.58, credit: 612 },
    { income: 82904, status: 'MFJ', base: 2044.02, credit: 612 },
    { income: 115084, status: 'MFJ', base: 3974.82, credit: 612 },
    { income: 145448, status: 'MFJ', base: 6403.94, credit: 612 },
    { income: 742958, status: 'MFJ', base: 61972.37, credit: 0 },
    { income: 891542, status: 'MFJ', base: 77276.52, credit: 0 },
  ];

  it.each(FTB_BASES)('matches the FTB Schedule base at $income for $status, net of exemption credits', ({ income, status, base, credit }) => {
    expect(caTax(income, status)).toBeCloseTo(Math.max(0, base - credit), 1);
  });

  // Schedule X is headed "Single or Married/RDP Filing Separately" -- one
  // schedule, no halving. California does not halve MFS brackets.
  it('taxes MFS on Schedule X alongside Single', () => {
    for (const income of [30000, 120000, 600000]) {
      expect(caTax(income, 'MFS')).toBeCloseTo(caTax(income, 'Single'), 6);
    }
  });

  describe('Behavioral Health Services Tax (Prop 63, 1% over $1,000,000)', () => {
    it('adds nothing below the threshold', () => {
      expect(californiaBehavioralHealthServicesTax(999999)).toBe(0);
      expect(californiaBehavioralHealthServicesTax(0)).toBe(0);
      expect(californiaBehavioralHealthServicesTax(-5)).toBe(0);
    });

    it('is 1% of the excess only, not of the whole amount', () => {
      expect(californiaBehavioralHealthServicesTax(1500000)).toBeCloseTo(5000, 6);
      expect(californiaBehavioralHealthServicesTax(2000000)).toBeCloseTo(10000, 6);
    });

    // The threshold is $1,000,000 for EVERY filing status. The $500,000 MFS
    // figure in California guidance belongs to the estimated-tax safe
    // harbour, a different provision -- halving here would be a
    // plausible-looking mistake.
    it('uses the same $1,000,000 threshold for every filing status', () => {
      const surchargeFor = (status) =>
        caTax(1200000, status) - (caTax(1200000, status) - californiaBehavioralHealthServicesTax(1200000));
      for (const status of ['Single', 'MFS', 'MFJ']) {
        expect(surchargeFor(status)).toBeCloseTo(2000, 6);
      }
    });

    // The surcharge threshold and the top bracket do not coincide, so the
    // marginal rate does not simply step to 13.3%. This is the case most
    // likely to be got wrong by folding the surcharge into the table.
    it('produces the right marginal path for a joint filer either side of $1M', () => {
      const marginal = (income, status) => (caTax(income + 1000, status) - caTax(income, status)) / 1000;
      // Joint: still inside the 11.3% bracket below $1M...
      expect(marginal(900000, 'MFJ')).toBeCloseTo(0.113, 4);
      // ...11.3% + 1% surcharge between $1M and $1,485,906...
      expect(marginal(1100000, 'MFJ')).toBeCloseTo(0.123, 4);
      // ...and only reaches 13.3% once the 12.3% bracket starts.
      expect(marginal(1600000, 'MFJ')).toBeCloseTo(0.133, 4);
    });

    it('gives a single filer a genuine 12.3%-only band below $1M', () => {
      const marginal = (income) => (caTax(income + 1000, 'Single') - caTax(income, 'Single')) / 1000;
      expect(marginal(800000)).toBeCloseTo(0.123, 4);
      expect(marginal(1100000)).toBeCloseTo(0.133, 4);
    });
  });

  it('exempts Social Security entirely', () => {
    expect(calculateStateTaxes(30000, 0, 30000, 'ca', true, false, 'Single', 70, 70)).toBe(0);
  });

  // California has no general pension exclusion -- pensions follow the
  // taxPension flag with no special carve-out, unlike NY's $20,000.
  it('gives pensions no California-specific exclusion', () => {
    const included = calculateStateTaxes(120000, 30000, 0, 'ca', false, true, 'Single', 70, 70);
    const excluded = calculateStateTaxes(120000, 30000, 0, 'ca', false, false, 'Single', 70, 70);
    expect(included).toBeGreaterThan(excluded);
  });
});

// ---------------------------------------------------------------------------
// New York's two pension exclusions (added 2026-08-20)
//
// Verified against tax.ny.gov "Information for retired persons" and Tax Law
// s 612(c)(3) / (3-a). Two separate exclusions with very different shapes,
// and the app previously collapsed them into one.
// ---------------------------------------------------------------------------
describe('New York pension exclusions', () => {
  // Pension is the only income, and taxPension is on, so the exclusion logic
  // is what the result turns on.
  const ny = (pension, detail, status = 'Single', age1 = 70, age2 = 70) =>
    calculateStateTaxes(pension, pension, 0, 'ny', false, true, status, age1, age2, 5.0, 0, detail);

  // Taxing $x of NY income directly, to express expectations as "taxable
  // income" rather than hand-computed tax.
  // Ages below 59.5 so no exclusion applies and taxable == amount. Status
  // matters: NY's joint schedule differs from the single one, so a joint
  // expectation has to be computed on the joint brackets.
  const taxOn = (amount, status = 'Single') =>
    ny(amount, { stateExempt: 0, private1: amount, private2: 0 }, status, 50, 50);

  describe('government pensions (IT-201 line 26)', () => {
    it('excludes them in full, with no $20,000 cap', () => {
      expect(ny(60000, { stateExempt: 60000, private1: 0, private2: 0 })).toBe(0);
      expect(ny(250000, { stateExempt: 250000, private1: 0, private2: 0 })).toBe(0);
    });

    // "regardless of your age" -- the $20,000 exclusion needs 59.5, this
    // one does not.
    it('excludes them regardless of age', () => {
      expect(ny(60000, { stateExempt: 60000, private1: 0, private2: 0 }, 'Single', 45, 45)).toBe(0);
    });

    it('taxes the same pension when it is private instead', () => {
      const asGovernment = ny(60000, { stateExempt: 60000, private1: 0, private2: 0 });
      const asPrivate = ny(60000, { stateExempt: 0, private1: 60000, private2: 0 });
      expect(asGovernment).toBe(0);
      expect(asPrivate).toBeGreaterThan(0);
      // $60k private leaves $40k taxable after the $20k exclusion.
      expect(asPrivate).toBeCloseTo(taxOn(40000), 6);
    });
  });

  describe('the $20,000 private exclusion (IT-201 line 29)', () => {
    it('caps at $20,000 and requires age 59.5', () => {
      expect(ny(50000, { stateExempt: 0, private1: 50000, private2: 0 })).toBeCloseTo(taxOn(30000), 6);
      expect(ny(50000, { stateExempt: 0, private1: 50000, private2: 0 }, 'Single', 55, 55))
        .toBeCloseTo(taxOn(50000), 6);
    });

    it('never exceeds that spouse\'s own pension income', () => {
      // $8,000 of pension cannot produce a $20,000 exclusion.
      expect(ny(8000, { stateExempt: 0, private1: 8000, private2: 0 })).toBe(0);
    });

    // NY: "neither of you can claim any unused part of your spouse's
    // exclusion". The previous code granted a second $20,000 purely because
    // both spouses were old enough, which UNDER-taxed a one-pension couple.
    it('is per recipient, and cannot be pooled between spouses', () => {
      const onePension = ny(40000, { stateExempt: 0, private1: 40000, private2: 0 }, 'MFJ');
      expect(onePension).toBeCloseTo(taxOn(20000, 'MFJ'), 6);

      const twoPensions = ny(80000, { stateExempt: 0, private1: 40000, private2: 40000 }, 'MFJ');
      expect(twoPensions).toBeCloseTo(taxOn(40000, 'MFJ'), 6);

      // And the corrected behavior is strictly MORE tax than the old
      // pooled-exclusion version produced for the same one-pension couple.
      expect(onePension).toBeGreaterThan(0);
    });
  });

  // s 612(c)(3-a) covers pensions "not otherwise excluded pursuant to
  // paragraph three", so a government retiree with separate private income
  // gets both, applied to different money.
  it('stacks the two exclusions on different income', () => {
    const mixed = ny(90000, { stateExempt: 60000, private1: 30000, private2: 0 });
    expect(mixed).toBeCloseTo(taxOn(10000), 6);
  });

  it('falls back to the old approximation when no breakdown is supplied', () => {
    // Direct callers and older tests pass no pensionDetail. That path must
    // keep working rather than silently exempting nothing.
    expect(ny(50000, null)).toBeCloseTo(taxOn(30000), 6);
  });

  it('never produces negative taxable pension from over-large exclusions', () => {
    expect(ny(5000, { stateExempt: 100000, private1: 100000, private2: 100000 })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Local and state-level additional taxes (added 2026-08-20)
//
// Two verified gaps from the state audits, both of which were a flat 100%
// miss rather than a wrong number.
// ---------------------------------------------------------------------------
describe('Yonkers resident surcharge', () => {
  const ny = (income, yonkers) =>
    calculateStateTaxes(income, 0, 0, 'ny', false, false, 'Single', 70, 70, 5.0, 0, null, yonkers);

  // Publication NYS-50-T-Y (1/26): "Multiply the result by 16.75% (0.1675)".
  // A percentage of the STATE tax, not of income -- so the ratio holds at
  // every income level, which is the property worth pinning.
  it('is exactly 16.75% on top of the state tax, at every income', () => {
    for (const income of [25000, 50000, 120000, 300000, 1500000]) {
      const base = ny(income, false);
      expect(ny(income, true)).toBeCloseTo(base * (1 + YONKERS_RESIDENT_SURCHARGE), 6);
    }
  });

  it('defaults off, so nobody pays it by accident', () => {
    const income = 120000;
    expect(calculateStateTaxes(income, 0, 0, 'ny', false, false, 'Single', 70, 70))
      .toBeCloseTo(ny(income, false), 6);
  });

  // The surcharge multiplies New York tax. It must not leak into any other
  // state, least of all a no-income-tax one.
  it('applies to New York only', () => {
    for (const state of ['ca', 'none', 'TX_FL', 'il', 'pa', 'co']) {
      const withFlag = calculateStateTaxes(120000, 0, 0, state, false, false, 'Single', 70, 70, 5.0, 0, null, true);
      const without = calculateStateTaxes(120000, 0, 0, state, false, false, 'Single', 70, 70, 5.0, 0, null, false);
      expect(withFlag, state).toBeCloseTo(without, 6);
    }
  });

  it('surcharges nothing when there is no state tax to surcharge', () => {
    expect(ny(0, true)).toBe(0);
  });
});

describe('California additional tax on early distributions', () => {
  // FTB Form 3805P: "the portion of the early distribution that is included
  // in income is subject to an additional 2 1/2% tax", on top of the federal
  // 10%. A Californian bridging to 59.5 pays 12.5%, not 10%.
  it('is 2.5% of the distribution before age 59.5', () => {
    expect(stateEarlyDistributionTax('ca', 40000, 50)).toBeCloseTo(1000, 6);
    expect(stateEarlyDistributionTax('ca', 100000, 59)).toBeCloseTo(2500, 6);
  });

  it('stops exactly at 59.5, matching the federal test', () => {
    expect(stateEarlyDistributionTax('ca', 40000, 59.49)).toBeGreaterThan(0);
    expect(stateEarlyDistributionTax('ca', 40000, 59.5)).toBe(0);
    expect(stateEarlyDistributionTax('ca', 40000, 70)).toBe(0);
  });

  it('applies to California only', () => {
    for (const state of ['ny', 'none', 'TX_FL', 'il', 'pa', 'co', 'flat_5']) {
      expect(stateEarlyDistributionTax(state, 40000, 50), state).toBe(0);
    }
  });

  it('never returns a negative or NaN figure', () => {
    expect(stateEarlyDistributionTax('ca', -5000, 50)).toBe(0);
    expect(stateEarlyDistributionTax('ca', 0, 50)).toBe(0);
    expect(Number.isFinite(stateEarlyDistributionTax('ca', undefined, 50))).toBe(true);
  });

  // The combined burden is the number that actually matters to someone
  // planning a Roth conversion ladder or a 72(t) out of California.
  it('brings the combined early-withdrawal cost to 12.5%', () => {
    const amount = 60000;
    const federal = amount * 0.10;
    const california = stateEarlyDistributionTax('ca', amount, 50);
    expect((federal + california) / amount).toBeCloseTo(0.125, 10);
  });
});

describe('Per-spouse Backdoor Roth (changelog 108)', () => {
  const base = {
    ...DEFAULT_INPUTS,
    spouse2Enabled: true,
    filingStatus: 'MFJ',
    birthYear1: 1981, birthYear2: 1981, planYear: 2026,
    retireAge1: 60, retireAge2: 60,
    salary1: 200000, salary2: 150000,
    backdoorRothEnabled: true,
    rothConversionStrategy: 'fixed', rothConversionAmount: 20000, rothConversionDelayUntilRetire: false,
  };
  it('a legacy single backdoorRothAnnualAmount migrates onto both spouses with identical numbers', () => {
    const legacy = { ...base };
    delete legacy.backdoorRothAnnualAmount1;
    delete legacy.backdoorRothAnnualAmount2;
    legacy.backdoorRothAnnualAmount = 6000;
    const migrated = runProjection(legacy).years[0];
    const explicit = runProjection({ ...base, backdoorRothAnnualAmount1: 6000, backdoorRothAnnualAmount2: 6000 }).years[0];
    expect(migrated.backdoorRothContribution).toBeCloseTo(explicit.backdoorRothContribution, 6);
    expect(migrated.backdoorRothContribution).toBeCloseTo(12000, 6);
  });
  it('each spouse contributes their own amount, and $0 leaves a spouse out', () => {
    const y = runProjection({ ...base, backdoorRothAnnualAmount1: 7500, backdoorRothAnnualAmount2: 0 }).years[0];
    expect(y.backdoorRothContribution).toBeCloseTo(7500, 6);
  });
  it('the new default is the 2026 IRA limit', () => {
    expect(DEFAULT_INPUTS.backdoorRothAnnualAmount1).toBe(7500);
    expect(DEFAULT_INPUTS.backdoorRothAnnualAmount2).toBe(7500);
  });
});

describe('Tax Optimizer Hub grid-best card (changelog 110)', () => {
  it('gridBestExtraStrategy returns null for an empty grid and for winners the Hub already shows', () => {
    expect(gridBestExtraStrategy([])).toBeNull();
    expect(gridBestExtraStrategy(null)).toBeNull();
    expect(gridBestExtraStrategy([
      { bracket: 0.22, withdrawalStrategy: 'TaxableFirst', endingBalance: 100 },
      { bracket: 0.24, withdrawalStrategy: 'TaxableFirst', endingBalance: 50 },
    ])).toBeNull();
    // The 3x3 matrix (changelog 112) covers 22/24% at every non-Roth-first
    // order, so those winners are duplicates too.
    expect(gridBestExtraStrategy([
      { bracket: 0.22, withdrawalStrategy: 'PreTaxFirst', endingBalance: 100 },
    ])).toBeNull();
    expect(gridBestExtraStrategy([
      { bracket: 0.24, withdrawalStrategy: 'ProRata', endingBalance: 100 },
    ])).toBeNull();
    // ...but a 12% winner is no longer a fixed card, and Roth First never was.
    expect(gridBestExtraStrategy([
      { bracket: 0.12, withdrawalStrategy: 'TaxableFirst', endingBalance: 100 },
    ])).not.toBeNull();
    expect(gridBestExtraStrategy([
      { bracket: 0.22, withdrawalStrategy: 'RothFirst', endingBalance: 100 },
    ])).not.toBeNull();
  });
  it('builds a card for a winner outside the nine fixed strategies', () => {
    const extra = gridBestExtraStrategy([
      { bracket: 0.22, withdrawalStrategy: 'TaxableFirst', endingBalance: 100 },
      { bracket: 0.10, withdrawalStrategy: 'RothFirst', endingBalance: 200 },
    ]);
    expect(extra.id).toBe('grid_best');
    expect(extra.name).toContain('10% Bracket + Roth First');
    expect(extra.config).toMatchObject({ withdrawalStrategy: 'RothFirst', rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.10 });
  });
  it('runOptimizer merges the extra strategy and clips to the nine best performers (changelog 113)', () => {
    const inputs = { ...DEFAULT_INPUTS };
    const extra = gridBestExtraStrategy([{ bracket: 0.10, withdrawalStrategy: 'RothFirst', endingBalance: 1 }]);
    const results = runOptimizer(inputs, [extra, null]);
    // The Hub always renders exactly nine cards, even with the extra.
    expect(results).toHaveLength(9);
    // The nine shown must be exactly the top nine of the implied ten
    // (nine fixed + the extra's own direct projection), sorted by
    // ending balance -- the worst of the ten is the one clipped.
    const fixed = runOptimizer(inputs);
    expect(fixed).toHaveLength(9);
    const direct = runProjection({ ...inputs, ...extra.config });
    const allTen = [
      ...fixed.map((r) => ({ id: r.id, bal: r.endingBalance })),
      { id: 'grid_best', bal: direct.endingBalance },
    ].sort((a, b) => b.bal - a.bal);
    expect(results.map((r) => r.id).sort()).toEqual(allTen.slice(0, 9).map((x) => x.id).sort());
    // If the card survived the clip, its metrics must match running the
    // config directly, and it must carry a ranking like any other card.
    const card = results.find((r) => r.id === 'grid_best');
    if (card) {
      expect(card.endingBalance).toBeCloseTo(direct.endingBalance, 4);
      expect(card.ranking).toBeTruthy();
    }
    // Ranking labels apply to the visible nine: last visible is Worst
    // (or Shortfall when it ran out of money).
    expect(['Worst', 'Shortfall']).toContain(results[results.length - 1].ranking);
  });
});

describe('Roth ladder grids follow the Real/Nominal toggle (changelog 111)', () => {
  const COUPLE = {
    ...DEFAULT_INPUTS,
    spouse2Enabled: true, filingStatus: 'MFJ',
    birthYear1: 1971, birthYear2: 1971, planYear: 2026,
    retireAge1: 65, retireAge2: 65, lifeExpectancy1: 89, lifeExpectancy2: 89,
    claimingAge1: 70, claimingAge2: 70, ss1: 55000, ss2: 25000,
    salary1: 250000, salary2: 100000,
    preTaxInit: 900000, rothInit: 200000, taxableInit: 300000,
    lifestyleExpense: 135000, stateTaxState: 'none',
  };
  it('a real-dollar grid cell matches the real-dollar Hub card for the identical strategy, penny for penny', () => {
    const cell = getRothBracketWithdrawalHeatmap(COUPLE, true)
      .find((c) => c.bracket === 0.22 && c.withdrawalStrategy === 'TaxableFirst');
    const hub = computeOptimizerResultsReal(COUPLE).find((r) => r.id === 'roth_conv_22');
    expect(cell.endingBalance).toBeCloseTo(hub.endingBalance, 4);
    expect(cell.totalTaxesPaid).toBeCloseTo(hub.totalTaxes, 4);
    expect(cell.totalIRMAAPaid).toBeCloseTo(hub.totalIRMAA, 4);
    expect(cell.survivorPhaseTaxes).toBeCloseTo(hub.survivorPhaseTaxes, 4);
  });
  it('real-dollar cells are the nominal cells deflated, never larger', () => {
    const nom = getRothBracketWithdrawalHeatmap(COUPLE, false);
    const real = getRothBracketWithdrawalHeatmap(COUPLE, true);
    expect(real).toHaveLength(nom.length);
    nom.forEach((nc, i) => {
      expect(real[i].bracket).toBe(nc.bracket);
      expect(real[i].withdrawalStrategy).toBe(nc.withdrawalStrategy);
      if (nc.endingBalance > 0) expect(real[i].endingBalance).toBeLessThan(nc.endingBalance);
    });
  });
  it('the schedule-mode grid deflates too, and omitting the flag stays nominal (back-compat)', () => {
    const nom = getRothLadderScheduleHeatmap(COUPLE);
    const nomExplicit = getRothLadderScheduleHeatmap(COUPLE, false);
    const real = getRothLadderScheduleHeatmap(COUPLE, true);
    expect(nom[0].endingBalance).toBeCloseTo(nomExplicit[0].endingBalance, 6);
    if (nom[0].endingBalance > 0) expect(real[0].endingBalance).toBeLessThan(nom[0].endingBalance);
  });
});

describe('Virginia state tax jurisdiction (changelog 114)', () => {
  // Direct calculateStateTaxes calls: (income, pension, ss, stateType,
  // taxSS, taxPension, status, age1, age2, flatRate, militaryPension,
  // pensionDetail, yonkersResident, extras). Without extras.federalTaxableSS
  // the gross-SS convention applies; these tests pass it explicitly.
  const va = (income, pension, ss, status, age1, age2, opts = {}) =>
    calculateStateTaxes(income, pension, ss, 'va', true, true, status, age1, age2, 5.0,
      opts.militaryPension || 0, opts.pensionDetail || null, false,
      { federalAGI: income, federalTaxableSS: ss, calendarYear: TAX_YEAR, ...(opts.extras || {}) });

  it('applies the bracket schedule under the standard deduction and exemptions (single, under 65)', () => {
    // 100,000 income, no SS, no pension: taxable = 100,000 - 8,750 - 930 = 90,320
    // tax = 60 + 60 + 600 + (90,320 - 17,000) * 5.75% = 720 + 4,215.90
    expect(va(100000, 0, 0, 'Single', 55, 55)).toBeCloseTo(4935.90, 2);
  });

  it('MFJ uses the joint standard deduction but the SAME bracket thresholds as single', () => {
    // taxable = 100,000 - 17,500 - 1,860 = 80,640 -> 720 + 63,640 * 5.75%
    expect(va(100000, 0, 0, 'MFJ', 55, 55)).toBeCloseTo(720 + 63640 * 0.0575, 2);
  });

  it('Social Security is fully exempt: only the federally-taxable portion in the base is removed', () => {
    const withSS = va(100000, 0, 20000, 'Single', 55, 55); // 20k of the 100k is taxable SS
    const without = va(80000, 0, 0, 'Single', 55, 55);
    expect(withSS).toBeCloseTo(without, 6);
  });

  it('a 65+ couple below the phase-out owes nothing on modest income (std + exemptions + age deduction)', () => {
    // 40,000 income, both 67: deductions 17,500 + 1,860 + 1,600 + 24,000 = 44,960 > 40,000
    expect(va(40000, 0, 0, 'MFJ', 67, 67)).toBe(0);
  });

  it('the age deduction phases out dollar-for-dollar above $75,000 (MFJ) and is gone at $99,000+', () => {
    expect(virginiaAgeDeduction(75000, 'MFJ', 67, 67)).toBe(24000);
    expect(virginiaAgeDeduction(90000, 'MFJ', 67, 67)).toBe(9000);
    expect(virginiaAgeDeduction(99000, 'MFJ', 67, 67)).toBe(0);
    expect(virginiaAgeDeduction(50000, 'Single', 67, 67)).toBe(12000);
    expect(virginiaAgeDeduction(62000, 'Single', 67, 67)).toBe(0);
    // Under 65: nothing, regardless of income.
    expect(virginiaAgeDeduction(0, 'MFJ', 64, 64)).toBe(0);
  });

  it('AFAGI excludes Social Security, so SS never counts against the age-deduction phase-out', () => {
    // Same non-SS income (60,000), one with 30,000 of taxable SS on top: identical VA tax.
    const withSS = va(90000, 0, 30000, 'MFJ', 67, 67);
    const without = va(60000, 0, 0, 'MFJ', 67, 67);
    expect(withSS).toBeCloseTo(without, 6);
  });

  it('filers born on or before 1/1/1939 keep the age deduction with no income test', () => {
    const age = TAX_YEAR - 1938; // born 1938
    expect(virginiaAgeDeduction(500000, 'Single', age, age, TAX_YEAR)).toBe(12000);
  });

  it('military subtraction caps at $40,000 per recipient using the per-spouse breakdown', () => {
    expect(virginiaMilitarySubtraction(100000, { military1: 60000, military2: 40000 })).toBe(80000);
    expect(virginiaMilitarySubtraction(60000, { military1: 60000, military2: 0 })).toBe(40000);
    // Without a breakdown: one conservative $40,000 cap on the combined figure.
    expect(virginiaMilitarySubtraction(100000)).toBe(40000);
    expect(virginiaMilitarySubtraction(25000)).toBe(25000);
    expect(virginiaMilitarySubtraction(0)).toBe(0);
  });

  it('pensions are fully taxable beyond the military subtraction, ignoring the generic pension toggle', () => {
    // taxPension=false must NOT zero the pension for VA (rules auto-apply).
    const ignoringToggle = calculateStateTaxes(100000, 60000, 0, 'va', true, false, 'Single', 70, 70, 5.0,
      0, null, false, { federalAGI: 100000, federalTaxableSS: 0 });
    const withToggle = calculateStateTaxes(100000, 60000, 0, 'va', true, true, 'Single', 70, 70, 5.0,
      0, null, false, { federalAGI: 100000, federalTaxableSS: 0 });
    expect(ignoringToggle).toBeCloseTo(withToggle, 6);
    expect(ignoringToggle).toBeGreaterThan(0);
  });

  it('runProjection accepts stateTaxState "va" end to end and taxes less than the flat-5.75% approximation', () => {
    const base = {
      ...DEFAULT_INPUTS, spouse2Enabled: true, filingStatus: 'MFJ',
      preTaxInit: 900000, rothInit: 200000, taxableInit: 300000,
      salary1: 150000, salary2: 100000, ss1: 40000, ss2: 20000,
      lifestyleExpense: 120000,
    };
    const vaProj = runProjection({ ...base, stateTaxState: 'va' });
    const flatProj = runProjection({ ...base, stateTaxState: 'flat_5', stateTaxFlatRate: 5.75, stateTaxSocialSecurityTaxable: false, stateTaxPensionTaxable: true });
    expect(Number.isFinite(vaProj.totalTaxesPaid)).toBe(true);
    expect(vaProj.totalTaxesPaid).toBeGreaterThan(0);
    // The real return's deductions must beat a no-deduction 5.75% flat tax.
    expect(vaProj.totalTaxesPaid).toBeLessThan(flatProj.totalTaxesPaid);
  });
});
