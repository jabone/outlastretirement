import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDialogBehavior } from './useDialogBehavior';

// The one shell every overlay in the app opens in: Quick Update, the
// disclaimer (first visit and "Read the full disclaimer"), the Print / PDF
// chooser, the Setup Wizard and onboarding chooser, suggested plan changes,
// the maximized chart. It gives each the same behavior AppDialog has:
//
//  - role="dialog", aria-modal and a label (aria-labelledby an id inside,
//    or aria-label);
//  - focus moves into the dialog when it opens and back to whatever opened
//    it when it closes;
//  - Tab and Shift+Tab stay inside;
//  - Escape closes it, unless `dismissible` is false (the first-visit
//    disclaimer must be accepted, so Escape does nothing there);
//  - the page behind does not scroll while any dialog is open.
//
// Rendered through a portal to document.body for the same reason AppDialog
// is: a .glass-panel ancestor's backdrop-filter would otherwise pin the
// fixed overlay to that panel instead of the viewport.

export default function ModalShell({
  onClose, dismissible = true, closeOnBackdrop = dismissible,
  labelledBy, label, describedBy,
  zIndex, overlayClassName = 'modal-overlay', overlayStyle,
  className = 'modal-content', style, initialFocusSelector, children,
}) {
  const contentRef = useRef(null);
  const onKeyDown = useDialogBehavior(contentRef, { onClose, dismissible, initialFocusSelector });
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className={overlayClassName}
      style={{ ...(zIndex !== undefined ? { zIndex } : {}), ...overlayStyle }}
      onClick={closeOnBackdrop && onClose ? onClose : undefined}
    >
      <div
        ref={contentRef}
        className={className}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        aria-describedby={describedBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
