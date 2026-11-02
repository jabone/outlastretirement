// Benefits-specialist review (2026-11-02, changelog 478): delaying Medicare
// on a job's cover needs a job that pays, and HSA contributions stop with
// Medicare.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_INPUTS, runProjection } from '../calculator';

const base = { ...DEFAULT_INPUTS, planYear: 2026, stateTaxState: 'none' };
const at = (inputs, year) => runProjection({ ...base, ...inputs }).years.find((y) => y.year === year);

describe('Medicare delay needs a paycheck', () => {
  const couple = {
    spouse2Enabled: true, filingStatus: 'MFJ',
    birthYear1: 1963, retireAge1: 67, claimingAge1: 67, salary1: 120000,
    birthYear2: 1961, salary2: 0, retireAge2: 67, claimingAge2: 67, ss2: 12000,
  };
  it('a spouse at home enrolls at 65 even with a later retirement age', () => {
    const y = at(couple, 2026); // she is 65
    expect(y.medicareDeferred2).toBe(false);
    expect(y.partBCost).toBeGreaterThan(0);
  });
  it('she can still delay on her husband\'s job', () => {
    const y = at({ ...couple, medicareEmployerCoverage2: 'spouse' }, 2026);
    expect(y.medicareDeferred2).toBe(true);
  });
  it('the working husband delays on his own job', () => {
    expect(at(couple, 2028).medicareDeferred1).toBe(true); // he is 65
  });
});

describe('HSA contributions stop with Medicare', () => {
  const worker = { birthYear1: 1962, retireAge1: 68, salary1: 120000, hsaContribution: 4000 };
  it('enrolling at 65 ends them at 65', () => {
    const p = { ...worker, claimingAge1: 68, medicareEmployerCoverage1: 'none' };
    expect(at(p, 2026).hsaContribution).toBe(4000); // 64
    expect(at(p, 2027).hsaContribution).toBe(0); // 65, enrolled
  });
  it('delaying Medicare keeps them going until Social Security is claimed', () => {
    const p = { ...worker, claimingAge1: 66 };
    expect(at(p, 2027).hsaContribution).toBe(4000); // 65, delayed, not claimed
    expect(at(p, 2028).hsaContribution).toBe(0); // 66, claimed: Part A
  });
  it('max mode follows the same rule', () => {
    const p = { ...worker, claimingAge1: 68, medicareEmployerCoverage1: 'none', autoMaxContribution1: 'max' };
    expect(at(p, 2026).hsaContribution).toBeGreaterThan(0);
    expect(at(p, 2027).hsaContribution).toBe(0);
  });
});

describe('the Social Security section mentions a former spouse\'s record', () => {
  it('says what to do when that pays more', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/plan/sections/SocialSecuritySection.jsx'), 'utf8');
    expect(src).toMatch(/data-testid="ss-divorced-note"/);
    expect(src).toMatch(/marriage of 10 years or more/);
  });
});
