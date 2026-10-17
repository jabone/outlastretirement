// @vitest-environment jsdom
// S15: /app?demo=1 asks before swapping a returning user's own plan for
// the demo; a first-time visitor goes straight in.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasOwnPlanData, askBeforeDemo, DEMO_OVER_OWN_PLAN_QUESTION } from '../utils/demoEntryGuard';
import { DEFAULT_INPUTS, INPUTS_SCHEMA_VERSION } from '../calculator';

describe('hasOwnPlanData', () => {
  beforeEach(() => localStorage.clear());

  it('is false for a first visit and for an untouched default plan', () => {
    expect(hasOwnPlanData()).toBe(false);
    localStorage.setItem('retire_plan_inputs', JSON.stringify({ schemaVersion: INPUTS_SCHEMA_VERSION, inputs: DEFAULT_INPUTS }));
    localStorage.setItem('retire_plan_scenarios', JSON.stringify({ schemaVersion: INPUTS_SCHEMA_VERSION, scenarios: [] }));
    expect(hasOwnPlanData()).toBe(false);
  });

  it('is true for a changed plan, a saved scenario, a holding or a Life Plan answer', () => {
    localStorage.setItem('retire_plan_inputs', JSON.stringify({ schemaVersion: INPUTS_SCHEMA_VERSION, inputs: { ...DEFAULT_INPUTS, lifestyleExpense: 12345 } }));
    expect(hasOwnPlanData()).toBe(true);
    localStorage.clear();
    localStorage.setItem('retire_plan_scenarios', JSON.stringify({ scenarios: [{ id: 1 }] }));
    expect(hasOwnPlanData()).toBe(true);
    localStorage.clear();
    localStorage.setItem('cfe_premium_holdings_v1', JSON.stringify([{ symbol: 'VTI' }]));
    expect(hasOwnPlanData()).toBe(true);
    localStorage.clear();
    localStorage.setItem('cfe_life_plan_v1', JSON.stringify({ ordinaryTuesday: { text: 'x' } }));
    expect(hasOwnPlanData()).toBe(true);
  });
});

describe('askBeforeDemo', () => {
  it('asks the question and resolves with the answer', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = askBeforeDemo(host);
    expect(host.textContent).toContain(DEMO_OVER_OWN_PLAN_QUESTION);
    [...host.querySelectorAll('button')].find((b) => b.textContent === 'Stay on My Plan').click();
    expect(await p).toBe(false);
    expect(host.innerHTML).toBe('');
    const p2 = askBeforeDemo(host);
    [...host.querySelectorAll('button')].find((b) => b.textContent === 'Open the Demo').click();
    expect(await p2).toBe(true);
  });
});
