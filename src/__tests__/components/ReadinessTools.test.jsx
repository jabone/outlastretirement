// @vitest-environment jsdom
// The three question tools that moved from Optimizers to Retirement
// Readiness (changelog 285): the retirement-age explorer on the
// working-longer card, the spending ceiling (Die with Zero) and the Target
// Portfolio What-If Solver on the walk-away card. Most are the old
// StrategyTab tests, re-homed; the new rule they add is that a click on
// the chart changes what the card compares, and only a button that says
// so changes the plan. All three stay free.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReadinessTab from '../../components/tabs/ReadinessTab';
import { renderWithSimulation } from '../testUtils';
import { DEFAULT_INPUTS, runProjection } from '../../calculator';

afterEach(cleanup);
const START = DEFAULT_INPUTS.planYear;
const worker = {
  ...DEFAULT_INPUTS,
  birthYear1: START - 55, retireAge1: 62, lifeExpectancy1: 92, claimingAge1: 67,
  salary1: 150000, ss1: 40000, preTaxInit: 900000, taxableInit: 400000, rothInit: 150000,
  lifestyleExpense: 90000, stateOfResidence: 'TX', stateTaxState: 'none',
};
const show = (extra = {}, isPremium = false, inputs = worker) => renderWithSimulation(
  <ReadinessTab />,
  { inputs, projection: runProjection(inputs), setActiveTab: vi.fn(), ...extra },
  { isPremium },
);

describe('Retirement age explorer (working-longer card)', () => {
  it('shows the earliest age that lasts and applies it only through the button, moving both spouses', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    const ageFinderResults = { simulations: [{ age: 62, endingBalance: -1 }, { age: 65, endingBalance: 200000 }, { age: 70, endingBalance: 900000 }], earliestFundedAge: 65 };
    show({ ageFinderResults, updateInput }, false, { ...worker, spouse2Enabled: true, birthYear2: START - 52, retireAge2: 59 });
    const panel = screen.getByTestId('retirement-age-explorer');
    expect(within(panel).getByTestId('earliest-funded-age')).toHaveTextContent('Age 65');
    expect(updateInput).not.toHaveBeenCalled();
    await user.click(within(panel).getByTestId('apply-earliest-age'));
    expect(updateInput).toHaveBeenCalledWith('retireAge1', 65);
    expect(updateInput).toHaveBeenCalledWith('retireAge2', 62); // three-year gap kept
  });

  it('moves a much younger Spouse 2 by the same rule as the Age Finder (not floored at 50)', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    const ageFinderResults = { simulations: [{ age: 65, endingBalance: 200000 }], earliestFundedAge: 65 };
    // Spouse 2 is 20 years younger (35 today): at Spouse 1's 65 they are 45.
    show({ ageFinderResults, updateInput }, false, { ...worker, spouse2Enabled: true, birthYear2: START - 35, retireAge2: 50 });
    await user.click(within(screen.getByTestId('retirement-age-explorer')).getByTestId('apply-earliest-age'));
    expect(updateInput).toHaveBeenCalledWith('retireAge1', 65);
    expect(updateInput).toHaveBeenCalledWith('retireAge2', 45);
  });

  it('hides the badge and the button when no age is funded yet', () => {
    show({ ageFinderResults: { simulations: [], earliestFundedAge: null } });
    expect(screen.queryByTestId('earliest-funded-age')).toBeNull();
    expect(screen.queryByTestId('apply-earliest-age')).toBeNull();
  });

  it('offers no apply when the earliest age is already the plan\'s', () => {
    show({ ageFinderResults: { simulations: [{ age: 62, endingBalance: 1 }], earliestFundedAge: 62 } });
    expect(screen.getByTestId('earliest-funded-age')).toBeInTheDocument();
    expect(screen.queryByTestId('apply-earliest-age')).toBeNull();
  });

  it('is free: it renders for a reader without Premium', () => {
    show({ ageFinderResults: { simulations: [{ age: 65, endingBalance: 1 }], earliestFundedAge: 65 } }, false);
    expect(screen.getByTestId('retirement-age-explorer')).toBeInTheDocument();
  });
});

describe('Spending ceiling (walk-away card)', () => {
  it('states the plan-as-entered ceiling and the room above the budget, and applies only through the button', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    show({ dieWithZeroResults: { spending: 105000, additionalSpend: 15000, comparisonData: [] }, dieWithZeroLongevityData: null, updateInput });
    const panel = screen.getByTestId('spending-ceiling');
    expect(panel).toHaveTextContent('$105,000 a year');
    expect(panel).toHaveTextContent('$15,000');
    expect(updateInput).not.toHaveBeenCalled();
    await user.click(within(panel).getByTestId('apply-ceiling'));
    expect(updateInput).toHaveBeenCalledWith('lifestyleExpense', 105000);
  });

  it('offers no apply when the room is negligible, and says so when the budget is over the ceiling', () => {
    show({ dieWithZeroResults: { spending: 90050, additionalSpend: 50, comparisonData: [] } });
    expect(screen.queryByTestId('apply-ceiling')).toBeNull();
    expect(screen.getByTestId('spending-ceiling')).toHaveTextContent('about what you are planning to spend');
    cleanup();
    show({ dieWithZeroResults: { spending: 80000, additionalSpend: -10000, comparisonData: [] } });
    expect(screen.getByTestId('spending-ceiling')).toHaveTextContent('$10,000');
    expect(screen.getByTestId('spending-ceiling')).toHaveTextContent('less than your budget');
  });

  it('lists the same ceiling at the odds of living when the data is there', () => {
    show({
      dieWithZeroResults: { spending: 100000, additionalSpend: 10000, comparisonData: [] },
      dieWithZeroLongevityData: { planned: { endYear: 2063, spending: 100000 }, levels: [{ id: 'p50', label: 'a coin toss', prob: 0.5, endYear: 2066, age1: 95, age2: null, spending: 96000 }] },
    });
    expect(screen.getByText('The same ceiling at the odds of living')).toBeInTheDocument();
    expect(screen.getByText('$96,000/yr')).toBeInTheDocument();
  });

  it('reads the engine\'s reason: a null level is "None lasts", the ceiling is "More than", never a figure', () => {
    show({
      dieWithZeroResults: { spending: null, additionalSpend: null, reason: 'none-works', rows: 30, comparisonData: [] },
      dieWithZeroLongevityData: {
        planned: { endYear: 2063, spending: null, reason: 'none-works' },
        levels: [
          { id: 'p50', label: 'a coin toss', prob: 0.5, endYear: 2066, age1: 95, age2: null, spending: 5000000, reason: 'above-ceiling' },
          { id: 'p25', label: 'one in four', prob: 0.25, endYear: 2069, age1: 98, age2: null, spending: null, reason: 'none-works' },
        ],
      },
    });
    const card = screen.getByTestId('spending-ceiling');
    expect(screen.getByTestId('spending-ceiling-unsolved')).toHaveTextContent('No spending level lasts on these inputs.');
    expect(within(card).getAllByText('None lasts')).toHaveLength(2);
    expect(within(card).getByText('More than $5,000,000/yr')).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/\$0\/yr|NaN|null/);
    expect(screen.queryByTestId('apply-ceiling')).toBeNull();
  });

  it('hides the two-paths chart behind a button', async () => {
    const user = userEvent.setup({ delay: null });
    show({ dieWithZeroResults: { spending: 100000, additionalSpend: 10000, comparisonData: [] } });
    const btn = screen.getByRole('button', { name: 'Show the two paths' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    await user.click(btn);
    expect(screen.getByRole('button', { name: 'Hide the two paths' })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('Target Portfolio What-If Solver (walk-away card)', () => {
  const results = { targetPortfolio: { total: 1800000, preTax: 900000, roth: 150000, taxable: 750000 }, projection: {} };

  it('is folded until asked for, then shows the three inputs and the three figures', async () => {
    const user = userEvent.setup({ delay: null });
    show({ targetPortfolioResults: results });
    const panel = screen.getByTestId('target-portfolio-solver');
    expect(panel).toHaveTextContent('nothing here changes your plan');
    expect(screen.queryByLabelText('What-If Retirement Age (You)')).toBeNull();
    await user.click(within(panel).getByRole('button', { name: 'Try a scenario' }));
    expect(screen.getByLabelText('What-If Retirement Age (You)')).toBeInTheDocument();
    // With both boxes empty, the figures are the plan as entered, and it says so.
    expect(screen.getByTestId('whatif-scenario')).toHaveTextContent('your plan as entered');
    expect(screen.getByTestId('whatif-scenario')).toHaveTextContent('retire at 62');
    expect(screen.getByText(/What You.d Need Today/)).toBeInTheDocument();
    expect(screen.getByText('$1,800,000')).toBeInTheDocument();
    expect(screen.getByText('Gap')).toBeInTheDocument();
  });

  it('says "More than" the search ceiling when no balance up to it lasts, not the ceiling as the answer', async () => {
    const user = userEvent.setup({ delay: null });
    const ceilingResults = {
      targetPortfolio: { total: 20000000, preTax: 10000000, roth: 2000000, taxable: 8000000 },
      projection: { isSuccessful: false }, found: false, reason: 'above-ceiling', ceiling: 20000000,
    };
    show({ targetPortfolioResults: ceilingResults });
    await user.click(screen.getByRole('button', { name: 'Try a scenario' }));
    expect(screen.getByTestId('target-portfolio-need')).toHaveTextContent('More than $20,000,000');
    expect(screen.queryByText('$20,000,000')).toBeNull();
    expect(screen.queryByText(/Where that target sits, by account/)).toBeNull();
    expect(screen.getByText(/No starting balance up to \$20,000,000 lasts/)).toBeInTheDocument();
  });

  it('shows the answer itself when the solver found one', async () => {
    const user = userEvent.setup({ delay: null });
    show({ targetPortfolioResults: { ...results, found: true, reason: 'ok', ceiling: 20000000 } });
    await user.click(screen.getByRole('button', { name: 'Try a scenario' }));
    expect(screen.getByTestId('target-portfolio-need')).toHaveTextContent(/^\$1,800,000$/);
    expect(screen.getByText(/Where that target sits, by account/)).toBeInTheDocument();
  });

  it('surfaces the spouse derivation and the early-retirement warning', async () => {
    const user = userEvent.setup({ delay: null });
    show({ targetPortfolioResults: results, whatIfRetireAge: '45' }, false, { ...worker, spouse2Enabled: true, spouse2Name: 'Robin', birthYear2: START - 52, retireAge2: 59 });
    await user.click(screen.getByRole('button', { name: 'Try a scenario' }));
    expect(screen.getByText(/Robin retires alongside you/)).toBeInTheDocument();
    expect(screen.getByText(/Note on Early Retirement/)).toBeInTheDocument();
    expect(screen.getByTestId('whatif-scenario')).toHaveTextContent('Scenario: retire at 45');
    expect(screen.getByTestId('whatif-scenario')).toHaveTextContent('(your plan)'); // spend box still empty
  });
});
