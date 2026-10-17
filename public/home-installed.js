// Loaded blocking from the <head> of the landing page (index.html). It lives
// in its own file, not inline, so the site's Content-Security-Policy can say
// script-src 'self' with no exceptions (vercel.json).
// An INSTALLED app must never open a brochure. Anyone who installed
// before the app moved to /app still has start_url '/' baked into
// their install, so their app icon lands here. Send them where they
// meant to go. The trailing slash is not cosmetic -- see the CTA note
// in index.html; '/app' resolves only through a server rewrite, and
// '/app/' resolves on its own. This sits in the head, blocking, on
// purpose: run from
// the end of the body it would redirect only after the marketing page
// had already painted in their app window.
(function () {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true) {
      window.location.replace('/app/');
    }
  } catch { /* matchMedia unavailable -- fall through to the page */ }
})();
