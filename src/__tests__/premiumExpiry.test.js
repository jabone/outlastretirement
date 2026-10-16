// Premium key expiry warning (changelog 183).
//
// WHY THE THRESHOLD MATTERS NOW. Keys ran 180 days, so expiry was a
// twice-yearly event most people noticed. Premium moved to email-arranged
// 30-day keys, making it monthly -- and the only mention anywhere was a line
// in Preferences reading "Active until <date>". A user's first notice would
// have been a locked tab with no explanation.
//
// `now` is injected everywhere, so none of this needs a mocked clock.
import { describe, it, expect } from 'vitest';
import {
  premiumExpiryStatus,
  shouldShowPremiumExpiryBanner,
  isPremiumExpiryDismissed,
  dismissPremiumExpiry,
  PREMIUM_EXPIRY_WARNING_DAYS,
  PREMIUM_EXPIRY_DISMISS_KEY,
} from '../utils/premiumExpiry';

const NOW = new Date('2026-09-14T12:00:00Z');
const inDays = (n) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

// A storage double, so these tests never touch a real localStorage and can
// also model one that throws (a private window, or blocked site data).
const makeStorage = (initial = {}) => {
  const map = { ...initial };
  return {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); },
    _map: map,
  };
};
const throwingStorage = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
};

describe('premiumExpiryStatus', () => {
  it('says nothing at all when there is no key', () => {
    expect(premiumExpiryStatus(null, NOW).state).toBe('none');
    expect(premiumExpiryStatus(undefined, NOW).state).toBe('none');
  });

  it('treats an unparseable date as no key rather than as expired', () => {
    // Failing open here would show every user without a key an expiry
    // warning, which is worse than showing nobody one.
    expect(premiumExpiryStatus(new Date('nonsense'), NOW).state).toBe('none');
  });

  it('is quiet while there is plenty of time left', () => {
    expect(premiumExpiryStatus(inDays(30), NOW).state).toBe('active');
    expect(premiumExpiryStatus(inDays(PREMIUM_EXPIRY_WARNING_DAYS + 1), NOW).state).toBe('active');
  });

  it('warns from exactly the threshold inward', () => {
    const at = premiumExpiryStatus(inDays(PREMIUM_EXPIRY_WARNING_DAYS), NOW);
    expect(at.state).toBe('expiringSoon');
    expect(at.daysRemaining).toBe(PREMIUM_EXPIRY_WARNING_DAYS);
    expect(premiumExpiryStatus(inDays(1), NOW).state).toBe('expiringSoon');
  });

  it('rounds the days remaining UP, so nobody is told they have less time than they do', () => {
    // Six and a half days must read as seven, not six.
    const status = premiumExpiryStatus(new Date(NOW.getTime() + 6.5 * 24 * 60 * 60 * 1000), NOW);
    expect(status.daysRemaining).toBe(7);
  });

  it('reports an expired key, never a negative countdown', () => {
    const past = premiumExpiryStatus(inDays(-3), NOW);
    expect(past.state).toBe('expired');
    expect(past.daysRemaining).toBe(0);
    expect(past.daysAgo).toBe(3);
  });

  it('the first day past expiry reads as 1 day ago, not 0', () => {
    // "expired 0 days ago" looks like a bug to a reader.
    const justGone = premiumExpiryStatus(new Date(NOW.getTime() - 60 * 1000), NOW);
    expect(justGone.state).toBe('expired');
    expect(justGone.daysAgo).toBe(1);
  });
});

describe('dismissal is keyed to the expiry it was dismissed for', () => {
  it('silences that key, and only that key', () => {
    const storage = makeStorage();
    const thisKey = inDays(3);
    dismissPremiumExpiry(thisKey, storage);
    expect(isPremiumExpiryDismissed(thisKey, storage)).toBe(true);

    // A renewal produces a DIFFERENT expiry instant, so the dismissal must
    // not carry across and silence the next cycle -- the failure a plain
    // "don't show again" flag would have had.
    const renewed = inDays(33);
    expect(isPremiumExpiryDismissed(renewed, storage)).toBe(false);
  });

  it('stores the expiry instant itself, so nothing else can collide with it', () => {
    const storage = makeStorage();
    const key = inDays(2);
    dismissPremiumExpiry(key, storage);
    expect(storage._map[PREMIUM_EXPIRY_DISMISS_KEY]).toBe(String(key.getTime()));
  });

  it('a storage that throws reads as NOT dismissed', () => {
    // A private window must still see the warning. Swallowing it silently
    // is the one outcome that leaves someone locked out with no clue why.
    expect(isPremiumExpiryDismissed(inDays(3), throwingStorage)).toBe(false);
    expect(dismissPremiumExpiry(inDays(3), throwingStorage)).toBe(false);
  });
});

describe('shouldShowPremiumExpiryBanner puts the whole decision in one place', () => {
  it('stays hidden with no key, and with a healthy one', () => {
    const storage = makeStorage();
    expect(shouldShowPremiumExpiryBanner(null, NOW, storage).show).toBe(false);
    expect(shouldShowPremiumExpiryBanner(inDays(30), NOW, storage).show).toBe(false);
  });

  it('shows when close, and when already past', () => {
    const storage = makeStorage();
    expect(shouldShowPremiumExpiryBanner(inDays(3), NOW, storage).show).toBe(true);
    expect(shouldShowPremiumExpiryBanner(inDays(-1), NOW, storage).show).toBe(true);
  });

  it('hides once dismissed, and returns for the next key', () => {
    const storage = makeStorage();
    const key = inDays(3);
    expect(shouldShowPremiumExpiryBanner(key, NOW, storage).show).toBe(true);
    dismissPremiumExpiry(key, storage);
    expect(shouldShowPremiumExpiryBanner(key, NOW, storage).show).toBe(false);
    // Renewed: 30 days out is quiet, and warns again when it gets close.
    const renewed = inDays(33);
    expect(shouldShowPremiumExpiryBanner(renewed, NOW, storage).show).toBe(false);
    expect(shouldShowPremiumExpiryBanner(renewed, inDays(30), storage).show).toBe(true);
  });

  it('a 30-day key is quiet for most of its life', () => {
    // The threshold has to be worth having: a warning that runs for a
    // quarter of the key's life is just furniture people stop seeing.
    const storage = makeStorage();
    const issued = inDays(30);
    let noisyDays = 0;
    for (let d = 0; d < 30; d++) {
      if (shouldShowPremiumExpiryBanner(issued, inDays(d), storage).show) noisyDays += 1;
    }
    expect(noisyDays).toBe(PREMIUM_EXPIRY_WARNING_DAYS);
    expect(noisyDays).toBeLessThan(10);
  });
});
