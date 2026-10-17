// Scroll lock shared by every open dialog (a counter, so closing a dialog
// opened on top of another does not unlock the page early).
let lockCount = 0;
let savedOverflow = '';
export function lockPageScroll() {
  if (typeof document === 'undefined') return () => {};
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('dialog-open');
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = savedOverflow;
      document.documentElement.classList.remove('dialog-open');
    }
  };
}
