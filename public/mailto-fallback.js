// Loaded at the end of the landing page's <body> (index.html) and by the
// generated Free and Premium page. Its own file, not inline, so the site's
// Content-Security-Policy can say script-src 'self' (vercel.json).
//
// John, 2026-10-12: people clicked "Email for Premium access" and assumed
// the request had gone. On a computer with no mail app set up, or a
// browser once told not to open it, a mailto: link does nothing -- no
// window, no error. The link stays (nothing is sent from this page, which
// is the point), but after a click we watch for the hand-off: a mail app
// or a web-mail tab takes focus away from this page. If that has not
// happened within a moment, a note appears under the link saying nothing
// was sent, with the address, the subject to use and a Copy button. If it
// has, a quieter note shows the address anyway. The app's MailtoLink.jsx
// does the same inside the app.
(function () {
  var WAIT_MS = 1500;
  var links = document.querySelectorAll('a[href^="mailto:"][data-mailto-fallback]');
  if (!links.length) return;

  function parse(href) {
    var rest = href.slice('mailto:'.length);
    var q = rest.indexOf('?');
    var address = q === -1 ? rest : rest.slice(0, q);
    var subject = '';
    if (q !== -1) {
      try { subject = new URLSearchParams(rest.slice(q + 1)).get('subject') || ''; } catch { subject = ''; }
    }
    return { address: decodeURIComponent(address), subject: subject };
  }

  function copyText(text, done) {
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

  function noteFor(link) {
    var note = link.nextElementSibling;
    if (note && note.classList.contains('mailto-note')) return note;
    note = document.createElement('span');
    note.className = 'mailto-note';
    note.setAttribute('role', 'status');
    note.hidden = true;
    var text = document.createElement('span');
    text.className = 'mailto-note-text';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = 'Copy the address';
    note.appendChild(text);
    note.appendChild(btn);
    link.insertAdjacentElement('afterend', note);
    var parsed = parse(link.getAttribute('href'));
    btn.addEventListener('click', function () {
      copyText(parsed.address, function (ok) { btn.textContent = ok ? 'Address copied' : 'Copy the address'; });
    });
    return note;
  }

  function show(link, opened) {
    var parsed = parse(link.getAttribute('href'));
    var note = noteFor(link);
    var text = note.querySelector('.mailto-note-text');
    var subject = parsed.subject ? ' with the subject “' + parsed.subject + '”' : '';
    text.innerHTML = '';
    var lead = document.createElement(opened ? 'span' : 'strong');
    lead.textContent = opened
      ? 'Your email app should have opened. If it did not, nothing has been sent: '
      : 'Your email app did not open, so nothing has been sent. ';
    var addr = document.createElement('strong');
    addr.textContent = parsed.address;
    text.appendChild(lead);
    text.appendChild(document.createTextNode(opened ? 'write to ' : 'Write to '));
    text.appendChild(addr);
    text.appendChild(document.createTextNode(subject + ' from the email you normally use.'));
    note.classList.toggle('mailto-note--nothing', !opened);
    note.hidden = false;
  }

  Array.prototype.forEach.call(links, function (link) {
    link.addEventListener('click', function () {
      var settled = false;
      var timer = setTimeout(function () { if (!settled) { settled = true; cleanup(); show(link, false); } }, WAIT_MS);
      function handedOff() { if (!settled) { settled = true; clearTimeout(timer); cleanup(); show(link, true); } }
      function onVisibility() { if (document.hidden) handedOff(); }
      function cleanup() {
        window.removeEventListener('blur', handedOff);
        document.removeEventListener('visibilitychange', onVisibility);
      }
      window.addEventListener('blur', handedOff);
      document.addEventListener('visibilitychange', onVisibility);
    });
  });
})();
