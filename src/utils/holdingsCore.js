// The part of the Detailed Holdings model (portfolioHoldings.js) that the
// app needs the moment it starts: the holdings hook loading and saving
// holdings, the linked Initial Balances totals the Dashboard projects from,
// and backup restore. Everything else -- statement and PTA import,
// analytics, benchmarks, the rebalance and glide-path tools -- stays in
// portfolioHoldings.js, which only the tabs that use it load. That file
// re-exports everything here, so either import path works; startup code
// imports from this file so the rest stays out of the first download.
// Keep this file free of imports from portfolioHoldings.js.

export const TAX_TREATMENTS = [
  { value: 'preTax', label: 'Pre-Tax (Traditional IRA / 401k)' },
  { value: 'roth', label: 'Roth (Roth IRA / 401k)' },
  { value: 'taxable', label: 'Taxable (Brokerage)' },
  { value: 'hsa', label: 'HSA' },
];

const TAX_TREATMENT_VALUES = TAX_TREATMENTS.map((t) => t.value);

export function isValidTaxTreatment(value) {
  return TAX_TREATMENT_VALUES.includes(value);
}

// Deliberately a separate axis from TAX_TREATMENTS above -- Tax Treatment
// describes the *account* a holding sits in (does a distribution get taxed
// at all this year), while this describes the *character* of a taxable
// account's distribution (how it's taxed when it does). A fund can pay a mix
// of these across a single year, which "Mixed / Fund-Dependent" covers
// rather than forcing a single wrong label. Since changelog 414 the engine
// reads it: a linked taxable account's qualified share is the share of its
// income that is not ordinary -- Not Set on a bond, cash, REIT,
// option-income or BDC holding counts as Ordinary, Mixed counts half; see
// ordinaryIncomeShareForHolding and computeTaxableDistributionYield.
export const DISTRIBUTION_CHARACTERS = [
  { value: 'unspecified', label: 'Not Set / Unspecified' },
  { value: 'qualifiedDividend', label: 'Qualified Dividend' },
  { value: 'ordinaryDividend', label: 'Ordinary (Non-Qualified) Dividend' },
  { value: 'ltcg', label: 'Long-Term Capital Gain Distribution' },
  { value: 'returnOfCapital', label: 'Return of Capital' },
  { value: 'mixed', label: 'Mixed / Fund-Dependent' },
];

// 'stcg' was offered as a Distribution Character until 2026-09-10 and was a
// category error: a fund's SHORT-TERM capital gain distributions are
// reported on 1099-DIV in Box 1a as ordinary dividends, not as capital
// gains in Box 2a. There was never a separate line to model, so the option
// invited users to classify money in a way no tax form does.
//
// Removing an option is not enough on its own -- holdings already tagged
// with it would fall through isValidDistributionCharacter to 'unspecified'
// and quietly land in the matrix's "Kind not stated" row, which is both
// wrong and looks like data loss. They are remapped instead, to the
// treatment the 1099 actually gives them.
export const LEGACY_DISTRIBUTION_CHARACTERS = { stcg: 'ordinaryDividend' };

// Idempotent, and applied on every load rather than behind a one-shot flag:
// a remap with a single correct answer needs no memory of having run, and a
// plan imported from an older backup gets the same treatment as one already
// in storage.
export function migrateDistributionCharacters(holdings) {
  if (!Array.isArray(holdings)) return { holdings: [], changed: false };
  let changed = false;
  const next = holdings.map((h) => {
    const mapped = LEGACY_DISTRIBUTION_CHARACTERS[h?.distributionCharacter];
    if (!mapped) return h;
    changed = true;
    return { ...h, distributionCharacter: mapped };
  });
  return { holdings: changed ? next : holdings, changed };
}

const DISTRIBUTION_CHARACTER_VALUES = DISTRIBUTION_CHARACTERS.map((d) => d.value);

export function isValidDistributionCharacter(value) {
  return DISTRIBUTION_CHARACTER_VALUES.includes(value);
}

// Deliberately a separate axis from SECURITY_TYPES above -- Type describes
// what *kind of vehicle* a holding is (a single stock vs. an ETF vs. a
// mutual fund), which says nothing about what it actually invests in: an
// ETF can hold all-stock, all-bond, or a cash-equivalent money-market
// portfolio. Asset Class is the "what does this actually behave like for
// asset-allocation purposes" answer computeAssetClassMix below needs, and
// what feeds the stockAllocationPre link (see App.jsx's stockAllocationSource
// sync effect and calculator.js's DEFAULT_INPUTS comment). `null` is the
// default on every holding (see createHolding) -- deliberately distinct
// from an explicit value, so getEffectiveAssetClass below can tell "never
// reviewed, use the guess" apart from "user explicitly confirmed this is a
// Stock." Same convention targetAllocationPct already uses.
export const ASSET_CLASSES = [
  { value: 'stock', label: 'Stock' },
  { value: 'bond', label: 'Bond' },
  { value: 'cash', label: 'Cash Equivalent' },
  { value: 'other', label: 'Other / Mixed' },
];

const ASSET_CLASS_VALUES = ASSET_CLASSES.map((c) => c.value);

export function isValidAssetClass(value) {
  return ASSET_CLASS_VALUES.includes(value);
}

// Curated, deliberately-not-exhaustive ticker lists for guessAssetClass
// below. These are the common, high-share funds in each category -- a
// ticker/name that isn't recognized here just falls through to the
// name-keyword checks, and ultimately to the 'stock' default, exactly like
// an unrecognized securityType already falls back to 'stock' elsewhere in
// this file. This is a best-effort default, not a data feed -- a user who
// holds something obscure that gets misclassified can always fix it via
// the Asset Class dropdown (EditHoldingModal.jsx), which is why the guess
// is only ever a *default*, never silently authoritative once a holding
// has an explicit assetClass set.
export const CASH_EQUIVALENT_TICKERS = new Set([
  'SPAXX', 'FDRXX', 'FZFXX', 'FDLXX', 'VMFXX', 'VMRXX', 'SWVXX', 'SNVXX', 'SNSXX',
  'SGOV', 'BIL', 'SHV', 'ICSH', 'NEAR', 'USFR', 'GBIL', 'TBIL', 'CLTL', 'JPST',
]);
const CASH_EQUIVALENT_NAME_PATTERN = /money market|treasury bill|t-bill|ultra[- ]short|cash reserves|government money/i;

const BOND_TICKERS = new Set([
  'BND', 'AGG', 'TLT', 'IEF', 'IEI', 'SHY', 'LQD', 'HYG', 'JNK', 'MUB', 'VCIT', 'VCSH',
  'VCLT', 'BNDX', 'VTEB', 'SCHZ', 'GOVT', 'TIP', 'VGIT', 'VGLT', 'VGSH', 'SPTL', 'SPTS',
  'EDV', 'TLH', 'MBB', 'USIG', 'BSV', 'BIV', 'BLV', 'FBND', 'FXNAX', 'VBTLX', 'PTTRX',
  'AGGG', 'IUSB', 'SCHR', 'SCHO', 'SCHP', 'FLOT', 'MINT',
]);
const BOND_NAME_PATTERN = /\bbond\b|treasury|fixed income|municipal|aggregate bond/i;

// Best-effort default for a holding with no explicit assetClass -- checked
// symbol first (exact match against the curated lists above), then name
// (keyword match, for less common tickers), then securityType (crypto
// defaults to 'other' rather than 'stock', since it isn't equity in the
// traditional sense this model's stock/bond blend assumes), and only then
// the final 'stock' fallback -- the same "assume the common case" default
// securityType itself uses.
export function guessAssetClass(holding) {
  const symbol = (holding?.symbol || '').trim().toUpperCase();
  const name = holding?.name || '';

  if (symbol && CASH_EQUIVALENT_TICKERS.has(symbol)) return 'cash';
  if (symbol && BOND_TICKERS.has(symbol)) return 'bond';
  if (CASH_EQUIVALENT_NAME_PATTERN.test(name)) return 'cash';
  if (BOND_NAME_PATTERN.test(name)) return 'bond';
  if (holding?.securityType === 'crypto') return 'other';
  return 'stock';
}

// The value actually used everywhere else in this file/app: the user's own
// explicit choice if they've set one, otherwise the best-effort guess
// above -- "manual override wins, else derive a default" is the same rule
// getWeightedAvgBuyPrice and the taxTreatment/securityType fallbacks in
// this file already follow, just applied here to a field that's guessed
// instead of merely defaulted.
export function getEffectiveAssetClass(holding) {
  return isValidAssetClass(holding?.assetClass) ? holding.assetClass : guessAssetClass(holding);
}

export function createHolding(overrides = {}) {
  const { id: _ignoredId, ...rest } = overrides;
  return {
    id: `holding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taxTreatment: 'taxable',
    account: '',
    institution: '',
    symbol: '',
    name: '',
    // See SECURITY_TYPES above for the full rationale/default.
    securityType: 'stock',
    // See ASSET_CLASSES/getEffectiveAssetClass above -- null (not a guessed
    // value) is the real default here, distinct from securityType's 'stock'
    // default, because computeAssetClassMix always resolves this through
    // getEffectiveAssetClass rather than reading the raw field directly, so
    // baking in a guess at creation time would only make it harder to tell
    // "reviewed and confirmed Stock" apart from "never looked at."
    assetClass: null,
    shares: 0,
    avgBuyPrice: 0,
    currentPrice: 0,
    // Per-share day change and the day's %-change, straight from the
    // pricing Sheet's own GOOGLEFINANCE("ticker","change"/"changepct")
    // formulas (see sheetPricing.js's parsePricingCsv) -- null until the
    // first successful Refresh ever populates it, same "unset vs. real
    // zero" convention targetAllocationPct uses below. Not derived or
    // estimated client-side; this is real market data, just previously
    // parsed and then never read anywhere. Position-level dollar impact is
    // computed as dayChangeDollar * getTotalShares(holding) wherever it's
    // displayed, not stored pre-multiplied.
    dayChangeDollar: null,
    dayChangePct: null,
    // Excludes this holding's symbol from Live Pricing entirely: never
    // registered with the pricing Sheet, never patched by Refresh, and its
    // sync badge shows a neutral "manual" state instead of the accusatory
    // "Not found -- double check the symbol." Exists because some real
    // symbols can NEVER resolve via Yahoo/GOOGLEFINANCE and that's not the
    // user's mistake: employer-plan internal tickers (e.g. a 401(k)'s
    // TARGET-RETIRE-2), other plan-internal funds, and money-market funds
    // like FDRXX (public, but MMFs aren't quoted -- their NAV is pegged at
    // $1.00 by construction anyway). Prices for these are maintained by
    // hand, exactly like the pre-Live-Pricing workflow.
    manualPricing: false,
    // A PUBLIC ticker whose moves this holding should track when the
    // holding's own symbol can't be quoted -- the way an employer plan's
    // "Institutional 500 Index Trust" (a collective trust, no ticker) is
    // the same portfolio as VFFSX. The proxy's PRICE is not this holding's
    // price (trust units and fund shares are priced on different scales),
    // so Refresh never copies it; it scales this holding's price by the
    // proxy's return since the anchor below was set. See applyProxyPrice.
    pricingSymbol: '',
    // { proxyPrice, holdingPrice, date } captured the first time Refresh
    // sees the proxy after the holding's price was last set by hand or by
    // a statement import (updateHolding clears it whenever currentPrice
    // is patched without a new anchor). null = "anchor on next Refresh".
    pricingAnchor: null,
    // Manually entered, same as currentPrice -- no live dividend feed
    // ported from PTA either. This is the trailing annual dividend/
    // distribution per share (not a quarterly rate) -- the source of truth
    // for annual income (shares * annualDividendPerShare). dividendFrequency
    // below is purely descriptive/derived display, it never multiplies back
    // into this figure.
    annualDividendPerShare: 0,
    // 'unspecified' by default, same reasoning as taxTreatment defaulting to
    // 'taxable' -- the Dividends sub-tab's per-payment estimate and
    // Distribution Character breakdown both need *a* value to group
    // "not yet reviewed" holdings under, rather than silently dropping them.
    dividendFrequency: 'unspecified',
    // A place to research this security -- e.g. a quote page, a fund's
    // fact sheet, a broker's research tab. Empty string ('') means "never
    // set" (distinct from a real, deliberately-blank value, though there's
    // no way to enter one -- clearing the field just goes back to '').
    // Auto-filled from the pricing Sheet's own "URL" column (a generated
    // Yahoo Finance quote link, see scripts/pricing-sheet-apps-script.gs)
    // the first time "Refresh Prices & Dividends (Live)" resolves this
    // symbol AND this field is still empty -- PortfolioTab.jsx's
    // handleRefreshLiveData never overwrites a value that's already set,
    // whether it came from an earlier auto-fill or the user typed their
    // own link in via EditHoldingModal.jsx. Rendered as a clickable link
    // only when isSafeExternalUrl (below) passes, so a malformed or
    // non-http(s) value (accidental or otherwise) never becomes a
    // clickable `javascript:`-style href.
    researchUrl: '',
    distributionCharacter: 'unspecified',
    // Optional 'YYYY-MM-DD'. Entirely optional -- most other fields on this
    // model work fine without it (bucket totals, dividend income). It only
    // unlocks one thing: calculateHoldingCAGR/computeAnalytics below, which
    // need an actual holding period to annualize a return. A holding with no
    // purchaseDate simply doesn't show up in the Analytics sub-tab's CAGR
    // rows -- it's never guessed or defaulted to "today". Note this models
    // one lot per holding: a holding that's been growing via DRIP
    // (reinvested distributions buying more shares at their own prices/
    // dates) doesn't have its reinvestment lots tracked separately here, so
    // CAGR against a single Purchase Date is a directional estimate, not a
    // precise money-weighted return -- see the Analytics sub-tab copy.
    purchaseDate: null,
    // Multi-lot cost basis (optional -- see the "Multi-lot" section below).
    // Empty by default: a holding with no lots behaves exactly as before,
    // using shares/avgBuyPrice/purchaseDate above as its one implicit lot.
    // Once lots has entries, every accessor below (getTotalShares,
    // getTotalCostBasis, calculateHoldingCAGR, etc.) switches to computing
    // from lots instead -- shares/avgBuyPrice/purchaseDate become stale
    // display-only leftovers at that point, not read for any calculation.
    lots: [],
    // Optional target allocation, as a % of the whole Detailed Holdings
    // portfolio (not per-account or per-bucket) -- see computeRebalancePlan
    // below. null means "no opinion set yet", deliberately distinct from an
    // explicit 0 (which means "target zero -- I want out of this holding").
    // A holding with no target is excluded from the rebalance plan's table
    // entirely (same "missing input -> excluded, not guessed" convention as
    // purchaseDate above), though its current value still counts toward the
    // portfolio total every target % is measured against.
    targetAllocationPct: null,
    // Per-holding Dividend Reinvestment Plan preference -- purely a display/
    // organizational toggle (which "DRIP vs Cash Destination" KPI bucket this
    // holding's income counts toward) plus the default `destination` a new
    // Log Distribution entry pre-fills to. Defaults true, same as
    // AuraPortfolio's own asset.dripEnabled default-on-unless-explicitly-false
    // convention. See DISTRIBUTION_DESTINATIONS/distributionEvents below --
    // this does not retroactively change anything about already-logged
    // events, it only affects the toggle's starting state and new entries.
    dripEnabled: true,
    // The real, user-logged distribution/payment history for this holding --
    // see createDistributionEvent below. Empty by default and NEVER seeded
    // with synthetic entries, on creation or on import: AuraPortfolio's own
    // getAssetLedger() falls back to an empty array for any holding it
    // doesn't have hardcoded demo data for, and this model follows that same
    // honest-empty rule from the start rather than fabricating history for a
    // holding that doesn't have any on file. Distinct from the *estimated*
    // forward schedule (computeProjectedPayoutSchedule below, computed
    // on-the-fly from dividendFrequency/annualDividendPerShare, never
    // stored) -- a logged entry here is always something the user actually
    // entered, an entry from computeProjectedPayoutSchedule is always
    // labeled `estimated: true` and never written back into this array.
    distributionEvents: [],
    // Zero-share-change "still held, price recorded" data points -- see the
    // PTA ledger-import section below (parsePtaLedgerEntries). A ledger
    // entry that changed no shares isn't a lot or a distribution event, but
    // its navPrice is still a real price at a real point in time and worth
    // keeping (unlike AuraPortfolio's own ledger modal, which either
    // discards these or fabricates a fake lot for them -- see that
    // section's comments). Empty by default, same honest-empty convention
    // as distributionEvents; getPricedTimeline below folds these in as
    // zero-share priced entries so they also help reduce spurious
    // staleness-exclusions in Wealth Milestones.
    priceSnapshots: [],
    ...rest,
  };
}

export const holdingCharacter = (holding) => (
  isValidDistributionCharacter(holding?.distributionCharacter) ? holding.distributionCharacter : 'unspecified'
);

// The character the TAX figure uses (computeTaxableDistributionYield), as
// distinct from the one the distribution matrix displays. A holding whose
// character was never set is still a bond fund or a money-market fund if
// its asset class says so, and what those pay is interest -- ordinary
// income, not a qualified dividend. So Not Set on a bond or cash holding
// reads as Ordinary here (changelog 414); Not Set on a stock, or anything
// the user did set (Mixed included), is left exactly as it was. The matrix
// keeps showing the holding under "Kind not stated": this is a tax
// default, not a claim about what the fund declared.
export const ORDINARY_BY_ASSET_CLASS = new Set(['bond', 'cash']);

// Stock-class funds whose distributions are ordinary income all the same
// (changelog 442): REITs (rent, not qualified dividends), option-income
// and covered-call funds (option premium), and business development
// companies. Curated and deliberately not exhaustive, like the asset-class
// lists above -- the name patterns catch the rest, and a holding's own
// Distribution Character always wins once set.
export const ORDINARY_INCOME_TICKERS = new Set([
  // REITs and REIT funds
  'VNQ', 'SCHH', 'XLRE', 'IYR', 'RWR', 'USRT', 'FREL', 'REET', 'VNQI', 'O', 'STAG', 'NNN', 'WPC', 'ADC', 'VICI', 'PLD', 'AMT', 'SPG', 'PSA', 'EQIX', 'DLR', 'MPW', 'AGNC', 'NLY',
  // Option-income / covered-call funds
  'JEPI', 'JEPQ', 'QYLD', 'XYLD', 'RYLD', 'DIVO', 'SPYI', 'QQQI', 'YMAX', 'XDTE', 'QDTE', 'RDTE', 'CHPY', 'GPIX', 'GPIQ', 'ISPY', 'IQQQ', 'BALI', 'NUSI', 'KNG',
  // Business development companies
  'ARCC', 'MAIN', 'OBDC', 'FSK', 'BXSL', 'HTGC', 'TSLX', 'GBDC', 'PSEC', 'BIZD', 'PBDC', 'CSWC', 'TRIN', 'CGBD', 'MFIC', 'NMFC', 'GSBD',
]);
const ORDINARY_INCOME_NAME_PATTERN = /\bREITs?\b|real estate|option income|premium income|covered call|buy-?write|yieldmax|\b0dte\b|business development|\bBDC\b/i;

export function isOrdinaryIncomeFund(holding) {
  const symbol = (holding?.symbol || '').trim().toUpperCase();
  if (symbol && ORDINARY_INCOME_TICKERS.has(symbol)) return true;
  return ORDINARY_INCOME_NAME_PATTERN.test(holding?.name || '');
}

export function taxCharacterForHolding(holding) {
  const character = holdingCharacter(holding);
  if (character !== 'unspecified') return character;
  if (ORDINARY_BY_ASSET_CLASS.has(getEffectiveAssetClass(holding))) return 'ordinaryDividend';
  return isOrdinaryIncomeFund(holding) ? 'ordinaryDividend' : character;
}

// The share of a holding's ESTIMATED income that is ordinary, 0-1, for the
// tax figure: Ordinary and interest 1, qualified and gains 0, and Mixed /
// Fund-Dependent one half (changelog 442; it had counted as fully
// qualified, which is the one thing "mixed" rules out). Logged actuals
// carry their own split and do not come through here.
export function ordinaryIncomeShareForHolding(holding) {
  const character = taxCharacterForHolding(holding);
  if (character === 'ordinaryDividend' || character === 'interest') return 1;
  if (character === 'mixed') return 0.5;
  return 0;
}

// Which matrix row an ACTUAL record belongs in. The event's own type is
// better evidence than the holding-level character and wins where it says
// anything specific; where it is merely "a dividend" or "other", the
// holding's character is the only thing that can sharpen it.
export function matrixRowForRecord(rec, character) {
  switch (rec.type) {
    case 'returnOfCapital': return 'returnOfCapital';
    case 'interest': return 'interest';
    case 'capitalGainDistribution':
      return character === 'ltcg' ? character : 'capitalGainDistribution';
    // "A dividend" or "other" says nothing specific, so the holding's
    // character sorts it -- whichever one the user set, return of capital
    // included (changelog 205: a ROC fund's logged payments used to fall
    // into "Kind not stated" although its character was set).
    case 'dividend':
    case 'other':
      return character;
    default:
      // A reinvestment lot: no type of its own, so the holding speaks for it.
      return character;
  }
}

// The cash reserve the user actually holds: Taxable-account holdings whose
// effective asset class is Cash Equivalent (money-market funds, T-bill
// ETFs, and anything they have set to Cash themselves).
//
// TAXABLE ONLY, and that is a modeling decision rather than an oversight.
// calculator.js draws the cash floor before any account and never taxes the
// withdrawal, because a reserve is money that has already been taxed. Cash
// sitting inside a Pre-Tax account is not that: drawing it is an ordinary-
// income event the projection already models through the Pre-Tax bucket, so
// counting it as the floor would spend it twice and tax it never. Roth and
// HSA cash is excluded for the same reason -- those buckets have their own
// rules.
//
// Returns the ids as well as the total, because a linked cash floor MUST be
// netted out of the Taxable bucket. Cash-equivalent holdings are already
// inside `taxableInit` (bucket totals are split by tax treatment, not by
// asset class), so a plan that links both Initial Balances and the cash
// floor would otherwise hold the same dollars twice -- once in the taxable
// account and once in a reserve that sits beside it. That is exactly the
// double count changelog 147 fixed for concentrated stock, arriving by a
// different door.
export function computeCashReserveFromHoldings(holdings = [], { excludeHoldingIds = [] } = {}) {
  const exclude = new Set(excludeHoldingIds.filter(Boolean));
  let total = 0;
  const holdingIds = [];
  for (const h of holdings || []) {
    if (!h || h.taxTreatment !== 'taxable' || exclude.has(h.id)) continue;
    if (getEffectiveAssetClass(h) !== 'cash') continue;
    const value = computeMarketValue(h);
    if (value <= 0) continue;
    total += value;
    holdingIds.push(h.id);
  }
  return { total, holdingIds };
}

// Whether a holdings->plan link may write to the plan at all.
//
// The links (Initial Balances, Known Cost Basis, Working Allocation,
// Taxable Brokerage Dividend Yield) mean "the holdings win". That is only
// safe while there ARE holdings. With an empty list every aggregate is
// legitimately 0, so a linked plan would silently have its balances and
// basis overwritten with zeros -- a plan destroyed by arithmetic that is
// technically correct.
//
// This is not hypothetical. It happens when the holdings list is emptied,
// when localStorage is cleared or fails to parse (loadHoldings returns []
// by design rather than throwing), and it is what would happen if the
// holdings read were ever gated behind entitlement the way mutations
// already are -- someone whose subscription lapsed would find their plan
// zeroed rather than frozen at its last synced figures.
//
// So: an empty portfolio never writes. The plan keeps the last values it
// synced, and the user can unlink from Plan Settings (which is a FREE tab,
// deliberately -- an expired subscription must never trap someone in a
// linked plan they cannot edit).
//
// A portfolio that HAS holdings syncs normally, including to a genuinely
// zero bucket: someone who holds nothing taxable and says so is stating a
// fact, not losing data.
export function canSyncFromHoldings(holdings) {
  return Array.isArray(holdings) && holdings.length > 0;
}

// When the plan's Initial Balances are typed in by hand, holdings can be
// imported, edited and repriced without the plan moving at all -- the owner added
// 14 lots (2026-09-24) and the Initial Nest Egg stayed put, with nothing on
// screen saying why. This is the "why": null when there is nothing to say
// (linked, no holdings, or the two already agree to the dollar), else the
// plan's figures beside what the holdings would give it.
//
// `derivedTotals` must be the totals the link WOULD write (App.jsx's
// derivedBucketTotals, linked concentrated/cash positions already netted
// out), so the comparison is like for like. The nest-egg pair mirrors the
// KPI card, which counts Pre-Tax + Roth + Taxable and leaves HSA out.
export function unlinkedBalanceGap(inputs, holdings, derivedTotals) {
  if (!inputs || inputs.initialBalancesSource === 'holdings') return null;
  if (!canSyncFromHoldings(holdings) || !derivedTotals) return null;
  const plan = (k) => Number(inputs[k]) || 0;
  const held = (k) => Number(derivedTotals[k]) || 0;
  const planNestEgg = plan('preTaxInit') + plan('rothInit') + plan('taxableInit');
  const holdingsNestEgg = held('preTax') + held('roth') + held('taxable');
  const planTotal = planNestEgg + plan('hsaInit');
  const holdingsTotal = holdingsNestEgg + held('hsa');
  const differs = ['preTax', 'roth', 'taxable', 'hsa'].some((k) => Math.abs(plan(`${k}Init`) - Math.round(held(k))) >= 1);
  if (!differs) return null;
  return { planNestEgg, holdingsNestEgg, planTotal, holdingsTotal };
}

// One-time retraction of lot sources the IMPORTER guessed.
//
// Until 2026-09-10 the PTA importer labeled every share addition after the
// first as `source: 'drip'`, which was harmless while `source` only picked a
// word in a table. It stopped being harmless when a 'drip' lot began
// counting as real dividend income: a portfolio's entire funding history
// was reported as income received. This walks stored holdings once and
// turns those inherited 'drip' labels into 'unspecified', so nothing counts
// as income until the user says it is.
//
// Two things it deliberately does NOT lose:
//
//   - A DRIP payment the user LOGGED also wrote a distributionEvent, and
//     collectActualDistributions counts the event. So a genuinely recorded
//     reinvestment keeps counting even though its lot's label is retracted.
//   - 'purchase' and 'openingBalance' lots are untouched; neither was ever
//     read as income.
//
// Runs once per browser, guarded by its own flag key, so a user who
// re-labels a lot as DRIP Reinvestment afterwards keeps that answer.
export function retractGuessedLotSources(holdings) {
  if (!Array.isArray(holdings)) return { holdings: [], changed: false };
  let changed = false;
  const next = holdings.map((h) => {
    const lots = Array.isArray(h?.lots) ? h.lots : null;
    if (!lots || lots.length === 0) return h;
    let touched = false;
    const nextLots = lots.map((lot) => {
      if (lot?.source !== 'drip') return lot;
      touched = true;
      return { ...lot, source: 'unspecified' };
    });
    if (!touched) return h;
    changed = true;
    return { ...h, lots: nextLots };
  });
  return { holdings: changed ? next : holdings, changed };
}

// Same defaults-merged-with-overrides pattern as createHolding above, same
// reason `id` is always freshly generated rather than taken from overrides.
export function createLot(overrides = {}) {
  const { id: _ignoredId, ...rest } = overrides;
  return {
    id: `lot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: null,
    shares: 0,
    pricePerShare: 0,
    source: 'purchase',
    ...rest,
  };
}

// Every real distribution a holding received in `year`, from the two places
// the model records one:
//
//   1. `distributionEvents` -- payments logged in the Ledger (or imported
//      from a PTA ledger entry whose type named a distribution).
//   2. Tax lots with `source: 'drip'` -- shares that were BOUGHT with a
//      distribution. Those shares are the payment: shares x the lot's own
//      reinvestment price is the gross that arrived. A PTA ledger row typed
//      "DRIP Reinvestment" imports as exactly this and as nothing else,
//      because DISTRIBUTION_TYPE_PATTERN doesn't match that wording -- so
//      without reading lots, a reinvested payment is invisible.
//
// A lot's source is USER-EDITABLE (the lot editor on the Holdings sub-tab
// has a Source dropdown), which is what makes reading it defensible: the
// importer's own labeling is a default, but the user can correct any lot
// it got wrong, so 'drip' is treated as their answer rather than a guess.
//
// De-duplication matters because the two sources overlap: logging a DRIP
// distribution with Shares Added + NAV appends a matching lot, and a PTA
// entry typed "Dividend" with destination "drip" imports as both. A lot is
// dropped when some event in the same holding already claims it -- same
// date, same share count -- which is the rule StatementImportPanel uses to
// spot an already-recorded DRIP.
export function collectActualDistributions(holding, year = null) {
  // `year` omitted means every year -- what the Ledger's lifetime figure
  // wants; the month timeline passes a specific one.
  const yearStr = year === null || year === undefined ? null : String(year);
  const inYear = (date) => yearStr === null || date.slice(0, 4) === yearStr;
  const events = Array.isArray(holding?.distributionEvents) ? holding.distributionEvents : [];
  const out = [];

  for (const ev of events) {
    const date = typeof ev?.date === 'string' ? ev.date : '';
    if (!inYear(date)) continue;
    out.push({ date, amount: Number(ev?.grossAmount) || 0, from: 'event', type: ev?.type || null });
  }

  const lots = Array.isArray(holding?.lots) ? holding.lots : [];
  for (const lot of lots) {
    if (lot?.source !== 'drip') continue;
    const date = typeof lot?.date === 'string' ? lot.date : '';
    if (!inYear(date)) continue;
    const shares = Number(lot?.shares) || 0;
    const price = Number(lot?.pricePerShare) || 0;
    if (shares <= 0 || price <= 0) continue;
    const alreadyLogged = events.some((ev) => ev?.date === date
      && Math.abs((Number(ev?.sharesAdded) || 0) - shares) < 1e-6);
    if (alreadyLogged) continue;
    // A reinvestment lot records no type -- the shares are the only
    // trace the payment left. Callers that care classify it from the
    // holding's own distributionCharacter instead.
    out.push({ date, amount: shares * price, from: 'dripLot', type: null });
  }

  return out;
}

// How much of a taxable holding's recorded distributions in `year` would
// actually be TAXED, in dollars.
//
// Return of capital is excluded: it is not income, it reduces your basis.
// Two ways to know a record is ROC -- the distribution event's own type, or
// (for a reinvestment lot, or an event logged only as a dividend or
// "other") the holding's declared Distribution Character. Everything else
// counts: dividends, capital gain distributions, interest.
//
// Sorted the same way the distribution matrix sorts them, so the two can
// never disagree about what is ROC: a record logged as "Dividend" or
// "Other" on a holding whose character is Return of Capital is ROC here
// too (changelog 205).
// Changelog 208: also returns how much of it is ORDINARY income -- ordinary
// dividends and interest. Everything else (qualified dividends, capital
// gain distributions, and anything Mixed or not stated, as the owner chose) is
// taxed at the qualified / capital-gains rates -- except (changelog 414)
// that "not stated" on a bond or cash holding is ordinary, see
// taxCharacterForHolding.
const ORDINARY_ROWS = new Set(['ordinaryDividend', 'interest']);
function taxableDistributionsInYear(holding, year) {
  return taxableDistributionSplitInYear(holding, year).total;
}
function taxableDistributionSplitInYear(holding, year) {
  const character = taxCharacterForHolding(holding);
  let total = 0;
  let ordinary = 0;
  for (const rec of collectActualDistributions(holding, year)) {
    const row = matrixRowForRecord(rec, character);
    if (row === 'returnOfCapital') continue;
    total += rec.amount;
    if (ORDINARY_ROWS.has(row)) ordinary += rec.amount;
  }
  return { total, ordinary };
}

// The most recent COMPLETE calendar year with anything recorded, looking
// back three. A part-finished year would understate, and the whole point of
// this figure is to stop understating.
const TAXABLE_DISTRIBUTION_LOOKBACK_YEARS = 3;

// The yield the plan taxes on the Taxable Brokerage balance every year.
//
// Built from dividends alone until 2026-09-10, which understated anyone
// holding distributing mutual funds in a taxable account: a fund's largest
// payout of the year is often a capital gain distribution, it is taxable
// the year it lands whether or not it was reinvested, and no part of it
// appears in a dividend-per-share rate. calculator.js taxes this figure at
// preferential rates (`capGains = taxableDividends + realizedGains`), which
// is exactly right for a capital gain distribution.
//
// Per holding it takes the HIGHER of two bases -- the forward dividend
// estimate, or what that holding actually distributed in the basis year --
// rather than preferring one. They measure different things and either can
// be the more complete: a holding whose distributions were never logged has
// only the estimate, and a holding whose logging is partial would drag its
// own figure DOWN if actuals simply replaced the estimate. Underestimating
// taxable income is the expensive direction to be wrong, so neither basis
// is allowed to lower the other.
//
// Only holdings tagged `taxable` count at all -- a distribution inside an
// IRA, 401(k), Roth or HSA is not taxed in the year it lands and must never
// reach this number.
//
// Returns null when there are no taxable holdings, matching
// computeTaxableDividendYield's own "nothing to report" contract.
export function computeTaxableDistributionYield(holdings = [], { excludeHoldingIds = [], asOfDate = new Date() } = {}) {
  const exclude = new Set(excludeHoldingIds.filter(Boolean));
  const taxable = (holdings || []).filter((h) => h && h.taxTreatment === 'taxable' && !exclude.has(h.id));
  if (taxable.length === 0) return null;

  const thisYear = asOfDate.getFullYear();
  let basisYear = null;
  for (let y = thisYear - 1; y >= thisYear - TAXABLE_DISTRIBUTION_LOOKBACK_YEARS; y -= 1) {
    if (taxable.some((h) => taxableDistributionsInYear(h, y) > 0)) { basisYear = y; break; }
  }

  let value = 0;
  let income = 0;
  let ordinaryIncome = 0;
  let dividendIncome = 0;
  const uplifted = [];
  for (const h of taxable) {
    value += computeMarketValue(h);
    const character = taxCharacterForHolding(h);
    // A Return of Capital fund's forward estimate is not income either
    // (changelog 208) -- its logged payments were already left out.
    const estimated = character === 'returnOfCapital' ? 0 : computeAnnualDividendIncome(h);
    const split = basisYear === null ? { total: 0, ordinary: 0 } : taxableDistributionSplitInYear(h, basisYear);
    const actual = split.total;
    dividendIncome += estimated;
    income += Math.max(estimated, actual);
    // The ordinary share follows whichever basis was used.
    ordinaryIncome += actual > estimated ? split.ordinary : estimated * ordinaryIncomeShareForHolding(h);
    if (actual > estimated) uplifted.push({ holdingId: h.id, symbol: h.symbol, estimated, actual });
  }
  if (value <= 0) return null;

  uplifted.sort((a, b) => (b.actual - b.estimated) - (a.actual - a.estimated));
  return {
    yield: income / value,
    // Share of that income taxed at qualified / capital-gains rates, 0-1.
    qualifiedShare: income > 0 ? 1 - ordinaryIncome / income : 1,
    dividendOnlyYield: dividendIncome / value,
    basisYear,
    uplifted,
    taxableValue: value,
  };
}

// Every accessor below follows the same rule: if `holding.lots` has at
// least one entry, compute from lots; otherwise fall back to the flat
// shares/avgBuyPrice fields exactly as before. This is the one rule that
// keeps every existing single-lot holding (and every existing test/call
// site that doesn't know about lots) working completely unchanged.
export function getTotalShares(holding) {
  if (Array.isArray(holding?.lots) && holding.lots.length > 0) {
    return holding.lots.reduce((sum, lot) => sum + (Number(lot?.shares) || 0), 0);
  }
  return Number(holding?.shares) || 0;
}

// Total dollars invested (sum of each lot's own shares * price), not a
// per-share figure -- see getWeightedAvgBuyPrice below for the per-share
// version. Named distinctly from "cost basis" as used in tax law (which
// this doesn't attempt -- no wash-sale tracking, no specific-lot-ID sale
// elections -- it's the same "total money in" figure computeUnrealizedGain
// already computed inline for the flat-fields case, just lot-aware now).
export function getTotalCostBasis(holding) {
  if (Array.isArray(holding?.lots) && holding.lots.length > 0) {
    return holding.lots.reduce((sum, lot) => sum + (Number(lot?.shares) || 0) * (Number(lot?.pricePerShare) || 0), 0);
  }
  return (Number(holding?.shares) || 0) * (Number(holding?.avgBuyPrice) || 0);
}

// Best available single date to anchor a benchmark comparison window for a
// lot-based holding -- there's no one purchaseDate anymore, so this picks
// the earliest lot instead. Deliberately a simplification, not a full
// money-weighted benchmark simulation (which would need its own per-lot
// IRR against benchmark returns): good enough for a directional "roughly
// when did this position start" anchor, called out explicitly in
// computeAnalytics's alpha comparison rather than silently treated as
// precise.
export function getEarliestLotDate(holding) {
  if (Array.isArray(holding?.lots) && holding.lots.length > 0) {
    const dated = holding.lots.filter((lot) => lot?.date);
    if (dated.length === 0) return holding?.purchaseDate || null;
    return dated.reduce((earliest, lot) => (lot.date < earliest ? lot.date : earliest), dated[0].date);
  }
  return holding?.purchaseDate || null;
}

// Plain-words description of where a holding's Current Price comes from,
// shared by the holdings table's "via" badge, the Edit dialog and the CSV
// export's Price Basis column, so all three say the same thing.
//
// The proxy case is the one people misread: a 401(k) trust priced "via
// VSVNX" shows its own unit price ($178.12), not VSVNX's ($35.61), and
// that is correct -- the trust is a different vehicle on a different
// per-unit scale that only shares VSVNX's percentage return (see
// applyProxyPrice in portfolioHoldings.js). So the proxy text always says
// the prices are not supposed to match, and gives the ratio once anchored.
//   kind:  'proxy' | 'manual' | 'quote'
//   short: one line for a CSV cell
//   long:  the full explanation for a dialog
export function describePriceBasis(holding) {
  const proxy = String(holding?.pricingSymbol || '').trim().toUpperCase();
  if (proxy) {
    const anchor = holding?.pricingAnchor;
    const holdingPrice = Number(anchor?.holdingPrice);
    const proxyPrice = Number(anchor?.proxyPrice);
    const anchored = holdingPrice > 0 && proxyPrice > 0;
    const ratio = anchored ? holdingPrice / proxyPrice : null;
    const ratioText = ratio ? ` (about ${ratio >= 10 ? ratio.toFixed(1) : ratio.toFixed(2)}\u00d7 ${proxy}'s)` : '';
    const since = anchored && anchor?.date ? ` since ${anchor.date}` : ' from the next price refresh';
    const short = `Follows ${proxy}'s % return${since}; its unit price${ratioText} is not ${proxy}'s price`;
    const long = [
      `This holding is priced via ${proxy}, a public fund with the same portfolio. Its price moves by ${proxy}'s percentage return${since}.`,
      `It never copies ${proxy}'s price. A 401(k) or plan version of a fund has its own unit price${ratioText ? `, here${ratioText}` : ''}, so the two prices are not supposed to match.`,
      'To check it, compare the balance (units \u00d7 price) with your plan statement, not the price with the public fund. Entering the statement\u2019s unit price by hand resets the starting point.',
    ].join(' ');
    return { kind: 'proxy', proxy, ratio, short, long };
  }
  if (holding?.manualPricing) {
    return { kind: 'manual', proxy: '', ratio: null, short: 'Entered by hand', long: 'This price is entered by hand; Refresh never changes it.' };
  }
  return { kind: 'quote', proxy: '', ratio: null, short: 'Own quote', long: 'This price is the symbol\u2019s own quote from your pricing Sheet.' };
}

export function computeMarketValue(holding) {
  const shares = getTotalShares(holding);
  const price = Number(holding?.currentPrice) || 0;
  return shares * price;
}

export function computeAnnualDividendIncome(holding) {
  const shares = getTotalShares(holding);
  const perShare = Number(holding?.annualDividendPerShare) || 0;
  return shares * perShare;
}

// Sums every holding's market value into the four Initial-Balances buckets.
// Holdings with an unrecognized/missing taxTreatment are excluded from every
// bucket (rather than guessed into one) but still counted in `total` and
// `unassignedCount`, so the UI can surface "N holdings need a tax treatment
// before they'll count toward your Initial Balances" instead of silently
// mis-bucketing or silently dropping them.
//
// `options.excludeHoldingId` skips one holding entirely -- both its bucket
// and the `total`. This is how a holding the user has designated as their
// Concentrated Stock position is kept out of the Taxable bucket: the
// concentrated sleeve is modeled ALONGSIDE the four buckets, never inside
// one, so a linked GOOG holding counted in `taxable` here AND in the
// concentrated position would double-count it in Net Worth and the estate,
// and grow it twice (diversified rate in the bucket, single-stock rate in
// the sleeve). See calculator.js's concentratedStockSource comment and
// App.jsx's derived-balances effect.
export function computeBucketTotals(holdings = [], options = {}) {
  // Accepts excludeHoldingIds (array) and/or excludeHoldingId (single) --
  // there can be two linked concentrated positions to net out.
  const exclude = new Set([
    ...(Array.isArray(options.excludeHoldingIds) ? options.excludeHoldingIds : []),
    ...(options.excludeHoldingId ? [options.excludeHoldingId] : []),
  ].filter(Boolean));
  const totals = { preTax: 0, roth: 0, taxable: 0, hsa: 0 };
  let total = 0;
  let unassignedCount = 0;
  let excludedValue = 0;

  for (const holding of holdings) {
    if (exclude.size > 0 && holding?.id && exclude.has(holding.id)) {
      excludedValue += computeMarketValue(holding);
      continue;
    }
    const value = computeMarketValue(holding);
    total += value;
    if (isValidTaxTreatment(holding?.taxTreatment)) {
      totals[holding.taxTreatment] += value;
    } else {
      unassignedCount += 1;
    }
  }

  return { ...totals, total, unassignedCount, count: holdings.length, excludedValue };
}

// Cost-basis analog of computeBucketTotals above, but scoped to just the
// Taxable bucket -- that's the only one calculator.js's dynamic basis
// tracking cares about (taxableBasisInit/taxableCapitalGainsRatio in
// DEFAULT_INPUTS; Pre-Tax/Roth/HSA withdrawals aren't taxed as capital
// gains, so a cost basis for those buckets wouldn't feed anything). Uses
// getTotalCostBasis (lot-aware "total dollars invested") rather than
// market value, matching what "cost basis" means for the tax engine.
export function computeTaxableCostBasis(holdings = [], options = {}) {
  const exclude = new Set([
    ...(Array.isArray(options.excludeHoldingIds) ? options.excludeHoldingIds : []),
    ...(options.excludeHoldingId ? [options.excludeHoldingId] : []),
  ].filter(Boolean));
  return holdings.reduce((sum, h) => (
    h?.taxTreatment === 'taxable' && !(h?.id && exclude.has(h.id))
      ? sum + getTotalCostBasis(h)
      : sum
  ), 0);
}

// --- This app's own backup/restore (Ledger & Tools -> Cloud Backup & Sync) -
//
// Different from parsePtaBackup below: this is a same-app round-trip, not a
// foreign import. A holding this app itself exported already has every
// field createHolding produces. This exists purely as a safety net against
// a hand-edited or corrupted backup file, not a schema migration -- there's
// no holdings schema version yet (see the STORAGE_KEY comment in
// usePortfolioHoldings.js for why that's deliberate). Preserves each
// holding's existing `id` when present, unlike createHolding (which always
// mints a fresh one) -- otherwise re-importing the same backup file twice
// would churn every holding's id for no reason.
// A29: a restored file is not trusted to have the right types. "lots: 'oops'"
// survived to crash every lot accessor, and a string or negative share count
// went straight into the sums. Numbers are coerced ("10" -> 10); anything
// that is not a finite, non-negative number becomes 0; lots must be an
// array of objects with a positive share count, and each keeps its id or is
// given one (a sale matches lots by id).
const IMPORT_NUMERIC_FIELDS = ['shares', 'avgBuyPrice', 'currentPrice', 'annualDividendPerShare'];
function importNumber(v) {
  const n = typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function sanitizeImportedLots(lots) {
  if (!Array.isArray(lots)) return [];
  return lots
    .filter((lot) => lot && typeof lot === 'object')
    .map((lot) => {
      const clean = { ...lot, shares: importNumber(lot.shares), pricePerShare: importNumber(lot.pricePerShare) };
      return lot.id ? clean : { ...createLot(clean) };
    })
    .filter((lot) => lot.shares > 0);
}
export function sanitizeImportedHoldings(rawHoldings) {
  if (!Array.isArray(rawHoldings)) return [];
  return rawHoldings
    .filter((h) => h && typeof h === 'object')
    .map((h) => {
      const base = h.id ? { ...createHolding(h), id: h.id } : createHolding(h);
      for (const k of IMPORT_NUMERIC_FIELDS) {
        if (k in h) base[k] = importNumber(h[k]);
      }
      base.lots = sanitizeImportedLots(h.lots);
      if (base.targetAllocationPct !== null && base.targetAllocationPct !== undefined) {
        const t = Number(base.targetAllocationPct);
        base.targetAllocationPct = Number.isFinite(t) && t >= 0 ? t : null;
      }
      return base;
    });
}

// Long-term vs. short-term capital gains classification (held > 1 year),
// same threshold IRS Publication 550 uses and the same one PTA's own Tax
// Lots view badges each lot with. Purely informational here -- like
// distributionCharacter elsewhere in this model, nothing reads this back
// into an actual tax calculation. Returns null (render "--", not a guess)
// when the lot has no valid date to classify from.
// Long-term means held MORE than one year, and the holding period starts
// the day after the purchase (IRS Pub. 550): a lot bought 2023-03-01 is
// long-term from 2024-03-02, not on 2024-03-01. Counting days (> 365) got
// that wrong across a leap day -- exactly one year in 2024 is 366 days
// (A29). Compared as calendar dates: long when the sale date is after the
// purchase's one-year anniversary (Feb 29 rolls to Mar 1).
function utcDay(value) {
  if (value === null || value === undefined || value === '') return null;
  const str = typeof value === 'string' ? value : null;
  const m = str && /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
export function holdingTerm(purchaseDate, saleDate = new Date()) {
  const bought = utcDay(purchaseDate);
  const sold = utcDay(saleDate);
  if (bought === null || sold === null) return null;
  const b = new Date(bought);
  const anniversary = Date.UTC(b.getUTCFullYear() + 1, b.getUTCMonth(), b.getUTCDate());
  return sold > anniversary ? 'long' : 'short';
}

// Today's date as YYYY-MM-DD in the user's OWN timezone. toISOString() is
// UTC, which stamped an evening update in Austin with tomorrow's date.
export function localIsoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Records `price` as this holding's known price on `date` -- one snapshot
// per calendar day (a later write for the same day replaces the earlier
// one). Every price the app learns goes through here (Refresh, a manual
// edit, a statement import), so the history the trajectory chart and
// Wealth Milestones reconstruct from gets denser exactly as often as the
// user updates prices: daily if they refresh daily, quarterly if they
// import a statement each quarter. Returns the new priceSnapshots array.
export function withPriceSnapshot(holding, price, date = localIsoDate(), source = 'refresh') {
  const p = Number(price);
  const existing = Array.isArray(holding?.priceSnapshots) ? holding.priceSnapshots : [];
  if (!(p > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return existing;
  const kept = existing.filter((snap) => snap?.date !== date);
  kept.push({ id: `snap-${date}-${Math.random().toString(36).slice(2, 8)}`, date, price: p, source });
  return kept.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Real stock/bond/cash mix from Detailed Holdings, grouped by
// getEffectiveAssetClass (manual override if set, else guessAssetClass's
// best-effort default) rather than the raw assetClass field or
// securityType -- this is what feeds the stockAllocationPre link (see
// App.jsx's stockAllocationSource sync effect and calculator.js's
// DEFAULT_INPUTS comment on why 'other' is excluded from the classified
// total).
//
// Two different percentages are exposed on purpose: stockPct/bondPct/
// cashPct/otherPct are each slice's share of the WHOLE portfolio (for a
// donut chart, same shape as computeAllocationByType above), while
// stockPctOfClassified is stock's share of just stock+bond+cash (excluding
// 'other') -- that second number is the one that actually feeds
// stockAllocationPre, since calculator.js's rebalancing model is a
// two-bucket stock/bond blend with no separate "unclassified" allocation
// to subtract out. `other` (crypto, or anything that doesn't cleanly fit
// stock/bond/cash) is real portfolio value and still counts in `total`,
// it just isn't part of the classified stock/bond/cash split the link
// writes into Plan Settings.
export function computeAssetClassMix(holdings = []) {
  const totals = { stock: 0, bond: 0, cash: 0, other: 0 };
  let total = 0;

  for (const h of holdings) {
    const value = computeMarketValue(h);
    total += value;
    const assetClass = getEffectiveAssetClass(h);
    totals[assetClass] += value;
  }

  const classifiedTotal = totals.stock + totals.bond + totals.cash;
  const pct = (v) => (total > 0 ? (v / total) * 100 : 0);

  return {
    stockValue: totals.stock,
    bondValue: totals.bond,
    cashValue: totals.cash,
    otherValue: totals.other,
    total,
    stockPct: pct(totals.stock),
    bondPct: pct(totals.bond),
    cashPct: pct(totals.cash),
    otherPct: pct(totals.other),
    classifiedTotal,
    stockPctOfClassified: classifiedTotal > 0 ? (totals.stock / classifiedTotal) * 100 : null,
  };
}

// The three real numbers calculator.js's Concentrated Stock Position model
// (concentratedStockLabel/Init/CostBasisPct) needs from a single holding
// the user has designated as their concentrated position -- see
// calculator.js's concentratedStockSource comment for the link/unlink
// pattern this feeds (App.jsx's sync effect), and SettingsTab.jsx's "Link
// to a Holding" dropdown for where a holding gets designated. Unlike
// computeAssetClassMix/computeBucketTotals above, this deliberately takes
// ONE holding, not an array -- only one concentrated position is modeled.
// costBasisPct is clamped to [0, 100] to match the manual field's own
// bound (a real position trading underwater would otherwise compute
// >100%, which the diversification-tax math downstream never expects to
// see -- clamping treats that case as "no gain" rather than a negative
// realized gain the UI has no way to display).
export function computeConcentratedStockLinkValues(holding) {
  if (!holding) return null;
  const value = computeMarketValue(holding);
  const costBasis = getTotalCostBasis(holding);
  const costBasisPct = value > 0 ? Math.max(0, Math.min(100, (costBasis / value) * 100)) : 0;
  return { label: holding.symbol || '', value, costBasisPct };
}

// --- Liquidation audit trail -------------------------------------------
//
// Records a sale as an immutable, append-only entry separate from the live
// holding -- "for tax purposes" (the user's own framing for this feature):
// realized gain/loss, cost basis, and long/short-term classification need
// to survive even after a position is fully sold and no longer appears in
// the active Holdings table.
//
// Unlike Portfolio Tracker's own liquidation feature (js/12-liquidate-
// modal-init.js in that project), which computes realized gain off one
// blended avgBuyPrice regardless of which actual lot the shares came from,
// this draws down real per-lot data when a holding has lots (see the
// Multi-lot section above) -- FIFO, oldest lot first, the IRS's default
// cost-basis method absent a specific-lot election. A holding with no lots
// falls back to its single flat shares/avgBuyPrice/purchaseDate, same "no
// lots = one implicit lot" rule used everywhere else in this file.
export const LIQUIDATION_EPSILON = 1e-9;

// A holding's lots in FIFO order (oldest first), or a single synthetic lot
// built from the flat shares/avgBuyPrice/purchaseDate fields when the
// holding has no real lots yet -- so the liquidation math below never needs
// a separate no-lots code path.
function getLotsForLiquidation(holding, saleDate = null) {
  if (Array.isArray(holding?.lots) && holding.lots.length > 0) {
    // lotIndex identifies a lot that has no id (A29: two id-less lots were
    // both matched to the same sold entry). A lot bought after the sale
    // date cannot be part of the sale.
    const saleDay = saleDate === null ? null : utcDay(saleDate);
    return holding.lots
      .map((lot, lotIndex) => ({ ...lot, lotIndex }))
      .filter((lot) => saleDay === null || !lot.date || utcDay(lot.date) === null || utcDay(lot.date) <= saleDay)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }
  const shares = Number(holding?.shares) || 0;
  if (shares <= 0) return [];
  return [{
    id: '__implicit__',
    date: holding?.purchaseDate || null,
    shares,
    pricePerShare: Number(holding?.avgBuyPrice) || 0,
  }];
}

// Walks a holding's lots oldest-first, consuming shares until sharesToSell
// is covered. Returns null (never a partial fill) if the holding doesn't
// have enough shares on hand to cover the requested sale, or if the
// requested amount isn't a positive number.
export function selectLotsForSale(holding, sharesToSell, saleDate = null) {
  const requested = Number(sharesToSell) || 0;
  if (requested <= 0) return null;
  const lots = getLotsForLiquidation(holding, saleDate);
  // Only the shares held on the sale date can be sold.
  const available = lots.reduce((sum, lot) => sum + (Number(lot.shares) || 0), 0);
  if (requested > available + LIQUIDATION_EPSILON) return null;

  const consumed = [];
  let remaining = requested;
  for (const lot of lots) {
    if (remaining <= LIQUIDATION_EPSILON) break;
    const lotShares = Number(lot.shares) || 0;
    if (lotShares <= LIQUIDATION_EPSILON) continue;
    const sharesFromThisLot = Math.min(lotShares, remaining);
    const pricePerShare = Number(lot.pricePerShare) || 0;
    consumed.push({
      lotId: lot.id,
      lotIndex: lot.lotIndex ?? null,
      date: lot.date || null,
      shares: sharesFromThisLot,
      pricePerShare,
      costBasis: sharesFromThisLot * pricePerShare,
    });
    remaining -= sharesFromThisLot;
  }
  return { consumed, costBasis: consumed.reduce((sum, c) => sum + c.costBasis, 0), sharesSold: requested - Math.max(0, remaining) };
}

// Long-term (held more than one year; see holdingTerm) vs. short-term vs. "mixed" -- same rule
// getLotTermClassification uses elsewhere in this file. "mixed" happens
// when a single sale draws from lots spanning both sides of the 1-year
// line; each consumed lot's own term is still carried on that lot's own
// entry in lotsSold for a caller that needs the true per-lot breakdown
// (e.g. an accurate tax report) -- this is just the summary label for the
// sale as a whole.
function classifySaleTerm(termsPerLot) {
  const known = termsPerLot.filter((t) => t !== null);
  if (known.length === 0) return null;
  if (known.every((t) => t === 'long')) return 'long';
  if (known.every((t) => t === 'short')) return 'short';
  return 'mixed';
}

export function termForLotAsOf(lotDateStr, saleDateObj) {
  return holdingTerm(lotDateStr, saleDateObj);
}

// Pure preview -- computes what a sale WOULD look like without mutating
// anything, so a "Liquidate" form can show realized gain/loss live as the
// user adjusts shares/price before confirming. Returns null if the
// requested share count exceeds what the holding actually has.
export function computeLiquidationPreview(holding, { sharesToSell, salePricePerShare, saleDate = new Date() } = {}) {
  const saleDateObj = saleDate instanceof Date ? saleDate : new Date(saleDate);
  const selection = selectLotsForSale(holding, sharesToSell, saleDateObj);
  if (!selection) return null;
  const price = Number(salePricePerShare) || 0;
  const proceeds = selection.sharesSold * price;
  const realizedGainDollars = proceeds - selection.costBasis;
  const lotsSold = selection.consumed.map((c) => ({ ...c, term: termForLotAsOf(c.date, saleDateObj) }));

  return {
    sharesSold: selection.sharesSold,
    salePricePerShare: price,
    proceeds,
    costBasis: selection.costBasis,
    realizedGainDollars,
    realizedGainPct: selection.costBasis > 0 ? (realizedGainDollars / selection.costBasis) * 100 : null,
    termClassification: classifySaleTerm(lotsSold.map((l) => l.term)),
    lotsSold,
    isFullLiquidation: Math.abs(selection.sharesSold - getTotalShares(holding)) < LIQUIDATION_EPSILON,
  };
}

// Builds a persistable audit-trail record from a holding + sale params.
// Returns null (same as computeLiquidationPreview) when the sale can't be
// filled from what the holding actually has -- never a partial/guessed
// record.
export function createLiquidation(holding, params, overrides = {}) {
  const preview = computeLiquidationPreview(holding, params);
  if (!preview) return null;
  const { id: _ignoredId, ...rest } = overrides;
  const saleDateObj = params?.saleDate instanceof Date ? params.saleDate : new Date(params?.saleDate || Date.now());
  return {
    id: `liq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    holdingId: holding?.id || null,
    // Snapshot fields, not references -- the holding this came from may
    // later be fully removed once its shares hit zero (see
    // applyLiquidationToHolding), so this audit record can't depend on
    // holdingId still resolving to a live holding. Same "export by value"
    // reasoning as why Cloud Backup & Sync exports holdings directly rather
    // than by reference.
    symbol: holding?.symbol || '',
    account: holding?.account || '',
    taxTreatment: holding?.taxTreatment || 'taxable',
    saleDate: saleDateObj.toISOString().slice(0, 10),
    // When the position was originally opened, so the Liquidations/"Closed
    // Positions" table can show a real Holding Period instead of just a
    // sale date. Reuses getEarliestLotDate's existing lots-vs-flat fallback
    // (earliest dated lot if this holding tracks lots, else its flat
    // purchaseDate) -- same source of truth calculateHoldingCAGR/
    // computeAnalytics already use for "when did this position start."
    // Snapshotted here for the same reason symbol/account/taxTreatment are:
    // the holding this came from may be fully removed once its shares hit
    // zero.
    purchaseDate: getEarliestLotDate(holding),
    notes: '',
    ...preview,
    ...rest,
  };
}

// Pure -- returns the holding as it should look AFTER the sale (lots
// depleted FIFO, or flat shares reduced for a no-lots holding), plus
// whether this was a full liquidation of the position. Never mutates the
// input holding; the caller (usePortfolioHoldings' liquidateHolding)
// decides what to do with isFullyLiquidated (that hook removes the holding
// entirely on a full sale, matching Portfolio Tracker's own precedent,
// rather than leaving a permanent $0/0-share row in the Holdings table).
export function applyLiquidationToHolding(holding, liquidation) {
  if (!liquidation) return { updatedHolding: holding, isFullyLiquidated: false };
  // By id when the lot has one; by position when it does not (an id-less
  // lot keyed on `undefined` used to pick up another lot's sold count).
  const soldByLotId = new Map(liquidation.lotsSold.filter((l) => l.lotId).map((l) => [l.lotId, l]));
  const soldByIndex = new Map(liquidation.lotsSold.filter((l) => !l.lotId && l.lotIndex !== null && l.lotIndex !== undefined).map((l) => [l.lotIndex, l]));

  if (Array.isArray(holding?.lots) && holding.lots.length > 0) {
    const newLots = holding.lots
      .map((lot, idx) => {
        const sold = lot.id ? soldByLotId.get(lot.id) : soldByIndex.get(idx);
        if (!sold) return lot;
        const remainingShares = (Number(lot.shares) || 0) - sold.shares;
        return remainingShares > LIQUIDATION_EPSILON ? { ...lot, shares: remainingShares } : null;
      })
      .filter(Boolean);
    return { updatedHolding: { ...holding, lots: newLots }, isFullyLiquidated: newLots.length === 0 };
  }

  const remainingShares = (Number(holding?.shares) || 0) - liquidation.sharesSold;
  const isFullyLiquidated = remainingShares <= LIQUIDATION_EPSILON;
  return {
    updatedHolding: { ...holding, shares: isFullyLiquidated ? 0 : remainingShares },
    isFullyLiquidated,
  };
}

// Same defensive reconstruction as sanitizeImportedHoldings above, for the
// liquidations half of a Cloud Backup & Sync restore -- guards against a
// hand-edited or corrupted backup file, not a schema migration (there's no
// liquidations schema version yet, same reasoning as holdings).
export function sanitizeImportedLiquidations(rawLiquidations) {
  if (!Array.isArray(rawLiquidations)) return [];
  return rawLiquidations.filter((l) => l && typeof l === 'object' && typeof l.id === 'string');
}
