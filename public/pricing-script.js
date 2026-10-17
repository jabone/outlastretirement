// The Copy button on /pricing-script. It lives in its own file, not inline,
// so the site's Content-Security-Policy can say script-src 'self' with no
// exceptions (vercel.json). It reads the script from the page itself and
// sends nothing anywhere.
(function () {
  var button = document.getElementById('copy-script');
  var status = document.getElementById('copy-status');
  var source = document.getElementById('pricing-script');
  if (!button || !source) return;

  function say(text) { if (status) status.textContent = text; }
  function done() {
    button.textContent = 'Copied';
    say('The script is on your clipboard. Paste it over the old one in your Sheet’s Apps Script editor.');
  }
  function byHand() {
    // The older route: select the text and use the browser's copy command.
    try {
      var range = document.createRange();
      range.selectNodeContents(source);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      if (document.execCommand && document.execCommand('copy')) { done(); return; }
    } catch { /* fall through */ }
    say('The script is selected below. Press Ctrl+C (Cmd+C on a Mac) to copy it.');
  }

  button.addEventListener('click', function () {
    var text = source.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, byHand);
    } else {
      byHand();
    }
  });
})();
