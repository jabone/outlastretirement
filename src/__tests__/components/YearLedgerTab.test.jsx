// @vitest-environment jsdom
//
// Was LedgerTab.test.jsx's "Yearly Ledger Spreadsheet" half. Split on
// 2026-08-19 alongside the component itself (see IA_REVIEW.md) -- the old
// file tested two unrelated features through one sub-tab click, which is
// exactly the coupling the split removed. Nothing here needed a navigation
// step once the table became its own destination; the `goToScenarioManager`
// helper the scenario tests used is gone for the same reason.
import { describe, it, expect } from 'vitest';
import { screen, fireEvent, within, cleanup } from '@testing-library/react';
import YearLedgerTab from '../../components/tabs/YearLedgerTab';
import { renderWithSimulation } from '../testUtils';
import { DEFAULT_INPUTS, runProjection } from '../../calculator';
import { buildDemoInputs } from '../../config/demoPlan';

// A small, self-contained projection fixture (rather than the real
// DEFAULT_INPUTS-derived one) for the two tests that need a specific,
// known shortfall/deficit condition -- deriving that from the real engine
// would mean hand-tuning inputs until a warning happens to trigger, which
// is more fragile than just asserting the render logic against a fixture
// built to exercise it directly.
const makeYear = (overrides = {}) => ({
  year: 2026, age1: 45, age2: null, householdStatus: 'Single', isRetired: false,
  salary: 100000, rsuIncome1: 0, rsuIncome2: 0, fixedInflows: 0,
  lifestyleExpenses: 50000, irmaaCost: 0, totalTaxesPaid: 10000, marginalBracket: 0.22,
  totalExpenses: 60000, lifestyleDeficit: 0, savingsDeficit: 0, shortfall: 0,
  growthRate: 5, drawPreTax: 0, drawRoth: 0, drawTaxable: 0, drawdown: 0,
  preTaxEnd: 100000, rothEnd: 50000, taxableEnd: 20000, totalPortfolioEnding: 170000,
  startBalance: 0, totalContribution: 0, totalWithdrawal: 0, growth: 0, endBalance: 170000,
  ...overrides,
});

describe('YearLedgerTab — Yearly Ledger Spreadsheet', () => {
  it('renders the table with real projection data and no optional columns when their features are disabled (the DEFAULT_INPUTS state)', () => {
    renderWithSimulation(<YearLedgerTab />);

    ['Year', 'Salary', 'Lifestyle Exp', 'Income Tax', 'Ending Portfolio'].forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    // Every optional column is gated behind a feature flag that's off by
    // default -- confirms the hasX gating actually hides them rather than
    // always rendering.
    ['Debt Bal', 'Loss C/F', 'Basis Left', 'Home Equity', 'Concentrated Stock', 'Cash Reserve', 'NQDC Balance'].forEach(label => {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });
  });

  it('shows the Tax-Loss Harvesting column only when the feature is enabled in inputs', () => {
    renderWithSimulation(<YearLedgerTab />, {
      inputs: { ...DEFAULT_INPUTS, taxLossHarvestingEnabled: true },
    });
    expect(screen.getByText('Loss C/F')).toBeInTheDocument();
  });

  it('shows the budget warning banner and per-row indicator when a year has a lifestyle or savings deficit', () => {
    renderWithSimulation(<YearLedgerTab />, {
      projection: { years: [makeYear({ lifestyleDeficit: 5000 })], endingBalance: 170000, isSuccessful: true, peakPortfolioWorth: 200000 },
    });
    expect(screen.getByText(/Budget Warning:/)).toBeInTheDocument();
  });

  it('does not show the budget warning banner when no year has a deficit', () => {
    renderWithSimulation(<YearLedgerTab />, {
      projection: { years: [makeYear()], endingBalance: 170000, isSuccessful: true, peakPortfolioWorth: 200000 },
    });
    expect(screen.queryByText(/Budget Warning:/)).not.toBeInTheDocument();
  });

  // The split's own regression guard: the scenario-saving half used to live
  // in this same component, and the line-slice that pulled the table out
  // initially dragged a stray copy of its save handler along with it. If
  // scenario UI ever reappears here, this fails.
  it('renders no scenario-management UI -- that moved to ScenariosTab', () => {
    renderWithSimulation(<YearLedgerTab />, { scenarios: [] });
    expect(screen.queryByText('Scenario Profile Manager')).not.toBeInTheDocument();
    expect(screen.queryByText('Saved Scenarios List')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g. Retire at 62 (Early)')).not.toBeInTheDocument();
  });
});

// Changelog 240: the "Where the money goes" view.

describe('YearLedgerTab — where the money goes', () => {
  const START = DEFAULT_INPUTS.planYear;
  const inputs = {
    ...DEFAULT_INPUTS,
    birthYear1: START - 58, retireAge1: 62, lifeExpectancy1: 90,
    milestones: [{ id: 'roof', name: 'Roof', type: 'outflow', amount: 45000, isRecurring: false, startAge: 64, endAge: 64, targetAccount: 'auto', fundedExternally: false }],
    lifestyleExpenseInputMode: 'categories',
    spendingBlueprint: {
      lines: [
        { id: 'a', categoryId: 'housing', label: 'home', amount: 40000 },
        { id: 'b', categoryId: 'personal', label: 'travel', amount: 60000 },
      ],
      essentialCategoryIds: ['housing'],
      unlinkedFields: [],
    },
  };
  const open = (isPremium) => {
    renderWithSimulation(<YearLedgerTab />, { inputs, projection: runProjection(inputs) }, { isPremium });
    fireEvent.click(within(screen.getByRole('group', { name: 'Ledger view' })).getByRole('button', { name: 'Where the money goes' }));
    return screen.getByTestId('money-goes-table');
  };
  const heads = (table) => [...table.querySelectorAll('th')].map((th) => th.textContent);

  it('opens on the balances view and switches to the uses view', () => {
    renderWithSimulation(<YearLedgerTab />, { inputs, projection: runProjection(inputs) }, { isPremium: false });
    expect(screen.queryByTestId('money-goes-table')).toBeNull();
    fireEvent.click(within(screen.getByRole('group', { name: 'Ledger view' })).getByRole('button', { name: 'Where the money goes' }));
    expect(screen.getByTestId('money-goes-table')).toBeTruthy();
  });

  it('gives Premium Essentials and Flexible, with working years as one lifestyle figure', () => {
    const table = open(true);
    expect(heads(table)).toEqual(expect.arrayContaining(['Essentials', 'Flexible', 'Health', 'Life events', 'Income tax', 'Saved', 'Total out']));
    expect(heads(table)).not.toContain('Lifestyle');
    const first = table.querySelector('tbody tr');
    expect(first.textContent).toMatch(/lifestyle/);
    expect(first.querySelector('td[colspan="2"]')).toBeTruthy();
    expect(table.textContent).toMatch(/Roof/);
  });

  it('gives a free reader one Lifestyle column and says what Premium adds', () => {
    const table = open(false);
    expect(heads(table)).toContain('Lifestyle');
    expect(heads(table)).not.toContain('Essentials');
    expect(screen.getByText(/Premium splits Lifestyle into Essentials and Flexible/)).toBeTruthy();
  });

  it('hides the columns a plan does not use', () => {
    const table = open(true);
    expect(heads(table)).not.toContain('Debt');
    expect(heads(table)).not.toContain('Gifts');
    cleanup();
    const plain = { ...inputs, milestones: [] };
    renderWithSimulation(<YearLedgerTab />, { inputs: plain, projection: runProjection(plain) }, { isPremium: true });
    fireEvent.click(within(screen.getByRole('group', { name: 'Ledger view' })).getByRole('button', { name: 'Where the money goes' }));
    expect(heads(screen.getByTestId('money-goes-table'))).not.toContain('Life events');
  });

  it('says property tax is not in Income tax', () => {
    const table = open(true);
    const th = within(table).getByText('Income tax');
    expect(th.closest('th')).toBeTruthy();
    expect(document.body.innerHTML).toMatch(/Property tax is not here: it is part of Housing/);
  });
});

// Changelog 241: Balances & draws shares its definitions with Where the money
// goes, names life events, and says when Medicare was delayed.
describe('YearLedgerTab — balances view, matched to where the money goes', () => {
  const START = DEFAULT_INPUTS.planYear;
  const base = {
    ...DEFAULT_INPUTS,
    birthYear1: START - 58, retireAge1: 63, lifeExpectancy1: 90,
    spouse2Enabled: true, spouse2Name: 'Partner B', birthYear2: START - 61, retireAge2: 61, lifeExpectancy2: 90,
    milestones: [{ id: 'rv', name: 'RV', type: 'outflow', amount: 80000, isRecurring: false, startAge: 60, endAge: 60, targetAccount: 'auto', fundedExternally: false }],
  };
  const show = (inputs) => {
    const projection = runProjection(inputs);
    renderWithSimulation(<YearLedgerTab />, { inputs, projection }, { isPremium: true });
    return projection;
  };
  const rowFor = (year) => [...document.querySelectorAll('table.custom-table tbody tr')].find((tr) => tr.children[0].textContent.startsWith(String(year)));

  it('shades the shared columns and says which they are', () => {
    show(base);
    expect(screen.getByTestId('uses-legend').textContent).toMatch(/Lifestyle Exp, Health and Income Tax/);
    const shaded = [...document.querySelectorAll('thead th.col-uses')].map((th) => th.textContent);
    expect(shaded).toEqual(['Lifestyle Exp', 'Health', 'Income Tax']);
    expect(screen.queryByText('Med / IRMAA')).toBeNull();
  });

  it('names the life event under Total Exp in its year', () => {
    const proj = show(base);
    const y = proj.years.find((r) => r.age1 === 60);
    expect(rowFor(y.year).textContent).toMatch(/incl\. RV \$/);
    const other = proj.years.find((r) => r.age1 === 59);
    expect(rowFor(other.year).textContent).not.toMatch(/incl\. RV/);
  });

  it('shows the whole health cost, not only Medicare', () => {
    // He retires at 63 and buys his own cover before Medicare; she is on
    // Medicare. The Health cell carries both, and names the Medicare part.
    const proj = show(base);
    const y = proj.years.find((r) => r.age1 === 63);
    expect(y.healthcareBridge).toBeGreaterThan(0);
    expect(y.irmaaCost).toBeGreaterThan(0);
    const cellText = rowFor(y.year).textContent;
    const whole = Math.round(y.healthcareBridge + y.irmaaCost + (y.medicareSupplement || 0) + (y.ltcCost || 0) + (y.medicarePenalty || 0) + (y.foreignHealthcare || 0));
    expect(cellText.replace(/,/g, '')).toContain(`$${whole}`);
    expect(cellText).toMatch(/Medicare \$/);
  });

  it('says when her Medicare is delayed by his employer plan', () => {
    const proj = show({ ...base, medicareEmployerCoverage2: 'spouse' });
    const y = proj.years.find((r) => r.age2 === 65);
    expect(y.medicareDeferred2).toBe(true);
    expect(rowFor(y.year).textContent).toMatch(/Medicare delayed: Partner B on an employer plan/);
  });

  it('switches to Where the money goes from the legend', () => {
    show(base);
    fireEvent.click(within(screen.getByTestId('uses-legend')).getByRole('button', { name: 'Where the money goes' }));
    expect(screen.getByTestId('money-goes-table')).toBeTruthy();
  });
});

// Row heights on the demo plan: a note under a figure is one short line,
// and an inline marker stays on the line it belongs to, so a row grows only
// by the notes it carries. The own-account sentence wrapped to eight lines
// in the Total Exp column and stretched 2028 to four times its neighbors.
describe('YearLedgerTab — balances view, even row heights', () => {
  const inputs = buildDemoInputs();
  const projection = runProjection(inputs);
  const rowFor = (year) => [...document.querySelectorAll('table.year-ledger-table tbody tr')].find((tr) => tr.children[0].textContent.startsWith(String(year)));

  it('keeps a life event paid from its own account to one short note, the full account in its tooltip', () => {
    renderWithSimulation(<YearLedgerTab />, { inputs, projection }, { isPremium: true });
    const y = projection.years.find((r) => r.age1 === 57);
    const row = rowFor(y.year);
    const note = [...row.querySelectorAll('td span')].find((s) => s.textContent.startsWith('incl. Kitchen remodel'));
    expect(note.textContent).toMatch(/^incl\. Kitchen remodel \$[\d,]+ \(own account\)$/);
    const tip = note.querySelector('span[title]');
    expect(tip.getAttribute('title')).toMatch(/^\$[\d,]+ of it was paid from its own account, so it is in Total Draw instead\.$/);
  });

  it('puts the SSA-44 marker on the Medicare line it is about', () => {
    renderWithSimulation(<YearLedgerTab />, { inputs, projection }, { isPremium: true });
    const badges = screen.getAllByText('SSA-44');
    expect(badges.length).toBeGreaterThan(0);
    badges.forEach((b) => {
      expect(b.parentElement.tagName).toBe('SPAN');
      expect(b.parentElement.textContent).toMatch(/^Medicare \$[\d,]+SSA-44$/);
    });
  });
});
