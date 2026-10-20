// @vitest-environment jsdom
// Changelog 444: a library file a signed Premium module loads is run only
// after its bytes match the SHA-256 the signed chunk carries. Until 444 the
// chunk imported it straight from the module server, unchecked, and the CSP
// let that origin run scripts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { importVerified, allowedVendorUrl, sha256Integrity, VENDOR_SERVER, __resetVendorCache, __setVendorRunner } from '../../../premium/vendorImport';
import { publishHostLib } from '../../../premium/hostLib';
import { setLocalOnlyMode } from '../../../utils/localOnlyMode';

const URL_OK = 'https://premium.outlastretirement.com/modules/vendor/pdf-abc123.js';
const SOURCE = 'export const ok = 42;\n';
const integrityOf = (text) => `sha256-${createHash('sha256').update(text).digest('base64')}`;

let ran;
beforeEach(() => {
  __resetVendorCache();
  ran = [];
  __setVendorRunner(async (text) => { ran.push(text); return { ok: 42 }; });
});
afterEach(() => { vi.unstubAllGlobals(); });
const serve = (body, status = 200) => {
  const fetchMock = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('importVerified (444)', () => {
  it('runs a file whose bytes match its fingerprint, once, however often it is asked for', async () => {
    const f = serve(SOURCE);
    const a = await importVerified(URL_OK, integrityOf(SOURCE));
    const b = await importVerified(URL_OK, integrityOf(SOURCE));
    expect(a.ok).toBe(42);
    expect(b).toBe(a);
    expect(ran).toEqual([SOURCE]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][1]).toMatchObject({ mode: 'cors', credentials: 'omit' });
  });

  it('refuses a file that does not match, and never runs it', async () => {
    serve('export const ok = 666; /* altered on the server */\n');
    await expect(importVerified(URL_OK, integrityOf(SOURCE))).rejects.toMatchObject({ code: 'VENDOR_INTEGRITY' });
    expect(ran).toEqual([]);
  });

  it('does not cache a failure: a later attempt fetches again', async () => {
    serve('nope', 503);
    await expect(importVerified(URL_OK, integrityOf(SOURCE))).rejects.toMatchObject({ code: 'VENDOR_FETCH' });
    serve(SOURCE);
    await expect(importVerified(URL_OK, integrityOf(SOURCE))).resolves.toMatchObject({ ok: 42 });
  });

  it('accepts only the module server\'s vendor folder, and only with a fingerprint', async () => {
    const f = serve(SOURCE);
    for (const bad of [
      'https://evil.example/modules/vendor/pdf.js',
      'https://premium.outlastretirement.com/modules/holdings.js',
      'https://premium.outlastretirement.com/modules/vendor/pdf.js?x=1',
      'http://premium.outlastretirement.com/modules/vendor/pdf.js',
      'not a url',
    ]) {
      expect(allowedVendorUrl(bad), bad).toBe(false);
      await expect(importVerified(bad, integrityOf(SOURCE))).rejects.toMatchObject({ code: 'VENDOR_ORIGIN' });
    }
    await expect(importVerified(URL_OK, undefined)).rejects.toMatchObject({ code: 'VENDOR_NO_INTEGRITY' });
    await expect(importVerified(URL_OK, 'md5-xyz')).rejects.toMatchObject({ code: 'VENDOR_NO_INTEGRITY' });
    expect(f).not.toHaveBeenCalled();
    expect(allowedVendorUrl(URL_OK)).toBe(true);
  });

  it('computes the same fingerprint the Premium build writes (subresource-integrity form)', async () => {
    expect(await sha256Integrity(new TextEncoder().encode(SOURCE))).toBe(integrityOf(SOURCE));
  });

  it('sends nothing in Local-Only Mode', async () => {
    const f = serve(SOURCE);
    setLocalOnlyMode(true);
    try {
      await expect(importVerified(URL_OK, integrityOf(SOURCE))).rejects.toThrow();
      expect(f).not.toHaveBeenCalled();
      expect(ran).toEqual([]);
    } finally {
      setLocalOnlyMode(false);
    }
  });

  it('is published on the host object a chunk reads', () => {
    expect(publishHostLib().importVerified).toBe(importVerified);
  });

  it('trusts the same server the loader fetches chunks from', async () => {
    const { PREMIUM_MODULE_SERVER } = await import('../../../premium/registry');
    expect(VENDOR_SERVER).toBe(PREMIUM_MODULE_SERVER);
  });
});
