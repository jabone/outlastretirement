// The 2026-10-23 tax review (changelog 457): five engine corrections.
//
// 1. ACA MAGI counts the taxable-earnings slice of a non-qualified Roth
//    draw, as IRMAA MAGI always did (s 36B(d)(2)(B) MAGI starts from AGI,
//    and those earnings are AGI). Until this fix a pre-59 1/2 household
//    drawing Roth near the 400% line was shown keeping a credit the IRS
//    would claw back in full.
// 2. A working survivor's benefit is subject to the Retirement Earnings
//    Test (42 U.S.C. 403(b)) -- the survivor branch used to escape the
//    test entirely, paying the whole benefit regardless of wages. The
//    withheld months are credited back at FRA through the survivor-claim
//    recomputation, like an own benefit's.
// 3. A Life-Event (milestone) Pre-Tax withdrawal counts toward the year's
//    RMD (Reg. s 1.401(a)(9)-5: any distribution during the year counts);
//    only the remainder is forced.
// 4. SS_ANNOUNCED 2026 COLA is SSA's announced 2.8%, not 2.5%.
// 5. A rothConversionBracket entered as a whole-number percent (22) in an
//    imported plan is read as the percent it plainly is (0.22) and listed
//    in invalidInputs, instead of silently targeting a $0 ceiling.
import { describe, it, expect } from 'vitest';
import {
  runProjection, DEFAULT_INPUTS, SS_ANNOUNCED, ssEarningsTestWithholding,
} from '../calculator';

const TX = { stateOfResidence: 'TX', stateTaxState: 'none' };

describe('ACA MAGI includes taxable Roth earnings (fix 1)', () => {
  const base = {
    ...DEFAULT_INPUTS,
    filingStatus: 'MFJ', spouse2Enabled: true, birthYear1: 1972, birthYear2: 1972,
    retireAge1: 54, retireAge2: 54, claimingAge1: 67, claimingAge2: 67,
    ss1: 20000, ss2: 10000, salary1: 100000, salary2: 0,
    preTaxInit: 200000, rothInit: 800000, taxableInit: 0, hsaInit: 0,
    withdrawalStrategy: 'RothFirst',
    currentSpendingMode: 'custom', currentHouseholdSpendingCustom: 70000,
    healthcareBridgeCost: 8000, ...TX,
  };

  it('a non-qualified Roth draw moves ACA MAGI by exactly its taxable earnings', () => {
    const noBasis = runProjection({ ...base, rothBasisInit: 0 });
    const allBasis = runProjection({ ...base, rothBasisInit: 800000 });
    const y = noBasis.years.find((r) => r.isRetired && r.age1 < 59 && (r.rothDrawEarningsTaxed || 0) > 0);
    expect(y).toBeTruthy();
    const same = allBasis.years.find((r) => r.year === y.year);
    // All-basis draws are return of contributions: no AGI, so no ACA MAGI.
    expect(y.acaMagi - same.acaMagi).toBeCloseTo(y.rothDrawEarningsTaxed, 0);
  });

  it('ACA MAGI and IRMAA MAGI agree on the Roth-earnings term', () => {
    const res = runProjection({ ...base, rothBasisInit: 0 });
    const y = res.years.find((r) => r.isRetired && r.age1 < 59 && (r.rothDrawEarningsTaxed || 0) > 0);
    // Same year, same draws: the two MAGIs differ only by untaxed SS (none
    // yet at 54) and settle-order rounding, never by the earnings term.
    expect(y.acaMagi).toBeCloseTo(y.irmaaMagi, 0);
  });
});

describe('the survivor benefit is earnings-tested (fix 2)', () => {
  // Spouse 2 dies at 66 having claimed at 62; spouse 1 (born 1965, FRA 67)
  // works to 70 on $60,000 and has no own benefit until 67, so ages 62-66
  // pay a pure survivor benefit against full-time wages.
  const base = {
    ...DEFAULT_INPUTS,
    filingStatus: 'MFJ', spouse2Enabled: true, birthYear1: 1965, birthYear2: 1960,
    retireAge1: 70, retireAge2: 65, claimingAge1: 67, claimingAge2: 62,
    ss1: 28000, ss2: 30000, salary1: 60000, salary2: 0,
    lifeExpectancy1: 90, lifeExpectancy2: 66,
    preTaxInit: 400000, rothInit: 0, taxableInit: 100000,
    currentSpendingMode: 'custom', currentHouseholdSpendingCustom: 60000, ...TX,
  };

  it('withholds $1 per $2 of wages over the exempt amount, capped at the benefit', () => {
    const res = runProjection(base);
    const y = res.years.find((r) => !r.spouse2Alive && r.age1 === 62);
    expect(y).toBeTruthy();
    expect(y.ssEarningsTestWithheld).toBeGreaterThan(0);
    // Reproduce the exact figure from the exported helper on this year's
    // wages and pre-test benefit.
    const preTest = y.ssIncome + y.ssEarningsTestWithheld;
    const t = ssEarningsTestWithholding(y.salary, preTest, y.age1, 67, y.inflFactor, y.year, base.inflationRate);
    expect(y.ssEarningsTestWithheld).toBeCloseTo(t.withheld, 2);
  });

  it('stops testing after the FRA year and gives the withheld months back', () => {
    const res = runProjection(base);
    const at68 = res.years.find((r) => r.age1 === 68);
    expect(at68.ssEarningsTestWithheld).toBe(0);
    // Every pre-FRA year was almost fully withheld, so the months credit
    // reprices the benefit well above the age-62 survivor amount: the paid
    // benefit at 68 is more than what the withheld years kept.
    const at62 = res.years.find((r) => r.age1 === 62);
    expect(at68.ssIncome).toBeGreaterThan(at62.ssIncome * 2);
  });

  it('a non-working survivor is untouched', () => {
    const res = runProjection({ ...base, salary1: 0, retireAge1: 60 });
    for (const r of res.years) {
      if (!r.spouse2Alive) expect(r.ssEarningsTestWithheld || 0).toBe(0);
    }
  });
});

describe('a Life-Event Pre-Tax withdrawal counts toward the RMD (fix 3)', () => {
  const base = {
    ...DEFAULT_INPUTS,
    filingStatus: 'Single', spouse2Enabled: false, birthYear1: 1950,
    retireAge1: 62, claimingAge1: 70, ss1: 0, salary1: 0,
    preTaxInit: 1000000, rothInit: 0, taxableInit: 500000,
    withdrawalStrategy: 'TaxableFirst',
    currentSpendingMode: 'custom', currentHouseholdSpendingCustom: 40000, ...TX,
  };
  const milestone = { id: 'm1', name: 'Roof', type: 'outflow', targetAccount: 'preTax', amount: 30000, isRecurring: false, startAge: 78, endAge: 78 };

  it('the forced RMD is the statutory amount less the milestone distribution', () => {
    const plain = runProjection(base);
    const withM = runProjection({ ...base, milestones: [milestone] });
    const a = plain.years.find((r) => r.age1 === 78);
    const b = withM.years.find((r) => r.age1 === 78);
    // The milestone is a today's-dollars figure inflated to the event year.
    const milestoneActual = 30000 * Math.pow(1.025, b.year - base.planYear);
    expect(a.rmdAmount - b.rmdAmount).toBeCloseTo(milestoneActual, 0);
    // Total distributed that year still satisfies the statutory RMD.
    expect(b.rmdAmount + milestoneActual).toBeCloseTo(a.rmdAmount, 0);
  });

  it('a milestone larger than the RMD leaves nothing forced', () => {
    const withBig = runProjection({ ...base, milestones: [{ ...milestone, amount: 200000 }] });
    const b = withBig.years.find((r) => r.age1 === 78);
    expect(b.rmdAmount).toBe(0);
  });

  it('years without a milestone are unchanged', () => {
    const plain = runProjection(base);
    const withM = runProjection({ ...base, milestones: [milestone] });
    const a77 = plain.years.find((r) => r.age1 === 77);
    const b77 = withM.years.find((r) => r.age1 === 77);
    expect(b77.rmdAmount).toBeCloseTo(a77.rmdAmount, 2);
  });
});

describe('SS_ANNOUNCED carries the announced 2026 COLA (fix 4)', () => {
  it('2026 is 2.8', () => {
    expect(SS_ANNOUNCED[2026].cola).toBe(2.8);
  });
});

describe('a whole-number conversion bracket is read as a percent (fix 5)', () => {
  const base = {
    ...DEFAULT_INPUTS,
    filingStatus: 'Single', spouse2Enabled: false, retireAge1: 60,
    rothConversionStrategy: 'maxBracket', preTaxInit: 900000, ...TX,
  };

  it('22 converts exactly what 0.22 converts, and the correction is listed', () => {
    const asFraction = runProjection({ ...base, rothConversionBracket: 0.22 });
    const asPercent = runProjection({ ...base, rothConversionBracket: 22 });
    const a = asFraction.years.find((r) => r.convertAmount > 0);
    const b = asPercent.years.find((r) => r.year === a.year);
    expect(b.convertAmount).toBeCloseTo(a.convertAmount, 2);
    expect(asPercent.invalidInputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'rothConversionBracket', reason: 'percent-as-whole-number', usedValue: 0.22 }),
    ]));
  });
});
