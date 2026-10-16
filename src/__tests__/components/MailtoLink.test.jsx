// @vitest-environment jsdom
//
// John, 2026-10-12: people clicked "Email for Premium access" and believed
// the request had gone, but with no mail app set up a mailto: link does
// nothing at all. The link now watches for the hand-off and, when none
// comes, says that nothing was sent and offers to copy the address.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import MailtoLink, { MAILTO_HANDOFF_WAIT_MS } from '../../components/MailtoLink.jsx';
import { CONTACT_EMAIL, REQUEST_SUBJECT, REQUEST_BODY, buildRequestMailto } from '../../config/premiumOffering';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const renderLink = () => render(
  <MailtoLink email={CONTACT_EMAIL} subject={REQUEST_SUBJECT} body={REQUEST_BODY}>Request Access</MailtoLink>,
);

describe('MailtoLink', () => {
  it('is a plain mailto link with the same address, subject and body as before', () => {
    renderLink();
    expect(screen.getByRole('link', { name: 'Request Access' }).getAttribute('href')).toBe(buildRequestMailto());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says nothing was sent when no mail app takes over the page', () => {
    vi.useFakeTimers();
    renderLink();
    fireEvent.click(screen.getByRole('link', { name: 'Request Access' }));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => { vi.advanceTimersByTime(MAILTO_HANDOFF_WAIT_MS + 10); });
    const note = screen.getByRole('status');
    expect(note.textContent).toMatch(/did not open, so nothing has been sent/);
    expect(note.textContent).toContain(CONTACT_EMAIL);
    expect(note.textContent).toContain(REQUEST_SUBJECT);
    expect(screen.getByRole('button', { name: 'Copy the address' })).toBeTruthy();
  });

  it('says the app should have opened when the page loses focus, and still shows the address', () => {
    vi.useFakeTimers();
    renderLink();
    fireEvent.click(screen.getByRole('link', { name: 'Request Access' }));
    act(() => { window.dispatchEvent(new Event('blur')); });
    const note = screen.getByRole('status');
    expect(note.textContent).toMatch(/should have opened/);
    expect(note.textContent).toContain(CONTACT_EMAIL);
    act(() => { vi.advanceTimersByTime(MAILTO_HANDOFF_WAIT_MS + 10); });
    expect(screen.getByRole('status').textContent).toMatch(/should have opened/);
  });

  it('copies the address, and only the address', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.useFakeTimers();
    renderLink();
    fireEvent.click(screen.getByRole('link', { name: 'Request Access' }));
    act(() => { vi.advanceTimersByTime(MAILTO_HANDOFF_WAIT_MS + 10); });
    vi.useRealTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Copy the address' }));
    await screen.findByRole('button', { name: 'Address copied' });
    expect(writeText).toHaveBeenCalledWith(CONTACT_EMAIL);
  });
});

describe('the website pages use the same fallback', () => {
  it('the home page and the Free and Premium page load mailto-fallback.js and mark their request links', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    for (const page of ['index.html', 'public/premium.html']) {
      const html = readFileSync(resolve(__dirname, '..', '..', '..', page), 'utf8');
      expect(html).toContain('<script src="/mailto-fallback.js"></script>');
      expect(html).toMatch(/href="mailto:[^"]*"[^>]*data-mailto-fallback/);
    }
  });
});
