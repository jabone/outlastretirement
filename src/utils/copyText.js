// Puts text on the clipboard. Resolves true when it got there.
//
// navigator.clipboard needs a secure page and, in some browsers, a recent
// click; where it is missing or refuses, the old route still works: a
// hidden text box, selected, and the browser's own copy command.
export async function copyText(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the text-box route */ }
  try {
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.position = 'fixed';
    box.style.top = '-1000px';
    box.style.opacity = '0';
    document.body.appendChild(box);
    box.select();
    const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
    document.body.removeChild(box);
    return Boolean(ok);
  } catch {
    return false;
  }
}
