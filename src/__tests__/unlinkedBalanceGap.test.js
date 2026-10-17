import { describe, it, expect } from 'vitest';
import { unlinkedBalanceGap } from '../utils/portfolioHoldings';

// the owner, 2026-09-24: added 14 lots, Initial Nest Egg did not move. The plan's
// balances were typed in by hand; nothing on screen said so.
const holdings = [{ id: 'x' }];
const plan = { initialBalancesSource: 'manual', preTaxInit: 1000, rothInit: 0, taxableInit: 400, hsaInit: 50 };
const derived = { preTax: 1000, roth: 0, taxable: 700, hsa: 80 };

describe('unlinkedBalanceGap', () => {
  it('reports typed-in balances beside what the holdings would give the plan', () => {
    expect(unlinkedBalanceGap(plan, holdings, derived)).toEqual({
      planNestEgg: 1400, holdingsNestEgg: 1700, planTotal: 1450, holdingsTotal: 1780,
    });
  });

  it('says nothing once the plan is linked -- the holdings already win', () => {
    expect(unlinkedBalanceGap({ ...plan, initialBalancesSource: 'holdings' }, holdings, derived)).toBeNull();
  });

  it('says nothing with no holdings to sync from', () => {
    expect(unlinkedBalanceGap(plan, [], derived)).toBeNull();
  });

  it('says nothing when every bucket already agrees to the dollar, rounding included', () => {
    expect(unlinkedBalanceGap(plan, holdings, { preTax: 1000.4, roth: 0, taxable: 399.6, hsa: 50 })).toBeNull();
  });

  it('notices a difference confined to HSA, which the nest-egg card leaves out', () => {
    const g = unlinkedBalanceGap(plan, holdings, { preTax: 1000, roth: 0, taxable: 400, hsa: 51 });
    expect(g).not.toBeNull();
    expect(g.planNestEgg).toBe(g.holdingsNestEgg);
  });

  it('notices buckets that offset each other even when the totals match', () => {
    expect(unlinkedBalanceGap(plan, holdings, { preTax: 1100, roth: 0, taxable: 300, hsa: 50 })).not.toBeNull();
  });
});
