// The income stack on the Tax Bracket chart (Tax & Estate) -- one list that
// the bars, the legend beneath the chart and the hover card all read, so
// the three can never call the same series by three names again
// (changelog 276). `always` rows show in the hover card even at $0.
//
// The parts sum to the engine's gross ordinary income for the year. The
// standard deduction is not a layer: it is the first slice of that same
// income, taxed at 0%, and the chart draws it as a line.
export const TAX_INCOME_SERIES = [
  { key: 'taxableSalary', name: 'Wages (Taxable)', color: 'var(--series-3)', always: true },
  { key: 'stockVesting', name: 'Stock vesting (RSUs)', color: 'var(--series-7)' },
  { key: 'deferredComp', name: 'Deferred comp payouts', color: 'var(--series-5)' },
  { key: 'pension', name: 'Pension', color: 'var(--series-1)' },
  { key: 'taxableSS', name: 'Taxable SS', color: 'var(--series-4)' },
  { key: 'rmdAmount', name: 'Forced RMDs', color: 'var(--series-6)' },
  { key: 'discretionaryDrawPreTax', name: 'Pre-Tax Draws', color: 'var(--series-2)' },
  { key: 'convertAmount', name: 'Roth Conversions', color: 'var(--series-8)' },
  { key: 'otherOrdinary', name: 'Other ordinary income', color: 'var(--text-muted)' },
];

// The reference lines on the same chart, each labeled at its right end.
// Bracket lines share one dashed style and differ by their label; IRMAA
// tiers are drawn solid-dashed in their own colors.
export const TAX_BRACKET_LINES = [
  { key: 'limit10', label: '10%' },
  { key: 'limit12', label: '12%' },
  { key: 'limit22', label: '22%' },
  { key: 'limit24', label: '24%' },
  { key: 'limit32', label: '32%' },
  { key: 'limit35', label: '35%' },
];
export const IRMAA_TIER_LINES = [
  { key: 'irmaaTier1', label: 'IRMAA 1', color: 'var(--series-4)' },
  { key: 'irmaaTier2', label: 'IRMAA 2', color: 'var(--warning)' },
  { key: 'irmaaTier3', label: 'IRMAA 3', color: 'var(--series-2)' },
  { key: 'irmaaTier4', label: 'IRMAA 4', color: 'var(--series-8)' },
];
