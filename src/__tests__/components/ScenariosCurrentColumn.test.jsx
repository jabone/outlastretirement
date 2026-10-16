// @vitest-environment jsdom
// The current plan gets its own "Unsaved" column only when it has changes
// that are not saved (changelog 328). Right after saving, it is identical to
// that scenario, and the table used to show the same numbers twice with one
// column labeled "Unsaved".
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import ScenariosTab from '../../components/tabs/ScenariosTab';
import { renderWithSimulation } from '../testUtils';
import { DEFAULT_INPUTS } from '../../calculator';

const plan = { ...DEFAULT_INPUTS, retireAge1: 63 };
const saved = (id, name, inputs) => ({ id, name, inputs, metrics: { endingBalance: 1, isSuccessful: true, successProbability: 90, peakPortfolioWorth: 2 } });

const headers = () => [...screen.getByTestId('scenario-diff').querySelectorAll('thead th')].map((th) => th.textContent);

describe('Scenarios: the current plan column', () => {
  it('just saved: no Unsaved column; the saved copy is marked as the current plan', () => {
    renderWithSimulation(<ScenariosTab />, {
      inputs: plan,
      scenarios: [saved('a', 'Scenario 1', { ...DEFAULT_INPUTS, retireAge1: 62 }), saved('b', 'Sept 28', plan)],
    });
    expect(headers()).toEqual(['Input', 'Scenario 1', 'Sept 28 (current plan)']);
    expect(screen.getByTestId('current-saved-note')).toHaveTextContent('Your current plan is saved as Sept 28.');
    expect(screen.queryByText('Include Current (Unsaved) Plan')).not.toBeInTheDocument();
  });

  it('changed since saving: the Unsaved column is back, with its switch', () => {
    renderWithSimulation(<ScenariosTab />, {
      inputs: { ...plan, retireAge1: 64 },
      scenarios: [saved('a', 'Scenario 1', { ...DEFAULT_INPUTS, retireAge1: 62 }), saved('b', 'Sept 28', plan)],
    });
    expect(headers()).toEqual(['Input', 'Current Plan (Unsaved)', 'Scenario 1', 'Sept 28']);
    expect(screen.getByText('Include Current (Unsaved) Plan')).toBeInTheDocument();
  });
});
