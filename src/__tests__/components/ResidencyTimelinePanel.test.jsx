// @vitest-environment jsdom
//
// Changelog 195: Plan Settings -> Life Events -> Where you live. The panel
// is a thin form over residencyTimeline, so these tests pin what it WRITES
// (the engine's own tests in residencyTimeline.test.js cover what a move
// does to the numbers) and that the list shows exactly what the engine
// will price -- it reads through readResidencyTimeline, never its own copy.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, cleanup } from '@testing-library/react';
import ResidencyTimelinePanel from '../../components/ResidencyTimelinePanel.jsx';
import { renderWithSimulation } from '../testUtils.jsx';
import { DEFAULT_INPUTS, readResidencyTimeline, planHorizonYear } from '../../calculator';

afterEach(cleanup);

const PLAN = DEFAULT_INPUTS.planYear;
const setup = (over = {}) => {
  const inputs = { ...DEFAULT_INPUTS, stateOfResidence: 'CA', stateTaxState: 'ca', ...over };
  const onChange = vi.fn();
  renderWithSimulation(<ResidencyTimelinePanel inputs={inputs} onChange={onChange} horizonYear={planHorizonYear(inputs)} />, {}, { isPremium: false, portfolioPreview: false });
  return { inputs, onChange };
};
const pick = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } });
const written = (onChange) => onChange.mock.calls.at(-1)[0];

describe('ResidencyTimelinePanel', () => {
  it('says nobody is moving when the timeline is empty, and names the starting state', () => {
    setup();
    expect(screen.getByText(/No moves planned/)).toBeTruthy();
    expect(screen.getByText(`Starting in ${PLAN}:`).parentElement.textContent).toMatch(/California/);
  });

  it('adds a move to a no-income-tax state', () => {
    const { onChange } = setup();
    pick('Move in year', PLAN + 8);
    pick('State', 'TX');
    fireEvent.click(screen.getByRole('button', { name: /Add move/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const [move] = written(onChange);
    expect(move).toMatchObject({ fromYear: PLAN + 8, kind: 'domestic', stateOfResidence: 'TX', stateTaxState: 'none' });
    // And the engine reads it back unchanged.
    expect(readResidencyTimeline(written(onChange))[0]).toMatchObject({ fromYear: PLAN + 8, stateOfResidence: 'TX', stateTaxState: 'none' });
  });

  it('uses a state’s own rules by default (changelog 361)', () => {
    const { onChange } = setup();
    pick('State', 'GA');
    expect(screen.getByText(/Taxed as: Georgia rules \(Flat 4\.99%\)/)).toBeTruthy();
    expect(screen.queryByLabelText('That state’s income tax rate (%)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Add move/ }));
    expect(written(onChange)[0]).toMatchObject({ stateOfResidence: 'GA', stateTaxState: 'state_rules' });
  });

  it('asks for a rate when a flat rate is chosen instead, and writes the answers', () => {
    const { onChange } = setup();
    pick('State', 'OR');
    fireEvent.click(screen.getByLabelText('Use a flat rate I set instead of this state’s rules'));
    pick('That state’s income tax rate (%)', 8.75);
    fireEvent.click(screen.getByLabelText('It taxes Social Security'));
    fireEvent.click(screen.getByLabelText('It taxes pensions'));
    fireEvent.click(screen.getByRole('button', { name: /Add move/ }));
    expect(written(onChange)[0]).toMatchObject({
      stateTaxState: 'flat_5', stateTaxFlatRate: 8.75,
      stateTaxSocialSecurityTaxable: true, stateTaxPensionTaxable: false,
    });
  });

  it('offers New York City and Yonkers only for New York', () => {
    setup();
    pick('State', 'FL');
    expect(screen.queryByLabelText('City')).toBeNull();
    pick('State', 'NY');
    expect(screen.getByLabelText('City')).toBeTruthy();
  });

  it('writes the New York City choice', () => {
    const { onChange } = setup();
    pick('State', 'NY');
    pick('City', 'nyc');
    fireEvent.click(screen.getByRole('button', { name: /Add move/ }));
    expect(written(onChange)[0]).toMatchObject({ stateTaxState: 'ny', nycResident: true, yonkersResident: false });
  });

  it('sends Virginia to Virginia’s own rules', () => {
    const { onChange } = setup();
    pick('State', 'VA');
    fireEvent.click(screen.getByRole('button', { name: /Add move/ }));
    expect(written(onChange)[0].stateTaxState).toBe('va');
  });

  it('a second move in the same year replaces the first', () => {
    const { onChange } = setup({ residencyTimeline: [{ id: 'a', fromYear: PLAN + 8, stateOfResidence: 'TX' }] });
    pick('Move in year', PLAN + 8);
    pick('State', 'FL');
    fireEvent.click(screen.getByRole('button', { name: /Add move/ }));
    const t = written(onChange);
    expect(t).toHaveLength(1);
    expect(t[0].stateOfResidence).toBe('FL');
  });

  it('refuses a year outside the plan', () => {
    const { onChange, inputs } = setup();
    pick('Move in year', planHorizonYear(inputs) + 1);
    const add = screen.getByRole('button', { name: /Add move/ });
    expect(add.disabled).toBe(true);
    fireEvent.click(add);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('lists moves in year order as the engine reads them, and removes one', () => {
    const { onChange } = setup({
      residencyTimeline: [
        { id: 'late', fromYear: PLAN + 20, stateOfResidence: 'PA' },
        { id: 'early', fromYear: PLAN + 5, stateOfResidence: 'TX' },
        { id: 'odd', fromYear: PLAN + 10, stateOfResidence: 'PT', kind: 'overseas' },
      ],
    });
    const cards = screen.getAllByText(/^From \d{4}/).map((n) => n.textContent);
    expect(cards).toHaveLength(2); // an unreadable entry is not priced, so not shown
    expect(cards[0]).toMatch(String(PLAN + 5));
    expect(cards[1]).toMatch(String(PLAN + 20));
    fireEvent.click(screen.getByRole('button', { name: `Remove the ${PLAN + 5} move to TX` }));
    expect(written(onChange).map((e) => e.id)).toEqual(['late', 'odd']);
  });
});

// ---------------------------------------------------------------------------
// Changelog 196: moves abroad (Premium).
// ---------------------------------------------------------------------------
// The move abroad itself is the relocation Premium module (its tests live
// in the Premium repo, against this panel); the free side -- the locked
// card, and an existing move abroad listed from the public catalog -- is
// the host's.
describe('ResidencyTimelinePanel -- moving abroad, without Premium', () => {
  const setupAbroad = (over = {}) => {
    const inputs = { ...DEFAULT_INPUTS, stateOfResidence: 'CA', stateTaxState: 'ca', ...over };
    const onChange = vi.fn();
    const onOpenPremium = vi.fn();
    renderWithSimulation(<ResidencyTimelinePanel inputs={inputs} onChange={onChange} horizonYear={planHorizonYear(inputs)} onOpenPremium={onOpenPremium} />, {}, { isPremium: false, portfolioPreview: false });
    fireEvent.click(screen.getByLabelText('Another country'));
    return { inputs, onChange, onOpenPremium };
  };

  it('free users get a locked card with nothing to fill in', () => {
    const { onChange, onOpenPremium } = setupAbroad();
    expect(screen.queryByLabelText('Country')).toBeNull();
    expect(screen.queryByRole('button', { name: /Add move abroad/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Part of Premium/ }));
    expect(onOpenPremium).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('lists a move abroad with what it assumes, and shows the disclaimer', () => {
    setupAbroad({
      residencyTimeline: [{ id: 'pt', fromYear: PLAN + 6, kind: 'foreign', countryName: 'Portugal', foreign: { ordinaryRate: 25, investmentRate: 28, roth: 'respect' } }],
    });
    expect(screen.getByText(`From ${PLAN + 6} · age ${PLAN + 6 - DEFAULT_INPUTS.birthYear1} · abroad`)).toBeTruthy();
    expect(screen.getByText('California keeps its claim')).toBeTruthy();
    expect(screen.getByText('Roth respected')).toBeTruthy();
    const notice = screen.getByTestId('foreign-years-notice');
    expect(notice.textContent).toMatch(`From ${PLAN + 6} this plan treats you as a resident of Portugal`);
  });

  it('names the summary an existing move came from, from the public catalog', () => {
    setupAbroad({
      residencyTimeline: [{ id: 'pt', fromYear: PLAN + 6, kind: 'foreign', countryName: 'Portugal', foreign: { presetId: 'PT', presetEdited: true, ordinaryRate: 25, investmentRate: 28, roth: 'respect' } }],
    });
    expect(screen.getByText('Our Portugal summary, with your changes')).toBeTruthy();
  });
});
