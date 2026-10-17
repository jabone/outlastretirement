// @vitest-environment jsdom
//
// H7: a crafted backup could leave a value in storage that fails every
// render, so Try Again alone was a loop. The root crash screen offers a
// raw copy of the data and a storage reset; the dialog gained the switch
// and type-to-confirm the restore and erase flows use.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../../components/ErrorBoundary';
import AppDialog from '../../components/AppDialog';

function Boom() {
  throw new Error('bad data');
}

describe('root crash screen recovery', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('offers Download my data and Reset only on the recovery boundary', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.queryByRole('button', { name: 'Download my data' })).toBeNull();
    unmount();
    render(<ErrorBoundary recovery><Boom /></ErrorBoundary>);
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download my data' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reset this app.s storage/ })).toBeTruthy();
  });

  it('Download my data saves every app key raw, and nothing else', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('retire_plan_inputs', '{"not":"parsed"');
    localStorage.setItem('cfe_life_plan_v1', '{}');
    localStorage.setItem('someone_else', 'x');
    let blob = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = vi.fn((b) => { blob = b; return 'blob:x'; });
    try {
      render(<ErrorBoundary recovery><Boom /></ErrorBoundary>);
      fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    } finally {
      URL.createObjectURL = orig;
    }
    const data = JSON.parse(await blob.text());
    expect(data.storage.retire_plan_inputs).toBe('{"not":"parsed"');
    expect(data.storage.cfe_life_plan_v1).toBe('{}');
    expect(data.storage.someone_else).toBeUndefined();
  });

  it('Reset asks first, then removes every app key and reloads', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('retire_plan_inputs', 'x');
    localStorage.setItem('cfe_premium_holdings_v1', 'x');
    const replace = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...orig, pathname: '/app/', replace } });
    try {
      render(<ErrorBoundary recovery><Boom /></ErrorBoundary>);
      vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
      fireEvent.click(screen.getByRole('button', { name: /Reset this app.s storage/ }));
      expect(localStorage.getItem('retire_plan_inputs')).toBe('x');
      vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
      fireEvent.click(screen.getByRole('button', { name: /Reset this app.s storage/ }));
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: orig });
    }
    expect(localStorage.getItem('retire_plan_inputs')).toBeNull();
    expect(localStorage.getItem('cfe_premium_holdings_v1')).toBeNull();
    expect(replace).toHaveBeenCalledWith('/app/');
  });
});

describe('AppDialog extras', () => {
  it('a toggle resolves { confirmed, toggle } and starts off', () => {
    const onClose = vi.fn();
    render(<AppDialog dialog={{ type: 'confirm', title: 'T', message: 'M', toggle: { label: 'Also restore my Live Pricing connection' } }} onClose={onClose} />);
    const sw = screen.getByLabelText('Also restore my Live Pricing connection');
    expect(sw.checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onClose).toHaveBeenLastCalledWith({ confirmed: true, toggle: false });
  });

  it('requireText keeps Confirm disabled until the word is typed', () => {
    const onClose = vi.fn();
    render(<AppDialog dialog={{ type: 'confirm', title: 'T', message: 'M', requireText: 'ERASE', confirmLabel: 'Erase Everything' }} onClose={onClose} />);
    const btn = screen.getByRole('button', { name: 'Erase Everything' });
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Type ERASE to confirm'), { target: { value: 'erase' } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalledWith(true);
  });

  // The restore confirmation prints two long Live Pricing URLs. A flex
  // child with no min-width grows to fit an unbreakable string, which
  // pushed the dialog wider than the window; the message must be allowed
  // to shrink and to break inside the URL.
  it('a long unbreakable URL in the message wraps instead of widening the dialog', () => {
    const url = 'https://script.google.com/macros/s/' + 'A'.repeat(120) + '/exec';
    render(<AppDialog dialog={{ type: 'confirm', title: 'Restore Backup', message: `Apps Script: ${url}` }} onClose={() => {}} />);
    const message = screen.getByText((_, el) => el?.id === 'app-dialog-message');
    expect(message.style.overflowWrap).toBe('anywhere');
    expect(message.parentElement.style.minWidth).toBe('0px');
  });
});
