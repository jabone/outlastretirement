// Charitable bequest funding buckets (changelog 181) -- KNOWN_ISSUES open
// item #1, closed.
//
// THE GAP. Changelog 133 put the cash reserve, a concentrated stock
// position, home equity and an unpaid NQDC balance into the gross estate.
// `charityFundable` was never widened to match: it stayed
// preTax + roth + taxable. Two consequences, both wrong in the same
// direction. A plan whose wealth is mostly a founder position could not
// direct a bequest at that position at all, and any bequest larger than the
// three old buckets was silently capped below what the estate could
// actually pay -- while the estate-tax deduction was capped with it.
//
// WHAT STAYS OUT, deliberately: home equity (not liquid at death), NQDC (a
// contractual claim on the employer's schedule), the HSA and life insurance
// (each passes to its own named beneficiary and is not the executor's to
// give away -- the F-6 audit finding this cap exists for).
import { describe, it, expect } from 'vitest';
import {
  calculateHeirEstateTax, splitCharitableBequest, CHARITABLE_SOURCE_ORDERS, DEFAULT_INPUTS,
} from '../calculator';

describe('splitCharitableBequest is generic over the buckets it is handed', () => {
  it('still returns exactly the three keys a three-bucket caller passes', () => {
    // Backwards compatibility is deliberate: the output mirrors the input
    // keys, so older callers and their tests are untouched.
    const buckets = { preTax: 100, roth: 50, taxable: 50 };
    expect(splitCharitableBequest(200, buckets, null)).toEqual({ preTax: 100, roth: 50, taxable: 50 });
  });

  it('spreads proportionally across five buckets when given five', () => {
    const buckets = { preTax: 400, roth: 100, taxable: 200, cash: 100, stock: 200 };
    const r = splitCharitableBequest(500, buckets, null); // half of 1000
    expect(r.preTax).toBeCloseTo(200, 6);
    expect(r.roth).toBeCloseTo(50, 6);
    expect(r.taxable).toBeCloseTo(100, 6);
    expect(r.cash).toBeCloseTo(50, 6);
    expect(r.stock).toBeCloseTo(100, 6);
    expect(Object.keys(r).sort()).toEqual(['cash', 'preTax', 'roth', 'stock', 'taxable']);
  });

  it('reaches cash and stock BEFORE the Roth under the pre-tax order', () => {
    // The ordering claim, asserted rather than assumed: a Roth dollar is
    // the most expensive thing to give away, so it is drained last.
    const buckets = { preTax: 100, roth: 500, taxable: 100, cash: 100, stock: 100 };
    const r = splitCharitableBequest(400, buckets, CHARITABLE_SOURCE_ORDERS.pretax);
    expect(r.preTax).toBeCloseTo(100, 6);
    expect(r.taxable).toBeCloseTo(100, 6);
    expect(r.cash).toBeCloseTo(100, 6);
    expect(r.stock).toBeCloseTo(100, 6);
    expect(r.roth).toBeCloseTo(0, 6);
  });

  it('skips a bucket the caller does not have rather than reading undefined', () => {
    const buckets = { preTax: 100, roth: 100, taxable: 0 };
    const r = splitCharitableBequest(150, buckets, CHARITABLE_SOURCE_ORDERS.pretax);
    expect(Number.isFinite(r.preTax) && Number.isFinite(r.roth)).toBe(true);
    expect(r.preTax).toBeCloseTo(100, 6);
    expect(r.roth).toBeCloseTo(50, 6);
  });

  it('never takes more than a bucket holds, or more than was asked for', () => {
    const buckets = { preTax: 10, roth: 10, taxable: 10, cash: 10, stock: 10 };
    const r = splitCharitableBequest(999999, buckets, CHARITABLE_SOURCE_ORDERS.pretax);
    const total = Object.values(r).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(50, 6);
    Object.keys(buckets).forEach(k => expect(r[k]).toBeLessThanOrEqual(buckets[k] + 1e-9));
  });
});

// ---------------------------------------------------------------------------
// End to end through the estate calculation.
// ---------------------------------------------------------------------------

// A founder household: almost everything is one concentrated position and
// cash. Under the old cap a bequest could barely be funded at all.
//
// NOTE the signature -- the estate's non-account assets arrive as the NINTH
// argument, not on `inputs`. A first draft of this file set cashFloorEnabled
// on the inputs and tested nothing at all, because that flag has no bearing
// on what this function is handed.
//   calculateHeirEstateTax(inputs, preTax, roth, taxable, ins1, ins2,
//                          skipCompare, hsa, otherEstateAssets)
const FOUNDER = {
  ...DEFAULT_INPUTS,
  charitableBequestEnabled: true,
  charitableBequestMode: 'amount',
  charitableBequestAmount: 2000000,
  charitableBequestSource: 'proportional',
  stateOfResidence: 'TX',
};

// The three original buckets total $500,000; everything else is the
// founder's position, cash, house and unpaid deferred comp.
const FOUNDER_ASSETS = {
  cashReserve: 300000,
  concentratedStock: 4000000,
  homeEquity: 800000,
  nqdc: 500000,
  otherAssets: 0,
};

const runFounder = (over = {}, assets = {}) => calculateHeirEstateTax(
  { ...FOUNDER, ...over }, 200000, 100000, 200000, 0, 0, false, 0,
  { ...FOUNDER_ASSETS, ...assets },
);

describe('the founder case the old cap could not express', () => {
  it('funds a bequest far larger than the three original buckets', () => {
    const res = runFounder();
    // preTax + roth + taxable = $500,000. Anything above that was
    // unreachable before changelog 181, however large the estate.
    expect(res.charitableBequest).toBeCloseTo(2000000, 2);
  });

  it('cash and the stock position are what make it fundable', () => {
    // Strip them out and the very same plan falls back to the old cap,
    // which is the bug stated as a fact.
    const res = runFounder({}, { cashReserve: 0, concentratedStock: 0 });
    expect(res.charitableBequest).toBeCloseTo(500000, 2);
  });

  it('a dollar given away is a dollar the heirs do not also receive', () => {
    // CONSERVATION. This is the guard that actually catches the
    // double-count: heirs must receive the estate MINUS the bequest, not
    // the estate with the bequest deducted for tax purposes only.
    //
    // Deliberately an all-stepped-up estate with no retirement accounts.
    // An inherited pre-tax balance keeps growing through the heir's
    // 10-year drawdown and that growth lands in grossInherited, so a
    // fixture containing one cannot check conservation to the dollar --
    // which is exactly how an earlier version of this file let a mutation
    // that handed heirs the charity's cash and stock pass unnoticed.
    const estateAssets = { cashReserve: 1000000, concentratedStock: 1000000, homeEquity: 500000, nqdc: 0, otherAssets: 0 };
    const gift = 500000;
    const res = calculateHeirEstateTax(
      { ...FOUNDER, charitableBequestAmount: gift, charitableBequestSource: 'proportional' },
      0, 0, 0, 0, 0, false, 0, estateAssets,
    );
    const estateTotal = 1000000 + 1000000 + 500000;
    expect(res.charitableBequest).toBeCloseTo(gift, 2);
    // Home equity was never fundable, so all $500,000 comes from the
    // $2,000,000 of cash and stock -- and leaves with it.
    expect(res.grossInherited).toBeCloseTo(estateTotal - gift, 2);
  });

  it('the same holds when the gift is targeted rather than spread', () => {
    const estateAssets = { cashReserve: 1000000, concentratedStock: 1000000, homeEquity: 500000, nqdc: 0, otherAssets: 0 };
    const gift = 1200000;
    const res = calculateHeirEstateTax(
      { ...FOUNDER, charitableBequestAmount: gift, charitableBequestSource: 'taxable' },
      0, 0, 0, 0, 0, false, 0, estateAssets,
    );
    // 'taxable' order is ['taxable','cash','stock','preTax','roth'] -- with
    // no taxable account it falls through to cash, then stock.
    expect(res.charitableBequest).toBeCloseTo(gift, 2);
    expect(res.grossInherited).toBeCloseTo(2500000 - gift, 2);
  });

  it('what the charity takes leaves the heirs, rather than being deducted twice', () => {
    const none = runFounder({ charitableBequestEnabled: false });
    const some = runFounder();
    expect(some.charitableBequest).toBeGreaterThan(0);
    expect(some.grossInherited).toBeLessThan(none.grossInherited);
  });

  it('WHICH bucket funds it changes the outcome, now that there are five', () => {
    // Deliberately asserts that the choice MATTERS, not which way it goes.
    //
    // A first draft asserted that targeting pre-tax always leaves heirs
    // better off -- the usual planning advice, and what the code comment
    // above charityFundable says. It is not true in this model, and finding
    // out why is worth recording: an inherited pre-tax account keeps
    // growing through the heir's 10-year drawdown and that growth is inside
    // grossInherited, while stepped-up assets are counted at their
    // at-death value. So leaving heirs MORE pre-tax can beat leaving them
    // more stock even after the income tax. Whether those two should be
    // measured on the same footing is a real question (see KNOWN_ISSUES),
    // but it is not one a test should silently take a side on.
    const prop = runFounder({ charitableBequestSource: 'proportional' });
    const preTaxFirst = runFounder({ charitableBequestSource: 'pretax' });
    const taxableFirst = runFounder({ charitableBequestSource: 'taxable' });

    // Same size gift in every case -- only its funding differs.
    expect(preTaxFirst.charitableBequest).toBeCloseTo(prop.charitableBequest, 2);
    expect(taxableFirst.charitableBequest).toBeCloseTo(prop.charitableBequest, 2);

    // And three genuinely different answers for the heirs.
    const nets = [prop.netInherited, preTaxFirst.netInherited, taxableFirst.netInherited];
    expect(new Set(nets.map(n => Math.round(n))).size).toBe(3);
    expect(Math.max(...nets) - Math.min(...nets)).toBeGreaterThan(10000);
  });

  it('reports the targeting comparison the app shows, and its arithmetic holds', () => {
    const targeted = runFounder({ charitableBequestSource: 'pretax' });
    const cmp = targeted.charitableSourceComparison;
    expect(cmp).toBeTruthy();
    // The engine's own definition: positive means the chosen targeting
    // beats spreading it evenly. It is allowed to be negative, and here it
    // is -- which is exactly why the app computes it rather than asserting
    // a direction in prose.
    expect(cmp.netGainVsProportional).toBeCloseTo(targeted.netInherited - cmp.proportionalNetInherited, 2);
    expect(cmp.heirTaxSaved).toBeCloseTo(cmp.proportionalHeirTax - targeted.totalHeirTax, 2);
  });
});

describe('assets that are not the executor\'s to give stay out', () => {
  it('home equity and NQDC alone cannot fund a bequest', () => {
    // A house is not liquid at death and an unpaid deferred-comp balance is
    // a contractual claim on the employer's schedule. Both are in the gross
    // estate and neither is fundable.
    const res = calculateHeirEstateTax(
      { ...FOUNDER, charitableBequestAmount: 999000000 }, 0, 0, 0, 0, 0, false, 0,
      { cashReserve: 0, concentratedStock: 0, homeEquity: 2000000, nqdc: 1500000, otherAssets: 0 },
    );
    expect(res.charitableBequest).toBeCloseTo(0, 6);
  });

  it('a bequest is never funded from life insurance or the HSA', () => {
    // The F-6 finding: without this cap a plan could deduct a bequest no
    // asset ever satisfied while heirs still collected the policy in full.
    const res = calculateHeirEstateTax(
      { ...FOUNDER, charitableBequestAmount: 999000000, lifeInsuranceEnabled1: true, lifeInsuranceOwnership1: 'self' },
      0, 0, 0, 1000000, 0, false, 400000,
      { cashReserve: 0, concentratedStock: 0, homeEquity: 0, nqdc: 0, otherAssets: 0 },
    );
    expect(res.charitableBequest).toBeCloseTo(0, 6);
  });

  it('other property (land, a business) is in the estate but not fundable either', () => {
    const res = calculateHeirEstateTax(
      { ...FOUNDER, charitableBequestAmount: 999000000 }, 0, 0, 0, 0, 0, false, 0,
      { cashReserve: 0, concentratedStock: 0, homeEquity: 0, nqdc: 0, otherAssets: 3000000 },
    );
    expect(res.charitableBequest).toBeCloseTo(0, 6);
  });
});
