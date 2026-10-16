import React, { useState } from 'react';
import { useEntitlement } from '../context/useEntitlement';
import { AlertTriangle, Clock, X } from 'lucide-react';
import MailtoLink from './MailtoLink';
import { CONTACT_EMAIL, PREMIUM_NAME } from '../config/premiumOffering';
import {
  shouldShowPremiumExpiryBanner,
  dismissPremiumExpiry,
  PREMIUM_EXPIRY_WARNING_DAYS,
} from '../utils/premiumExpiry';

// Warns that a Premium key is about to run out, or has (changelog 183).
//
// Premium keys are arranged by email and now run 30 days, so expiry is a
// monthly event rather than a twice-yearly one. Before this the only place
// the app mentioned it was a line in Preferences reading "Active until
// <date>" -- so a user's first notice was a locked tab and no explanation.
//
// Two things it deliberately is NOT:
//   * an upsell. It appears only for someone who ALREADY has a key, says
//     what is happening and where to write, and goes away when dismissed.
//   * a data warning. Nothing is lost at expiry -- holdings live in this
//     browser and entitlement only gates changes at the usePortfolioHoldings
//     choke point -- and the copy says so, because "your Premium expired" is
//     otherwise read as "your data is gone", which is the first thing anyone
//     assumes and the thing most likely to prompt a panicked email.
//
// Mounted alongside DataFreshnessBanner in App.jsx. All of the decision
// logic lives in utils/premiumExpiry.js so it can be tested without a DOM.
const PremiumExpiryBanner = () => {
  const { premiumJwtExpiresAt } = useEntitlement();
  // Dismissal is stored in localStorage keyed by the expiry instant, so this
  // tick only exists to re-render the moment the X is pressed.
  const [, setTick] = useState(0);

  const { show, status } = shouldShowPremiumExpiryBanner(premiumJwtExpiresAt);
  if (!show) return null;

  const expired = status.state === 'expired';
  const dateText = status.expiresAt ? status.expiresAt.toLocaleDateString() : '';
  const dayWord = (n) => (n === 1 ? 'day' : 'days');

  // MailtoLink encodes these for the mailto: address itself.
  const subject = `${PREMIUM_NAME} key renewal`;
  const body = expired
    ? `Hello,\n\nMy ${PREMIUM_NAME} key expired on ${dateText}. Could I have a new one?\n\nThank you.`
    : `Hello,\n\nMy ${PREMIUM_NAME} key expires on ${dateText}. Could I have a new one?\n\nThank you.`;

  return (
    <div
      role="status"
      style={{
        // In normal flow, above the KPI cards (see the mount site in
        // App.jsx). NOT position:fixed.
        //
        // Changelog 183 shipped this with no positioning at all while it
        // was mounted after </main>, so it rendered below the entire page
        // and nobody saw it for five weeks. Changelog 188 then pinned it
        // to the top of the viewport, which made it visible by covering
        // the Annual Lifestyle and Ending Balance cards -- swapping an
        // invisible notice for one that hides the numbers you came for.
        //
        // The fix for both is to put it in the layout rather than over it,
        // in the same slot MigrationNotice uses and for the same stated
        // reason: an important notice belongs in the flow of the page, not
        // floating above it where it is either missed or in the way.
        // DemoModeBanner gets away with position:fixed only because it
        // measures its own height and pushes the whole app down; nothing
        // here needs that machinery once it simply occupies space.
        display: 'flex', alignItems: 'flex-start', gap: '12px',
        padding: '12px 16px', margin: '0 0 16px',
        borderRadius: '12px',
        border: `1px solid ${expired ? 'var(--danger)' : 'var(--card-border)'}`,
        backgroundColor: 'var(--card-bg)',
      }}
    >
      {expired
        ? <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
        : <Clock size={18} style={{ color: 'var(--accent-text)', flexShrink: 0, marginTop: '2px' }} />}

      <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-sm)', lineHeight: 1.5 }}>
        <strong>
          {expired
            ? `Your ${PREMIUM_NAME} access ended on ${dateText}.`
            : `Your ${PREMIUM_NAME} access ends on ${dateText} — ${status.daysRemaining} ${dayWord(status.daysRemaining)} from now.`}
        </strong>
        <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
          {expired
            ? 'Nothing has been deleted: your holdings and every other figure are still in this browser exactly as you left them, and they come straight back when a new key is entered. Only the paid features are locked in the meantime.'
            : 'Nothing will be deleted when it does — your holdings stay in this browser and come straight back with a new key. Only the paid features lock until then.'}
          {' '}
          <MailtoLink email={CONTACT_EMAIL} subject={subject} body={body} style={{ color: 'var(--accent-text)' }}>
            Email {CONTACT_EMAIL}
          </MailtoLink>{' '}
          for a new key, then paste it into Preferences &rarr; {PREMIUM_NAME}.
        </div>
      </div>

      <button
        type="button"
        aria-label="Dismiss this notice"
        title={expired
          ? 'Hide this. It returns only if you enter a new key and that one runs low.'
          : `Hide this until your next key is within ${PREMIUM_EXPIRY_WARNING_DAYS} days of expiring.`}
        onClick={() => { dismissPremiumExpiry(premiumJwtExpiresAt); setTick((t) => t + 1); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', padding: '2px', flexShrink: 0,
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default PremiumExpiryBanner;
