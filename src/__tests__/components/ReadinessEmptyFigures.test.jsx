// @vitest-environment jsdom
//
// E17: the Readiness tab printed the spend-to-zero search's bound and empty
// interpolations as if they were answers -- "Stopping work in on $48,000",
// "room for about $4,952,000 a year more", "Make $5,000,000 the plan's
// budget", "retiring in instead of ,". Three plans that used to do it.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import ReadinessTab from '../../components/tabs/ReadinessTab';
import { renderWithSimulation } from '../testUtils';
import { DEFAULT_INPUTS, runProjection, findDieWithZeroSpending, DIE_WITH_ZERO_CEILING } from '../../calculator';
import { readinessSummary } from '../../utils/readinessSummary';
import { spendingSolve, spendingSolveOf, printable, SPENDING_SOLVE_TEXT, walkAwayNow } from '../../utils/retirementReadiness';

afterEach(cleanup);

const plan = (over) => {
  for (const k of Object.keys(over)) if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  return { ...DEFAULT_INPUTS, ...over };
};
const AGE = DEFAULT_INPUTS.planYear - DEFAULT_INPUTS.birthYear1;
const PLANS = {
  lifeExpectancyBelowAge: plan({ lifeExpectancy1: AGE - 6 }),
  failsAtZeroSpending: plan({ retireAge1: AGE + 1, preTaxInit: 0, rothInit: 0, taxableInit: 0, lifestyleExpense: 48000 }),
  veryRich: plan({ taxableInit: 400_000_000 }),
};

// dieWithZeroResults the way App.jsx builds it.
const dwzResults = (inputs, projection) => {
  const res = findDieWithZeroSpending(inputs);
  return {
    spending: res.dieWithZeroSpending,
    additionalSpend: res.additionalAnnualSpend,
    reason: res.reason,
    rows: projection.years.length,
    comparisonData: [],
  };
};

const BAD = [/\bin\s+instead of/, /\bin\s+on\b/, /\bof\s*,/, /NaN/, /undefined/, /\bnull\b/, /\bin\s*,/, /\bin\s*\./, /\$5,000,000 the plan/, /room for about \$4,9/, /about \$5,000,000/];

describe('Readiness never prints an empty figure or the search bound', () => {
  for (const [name, inputs] of Object.entries(PLANS)) {
    for (const isPremium of [false, true]) {
      it(`${name} (${isPremium ? 'Premium' : 'free'})`, () => {
        const projection = runProjection(inputs);
        renderWithSimulation(
          <ReadinessTab />,
          { inputs, projection, setActiveTab: vi.fn(), dieWithZeroResults: dwzResults(inputs, projection) },
          { isPremium }
        );
        const text = document.body.textContent;
        for (const re of BAD) expect(text, `${re}`).not.toMatch(re);
        expect(screen.queryByRole('button', { name: /5,000,000 the plan/ })).toBeNull();
        expect(screen.queryByTestId('apply-ceiling')).toBeNull();
      });
    }
  }

  it('says which way each one failed', () => {
    const say = (inputs) => {
      const projection = runProjection(inputs);
      renderWithSimulation(<ReadinessTab />, { inputs, projection, setActiveTab: vi.fn(), dieWithZeroResults: dwzResults(inputs, projection) }, { isPremium: true });
      const t = document.body.textContent;
      cleanup();
      return t;
    };
    // E28 runs a life expectancy below today's age as today's age and
    // lists it in invalidInputs: one "Check these inputs" card, no answers.
    const below = say(PLANS.lifeExpectancyBelowAge);
    expect(below).toContain('Check these inputs');
    expect(below).toMatch(/life expectancy \(\d+\) is below today.s age \(\d+\)/);
    expect(below).not.toContain('If you walked away today');
    expect(say(PLANS.failsAtZeroSpending)).toContain(SPENDING_SOLVE_TEXT.none);
    expect(say(PLANS.veryRich)).toContain(SPENDING_SOLVE_TEXT.aboveCeiling);
  });
});

describe('the guards themselves', () => {
  it('classifies the solver answer', () => {
    expect(spendingSolve(null).status).toBe('none');
    expect(spendingSolve(undefined).status).toBe('none');
    expect(spendingSolve(NaN).status).toBe('none');
    expect(spendingSolve(DIE_WITH_ZERO_CEILING).status).toBe('aboveCeiling');
    expect(spendingSolve(4999999.999995452).status).toBe('aboveCeiling');
    expect(spendingSolve(60000, { rows: 0 }).status).toBe('noRows');
    expect(spendingSolve(60000)).toEqual({ status: 'ok', amount: 60000 });
  });
  it('the engine\'s reason decides, and each of the solver\'s four answers maps to its status', () => {
    expect(spendingSolve(DIE_WITH_ZERO_CEILING, { reason: 'above-ceiling' }).status).toBe('aboveCeiling');
    expect(spendingSolve(null, { reason: 'none-works' }).status).toBe('none');
    expect(spendingSolve(null, { reason: 'no-rows' }).status).toBe('noRows');
    expect(spendingSolve(60000, { reason: 'ok' })).toEqual({ status: 'ok', amount: 60000 });
    const status = (inputs) => spendingSolveOf(findDieWithZeroSpending(inputs), runProjection(inputs).years.length).status;
    expect(findDieWithZeroSpending(PLANS.failsAtZeroSpending).reason).toBe('none-works');
    expect(status(PLANS.failsAtZeroSpending)).toBe('none');
    expect(findDieWithZeroSpending(PLANS.veryRich).reason).toBe('above-ceiling');
    expect(status(PLANS.veryRich)).toBe('aboveCeiling');
    expect(status(DEFAULT_INPUTS)).toBe('ok');
  });
  it('printable refuses holes', () => {
    expect(printable(2030, 'x')).toBe(true);
    expect(printable(2030, null)).toBe(false);
    expect(printable(undefined)).toBe(false);
    expect(printable(NaN)).toBe(false);
    expect(printable('')).toBe(false);
  });
  it('walkAwayNow reports no level rather than the budget when nothing lasts', () => {
    const w = walkAwayNow(PLANS.failsAtZeroSpending);
    expect(w.isSuccessful).toBe(false);
    expect(w.supportsStatus).toBe('none');
    expect(w.supports).toBeNull();
    expect(w.headroom).toBeNull();
    expect(walkAwayNow(PLANS.veryRich).supportsStatus).toBe('aboveCeiling');
  });
});

describe('the printed six answers have no holes either', () => {
  for (const [name, inputs] of Object.entries(PLANS)) {
    it(name, () => {
      const text = readinessSummary(inputs, runProjection(inputs)).map((l) => l.answer).join(' ');
      for (const re of BAD) expect(text, `${re}`).not.toMatch(re);
    });
  }
});
