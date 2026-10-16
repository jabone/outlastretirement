// The four levers of the one-lever compare, and the input hygiene both of
// its sides go through. (CFE-COMPARE-01, changelog 175.)
//
// This lives apart from OneLeverCompare.jsx because none of it is
// presentation: a lever is a named, plain-English change to the plan plus
// the exact patch the engine needs to honor it, and that pairing is the
// part most worth testing. Keeping it in a pure module means
// oneLeverCompare.test.js can run the patches straight through
// runProjection without standing up React, a context provider, or a DOM --
// so the guard against a silently-no-op lever is a cheap test rather than
// an expensive one, which is the difference between a guard that exists
// and a guard that gets skipped.
import { DEFAULT_INPUTS } from '../calculator';

// App.jsx does exactly this before calling runProjection: an empty string in
// a numeric field is a half-typed input, not a zero-valued one, and the
// engine's arithmetic turns '' into NaN rather than 0. Both sides of this
// comparison go through it so the fork differs from the baseline in the
// lever and nothing else.
export function sanitizeForProjection(inputs) {
  const out = { ...inputs };
  for (const key in out) {
    if (out[key] === '') out[key] = 0;
  }
  return out;
}

// The levers, in the order a plan tends to face them.
//
// Each one owns its own `patch`, and that is not ceremony. Two of these four
// do NOTHING if you set the obvious key on its own, which is exactly the
// silent-no-op trap DEVELOPMENT.md warns about -- a compare that renders two
// identical lines and lets the user conclude "this lever doesn't matter"
// is worse than no compare at all:
//
//   - rothConversionAmount is ignored unless rothConversionStrategy is
//     'fixed'. A plan sitting on 'none' -- the default -- would show a flat
//     zero delta for every conversion size. The patch sets both.
//   - claimingAge2 only exists when a second spouse is enabled, so the
//     claim-age lever is offered for spouse 1 only; a household lever that
//     silently moved one person's date would not be one lever.
//
// lifestyleExpense needs no such care: the engine only ever reads the annual
// total, whichever entry mode built it (see its DEFAULT_INPUTS comment). But
// a plan entered monthly or by category has a ledger behind that total, so
// this lever is labeled as the annual figure and is never written back.
// Exported for src/__tests__/oneLeverCompare.test.js, which runs each
// lever's patch through runProjection and asserts the result actually
// MOVES. That test is the guard against the silent-no-op class of bug --
// remove `rothConversionStrategy: 'fixed'` from the first patch below and
// it goes red, which is the only reason to believe it is load-bearing.
export const LEVERS = [
  {
    id: 'rothConversion',
    label: 'Convert this much to Roth each year',
    kind: 'currency',
    step: 5000,
    min: 0,
    unitHint: 'per year',
    baselineValue: (inputs) => (inputs.rothConversionStrategy === 'fixed' ? Number(inputs.rothConversionAmount) || 0 : 0),
    suggest: (base) => (base > 0 ? base + 25000 : 25000),
    patch: (v) => ({ rothConversionStrategy: 'fixed', rothConversionAmount: v }),
    describe: (v, inputs) => (
      inputs.rothConversionStrategy !== 'fixed' && v > 0
        ? 'Your plan converts nothing today, so this side also switches fixed annual conversions on.'
        : null
    ),
    format: (v, fc) => (v > 0 ? `${fc(v)} a year` : 'No conversions'),
  },
  {
    id: 'claimingAge',
    label: 'Claim Social Security at this age',
    kind: 'age',
    step: 1,
    min: 62,
    max: 70,
    unitHint: 'age 62 to 70',
    baselineValue: (inputs) => Number(inputs.claimingAge1) || DEFAULT_INPUTS.claimingAge1,
    suggest: (base) => Math.min(70, base + 3),
    patch: (v) => ({ claimingAge1: v }),
    describe: (_v, inputs) => (
      inputs.spouse2Enabled
        ? `Moves ${inputs.spouse1Name || 'the first spouse'}’s claim date only — one lever means one person.`
        : null
    ),
    format: (v) => `Age ${v}`,
  },
  {
    id: 'spendLevel',
    label: 'Spend this much a year in retirement',
    kind: 'currency',
    step: 2500,
    min: 0,
    unitHint: 'per year, in today’s dollars',
    baselineValue: (inputs) => Number(inputs.lifestyleExpense) || 0,
    suggest: (base) => Math.max(0, Math.round((base * 0.9) / 500) * 500),
    patch: (v) => ({ lifestyleExpense: v }),
    describe: (_v, inputs) => (
      inputs.lifestyleExpenseInputMode && inputs.lifestyleExpenseInputMode !== 'annual'
        ? 'Your plan builds this figure from a monthly or category breakdown. This compares the annual total; nothing is written back to that breakdown.'
        : null
    ),
    format: (v, fc) => `${fc(v)} a year`,
  },
  {
    id: 'withdrawalOrder',
    label: 'Draw from your accounts in this order',
    kind: 'choice',
    options: [
      { value: 'TaxableFirst', label: 'Taxable first, then Pre-Tax, then Roth' },
      { value: 'PreTaxFirst', label: 'Pre-Tax first, then Taxable, then Roth' },
      { value: 'RothFirst', label: 'Roth first, then Taxable, then Pre-Tax' },
      { value: 'ProRata', label: 'Proportionally across all three' },
    ],
    baselineValue: (inputs) => inputs.withdrawalStrategy || DEFAULT_INPUTS.withdrawalStrategy,
    suggest: (base) => (base === 'TaxableFirst' ? 'ProRata' : 'TaxableFirst'),
    patch: (v) => ({ withdrawalStrategy: v }),
    describe: () => null,
    format: (v, _fc, lever) => (lever.options.find(o => o.value === v) || {}).label || v,
  },
];

// Today's dollars, or nominal, matching the app-wide Real/Nominal toggle
// (changelog 184). OneLeverCompare calls runProjection itself, which returns
// future dollars, so it converts through the same function App.jsx's
// `projection` memo uses; there is one conversion in the app, in
// utils/displayDollars.js, and this re-export keeps the existing imports.
export { deflateProjectionForDisplay } from './displayDollars';
