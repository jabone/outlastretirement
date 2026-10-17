// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LifePlanTab from '../../components/tabs/LifePlanTab.jsx';
import { renderWithSimulation } from '../testUtils.jsx';
import { DEFAULT_INPUTS } from '../../calculator';
import { LIFE_PLAN_STORAGE_KEY, readLifePlan } from '../../config/lifePlan';

afterEach(() => localStorage.clear());

describe('LifePlanTab', () => {
  it('asks the questions, states the plan horizon as a plain fact, and shows nothing that scores the user', () => {
    renderWithSimulation(<LifePlanTab />);
    expect(screen.getByText('What Will You Do?')).toBeInTheDocument();
    expect(screen.getByLabelText('What does an ordinary Tuesday look like?')).toBeInTheDocument();
    expect(screen.getByLabelText('When someone asks what you do, what would you like to say?')).toBeInTheDocument();
    // DEFAULT_INPUTS: born 1980, retires at 67, plan runs to 90.
    expect(screen.getByText(/stopping work in 2047 at 67, and runs to 90/)).toBeInTheDocument();
    expect(screen.getByText(/about 23 years/)).toBeInTheDocument();

    // Nothing that grades, nags or counts progress. (The copy does use the
    // words "required" and "scored" -- in the negative -- so match on the
    // shapes a scoring UI would actually take, not on those words. The
    // print-only header's date is not on screen, so it is left out.)
    const page = within(document.querySelector('.life-plan-root tbody'));
    for (const nag of [/\d+\s*(of|\/)\s*\d+/, /\d+% (complete|answered|done)/i, /get started/i, /you (haven't|have not) (yet )?(answered|completed|filled)/i]) {
      expect(page.queryByText(nag)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /print/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing here is required and nothing is scored/)).toBeInTheDocument();
  });

  it('saves an answer on blur and offers Print once something is written', async () => {
    const user = userEvent.setup();
    renderWithSimulation(<LifePlanTab />);
    const box = screen.getByLabelText('What does an ordinary Tuesday look like?');
    await user.click(box);
    await user.keyboard('Gym at 7, workshop until lunch.');
    await user.tab();

    expect(readLifePlan().ordinaryTuesday.text).toBe('Gym at 7, workshop until lunch.');
    expect(screen.getByText(/^Written \d{4}-\d{2}-\d{2}$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });

  it('shows an earlier answer, dated, when one exists -- collapsed until asked for', async () => {
    localStorage.setItem(LIFE_PLAN_STORAGE_KEY, JSON.stringify({
      whatDoYouDo: { text: 'I teach woodworking.', updatedAt: '2029-06-14', history: [{ text: 'No idea yet.', date: '2027-03-01' }] },
    }));
    const user = userEvent.setup();
    renderWithSimulation(<LifePlanTab />);
    expect(screen.getByLabelText('When someone asks what you do, what would you like to say?')).toHaveValue('I teach woodworking.');
    expect(screen.queryByText('No idea yet.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Earlier answers (1)' }));
    expect(screen.getByText('No idea yet.')).toBeInTheDocument();
    expect(screen.getByText('2027-03-01')).toBeInTheDocument();
  });

  it('omits the horizon line rather than guessing when the plan has no usable ages', () => {
    renderWithSimulation(<LifePlanTab />, { inputs: { ...DEFAULT_INPUTS, lifeExpectancy1: 60, retireAge1: 67 } });
    expect(screen.queryByText(/stopping work in/)).not.toBeInTheDocument();
  });
});
