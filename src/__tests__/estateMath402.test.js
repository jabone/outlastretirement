// Changelog 402: three estate figures that disagreed with each other.
//  1. Today's Dollars left the heirs' state income tax in future dollars.
//  2. The household's effective estate tax rate left out GST and the
//     heirs' state income tax, which every heir's own rate counted.
//  3. A year-one inherited IRA draw was priced from the heir's own income,
//     below the year-one HSA/NQDC lumps that sit on the same return.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, calculateHeirEstateTax, deflateEstateResultForDisplay, heirStateIncomeTax, calculateStateTaxes } from '../calculator';

const heir = (n, extra = {}) => ({ id: n, name: `Heir ${n}`, filingStatus: 'Single', income: 100000, splitPct: 50, ...extra });
const plan = (heirs, extra = {}) => ({ ...DEFAULT_INPUTS, stateOfResidence: 'NY', stateTaxState: 'ny', heirSplitMode: 'custom', heirs, ...extra });

describe('Today\'s Dollars deflates the heirs\' state income tax too', () => {
  it('totalHeirStateIncomeTax and each heir\'s stateIncomeTax divide by the factor', () => {
    const r = calculateHeirEstateTax(plan([heir(1), heir(2)]), 4000000, 500000, 500000, 0, 0, false, 100000, { nqdc: 100000 });
    expect(r.totalHeirStateIncomeTax).toBeGreaterThan(0);
    const d = deflateEstateResultForDisplay(r, 2);
    expect(d.totalHeirStateIncomeTax).toBeCloseTo(r.totalHeirStateIncomeTax / 2, 6);
    r.perHeir.forEach((h, i) => expect(d.perHeir[i].stateIncomeTax).toBeCloseTo(h.stateIncomeTax / 2, 6));
    // Still a rate, not a dollar figure.
    expect(d.effectiveEstateTaxRate).toBe(r.effectiveEstateTaxRate);
  });
});

describe('the household effective estate tax rate counts what the heirs\' rates count', () => {
  it('equals the heirs\' combined drag over the gross estate, GST and state income tax included', () => {
    // A grandchild is a skip person: GST on their share, on top of estate tax.
    const r = calculateHeirEstateTax(plan([heir(1), heir(2, { relationship: 'grandchild', isSkipPerson: true })]), 100000000, 20000000, 20000000);
    expect(r.totalGenerationSkippingTax).toBeGreaterThan(0);
    expect(r.totalHeirStateIncomeTax).toBeGreaterThan(0);
    const drag = r.perHeir.reduce((s, h) => s + h.grossInherited * h.effectiveEstateTaxRate / 100, 0);
    const gross = r.perHeir.reduce((s, h) => s + h.grossInherited, 0);
    expect(r.effectiveEstateTaxRate).toBeCloseTo((drag / gross) * 100, 6);
    // And it is strictly above the figure that leaves the two taxes out.
    const without = (r.totalHeirTax + r.totalHsaHeirTax + r.totalNqdcHeirTax + r.totalStateEstateTax + r.totalFederalEstateTax + r.totalForeignEstateTax) / r.grossInherited * 100;
    expect(r.effectiveEstateTaxRate).toBeGreaterThan(without);
  });
});

describe('a year-one inherited IRA draw stacks above the year-one HSA and NQDC lumps', () => {
  it('federal: the year-one draw\'s tax is priced from where the lumps leave the heir', () => {
    const base = { heirDistributionStrategy: 'lump_sum_start' };
    const noLumps = calculateHeirEstateTax(plan([heir(1, { splitPct: 100 })], base), 500000, 0, 0, 0, 0, true, 0, {});
    const withLumps = calculateHeirEstateTax(plan([heir(1, { splitPct: 100 })], base), 500000, 0, 0, 0, 0, true, 150000, { nqdc: 150000 });
    const y1 = (r) => r.perHeir[0].annualWithdrawals[0];
    expect(y1(withLumps).withdrawal).toBeCloseTo(y1(noLumps).withdrawal, 6);
    // Same draw, higher in the brackets, so more tax on it.
    expect(y1(withLumps).taxDrag).toBeGreaterThan(y1(noLumps).taxDrag);
    // The year-one return shows the lumps too.
    expect(y1(withLumps).combinedIncome).toBeCloseTo(y1(noLumps).combinedIncome + withLumps.perHeir[0].hsaInherited + withLumps.perHeir[0].nqdcInherited, 6);
    // Later years are untouched by the lumps.
    expect(withLumps.perHeir[0].annualWithdrawals[1].taxDrag).toBe(0);
    // And the lumps' own tax is unchanged: they are priced first, the draw after.
    expect(withLumps.perHeir[0].hsaHeirTax).toBeGreaterThan(0);
  });

  it('state: the year-one draw is the increment above income plus lumps', () => {
    const draws = [{ year: 1, withdrawal: 100000 }, { year: 2, withdrawal: 100000 }];
    const r = heirStateIncomeTax({ state: 'CA' }, 'TX', 100000, 'Single', draws, 50000, 50000, 55, 1);
    const tax = (ordinary, dist) => calculateStateTaxes(ordinary, 0, 0, 'ca', false, false, 'Single', 55, 55, 5, 0, null, false, { retirementDistributions: dist, stateCode: 'CA', federalAGI: ordinary });
    const lumpsTax = tax(200000, 100000) - tax(100000, 0);
    const year1 = tax(300000, 200000) - tax(200000, 100000);
    const year2 = tax(200000, 100000) - tax(100000, 0);
    expect(r.stateIncomeTax).toBeCloseTo(lumpsTax + year1 + year2, 4);
    // Which is more than pricing the year-one draw from the heir's own income.
    const unstacked = heirStateIncomeTax({ state: 'CA' }, 'TX', 100000, 'Single', draws, 0, 0, 55, 1).stateIncomeTax + lumpsTax;
    expect(r.stateIncomeTax).toBeGreaterThan(unstacked);
  });
});
