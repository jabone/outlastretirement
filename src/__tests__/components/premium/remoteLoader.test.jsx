// @vitest-environment jsdom
// The remote path of src/premium/registry.js: fetch with the key, verify the
// Ed25519 signature against the shipped public key, execute, register. The
// chunk runner is stubbed (Node cannot import blob: URLs); everything else
// -- headers, status handling, signature check, factory registration,
// contract check -- runs for real.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { CONTRACT_VERSION } from '../../../premium/contract.js';
import { publishHostLib, HOST_STATIC, HOST_PACKAGES } from '../../../premium/hostLib.js';

// A real keypair so the signature path is exercised end to end.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const rawPublic = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32); // last 32 bytes of SPKI = raw key
vi.mock('../../../config/premiumChunkPublicKey.js', () => ({
  PREMIUM_CHUNK_PUBLIC_KEY_BASE64: Buffer.from(rawPublic).toString('base64'),
}));

const registry = await import('../../../premium/registry.js');

function signed(text) {
  return Buffer.from(sign(null, Buffer.from(text), privateKey)).toString('base64');
}

// A "chunk" is whatever the runner executes; our stub runner evals a
// registration function instead of importing a blob URL.
const chunkFor = (factorySrc) => `window.__OR_HOST__.modules.holdings = ${factorySrc};`;
const goodFactory = `() => ({ area: 'holdings', contractVersion: '${CONTRACT_VERSION}', version: '2026.10.14', mounts: {} })`;

function mockFetch({ status = 200, body = '', signature, version = '2026.10.14' } = {}) {
  globalThis.fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => ({ 'x-module-signature': signature, 'x-module-version': version })[k.toLowerCase()] ?? null },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  }));
}

describe('hostLib', () => {
  it('publishes once, frozen, with React shared and the allowlist attached', () => {
    const a = publishHostLib();
    const b = publishHostLib();
    expect(a).toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(a.packages.react).toBe(HOST_PACKAGES.react);
    expect(a.static['utils/holdingsCore']).toBe(HOST_STATIC['utils/holdingsCore']);
    expect(typeof a.lazy['components/LazyCharts']).toBe('function');
  });
});

describe('loadRemote', () => {
  beforeEach(() => {
    registry.__resetModuleCache();
    registry.__setChunkRunner(async (text) => { new Function(text)(); });
    publishHostLib().modules.holdings = undefined;
  });
  afterEach(() => { delete globalThis.fetch; });

  it('sends the key as a bearer token and never in the URL', async () => {
    const body = chunkFor(goodFactory);
    mockFetch({ body, signature: signed(body) });
    await registry.loadRemote('holdings', 'the.jwt');
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toMatch(/\/modules\/holdings\.js$/);
    expect(url).not.toContain('the.jwt');
    expect(init.headers.Authorization).toBe('Bearer the.jwt');
    expect(init.cache).toBe('no-store');
  });

  it('executes a correctly signed chunk and returns the registered instance with its version', async () => {
    const body = chunkFor(goodFactory);
    mockFetch({ body, signature: signed(body) });
    const inst = await registry.loadRemote('holdings', 'k');
    expect(inst.area).toBe('holdings');
    expect(inst.version).toBe('2026.10.14');
    expect(inst.servedVersion).toBe('2026.10.14');
  });

  it('refuses to execute a chunk whose signature does not verify', async () => {
    const body = chunkFor(goodFactory);
    const runner = vi.fn();
    registry.__setChunkRunner(runner);
    mockFetch({ body, signature: signed(body + ' ') });
    await expect(registry.loadRemote('holdings', 'k')).rejects.toMatchObject({ code: 'BAD_SIGNATURE' });
    expect(runner).not.toHaveBeenCalled();
  });

  it('refuses an unsigned chunk', async () => {
    const runner = vi.fn();
    registry.__setChunkRunner(runner);
    mockFetch({ body: chunkFor(goodFactory), signature: null });
    await expect(registry.loadRemote('holdings', 'k')).rejects.toMatchObject({ code: 'BAD_SIGNATURE' });
    expect(runner).not.toHaveBeenCalled();
  });

  it('maps server answers to loader codes', async () => {
    mockFetch({ status: 401 });
    await expect(registry.loadRemote('holdings', 'k')).rejects.toMatchObject({ code: 'KEY_REJECTED' });
    mockFetch({ status: 404 });
    await expect(registry.loadRemote('holdings', 'k')).rejects.toMatchObject({ code: 'NOT_PUBLISHED' });
    mockFetch({ status: 500 });
    await expect(registry.loadRemote('holdings', 'k')).rejects.toMatchObject({ code: 'SERVER' });
    await expect(registry.loadRemote('holdings', '')).rejects.toMatchObject({ code: 'NO_KEY' });
  });

  it('rejects a signed chunk built for an incompatible contract', async () => {
    const body = chunkFor(`() => ({ area: 'holdings', contractVersion: '99.0', version: 'x', mounts: {} })`);
    mockFetch({ body, signature: signed(body) });
    await expect(registry.loadRemote('holdings', 'k')).rejects.toMatchObject({ code: 'CONTRACT_MISMATCH' });
  });

  it('rejects a signed chunk that registers nothing', async () => {
    const body = '/* empty */';
    mockFetch({ body, signature: signed(body) });
    await expect(registry.loadRemote('holdings', 'k')).rejects.toThrow(/did not register/);
  });
});

describe('loadModule source selection', () => {
  it('is local unless VITE_PREMIUM_ORIGIN is set', () => {
    expect(registry.isRemoteLoading()).toBe(false);
    expect(registry.PREMIUM_ORIGIN).toBe('');
  });
});
