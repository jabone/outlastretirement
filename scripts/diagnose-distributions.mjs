#!/usr/bin/env node
// Diagnostic script -- NOT part of the shipped app. Hits Massive's and
// EODHD's real endpoints for one symbol and prints exactly what each
// provider returns about dividends / distributions, side by side, so you
// can see with real data (not vendor marketing copy) what's actually
// available: which fields exist, whether history goes back far enough,
// and whether "upcoming" data has any real detail or is just bare dates.
//
// Run it yourself (never paste real API keys into chat if you'd rather
// not -- this only needs to run on your machine):
//
//   MASSIVE_API_KEY=xxx EODHD_API_KEY=yyy node diagnose-distributions.mjs FSELX
//   MASSIVE_API_KEY=xxx EODHD_API_KEY=yyy node diagnose-distributions.mjs AAPL
//
// Or pass keys as flags instead of env vars:
//   node diagnose-distributions.mjs AAPL --massive-key=xxx --eodhd-key=yyy
//
// Symbol defaults to AAPL if omitted. Pass --eodhd-exchange=US to change
// the EODHD exchange suffix (default US) -- irrelevant for US tickers,
// matters if you try a non-US symbol.
//
// This deliberately makes real network calls and does NOT go through
// api/quote.js's proxy/caching/JWT-gating -- it's a standalone probe, not
// a code path the shipped app ever runs.

function arg(name, fallback) {
  const flag = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(flag));
  return found ? found.slice(flag.length) : fallback;
}

const symbol = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : arg('symbol', 'AAPL')).toUpperCase();
const eodhdExchange = arg('eodhd-exchange', 'US');
const massiveKey = arg('massive-key', process.env.MASSIVE_API_KEY);
const eodhdKey = arg('eodhd-key', process.env.EODHD_API_KEY);

const eodhdSymbol = `${symbol}.${eodhdExchange}`;

const today = new Date();
const toDate = (d) => d.toISOString().slice(0, 10);
const fiveYearsAgo = new Date(today);
fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
const oneYearFromNow = new Date(today);
oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

function section(title) {
  console.log('\n' + '='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}

async function probe(label, url, { skip } = {}) {
  console.log(`\n--- ${label} ---`);
  console.log(url.replace(/(apiKey|api_token)=[^&]+/, '$1=***'));
  if (skip) {
    console.log(`SKIPPED: ${skip}`);
    return null;
  }
  try {
    const res = await fetch(url);
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    console.log(`HTTP ${res.status}`);
    console.log(JSON.stringify(body, null, 2).slice(0, 4000));
    return body;
  } catch (err) {
    console.log(`FETCH ERROR: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log(`Diagnosing distribution data for ${symbol} (EODHD as ${eodhdSymbol})`);
  console.log(`Massive key: ${massiveKey ? 'provided' : 'MISSING'}  |  EODHD key: ${eodhdKey ? 'provided' : 'MISSING'}`);

  section('MASSIVE');

  await probe(
    'Dividends (cash dividends, historical)',
    `https://api.massive.com/stocks/v1/dividends?ticker=${encodeURIComponent(symbol)}&limit=20&sort=ex_dividend_date.desc&apiKey=${massiveKey || 'MISSING'}`,
    { skip: massiveKey ? undefined : 'set MASSIVE_API_KEY or --massive-key' }
  );

  await probe(
    'Splits (includes stock_dividend classification, distinct from cash dividends)',
    `https://api.massive.com/stocks/v1/splits?ticker=${encodeURIComponent(symbol)}&limit=10&apiKey=${massiveKey || 'MISSING'}`,
    { skip: massiveKey ? undefined : 'set MASSIVE_API_KEY or --massive-key' }
  );

  console.log(
    '\nNote: Massive has no mutual-fund coverage (confirmed separately -- funds don\'t\n' +
      'trade on an exchange tape). If SYMBOL is a fund, expect an empty results array\n' +
      'above even with a valid key. Also: Massive\'s dividend record has no field that\n' +
      'distinguishes a capital-gains distribution from an ordinary dividend -- its\n' +
      'type classification is about payment *pattern* (recurring/special/etc), not\n' +
      'tax character.'
  );

  section('EODHD');

  await probe(
    'Corporate Actions: Dividends History (amount + ex-date always; declaration/record/pay only for major US tickers, JSON only)',
    `https://eodhd.com/api/div/${encodeURIComponent(eodhdSymbol)}?from=${toDate(fiveYearsAgo)}&to=${toDate(oneYearFromNow)}&api_token=${eodhdKey || 'MISSING'}&fmt=json`,
    { skip: eodhdKey ? undefined : 'set EODHD_API_KEY or --eodhd-key' }
  );

  await probe(
    'Calendar: Upcoming/Historical Dividend DATES ONLY (no amount, no declaration/ex/record/pay breakdown -- just date+symbol)',
    `https://eodhd.com/api/calendar/dividends?filter[symbol]=${encodeURIComponent(eodhdSymbol)}&filter[date_from]=${toDate(today)}&filter[date_to]=${toDate(oneYearFromNow)}&api_token=${eodhdKey || 'MISSING'}&fmt=json`,
    { skip: eodhdKey ? undefined : 'set EODHD_API_KEY or --eodhd-key' }
  );

  await probe(
    'Fundamentals: SplitsDividends section (stocks/ETFs only -- forward rate/yield, next ex-date, NOT a distribution history)',
    `https://eodhd.com/api/v1.1/fundamentals/${encodeURIComponent(eodhdSymbol)}?filter=SplitsDividends,General::Type&api_token=${eodhdKey || 'MISSING'}&fmt=json`,
    { skip: eodhdKey ? undefined : 'set EODHD_API_KEY or --eodhd-key' }
  );

  await probe(
    'Fundamentals: MutualFund_Data section (funds only -- NAV/yield/expense ratio, NOT a distribution history either)',
    `https://eodhd.com/api/v1.1/fundamentals/${encodeURIComponent(eodhdSymbol)}?filter=MutualFund_Data,General::Type&api_token=${eodhdKey || 'MISSING'}&fmt=json`,
    { skip: eodhdKey ? undefined : 'set EODHD_API_KEY or --eodhd-key' }
  );

  console.log(
    '\nNote: EODHD, like Massive, has no field anywhere in these responses that tags\n' +
      'a distribution as "capital gain" vs "ordinary dividend". For a fund that pays\n' +
      'both on the same ex-date, /api/div returns whatever cash "value" was recorded\n' +
      '-- you cannot tell from the API alone whether that\'s pure income, pure cap\n' +
      'gain, or a blend of both.'
  );

  console.log('\nDone. Try re-running with a mutual fund ticker (e.g. FSELX) vs a plain stock (e.g. AAPL) to compare coverage.');
}

main();
