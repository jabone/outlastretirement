// @vitest-environment jsdom
// Help popups are definitions; the detail lives in the Input Dictionary
// (changelog 280).
//
// A `?` popup says what a thing is in a sentence or two. One that needs
// more carries `more="<term>"`, which puts a "Look it up in the Input
// Dictionary" link in the popup; clicking it opens Help -> Input Dictionary
// with that term in the search box. This test pins the three halves: the
// popup stays short, every `more` term actually finds a Dictionary row
// (and not the whole Dictionary), and the link does what it says.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import Tooltip from '../../components/Tooltip';
import InputReference from '../../components/InputReference';
import SimulationContext from '../../context/SimulationContext';

afterEach(cleanup);
const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '../..');
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : walk(p);
    return p.endsWith('.jsx') ? [p] : [];
  });
}
const FILES = walk(SRC).map((p) => relative(SRC, p).split('\\').join('/'));
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

// Every <Tooltip ...> opening tag in the app, with its text and `more`.
function tooltips() {
  const out = [];
  for (const f of FILES) {
    const src = read(f);
    for (const m of src.matchAll(/<Tooltip\b([^>]*)>/g)) {
      const attrs = m[1];
      const text = attrs.match(/\btext="([^"]*)"/)?.[1] ?? attrs.match(/\btext=\{`([^`]*)`\}/)?.[1] ?? null;
      const more = attrs.match(/\bmore="([^"]*)"/)?.[1] ?? null;
      out.push({ file: f, text, more });
    }
  }
  return out;
}

const MAX_POPUP_CHARS = 270;

describe('help popups', () => {
  const all = tooltips();

  it('found the popups it is about to judge', () => {
    expect(all.length).toBeGreaterThan(100);
    expect(all.filter((t) => t.more).length).toBeGreaterThan(60);
  });

  it('every popup with literal text is a definition, not an essay', () => {
    const long = all.filter((t) => t.text && t.text.length > MAX_POPUP_CHARS).map((t) => `${t.file}: ${t.text.slice(0, 60)}… (${t.text.length})`);
    expect(long).toEqual([]);
  });

  it('every `more` term finds a specific place in the Input Dictionary', () => {
    render(<InputReference />);
    const rows = [...document.querySelectorAll('tbody tr')].map((r) => r.textContent.toLowerCase());
    expect(rows.length).toBeGreaterThan(200);
    const problems = [];
    for (const term of new Set(all.filter((t) => t.more).map((t) => t.more))) {
      const hits = rows.filter((r) => r.includes(term.toLowerCase())).length;
      if (hits === 0) problems.push(`"${term}" matches no Dictionary row`);
      else if (hits > 25) problems.push(`"${term}" matches ${hits} rows -- too vague to be a link`);
    }
    expect(problems).toEqual([]);
  });

  it('the Look-it-up link opens the Dictionary with the term in its search box', () => {
    const openDictionary = vi.fn();
    render(
      <SimulationContext.Provider value={{ openDictionary, dictionaryQuery: '' }}>
        <Tooltip text="The order of returns matters." more="sequence-of-returns">sequence risk</Tooltip>
      </SimulationContext.Provider>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'sequence risk' }));
    const link = screen.getByRole('button', { name: /Look it up in the Input Dictionary/ });
    expect(screen.getByRole('tooltip').style.pointerEvents).toBe('auto');
    fireEvent.click(link);
    expect(openDictionary).toHaveBeenCalledWith('sequence-of-returns');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('stays open while the mouse travels from the trigger onto the card (the ledger headers, position bottom)', () => {
    vi.useFakeTimers();
    try {
      render(
        <SimulationContext.Provider value={{ openDictionary: vi.fn(), dictionaryQuery: '' }}>
          <Tooltip position="bottom" text="Conversion tax." more="Conv Tax">Conv Tax</Tooltip>
        </SimulationContext.Provider>,
      );
      const trigger = screen.getByRole('button', { name: 'Conv Tax' });
      fireEvent.mouseEnter(trigger);
      fireEvent.mouseLeave(trigger);
      act(() => { vi.advanceTimersByTime(200); });
      const popup = screen.getByRole('tooltip');
      fireEvent.mouseEnter(popup);
      act(() => { vi.advanceTimersByTime(5000); });
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      fireEvent.mouseLeave(popup);
      act(() => { vi.advanceTimersByTime(400); });
      expect(screen.queryByRole('tooltip')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('without a provider (or without `more`) the popup has no link and ignores the pointer', () => {
    render(<Tooltip text="Plain help." more="sequence-of-returns">label</Tooltip>);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'label' }));
    expect(screen.queryByText(/Look it up/)).toBeNull();
    expect(screen.getByRole('tooltip').style.pointerEvents).toBe('none');
  });

  it('the Dictionary opens on the parked term and follows a new one', () => {
    const { rerender } = render(
      <SimulationContext.Provider value={{ dictionaryQuery: 'Conv Tax' }}><InputReference /></SimulationContext.Provider>,
    );
    expect(screen.getByRole('searchbox').value).toBe('Conv Tax');
    rerender(<SimulationContext.Provider value={{ dictionaryQuery: 'Basis Left' }}><InputReference /></SimulationContext.Provider>);
    expect(screen.getByRole('searchbox').value).toBe('Basis Left');
  });
});
