// @vitest-environment jsdom
//
// Help -> What's New used to render every changelog entry on one page
// (hundreds of them). It shows the newest page, grouped by month, with a
// search over every entry and a button for older ones.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import WhatsNewHistory, { WHATS_NEW_PAGE } from '../../components/WhatsNewHistory';

afterEach(cleanup);

const entries = Array.from({ length: 40 }, (_, i) => ({
  id: 100 - i,
  date: i < 20 ? '2026-09-10' : '2026-08-10',
  title: `Update number ${100 - i}`,
  summary: i === 33 ? 'The one about a rare zebra.' : 'An ordinary summary line.',
}));

describe('WhatsNewHistory', () => {
  it('shows only the newest page, grouped under month headings', () => {
    render(<WhatsNewHistory entries={entries} />);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(WHATS_NEW_PAGE);
    expect(screen.getByRole('heading', { level: 2, name: 'September 2026' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'August 2026' })).not.toBeInTheDocument();
  });

  it('Show older adds the next page, crossing into the next month', () => {
    render(<WhatsNewHistory entries={entries} />);
    fireEvent.click(screen.getByRole('button', { name: /Show older/ }));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2 * WHATS_NEW_PAGE);
    expect(screen.getByRole('heading', { level: 2, name: 'August 2026' })).toBeInTheDocument();
  });

  it('searches every entry, not just the page on screen', () => {
    render(<WhatsNewHistory entries={entries} />);
    fireEvent.change(screen.getByRole('searchbox', { name: "Search What's New" }), { target: { value: 'zebra' } });
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
    expect(screen.getByText('Update number 67')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show older/ })).not.toBeInTheDocument();
  });
});
