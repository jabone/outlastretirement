// @vitest-environment jsdom
// Every money input shows thousands separators ("245,000") when it is not
// being edited: Income salaries, Social Security and pensions (also the
// wizard's step 2, which renders these sections), Balances, Quick Update and
// the Life Events amount.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import SettingsTab from '../../components/tabs/SettingsTab.jsx';
import QuickUpdate from '../../components/QuickUpdate.jsx';
import { renderWithSimulation } from '../testUtils.jsx';
import { DEFAULT_INPUTS } from '../../calculator.js';

beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });
const val = (id) => document.getElementById(id).value;

describe('money inputs show commas', () => {
  it('Income: salaries, Social Security and pensions', () => {
    renderWithSimulation(<SettingsTab />, {
      settingsSubTab: 'income',
      inputs: { ...DEFAULT_INPUTS, spouse2Enabled: true, salary1: 245000, salary2: 1250000, ss1: 36000, ss2: 24000, pension1: 30000 },
    });
    expect(val('field-salary1')).toBe('245,000');
    expect(val('field-salary2')).toBe('1,250,000');
    expect(val('field-ss1')).toBe('36,000');
    expect(val('field-ss2')).toBe('24,000');
    expect(val('field-pension1')).toBe('30,000');
  });

  it('Balances', () => {
    renderWithSimulation(<SettingsTab />, {
      settingsSubTab: 'balances',
      inputs: { ...DEFAULT_INPUTS, preTaxInit: 1234567, rothInit: 250000, taxableInit: 400000, hsaInit: 12000 },
    });
    expect(val('field-preTaxInit')).toBe('1,234,567');
    expect(val('field-rothInit')).toBe('250,000');
    expect(val('field-taxableInit')).toBe('400,000');
    expect(val('field-hsaInit')).toBe('12,000');
  });

  it('Life Events amount', () => {
    renderWithSimulation(<SettingsTab />, { settingsSubTab: 'milestones' });
    const box = document.getElementById('field-newMilestoneAmount');
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '25000' } });
    fireEvent.blur(box);
    expect(box.value).toBe('25,000');
  });

  it('Quick Update: balances and salary; ages stay plain', () => {
    renderWithSimulation(<QuickUpdate onClose={vi.fn()} />, {
      inputs: { ...DEFAULT_INPUTS, preTaxInit: 1234567, salary1: 245000, retireAge1: 65 },
    });
    const values = [...document.querySelectorAll('input')].map((i) => i.value);
    expect(values).toContain('1,234,567');
    expect(values).toContain('245,000');
    expect(values).toContain('65');
  });
});

// Diversify Tax Rate is read only by the legacy flat-tax flag, which no
// control sets: shown for a plan that has the flag, hidden otherwise.
describe('Diversify Tax Rate appears only for a plan on the legacy flat rate', () => {
  const base = { ...DEFAULT_INPUTS, concentratedStockEnabled: true };
  it('hidden without the flag', () => {
    renderWithSimulation(<SettingsTab />, { settingsSubTab: 'income', inputs: base });
    expect(document.getElementById('field-concentratedStockDiversifyPct')).not.toBeNull();
    expect(document.getElementById('field-concentratedStockDiversifyTaxRate')).toBeNull();
  });
  it('shown with it', () => {
    renderWithSimulation(<SettingsTab />, { settingsSubTab: 'income', inputs: { ...base, concentratedStockFlatTaxEnabled: true } });
    expect(document.getElementById('field-concentratedStockDiversifyTaxRate')).not.toBeNull();
  });
});

// 401(k) Auto-Max: the inline figure is the split the engine projects. Age
// 50+ above the SECURE 2.0 wage threshold puts the catch-up in Roth.
describe('401(k) Auto-Max inline figure', () => {
  const START = DEFAULT_INPUTS.planYear;
  const show = (salary1) => renderWithSimulation(<SettingsTab />, {
    settingsSubTab: 'savings',
    inputs: { ...DEFAULT_INPUTS, birthYear1: START - 55, retireAge1: 65, salary1, autoMaxContribution1: '401k' },
  });
  it('above the threshold: base limit Pre-Tax, catch-up to Roth', () => {
    show(200000);
    const note = document.querySelector('[data-testid="automax-401k-note"]');
    expect(note.textContent).toContain('$24,500/yr Pre-Tax');
    expect(note.textContent).toContain('the $8,000 age-based catch-up is added to the Roth amount below');
    expect(document.body.textContent).toContain('Auto-Max adds this person’s $8,000 catch-up to the amount above as Roth');
  });
  it('below the threshold: the whole limit Pre-Tax', () => {
    show(120000);
    const note = document.querySelector('[data-testid="automax-401k-note"]');
    expect(note.textContent).toContain('$32,500/yr Pre-Tax');
    expect(note.textContent).not.toContain('Roth');
  });
});
