import { CONTACT_EMAIL } from './premiumOffering';
// Announcements: timed broadcast messages shown through the What's New popup,
// kept SEPARATE from the permanent CHANGELOG (release notes) on purpose
// (changelog 150). Two reasons they are not just changelog entries:
//   - a QUEUED future message must not appear anywhere until its window
//     opens -- the Guide's What's New page renders every changelog entry, so
//     a future release note would leak early;
//   - an EXPIRED message should stop showing and not clutter the permanent
//     history forever.
// This is still 100% client-side: no accounts, no server, no network. A
// message reaches whoever opens the app while it is active, and Local-Only
// Mode changes nothing.
//
// To send a message, add an entry here and deploy. Fields:
//   id                 REQUIRED, a stable unique string (e.g. 'domain-move-2026-10').
//                      Dismissal is tracked by this id, so never reuse one.
//   title, summary     REQUIRED. summary is one plain sentence (the headline).
//   items              OPTIONAL array of detail bullets (behind a Details
//                      expander, same as a changelog entry). **bold** supported.
//   tone               OPTIONAL 'notice' | 'action' | 'success' -- a colored
//                      background (ChangelogEntry.CHANGELOG_TONES).
//   showFrom           OPTIONAL 'YYYY-MM-DD' inclusive. Omit to start immediately.
//                      A future date QUEUES the message.
//   showUntil          OPTIONAL 'YYYY-MM-DD' inclusive. Omit for no expiry.
//   showToNewVisitors  OPTIONAL, default true. When true the message reaches
//                      brand-new visitors too (who are otherwise shown no
//                      history). Set false to limit it to returning users.
//
// Example (leave commented until you actually want to send it):
//   {
//     id: 'domain-move-2026-10',
//     tone: 'action',
//     title: 'OutlastRetirement is moving to a new address',
//     summary: 'From October 15 the app lives at its new domain -- back up your plan first.',
//     items: ['**Export a backup now** (Preferences -> Your Data) so you can restore it at the new address.'],
//     showFrom: '2026-10-01',
//     showUntil: '2026-10-20',
//   },
export const ANNOUNCEMENTS = [
  {
    // The timeless welcome that replaced the dated 'welcome-beta-2026-09'
    // (which expired 2026-09-28). No end date: it says nothing that
    // expires. A new id, so people who dismissed the first one see this once.
    id: 'welcome-2026-09-30',
    tone: 'notice',
    title: 'Welcome to OutlastRetirement',
    summary: 'We’re in beta, and Premium is invite-only and free while we are. Email us for an access key.',
    items: [
      `**Premium** adds four areas to the free planner: **Detailed Holdings**, **Retirement Spending**, **Readiness in Full**, and **Relocation & Residency**. Email **${CONTACT_EMAIL}** and we’ll send the steps to turn it on.`,
      'An access key lasts 30 days and is renewed by email.',
      'Feedback is welcome at the same address; we read every note.',
    ],
    showFrom: '2026-09-30',
    showToNewVisitors: true,
  },
];

// Local calendar day as 'YYYY-MM-DD' -- ISO date strings compare correctly
// with plain <=/>= so no Date math is needed for the window check.
function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// True if `a` is a well-formed announcement whose date window includes
// `today` ('YYYY-MM-DD'). Both bounds inclusive; either may be omitted (no
// start = show immediately, no end = never expires). Pure and exported so
// the window logic is tested directly rather than only through the popup.
export function isAnnouncementActiveOn(a, today) {
  return Boolean(
    a && a.id
    && (!a.showFrom || today >= a.showFrom)
    && (!a.showUntil || today <= a.showUntil)
  );
}

// The announcements active today. Does NOT consider dismissal -- the popup
// layers that on top.
export function activeAnnouncements(now = new Date()) {
  const today = localDateStr(now);
  return ANNOUNCEMENTS.filter((a) => isAnnouncementActiveOn(a, today));
}
