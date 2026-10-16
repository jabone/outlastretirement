// Changelog 221: when the budget is actually due, month by month.
//
// The load-bearing test is the first one: the twelve months must sum to the
// year. The moment that stops being true this has stopped being a view of
// the ledger and become a second opinion about it.
import { describe, it, expect } from 'vitest';
import { runProjection, readSpendingBlueprint, DEFAULT_INPUTS } from '../calculator';
import { spendingCalendar, paymentMonths, MONTH_NAMES } from '../utils/spendingCalendar';

const ledger = (lines) => ({
  ...DEFAULT_INPUTS,
  lifestyleExpenseInputMode: 'categories',
  spendingBlueprint: { lines, essentialCategoryIds: ['housing'], unlinkedFields: [] },
});
const LINES = [
  { id: 'tax', categoryId: 'housing', label: 'Taxes', amount: 7000, cadence: 'annual', dueMonth: 1 },
  { id: 'ins', categoryId: 'housing', label: 'Insurance', amount: 4000, cadence: 'quarterly', dueMonth: 2 },
  { id: 'main', categoryId: 'housing', label: 'Maintenance', amount: 5000 },
  { id: 'trav', categoryId: 'personal', label: 'Travel', amount: 24000, cadence: 'semiannual', dueMonth: 6 },
];

describe('the month the money is due', () => {
  it('rearranges the year without changing it', () => {
    const c = spendingCalendar(ledger(LINES));
    expect(c.months).toHaveLength(12);
    expect(c.months.reduce((t, m) => t + m.amount, 0)).toBeCloseTo(40000, 6);
    expect(c.annual).toBe(40000);
    expect(c.average).toBeCloseTo(40000 / 12, 6);
    expect(c.months.reduce((t, m) => t + m.share, 0)).toBeCloseTo(1, 9);
  });

  it('puts each payment in the month it is actually paid', () => {
    expect(paymentMonths('monthly', 1)).toHaveLength(12);
    expect(paymentMonths('annual', 4)).toEqual([4]);
    expect(paymentMonths('quarterly', 2)).toEqual([2, 5, 8, 11]);
    expect(paymentMonths('semiannual', 11)).toEqual([11, 5]);
    // An unknown cadence falls back to monthly rather than vanishing.
    expect(paymentMonths('fortnightly', 1)).toHaveLength(12);
  });

  it('splits an annual amount across the payments, not on top of them', () => {
    const c = spendingCalendar(ledger(LINES));
    // Insurance is 4,000 a year paid quarterly: 1,000 in each of four
    // months, not 4,000 four times.
    const feb = c.months[1];
    expect(feb.lines.find((l) => l.id === 'ins').amount).toBeCloseTo(1000, 6);
    expect(c.months.filter((m) => m.lines.some((l) => l.id === 'ins'))).toHaveLength(4);
  });

  it('names the heaviest and lightest months, and the gap between them', () => {
    const c = spendingCalendar(ledger(LINES));
    // January carries the 7,000 tax bill; June and December each carry
    // 12,000 of travel, so they are heavier still.
    expect(c.peak.name).toBe('June');
    expect(c.peak.amount).toBeCloseTo(12000 + 5000 / 12, 6);
    expect(c.lightest.amount).toBeCloseTo(5000 / 12, 6);
    expect(c.swing).toBeCloseTo(c.peak.amount - c.lightest.amount, 9);
    expect(c.peakRatio).toBeGreaterThan(3);
    expect(c.lumpy).toBe(true);
  });

  it('says a flat year is flat rather than manufacturing a concern', () => {
    const c = spendingCalendar(ledger([
      { id: 'a', categoryId: 'housing', label: 'Rent', amount: 24000 },
      { id: 'b', categoryId: 'food', label: 'Food', amount: 12000 },
    ]));
    expect(c.lumpy).toBe(false);
    expect(c.peakRatio).toBeCloseTo(1, 9);
    expect(c.swing).toBeCloseTo(0, 9);
    expect(c.months.every((m) => Math.abs(m.amount - 3000) < 1e-9)).toBe(true);
  });

  it('leaves the pre-65 health line out, the way the lifestyle total does', () => {
    const c = spendingCalendar(ledger([
      ...LINES,
      { id: 'aca', categoryId: 'healthBridgePre65', label: 'ACA', amount: 18000, cadence: 'monthly' },
    ]));
    expect(c.annual).toBe(40000);
  });

  it('says nothing at all without a ledger', () => {
    expect(spendingCalendar({ ...DEFAULT_INPUTS })).toBeNull();
    expect(spendingCalendar(ledger([]))).toBeNull();
  });

  it('treats a ledger saved before this existed as paid monthly', () => {
    const old = readSpendingBlueprint({ lines: [{ id: 'a', categoryId: 'housing', label: 'Rent', amount: 12000 }] });
    expect(old.lines[0].cadence).toBe('monthly');
    expect(old.lines[0].dueMonth).toBe(1);
    expect(MONTH_NAMES).toHaveLength(12);
  });

  it('changes nothing the plan projects', () => {
    // The projection is annual. Moving every bill into one month, or
    // spreading it back out, must leave it bit-identical.
    const flat = ledger(LINES.map((l) => ({ ...l, cadence: 'monthly' })));
    const lumped = ledger(LINES.map((l) => ({ ...l, cadence: 'annual', dueMonth: 3 })));
    expect(JSON.stringify(runProjection(lumped))).toBe(JSON.stringify(runProjection(flat)));
    // And the calendars genuinely differ, so the comparison above is not
    // vacuous.
    expect(spendingCalendar(lumped).peakRatio).toBeGreaterThan(spendingCalendar(flat).peakRatio);
  });
});
