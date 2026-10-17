// A declared Form SSA-44 life-changing event (changelog 180).
//
// WHY THIS EXISTS AS AN INPUT RATHER THAN MORE DETECTION. SSA-44 recognizes
// eight events; this engine can see two -- a spouse stops working, and a
// spouse dies. The other six are not detection gaps. They are life events
// the model has no concept of: no marriage or divorce exists anywhere in
// the projection, there is no pension end age, rental income is a flat
// perpetual stream that never stops, and an employer settlement is not
// modeled. Even work REDUCTION is unreachable, because salary1 is a single
// constant with no mid-career change.
//
// Guessing harder could not have closed that. Letting someone say what
// happened, and when, closes all eight at once.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, IRMAA_STANDARD_PREMIUM } from '../calculator';

// The household this feature exists for, and it took two wrong fixtures to
// find it. It must satisfy four things at once: on Medicare (so a premium
// exists), a big pre-plan MAGI (so there is a surcharge worth appealing),
// small current income (so an appeal would actually lower it), and NO event
// the engine can see.
//
// That last one is the hard part. A household already retired at the plan's
// start is covered by the pre-plan anchor from changelog 179, so declaring
// an event changes nothing for them -- both of my first two fixtures failed
// for exactly that reason, and would have "passed" a broken implementation.
//
// The shape that works: retireAge still in the FUTURE (so `isRetired` is
// false and the pre-plan anchor stays shut) but salary already zero (so no
// stoppage is ever detected). That is precisely what losing a pension, a
// rental property, or a spouse's income in a divorce looks like to this
// engine -- income gone, for a reason it has no way to represent.
const INCOME_GONE_NO_EVENT = {
  ...DEFAULT_INPUTS,
  planYear: 2026,
  spouse2Enabled: false,
  filingStatus: 'Single',
  birthYear1: 1961,          // 65 in 2026
  retireAge1: 70,            // still "working age" to the engine...
  lifeExpectancy1: 88,
  claimingAge1: 70,
  ss1: 30000,
  salary1: 0,                // ...but the income is already gone
  pension1: 20000, pensionStartAge1: 60, pension1COLA: 0,
  preTaxInit: 400000, rothInit: 200000, taxableInit: 400000, hsaInit: 0,
  lifestyleExpense: 45000,
  stateTaxState: 'none',
  inflationRate: 0, taxBracketInflationRate: 0, ssCOLA: 0,
  medicarePartBInflationRate: 0, medicarePartDInflationRate: 0, medicalInflationRate: 0,
  // High pre-plan returns, so there is a surcharge worth appealing.
  irmaaTwoYearsPriorMagi: 260000,
  irmaaPriorYearMagi: 250000,
  irmaaLifeChangeAppealEnabled: true,
};

const monthly = (row) => row.partBCost / 12;
const at = (res, year) => res.years.find(y => y.year === year);

describe('the fixture is real', () => {
  it('uses only input keys the engine reads', () => {
    expect(Object.keys(INCOME_GONE_NO_EVENT).filter(k => !(k in DEFAULT_INPUTS))).toEqual([]);
  });
});

describe('declaring nothing leaves every existing plan alone', () => {
  it('an undeclared plan is bit-for-bit identical to one with the field at 0', () => {
    const a = runProjection(INCOME_GONE_NO_EVENT);
    const b = runProjection({ ...INCOME_GONE_NO_EVENT, irmaaLifeChangeEventYear: 0, irmaaLifeChangeEventType: '' });
    const f = r => r.years.map(y => [Math.round(y.irmaaCost * 100), y.irmaaBasisSource, Math.round((y.irmaaAppealSavings || 0) * 100)].join('|')).join(',');
    expect(f(a)).toBe(f(b));
  });
});

describe('a declared event opens the appeal window SSA-44 gives', () => {
  // Someone whose DIVORCE — an event the engine cannot see at all — was the
  // year before the plan started.
  const declared = {
    ...INCOME_GONE_NO_EVENT,
    irmaaLifeChangeEventYear: 2025,
    irmaaLifeChangeEventType: 'divorce',
  };

  it('applies the appeal in the declared year and the two years after it', () => {
    const res = runProjection(declared);
    expect(at(res, 2026).irmaaBasisSource).toBe('appeal');
    expect(at(res, 2027).irmaaBasisSource).toBe('appeal');
    expect(monthly(at(res, 2026))).toBeCloseTo(IRMAA_STANDARD_PREMIUM, 2);
  });

  it('the window closes after event + 2, and the ordinary rule resumes', () => {
    const res = runProjection(declared);
    // 2025 + 2 = 2027 is the last year inside the window.
    expect(at(res, 2028).irmaaBasisSource).toBe('lookback');
  });

  it('is worth real money against the same plan with nothing declared', () => {
    const without = runProjection(INCOME_GONE_NO_EVENT);
    const withIt = runProjection(declared);
    // Every year of `without` is priced off the lookback: the engine can
    // see no event at all for this household.
    expect(without.years.slice(0, 4).every(y => y.irmaaBasisSource === 'lookback')).toBe(true);
    expect(withIt.totalIRMAAPaid).toBeLessThan(without.totalIRMAAPaid);
    // Not a rounding difference -- two years of a real surcharge.
    expect(without.totalIRMAAPaid - withIt.totalIRMAAPaid).toBeGreaterThan(5000);
  });
});

describe('a declared event never invents a saving that is not there', () => {
  it('does nothing when the current year prices HIGHER than the lookback', () => {
    // Declaring an event cannot raise a premium: the engine only ever
    // substitutes the current year when it is cheaper. Here the pre-plan
    // returns are modest and this year's income is large.
    const richNow = {
      ...INCOME_GONE_NO_EVENT,
      irmaaTwoYearsPriorMagi: 30000,
      irmaaPriorYearMagi: 30000,
      pension1: 300000,
      irmaaLifeChangeEventYear: 2025,
      irmaaLifeChangeEventType: 'workReduction',
    };
    const res = runProjection(richNow);
    expect(at(res, 2026).irmaaBasisSource).toBe('lookback');
    expect(at(res, 2026).irmaaAppealSavings || 0).toBe(0);
  });

  it('a year declared in the FUTURE does not reach backwards', () => {
    const later = { ...INCOME_GONE_NO_EVENT, irmaaLifeChangeEventYear: 2032, irmaaLifeChangeEventType: 'lossOfPension' };
    const res = runProjection(later);
    // 2026 is years before the declared event, so the seeded lookback
    // stands and the surcharge is charged in full.
    expect(at(res, 2026).irmaaBasisSource).toBe('lookback');
    expect(at(res, 2027).irmaaBasisSource).toBe('lookback');
    expect(monthly(at(res, 2026))).toBeGreaterThan(IRMAA_STANDARD_PREMIUM);
  });
});

describe('declared and detected events coexist, and the LATEST one wins', () => {
  // Works on a big salary to 67, then stops -- a stoppage the engine sees
  // for itself in 2028 -- while ALSO declaring a marriage back in 2026.
  const both = {
    ...INCOME_GONE_NO_EVENT,
    retireAge1: 67, salary1: 260000, pension1: 0,
    irmaaLifeChangeEventYear: 2026,
    irmaaLifeChangeEventType: 'marriage',
  };

  it('an earlier declared event does not shorten the later detected window', () => {
    const res = runProjection(both);
    const stopYear = res.years.find(y => y.age1 === 67).year; // 2028
    // The detected stoppage opens 2028-2030. If the earlier declared year
    // were allowed to overwrite it, the window would close at 2028 and this
    // year would fall outside -- which is exactly what removing the
    // `declared > lastIrmaaLifeChangeYear` guard does.
    expect(at(res, stopYear).irmaaBasisSource).toBe('appeal');
    expect(at(res, stopYear + 1).irmaaBasisSource).toBe('appeal');
  });

  it('matches the same plan with nothing declared, because the stoppage rules', () => {
    const detectedOnly = { ...both, irmaaLifeChangeEventYear: 0, irmaaLifeChangeEventType: '' };
    const a = runProjection(both);
    const b = runProjection(detectedOnly);
    // The declared event is not competing with the stoppage; in the years
    // it covers, this household is still earning and an appeal would not
    // lower anything, so the two plans agree throughout.
    const f = r => r.years.map(y => y.irmaaBasisSource).join(',');
    expect(f(a)).toBe(f(b));
  });
});

describe('the event type is display only', () => {
  it('changes no number in the projection', () => {
    const f = (type) => runProjection({ ...INCOME_GONE_NO_EVENT, irmaaLifeChangeEventYear: 2025, irmaaLifeChangeEventType: type })
      .years.map(y => Math.round(y.irmaaCost * 100)).join(',');
    // Every one of the eight, plus an empty string, must produce the same
    // arithmetic. If a future change makes the type load-bearing, this is
    // what objects.
    const types = ['', 'marriage', 'divorce', 'deathOfSpouse', 'workStoppage', 'workReduction', 'lossOfIncomeProperty', 'lossOfPension', 'employerSettlement'];
    const results = new Set(types.map(f));
    expect(results.size).toBe(1);
    expect(types).toHaveLength(9);
  });
});
