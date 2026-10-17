// The engine's result.warnings (A24 debt payment below interest, A27
// lump-sum pension already past) and result.invalidInputs (E28) reach the
// Dashboard's Plan Feedback in plain words.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection, rmdStartAge } from '../calculator';
import { getPlanFeedback } from '../utils/planFeedback';
import { assertKnownInputKeys } from './knownInputKeys';

const START = DEFAULT_INPUTS.planYear;
const plan = (over) => { assertKnownInputKeys(over); return { ...DEFAULT_INPUTS, ...over }; };
const feedback = (inputs) => getPlanFeedback(inputs, runProjection(inputs), null, rmdStartAge);

describe('Plan Feedback shows the engine\'s warnings', () => {
  it('a mortgage payment below the interest', () => {
    const inputs = plan({ mortgageBalance: 400000, mortgageRate: 6, mortgagePayment: 2000 });
    const card = feedback(inputs).find((c) => c.code === 'mortgage-payment-below-interest');
    expect(card).toBeTruthy();
    expect(card.desc).toBe('Your mortgage payment doesn’t cover the interest, so the balance grows every year. Check that it’s a yearly amount.');
    expect(feedback(plan({ mortgageBalance: 400000, mortgageRate: 6, mortgagePayment: 36000 }))
      .some((c) => c.code === 'mortgage-payment-below-interest')).toBe(false);
  });

  it('other debt below the interest', () => {
    const card = feedback(plan({ otherDebtBalance: 50000, otherDebtRate: 10, otherDebtPayment: 1000 }))
      .find((c) => c.code === 'debt-payment-below-interest');
    expect(card.desc).toMatch(/^Your other debt payment doesn.t cover the interest/);
  });

  it('a lump-sum pension whose start age has passed', () => {
    const inputs = plan({ birthYear1: START - 66, pension1: 20000, pension1LumpSum: true, pensionStartAge1: 60, spouse1Name: 'Sam' });
    const card = feedback(inputs).find((c) => c.code === 'pension1-lump-sum-already-paid');
    expect(card.desc).toMatch(/^Sam.s lump-sum pension starts at an age before this plan.s first year/);
  });

  it('a life expectancy below today\'s age gets one Check these inputs card', () => {
    const age = START - DEFAULT_INPUTS.birthYear1;
    const cards = feedback(plan({ lifeExpectancy1: age - 5 })).filter((c) => c.title === 'Check these inputs');
    expect(cards).toHaveLength(1);
    expect(cards[0].desc).toContain(`(${age - 5}) is below today’s age (${age})`);
    expect(feedback(DEFAULT_INPUTS).some((c) => c.title === 'Check these inputs')).toBe(false);
  });
});
