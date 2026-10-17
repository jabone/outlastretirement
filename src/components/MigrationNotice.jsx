// The move banner, shown only on cashflowengine.app.
//
// This is the one notice in the app that guards against actual data loss, so
// it behaves differently from every other banner here:
//
//  - It cannot be dismissed permanently. Collapsing it leaves a one-line bar
//    that says the date; it comes back in full on the next visit. A user who
//    dismisses this and forgets loses their plan, and "they clicked X" is not
//    a defense worth having.
//  - Step 1 is a BUTTON, not an instruction. Telling someone to go and find
//    Backup Everything is a step they can get wrong; running it from here is
//    the same code path the sidebar button uses (useFullBackupActions).
//  - It names a date rather than "45 days", and counts down. "45 days" is
//    true for one day out of forty-five.
import { useState } from 'react';
import { ArrowRight, Download, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useFullBackupActions } from '../context/useFullBackupActions';
import { isLegacyHost, NEW_HOST, NEW_ORIGIN, sunsetDateLabel, daysUntilSunset } from '../config/migration';

const MigrationNotice = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { backupEverything } = useFullBackupActions();
  if (!isLegacyHost()) return null;

  const days = daysUntilSunset();
  const when = sunsetDateLabel();

  return (
    <section
      role="region"
      aria-label="This site is moving"
      style={{
        border: '1px solid var(--warning)',
        background: 'color-mix(in srgb, var(--warning) 12%, var(--card-bg))',
        borderRadius: '12px', padding: collapsed ? '12px 16px' : '18px 20px',
        margin: '0 0 20px', color: 'var(--text-primary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <AlertTriangle size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} aria-hidden="true" />
        <strong style={{ fontSize: '15px' }}>
          This site is moving to {NEW_HOST}
        </strong>
        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-body)' }}>
          — cashflowengine.app stops working on {when}
          {days > 0 ? ` (${days} ${days === 1 ? 'day' : 'days'} left)` : ''}.
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="app-disclaimer-footer-link"
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          {collapsed ? 'What do I need to do?' : 'Hide'}
        </button>
      </div>

      {!collapsed && (
        <>
          <p style={{ margin: '12px 0 0', fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Your plan will not move by itself.</strong>{' '}
            It is stored in this browser under this web address, and the new address is a different
            one as far as your browser is concerned. Take a backup here and load it there — it takes
            about a minute.
          </p>

          <ol style={{ margin: '14px 0 0', paddingLeft: '20px', fontSize: 'var(--fs-body)', lineHeight: 1.9 }}>
            <li>
              <strong>Save a copy of your plan.</strong>{' '}
              <button type="button" onClick={backupEverything} className="btn-primary"
                style={{ padding: '6px 14px', fontSize: 'var(--fs-body)', borderRadius: '8px', minHeight: 'auto',
                         display: 'inline-flex', alignItems: 'center', gap: '6px', verticalAlign: 'middle' }}>
                <Download size={15} aria-hidden="true" /> Backup Everything
              </button>
            </li>
            <li>
              <strong>Open <a href={NEW_ORIGIN} style={{ color: 'var(--text-primary)' }}>{NEW_HOST}</a></strong>{' '}
              and use Restore Backup (Preferences → Your Data) to load the file you just saved.
            </li>
            <li><strong>Bookmark the new address</strong>, and delete any bookmark to this one.</li>
            <li>
              <strong>After {when}</strong>, this address stops working. Anything still only here is gone,
              so do not leave it to the last day.
            </li>
          </ol>

          <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <a href={NEW_ORIGIN} className="btn-primary"
               style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none',
                        padding: '10px 18px', borderRadius: '9px', fontSize: 'var(--fs-body)' }}>
              Go to {NEW_HOST} <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>

          <p style={{ margin: '14px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
            Nothing is sent anywhere in this process. The backup is a file that goes to your computer,
            and you load it into the new address yourself — the same way the app has always worked.
          </p>
        </>
      )}
    </section>
  );
};

export default MigrationNotice;
