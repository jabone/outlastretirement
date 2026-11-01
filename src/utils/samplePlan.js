// Is the plan on screen still the built-in sample (novice review
// 2026-11-01)? A first-time visitor who skips setup, or who is looking at
// the app behind the welcome screens, sees the starter plan's figures and
// its verdict, and reads them as theirs. Until the person has changed the
// facts only they know, the app says these are sample figures.
//
// The test is deliberately narrow: the figures that describe a person
// (birth year, pay, the three balances, retirement spending). Changing an
// assumption such as inflation does not make the plan theirs; changing any
// one of these does. The demo households are never "the sample": they say
// who they are in their own banner.
import { DEFAULT_INPUTS } from '../calculator';

export const SAMPLE_IDENTITY_KEYS = Object.freeze(['birthYear1', 'salary1', 'preTaxInit', 'rothInit', 'taxableInit', 'lifestyleExpense']);

export function isSamplePlan(inputs, { demoActive = false } = {}) {
  if (demoActive || !inputs) return false;
  return SAMPLE_IDENTITY_KEYS.every((k) => Number(inputs[k]) === Number(DEFAULT_INPUTS[k]));
}

// The status every compact surface shows while the plan is the sample: a
// neutral word, not the sample's red or green verdict.
export function sampleStatus(inputs) {
  const age = (Number(inputs?.planYear) || 0) - (Number(inputs?.birthYear1) || 0);
  return {
    tone: 'neutral',
    label: 'Sample plan',
    detail: `These are sample figures for a made-up ${age > 0 ? `${age}-year-old` : 'person'}, not you. Enter your own to see your answer.`,
  };
}
