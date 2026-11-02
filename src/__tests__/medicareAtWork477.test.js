// Changelog 477: a new plan delays Medicare Part B/D, IRMAA and the
// supplement line while each person's own job still covers them; a plan
// saved earlier keeps enrolling at 65.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection, migratePersistedInputs } from '../calculator';
import { budgetShortYears } from '../utils/budgetWarning';
import { buildDemoInputs } from '../config/demoPlan';

const birth = Number(DEFAULT_INPUTS.birthYear1);
const yearAt = (proj, age) => proj.years.find((y) => y.year === birth + age);

describe('Medicare while still at work', () => {
  it('a new plan delays it on each person\'s own job', () => {
    expect(DEFAULT_INPUTS.medicareEmployerCoverage1).toBe('own');
    expect(DEFAULT_INPUTS.medicareEmployerCoverage2).toBe('own');
  });
  it('no premium or supplement at 65 while working; both from the retirement year', () => {
    const proj = runProjection({ ...DEFAULT_INPUTS, retireAge1: 67 });
    for (const age of [65, 66]) {
      const y = yearAt(proj, age);
      expect(y.irmaaCost, `age ${age}`).toBe(0);
      expect(y.medicareSupplement, `age ${age}`).toBe(0);
    }
    const r = yearAt(proj, 67);
    expect(r.irmaaCost).toBeGreaterThan(0);
    expect(r.medicareSupplement).toBeGreaterThan(0);
  });
  it('enrolling at 65 still charges both, as before', () => {
    const y = yearAt(runProjection({ ...DEFAULT_INPUTS, retireAge1: 67, medicareEmployerCoverage1: 'none' }), 65);
    expect(y.irmaaCost).toBeGreaterThan(0);
    expect(y.medicareSupplement).toBeGreaterThan(0);
  });
  it('the sample plan no longer shows a budget warning', () => {
    expect(budgetShortYears(runProjection(DEFAULT_INPUTS).years)).toEqual([]);
  });
  it('a plan saved without the setting keeps enrolling at 65; the demo families delay like a new plan', () => {
    const { inputs } = migratePersistedInputs({ schemaVersion: 4, inputs: { birthYear1: 1970 } });
    expect(inputs.medicareEmployerCoverage1).toBe('none');
    expect(inputs.medicareEmployerCoverage2).toBe('none');
    expect(buildDemoInputs().medicareEmployerCoverage1).toBe('own');
  });
});
