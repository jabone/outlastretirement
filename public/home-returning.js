// Loaded at the end of the landing page's <body> (index.html). It lives in
// its own file, not inline, so the site's Content-Security-Policy can say
// script-src 'self' with no exceptions (vercel.json).
// A returning visitor already has a plan in this browser. Offer the
// way back in rather than pitching software they already use. This is
// a read of one key and nothing more -- no value is inspected, and
// nothing is sent anywhere, which is the point on a page whose whole
// argument is that we hold nothing. Reading localStorage can throw
// outright in a locked-down browser, so the banner simply never
// appears there.
(function () {
  try {
    if (localStorage.getItem('retire_plan_inputs')) {
      document.getElementById('returning').classList.add('show');
    }
  } catch { /* storage blocked -- no banner, no error */ }

  // The move notice, on the retired host only. Kept in sync with
  // src/config/migration.js by a test -- two copies of a date is
  // exactly the kind of thing that drifts.
  try {
    var legacy = ['cashflowengine.app', 'www.cashflowengine.app'];
    if (legacy.indexOf(window.location.hostname) !== -1
        || new URLSearchParams(window.location.search).get('migration') === 'preview') {
      document.getElementById('moving').hidden = false;
    }
  } catch { /* never let this break the page */ }
})();
