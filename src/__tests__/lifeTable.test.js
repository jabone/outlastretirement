// The SSA period life table (changelog 248) is transcribed data; these
// tests prove the transcription IS the published table rather than a
// near-miss, using the two columns the arrays do not carry: chaining
// "number of lives" from 100,000 and the implied life expectancies.
import { describe, it, expect } from 'vitest';
import { MALE_QX, FEMALE_QX, PUBLISHED_CHECKPOINTS, LIFE_TABLE_MAX_AGE } from '../config/lifeTable';

function chain(qx) {
  const lx = [100000];
  let l = 100000;
  for (let a = 0; a <= LIFE_TABLE_MAX_AGE; a++) { l *= (1 - qx[a]); lx.push(l); }
  return lx;
}

function lifeExpectancy(qx, fromAge) {
  // Curtate expectation plus a half year, which is how the SSA column is
  // built to the precision shown.
  let alive = 1, e = 0;
  for (let a = fromAge; a <= LIFE_TABLE_MAX_AGE; a++) { alive *= (1 - qx[a]); e += alive; }
  return e + 0.5;
}

describe('SSA 2023 period life table transcription', () => {
  it('has 120 death probabilities per sex, each a probability, rising through old age', () => {
    for (const qx of [MALE_QX, FEMALE_QX]) {
      expect(qx).toHaveLength(LIFE_TABLE_MAX_AGE + 1);
      for (const q of qx) { expect(q).toBeGreaterThan(0); expect(q).toBeLessThan(1); }
      // Monotone from 40 on -- a mistyped digit in the tail shows up here.
      let rises = 0;
      for (let a = 41; a <= LIFE_TABLE_MAX_AGE; a++) if (qx[a] > qx[a - 1]) rises++;
      expect(rises).toBe(LIFE_TABLE_MAX_AGE - 40);
    }
  });

  it('reproduces the published number-of-lives checkpoints from 100,000', () => {
    for (const [sex, qx] of [['male', MALE_QX], ['female', FEMALE_QX]]) {
      const lx = chain(qx);
      let checked = 0;
      for (const [age, pub] of Object.entries(PUBLISHED_CHECKPOINTS[sex])) {
        expect(Math.abs(lx[Number(age)] - pub.lx), `${sex} l(${age})`).toBeLessThan(1.5);
        checked++;
      }
      expect(checked).toBe(3);
    }
  });

  it('reproduces the published life expectancies to the hundredth', () => {
    for (const [sex, qx] of [['male', MALE_QX], ['female', FEMALE_QX]]) {
      let checked = 0;
      for (const [age, pub] of Object.entries(PUBLISHED_CHECKPOINTS[sex])) {
        expect(lifeExpectancy(qx, Number(age)), `${sex} e(${age})`).toBeCloseTo(pub.ex, 2);
        checked++;
      }
      expect(checked).toBe(3);
    }
  });

  it('women outlive men at every age below the table’s shared tail', () => {
    let lower = 0;
    for (let a = 0; a < 109; a++) if (FEMALE_QX[a] < MALE_QX[a]) lower++;
    expect(lower).toBe(109);
  });
});
