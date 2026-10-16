// "Reload now" on the new-version toast must always reload. Handing over to
// the waiting service worker reloads the page only once that worker
// controls it, which never happens on a page no worker controls yet (a new
// deploy landing during the first visit): the button did nothing and the
// toast stayed up.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { applyUpdate, _setPWAState } from '../utils/pwa';

const fakeWin = () => {
  const timers = [];
  return {
    location: { reload: vi.fn() },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    runTimers() { timers.splice(0).forEach((t) => t.fn()); },
  };
};

afterEach(() => _setPWAState({ needRefresh: false }, null));

describe('applyUpdate', () => {
  it('reloads at once when there is no worker to hand over to', () => {
    _setPWAState({ needRefresh: true }, null);
    const win = fakeWin();
    applyUpdate({ win });
    expect(win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('hands over to the waiting worker, then reloads anyway if the handoff never reloads the page', () => {
    const update = vi.fn();
    _setPWAState({ needRefresh: true }, update);
    const win = fakeWin();
    applyUpdate({ win });
    expect(update).toHaveBeenCalledWith(true);
    expect(win.location.reload).not.toHaveBeenCalled();
    win.runTimers();
    expect(win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads when the handoff throws', () => {
    _setPWAState({ needRefresh: true }, () => { throw new Error('no worker'); });
    const win = fakeWin();
    applyUpdate({ win });
    win.runTimers();
    expect(win.location.reload).toHaveBeenCalledTimes(1);
  });
});
