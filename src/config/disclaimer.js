// The legal disclaimer text, in one place.
//
// It appears in four places -- the first-visit modal, a re-readable copy
// opened from Preferences, the always-visible footer line, and the printed
// report's repeating footer -- which is exactly the shape that produced
// the backup-implementation drift this repo already fixed once (see
// context/useFullBackupActions.js). Four hand-maintained copies of a legal
// notice is worse than four copies of a button: they would diverge
// silently, and the version a user actually read would depend on where
// they happened to be standing.
import { BRAND_DOMAIN, BRAND_NAME } from './branding';

export const DISCLAIMER_TITLE = `${BRAND_NAME} Educational Tool`;

// The full text. Shown in the first-visit modal, and again verbatim
// whenever the user reopens it from Preferences -- the point of making it
// re-readable is that it is the *same* text they agreed to, not a summary
// of it.
export const DISCLAIMER_PARAGRAPHS = [
  `Welcome to ${BRAND_DOMAIN}. This application is designed solely for educational, informational, and scenario-modeling purposes.`,
  'All calculations, historical stress tests, and Monte Carlo probability outputs are mathematical projections based on the assumptions you enter. They do not constitute actual professional financial, legal, tax, or investment advice.',
  'Market returns vary and tax law changes over time, and past performance is not a guarantee of future outcomes.',
];

// Shown on the accept button the first time only. Reopening later is a
// read, not a re-acceptance -- re-prompting someone to agree to terms they
// already agreed to implies something changed when nothing has.
export const DISCLAIMER_ACCEPT_LABEL = 'I understand and accept';

// One line, for the footer that sits under every tab. Deliberately shorter
// than the printed version below: this one is on screen permanently, and a
// paragraph of legal text in the corner of every page stops being read
// within a day.
export const DISCLAIMER_SHORT =
  'Educational modeling tool — not financial, legal, tax, or investment advice.';

// The printed report's repeating footer. Longer than DISCLAIMER_SHORT
// because a printed page may be read on its own, months later, by someone
// who never saw the app -- possibly the very advisor the tool is telling
// people to consult.
export const DISCLAIMER_PRINT =
  `${BRAND_DOMAIN} is an educational tool only and does not provide financial, legal, tax, or investment advice. ` +
  'All figures are mathematical projections based on the assumptions entered and will differ from actual results ' +
  'as markets, IRS rules, and tax law change over time.';
