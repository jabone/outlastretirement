import { describe, it, expect, vi } from 'vitest';

// Verifies verifyPremiumJwt's behavior specifically when no public key is
// configured (an empty PREMIUM_PUBLIC_KEYS ring) -- the state before anyone
// has run scripts/mint-premium-jwt.mjs and pasted a real key into
// src/config/premiumPublicKey.js. Mocked explicitly here rather than
// reading that file's ambient current value: a real deployment (like this
// repo's own, once live pricing is actually set up) is expected to have a
// real key configured, so this test needs to hold regardless of whether
// this particular checkout happens to be configured or not -- it was
// previously written the other way (asserting the file's live value was
// null) and broke the moment a real key got configured, which was the
// test's bug, not a regression. See premiumJwt.test.js for full
// verify-logic coverage against a real test keypair.
vi.mock('../config/premiumPublicKey', () => ({
  PREMIUM_PUBLIC_KEYS: [],
}));

const { verifyPremiumJwt } = await import('../utils/premiumJwt.js');

describe('verifyPremiumJwt with no public key configured', () => {
  it('rejects any token -- including a well-formed-looking one -- when no public key is configured', async () => {
    // Ship closed, not open: with the key ring empty, live
    // pricing must be unreachable no matter what a caller pastes in,
    // since there's nothing to verify a signature against.
    const fakeLookingToken = 'eyJhbGciOiJSUzI1NiJ9.eyJwcmVtaXVtIjp0cnVlfQ.fake-signature';
    expect(await verifyPremiumJwt(fakeLookingToken)).toEqual({ valid: false, expiresAt: null, licensedTo: null });
  });

  it('rejects an empty or missing token too', async () => {
    expect(await verifyPremiumJwt('')).toEqual({ valid: false, expiresAt: null, licensedTo: null });
    expect(await verifyPremiumJwt(null)).toEqual({ valid: false, expiresAt: null, licensedTo: null });
  });
});
