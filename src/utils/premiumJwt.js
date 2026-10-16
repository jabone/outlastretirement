import { PREMIUM_PUBLIC_KEY_JWK } from '../config/premiumPublicKey';

// jose (the JWT library) loads on first use rather than with the app: only
// someone who has pasted a Premium key ever needs it, so the other visitors
// never download it.
let josePromise = null;
const loadJose = () => (josePromise ||= import('jose'));

// Client-side verification of the self-issued premium access token (see
// scripts/mint-premium-jwt.mjs). Deliberately does full signature
// verification here, not just decoding the payload's `exp` claim -- a JWT's
// payload is base64, not encrypted, so anyone could hand-craft a fake
// "{ premium: true, exp: <year 3000> }" string that LOOKS like a token if
// this only checked the claims. Verifying against the public key means a
// forged token is rejected. There is no server-side check; this is the
// whole of it (see App.jsx's entitlement comment).
//
// Every accepted token must carry an expiry, and that expiry may be no more
// than MAX_TOKEN_LIFETIME_DAYS after the moment of verification: a validly
// signed token minted without `exp` (or with one decades out) would
// otherwise be a permanent key that could never be retired. The cap is
// measured from now, not from `iat`, because tokens carry no `iat` (it
// would date each key to the second it was minted and make it linkable to
// the email it was sent in); older tokens that do carry one still verify.
//
// This only ever needs the PUBLIC key, so it never touches anything secret
// -- there's nothing here a browser devtools inspection could use to mint a
// new valid token, only to read the one already pasted in.

export const MAX_TOKEN_LIFETIME_DAYS = 400;
const MAX_TOKEN_LIFETIME_SECONDS = MAX_TOKEN_LIFETIME_DAYS * 24 * 60 * 60;

let cachedKeyPromise = null;
function getPublicKey() {
  if (!PREMIUM_PUBLIC_KEY_JWK) return null;
  if (!cachedKeyPromise) {
    cachedKeyPromise = loadJose().then(({ importJWK }) => importJWK(PREMIUM_PUBLIC_KEY_JWK, 'RS256'));
  }
  return cachedKeyPromise;
}

// Returns { valid: boolean, expiresAt: Date | null, licensedTo: string | null }
// -- licensedTo is the address the key was issued to, when the key carries
// one (keys minted before 2026-10-16 do not). Never throws -- any
// verification failure (missing key, bad signature, expired, malformed
// input, wrong claim) just resolves to `valid: false`.
export async function verifyPremiumJwt(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, expiresAt: null, licensedTo: null };
  }
  const publicKeyPromise = getPublicKey();
  if (!publicKeyPromise) {
    return { valid: false, expiresAt: null, licensedTo: null };
  }
  try {
    const publicKey = await publicKeyPromise;
    const { jwtVerify } = await loadJose();
    const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'], requiredClaims: ['exp'] });
    if (payload.premium !== true) {
      return { valid: false, expiresAt: null, licensedTo: null };
    }
    // Lifetime cap, measured from now whether or not the token has an iat.
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(payload.exp) || payload.exp - nowSeconds > MAX_TOKEN_LIFETIME_SECONDS) {
      return { valid: false, expiresAt: null, licensedTo: null };
    }
    return {
      valid: true,
      expiresAt: new Date(payload.exp * 1000),
      licensedTo: typeof payload.licensedTo === 'string' && payload.licensedTo ? payload.licensedTo : null,
    };
  } catch {
    // Covers expired tokens, bad signatures, malformed tokens, and anything
    // else jose's jwtVerify rejects -- all treated identically as "not
    // premium" rather than surfaced as distinct error states, since the
    // Sidebar UI only needs to show valid/invalid/expired, not why.
    return { valid: false, expiresAt: null, licensedTo: null };
  }
}
