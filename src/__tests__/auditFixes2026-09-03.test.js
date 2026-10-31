// Changelog 127: the last four open TAX_RULES_SPEC Section 6 questions --
// Q-18 (state estate/inheritance structure), Q-13 (nominal estate against
// unindexed thresholds), Q-10(b) (concentrated-stock diversification taxed
// outside the engine) and Q-1 (MFS on one return instead of two). Q-22 was
// re-verified against Tax Law s 601 the same day and confirmed as-is, which
// the era tests in calculator.test.js already pin.
import { describe, it, expect } from 'vitest';
import {
  runProjection, calculateHeirEstateTax,
  calculateStateEstateInheritanceTax, stateGrossEstateTax, stateInheritanceTaxForHeir,
  calculateFederalEstateTax, calculateTaxes, calculateAMT, calculateCapitalGainsTaxes,
  federal2011StateDeathTaxCredit, applyEstateSchedule, newYorkEstateTax,
  effectiveMfsSplitPct, MFS_DEFAULT_INCOME_SPLIT_PCT,
  NY_ESTATE_SCHEDULE, MN_ESTATE_SCHEDULE, OR_ESTATE_SCHEDULE,
  STATE_ESTATE_INHERITANCE_TAX_TABLE, GST_EXEMPTION_2026, FEDERAL_ESTATE_EXEMPTION_2026,
} from '../calculator';
// The reference household (the pre-467 default plan): see referenceHousehold.js.
import { REFERENCE_INPUTS as DEFAULT_INPUTS } from './referenceHousehold';

describe('Q-18(a): the graduated states use their real schedules, not a top rate on the excess', () => {
  it('one pre-2001 s 2011 table reproduces MA, RI and MD\'s three published credit figures', () => {
    // This is the cross-check that the table was transcribed correctly:
    // three states publish a different headline number, and all three fall
    // out of the same function evaluated at their own exclusion.
    expect(federal2011StateDeathTaxCredit(2000000)).toBeCloseTo(99600, 2);    // MA, MGL c.65C s.2A
    expect(federal2011StateDeathTaxCredit(1838056)).toBeCloseTo(87940, 0);    // RI 2026 credit
    expect(federal2011StateDeathTaxCredit(5000000)).toBeCloseTo(391600, 2);   // MD applicable credit
    // Below the table's $40,000 floor (plus the $60,000 adjustment) nothing.
    expect(federal2011StateDeathTaxCredit(100000)).toBe(0);
  });

  it('Oregon taxes its first bracket at 10%, not the 16% top rate', () => {
    // $1,200,000 estate: $200,000 over the threshold, entirely in the 10%
    // band. The old model charged 16% of it.
    expect(stateGrossEstateTax('OR', 1200000, {})).toBeCloseTo(20000, 2);
    expect(stateGrossEstateTax('OR', 1200000, {})).toBeLessThan(200000 * 0.16);
    // The schedule is keyed on the whole taxable estate, so nothing is due
    // at or below $1,000,000 without any exemption being subtracted.
    expect(stateGrossEstateTax('OR', 1000000, {})).toBe(0);
    expect(applyEstateSchedule(OR_ESTATE_SCHEDULE, 9500000)).toBeCloseTo(1022500, 2);
  });

  it('Minnesota subtracts its $3,000,000 exclusion first, then starts at 13%', () => {
    expect(stateGrossEstateTax('MN', 4000000, {})).toBeCloseTo(1000000 * 0.13, 2);
    expect(stateGrossEstateTax('MN', 3000000, {})).toBe(0);
    // The table's own steps, from Form M706.
    expect(applyEstateSchedule(MN_ESTATE_SCHEDULE, 7100000)).toBeCloseTo(923000, 2);
    expect(applyEstateSchedule(MN_ESTATE_SCHEDULE, 10100000)).toBeCloseTo(1355000, 2);
  });

  it('Massachusetts and Rhode Island run the s 2011 table less their own credit', () => {
    // MA at $2.5M: table value $138,800 less the $99,600 credit.
    expect(stateGrossEstateTax('MA', 2500000, {})).toBeCloseTo(39200, 2);
    // Nothing at or below the filing threshold, and no cliff above it --
    // the credit means the tax phases in from zero.
    expect(stateGrossEstateTax('MA', 2000000, {})).toBe(0);
    expect(stateGrossEstateTax('MA', 2010000, {})).toBeGreaterThan(0);
    expect(stateGrossEstateTax('MA', 2010000, {})).toBeLessThan(1500);
    expect(stateGrossEstateTax('RI', 1838056, {})).toBeCloseTo(0, 0);
  });

  it('Illinois treats its $4,000,000 as a threshold, so crossing it taxes the whole estate', () => {
    // "The exclusion amount is a taxable threshold and not a credit against
    // tax" -- Illinois AG estate tax fact sheet. One dollar over and the
    // table applies to everything, which is a real cliff and much larger
    // than 16% of the excess.
    expect(stateGrossEstateTax('IL', 4000000, {})).toBe(0);
    const justOver = stateGrossEstateTax('IL', 4000001, {});
    expect(justOver).toBeGreaterThan(280000);
    expect(justOver).toBeCloseTo(federal2011StateDeathTaxCredit(4000001), 2);
  });

  it('Vermont really is a single rate, so it is left alone', () => {
    // 32 V.S.A. s 7442a: "$5,000,000.00 or more -- 16 percent of the excess
    // over $5,000,000.00". The reviewer's list had VT down as graduated; it
    // is not, and pinning that stops a future change "fixing" it.
    expect(STATE_ESTATE_INHERITANCE_TAX_TABLE.VT.estateMethod).toBeUndefined();
    expect(stateGrossEstateTax('VT', 6000000, {})).toBeCloseTo(160000, 2);
  });

  it('New York\'s exclusion is a credit that vanishes above 105% of the exclusion', () => {
    const bea = STATE_ESTATE_INHERITANCE_TAX_TABLE.NY.estateExemption;
    expect(newYorkEstateTax(bea, bea)).toBe(0);
    // Inside the 100-105% band the credit shrinks linearly, which produces
    // the famous ~200% marginal rate -- $50,000 more estate costs ~$100,000.
    const at100k = newYorkEstateTax(bea + 100000, bea);
    const at50k = newYorkEstateTax(bea + 50000, bea);
    expect(at50k).toBeGreaterThan(50000);
    expect(at100k - at50k).toBeGreaterThan(50000 * 1.5);
    // Above 105% no credit at all: the s 952(b) schedule on every dollar.
    const cliff = bea * 1.05;
    expect(newYorkEstateTax(cliff + 1000, bea)).toBeCloseTo(applyEstateSchedule(NY_ESTATE_SCHEDULE, cliff + 1000), 2);
    // s 952(b)'s own top row.
    expect(applyEstateSchedule(NY_ESTATE_SCHEDULE, 10100000)).toBeCloseTo(1082800, 2);
  });
});

describe('Q-18(b): Maryland credits the inheritance tax against its estate tax', () => {
  it('does not charge both on the same dollars', () => {
    // $10M estate: gross estate tax $676,000. A child owes no inheritance
    // tax and pays it in full; a niece owes $1,000,000 of inheritance tax,
    // which more than absorbs the estate tax.
    expect(calculateStateEstateInheritanceTax('MD', 10000000, 1, 'child')).toBeCloseTo(676000, 2);
    expect(calculateStateEstateInheritanceTax('MD', 10000000, 1, 'niece')).toBeCloseTo(1000000, 2);
    // The old model summed them and reported $1,676,000.
    expect(calculateStateEstateInheritanceTax('MD', 10000000, 1, 'niece')).toBeLessThan(1676000);
  });

  it('is the only state that does it', () => {
    const crediting = Object.entries(STATE_ESTATE_INHERITANCE_TAX_TABLE)
      .filter(([, entry]) => entry.inheritanceCreditsAgainstEstate !== undefined)
      .map(([code, entry]) => [code, entry.inheritanceCreditsAgainstEstate]);
    expect(crediting).toEqual([['MD', true]]);
  });
});

describe('Q-18(c): life insurance to a named beneficiary is outside the inheritance-tax base', () => {
  const opts = { lifeInsuranceInEstate: 400000 };
  it('comes out of the bequest in all five inheritance-tax states', () => {
    // An unrelated beneficiary, who is taxable in all five -- Kentucky
    // moved nieces and nephews into Class A in 2026, so they owe nothing
    // there and would make this comparison vacuous.
    for (const st of ['PA', 'NJ', 'KY', 'MD', 'NE']) {
      const withPolicy = stateInheritanceTaxForHeir(st, 1000000, 1, 'other', opts);
      const noPolicy = stateInheritanceTaxForHeir(st, 600000, 1, 'other', {});
      expect(withPolicy, st).toBeCloseTo(noPolicy, 2);
      // And it is genuinely a reduction from taxing the whole estate.
      expect(withPolicy, st).toBeLessThan(stateInheritanceTaxForHeir(st, 1000000, 1, 'other', {}));
    }
  });

  it('still counts in the ESTATE base -- only the inheritance side is exempt', () => {
    // A self-owned policy is in the taxable estate under IRC s 2042; the
    // state inheritance exemptions do not change that.
    expect(stateGrossEstateTax('MD', 10000000, opts)).toBeCloseTo(stateGrossEstateTax('MD', 10000000, {}), 2);
  });

  it('never exempts more insurance than the estate actually holds', () => {
    expect(stateInheritanceTaxForHeir('PA', 100000, 1, 'other', { lifeInsuranceInEstate: 999999999 })).toBe(0);
  });
});

describe('Q-13: a nominal estate is measured against thresholds carried to the same year', () => {
  const bigEstate = (o = {}) => calculateHeirEstateTax(
    {
      ...DEFAULT_INPUTS, filingStatus: 'Single', spouse2Enabled: false,
      birthYear1: 1986, lifeExpectancy1: 90, taxBracketInflationRate: 2.5,
      heirs: [{ id: 1, name: 'H', filingStatus: 'Single', income: 100000, splitPct: 100, relationship: 'child' }],
      ...o,
    },
    0, 0, 20000000, 0, 0,
  );

  it('indexing lowers the federal estate tax on a plan that ends decades out', () => {
    const indexed = bigEstate();
    const unindexed = bigEstate({ estateIndexingEnabled: false });
    expect(unindexed.totalFederalEstateTax).toBeGreaterThan(0);
    expect(indexed.totalFederalEstateTax).toBeLessThan(unindexed.totalFederalEstateTax);
  });

  it('the federal exemption itself moves at the tax-bracket inflation rate', () => {
    // A 30-year plan at 2.5% multiplies the $15,000,000 exclusion by ~2.1.
    const factor = Math.pow(1.025, 90 - (DEFAULT_INPUTS.planYear - 1986));
    expect(calculateFederalEstateTax(20000000, 'Single', 1, 0, 0, factor))
      .toBeCloseTo(Math.max(0, 20000000 - FEDERAL_ESTATE_EXEMPTION_2026 * factor) * 0.40, 2);
    // With a factor of 1 it is the old unindexed figure.
    expect(calculateFederalEstateTax(20000000, 'Single', 1, 0, 0))
      .toBeCloseTo((20000000 - FEDERAL_ESTATE_EXEMPTION_2026) * 0.40, 2);
  });

  it('indexes only the state exemptions the statute actually indexes', () => {
    const opts = { inflationFactor: 2 };
    // CT, ME, NY, RI and DC index by their own formulas...
    for (const st of ['CT', 'ME', 'NY', 'RI', 'DC']) {
      expect(STATE_ESTATE_INHERITANCE_TAX_TABLE[st].indexed).toBe(true);
    }
    // ...while a fixed dollar figure stays fixed until a legislature moves
    // it. Doubling the factor must not shelter a Minnesota estate.
    expect(stateGrossEstateTax('MN', 5000000, opts)).toBeCloseTo(stateGrossEstateTax('MN', 5000000, {}), 2);
    expect(stateGrossEstateTax('MA', 3000000, opts)).toBeCloseTo(stateGrossEstateTax('MA', 3000000, {}), 2);
    // Maine's is indexed, so the same estate owes less.
    expect(stateGrossEstateTax('ME', 9000000, opts)).toBeLessThan(stateGrossEstateTax('ME', 9000000, {}));
  });

  it('carries the GST exemption too, since IRC s 2631(c) ties it to the estate exclusion', () => {
    const skip = (o = {}) => calculateHeirEstateTax(
      {
        ...DEFAULT_INPUTS, filingStatus: 'Single', spouse2Enabled: false,
        birthYear1: 1986, lifeExpectancy1: 90, taxBracketInflationRate: 2.5,
        heirs: [{ id: 1, name: 'GC', filingStatus: 'Single', income: 80000, splitPct: 100, isSkipPerson: true }],
        ...o,
      },
      0, 0, 25000000, 0, 0,
    );
    expect(GST_EXEMPTION_2026).toBe(FEDERAL_ESTATE_EXEMPTION_2026);
    expect(skip().totalGenerationSkippingTax).toBeLessThan(skip({ estateIndexingEnabled: false }).totalGenerationSkippingTax);
  });

  it('moves the heirs\' brackets and their own income together, so their rate is unchanged', () => {
    // The heir's stated income is in today's dollars and the inheritance is
    // in plan-end dollars. Indexing both sides is what stops the mismatch
    // pushing the inheritance up the schedule on its own.
    const indexed = bigEstate();
    const unindexed = bigEstate({ estateIndexingEnabled: false });
    expect(indexed.perHeir[0].totalHeirTax).toBeLessThanOrEqual(unindexed.perHeir[0].totalHeirTax + 0.01);
  });

  it('a zero inflation rate leaves everything exactly where it was', () => {
    const flat = { taxBracketInflationRate: 0 };
    const a = bigEstate(flat);
    const b = bigEstate({ ...flat, estateIndexingEnabled: false });
    expect(a.totalFederalEstateTax).toBeCloseTo(b.totalFederalEstateTax, 6);
    expect(a.netInherited).toBeCloseTo(b.netInherited, 6);
  });
});

describe('Q-10(b): a concentrated-stock sale is taxed by the real engine', () => {
  const cs = {
    ...DEFAULT_INPUTS, spouse2Enabled: false, filingStatus: 'Single',
    birthYear1: 1976, retireAge1: 50, salary1: 0, ss1: 0, ss2: 0, pension1: 0,
    preTaxInit: 0, rothInit: 0, taxableInit: 500000, lifestyleExpense: 60000,
    inflationRate: 0, taxBracketInflationRate: 0,
    concentratedStockEnabled: true, concentratedStockInit: 4000000,
    concentratedStockCostBasisPct: 10, concentratedStockGrowthRate: 0,
    concentratedStockDiversifyPct: 25, concentratedStockDiversifyTaxRate: 15,
  };

  it('the gain lands in the year\'s tax bill instead of vanishing outside it', () => {
    const real = runProjection(cs).years[0];
    const flat = runProjection({ ...cs, concentratedStockFlatTaxEnabled: true }).years[0];
    expect(real.concentratedStockDiversified).toBeCloseTo(1000000, 2);
    // The old path charged 15% and reported $0 of tax paid for the year.
    expect(flat.totalTaxesPaid).toBeCloseTo(0, 2);
    expect(real.totalTaxesPaid).toBeGreaterThan(150000);
  });

  it('picks up the 20% band and NIIT, so a large sale costs well over the flat 15%', () => {
    const real = runProjection(cs).years[0];
    const flat = runProjection({ ...cs, concentratedStockFlatTaxEnabled: true }).years[0];
    expect(flat.concentratedStockDiversificationTax).toBeCloseTo(900000 * 0.15, 2);
    expect(real.concentratedStockDiversificationTax).toBeGreaterThan(900000 * 0.15);
    // 20% top band plus the 3.8% NIIT is the ceiling it approaches.
    expect(real.concentratedStockDiversificationTax).toBeLessThan(900000 * 0.238 + 1);
  });

  it('the gain reaches every MAGI, so it can no longer hide from the ACA cliff', () => {
    const real = runProjection(cs).years[0];
    const flat = runProjection({ ...cs, concentratedStockFlatTaxEnabled: true }).years[0];
    expect(flat.acaMagi).toBeLessThan(100000);
    // The $900,000 gain itself. (It used to read over $1M because the
    // year's bills were paid by selling Taxable at a gain; since the
    // 2026-09-30 fix (E25) the sale proceeds pay them.)
    expect(real.acaMagi).toBeGreaterThan(900000);
    expect(real.acaCliffBreached).toBe(true);
  });

  it('leaves a plan with no concentrated position completely untouched', () => {
    const off = runProjection(DEFAULT_INPUTS).years;
    expect(off[0].concentratedStockDiversificationTax).toBe(0);
    expect(off.at(-1).totalPortfolioEnding).toBeCloseTo(36762.2363, 4);
  });
});

describe('Q-1: married filing separately files two returns, not one', () => {
  it('an even split lands where MFJ does, because MFS brackets are half of MFJ', () => {
    expect(calculateTaxes(400000, 'MFS')).toBeCloseTo(calculateTaxes(400000, 'MFJ'), 2);
    // The old single-return model taxed the household as though one spouse
    // earned everything -- roughly a third more.
    expect(calculateTaxes(400000, 'MFS', 1, false, 100)).toBeGreaterThan(calculateTaxes(400000, 'MFS') * 1.3);
  });

  it('the split is a dial: 100 restores the old behavior for a one-earner couple', () => {
    expect(MFS_DEFAULT_INCOME_SPLIT_PCT).toBe(50);
    expect(DEFAULT_INPUTS.mfsIncomeSplitPct).toBe(50);
    const even = calculateTaxes(300000, 'MFS', 1, false, 50);
    const lopsided = calculateTaxes(300000, 'MFS', 1, false, 80);
    const oneEarner = calculateTaxes(300000, 'MFS', 1, false, 100);
    expect(even).toBeLessThan(lopsided);
    expect(lopsided).toBeLessThan(oneEarner);
  });

  it('applies to capital gains and AMT too, not just the ordinary brackets', () => {
    // Each return gets its own 0%/15%/20% bands and its own $125,000 NIIT
    // threshold, which for an even split is the same as testing the couple
    // against $250,000.
    expect(calculateCapitalGainsTaxes(0, 400000, 'MFS'))
      .toBeLessThan(calculateCapitalGainsTaxes(0, 400000, 'MFS', 1, 0, 0, 0, 100));
    expect(calculateAMT(1000000, 'MFS')).toBeLessThan(calculateAMT(1000000, 'MFS', 1, 100));
  });

  it('a one-person plan still files one return however the status reads', () => {
    // There is no second spouse to put income on, so nothing splits -- which
    // is what keeps every existing single-person MFS plan unchanged.
    expect(effectiveMfsSplitPct({ spouse2Enabled: false, mfsIncomeSplitPct: 50 })).toBe(100);
    expect(effectiveMfsSplitPct({ spouse2Enabled: true, mfsIncomeSplitPct: 50 })).toBe(50);
    expect(effectiveMfsSplitPct({ spouse2Enabled: true })).toBe(MFS_DEFAULT_INCOME_SPLIT_PCT);
  });

  it('the MFS-specific penalties still bite -- they are the point of the status', () => {
    const couple = {
      ...DEFAULT_INPUTS, spouse2Enabled: true, birthYear1: 1960, birthYear2: 1962,
      retireAge1: 62, retireAge2: 62, salary1: 0, salary2: 0, ss1: 40000, ss2: 20000,
      preTaxInit: 2000000, rothInit: 0, taxableInit: 0, lifestyleExpense: 120000,
      inflationRate: 0, taxBracketInflationRate: 0, stressType: 'none',
    };
    const lifetime = (o) => runProjection({ ...couple, ...o }).years.reduce((a, y) => a + y.totalTaxesPaid, 0);
    // Filing separately while living together still strips the Social
    // Security exempt amount and the senior bonus, so it is not free even
    // with an even income split.
    expect(lifetime({ filingStatus: 'MFS', mfsLivedWithSpouse: true }))
      .toBeGreaterThan(lifetime({ filingStatus: 'MFJ' }));
  });

  it('leaves every non-MFS status alone', () => {
    for (const status of ['Single', 'MFJ']) {
      expect(calculateTaxes(250000, status, 1, false, 50)).toBeCloseTo(calculateTaxes(250000, status, 1, false, 100), 6);
    }
  });
});
