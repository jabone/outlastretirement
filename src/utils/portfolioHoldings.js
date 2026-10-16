// Data model for the premium "Detailed Holdings" tab (PortfolioTab.jsx).
//
// This is a from-scratch React/cashflowengine-side model, not a literal port
// of the Portfolio Tracker App (PTA)'s Holding schema -- PTA is vanilla
// JS + a Node quote-proxy server (see docs/ARCHITECTURE.md in that project),
// a different enough stack from this app's React/client-only architecture
// that "port directly" means re-implementing the UI/state layer in React,
// not copy-pasting files. See INTEGRATION_STRATEGY.md Section 2 for the
// full discussion.
//
// One deliberate schema difference from PTA: PTA's `account` field is a free
// -text descriptor only ("Rollover IRA (Horizon)") with no machine-readable
// tax treatment. This model adds `taxTreatment` explicitly, because that's
// the field the bucket rollup below (and therefore the Initial Balances
// sync in PortfolioTab.jsx) actually depends on -- see INTEGRATION_STRATEGY.md
// Section 3, "each PTA account needs a tax-treatment tag".
//
// v1 scope note: `currentPrice` is manually entered, same as everything else
// here -- PTA's live quote proxy (server.js, Yahoo/Stooq with fallback) has
// not been ported. That's real future work (a Vercel serverless function
// would be the natural home for it, mirroring how PTA's own docs suggest
// hosting it), deliberately out of scope for this first pass.

import {
  DISTRIBUTION_CHARACTERS,
  LIQUIDATION_EPSILON,
  applyLiquidationToHolding,
  collectActualDistributions,
  computeAnnualDividendIncome,
  computeMarketValue,
  createHolding,
  createLiquidation,
  createLot,
  getEarliestLotDate,
  getTotalCostBasis,
  getTotalShares,
  holdingCharacter,
  holdingTerm,
  isValidDistributionCharacter,
  isValidTaxTreatment,
  localIsoDate,
  matrixRowForRecord,
  termForLotAsOf,
} from './holdingsCore';

// Re-exported so every existing importer of this module keeps working; the
// definitions live in holdingsCore.js (see its header).
export {
  ASSET_CLASSES,
  CASH_EQUIVALENT_TICKERS,
  DISTRIBUTION_CHARACTERS,
  LEGACY_DISTRIBUTION_CHARACTERS,
  TAX_TREATMENTS,
  applyLiquidationToHolding,
  canSyncFromHoldings,
  collectActualDistributions,
  computeAnnualDividendIncome,
  computeAssetClassMix,
  computeBucketTotals,
  computeCashReserveFromHoldings,
  computeConcentratedStockLinkValues,
  computeLiquidationPreview,
  computeMarketValue,
  computeTaxableCostBasis,
  computeTaxableDistributionYield,
  createHolding,
  createLiquidation,
  createLot,
  describePriceBasis,
  getEarliestLotDate,
  getEffectiveAssetClass,
  getTotalCostBasis,
  getTotalShares,
  guessAssetClass,
  holdingTerm,
  isValidAssetClass,
  isValidDistributionCharacter,
  isValidTaxTreatment,
  localIsoDate,
  migrateDistributionCharacters,
  retractGuessedLotSources,
  sanitizeImportedHoldings,
  sanitizeImportedLiquidations,
  selectLotsForSale,
  unlinkedBalanceGap,
  withPriceSnapshot,
} from './holdingsCore';

// What kind of security a holding is. Purely descriptive -- nothing in
// calculator.js or the bucket-totals rollup reads this, it only drives the
// "Type" column/badge on the Holdings table. Defaults to 'stock' (the
// common case) rather than an empty/unset value, same reasoning as
// taxTreatment defaulting to 'taxable' above. When a Google Sheet pricing
// connection is set up, this gets auto-populated/kept in sync from the
// Sheet's own SECURITY_TYPE(ticker) lookup on every Refresh (see
// mapSecurityTypeToEnum in sheetPricing.js and handleRefreshLiveData in
// PortfolioTab.jsx) -- same "Sheet wins when it has an answer" rule already
// used for currentPrice/annualDividendPerShare. Without Live Pricing
// connected, or for a symbol the Sheet couldn't resolve, this stays exactly
// whatever the user picked (or the 'stock' default).
export const SECURITY_TYPES = [
  { value: 'stock', label: 'Stock' },
  { value: 'etf', label: 'ETF' },
  { value: 'mutualFund', label: 'Mutual Fund' },
  { value: 'index', label: 'Index' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'other', label: 'Other' },
];

const SECURITY_TYPE_VALUES = SECURITY_TYPES.map((t) => t.value);

export function isValidSecurityType(value) {
  return SECURITY_TYPE_VALUES.includes(value);
}

// How many distributions per year a frequency implies -- used to derive a
// per-payment income estimate from the trailing annualDividendPerShare
// total (which stays the source of truth; frequency never multiplies into
// it, only divides it back out for display). "Irregular"/"Unspecified"
// return null rather than a guess, since there's no sane even split for a
// fund that doesn't pay on a fixed cadence.
export const DIVIDEND_FREQUENCIES = [
  { value: 'unspecified', label: 'Not Set / Unspecified', paymentsPerYear: null },
  // Weekly payers (YieldMax-style option-income ETFs such as YMAX): 52
  // payments a year; the projected timeline buckets them by month.
  { value: 'weekly', label: 'Weekly', paymentsPerYear: 52 },
  { value: 'monthly', label: 'Monthly', paymentsPerYear: 12 },
  { value: 'quarterly', label: 'Quarterly', paymentsPerYear: 4 },
  { value: 'semiAnnual', label: 'Semi-Annual', paymentsPerYear: 2 },
  { value: 'annual', label: 'Annual', paymentsPerYear: 1 },
  { value: 'irregular', label: 'Irregular / Varies', paymentsPerYear: null },
];

const DIVIDEND_FREQUENCY_VALUES = DIVIDEND_FREQUENCIES.map((f) => f.value);

export function isValidDividendFrequency(value) {
  return DIVIDEND_FREQUENCY_VALUES.includes(value);
}

// Gate for rendering a holding's researchUrl (see createHolding above) as
// an actual clickable link. Requires an http(s) URL specifically -- a
// `javascript:`/`data:`/other scheme (typed by mistake, or by anyone with
// write access to this browser's storage) never becomes a clickable href.
// This is a plain string check, not a full URL parse -- researchUrl is
// free text a user can put anything in, so this only needs to answer "is
// it safe to put in an href," not "is it a well-formed URL."
export function isSafeExternalUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

// The ticker inside a research link the pricing Sheet GENERATED
// ("https://finance.yahoo.com/quote/DUK-PA" -> "DUK-PA"), or null for any
// other link -- one the person typed, a fund's fact sheet, a quote page with
// a path or query after the ticker.
//
// It exists so a generated link can follow its holding. The link was filled
// once, the first time a refresh priced the holding, and never again; so a
// holding first priced as "DUK-A" and later pointed at "DUK-PA" kept a
// link to a ticker Yahoo does not know, which lands on its search page
// (John, 2026-10-05). A link nobody typed has no reason to be kept.
const GENERATED_QUOTE_URL = /^https:\/\/finance\.yahoo\.com\/quote\/([^/?#\s]+)\/?$/i;
export function generatedQuoteTicker(url) {
  const m = GENERATED_QUOTE_URL.exec(String(url || '').trim());
  if (!m) return null;
  try { return decodeURIComponent(m[1]).toUpperCase(); } catch { return m[1].toUpperCase(); }
}

// Should a refresh replace this holding's research link with the Sheet's
// link for `ticker`? Yes when it has none, or when the one it has is a
// generated link for a DIFFERENT ticker. Never for a link the person typed.
export function shouldRefillResearchUrl(currentUrl, ticker) {
  if (!String(currentUrl || '').trim()) return true;
  const linked = generatedQuoteTicker(currentUrl);
  return linked !== null && linked !== String(ticker || '').trim().toUpperCase();
}

export function paymentsPerYearForFrequency(frequency) {
  return DIVIDEND_FREQUENCIES.find((f) => f.value === frequency)?.paymentsPerYear ?? null;
}

// Creates a new holding with sane defaults, merged with whatever the caller
// provides. `id` is always freshly generated here (never taken from
// `overrides`) so callers can't accidentally collide two holdings' ids.
// The symbol Live Pricing should look up for a holding: its proxy ticker
// when one is set, else its own symbol. A holding is priced live when it
// isn't manual, OR when it has a proxy (a proxy is the whole point of
// getting a manually-priced plan fund back onto live data).
export function quoteSymbolFor(holding) {
  const proxy = (holding?.pricingSymbol || '').trim().toUpperCase();
  return proxy || (holding?.symbol || '').trim().toUpperCase();
}

export function isLivePriced(holding) {
  return Boolean(holding) && (!holding.manualPricing || Boolean((holding.pricingSymbol || '').trim()));
}

// Turns a fresh proxy quote into a patch for the holding. First sighting
// after a manual/imported price: record the anchor, leave the price alone
// (the statement's price is the truth as of its date). Afterwards:
//   currentPrice = anchor.holdingPrice * proxyPrice / anchor.proxyPrice
// so the position follows the proxy's return from that point, and
// re-anchors whenever the user or an import sets a fresh price.
export function applyProxyPrice(holding, proxyPrice, today = localIsoDate()) {
  const proxy = Number(proxyPrice);
  if (!(proxy > 0)) return null;
  const anchor = holding?.pricingAnchor;
  const holdingPrice = Number(holding?.currentPrice) || 0;
  if (!anchor || !(Number(anchor.proxyPrice) > 0) || !(Number(anchor.holdingPrice) > 0)) {
    return { currentPrice: holdingPrice, pricingAnchor: { proxyPrice: proxy, holdingPrice, date: today } };
  }
  const scaled = Math.round((Number(anchor.holdingPrice) * proxy / Number(anchor.proxyPrice)) * 10000) / 10000;
  return { currentPrice: scaled, pricingAnchor: anchor };
}

// --- Multi-lot cost basis / DRIP tracking ----------------------------------
//
// v1 scope note above says "one lot per holding" -- that's the limitation
// this section removes. A holding can now optionally carry multiple
// purchase lots (original buys and DRIP-reinvested shares alike), each with
// its own date/shares/price, instead of one blended average. This is a
// real accuracy upgrade, not just more detail: DRIP shares were actually
// bought at their own later dates and prices, so a single avgBuyPrice +
// purchaseDate was always an approximation for any DRIP-reinvesting
// holding (see the Analytics sub-tab's existing "directional, not precise"
// caveat, which this section is what resolves).
//
// Deliberately manual entry, not an auto-DRIP simulator: unlike Portfolio
// Tracker (PTA), this app has no historical price/dividend feed to derive
// reinvestment lots from automatically (see the v1 scope note above on
// currentPrice) -- generating them would mean fabricating data this app
// doesn't actually have. A user enters each lot themselves, same "manually
// entered, refreshed by hand" tier as everything else in this model.

export const LOT_SOURCES = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'drip', label: 'DRIP Reinvestment' },
  // Synthesized only by the PTA ledger-import replay below (see
  // parsePtaLedgerEntries/applyTaxTreatments) when a negative-sharesAdded
  // ledger entry needs to sell more shares than any lot built from the
  // ledger's own recorded history can cover -- meaning those shares were
  // clearly held before the ledger's earliest entry. Inserted as one
  // clearly-labeled lot sized to exactly the shortfall, rather than either
  // fabricating a fake "Purchase" lot or leaving the sale mathematically
  // impossible (AuraPortfolio's own ledger modal does neither correctly --
  // see js/09-history-ledger-modal.js in that project -- it renders negative
  // lots with broken cost/value/gain-% math instead).
  { value: 'openingBalance', label: 'Opening Balance (Imported)' },
  // What an IMPORTED share addition gets when the source data never said
  // where the shares came from. It exists because the alternative -- the
  // importer picking 'drip' or 'purchase' -- is the app asserting something
  // it does not know, and `source` stopped being cosmetic the moment a
  // 'drip' lot started counting as dividend income (changelog 153): a
  // wrong guess there invents income out of the user's own contributions.
  // Nothing is counted as income until the user says what it was.
  { value: 'unspecified', label: 'Not specified' },
];

const LOT_SOURCE_VALUES = LOT_SOURCES.map((s) => s.value);

export function isValidLotSource(value) {
  return LOT_SOURCE_VALUES.includes(value);
}

// --- Distribution matrix (Distributions sub-tab header) ------------------
//
// One row per KIND of distribution, with the forward estimate and what was
// actually received side by side. It replaced a row of KPI cards that
// claimed to show cash flow while every figure on it was the same
// dividends-only estimate sliced two ways -- including a "Return of
// Capital" chip that was really the estimated DIVIDENDS of holdings tagged
// as ROC, not any return of capital received.
//
// The two sides carry genuinely different type information, and the matrix
// keeps them in separate columns rather than blending them:
//
//   Estimate  -- every dollar is a dividend by construction (shares x
//                Ann. Dividend/Share). Its KIND is whatever the holding's
//                Distribution Character says, since that is the user
//                stating what this fund pays them.
//   Actual    -- a distribution event carries its own type, which is the
//                better evidence and wins. A reinvestment lot carries none,
//                so it falls back to the holding's Character.
const MATRIX_ROWS = [
  { id: 'qualifiedDividend', label: 'Qualified dividends' },
  { id: 'ordinaryDividend', label: 'Ordinary (non-qualified) dividends' },
  { id: 'ltcg', label: 'Long-term capital gain distributions' },
  { id: 'capitalGainDistribution', label: 'Capital gain distributions (term not stated)' },
  { id: 'interest', label: 'Interest' },
  { id: 'returnOfCapital', label: 'Return of capital' },
  { id: 'mixed', label: 'Mixed / fund-dependent' },
  { id: 'unspecified', label: 'Kind not stated' },
];

export const DISTRIBUTION_MATRIX_ROWS = MATRIX_ROWS;

// Return of capital is not income -- it reduces cost basis. The matrix
// still shows it (you received the money) but must never let it be read as
// income, so callers total it separately.
export const NON_INCOME_MATRIX_ROWS = ['returnOfCapital'];

// The twelve COMPLETE months ending with last month, as 'YYYY-MM' keys.
// Deliberately the same span the rolling timeline marks `settled`, so the
// matrix's trailing column and the chart's solid bars always describe the
// same period.
//
// Why trailing twelve rather than a calendar year: a calendar year is a
// partial year for eleven months out of twelve (in February, "this year" is
// one month of data), and last year goes stale as this one fills up. A
// trailing window is always a complete cycle, so it captures December
// capital gains and once-a-year payers without ever resetting.
export function trailingTwelveMonthKeys(asOfDate = new Date()) {
  const keys = [];
  for (let offset = -12; offset < 0; offset += 1) {
    const d = new Date(Date.UTC(asOfDate.getFullYear(), asOfDate.getMonth() + offset, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

// The bases the Retirement Income projection can be built from.
//
// It has always run on `estimate`: shares x Ann. Dividend/Share, dividends
// only. That is the THINNEST figure available -- it cannot see a capital
// gain distribution, which for a fund portfolio is often the largest
// payment of the year -- so retirement coverage was understated for anyone
// holding funds.
//
// The trailing bases fix that, but not identically, and the difference
// matters enough that the user picks rather than the app:
//
//   ttmRecurring -- last twelve complete months of dividends and interest.
//                   Excludes capital gain distributions, which are lumpy
//                   and not promises: a fund distributes them when its
//                   manager realizes gains, so projecting one forward as
//                   income projects a windfall as if it repeated. Also
//                   excludes return of capital, which is spendable but is
//                   your own principal coming back, not income.
//   ttmAll       -- everything received in those twelve months, including
//                   capital gains and return of capital. The honest answer
//                   to "what actually landed", and the wrong one to
//                   extrapolate from unless you know the gains recur.
//
// `estimate` is the most repeatable and the least complete; `ttmAll` the
// reverse. `ttmRecurring` is the recommended middle: real money, of the
// kinds that tend to come back every year.
export function computeRetirementIncomeBases(holdings = [], { asOfDate = new Date() } = {}) {
  const trailingKeys = new Set(trailingTwelveMonthKeys(asOfDate));
  const years = [...new Set([...trailingKeys].map((k) => Number(k.slice(0, 4))))];

  let estimate = 0;
  let recurring = 0;
  let capitalGains = 0;
  let returnOfCapital = 0;

  for (const h of holdings || []) {
    estimate += computeAnnualDividendIncome(h);
    const character = holdingCharacter(h);
    for (const year of years) {
      for (const rec of collectActualDistributions(h, year)) {
        if (!trailingKeys.has(rec.date.slice(0, 7))) continue;
        const rowId = matrixRowForRecord(rec, character);
        if (rowId === 'returnOfCapital') returnOfCapital += rec.amount;
        else if (rowId === 'ltcg' || rowId === 'capitalGainDistribution') capitalGains += rec.amount;
        else recurring += rec.amount;
      }
    }
  }

  return {
    estimate,
    ttmRecurring: recurring,
    ttmAll: recurring + capitalGains + returnOfCapital,
    capitalGains,
    returnOfCapital,
    // Empty history is why a basis can be unavailable: offering "last twelve
    // months" as $0 would quietly zero someone's retirement coverage.
    hasTrailingHistory: recurring + capitalGains + returnOfCapital > 0,
  };
}

export const RETIREMENT_INCOME_BASES = [
  { value: 'estimate', label: 'Forward dividend estimate', hint: 'Ann. Dividend/Share x shares. Repeatable, but blind to capital gain distributions.' },
  { value: 'ttmRecurring', label: 'Last 12 months, recurring', hint: 'Dividends and interest actually received. Excludes capital gains and return of capital.' },
  { value: 'ttmAll', label: 'Last 12 months, everything', hint: 'Every distribution received, capital gains included. Complete, but extrapolates windfalls.' },
];

export function resolveRetirementIncomeBasis(bases, choice) {
  if (!bases) return 0;
  if (choice === 'ttmRecurring' || choice === 'ttmAll') {
    // Never silently project $0: a portfolio with no recorded history falls
    // back to the estimate rather than reporting no retirement income.
    if (!bases.hasTrailingHistory) return bases.estimate;
    return bases[choice];
  }
  return bases.estimate;
}

// Rows for the Distributions sub-tab's matrix, plus the totals beneath it.
//
// `thisYear` counts the calendar year in progress; `lastFullYear` is the
// most recent COMPLETE year, which is the only sound basis for a trailing
// yield -- a part-finished year would understate it.
export function computeDistributionMatrix(holdings = [], { asOfDate = new Date() } = {}) {
  const thisYear = asOfDate.getFullYear();
  const lastFullYear = thisYear - 1;
  const trailingKeys = new Set(trailingTwelveMonthKeys(asOfDate));

  const blank = () => ({ estimated: 0, thisYear: 0, lastFullYear: 0, trailing12: 0 });
  const acc = Object.fromEntries(MATRIX_ROWS.map((r) => [r.id, blank()]));
  // Which holdings put money in each row, so a row can be opened up and
  // acted on -- "Kind not stated" is a to-do list, not a verdict, and the
  // fix is one Distribution Character per holding.
  const contributors = Object.fromEntries(MATRIX_ROWS.map((r) => [r.id, new Map()]));
  let marketValue = 0;

  const credit = (rowId, holding, key, amount) => {
    if (amount <= 0) return;
    acc[rowId][key] += amount;
    const map = contributors[rowId];
    const entry = map.get(holding.id) || { holdingId: holding.id, symbol: holding.symbol, name: holding.name, ...blank() };
    entry[key] += amount;
    map.set(holding.id, entry);
  };

  for (const h of holdings || []) {
    marketValue += computeMarketValue(h);
    const character = holdingCharacter(h);
    credit(character, h, 'estimated', computeAnnualDividendIncome(h));
    for (const year of [thisYear, lastFullYear]) {
      const key = year === thisYear ? 'thisYear' : 'lastFullYear';
      for (const rec of collectActualDistributions(h, year)) {
        const rowId = matrixRowForRecord(rec, character);
        credit(rowId, h, key, rec.amount);
        // The trailing window straddles both years, so it is credited from
        // the same pass rather than re-walked.
        if (trailingKeys.has(rec.date.slice(0, 7))) credit(rowId, h, 'trailing12', rec.amount);
      }
    }
  }

  const rows = MATRIX_ROWS
    .map((r) => ({
      ...r,
      ...acc[r.id],
      isIncome: !NON_INCOME_MATRIX_ROWS.includes(r.id),
      // Biggest contributor first: the one worth labeling soonest.
      holdings: [...contributors[r.id].values()]
        .sort((a, b) => (b.estimated + b.lastFullYear + b.thisYear) - (a.estimated + a.lastFullYear + a.thisYear)),
    }))
    .filter((r) => r.estimated > 0 || r.thisYear > 0 || r.lastFullYear > 0 || r.trailing12 > 0);

  const sum = (key, incomeOnly) => rows.reduce((n, r) => ((incomeOnly && !r.isIncome) ? n : n + r[key]), 0);
  const totals = {
    estimated: sum('estimated', false),
    thisYear: sum('thisYear', false),
    lastFullYear: sum('lastFullYear', false),
    trailing12: sum('trailing12', false),
    estimatedIncome: sum('estimated', true),
    thisYearIncome: sum('thisYear', true),
    lastFullYearIncome: sum('lastFullYear', true),
    trailing12Income: sum('trailing12', true),
  };

  return { rows, totals, marketValue, thisYear, lastFullYear };
}

// Total actually received across the portfolio in `year` -- every logged
// distribution plus every reinvestment lot, on exactly the definition
// collectActualDistributions uses.
//
// Deliberately counts the WHOLE year including the month in progress, and
// is the single figure behind both the "Received This Year" card and the
// payout panel's own year-to-date line. The month chart is stricter (it
// leaves an in-progress month on its estimate, so a part-finished month
// does not read as a dip), and letting these two drift apart would put two
// different "actual" totals on one screen -- which is the exact confusion
// this whole area keeps having to unpick.
export function sumActualDistributions(holdings = [], year) {
  let total = 0;
  for (const h of holdings || []) {
    for (const rec of collectActualDistributions(h, year)) total += rec.amount;
  }
  return total;
}

// Every lot still waiting for the user to say where its shares came from.
//
// An 'unspecified' lot counts as NOTHING -- which is the safe direction to
// be wrong, but also the silent one: an unlabeled reinvestment quietly
// drops out of dividend income with no error and no gap on screen, unlike
// the overstatement it replaced, which announced itself with a headline
// figure. This is what lets the UI say "12 lots are still unlabeled"
// rather than leaving the user to check holding by holding.
//
// Grouped by holding because that is the unit the user acts on: the Ledger
// opens per holding, so a count of 47 across the portfolio is a chore
// while "3 in FSELX" is a task.
export function findUnspecifiedLots(holdings = []) {
  const byHolding = [];
  let total = 0;
  for (const h of holdings || []) {
    const lots = Array.isArray(h?.lots) ? h.lots : [];
    const count = lots.reduce((n, lot) => (lot?.source === 'unspecified' ? n + 1 : n), 0);
    if (count === 0) continue;
    total += count;
    byHolding.push({ holdingId: h.id, symbol: h.symbol, count });
  }
  byHolding.sort((a, b) => b.count - a.count || String(a.symbol).localeCompare(String(b.symbol)));
  return { total, byHolding };
}

// --- Distribution event ledger ----------------------------------------------
//
// A per-holding log of individual dividend/distribution payments -- date,
// rate/share, gross amount, where it went (DRIP vs cash), and (for a DRIP
// payment) how many shares it bought and at what NAV. This is the "full
// event ledger" scope decision for the Dividends sub-tab, matching
// AuraPortfolio's "Asset History & Distribution Ledger" modal
// (js/09-history-ledger-modal.js in that project) -- with one deliberate
// difference: AuraPortfolio's ledger data is 100% hardcoded fictional
// placeholder content (defaultDemoAssetLedgers/defaultPrivateAssetLedgers),
// falling back to an empty array (getAssetLedger()) for any asset it has no
// canned data for. This model has no canned data at all -- every entry is
// something the user actually logged, full stop.

export const DISTRIBUTION_EVENT_TYPES = [
  { value: 'dividend', label: 'Dividend' },
  { value: 'capitalGainDistribution', label: 'Capital Gain Distribution' },
  { value: 'returnOfCapital', label: 'Return of Capital' },
  { value: 'interest', label: 'Interest' },
  { value: 'other', label: 'Other' },
];

const DISTRIBUTION_EVENT_TYPE_VALUES = DISTRIBUTION_EVENT_TYPES.map((t) => t.value);

export function isValidDistributionEventType(value) {
  return DISTRIBUTION_EVENT_TYPE_VALUES.includes(value);
}

export const DISTRIBUTION_DESTINATIONS = [
  { value: 'drip', label: 'Reinvested (DRIP)' },
  { value: 'cash', label: 'Cash' },
];

const DISTRIBUTION_DESTINATION_VALUES = DISTRIBUTION_DESTINATIONS.map((d) => d.value);

export function isValidDistributionDestination(value) {
  return DISTRIBUTION_DESTINATION_VALUES.includes(value);
}

// Same defaults-merged-with-overrides pattern as createLot above, same
// reason `id` is always freshly generated rather than taken from overrides.
// `sharesAdded`/`navPrice` only mean something for a `destination: 'drip'`
// entry -- see logDistributionEvent in usePortfolioHoldings.js, which uses
// both to append a matching lot when they're present, and leaves them at
// their 0/null defaults (no lot synthesized) for a plain cash payment.
export function createDistributionEvent(overrides = {}) {
  const { id: _ignoredId, ...rest } = overrides;
  return {
    id: `dist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: null,
    type: 'dividend',
    ratePerShare: 0,
    grossAmount: 0,
    destination: 'cash',
    sharesAdded: 0,
    navPrice: null,
    notes: '',
    ...rest,
  };
}

// "Lifetime distributions received" for the ledger modal's KPI header --
// every real distribution this holding has ever received, on the same
// definition the Dividends month chart uses (collectActualDistributions
// below): logged distribution events PLUS reinvestment lots, de-duplicated.
// It read events alone until 2026-09-10, which reported $0 for a holding
// that reinvests everything and logs nothing -- the reinvestment lots sat
// right underneath the $0 in the same modal.
// Never reads computeProjectedPayoutSchedule's estimated entries: this is a
// "what actually happened" figure, not a forecast.
export function computeLifetimeDistributions(holding) {
  return collectActualDistributions(holding).reduce((sum, rec) => sum + rec.amount, 0);
}

// Calendar months (0-indexed) each frequency's payments land on within a
// single year, for computeProjectedPayoutSchedule below. Deliberately only
// covers the four frequencies that imply an even cadence
// (paymentsPerYearForFrequency returns a number for these) -- 'irregular'/
// 'unspecified' have no sane schedule to guess, same rule
// paymentsPerYearForFrequency itself already follows.
const PROJECTED_SCHEDULE_MONTHS = {
  // Weekly payments are bucketed one entry per month (the timeline is
  // monthly); each entry carries the month's share of the year and the
  // number of payments it stands for.
  weekly: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  monthly: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  quarterly: [2, 5, 8, 11],
  semiAnnual: [5, 11],
  annual: [11],
};

// Estimates this holding's forward payout schedule for `year` (default: the
// current year) purely from data the app already has -- dividendFrequency
// and the trailing annualDividendPerShare (Sheet-sourced where Live Pricing
// is connected, manually entered otherwise) -- split evenly across that
// frequency's calendar months. This is explicitly NOT a real corporate-
// actions/ex-dividend-date feed the way AuraPortfolio's calendar looks like
// one; every returned item carries `estimated: true` so the UI can label it
// as such and it's never written back into distributionEvents above.
// Returns [] for 'unspecified'/'irregular' (no fixed cadence to estimate
// from) or a non-positive annualDividendPerShare -- same "missing input ->
// excluded, not guessed" convention purchaseDate/targetAllocationPct use
// elsewhere in this file.
export function computeProjectedPayoutSchedule(holding, { year, asOfDate = new Date() } = {}) {
  const months = PROJECTED_SCHEDULE_MONTHS[holding?.dividendFrequency];
  const perPayment = computePerPaymentIncome(holding);
  const annualPerShare = Number(holding?.annualDividendPerShare) || 0;
  if (!months || perPayment === null || annualPerShare <= 0) return [];

  const targetYear = year ?? asOfDate.getFullYear();
  const shares = getTotalShares(holding);
  const ratePerShare = annualPerShare / months.length;

  const paymentsPerEntry = holding?.dividendFrequency === 'weekly' ? 52 / 12 : 1;

  // Never project a payment for a month the position did not exist in. The
  // schedule is built from a calendar cadence, so without this a holding
  // bought in September still gets a March and a June payment invented for
  // it -- income the user provably never received, sitting in the same
  // chart as months they did. `getEarliestLotDate` is the best ownership
  // start the model has (earliest lot, else purchaseDate); when it is
  // unknown the whole year is projected as before, same "missing input ->
  // excluded, not guessed" rule the rest of this function follows -- an
  // unknown start date is not evidence of a late start.
  const ownedFrom = getEarliestLotDate(holding);

  return months
    .map((month) => ({
      estimated: true,
      date: new Date(Date.UTC(targetYear, month + 1, 0)).toISOString().slice(0, 10), // last day of the month
      estRatePerShare: ratePerShare,
      estGrossAmount: shares * ratePerShare,
      estPayments: paymentsPerEntry,
    }))
    .filter((ev) => !ownedFrom || ev.date >= ownedFrom);
}

// The Distributions timeline's rolling window: the last `backMonths`
// completed months, then the month in progress and the next
// `forwardMonths - 1`. Eighteen bars by default -- twelve months of what
// really happened, six of what is coming.
//
// It replaced a fixed Jan-Dec view, which truncated history every January:
// on New Year's Day the chart showed twelve estimated bars and no record of
// anything, at exactly the moment a full year of history had just been
// completed. A rolling window never has that cliff.
//
// Each row carries BOTH bases -- the projected payout schedule
// (computeProjectedPayoutSchedule) and what the holding actually received
// (collectActualDistributions, just above) -- and a `basis` saying which
// one to show:
//
//   'actual'     -- the month has ENDED and at least one real distribution
//                   is recorded in it. What landed beats what was
//                   projected, always.
//   'estimated'  -- everything else, INCLUDING a finished month with
//                   nothing recorded. An unrecorded month is not a $0
//                   month; the app cannot tell "nothing was paid" from
//                   "nothing was entered", so it keeps showing the
//                   projection and says so rather than reporting a
//                   confident zero. Same "missing input -> excluded, not
//                   guessed" rule as the rest of this file.
//
// The month in progress stays 'estimated' even once payments are logged in
// it: it is a partial month and would read as a dip against its neighbors.
//
// `key` is 'YYYY-MM' and is what the UI filters on. An index into the
// window would point at a different month tomorrow.
export function computeRollingDividendTimeline(holdings = [], { asOfDate = new Date(), backMonths = 12, forwardMonths = 6 } = {}) {
  const anchorYear = asOfDate.getFullYear();
  const anchorMonth = asOfDate.getMonth();

  const months = [];
  for (let offset = -backMonths; offset < forwardMonths; offset += 1) {
    const d = new Date(Date.UTC(anchorYear, anchorMonth + offset, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    months.push({
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      year,
      month,
      settled: offset < 0, // strictly before the month in progress
      estValue: 0, estCount: 0, actualValue: 0, actualCount: 0,
    });
  }
  const byKey = new Map(months.map((m) => [m.key, m]));
  const years = [...new Set(months.map((m) => m.year))];

  for (const holding of holdings || []) {
    for (const year of years) {
      for (const ev of computeProjectedPayoutSchedule(holding, { year, asOfDate })) {
        const m = byKey.get(ev.date.slice(0, 7));
        if (!m) continue;
        m.estValue += ev.estGrossAmount;
        m.estCount += ev.estPayments || 1;
      }
      for (const rec of collectActualDistributions(holding, year)) {
        const m = byKey.get(rec.date.slice(0, 7));
        if (!m) continue;
        m.actualValue += rec.amount;
        m.actualCount += 1;
      }
    }
  }

  return months.map((m) => {
    const basis = m.settled && m.actualCount > 0 ? 'actual' : 'estimated';
    return {
      ...m,
      basis,
      value: basis === 'actual' ? m.actualValue : m.estValue,
      count: basis === 'actual' ? m.actualCount : m.estCount,
    };
  });
}

// The calendar year's quarters on the SAME rule the chart draws its bars
// by (changelog 207): a finished month with anything received counts what
// was received, every other month its estimate. The Q1-Q4 / Year pills
// used to add up estimates only, so a quarter with a $32,000 capital gain
// distribution showed its $2,000 dividend estimate under the bar that
// showed the $32,000.
export function computeCalendarQuarterTotals(holdings = [], { asOfDate = new Date() } = {}) {
  const month = asOfDate.getMonth();
  const rows = computeRollingDividendTimeline(holdings, { asOfDate, backMonths: month, forwardMonths: 12 - month });
  const quarters = [0, 1, 2, 3].map(() => ({ value: 0, actual: 0, estimated: 0 }));
  for (const r of rows) {
    const q = quarters[Math.floor(r.month / 3)];
    q.value += r.value;
    if (r.basis === 'actual') q.actual += r.value; else q.estimated += r.value;
  }
  const year = quarters.reduce((t, q) => ({ value: t.value + q.value, actual: t.actual + q.actual, estimated: t.estimated + q.estimated }), { value: 0, actual: 0, estimated: 0 });
  return { quarters, year };
}

// Total annual dividend income split by dripEnabled true/false, for the
// Distributions sub-tab's "where it goes today" line under the matrix,
// which replaced a "DRIP vs Cash Destination" KPI card. Holdings default
// dripEnabled: true (see createHolding), so an all-true portfolio reports
// its full income under `drip` and 0 under `cash` -- not split 50/50 or
// omitted.
export function computeDripCashSplit(holdings = []) {
  let drip = 0;
  let cash = 0;
  for (const holding of holdings) {
    const income = computeAnnualDividendIncome(holding);
    if (holding?.dripEnabled) drip += income; else cash += income;
  }
  return { drip, cash, total: drip + cash };
}

// Portfolio-wide dividend yield -- total annual dividend income over total
// market value across every holding. Distinct from the per-holding
// computeDividendYield above (that one's price-weighted per position; this
// is the single blended figure for the new KPI card). Returns 0 when there's
// no market value to divide by, same as computeDividendYield's per-holding
// convention.
// Blended dividend yield of the TAXABLE bucket alone -- what the tax
// engine's taxableDividendYield input models (dividends inside Pre-Tax /
// Roth / HSA aren't taxed as they arrive). null when the bucket is empty,
// so a link has nothing to write rather than writing 0.
// `excludeHoldingIds`: the linked concentrated position(s), modeled
// separately by the engine and excluded from the Taxable bucket the same
// way computeTaxableCostBasis excludes them.
export function computeTaxableDividendYield(holdings = [], { excludeHoldingIds = [] } = {}) {
  const exclude = new Set(excludeHoldingIds.filter(Boolean));
  let value = 0;
  let income = 0;
  for (const h of holdings) {
    if (!h || h.taxTreatment !== 'taxable' || exclude.has(h.id)) continue;
    value += computeMarketValue(h);
    income += computeAnnualDividendIncome(h);
  }
  return value > 0 ? income / value : null;
}

export function computePortfolioDividendYield(holdings = []) {
  const totalValue = holdings.reduce((sum, h) => sum + computeMarketValue(h), 0);
  if (totalValue <= 0) return 0;
  const totalIncome = computeDividendTotals(holdings).total;
  return totalIncome / totalValue;
}

// Display formatter for share counts. Summing lot share counts (see
// getTotalShares above) accumulates binary floating-point residue --
// 0.5 + 0.761 + 0.761 style DRIP fractions end up rendering as
// 2.0219999999999985 or 1519.9999999999998 shares, which reads as a bug
// even though the value is off by less than a trillionth of a share.
// Rounds to 6 decimal places (brokers report share quantities to at most
// 3-6 dp) and trims trailing zeros, so 2.0219999999999985 -> "2.022" and
// 1519.9999999999998 -> "1520". DISPLAY ONLY -- the underlying stored/
// derived numbers are deliberately left untouched: rounding them at the
// source would change market-value/gain arithmetic by sub-cent amounts
// and ripple through every test's exact expectations for zero visible
// benefit, since currency formatting already hides noise at that scale.
export function formatShares(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return String(parseFloat(num.toFixed(6)));
}

// Per-share average, for the places that want a price (computeYieldOnCost)
// rather than a total dollar figure. Returns 0 (not null) when there are no
// shares to divide by, matching avgBuyPrice's own "0 means unset" default.
// Falls back straight to the flat avgBuyPrice field when there are no lots
// -- deliberately NOT routed through getTotalShares/getTotalCostBasis in
// that branch, since this is a pure per-share ratio that never needed a
// share count at all (a caller can legitimately ask for yield-on-cost
// without `shares` being set on the object).
export function getWeightedAvgBuyPrice(holding) {
  if (Array.isArray(holding?.lots) && holding.lots.length > 0) {
    const totalShares = getTotalShares(holding);
    if (totalShares <= 0) return 0;
    return getTotalCostBasis(holding) / totalShares;
  }
  return Number(holding?.avgBuyPrice) || 0;
}

// Trailing yield-on-current-price, for display next to a holding (not used
// in any downstream math -- computeAnnualDividendIncome above, driven
// directly by shares * annualDividendPerShare, is the actual source of
// truth for income totals).
export function computeDividendYield(holding) {
  const price = Number(holding?.currentPrice) || 0;
  const perShare = Number(holding?.annualDividendPerShare) || 0;
  if (price <= 0) return 0;
  return perShare / price;
}

// Yield-on-cost: same trailing annual dividend/share, divided by avgBuyPrice
// instead of currentPrice. Answers a different question than
// computeDividendYield above -- "what % of what I originally paid am I
// collecting each year" rather than "what % of today's price" -- the two
// diverge a lot for a long-held position that's grown well. Returns null
// (render "--", not 0%) when there's no cost basis to divide by, same
// null-over-0 convention as calculateHoldingCAGR.
export function computeYieldOnCost(holding) {
  const costBasis = getWeightedAvgBuyPrice(holding);
  const perShare = Number(holding?.annualDividendPerShare) || 0;
  if (costBasis <= 0) return null;
  return perShare / costBasis;
}

// Splits the trailing annualDividendPerShare total back into an estimated
// per-payment amount, using dividendFrequency purely as a divisor -- never
// as a multiplier back into annual income (annualDividendPerShare stays the
// one source of truth for the actual yearly total; see createHolding).
// Returns null for 'irregular'/'unspecified' rather than guessing an even
// split for a holding with no fixed cadence.
export function computePerPaymentIncome(holding) {
  const paymentsPerYear = paymentsPerYearForFrequency(holding?.dividendFrequency);
  if (!paymentsPerYear) return null;
  return computeAnnualDividendIncome(holding) / paymentsPerYear;
}

// Same bucket split as computeBucketTotals, but for annual dividend income
// rather than market value -- this is what the Dividends and Retirement
// Income sub-tabs (PortfolioTab.jsx) read. Tax treatment matters here in a
// way it doesn't for the plain balance rollup: dividends earned inside
// Pre-Tax/Roth/HSA accounts aren't taxed as investment income the year
// they're paid (Pre-Tax is taxed later on withdrawal, Roth/HSA not at all
// if qualified) the way Taxable dividends are -- calculator.js's own
// taxable-income modeling doesn't currently split this out per bucket, so
// this rollup is presentation-only for now, not wired into the tax engine.
export function computeDividendTotals(holdings = []) {
  const totals = { preTax: 0, roth: 0, taxable: 0, hsa: 0 };
  let total = 0;

  for (const holding of holdings) {
    const income = computeAnnualDividendIncome(holding);
    total += income;
    if (isValidTaxTreatment(holding?.taxTreatment)) {
      totals[holding.taxTreatment] += income;
    }
  }

  return { ...totals, total };
}

// Same annual dividend income figure as computeDividendTotals, split by
// distributionCharacter instead of tax-treatment bucket. Purely
// informational (see DISTRIBUTION_CHARACTERS above) -- nothing here feeds
// calculator.js's tax engine yet. Every holding lands in some bucket
// (including 'unspecified'), so totals across buckets always sum to the
// grand total -- nothing is silently dropped the way an unrecognized
// taxTreatment is in computeBucketTotals.
export function computeDividendTotalsByCharacter(holdings = []) {
  const totals = Object.fromEntries(DISTRIBUTION_CHARACTERS.map((d) => [d.value, 0]));
  let total = 0;
  for (const holding of holdings) {
    const income = computeAnnualDividendIncome(holding);
    total += income;
    const character = isValidDistributionCharacter(holding?.distributionCharacter) ? holding.distributionCharacter : 'unspecified';
    totals[character] += income;
  }
  return { ...totals, total };
}

// --- PTA backup import -----------------------------------------------------
//
// PTA's own "Download Complete System Backup (.json)" export (see that
// project's js/11-import-export-engine.js, window.exportFullJsonBackup)
// writes `{ version, timestamp, portfolio: Holding[], closedPositions,
// capitalFlows, userPreferences, ledgers }`, where each `portfolio` entry
// uses PTA's Holding interface (docs/ARCHITECTURE.md in that project):
// id, account, institution, symbol, name, type, shares, avgBuyPrice,
// currentPrice, dailyChange, dripEnabled, latestDividend. Field names for
// shares/avgBuyPrice/currentPrice/symbol/name/institution/account already
// line up with this app's Holding shape above -- the one gap is
// taxTreatment, which PTA's schema has no equivalent for at all (its
// `account` is a free-text label like "Rollover IRA (Horizon)").
//
// This is a manual, user-initiated file import (client-side FileReader),
// not a live sync -- matches both PTA's and this app's own "everything
// stays local, nothing phones home" privacy stance. There's deliberately
// no automatic/background import path.

const ROTH_KEYWORDS = ['roth'];
const HSA_KEYWORDS = ['hsa', 'health savings'];
const PRE_TAX_KEYWORDS = ['401k', '401(k)', '403b', '403(b)', 'ira', 'rollover', 'pension', 'pre-tax', 'pretax', 'traditional', 'trust', 'nqdc'];

// Best-effort guess only -- PTA has no tax-treatment concept to read this
// from, so this exists purely to pre-fill the per-account review step in
// PortfolioTab.jsx, never to silently commit an import without the user
// confirming each account's treatment first. Order matters: an account
// like "Rollover Roth 401(k)" should read as Roth, not Pre-Tax, so Roth is
// checked before the Pre-Tax keyword list.
export function guessTaxTreatment(accountLabel) {
  const text = String(accountLabel || '').toLowerCase();
  if (ROTH_KEYWORDS.some((kw) => text.includes(kw))) return 'roth';
  if (HSA_KEYWORDS.some((kw) => text.includes(kw))) return 'hsa';
  if (PRE_TAX_KEYWORDS.some((kw) => text.includes(kw))) return 'preTax';
  return 'taxable';
}

// PTA's own "Complete System Backup" export also writes a top-level
// `ledgers` object -- keyed by each holding's PTA id, each value an array
// of ledger entries: { id, date, type, rate, gross, destination,
// sharesAdded, navPrice, notes }. This is the per-holding distribution/
// statement history (confirmed against a real user backup: 1,192 entries
// across 96 holdings) that earlier versions of this parser silently
// dropped entirely -- only `data.portfolio`'s flat current-state fields
// were ever read. `type` is a mix of institution statement-reconciliation
// labels (e.g. "Fidelity Statement Ingest") and genuine payment/
// contribution labels (Dividend, Purchase / Buy, RSU Vesting, etc.);
// `destination` is mostly 'held' with smaller numbers of 'drip'/'cash'/
// 'vested'/'pending'.
//
// Only `type` strings that clearly name a real distribution/payment count
// as a distributionEvent below -- a generic statement-reconciliation delta
// changing share count is NOT assumed to be a dividend just because shares
// went up, since AP's own "Statement Ingest" entries are reconstructed from
// diffing consecutive statements and could reflect a purchase, a DRIP
// payment, or something else entirely. Being conservative here means this
// app's Lifetime Distributions figure only counts payments the source data
// actually labels as one, never a guess.
const DISTRIBUTION_TYPE_PATTERN = /dividend|capital gain|distribution/i;

function mapLedgerEntryToDistributionType(typeLabel) {
  const text = String(typeLabel || '').toLowerCase();
  if (text.includes('capital gain')) return 'capitalGainDistribution';
  if (text.includes('dividend')) return 'dividend';
  if (text.includes('distribution')) return 'other';
  return 'other';
}

// Classifies one holding's raw ledger array (sorted oldest-first) into the
// four CFE data-model shapes it maps onto -- see the block comment above
// and the "Data model additions" plan this implements. Never fabricates:
// an entry with neither a share change nor a usable price is skipped
// entirely (nothing real to preserve), matching every other "missing input
// -> excluded, not guessed" rule in this file.
export function parsePtaLedgerEntries(entries) {
  const lots = [];
  const distributionEvents = [];
  const priceSnapshots = [];
  const pendingSales = [];

  if (!Array.isArray(entries)) return { lots, distributionEvents, priceSnapshots, pendingSales };

  const sorted = [...entries]
    .filter((e) => e && typeof e === 'object' && typeof e.date === 'string')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Real, statement-ingested ledgers (as opposed to the small amount of
  // hand-authored demo/placeholder data AP ships) use `destination: "held"`
  // on every single positive-share entry -- confirmed against a real
  // backup, where a 63-entry ledger spanning 2016-2026 never once uses
  // "drip" as a destination. So `destination === 'drip'` is honored as an
  // explicit signal when present, and the first positive-share entry
  // chronologically is taken as the initial purchase/funding.
  //
  // EVERY OTHER later addition is 'unspecified'. It used to be labeled
  // 'drip', on the account owner's word that his positions were
  // buy-once-then-reinvest -- but he corrected that on 2026-09-10 (some are
  // contributions), and by then a 'drip' lot had started counting as real
  // dividend income (changelog 153). A default of 'drip' therefore reported
  // a portfolio's whole funding history as income: $91,707 "actually
  // logged" in one year, $55,109 of it in a single month. Guessing here is
  // not a display nicety, it is a number the user is asked to believe.
  // The user labels these themselves in the Ledger; until then they are
  // held, shown, and counted as nothing -- the same "missing input ->
  // excluded, not guessed" rule as everywhere else in this file.
  let sawFirstPositiveLot = false;

  for (const entry of sorted) {
    const sharesAdded = Number(entry.sharesAdded) || 0;
    const gross = Number(entry.gross) || 0;
    const navPrice = Number(entry.navPrice) || 0;
    // Best available per-share price for this entry: the recorded NAV
    // price if present, else the implied price from gross/sharesAdded
    // (both negative for a sale, so the ratio is still positive) -- same
    // fallback order for every branch below.
    const derivedPrice = navPrice > 0 ? navPrice : (sharesAdded !== 0 ? Math.abs(gross / sharesAdded) : 0);
    const isDistributionType = DISTRIBUTION_TYPE_PATTERN.test(String(entry.type || ''));

    // Real ids, not bare precursor objects -- these ride straight into
    // holding.lots/priceSnapshots/distributionEvents below and get rendered
    // as React list items (DividendLedgerModal), which need a stable unique
    // key, and (for lots specifically) selectLotsForSale/
    // applyLiquidationToHolding key their FIFO consumption map by lot.id --
    // multiple lots sharing an undefined id would silently misattribute
    // sold shares across unrelated lots. createLot/createDistributionEvent
    // already generate a fresh id per call, same as everywhere else in this
    // file; priceSnapshots gets the same treatment inline since it has no
    // dedicated factory of its own.
    if (sharesAdded > 0) {
      const isFirstPositiveLot = !sawFirstPositiveLot;
      sawFirstPositiveLot = true;
      lots.push(createLot({
        date: entry.date,
        shares: sharesAdded,
        pricePerShare: derivedPrice,
        source: entry.destination === 'drip' ? 'drip' : (isFirstPositiveLot ? 'purchase' : 'unspecified'),
      }));
    } else if (sharesAdded < 0) {
      pendingSales.push({
        sharesToSell: -sharesAdded,
        salePricePerShare: derivedPrice,
        saleDate: entry.date,
      });
    } else if (derivedPrice > 0) {
      priceSnapshots.push({
        id: `snap-${priceSnapshots.length}-${entry.id || entry.date}`,
        date: entry.date,
        price: derivedPrice,
        source: 'pta',
        label: entry.type || '',
      });
    }

    if (isDistributionType) {
      distributionEvents.push(createDistributionEvent({
        date: entry.date,
        type: mapLedgerEntryToDistributionType(entry.type),
        ratePerShare: Number(entry.rate) || 0,
        grossAmount: gross,
        destination: entry.destination === 'drip' ? 'drip' : 'cash',
        sharesAdded: Math.max(sharesAdded, 0),
        navPrice: navPrice > 0 ? navPrice : null,
        notes: entry.notes || '',
      }));
    }
  }

  return { lots, distributionEvents, priceSnapshots, pendingSales };
}

// --- Closed/historical-only positions ---------------------------------
//
// A PTA backup's `ledgers` object is keyed by every id it has ever tracked
// a ledger for -- not just the ones still in `data.portfolio`. Some of
// those extra ("orphaned") keys turned out to be leftover fictional/
// placeholder content (AP's own source comments admit `defaultPrivateAssetLedgers`
// used to hold "a full set of entries keyed by specific real asset/account
// ids... That data has been removed rather than repopulated under the same
// ids" -- the ids evidently leaked into saved state and then into every
// subsequent backup export). Others are real, mechanically-generated
// "Statement Ingest" history for positions that simply aren't held
// anymore. isLikelyRealLedger below is the (empirically bimodal -- 100% or
// 0%, no middle ground, across a real user's backup) heuristic that tells
// the two apart: every entry in a real ledger's `notes` field ends with
// "...statement dated YYYY-MM-DD" (or is an explicit "Full Liquidation"
// entry); the placeholder content never does.
export function isLikelyRealLedger(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return false;
  return entries.every((e) => /statement dated|full liquidation/i.test(String(e?.notes || '')));
}

// Best-effort account label, parsed from a real ledger entry's own notes
// text -- e.g. "Fidelity Portfolio Advisory Services (Managed IRA) --
// statement dated 2021-01-31" -> "Fidelity Portfolio Advisory Services
// (Managed IRA)". This is a reconstruction from mechanically-generated
// note text, not a real schema field -- the closed-position candidates
// below are the only place this app ever needs an account label without
// one being handed to it directly.
function parseAccountFromNotes(notes) {
  const text = String(notes || '');
  const match = text.match(/^(.*?)\s*[—-]\s*statement dated/i);
  const label = match ? match[1].trim() : text.trim();
  return label || 'Unknown Account';
}

// Best-effort institution, parsed from a real ledger entry's own `type`
// (e.g. "Fidelity Statement Ingest" -> "Fidelity", "PNC Brokerage Statement
// Ingest" -> "PNC", "T. Rowe Price Statement Ingest" -> "T. Rowe Price").
// Same "reconstruction, not a real field" caveat as parseAccountFromNotes.
function guessInstitutionFromType(typeLabel) {
  return String(typeLabel || '')
    .replace(/\s*(brokerage\s+)?statement ingest.*$/i, '')
    .replace(/\s*bank deposit sweep.*$/i, '')
    .trim() || 'Unknown';
}

// Finds every `data.ledgers` id that (a) isn't in `data.portfolio`, (b)
// isn't already in `data.closedPositions` (see mapPtaClosedPositions below
// for those), and (c) passes isLikelyRealLedger -- then builds one
// Liquidation-only "closed position" candidate per id. Each candidate's
// liquidations are computed against an ephemeral holding shell built via
// createHolding/replayPendingSales and then discarded -- this function
// NEVER returns anything that gets added to `holdings`, only to
// `liquidations` (see PtaImportPanel.jsx's review step), matching the
// "should not impact current and future positions" requirement.
//
// Most of these ledgers don't actually end with an explicit sale -- the
// statement ingestion just stops one day while the fund still shows a real,
// nonzero share balance (an account that's no longer being fed statements,
// not necessarily one that was sold for cash that day). For those, this
// closes the remaining shares out at the last recorded price/date with an
// explicit "no confirmed sale event" note -- the same honest, not-fully-
// certain framing AP's own closedPositions record uses for the one closed
// position *it* wasn't fully sure about (destinationNotes: "Account closed
// after Jul 2020 -- no later statements on file; proceeds destination
// unconfirmed"). `wasForceClosed` on the returned candidate flags exactly
// this case, so the review UI can badge it distinctly from a ledger that
// already reached zero on its own (e.g. via an explicit negative-share
// entry).
export function parsePtaClosedPositionCandidates(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const rawHoldings = Array.isArray(data.portfolio) ? data.portfolio : [];
  const rawLedgers = data.ledgers && typeof data.ledgers === 'object' ? data.ledgers : {};
  const rawClosedPositions = Array.isArray(data.closedPositions) ? data.closedPositions : [];

  const portfolioIds = new Set(rawHoldings.map((h) => h?.id).filter((id) => id != null));
  const closedPositionIds = new Set(rawClosedPositions.map((c) => c?.id).filter((id) => id != null));

  // Guards against treating an old, coarser-grained tracking snapshot of an
  // account that's still open TODAY as a genuine closure -- e.g. an early
  // dollar-balance-only 401(k) ledger that got refactored into several
  // current per-fund holdings under new ids. If a current holding shares
  // this exact account label and has a more recent last-known date than
  // this orphaned ledger's own last entry, the account is still actively
  // tracked; skip rather than fabricate a closure underneath it. Confirmed
  // against a real backup: this is exactly what distinguishes AP's own
  // renamed Vanguard 401(k) fund ids (5 current holdings, all with a
  // recent lastStatementDate) from genuinely-orphaned accounts like a
  // Fidelity Portfolio Advisory Services sub-account with zero current
  // matches at all.
  const latestKnownDateByAccount = new Map();
  for (const h of rawHoldings) {
    const acct = h?.account;
    const known = h?.lastStatementDateISO || h?.lastStatementDate || h?.purchaseDate;
    if (!acct || !known) continue;
    const prev = latestKnownDateByAccount.get(acct);
    if (!prev || known > prev) latestKnownDateByAccount.set(acct, known);
  }

  const candidates = [];
  for (const [id, entries] of Object.entries(rawLedgers)) {
    if (portfolioIds.has(id) || closedPositionIds.has(id)) continue;
    if (!isLikelyRealLedger(entries)) continue;

    const symbol = id.split('-').pop().toUpperCase();
    const firstEntry = entries[0] || {};
    const account = parseAccountFromNotes(firstEntry.notes);
    const institution = guessInstitutionFromType(firstEntry.type);

    const lastLedgerDate = entries.reduce((max, e) => (e?.date && (!max || e.date > max) ? e.date : max), null);
    const activeAccountDate = latestKnownDateByAccount.get(account);
    if (activeAccountDate && lastLedgerDate && activeAccountDate > lastLedgerDate) continue;

    const { lots, distributionEvents, priceSnapshots, pendingSales } = parsePtaLedgerEntries(entries);
    const seedHolding = createHolding({
      symbol,
      account,
      institution,
      taxTreatment: guessTaxTreatment(account),
      lots,
      distributionEvents,
      priceSnapshots,
    });

    const replayed = replayPendingSales(seedHolding, pendingSales);
    let holding = replayed.holding;
    const liquidations = [...replayed.liquidations];

    let wasForceClosed = false;
    const remainingShares = getTotalShares(holding);
    if (remainingShares > LIQUIDATION_EPSILON) {
      const timeline = getPricedTimeline(holding);
      const lastPriced = timeline[timeline.length - 1];
      if (lastPriced) {
        wasForceClosed = true;
        const closingReplay = replayPendingSales(holding, [{
          sharesToSell: remainingShares,
          salePricePerShare: lastPriced.price,
          saleDate: lastPriced.date,
          notes: `Closed at last recorded price on ${lastPriced.date} — no confirmed sale event in the source data; tracking simply stopped after this date.`,
        }]);
        holding = closingReplay.holding;
        liquidations.push(...closingReplay.liquidations);
      }
      // else: no priced activity at all to close against (shouldn't happen
      // for anything that passed isLikelyRealLedger) -- nothing to record.
    }

    if (liquidations.length === 0) continue; // nothing real came of this id -- skip rather than show an empty candidate row

    candidates.push({ id, symbol, account, institution, entryCount: entries.length, liquidations, wasForceClosed, source: 'ledger' });
  }

  return candidates;
}

// Maps `data.closedPositions` entries -- AP's own already-computed,
// high-confidence closed-position records (its own "Closed Positions"
// concept, separate from the ledgers a holding accumulates while open) --
// into the same candidate shape parsePtaClosedPositionCandidates returns
// above, trusting AP's own totalProceeds/realizedGain/etc. rather than
// recomputing them through a synthesized lot (avoids introducing a second
// rounding path for numbers AP already finalized). `holdingPeriod` (e.g.
// "Nov 2019 – Jul 2020") is parsed for its start month/year only, to build
// a purchaseDate snapshot and long/short termClassification against
// sellDate -- day-of-month precision doesn't matter for that threshold.
function parseHoldingPeriodStart(holdingPeriod) {
  const match = String(holdingPeriod || '').match(/([A-Za-z]{3,9})\s+(\d{4})/);
  if (!match) return null;
  const monthIdx = MONTH_ABBR_TO_INDEX[match[1].slice(0, 3).toLowerCase()];
  if (monthIdx === undefined) return null;
  return new Date(Date.UTC(Number(match[2]), monthIdx, 1)).toISOString().slice(0, 10);
}

const MONTH_ABBR_TO_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function mapPtaClosedPositions(rawClosedPositions) {
  if (!Array.isArray(rawClosedPositions)) return [];
  return rawClosedPositions
    .filter((raw) => raw && typeof raw === 'object' && typeof raw.symbol === 'string' && Number(raw.sharesSold) > 0)
    .map((raw) => {
      const purchaseDate = parseHoldingPeriodStart(raw.holdingPeriod);
      const saleDateObj = new Date(raw.sellDate);
      const term = purchaseDate && !isNaN(saleDateObj.getTime()) ? termForLotAsOf(purchaseDate, saleDateObj) : null;
      const sharesSold = Number(raw.sharesSold) || 0;
      const costBasis = Number(raw.costBasis) || 0;
      const pricePerShare = sharesSold > 0 ? costBasis / sharesSold : 0;

      const noteParts = [];
      if (raw.destinationNotes) noteParts.push(raw.destinationNotes);
      if (Number(raw.lifetimeDivs) > 0) noteParts.push(`Lifetime distributions while held: $${Number(raw.lifetimeDivs).toFixed(2)}.`);

      const liquidation = {
        id: `liq-closedpos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        holdingId: null,
        symbol: raw.symbol.trim().toUpperCase(),
        account: raw.account || '',
        taxTreatment: guessTaxTreatment(raw.account),
        saleDate: raw.sellDate || null,
        purchaseDate,
        notes: noteParts.join(' '),
        sharesSold,
        salePricePerShare: Number(raw.sellPrice) || 0,
        proceeds: Number(raw.totalProceeds) || 0,
        costBasis,
        realizedGainDollars: Number(raw.realizedGain) || 0,
        realizedGainPct: raw.realizedGainPct != null ? Number(raw.realizedGainPct) : null,
        termClassification: term,
        lotsSold: [{ lotId: null, date: purchaseDate, shares: sharesSold, pricePerShare, costBasis, term }],
        isFullLiquidation: true,
      };

      return {
        id: raw.id || `closedpos-${liquidation.symbol}`,
        symbol: liquidation.symbol,
        account: liquidation.account,
        institution: raw.institution || '',
        entryCount: null,
        liquidations: [liquidation],
        wasForceClosed: false,
        source: 'closedPositions',
      };
    });
}

// Accepts either a full backup object ({ portfolio: [...] , ... }) or a
// bare array (in case someone hands us just the holdings list) and returns
// `{ holdings, accounts, closedPositionCandidates, error }`. Never throws --
// callers get a clean `error` string for an unrecognized/corrupt file
// instead of a crash. `accounts` is the deduped list of distinct account
// labels found, each pre-tagged with a guessTaxTreatment() default for the
// review step. `closedPositionCandidates` (see the two functions above) is
// always `[]` for the bare-array input shape, since closed-position data
// only exists in the newer full-backup-object shape.
export function parsePtaBackup(rawJsonText) {
  let data;
  try {
    data = JSON.parse(rawJsonText);
  } catch {
    return { holdings: [], accounts: [], error: 'That file is not valid JSON.' };
  }

  const rawHoldings = Array.isArray(data) ? data : data?.portfolio;
  if (!Array.isArray(rawHoldings)) {
    return { holdings: [], accounts: [], error: "Couldn't find a portfolio holdings list in that file — expected a Portfolio Tracker backup JSON (Import / Export > Download Complete System Backup)." };
  }

  // Only present in the newer `aura_backup_v2` export shape -- see the
  // block comment above parsePtaLedgerEntries. A backup without this key
  // (or an old-format backup, or the bare-array input shape) simply
  // produces holdings with empty lots/distributionEvents/priceSnapshots/
  // pendingSales, identical to this parser's behavior before ledger
  // support was added.
  const rawLedgers = (!Array.isArray(data) && data?.ledgers && typeof data.ledgers === 'object') ? data.ledgers : {};

  const holdings = rawHoldings
    .filter((h) => h && typeof h.symbol === 'string' && h.symbol.trim())
    .map((h) => {
      const shares = Number(h.shares) || 0;
      const currentPrice = Number(h.currentPrice) || 0;
      // PTA's Holding.latestDividend (docs/ARCHITECTURE.md in that project)
      // is { amount, date, count, annualTotal, yieldPct } -- annualTotal is
      // already a per-share annual figure there (not this holding's total
      // position income), so it maps directly to our annualDividendPerShare.
      // Falls back to deriving it from yieldPct * currentPrice if
      // annualTotal is missing but a yield is present, since either is
      // enough to reconstruct the other given currentPrice.
      const latestDividend = h.latestDividend || {};
      let annualDividendPerShare = Number(latestDividend.annualTotal) || 0;
      if (!annualDividendPerShare && latestDividend.yieldPct) {
        annualDividendPerShare = (Number(latestDividend.yieldPct) || 0) / 100 * currentPrice;
      }
      // PTA's Holding.purchaseDate (js/08-asset-modal-simulation.js in that
      // project) is optional and stored as a plain 'YYYY-MM-DD' string when
      // present. Only accept that exact shape -- anything else (missing,
      // malformed, a different format) comes through as null rather than
      // guessed, same as every other optional field in this parser.
      const purchaseDate = typeof h.purchaseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.purchaseDate)
        ? h.purchaseDate
        : null;
      // Ledger lookup happens on PTA's own raw id -- this app regenerates
      // its own holding id later (createHolding always ignores an incoming
      // id), so the parsed/classified ledger data has to ride along
      // attached to this intermediate object rather than being looked up
      // again afterward.
      const ledgerEntries = h.id != null ? rawLedgers[h.id] : null;
      const { lots, distributionEvents, priceSnapshots, pendingSales } = parsePtaLedgerEntries(ledgerEntries);
      return {
        symbol: h.symbol.trim().toUpperCase(),
        name: h.name || '',
        institution: h.institution || '',
        account: h.account || '',
        shares,
        avgBuyPrice: Number(h.avgBuyPrice) || 0,
        currentPrice,
        annualDividendPerShare,
        purchaseDate,
        lots,
        distributionEvents,
        priceSnapshots,
        pendingSales,
      };
    });

  const accountLabels = [...new Set(holdings.map((h) => h.account || '(No account label)'))];
  const accounts = accountLabels.map((account) => ({ account, taxTreatment: guessTaxTreatment(account) }));

  const closedPositionCandidates = Array.isArray(data)
    ? []
    : [...parsePtaClosedPositionCandidates(data), ...mapPtaClosedPositions(data?.closedPositions)];

  return { holdings, accounts, closedPositionCandidates, error: holdings.length === 0 ? 'No holdings found in that file.' : null };
}

// Replays a list of pendingSales (from parsePtaLedgerEntries above --
// negative-sharesAdded ledger entries, or a synthetic "closed position"
// sale -- see parsePtaClosedPositionCandidates below) against `holding`'s
// own lots, in order, turning each into a real Liquidation record instead
// of a negative lot -- fixing the exact failure mode AuraPortfolio's own
// ledger modal has for this data (negative "lots" with broken cost/value/
// gain-% math). When a sale needs more shares than the holding's lots (so
// far) can cover, inserts one clearly-labeled 'openingBalance' lot (see
// LOT_SOURCES above) sized to exactly the shortfall, dated the day before
// the sale, priced the same as the sale itself -- so the gap is visible and
// honest, never silently dropped or left negative. Each `sale` may carry an
// optional `notes` string, passed through to the resulting Liquidation
// record (used by the closed-position import below for its "closed at last
// known price" caveat). Returns `{ holding, liquidations }`; never mutates
// the input holding.
export function replayPendingSales(holding, pendingSales) {
  let current = holding;
  const liquidations = [];

  for (const sale of pendingSales || []) {
    const available = getTotalShares(current);
    if (sale.sharesToSell > available + LIQUIDATION_EPSILON) {
      const shortfall = sale.sharesToSell - available;
      const saleDateObj = new Date(sale.saleDate);
      const openingDate = isNaN(saleDateObj.getTime())
        ? sale.saleDate
        : new Date(saleDateObj.getTime() - 86400000).toISOString().slice(0, 10);
      current = {
        ...current,
        lots: [
          ...current.lots,
          createLot({ date: openingDate, shares: shortfall, pricePerShare: sale.salePricePerShare, source: 'openingBalance' }),
        ],
      };
    }

    const liquidation = createLiquidation(current, {
      sharesToSell: sale.sharesToSell,
      salePricePerShare: sale.salePricePerShare,
      saleDate: sale.saleDate,
    }, sale.notes ? { notes: sale.notes } : {});
    if (!liquidation) continue; // still can't be filled (e.g. a non-numeric price) -- skip rather than crash the import
    const { updatedHolding } = applyLiquidationToHolding(current, liquidation);
    current = updatedHolding;
    liquidations.push(liquidation);
  }

  return { holding: current, liquidations };
}

// Applies a confirmed { account: taxTreatment } map (from the review step)
// to every parsed holding, then replays each holding's pendingSales via
// replayPendingSales above. Returns `{ holdings, liquidations }` ready for
// usePortfolioHoldings' addHoldings/replaceHoldings + addLiquidations.
export function applyTaxTreatments(holdings, accountTreatmentMap) {
  const liquidations = [];

  const mappedHoldings = holdings.map((h) => {
    const { pendingSales, ...rest } = h;
    const holding = createHolding({
      ...rest,
      taxTreatment: accountTreatmentMap[h.account || '(No account label)'] || 'taxable',
    });

    const replayed = replayPendingSales(holding, pendingSales);
    liquidations.push(...replayed.liquidations);
    return replayed.holding;
  });

  return { holdings: mappedHoldings, liquidations };
}

// --- Analytics: per-holding CAGR + market benchmark comparison ------------
//
// Real, publicly reported historical annual total returns for two common
// benchmarks -- S&P 500 (price + reinvested dividends) and Nasdaq-100 (price
// return) -- sourced from slickcharts.com/sp500/returns and
// slickcharts.com/nasdaq100/returns, captured 2026-08-16. These are actual
// historical figures, not estimates or placeholders; they will need a manual
// refresh as new years complete (this app has no live market-data feed, see
// the v1 scope note at the top of this file -- these tables are the same
// "manually entered, refreshed by hand" tier as everything else here).
//
// Earlier drafts of this feature considered reusing Portfolio Tracker App's
// own SPY_ANNUAL_RETURN_PCT/QQQ_ANNUAL_RETURN_PCT table (js/04-analytics.js
// in that project), but checking it against slickcharts.com found it
// doesn't match real historical returns for any of the years it covers
// (e.g. its 2016 S&P figure of 9.64% vs. the real 11.96%) -- it appears to
// be placeholder/fabricated data rather than sourced figures, so it was not
// reused here. Worth revisiting PTA's Analytics tab itself at some point.
export const SP500_ANNUAL_RETURN_PCT = {
  1995: 37.58, 1996: 22.96, 1997: 33.36, 1998: 28.58, 1999: 21.04,
  2000: -9.10, 2001: -11.89, 2002: -22.10, 2003: 28.68, 2004: 10.88,
  2005: 4.91, 2006: 15.79, 2007: 5.49, 2008: -37.00, 2009: 26.46,
  2010: 15.06, 2011: 2.11, 2012: 16.00, 2013: 32.39, 2014: 13.69,
  2015: 1.38, 2016: 11.96, 2017: 21.83, 2018: -4.38, 2019: 31.49,
  2020: 18.40, 2021: 28.71, 2022: -18.11, 2023: 26.29, 2024: 25.02,
  2025: 17.88,
};
export const NASDAQ100_ANNUAL_RETURN_PCT = {
  1995: 42.54, 1996: 42.54, 1997: 20.63, 1998: 85.31, 1999: 101.95,
  2000: -36.84, 2001: -32.65, 2002: -37.58, 2003: 49.12, 2004: 10.44,
  2005: 1.49, 2006: 6.79, 2007: 18.67, 2008: -41.89, 2009: 53.54,
  2010: 19.22, 2011: 2.70, 2012: 16.82, 2013: 34.99, 2014: 17.94,
  2015: 8.43, 2016: 5.89, 2017: 31.52, 2018: -1.04, 2019: 37.96,
  2020: 47.58, 2021: 26.63, 2022: -32.97, 2023: 53.81, 2024: 24.88,
  2025: 20.17,
};
// The current year is still in progress, so it's handled as a single
// year-to-date figure (as of the date below) rather than a full-year return
// -- needs the same manual refresh as the tables above.
export const YTD_RETURN_AS_OF = '2026-08-14';
export const SP500_YTD_RETURN_PCT = 14.54;
export const NASDAQ100_YTD_RETURN_PCT = 19.00;

// Looks up a benchmark's return for a given year, treating the "as of" year
// as the special YTD figure and clamping anything before/after the table's
// range to its earliest/latest known year rather than silently treating an
// out-of-range year as 0% growth.
function annualReturnForYear(returnsTable, ytdPct, year) {
  const currentYear = new Date(YTD_RETURN_AS_OF).getFullYear();
  if (year >= currentYear) return ytdPct;
  if (Object.prototype.hasOwnProperty.call(returnsTable, year)) return returnsTable[year];
  const years = Object.keys(returnsTable).map(Number);
  if (years.length === 0) return 0;
  const clampedYear = year < Math.min(...years) ? Math.min(...years) : Math.max(...years);
  return returnsTable[clampedYear];
}

const daysInYear = (year) => (Date.UTC(year, 11, 31) - Date.UTC(year, 0, 1)) / 86400000 + 1;

// Compounds a benchmark's growth over [startDate, endDate], prorating the
// partial first/last calendar year linearly by day fraction. This is a
// straight-line approximation -- real index returns aren't distributed
// evenly across a year -- good enough for a directional "how did this
// compare to the market" read, not a substitute for actual daily NAV
// tracking. Returns a growth multiple (e.g. 1.25 for +25%), or null if
// startDateStr is missing/invalid/in the future.
export function compoundBenchmarkGrowth(returnsTable, ytdPct, startDateStr, endDate = new Date()) {
  if (!startDateStr) return null;
  const start = new Date(startDateStr);
  if (isNaN(start.getTime()) || start >= endDate) return null;

  const startYear = start.getFullYear();
  const endYear = endDate.getFullYear();

  if (startYear === endYear) {
    const fraction = (endDate - start) / 86400000 / daysInYear(startYear);
    return 1 + (annualReturnForYear(returnsTable, ytdPct, startYear) / 100) * fraction;
  }

  let growth = 1;
  const startYearEnd = new Date(Date.UTC(startYear, 11, 31));
  const startFraction = (startYearEnd - start) / 86400000 / daysInYear(startYear);
  growth *= 1 + (annualReturnForYear(returnsTable, ytdPct, startYear) / 100) * startFraction;

  for (let y = startYear + 1; y < endYear; y++) {
    growth *= 1 + annualReturnForYear(returnsTable, ytdPct, y) / 100;
  }

  const endYearStart = new Date(Date.UTC(endYear, 0, 1));
  const endFraction = (endDate - endYearStart) / 86400000 / daysInYear(endYear);
  growth *= 1 + (annualReturnForYear(returnsTable, ytdPct, endYear) / 100) * endFraction;

  return growth;
}

// Annualized version of compoundBenchmarkGrowth -- what the benchmark
// returned per year, compounded, over the same window. Same 30-day floor as
// calculateHoldingCAGR below, for the same reason (a short window annualizes
// into a meaningless number).
export function compoundBenchmarkCAGR(returnsTable, ytdPct, startDateStr, endDate = new Date()) {
  const growth = compoundBenchmarkGrowth(returnsTable, ytdPct, startDateStr, endDate);
  if (growth === null || growth <= 0) return null;
  const start = new Date(startDateStr);
  const years = (endDate - start) / 86400000 / 365.25;
  if (years < 30 / 365.25) return null;
  return (Math.pow(growth, 1 / years) - 1) * 100;
}

// Per-holding annualized return from avgBuyPrice to currentPrice over the
// actual holding period. Mirrors Portfolio Tracker's own calculateCAGR
// (js/01-state.js in that project) -- returns null (render "--", never 0%)
// when there's no purchaseDate on file, cost basis isn't positive, or the
// position has been held under 30 days, since annualizing a few days' price
// move produces a wildly misleading figure.
//
// Dispatches to the money-weighted (XIRR) calculation below when the
// holding has real lots -- a single purchaseDate/avgBuyPrice can't
// correctly represent a position built from multiple purchases/DRIP
// reinvestments at different dates and prices, so this stops being the
// right formula the moment lots exist. Holdings with no lots (the vast
// majority, and every holding created before this feature existed) are
// completely unaffected -- same formula, same behavior as always.
export function calculateHoldingCAGR(holding, asOfDate = new Date()) {
  if (Array.isArray(holding?.lots) && holding.lots.length > 0) {
    return calculateHoldingMoneyWeightedReturn(holding, asOfDate);
  }
  const costBasis = Number(holding?.avgBuyPrice) || 0;
  const currentPrice = Number(holding?.currentPrice) || 0;
  const purchaseDateStr = holding?.purchaseDate;
  if (!purchaseDateStr || costBasis <= 0) return null;
  const purchaseDate = new Date(purchaseDateStr);
  if (isNaN(purchaseDate.getTime())) return null;
  const daysHeld = (asOfDate - purchaseDate) / 86400000;
  if (daysHeld < 30) return null;
  const growth = currentPrice / costBasis;
  if (growth <= 0) return null;
  const years = daysHeld / 365.25;
  return (Math.pow(growth, 1 / years) - 1) * 100;
}

// Lots that look like the same purchase recorded twice: the same share count
// and the same price, dated within a few days of each other. That is what a
// reinvestment looks like when it arrives once from a statement (dated the
// settlement day) and once by hand or from a lot list (dated the trade day).
// Returns lot id -> the date of its twin. A flag for the person to judge:
// two real same-size purchases a day apart are possible, so nothing is
// removed for them.
export function findLikelyDuplicateLots(lots, withinDays = 5) {
  const out = new Map();
  const list = (Array.isArray(lots) ? lots : []).filter((l) => l && l.id && l.date && Number(l.shares) > 0);
  for (const a of list) {
    for (const b of list) {
      if (a === b || out.has(a.id)) continue;
      const days = Math.abs(new Date(a.date) - new Date(b.date)) / 86400000;
      if (days <= withinDays && Math.abs(Number(a.shares) - Number(b.shares)) < 0.0005 && Math.abs((Number(a.pricePerShare) || 0) - (Number(b.pricePerShare) || 0)) < 0.005) {
        out.set(a.id, b.date);
      }
    }
  }
  return out;
}

// Per-lot annualized return, same 30-day floor and null-over-0 conventions
// as calculateHoldingCAGR above -- this is what powers each row of the
// per-lot breakdown table (computeLotBreakdown), one holding-period return
// per purchase/DRIP tranche rather than one blended figure for the whole
// position.
export function calculateLotCAGR(lot, currentPrice, asOfDate = new Date()) {
  const costBasis = Number(lot?.pricePerShare) || 0;
  if (!lot?.date || costBasis <= 0) return null;
  const lotDate = new Date(lot.date);
  if (isNaN(lotDate.getTime())) return null;
  const daysHeld = (asOfDate - lotDate) / 86400000;
  if (daysHeld < 30) return null;
  const growth = (Number(currentPrice) || 0) / costBasis;
  if (growth <= 0) return null;
  const years = daysHeld / 365.25;
  return (Math.pow(growth, 1 / years) - 1) * 100;
}

export function getLotTermClassification(lot, asOfDate = new Date()) {
  if (!lot?.date) return null;
  return holdingTerm(lot.date, asOfDate);
}

// One row per lot: cost basis, current value, gain, term classification,
// and this lot's own CAGR -- the per-lot counterpart to the whole-holding
// figures above. Sorted oldest-first (undated lots sort first, consistent
// but arbitrary -- there's no meaningful date to sort them by).
export function computeLotBreakdown(holding, asOfDate = new Date()) {
  const lots = Array.isArray(holding?.lots) ? holding.lots : [];
  const currentPrice = Number(holding?.currentPrice) || 0;
  return lots
    .map((lot) => {
      const shares = Number(lot?.shares) || 0;
      const pricePerShare = Number(lot?.pricePerShare) || 0;
      const costBasis = shares * pricePerShare;
      const marketValue = shares * currentPrice;
      return {
        id: lot.id,
        date: lot.date || null,
        shares,
        pricePerShare,
        source: isValidLotSource(lot?.source) ? lot.source : 'purchase',
        costBasis,
        marketValue,
        gainDollars: marketValue - costBasis,
        gainPct: costBasis > 0 ? (marketValue / costBasis - 1) * 100 : null,
        term: getLotTermClassification(lot, asOfDate),
        cagr: calculateLotCAGR(lot, currentPrice, asOfDate),
      };
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

// Solves for the annualized rate r that zeroes out the net present value of
// a set of dated cash flows -- the textbook-correct way to get one
// annualized return out of money that went in at several different times
// (multiple purchase lots / DRIP reinvestments), rather than the single
// straight-line CAGR formula above, which only works for one lump sum at
// one date. Same bisection approach this file already uses elsewhere for
// root-finding (see calculator.js's Die-with-Zero spending solver for the
// same pattern at the whole-plan level) -- no external finance library
// pulled in for one function. Returns null (not a guess) when there's no
// sign change between the search bounds to bisect against, which happens
// for a degenerate/nonsensical cash-flow set (e.g. a "purchase" with zero
// cost that somehow shows a loss) rather than any real position.
function calculateXIRR(cashFlows) {
  if (!Array.isArray(cashFlows) || cashFlows.length < 2) return null;
  const hasOutflow = cashFlows.some((cf) => cf.amount < 0);
  const hasInflow = cashFlows.some((cf) => cf.amount > 0);
  if (!hasOutflow || !hasInflow) return null;

  const t0 = Math.min(...cashFlows.map((cf) => cf.date.getTime()));
  const npvAtRate = (rate) =>
    cashFlows.reduce((sum, cf) => {
      const years = (cf.date.getTime() - t0) / (365.25 * 86400000);
      return sum + cf.amount / Math.pow(1 + rate, years);
    }, 0);

  let low = -0.99; // -99%/yr floor -- a rate of -100% or below isn't meaningful to search past
  let high = 10; // +1000%/yr ceiling -- generous enough for any real equity position
  let npvLow = npvAtRate(low);
  const npvHigh = npvAtRate(high);
  if (npvLow * npvHigh > 0) return null; // no sign change in range -- bisection can't proceed reliably

  let mid = low;
  for (let i = 0; i < 100; i++) {
    mid = (low + high) / 2;
    const npvMid = npvAtRate(mid);
    if (Math.abs(npvMid) < 1e-6) break;
    if ((npvMid > 0) === (npvLow > 0)) {
      low = mid;
      npvLow = npvMid;
    } else {
      high = mid;
    }
  }
  return mid * 100;
}

// Money-weighted annualized return across every lot: each lot's purchase is
// a cash outflow on its own date, today's total market value is the one
// inflow, solved via XIRR above. This is what calculateHoldingCAGR
// dispatches to once a holding has lots -- see that function's comment for
// why a single-lump-sum CAGR formula stops being correct at that point.
// Same 30-day floor as the single-lot path, measured from the earliest lot
// (the same "don't annualize a few days' move into a misleading figure"
// reasoning still applies, just anchored to the oldest cash flow instead of
// the one purchaseDate).
export function calculateHoldingMoneyWeightedReturn(holding, asOfDate = new Date()) {
  const lots = (Array.isArray(holding?.lots) ? holding.lots : [])
    .filter((lot) => lot?.date && Number(lot.shares) > 0)
    .map((lot) => ({ ...lot, _parsedDate: new Date(lot.date) }))
    .filter((lot) => !isNaN(lot._parsedDate.getTime()));
  if (lots.length === 0) return null;

  const totalShares = lots.reduce((sum, lot) => sum + Number(lot.shares), 0);
  if (totalShares <= 0) return null;

  const earliest = Math.min(...lots.map((lot) => lot._parsedDate.getTime()));
  if ((asOfDate.getTime() - earliest) / 86400000 < 30) return null;

  const currentPrice = Number(holding?.currentPrice) || 0;
  const marketValue = totalShares * currentPrice;
  const cashFlows = lots.map((lot) => ({
    date: lot._parsedDate,
    amount: -(Number(lot.shares) * (Number(lot.pricePerShare) || 0)),
  }));
  cashFlows.push({ date: asOfDate, amount: marketValue });

  return calculateXIRR(cashFlows);
}

// Total unrealized gain across every holding (no purchaseDate required --
// this only needs shares/avgBuyPrice/currentPrice, which every holding
// already has). gainPct is null rather than 0 when there's no cost basis to
// divide by (e.g. every holding has avgBuyPrice 0).
export function computeUnrealizedGain(holdings = []) {
  let marketValue = 0;
  let costBasis = 0;
  for (const h of holdings) {
    marketValue += computeMarketValue(h);
    costBasis += getTotalCostBasis(h);
  }
  const gainDollars = marketValue - costBasis;
  return { marketValue, costBasis, gainDollars, gainPct: costBasis > 0 ? (gainDollars / costBasis) * 100 : null };
}

// Builds one row per holding that has enough data for a CAGR read (valid
// purchaseDate/lots, positive cost basis, held >= 30 days) -- holdings
// missing that are silently excluded from `rows`, never given a fabricated
// window. Each row carries its own CAGR (money-weighted across lots when
// the holding has them -- see calculateHoldingCAGR) plus the S&P
// 500/Nasdaq-100 CAGR over that *same* window, so the alpha comparison is
// apples-to-apples per holding rather than one global window forced onto a
// portfolio whose holdings were bought at different times (which is what
// PTA's own single-trajectory-line approach does). Portfolio-level figures
// are market-value-weighted averages across qualifying rows only.
//
// Benchmark window for a lot-based holding anchors to the earliest lot
// (getEarliestLotDate) -- a simplification, not a full money-weighted
// benchmark simulation of the same cash-flow schedule invested into SPY/QQQ
// instead. Good enough for a directional "roughly the same era" comparison;
// isMoneyWeighted on each row tells the UI which holdings got the more
// rigorous XIRR treatment vs. the single-purchase-date approximation, so it
// can be surfaced rather than left implicit.
export function computeAnalytics(holdings = [], asOfDate = new Date()) {
  const rows = [];
  for (const holding of holdings) {
    const cagr = calculateHoldingCAGR(holding, asOfDate);
    if (cagr === null) continue;
    const isMoneyWeighted = Array.isArray(holding.lots) && holding.lots.length > 0;
    const marketValue = computeMarketValue(holding);
    const costBasis = getTotalCostBasis(holding);
    const benchmarkWindowStart = getEarliestLotDate(holding);
    const spyCAGR = compoundBenchmarkCAGR(SP500_ANNUAL_RETURN_PCT, SP500_YTD_RETURN_PCT, benchmarkWindowStart, asOfDate);
    const qqqCAGR = compoundBenchmarkCAGR(NASDAQ100_ANNUAL_RETURN_PCT, NASDAQ100_YTD_RETURN_PCT, benchmarkWindowStart, asOfDate);
    rows.push({
      id: holding.id,
      symbol: holding.symbol,
      marketValue,
      gainDollars: marketValue - costBasis,
      gainPct: costBasis > 0 ? (marketValue / costBasis - 1) * 100 : null,
      cagr,
      isMoneyWeighted,
      lotCount: isMoneyWeighted ? holding.lots.length : 0,
      spyCAGR,
      qqqCAGR,
      alphaVsSpy: spyCAGR === null ? null : cagr - spyCAGR,
      alphaVsQqq: qqqCAGR === null ? null : cagr - qqqCAGR,
    });
  }

  const weightedAvg = (key) => {
    const valid = rows.filter((r) => r[key] !== null && r.marketValue > 0);
    const totalWeight = valid.reduce((sum, r) => sum + r.marketValue, 0);
    if (totalWeight <= 0) return null;
    return valid.reduce((sum, r) => sum + r[key] * r.marketValue, 0) / totalWeight;
  };

  return {
    rows,
    weightedPortfolioCAGR: weightedAvg('cagr'),
    weightedSpyCAGR: weightedAvg('spyCAGR'),
    weightedQqqCAGR: weightedAvg('qqqCAGR'),
    qualifyingCount: rows.length,
    totalCount: holdings.length,
  };
}

// --- Portfolio-wide benchmark trajectory -----------------------------------
//
// Every dated dollar that went into the portfolio -- one event per lot, or
// one event per legacy single-lot holding's purchaseDate/avgBuyPrice/shares
// -- the same underlying cash-flow list calculateHoldingMoneyWeightedReturn
// already builds per-holding for XIRR, reused here to drive a whole-
// portfolio chart instead of one blended number.
function getPortfolioCashFlowEvents(holdings = []) {
  const events = [];
  for (const h of holdings) {
    if (Array.isArray(h?.lots) && h.lots.length > 0) {
      for (const lot of h.lots) {
        const amount = (Number(lot?.shares) || 0) * (Number(lot?.pricePerShare) || 0);
        if (lot?.date && amount > 0) events.push({ date: lot.date, amount });
      }
    } else {
      const amount = (Number(h?.shares) || 0) * (Number(h?.avgBuyPrice) || 0);
      if (h?.purchaseDate && amount > 0) events.push({ date: h.purchaseDate, amount });
    }
  }
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// One point per calendar year from the earliest dated contribution through
// asOfDate, showing (a) cumulative dollars actually invested by that point --
// real and exact, straight from lot/purchase dates -- and (b) what those same
// dollars, invested on those same real dates, would be worth if they'd gone
// into the S&P 500 / Nasdaq-100 instead (via compoundBenchmarkGrowth, the
// same day-fraction-prorated compounding computeAnalytics already uses for
// per-holding alpha).
//
// Each point also carries `portfolioValue`: the holdings' reconstructed
// worth at that cutoff from prices the app actually knew then (lot prices,
// recorded snapshots), plus `coverage` (0..1) -- the share of invested
// dollars that reconstruction accounts for. There is no historical price
// feed, so this is never a fabricated daily curve: it is exactly as dense
// as the user's own lots and price updates. "Your Portfolio (Today)"
// (portfolioValueToday) remains the one exact point.
export function computeBenchmarkTrajectory(holdings = [], asOfDate = new Date()) {
  const events = getPortfolioCashFlowEvents(holdings);
  if (events.length === 0) return null;

  const firstYear = new Date(events[0].date).getFullYear();
  const lastYear = asOfDate.getFullYear();
  if (isNaN(firstYear) || firstYear > lastYear) return null;

  const points = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const cutoff = year === lastYear ? asOfDate : new Date(Date.UTC(year, 11, 31));
    const relevant = events.filter((e) => new Date(e.date) <= cutoff);
    if (relevant.length === 0) continue;
    const invested = relevant.reduce((sum, e) => sum + e.amount, 0);
    const sumWithGrowth = (returnsTable, ytdPct) =>
      relevant.reduce((sum, e) => {
        const growth = compoundBenchmarkGrowth(returnsTable, ytdPct, e.date, cutoff);
        return sum + e.amount * (growth === null ? 1 : growth);
      }, 0);
    // What the holdings were ACTUALLY worth at this cutoff, reconstructed
    // from the prices the app knew at the time -- lot prices and recorded
    // price snapshots (see computeValueAsOfDate / withPriceSnapshot). A
    // holding with no usable price near the cutoff contributes nothing, so
    // `coverage` says how much of the invested money the figure covers;
    // the chart only draws points that cover (nearly) all of it, rather
    // than a line that sags wherever the history has holes.
    let reconstructed = 0;
    let coveredInvested = 0;
    for (const h of holdings) {
      const v = computeValueAsOfDate(h, cutoff);
      if (v === null) continue;
      reconstructed += v.value;
      coveredInvested += getPortfolioCashFlowEvents([h]).filter((e) => new Date(e.date) <= cutoff).reduce((sum, e) => sum + e.amount, 0);
    }
    points.push({
      year,
      invested,
      spyValue: sumWithGrowth(SP500_ANNUAL_RETURN_PCT, SP500_YTD_RETURN_PCT),
      qqqValue: sumWithGrowth(NASDAQ100_ANNUAL_RETURN_PCT, NASDAQ100_YTD_RETURN_PCT),
      portfolioValue: reconstructed,
      coverage: invested > 0 ? Math.min(1, coveredInvested / invested) : 0,
    });
  }
  if (points.length < 2) return null;

  const totalInvested = points[points.length - 1].invested;
  const portfolioValueToday = holdings.reduce((sum, h) => sum + computeMarketValue(h), 0);
  const lastPoint = points[points.length - 1];
  // Today's point is exact -- current prices, full coverage.
  lastPoint.portfolioValue = portfolioValueToday;
  lastPoint.coverage = 1;

  const gainPct = (endVal) => (totalInvested > 0 ? ((endVal - totalInvested) / totalInvested) * 100 : null);
  const portfolioGainPct = gainPct(portfolioValueToday);
  const spyGainPct = gainPct(lastPoint.spyValue);
  const qqqGainPct = gainPct(lastPoint.qqqValue);

  return {
    points,
    totalInvested,
    portfolioValueToday,
    portfolioGainPct,
    spyGainPct,
    qqqGainPct,
    alphaVsSpy: portfolioGainPct === null || spyGainPct === null ? null : portfolioGainPct - spyGainPct,
    alphaVsQqq: portfolioGainPct === null || qqqGainPct === null ? null : portfolioGainPct - qqqGainPct,
  };
}

// Where a price snapshot came from, for the Ledger's Source column. Every
// writer tags `source`: withPriceSnapshot's callers ('refresh' / 'manual' /
// 'added' / 'statement') and the Portfolio Tracker import ('pta', which also
// keeps the backup's own entry type in `label`). Snapshots imported before
// 'pta' was tagged carry only `label` -- the PTA import was the only writer
// of that field, so a bare label means PTA.
export const PRICE_SNAPSHOT_SOURCE_LABELS = {
  refresh: 'Live price (Google Sheet)',
  manual: 'Manual entry',
  added: 'Price when added',
  statement: 'Statement import',
  csv: 'CSV upload',
  pta: 'Portfolio Tracker import',
};
export function describePriceSnapshotSource(snap) {
  const source = snap?.source || (snap?.label ? 'pta' : null);
  if (!source) return 'Not recorded';
  const base = PRICE_SNAPSHOT_SOURCE_LABELS[source] || source;
  return source === 'pta' && snap?.label ? `${base} (${snap.label})` : base;
}

// --- Wealth Milestones / Historical Decisions ("History") ------------------
//
// AuraPortfolio's own Analytics & History tab approximates net worth over
// time by pricing each holding at the last price recorded in its ledger as
// of a given date, and drops any holding whose ledger has gone stale (no
// activity in ~400 days) rather than showing a frozen, misleading value
// forever (js/04-analytics.js in that project -- computePortfolioValueAsOf-
// Date/STALE_ASSET_DAYS). This app has no live historical price feed either
// (see computeBenchmarkTrajectory's note above), so this section builds the
// same kind of honest approximation from data this app actually has on
// file -- each lot's own date/price, including DRIP-reinvestment lots the
// Dividends sub-tab already writes into `lots` -- rather than a real
// historical mark-to-market reconstruction, which nothing here can honestly
// produce. Every function below returns plain numeric/structured data, not
// pre-formatted strings -- same separation-of-concerns as the rest of this
// file; PortfolioTab.jsx formats with formatCurrency/formatSignedPct.

export const STALE_ASSET_DAYS = 400;
const MAX_MILESTONE_YEARS = 10;

// Every priced event for a holding, oldest first: real lots when present
// (DRIP-reinvestment lots included), or a single synthesized entry from
// purchaseDate/avgBuyPrice/shares when there are no lots yet -- same "no
// lots -> one implicit lot" fallback getEarliestLotDate uses. This is the
// one list computeValueAsOfDate below walks; distributionEvents isn't a
// second source here, since every DRIP event that adds shares already has a
// matching lot (the Dividends sub-tab's auto-lot synthesis), and a cash
// distribution's rate/share isn't a market price.
// A holding with no lots and no purchase date/basis -- a statement or
// website import, which knows today's shares and price and nothing about
// the past (changelog 207). Its only priced events are zero-share price
// snapshots, so it used to be valued at 0 shares: a column in Wealth
// Milestones with nothing under it. It now holds its current shares from
// its FIRST recorded price on -- the earliest date the app knows it
// existed -- and that first value is new money, not growth.
function sharesArrivalWithoutHistory(holding) {
  if (Array.isArray(holding?.lots) && holding.lots.length > 0) return null;
  if (holding?.purchaseDate && Number(holding?.avgBuyPrice) > 0) return null;
  const shares = Number(holding?.shares) || 0;
  if (shares <= 0 || !Array.isArray(holding?.priceSnapshots)) return null;
  const first = holding.priceSnapshots
    .filter((snap) => snap?.date && Number(snap.price) > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0];
  return first ? { date: first.date, shares, price: Number(first.price) } : null;
}

export function getPricedTimeline(holding) {
  let entries;
  if (Array.isArray(holding?.lots) && holding.lots.length > 0) {
    entries = holding.lots
      .filter((lot) => lot?.date && Number(lot.pricePerShare) > 0)
      .map((lot) => ({ date: lot.date, shares: Number(lot.shares) || 0, price: Number(lot.pricePerShare) }));
  } else if (holding?.purchaseDate && Number(holding?.avgBuyPrice) > 0) {
    entries = [{ date: holding.purchaseDate, shares: Number(holding?.shares) || 0, price: Number(holding.avgBuyPrice) }];
  } else {
    entries = [];
  }
  const arrival = sharesArrivalWithoutHistory(holding);
  if (arrival) entries = [arrival];

  // Zero-share priced snapshots (see createHolding's priceSnapshots field
  // above) fold into the same timeline -- they never add cumulative shares,
  // but they do count as "priced activity" for computeValueAsOfDate's
  // staleness check below, and can supply the "last known price" for a
  // date between two real lots.
  if (Array.isArray(holding?.priceSnapshots) && holding.priceSnapshots.length > 0) {
    const snapshotEntries = holding.priceSnapshots
      .filter((snap) => snap?.date && Number(snap.price) > 0)
      .map((snap) => ({ date: snap.date, shares: 0, price: Number(snap.price) }));
    entries = entries.concat(snapshotEntries);
  }

  return entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Approximates this holding's value as of `asOfDate`, the same way
// AuraPortfolio's computePortfolioValueAsOfDate does: cumulative shares from
// every priced event on/before that date, valued at the *last* recorded
// price on/before that date (not today's live price) -- so a Milestones row
// reflects what was actually known at the time, not hindsight. Returns null
// (excluded, not guessed) when there's no priced activity yet as of that
// date, or when the most recent priced event is more than STALE_ASSET_DAYS
// before it -- a long-untouched holding stops appearing rather than showing
// a frozen value forever.
export function computeValueAsOfDate(holding, asOfDate) {
  const cutoff = new Date(asOfDate);
  if (isNaN(cutoff.getTime())) return null;

  const upToDate = getPricedTimeline(holding).filter((entry) => new Date(entry.date) <= cutoff);
  if (upToDate.length === 0) return null;

  const cumulativeShares = upToDate.reduce((sum, entry) => sum + entry.shares, 0);
  const lastEntry = upToDate[upToDate.length - 1];
  const staleDays = (cutoff.getTime() - new Date(lastEntry.date).getTime()) / 86400000;
  if (staleDays > STALE_ASSET_DAYS) return null;

  return {
    value: cumulativeShares * lastEntry.price,
    cumulativeShares,
    asOfPrice: lastEntry.price,
    priceDate: lastEntry.date,
  };
}

// One row per year, from the earliest priced activity across all holdings
// (capped to the most recent MAX_MILESTONE_YEARS) through asOfDate's year,
// each holding valued via computeValueAsOfDate above and summed by
// institution -- the "Combined Wealth Milestones" table. Column set is every
// distinct non-empty institution that appears (non-stale) anywhere in the
// range, sorted by its most recent total descending; holdings with no
// institution set roll into 'Unassigned' rather than being dropped. Returns
// { rows: [], insufficientHistory: true } when fewer than 2 years have any
// included holdings -- an honest empty state instead of a one-row table
// that can't show growth.
//
// Growth is INVESTMENT growth, not the change in the total (changelog 204):
// money you put in during the year -- every lot bought in it except a DRIP
// reinvestment, which is return, not new money -- is taken out, and the
// return is the simple Dietz one: gain / (value at the start + half the new
// money). A holding that drops out (stale) or comes back after being stale
// is left out of that year's growth rather than read as a loss or a gain.
// Each row carries `newMoney` so the table can show it.
export function milestoneNewMoney(holding, fromExclusive, toInclusive) {
  let entries;
  if (Array.isArray(holding?.lots) && holding.lots.length > 0) {
    entries = holding.lots
      .filter((lot) => lot?.date && Number(lot.pricePerShare) > 0 && lot.source !== 'drip')
      .map((lot) => ({ date: lot.date, amount: (Number(lot.shares) || 0) * Number(lot.pricePerShare) }));
  } else if (holding?.purchaseDate && Number(holding?.avgBuyPrice) > 0) {
    entries = [{ date: holding.purchaseDate, amount: (Number(holding?.shares) || 0) * Number(holding.avgBuyPrice) }];
  } else {
    const arrival = sharesArrivalWithoutHistory(holding);
    entries = arrival ? [{ date: arrival.date, amount: arrival.shares * arrival.price }] : [];
  }
  return entries
    .filter((e) => { const d = new Date(e.date); return (!fromExclusive || d > fromExclusive) && d <= toInclusive; })
    .reduce((sum, e) => sum + e.amount, 0);
}

export function computeWealthMilestones(holdings = [], { asOfDate = new Date() } = {}) {
  const lastYear = asOfDate.getFullYear();

  let earliestYear = null;
  for (const h of holdings) {
    const timeline = getPricedTimeline(h);
    if (timeline.length === 0) continue;
    const y = new Date(timeline[0].date).getFullYear();
    if (!isNaN(y) && (earliestYear === null || y < earliestYear)) earliestYear = y;
  }
  if (earliestYear === null) return { rows: [], institutions: [], members: {}, insufficientHistory: true };

  const firstYear = Math.max(earliestYear, lastYear - MAX_MILESTONE_YEARS + 1);

  const institutionSet = new Set();
  const membersByInstitution = {};
  const rawRows = [];
  let prevCutoff = null;
  let prevValues = null; // holding index -> value at the previous cutoff
  for (let year = firstYear; year <= lastYear; year++) {
    const cutoff = year === lastYear ? asOfDate : new Date(Date.UTC(year, 11, 31));
    const byInstitution = {};
    const values = new Map();
    let total = 0;
    let includedCount = 0;
    let excludedCount = 0;
    let gain = 0;
    let startValue = 0;
    let newMoney = 0;
    for (const [i, h] of holdings.entries()) {
      const asOf = computeValueAsOfDate(h, cutoff);
      if (asOf !== null) {
        values.set(i, asOf.value);
        if (prevValues) {
          const added = milestoneNewMoney(h, prevCutoff, cutoff);
          const before = prevValues.get(i);
          const startedBefore = getPricedTimeline(h).some((e) => new Date(e.date) <= prevCutoff);
          if (before !== undefined) {
            gain += asOf.value - before - added;
            startValue += before;
            newMoney += added;
          } else if (!startedBefore) {
            // Bought this year: everything above what was paid is growth.
            gain += asOf.value - added;
            newMoney += added;
          }
          // Otherwise it was stale last year and is back: no fair start
          // value, so it sits out this year's growth.
        }
      }
      if (asOf === null) {
        // Only count as "excluded" once the holding has actually started
        // (has some priced activity at all as of this cutoff) -- a holding
        // that simply hasn't been bought yet this year isn't an exclusion.
        const timeline = getPricedTimeline(h);
        if (timeline.length > 0 && new Date(timeline[0].date) <= cutoff) excludedCount += 1;
        continue;
      }
      const institution = (h?.institution || '').trim() || 'Unassigned';
      // A holding worth nothing that year (0 shares) adds no column: a
      // column of dashes only raised the question of where its money was.
      if (asOf.value > 0) institutionSet.add(institution);
      // Who is behind each column, as of the latest year they count in --
      // so a column (Unassigned above all) can be opened and fixed
      // holding by holding (changelog 206).
      if (!membersByInstitution[institution]) membersByInstitution[institution] = new Map();
      if (asOf.value > 0) membersByInstitution[institution].set(h.id, {
        holdingId: h.id, symbol: h.symbol || '', name: h.name || '', account: (h.account || '').trim(),
        year, value: asOf.value,
      });
      byInstitution[institution] = (byInstitution[institution] || 0) + asOf.value;
      total += asOf.value;
      includedCount += 1;
    }
    rawRows.push({ year, yearToDate: year === lastYear, byInstitution, total, includedCount, excludedCount, gain, startValue, newMoney, hasPrev: prevValues !== null && prevValues.size > 0 });
    prevCutoff = cutoff;
    prevValues = values;
  }

  const included = rawRows.filter((r) => r.includedCount > 0);
  if (included.length < 2) return { rows: [], institutions: [], members: {}, insufficientHistory: true };

  const lastRow = included[included.length - 1];
  const institutions = Array.from(institutionSet).sort(
    (a, b) => (lastRow.byInstitution[b] || 0) - (lastRow.byInstitution[a] || 0)
  );

  const rows = included.map((r, idx) => {
    const { gain, startValue, hasPrev, ...row } = r;
    const denom = startValue + r.newMoney / 2;
    const growthPct = idx > 0 && hasPrev && denom > 0 ? (gain / denom) * 100 : null;
    return { ...row, newMoney: idx > 0 && hasPrev ? r.newMoney : null, growthPct };
  });

  const members = Object.fromEntries(institutions.map((inst) => [
    inst,
    [...membersByInstitution[inst].values()].sort((a, b) => (b.year - a.year) || (b.value - a.value)),
  ]));
  return { rows, institutions, members, insufficientHistory: false };
}

// Largest single holding's share of total market value -- also feeds the
// "Largest Position" Historical Decisions card below. Returns null when
// there's no positive total market value to divide by.
export function computeTopWeightConcentration(holdings = []) {
  const total = holdings.reduce((sum, h) => sum + computeMarketValue(h), 0);
  if (total <= 0) return null;
  let top = null;
  for (const h of holdings) {
    const value = computeMarketValue(h);
    if (!top || value > top.value) top = { holding: h, value };
  }
  if (!top) return null;
  return { holding: top.holding, value: top.value, pct: (top.value / total) * 100 };
}

// Small institution-aware rollup for the "Total Net Worth" KPI card --
// total market value plus how many distinct institutions/holdings it's
// spread across. No private/masked-net-worth mode exists in this app, so
// unlike AuraPortfolio's equivalent card this is always a plain total.
export function computeNetWorthSummary(holdings = []) {
  const total = holdings.reduce((sum, h) => sum + computeMarketValue(h), 0);
  const institutions = new Set(holdings.map((h) => (h?.institution || '').trim()).filter(Boolean));
  return { total, institutionCount: institutions.size, holdingCount: holdings.length };
}

// Value + % of portfolio per SECURITY_TYPES bucket, for the allocation
// donut chart. Every holding lands in some bucket (falls back to 'stock',
// createHolding's own default, for anything with an unrecognized/missing
// securityType) so slices always sum to the total -- same "never silently
// drop" rule computeDividendTotalsByCharacter uses for distributionCharacter.
// Zero-value buckets are left out of `slices` so an empty type doesn't show
// up as a phantom 0% wedge.
export function computeAllocationByType(holdings = []) {
  const totals = Object.fromEntries(SECURITY_TYPES.map((t) => [t.value, 0]));
  let total = 0;
  for (const h of holdings) {
    const value = computeMarketValue(h);
    total += value;
    const type = isValidSecurityType(h?.securityType) ? h.securityType : 'stock';
    totals[type] += value;
  }
  const slices = SECURITY_TYPES
    .map((t) => ({ type: t.value, label: t.label, value: totals[t.value], pct: total > 0 ? (totals[t.value] / total) * 100 : 0 }))
    .filter((s) => s.value > 0);
  return { slices, total };
}

// Narrative "Historical Decisions & Strategy Audit" insight cards, each
// computed straight from real holdings data and included only when it has
// something real to say -- never a filler card. Mirrors the kind of thing
// AuraPortfolio's buildRealDecisions() surfaces (longest hold, best
// performer, etc.), built from this app's own richer per-lot/CAGR data
// instead of a ledger walk. Cards carry raw numeric fields, not pre-
// formatted strings -- PortfolioTab.jsx renders each `id` with its own
// template using formatCurrency/formatSignedPct/formatPct.
export function computeHistoricalDecisions(holdings = [], asOfDate = new Date()) {
  const cards = [];

  // Longest-held position.
  let longestHeld = null;
  for (const h of holdings) {
    const d = getEarliestLotDate(h);
    if (!d) continue;
    if (!longestHeld || d < longestHeld.date) longestHeld = { holding: h, date: d };
  }
  if (longestHeld) {
    const years = (asOfDate.getTime() - new Date(longestHeld.date).getTime()) / (365.25 * 86400000);
    cards.push({ id: 'longest-held', symbol: longestHeld.holding.symbol, date: longestHeld.date, years });
  }

  // Best performer by CAGR -- reuses computeAnalytics, no duplicate logic.
  const analytics = computeAnalytics(holdings, asOfDate);
  if (analytics.rows.length > 0) {
    const top = analytics.rows.reduce((best, r) => (best === null || r.cagr > best.cagr ? r : best), null);
    if (top) cards.push({ id: 'best-performer', symbol: top.symbol, cagr: top.cagr });
  }

  // Most reinvested via DRIP -- summed value (at each lot's own reinvestment
  // price) of every lot logged with source 'drip', omitted entirely if
  // nothing has ever been logged that way.
  let bestDrip = null;
  for (const h of holdings) {
    const dripLots = (Array.isArray(h.lots) ? h.lots : []).filter((lot) => lot?.source === 'drip');
    if (dripLots.length === 0) continue;
    const dripValue = dripLots.reduce((sum, lot) => sum + (Number(lot.shares) || 0) * (Number(lot.pricePerShare) || 0), 0);
    if (!bestDrip || dripValue > bestDrip.dripValue) bestDrip = { holding: h, dripValue, lotCount: dripLots.length };
  }
  if (bestDrip) {
    cards.push({ id: 'most-reinvested', symbol: bestDrip.holding.symbol, dripValue: bestDrip.dripValue, lotCount: bestDrip.lotCount });
  }

  // Largest single holding by market value -- same figure as
  // computeTopWeightConcentration, surfaced here as a narrative card too.
  const topWeight = computeTopWeightConcentration(holdings);
  if (topWeight) {
    cards.push({ id: 'largest-holding', symbol: topWeight.holding.symbol, pct: topWeight.pct });
  }

  return cards;
}

// --- Target allocation / 1-click rebalance calculator ----------------------
//
// Per-holding target %, not a hardcoded asset-class bucket. Portfolio
// Tracker's own version of this feature (js/06-retirement.js in that
// project) classifies holdings into 4 fixed buckets via a static ticker
// whitelist (e.g. a hardcoded "dividend income" list) -- anything not on
// that list silently falls into a catch-all "growth/other" bucket, which
// would misclassify any holding this app doesn't already know about. This
// app already has real per-holding data (see createHolding's
// targetAllocationPct), so there's no need to guess a holding's "type" at
// all: the user sets a target % directly on the specific holding, and this
// function turns those targets into a suggested buy/sell list.
//
// This deliberately never executes or "1-click"s an actual trade -- this
// app has no brokerage access and shouldn't pretend to. "1-click" refers to
// the whole trade list being computed instantly the moment targets are set,
// not to placing any order.
const REBALANCE_BAND_PCT = 0.5;

export function computeRebalancePlan(holdings = []) {
  const totalValue = holdings.reduce((sum, h) => sum + computeMarketValue(h), 0);
  const targeted = holdings.filter((h) => h?.targetAllocationPct !== null && h?.targetAllocationPct !== undefined);
  const targetPctSum = targeted.reduce((sum, h) => sum + (Number(h.targetAllocationPct) || 0), 0);

  const rows = targeted
    .map((h) => {
      const currentValue = computeMarketValue(h);
      const currentPct = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;
      const targetPct = Number(h.targetAllocationPct) || 0;
      const targetValue = totalValue * (targetPct / 100);
      const diffDollars = targetValue - currentValue;
      const currentPrice = Number(h.currentPrice) || 0;
      const driftPct = currentPct - targetPct;
      let action = 'balanced';
      if (Math.abs(driftPct) >= REBALANCE_BAND_PCT) {
        action = diffDollars > 0 ? 'buy' : 'sell';
      }
      return {
        id: h.id,
        symbol: h.symbol,
        currentValue,
        currentPct,
        targetPct,
        targetValue,
        diffDollars,
        // Null (render "--", not 0) when there's no current price to convert
        // a dollar gap into an actual share count -- same null-over-0
        // convention used throughout this file.
        diffShares: currentPrice > 0 ? diffDollars / currentPrice : null,
        driftPct,
        action,
      };
    })
    // Biggest suggested buys first, biggest suggested sells last -- the
    // most actionable rows (largest dollar moves either direction) surface
    // at the top and bottom of the table instead of an arbitrary order.
    .sort((a, b) => b.diffDollars - a.diffDollars);

  // A28/A23 review: targets are shares of the WHOLE portfolio, so money in a
  // holding with no target is never sold -- with targets adding to 100% the
  // buys then outrun the sells by exactly that money ($20,000 of net buying
  // and no sell anywhere), and the plan still read as valid. It is only a
  // workable plan when the targets add to 100% AND nothing untargeted holds
  // value; `netTradeDollars` is how far the buys outrun the sells.
  const isValidTotal = Math.abs(targetPctSum - 100) < REBALANCE_BAND_PCT;
  const untargetedValue = holdings
    .filter((h) => !targeted.includes(h))
    .reduce((sum, h) => sum + computeMarketValue(h), 0);
  const netTradeDollars = rows.reduce((sum, r) => sum + r.diffDollars, 0);
  const invalidReason = !isValidTotal ? 'targetSum' : untargetedValue > 0.005 ? 'untargetedValue' : null;
  return {
    rows,
    totalValue,
    targetPctSum,
    isValidTotal,
    isValid: invalidReason === null,
    invalidReason,
    untargetedValue,
    netTradeDollars,
    targetedCount: targeted.length,
    untargetedCount: holdings.length - targeted.length,
    totalCount: holdings.length,
  };
}

// AuraPortfolio-style simplified "what-if" retirement glide-path simulation
// -- deliberately NOT this app's real projection engine (calculator.js's
// runProjection): a flat assumed annual net-worth growth rate and a flat
// assumed "sustainable yield" applied at every simulated year, no taxes, no
// market variance, no interaction with the user's actual Plan Settings
// inputs (Social Security, return assumptions, etc.). See PortfolioTab.jsx's
// Retirement Income sub-tab "Retirement Planning & Glide Path" section for
// the integration decision this reflects -- it's an extension of the app,
// not (yet) wired into the real plan.
//
// currentValue: real total current portfolio market value (e.g. the sum of
//   computeMarketValue across holdings).
// currentAnnualIncome: real current annual dividend income
//   (computeDividendTotals(holdings).total) -- used only as the
//   horizonYears === 0 fallback so a 0-year horizon still returns a sane
//   "today" snapshot instead of an empty/NaN result.
export function computeGlidePathSimulation(currentValue, currentAnnualIncome, {
  horizonYears,
  targetMonthlyIncome,
  annual401k = 0,
  annualRsu = 0,
  growthRatePct = 6,
  sustainableYieldPct = 6.5,
} = {}) {
  const n = Math.max(0, Math.floor(Number(horizonYears) || 0));
  const growthFactor = 1 + (Number(growthRatePct) || 0) / 100;
  const yieldFactor = (Number(sustainableYieldPct) || 0) / 100;
  const target = Number(targetMonthlyIncome) || 0;

  let value = Number(currentValue) || 0;
  let firstYearGoalMet = null;
  const years = [];

  for (let yearIndex = 1; yearIndex <= n; yearIndex++) {
    value = value * growthFactor + (Number(annual401k) || 0) + (Number(annualRsu) || 0);
    const passiveIncomeAnnual = value * yieldFactor;
    const passiveIncomeMonthly = passiveIncomeAnnual / 12;
    if (firstYearGoalMet === null && target > 0 && passiveIncomeMonthly >= target) {
      firstYearGoalMet = yearIndex;
    }
    years.push({ yearIndex, portfolioValue: value, passiveIncomeAnnual, passiveIncomeMonthly });
  }

  const finalRow = years[years.length - 1] || {
    portfolioValue: Number(currentValue) || 0,
    passiveIncomeMonthly: (Number(currentAnnualIncome) || 0) / 12,
  };
  const fundedPct = target > 0 ? (finalRow.passiveIncomeMonthly / target) * 100 : 0;

  // 2-3 milestone rows spaced roughly a third, two-thirds, and the full
  // horizon apart -- deduped via Set so a short horizon (e.g. 1-2 years)
  // shows every year once instead of 3 near-identical/duplicate points.
  const milestoneYearIndexes = [...new Set([
    Math.max(1, Math.round(n / 3)),
    Math.max(1, Math.round((n * 2) / 3)),
    n,
  ])].filter((yi) => yi >= 1 && yi <= n).sort((a, b) => a - b);
  const milestones = milestoneYearIndexes.map((yi) => years[yi - 1]).filter(Boolean);

  return {
    years,
    milestones,
    finalPortfolioValue: finalRow.portfolioValue,
    finalPassiveIncomeMonthly: finalRow.passiveIncomeMonthly,
    targetMonthlyIncome: target,
    isFeasible: firstYearGoalMet !== null,
    firstYearGoalMet,
    fundedPct,
  };
}

// Corrected Step 1/2/3 "roadmap" narrative for the Retirement Income sub-tab
// -- this app's own honest version of Portfolio Tracker's Dynamic Planner
// roadmap. That app's version buckets holdings into 4 fixed asset classes via
// a hardcoded ticker whitelist (js/06-retirement.js's classifyHoldingBucket),
// which silently misclassified cash/bond funds as "growth" and always
// targeted the same top "growth" holding regardless of which bucket a Trim
// button was actually clicked on. This app never had that problem by
// construction: computeRebalancePlan already targets each holding
// individually via its own real targetAllocationPct, so "what to trim" below
// cites a REAL sell-candidate row (symbol, account, taxTreatment), not an
// averaged bucket. Every dollar figure traces back to computeRebalancePlan or
// computeGlidePathSimulation -- this function introduces no new hardcoded
// constants of its own.
export function computeGlidePathRoadmap(holdings = [], rebalancePlan, glidePathSimulation) {
  const holdingById = new Map(holdings.map((h) => [h.id, h]));

  // Step 1's "what to trim" bullet: the single largest real sell-candidate
  // from the Rebalance sub-tab's own computed plan. Null when nothing needs
  // trimming (no sell rows, or no Target %s set at all yet).
  const sellRows = (rebalancePlan?.rows || []).filter((r) => r.action === 'sell');
  const trimRow = sellRows.length > 0
    ? sellRows.reduce((biggest, r) => (Math.abs(r.diffDollars) > Math.abs(biggest.diffDollars) ? r : biggest), sellRows[0])
    : null;
  const trimHolding = trimRow ? holdingById.get(trimRow.id) : null;

  // Step 1's "stop DRIP" bullet: every REAL holding with dripEnabled true,
  // and the real cash that would be freed -- reuses computeDripCashSplit's
  // own `drip` total rather than re-deriving the same math a second time.
  const dripHoldings = holdings.filter((h) => h?.dripEnabled);
  const dripCashSplit = computeDripCashSplit(holdings);

  // Step 2/3 dollar figures: straight from computeGlidePathSimulation's own
  // milestone years -- no separate math here at all. With 2-3 milestones
  // (see computeGlidePathSimulation's own spacing), the middle one stands in
  // for "Step 2"; the last one is always "Step 3" / the full horizon.
  const milestones = glidePathSimulation?.milestones || [];
  const midMilestone = milestones.length > 1 ? milestones[Math.floor(milestones.length / 2)] : null;
  const finalMilestone = milestones.length > 0 ? milestones[milestones.length - 1] : null;

  return {
    trim: trimHolding
      ? {
          symbol: trimHolding.symbol,
          account: trimHolding.account || null,
          taxTreatment: trimHolding.taxTreatment || null,
          amountDollars: Math.abs(trimRow.diffDollars),
        }
      : null,
    stopDrip: dripHoldings.length > 0
      ? { symbols: dripHoldings.map((h) => h.symbol), annualCashFreed: dripCashSplit.drip }
      : null,
    step2: midMilestone,
    step3: finalMilestone,
    isFeasible: glidePathSimulation?.isFeasible ?? false,
    firstYearGoalMet: glidePathSimulation?.firstYearGoalMet ?? null,
  };
}
