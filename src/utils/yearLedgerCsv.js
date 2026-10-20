// Builds the "Export Yearly Ledger (CSV)" download from a projection.
//
// Kept as a pure function (no DOM) so it can be unit-tested. This used to
// live inline in YearLedgerTab and read fields the engine never emitted
// (startBalance, totalContribution, totalWithdrawal, growth, endBalance),
// so every numeric cell in the downloaded file came out as "NaN". The
// columns below are the projection row fields the on-screen table itself
// renders, plus the per-account start/end balances that the table only
// shows in part.

import { neutralizeFormula } from './csvSafety';

const round = (v) => (Number.isFinite(v) ? Math.round(v) : '');

// The engine's row `salary` is pay plus part-time pay plus RSU/GSU vesting
// plus deferred-comp payouts. The Salary column is pay alone, as on screen
// (Year by Year, the Cash Flow map); the other two have their own columns.
const stockVesting = (y) => (y.rsuIncome1 || 0) + (y.rsuIncome2 || 0);
const deferredCompPayout = (y) => (y.nqdcDistribution1 || 0) + (y.nqdcDistribution2 || 0);
const payOnly = (y) => (Number.isFinite(y.salary) ? Math.max(0, y.salary - stockVesting(y) - deferredCompPayout(y)) : NaN);

// Investment growth in dollars isn't a field the engine stores (it reports
// growthRate as a percentage), so it's reconstructed from the identity
// end = start + contributions + match - draws + growth. Milestone inflows
// deposited straight into accounts land in "growth" under this identity,
// which is why the column is labeled as derived.
const derivedGrowth = (y) => {
  const start = (y.preTaxStart || 0) + (y.rothStart || 0) + (y.taxableStart || 0) + (y.hsaStart || 0);
  const end = y.totalPortfolioEnding;
  if (!Number.isFinite(end)) return NaN;
  return end - start - (y.totalContributions || 0) - (y.employerMatchAmount || 0) + (y.drawdown || 0) + (y.hsaGeneralDraw || 0);
};

export const YEAR_LEDGER_CSV_HEADERS = [
  'Year', 'Age 1', 'Age 2', 'Filing', 'Phase',
  'Salary', 'Social Security', 'Pension', 'Fixed Inflows',
  'Lifestyle Expenses', 'Healthcare', 'IRMAA', 'Taxes Paid', 'Total Expenses',
  'Contributions', 'RMD', 'Draw PreTax', 'Draw Roth', 'Draw Taxable', 'Total Draw',
  'Roth Conversion', 'Roth Conversion Taxable', 'Roth Conversion Tax', 'Shortfall',
  'PreTax Start', 'Roth Start', 'Taxable Start', 'HSA Start',
  'PreTax End', 'Roth End', 'Taxable End', 'HSA End',
  'Ending Portfolio', 'Growth Rate %', 'Investment Growth (derived)',
  // Appended rather than placed beside Filing so existing spreadsheets
  // keyed on column position keep working (changelog 195).
  'State',
  // Years abroad (changelog 196), appended for the same reason.
  'Country', 'Foreign Tax', 'US Foreign Tax Credit',
  // Split out of Salary (which is pay alone), appended for the same reason.
  'Stock vesting', 'Deferred comp payout',
  // The HSA paying a shortfall nothing else could, and its tax (already in
  // Taxes Paid). Not in Total Draw. Appended for the same reason.
  'HSA for general spending', 'HSA general spending tax',
  // Investment fees paid that year (changelog 447), appended for the same
  // reason. Investment Growth (derived) is after them.
  'Fund expenses', 'Advisor fee',
];

export function buildYearLedgerCsvRows(projection) {
  const years = projection?.years || [];
  return years.map(y => [
    y.year,
    y.age1 ?? '',
    y.age2 ?? '',
    y.householdStatus ?? '',
    y.isRetired ? 'Retired' : 'Working',
    round(payOnly(y)),
    round(y.ssIncome),
    round(y.pension),
    round(y.fixedInflows),
    round(y.lifestyleExpenses),
    round(y.healthcareBridge),
    round(y.irmaaCost),
    round(y.totalTaxesPaid),
    round(y.totalExpenses),
    round(y.totalContributions),
    round(y.rmdAmount),
    round(y.drawPreTax),
    round(y.drawRoth),
    round(y.drawTaxable),
    round(y.drawdown),
    round(y.convertAmount),
    // The taxable share (pro-rata basis rule) and the marginal tax the
    // conversion caused -- the two figures that explain the amount above.
    // Added with the on-screen columns in changelog 189 so the download and
    // the table carry the same information.
    round(y.convertAmountTaxable),
    round(y.conversionTaxCost),
    round(y.shortfall),
    round(y.preTaxStart),
    round(y.rothStart),
    round(y.taxableStart),
    round(y.hsaStart),
    round(y.preTaxEnd),
    round(y.rothEnd),
    round(y.taxableEnd),
    round(y.hsaEnd),
    round(y.totalPortfolioEnding),
    Number.isFinite(y.growthRate) ? y.growthRate : '',
    round(derivedGrowth(y)),
    y.residenceState ?? '',
    y.residenceCountry ? (y.foreignRegime ? `${y.residenceCountry} (${y.foreignRegime})` : y.residenceCountry) : '',
    round(y.foreignTax),
    round(y.foreignTaxCredit),
    round(stockVesting(y)),
    round(deferredCompPayout(y)),
    round(y.hsaGeneralDraw || 0),
    round(y.hsaGeneralDrawTax || 0),
    round(y.fundExpensesPaid || 0),
    round(y.advisorFeesPaid || 0),
  ]);
}

// Text cells that a spreadsheet would run as a formula get a leading
// apostrophe (A29); numbers, negative ones included, stay numbers.
const escapeCell = (v) => {
  const s = String(neutralizeFormula(v) ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildYearLedgerCsv(projection) {
  const lines = [YEAR_LEDGER_CSV_HEADERS, ...buildYearLedgerCsvRows(projection)];
  return lines.map(row => row.map(escapeCell).join(',')).join('\n');
}
