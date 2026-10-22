// @vitest-environment jsdom
//
// The storage-key inventory (utils/storageKeys.js) is what Backup
// Everything, Erase everything and the crash screen's "Download my data"
// agree on. These tests keep it honest:
//   1. every key-like literal in the source is classified, so a new key
//      cannot ship without someone deciding whether a backup carries it;
//   2. every PLAN key survives Backup -> Restore into an empty browser
//      unchanged -- the Life Plan and the annual review once did not.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PLAN_KEYS, DEVICE_KEYS, TRANSIENT_KEYS, RETIRED_KEYS, removeRetiredKeys, APP_INDEXED_DB_NAMES, listAppKeys, snapshotAppStorage } from '../utils/storageKeys';
import { buildFullBackupPayload, applyFullBackupToStorage } from '../utils/fullBackup';
import { DEFAULT_INPUTS, INPUTS_SCHEMA_VERSION, migrateScenarios } from '../calculator';
import { createHolding, sanitizeImportedHoldings } from '../utils/portfolioHoldings';
import { FULL_BACKUP_VERSION } from '../utils/fullBackup';
import { ENCRYPTED_BACKUP_VERSION } from '../utils/backupCrypto';

const SRC = path.resolve(__dirname, '..');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('storage key inventory', () => {
  it('classifies every storage-key literal in the source', () => {
    const found = new Set();
    for (const file of walk(SRC)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/['"`]((?:retire_plan_|cfe_)[A-Za-z0-9_]+)['"`]/g)) found.add(m[1]);
    }
    // Sanity: the scan itself works.
    expect(found.has('retire_plan_inputs')).toBe(true);
    expect(found.size).toBeGreaterThan(30);
    const known = new Set([...PLAN_KEYS, ...DEVICE_KEYS, ...TRANSIENT_KEYS, ...RETIRED_KEYS]);
    const unclassified = [...found].filter((k) => !known.has(k));
    expect(unclassified).toEqual([]);
    // Nothing listed that the source no longer uses.
    const stale = [...known].filter((k) => !found.has(k));
    expect(stale).toEqual([]);
    // Non-storage identifiers that share the prefix are not keys.
    expect(APP_INDEXED_DB_NAMES).toContain('cfe-cloud-file');
    expect([FULL_BACKUP_VERSION, ENCRYPTED_BACKUP_VERSION].every((v) => v.startsWith('cfe-'))).toBe(true);
  });

  it('removes retired keys, and only those', () => {
    localStorage.setItem('cfe_dev_premium', 'true');
    localStorage.setItem('retire_plan_inputs', '{}');
    removeRetiredKeys();
    expect(localStorage.getItem('cfe_dev_premium')).toBeNull();
    expect(localStorage.getItem('retire_plan_inputs')).toBe('{}');
  });

  it('puts each key in exactly one class', () => {
    const all = [...PLAN_KEYS, ...DEVICE_KEYS, ...TRANSIENT_KEYS, ...RETIRED_KEYS];
    expect(new Set(all).size).toBe(all.length);
  });
});

// A realistic, already-normalized value for every PLAN key: what the app
// itself would have written. Restoring it must give back the same bytes.
function seedEveryPlanKey() {
  const holding = sanitizeImportedHoldings([createHolding({ symbol: 'VTI', shares: 10, currentPrice: 250 })])[0];
  const scenarios = migrateScenarios([{ id: 's1', name: 'Retire at 60', inputs: { ...DEFAULT_INPUTS, retireAge1: 60 }, metrics: { endingBalance: 1, isSuccessful: true, peakPortfolioWorth: 2, successProbability: 81 }, tag: 'mine', planYearAtSave: 2026, savedAt: '2026-09-01T00:00:00.000Z', answers: { protect: 'Working past 62' } }]);
  const values = {
    retire_plan_inputs: { schemaVersion: INPUTS_SCHEMA_VERSION, inputs: { ...DEFAULT_INPUTS, lifestyleExpense: 61234 } },
    retire_plan_scenarios: { schemaVersion: INPUTS_SCHEMA_VERSION, scenarios: scenarios },
    cfe_premium_holdings_v1: [holding],
    cfe_premium_liquidations_v1: [{ id: 'l1', symbol: 'VTI', date: '2026-01-02', shares: 1, proceeds: 250 }],
    retire_plan_interview_progress: { current: 'income', visited: ['household', 'income'] },
    cfe_estate_checklist_v1: { will: { done: true, completedAt: '2026-03-01' } },
    retire_plan_answers_v1: { maximize: 'Time with the grandkids', protect: 'The house', giveUp: 'A second car' },
    cfe_life_plan_v1: { ordinaryTuesday: { text: 'Walk the dog, then the workshop.', updatedAt: '2026-09-01', history: [{ text: 'Sleep in.', date: '2026-08-01' }] } },
    retire_plan_annual_review_v1: { 2026: { done: { balances: '2026-01-10T00:00:00.000Z' }, completedAt: null } },
    cfe_reconciliations_v1: { '2026-Q3': { Brokerage: { at: '2026-10-05T15:00:00.000Z' } } },
    cfe_data_freshness_v1: { firstSeenAt: 1, lastPlanChangeAt: 2, lastBackupAt: 3, lastPortfolioUpdateAt: 4, portfolioReminderCadence: 'monthly', backupSnoozedUntil: null, portfolioSnoozedUntil: null },
    cfe_premium_pricing_source_v1: { csvUrl: 'https://docs.google.com/spreadsheets/d/e/x/pub?output=csv', scriptUrl: 'https://script.google.com/macros/s/x/exec' },
    cfe_premium_jwt: 'aaa.bbb.ccc',
  };
  expect(Object.keys(values).sort()).toEqual([...PLAN_KEYS].sort());
  for (const [k, v] of Object.entries(values)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  return values;
}

describe('Backup Everything round trip', () => {
  beforeEach(() => localStorage.clear());

  it('every PLAN key survives build -> restore into an empty browser', () => {
    const seeded = seedEveryPlanKey();
    const payload = JSON.parse(JSON.stringify(buildFullBackupPayload()));
    localStorage.clear();
    applyFullBackupToStorage(payload, { isPremium: false, premiumKeyValid: true, restorePricingSource: true });

    for (const key of PLAN_KEYS) {
      const raw = localStorage.getItem(key);
      expect(raw, key).not.toBeNull();
      if (key === 'cfe_premium_jwt') { expect(raw).toBe(seeded[key]); continue; }
      const back = JSON.parse(raw);
      if (key === 'cfe_data_freshness_v1') {
        // The portfolio clock and cadence come back; the backup clock
        // restarts (the data on this browser IS the backup).
        expect(back.lastPortfolioUpdateAt).toBe(4);
        expect(back.portfolioReminderCadence).toBe('monthly');
        continue;
      }
      expect(back, key).toEqual(seeded[key]);
    }
  });

  it('the crash-screen snapshot and the key listing see every app key', () => {
    seedEveryPlanKey();
    localStorage.setItem('retire_plan_theme', 'dark');
    localStorage.setItem('unrelated_site_key', 'x');
    const keys = listAppKeys();
    expect(keys).toContain('retire_plan_theme');
    expect(keys).not.toContain('unrelated_site_key');
    const snap = snapshotAppStorage();
    for (const k of PLAN_KEYS) expect(typeof snap[k]).toBe('string');
    expect(snap.unrelated_site_key).toBeUndefined();
  });
});
