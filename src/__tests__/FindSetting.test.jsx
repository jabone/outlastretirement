// @vitest-environment jsdom
// "Find a setting" (changelog 290): search, jump, reveal.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FindSetting, { FOCUS_EVENT } from '../components/FindSetting';
import { searchIndex, placeOf } from '../components/findSettingSearch';
import SettingsTab from '../components/tabs/SettingsTab';
import { revealField, FLASH_CLASS } from '../utils/revealField';
import { renderWithSimulation } from './testUtils';
import { FIELD_INDEX } from '../config/fieldIndex';

beforeEach(() => { localStorage.clear(); });

describe('searchIndex', () => {
  it('finds fields by label words in any order, best label match first', () => {
    const r = searchIndex('conversion roth');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => /roth/i.test(e.label) || /roth/i.test(e.key) || (e.folds || []).some((f) => /roth/i.test(f.title)))).toBe(true);
    expect(r.length).toBeLessThanOrEqual(8);
  });
  it('finds fields by input key and offers pages', () => {
    expect(searchIndex('healthcareBridgeCost')[0].id).toBe('field-healthcareBridgeCost');
    expect(searchIndex('optimizers').some((e) => e.page && e.tab === 'strategy')).toBe(true);
  });
  it('returns nothing for a blank query and shows where a field lives', () => {
    expect(searchIndex('   ')).toEqual([]);
    const e = FIELD_INDEX.find((x) => x.key === 'healthcareBridgeCost');
    expect(placeOf(e)).toBe('Spending › Special Expenses');
  });
});

describe('revealField', () => {
  it('opens a closed fold by title, then "More options", then highlights the control', async () => {
    document.body.innerHTML = `
      <div class="guided-section">
        <h3 role="button" aria-expanded="false">Special Expenses ▾</h3>
        <div id="body"></div>
        <button class="guided-more" aria-expanded="false">More options (3)</button>
      </div>`;
    const head = document.querySelector('h3');
    head.addEventListener('click', () => {
      head.setAttribute('aria-expanded', 'true');
      document.getElementById('body').innerHTML = '<div class="form-group guided-hidden"><input id="field-x" /></div>';
    });
    const more = document.querySelector('.guided-more');
    more.addEventListener('click', () => {
      more.setAttribute('aria-expanded', 'true');
      document.querySelector('.guided-hidden').classList.remove('guided-hidden');
    });
    Element.prototype.scrollIntoView = vi.fn();
    const found = await revealField('field-x', { folds: [{ id: 'specialExpenses', title: 'Special Expenses' }], interval: 5 });
    expect(found).toBe(true);
    expect(document.querySelector('.form-group').classList.contains(FLASH_CLASS)).toBe(true);
    expect(document.activeElement.id).toBe('field-x');
  });
  it('gives up on a control that never appears', async () => {
    document.body.innerHTML = '';
    expect(await revealField('field-nope', { tries: 3, interval: 1 })).toBe(false);
  });
});

describe('<FindSetting />', () => {
  it('lists results as you type, hands the pick to the host, and focuses on the global event', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const onPick = vi.fn();
    renderWithSimulation(<FindSetting onPick={onPick} />);
    const input = screen.getByTestId('find-setting-input');
    await userEvent.type(input, 'healthcare bridge cost');
    const list = screen.getByTestId('find-setting-results');
    expect(list.textContent).toContain('Healthcare Bridge Cost');
    expect(list.textContent).toContain('Search the Input Dictionary');
    await userEvent.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'field-healthcareBridgeCost', subTab: 'spending' }));
    expect(JSON.parse(localStorage.getItem('retire_plan_folds_v1')).specialExpenses).toBe(true);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/not shown right now/), { timeout: 4000 });
    input.blur();
    act(() => { window.dispatchEvent(new Event(FOCUS_EVENT)); });
    expect(document.activeElement).toBe(input);
  });
  it('opens the Input Dictionary from the last row and pages from page rows', async () => {
    const openDictionary = vi.fn();
    const setActiveTab = vi.fn();
    renderWithSimulation(<FindSetting onPick={vi.fn()} />, { openDictionary, setActiveTab });
    const input = screen.getByTestId('find-setting-input');
    await userEvent.type(input, 'zzqx');
    await userEvent.keyboard('{Enter}');
    expect(openDictionary).toHaveBeenCalledWith('zzqx');
    await userEvent.clear(input);
    await userEvent.type(input, 'Optimizers');
    await userEvent.keyboard('{Enter}');
    expect(setActiveTab).toHaveBeenCalledWith('strategy');
  });
});

describe('Plan Settings header', () => {
  it('jumps to the sub-tab and highlights the field', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderWithSimulation(<SettingsTab />);
    const input = screen.getByTestId('find-setting-input');
    await userEvent.type(input, 'healthcareBridgeCost');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => {
      const el = document.getElementById('field-healthcareBridgeCost');
      expect(el).not.toBeNull();
      expect(el.closest('.form-group').classList.contains(FLASH_CLASS)).toBe(true);
    }, { timeout: 3000 });
    expect(screen.getByRole('button', { name: 'Spending' }).className).toContain('active');
  });
});
