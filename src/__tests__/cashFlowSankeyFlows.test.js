// The Cash Flow map's inflows name what the money is. The engine's `salary`
// carries salary, RSU vesting and deferred-comp payouts together; the map
// said "Salary $342,500 ... all of it from salary" for $245,000 of salary
// plus $97,500 of vesting, and showed "Salary" in a year both spouses were
// retired (a deferred-comp payout).
import { describe, it, expect } from 'vitest';
import { runProjection } from '../calculator';
import { buildDemoInputs } from '../config/demoPlan';
import { cashFlowSankeyFlows, wrapSankeyLabel } from '../utils/cashFlowSankeyFlows';

const years = runProjection(buildDemoInputs()).years;
const node = (flows, name) => flows.inflows.find((i) => i.name === name);

describe('cash flow map inflows', () => {
  it('splits stock vesting out of salary', () => {
    const y = years[0];
    const f = cashFlowSankeyFlows(y);
    const rsu = y.rsuIncome1 + y.rsuIncome2;
    expect(rsu).toBeGreaterThan(0);
    expect(node(f, 'Stock vesting').value).toBeCloseTo(rsu, 6);
    expect(node(f, 'Salary').value).toBeCloseTo(y.salary - rsu - y.nqdcDistribution1 - y.nqdcDistribution2, 6);
  });

  it('calls a retired year’s deferred-comp payout what it is', () => {
    const y = years.find((r) => r.isRetired && (r.nqdcDistribution1 + r.nqdcDistribution2) > 0);
    expect(y).toBeTruthy();
    const f = cashFlowSankeyFlows(y);
    expect(node(f, 'Salary')).toBeUndefined();
    expect(node(f, 'Deferred comp payout').value).toBeCloseTo(y.nqdcDistribution1 + y.nqdcDistribution2, 6);
  });
});

// The map's node labels sit in a column beside the diagram whose width is
// set for a line of at most 15 characters (13 on a phone). "Savings/
// Reinvested" ran past the chart's right edge as one line.
describe('cash flow map labels', () => {
  it('breaks a long label after its slash', () => {
    expect(wrapSankeyLabel('Savings/Reinvested', 15)).toEqual(['Savings/', 'Reinvested']);
    expect(wrapSankeyLabel('Saved / Reinvested', 15)).toEqual(['Saved /', 'Reinvested']);
  });

  it('leaves a label that fits alone, and breaks others at spaces', () => {
    expect(wrapSankeyLabel('Taxes Paid', 15)).toEqual(['Taxes Paid']);
    expect(wrapSankeyLabel('Deferred comp payout', 15)).toEqual(['Deferred comp', 'payout']);
    expect(wrapSankeyLabel('Roth Conversion Tax', 13)).toEqual(['Roth', 'Conversion', 'Tax']);
  });

  it('cuts a word longer than the column with an ellipsis', () => {
    expect(wrapSankeyLabel('Discretionary Draws', 10)).toEqual(['Discretio\u2026', 'Draws']);
  });

  it('fits every label of every demo year in the column, desktop and phone', () => {
    for (const y of years) {
      const { inflows, outflows } = cashFlowSankeyFlows(y);
      for (const { name } of [...inflows, ...outflows]) {
        for (const max of [15, 13]) {
          const lines = wrapSankeyLabel(name, max);
          expect(lines.length).toBeLessThanOrEqual(3);
          lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(max));
          expect(lines.join(' ').replace(/\/ /g, '/')).toBe(name.replace(/\/ /g, '/'));
        }
      }
    }
  });
});
