import {
  TAX_TREATMENTS, computeMarketValue, getTotalCostBasis, getEffectiveAssetClass, ASSET_CLASSES,
} from '../utils/portfolioHoldings';

// The data behind the planner-packet Account summary (AccountsSummarySheet.jsx).

const BUCKET_LABEL = Object.fromEntries(TAX_TREATMENTS.map((t) => [t.value, t.label]));
const CLASS_LABEL = Object.fromEntries(ASSET_CLASSES.map((c) => [c.value, c.label]));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function accountsSummaryModel(inputs = {}, holdings = []) {
  const own = [];
  const add = (label, value, note) => { if (num(value) > 0) own.push({ label, value: num(value), note }); };
  add('Pre-Tax (Traditional IRA / 401k)', inputs.preTaxInit);
  add('Roth (Roth IRA / 401k)', inputs.rothInit);
  add('Taxable (brokerage and cash)', inputs.taxableInit);
  add('HSA', inputs.hsaInit);
  if (inputs.cashFloorEnabled) add('Cash reserve (emergency fund)', inputs.cashFloorInit);
  if (inputs.concentratedStockEnabled) add(`Single stock position${inputs.concentratedStockLabel ? ` (${inputs.concentratedStockLabel})` : ''}`, inputs.concentratedStockInit, 'held apart from the taxable total');
  if (inputs.concentratedStock2Enabled) add(`Second stock position${inputs.concentratedStock2Label ? ` (${inputs.concentratedStock2Label})` : ''}`, inputs.concentratedStock2Init, 'held apart from the taxable total');
  if (inputs.nqdcEnabled1) add('Deferred compensation (Spouse 1)', inputs.nqdcInit1);
  if (inputs.spouse2Enabled && inputs.nqdcEnabled2) add('Deferred compensation (Spouse 2)', inputs.nqdcInit2);
  if (inputs.lifeInsuranceEnabled1) add('Life insurance cash value (Spouse 1)', num(inputs.lifeInsuranceCashValueInit1) - num(inputs.lifeInsuranceLoanBalance1), 'net of any policy loan');
  if (inputs.spouse2Enabled && inputs.lifeInsuranceEnabled2) add('Life insurance cash value (Spouse 2)', num(inputs.lifeInsuranceCashValueInit2) - num(inputs.lifeInsuranceLoanBalance2), 'net of any policy loan');
  const investable = own.reduce((t, r) => t + r.value, 0);
  const other = [];
  if (inputs.homeOwned) { const v = num(inputs.homeValueInit); if (v > 0) other.push({ label: 'Home', value: v }); }
  if (num(inputs.otherEstateAssetsInit) > 0) other.push({ label: 'Other assets', value: num(inputs.otherEstateAssetsInit) });
  const owe = [];
  if (num(inputs.mortgageBalance) > 0) owe.push({ label: 'Mortgage', value: num(inputs.mortgageBalance), note: num(inputs.mortgageRate) ? `${num(inputs.mortgageRate)}%` : '' });
  if (num(inputs.otherDebtBalance) > 0) owe.push({ label: 'Other debt', value: num(inputs.otherDebtBalance), note: num(inputs.otherDebtRate) ? `${num(inputs.otherDebtRate)}%` : '' });
  const netWorth = investable + other.reduce((t, r) => t + r.value, 0) - owe.reduce((t, r) => t + r.value, 0);

  // Holdings, combined by symbol (or name) within each tax type; nothing
  // about which account or firm they sit in.
  const buckets = [];
  const list = Array.isArray(holdings) ? holdings : [];
  for (const t of TAX_TREATMENTS) {
    const inBucket = list.filter((h) => h?.taxTreatment === t.value);
    if (!inBucket.length) continue;
    const bySym = new Map();
    for (const h of inBucket) {
      const k = (h.symbol || h.name || 'Unnamed').toUpperCase();
      const cur = bySym.get(k) || { symbol: h.symbol || '', name: h.name || '', assetClass: getEffectiveAssetClass(h), value: 0, cost: 0 };
      cur.value += computeMarketValue(h);
      cur.cost += getTotalCostBasis(h);
      bySym.set(k, cur);
    }
    const rows = [...bySym.values()].filter((r) => r.value > 0.5).sort((a, b) => b.value - a.value);
    const total = rows.reduce((s, r) => s + r.value, 0);
    // Holdings not linked to the plan's balances can disagree with them; a
    // reviewer should see that rather than two totals that don't match.
    const planBalance = num(inputs[`${t.value}Init`]);
    const differs = planBalance > 0 && Math.abs(total - planBalance) > Math.max(100, planBalance * 0.01);
    buckets.push({
      id: t.value, label: BUCKET_LABEL[t.value], total, showGain: t.value === 'taxable', planBalance, differs,
      rows: rows.map((r) => ({ ...r, pct: total > 0 ? (r.value / total) * 100 : 0, gain: r.cost > 0 ? r.value - r.cost : null, className: CLASS_LABEL[r.assetClass] || 'Other' })),
    });
  }
  const mix = {};
  let mixTotal = 0;
  for (const h of list) { const v = computeMarketValue(h); const c = getEffectiveAssetClass(h); mix[c] = (mix[c] || 0) + v; mixTotal += v; }
  const assetMix = ASSET_CLASSES.map((c) => ({ label: c.label, value: mix[c.value] || 0, pct: mixTotal > 0 ? ((mix[c.value] || 0) / mixTotal) * 100 : 0 })).filter((c) => c.value > 0.5);
  return { own, investable, other, owe, netWorth, buckets, assetMix, holdingsTotal: mixTotal };
}

// How a holding reads on paper (changelog 300). Funds imported from a plan
// statement without a ticker carry a made-up code built from the name
// ("VANGUARD-TARGET-RETIREMENT-2070"); show the name alone. Placeholder
// names ("FSELX Position", or just the ticker again) add nothing.
export function holdingLabel(symbol = '', name = '') {
  const sym = String(symbol || '').trim();
  const nm = String(name || '').trim();
  const madeUp = /-/.test(sym) || sym.length > 6;
  const low = nm.toLowerCase();
  const placeholder = !nm || (sym && (low === sym.toLowerCase() || low === `${sym.toLowerCase()} position`));
  const readableSlug = sym.toLowerCase().split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  if (madeUp) return { ticker: '', name: placeholder ? readableSlug : nm };
  return { ticker: sym, name: placeholder ? '' : nm };
}

// A long list keeps every holding of at least 1% of its tax type (and at
// least the ten largest); the rest print as one line.
export const SMALL_GROUP_THRESHOLD = 15;
export function groupSmallHoldings(rows) {
  if (rows.length <= SMALL_GROUP_THRESHOLD) return { rows, other: null };
  const keep = rows.filter((r, i) => i < 10 || r.pct >= 1);
  const rest = rows.slice(keep.length);
  if (rest.length < 2) return { rows, other: null };
  const value = rest.reduce((t, r) => t + r.value, 0);
  const total = rows.reduce((t, r) => t + r.value, 0);
  const gains = rest.filter((r) => r.gain !== null);
  return {
    rows: keep,
    other: { count: rest.length, value, pct: total > 0 ? (value / total) * 100 : 0, gain: gains.length ? gains.reduce((t, r) => t + r.gain, 0) : null },
  };
}
