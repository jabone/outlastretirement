// @vitest-environment jsdom
//
// What's New headline redesign (changelog 106): every entry leads with a
// one-sentence `summary`; the detailed items sit behind a per-entry
// Details expander in both the popup and the Guide's What's New page.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WhatsNewPopup from '../../components/WhatsNewPopup';
import ChangelogEntry from '../../components/ChangelogEntry';
import { renderBold } from '../../components/renderBold';
import { CHANGELOG_TONES } from '../../components/changelogTones';
import { CHANGELOG, LATEST_CHANGELOG_ID } from '../../config/changelog';
import { ANNOUNCEMENTS } from '../../config/announcements';

const SEEN_KEY = 'retire_plan_whatsnew_last_seen_id';
const SHOWN_DATE_KEY = 'retire_plan_whatsnew_last_shown_date';
const DISMISSED_ANNOUNCE_KEY = 'retire_plan_announcements_dismissed';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('CHANGELOG data contract', () => {
  it('every entry has a one-sentence plain-English summary', () => {
    for (const entry of CHANGELOG) {
      expect(entry.summary, `entry ${entry.id} is missing a summary`).toBeTypeOf('string');
      expect(entry.summary.length, `entry ${entry.id} summary is empty`).toBeGreaterThan(10);
      expect(entry.summary.length, `entry ${entry.id} summary is a paragraph, not a headline`).toBeLessThanOrEqual(200);
      // A summary is the headline everyone reads -- keep implementation
      // language (statute cites, code identifiers, markdown bold) out.
      expect(entry.summary, `entry ${entry.id} summary contains markdown bold`).not.toMatch(/\*\*/);
      expect(entry.summary, `entry ${entry.id} summary contains a statute cite`).not.toMatch(/§/);
    }
  });
  it('ids are unique and strictly decreasing from LATEST_CHANGELOG_ID', () => {
    expect(CHANGELOG[0].id).toBe(LATEST_CHANGELOG_ID);
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(CHANGELOG[i].id).toBeLessThan(CHANGELOG[i - 1].id);
    }
  });
});

describe('ChangelogEntry', () => {
  const entry = {
    id: 999,
    date: '2026-08-30',
    title: 'A test entry',
    summary: 'One sentence a person can scan.',
    items: ['**Bold lead.** The long detail nobody is forced to read.'],
  };
  it('shows the headline and summary, hides the detail until Details is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ChangelogEntry entry={entry} />);
    expect(screen.getByText('A test entry')).toBeInTheDocument();
    expect(screen.getByText('One sentence a person can scan.')).toBeInTheDocument();
    expect(screen.queryByText(/long detail/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText(/long detail/)).toBeInTheDocument();
    // ** markers render as real bold, not literal asterisks.
    expect(screen.getByText('Bold lead.').tagName).toBe('STRONG');
    await user.click(screen.getByRole('button', { name: 'Hide details' }));
    expect(screen.queryByText(/long detail/)).not.toBeInTheDocument();
  });
  it('renderBold leaves plain text alone', () => {
    expect(renderBold('no markers here')).toBe('no markers here');
  });
});

describe('WhatsNewPopup', () => {
  beforeEach(() => {
    // A returning visitor who last acknowledged the previous release.
    localStorage.setItem(SEEN_KEY, String(LATEST_CHANGELOG_ID - 1));
    localStorage.removeItem(SHOWN_DATE_KEY);
    // Pre-dismiss any live announcements so these tests isolate the release
    // notes -- announcements lead the popup and would otherwise be shown first.
    localStorage.setItem(DISMISSED_ANNOUNCE_KEY, JSON.stringify(ANNOUNCEMENTS.map((a) => a.id)));
  });
  it('shows the unread entry as headline + summary with its detail collapsed', () => {
    render(<WhatsNewPopup />);
    const latest = CHANGELOG[0];
    expect(screen.getByText(latest.title)).toBeInTheDocument();
    expect(screen.getByText(latest.summary)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
    // The first detailed item's text is not on screen until expanded.
    const probe = latest.items[0].replace(/\*\*/g, '').slice(0, 40);
    expect(screen.queryByText((t) => typeof t === 'string' && t.includes(probe.slice(20, 40)))).not.toBeInTheDocument();
  });
  it('Got it marks everything read and closes', async () => {
    const user = userEvent.setup({ delay: null });
    render(<WhatsNewPopup />);
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(localStorage.getItem(SEEN_KEY)).toBe(String(LATEST_CHANGELOG_ID));
    expect(screen.queryByText("What's New")).not.toBeInTheDocument();
  });
});


// --- Announcements: timed broadcast messages (changelog 150) ---------------
// A mocked announcements + changelog config keeps these deterministic.
describe('WhatsNewPopup announcements (changelog 150)', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });
  afterEach(() => { vi.doUnmock('../../config/announcements'); vi.doUnmock('../../config/changelog'); });

  const A = (over) => ({ id: 'a1', title: 'Heads up', summary: 'Everyone should see this.', ...over });

  async function renderWith(announcements, { changelog } = {}) {
    const active = (now = new Date()) => {
      const today = now.toISOString().slice(0, 10);
      return announcements.filter((a) => a && a.id
        && (!a.showFrom || today >= a.showFrom)
        && (!a.showUntil || today <= a.showUntil));
    };
    vi.doMock('../../config/announcements', () => ({ ANNOUNCEMENTS: announcements, activeAnnouncements: active }));
    if (changelog) {
      const latest = Math.max(...changelog.map((e) => e.id));
      vi.doMock('../../config/changelog', () => ({ CHANGELOG: [...changelog].sort((a, b) => b.id - a.id), LATEST_CHANGELOG_ID: latest }));
    }
    const { default: Popup } = await import('../../components/WhatsNewPopup');
    render(<Popup />);
  }

  it('a first-time visitor IS shown an active announcement', async () => {
    await renderWith([A()]); // no SEEN_KEY => first-timer
    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(screen.getByText('Everyone should see this.')).toBeInTheDocument();
  });

  it('respects showToNewVisitors:false (returning users only)', async () => {
    await renderWith([A({ showToNewVisitors: false })]);
    expect(screen.queryByText("What's New")).not.toBeInTheDocument();
  });

  it('a queued future announcement is NOT shown yet', async () => {
    const future = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    await renderWith([A({ showFrom: future })]);
    expect(screen.queryByText("What's New")).not.toBeInTheDocument();
  });

  it('an expired announcement is NOT shown', async () => {
    const past = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
    await renderWith([A({ showUntil: past })]);
    expect(screen.queryByText("What's New")).not.toBeInTheDocument();
  });

  it('an announcement inside its window IS shown', async () => {
    const past = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
    const future = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
    await renderWith([A({ showFrom: past, showUntil: future })]);
    expect(screen.getByText('Heads up')).toBeInTheDocument();
  });

  it('dismissing records the id so it never re-shows', async () => {
    const user = userEvent.setup({ delay: null });
    await renderWith([A()]);
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(JSON.parse(localStorage.getItem(DISMISSED_ANNOUNCE_KEY))).toContain('a1');
    cleanup();
    await renderWith([A()]);
    expect(screen.queryByText("What's New")).not.toBeInTheDocument();
  });

  it('does not re-show an already-dismissed announcement', async () => {
    localStorage.setItem(DISMISSED_ANNOUNCE_KEY, JSON.stringify(['a1']));
    await renderWith([A()]);
    expect(screen.queryByText("What's New")).not.toBeInTheDocument();
  });
});

describe('ChangelogEntry tone (changelog 150)', () => {
  it('exposes the documented tones', () => {
    expect(Object.keys(CHANGELOG_TONES).sort()).toEqual(['action', 'notice', 'success']);
  });
  it('applies a colored background only when a valid tone is set', () => {
    const { container: plain } = render(<ChangelogEntry entry={{ id: 1, date: 'd', title: 't', summary: 's', items: [] }} />);
    expect(plain.firstChild.style.background).toBe('');
    cleanup();
    const { container: toned } = render(<ChangelogEntry entry={{ id: 1, date: 'd', title: 't', summary: 's', items: [], tone: 'notice' }} />);
    expect(toned.firstChild.style.background).toContain('rgba(59, 130, 246');
    cleanup();
    const { container: bogus } = render(<ChangelogEntry entry={{ id: 1, date: 'd', title: 't', summary: 's', items: [], tone: 'nope' }} />);
    expect(bogus.firstChild.style.background).toBe('');
  });
});

describe('WhatsNewPopup digest', () => {
  beforeEach(() => {
    localStorage.removeItem(SHOWN_DATE_KEY);
    localStorage.setItem(DISMISSED_ANNOUNCE_KEY, JSON.stringify(ANNOUNCEMENTS.map((a) => a.id)));
  });

  it('shows one digest card with the five newest when more than five are unread', () => {
    const unread = 12;
    localStorage.setItem(SEEN_KEY, String(CHANGELOG[unread].id));
    render(<WhatsNewPopup />);
    expect(screen.getByText(`${unread} updates since your last visit`)).toBeInTheDocument();
    for (const e of CHANGELOG.slice(0, 5)) expect(screen.getByText(`${e.title}.`)).toBeInTheDocument();
    expect(screen.queryByText(`${CHANGELOG[5].title}.`)).not.toBeInTheDocument();
    // One card, so no paging.
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See all 12 in Help/ }).getAttribute('href')).toBe('#/guide/whatsnew');
  });

  it('still pages through the entries when five or fewer are unread', () => {
    localStorage.setItem(SEEN_KEY, String(CHANGELOG[3].id));
    render(<WhatsNewPopup />);
    expect(screen.queryByText(/updates since your last visit/)).not.toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
  });
});
