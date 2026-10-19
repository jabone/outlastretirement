// Changelog 438: the ranking key prices the heirs' share of the Pre-Tax
// balance, after a charitable bequest, at the effective rate of federal
// AND state tax the heirs pay drawing it down. Until 438 the whole ending
// balance was priced, so a $1,000,000 Pre-Tax bequest to charity RAISED the
// key, and the heirs' state income tax was left out of the rate.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, legacyAfterTaxes, calculateHeirEstateTax } from '../calculator';

const START = DEFAULT_INPUTS.planYear;
const base = (over) => ({
  ...DEFAULT_INPUTS, spouse2Enabled: false, filingStatus: 'Single', birthYear1: START - 70, retireAge1: 65, salary1: 0,
  preTaxInit: 2000000, taxableInit: 0, rothInit: 0, lifestyleExpense: 40000, ss1: 30000, claimingAge1: 70, lifeExpectancy1: 72,
  taxableQualifiedDividendFollowsAllocation: false, ...over,
});
const bequest = { charitableBequestEnabled: true, charitableBequestMode: 'amount', charitableBequestAmount: 1000000, charitableBequestSource: 'preTax' };

describe('net to heirs after every tax (438)', () => {
  it('a Pre-Tax bequest to charity lowers the key, by roughly the after-tax value of what left', () => {
    const without = base({});
    const withGift = base(bequest);
    const keyWithout = legacyAfterTaxes(without, runProjection(without));
    const keyWith = legacyAfterTaxes(withGift, runProjection(withGift));
    expect(keyWith).toBeLessThan(keyWithout);
    // The charity took $1M of Pre-Tax; the heirs lose its after-tax value,
    // so the key falls by less than $1M but by well over half of it.
    expect(keyWithout - keyWith).toBeGreaterThan(500000);
    expect(keyWithout - keyWith).toBeLessThan(1000000);
  });

  it('the key prices the heirs\' share at death, not the whole balance', () => {
    const inputs = base(bequest);
    const proj = runProjection(inputs);
    const last = proj.years[proj.years.length - 1];
    const estate = calculateHeirEstateTax(inputs, last.preTaxEnd || 0, last.rothEnd || 0, last.taxableEnd || 0, 0, 0, false, last.hsaEnd || 0, {});
    expect(estate.composition.preTaxAtDeath).toBeCloseTo(last.preTaxEnd - 1000000, 0);
    const key = legacyAfterTaxes(inputs, proj);
    // Never more than the heirs' share of the Pre-Tax balance.
    expect(key).toBeLessThanOrEqual(estate.composition.preTaxAtDeath + 1);
  });

  it('an heir in a state with an income tax leaves the key lower than one in Texas', () => {
    const tx = base({ heirs: [{ id: 1, name: 'A', splitPct: 100, state: 'TX', income: 100000, filingStatus: 'Single', relationship: 'child' }] });
    const ca = base({ heirs: [{ id: 1, name: 'A', splitPct: 100, state: 'CA', income: 100000, filingStatus: 'Single', relationship: 'child' }] });
    const keyTx = legacyAfterTaxes(tx, runProjection(tx));
    const keyCa = legacyAfterTaxes(ca, runProjection(ca));
    expect(keyCa).toBeLessThan(keyTx - 50000);
  });
});
