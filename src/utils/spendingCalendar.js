// When the budget is actually DUE, month by month (changelog 221).
//
// A household does not meet its year in twelve equal parts. The property
// tax bill lands in one month; insurance might be monthly, quarterly or a
// single annual payment; and which of those you chose is most of the
// answer to "can I manage January". The ledger knew the year's total and
// said nothing at all about the shape of it.
//
// Two things this is NOT:
//   - It is not a change to the plan. A line's amount is still its ANNUAL
//     total, the twelve months still sum to it, and the projection -- which
//     works in years -- cannot tell the difference. A test asserts that sum
//     because the day it stops being true, this stops being a view and
//     starts being a second opinion.
//   - It is not a cash-flow forecast. It says what falls due in each month
//     of a typical year, not what a particular January will cost after
//     inflation, a phase change or a guardrail.
import { readSpendingBlueprint, SPENDING_CADENCES, SPENDING_HEALTH_BRIDGE_ID } from '../calculator';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const perYearOf = (cadence) => (SPENDING_CADENCES.find((c) => c.id === cadence) || SPENDING_CADENCES[0]).perYear;

// Which months of the year a line is paid in, first payment in dueMonth and
// then evenly spaced. Monthly is all twelve; annual is the one.
export function paymentMonths(cadence, dueMonth) {
  const perYear = perYearOf(cadence);
  const gap = 12 / perYear;
  const first = Math.min(12, Math.max(1, Math.round(Number(dueMonth) || 1)));
  const months = [];
  for (let i = 0; i < perYear; i += 1) months.push(((first - 1 + i * gap) % 12) + 1);
  return months;
}

export function spendingCalendar(inputs) {
  if (inputs?.lifestyleExpenseInputMode !== 'categories') return null;
  const { lines } = readSpendingBlueprint(inputs.spendingBlueprint);
  // The pre-65 health line is the engine's own, kept out of the lifestyle
  // total, so it stays out of the lifestyle calendar too.
  const budget = lines.filter((l) => l.categoryId !== SPENDING_HEALTH_BRIDGE_ID && l.amount > 0);
  if (budget.length === 0) return null;

  const months = MONTH_NAMES.map((name, i) => ({ month: i + 1, name, amount: 0, lines: [] }));
  for (const l of budget) {
    const due = paymentMonths(l.cadence, l.dueMonth);
    const each = l.amount / due.length;
    for (const m of due) {
      months[m - 1].amount += each;
      // Only the lumpy ones are worth naming under a month; twelve equal
      // monthly lines would just repeat the budget twelve times.
      if (l.cadence !== 'monthly') {
        months[m - 1].lines.push({ id: l.id, label: l.label, categoryId: l.categoryId, amount: each });
      }
    }
  }

  const annual = budget.reduce((t, l) => t + l.amount, 0);
  const average = annual / 12;
  const amounts = months.map((m) => m.amount);
  const peak = months[amounts.indexOf(Math.max(...amounts))];
  const lightest = months[amounts.indexOf(Math.min(...amounts))];
  return {
    months: months.map((m) => ({ ...m, share: annual > 0 ? m.amount / annual : 0 })),
    annual,
    average,
    peak,
    lightest,
    // How much heavier the worst month is than an even twelfth. 1.0 means
    // a perfectly flat year, and the card says nothing in that case rather
    // than manufacturing a concern.
    peakRatio: average > 0 ? peak.amount / average : 1,
    // The gap a household actually has to carry: the worst month minus the
    // lightest one.
    swing: peak.amount - lightest.amount,
    lumpy: budget.some((l) => l.cadence !== 'monthly'),
  };
}
