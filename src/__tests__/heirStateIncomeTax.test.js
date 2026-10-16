// Heir state income tax (changelog 263): the income tax on the 10-year
// inherited-IRA drawdown is the HEIR's state's; estate and inheritance
// tax stay keyed to the estate. Each heir carries `state` (blank = the
// estate's state) and, for flat-rate states, `stateTaxFlatRate`.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, calculateHeirEstateTax, heirStateIncomeTax, calculateStateTaxes } from '../calculator';

const heir = (id, over = {}) => ({ id, name: `H${id}`, filingStatus: 'Single', income: 100000, splitPct: 0, ...over });
const plan = (heirs, over = {}) => ({ ...DEFAULT_INPUTS, stateOfResidence: 'TX', heirSplitMode: 'equal', heirs, ...over });

describe('heirStateIncomeTax', () => {
  it('follows the heir, not the estate: TX estate, NM and CA heirs pay their own state', () => {
    const r = calculateHeirEstateTax(plan([heir(1, { state: 'NM' }), heir(2), heir(3, { state: 'CA' })]), 3000000, 0, 0);
    const [nm, tx, ca] = r.perHeir;
    expect(tx.stateIncomeTaxState).toBe('TX');
    expect(tx.stateIncomeTax).toBe(0);
    expect(nm.stateIncomeTaxState).toBe('NM');
    expect(nm.stateIncomeTax).toBeGreaterThan(0);
    expect(ca.stateIncomeTax).toBeGreaterThan(nm.stateIncomeTax);
    // Same gross, same federal; only the state layer differs, and Net moves by exactly it.
    expect(nm.grossInherited).toBeCloseTo(tx.grossInherited, 6);
    expect(nm.totalHeirTax).toBeCloseTo(tx.totalHeirTax, 6);
    expect(tx.netInherited - nm.netInherited).toBeCloseTo(nm.stateIncomeTax, 6);
    expect(r.totalHeirStateIncomeTax).toBeCloseTo(nm.stateIncomeTax + ca.stateIncomeTax, 6);
    // Death taxes are untouched by where the heirs live.
    expect(nm.stateEstateTax).toBe(tx.stateEstateTax);
    expect(ca.federalEstateTax).toBe(tx.federalEstateTax);
  });

  it('a state with its own rules prices the withdrawals by them, not by an old flat rate (changelog 361)', () => {
    const at = (rate) => calculateHeirEstateTax(plan([heir(1, { state: 'NM', stateTaxFlatRate: rate })]), 1000000, 0, 0).perHeir[0];
    const five = at(5);
    expect(five.stateIncomeTax).toBeGreaterThan(0);
    expect(at(9).stateIncomeTax).toBeCloseTo(five.stateIncomeTax, 6);
    // A Texas heir pays nothing, as before.
    expect(calculateHeirEstateTax(plan([heir(1, { state: 'TX' })]), 1000000, 0, 0).perHeir[0].stateIncomeTax).toBe(0);
  });

  it('blank state means the estate’s state, and an estate in an income-tax state taxes every heir there by default', () => {
    const r = calculateHeirEstateTax(plan([heir(1), heir(2, { state: 'TX' })], { stateOfResidence: 'NM' }), 1000000, 0, 0);
    expect(r.perHeir[0].stateIncomeTaxState).toBe('NM');
    expect(r.perHeir[0].stateIncomeTax).toBeGreaterThan(0);
    expect(r.perHeir[1].stateIncomeTax).toBe(0);
  });

  it('is indexed like the federal side: pricing in today’s dollars and carrying forward by the factor', () => {
    const draws = [{ withdrawal: 100000 }];
    const a = heirStateIncomeTax({ state: 'CA' }, 'TX', 100000, 'Single', draws, 0, 0, 55, 1);
    const b = heirStateIncomeTax({ state: 'CA' }, 'TX', 200000, 'Single', [{ withdrawal: 200000 }], 0, 0, 55, 2);
    expect(b.stateIncomeTax).toBeCloseTo(2 * a.stateIncomeTax, 6);
    // And it is the marginal tax on the withdrawal, not the tax on the whole return.
    const whole = calculateStateTaxes(200000, 0, 0, 'ca', false, false, 'Single', 55, 55, 5, 0, null, false, { retirementDistributions: 100000 });
    const base = calculateStateTaxes(100000, 0, 0, 'ca', false, false, 'Single', 55, 55, 5, 0, null, false, {});
    expect(a.stateIncomeTax).toBeCloseTo(whole - base, 6);
  });
});
