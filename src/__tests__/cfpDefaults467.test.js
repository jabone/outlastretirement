// Three defaults from the planner's review (changelog 467): the state is
// asked up front and a mismatch is flagged; the employer match stops at a
// share of pay; and Medicare leaves a supplement and out-of-pocket line.
// Each applies to NEW plans; a plan saved before this keeps its figures.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INPUTS, runProjection, migrateInputs, calculateEmployerMatch, stateTaxJurisdictionFor,
} from '../calculator';
import { getPlanFeedback } from '../utils/planFeedback';
import { buildParkersInputs } from '../config/demoPlanParkers';
import { buildDemoInputs } from '../config/demoPlan';
import { WIZARD_FIELDS } from '../config/wizardFields';
import { assertKnownInputKeys } from './knownInputKeys';

const first = (inputs) => runProjection(inputs).years[0];
const feedbackTitles = (inputs) => getPlanFeedback(inputs, runProjection(inputs), null, () => 73).map((f) => f.title);

describe('the state', () => {
  it('is asked in Quick Setup, and choosing it sets the jurisdiction', () => {
    expect(WIZARD_FIELDS.household).toContain('stateOfResidence');
    expect(stateTaxJurisdictionFor('CA')).toBe('ca');
    expect(stateTaxJurisdictionFor('GA')).toBe('state_rules');
    expect(stateTaxJurisdictionFor('FL')).toBe('none');
  });
  it('a plan taxed as nowhere while living in a tax state is flagged, with a one-click fix', () => {
    const ca = assertKnownInputKeys({ ...DEFAULT_INPUTS, stateOfResidence: 'CA' });
    expect(feedbackTitles(ca)).toContain('State Tax Does Not Match Your State');
    const card = getPlanFeedback(ca, runProjection(ca), null, () => 73).find((f) => f.title === 'State Tax Does Not Match Your State');
    expect(card.quickApply.config).toEqual({ stateTaxState: 'ca', stateTaxUnlinked: false });
    expect(feedbackTitles({ ...ca, stateTaxState: 'ca' })).not.toContain('State Tax Does Not Match Your State');
    expect(feedbackTitles({ ...DEFAULT_INPUTS, stateOfResidence: 'FL' })).not.toContain('State Tax Does Not Match Your State');
    expect(feedbackTitles(DEFAULT_INPUTS)).not.toContain('State Tax Does Not Match Your State');
  });
});

describe('the employer match', () => {
  it('stops at 6% of pay by default: 50% of the first 6%', () => {
    // $75,000 pay, $7,000 deferral: 50% of min(7,000, 4,500) = 2,250.
    expect(first(DEFAULT_INPUTS).employerMatchAmount).toBeCloseTo(2250, 0);
    // A larger deferral does not raise the match.
    expect(first({ ...DEFAULT_INPUTS, preTaxContribution1: 20000 }).employerMatchAmount).toBeCloseTo(2250, 0);
    // 0 means no pay cap, the old formula: 50% of the whole $7,000 deferral,
    // plus the catch-up room the default plan's deferral mode adds.
    expect(first({ ...DEFAULT_INPUTS, employerMatchCapPayPct1: 0 }).employerMatchAmount).toBeGreaterThan(3000);
  });
  it('the formula takes the smaller of the two caps', () => {
    const cfg = { mode: 'percent', rateA: 50, capAPct: 100, capPayPct: 6, salary: 100000 };
    expect(calculateEmployerMatch(10000, 24500, 1, cfg)).toBeCloseTo(3000, 6);
    expect(calculateEmployerMatch(10000, 24500, 1, { ...cfg, capPayPct: 0 })).toBeCloseTo(5000, 6);
    expect(calculateEmployerMatch(30000, 24500, 1, { ...cfg, capPayPct: 50 })).toBeCloseTo(12250, 6);
  });
  it('a plan saved before the cap keeps the formula it was saved with', () => {
    const { employerMatchCapPayPct1, employerMatchCapPayPct2, medicareSupplementCost, ...saved } = DEFAULT_INPUTS; // eslint-disable-line no-unused-vars
    const back = migrateInputs({ schemaVersion: 4, inputs: saved });
    expect(back.employerMatchCapPayPct1).toBe(0);
    expect(back.medicareSupplementCost).toBe(0);
    expect(migrateInputs(null).employerMatchCapPayPct1).toBe(6);
    expect(migrateInputs({}).medicareSupplementCost).toBe(4500);
  });
});

describe('Medicare supplement and out-of-pocket', () => {
  it('charges each person on Medicare the figure, grown at medical inflation, on top of Part B and D', () => {
    const plan = assertKnownInputKeys({ ...DEFAULT_INPUTS, birthYear1: 1964, retireAge1: 65, medicareSupplementCost: 4500 });
    const rows = runProjection(plan).years;
    const at64 = rows.find((y) => y.age1 === 64);
    const at65 = rows.find((y) => y.age1 === 65);
    expect(at64.medicareSupplement).toBe(0);
    expect(at65.medicareSupplement).toBeCloseTo(4500 * at65.medicalInflFactor, 2);
    expect(at65.irmaaCost).toBeGreaterThan(0);
    const without = runProjection({ ...plan, medicareSupplementCost: 0 }).years.find((y) => y.age1 === 65);
    // The supplement raises the year's costs by itself; the larger draw it
    // needs also adds a little tax, which is counted in totalExpenses.
    expect((at65.totalExpenses - at65.totalTaxesPaid) - (without.totalExpenses - without.totalTaxesPaid)).toBeCloseTo(at65.medicareSupplement, 2);
  });
  it('counts both spouses once both are on Medicare', () => {
    const couple = assertKnownInputKeys({ ...DEFAULT_INPUTS, spouse2Enabled: true, filingStatus: 'MFJ', birthYear1: 1964, birthYear2: 1964, retireAge1: 65, retireAge2: 65, medicareSupplementCost: 4500 });
    const at66 = runProjection(couple).years.find((y) => y.age1 === 66);
    expect(at66.medicareSupplement).toBeCloseTo(2 * 4500 * at66.medicalInflFactor, 2);
  });
  it('the demo households keep their published figures', () => {
    expect(buildParkersInputs().medicareSupplementCost).toBe(0);
    expect(buildParkersInputs().employerMatchCapPayPct1).toBe(0);
    expect(buildDemoInputs().medicareSupplementCost).toBe(0);
    expect(buildDemoInputs().employerMatchCapPayPct1).toBe(0);
  });
});
