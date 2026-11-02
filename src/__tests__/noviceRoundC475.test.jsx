// @vitest-environment jsdom
//
// First-time user review, round C (changelog 475): a plain-words glossary
// under Help, terms on the Dashboard that explain themselves, plainer card
// names and home-page copy, a one-line start in Help, and readable links.
import { describe, it, expect } from 'vitest';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLOSSARY, glossaryEntry } from '../config/glossary';
import { ROUTES } from '../utils/tabRouting';
import Term from '../components/Term';
import SimulationContext from '../context/SimulationContext';

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const readRoot = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');

describe('the glossary', () => {
  it('has unique ids and a plain definition for each entry', () => {
    const ids = GLOSSARY.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of GLOSSARY) {
      expect(g.term.length, g.id).toBeGreaterThan(2);
      expect(g.plain.length, g.id).toBeGreaterThan(60);
      expect(g.plain.length, g.id).toBeLessThan(420);
    }
  });
  it('covers the words a beginner meets first', () => {
    for (const id of ['pretax', 'roth', 'taxable', 'simulated-markets', 'likely-range', 'rmd', 'irmaa', 'fra', 'guardrails', 'aca', 'todays-dollars', 'filing-status']) {
      expect(glossaryEntry(id), id).not.toBeNull();
    }
  });
  it('every Term on screen names an entry that exists', () => {
    const files = ['App.jsx', 'components/tabs/DashboardTab.jsx'];
    for (const f of files) {
      for (const m of read(f).matchAll(/<Term id="([^"]+)"/g)) expect(glossaryEntry(m[1]), `${f}: ${m[1]}`).not.toBeNull();
    }
  });
  it('is a Help sub-tab with its own address', () => {
    expect(ROUTES.guide.subTabs).toContain('glossary');
    expect(read('components/tabs/GuideTab.jsx')).toMatch(/What does this mean\?<\/button>/);
  });
});

describe('a Term explains itself and links to its entry', () => {
  it('shows the plain definition and opens the glossary at that entry', () => {
    const calls = [];
    render(
      <SimulationContext.Provider value={{ openGlossary: (id) => calls.push(id), openDictionary: () => {} }}>
        <Term id="roth">Roth</Term>
      </SimulationContext.Provider>,
    );
    const trigger = screen.getByRole('button', { name: 'Roth' });
    expect(trigger.getAttribute('aria-description')).toBe(glossaryEntry('roth').plain);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'More in What does this mean?' }));
    expect(calls).toEqual(['roth']);
  });
  it('an unknown id is just the words', () => {
    render(<Term id="nope">Plain</Term>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Plain')).toBeTruthy();
  });
});

describe('plainer words on the Dashboard and the home page', () => {
  it('the cards say Savings today, Savings at their highest and In 8 of 10 market paths', () => {
    const app = read('App.jsx');
    expect(app).toMatch(/<Term id="savings-today">Savings today<\/Term>/);
    expect(app).toMatch(/Savings at their highest/);
    expect(app).toMatch(/In 8 of 10 market paths<\/Term>/);
    expect(app).not.toMatch(/kpi-title">Initial Nest Egg/);
    expect(app).not.toMatch(/\(P10&ndash;P90\)<\/Tooltip>/);
  });
  it('the home page leads with what each free feature does', () => {
    const home = readRoot('index.html');
    expect(home).toMatch(/1,000 possible stock markets/);
    expect(home).not.toMatch(/<strong>Monte Carlo<\/strong> —/);
    expect(home).not.toMatch(/IRMAA, ACA credits, RMDs/);
  });
  it('Help opens with one line on where to start', () => {
    expect(read('components/tabs/GuideTab.jsx')).toMatch(/data-testid="guide-new-here"/);
  });
});

describe('readable links', () => {
  it('a link with no style of its own takes the theme link color', () => {
    expect(read('index.css')).toMatch(/:where\(a\):link,\s*:where\(a\):visited \{\s*color: var\(--accent-text\);/);
  });
});
