import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { CHANGELOG, LATEST_CHANGELOG_ID } from '../config/changelog';
import { activeAnnouncements } from '../config/announcements';
import ChangelogEntry from './ChangelogEntry';
import {
  WHATS_NEW_SEEN_KEY, WHATS_NEW_SHOWN_DATE_KEY, DISMISSED_ANNOUNCE_KEY,
  whatsNewToday, readDismissedAnnouncements,
} from '../utils/whatsNewGate';

// Storage keys and the dismissed-set reader are shared with the app shell's
// gate (utils/whatsNewGate.js), which decides whether to load this at all.
const SEEN_KEY = WHATS_NEW_SEEN_KEY;
const SHOWN_DATE_KEY = WHATS_NEW_SHOWN_DATE_KEY;
const todayStr = whatsNewToday;

// More unread release notes than this and the popup shows one digest card
// instead of paging through them one at a time: the count, the newest
// DIGEST_SIZE headlines, and a link to the full list in Help.
export const DIGEST_SIZE = 5;

// "What's New": shows two kinds of thing through one popup, once per visitor
// per day (capped so re-opening the tab three times in an afternoon only
// shows it the first time):
//   1. Unread CHANGELOG release notes -- entries newer than the highest id
//      this browser has acknowledged (SEEN_KEY). A brand-new visitor is
//      silently caught up to LATEST_CHANGELOG_ID and shown NO history: this
//      is "what changed since you were last here," not an onboarding tour.
//   2. Active ANNOUNCEMENTS -- timed broadcast messages (config/
//      announcements.js) whose date window includes today and that this
//      browser hasn't dismissed. Unlike release notes these DO reach
//      brand-new visitors (unless an announcement opts out with
//      showToNewVisitors:false), which is the whole point of a broadcast.
const WhatsNewPopup = () => {
  const [entries, setEntries] = useState([]);
  // One entry per page rather than a scrolling wall of text.
  const [pageIndex, setPageIndex] = useState(0);
  // The announcement ids shown this open, so "Got it" can mark exactly them
  // dismissed (not any that only became active after the popup opened).
  const [shownAnnouncementIds, setShownAnnouncementIds] = useState([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedSeenId = localStorage.getItem(SEEN_KEY);
    const today = todayStr();
    const isFirstVisit = storedSeenId === null;

    const dismissed = readDismissedAnnouncements();
    const announcements = activeAnnouncements()
      .filter((a) => !dismissed.has(a.id))
      .filter((a) => (isFirstVisit ? a.showToNewVisitors !== false : true))
      .sort((a, b) => String(a.showFrom || '').localeCompare(String(b.showFrom || '')));

    // Unread release notes -- none for a first-time visitor (nothing missed).
    let releaseNotes = [];
    if (isFirstVisit) {
      localStorage.setItem(SEEN_KEY, String(LATEST_CHANGELOG_ID));
    } else {
      const lastSeenId = parseInt(storedSeenId, 10) || 0;
      if (lastSeenId < LATEST_CHANGELOG_ID) {
        releaseNotes = CHANGELOG.filter((e) => e.id > lastSeenId).sort((a, b) => b.id - a.id);
        if (releaseNotes.length > DIGEST_SIZE) {
          releaseNotes = [{ id: 'digest', digest: true, count: releaseNotes.length, newest: releaseNotes.slice(0, DIGEST_SIZE) }];
        }
      }
    }

    // Announcements lead -- they are the deliberate broadcasts -- then the
    // unread release notes.
    const toShow = [...announcements, ...releaseNotes];
    if (toShow.length === 0) return;
    if (localStorage.getItem(SHOWN_DATE_KEY) === today) return; // already shown once today

    setEntries(toShow);
    setShownAnnouncementIds(announcements.map((a) => a.id));
    localStorage.setItem(SHOWN_DATE_KEY, today);
  }, []);

  const dismiss = () => {
    localStorage.setItem(SEEN_KEY, String(LATEST_CHANGELOG_ID));
    if (shownAnnouncementIds.length > 0) {
      const dismissed = readDismissedAnnouncements();
      for (const id of shownAnnouncementIds) dismissed.add(id);
      try {
        localStorage.setItem(DISMISSED_ANNOUNCE_KEY, JSON.stringify([...dismissed]));
      } catch { /* storage unavailable: it will simply re-show next session */ }
    }
    setEntries([]);
    setPageIndex(0);
  };

  if (entries.length === 0) return null;

  const entry = entries[pageIndex];
  const isFirstPage = pageIndex === 0;
  const isLastPage = pageIndex === entries.length - 1;

  // Rendered via createPortal to document.body -- see DividendLedgerModal.jsx's
  // comment for why: a .glass-panel ancestor's backdrop-filter otherwise
  // turns this modal's position:fixed into being relative to that (possibly
  // very tall, scrolled-down) panel instead of the real viewport.
  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={dismiss}>
      <div className="modal-content" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={20} style={{ color: 'var(--accent-text)' }} />
            <span>What's New</span>
            {entries.length > 1 && (
              <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '600', color: 'var(--text-muted)' }}>
                {pageIndex + 1} of {entries.length}
              </span>
            )}
          </h2>
          <button
            aria-label="Close"
            onClick={dismiss}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, flexShrink: 0 }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ margin: '20px 0' }}>
          {/* Headline + one-sentence summary; any long-form items sit behind
              the entry's own Details expander. Keyed by id so the expander
              collapses again when paging. */}
          {entry.digest ? (
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '700', margin: '0 0 8px', color: 'var(--text-primary)' }}>
                {entry.count} updates since your last visit
              </h3>
              <p style={{ margin: '0 0 8px', fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>The {entry.newest.length} newest:</p>
              <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                {entry.newest.map((e) => (
                  <li key={e.id}><strong style={{ color: 'var(--text-primary)' }}>{e.title}.</strong> {e.summary}</li>
                ))}
              </ul>
              <p style={{ margin: '12px 0 0', fontSize: 'var(--fs-sm)' }}>
                <a href="#/guide/whatsnew" onClick={dismiss} style={{ color: 'var(--accent-text)' }}>See all {entry.count} in Help &rarr; What&rsquo;s New</a>
              </p>
            </div>
          ) : (
            <ChangelogEntry key={entry.id} entry={entry} />
          )}
        </div>

        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', margin: '0 0 16px' }}>
          Full history available anytime under Help &rarr; What&rsquo;s New.
        </p>

        {entries.length > 1 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              className="btn-outline"
              aria-label="Previous update"
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={isFirstPage}
              style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isFirstPage ? 0.4 : 1 }}
            >
              <ChevronLeft size={16} />
            </button>
            {isLastPage ? (
              <button className="btn-primary" onClick={dismiss} style={{ flex: 1 }}>
                Got it
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={() => setPageIndex((p) => Math.min(entries.length - 1, p + 1))}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        ) : (
          <button className="btn-primary" onClick={dismiss} style={{ width: '100%' }}>
            Got it
          </button>
        )}
      </div>
    </div>,
    document.body
  );
};

export default WhatsNewPopup;
