// The public keys that verify Premium Access keys -- a key ring, so the
// signing key can be rotated without invalidating every key already issued.
//
// Each entry is the PUBLIC half of a signing keypair, named by its `kid`
// (key id). A Premium Access key names the `kid` that signed it in its
// header; the verifier (utils/premiumJwt.js) looks that entry up here and
// checks the signature against it. Keys minted before kids existed carry
// no header kid and verify against the entry marked `legacy`.
//
// A public key can only VERIFY a signature, never produce one, so this
// file is safe in the client bundle: nothing here lets anyone mint a key.
// The private halves live with the key issuer (scripts/mint-premium-jwt.mjs
// today) and are never committed. The Premium module server keeps an
// identical copy of this ring (api/premiumPublicKey.js in that repo); keep
// the two the same.
//
// Rotation (OPERATIONS.md, "Rotating the Premium signing key"): add the new
// public key here and in the server copy, release, start signing with it,
// and remove the old entry once the last key it signed has expired (at most
// MAX_TOKEN_LIFETIME_DAYS after signing stops).
export const PREMIUM_PUBLIC_KEYS = [
  {
    kid: 'k1',
    legacy: true, // keys with no header kid verify against this one
    jwk: {
      kty: 'RSA',
      n: 's0_OxUWAni93gA6WnqsqdO2N4ALvZ6pyiplb7jSJWbK0U_-717bUqX1f_humb42qzubTCWIqM70N9aUxx3e4XtH_MTKgTzojwNoFPBJdj82hZDsNVEUJdpEe2p7YT7hKzS_Y63xF3VzLPCMWm6Tx1UKOBc4aO2HtDPcnQDfkYP1LkEf0vwgTv0fdmPztAcDLGuDyLq3C6aWhuSmrJQWY5tWABCatu7ojnxkJXogUTid0aXYo68KnVcxkZz3IIOUL2N4KnF3Fcwk89GNliT5NSQbntZYDxBpyO8woNrZVfFpCFMDmboxF7eg6deOfn6iKecNXbniS176_8JTjoW1bQQ',
      e: 'AQAB',
      alg: 'RS256',
    },
  },
];
