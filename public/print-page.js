// The Print button on /how-the-math-works. A file of its own, not inline,
// so the site's Content-Security-Policy keeps script-src 'self' with no
// exceptions (vercel.json). Opening the page with ?print=1 (the app's
// Help -> How the numbers are figured "Print" link) opens the print dialog
// once the page has loaded. Sends nothing anywhere.
(function () {
  var buttons = document.querySelectorAll('[data-print-page]');
  for (var i = 0; i < buttons.length; i += 1) {
    buttons[i].hidden = false;
    buttons[i].addEventListener('click', function () { window.print(); });
  }
  if (/[?&]print=1(&|$)/.test(window.location.search)) {
    window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 300); });
  }
})();
