// @vitest-environment jsdom
//
// On a phone the Input Dictionary was well over a hundred thousand pixels
// tall. At 600px and narrower every card folds to its heading; a heading is
// a button that unfolds it, and a search unfolds whatever it matches.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import InputReference from '../../components/InputReference';

const setWidth = (narrow) => {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: narrow && q.includes('max-width: 600px'), media: q,
    addEventListener: () => {}, removeEventListener: () => {},
  }));
};

afterEach(() => { cleanup(); delete window.matchMedia; });

describe('Input Dictionary on a phone', () => {
  beforeEach(() => setWidth(true));

  it('folds every card to its heading, and a heading unfolds its card', () => {
    const { container } = render(<InputReference />);
    const cards = [...container.querySelectorAll('[data-reference-card]')];
    expect(cards.length).toBeGreaterThan(5);
    const tables = cards.map((c) => c.querySelector('table'));
    expect(tables.every((t) => t.style.display === 'none')).toBe(true);
    const heading = screen.getByRole('button', { name: /Estate & Legacy Planning/ });
    expect(heading.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(heading);
    expect(heading.getAttribute('aria-expanded')).toBe('true');
    expect(heading.closest('[data-reference-card]').querySelector('table').style.display).toBe('');
    fireEvent.keyDown(heading, { key: 'Enter' });
    expect(heading.getAttribute('aria-expanded')).toBe('false');
  }, 60000);

  it('a search unfolds the cards it matches', () => {
    const { container } = render(<InputReference />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Life Expectancy' } });
    const visible = [...container.querySelectorAll('[data-reference-card]')].filter((c) => c.style.display !== 'none');
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((c) => c.querySelector('table').style.display === '')).toBe(true);
  }, 60000);
});

describe('Input Dictionary on a wide screen', () => {
  beforeEach(() => setWidth(false));
  it('shows every card open, with plain headings', () => {
    const { container } = render(<InputReference />);
    const tables = [...container.querySelectorAll('[data-reference-card] table')];
    expect(tables.every((t) => t.style.display === '')).toBe(true);
    expect(screen.queryByRole('button', { name: /Estate & Legacy Planning/ })).toBeNull();
  }, 60000);
});
