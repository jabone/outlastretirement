// Changelog 241 (John, 2026-09-24): a spouse who turns 65 while covered by
// a current employer's plan (20+ employees) can delay Part B / Part D, so
// the plan must not charge Medicare premiums until the covering job ends.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS } from '../calculator';

const plan = (over) => {
  for (const k of Object.keys(over)) {
    if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  }
  return { ...DEFAULT_INPUTS, ...over };
};
const START = DEFAULT_INPUTS.planYear;
// Partner A's shape: 58 and works to 63; Partner B is 61 and turns 65 while
// he is still working.
const couple = {
  birthYear1: START - 58, retireAge1: 63, lifeExpectancy1: 92,
  spouse2Enabled: true, birthYear2: START - 61, retireAge2: 61, lifeExpectancy2: 92,
  salary1: 200000, salary2: 0, preTaxInit: 1500000, taxableInit: 600000, rothInit: 200000,
  lifestyleExpense: 110000, stateOfResidence: 'TX', stateTaxState: 'none',
};
const at = (proj, age2) => proj.years.find((y) => y.age2 === age2);

describe('Medicare while still on an employer plan', () => {
  const enroll = runProjection(plan(couple));
  const delay = runProjection(plan({ ...couple, medicareEmployerCoverage2: 'spouse' }));

  it('is off by default: Medicare from 65, exactly as before', () => {
    expect(DEFAULT_INPUTS.medicareEmployerCoverage1).toBe('none');
    expect(DEFAULT_INPUTS.medicareEmployerCoverage2).toBe('none');
    expect(at(enroll, 65).irmaaCost).toBeGreaterThan(0);
    expect(at(enroll, 65).medicareDeferred2).toBe(false);
  });

  it('charges her nothing while his job covers her, and starts the year he retires', () => {
    // He retires at 63, when she is 66; before that she is 65 on his plan.
    const y65 = at(delay, 65);
    expect(y65.age1).toBeLessThan(63);
    expect(y65.medicareDeferred2).toBe(true);
    expect(y65.irmaaCost).toBe(0);
    const y66 = at(delay, 66);
    expect(y66.age1).toBe(63);
    expect(y66.medicareDeferred2).toBe(false);
    expect(y66.irmaaCost).toBeGreaterThan(0);
  });

  it('changes nothing once the covering job has ended', () => {
    let checked = 0;
    for (const y of delay.years.filter((row) => row.age1 >= 63)) {
      const same = enroll.years.find((row) => row.year === y.year);
      expect(y.medicareDeferred2).toBe(false);
      // Premiums count members the same way from here; IRMAA tiers can
      // differ by a lookback year, so compare member status, not dollars.
      expect(same.medicareDeferred2).toBe(false);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
    // And the delayed plan is at least as well off: it paid less premium.
    expect(delay.endingBalance).toBeGreaterThan(enroll.endingBalance);
  });

  it('follows the worker the setting names: her own job ended at 61, so it buys her nothing', () => {
    const own = runProjection(plan({ ...couple, medicareEmployerCoverage2: 'own' }));
    expect(at(own, 65).medicareDeferred2).toBe(false);
    expect(at(own, 65).irmaaCost).toBeCloseTo(at(enroll, 65).irmaaCost, 6);
  });

  it('covers someone on their own job past 65', () => {
    const late = plan({ birthYear1: START - 64, retireAge1: 67, lifeExpectancy1: 90, salary1: 150000,
      preTaxInit: 900000, lifestyleExpense: 80000, stateOfResidence: 'TX', stateTaxState: 'none', medicareEmployerCoverage1: 'own' });
    const proj = runProjection(late);
    const y65 = proj.years.find((y) => y.age1 === 65);
    const y66 = proj.years.find((y) => y.age1 === 66);
    const y67 = proj.years.find((y) => y.age1 === 67);
    expect(y65.medicareDeferred1).toBe(true);
    expect(y66.medicareDeferred1).toBe(true);
    expect(y65.irmaaCost + y66.irmaaCost).toBe(0);
    expect(y67.medicareDeferred1).toBe(false);
    expect(y67.irmaaCost).toBeGreaterThan(0);
  });

  it('charges one member, not two, when only one of a 65+ couple is covered', () => {
    const both65 = plan({ ...couple, birthYear1: START - 66, retireAge1: 68, birthYear2: START - 66, retireAge2: 60,
      medicareEmployerCoverage1: 'own', medicareEmployerCoverage2: 'none' });
    const both = plan({ ...both65, medicareEmployerCoverage1: 'none' });
    const y = runProjection(both65).years[0];
    const yBoth = runProjection(both).years[0];
    expect(y.medicareDeferred1).toBe(true);
    expect(y.partBCost).toBeGreaterThan(0);
    expect(y.partBCost).toBeCloseTo(yBoth.partBCost / 2, 6);
  });
});
