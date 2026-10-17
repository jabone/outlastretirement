// @vitest-environment jsdom
//
// H14 (2026-09-30 review): INPUTS_SCHEMA_VERSION stayed 1 through many
// shape changes, each handled by sniffing for an old key. It is 2 now:
// every version-0 (bare) and version-1 plan still runs every one of those
// steps, and a version-2 plan skips them and passes through unchanged.
import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_INPUTS, INPUTS_SCHEMA_VERSION, migrateInputs, migratePersistedInputs, migrateScenarios } from '../calculator';
import { buildFullBackupPayload, applyFullBackupToStorage } from '../utils/fullBackup';

// A plan as an older build saved it: the current defaults WITHOUT the keys
// the shape change introduced, plus the old keys it used instead.
const legacy = (drop, add) => {
  const out = { ...DEFAULT_INPUTS };
  for (const k of drop) delete out[k];
  return { ...out, ...add };
};

// Each shape migrateInputs handles, and what the old plan must turn into.
const SHAPES = [
  {
    name: 'age instead of birth year',
    plan: legacy(['birthYear1', 'birthYear2'], { currentAge1: 50, currentAge2: 47, planYear: 2026 }),
    expect: { birthYear1: 1976, birthYear2: 1979 },
  },
  {
    name: 'one implicit heir',
    plan: legacy(['heirs'], { heirFilingStatus: 'MFJ', heirIncome: 150000 }),
    expect: { heirs: [{ id: 1, name: 'Heir 1', filingStatus: 'MFJ', income: 150000, splitPct: 100, relationship: DEFAULT_INPUTS.heirs[0].relationship }] },
  },
  {
    name: 'several heirs before the split mode',
    plan: legacy(['heirSplitMode'], { heirs: [{ id: 1, splitPct: 60 }, { id: 2, splitPct: 40 }] }),
    expect: { heirSplitMode: 'custom' },
  },
  {
    name: 'house implied by the reverse mortgage',
    plan: legacy(['homeOwned'], { reverseMortgageEnabled: true }),
    expect: { homeOwned: true },
  },
  {
    name: 'one shared Pre-Tax and Roth contribution',
    plan: legacy(['preTaxContribution1', 'preTaxContribution2', 'rothContribution1', 'rothContribution2'], { preTaxContribution: 12000, rothContribution: 3000 }),
    expect: { preTaxContribution1: 12000, preTaxContribution2: 12000, rothContribution1: 3000, rothContribution2: 3000 },
  },
  {
    name: 'one shared long-term care setting',
    plan: legacy(['ltcActive1', 'ltcActive2', 'ltcCost1', 'ltcCost2', 'ltcStartAge1', 'ltcStartAge2', 'ltcDurationYears1', 'ltcDurationYears2'],
      { ltcActive: true, ltcCost: 90000, ltcStartAge: 84, ltcDurationYears: 3 }),
    expect: { ltcActive1: true, ltcActive2: true, ltcCost1: 90000, ltcCost2: 90000, ltcStartAge1: 84, ltcStartAge2: 84, ltcDurationYears1: 3, ltcDurationYears2: 3 },
  },
  {
    name: 'one shared backdoor Roth amount',
    plan: legacy(['backdoorRothAnnualAmount1', 'backdoorRothAnnualAmount2'], { backdoorRothAnnualAmount: 7000 }),
    expect: { backdoorRothAnnualAmount1: 7000, backdoorRothAnnualAmount2: 7000 },
  },
  {
    name: 'the old 8% retired volatility',
    plan: legacy(['monteCarloSeed'], { volatilityPost: 8, stockAllocationPost: 60 }),
    expect: { volatilityPost: 11.6 },
  },
  {
    name: 'one life insurance policy',
    plan: legacy(['lifeInsuranceEnabled1', 'lifeInsuranceDeathBenefit1'], { lifeInsuranceEnabled: true, lifeInsuranceDeathBenefit: 500000 }),
    expect: { lifeInsuranceEnabled1: true, lifeInsuranceDeathBenefit1: 500000 },
  },
];

describe('H14: the inputs data-format version', () => {
  it('is 4', () => {
    expect(INPUTS_SCHEMA_VERSION).toBe(4);
  });

  // Changelog 361: an untouched 5% flat rate in a state that now has its
  // own rules moves to them; a flat rate the owner changed stays.
  it('version 4 moves an untouched flat rate to the state\'s own rules', () => {
    const plan = (o) => migratePersistedInputs({ schemaVersion: 3, inputs: { stateOfResidence: 'GA', stateTaxState: 'flat_5', stateTaxFlatRate: 5, stateTaxSocialSecurityTaxable: false, stateTaxPensionTaxable: true, ...o } }).inputs;
    expect(plan({}).stateTaxState).toBe('state_rules');
    expect(plan({ stateTaxFlatRate: 5.49 }).stateTaxState).toBe('flat_5');
    expect(plan({ stateTaxPensionTaxable: false }).stateTaxState).toBe('flat_5');
    expect(plan({ stateOfResidence: 'TX' }).stateTaxState).toBe('flat_5');
    const moved = plan({ residencyTimeline: [{ fromYear: 2030, stateOfResidence: 'NJ', stateTaxState: 'flat_5', stateTaxFlatRate: 5 }, { fromYear: 2032, stateOfResidence: 'NC', stateTaxState: 'flat_5', stateTaxFlatRate: 4 }] });
    expect(moved.residencyTimeline.map((e) => e.stateTaxState)).toEqual(['state_rules', 'flat_5']);
    // A plan already at version 4 is not touched.
    expect(migratePersistedInputs({ schemaVersion: 4, inputs: { stateOfResidence: 'GA', stateTaxState: 'flat_5', stateTaxFlatRate: 5 } }).inputs.stateTaxState).toBe('flat_5');
  });

  it('every key a shape expects is a real input', () => {
    const unknown = SHAPES.flatMap((s) => Object.keys(s.expect)).filter((k) => !(k in DEFAULT_INPUTS));
    expect(unknown).toEqual([]);
  });

  for (const shape of SHAPES) {
    it(`a version-1 and an unversioned plan with ${shape.name} migrate to version 2 the same way`, () => {
      const v1 = migratePersistedInputs({ schemaVersion: 1, inputs: shape.plan });
      const v0 = migratePersistedInputs(shape.plan);
      expect(v1.schemaVersion).toBe(INPUTS_SCHEMA_VERSION);
      expect(v1.fromVersion).toBe(1);
      expect(v0.fromVersion).toBe(0);
      expect(v1.inputs).toEqual(v0.inputs);
      for (const [k, v] of Object.entries(shape.expect)) expect(v1.inputs[k]).toEqual(v);
      // Idempotent: the result migrated again, as version 1 or as version
      // 2, is itself.
      expect(migrateInputs({ schemaVersion: 1, inputs: v1.inputs })).toEqual(v1.inputs);
      expect(migrateInputs({ schemaVersion: 2, inputs: v1.inputs })).toEqual(v1.inputs);
    });
  }

  it('a version-2 plan passes through unchanged, with no sniffing', () => {
    const plan = { ...DEFAULT_INPUTS, lifestyleExpense: 71234, volatilityPost: 8 };
    const out = migratePersistedInputs({ schemaVersion: 2, inputs: plan });
    expect(out.fromVersion).toBe(2);
    expect(out.inputs).toEqual(plan);
    // The same plan labeled version 1 without its seed would be lifted off
    // 8% -- the version is what tells the two apart.
    const { monteCarloSeed: _seed, ...noSeed } = plan;
    expect(migrateInputs({ schemaVersion: 1, inputs: noSeed }).volatilityPost).toBe(11.6);
    expect(migrateInputs({ schemaVersion: 2, inputs: noSeed }).volatilityPost).toBe(8);
  });

  it('saved scenarios take their version from the list they are stored in', () => {
    const old = SHAPES[0].plan;
    const [fromV1] = migrateScenarios({ schemaVersion: 1, scenarios: [{ id: 1, name: 'A', inputs: old, metrics: { endingBalance: 1 } }] });
    const [fromBare] = migrateScenarios([{ id: 1, name: 'A', inputs: old, metrics: { endingBalance: 1 } }]);
    expect(fromV1.inputs.birthYear1).toBe(1976);
    expect(fromBare.inputs).toEqual(fromV1.inputs);
    const current = { ...DEFAULT_INPUTS, lifestyleExpense: 55555 };
    const [fromV2] = migrateScenarios({ schemaVersion: 2, scenarios: [{ id: 2, name: 'B', inputs: current, metrics: { endingBalance: 1 } }] });
    expect(fromV2.inputs).toEqual(current);
    // A version-2 list is not sniffed: an 8% chosen there stays 8%.
    const { monteCarloSeed: _seed, ...noSeed } = { ...current, volatilityPost: 8 };
    const [kept] = migrateScenarios({ schemaVersion: 2, scenarios: [{ id: 3, name: 'C', inputs: noSeed, metrics: { endingBalance: 1 } }] });
    expect(kept.inputs.volatilityPost).toBe(8);
  });
});

describe('H14: backups carry the version their plan was saved under', () => {
  beforeEach(() => localStorage.clear());
  const read = (k) => JSON.parse(localStorage.getItem(k));

  it('a version-1 plan in an old shape, backed up by this build, restores converted', () => {
    localStorage.setItem('retire_plan_inputs', JSON.stringify({ schemaVersion: 1, inputs: SHAPES[0].plan }));
    const payload = buildFullBackupPayload();
    expect(payload.schemaVersion).toBe(1);
    localStorage.clear();
    applyFullBackupToStorage(JSON.parse(JSON.stringify(payload)));
    const stored = read('retire_plan_inputs');
    expect(stored.schemaVersion).toBe(INPUTS_SCHEMA_VERSION);
    expect(stored.inputs.birthYear1).toBe(1976);
    expect(stored.inputs.birthYear2).toBe(1979);
  });

  it('an unversioned stored plan is backed up with no version and restores converted', () => {
    localStorage.setItem('retire_plan_inputs', JSON.stringify(SHAPES[4].plan));
    const payload = buildFullBackupPayload();
    expect('schemaVersion' in payload).toBe(false);
    localStorage.clear();
    applyFullBackupToStorage(JSON.parse(JSON.stringify(payload)));
    expect(read('retire_plan_inputs').inputs.preTaxContribution2).toBe(12000);
  });

  it('a backup made by this build restores into this build identical', () => {
    const inputs = { ...DEFAULT_INPUTS, lifestyleExpense: 64321, volatilityPost: 8 };
    const scenarios = [{ id: 's1', name: 'A', inputs: { ...DEFAULT_INPUTS, lifestyleExpense: 50000 }, metrics: { endingBalance: 5, isSuccessful: true, peakPortfolioWorth: 9, successProbability: 0.9 } }];
    localStorage.setItem('retire_plan_inputs', JSON.stringify({ schemaVersion: INPUTS_SCHEMA_VERSION, inputs }));
    localStorage.setItem('retire_plan_scenarios', JSON.stringify({ schemaVersion: INPUTS_SCHEMA_VERSION, scenarios }));
    const payload = buildFullBackupPayload();
    expect(payload.schemaVersion).toBe(INPUTS_SCHEMA_VERSION);
    localStorage.clear();
    applyFullBackupToStorage(JSON.parse(JSON.stringify(payload)));
    expect(read('retire_plan_inputs')).toEqual({ schemaVersion: INPUTS_SCHEMA_VERSION, inputs });
    expect(read('retire_plan_scenarios')).toEqual({ schemaVersion: INPUTS_SCHEMA_VERSION, scenarios });
  });
});

// Version 3 (changelog 350): a Washington plan saved on the old
// no-income-tax choice moves to the Washington jurisdiction.
describe('version 3: Washington plans move to the Washington jurisdiction', () => {
  it('moves a version-2 Washington plan on the no-income-tax choice', () => {
    const plan = { ...DEFAULT_INPUTS, stateOfResidence: 'WA', stateTaxState: 'none' };
    expect(migrateInputs({ schemaVersion: 2, inputs: plan }).stateTaxState).toBe('wa');
    expect(migrateInputs({ schemaVersion: 2, inputs: { ...plan, stateTaxState: 'TX_FL' } }).stateTaxState).toBe('wa');
    expect(migrateInputs(plan).stateTaxState).toBe('wa');
  });
  it('moves a timeline move to Washington on the no-income-tax choice, and nothing else', () => {
    const plan = {
      ...DEFAULT_INPUTS,
      stateOfResidence: 'TX', stateTaxState: 'none',
      residencyTimeline: [
        { id: 1, fromYear: 2030, kind: 'domestic', stateOfResidence: 'WA', stateTaxState: 'none' },
        { id: 2, fromYear: 2035, kind: 'domestic', stateOfResidence: 'FL', stateTaxState: 'none' },
      ],
    };
    const out = migrateInputs({ schemaVersion: 2, inputs: plan });
    expect(out.stateTaxState).toBe('none');
    expect(out.residencyTimeline[0].stateTaxState).toBe('wa');
    expect(out.residencyTimeline[1].stateTaxState).toBe('none');
  });
  it('leaves a Washington plan on a deliberate flat rate, and a version-3 plan, alone', () => {
    const flat = { ...DEFAULT_INPUTS, stateOfResidence: 'WA', stateTaxState: 'flat_5' };
    expect(migrateInputs({ schemaVersion: 2, inputs: flat }).stateTaxState).toBe('flat_5');
    const v3 = { ...DEFAULT_INPUTS, stateOfResidence: 'WA', stateTaxState: 'none' };
    expect(migrateInputs({ schemaVersion: 3, inputs: v3 }).stateTaxState).toBe('none');
  });
});
