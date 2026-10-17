import React, { useState, useRef, useLayoutEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import SimulationContext from '../context/SimulationContext';

// The popup is rendered into document.body with fixed positioning
// (changelog 272). It used to be an absolutely positioned child of the
// trigger, which put it inside the main column's stacking context: a
// tooltip near the left edge slid underneath the sticky sidebar and was
// cut off mid-word (John's screenshots of the Trial seed and Monte Carlo
// help), and one inside a scrolling table was clipped by the wrapper. A
// portal escapes both; the popup is placed from the trigger's rectangle,
// clamped to the viewport, with the arrow kept over the trigger.
//
// A popup is a definition, not an essay (changelog 280): a sentence or two
// that says what the thing is. When `more` is set, the popup ends with a
// "Look it up" link that opens the Input Dictionary with that term in its
// search box, where the full treatment lives. The link makes the popup
// interactive, so leaving the trigger closes it after a short grace period
// that entering the popup cancels.
//
// The portal puts the popup at the end of <body>, which is where Tab would
// have found the link: after every other control on the page, by which
// time the popup had long closed. So the trigger hands focus to the link
// itself: Tab with the popup open moves into it, and Tab, Shift+Tab or
// Escape from the link closes the popup and returns focus to the trigger,
// where the next Tab carries on through the page as usual. Nothing is ever
// left focused inside a popup that has closed.
//
// The visible label stays the trigger's accessible name; the definition is
// its description (aria-description), not an aria-label that would replace
// the words on screen (WCAG 2.5.3). The attribute rather than a hidden
// copy of the text: a hidden span inside a table header or a field label
// would turn up in textContent, which the Dictionary search and the
// settings-finder compare against.
const MARGIN = 8;
const GAP = 8;
const Z = 1500; // above the sidebar (950) and status bar, below modals (1999+)
const CLOSE_DELAY_MS = 350;

export default function Tooltip({ text, children, position = 'top', more }) {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const moreRef = useRef(null);
  const closeTimer = useRef(null);
  const sim = useContext(SimulationContext);
  const openDictionary = sim && sim.openDictionary;
  // `more` may be the search term itself or `true` for the label text.
  const term = more === true ? (typeof children === 'string' ? children : null) : more;
  const showMore = Boolean(term && openDictionary);
  const scheduleClose = () => {
    if (!showMore) { setIsVisible(false); return; }
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setIsVisible(false), CLOSE_DELAY_MS);
  };
  const cancelClose = () => clearTimeout(closeTimer.current);
  // Close and put focus back on the trigger (from the link, by keyboard).
  // Focusing the trigger would reopen the popup through its onFocus, so
  // that one focus event is told to leave it closed.
  const returning = useRef(false);
  const closeToTrigger = () => {
    cancelClose();
    setIsVisible(false);
    returning.current = true;
    triggerRef.current?.focus();
    returning.current = false;
  };
  // Where the popup goes, in viewport pixels, and where its arrow points.
  const [place, setPlace] = useState(null);
  const isBottom = position === 'bottom';

  useLayoutEffect(() => {
    if (!isVisible) { setPlace(null); return undefined; }
    const trigger = triggerRef.current;
    const popup = popupRef.current;
    if (!trigger || !popup) return undefined;
    const compute = () => {
      const t = trigger.getBoundingClientRect();
      const p = popup.getBoundingClientRect();
      // jsdom rects are zeros: place at the origin and stop, rather than
      // "correct" from fake geometry.
      if (p.width === 0 && t.width === 0) { setPlace({ left: 0, top: 0, arrowLeft: 0 }); return; }
      const anchorX = t.left + t.width / 2;
      let left = anchorX - p.width / 2;
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - MARGIN - p.width));
      // The measured box is the outer wrapper, whose padding on the trigger
      // side IS the gap -- so the popup sits flush against the trigger and
      // the mouse never crosses dead space on its way to the link.
      const top = isBottom ? t.bottom : t.top - p.height;
      setPlace({ left, top, arrowLeft: Math.max(10, Math.min(p.width - 10, anchorX - left)) });
    };
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [isVisible, text, isBottom]);

  const popup = isVisible && typeof document !== 'undefined' ? createPortal(
    <div
      ref={popupRef}
      role="tooltip"
      style={{
        position: 'fixed',
        left: place ? place.left : 0,
        top: place ? place.top : 0,
        visibility: place ? 'visible' : 'hidden',
        // The gap between trigger and card is padding on this wrapper, so
        // it is part of the hover target (see compute above).
        ...(isBottom ? { paddingTop: `${GAP}px` } : { paddingBottom: `${GAP}px` }),
        zIndex: Z,
        pointerEvents: showMore ? 'auto' : 'none',
        // .glass-panel transitions `all`, which animated left/top from the
        // (0, 0) first paint to the computed spot: every popup flew in from
        // the top-left corner. The card must simply appear where it goes.
        transition: 'none',
        animation: 'none',
      }}
      onMouseEnter={showMore ? cancelClose : undefined}
      onMouseLeave={showMore ? scheduleClose : undefined}
    >
      <div
        className="tooltip-content glass-panel"
        style={{
          position: 'relative',
          padding: '12px 16px',
          width: 'max-content',
          // min() keeps the popup readable on narrow viewports, where a fixed
          // 300px could be wider than the whole window.
          maxWidth: 'min(300px, calc(100vw - 32px))',
          fontSize: '14px',
          color: 'var(--text-primary)',
          lineHeight: '1.5',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
          // .glass-panel's translucent background let busy content bleed
          // through under the text; a solid theme color fixes that.
          background: 'var(--bg-secondary)',
          transition: 'none',
          animation: 'none',
        }}
      >
        {text}
        {showMore && (
          <div style={{ marginTop: '8px' }}>
            <button
              ref={moreRef}
              type="button"
              className="tooltip-more"
              onClick={(e) => { e.stopPropagation(); setIsVisible(false); openDictionary(term); }}
              onFocus={cancelClose}
              onBlur={scheduleClose}
              onKeyDown={(e) => {
                if (e.key === 'Tab' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeToTrigger(); }
              }}
              style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: '13px', color: 'var(--accent-text)', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Look it up in the Input Dictionary
            </button>
          </div>
        )}
        <div style={{
          position: 'absolute',
          ...(isBottom ? { bottom: '100%' } : { top: '100%' }),
          left: place ? place.arrowLeft : '50%',
          transform: 'translateX(-50%)',
          borderWidth: '6px',
          borderStyle: 'solid',
          borderColor: isBottom
            ? 'transparent transparent var(--card-border) transparent'
            : 'var(--card-border) transparent transparent transparent'
        }} />
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <span
      ref={triggerRef}
      className="tooltip-container"
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'help' }}
      onMouseEnter={() => { cancelClose(); setIsVisible(true); }}
      onMouseLeave={scheduleClose}
      onClick={() => setIsVisible(!isVisible)}
      onFocus={() => { if (returning.current) return; cancelClose(); setIsVisible(true); }}
      onBlur={scheduleClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsVisible(v => !v); }
        else if (e.key === 'Escape') { setIsVisible(false); }
        else if (e.key === 'Tab' && !e.shiftKey && isVisible && showMore && moreRef.current) { e.preventDefault(); moreRef.current.focus(); }
      }}
      tabIndex={0}
      role="button"
      aria-expanded={showMore ? isVisible : undefined}
      aria-description={typeof text === 'string' ? text : undefined}
    >
      <span style={{ borderBottom: '1px dashed var(--text-muted)' }}>{children}</span>
      {/* flexShrink 0: in a narrow table header the flex row squeezed the
          icon below 14px while wide headers kept it whole, so the marks
          came out in assorted sizes across one row. One size everywhere. */}
      <HelpCircle size={14} style={{ color: 'var(--accent-text)', flexShrink: 0, width: '14px', height: '14px' }} />
      {popup}
    </span>
  );
}
