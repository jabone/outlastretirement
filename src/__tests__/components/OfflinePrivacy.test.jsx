// @vitest-environment jsdom
//
// Offline support + Local-Only Mode (changelog 115). Three surfaces, one
// promise: the app keeps working without a network, and Local-Only Mode
// makes "no requests" enforced. The service worker itself can't run in
// jsdom, so registration is exercised only for its failure-safety (initPWA
// must never throw where the virtual module doesn't resolve -- which is
// exactly vitest's situation); the store, the guard, and the three UI
// pieces carry the behavioral coverage.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import OfflineIndicator from '../../components/OfflineIndicator';
import UpdateToast from '../../components/UpdateToast';
import LocalOnlyBanner from '../../components/LocalOnlyBanner';
import { _setPWAState, initPWA, getPWAState } from '../../utils/pwa';
import {
  isLocalOnlyMode, setLocalOnlyMode, assertNetworkAllowed, LocalOnlyModeError,
} from '../../utils/localOnlyMode';

afterEach(() => {
  cleanup();
  setLocalOnlyMode(false);
  _setPWAState({ offlineReady: false, needRefresh: false }, null);
});

const goOffline = () => {
  Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
  window.dispatchEvent(new Event('offline'));
};
const goOnline = () => {
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  window.dispatchEvent(new Event('online'));
};

describe('OfflineIndicator', () => {
  it('renders nothing while online, appears on the offline event, and leaves when back online', () => {
    goOnline();
    render(<OfflineIndicator />);
    expect(screen.queryByRole('status')).toBeNull();
    act(goOffline);
    expect(screen.getByRole('status')).toHaveTextContent(/everything still works/i);
    // The Live Pricing exception must be stated right on the badge.
    expect(screen.getByRole('status')).toHaveTextContent(/Live Pricing/i);
    act(goOnline);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('UpdateToast', () => {
  it('shows the offline-ready toast once precaching completes, and it can be dismissed', () => {
    render(<UpdateToast />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => _setPWAState({ offlineReady: true }));
    expect(screen.getByRole('status')).toHaveTextContent(/Ready to work offline/i);
    fireEvent.click(screen.getByLabelText('Dismiss offline notice'));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the update notice when a new version waits, and Reload invokes the service-worker update', () => {
    const update = vi.fn();
    render(<UpdateToast />);
    act(() => _setPWAState({ needRefresh: true }, update));
    expect(screen.getByRole('status')).toHaveTextContent(/new version/i);
    fireEvent.click(screen.getByRole('button', { name: /Reload now/i }));
    expect(update).toHaveBeenCalledWith(true);
  });

  it('the update notice outranks the offline-ready toast when both are pending', () => {
    render(<UpdateToast />);
    act(() => _setPWAState({ offlineReady: true, needRefresh: true }));
    expect(screen.getByRole('status')).toHaveTextContent(/new version/i);
  });
});

describe('initPWA', () => {
  it('never throws where the virtual module cannot resolve (vitest is exactly that environment)', async () => {
    await expect(initPWA()).resolves.toBeUndefined();
    expect(getPWAState()).toEqual({ offlineReady: false, needRefresh: false });
  });
});

describe('Local-Only Mode', () => {
  it('persists to localStorage and the banner follows the flag live, with a working Turn off', () => {
    render(<LocalOnlyBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => setLocalOnlyMode(true));
    expect(localStorage.getItem('cfe_local_only_mode')).toBe('1');
    expect(screen.getByRole('status')).toHaveTextContent(/Local-Only Mode is on/i);
    fireEvent.click(screen.getByRole('button', { name: /Turn off/i }));
    expect(isLocalOnlyMode()).toBe(false);
    expect(localStorage.getItem('cfe_local_only_mode')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  // The Live Pricing fetch client's own Local-Only checks are tested in the
  // Premium repo (test/modules/holdings/localOnly.test.js); the Premium
  // module loader's are in premium/remoteLoader.test.jsx.
  it('assertNetworkAllowed refuses while on and passes while off', () => {
    expect(() => assertNetworkAllowed()).not.toThrow();
    setLocalOnlyMode(true);
    expect(() => assertNetworkAllowed()).toThrow(LocalOnlyModeError);
  });
});
