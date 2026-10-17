import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { STORAGE_WRITE_EVENT, holdWrites } from '../utils/safeStorage';
import { downloadFullBackup } from '../utils/fullBackup';
import { isDemoModeActive } from '../utils/demoMode';
import { WATCHED_PLAN_KEYS } from '../utils/storageKeys';

// Two things the user must hear about, because otherwise they are silent:
//
// 1. A save that failed. When this browser's storage is full, a change the
//    user just made was not kept. The old behavior threw out of a React
//    effect and replaced the app with a crash screen that said the data
//    was safe; now the write fails quietly in safeStorage.js and this
//    banner says what happened and what to do, until a later save of the
//    same data succeeds or the user closes it.
//
// 2. Another tab changed the plan. Two open tabs used to overwrite each
//    other with whichever saved last. When the browser reports (via the
//    'storage' event, which fires only in OTHER tabs) that one of the plan
//    keys changed, this tab stops saving those keys (holdWrites) and offers
//    to load the newer version -- a reload, the same transition Restore and
//    demo mode use, so every part of the app re-reads one consistent copy.
//
// Mounted beside the app in main.jsx rather than inside it, so it keeps
// working even when the app itself is the thing in trouble.

const bannerStyle = {
  position: 'fixed',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1300,
  width: 'min(620px, calc(100vw - 24px))',
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '10px 12px 10px 14px',
  borderRadius: '10px',
  backgroundColor: 'var(--bg-secondary, #111a2e)',
  border: '1px solid var(--warning, #eab308)',
  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.3)',
  fontSize: 'var(--fs-sm, 13px)',
  color: 'var(--text-secondary, #94a3b8)',
  lineHeight: 1.45,
};

const StorageBanners = () => {
  const [failed, setFailed] = useState(() => new Map()); // key -> { quota }
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const onWrite = (e) => {
      const d = e.detail || {};
      if (d.held) return; // a held write is the stale banner's business
      setFailed((prev) => {
        if (d.ok && !prev.has(d.key)) return prev;
        const next = new Map(prev);
        if (d.ok) next.delete(d.key); else next.set(d.key, { quota: !!d.quota });
        return next;
      });
    };
    const onStorage = (e) => {
      // key === null: the other tab cleared storage (Erase everything).
      if (e.key !== null && !WATCHED_PLAN_KEYS.includes(e.key)) return;
      holdWrites(WATCHED_PLAN_KEYS);
      setStale(true);
    };
    window.addEventListener(STORAGE_WRITE_EVENT, onWrite);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(STORAGE_WRITE_EVENT, onWrite);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const quota = [...failed.values()].some((f) => f.quota);
  const demo = isDemoModeActive();

  return (
    <>
      {stale && (
        <div role="alert" data-testid="stale-tab-banner" style={{ ...bannerStyle, top: 'calc(var(--demo-banner-offset, 0px) + 10px)' }}>
          <AlertTriangle size={18} style={{ color: 'var(--warning, #eab308)', flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <strong style={{ color: 'var(--text-primary, #e2e8f0)' }}>Your plan was changed in another tab.</strong>
            {' '}Changes you make in this tab aren&rsquo;t saved until you load the newer version.
          </div>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()} style={{ padding: '5px 12px', minHeight: 'auto', whiteSpace: 'nowrap', fontSize: 'var(--fs-xs, 12px)' }}>
            Load the newer version
          </button>
        </div>
      )}
      {failed.size > 0 && (
        <div role="alert" data-testid="storage-full-banner" style={{ ...bannerStyle, top: stale ? 'calc(var(--demo-banner-offset, 0px) + 84px)' : 'calc(var(--demo-banner-offset, 0px) + 10px)', borderColor: 'var(--danger, #ef4444)' }}>
          <AlertTriangle size={18} style={{ color: 'var(--danger, #ef4444)', flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            {quota
              ? <>Couldn&rsquo;t save your latest change: this browser&rsquo;s storage is full. Download a backup and remove old scenarios.</>
              : <>Couldn&rsquo;t save your latest change: this browser isn&rsquo;t letting the app store data right now (a private window or a storage setting can cause this). Download a backup to keep a copy.</>}
          </div>
          {!demo && (
            <button type="button" className="btn-outline" onClick={() => { try { downloadFullBackup(); } catch (err) { console.error('Backup from the storage banner failed', err); } }} style={{ padding: '5px 12px', minHeight: 'auto', whiteSpace: 'nowrap', fontSize: 'var(--fs-xs, 12px)' }}>
              Download a backup
            </button>
          )}
          <button type="button" aria-label="Close" onClick={() => setFailed(new Map())} style={{ background: 'none', border: 'none', color: 'var(--text-secondary, #94a3b8)', cursor: 'pointer', padding: '2px' }}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
};

export default StorageBanners;
