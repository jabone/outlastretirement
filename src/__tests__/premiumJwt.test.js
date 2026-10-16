import { describe, it, expect, vi, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

// Mocks the public key config with a real, freshly-generated test keypair
// so this file can exercise the full verify path (valid / expired / wrong
// signature / missing claim) -- see premiumJwt.defaultConfig.test.js for
// coverage of the real repo default (PREMIUM_PUBLIC_KEY_JWK === null,
// "ships closed").
let testPublicKeyJwk;
let testPrivateKey;
let otherPrivateKey; // a different keypair, for the "wrong signature" case

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  testPublicKeyJwk = await exportJWK(publicKey);
  testPublicKeyJwk.alg = 'RS256';
  testPrivateKey = privateKey;

  const other = await generateKeyPair('RS256', { extractable: true });
  otherPrivateKey = other.privateKey;
});

vi.mock('../config/premiumPublicKey', () => ({
  get PREMIUM_PUBLIC_KEY_JWK() {
    return testPublicKeyJwk;
  },
}));

const { verifyPremiumJwt } = await import('../utils/premiumJwt.js');

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

  it('rejects an expired token even if correctly signed', async () => {
    const token = await signToken(testPrivateKey, { expiresIn: '-1h' });
    expect(await verifyPremiumJwt(token)).toEqual({ valid: false, expiresAt: null, licensedTo: null });
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
