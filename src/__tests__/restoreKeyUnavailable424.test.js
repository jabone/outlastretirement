// Changelog 424: a restore on a fresh browser whose jose chunk fails to load
// must not treat the file's Premium key as invalid (which skipped the
// holdings and took a second restore). The loader retries, never remembers
// a failure, and reports "unavailable" apart from "invalid"; the restore
// then writes the key provisionally when this browser has none.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let failures = 0;
vi.mock('jose', async (importOriginal) => {
  if (failures > 0) { failures -= 1; throw new Error('chunk failed to load'); }
  return importOriginal();
});
vi.mock('../config/premiumPublicKey', () => ({
  PREMIUM_PUBLIC_KEYS: [{ kid: 'k1', legacy: true, jwk: { kty: 'OKP', crv: 'Ed25519', x: 'MCowBQYDK2VwAyEA', alg: 'EdDSA' } }],
}));

const { verifyPremiumJwt } = await import('../utils/premiumJwt.js');
const token = 'eyJhbGciOiJFZERTQSJ9.eyJwcmVtaXVtIjp0cnVlLCJleHAiOjQxMDI0NDQ4MDB9.c2ln';

describe('the verifier that could not load', () => {
  beforeEach(() => { vi.resetModules(); });

  it('reports unavailable after two failed loads, then verifies once the chunk arrives', async () => {
    failures = 2;
    const first = await verifyPremiumJwt(token);
    expect(first).toEqual({ valid: false, expiresAt: null, licensedTo: null, unavailable: true });
    // The failure was not remembered: the next call loads jose and reaches
    // the signature check, which rejects this made-up token as invalid --
    // not unavailable.
    const second = await verifyPremiumJwt(token);
    expect(second.unavailable).toBeUndefined();
    expect(second.valid).toBe(false);
  });

  it('a single failed load is retried within one call', async () => {
    failures = 1;
    const r = await verifyPremiumJwt(token);
    expect(r.unavailable).toBeUndefined();
  });
});
