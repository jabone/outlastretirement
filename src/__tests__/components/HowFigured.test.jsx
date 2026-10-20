// @vitest-environment jsdom
//
// Help -> How the numbers are figured: the rendering half (the data half is
// howFigured.test.js). The section renders every rule as a card with its
// official links, the search filters it, phones fold each group to its
// heading, and a "How is this figured?" link on Year by Year or Tax & Estate
// lands on the right card.
import React, { useContext, useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import HowFigured from '../../components/HowFigured';
import { checkedOn } from '../../utils/howFiguredFormat';
import YearLedgerTab from '../../components/tabs/YearLedgerTab';
import SimulationContext from '../../context/SimulationContext';
import { FIGURE_VINTAGES, HOW_FIGURED_RULES, HOW_FIGURED_GROUPS } from '../../config/howFigured';
import { SOURCES } from '../../config/sources';
import { CA_VINTAGE_YEAR } from '../../utils/copyFigures';
import { renderWithSimulation } from '../testUtils';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const setWidth = (narrow) => {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: narrow && q.includes('max-width: 600px'), media: q,
    addEventListener: () => {}, removeEventListener: () => {},
  }));
};

afterEach(() => { cleanup(); delete window.matchMedia; });

describe('How the numbers are figured', () => {
  it('renders every rule as a card under its group, with official links that open safely', () => {
    setWidth(false);
    const { container } = render(<HowFigured />);
    expect(screen.getByRole('heading', { level: 1, name: 'How the numbers are figured' })).toBeInTheDocument();
    expect(screen.getByText(/not tax, legal or financial advice/)).toBeInTheDocument();
    for (const g of HOW_FIGURED_GROUPS) expect(screen.getByRole('heading', { level: 2, name: g })).toBeInTheDocument();
    const cards = container.querySelectorAll('[data-how-figured-rule]');
    expect(cards.length).toBe(HOW_FIGURED_RULES.length);

    const rmd = container.querySelector('#how-figured-rmd');
    expect(within(rmd).getByRole('heading', { level: 3 }).textContent).toBe('Required minimum distributions');
    expect(rmd.textContent).toMatch(/Figures from:/);
    expect(rmd.textContent).toMatch(/What the app simplifies:/);
    const link = within(rmd).getAllByRole('link')[0];
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('href')).toBe(SOURCES.find((s) => s.id === 'rmd').url);
    expect(rmd.textContent).toMatch(/checked September 30, 2026/);

    // Every link on the page is one of the sources, except the one that
    // opens the printable version of these same rules (changelog 445).
    const urls = new Set(SOURCES.map((s) => s.url));
    const print = screen.getByRole('link', { name: /print these rules/i });
    expect(print.getAttribute('href')).toBe('/how-the-math-works?print=1#rules');
    for (const a of container.querySelectorAll('a')) {
      if (a === print) continue;
      expect(urls.has(a.getAttribute('href')), a.getAttribute('href')).toBe(true);
    }
  });

  it('opens with the table of which year each area\'s figures come from, and hides it while searching', () => {
    setWidth(false);
    const { container } = render(<HowFigured />);
    const table = screen.getByRole('table');
    expect(screen.getByRole('heading', { level: 2, name: /Which year.s figures this plan uses/ })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-figure-vintage]').length).toBe(FIGURE_VINTAGES.length);
    // The California row is the reason the table exists: it says the
    // figures are older than the tax year and grown forward.
    const ca = container.querySelector('[data-figure-vintage="California"]');
    expect(ca.textContent).toMatch(new RegExp(`Tax year ${CA_VINTAGE_YEAR}`));
    expect(ca.textContent).toMatch(/grown by your Tax Bracket Inflation Rate/);
    expect(within(table).getByRole('rowheader', { name: 'Federal income tax' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'California' } });
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('formats check dates as Month D, YYYY', () => {
    expect(checkedOn('2026-09-02')).toBe('September 2, 2026');
    expect(checkedOn('bad')).toBe('');
  });

  it('the search filters cards and says when nothing matches', () => {
    setWidth(false);
    const { container } = render(<HowFigured />);
    const box = screen.getByRole('searchbox', { name: /Search how the numbers are figured/ });
    fireEvent.change(box, { target: { value: 'IRMAA' } });
    const ids = [...container.querySelectorAll('[data-how-figured-rule]')].map((c) => c.dataset.howFiguredRule);
    expect(ids).toContain('irmaa');
    expect(ids).not.toContain('state-ca');
    expect(ids.length).toBeLessThan(HOW_FIGURED_RULES.length);
    expect(screen.getByRole('status').textContent).toMatch(new RegExp(`^${ids.length} matching rule`));
    // A publisher name finds its rule too.
    fireEvent.change(box, { target: { value: 'Franchise Tax Board' } });
    expect([...container.querySelectorAll('[data-how-figured-rule]')].map((c) => c.dataset.howFiguredRule)).toContain('state-ca');
    fireEvent.change(box, { target: { value: 'zzzzqq' } });
    expect(container.querySelectorAll('[data-how-figured-rule]').length).toBe(0);
    expect(screen.getByRole('status').textContent).toMatch(/No matches/);
  });

  it('on a phone each group folds to a heading button, and search unfolds', () => {
    setWidth(true);
    const { container } = render(<HowFigured />);
    expect(container.querySelectorAll('[data-how-figured-rule]').length).toBe(0);
    const btn = screen.getByRole('button', { name: /^Retirement accounts/ });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('#how-figured-rmd')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(container.querySelector('#how-figured-rmd')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'survivor' } });
    expect(container.querySelector('#how-figured-ss-survivor')).not.toBeNull();
  });
});

// Opens the section the way App.jsx does: the link parks a rule id and the
// Help tab renders HowFigured in place of the page.
function Harness({ children }) {
  const outer = useContext(SimulationContext);
  const [target, setTarget] = useState(null);
  const value = {
    ...outer,
    howFiguredTarget: target,
    openHowFigured: (id) => setTarget((p) => ({ id, seq: (p?.seq || 0) + 1 })),
  };
  return (
    <SimulationContext.Provider value={value}>
      {target ? <HowFigured /> : children}
    </SimulationContext.Provider>
  );
}

describe('"How is this figured?" links', () => {
  it('the RMD link on Year by Year lands on the RMD card, focused, on a phone too', async () => {
    setWidth(true);
    const { container } = renderWithSimulation(<Harness><YearLedgerTab /></Harness>);
    const links = within(screen.getByTestId('how-figured-links')).getAllByRole('button');
    expect(links.map((b) => b.textContent)).toEqual(['Federal income tax', 'State income tax', 'Social Security', 'Medicare and IRMAA', 'RMD']);
    const rmd = screen.getByRole('button', { name: /How is this figured\? RMD/ });
    fireEvent.click(rmd);
    const card = await waitFor(() => {
      const el = container.querySelector('#how-figured-rmd');
      expect(el).not.toBeNull();
      return el;
    });
    await waitFor(() => expect(document.activeElement).toBe(card));
    expect(card.textContent).toMatch(/Required minimum distributions/);
    // Its group unfolded; the others stayed folded on a phone.
    expect(container.querySelector('#how-figured-irmaa')).toBeNull();
  }, 60000);

  it('every link in the app names a rule that exists', () => {
    const ids = new Set(HOW_FIGURED_RULES.map((r) => r.id));
    const files = [];
    const walk = (d) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (n === '__tests__') continue;
        if (statSync(p).isDirectory()) walk(p); else if (n.endsWith('.jsx')) files.push(p);
      }
    };
    walk(SRC);
    const used = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/<HowFiguredLink[^>]*?rule="([^"]+)"/g)) used.push(m[1]);
      for (const m of text.matchAll(/'((?:state|federal|ss|irmaa|rmd)[a-z-]*)'/g)) if (/HowFiguredLink|STATE_RULE|STATE_INHERITANCE_ONLY/.test(text)) used.push(m[1]);
    }
    const literal = used.filter((u) => ids.has(u) || /^(state-|federal-)/.test(u));
    expect(literal.length).toBeGreaterThan(8);
    expect(literal.filter((u) => !ids.has(u))).toEqual([]);
  });
});
