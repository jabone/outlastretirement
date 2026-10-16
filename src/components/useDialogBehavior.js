import { useEffect, useRef } from 'react';
import { lockPageScroll } from './lockPageScroll';

export const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Focus-in, focus-return, scroll lock, Escape and the Tab trap for a
// dialog element the caller renders itself. Returns the onKeyDown handler
// to put on that element.
export function useDialogBehavior(contentRef, { onClose, dismissible = true, initialFocusSelector } = {}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    const unlock = lockPageScroll();
    const el = contentRef.current;
    if (el) {
      const target = (initialFocusSelector && el.querySelector(initialFocusSelector))
        || el.querySelector('[data-autofocus]')
        || el;
      // preventScroll: a tall dialog should open at its top.
      target.focus?.({ preventScroll: true });
    }
    return () => {
      unlock();
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (e) => {
    if (e.key === 'Escape') {
      if (dismissible && onCloseRef.current) {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
      return;
    }
    if (e.key === 'Tab' && contentRef.current) {
      const focusable = Array.from(contentRef.current.querySelectorAll(FOCUSABLE_SELECTOR))
        .filter((n) => !n.closest('[hidden], .guided-hidden'));
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === contentRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
}
