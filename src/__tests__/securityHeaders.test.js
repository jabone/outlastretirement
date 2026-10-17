// Review 2026-09-30 (S13): the headers every response carries besides the
// CSP (cspHeader.test.js), and the long cache on content-hashed assets.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const json = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8'));
const headersFor = (source) => {
  const rule = (json.headers || []).find((h) => h.source === source);
  return Object.fromEntries((rule ? rule.headers : []).map((h) => [h.key.toLowerCase(), h.value]));
};

describe('vercel.json headers', () => {
  const all = headersFor('/(.*)');
  it('every response forbids MIME sniffing, isolates the window and pins HTTPS', () => {
    expect(all['x-content-type-options']).toBe('nosniff');
    expect(all['cross-origin-opener-policy']).toBe('same-origin');
    expect(all['strict-transport-security']).toMatch(/^max-age=(\d+); includeSubDomains$/);
    expect(Number(all['strict-transport-security'].match(/max-age=(\d+)/)[1])).toBeGreaterThanOrEqual(31536000);
  });
  it('denies the device features the app never uses, and topics-based ad targeting', () => {
    for (const f of ['camera', 'microphone', 'geolocation', 'browsing-topics']) {
      expect(all['permissions-policy'], f).toContain(`${f}=()`);
    }
  });
  it('content-hashed build assets are cached for a year as immutable', () => {
    expect(headersFor('/assets/(.*)')['cache-control']).toBe('public, max-age=31536000, immutable');
  });
});
