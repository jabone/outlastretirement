// The stay-vs-move compare (changelog 198, RELOCATION_SPEC.md section 8.2
// surface 2). One plan run twice: as entered, and with one move abroad
// taken out. Spending is the same on both sides, so the difference shows
// up in what is left -- the headline is what your heirs receive -- and in
// where the money went on the way, read straight off the ledger rows.
//
// Pure, like oneLeverCompare.js, so its tests run the real projection with
// no React. Two rules from that module's history (changelog 175) apply:
//   - no silent no-op: taking a move out must change the plan, and the
//     tests check that it does;
//   - no display drift: every figure here is a field the engine already
//     emits. Nothing is recomputed.
import { runProjection, calculateHeirEstateTax, readResidencyTimeline, planWideResidence } from '../calculator';
import { finalBalanceFactor } from './displayDollars';
import { sanitizeForProjection } from './oneLeverCompare';

// The raw entry's id by the normalizer's own rule, so "this move" means
// the same entry the engine priced.
const rawIdOf = (e) => (e && e.id != null ? String(e.id) : String(Math.trunc(Number(e?.fromYear))));

export const ALL_MOVES_ABROAD = 'all';

// The moves abroad a plan contains, as the engine reads them.
export function movesAbroad(inputs) {
  return readResidencyTimeline(inputs.residencyTimeline, planWideResidence(inputs)).filter((m) => m.kind === 'foreign');
}

// The same plan with one move abroad taken out (or every one, for
// ALL_MOVES_ABROAD). Whatever came before it simply carries on until the
// next move.
export function stayInputs(inputs, moveId) {
  const raw = Array.isArray(inputs.residencyTimeline) ? inputs.residencyTimeline : [];
  const abroadIds = new Set(movesAbroad(inputs).map((m) => m.id));
  const drop = (e) => (moveId === ALL_MOVES_ABROAD ? abroadIds.has(rawIdOf(e)) && e?.kind === 'foreign' : rawIdOf(e) === String(moveId));
  return { ...inputs, residencyTimeline: raw.filter((e) => !drop(e)) };
}

// The Estate Legacy Planner's figures for a projection, in nominal dollars
// -- the same call App.jsx makes for the Tax & Estate tab, so the two can
// never disagree.
export function estateForProjection(inputs, projection) {
  const years = projection?.years || [];
  if (years.length === 0) return calculateHeirEstateTax(inputs, 0, 0, 0);
  const last = years[years.length - 1];
  return calculateHeirEstateTax(
    inputs,
    last.preTaxEnd || 0,
    last.rothEnd || 0,
    last.taxableEnd || 0,
    last.lifeInsuranceNetDeathBenefit1 || 0,
    last.lifeInsuranceNetDeathBenefit2 || 0,
    false,
    last.hsaEnd || 0,
    {
      nqdc: (last.nqdcBalance1 || 0) + (last.nqdcBalance2 || 0),
      cashReserve: last.cashReserveBalance || 0,
      concentratedStock: (last.concentratedStockBalance || 0) + (last.concentratedStock2Balance || 0),
      homeEquity: last.homeEquity || 0,
      otherAssets: last.otherEstateAssetsValue || 0,
    },
  );
}

// The breakdown lines: what each side paid over the whole plan. `sign`
// says which way round a positive difference reads: +1 means moving costs
// more, -1 (the US credit) means a larger figure saves money.
export const COMPARE_LINES = [
  { id: 'stateTax', label: 'US state tax', fields: ['stateTax'], sign: 1 },
  { id: 'federalTax', label: 'US federal tax, before the credit for foreign tax', fields: ['federalTax'], sign: 1 },
  { id: 'foreignTax', label: 'Tax abroad', fields: ['foreignTax'], sign: 1 },
  { id: 'foreignTaxCredit', label: 'US credit for tax abroad', fields: ['foreignTaxCredit'], sign: -1 },
  { id: 'health', label: 'Health cover and Medicare premiums', fields: ['healthcareBridge', 'irmaaCost', 'foreignHealthcare'], sign: 1 },
  { id: 'medicarePenalty', label: 'Medicare late-enrollment penalty', fields: ['medicarePenalty'], sign: 1 },
];

// Of the tax abroad, the part that earned no US credit. Shown under the
// lines, not in them -- it is already inside "Tax abroad".
const UNCREDITABLE = 'uncreditableForeignTax';

// Lifetime total of some row fields: in today's dollars (each year divided
// by its own inflation factor) or as paid.
function lifetime(years, fields, real) {
  return years.reduce((t, y) => {
    const v = fields.reduce((s, k) => s + (Number(y[k]) || 0), 0);
    return t + (real ? v / ((y && (y.priceIndex || y.inflFactor)) || 1) : v);
  }, 0);
}

const firstShortfallYear = (years) => {
  const hit = years.find((y) => (Number(y.shortfall) || 0) > 0.01);
  return hit ? hit.year : null;
};

function side(inputs, real) {
  const clean = sanitizeForProjection(inputs);
  const projection = runProjection(clean);
  const years = projection.years || [];
  const estate = estateForProjection(clean, projection);
  // The same end-of-plan factor the Tax & Estate tab converts the estate by.
  const finalFactor = real ? finalBalanceFactor(years) : 1;
  return {
    years,
    heirs: (Number(estate.netInherited) || 0) / finalFactor,
    runsOutIn: firstShortfallYear(years),
    lines: Object.fromEntries(COMPARE_LINES.map((l) => [l.id, lifetime(years, l.fields, real)])),
    uncreditable: lifetime(years, [UNCREDITABLE], real),
  };
}

// The whole comparison. `real` = today's dollars (the app-wide toggle).
export function compareStayVsMove(inputs, moveId, { real = true } = {}) {
  const move = side(inputs, real);
  const stay = side(stayInputs(inputs, moveId), real);
  return {
    move,
    stay,
    heirsDifference: move.heirs - stay.heirs,
    lines: COMPARE_LINES.map((l) => ({
      ...l,
      move: move.lines[l.id],
      stay: stay.lines[l.id],
      difference: move.lines[l.id] - stay.lines[l.id],
    })),
    uncreditable: move.uncreditable - stay.uncreditable,
  };
}
