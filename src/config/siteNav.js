// The website's header links, one list for every public page (changelog
// 369). The two generators build their headers from it; the handwritten
// pages (home, privacy, terms, verify, accessibility, 404) carry the same
// links, and siteNav.test.js fails if any page's header drifts from this.
// The home page points How it works, Privacy and Free and Premium at its own
// sections; every other page links to them by address. Release notes,
// Terms, Accessibility and Contact stay in the footer.
export const SITE_NAV = Object.freeze([
  { href: '/#how', label: 'How it works' },
  { href: '/learn', label: 'Learn' },
  { href: '/how-the-math-works', label: 'How the math works' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/verify', label: 'Verify it yourself' },
  { href: '/premium', label: 'Free and Premium' },
  { href: '/app/', label: 'Open the app' },
]);

// The home page's in-page targets for the links that have a section there.
export const HOME_NAV_HREF = Object.freeze({ '/#how': '#how', '/privacy': '#privacy', '/premium': '#premium' });
