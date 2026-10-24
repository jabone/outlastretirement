// Changelog 195 / RELOCATION_SPEC.md rung 1: the residency timeline.
//
// The plan used to have ONE state for its whole life. A household that
// moved -- California to Texas at retirement, say -- could only pick one,
// so every year was priced in the wrong state on one side of the move, and
// the estate was taxed by the state the household lived in on day one, not
// the state it lived in at the end.
//
// These tests pin four things:
//   1. The regression contract: no timeline means nothing changes.
//   2. The move year itself -- the year before prices in the old state, the
//      year of the move in the new one, and the years before the move are
//      untouched by it.
//   3. Every seam the move has to reach: base state tax, the withdrawal
//      solver (flat rate and the Yonkers surcharge travel separately from
//      the jurisdiction), the ACA non-expansion check, and the estate.
//   4. The normalizer, because sanitizeInputs passes structured inputs
//      through unchecked.
//
// Every fixture key is checked against DEFAULT_INPUTS -- a misspelled key
// gets default behavior and passes green while asserting nothing (see
// DEVELOPMENT.md).
import { describe, it, expect } from 'vitest';
import {
  runProjection, calculateHeirEstateTax, DEFAULT_INPUTS,
  readResidencyTimeline, residenceForYear, stateTaxJurisdictionFor, planHorizonYear,
} from '../calculator';

const plan = (over) => {
  for (const k of Object.keys(over)) {
    if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  }
  return { ...DEFAULT_INPUTS, ...over };
};

const START = DEFAULT_INPUTS.planYear;

// Income in every year -- wages, then a pension, SS and Pre-Tax draws -- so
// every state that taxes anything has something to tax on both sides of a
// move.
const earner = {
  birthYear1: START - 55, retireAge1: 62, lifeExpectancy1: 90, claimingAge1: 67,
  salary1: 160000, pension1: 30000, pensionStartAge1: 62, ss1: 34000,
  preTaxInit: 1200000, rothInit: 100000, taxableInit: 300000,
  withdrawalStrategy: 'PreTaxFirst',
};
const MOVE = START + 10;
const move = (over) => ({ id: 'm1', fromYear: MOVE, kind: 'domestic', ...over });

const rowsOf = (inputs) => runProjection(inputs).years;
const before = (rows) => rows.filter((r) => r.year < MOVE);
const after = (rows) => rows.filter((r) => r.year >= MOVE);

describe('the regression contract', () => {
  it('an empty timeline and a missing one produce identical projections', () => {
    const inputs = plan({ ...earner, stateTaxState: 'ca', stateOfResidence: 'CA' });
    const { residencyTimeline, ...withoutKey } = inputs;
    expect(residencyTimeline).toEqual([]);
    expect(runProjection(inputs)).toEqual(runProjection(withoutKey));
  });

  it('a timeline of nothing but unusable entries changes nothing', () => {
    const inputs = plan({ ...earner, stateTaxState: 'ca', stateOfResidence: 'CA' });
    const junk = plan({
      ...earner, stateTaxState: 'ca', stateOfResidence: 'CA',
      residencyTimeline: [null, 'TX', { fromYear: MOVE }, { stateOfResidence: 'TX' }, { fromYear: MOVE, stateOfResidence: 'PT', kind: 'overseas' }],
    });
    expect(runProjection(junk)).toEqual(runProjection(inputs));
  });

  it('every row reports the plan-wide state when nobody moves', () => {
    const rows = rowsOf(plan({ ...earner, stateTaxState: 'il', stateOfResidence: 'IL' }));
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.every((r) => r.residenceState === 'IL' && r.stateTaxJurisdiction === 'il')).toBe(true);
  });
});

describe('the move year', () => {
  const stay = plan({ ...earner, stateTaxState: 'ca', stateOfResidence: 'CA' });
  const leave = plan({ ...stay, residencyTimeline: [move({ stateOfResidence: 'TX' })] });

  it('California before the move, no state tax from the move year on', () => {
    const rows = rowsOf(leave);
    expect(before(rows).length).toBe(10);
    expect(before(rows).every((r) => r.stateTax > 0 && r.residenceState === 'CA')).toBe(true);
    expect(after(rows).length).toBeGreaterThan(15);
    expect(after(rows).every((r) => r.stateTax === 0 && r.residenceState === 'TX' && r.stateTaxJurisdiction === 'none')).toBe(true);
  });

  it('the years before the move are exactly what staying would have produced', () => {
    const moved = before(rowsOf(leave));
    const stayed = before(rowsOf(stay));
    moved.forEach((row, i) => {
      const { residenceState: a, ...m } = row;
      const { residenceState: b, ...s } = stayed[i];
      expect(a).toBe(b);
      expect(m).toEqual(s);
    });
  });

  it('works in the other direction too', () => {
    const rows = rowsOf(plan({
      ...earner, stateTaxState: 'none', stateOfResidence: 'TX',
      residencyTimeline: [move({ stateOfResidence: 'CA' })],
    }));
    expect(before(rows).every((r) => r.stateTax === 0)).toBe(true);
    expect(after(rows).every((r) => r.stateTax > 0 && r.stateTaxJurisdiction === 'ca')).toBe(true);
  });

  it('two moves step through three states', () => {
    const rows = rowsOf(plan({
      ...earner, stateTaxState: 'ca', stateOfResidence: 'CA',
      residencyTimeline: [
        { fromYear: START + 20, stateOfResidence: 'PA' },
        { fromYear: START + 5, stateOfResidence: 'TX' },
      ],
    }));
    const at = (y) => rows.find((r) => r.year === y).residenceState;
    expect([at(START), at(START + 4), at(START + 5), at(START + 19), at(START + 20), at(START + 30)])
      .toEqual(['CA', 'CA', 'TX', 'TX', 'PA', 'PA']);
  });

  it('saves real money: leaving California lowers lifetime tax', () => {
    const stayed = runProjection(stay).totalTaxesPaid;
    const moved = runProjection(leave).totalTaxesPaid;
    expect(moved).toBeLessThan(stayed - 50000);
  });
});

describe('every seam follows the move', () => {
  // A retiree who funds every year from Pre-Tax draws, so the withdrawal
  // solver prices state tax on both sides of the move. (The wage-earner
  // fixture above is covered by RMDs most years and rarely draws.)
  const drawer = {
    birthYear1: START - 62, retireAge1: 62, lifeExpectancy1: 90, claimingAge1: 67,
    salary1: 0, pension1: 0, ss1: 30000,
    preTaxInit: 2500000, rothInit: 0, taxableInit: 0,
    lifestyleExpense: 120000, withdrawalStrategy: 'PreTaxFirst',
  };
  const DRAW_MOVE = START + 5;
  const afterDraw = (rows) => rows.filter((r) => r.year >= DRAW_MOVE);
  const beforeDraw = (rows) => rows.filter((r) => r.year < DRAW_MOVE);
  const sumOf = (rows, k) => rows.reduce((t, r) => t + r[k], 0);

  it('the withdrawal solver prices the NEW state\'s flat rate, not the old one', () => {
    // Both plans start at 5% flat and differ ONLY in the rate of the state
    // they move to. The solver's own draw tax (extraTaxState) must see it.
    const base = { ...drawer, stateTaxState: 'flat_5', stateTaxFlatRate: 5, stateOfResidence: 'OR' };
    const to = (rate) => rowsOf(plan({ ...base, residencyTimeline: [{ fromYear: DRAW_MOVE, stateOfResidence: 'OR', stateTaxState: 'flat_5', stateTaxFlatRate: rate }] }));
    const low = to(2);
    const high = to(9);
    expect(beforeDraw(high).every((r) => r.extraTaxState > 0)).toBe(true);
    expect(afterDraw(high).filter((r) => r.extraTaxState > 0).length).toBeGreaterThan(10);
    // Identical before the move...
    expect(sumOf(beforeDraw(high), 'extraTaxState')).toBeCloseTo(sumOf(beforeDraw(low), 'extraTaxState'), 6);
    // ...and roughly 9/2 apart after it, in the solver's draw tax.
    expect(sumOf(afterDraw(high), 'extraTaxState')).toBeGreaterThan(sumOf(afterDraw(low), 'extraTaxState') * 3);
  });

  it('the Yonkers surcharge applies after a move to Yonkers, in the solver too', () => {
    const base = { ...drawer, stateTaxState: 'none', stateOfResidence: 'TX' };
    const ny = rowsOf(plan({ ...base, residencyTimeline: [{ fromYear: DRAW_MOVE, stateOfResidence: 'NY' }] }));
    const yk = rowsOf(plan({ ...base, residencyTimeline: [{ fromYear: DRAW_MOVE, stateOfResidence: 'NY', yonkersResident: true }] }));
    expect(sumOf(afterDraw(ny), 'extraTaxState')).toBeGreaterThan(0);
    expect(sumOf(afterDraw(yk), 'extraTaxState')).toBeGreaterThan(sumOf(afterDraw(ny), 'extraTaxState') * 1.05);
    expect(sumOf(beforeDraw(yk), 'stateTax')).toBe(0);
  });

  it('the state flag for Social Security follows the move', () => {
    const base = { ...earner, stateTaxState: 'flat_5', stateOfResidence: 'OR' };
    const exempt = rowsOf(plan({ ...base, residencyTimeline: [move({ stateOfResidence: 'OR', stateTaxState: 'flat_5', stateTaxSocialSecurityTaxable: false })] }));
    const taxed = rowsOf(plan({ ...base, residencyTimeline: [move({ stateOfResidence: 'OR', stateTaxState: 'flat_5', stateTaxSocialSecurityTaxable: true })] }));
    const lastYear = (rows) => rows[rows.length - 1];
    expect(lastYear(taxed).baseStateTax).toBeGreaterThan(lastYear(exempt).baseStateTax);
  });

  describe('the ACA coverage-gap check uses the state you live in that year', () => {
    // An early retiree whose income falls below 100% FPL: flagged in a
    // non-expansion state (TX), never in an expansion state (CA).
    // (Same fixture as calculator.test.js's coverage-gap suite.)
    const gapProne = {
      spouse2Enabled: false, filingStatus: 'Single', birthYear1: START - 56, retireAge1: 56,
      lifeExpectancy1: 90, claimingAge1: 70,
      ss1: 0, ss2: 0, pension1: 0, pension2: 0, rentalIncome: 0, annuityIncome: 0,
      salary1: 0, salary2: 0, partTimeIncome1: 0, partTimeIncome2: 0,
      preTaxInit: 800000, rothInit: 200000, taxableInit: 200000,
      // All basis, so the pre-59 1/2 Roth draws are return of contributions
      // and keep ACA MAGI under the poverty line (a draw of EARNINGS is AGI
      // and so ACA MAGI since the 2026-10-23 review).
      rothBasisInit: 200000,
      preTaxContribution1: 0, preTaxContribution2: 0, rothContribution1: 0, rothContribution2: 0, taxableContribution: 0,
      lifestyleExpense: 40000, withdrawalStrategy: 'RothFirst', rothConversionStrategy: 'none',
      taxBracketInflationRate: 0, inflationRate: 0, acaSubsidyProtectionEnabled: false,
    };
    // The gap years for this fixture are its first three (ages 56-58).
    const GAP_MOVE = START + 1;
    const gapYears = (rows) => rows.filter((r) => r.inAcaCoverageGap).map((r) => r.year);

    it('moving INTO a non-expansion state starts the gap in the move year', () => {
      const rows = rowsOf(plan({ ...gapProne, stateOfResidence: 'CA', residencyTimeline: [{ fromYear: GAP_MOVE, stateOfResidence: 'TX' }] }));
      expect(gapYears(rows)).toEqual([START + 1, START + 2]);
    });

    it('moving OUT of one ends it', () => {
      expect(gapYears(rowsOf(plan({ ...gapProne, stateOfResidence: 'TX' })))).toEqual([START, START + 1, START + 2]);
      const rows = rowsOf(plan({ ...gapProne, stateOfResidence: 'TX', residencyTimeline: [{ fromYear: GAP_MOVE, stateOfResidence: 'CA' }] }));
      expect(gapYears(rows)).toEqual([START]);
    });
  });
});

describe('a move in the first year is the same as living there all along', () => {
  // The strongest check on the call sites: if ANY of them still read the
  // plan-wide state inputs instead of the year's residence, this plan --
  // whose plan-wide state is deliberately Texas -- would price something
  // in Texas and diverge from the one that lives in the destination
  // plan-wide. Each shape drives a different seam.
  const texasPlanWide = {
    stateOfResidence: 'TX', stateTaxState: 'none', stateTaxFlatRate: 5,
    stateTaxSocialSecurityTaxable: false, stateTaxPensionTaxable: true,
    nycResident: false, yonkersResident: false,
  };
  const early = {
    birthYear1: START - 50, retireAge1: 50, lifeExpectancy1: 90, claimingAge1: 67,
    salary1: 0, ss1: 30000, preTaxInit: 2000000, rothInit: 0, taxableInit: 0,
    lifestyleExpense: 90000, withdrawalStrategy: 'PreTaxFirst',
  };
  const acaBoost = {
    spouse2Enabled: false, filingStatus: 'Single', birthYear1: START - 56, retireAge1: 56,
    lifeExpectancy1: 90, claimingAge1: 70, ss1: 0, pension1: 0, salary1: 0, rentalIncome: 0,
    annuityIncome: 0, partTimeIncome1: 0, preTaxInit: 800000, rothInit: 200000, taxableInit: 200000,
    // The Roth draws must be return of contributions: a pre-59 1/2 draw of
    // EARNINGS is AGI and so ACA MAGI (the 2026-10-23 review), which would
    // lift this household over the poverty line and leave no boost to test.
    rothBasisInit: 200000,
    preTaxContribution1: 0, rothContribution1: 0, taxableContribution: 0, lifestyleExpense: 40000,
    withdrawalStrategy: 'RothFirst', rothConversionStrategy: 'none', taxBracketInflationRate: 0,
    inflationRate: 0, acaSubsidyProtectionEnabled: true,
  };
  const wealthy = { ...earner, preTaxInit: 6000000, taxableInit: 4000000 };
  const CASES = {
    'California, drawing before 59.5 (the state early-distribution tax)': [early, { stateOfResidence: 'CA', stateTaxState: 'ca' }],
    'New York City (the city tax rides in the year\'s extras)': [earner, { stateOfResidence: 'NY', stateTaxState: 'ny', nycResident: true }],
    'Yonkers (the surcharge, base and solver)': [early, { stateOfResidence: 'NY', stateTaxState: 'ny', yonkersResident: true }],
    'a flat-rate state taxing Social Security but not pensions': [earner, { stateOfResidence: 'OR', stateTaxState: 'flat_5', stateTaxFlatRate: 8.75, stateTaxSocialSecurityTaxable: true, stateTaxPensionTaxable: false }],
    'Georgia with ACA protection (the conversion is priced in the new state)': [acaBoost, { stateOfResidence: 'GA', stateTaxState: 'flat_5', stateTaxFlatRate: 5.39 }],
    'California with fixed Roth conversions (the conversion-cost counterfactual)': [{ ...earner, rothConversionStrategy: 'fixed', rothConversionAmount: 60000, rothConversionDelayUntilRetire: false }, { stateOfResidence: 'CA', stateTaxState: 'ca' }],
    'New York estate tax': [wealthy, { stateOfResidence: 'NY', stateTaxState: 'ny' }],
    'Pennsylvania inheritance tax': [wealthy, { stateOfResidence: 'PA', stateTaxState: 'pa' }],
  };

  for (const [name, [shape, dest]] of Object.entries(CASES)) {
    it(name, () => {
      const lived = plan({ ...shape, ...texasPlanWide, ...dest });
      const moved = plan({ ...shape, ...texasPlanWide, residencyTimeline: [{ fromYear: START, ...dest }] });
      const a = runProjection(lived);
      const b = runProjection(moved);
      expect(b.years).toEqual(a.years);
      expect(b.totalTaxesPaid).toBe(a.totalTaxesPaid);
      const last = a.years.at(-1);
      const ea = calculateHeirEstateTax(lived, last.preTaxEnd, last.rothEnd, last.taxableEnd);
      const eb = calculateHeirEstateTax(moved, last.preTaxEnd, last.rothEnd, last.taxableEnd);
      expect(eb).toEqual(ea);
    });
  }

  it('and each case really does exercise its seam', () => {
    const rowsFor = ([shape, dest]) => rowsOf(plan({ ...shape, ...texasPlanWide, ...dest }));
    const c = Object.values(CASES);
    // Early draws in California owe more state tax than the same draws at 60+.
    expect(rowsFor(c[0]).filter((r) => r.age1 < 59.5 && r.extraTaxState > 0).length).toBeGreaterThan(5);
    expect(rowsFor(c[4]).filter((r) => r.acaSubsidyBoost > 0 && r.stateTax > 0).length).toBeGreaterThan(0);
    const est = (i) => { const [shape, dest] = c[i]; const inp = plan({ ...shape, ...texasPlanWide, ...dest }); const l = rowsOf(inp).at(-1); return calculateHeirEstateTax(inp, l.preTaxEnd, l.rothEnd, l.taxableEnd).totalStateEstateTax; };
    expect(rowsFor(c[5]).filter((r) => r.conversionTaxCost > 0).length).toBeGreaterThan(5);
    expect(est(6)).toBeGreaterThan(0);
    expect(est(7)).toBeGreaterThan(0);
  });
});

describe('the estate is taxed by the state you die in', () => {
  // Large enough to clear New York's exemption.
  const wealthy = { ...earner, preTaxInit: 6000000, taxableInit: 4000000, stateTaxState: 'ny', stateOfResidence: 'NY' };
  const estateOf = (inputs) => {
    const last = rowsOf(inputs).at(-1);
    return calculateHeirEstateTax(inputs, last.preTaxEnd, last.rothEnd, last.taxableEnd);
  };

  it('staying in New York owes New York estate tax', () => {
    const e = estateOf(plan(wealthy));
    expect(e.estateStateCode).toBe('NY');
    expect(e.totalStateEstateTax).toBeGreaterThan(0);
  });

  it('retiring to Florida owes none', () => {
    const e = estateOf(plan({ ...wealthy, residencyTimeline: [move({ stateOfResidence: 'FL' })] }));
    expect(e.estateStateCode).toBe('FL');
    expect(e.totalStateEstateTax).toBe(0);
  });

  it('a move planned after the plan ends does not count', () => {
    const inputs = plan({ ...wealthy });
    const late = plan({ ...wealthy, residencyTimeline: [{ fromYear: planHorizonYear(inputs) + 1, stateOfResidence: 'FL' }] });
    const e = estateOf(late);
    expect(e.estateStateCode).toBe('NY');
    expect(e.totalStateEstateTax).toBeGreaterThan(0);
  });

  it('a move INTO an estate-tax state in the final year does count', () => {
    const base = plan({ ...wealthy, stateTaxState: 'none', stateOfResidence: 'FL' });
    expect(estateOf(base).totalStateEstateTax).toBe(0);
    const e = estateOf(plan({ ...base, residencyTimeline: [{ fromYear: planHorizonYear(base), stateOfResidence: 'NY' }] }));
    expect(e.estateStateCode).toBe('NY');
    expect(e.totalStateEstateTax).toBeGreaterThan(0);
  });

  it('planHorizonYear is the projection\'s last year', () => {
    const inputs = plan(earner);
    expect(planHorizonYear(inputs)).toBe(rowsOf(inputs).at(-1).year);
    const couple = plan({ ...earner, spouse2Enabled: true, filingStatus: 'MFJ', birthYear2: START - 50, lifeExpectancy2: 95 });
    expect(planHorizonYear(couple)).toBe(rowsOf(couple).at(-1).year);
  });
});

describe('readResidencyTimeline', () => {
  it('returns [] for anything that is not an array', () => {
    for (const bad of [undefined, null, 'TX', 42, { fromYear: 2030 }]) {
      expect(readResidencyTimeline(bad)).toEqual([]);
    }
  });

  it('sorts by year, keeps the later entry for a repeated year, drops the unusable', () => {
    const t = readResidencyTimeline([
      { id: 'b', fromYear: 2040, stateOfResidence: 'fl' },
      { id: 'x', fromYear: 'soon', stateOfResidence: 'TX' },
      { id: 'y', fromYear: 2035, stateOfResidence: 'Texas' },
      { id: 'z', fromYear: 2035, stateOfResidence: 'PT', kind: 'overseas' },
      { id: 'a1', fromYear: 2030, stateOfResidence: 'CA' },
      { id: 'a2', fromYear: 2030, stateOfResidence: 'NV' },
    ]);
    expect(t.map((e) => [e.id, e.fromYear, e.stateOfResidence])).toEqual([['a2', 2030, 'NV'], ['b', 2040, 'FL']]);
  });

  it('derives the tax jurisdiction from the state unless one is given', () => {
    const [ca, or, va, keep] = readResidencyTimeline([
      { fromYear: 2030, stateOfResidence: 'CA' },
      { fromYear: 2031, stateOfResidence: 'OR' },
      { fromYear: 2032, stateOfResidence: 'VA' },
      { fromYear: 2033, stateOfResidence: 'OR', stateTaxState: 'none' },
    ]);
    expect([ca.stateTaxState, or.stateTaxState, va.stateTaxState, keep.stateTaxState]).toEqual(['ca', 'state_rules', 'va', 'none']);
    expect(or.stateTaxFlatRate).toBe(DEFAULT_INPUTS.stateTaxFlatRate);
  });

  it('keeps NYC and Yonkers only in New York, and never both', () => {
    const [both, notNy] = readResidencyTimeline([
      { fromYear: 2030, stateOfResidence: 'NY', nycResident: true, yonkersResident: true },
      { fromYear: 2031, stateOfResidence: 'NJ', nycResident: true, yonkersResident: true },
    ]);
    expect([both.nycResident, both.yonkersResident]).toEqual([true, false]);
    expect([notNy.nycResident, notNy.yonkersResident]).toEqual([false, false]);
  });

  it('residenceForYear falls back to the plan-wide state before the first move', () => {
    const inputs = plan({ stateOfResidence: 'CA', stateTaxState: 'ca', residencyTimeline: [{ fromYear: 2040, stateOfResidence: 'TX' }] });
    expect(residenceForYear(inputs, 2039).stateOfResidence).toBe('CA');
    expect(residenceForYear(inputs, 2040).stateOfResidence).toBe('TX');
    expect(residenceForYear(inputs, 2070).stateTaxState).toBe('none');
  });
});

describe('stateTaxJurisdictionFor', () => {
  it('maps the no-income-tax states to none, the modeled ones to themselves', () => {
    expect(['TX', 'FL', 'NV', 'SD', 'WY', 'AK', 'NH', 'TN'].map(stateTaxJurisdictionFor).every((j) => j === 'none')).toBe(true);
    // Washington has its own jurisdiction: capital gains tax, and from 2028
    // its income tax (changelog 349).
    expect(stateTaxJurisdictionFor('WA')).toBe('wa');
    expect(['CA', 'NY', 'IL', 'CO', 'PA'].map(stateTaxJurisdictionFor)).toEqual(['ca', 'ny', 'il', 'co', 'pa']);
  });

  it('maps Virginia to Virginia -- the old Settings soft-link sent it to a 5% flat rate', () => {
    expect(stateTaxJurisdictionFor('VA')).toBe('va');
    expect(stateTaxJurisdictionFor('va')).toBe('va');
  });

  it('prices every other income-tax state by its own rules (changelog 361)', () => {
    expect(['OR', 'MN', 'NJ', 'GA', 'DC'].map(stateTaxJurisdictionFor).every((j) => j === 'state_rules')).toBe(true);
    // Not a state: falls back to the flat rate.
    expect(stateTaxJurisdictionFor('ZZ')).toBe('flat_5');
  });
});
