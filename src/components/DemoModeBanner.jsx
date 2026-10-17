import React, { useState, useEffect, useRef } from 'react';
import { FlaskConical, X } from 'lucide-react';
import { exitDemoMode, demoHousehold } from '../utils/demoMode';

// The always-visible "you are in the demo" strip (see utils/demoMode.js
// for the enter/exit contract). Deliberately NOT dismissible without
// exiting -- a user who forgets they're looking at the Carters and starts
// planning their life around a fictional $890k IRA is the failure mode
// this banner exists to prevent. Fixed to the top so it survives every
// tab, and kept to one line so it informs without shouting.
const DemoModeBanner = () => {
  const [exiting, setExiting] = useState(false);
  // Read once: the household cannot change without a reload.
  const [names] = useState(() => (demoHousehold() || { names: 'Sam & Riley Carter' }).names);
  const bannerRef = useRef(null);

  // The banner is position:fixed, so on its own it would cover the top of
  // the page -- including the sidebar's logo (caught by the owner from a
  // screenshot). Instead of overlaying, publish the banner's real height
  // as a CSS variable that index.css uses to push the whole layout down
  // (.app-container padding-top, .sidebar sticky offset, .mobile-topbar
  // top). Measured, not hardcoded, because the text wraps to two lines on
  // narrow windows. jsdom guard: getBoundingClientRect is a zero-stub
  // there (repo gotcha #1), so a zero measurement is simply not applied
  // -- no loop risk, the effect runs on mount + resize only.
  useEffect(() => {
    const apply = () => {
      const h = bannerRef.current ? Math.ceil(bannerRef.current.getBoundingClientRect().height) : 0;
      if (h > 0) document.documentElement.style.setProperty('--demo-banner-offset', `${h}px`);
    };
    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      document.documentElement.style.removeProperty('--demo-banner-offset');
    };
  }, []);

  const handleExit = () => {
    setExiting(true);
    exitDemoMode(); // puts storage back as it was on entry, then reloads
  };

  return (
    <div
      ref={bannerRef}
      role="status"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1400, // above modals (1300) -- the demo state outranks everything
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        padding: '7px 14px',
        // A deeper teal than the accent so white text clears 4.5:1 (7:1).
        background: '#1D625E',
        color: '#FFFFFF',
        fontSize: 'var(--fs-xs)',
        fontWeight: 600,
        boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
      }}
    >
      <FlaskConical size={14} style={{ flexShrink: 0 }} />
      <span>
        You&rsquo;re exploring the <strong>demo plan</strong> ({names} &mdash; fictional).
        Nothing of yours is changed, and anything you change here is discarded when you exit.
      </span>
      <button
        type="button"
        onClick={handleExit}
        disabled={exiting}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          background: 'rgba(255,255,255,0.12)', color: '#FFFFFF',
          border: '1px solid rgba(255,255,255,0.45)', borderRadius: '6px',
          padding: '3px 10px', cursor: 'pointer', fontSize: 'var(--fs-xs)', fontWeight: 700,
        }}
      >
        <X size={12} /> {exiting ? 'Leaving the demo…' : 'Exit Demo'}
      </button>
    </div>
  );
};

export default DemoModeBanner;
