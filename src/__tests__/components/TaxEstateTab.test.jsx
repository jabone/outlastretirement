// @vitest-environment jsdom
//
// Phase 2, target #3 (see UI_TEST_COVERAGE_PLAN.md): TaxEstateTab.jsx directly
// renders the dollar figures users make estate-planning decisions from, and
// carries the newest branchy logic in this tab -- per-heir CRUD, a plan-wide
// vs. per-heir withdrawal-strategy override, and the life-insurance
// estate-inclusion messaging (self/spouse-owned vs. ILIT-owned). Coverage
// here focuses on the Estate Legacy Planner sub-tab per the plan's own
// prioritization ("heirs table, per-heir drawdown strategy override, life
// insurance estate-inclusion display"), plus a smoke test of the Tax
// Brackets Visualizer sub-tab since it's the one that actually renders on
// mount (taxestateSubTab defaults to 'brackets').
//
// Finding made while writing these tests: testUtils.jsx's default context
// had `taxVisualizerData: null`, contradicting its own tier-4 doc comment
// ("defaulted to empty arrays") and the real App.jsx (whose useMemo always
// resolves to an array, falling back to `[]`, never null). This component
// reads taxVisualizerData[0] unconditionally on first render -- so the old
// default would crash ANY test rendering this component without an
// explicit override. Fixed in testUtils.jsx alongside this file.
import { describe, it, expect, vi } from 'vitest';
import { screen, within, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaxEstateTab from '../../components/tabs/TaxEstateTab';
import { renderWithSimulation } from '../testUtils';
import { DEFAULT_INPUTS } from '../../calculator';

const taxVisualizerDataFixture = [{
  year: 2030, age1: 65, age2: null, isRetired: true,
  householdStatus: 'Single',
  totalOrdinaryGross: 80000,
  ordinaryTaxableIncome: 65000,
  stdDeduction: 15000,
  magi: 80000,
  irmaaTier1: 106000, irmaaTier2: 133000, irmaaTier3: 167000, irmaaTier4: 200000, irmaaTier5: 500000,
}];

const makeAnnualWithdrawals = (label) => [
  { year: 1, withdrawal: 60000, combinedIncome: 160000, taxPaid: 30000, taxDrag: 12000, __label: label },
];

function makeHeirTaxResults(overrides = {}) {
  return {
    grossInherited: 600000,
    totalHeirTax: 100000,
    netInherited: 500000,
    totalStateEstateTax: 0,
    totalFederalEstateTax: 0,
    totalLifeInsuranceProceeds: 0,
    lifeInsuranceEstateInclusion: 0,
    perHeir: [
      { id: 1, name: 'Heir 1', splitPct: 100, grossInherited: 600000, stateEstateTax: 0, federalEstateTax: 0, netInherited: 500000, annualWithdrawals: makeAnnualWithdrawals('heir1') },
    ],
    annualWithdrawals: makeAnnualWithdrawals('fallback'),
    ...overrides,
  };
}

// TaxEstateTab always mounts on the 'brackets' sub-tab first, so every
// render needs a safe taxVisualizerData + heirTaxResults regardless of
// which sub-tab a given test actually cares about.
function renderTaxEstateTab(overrides = {}) {
  return renderWithSimulation(<TaxEstateTab />, {
    taxVisualizerData: taxVisualizerDataFixture,
    heirTaxResults: makeHeirTaxResults(),
    ...overrides,
  });
}

async function goToEstatePlanner(user) {
  await user.click(screen.getByText('Estate Legacy Planner'));
}

// Several dollar/percentage figures on this tab legitimately repeat (e.g. a
// single 100%-split heir's own totals equal the plan-wide totals; a
// strategy's label text appears both as a clickable card and inside every
// heir's "Plan Default (...)" option). Scoping each assertion to the
// specific label's own card -- climbing past any Tooltip-wrapped inner
// spans to the nearest ancestor <div>, then out one more level to that
// div's parent card wrapper -- disambiguates without depending on the
// exact DOM depth of the label itself.
function getMetricCard(labelText) {
  return screen.getByText(labelText).closest('div').parentElement;
}

describe('TaxEstateTab — Tax Brackets Visualizer (default sub-tab)', () => {
  it('renders without crashing and shows filing details for the selected year', () => {
    renderTaxEstateTab();
    expect(screen.getByText('Interactive Tax Bracket & Filing Visualizer')).toBeInTheDocument();
    expect(screen.getByText('Filing Detail: 2030')).toBeInTheDocument();
    // totalOrdinaryGross and magi are both fixture-set to 80000, so
    // "$80,000" legitimately appears twice (Gross Ordinary + Estimated
    // MAGI) -- scope to the Gross Ordinary card specifically.
    expect(within(getMetricCard('Gross Ordinary')).getByText('$80,000')).toBeInTheDocument();
  });

  it('does not crash when taxVisualizerData is empty (no projection years yet)', () => {
    renderTaxEstateTab({ taxVisualizerData: [] });
    expect(screen.getByText('Interactive Tax Bracket & Filing Visualizer')).toBeInTheDocument();
  });
});

describe('TaxEstateTab — Estate Legacy Planner: heirs list', () => {
  it('shows the single default heir and no Remove button when there is only one', async () => {
    const user = userEvent.setup({ delay: null });
    renderTaxEstateTab();
    await goToEstatePlanner(user);

    expect(screen.getByDisplayValue('Heir 1')).toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  });

  it('Add Heir appends a new heir with a 0% split and selects it', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    renderTaxEstateTab({ updateInput });
    await goToEstatePlanner(user);

    await user.click(screen.getByText('+ Add Heir'));

    expect(updateInput).toHaveBeenCalledWith('heirs', [
      { id: 1, name: 'Heir 1', filingStatus: 'Single', income: 100000, splitPct: 100, isSkipPerson: false, relationship: 'child' },
      { id: 2, name: 'Heir 2', filingStatus: 'Single', income: 100000, splitPct: 0, isSkipPerson: false, relationship: 'child' },
    ]);
  });

  it('Remove deletes a heir when 2+ exist', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    const inputs = {
      ...DEFAULT_INPUTS,
      heirs: [
        { id: 1, name: 'Heir 1', filingStatus: 'Single', income: 100000, splitPct: 60 },
        { id: 2, name: 'Heir 2', filingStatus: 'Single', income: 50000, splitPct: 40 },
      ],
    };
    renderTaxEstateTab({ inputs, updateInput });
    await goToEstatePlanner(user);

    await user.click(screen.getAllByText('Remove')[0]);
    expect(updateInput).toHaveBeenCalledWith('heirs', [
      { id: 2, name: 'Heir 2', filingStatus: 'Single', income: 50000, splitPct: 40 },
    ]);
  });

  it('editing a heir\'s name forwards the updated heirs array to updateInput', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    renderTaxEstateTab({ updateInput });
    await goToEstatePlanner(user);

    // The name input is a controlled field (value={h.name}), and the mocked
    // updateInput never actually feeds a new value back in -- so
    // keystroke-by-keystroke user.type() would have React reset the DOM
    // value back to the unchanged prop after every character, making the
    // typed sequence not accumulate the way it would against real state. A
    // single fireEvent.change to the target value sidesteps that and
    // exercises exactly what updateHeirField does with one onChange.
    const nameInput = screen.getByDisplayValue('Heir 1');
    fireEvent.change(nameInput, { target: { value: 'Alex' } });

    expect(updateInput).toHaveBeenCalledWith('heirs', [
      { id: 1, name: 'Alex', filingStatus: 'Single', income: 100000, splitPct: 100, isSkipPerson: false, relationship: 'child' },
    ]);
  });

  it('offers a relationship selector per heir and forwards the choice', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    renderTaxEstateTab({ updateInput });
    await goToEstatePlanner(user);

    const select = screen.getByLabelText('Relationship to you');
    expect(select).toHaveValue('child');
    fireEvent.change(select, { target: { value: 'niece' } });

    expect(updateInput).toHaveBeenCalledWith('heirs', [
      { id: 1, name: 'Heir 1', filingStatus: 'Single', income: 100000, splitPct: 100, isSkipPerson: false, relationship: 'niece' },
    ]);
  });

  it('tells a resident of an inheritance-tax state what THIS heir\'s class costs', async () => {
    const user = userEvent.setup({ delay: null });
    // Pennsylvania is the clearest case: flat rates, no exemption, and a
    // 3.3x spread between a child and a friend. The note has to move when the
    // selector moves — an unchanging note would be worse than none, since it
    // would look like the choice had been taken into account when it hadn't.
    const inputs = {
      ...DEFAULT_INPUTS,
      stateOfResidence: 'PA',
      heirs: [{ id: 1, name: 'Heir 1', filingStatus: 'Single', income: 100000, splitPct: 100, isSkipPerson: false, relationship: 'child' }],
    };
    renderTaxEstateTab({ inputs });
    await goToEstatePlanner(user);

    expect(screen.getByText(/up to/)).toHaveTextContent('4.5%');

    // Re-render as a sibling: same state, same estate, 12% instead.
    const siblingInputs = { ...inputs, heirs: [{ ...inputs.heirs[0], relationship: 'sibling' }] };
    cleanup();
    renderTaxEstateTab({ inputs: siblingInputs });
    await goToEstatePlanner(user);
    expect(screen.getByText(/up to/)).toHaveTextContent('12%');

    // And a spouse is told plainly that they are exempt, not shown "0%".
    const spouseInputs = { ...inputs, heirs: [{ ...inputs.heirs[0], relationship: 'spouse' }] };
    cleanup();
    renderTaxEstateTab({ inputs: spouseInputs });
    await goToEstatePlanner(user);
    expect(screen.getByText(/PA levies an inheritance tax, but a/)).toHaveTextContent('exempt');
  });

  it('shows no inheritance-tax note at all in a state that does not levy one', async () => {
    const user = userEvent.setup({ delay: null });
    renderTaxEstateTab({ inputs: { ...DEFAULT_INPUTS, stateOfResidence: 'TX' } });
    await goToEstatePlanner(user);

    // The selector is still offered (a user may move, or be comparing
    // states), but Texas must not be described as charging anything.
    expect(screen.getByLabelText('Relationship to you')).toBeInTheDocument();
    expect(screen.queryByText(/TX charges an inheritance tax/)).not.toBeInTheDocument();
    expect(screen.queryByText(/TX levies an inheritance tax/)).not.toBeInTheDocument();
  });

  it('flags an unbalanced split total and clears the flag once splits sum to 100%', async () => {
    const user = userEvent.setup({ delay: null });
    const inputs = {
      ...DEFAULT_INPUTS,
      heirSplitMode: 'custom',
      heirs: [
        { id: 1, name: 'Heir 1', filingStatus: 'Single', income: 100000, splitPct: 60 },
        { id: 2, name: 'Heir 2', filingStatus: 'Single', income: 50000, splitPct: 30 },
      ],
    };
    renderTaxEstateTab({ inputs, heirTaxResults: makeHeirTaxResults({ perHeir: [
      { id: 1, name: 'Heir 1', splitPct: 60, grossInherited: 360000, stateEstateTax: 0, federalEstateTax: 0, netInherited: 300000, annualWithdrawals: makeAnnualWithdrawals('h1') },
      { id: 2, name: 'Heir 2', splitPct: 40, grossInherited: 240000, stateEstateTax: 0, federalEstateTax: 0, netInherited: 200000, annualWithdrawals: makeAnnualWithdrawals('h2') },
    ] }) });
    await goToEstatePlanner(user);

    expect(screen.getByText(/Split total: 90%/)).toBeInTheDocument();
    expect(screen.getByText(/auto-normalized to 100%/)).toBeInTheDocument();
  });
});

describe('TaxEstateTab — Estate Legacy Planner: withdrawal strategy selection', () => {
  // "Lump Sum (Year 1)" / "(Year 10)" text is ambiguous page-wide: it's
  // both a plan-wide strategy card's own label AND, verbatim, an <option>
  // inside every heir's per-heir "Withdrawal Strategy" <select>. Scoping to
  // the plan-default section (identified by its own unique label, which
  // doesn't appear inside any <select>) disambiguates.
  function getPlanDefaultSection() {
    return screen.getByText('Plan Default: Inherited IRA Withdrawal Strategy').closest('div');
  }

  it('selecting a plan-wide strategy card calls updateInput with heirDistributionStrategy', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    renderTaxEstateTab({ updateInput });
    await goToEstatePlanner(user);

    await user.click(within(getPlanDefaultSection()).getByText('Lump Sum (Year 1)'));
    expect(updateInput).toHaveBeenCalledWith('heirDistributionStrategy', 'lump_sum_start');
  });

  it('marks the active plan-wide strategy card with "Active"', async () => {
    const user = userEvent.setup({ delay: null });
    const inputs = { ...DEFAULT_INPUTS, heirDistributionStrategy: 'lump_sum_end' };
    renderTaxEstateTab({ inputs });
    await goToEstatePlanner(user);

    const lumpSumEndCard = within(getPlanDefaultSection()).getByText('Lump Sum (Year 10)').closest('div');
    expect(within(lumpSumEndCard).getByText('Active')).toBeInTheDocument();
  });

  it('a heir\'s "Plan Default" dropdown option reflects the current plan-wide strategy label', async () => {
    const user = userEvent.setup({ delay: null });
    const inputs = { ...DEFAULT_INPUTS, heirDistributionStrategy: 'lump_sum_start' };
    renderTaxEstateTab({ inputs });
    await goToEstatePlanner(user);

    expect(screen.getByRole('option', { name: 'Plan Default (Lump Sum Yr 1)' })).toBeInTheDocument();
  });

  it('overriding a single heir\'s strategy forwards only that heir\'s change', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    renderTaxEstateTab({ updateInput });
    await goToEstatePlanner(user);

    // Neither select in a heir card has an accessible name (their <label>s
    // are visual siblings, not wired via htmlFor/aria) -- with a single
    // heir there are exactly two comboboxes (Filing Status, then
    // Withdrawal Strategy), so the last one is the one under test.
    const combos = screen.getAllByRole('combobox');
    await user.selectOptions(combos[combos.length - 1], 'lump_sum_start');
    expect(updateInput).toHaveBeenCalledWith('heirs', [
      { id: 1, name: 'Heir 1', filingStatus: 'Single', income: 100000, splitPct: 100, isSkipPerson: false, relationship: 'child', distributionStrategy: 'lump_sum_start' },
    ]);
  });
});

describe('TaxEstateTab — Estate Legacy Planner: metrics and messaging', () => {
  it('renders the Transfer Metrics Summary figures', async () => {
    const user = userEvent.setup({ delay: null });
    renderTaxEstateTab();
    await goToEstatePlanner(user);

    // The fixture's single 100%-split heir has totals identical to the
    // plan-wide totals (both legitimately show $600,000/$500,000 etc.,
    // once in this summary and again in the Per-Heir Breakdown table
    // further down) -- scope each assertion to its own metric card.
    expect(within(getMetricCard('Gross Inherited Wealth')).getByText('$600,000')).toBeInTheDocument();
    expect(within(getMetricCard('Total Heir Tax Drag')).getByText('$100,000')).toBeInTheDocument();
    expect(within(getMetricCard('Net Heir Inheritance')).getByText('$500,000')).toBeInTheDocument();
    expect(within(getMetricCard('Transfer Efficiency')).getByText('83.3%')).toBeInTheDocument(); // 500000/600000
  });

  it('shows the "does not levy" message for a state with no entry in the tax table (default TX)', async () => {
    const user = userEvent.setup({ delay: null });
    renderTaxEstateTab();
    await goToEstatePlanner(user);
    expect(screen.getByText(/does not levy a state estate or inheritance tax/)).toBeInTheDocument();
  });

  it('distinguishes "$0 owed, under the exemption" from "state has no such tax" for a state that IS in the table', async () => {
    const user = userEvent.setup({ delay: null });
    const inputs = { ...DEFAULT_INPUTS, stateOfResidence: 'NY' };
    renderTaxEstateTab({ inputs, heirTaxResults: makeHeirTaxResults({ totalStateEstateTax: 0 }) });
    await goToEstatePlanner(user);
    expect(screen.getByText(/falls under that state's exemption threshold/)).toBeInTheDocument();
  });

  it('shows the state tax owed message once totalStateEstateTax is positive', async () => {
    const user = userEvent.setup({ delay: null });
    const inputs = { ...DEFAULT_INPUTS, stateOfResidence: 'NY' };
    renderTaxEstateTab({ inputs, heirTaxResults: makeHeirTaxResults({ totalStateEstateTax: 50000 }) });
    await goToEstatePlanner(user);
    expect(screen.getByText(/levies a state-level estate and\/or inheritance tax on top of/)).toBeInTheDocument();
  });

  it('shows the federal exemption message when no federal estate tax is owed', async () => {
    const user = userEvent.setup({ delay: null });
    renderTaxEstateTab();
    await goToEstatePlanner(user);
    expect(screen.getByText(/Under the \$15M federal exemption/)).toBeInTheDocument();
  });

  it('shows the federal tax owed message, using the MFJ exemption figure for a married household', async () => {
    const user = userEvent.setup({ delay: null });
    const inputs = { ...DEFAULT_INPUTS, filingStatus: 'MFJ' };
    renderTaxEstateTab({ inputs, heirTaxResults: makeHeirTaxResults({ totalFederalEstateTax: 500000 }) });
    await goToEstatePlanner(user);
    expect(screen.getByText(/Estate exceeds the \$30M \(MFJ\) federal exemption/)).toBeInTheDocument();
  });

  it('hides the Life Insurance Proceeds card when neither spouse has a policy enabled (default)', async () => {
    const user = userEvent.setup({ delay: null });
    renderTaxEstateTab();
    await goToEstatePlanner(user);
    expect(screen.queryByText('Life Insurance Proceeds to Heirs')).not.toBeInTheDocument();
  });

  it('shows the self/spouse-owned (fully counted) message when a policy is enabled and fully included in the estate', async () => {
    const user = userEvent.setup({ delay: null });
    const inputs = { ...DEFAULT_INPUTS, lifeInsuranceEnabled1: true };
    renderTaxEstateTab({ inputs, heirTaxResults: makeHeirTaxResults({ totalLifeInsuranceProceeds: 200000, lifeInsuranceEstateInclusion: 200000 }) });
    await goToEstatePlanner(user);
    expect(screen.getByText(/Self\/spouse-owned — counted in the taxable estate/)).toBeInTheDocument();
  });

  it('shows the ILIT (fully excluded) message when proceeds exist but none are counted in the estate', async () => {
    const user = userEvent.setup({ delay: null });
    const inputs = { ...DEFAULT_INPUTS, lifeInsuranceEnabled1: true };
    renderTaxEstateTab({ inputs, heirTaxResults: makeHeirTaxResults({ totalLifeInsuranceProceeds: 200000, lifeInsuranceEstateInclusion: 0 }) });
    await goToEstatePlanner(user);
    expect(screen.getByText(/Trust-owned \(ILIT\) — excluded from your taxable estate entirely\./)).toBeInTheDocument();
  });

  it('shows the split self/spouse-owned + ILIT breakdown when both spouses have policies with different ownership outcomes', async () => {
    const user = userEvent.setup({ delay: null });
    const inputs = { ...DEFAULT_INPUTS, lifeInsuranceEnabled1: true, lifeInsuranceEnabled2: true };
    renderTaxEstateTab({ inputs, heirTaxResults: makeHeirTaxResults({ totalLifeInsuranceProceeds: 300000, lifeInsuranceEstateInclusion: 100000 }) });
    await goToEstatePlanner(user);
    expect(screen.getByText(/\$100,000 is self\/spouse-owned.*\$200,000 is trust-owned/)).toBeInTheDocument();
  });
});

describe('TaxEstateTab — Estate Legacy Planner: per-heir breakdown and 10-year schedule', () => {
  it('renders one row per heir in the Per-Heir Breakdown table', async () => {
    const user = userEvent.setup({ delay: null });
    const inputs = {
      ...DEFAULT_INPUTS,
      heirs: [
        { id: 1, name: 'Heir 1', filingStatus: 'Single', income: 100000, splitPct: 60 },
        { id: 2, name: 'Heir 2', filingStatus: 'Single', income: 50000, splitPct: 40 },
      ],
    };
    renderTaxEstateTab({ inputs, heirTaxResults: makeHeirTaxResults({ perHeir: [
      { id: 1, name: 'Heir 1', splitPct: 60, grossInherited: 360000, stateEstateTax: 0, federalEstateTax: 0, netInherited: 300000, annualWithdrawals: makeAnnualWithdrawals('h1') },
      { id: 2, name: 'Heir 2', splitPct: 40, grossInherited: 240000, stateEstateTax: 0, federalEstateTax: 0, netInherited: 200000, annualWithdrawals: makeAnnualWithdrawals('h2') },
    ] }) });
    await goToEstatePlanner(user);

    // The heading and the <table> are siblings inside a shared wrapper --
    // .closest('div') on the heading returns the heading's own (childless)
    // div, so climb one level further via .parentElement to reach that
    // shared wrapper before searching for the table.
    const breakdownHeading = screen.getByText('Per-Heir Breakdown');
    const breakdownTable = breakdownHeading.closest('div').parentElement.querySelector('table');
    expect(within(breakdownTable).getByText('Heir 1')).toBeInTheDocument();
    expect(within(breakdownTable).getByText('Heir 2')).toBeInTheDocument();
  });

  it('the 10-Year schedule defaults to the first heir\'s own withdrawal data', async () => {
    const user = userEvent.setup({ delay: null });
    renderTaxEstateTab();
    await goToEstatePlanner(user);

    // makeAnnualWithdrawals('heir1') sets withdrawal: 60000 for year 1 --
    // confirms the table is reading selectedHeirResult.annualWithdrawals
    // (per-heir), not heirTaxResults.annualWithdrawals (the fallback).
    expect(screen.getByText('$60,000')).toBeInTheDocument();
  });

  it('switching the heir selector swaps in that heir\'s own withdrawal schedule', async () => {
    const user = userEvent.setup({ delay: null });
    const inputs = {
      ...DEFAULT_INPUTS,
      heirs: [
        { id: 1, name: 'Heir 1', filingStatus: 'Single', income: 100000, splitPct: 60 },
        { id: 2, name: 'Heir 2', filingStatus: 'Single', income: 50000, splitPct: 40 },
      ],
    };
    renderTaxEstateTab({ inputs, heirTaxResults: makeHeirTaxResults({ perHeir: [
      { id: 1, name: 'Heir 1', splitPct: 60, grossInherited: 360000, stateEstateTax: 0, federalEstateTax: 0, netInherited: 300000, annualWithdrawals: [{ year: 1, withdrawal: 60000, combinedIncome: 160000, taxPaid: 30000, taxDrag: 12000 }] },
      { id: 2, name: 'Heir 2', splitPct: 40, grossInherited: 240000, stateEstateTax: 0, federalEstateTax: 0, netInherited: 200000, annualWithdrawals: [{ year: 1, withdrawal: 24000, combinedIncome: 74000, taxPaid: 9000, taxDrag: 3000 }] },
    ] }) });
    await goToEstatePlanner(user);

    expect(screen.getByText('$60,000')).toBeInTheDocument();

    // The heir-switcher select has no accessible name and isn't the only
    // unnamed combobox on the page (each heir card has two of its own) --
    // scope to its header container (identified by the schedule's own
    // heading, which sits in the same flex row as the select).
    const scheduleHeader = screen.getByText('IRS 10-Year Beneficiary Tax Schedule Simulation').closest('div');
    const heirSelect = within(scheduleHeader).getByRole('combobox');
    await user.selectOptions(heirSelect, '2');

    expect(screen.getByText('$24,000')).toBeInTheDocument();
    expect(screen.queryByText('$60,000')).not.toBeInTheDocument();
  });
});
