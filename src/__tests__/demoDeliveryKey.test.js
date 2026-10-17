// The demo delivery key in the bundle must be what config/demoDeliveryKey.js
// says it is: signed by a key in the ring, { demo: true } and an expiry,
// no premium flag and no address. A Premium key pasted here by mistake
// would hand every visitor to the demo full Premium code delivery.
import { describe, it, expect } from 'vitest';
import { importJWK, jwtVerify, decodeProtectedHeader } from 'jose';
import { DEMO_DELIVERY_KEY, DEMO_AREAS } from '../config/demoDeliveryKey';
import { PREMIUM_PUBLIC_KEYS } from '../config/premiumPublicKey';
import { verifyPremiumJwt } from '../utils/premiumJwt';

describe('the demo delivery key', () => {
  it.skipIf(!DEMO_DELIVERY_KEY)('is signed by a ring key and carries demo: true, an expiry, and nothing else', async () => {
    const { kid, alg } = decodeProtectedHeader(DEMO_DELIVERY_KEY);
    const entry = PREMIUM_PUBLIC_KEYS.find((k) => k.kid === kid);
    expect(entry, `kid ${kid} is in the ring`).toBeTruthy();
    const { payload } = await jwtVerify(DEMO_DELIVERY_KEY, await importJWK(entry.jwk, alg), { algorithms: [alg] });
    expect(Object.keys(payload).sort()).toEqual(['demo', 'exp']);
    expect(payload.demo).toBe(true);
    expect(payload.exp * 1000).toBeGreaterThan(Date.now() + 30 * 86400 * 1000);
  });

  it.skipIf(!DEMO_DELIVERY_KEY)('is not a Premium key', async () => {
    expect((await verifyPremiumJwt(DEMO_DELIVERY_KEY)).valid).toBe(false);
  });

  it('lists only Detailed Holdings as a demo area', () => {
    expect(DEMO_AREAS).toEqual(['holdings']);
  });
});
