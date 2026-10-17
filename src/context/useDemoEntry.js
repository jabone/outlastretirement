// Shared state for the two "try the demo" buttons.
//
// Entering demo mode simulates every saved scenario before it can write
// anything, which takes a few seconds even on a worker. Both entry points
// -- the Scenarios tab and the Premium page -- need the same three things
// while that runs: a disabled button, a label saying how far along it is,
// and a guarantee that a second click cannot start a second entry. Putting
// it here means they cannot drift apart, and means neither has to know
// that Monte Carlo is what it is waiting on.
import { useCallback, useEffect, useRef, useState } from 'react';
import { enterDemoMode } from '../utils/demoMode';

export function useDemoEntry() {
  const [progress, setProgress] = useState(null); // { done, total } | null
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const startDemo = useCallback(async (options = {}) => {
    if (progress) return false; // already entering
    setProgress({ done: 0, total: 0 });
    try {
      return await enterDemoMode({
        ...options,
        onProgress: (done, total) => {
          // The component can unmount mid-run: enterDemoMode ends in a
          // page reload, and React may tear this down first.
          if (mounted.current) setProgress({ done, total });
        },
      });
    } catch (err) {
      console.error('Demo mode: entry failed.', err);
      return false;
    } finally {
      // On the success path a reload is already on its way, so this only
      // really matters when entry refused or threw -- in which case the
      // button has to become clickable again rather than sticking.
      if (mounted.current) setProgress(null);
    }
  }, [progress]);

  const isEntering = progress !== null;
  // "Loading the demo…" until the first scenario reports, then a count, so
  // the label never sits at a meaningless "0 of 0".
  const label = !isEntering
    ? null
    : progress.total > 0
      ? `Simulating scenario ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
      : 'Loading the demo…';

  return { startDemo, isEntering, progress, label };
}
