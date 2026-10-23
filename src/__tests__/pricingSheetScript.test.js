// The pricing Sheet's Apps Script (scripts/pricing-sheet-apps-script.gs)
// runs in Google's servers, not here, so it had no tests. This loads the
// real file with stand-ins for the three Google services it touches and a
// scripted Yahoo, to pin the version 4 behavior:
//
//   * only a 404 is "Ticker not found"; a throttled request is an error,
//     retried once (the owner, 2026-10-05: a preferred share Yahoo was pricing
//     showed "Ticker not found")
//   * a security with no quoteSummary data takes its dividend from the
//     payouts of the last 12 months
//   * an error's text is never returned as the dividend
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PRICING_SHEET_SCRIPT_VERSION, PRICING_SHEET_SCRIPT_CHANGELOG } from '../utils/pricingSource';

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'pricing-sheet-apps-script.gs'), 'utf8');

// `routes` maps a URL fragment to a reply, or to a list of replies used in
// order (the last one repeats). A reply is [code, body].
function load(routes) {
  const calls = [];
  const store = new Map();
  const seen = new Map();
  const UrlFetchApp = {
    fetch(url) {
      calls.push(url);
      if (url.includes('fc.yahoo.com')) return { getAllHeaders: () => ({ 'Set-Cookie': 'A=1; path=/' }), getResponseCode: () => 200, getContentText: () => '' };
      if (url.includes('getcrumb')) return { getResponseCode: () => 200, getContentText: () => 'crumb123' };
      const key = Object.keys(routes).find((k) => url.includes(k));
      let reply = key ? routes[key] : [404, {}];
      if (Array.isArray(reply[0])) {
        const n = seen.get(key) || 0;
        seen.set(key, n + 1);
        reply = reply[Math.min(n, reply.length - 1)];
      }
      return { getResponseCode: () => reply[0], getContentText: () => JSON.stringify(reply[1]), getAllHeaders: () => ({}) };
    },
  };
  const CacheService = { getScriptCache: () => ({ get: (k) => (store.has(k) ? store.get(k) : null), put: (k, v) => store.set(k, v), remove: (k) => store.delete(k) }) };
  const Utilities = { sleep: () => {} };
  const api = new Function('UrlFetchApp', 'CacheService', 'Utilities',
    `${SOURCE}\nreturn { SECURITY_TYPE, SMART_DIVIDEND, SMART_FREQUENCY, YAHOO_PRICE, YAHOO_FINANCE, SCRIPT_VERSION };`)(UrlFetchApp, CacheService, Utilities);
  return { ...api, calls, store };
}

const chart = (meta, dividends) => ({ chart: { result: [{ meta, ...(dividends ? { events: { dividends } } : {}) }] } });
const summary = (detail) => ({ quoteSummary: { result: [{ summaryDetail: detail }] } });
const QUARTERLY = { 1: { amount: 0.359375 }, 2: { amount: 0.359375 }, 3: { amount: 0.359375 }, 4: { amount: 0.359375 } };

describe('pricing Sheet script: version', () => {
  it('reports the version the app expects, and the app documents it', () => {
    expect(load({}).SCRIPT_VERSION).toBe(PRICING_SHEET_SCRIPT_VERSION);
    expect(PRICING_SHEET_SCRIPT_CHANGELOG[0].version).toBe(PRICING_SHEET_SCRIPT_VERSION);
    expect(SOURCE).not.toMatch(/version: \d/);
  });
});

describe('pricing Sheet script: SECURITY_TYPE', () => {
  it('reads the type from the chart service and caches it', () => {
    const s = load({ '/chart/DUK-PA': [200, chart({ instrumentType: 'EQUITY' })] });
    expect(s.SECURITY_TYPE('DUK-PA')).toBe('Stock');
    expect(s.SECURITY_TYPE('DUK-PA')).toBe('Stock');
    expect(s.calls).toHaveLength(1);
  });

  it('says "Ticker not found" only for a 404, without retrying', () => {
    const s = load({ '/chart/NOPE': [404, {}] });
    expect(s.SECURITY_TYPE('NOPE')).toBe('Ticker not found');
    expect(s.calls).toHaveLength(1);
  });

  it('retries a throttled request once and succeeds', () => {
    const s = load({ '/chart/DUK-PA': [[429, {}], [200, chart({ instrumentType: 'EQUITY' })]] });
    expect(s.SECURITY_TYPE('DUK-PA')).toBe('Stock');
    expect(s.calls).toHaveLength(2);
  });

  it('reports a request that keeps failing as an error, not as a bad ticker, and does not cache it', () => {
    const s = load({ '/chart/DUK-PA': [429, {}] });
    expect(s.SECURITY_TYPE('DUK-PA')).toBe('Error: Yahoo returned HTTP 429');
    expect(s.calls).toHaveLength(2);
    expect([...s.store.keys()]).toEqual([]);
  });
});

describe('pricing Sheet script: SMART_DIVIDEND', () => {
  it('uses the summary rate and yield when Yahoo has them', () => {
    const s = load({ quoteSummary: [200, summary({ dividendRate: { raw: 3.97 }, dividendYield: { raw: 0.0105 } })] });
    expect(s.SMART_DIVIDEND('VFFSX', 'dollar')).toBe(3.97);
    expect(s.SMART_DIVIDEND('VFFSX', 'yield')).toBe(0.0105);
  });

  it('with no summary for the security, adds up the last 12 months of payouts', () => {
    const s = load({
      quoteSummary: [404, {}],
      'events=div': [200, chart({ regularMarketPrice: 21.59 }, QUARTERLY)],
      'range=1d': [200, chart({ regularMarketPrice: 21.59 })],
    });
    expect(s.SMART_DIVIDEND('DUK-PA', 'dollar')).toBe(1.4375);
    expect(s.SMART_DIVIDEND('DUK-PA', 'yield')).toBeCloseTo(1.4375 / 21.59, 10);
  });

  it('with no summary and no payouts, says N/A rather than an error text', () => {
    const s = load({ quoteSummary: [404, {}], 'events=div': [200, chart({ regularMarketPrice: 10 })] });
    expect(s.SMART_DIVIDEND('ZERO', 'dollar')).toBe('N/A');
    expect(s.SMART_DIVIDEND('ZERO', 'yield')).toBe('N/A');
  });

  it('does not ask for more summary fields once Yahoo has said it has no summary', () => {
    const s = load({ quoteSummary: [404, {}], 'events=div': [200, chart({}, QUARTERLY)] });
    s.SMART_DIVIDEND('DUK-PA', 'dollar');
    expect(s.calls.filter((u) => u.includes('quoteSummary'))).toHaveLength(2);
  });

  it('a passing failure is shown as the failure, and payouts are not substituted for it', () => {
    const s = load({ quoteSummary: [500, {}], 'events=div': [200, chart({}, QUARTERLY)] });
    expect(s.SMART_DIVIDEND('AAPL', 'dollar')).toBe('HTTP Error 500');
    expect(s.calls.some((u) => u.includes('events=div'))).toBe(false);
  });

  it('a stock that pays nothing still reads N/A', () => {
    const s = load({ quoteSummary: [200, summary({})] });
    expect(s.SMART_DIVIDEND('BRK-B', 'dollar')).toBe('N/A');
  });

  it('keeps the Yahoo session after a 404, and drops it after any other failure', () => {
    const kept = load({ quoteSummary: [404, {}] });
    kept.YAHOO_FINANCE('DUK-PA', 'summaryDetail', 'dividendRate');
    expect(kept.store.has('yahoo_auth')).toBe(true);
    const dropped = load({ quoteSummary: [401, {}] });
    dropped.YAHOO_FINANCE('DUK-PA', 'summaryDetail', 'dividendRate');
    expect(dropped.store.has('yahoo_auth')).toBe(false);
  });
});

describe('pricing Sheet script: SMART_FREQUENCY and YAHOO_PRICE', () => {
  it('counts four payouts as quarterly', () => {
    const s = load({ 'events=div': [200, chart({}, { 1773619200: { amount: 0.36 }, 1781568000: { amount: 0.36 }, 1789516800: { amount: 0.36 }, 1797379200: { amount: 0.36 } })] });
    expect(s.SMART_FREQUENCY('DUK-PA')).toMatch(/^Quarterly \(/);
  });

  it('with no payouts and no summary, says None rather than taking an error text for a yield', () => {
    const s = load({ 'events=div': [200, chart({})], quoteSummary: [404, {}] });
    expect(s.SMART_FREQUENCY('ZERO')).toBe('None');
  });

  it('YAHOO_PRICE returns a number, or blank when Yahoo has none', () => {
    expect(load({ '/chart/DUK-PA': [200, chart({ regularMarketPrice: 21.59 })] }).YAHOO_PRICE('DUK-PA')).toBe(21.59);
    expect(load({ '/chart/NOPE': [404, {}] }).YAHOO_PRICE('NOPE')).toBe('');
  });
});

// Version 5: a copied Sheet has no triggers, so the script adds its own
// six-hour refresh the first time the app calls it.
describe('pricing Sheet script: the refresh schedule sets itself up', () => {
  function loadWithTriggers(existing = [], { fail = false } = {}) {
    const store = new Map();
    const triggers = existing.map((h) => ({ getHandlerFunction: () => h }));
    const created = [];
    let lookups = 0;
    const ScriptApp = {
      getProjectTriggers() { lookups += 1; if (fail) throw new Error('no permission'); return triggers; },
      newTrigger(h) {
        const t = { h };
        const chain = { timeBased: () => chain, everyHours: (n) => { t.hours = n; return chain; }, create: () => { created.push(t); triggers.push({ getHandlerFunction: () => h }); } };
        return chain;
      },
      deleteTrigger() {},
    };
    const CacheService = { getScriptCache: () => ({ get: (k) => (store.has(k) ? store.get(k) : null), put: (k, v) => store.set(k, v), remove: (k) => store.delete(k) }) };
    const api = new Function('ScriptApp', 'CacheService', 'UrlFetchApp', 'Utilities',
      `${SOURCE}\nreturn { ensureRefreshTrigger_ };`)(ScriptApp, CacheService, {}, { sleep: () => {} });
    return { ...api, created, lookups: () => lookups, store };
  }

  it('adds a six-hour REFRESH_QUOTES trigger when there is none', () => {
    const s = loadWithTriggers();
    s.ensureRefreshTrigger_();
    expect(s.created).toEqual([{ h: 'REFRESH_QUOTES', hours: 6 }]);
  });

  it('leaves an existing trigger alone, and checks at most once per six hours', () => {
    const s = loadWithTriggers(['REFRESH_QUOTES']);
    s.ensureRefreshTrigger_();
    s.ensureRefreshTrigger_();
    expect(s.created).toEqual([]);
    expect(s.lookups()).toBe(1);
  });

  it('never lets a failure stop a request, and tries again next time', () => {
    const s = loadWithTriggers([], { fail: true });
    expect(() => s.ensureRefreshTrigger_()).not.toThrow();
    s.ensureRefreshTrigger_();
    expect(s.lookups()).toBe(2);
  });

  it('runs on every Web App request, before the request is answered', () => {
    expect(SOURCE).toMatch(/function doGet\(e\) \{\n\s+var p = \(e && e\.parameter\) \|\| \{\};\n\s+ensureRefreshTrigger_\(\);/);
  });
});

// The first-time setup (changelog 455): a template Sheet to copy, and the
// steps on /pricing-script, in place of a walkthrough sent by email.
describe('pricing Sheet: first-time setup', () => {
  const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'pricing-script.html'), 'utf8');
  it('links the template as a Google make-a-copy address', async () => {
    const { PRICING_SHEET_COPY_URL } = await import('../utils/pricingSource');
    expect(PRICING_SHEET_COPY_URL).toMatch(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{30,}\/copy$/);
    expect(page).toContain(`href="${PRICING_SHEET_COPY_URL}"`);
  });
  it('walks through deploy, allow, paste and refresh, and no longer asks anyone to email us', () => {
    expect(page).toContain('id="first-time"');
    for (const step of ['New deployment', 'Web app', 'Execute as', 'Who has access', 'Anyone', 'verified', 'Allow', 'What you are allowing', 'Connect to an external service', 'Apps Script Web App URL', 'Refresh Prices &amp; Dividends']) {
      expect(page, step).toContain(step);
    }
    expect(page).not.toMatch(/walkthrough[^.]*email/i);
  });
});

describe('pricing Sheet: the setup pictures', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const page = readFileSync(join(root, 'public', 'pricing-script.html'), 'utf8');
  const imgs = [...page.matchAll(/<img src="(\/pricing-script-img\/[^"]+)"[^>]*alt="([^"]*)"/g)];
  it('folds a picture under the steps, each one ours, described and lazy-loaded', () => {
    expect(imgs.length).toBe(8);
    for (const [tag, src, alt] of imgs) {
      expect(existsSync(join(root, 'public', src)), src).toBe(true);
      expect(alt.length, src).toBeGreaterThan(30);
      expect(tag).toContain('loading="lazy"');
    }
    expect((page.match(/<details class="shot">/g) || []).length).toBe(8);
  });
});
