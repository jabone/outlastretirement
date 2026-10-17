// What the budget actually costs, in the units people think in
// (changelog 218).
//
// The ledger on the budgeting screen sums to one annual figure, which is
// the number the engine wants and the WRONG number for judging a line: a
// household knows what it spends a month, and knows a big annual bill as a
// single event. "Foundation / daily / monthly / annual" was the phrasing in
// the podcast behind readiness question 1; the useful part of it is cadence,
// not a new taxonomy, so the essential tick stays exactly as it was and
// nothing here changes what the plan projects.
//
// Two facts sit beside the total and neither is derived here:
//   - the essential share, which the engine already owns
//     (`essentialShareOf`), and
//   - the TAX on top, from the first retired year of the projection in
//     hand. A budget is what you spend; what you have to fund is that plus
//     the tax on getting it out, and the screen never said so.
import { essentialShareOf } from '../calculator';

const DAYS = 365;

export function spendingCadence(inputs, projection) {
  const annual = Math.max(0, Number(inputs && inputs.lifestyleExpense) || 0);
  if (!(annual > 0)) return null;
  const essentialShare = essentialShareOf(inputs);
  const essentialAnnual = essentialShare === null ? null : annual * essentialShare;

  const rows = (projection && projection.years) || [];
  const firstRetired = rows.find((y) => y.isRetired) || null;
  // The tax bill of the first retired year, which is the year this budget
  // first has to be funded out of the portfolio rather than a salary.
  const taxes = firstRetired ? Math.max(0, Number(firstRetired.totalTaxesPaid) || 0) : null;

  const cadence = (v) => (v === null ? null : { annual: v, monthly: v / 12, daily: v / DAYS });

  return {
    total: cadence(annual),
    essential: cadence(essentialAnnual),
    // What is left after the essentials -- the part a guardrail can reach.
    discretionary: cadence(essentialAnnual === null ? null : Math.max(0, annual - essentialAnnual)),
    essentialShare,
    taxes,
    taxYear: firstRetired ? firstRetired.year : null,
    // Spend this, and you have to fund this. The gap is the tax nobody
    // budgets for.
    grossNeeded: taxes === null ? null : annual + taxes,
  };
}
