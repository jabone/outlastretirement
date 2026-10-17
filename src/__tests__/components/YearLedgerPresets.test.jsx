// @vitest-environment jsdom
//
// Changelog 367: the pinned Year column and the phone column presets on
// Year by Year's Balances & draws table. jsdom applies no media queries, so
// these check the classes the stylesheet keys on.
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import YearLedgerTab from '../../components/tabs/YearLedgerTab';
import { renderWithSimulation } from '../testUtils';
import { buildDemoInputs } from '../../config/demoPlan';
import fs from 'fs';
import path from 'path';

const table = () => document.querySelector('table.year-ledger-table');

describe('Year by Year on a phone', () => {
  beforeEach(() => { localStorage.clear(); });

  it('pins the Year column, header and rows alike', () => {
    renderWithSimulation(<YearLedgerTab />);
    expect(table().querySelector('thead th').classList.contains('ledger-year')).toBe(true);
    for (const tr of table().querySelectorAll('tbody tr')) expect(tr.children[0].classList.contains('ledger-year')).toBe(true);
    const css = fs.readFileSync(path.resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toMatch(/\.year-ledger-table td\.ledger-year \{\s*position: sticky;\s*left: 0;/);
  });

  it('every column but Year and Ages belongs to at least one preset, so nothing is out of reach', () => {
    renderWithSimulation(<YearLedgerTab />, { inputs: buildDemoInputs() });
    const heads = [...table().querySelectorAll('thead th')];
    expect(heads.length).toBeGreaterThanOrEqual(25);
    const orphans = heads.slice(1).filter((th) => ![...th.classList].some((c) => c.startsWith('g-')) && !/^Ages/.test(th.textContent));
    expect(orphans.map((th) => th.textContent)).toEqual([]);
    // Header and body cells carry the same groups, column for column.
    const row = table().querySelector('tbody tr');
    const cls = (el) => [...el.classList].filter((c) => c === 'lg' || c.startsWith('g-')).join(' ');
    expect([...row.children].map(cls)).toEqual(heads.map(cls));
  });

  it('starts on Summary, switches groups, and remembers the choice', () => {
    renderWithSimulation(<YearLedgerTab />);
    expect(table().classList.contains('preset-sum')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Taxes' }));
    expect(table().classList.contains('preset-tax')).toBe(true);
    expect(localStorage.getItem('retire_plan_ledger_preset')).toBe('tax');
  });

  it('the ages ride under the year for phones', () => {
    renderWithSimulation(<YearLedgerTab />);
    expect(table().querySelector('tbody td.ledger-year .ledger-year-ages')).not.toBeNull();
  });
});
