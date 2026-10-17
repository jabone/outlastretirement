import { useState, cloneElement } from 'react';
import { createPortal } from 'react-dom';

// Instant-hover tooltip for wrapping an existing element (button, nav icon,
// grid cell, etc.) that currently uses a native `title="..."` attribute.
//
// Usage:  <HoverTooltip text="Maximize Chart"><button>...</button></HoverTooltip>
//
// Unlike the native title attribute, this shows immediately on hover (no
// browser-native delay) and works consistently across desktop and mobile
// WebViews. Unlike the `Tooltip` component (used for field-label "?" help
// definitions), this doesn't add any visible icon or affordance — it's a
// drop-in swap for `title=` on elements that already have their own hover
// target (buttons, nav items, chart cells).
//
// Also reaches keyboard and screen-reader users, which mouse-only hover
// handlers miss entirely:
//  - onFocus/onBlur show the same visual tooltip when the element is
//    reached via Tab, positioned from the element's own bounding box since
//    there's no mouse coordinate to anchor to.
//  - aria-label={text} is applied to the child (unless it already has one)
//    so screen readers announce the label regardless of whether the visual
//    tooltip is showing — this matters most for icon-only buttons, which
//    otherwise have no accessible name once a native title= is removed.
//  - `labeled`: the child already shows its name as text (a nav item, a
//    button with a caption). Then the tip must NOT become its aria-label:
//    a screen reader would announce the long tip in place of the visible
//    words, and a voice-control user saying the words they see would find
//    no control by that name (WCAG 2.5.3, label in name). The tip is
//    attached as a description instead (aria-description), read after the
//    name; an attribute, not a hidden copy of the text, so nothing joins
//    the control's textContent. If the caller also hides the visible text
//    at times (the minimized sidebar), it passes its own aria-label for
//    those times.
// Touch devices don't get a "peek" interaction (there's no touch equivalent
// of hover that doesn't also trigger the element's own tap action), but the
// aria-label still gives screen-reader users on touch the same information.
//
// Renders via a portal directly into document.body so positioning is never
// broken by an ancestor element with a CSS `transform` (which changes the
// containing block for position:fixed descendants).
//
// Below the app's mobile breakpoint the tooltip is switched off entirely --
// it's a hover affordance that doesn't translate to touch (there's no "peek
// without activating" gesture on a phone), and showing it on tap-focus with
// nothing to dismiss it was the original bug report. MOBILE_BREAKPOINT is
// kept as a single constant since it's checked from multiple handlers and
// should track the app's other max-width:768px breakpoints.
const MOBILE_BREAKPOINT = 768;
const isMobileViewport = () =>
  typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT;

const HoverTooltip = ({ text, children, offsetX = 10, offsetY = -30, labeled = false }) => {
  const [pos, setPos] = useState(null);

  if (!text) return children;

  const handleMove = (e) => { if (isMobileViewport()) return; setPos({ x: e.clientX, y: e.clientY }); };
  const handleLeave = () => setPos(null);
  const handleFocus = (e) => {
    if (isMobileViewport()) return;
    // :focus-visible only matches when the browser thinks focus arrived via
    // keyboard (or otherwise non-pointer) navigation -- it does NOT match
    // when an element is focused as a side effect of a mouse click or touch
    // tap. Without this check, tapping any nav item (which both activates it
    // AND focuses it) popped this tooltip open with nothing to dismiss it,
    // since there's no mouseleave/blur on touch. Keyboard users tabbing
    // through still get the tooltip exactly as before (on desktop widths).
    if (!e.target.matches(':focus-visible')) return;
    const rect = e.target.getBoundingClientRect();
    setPos({ x: rect.left, y: rect.top });
  };

  const existingLabel = children.props['aria-label'] || children.props['aria-labeledby'];

  return (
    <>
      {cloneElement(children, {
        onMouseEnter: (e) => { children.props.onMouseEnter?.(e); handleMove(e); },
        onMouseMove: (e) => { children.props.onMouseMove?.(e); handleMove(e); },
        onMouseLeave: (e) => { children.props.onMouseLeave?.(e); handleLeave(); },
        onFocus: (e) => { children.props.onFocus?.(e); handleFocus(e); },
        onBlur: (e) => { children.props.onBlur?.(e); handleLeave(); },
        ...(labeled
          ? { 'aria-description': text }
          : existingLabel ? {} : { 'aria-label': text }),
      })}
      {pos && createPortal(
        <div style={{
          position: 'fixed',
          // Near the right edge, open leftward so the card is never cut off
          // (a maximize button sits flush right in every panel header).
          ...(typeof window !== 'undefined' && pos.x > window.innerWidth - 240
            ? { right: Math.max(8, window.innerWidth - pos.x + offsetX) }
            : { left: pos.x + offsetX }),
          top: pos.y + offsetY,
          background: 'var(--or-navy)',
          border: '1px solid var(--card-border)',
          borderRadius: '8px',
          padding: '6px 10px',
          fontSize: 'var(--fs-sm)',
          fontWeight: '600',
                    // This card is dark in BOTH themes, so it cannot take a theme
          // token for its text: --text-primary flips to navy in light mode
          // and the label goes dark-on-dark. Paper is the ink for a
          // permanently dark surface -- the same reason the Recharts
          // tooltip rules in index.css force it too.
          color: 'var(--or-paper)',
          pointerEvents: 'none',
          zIndex: 9999,
          // maxWidth + normal wrapping (rather than nowrap) so longer
          // descriptions — like the sidebar nav tooltips — wrap onto
          // multiple lines instead of rendering as one very wide unbroken
          // line that could run off-screen. Short labels are well under
          // this width already, so they still render on a single line.
          whiteSpace: 'normal',
          maxWidth: '260px',
          lineHeight: '1.4',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {text}
        </div>,
        document.body
      )}
    </>
  );
};

export default HoverTooltip;
