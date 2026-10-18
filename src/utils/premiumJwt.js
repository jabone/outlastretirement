import { PREMIUM_PUBLIC_KEYS } from '../config/premiumPublicKey';

// jose (the JWT library) loads on first use rather than with the app: only
// someone who has pasted a Premium key ever needs it, so the other visitors
// never download it.
//
// A failed load is not remembered (changelog 424): the first restore on a
// fresh browser used to fail its key check when the jose chunk did not
// arrive in time, remember that rejection, and skip the holdings, so a
// backup took two restores. One retry, then the caller is told the check
// was unavailable -- distinct from a key that verified and failed.
let josePromise = null;
const loadJose = () => {
  if (!josePromise) {
    josePromise = import('jose').catch(() => import('jose')).catch((err) => {
      josePromise = null;
      throw err;
    });
  }
  return josePromise;
};
export class VerificationUnavailableError extends Error {}

// Client-side verification of the self-issued premium access token (see
// scripts/mint-premium-jwt.mjs). Deliberately does full signature
// verification here, not just decoding the payload's `exp` claim -- a JWT's
// payload is base64, not encrypted, so anyone could hand-craft a fake
// "{ premium: true, exp: <year 3000> }" string that LOOKS like a token if
// this only checked the claims. Verifying against the public key means a
// forged token is rejected. The Premium module server repeats the same
// check before serving a chunk; the two verifiers share the key ring.
//
// The key ring (config/premiumPublicKey.js) holds one public key per `kid`.
// A token names its signing key in the protected header's `kid`; a token
// with no kid (every key minted before 2026-10-17) verifies against the
// entry marked `legacy`. An unknown kid is a bad signature, nothing more:
// there is no network lookup of keys, ever.
//
// Every accepted token must carry an expiry, and that expiry may be no more
// than MAX_TOKEN_LIFETIME_DAYS after the moment of verification: a validly
// signed token minted without `exp` (or with one decades out) would
// otherwise be a permanent key that could never be retired. The cap is
// measured from now, not from `iat`, because tokens carry no `iat` (it
// would date each key to the second it was minted and make it linkable to
// the email it was sent in); older tokens that do carry one still verify.
//
// This only ever needs the PUBLIC keys, so it never touches anything secret
// -- there's nothing here a browser devtools inspection could use to mint a
// new valid token, only to read the one already pasted in.

export const MAX_TOKEN_LIFETIME_DAYS = 400;
const MAX_TOKEN_LIFETIME_SECONDS = MAX_TOKEN_LIFETIME_DAYS * 24 * 60 * 60;
// The signature algorithms a ring entry may use. RS256 is the original
// key; EdDSA (Ed25519) gives much shorter keys to paste and is what new
// signing keys use.
export const PREMIUM_KEY_ALGORITHMS = ['RS256', 'EdDSA'];

const INVALID = Object.freeze({ valid: false, expiresAt: null, licensedTo: null });
// The verifier itself could not be loaded, so nothing is known about the key.
const UNAVAILABLE = Object.freeze({ valid: false, expiresAt: null, licensedTo: null, unavailable: true });

// The ring as configured: an array of { kid, jwk, legacy? }, or empty when
// nothing is configured (the app then accepts no key at all -- it ships
// closed, not open).
function ring() {
  return Array.isArray(PREMIUM_PUBLIC_KEYS) ? PREMIUM_PUBLIC_KEYS.filter((k) => k && k.kid && k.jwk) : [];
}

// Picks the ring entry a token's header names. Exported for the tests and
// for the Premium server, which keeps the same rule.
export function ringEntryFor(protectedHeader, keys = ring()) {
  const kid = protectedHeader && typeof protectedHeader.kid === 'string' ? protectedHeader.kid : null;
  if (kid) return keys.find((k) => k.kid === kid) || null;
  return keys.find((k) => k.legacy) || null;
}

const importedKeys = new Map(); // kid -> Promise<CryptoKey>
function importRingKey(entry) {
  if (!importedKeys.has(entry.kid)) {
    importedKeys.set(entry.kid, loadJose().then(({ importJWK }) => importJWK(entry.jwk, entry.jwk.alg)));
  }
  return importedKeys.get(entry.kid);
}

// Returns { valid: boolean, expiresAt: Date | null, licensedTo: string | null, serial: string | null }
// -- licensedTo is the address the key was issued to, when the key carries
// one (keys minted before 2026-10-16 do not). Never throws -- any
// verification failure (missing key, bad signature, expired, malformed
// input, wrong claim, unknown kid) just resolves to `valid: false`.
export async function verifyPremiumJwt(token) {
  if (!token || typeof token !== 'string') return INVALID;
  if (ring().length === 0) return INVALID;
  let jwtVerify;
  try {
    ({ jwtVerify } = await loadJose());
  } catch {
    return UNAVAILABLE;
  }
  try {
    const resolveKey = (protectedHeader) => {
      const entry = ringEntryFor(protectedHeader);
      if (!entry) throw new Error('unknown kid');
      if (protectedHeader.alg !== entry.jwk.alg) throw new Error('alg does not match the key');
      return importRingKey(entry);
    };
    const { payload } = await jwtVerify(token, resolveKey, { algorithms: PREMIUM_KEY_ALGORITHMS, requiredClaims: ['exp'] });
    if (payload.premium !== true) return INVALID;
    // Lifetime cap, measured from now whether or not the token has an iat.
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(payload.exp) || payload.exp - nowSeconds > MAX_TOKEN_LIFETIME_SECONDS) return INVALID;
    return {
      valid: true,
      expiresAt: new Date(payload.exp * 1000),
      licensedTo: typeof payload.licensedTo === 'string' && payload.licensedTo ? payload.licensedTo : null,
      // The key's serial (`jti`, keys minted from 2026-10-18): a random id
      // the operator's ledger maps to the address, so one key can be
      // revoked on the module server without retiring its signing key.
      serial: typeof payload.jti === 'string' && payload.jti ? payload.jti : null,
    };
  } catch {
    // Covers expired tokens, bad signatures, unknown kids, malformed tokens,
    // and anything else jose's jwtVerify rejects -- all treated identically
    // as "not premium" rather than surfaced as distinct error states, since
    // the UI only needs to show valid/invalid/expired, not why.
    return INVALID;
  }
}
