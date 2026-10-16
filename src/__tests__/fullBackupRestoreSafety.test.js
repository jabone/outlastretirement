// @vitest-environment jsdom
//
// A backup file is untrusted input. These are the hostile and odd files
// an outside review restored: each must either restore into a shape every
// view can render, or be refused with a message, having written nothing.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  applyFullBackupToStorage,
  stageFullBackup,
  summarizeBackupPayload,
  describePricingSource,
  BackupRestoreError,
} from '../utils/fullBackup';
import { DEFAULT_INPUTS, INPUTS_SCHEMA_VERSION } from '../calculator';

const read = (k) => JSON.parse(localStorage.getItem(k));

describe('restore: unversioned files (E9)', () => {
  beforeEach(() => localStorage.clear());

  it('a file with no top-level schemaVersion restores its own plan, not the defaults', () => {
    applyFullBackupToStorage({ activeInputs: { lifestyleExpense: 11111 } });
    const stored = read('retire_plan_inputs');
    expect(stored.schemaVersion).toBe(INPUTS_SCHEMA_VERSION);
    expect(stored.inputs.lifestyleExpense).toBe(11111);
    expect(stored.inputs.lifestyleExpense).not.toBe(DEFAULT_INPUTS.lifestyleExpense);
    // No wrapper keys leaked into the plan.
    expect(stored.inputs.inputs).toBeUndefined();
  });

  it('a versioned file and a file whose activeInputs is a stored wrapper both restore', () => {
    applyFullBackupToStorage({ schemaVersion: INPUTS_SCHEMA_VERSION, activeInputs: { lifestyleExpense: 22222 } });
    expect(read('retire_plan_inputs').inputs.lifestyleExpense).toBe(22222);
    applyFullBackupToStorage({ activeInputs: { schemaVersion: INPUTS_SCHEMA_VERSION, inputs: { lifestyleExpense: 33333 } } });
    expect(read('retire_plan_inputs').inputs.lifestyleExpense).toBe(33333);
  });
});

describe('restore: corrupt and crafted sections (H7)', () => {
  beforeEach(() => localStorage.clear());

  it('drops null and non-object scenarios, and makes every name a string', () => {
    const restored = applyFullBackupToStorage({ savedScenarios: [null, 'str', 5, { id: { x: 1 }, name: { a: 1 }, inputs: 5, metrics: { endingBalance: 1 }, tag: {} }, { id: 's2', name: 42 }] });
    const list = read('retire_plan_scenarios').scenarios;
    expect(list).toHaveLength(2);
    expect(list.every((s) => typeof s.name === 'string')).toBe(true);
    expect(list[0].name).toBe('Untitled scenario');
    expect(list[1].name).toBe('42');
    expect(list.every((s) => typeof s.id === 'string' || typeof s.id === 'number')).toBe(true);
    expect('tag' in list[0]).toBe(false);
    expect(list.every((s) => typeof s.metrics.endingBalance === 'number')).toBe(true);
    expect(restored).toContain('2 saved scenarios');
  });

  it('savedScenarios: [null] no longer throws half-way after the plan was written', () => {
    expect(() => applyFullBackupToStorage({ activeInputs: { lifestyleExpense: 1 }, savedScenarios: [null] })).not.toThrow();
    expect(read('retire_plan_scenarios').scenarios).toEqual([]);
  });

  it('coerces holdings with non-string symbols and non-list fields', () => {
    applyFullBackupToStorage({ portfolioHoldings: [{ symbol: { a: 1 }, name: 7, shares: 'x', lots: 'notarray', dividendHistory: 5, pricingAnchor: 'x' }, 5, null, 'str'], liquidations: [{ id: 'l1', shares: {}, date: {} }, 7] }, { isPremium: true });
    const holdings = read('cfe_premium_holdings_v1');
    expect(holdings).toHaveLength(1);
    expect(typeof holdings[0].symbol).toBe('string');
    expect(typeof holdings[0].name).toBe('string');
    expect(Number.isFinite(holdings[0].shares)).toBe(true);
    const liq = read('cfe_premium_liquidations_v1');
    expect(liq).toHaveLength(1);
    expect(typeof liq[0].date).toBe('string');
    expect(liq[0].shares).toBe(0);
  });

  it('refuses an unreadable plan, having written nothing', () => {
    localStorage.setItem('retire_plan_scenarios', 'KEEP');
    for (const activeInputs of ['str', 5, [1, 2]]) {
      expect(() => applyFullBackupToStorage({ activeInputs, savedScenarios: [] })).toThrow(BackupRestoreError);
    }
    expect(localStorage.getItem('retire_plan_scenarios')).toBe('KEEP');
    expect(localStorage.getItem('retire_plan_inputs')).toBeNull();
  });

  it('never writes a Premium key that is not token-shaped or failed verification', () => {
    localStorage.setItem('cfe_premium_jwt', 'good.working.key');
    applyFullBackupToStorage({ activeInputs: {}, premiumJwt: '<img src=x>' });
    expect(localStorage.getItem('cfe_premium_jwt')).toBe('good.working.key');
    applyFullBackupToStorage({ activeInputs: {}, premiumJwt: 'aaa.bbb.ccc' }, { premiumKeyValid: false });
    expect(localStorage.getItem('cfe_premium_jwt')).toBe('good.working.key');
    applyFullBackupToStorage({ activeInputs: {}, premiumJwt: 'aaa.bbb.ccc' }, { premiumKeyValid: true });
    expect(localStorage.getItem('cfe_premium_jwt')).toBe('aaa.bbb.ccc');
  });

  it('cleans the checklist, Life Plan, annual review and interview progress, and resists __proto__', () => {
    const file = JSON.parse('{"activeInputs":{},"estateChecklist":{"__proto__":{"polluted":1},"will":{"done":true,"completedAt":{}},"x":"done"},'
      + '"lifePlan":{"ordinaryTuesday":{"text":{"a":1}},"unknownPrompt":{"text":"x"}},'
      + '"annualReview":{"2026":{"done":{"a":"2026-01-01","b":{}}},"notayear":{}},'
      + '"interviewProgress":{"current":{},"visited":[1,"income",{}]}}');
    applyFullBackupToStorage(file);
    expect(({}).polluted).toBeUndefined();
    expect(read('cfe_estate_checklist_v1')).toEqual({ will: { done: true, completedAt: null } });
    expect(read('cfe_life_plan_v1')).toEqual({ ordinaryTuesday: { text: '', updatedAt: null, history: [] } });
    expect(read('retire_plan_annual_review_v1')).toEqual({ 2026: { done: { a: '2026-01-01' }, completedAt: null } });
    expect(read('retire_plan_interview_progress')).toEqual({ current: 'household', visited: ['income'] });
  });

  it('is all or nothing: a failed write puts every touched key back', () => {
    localStorage.setItem('retire_plan_inputs', 'OLD-PLAN');
    localStorage.setItem('retire_plan_scenarios', 'OLD-SCENARIOS');
    const real = Object.getPrototypeOf(localStorage).setItem;
    const spy = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem').mockImplementation(function (key, value) {
      if (key === 'retire_plan_scenarios' && value !== 'OLD-SCENARIOS') {
        const e = new Error('full'); e.name = 'QuotaExceededError'; throw e;
      }
      return real.call(this, key, value);
    });
    try {
      expect(() => applyFullBackupToStorage({ activeInputs: { lifestyleExpense: 5 }, savedScenarios: [] })).toThrow(/nothing was restored/);
    } finally {
      spy.mockRestore();
    }
    expect(localStorage.getItem('retire_plan_inputs')).toBe('OLD-PLAN');
    expect(localStorage.getItem('retire_plan_scenarios')).toBe('OLD-SCENARIOS');
  });

  it('the summary counts only what a restore keeps and never trusts a non-string', () => {
    expect(summarizeBackupPayload({ savedScenarios: [null, 5], premiumJwt: { a: 1 } })).toBe('no plan data yet');
    expect(summarizeBackupPayload({ lifePlan: { ordinaryTuesday: { text: 'x' } } })).toBe('1 Life Plan answer');
  });
});

describe('restore: Live Pricing connection (S7, S6)', () => {
  beforeEach(() => localStorage.clear());
  const good = { csvUrl: 'https://docs.google.com/spreadsheets/d/e/x/pub?output=csv', scriptUrl: 'https://script.google.com/macros/s/x/exec' };

  it('is not restored unless the user asks, even when the file has one', () => {
    localStorage.setItem('cfe_premium_pricing_source_v1', JSON.stringify({ csvUrl: '', scriptUrl: 'https://script.google.com/mine' }));
    applyFullBackupToStorage({ activeInputs: {}, pricingSource: good });
    expect(read('cfe_premium_pricing_source_v1').scriptUrl).toBe('https://script.google.com/mine');
    applyFullBackupToStorage({ activeInputs: {}, pricingSource: good }, { restorePricingSource: true });
    expect(read('cfe_premium_pricing_source_v1')).toEqual(good);
  });

  it('a scriptUrl-only connection is described, not hidden', () => {
    const d = describePricingSource({ scriptUrl: 'https://script.google.com/x' });
    expect(d).toEqual({ csvUrl: '', scriptUrl: 'https://script.google.com/x', present: true, allowed: true });
    expect(summarizeBackupPayload({ pricingSource: { scriptUrl: 'https://script.google.com/x' } })).toMatch(/Live Pricing/);
  });

  it('refuses non-Google links when asked to restore them, having written nothing', () => {
    expect(() => stageFullBackup({ activeInputs: {}, pricingSource: { csvUrl: 'javascript:alert(1)', scriptUrl: 'https://evil.example/collect' } }, { restorePricingSource: true }))
      .toThrow(/Google Sheet/);
    expect(localStorage.getItem('retire_plan_inputs')).toBeNull();
    expect(describePricingSource({ scriptUrl: 'https://evil.example/collect' }).allowed).toBe(false);
  });
});

describe('restore: plan fields keep their kind (H7)', () => {
  beforeEach(() => localStorage.clear());

  it('replaces objects where numbers, strings or booleans belong, keeps typed text and real values', () => {
    const numKey = 'lifestyleExpense';
    const strKey = Object.keys(DEFAULT_INPUTS).find((k) => typeof DEFAULT_INPUTS[k] === 'string');
    const boolKey = Object.keys(DEFAULT_INPUTS).find((k) => typeof DEFAULT_INPUTS[k] === 'boolean');
    applyFullBackupToStorage({
      activeInputs: {
        [numKey]: { a: 1 }, [strKey]: { a: 1 }, [boolKey]: { a: 1 },
        salary1: '123000', retireAge1: 61,
        heirs: [5, null, { id: 1, name: 'Ann', filingStatus: 'Single', income: 1, splitPct: 100 }],
        lifestyleExpenseMonthly: [1, { x: 1 }, '3'],
        spendingBlueprint: 'zzz',
        milestones: 7,
      },
    });
    const i = read('retire_plan_inputs').inputs;
    expect(i[numKey]).toBe(DEFAULT_INPUTS[numKey]);
    expect(i[strKey]).toBe(DEFAULT_INPUTS[strKey]);
    expect(i[boolKey]).toBe(DEFAULT_INPUTS[boolKey]);
    expect(i.salary1).toBe('123000');
    expect(i.retireAge1).toBe(61);
    expect(i.heirs).toHaveLength(1);
    expect(i.heirs[0].name).toBe('Ann');
    expect(i.lifestyleExpenseMonthly).toEqual([1, DEFAULT_INPUTS.lifestyleExpenseMonthly[1], '3']);
    expect(i.spendingBlueprint).toEqual(DEFAULT_INPUTS.spendingBlueprint);
    expect(i.milestones).toEqual(DEFAULT_INPUTS.milestones);
  });
});
