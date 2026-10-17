// Global Vitest setup file (see vite.config.js's test.setupFiles).
// Extends `expect` with @testing-library/jest-dom's DOM matchers
// (toBeInTheDocument, toHaveTextContent, etc.) for every test file, engine
// and component tests alike -- importing this has no effect on tests that
// never render anything, since the matchers are only invoked, not required.
import '@testing-library/jest-dom/vitest';

// @testing-library/react normally auto-registers an afterEach(cleanup) to
// unmount whatever it rendered between tests, but only when it detects a
// global `afterEach` (i.e. when vitest's `test.globals: true` is set). This
// repo deliberately imports describe/it/expect/etc. from 'vitest' per-file
// instead of using globals, so that auto-registration never fires -- left
// alone, a second test in the same file renders on top of the first
// test's un-unmounted DOM, and getByText() queries start finding duplicate
// matches. Registering cleanup explicitly here restores the behavior
// without turning on globals repo-wide. Safe to run for every test file,
// including the plain-'node'-environment engine tests, since cleanup() is a
// no-op when nothing was ever rendered.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom doesn't implement Element.prototype.scrollTo or window.scrollTo --
// real browsers do, so any component that scrolls (e.g. InterviewTab.jsx's
// section rail auto-scroll-into-view, or a plain window.scrollTo on section
// change) throws "scrollTo is not a function" the moment it mounts in a
// jsdom-based component test, unrelated to anything the component actually
// got wrong. Guarded behind a DOM-presence check since this file also runs
// for the plain 'node'-environment engine tests, where `Element`/`window`
// don't exist at all.
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
if (typeof window !== 'undefined' && !window.scrollTo) {
  window.scrollTo = () => {};
}

if (typeof window !== 'undefined') {
  if (!window.localStorage || typeof window.localStorage.getItem !== 'function') {
    class MemoryStorage {
      constructor() {
        this._store = new Map();
      }
      getItem(key) {
        return this._store.has(String(key)) ? this._store.get(String(key)) : null;
      }
      setItem(key, value) {
        this._store.set(String(key), String(value));
      }
      removeItem(key) {
        this._store.delete(String(key));
      }
      clear() {
        this._store.clear();
      }
      get length() {
        return this._store.size;
      }
      key(index) {
        return Array.from(this._store.keys())[index] || null;
      }
    }
    const memStorage = new MemoryStorage();
    Object.defineProperty(window, 'localStorage', {
      value: memStorage,
      writable: true,
      configurable: true,
    });
    try {
      delete globalThis.localStorage;
    } catch {}
    Object.defineProperty(globalThis, 'localStorage', {
      value: memStorage,
      writable: true,
      configurable: true,
    });
  }
}
