// Copy buttons on the static site pages (the "Ask for Premium by email"
// block): a button with data-copy="..." copies that text and says so.
// Its own file, not inline, so the site's Content-Security-Policy can say
// script-src 'self' (vercel.json).
(function () {
  function copy(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      return;
    }
    try {
      var box = document.createElement('textarea');
      box.value = text; box.setAttribute('readonly', '');
      box.style.position = 'fixed'; box.style.top = '-1000px'; box.style.opacity = '0';
      document.body.appendChild(box); box.select();
      var ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(box);
      done(Boolean(ok));
    } catch { done(false); }
  }
  Array.prototype.forEach.call(document.querySelectorAll('button[data-copy]'), function (btn) {
    var label = btn.textContent;
    btn.addEventListener('click', function () {
      copy(btn.getAttribute('data-copy'), function (ok) {
        btn.textContent = ok ? 'Copied' : 'Select and copy it';
        setTimeout(function () { btn.textContent = label; }, 2500);
      });
    });
  });
})();
