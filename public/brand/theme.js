// The public pages follow the theme chosen in the app (Preferences ->
// Light / Dark), stored on this device as retire_plan_theme; with no choice
// saved, /brand/site-theme.css follows the device's own setting
// (changelog 368). Reads one local setting, sends nothing anywhere. A file
// of its own, loaded blocking from the <head> so the page paints in the
// right colors, because the site's Content-Security-Policy allows no inline
// script (vercel.json: script-src 'self').
(function () {
  try {
    var t = window.localStorage.getItem('retire_plan_theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch { /* storage blocked: the device setting decides */ }
})();
