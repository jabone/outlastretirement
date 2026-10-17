// Opted-in analytics may say which tab was opened and nothing else about
// the address (Sentry's check, 2026-09-28): no sub-page, no query string,
// no hash, and no repeat count for clicking around inside one tab.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sanitizeAnalyticsUrl, makeAnalyticsBeforeSend } from '../utils/analyticsUrl';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const O = 'https://www.outlastretirement.com';

describe('sanitizeAnalyticsUrl', () => {
  it('keeps only the top-level tab name', () => {
    expect(sanitizeAnalyticsUrl(`${O}/app/#/scenarios`)).toBe(`${O}/app/scenarios`);
    expect(sanitizeAnalyticsUrl(`${O}/app/#/taxestate/brackets`)).toBe(`${O}/app/taxestate`);
    expect(sanitizeAnalyticsUrl(`${O}/app/#/ledger`)).toBe(`${O}/app/yearledger`);
  });

  it('drops every query string and anything unknown in the hash', () => {
    expect(sanitizeAnalyticsUrl(`${O}/app/?utm_source=test&foo=bar#/risk/montecarlo`)).toBe(`${O}/app/risk`);
    expect(sanitizeAnalyticsUrl(`${O}/app/?demo=1`)).toBe(`${O}/app/`);
    expect(sanitizeAnalyticsUrl(`${O}/app/#/not-a-tab/secret`)).toBe(`${O}/app/`);
    expect(sanitizeAnalyticsUrl(`${O}/verify?x=1#top`)).toBe(`${O}/verify`);
  });

  it('refuses what it cannot parse', () => {
    expect(sanitizeAnalyticsUrl('not a url')).toBeNull();
  });
});

describe('makeAnalyticsBeforeSend', () => {
  it('sends the cleaned address and drops a repeat of the same tab', () => {
    const send = makeAnalyticsBeforeSend();
    expect(send({ type: 'pageview', url: `${O}/app/#/taxestate` })).toEqual({ type: 'pageview', url: `${O}/app/taxestate` });
    expect(send({ type: 'pageview', url: `${O}/app/#/taxestate/estate` })).toBeNull();
    expect(send({ type: 'pageview', url: `${O}/app/?x=1#/risk` })).toEqual({ type: 'pageview', url: `${O}/app/risk` });
    expect(send({ type: 'pageview', url: `${O}/app/#/taxestate` })).toEqual({ type: 'pageview', url: `${O}/app/taxestate` });
  });

  it('drops malformed events', () => {
    const send = makeAnalyticsBeforeSend();
    expect(send(null)).toBeNull();
    expect(send({ type: 'pageview' })).toBeNull();
  });
});

describe('wiring and disclosure', () => {
  it('the analytics component always passes beforeSend', () => {
    const src = readFileSync(join(ROOT, 'src', 'components', 'GatedAnalytics.jsx'), 'utf8');
    expect(src).toMatch(/<Analytics beforeSend=\{beforeSend\} mode="production" \/>/);
    expect(src).not.toMatch(/<Analytics\s*\/>/);
  });

  it('every page asks the browser to pass on only our domain as the referrer', () => {
    const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
    const all = vercel.headers.find((h) => h.source === '/(.*)').headers;
    expect(all).toContainEqual({ key: 'Referrer-Policy', value: 'strict-origin' });
  });

  it('the privacy policy says tab name only, not the full route', () => {
    const policy = readFileSync(join(ROOT, 'public', 'privacy.html'), 'utf8');
    expect(policy).toMatch(/tab name only/);
    expect(policy).not.toMatch(/The page\/route loaded/);
  });
});
