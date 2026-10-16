// Account activity for a period, to check against a brokerage statement
// (John, 2026-10-05: "see the activity for each account so that I can
// compare that against the statements").
//
// A statement says three things about each position: what you held when the
// period opened, what happened, and what you held when it closed. This
// rebuilds the same three from what Detailed Holdings records:
//
//   * tax lots           -- when shares arrived, at what price, and whether
//                           they were bought or reinvested
//   * distribution events -- dividends and other payments, cash or reinvested
//   * liquidations       -- sales, with the lots each one drew from
//   * price snapshots    -- the price on each day one was recorded
//
// Two things make it more than a filter by date:
//
//   1. A sale DEPLETES its lots. holding.lots is what is left today, so
//      "shares held on 30 June" is today's lots dated on or before then,
//      PLUS whatever later sales took out of them. A lot sold in full is
//      gone from the holding altogether and survives only inside the
//      liquidation that consumed it (lotsSold); it is rebuilt from there.
//   2. A holding sold in full is removed. Its history is its liquidations,
//      which carry the symbol and account by value for exactly this reason.
//
// What it cannot know, and says so rather than guessing: deposits,
// withdrawals, fees and transfers (never recorded), and how a holding with
// no lots and no purchase date got to its share count (`noHistory`).
//
// Pure: no storage, no dates read from the clock except through `today`.
import { getPricedTimeline, findLikelyDuplicateLots, LOT_SOURCES, DISTRIBUTION_EVENT_TYPES } from './portfolioHoldings';
import { localIsoDate } from './holdingsCore';

export const PERIOD_KINDS = [
  { value: 'month', label: 'Monthly' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'year', label: 'Annually' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-12
const EPS = 1e-6;

// One period. `n` is the month (1-12) or quarter (1-4); ignored for a year.
// `key` is stable and sorts by time within a kind: "2026-09", "2026-Q3", "2026".
export function periodFor(kind, year, n = 1) {
  if (kind === 'month') {
    return { kind, year, n, key: `${year}-${pad(n)}`, label: `${MONTHS[n - 1]} ${year}`, start: `${year}-${pad(n)}-01`, end: `${year}-${pad(n)}-${pad(lastDay(year, n))}` };
  }
  if (kind === 'quarter') {
    const first = (n - 1) * 3 + 1;
    return { kind, year, n, key: `${year}-Q${n}`, label: `Q${n} ${year} (${MONTHS[first - 1]} to ${MONTHS[first + 1]})`, start: `${year}-${pad(first)}-01`, end: `${year}-${pad(first + 2)}-${pad(lastDay(year, first + 2))}` };
  }
  return { kind: 'year', year, n: 1, key: String(year), label: String(year), start: `${year}-01-01`, end: `${year}-12-31` };
}

// The period a date falls in.
export function periodContaining(kind, isoDate) {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  if (kind === 'month') return periodFor('month', year, month);
  if (kind === 'quarter') return periodFor('quarter', year, Math.ceil(month / 3));
  return periodFor('year', year);
}

// The `count` most recent periods, newest first. The first is the one in
// progress (`inProgress: true`); a statement only exists for the ones after.
export function recentPeriods(kind, today = localIsoDate(), count = 24) {
  const out = [];
  let p = periodContaining(kind, today);
  for (let i = 0; i < count; i++) {
    out.push({ ...p, inProgress: i === 0 });
    if (kind === 'month') p = p.n === 1 ? periodFor('month', p.year - 1, 12) : periodFor('month', p.year, p.n - 1);
    else if (kind === 'quarter') p = p.n === 1 ? periodFor('quarter', p.year - 1, 4) : periodFor('quarter', p.year, p.n - 1);
    else p = periodFor('year', p.year - 1);
  }
  return out;
}

export function dayBefore(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const isIso = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
const day = (v) => (isIso(v) ? v.slice(0, 10) : null);
const num = (v) => Number(v) || 0;
const sourceLabel = (source) => (LOT_SOURCES.find((s) => s.value === source) || {}).label || 'Added';
const typeLabel = (type) => (DISTRIBUTION_EVENT_TYPES.find((t) => t.value === type) || { label: 'Distribution' }).label;

// Every lot a position has ever had, with what is left of it and what each
// sale took: [{ key, date, price, source, held, sold: [{ date, shares }] }].
function lotHistory(holding, sales) {
  const lots = new Map();
  const hasLots = Array.isArray(holding?.lots) && holding.lots.length > 0;
  if (hasLots) {
    holding.lots.forEach((lot, idx) => {
      lots.set(lot.id || `idx:${idx}`, { key: lot.id || `idx:${idx}`, date: day(lot.date), price: num(lot.pricePerShare), source: lot.source || 'purchase', held: num(lot.shares), sold: [] });
    });
  }
  // A holding without lots is one implicit lot: its whole share count.
  let implicit = null;
  if (holding && !hasLots && holding.id) {
    const firstSnap = (Array.isArray(holding.priceSnapshots) ? holding.priceSnapshots : []).map((s) => day(s?.date)).filter(Boolean).sort()[0] || null;
    implicit = {
      key: 'implicit',
      date: day(holding.purchaseDate) || firstSnap,
      price: num(holding.avgBuyPrice),
      source: day(holding.purchaseDate) ? 'purchase' : 'firstRecorded',
      held: num(holding.shares),
      sold: [],
      implicit: true,
    };
    lots.set('implicit', implicit);
  }
  for (const sale of sales) {
    const saleDate = day(sale.saleDate);
    for (const piece of (Array.isArray(sale.lotsSold) ? sale.lotsSold : [])) {
      const key = piece.lotId || (piece.lotIndex !== null && piece.lotIndex !== undefined ? `idx:${piece.lotIndex}` : null);
      // A lot still on the holding; or, for a holding that keeps no lots,
      // its one implicit lot.
      let lot = hasLots ? ((key && lots.get(key)) || null) : implicit;
      if (!lot) {
        // Sold in full since (or the whole position was): rebuild the lot
        // from the sale's own record of it.
        const ghostKey = `gone:${key || `${piece.date}|${piece.pricePerShare}`}`;
        lot = lots.get(ghostKey);
        if (!lot) {
          lot = { key: ghostKey, date: day(piece.date), price: num(piece.pricePerShare), source: 'purchase', held: 0, sold: [], gone: true };
          lots.set(ghostKey, lot);
        }
      }
      lot.sold.push({ date: saleDate, shares: num(piece.shares) });
    }
  }
  return [...lots.values()];
}

// Shares held at the end of `date`.
function sharesOn(lots, extraAdds, date) {
  let total = 0;
  for (const lot of lots) {
    if (lot.date && lot.date > date) continue;
    total += lot.held;
    for (const s of lot.sold) if (!s.date || s.date > date) total += s.shares;
    // Reinvested shares logged on a holding that keeps no lots arrived on
    // their own dates, not with the implicit lot.
    if (lot.implicit) for (const a of extraAdds) if (a.date > date) total -= a.shares;
  }
  return Math.max(0, total);
}

// The last recorded price on or before `date`: { price, date } or null.
function priceOn(timeline, date) {
  let hit = null;
  for (const e of timeline) {
    if (e.date > date) break;
    hit = e;
  }
  return hit ? { price: hit.price, date: hit.date } : null;
}

function position(lots, extraAdds, timeline, date) {
  const shares = sharesOn(lots, extraAdds, date);
  const p = priceOn(timeline, date);
  return {
    shares,
    price: p ? p.price : null,
    priceDate: p ? p.date : null,
    value: p ? Math.round(shares * p.price * 100) / 100 : null,
  };
}

// One position's row for the period, or null when it was not held and
// nothing happened.
function buildRow(holding, sales, period, today) {
  const lots = lotHistory(holding, sales);
  const events = (Array.isArray(holding?.distributionEvents) ? holding.distributionEvents : []).filter((ev) => day(ev?.date));
  const inPeriod = (d) => Boolean(d) && d >= period.start && d <= period.end;
  const lotMatches = (lot, ev) => lot.date === day(ev.date) && Math.abs((lot.held + lot.sold.reduce((a, s) => a + s.shares, 0)) - num(ev.sharesAdded)) < EPS;
  // Reinvestments logged without a lot (a holding that keeps none).
  const extraAdds = events
    .filter((ev) => ev.destination === 'drip' && num(ev.sharesAdded) > 0 && !lots.some((lot) => !lot.implicit && lotMatches(lot, ev)))
    .map((ev) => ({ date: day(ev.date), shares: num(ev.sharesAdded) }));

  const timeline = [
    ...(holding?.id ? getPricedTimeline(holding).map((e) => ({ date: day(e.date), price: e.price })) : lots.filter((l) => l.date && l.price > 0).map((l) => ({ date: l.date, price: l.price }))),
    ...sales.filter((s) => day(s.saleDate) && num(s.salePricePerShare) > 0).map((s) => ({ date: day(s.saleDate), price: num(s.salePricePerShare) })),
  ].filter((e) => e.date && e.price > 0);
  // The current price stands for today when nothing was recorded today.
  if (holding?.id && num(holding.currentPrice) > 0 && !timeline.some((e) => e.date === today)) timeline.push({ date: today, price: num(holding.currentPrice) });
  timeline.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const activity = [];
  const claimed = new Set();
  // Lots that look like one purchase or reinvestment recorded twice. The
  // statement is where that shows: the closing share count runs high by
  // exactly one lot (John, 2026-10-05: a 5.737-share reinvestment listed
  // twice on the same day). Flagged, never removed.
  const twins = findLikelyDuplicateLots(holding?.lots);
  for (const lot of lots) {
    if (!inPeriod(lot.date)) continue;
    const shares = lot.held + lot.sold.reduce((a, s) => a + s.shares, 0);
    if (lot.implicit) {
      const added = extraAdds.reduce((a, x) => a + x.shares, 0);
      const base = shares - added;
      if (base > EPS) {
        activity.push(lot.source === 'purchase'
          ? { date: lot.date, kind: 'purchase', label: 'Purchase', shares: base, price: lot.price || null, amount: lot.price > 0 ? base * lot.price : null }
          : { date: lot.date, kind: 'firstRecorded', label: 'First recorded here (no purchase history)', shares: base, price: null, amount: null });
      }
      continue;
    }
    const ev = events.find((e) => !claimed.has(e) && e.destination === 'drip' && lotMatches(lot, e));
    if (ev) claimed.add(ev);
    const reinvested = lot.source === 'drip' || Boolean(ev);
    activity.push({
      date: lot.date,
      kind: reinvested ? 'reinvest' : (lot.source === 'purchase' ? 'purchase' : 'added'),
      label: reinvested ? `${ev ? typeLabel(ev.type) : 'Distribution'} reinvested` : (lot.gone ? 'Purchase (since sold)' : sourceLabel(lot.source)),
      shares,
      price: lot.price || null,
      amount: ev && num(ev.grossAmount) > 0 ? num(ev.grossAmount) : (lot.price > 0 ? shares * lot.price : null),
      duplicateOf: twins.get(lot.key) || null,
    });
  }
  for (const ev of events) {
    if (claimed.has(ev) || !inPeriod(day(ev.date))) continue;
    if (ev.destination === 'drip' && num(ev.sharesAdded) > 0) {
      activity.push({ date: day(ev.date), kind: 'reinvest', label: `${typeLabel(ev.type)} reinvested`, shares: num(ev.sharesAdded), price: num(ev.navPrice) || null, amount: num(ev.grossAmount) || null });
    } else {
      activity.push({ date: day(ev.date), kind: 'cash', label: `${typeLabel(ev.type)} paid in cash`, shares: 0, price: null, amount: num(ev.grossAmount) });
    }
  }
  for (const sale of sales) {
    if (!inPeriod(day(sale.saleDate))) continue;
    activity.push({ date: day(sale.saleDate), kind: 'sale', label: 'Sale', shares: -num(sale.sharesSold), price: num(sale.salePricePerShare) || null, amount: num(sale.proceeds), realizedGain: Number.isFinite(Number(sale.realizedGainDollars)) ? Number(sale.realizedGainDollars) : null });
  }
  activity.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const opening = position(lots, extraAdds, timeline, dayBefore(period.start));
  const closing = position(lots, extraAdds, timeline, period.end);
  if (opening.shares < EPS && closing.shares < EPS && activity.length === 0) return null;

  const hasLots = Array.isArray(holding?.lots) && holding.lots.length > 0;
  const symbol = holding?.symbol || (sales[0] && sales[0].symbol) || '';
  return {
    key: holding?.id || `closed:${symbol}|${(sales[0] && sales[0].account) || ''}`,
    holdingId: holding?.id || null,
    symbol,
    name: holding?.name || '',
    opening,
    closing,
    activity,
    possibleDuplicates: activity.some((a) => a.duplicateOf),
    // The app holds a share count for it and no dated record of how it got
    // there, so opening and closing are the same number by assumption.
    noHistory: Boolean(holding?.id) && !hasLots && !day(holding.purchaseDate),
    undatedLots: lots.some((l) => !l.implicit && !l.date),
    closed: !holding?.id,
  };
}

const sum = (rows, pick) => rows.reduce((a, r) => a + pick(r), 0);
const kindTotal = (rows, kinds) => sum(rows, (r) => r.activity.filter((a) => kinds.includes(a.kind)).reduce((x, a) => x + (num(a.amount)), 0));

// The report: one entry per account that held anything or saw any activity.
//   account -- 'all' or an account label
//   today   -- 'YYYY-MM-DD', injectable for tests
export function buildReconciliation({ holdings = [], liquidations = [], period, account = 'all', today = localIsoDate() }) {
  const label = (a) => (a || '').trim() || '(no account)';
  const liveIds = new Set(holdings.map((h) => h.id));
  const salesByHolding = new Map();
  const orphans = new Map(); // sales of positions since removed
  for (const sale of (Array.isArray(liquidations) ? liquidations : [])) {
    if (!sale || !day(sale.saleDate)) continue;
    if (sale.holdingId && liveIds.has(sale.holdingId)) {
      if (!salesByHolding.has(sale.holdingId)) salesByHolding.set(sale.holdingId, []);
      salesByHolding.get(sale.holdingId).push(sale);
    } else {
      const key = sale.holdingId || `${sale.symbol}|${label(sale.account)}`;
      if (!orphans.has(key)) orphans.set(key, []);
      orphans.get(key).push(sale);
    }
  }

  const byAccount = new Map();
  const put = (acct, row, meta) => {
    if (account !== 'all' && acct !== account) return;
    if (!byAccount.has(acct)) byAccount.set(acct, { account: acct, institutions: new Set(), taxTreatments: new Set(), rows: [] });
    const entry = byAccount.get(acct);
    if (meta.institution) entry.institutions.add(meta.institution);
    if (meta.taxTreatment) entry.taxTreatments.add(meta.taxTreatment);
    entry.rows.push(row);
  };
  for (const h of holdings) {
    const row = buildRow(h, salesByHolding.get(h.id) || [], period, today);
    if (row) put(label(h.account), row, { institution: (h.institution || '').trim(), taxTreatment: h.taxTreatment });
  }
  for (const sales of orphans.values()) {
    const row = buildRow(null, sales, period, today);
    if (row) put(label(sales[0].account), row, { institution: '', taxTreatment: sales[0].taxTreatment });
  }

  return [...byAccount.values()]
    .sort((a, b) => a.account.localeCompare(b.account))
    .map((entry) => {
      const rows = entry.rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
      const unpriced = rows.filter((r) => (r.opening.shares > EPS && r.opening.value === null) || (r.closing.shares > EPS && r.closing.value === null)).length;
      const openingValue = sum(rows, (r) => num(r.opening.value));
      const closingValue = sum(rows, (r) => num(r.closing.value));
      const purchases = kindTotal(rows, ['purchase', 'added']);
      const reinvested = kindTotal(rows, ['reinvest']);
      const cashDistributions = kindTotal(rows, ['cash']);
      const sales = kindTotal(rows, ['sale']);
      const round = (v) => Math.round(v * 100) / 100;
      return {
        account: entry.account,
        institution: [...entry.institutions].join(', '),
        taxTreatments: [...entry.taxTreatments],
        rows,
        totals: {
          openingValue: round(openingValue),
          purchases: round(purchases),
          reinvested: round(reinvested),
          cashDistributions: round(cashDistributions),
          sales: round(sales),
          // What is left once the money that moved is taken out: price
          // changes, plus anything the app has no record of.
          marketChange: round(closingValue - openingValue - purchases - reinvested + sales),
          closingValue: round(closingValue),
          unpriced,
          activityCount: sum(rows, (r) => r.activity.length),
        },
      };
    });
}

// The "I reconciled this" record lives in reconciliationLog.js (a file with
// no imports, so Backup Everything can read it without pulling the holdings
// model into the app's first download).
export { RECONCILIATION_KEY, CADENCE_FIELD, readReconciliations, markReconciled, unmarkReconciled, sanitizeReconciliations, statementCadences, cadenceOf, statementCovers, setStatementCadence } from './reconciliationLog';
