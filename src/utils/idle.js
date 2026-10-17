// Deferring work until the browser is idle, so typing never waits on it.
import { useEffect, useRef, useState } from 'react';

// Runs cb when the main thread is idle (requestIdleCallback, or a short
// timeout where that does not exist -- Safari, jsdom). Returns a cancel
// function.
export function runWhenIdle(cb, { timeout = 1000 } = {}) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => cb(), { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(cb, 16);
  return () => clearTimeout(id);
}

const sameDeps = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

// useMemo, but computed off the render path: on idle, or at once when
// `immediate` (the value is on screen). Returns null until the first result
// and the previous result while a newer one is pending, so a caller must
// accept null. Never computes twice for the same deps.
export function useIdleMemo(compute, deps, { immediate = false } = {}) {
  const [value, setValue] = useState(null);
  const computeRef = useRef(compute);
  computeRef.current = compute;
  const doneForRef = useRef(null);
  useEffect(() => {
    if (sameDeps(doneForRef.current, deps)) return undefined;
    let canceled = false;
    const run = () => {
      if (canceled) return;
      doneForRef.current = deps;
      setValue(computeRef.current());
    };
    if (immediate) {
      run();
      return () => { canceled = true; };
    }
    const cancel = runWhenIdle(run);
    return () => { canceled = true; cancel(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the caller's
  }, [...deps, immediate]);
  return value;
}
