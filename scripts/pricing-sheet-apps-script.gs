// Google Apps Script for OutlastRetirement's Live Pricing: a script you
// paste into your own copy of the pricing Sheet (Extensions > Apps Script)
// so the app can read prices and dividends for your holdings. Install and
// update steps: https://www.outlastretirement.com/pricing-script
//
// The canonical copy lives in the app's public repository
// (github.com/jabone/outlastretirement, scripts/pricing-sheet-apps-script.gs);
// the app's "Copy the script" button and the page above serve this file.
// It is not part of the app's build and never runs on our servers.
//
// How it works: doGet() is published as a Web App on your own account and
// answers three requests from the app:
//   ?action=quotes        -> the whole Securities table as JSON, read LIVE
//                            from the Sheet (no publish-to-web lag)
//   ?tickers=A,B,C        -> batch-register several tickers in one call
//   ?ticker=A             -> legacy single-ticker registration (kept so an
//                            older app build still works against this script)
// Publishing the Sheet as CSV is an optional FALLBACK read path -- the app
// prefers ?action=quotes when a Web App URL is connected.
// Everything runs on the user's own free Google account -- no shared API
// key, no per-app-owner cost, no shared rate limit across every user, and
// every cache below (CacheService) is private to this script project on
// the user's own account. Only bare ticker symbols are ever sent here.
//
// Ticker validation and the named-sheet lookup below close two gaps an
// earlier draft of this script had: doGet() used to splice the raw ticker
// parameter directly into formula strings with no character whitelist
// (a crafted ticker could have broken out of the quoted string and
// injected an arbitrary formula), and it wrote to getActiveSheet() --
// whatever tab happened to be open in the UI -- rather than a specific
// named tab.
//
// ── v3 freshness model (READ THIS before touching formulas) ─────────────
// Google Sheets recalculates CUSTOM functions (SMART_DIVIDEND, YAHOO_PRICE,
// etc.) only when their arguments change or the Sheet is opened -- the
// File > Settings > Calculation timed setting only drives NOW/TODAY/RAND,
// and GOOGLEFINANCE refreshes on its own (~20 min). So a mutual fund whose
// price comes from the YAHOO_PRICE fallback went stale until the user
// happened to open the Sheet (observed live with FSELX). v3 fixes this
// with a "refresh salt": every custom-function formula takes $L$1 as a
// dummy extra argument, and the REFRESH_QUOTES trigger below bumps $L$1 on
// a schedule -- changing an argument, which forces every salted cell to
// recalculate. Mutual fund NAVs post once daily after the close, so the
// default every-6-hours trigger is already more than the data needs;
// don't be tempted to run it every minute, that just burns Yahoo calls.

// ── v4: a ticker Yahoo only half knows (READ before touching lookups) ───
// A preferred share (DUK-PA) came back with a price, "Ticker not found" in
// Type, and "HTTP Error 404" in both dividend cells. Three separate causes:
//  1. SECURITY_TYPE called every failed response "Ticker not found", so a
//     throttled request (429) read as a bad ticker. Only a 404 says that
//     now; anything else is "Error: Yahoo returned HTTP <code>", after one
//     retry. Both strings are load-bearing -- see SECURITY_TYPE.
//  2. Yahoo's quoteSummary service has no summary for some securities its
//     chart service prices fine (preferreds, some funds). SMART_DIVIDEND
//     now falls back to the payouts the chart service lists for the last
//     12 months, the same history SMART_FREQUENCY already reads.
//  3. SMART_DIVIDEND passed quoteSummary's error TEXT through as if it were
//     the dividend. Only a number is treated as a value now.

// ── Configuration ──────────────────────────────────────────────────
// Reported in every JSON reply. Bump with PRICING_SHEET_SCRIPT_VERSION in
// the app's sheetPricing.js.
var SCRIPT_VERSION = 4;

// Name of the tab that stores ticker data. Must match your Sheet's tab
// name exactly (case-sensitive). If the tab doesn't exist yet, doGet()
// creates it automatically with a header row on first use.
var SHEET_NAME = "Securities";

// The refresh-salt cell (see the freshness model note above). Lives on the
// header row past the data columns so the CSV parser (which reads columns
// A-I and skips row 1) never sees it. K1 is a human-readable label; L1 is
// the timestamp the trigger bumps.
var SALT_LABEL_CELL = "K1";
var SALT_CELL = "L1";
// How the formulas reference the salt. $-anchored so a row copy/paste
// can't drift it.
var SALT_REF = "$L$1";

// How many tickers one batch registration call will accept. Generous --
// the app sends one batch per Refresh with only the symbols missing from
// the Sheet -- while still bounding a single Web App execution.
var MAX_BATCH_TICKERS = 50;

// Cache TTLs (seconds). CacheService is scoped to this script project on
// YOUR Google account -- there is no shared or third-party cache server.
var TTL_PRICE = 1800;      // 30 min -- prices move; mutual fund NAV is daily anyway
var TTL_MODULE = 14400;    // 4 h  -- dividend rate/yield change rarely
var TTL_FREQUENCY = 86400; // 24 h -- payout cadence changes ~never
var TTL_TYPE = 86400;      // 24 h -- security type changes ~never
var TTL_AUTH = 21600;      // 6 h  -- Yahoo cookie+crumb session

// Allowed ticker shapes: plain tickers (AAPL, FXAIX), share classes
// (BRK-B, BF.B), and index tickers (^GSPC). 1-10 core chars, optional
// leading "^", optional "." or "-" suffix of 1-5 chars. Deliberately
// excludes quotes, parens, "=", ";", spaces, etc. so a crafted ticker
// value can't break out of the quoted string inside a formula.
var TICKER_PATTERN = /^\^?[A-Z0-9]{1,10}([.\-][A-Z0-9]{1,5})?$/;

function isValidTicker_(ticker) {
  return TICKER_PATTERN.test(ticker);
}

// ── One-time setup helpers (run these from the Apps Script editor) ─────

/**
 * Run ONCE from the editor (Run > setupRefreshTrigger) after pasting this
 * script: installs the time-driven trigger that keeps custom-function
 * cells fresh without the Sheet being open. Safe to re-run -- it removes
 * any previous trigger for REFRESH_QUOTES before adding the new one.
 * Every 6 hours by default; NAVs post once daily after market close, so
 * this cadence already over-covers the data's real update rate.
 */
function setupRefreshTrigger() {
  removeRefreshTrigger();
  ScriptApp.newTrigger("REFRESH_QUOTES").timeBased().everyHours(6).create();
}

/** Removes the REFRESH_QUOTES trigger(s). Run from the editor if you want
 *  to stop scheduled refreshes entirely. */
function removeRefreshTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "REFRESH_QUOTES") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

/**
 * The scheduled refresh (also safe to run by hand from the editor).
 * 1. Migrates any v2-era rows to salted formulas (one-time per row --
 *    only cells that currently CONTAIN a formula are rewritten, so a cell
 *    you've hand-edited to a static value is left alone).
 * 2. Bumps the salt cell, which forces every salted custom-function cell
 *    to recalculate. GOOGLEFINANCE cells keep their own ~20-min refresh
 *    cycle and are untouched.
 */
function REFRESH_QUOTES() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;
  ensureSaltedFormulas_(sheet);
  sheet.getRange(SALT_LABEL_CELL).setValue("Refreshed");
  sheet.getRange(SALT_CELL).setValue(new Date());
  SpreadsheetApp.flush();
}

// Canonical formula set for one ticker's row, columns B..I. The single
// source of truth used by registration AND the v2->v3 migration, so the
// two can never drift apart.
function rowFormulas_(ticker) {
  return [
    '=SECURITY_TYPE("' + ticker + '", ' + SALT_REF + ')',                                            // B: Type (live formula, self-heals from a transient lookup failure)
    '=IFERROR(GOOGLEFINANCE("' + ticker + '", "price"), YAHOO_PRICE("' + ticker + '", ' + SALT_REF + '))', // C: Price (Yahoo fallback -- GOOGLEFINANCE has known gaps for open-end mutual funds)
    '=IFERROR(GOOGLEFINANCE("' + ticker + '", "change"), "")',                                       // D: Change
    '=IFERROR(GOOGLEFINANCE("' + ticker + '", "changepct"), "")',                                    // E: ChangePct
    '=SMART_FREQUENCY("' + ticker + '", ' + SALT_REF + ')',                                          // F: Payout Freq (calculated from real payout history)
    '=SMART_DIVIDEND("' + ticker + '", "dollar", ' + SALT_REF + ')',                                 // G: Dividend ($)
    '=SMART_DIVIDEND("' + ticker + '", "yield", ' + SALT_REF + ')',                                  // H: Yield (%)
    '="https://finance.yahoo.com/quote/"&"' + ticker + '"',                                          // I: URL
  ];
}

// v2 rows have formulas without the salt argument, which never recalculate
// on a schedule. Rewrite each formula-bearing cell in columns B..H to the
// salted canonical version (I has no custom function; D/E are pure
// GOOGLEFINANCE and get rewritten harmlessly to the same text). Cells with
// NO formula (hand-entered static values) are deliberately skipped.
function ensureSaltedFormulas_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var dataRange = sheet.getRange(2, 1, lastRow - 1, 9); // A..I
  var values = dataRange.getValues();
  var formulas = dataRange.getFormulas();
  for (var r = 0; r < formulas.length; r++) {
    var ticker = (values[r][0] || "").toString().toUpperCase().trim();
    if (!ticker || !isValidTicker_(ticker)) continue;
    var canonical = rowFormulas_(ticker);
    for (var c = 1; c <= 8; c++) { // sheet columns B..I
      var existing = formulas[r][c];
      if (!existing) continue;                      // static value -- leave the user's edit alone
      if (existing.indexOf(SALT_REF) !== -1) continue; // already salted
      var target = canonical[c - 1];
      if (existing === target) continue;            // already canonical (e.g. URL/GOOGLEFINANCE-only columns)
      sheet.getRange(r + 2, c + 1).setFormula(target);
    }
  }
}

// ── Web App entry point ────────────────────────────────────────────

function doGet(e) {
  var p = (e && e.parameter) || {};

  if (p.action === "quotes") return serveQuotes_();
  if (p.tickers) return registerBatch_(p.tickers);

  // Legacy single-ticker path -- same plain-text protocol v2 spoke, so an
  // older app build pointed at this script keeps working unchanged.
  var ticker = p.ticker;
  if (!ticker) return ContentService.createTextOutput("No ticker provided.");

  ticker = ticker.toUpperCase().replace("MUTF:", "").trim();
  if (!isValidTicker_(ticker)) {
    return ContentService.createTextOutput("Invalid ticker format: " + ticker);
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return ContentService.createTextOutput("Busy, try again: " + ticker);
  }
  try {
    var status = registerOne_(getOrCreateSheet_(), ticker);
    return ContentService.createTextOutput(status).setMimeType(ContentService.MimeType.TEXT);
  } finally {
    lock.releaseLock();
  }
}

// The whole Securities table, read live from the Sheet and returned as
// JSON -- the app's preferred read path. Published-CSV reads lag behind
// the live Sheet by Google's ~5-minute republish cadence; this endpoint
// doesn't, which is what lets a Refresh see a just-registered ticker's
// values as soon as its formulas resolve.
function serveQuotes_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  var quotes = {};
  if (sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, 9).getValues(); // A..I
      for (var i = 0; i < values.length; i++) {
        var symbol = (values[i][0] || "").toString().toUpperCase().trim();
        if (!symbol) continue;
        quotes[symbol] = {
          type: values[i][1],
          price: values[i][2],
          change: values[i][3],
          changePct: values[i][4],
          payoutFreq: values[i][5],
          dividend: values[i][6],
          yield: values[i][7],
          url: values[i][8],
        };
      }
    }
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, version: SCRIPT_VERSION, quotes: quotes }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Batch registration: one Web App call, one lock, one sheet read for the
// whole list -- replaces the app calling the single-ticker path once per
// symbol (each call is a fresh Apps Script cold start, so ten new symbols
// used to cost ten cold starts plus stagger delays). Returns per-ticker
// statuses as JSON so the app can tell "registered", "already there",
// and "rejected" apart instead of assuming every HTTP 200 succeeded.
function registerBatch_(tickersParam) {
  var results = {};
  var raw = tickersParam.split(",");
  if (raw.length > MAX_BATCH_TICKERS) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, version: SCRIPT_VERSION, error: "Too many tickers in one call (max " + MAX_BATCH_TICKERS + ")" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, version: SCRIPT_VERSION, error: "Busy, try again" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  try {
    var sheet = getOrCreateSheet_();
    for (var i = 0; i < raw.length; i++) {
      var ticker = raw[i].toUpperCase().replace("MUTF:", "").trim();
      if (!ticker) continue;
      if (!isValidTicker_(ticker)) {
        results[ticker] = "Invalid";
        continue;
      }
      results[ticker] = registerOne_(sheet, ticker);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, version: SCRIPT_VERSION, results: results }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    // First run against a fresh copy of the template: create the tab with
    // headers instead of silently writing to whatever tab happens to be
    // open.
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["Ticker", "Type", "Price", "Change", "ChangePct",
                      "PayoutFreq", "Dividend", "Yield", "URL"]);
    sheet.getRange(SALT_LABEL_CELL).setValue("Refreshed");
    sheet.getRange(SALT_CELL).setValue(new Date());
  }
  return sheet;
}

// Appends one ticker's formula row if it isn't present. Caller must hold
// the script lock. Returns "Success" or "Exists".
function registerOne_(sheet, ticker) {
  var data = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().toUpperCase() === ticker) {
      return "Exists";
    }
  }
  // We split the Dividend and Yield into two separate columns!
  sheet.appendRow([ticker].concat(rowFormulas_(ticker)));
  return "Success";
}

// ── Yahoo Finance lookups (cached) ─────────────────────────────────
//
// All caches below are CacheService.getScriptCache() -- storage private to
// this script project on the user's own Google account, NOT any shared or
// third-party server. Caching matters because Sheets recalculates BOTH
// SMART_DIVIDEND cells (dollar + yield) independently, and each used to
// re-fetch the same Yahoo module -- with the scheduled REFRESH_QUOTES
// bumping recalculation several times a day, uncached lookups would
// multiply Yahoo traffic for data (dividend rates, payout cadence) that
// barely changes week to week. Only SUCCESSFUL lookups are cached; error
// responses always retry live.

// One request to Yahoo's chart service (no cookie or crumb needed), shared
// by every lookup below. Returns { code, json }: json is the parsed body on
// a 200 and null otherwise. A 404 is Yahoo saying it does not know the
// ticker and is final; any other failure (throttling, a hiccup) is retried
// once after a short pause, because a row's cells all recalculate together
// and the burst is what gets throttled.
function fetchChart_(cleanTicker, query) {
  var url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(cleanTicker) + "?" + query;
  var options = {
    "muteHttpExceptions": true,
    "headers": { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  };
  var code = 0;
  for (var attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) Utilities.sleep(1500);
    var response = UrlFetchApp.fetch(url, options);
    code = response.getResponseCode();
    if (code === 200) return { code: 200, json: JSON.parse(response.getContentText()) };
    if (code === 404) break;
  }
  return { code: code, json: null };
}

// The dividends actually paid over the last 12 months, added up, or null
// when Yahoo lists none (or the lookup failed). The fallback for a security
// quoteSummary has no summary for -- see the v4 note at the top. For a
// fixed-rate preferred this IS the annual dividend; for anything else it is
// what was paid, not a forecast.
function trailingDividends_(cleanTicker) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("ttm_" + cleanTicker);
  if (cached !== null) {
    var num = parseFloat(cached);
    return isNaN(num) ? null : num;
  }
  try {
    var chart = fetchChart_(cleanTicker, "events=div&interval=1d&range=1y");
    if (chart.code !== 200) return null;
    var result = chart.json.chart && chart.json.chart.result && chart.json.chart.result[0];
    var divs = result && result.events && result.events.dividends;
    if (!divs) return null;
    var total = 0;
    var keys = Object.keys(divs);
    for (var i = 0; i < keys.length; i++) {
      var amount = divs[keys[i]].amount;
      if (typeof amount === "number") total += amount;
    }
    if (!(total > 0)) return null;
    total = Math.round(total * 10000) / 10000;
    cache.put("ttm_" + cleanTicker, String(total), TTL_MODULE);
    return total;
  } catch (e) {
    return null;
  }
}

/**
 * Deduces dividend payout frequency by counting actual payouts over the last 12 months.
 * The trailing _salt argument is unused -- it exists so the REFRESH_QUOTES
 * trigger can force recalculation by changing it (see the freshness model
 * note at the top).
 *
 * @customfunction
 */
function SMART_FREQUENCY(ticker, _salt) {
  if (!ticker) return "N/A";
  var cleanTicker = ticker.toString().replace("MUTF:", "").trim().toUpperCase();

  var cache = CacheService.getScriptCache();
  var cached = cache.get("freq_" + cleanTicker);
  if (cached) return cached;

  // Look at the chart API for the last 1 year of dividend events (interval=1d prevents Yahoo from aggregating weekly dividends)
  try {
    var chart = fetchChart_(cleanTicker, "events=div&interval=1d&range=1y");
    if (chart.code !== 200) return "N/A";

    var json = chart.json;
    var label;
    if (!json.chart || !json.chart.result || !json.chart.result[0].events || !json.chart.result[0].events.dividends) {
      // If Yahoo explicitly has no dividend history, check if it's yielding anything
      var yld = YAHOO_FINANCE(cleanTicker, "summaryDetail", "yield") || YAHOO_FINANCE(cleanTicker, "summaryDetail", "dividendYield");
      // Only a real yield counts; an error string from the summary lookup
      // used to count as one, and "Unknown" was then cached for a day.
      label = (typeof yld === "number" && yld > 0) ? "Unknown" : "None";
      cache.put("freq_" + cleanTicker, label, TTL_FREQUENCY);
      return label;
    }

    // Sort historical dividends chronologically
    var divs = json.chart.result[0].events.dividends;
    var keys = Object.keys(divs).sort(function(a, b) { return a - b; });
    var count = keys.length;
    if (count === 0) return "None";

    var dates = [];
    for (var i = 0; i < keys.length; i++) dates.push(new Date(keys[i] * 1000));
    var lastDate = dates[dates.length - 1];

    var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var dayNames = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

    if (count >= 48 && count <= 54) {
      label = "Weekly (" + dayNames[lastDate.getDay()] + ")";
    } else if (count >= 11 && count <= 13) {
      var avgDay = 0;
      for (var d = 0; d < dates.length; d++) avgDay += dates[d].getDate();
      avgDay = Math.round(avgDay / dates.length);
      var timing = "Late-Month";
      if (avgDay <= 10) timing = "Early-Month";
      else if (avgDay <= 20) timing = "Mid-Month";
      label = "Monthly (" + timing + ")";
    } else if (count >= 3 && count <= 5) {
      var recent = dates.slice(Math.max(dates.length - 4, 0));
      recent.sort(function(a, b) { return a.getMonth() - b.getMonth(); });
      var qMonths = [];
      for (var q = 0; q < recent.length; q++) {
        var m = monthNames[recent[q].getMonth()];
        if (qMonths.indexOf(m) === -1) qMonths.push(m);
      }
      label = "Quarterly (" + qMonths.join("/") + ")";
    } else if (count === 2) {
      var m1 = monthNames[dates[0].getMonth()];
      var m2 = monthNames[dates[1].getMonth()];
      label = "Semi-Annually (" + m1 + "/" + m2 + ")";
    } else if (count === 1) {
      label = "Annually (" + monthNames[lastDate.getMonth()] + ")";
    } else {
      label = count + "x / Year";
    }

    cache.put("freq_" + cleanTicker, label, TTL_FREQUENCY);
    return label;

  } catch (e) {
    return "N/A";
  }
}

/**
 * Automatically hunts down the correct dividend or yield field in Yahoo Finance.
 * Derives missing values using Live Price. The trailing _salt argument is
 * unused -- see SMART_FREQUENCY.
 *
 * @customfunction
 */
function SMART_DIVIDEND(ticker, requestType, _salt) {
  if (!ticker) return "N/A";

  // 1. Fetch the raw rate (Dollars) and raw yield (Percentage). These go
  // through the cached YAHOO_FINANCE wrapper, so the dollar cell and the
  // yield cell -- which need the same summaryDetail fields -- share one
  // real fetch instead of each redoing it.
  // Only a NUMBER is a value. Everything else YAHOO_FINANCE returns is one
  // of: "N/A" (the summary has no such field), a no-summary answer
  // ("HTTP Error 404" / "Ticker not found" -- Yahoo has no summary for this
  // security at all), or a passing failure ("Error: ...", another HTTP code).
  var num = function(v) { return typeof v === "number" ? v : null; };
  var noSummary = function(v) { return v === "HTTP Error 404" || v === "Ticker not found"; };
  var failure = function(v) { return typeof v === "string" && v !== "N/A" && v !== "" && !noSummary(v); };

  var rawRate = YAHOO_FINANCE(ticker, "summaryDetail", "dividendRate");
  var rate = num(rawRate);
  var rawYld = YAHOO_FINANCE(ticker, "summaryDetail", "dividendYield");
  var yld = num(rawYld);
  // With no summary at all, the other fields are not there either: don't
  // spend two more requests asking.
  if (yld === null && !noSummary(rawYld)) yld = num(YAHOO_FINANCE(ticker, "summaryDetail", "yield"));
  if (yld === null && !noSummary(rawYld)) yld = num(YAHOO_FINANCE(ticker, "defaultKeyStatistics", "yield"));

  if (rate === null && yld === null) {
    // A passing failure is reported as it always was, so the cell says what
    // went wrong and the next refresh retries.
    if (failure(rawRate)) return rawRate;
    if (failure(rawYld)) return rawYld;
    // No summary for this security: use what it actually paid.
    if (noSummary(rawRate) || noSummary(rawYld)) {
      var cleanTicker = ticker.toString().replace("MUTF:", "").trim().toUpperCase();
      rate = trailingDividends_(cleanTicker);
    }
  }
  // 2. Return the requested format, deriving it mathematically if it's missing!
  if (requestType === "dollar") {
    if (rate !== null) return rate; // We have the exact dollar amount
    if (yld !== null) {
      // Derive: Dollar = Yield * Price
      var price = YAHOO_PRICE(ticker);
      if (typeof price === "number") return yld * price;
    }
    return "N/A";
  }
  if (requestType === "yield") {
    if (yld !== null) return yld; // We have the exact percentage
    if (rate !== null) {
      // Derive: Yield = Dollar / Price
      var price2 = YAHOO_PRICE(ticker);
      if (typeof price2 === "number" && price2 > 0) return rate / price2;
    }
    return "N/A";
  }
  return "N/A";
}

/**
 * Detects whether a ticker is a Stock, ETF, Mutual Fund, Crypto, or Index.
 * The trailing _salt argument is unused -- see SMART_FREQUENCY.
 *
 * NOTE: the "Ticker not found" / "Error: ..." return strings are load-
 * bearing -- the app's getSheetSyncStatus (sheetPricing.js) classifies
 * per-symbol badges off exactly these strings. Don't reword them.
 * "Ticker not found" is returned ONLY for a 404 (v4).
 */
function SECURITY_TYPE(ticker, _salt) {
  if (!ticker) return "";

  var cleanTicker = ticker.toString().replace("MUTF:", "").trim().toUpperCase();

  var cache = CacheService.getScriptCache();
  var cachedType = cache.get("type_" + cleanTicker);
  if (cachedType) return cachedType;
  try {
    var chart = fetchChart_(cleanTicker, "interval=1d&range=1d");
    // Only a 404 means Yahoo does not know the ticker. Anything else is a
    // failed request, and saying "not found" for it sent people hunting for
    // a typo that was not there.
    if (chart.code === 404) return "Ticker not found";
    if (chart.code !== 200) return "Error: Yahoo returned HTTP " + chart.code;
    var json = chart.json;
    if (!json.chart || !json.chart.result || json.chart.result.length === 0) return "Unknown";
    var rawType = json.chart.result[0].meta.instrumentType || "";
    var formattedType = "Unknown";
    switch (rawType.toUpperCase()) {
      case "EQUITY": formattedType = "Stock"; break;
      case "ETF": formattedType = "ETF"; break;
      case "MUTUALFUND": formattedType = "Mutual Fund"; break;
      case "INDEX": formattedType = "Index"; break;
      case "CRYPTOCURRENCY": formattedType = "Crypto"; break;
      case "CURRENCY": formattedType = "Currency / Forex"; break;
      case "FUTURE": formattedType = "Futures"; break;
      default: formattedType = rawType || "Unknown";
    }
    cache.put("type_" + cleanTicker, formattedType, TTL_TYPE);
    return formattedType;
  } catch (e) {
    return "Error: " + e.message;
  }
}

/**
 * Custom function to fetch Yahoo Finance statistics. Successful lookups
 * are cached (module data for 4 h) so repeated recalculations don't
 * re-hit Yahoo for data that barely changes; failures are never cached.
 */
function YAHOO_FINANCE(ticker, moduleName, dataPoint) {
  if (!ticker || !moduleName || !dataPoint) return "Missing parameters";

  var cleanTicker0 = ticker.toString().replace("MUTF:", "").trim().toUpperCase();
  var cache = CacheService.getScriptCache();
  var cacheKey = "yf_" + cleanTicker0 + "_" + moduleName + "_" + dataPoint;
  var cached = cache.get(cacheKey);
  if (cached !== null) {
    try { return JSON.parse(cached).v; } catch (ignored) { /* fall through to live fetch */ }
  }

  try {
    var auth = getYahooAuth_();
    if (!auth || !auth.crumb) return "Error: Yahoo auth failed";
    var cleanTicker = ticker.toString().replace("MUTF:", "").trim();
    var url = "https://query1.finance.yahoo.com/v10/finance/quoteSummary/" +
              encodeURIComponent(cleanTicker) +
              "?modules=" + encodeURIComponent(moduleName) +
              "&crumb=" + encodeURIComponent(auth.crumb);
    var options = {
      "method": "get",
      "muteHttpExceptions": true,
      "headers": {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Cookie": auth.cookie
      }
    };
    var response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      // A 404 is about the ticker (no summary for it), not the session;
      // dropping the session for it made every later lookup sign in again.
      if (response.getResponseCode() !== 404) CacheService.getScriptCache().remove("yahoo_auth");
      return "HTTP Error " + response.getResponseCode();
    }
    var json = JSON.parse(response.getContentText());
    if (!json.quoteSummary || !json.quoteSummary.result || json.quoteSummary.result.length === 0) {
      return "Ticker not found";
    }
    var moduleObj = json.quoteSummary.result[0][moduleName];
    if (!moduleObj || moduleObj[dataPoint] === undefined) {
      return "N/A";
    }
    var result = moduleObj[dataPoint];

    // Yahoo sometimes returns empty objects {} for missing data
    if (result && typeof result === "object") {
      if (Object.keys(result).length === 0) return "N/A";

      if (dataPoint.toLowerCase().includes("date") && result.raw) {
        result = result.fmt || new Date(result.raw * 1000).toISOString().split("T")[0];
      } else if (result.raw !== undefined) {
        result = result.raw;
      }
    }

    // Cache only real values -- numbers and non-error strings. "N/A" is a
    // real (negative) answer worth caching too, so a no-dividend stock
    // doesn't re-fetch its empty summaryDetail on every recalculation.
    if (typeof result === "number" || (typeof result === "string" && result.indexOf("Error") === -1 && result.indexOf("HTTP") === -1)) {
      cache.put(cacheKey, JSON.stringify({ v: result }), TTL_MODULE);
    }
    return result;
  } catch (err) {
    return "Error: " + err.message;
  }
}

/**
 * Price fallback for tickers GOOGLEFINANCE can't resolve (e.g. many
 * open-end mutual funds). v3: reads Yahoo's v8 chart endpoint, which
 * needs no cookie/crumb session at all (same endpoint SECURITY_TYPE
 * already uses) -- one less fragile moving part than the old
 * quoteSummary+crumb flow -- and caches the price for 30 minutes.
 * Returns a plain number so IFERROR(...) in the Price column formula can
 * use it as a drop-in second argument; returns "" (blank cell, not an
 * error string) for anything Yahoo couldn't resolve, so a bad lookup
 * never gets treated as a price. The trailing _salt argument is unused --
 * see SMART_FREQUENCY.
 *
 * @customfunction
 */
function YAHOO_PRICE(ticker, _salt) {
  if (!ticker) return "";
  var cleanTicker = ticker.toString().replace("MUTF:", "").trim().toUpperCase();

  var cache = CacheService.getScriptCache();
  var cached = cache.get("price_" + cleanTicker);
  if (cached !== null) {
    var num = parseFloat(cached);
    if (!isNaN(num)) return num;
  }

  try {
    var chart = fetchChart_(cleanTicker, "interval=1d&range=1d");
    if (chart.code !== 200) return "";
    var json = chart.json;
    var meta = json.chart && json.chart.result && json.chart.result[0] && json.chart.result[0].meta;
    var price = meta && meta.regularMarketPrice;
    if (typeof price !== "number") return "";
    cache.put("price_" + cleanTicker, String(price), TTL_PRICE);
    return price;
  } catch (e) {
    return "";
  }
}

/**
 * Session auth token helper for Yahoo Finance (still used by
 * YAHOO_FINANCE's quoteSummary lookups -- dividend rate/yield).
 */
function getYahooAuth_() {
  var cache = CacheService.getScriptCache();
  var cachedAuth = cache.get("yahoo_auth");
  if (cachedAuth) return JSON.parse(cachedAuth);
  var userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
  var init = UrlFetchApp.fetch("https://fc.yahoo.com", { "muteHttpExceptions": true, "headers": { "User-Agent": userAgent } });
  var rawCookie = init.getAllHeaders()["Set-Cookie"] || init.getAllHeaders()["set-cookie"];
  var cookieStr = Array.isArray(rawCookie) ? rawCookie.map(function(c) { return c.split(";")[0]; }).join("; ") : (rawCookie ? rawCookie.split(";")[0] : "");
  var crumbResp = UrlFetchApp.fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    "muteHttpExceptions": true,
    "headers": { "User-Agent": userAgent, "Cookie": cookieStr }
  });
  var crumb = crumbResp.getContentText();
  if (!crumb || crumb.length > 50 || crumb.indexOf("<") !== -1) return null;
  var authObj = { cookie: cookieStr, crumb: crumb };
  cache.put("yahoo_auth", JSON.stringify(authObj), TTL_AUTH);
  return authObj;
}
