// The Social Security start month (changelog 464) through Backup
// Everything: a plan with a May start comes back with it, and a backup
// made before the field existed restores to the January (whole-year) plan.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { buildFullBackupPayload, applyFullBackupToStorage } from '../utils/fullBackup';
import { DEFAULT_INPUTS, runProjection, migrateInputs } from '../calculator';

const plan = { ...DEFAULT_INPUTS, claimingAge1: 67, claimMonth1: 4 };
const restoredInputs = () => {
  const raw = JSON.parse(localStorage.getItem('retire_plan_inputs'));
  return migrateInputs(raw && 'inputs' in raw ? raw.inputs : raw);
};

describe('start month in a backup', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips and projects the same', () => {
    localStorage.setItem('retire_plan_inputs', JSON.stringify({ inputs: plan }));
    const payload = JSON.parse(JSON.stringify(buildFullBackupPayload()));
    localStorage.clear();
    applyFullBackupToStorage(payload);
    const back = restoredInputs();
    expect(back.claimMonth1).toBe(4);
    expect(runProjection(back).years).toEqual(runProjection(plan).years);
  });

  it('an older backup without the field restores to January', () => {
    const { claimMonth1, claimMonth2, ...old } = DEFAULT_INPUTS; // eslint-disable-line no-unused-vars
    applyFullBackupToStorage({ version: 'cfe-full-backup-1', activeInputs: old, savedScenarios: [] });
    const back = restoredInputs();
    expect(back.claimMonth1 ?? 0).toBe(0);
    expect(runProjection(back).years).toEqual(runProjection(DEFAULT_INPUTS).years);
  });
});
