import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info } from 'lucide-react';
import { lockPageScroll } from './lockPageScroll';
import SwitchRow from './SwitchRow';

// In-app replacement for window.alert / window.confirm / window.prompt.
// Native dialogs block the JS thread entirely, which freezes automated
// testing tools and behaves inconsistently inside mobile WebViews
// (Capacitor iOS/Android). This renders as a normal React modal instead,
// using the same .modal-overlay / .modal-content / .btn-primary / .btn-outline
// styling as the rest of the app.
//
// Rendered via createPortal straight to document.body (see every other
// modal-overlay component for the same fix) -- every page in this app is
// wrapped in a .glass-panel, and .glass-panel's backdrop-filter creates a
// new containing block for any position:fixed descendant (a real CSS
// quirk, not a typo -- backdrop-filter/filter do this same as transform).
// Without the portal, .modal-overlay's "fixed" top/bottom end up pinned to
// that tall glass-panel's box instead of the actual viewport, so on a long
// scrolled page the dialog can render far off the visible screen.
//
// Driven by App.jsx via showAlert / showConfirm / showPrompt helpers exposed
// through SimulationContext, each of which returns a Promise so call sites
// can keep an async/`.then()` shape similar to the native calls they replace.
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Two optional extras for confirm dialogs, both opt-in so every existing
// call site behaves exactly as before:
//   toggle: { label, hint, defaultOn } -- one on/off choice inside the
//     dialog (a SwitchRow, per the control vocabulary). When present,
//     Confirm resolves { confirmed: true, toggle: <bool> } instead of
//     true; Cancel still resolves false.
//   requireText: 'ERASE' -- the confirm button stays disabled until that
//     exact word is typed (case-insensitive). For the one action that
//     cannot be undone at all.
const AppDialog = ({ dialog, onClose }) => {
  const [value, setValue] = useState('');
  const [toggleOn, setToggleOn] = useState(false);
  const [typed, setTyped] = useState('');
  const inputRef = useRef(null);
  const contentRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  // The page behind stays put while a dialog is open (the Reset Plan
  // confirmation used to let it scroll).
  useEffect(() => (dialog ? lockPageScroll() : undefined), [dialog]);

  useEffect(() => {
    if (dialog?.type === 'prompt') {
      setValue(dialog.defaultValue || '');
    }
    setToggleOn(Boolean(dialog?.toggle?.defaultOn));
    setTyped('');
  }, [dialog]);

  // Move focus into the dialog when it opens (prompt gets its input; alert/
  // confirm get the confirm button), and restore focus to whatever was
  // focused before the dialog opened once it closes — without this, focus
  // is left on an element that may be hidden behind the overlay.
  useEffect(() => {
    if (dialog) {
      previouslyFocusedRef.current = document.activeElement;
      if (dialog.type === 'prompt' && inputRef.current) {
        const el = inputRef.current;
        el.focus();
        el.select();
      } else if (contentRef.current && dialog.requireText) {
        const typeBox = contentRef.current.querySelector('#app-dialog-require-text');
        (typeBox || contentRef.current).focus();
      } else if (contentRef.current) {
        const confirmBtn = contentRef.current.querySelector('[data-dialog-confirm]');
        (confirmBtn || contentRef.current).focus();
      }
    } else if (previouslyFocusedRef.current) {
      previouslyFocusedRef.current.focus?.();
      previouslyFocusedRef.current = null;
    }
  }, [dialog]);

  if (!dialog) return null;

  const typedOk = !dialog.requireText || typed.trim().toUpperCase() === String(dialog.requireText).toUpperCase();
  const handleConfirm = () => {
    if (!typedOk) return;
    if (dialog.type === 'confirm' && dialog.toggle) {
      onClose({ confirmed: true, toggle: toggleOn });
      return;
    }
    onClose(dialog.type === 'prompt' ? value : true);
  };
  const handleCancel = () => {
    onClose(dialog.type === 'prompt' ? null : false);
  };

  // Keyboard handling: Enter confirms, Escape cancels, and Tab/Shift+Tab are
  // trapped inside the dialog so focus can't land on elements hidden behind
  // the overlay.
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.key === 'Tab' && contentRef.current) {
      const focusable = Array.from(contentRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return createPortal(
    <div
      className="modal-overlay"
      style={{ zIndex: 1400 }}
      onClick={dialog.type === 'alert' ? handleConfirm : handleCancel}
    >
      <div
        ref={contentRef}
        className="modal-content"
        style={{ maxWidth: '440px' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
        tabIndex={-1}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: dialog.type === 'prompt' ? '16px' : '20px' }}>
          {dialog.danger ? (
            <AlertTriangle size={22} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
          ) : (
            <Info size={22} style={{ color: 'var(--accent-text)', flexShrink: 0, marginTop: '2px' }} />
          )}
          {/* minWidth 0 lets this flex child shrink below its content, and
              overflowWrap breaks a long unbreakable string (a Live Pricing
              URL in the restore confirmation) instead of widening the
              dialog past the window. */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 id="app-dialog-title" style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)' }}>
              {dialog.title}
            </h3>
            <p id="app-dialog-message" style={{ margin: '8px 0 0', fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: '1.5', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
              {dialog.message}
            </p>
          </div>
        </div>

        {dialog.type === 'confirm' && dialog.toggle && (
          <SwitchRow
            id="app-dialog-toggle"
            checked={toggleOn}
            onChange={(on) => setToggleOn(on)}
            hint={dialog.toggle.hint}
            style={{ marginBottom: '16px' }}
          >
            {dialog.toggle.label}
          </SwitchRow>
        )}

        {dialog.type === 'confirm' && dialog.requireText && (
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="app-dialog-require-text" style={{ display: 'block', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Type {dialog.requireText} to confirm
            </label>
            <input
              id="app-dialog-require-text"
              type="text"
              autoComplete="off"
              className="form-input"
              style={{ width: '100%' }}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        )}

        {dialog.type === 'prompt' && (
          <input
            ref={inputRef}
            aria-labelledby="app-dialog-title"
            aria-describedby="app-dialog-message"
            // 'password' for the backup-file password prompts (changelog
            // 143), so the value is masked; every other prompt is text.
            type={dialog.inputType === 'password' ? 'password' : 'text'}
            autoComplete={dialog.inputType === 'password' ? 'off' : undefined}
            className="form-input"
            style={{ width: '100%', marginBottom: '20px' }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {dialog.type !== 'alert' && (
            <button className="btn-outline" onClick={handleCancel} style={{ padding: '10px 20px', minHeight: 'auto' }}>
              {dialog.cancelLabel || 'Cancel'}
            </button>
          )}
          {/* Optional third path for confirm dialogs (opts.altLabel on
              showConfirm): resolves the promise with the string 'alt'
              instead of a boolean. Existing boolean call sites are
              unaffected — they never pass altLabel, so the button never
              renders, and confirm/cancel still resolve true/false. First
              use: Reset offering "explore the demo instead". */}
          {dialog.type === 'confirm' && dialog.altLabel && (
            <button className="btn-outline" onClick={() => onClose('alt')} style={{ padding: '10px 20px', minHeight: 'auto', borderColor: 'var(--accent-primary)', color: 'var(--accent-text)' }}>
              {dialog.altLabel}
            </button>
          )}
          <button
            className={dialog.danger ? 'btn-primary btn-danger' : 'btn-primary'}
            data-dialog-confirm
            disabled={!typedOk}
            style={{ padding: '10px 20px', minHeight: 'auto' }}
            onClick={handleConfirm}
          >
            {dialog.type === 'alert' ? 'OK' : (dialog.confirmLabel || 'Confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AppDialog;
