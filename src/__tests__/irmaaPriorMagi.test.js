// Pre-plan prior-year MAGI (changelog 179) -- the last gap in the IRMAA
// two-year lookback shipped in changelog 121.
//
// THE GAP. Medicare prices a year off the return filed two years earlier.
// The engine has done that since 121, but for the plan's FIRST TWO YEARS it
// had no earlier year to read and fell back to each year's own MAGI. For a
// plan that starts at 63-65 those are precisely the years the surcharge
// bites hardest: the returns Medicare is actually reading are the
// working-income ones from before the plan began, and the plan was
// substituting a retired year's much smaller MAGI. It understated the
// premium exactly where it mattered most.
//
// The rule this file protects hardest: a blank box must mean "I don't know",
// never "$0 of income". A $0 return prices the standard premium, so treating
// a blank as $0 would hand people a cheaper answer for leaving a field
// empty -- the worst possible default.
import { describe, it, expect } from 'vitest';
import {
  runProjection, DEFAULT_INPUTS,
  IRMAA_STANDARD_PREMIUM, IRMAA_THRESHOLDS_SINGLE,
} from '../calculator';

// Single filer, 65 in the plan's first year, living modestly in retirement
// but with two big working-income returns behind them. Nothing inflated, so
// the 2026 thresholds apply throughout.
const JUST_RETIRED = {
  ...DEFAULT_INPUTS,
  planYear: 2026,
  spouse2Enabled: false,
  filingStatus: 'Single',
  birthYear1: 1961,          // 65 in 2026
  retireAge1: 65,
  lifeExpectancy1: 85,
  claimingAge1: 70,
  ss1: 30000,
  salary1: 0,
  pension1: 40000, pensionStartAge1: 65, pension1COLA: 0,
  preTaxInit: 400000, rothInit: 200000, taxableInit: 400000, hsaInit: 0,
  lifestyleExpense: 45000,
  stateTaxState: 'none',
  inflationRate: 0, taxBracketInflationRate: 0, ssCOLA: 0,
  medicarePartBInflationRate: 0, medicarePartDInflationRate: 0, medicalInflationRate: 0,
  irmaaLifeChangeAppealEnabled: false,
};

const monthly = (row) => row.partBCost / 12;

describe('the fixture is real', () => {
  it('uses only input keys the engine reads', () => {
    expect(Object.keys(JUST_RETIRED).filter(k => !(k in DEFAULT_INPUTS))).toEqual([]);
  });

  it('is on Medicare from the first projection year, or nothing below applies', () => {
    expect(runProjection(JUST_RETIRED).years[0].age1).toBe(65);
    expect(runProjection(JUST_RETIRED).years[0].irmaaCost).toBeGreaterThan(0);
  });
});

describe('without the pre-plan figures, the first two years read their own MAGI', () => {
  const res = runProjection(JUST_RETIRED);

  it('prices year 1 and 2 as "current" and pays the standard premium', () => {
    expect(res.years[0].irmaaBasisSource).toBe('current');
    expect(res.years[1].irmaaBasisSource).toBe('current');
    expect(monthly(res.years[0])).toBeCloseTo(IRMAA_STANDARD_PREMIUM, 2);
  });

  it('the third year picks up the lookback on its own, as before', () => {
    expect(res.years[2].irmaaBasisSource).toBe('lookback');
  });
});

describe('supplying the two returns prices those years the way Medicare does', () => {
  const withPrior = runProjection({
    ...JUST_RETIRED,
    irmaaTwoYearsPriorMagi: 260000, // the 2024 return -- still working
    irmaaPriorYearMagi: 250000,     // the 2025 return -- still working
  });

  it('year 1 is now priced off the return from two years before the plan', () => {
    const y0 = withPrior.years[0];
    expect(y0.irmaaBasisSource).toBe('lookback');
    expect(y0.irmaaBasisMagi).toBeCloseTo(260000, 6);
    expect(y0.irmaaBasisMagi).toBeGreaterThan(IRMAA_THRESHOLDS_SINGLE[3]);
    expect(monthly(y0)).toBeGreaterThan(IRMAA_STANDARD_PREMIUM);
  });

  it('year 2 reads the more recent pre-plan return', () => {
    const y1 = withPrior.years[1];
    expect(y1.irmaaBasisSource).toBe('lookback');
    expect(y1.irmaaBasisMagi).toBeCloseTo(250000, 6);
  });

  it('year 3 onward still reads the plan\'s own years, not the seeds', () => {
    const y2 = withPrior.years[2];
    expect(y2.irmaaBasisSource).toBe('lookback');
    expect(y2.irmaaBasisMagi).toBeCloseTo(withPrior.years[0].irmaaMagi, 6);
    // The seeds are behind us: this is a retired year's MAGI, far below the
    // working figures above.
    expect(y2.irmaaBasisMagi).toBeLessThan(100000);
  });

  it('costs this household real money the plan was not showing', () => {
    const without = runProjection(JUST_RETIRED);
    expect(withPrior.totalIRMAAPaid).toBeGreaterThan(without.totalIRMAAPaid);
    const firstTwoYearDelta =
      (withPrior.years[0].irmaaCost + withPrior.years[1].irmaaCost) -
      (without.years[0].irmaaCost + without.years[1].irmaaCost);
    expect(firstTwoYearDelta).toBeGreaterThan(3000);
  });
});

describe('a blank box means "I do not know", never "$0 of income"', () => {
  it('leaving BOTH blank changes nothing at all', () => {
    const a = runProjection(JUST_RETIRED);
    const b = runProjection({ ...JUST_RETIRED, irmaaTwoYearsPriorMagi: 0, irmaaPriorYearMagi: 0 });
    expect(a.years.map(y => Math.round(y.irmaaCost * 100)).join(','))
      .toBe(b.years.map(y => Math.round(y.irmaaCost * 100)).join(','));
    expect(b.years[0].irmaaBasisSource).toBe('current');
  });

  it('supplying only the OLDER return leaves the other year on its own MAGI', () => {
    const res = runProjection({ ...JUST_RETIRED, irmaaTwoYearsPriorMagi: 260000 });
    expect(res.years[0].irmaaBasisSource).toBe('lookback');
    expect(res.years[0].irmaaBasisMagi).toBeCloseTo(260000, 6);
    // Year 2's seed was never given: it must NOT be read as a $0 return,
    // which would price the standard premium off invented data.
    expect(res.years[1].irmaaBasisSource).toBe('current');
  });

  it('supplying only the MORE RECENT return does the mirror image', () => {
    const res = runProjection({ ...JUST_RETIRED, irmaaPriorYearMagi: 250000 });
    expect(res.years[0].irmaaBasisSource).toBe('current');
    expect(res.years[1].irmaaBasisSource).toBe('lookback');
    expect(res.years[1].irmaaBasisMagi).toBeCloseTo(250000, 6);
  });
});

describe('the seeds do not leak anywhere they should not', () => {
  it('a plan that starts before Medicare age is unaffected by them', () => {
    const young = { ...JUST_RETIRED, birthYear1: 1980, retireAge1: 60, claimingAge1: 67 };
    const a = runProjection(young);
    const b = runProjection({ ...young, irmaaTwoYearsPriorMagi: 500000, irmaaPriorYearMagi: 500000 });
    // Nobody is on Medicare in the first two years, so there is no premium
    // for a pre-plan return to change.
    expect(a.years[0].irmaaCost).toBe(0);
    expect(b.years[0].irmaaCost).toBe(0);
  });

  it('the appeal toggle OFF leaves the seeded lookback standing', () => {
    // The pre-plan anchor must be driven ONLY by the user asserting an
    // event via the toggle. With it off, the seeded working-income return
    // is what gets charged -- which is the whole point of the feature.
    const res = runProjection({
      ...JUST_RETIRED,
      irmaaTwoYearsPriorMagi: 260000,
      irmaaPriorYearMagi: 250000,
      irmaaLifeChangeAppealEnabled: false,
    });
    expect(res.years[0].irmaaBasisSource).toBe('lookback');
    expect(monthly(res.years[0])).toBeGreaterThan(IRMAA_STANDARD_PREMIUM);
  });

  it('tells a retired-at-start household the SSA-44 form is worth filing, toggle OFF', () => {
    // The badge and the Action Plan item exist to inform people who do NOT
    // already know about Form SSA-44. Reporting the saving only once the
    // toggle is on would be circular -- you would have to know about the
    // form to be told about the form. The saving is therefore computed
    // whether or not the toggle is set, exactly as it is for a household
    // whose retirement falls inside the projection.
    const res = runProjection({
      ...JUST_RETIRED,
      irmaaTwoYearsPriorMagi: 260000,
      irmaaPriorYearMagi: 250000,
      irmaaLifeChangeAppealEnabled: false,
    });
    expect(res.years[0].irmaaAppealSavings).toBeGreaterThan(0);
    // ...while the premium actually charged is still the un-appealed one.
    expect(res.years[0].irmaaBasisSource).toBe('lookback');
  });

  it('reports no saving where there is nothing to appeal', () => {
    // No seeds: the first two years have no lookback row at all, so there
    // is no higher premium for an appeal to undo and nothing is claimed.
    const res = runProjection(JUST_RETIRED);
    expect(res.years[0].irmaaAppealSavings || 0).toBe(0);
  });

  it('the pre-plan anchor does not fire for a household still working at plan start', () => {
    // Someone still working in year one has a real transition ahead of
    // them; the engine must find THAT, not assume a stoppage already
    // happened. Anchoring early would hand them an appeal window before
    // they had the qualifying event.
    const stillWorking = {
      ...JUST_RETIRED,
      birthYear1: 1961, retireAge1: 68, salary1: 260000, pension1: 0,
      irmaaLifeChangeAppealEnabled: true,
      irmaaTwoYearsPriorMagi: 260000,
      irmaaPriorYearMagi: 250000,
    };
    const res = runProjection(stillWorking);
    // Year one: on Medicare at 65, still earning, no event yet -- the
    // seeded return is charged rather than appealed away.
    expect(res.years[0].irmaaBasisSource).toBe('lookback');
    expect(res.years[0].irmaaBasisMagi).toBeCloseTo(260000, 6);
  });

  it('a household still WORKING at plan start gets no unearned appeal window', () => {
    // The discriminating case for the `isRetired` guard on the pre-plan
    // anchor. This household is 65 and on Medicare, still working, and
    // earning LESS now than on the seeded returns -- so if the anchor fired
    // for them, the appeal would find the current year cheaper and wipe out
    // a surcharge they have not had a life-changing event to appeal.
    //
    // An earlier version of this file could not tell the difference: its
    // still-working fixture earned MORE now than before, so the appeal
    // would not have lowered the premium anyway and the guard looked
    // load-bearing when it was not. Mutation testing caught that.
    const workingLessNow = {
      ...JUST_RETIRED,
      birthYear1: 1961, retireAge1: 68, pension1: 0,
      salary1: 60000,
      irmaaLifeChangeAppealEnabled: true,
      irmaaTwoYearsPriorMagi: 260000,
      irmaaPriorYearMagi: 250000,
    };
    const res = runProjection(workingLessNow);
    // No qualifying event has happened, so the seeded return stands.
    expect(res.years[0].irmaaBasisSource).toBe('lookback');
    expect(res.years[0].irmaaBasisMagi).toBeCloseTo(260000, 6);
    expect(monthly(res.years[0])).toBeGreaterThan(IRMAA_STANDARD_PREMIUM);
  });

  it('a Form SSA-44 appeal still overrides a seeded lookback', () => {
    // The appeal substitutes the current year when it is cheaper; a seeded
    // working-income return is exactly the case someone files against.
    const appealed = runProjection({
      ...JUST_RETIRED,
      irmaaTwoYearsPriorMagi: 260000,
      irmaaPriorYearMagi: 250000,
      irmaaLifeChangeAppealEnabled: true,
    });
    expect(appealed.years[0].irmaaBasisSource).toBe('appeal');
    expect(monthly(appealed.years[0])).toBeCloseTo(IRMAA_STANDARD_PREMIUM, 2);
  });
});
