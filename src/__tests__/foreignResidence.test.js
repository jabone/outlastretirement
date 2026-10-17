// Changelog 196 / RELOCATION_SPEC.md rung 2: years abroad.
//
// A move abroad keeps the whole US engine running and adds a foreign
// layer: local income tax, local contributions, and the US foreign tax
// credit that offsets part of it. These tests pin the rules that make the
// answer honest rather than flattering:
//   - the ledger reconciles exactly with the new term;
//   - no treaty re-sourcing, no credit on US-source income;
//   - the credit is capped by US REGULAR tax, never NIIT, and the excess
//     carries forward ten years;
//   - foreign tax on a Roth, on Social Security and local contributions is
//     never credited;
//   - the old state keeps its claim until ties are cut;
//   - Medicare Part B, the ACA, and the estate follow the move.
// Every fixture key is checked against DEFAULT_INPUTS (see DEVELOPMENT.md).
import { describe, it, expect } from 'vitest';
import {
  runProjection, calculateHeirEstateTax, DEFAULT_INPUTS, IRMAA_STANDARD_PREMIUM,
  readResidencyTimeline, readForeignTerms, priceForeignYear, progressiveTax,
  settleFtcCarryforward, ftcCarryforwardAvailable, FTC_CARRYFORWARD_YEARS,
  calculateNetInvestmentIncomeTax, calculateCapitalGainsTaxes,
} from '../calculator';

const plan = (over) => {
  for (const k of Object.keys(over)) {
    if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  }
  return { ...DEFAULT_INPUTS, ...over };
};
const START = DEFAULT_INPUTS.planYear;
const ABROAD = START + 3;

// A Californian who retires at 64 and moves to "Portugal" three years in.
const retiree = {
  birthYear1: START - 64, retireAge1: 64, lifeExpectancy1: 90, claimingAge1: 67,
  salary1: 0, ss1: 36000, pension1: 0,
  preTaxInit: 1500000, taxableInit: 500000, rothInit: 300000,
  lifestyleExpense: 90000, withdrawalStrategy: 'TaxableFirst',
  stateOfResidence: 'CA', stateTaxState: 'ca',
};
const abroad = (foreign = {}, extra = {}) => ({
  id: 'pt', fromYear: ABROAD, kind: 'foreign', countryName: 'Portugal', stateDomicileSevered: true,
  foreign: { ordinaryRate: 30, investmentRate: 28, roth: 'respect', treatyResourcing: true, ...foreign },
  ...extra,
});
const withMoves = (base, ...moves) => plan({ ...base, residencyTimeline: moves });
const rowsOf = (inputs) => runProjection(inputs).years;
const abroadRows = (rows) => rows.filter((r) => r.residenceCountry);
const sum = (rows, k) => rows.reduce((t, r) => t + (r[k] || 0), 0);

describe('the ledger reconciles with the foreign term', () => {
  const variants = {
    'treaty': abroad(),
    'no treaty': abroad({ treatyResourcing: false, ordinaryRate: 15, investmentRate: 15 }),
    'Roth taxed at a rate': abroad({ roth: 'rate', rothRate: 20 }),
    'Roth looked through': abroad({ roth: 'taxableAccount' }),
    'contributions and health cover': abroad({ contributionRate: 9, contributionCap: 60000, healthcareCost: 6000 }),
    'old state keeps its claim': abroad({}, { stateDomicileSevered: false }),
    'progressive local brackets': abroad({ taxMode: 'brackets', brackets: [{ upTo: 8000, rate: 13 }, { upTo: 50000, rate: 30 }, { upTo: null, rate: 45 }], fxRate: 0.9 }),
  };
  for (const [name, move] of Object.entries(variants)) {
    it(name, () => {
      const rows = rowsOf(withMoves(retiree, move));
      expect(abroadRows(rows).length).toBeGreaterThan(15);
      const off = rows.filter((r) => Math.abs(r.federalTax + r.stateTax + r.ficaTax + r.foreignTax - r.foreignTaxCredit - r.totalTaxesPaid) > 1e-6);
      expect(off).toEqual([]);
      expect(abroadRows(rows).every((r) => r.foreignTax > 0)).toBe(true);
    });
  }

  it('the years before the move are exactly what staying would have produced', () => {
    const stayed = rowsOf(plan(retiree)).filter((r) => r.year < ABROAD);
    const moved = rowsOf(withMoves(retiree, abroad())).filter((r) => r.year < ABROAD);
    expect(moved.length).toBe(3);
    expect(moved).toEqual(stayed);
  });

  it('the foreign layer is a real cost the plan funds', () => {
    const home = runProjection(withMoves(retiree, abroad({ ordinaryRate: 0, investmentRate: 0 })));
    const taxed = runProjection(withMoves(retiree, abroad()));
    expect(taxed.totalTaxesPaid).toBeGreaterThan(home.totalTaxesPaid);
    expect(taxed.endingBalance).toBeLessThan(home.endingBalance);
  });
});

describe('the foreign tax credit', () => {
  it('without treaty re-sourcing, foreign tax on US income earns no credit at all', () => {
    const rows = abroadRows(rowsOf(withMoves(retiree, abroad({ treatyResourcing: false, ordinaryRate: 15, investmentRate: 15 }))));
    expect(rows.every((r) => r.foreignTaxCredit === 0)).toBe(true);
    expect(rows.every((r) => Math.abs(r.uncreditableForeignTax - r.foreignTax) < 1e-9)).toBe(true);
  });

  it('wages earned abroad are foreign-source, so they earn a credit even without a treaty', () => {
    const worker = { ...retiree, birthYear1: START - 50, retireAge1: 60, salary1: 120000 };
    const rows = abroadRows(rowsOf(withMoves(worker, abroad({ treatyResourcing: false }))));
    const working = rows.filter((r) => r.salary > 0);
    expect(working.length).toBeGreaterThan(3);
    expect(working.every((r) => r.foreignTaxCredit > 0)).toBe(true);
  });

  it('baskets do not blend: passive excess cannot shelter general-basket tax, and expires at ten years', () => {
    // The first years abroad live on long-term gains the US taxes at 0% --
    // no US tax, so no passive credit room (the rate-differential
    // adjustment), and the foreign tax on them carries forward in the
    // PASSIVE basket. Later years draw Pre-Tax money (GENERAL basket) with
    // plenty of US tax -- but a passive carryforward can never be used
    // against it, so it sits there and expires, vintage by vintage.
    const rows = abroadRows(rowsOf(withMoves(retiree, abroad({ ordinaryRate: 5, investmentRate: 5, taxesSocialSecurity: false }))));
    const creditable = (r) => r.foreignTax - r.uncreditableForeignTax;
    expect(rows[0].foreignTaxCredit).toBeLessThan(creditable(rows[0]) / 2);
    const peak = Math.max(...rows.map((r) => r.foreignTaxCarryforward));
    expect(peak).toBeGreaterThan(1000);
    // General-basket years with real US tax: credited in full, and the
    // passive pool beside them does not move.
    //
    // "General-basket year" means the passive basket has no room of its
    // own that year -- not "the US tax is large", which is only a proxy
    // for it and stopped holding when changelog 230 shifted the gains mix
    // by a couple of dollars. The per-basket figures say it exactly.
    const general = rows.filter((r) => r.foreignTaxCreditablePassive < 0.01
      && r.federalTax > 3 * r.foreignTax && r.year < ABROAD + FTC_CARRYFORWARD_YEARS + 1);
    expect(general.length).toBeGreaterThan(3);
    // At least in full: the year's own creditable tax is always used, and
    // a general-basket year may spend GENERAL carryforward on top of it,
    // which is not a violation of anything.
    expect(general.every((r) => r.foreignTaxCredit >= creditable(r) - 0.01)).toBe(true);
    // The PASSIVE pool is the one that must not move in a general-basket
    // year. The combined figure cannot say that -- a general-basket year
    // may legitimately spend general carryforward, which is what it does
    // here, and asserting on the total called that a violation.
    const passivePeak = Math.max(...rows.map((r) => r.foreignTaxCarryforwardPassive));
    expect(passivePeak).toBeGreaterThan(1000);
    expect(general.every((r) => Math.abs(r.foreignTaxCarryforwardPassive - passivePeak) < 0.01)).toBe(true);
    // And the two pools account for the whole of it.
    expect(rows.every((r) => Math.abs((r.foreignTaxCarryforwardGeneral + r.foreignTaxCarryforwardPassive) - r.foreignTaxCarryforward) < 0.01)).toBe(true);
    // The first vintage (the move year) dies in its eleventh year. Read
    // off the passive pool, since that is the one the vintages are in --
    // the combined figure also carries a general sliver that gets spent
    // along the way.
    const cfPassive = (y) => rows.find((r) => r.year === y).foreignTaxCarryforwardPassive;
    expect(cfPassive(ABROAD + FTC_CARRYFORWARD_YEARS)).toBeCloseTo(passivePeak, 6);
    expect(cfPassive(ABROAD + FTC_CARRYFORWARD_YEARS + 1)).toBeLessThan(passivePeak - 100);
    expect(rows.at(-1).foreignTaxCarryforward).toBe(0);
  });

  it('a high-tax country: the credit stops at the US tax, and the excess carries forward', () => {
    const rows = abroadRows(rowsOf(withMoves(retiree, abroad({ ordinaryRate: 45, investmentRate: 45, taxesSocialSecurity: false }))));
    const capped = rows.filter((r) => r.foreignTaxCredit < (r.foreignTax - r.uncreditableForeignTax) - 1);
    expect(capped.length).toBeGreaterThan(10);
    expect(rows.every((r) => r.foreignTaxCredit <= r.federalTax + 1e-6)).toBe(true);
    expect(Math.max(...rows.map((r) => r.foreignTaxCarryforward))).toBeGreaterThan(1000);
  });

  it('NIIT is never reduced by foreign tax, however high the foreign tax', () => {
    // A household living ONLY on a large brokerage account -- no Social
    // Security, no pension, no Pre-Tax money -- so all its US income is in
    // the passive basket and the s 904 limit is the whole of its US regular
    // tax. With a foreign rate far above any US rate, every dollar of US
    // regular tax is credited. What must be left of federal tax is exactly
    // the 3.8% (Federal Circuit, Christensen, 2026-08-31).
    const investor = {
      ...retiree, ss1: 0, pension1: 0, preTaxInit: 0, rothInit: 0,
      taxableInit: 12000000, lifestyleExpense: 250000,
    };
    const rows = abroadRows(rowsOf(withMoves(investor, abroad({ ordinaryRate: 50, investmentRate: 50 }))));
    const dominated = rows.filter((r) => r.foreignTax > 2 * r.federalTax && r.federalTax > 0);
    expect(dominated.length).toBeGreaterThan(10);
    for (const r of dominated) {
      // With no ordinary income, MAGI is the dividends plus the realized
      // gains, so NIIT is exactly 3.8% of what they exceed $200,000 by
      // (single filer). That -- and only that -- survives the credit.
      const niit = 0.038 * Math.max(0, r.taxableDividends + r.realizedGains - 200000);
      expect(niit).toBeGreaterThan(1000);
      expect(r.federalTax - r.foreignTaxCredit).toBeCloseTo(niit, 2);
    }
  });

  it('priceForeignYear never lets the limit exceed US regular tax', () => {
    const ctx = {
      f: readForeignTerms({ ordinaryRate: 60, investmentRate: 60, roth: 'respect', treatyResourcing: true }),
      inflFactor: 1, fxFactor: 1, wages: 50000, pension: 40000, iraBase: 60000, rentalAnnuity: 0,
      ssGross: 30000, dividends: 80000, rothStart: 0, dividendYield: 0.02, cf: { general: 1e9, passive: 1e9 },
    };
    const p = priceForeignYear(ctx, { preTaxOrdinary: 20000, realizedGains: 40000, rothDraw: 0, rothEarnings: 0, usRegularTax: 30000, usOrdinaryIncome: 190000, usCapGains: 120000, usCapGainsTax: 18000 });
    expect(p.creditTotal).toBeLessThanOrEqual(30000 + 1e-9);
    expect(p.creditTotal).toBeGreaterThan(0);
  });
});

describe('the Roth', () => {
  const rothUser = { ...retiree, withdrawalStrategy: 'RothFirst', rothInit: 900000 };

  it('respected: no foreign tax on it', () => {
    expect(sum(rowsOf(withMoves(rothUser, abroad({ roth: 'respect' }))), 'foreignRothTax')).toBe(0);
  });

  it('taxed at a rate: that rate on every withdrawal, never credited', () => {
    const rows = abroadRows(rowsOf(withMoves(rothUser, abroad({ roth: 'rate', rothRate: 20 }))));
    const drawing = rows.filter((r) => r.drawRoth > 0);
    expect(drawing.length).toBeGreaterThan(3);
    expect(drawing.every((r) => Math.abs(r.foreignRothTax - 0.2 * r.drawRoth) < 0.01)).toBe(true);
    expect(rows.every((r) => r.uncreditableForeignTax >= r.foreignRothTax - 1e-9)).toBe(true);
  });

  it('treated as a taxable account: taxed every year, even when nothing is withdrawn', () => {
    const rows = abroadRows(rowsOf(withMoves(retiree, abroad({ roth: 'taxableAccount' }))));
    const idle = rows.filter((r) => r.drawRoth === 0 && r.rothStart > 0);
    expect(idle.length).toBeGreaterThan(3);
    expect(idle.every((r) => r.foreignRothTax > 0)).toBe(true);
  });

  it('a missing choice is read as the cautious one', () => {
    const [e] = readResidencyTimeline([{ fromYear: 2030, kind: 'foreign', foreign: {} }]);
    expect(e.foreign.roth).toBe('taxableAccount');
  });
});

describe('Social Security, health cover and Medicare abroad', () => {
  it('a treaty that exempts Social Security from US tax zeroes the taxable share abroad', () => {
    const taxed = abroadRows(rowsOf(withMoves(retiree, abroad())));
    const exempt = abroadRows(rowsOf(withMoves(retiree, abroad({ usExemptsSocialSecurity: true }))));
    expect(taxed.filter((r) => r.taxableSS > 0).length).toBeGreaterThan(10);
    expect(exempt.filter((r) => r.ssIncome > 0).length).toBeGreaterThan(10);
    expect(exempt.every((r) => r.taxableSS === 0)).toBe(true);
  });

  it('the ACA machinery is off abroad, even where the old state would trigger it', () => {
    // An early retiree whose income falls below the poverty line, who never
    // cut ties with Texas -- a non-expansion state. At home that is a
    // coverage gap and, with protection on, a forced conversion. Abroad
    // there is no marketplace, so neither can happen.
    const gapProne = {
      spouse2Enabled: false, filingStatus: 'Single', birthYear1: START - 56, retireAge1: 56,
      lifeExpectancy1: 90, claimingAge1: 70, ss1: 0, pension1: 0, salary1: 0, rentalIncome: 0,
      annuityIncome: 0, partTimeIncome1: 0, preTaxInit: 800000, rothInit: 200000, taxableInit: 200000,
      preTaxContribution1: 0, rothContribution1: 0, taxableContribution: 0, lifestyleExpense: 40000,
      withdrawalStrategy: 'RothFirst', rothConversionStrategy: 'none', taxBracketInflationRate: 0,
      inflationRate: 0, stateOfResidence: 'TX', stateTaxState: 'none', acaSubsidyProtectionEnabled: true,
    };
    const home = rowsOf(plan(gapProne));
    expect(home.filter((r) => r.acaSubsidyBoost > 0).length).toBeGreaterThan(0);
    const away = { ...abroad({}, { stateDomicileSevered: false }), fromYear: START };
    const rows = rowsOf(withMoves(gapProne, away));
    expect(rows.every((r) => r.residenceState === 'TX' && r.residenceCountry === 'Portugal')).toBe(true);
    expect(rows.every((r) => r.acaSubsidyBoost === 0 && !r.inAcaCoverageGap)).toBe(true);
  });

  it('abroad there is no ACA: no bridge, no gap flag, and the household\'s own health cost instead', () => {
    const early = { ...retiree, birthYear1: START - 58, retireAge1: 58, claimingAge1: 70 };
    const home = rowsOf(plan(early)).filter((r) => r.year >= ABROAD && r.age1 < 65);
    expect(home.every((r) => r.healthcareBridge > 0)).toBe(true);
    const rows = rowsOf(withMoves(early, abroad({ healthcareCost: 7000 })));
    const out = abroadRows(rows);
    expect(out.every((r) => r.healthcareBridge === 0 && !r.inAcaCoverageGap && r.foreignHealthcare >= 7000)).toBe(true);
    expect(rows.filter((r) => !r.residenceCountry).every((r) => r.foreignHealthcare === 0)).toBe(true);
    // ...and it is actually spent: the first year abroad costs exactly that
    // much more, outside of tax.
    const none = rowsOf(withMoves(early, abroad({ healthcareCost: 0 })));
    const first = (rs) => rs.find((r) => r.year === ABROAD);
    const nonTax = (r) => r.totalExpenses - r.totalTaxesPaid;
    expect(nonTax(first(rows)) - nonTax(first(none))).toBeCloseTo(first(rows).foreignHealthcare, 6);
  });

  describe('Medicare Part B', () => {
    const modest = { ...retiree, preTaxInit: 500000, taxableInit: 150000, rothInit: 50000, lifestyleExpense: 45000, ss1: 30000 };
    const RETURN = START + 10;
    const dropAndReturn = withMoves(modest, abroad({ medicarePartBRetained: false, ordinaryRate: 10, investmentRate: 10 }), { fromYear: RETURN, stateOfResidence: 'TX' });

    it('dropped abroad: no premium while away', () => {
      const out = abroadRows(rowsOf(dropAndReturn)).filter((r) => r.age1 >= 65);
      expect(out.length).toBe(RETURN - ABROAD);
      expect(out.every((r) => r.irmaaCost === 0 && r.medicarePartBDropped)).toBe(true);
    });

    it('on return: 10% of the standard premium per year without it, for life', () => {
      const back = rowsOf(dropAndReturn).filter((r) => r.year >= RETURN);
      const gap = RETURN - ABROAD; // 7 years, all past 65
      expect(back.length).toBeGreaterThan(10);
      for (const r of back) {
        // partBCost is the standard premium here (modest income, no IRMAA).
        expect(r.medicarePenalty / r.partBCost).toBeCloseTo(0.1 * gap, 6);
      }
      expect(back[0].partBCost).toBeGreaterThan(IRMAA_STANDARD_PREMIUM * 12);
    });

    it('kept abroad: no penalty ever', () => {
      const kept = withMoves(modest, abroad({ ordinaryRate: 10, investmentRate: 10 }), { fromYear: RETURN, stateOfResidence: 'TX' });
      const rows = rowsOf(kept);
      expect(rows.every((r) => r.medicarePenalty === 0)).toBe(true);
      expect(abroadRows(rows).filter((r) => r.age1 >= 65).every((r) => r.irmaaCost > 0)).toBe(true);
    });
  });
});

describe('the state that stays behind', () => {
  it('ties not cut: California keeps taxing you abroad', () => {
    const rows = abroadRows(rowsOf(withMoves(retiree, abroad({}, { stateDomicileSevered: false }))));
    expect(rows.every((r) => r.residenceState === 'CA')).toBe(true);
    // Every year with California-taxable income is taxed (late years living
    // on Social Security and Roth draws have none).
    expect(rows.filter((r) => r.stateTax > 0).length).toBeGreaterThan(15);
    expect(sum(rows, 'stateTax')).toBeGreaterThan(100000);
  });

  it('ties cut: no state tax, no state', () => {
    const rows = abroadRows(rowsOf(withMoves(retiree, abroad())));
    expect(rows.every((r) => r.stateTax === 0 && r.residenceState === null)).toBe(true);
  });

  it('the Texas route: leaving from Texas, even without cutting ties, owes no state tax', () => {
    const rows = rowsOf(withMoves(retiree,
      { fromYear: START + 1, stateOfResidence: 'TX' },
      abroad({}, { stateDomicileSevered: false })));
    expect(abroadRows(rows).every((r) => r.stateTax === 0 && r.residenceState === 'TX')).toBe(true);
    expect(rows.find((r) => r.year === START).stateTax).toBeGreaterThan(0);
  });
});

describe('the estate when the last year is abroad', () => {
  const wealthy = { ...retiree, preTaxInit: 3000000, taxableInit: 5000000, rothInit: 1000000, stateOfResidence: 'NY', stateTaxState: 'ny' };
  const light = { ordinaryRate: 10, investmentRate: 10 };
  const estateOf = (inputs) => {
    const l = rowsOf(inputs).at(-1);
    return calculateHeirEstateTax(inputs, l.preTaxEnd, l.rothEnd, l.taxableEnd);
  };

  it('ties cut: no state estate tax, and the country is named', () => {
    const e = estateOf(withMoves(wealthy, abroad(light)));
    expect(e.estateStateCode).toBe(null);
    expect(e.estateCountry).toBe('Portugal');
    expect(e.totalStateEstateTax).toBe(0);
    expect(e.totalForeignEstateTax).toBe(0);
  });

  it('ties not cut: New York still takes its estate tax', () => {
    const e = estateOf(withMoves(wealthy, abroad(light, { stateDomicileSevered: false })));
    expect(e.estateStateCode).toBe('NY');
    expect(e.totalStateEstateTax).toBeGreaterThan(0);
  });

  it('the blended estimate is that share of the estate, taken from what heirs receive', () => {
    const none = estateOf(withMoves(wealthy, abroad(light)));
    const ten = estateOf(withMoves(wealthy, abroad({ ...light, estateRate: 10 })));
    const twenty = estateOf(withMoves(wealthy, abroad({ ...light, estateRate: 20 })));
    expect(ten.totalForeignEstateTax).toBeGreaterThan(100000);
    expect(twenty.totalForeignEstateTax).toBeCloseTo(2 * ten.totalForeignEstateTax, 4);
    expect(none.netInherited - ten.netInherited).toBeCloseTo(ten.totalForeignEstateTax, 4);
    expect(ten.foreignEstateRatePct).toBe(10);
  });
});

describe('building blocks', () => {
  it('local brackets are in local currency, converted at the exchange rate', () => {
    // $20,000 at 2 units per dollar is 40,000 local: 0% to 10,000, then 20%.
    const ctx = {
      f: readForeignTerms({ taxMode: 'brackets', brackets: [{ upTo: 10000, rate: 0 }, { upTo: null, rate: 20 }], fxRate: 2, investmentRate: 0, roth: 'respect', taxesSocialSecurity: false }),
      inflFactor: 1, fxFactor: 2, wages: 0, pension: 20000, iraBase: 0, rentalAnnuity: 0, ssGross: 0,
      dividends: 0, rothStart: 0, dividendYield: 0, cf: { general: 0, passive: 0 },
    };
    const p = priceForeignYear(ctx, { preTaxOrdinary: 0, realizedGains: 0, rothDraw: 0, rothEarnings: 0, usRegularTax: 0, usOrdinaryIncome: 20000, usCapGains: 0, usCapGainsTax: 0 });
    expect(p.localTax).toBeCloseTo(3000, 9);
    expect(progressiveTax(40000, ctx.f.brackets, 1.5)).toBeCloseTo((40000 - 15000) * 0.2, 9);
  });

  it('contributions: the rate on income up to the cap, never credited', () => {
    const ctx = {
      f: readForeignTerms({ ordinaryRate: 0, investmentRate: 0, roth: 'respect', contributionRate: 10, contributionCap: 50000, treatyResourcing: true }),
      inflFactor: 1, fxFactor: 1, wages: 0, pension: 80000, iraBase: 0, rentalAnnuity: 0, ssGross: 0,
      dividends: 0, rothStart: 0, dividendYield: 0, cf: { general: 0, passive: 0 },
    };
    const p = priceForeignYear(ctx, { preTaxOrdinary: 0, realizedGains: 0, rothDraw: 0, rothEarnings: 0, usRegularTax: 20000, usOrdinaryIncome: 80000, usCapGains: 0, usCapGainsTax: 0 });
    expect(p.contributions).toBeCloseTo(5000, 9);
    expect(p.creditTotal).toBe(0);
  });

  it('carryforward: oldest first, gone after ten years', () => {
    let pools = { general: [], passive: [] };
    pools = settleFtcCarryforward(pools, 2030, { creditable: { general: 1000, passive: 0 }, credit: { general: 0, passive: 0 } });
    pools = settleFtcCarryforward(pools, 2031, { creditable: { general: 500, passive: 0 }, credit: { general: 0, passive: 0 } });
    expect(ftcCarryforwardAvailable(pools, 2031).general).toBe(1500);
    // Use 700 more than this year's 0 creditable: 700 comes off 2030 first.
    pools = settleFtcCarryforward(pools, 2032, { creditable: { general: 0, passive: 0 }, credit: { general: 700, passive: 0 } });
    expect(pools.general).toEqual([{ year: 2030, amount: 300 }, { year: 2031, amount: 500 }]);
    expect(ftcCarryforwardAvailable(pools, 2030 + FTC_CARRYFORWARD_YEARS).general).toBe(800);
    expect(ftcCarryforwardAvailable(pools, 2030 + FTC_CARRYFORWARD_YEARS + 1).general).toBe(500);
  });

  it('NIIT alone plus the rest is the old combined figure', () => {
    const args = [150000, 400000, 'Single', 1, 16100, 0, 0];
    const niit = calculateNetInvestmentIncomeTax(...args);
    expect(niit).toBeGreaterThan(0);
    expect(calculateCapitalGainsTaxes(...args) - niit).toBeGreaterThan(0);
  });

  it('a foreign move inherits the claim of the state before it, unless severed', () => {
    const planWide = { stateOfResidence: 'NY', stateTaxState: 'ny', stateTaxFlatRate: 5, stateTaxSocialSecurityTaxable: false, stateTaxPensionTaxable: true, nycResident: true, yonkersResident: false };
    const [kept] = readResidencyTimeline([{ fromYear: 2030, kind: 'foreign', foreign: { roth: 'respect' } }], planWide);
    expect([kept.stateOfResidence, kept.stateTaxState, kept.nycResident, kept.countryName]).toEqual(['NY', 'ny', true, 'Abroad']);
    const [cut] = readResidencyTimeline([{ fromYear: 2030, kind: 'foreign', stateDomicileSevered: true, foreign: {} }], planWide);
    expect([cut.stateOfResidence, cut.stateTaxState]).toEqual([null, 'none']);
  });
});
