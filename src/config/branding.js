// Single source of truth for the app's brand name, used everywhere the UI
// would otherwise spell it out as a literal string. Centralizing it here is
// what made the 2026-09-11 rename to OutlastRetirement a two-line change
// instead of a hunt across every component.
//
// Historical changelog entries keep the old name on purpose: they describe
// what shipped when it shipped, and rewriting them would falsify the record.
import { NEW_HOST } from './migration';

export const BRAND_NAME = 'OutlastRetirement';

// The locked privacy line (settled 2026-09-28). Word for word, everywhere it
// appears: the static pages can't import this, so privacyPromise.test.js
// checks each of them for the exact text.
export const PRIVACY_PROMISE = 'Local-first retirement education. Your numbers never leave your device.';
// The HOST the site is served from, shown to users in the disclaimer they
// accept on first visit and in the printed report's footer.
//
// It DID move. This said cashflowengine.app -- true when the product was
// renamed in the 2026-09-11 cutover and the old host was still serving, and
// wrong from the day outlastretirement.com went live, which left the
// first-visit modal opening "Welcome to cashflowengine.app" on a site of
// another name. migration.js already treats that host as LEGACY, so the two
// files were contradicting each other.
//
// Read from migration.js rather than restated, because that file is where
// the move is described and a second copy is exactly how this drifted.
// Do not set this to a name -- anything shown from it reads as a URL, and an
// invented one would not resolve.
export const BRAND_DOMAIN = NEW_HOST;

// The legal owner of the software, as distinct from the brand name above.
// BRAND_NAME is what the product is called; this is who holds the
// copyright, and the two are not interchangeable -- a copyright notice
// naming a product rather than a person or company identifies nobody.
export const LEGAL_ENTITY = 'OutlastRetirement LLC';

// One copyright line, for the app footer, Preferences, and anywhere else
// the notice appears. The year is FIXED, not `new Date().getFullYear()`:
// that reads the visitor's clock, so a device set to 2031 would print a
// notice for a year the software was not published in. Bump it by hand
// when a year's worth of new material actually ships.
export const COPYRIGHT_NOTICE = `© 2026 ${LEGAL_ENTITY}. All rights reserved.`;

// Where the two legal pages live. Static documents outside the SPA, so
// they are plain hrefs everywhere they appear and never router pushes.
export const TERMS_URL = '/terms';
export const PRIVACY_URL = '/privacy';
// The accessibility statement: what is supported, what was tested, what
// still falls short, and where to report a barrier.
export const ACCESSIBILITY_URL = '/accessibility';
