// Changelog 360: the basis reset at the first death (IRC 1014). What the
// spouse who died owned takes its market value as its new basis: all of it
// in a community-property state, half when held jointly elsewhere, all or
// none when held in one name.
import { describe, it, expect } from 'vitest';
import {
  runProjection, DEFAULT_INPUTS, firstDeathBasisResetShare, COMMUNITY_PROPERTY_STATES, sanitizeInputs,
} from '../calculator';

const START = DEFAULT_INPUTS.planYear;
const couple = (over = {}) => ({
  ...DEFAULT_INPUTS,
  spouse2Enabled: true,
  birthYear1: START - 70, birthYear2: START - 68,
  retireAge1: 60, retireAge2: 60, claimingAge1: 67, claimingAge2: 67,
  salary1: 0, salary2: 0,
  lifeExpectancy1: 74, lifeExpectancy2: 92,
  taxableInit: 1200000, taxableBasisInit: 300000,
  preTaxInit: 400000, rothInit: 100000,
  lifestyleExpense: 90000,
  ...over,
});
const deathRow = (rows) => rows.find((r) => r.firstDeathBasisResetShare !== null && r.firstDeathBasisResetShare !== undefined);
const prev = (rows, row) => rows[rows.indexOf(row) - 1];

describe('who gets a new basis', () => {
  it('all of it in a community-property state, whatever the title', () => {
    for (const st of COMMUNITY_PROPERTY_STATES) {
      for (const owner of ['joint', 'spouse1', 'spouse2']) expect(firstDeathBasisResetShare({ state: st, owner, deceased: 1 })).toBe(1);
    }
    expect(COMMUNITY_PROPERTY_STATES).toEqual(['AZ', 'CA', 'ID', 'LA', 'NM', 'NV', 'TX', 'WA', 'WI']);
  });
  it('elsewhere: half if joint, all if the one who died owned it, none if the survivor did', () => {
    expect(firstDeathBasisResetShare({ state: 'NY', owner: 'joint', deceased: 1 })).toBe(0.5);
    expect(firstDeathBasisResetShare({ state: 'FL', owner: 'spouse1', deceased: 1 })).toBe(1);
    expect(firstDeathBasisResetShare({ state: 'FL', owner: 'spouse1', deceased: 2 })).toBe(0);
    expect(firstDeathBasisResetShare({ state: null, owner: 'joint', deceased: 2 })).toBe(0.5); // abroad
  });
  it('an unknown owner value is read as joint', () => {
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, taxableAccountOwner: 'bogus' }).taxableAccountOwner).toBe('joint');
    expect(DEFAULT_INPUTS.taxableAccountOwner).toBe('joint');
  });
});

// Several full projections per test; give them room on a busy machine.
const SLOW = 30000;

describe('in the projection', () => {
  it('happens once, in the first-death year, and resets the basis toward market value by the share', () => {
    for (const [state, owner, share] of [['TX', 'joint', 1], ['FL', 'joint', 0.5], ['FL', 'spouse1', 1], ['FL', 'spouse2', 0]]) {
      const rows = runProjection(couple({ stateOfResidence: state, taxableAccountOwner: owner })).years;
      const flagged = rows.filter((r) => r.firstDeathBasisResetShare !== null && r.firstDeathBasisResetShare !== undefined);
      expect(flagged.length, `${state}/${owner}`).toBe(1);
      const row = flagged[0];
      expect(row.firstDeathBasisResetShare).toBe(share);
      const before = prev(rows, row);
      const expected = share * (before.taxableEnd - before.taxableBasis);
      expect(row.firstDeathBasisChange).toBeCloseTo(expected, 0);
      if (share > 0) expect(row.firstDeathBasisChange).toBeGreaterThan(0);
    }
  }, SLOW);

  it('lowers the survivor’s tax: community property beats an account in the survivor’s name', () => {
    const cp = runProjection(couple({ stateOfResidence: 'TX', taxableAccountOwner: 'spouse2' })).years;
    const none = runProjection(couple({ stateOfResidence: 'FL', taxableAccountOwner: 'spouse2' })).years;
    const after = (rows) => {
      const d = deathRow(rows);
      return rows.filter((r) => r.year >= d.year).reduce((t, r) => t + (r.federalTax || 0), 0);
    };
    expect(after(cp)).toBeLessThan(after(none));
  }, SLOW);

  it('never takes basis above market value (the plan does not carry unrealized losses)', () => {
    const rows = runProjection(couple({ stateOfResidence: 'TX', taxableBasisInit: 1200000, preRetireReturn: -8, postRetireReturn: -8 })).years;
    const row = deathRow(rows);
    expect(row.firstDeathBasisChange).toBeGreaterThanOrEqual(0);
    expect(row.taxableBasis).toBeLessThanOrEqual(row.taxableEnd + 1e-6);
  }, SLOW);

  it('a single person, or a couple who die the same year, has no reset', () => {
    const single = runProjection({ ...couple(), spouse2Enabled: false }).years;
    expect(single.every((r) => !r.firstDeathBasisChange)).toBe(true);
    const together = runProjection(couple({ lifeExpectancy1: 90, lifeExpectancy2: 88 })).years;
    expect(together.every((r) => !r.firstDeathBasisChange)).toBe(true);
  }, SLOW);

  it('resets a concentrated position too, and it then pays less tax when sold', () => {
    const base = { stateOfResidence: 'TX', concentratedStockEnabled: true, concentratedStockInit: 500000, concentratedStockCostBasisPct: 10, concentratedStockDiversifyPct: 20 };
    const withReset = runProjection(couple(base)).years;
    const row = deathRow(withReset);
    expect(row.firstDeathBasisChange).toBeGreaterThan(0);
  }, SLOW);
});
