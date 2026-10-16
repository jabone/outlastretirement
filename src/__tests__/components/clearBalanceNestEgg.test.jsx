// @vitest-environment jsdom
//
// Clearing a balance field used to store '' into the plan, and the Initial
// Nest Egg card added the three balances with +, so '' + 15000 + 2000000
// concatenated into "$2,000,015,000". A cleared balance is zero dollars:
// the nest egg must equal the other two balances.
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import App from '../../App';
import { DEFAULT_INPUTS, INPUTS_SCHEMA_VERSION } from '../../calculator';

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('retire_plan_disclaimer_accepted', 'true');
  localStorage.setItem('retire_plan_onboarding_completed', 'true');
  localStorage.setItem('retire_plan_inputs', JSON.stringify({
    schemaVersion: INPUTS_SCHEMA_VERSION,
    inputs: { ...DEFAULT_INPUTS, preTaxInit: 80000, rothInit: 15000, taxableInit: 2000000 },
  }));
  window.location.hash = '#/settings/balances';
});

const nestEggText = () => {
  const title = [...document.querySelectorAll('.kpi-title')].find((el) => el.textContent === 'Initial Nest Egg');
  return title.parentElement.querySelector('.kpi-value').textContent;
};

describe('Initial Nest Egg after clearing a balance', () => {
  it('equals the other two balances', { timeout: 60000 }, async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<App />);
      await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
      expect(nestEggText()).toBe('$2,095,000');
      // The Plan tab is loaded on demand, so its fields arrive a moment later.
      await waitFor(() => expect(document.getElementById('field-preTaxInit')).not.toBeNull(), { timeout: 15000 });
      const field = document.getElementById('field-preTaxInit');
      await act(async () => {
        fireEvent.focus(field);
        fireEvent.change(field, { target: { value: '' } });
        fireEvent.blur(field);
      });
      expect(nestEggText()).toBe('$2,015,000');
      const stored = JSON.parse(localStorage.getItem('retire_plan_inputs')).inputs.preTaxInit;
      expect(stored).toBe(0);
    } finally {
      errors.mockRestore();
    }
  });
});
