import { describe, it, expect, vi, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

// Mocks the key ring with real, freshly-generated test keypairs so this
// file can exercise the full verify path (valid / expired / wrong signature
// / missing claim / kid lookup) -- see premiumJwt.defaultConfig.test.js for
// coverage of the empty ring ("ships closed").
//
// The ring: k1 is the legacy RS256 key (tokens with no header kid verify
// against it), k2 is a second key, EdDSA, the kind rotation adds.
let testPublicKeyJwk;
let testPrivateKey; // k1
let k2PrivateKey; // k2 (EdDSA)
let k2PublicKeyJwk;
let otherPrivateKey; // a different keypair, for the "wrong signature" case

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  testPublicKeyJwk = await exportJWK(publicKey);
  testPublicKeyJwk.alg = 'RS256';
  testPrivateKey = privateKey;

  const k2 = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  k2PublicKeyJwk = await exportJWK(k2.publicKey);
  k2PublicKeyJwk.alg = 'EdDSA';
  k2PrivateKey = k2.privateKey;

  const other = await generateKeyPair('RS256', { extractable: true });
  otherPrivateKey = other.privateKey;
});

vi.mock('../config/premiumPublicKey', () => ({
  get PREMIUM_PUBLIC_KEYS() {
    return [
      { kid: 'k1', legacy: true, jwk: testPublicKeyJwk },
      { kid: 'k2', jwk: k2PublicKeyJwk },
    ];
  },
}));

const { verifyPremiumJwt, ringEntryFor } = await import('../utils/premiumJwt.js');
const { premiumExpiryStatus } = await import('../utils/premiumExpiry.js');

async function signToken(privateKey, { premium = true, expiresIn = '1h', licensedTo } = {}) {
  return new SignJWT(licensedTo ? { premium, licensedTo } : { premium })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(privateKey);
}

describe('verifyPremiumJwt', () => {
  it('rejects a missing/empty token', async () => {
    expect(await verifyPremiumJwt(null)).toEqual({ valid: false, expiresAt: null, licensedTo: null });
    expect(await verifyPremiumJwt('')).toEqual({ valid: false, expiresAt: null, licensedTo: null });
    expect(await verifyPremiumJwt(undefined)).toEqual({ valid: false, expiresAt: null, licensedTo: null });
  });

  it('rejects a non-string token', async () => {
    expect(await verifyPremiumJwt(12345)).toEqual({ valid: false, expiresAt: null, licensedTo: null });
  });

  it('accepts a correctly-signed, non-expired token with the premium claim', async () => {
    const token = await signToken(testPrivateKey);
    const result = await verifyPremiumJwt(token);
    expect(result.valid).toBe(true);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // A key minted before keys carried an address.
    expect(result.licensedTo).toBeNull();
  });

  it('passes through the address a key was issued to', async () => {
    const result = await verifyPremiumJwt(await signToken(testPrivateKey, { licensedTo: 'someone@example.com' }));
    expect(result.valid).toBe(true);
    expect(result.licensedTo).toBe('someone@example.com');
  });

  // Changelog 516: a genuine key that has run out is told apart from a bad
  // one, so the app can say when it ended and show the Premium-ended
  // banner. It still unlocks nothing: `valid` stays false.
  it('says when a correctly signed key expired, and still does not accept it', async () => {
    const exp = Math.floor(Date.now() / 1000) - 3600;
    const token = await new SignJWT({ premium: true, licensedTo: 'someone@example.com', jti: 'abc123def456' })
      .setProtectedHeader({ alg: 'RS256' }).setExpirationTime(exp).sign(testPrivateKey);
    const result = await verifyPremiumJwt(token);
    expect(result).toEqual({
      valid: false, expired: true, expiresAt: new Date(exp * 1000),
      licensedTo: 'someone@example.com', serial: 'abc123def456',
    });
    // The banner's own rule reads that expiry as ended.
    expect(premiumExpiryStatus(result.expiresAt).state).toBe('expired');
  });

  it('an expired key with no address or serial still says when it ended', async () => {
    const result = await verifyPremiumJwt(await signToken(testPrivateKey, { expiresIn: '-2d' }));
    expect(result.valid).toBe(false);
    expect(result.expired).toBe(true);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.licensedTo).toBeNull();
    expect(result.serial).toBeNull();
  });

  it('an expired token that is forged, or not a Premium key, is plain invalid', async () => {
    const plain = { valid: false, expiresAt: null, licensedTo: null };
    // Signed by a key outside the ring: the signature fails before expiry is looked at.
    expect(await verifyPremiumJwt(await signToken(otherPrivateKey, { expiresIn: '-1h' }))).toEqual(plain);
    // Genuinely signed but with no premium flag (the demo delivery key, run out).
    const demo = await new SignJWT({ demo: true }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setExpirationTime('-1h').sign(testPrivateKey);
    expect(await verifyPremiumJwt(demo)).toEqual(plain);
    // A garbled copy of an expired key.
    const token = await signToken(testPrivateKey, { expiresIn: '-1h' });
    expect(await verifyPremiumJwt(token.slice(0, -6))).toEqual(plain);
  });

  // The demo delivery key (config/demoDeliveryKey.js) is signed by the same
  // key but carries { demo: true } and no premium flag: pasted into
  // Preferences it must unlock nothing.
  it('rejects the demo delivery key as a Premium key', async () => {
    const demo = await new SignJWT({ demo: true }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setExpirationTime('30d').sign(testPrivateKey);
    expect(await verifyPremiumJwt(demo)).toEqual({ valid: false, expiresAt: null, licensedTo: null });
  });

  it('rejects a token missing the premium claim', async () => {
    const token = await signToken(testPrivateKey, { premium: false });
    expect(await verifyPremiumJwt(token)).toEqual({ valid: false, expiresAt: null, licensedTo: null });
  });

  it('rejects a token signed with a different (non-matching) private key', async () => {
    // Exactly the "forged token" scenario the client-side signature check
    // exists to catch -- see the comment at the top of premiumJwt.js.
    const forged = await signToken(otherPrivateKey);
    expect(await verifyPremiumJwt(forged)).toEqual({ valid: false, expiresAt: null, licensedTo: null });
  });

  it('rejects a malformed/garbage string', async () => {
    expect(await verifyPremiumJwt('not-a-real-jwt')).toEqual({ valid: false, expiresAt: null, licensedTo: null });
  });

  // A validly signed token with no exp would be a permanent key.
  it('rejects a correctly-signed token with no exp claim', async () => {
    const token = await new SignJWT({ premium: true })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .sign(testPrivateKey);
    expect(await verifyPremiumJwt(token)).toEqual({ valid: false, expiresAt: null, licensedTo: null });
  });

  it('rejects a token whose lifetime exceeds the cap, accepts one within it', async () => {
    const tooLong = await signToken(testPrivateKey, { expiresIn: '401d' });
    expect(await verifyPremiumJwt(tooLong)).toEqual({ valid: false, expiresAt: null, licensedTo: null });
    const ok = await signToken(testPrivateKey, { expiresIn: '365d' });
    expect((await verifyPremiumJwt(ok)).valid).toBe(true);
  });

  it('caps a token with no iat from now', async () => {
    const token = await new SignJWT({ premium: true })
      .setProtectedHeader({ alg: 'RS256' })
      .setExpirationTime('3650d')
      .sign(testPrivateKey);
    expect(await verifyPremiumJwt(token)).toEqual({ valid: false, expiresAt: null, licensedTo: null });
  });

  // Keys are minted without iat (it dated each key to the second and made it
  // linkable to the email it went out in); the cap is exp - now.
  it('accepts a token with no iat and an exp within the cap', async () => {
    const token = await new SignJWT({ premium: true })
      .setProtectedHeader({ alg: 'RS256' })
      .setExpirationTime('30d')
      .sign(testPrivateKey);
    const result = await verifyPremiumJwt(token);
    expect(result.valid).toBe(true);
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('still accepts an already-issued token that carries iat', async () => {
    const token = await new SignJWT({ premium: true })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(testPrivateKey);
    expect((await verifyPremiumJwt(token)).valid).toBe(true);
  });

  it('measures the cap from now, not from iat', async () => {
    const now = Math.floor(Date.now() / 1000);
    const day = 86400;
    // A future-dated iat cannot stretch a key past the cap.
    const futureIat = await new SignJWT({ premium: true })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt(now + 3649 * day)
      .setExpirationTime(now + 3650 * day)
      .sign(testPrivateKey);
    expect(await verifyPremiumJwt(futureIat)).toEqual({ valid: false, expiresAt: null, licensedTo: null });
    // An old iat does not count against a key whose exp is within the cap.
    const oldIat = await new SignJWT({ premium: true })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt(now - 500 * day)
      .setExpirationTime(now + 30 * day)
      .sign(testPrivateKey);
    expect((await verifyPremiumJwt(oldIat)).valid).toBe(true);
    // Just inside and just outside the cap, with no iat.
    const inside = await new SignJWT({ premium: true }).setProtectedHeader({ alg: 'RS256' }).setExpirationTime(now + 399 * day).sign(testPrivateKey);
    expect((await verifyPremiumJwt(inside)).valid).toBe(true);
    const outside = await new SignJWT({ premium: true }).setProtectedHeader({ alg: 'RS256' }).setExpirationTime(now + 401 * day).sign(testPrivateKey);
    expect(await verifyPremiumJwt(outside)).toEqual({ valid: false, expiresAt: null, licensedTo: null });
  });
});

describe('the key ring and kid', () => {
  const sign = (privateKey, header) => new SignJWT({ premium: true })
    .setProtectedHeader(header)
    .setExpirationTime('30d')
    .sign(privateKey);

  it('a token with no kid verifies against the legacy key (every key issued before kids)', async () => {
    expect((await verifyPremiumJwt(await sign(testPrivateKey, { alg: 'RS256' }))).valid).toBe(true);
  });

  it('a token that names k1 verifies against k1', async () => {
    expect((await verifyPremiumJwt(await sign(testPrivateKey, { alg: 'RS256', kid: 'k1' }))).valid).toBe(true);
  });

  it('a token that names k2 verifies against k2, an EdDSA key', async () => {
    const token = await sign(k2PrivateKey, { alg: 'EdDSA', kid: 'k2' });
    expect((await verifyPremiumJwt(token)).valid).toBe(true);
  });

  it('rejects a token that names a kid not in the ring', async () => {
    expect(await verifyPremiumJwt(await sign(testPrivateKey, { alg: 'RS256', kid: 'k9' }))).toEqual({ valid: false, expiresAt: null, licensedTo: null });
  });

  it('rejects a token signed by k2 but claiming to be k1 (and the other way round)', async () => {
    expect((await verifyPremiumJwt(await sign(k2PrivateKey, { alg: 'EdDSA', kid: 'k1' }))).valid).toBe(false);
    expect((await verifyPremiumJwt(await sign(testPrivateKey, { alg: 'RS256', kid: 'k2' }))).valid).toBe(false);
  });

  it('a token with no kid does not verify against a non-legacy key', async () => {
    // k2 signed it, but with no kid the verifier only tries the legacy key.
    expect((await verifyPremiumJwt(await sign(k2PrivateKey, { alg: 'EdDSA' }))).valid).toBe(false);
  });

  it('ringEntryFor picks by kid, and the legacy entry when there is none', () => {
    const keys = [{ kid: 'a', legacy: true, jwk: {} }, { kid: 'b', jwk: {} }];
    expect(ringEntryFor({ kid: 'b' }, keys).kid).toBe('b');
    expect(ringEntryFor({}, keys).kid).toBe('a');
    expect(ringEntryFor({ kid: 'zz' }, keys)).toBeNull();
    expect(ringEntryFor({}, [{ kid: 'b', jwk: {} }])).toBeNull();
  });
});
