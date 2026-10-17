import React, { useState } from 'react';
import { AlertTriangle, Download, X } from 'lucide-react';
import { useFullBackupActions } from '../context/useFullBackupActions';
import { safariTabPlatform, safariNoticeDue, snoozeSafariNotice, SAFARI_ERASE_DAYS, SAFARI_NOTICE_SNOOZE_DAYS } from '../utils/safariStorage';

// Safari erases a site's stored data after seven days without a visit
// (utils/safariStorage.js, changelog 370). Shown only in a Safari tab, in
// the flow of the page above the KPIs like PremiumExpiryBanner, never
// fixed over the numbers. Dismissing or backing up hides it for a month; it
// cannot be turned off for good, because the risk does not go away.
const SafariStorageBanner = () => {
  const { backupEverything } = useFullBackupActions();
  const [, setTick] = useState(0);
  if (!safariNoticeDue()) return null;
  const platform = safariTabPlatform();
  const hide = () => { snoozeSafariNotice(); setTick((t) => t + 1); };
  const howTo = platform === 'mac'
    ? <>add it to your Dock (in Safari: File &rarr; Add to Dock)</>
    : <>add it to your Home Screen (tap Share, then Add to Home Screen)</>;
  return (
    <div
      role="status"
      data-testid="safari-storage-banner"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '12px',
        padding: '12px 16px', margin: '0 0 16px',
        borderRadius: '12px', border: '1px solid var(--warning)', backgroundColor: 'var(--card-bg)',
      }}
    >
      <AlertTriangle size={18} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', lineHeight: 1.45 }}>
          <strong>Safari can erase your plan.</strong> It deletes a site&rsquo;s saved data after {SAFARI_ERASE_DAYS} days
          without a visit, and your plan lives only in this browser. To keep it, {howTo}, or keep a backup file.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
          <button type="button" className="btn-primary" onClick={() => { backupEverything(); hide(); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-xs)', padding: '6px 12px' }}>
            <Download size={13} /> Back up now
          </button>
        </div>
      </div>
      <button type="button" onClick={hide} aria-label={`Hide this notice for ${SAFARI_NOTICE_SNOOZE_DAYS} days`}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', flexShrink: 0, lineHeight: 0 }}>
        <X size={16} />
      </button>
    </div>
  );
};

export default SafariStorageBanner;
