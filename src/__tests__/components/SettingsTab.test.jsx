// @vitest-environment jsdom
//
// Light-pass coverage for SettingsTab.jsx -- by far the largest tab in the
// app (2,947 lines / 4 sub-tabs: Basic Parameters, Initial Balances,
// Milestones & Rules, Plan Year). Per an explicit scoping decision (see
// UI_TEST_COVERAGE_PLAN.md), this file does NOT attempt exhaustive
// per-field coverage the way PlanYearPanel/LedgerTab/TaxEstateTab/
// DashboardTab/InterviewTab did -- the overwhelming majority of this tab is
// the same NumField/ToggleRow -> updateInput('key', value) pattern already
// proven safe by those files' tests. Instead this focuses on:
//   - sub-tab navigation (the one piece of local state everything else
//     lives behind)
//   - the CollapsibleHeader open/close interaction pattern
//   - genuinely distinctive computed/derived displays (SS benefit
//     multiplier, the two validation warnings, the Contribution Advisor
//     and Split Optimizer panels, which run real calculator.js logic
//     against whatever `inputs` shape is in context)
//   - the RSU grant and Milestone CRUD mini-forms (local-state forms
//     feeding a single updateInput('rsuGrants'/'milestones', [...]) call,
//     a pattern distinct from the plain controlled-input tests elsewhere)
//   - confirming (or ruling out) whether the toggle-label a11y disconnect
//     already found in LedgerTab.jsx/InterviewTab.jsx (see KNOWN_ISSUES.md)
//     also affects this file's many `<label className="custom-switch">`
//     toggles.
// Plan Year sub-tab gets no new tests here -- it just renders the
// already-fully-tested PlanYearPanel (see PlanYearPanel.test.jsx).
import { describe, it, expect, vi , beforeEach , beforeAll} from 'vitest';
import { screen, within, fireEvent, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsTab from '../../components/tabs/SettingsTab.jsx';
import { installBuiltHoldingsModule, installSpendingModule, premiumIt, hasBuiltChunk } from '../premiumTestHelpers.jsx';
import { renderWithSimulation } from '../testUtils.jsx';
import { createHolding } from '../../utils/portfolioHoldings.js';
import { TAX_YEAR, DEFAULT_INPUTS, runProjection } from '../../calculator.js';

// KNOWN_ISSUES.md issue #1 (toggle-switch text disconnected from its
// checkbox) has since been fixed for all 39 `custom-switch` toggles in this
// file -- each visible label is now a real <label htmlFor> (or
// aria-labelledby, for the couple that live inside an <h3>) paired with the
// checkbox's id, so screen.getByLabelText() and clicking the visible text
// both work directly (see the tests below).

// KNOWN_ISSUES.md issue #2 (plain form-field <label> not programmatically
// associated with its input) has since been fixed for all 180 `.form-group`
// fields in this file, via a codemod adding htmlFor/id pairs (see
// changelog.js) -- screen.getByLabelText() now resolves these directly, so
// this DOM-climbing helper is no longer required for new tests, but is kept
// as a convenience for call sites below that were written before the fix
// and still pass a fragment of the label text (getByLabelText requires an
// exact/regex match against the full accessible name, which is pickier).
function fieldNear(labelText) {
  const textEl = screen.getByText(labelText);
  const group = textEl.closest('.form-group');
  return group.querySelector('input, select, textarea');
}

// Plan Settings was regrouped from 4 sub-tabs into 8 life domains on
// 2026-08-19 (IA Phase 3, see IA_REVIEW.md). Tests now pin the sub-tab they
// care about via context rather than clicking their way there, which also
// documents where each control actually lives post-regroup.
const renderSettings = (subTab, overrides = {}, entitlementOverrides = {}) =>
  renderWithSimulation(<SettingsTab />, { settingsSubTab: subTab, ...overrides }, entitlementOverrides);

// Remembered fold state (changelog 270) lives in localStorage; each test
// starts from a clean slate so one test's open section is not the next's.
beforeEach(() => { localStorage.clear(); });

describe('SettingsTab -- Income: buying an annuity in retirement (changelog 286)', () => {
  // Moved from Optimizers, where these four plan inputs had their only
  // editor. Hidden behind a switch until there is a purchase.
  it('hides the purchase fields until the switch is on, then shows them; off zeroes the purchase', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    renderSettings('income', { inputs: { ...DEFAULT_INPUTS, annuityIncome: 1 }, updateInput });
    expect(screen.queryByLabelText('Annuity Purchase Amount ($)')).toBeNull();
    await user.click(document.getElementById('toggle-annuityPurchaseEnabled'));
    expect(screen.getByLabelText('Annuity Purchase Amount ($)')).toBeInTheDocument();
    expect(screen.getByLabelText('Annuity Purchase Age (Spouse 1)')).toBeInTheDocument();
    expect(screen.getByLabelText('Funding Source Account')).toBeInTheDocument();
    expect(document.getElementById('toggle-annuityIsTaxable')).not.toBeNull();
    await user.click(document.getElementById('toggle-annuityPurchaseEnabled'));
    expect(updateInput).toHaveBeenCalledWith('annuityPurchaseAmount', 0);
  });

  it('shows the fields at once when the plan already buys an annuity', () => {
    renderSettings('income', { inputs: { ...DEFAULT_INPUTS, annuityPurchaseAmount: 250000 } });
    expect(screen.getByLabelText('Annuity Purchase Amount ($)')).toHaveValue('250000');
  });
});

describe.skipIf(!hasBuiltChunk('spending'))('SettingsTab -- guaranteed-income floor (step 6, changelog 139)', () => {
  beforeAll(installSpendingModule);
  const LEDGER = {
    lines: [
      { id: 'e', categoryId: 'housing', amount: 36000 },
      { id: 'd', categoryId: 'personal', amount: 12000 },
    ],
    essentialCategoryIds: ['housing'],
    unlinkedFields: [],
  };
  const rows = (over = {}) => [{
    year: 2040, guaranteedIncome: 40000, essentialSpending: 50000,
    essentialShare: 0.75, floorGap: 10000, floorCovered: false,
    lifestyleExpenses: 66667, ...over,
  }];
  const ctx = (inputsOver = {}, yearsOver = {}) => ({
    settingsSubTab: 'spending',
    inputs: { ...DEFAULT_INPUTS, lifestyleExpenseInputMode: 'categories', spendingBlueprint: LEDGER, ...inputsOver },
    projection: { years: rows(yearsOver) },
  });

  it('asks for the essential ticks before saying anything, free or paid', async () => {
    renderWithSimulation(<SettingsTab />, { settingsSubTab: 'spending' }, { isPremium: true });
    expect(await screen.findByText(/Break your spending into categories above/)).toBeInTheDocument();
  });

  it('quotes a free user their own essential share and nothing more', () => {
    renderWithSimulation(<SettingsTab />, ctx(), { isPremium: false });
    // Their own number, which is the point of shipping the tick free.
    // Scoped to the floor panel's own sentence -- the ledger above also
    // renders a 75% figure, so a bare /75%/ matches two elements.
    expect(screen.getByText(/of your retirement spending as/)).toBeInTheDocument();
    expect(screen.getByText(/income that arrives no matter what the market does/)).toBeInTheDocument();
    // Two panels on this page upsell (the bridge and this one), so count
    // rather than assume a single match.
    expect(screen.getAllByRole('button', { name: /see what it includes/i }).length).toBeGreaterThanOrEqual(2);
    // No answer, and no toggle to flip.
    expect(document.getElementById('toggle-floorAwareGuardrails')).toBeNull();
    expect(screen.queryByText(/Widest gap/)).toBeNull();
  });

  it('reports the gap and the year it closes for a premium user', async () => {
    renderWithSimulation(<SettingsTab />, ctx(), { isPremium: true });
    expect(await screen.findByText(/Widest gap/)).toBeInTheDocument();
    expect(screen.getByText(/Never fully covered/)).toBeInTheDocument();
  });

  it('says so plainly when the floor is covered in every year', async () => {
    renderWithSimulation(<SettingsTab />, ctx({}, { floorCovered: true, floorGap: 0, guaranteedIncome: 60000 }), { isPremium: true });
    expect(await screen.findByText(/Covered in/)).toBeInTheDocument();
    expect(screen.getByText(/never depend on the portfolio/)).toBeInTheDocument();
  });

  it('offers the floor-aware guardrail toggle to a premium user', async () => {
    const updateInput = vi.fn();
    renderWithSimulation(<SettingsTab />, { ...ctx(), updateInput }, { isPremium: true });
    const toggle = await waitFor(() => { const el = document.getElementById('toggle-floorAwareGuardrails'); expect(el).toBeTruthy(); return el; });
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);
    expect(updateInput).toHaveBeenCalledWith('floorAwareGuardrailsEnabled', true);
  });

  it('shows what the chosen cut works out to as a share of the whole budget', async () => {
    renderWithSimulation(<SettingsTab />, ctx({ floorAwareGuardrailsEnabled: true, discretionaryCutPct: 40 }), { isPremium: true });
    // 25% discretionary x 40% = 10.0% of total.
    expect(await screen.findByText(/10\.0% of your total budget/)).toBeInTheDocument();
  });
});

describe('SettingsTab -- category ledger (rung 3, changelog 137)', () => {
  const LEDGER = {
    lines: [
      { id: 'a', categoryId: 'housing', label: 'Rent', amount: 24000 },
      { id: 'b', categoryId: 'food', label: 'Groceries', amount: 12000 },
      { id: 'd', categoryId: 'healthBridgePre65', label: 'ACA', amount: 14000, premiumShare: 80 },
    ],
    essentialCategoryIds: ['housing'],
    unlinkedFields: [],
  };
  const inCategories = (over = {}) => ({
    settingsSubTab: 'spending',
    inputs: { ...DEFAULT_INPUTS, lifestyleExpenseInputMode: 'categories', spendingBlueprint: LEDGER, ...over },
  });

  it('offers the ledger from the annual view without switching anything yet', () => {
    renderWithSimulation(<SettingsTab />, { settingsSubTab: 'spending' });
    expect(screen.getByRole('button', { name: /Break it down by category/i })).toBeInTheDocument();
  });

  it('shows the seven categories and the separate pre-65 health line', () => {
    renderWithSimulation(<SettingsTab />, inCategories());
    for (const label of ['Housing', 'Food and groceries', 'Transport', 'Health, ongoing', 'Insurance', 'Personal and discretionary', 'Other']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('Health coverage before 65')).toBeInTheDocument();
    // And says why it is kept apart -- this is the double-count trap.
    expect(screen.getByText(/charge it twice/)).toBeInTheDocument();
  });

  // Changelog 228: the value on hover.
  it('shows a month\u2019s total and what falls due in it on hover, and clears it again', () => {
    const lines = [
      { id: 'a', categoryId: 'housing', label: 'Property taxes', amount: 12000, cadence: 'annual', dueMonth: 1 },
      { id: 'b', categoryId: 'housing', label: 'Upkeep', amount: 12000, cadence: 'monthly' },
    ];
    const inputs = { ...DEFAULT_INPUTS, lifestyleExpenseInputMode: 'categories', spendingBlueprint: { ...LEDGER, lines }, lifestyleExpense: 24000 };
    renderSettings('spending', { inputs, projection: runProjection(inputs) });

    expect(screen.queryByRole('status')).toBeNull();
    const january = screen.getByLabelText(/^January:/);
    fireEvent.mouseEnter(january);
    const tip = screen.getByRole('status');
    // January carries the whole tax bill plus its twelfth of upkeep.
    expect(tip.textContent).toMatch(/January/);
    expect(tip.textContent).toMatch(/\$13,000/);
    // And says which line put it there, which is the part that explains
    // the shape.
    expect(tip.textContent).toMatch(/Property taxes/);
    fireEvent.mouseLeave(january);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('gives the same reading to the keyboard', () => {
    const lines = [
      { id: 'a', categoryId: 'housing', label: 'Property taxes', amount: 12000, cadence: 'annual', dueMonth: 1 },
      { id: 'b', categoryId: 'housing', label: 'Upkeep', amount: 12000, cadence: 'monthly' },
    ];
    const inputs = { ...DEFAULT_INPUTS, lifestyleExpenseInputMode: 'categories', spendingBlueprint: { ...LEDGER, lines }, lifestyleExpense: 24000 };
    renderSettings('spending', { inputs, projection: runProjection(inputs) });
    const march = screen.getByLabelText(/^March:/);
    expect(march.getAttribute('tabindex')).toBe('0');
    fireEvent.focus(march);
    expect(screen.getByRole('status').textContent).toMatch(/March/);
    fireEvent.blur(march);
    expect(screen.queryByRole('status')).toBeNull();
  });

  // Changelog 226: one color, no figures inside the strip.
  it('draws twelve months in one color, with the numbers left to the sentence', () => {
    const lines = [
      { id: 'a', categoryId: 'housing', label: 'Taxes', amount: 12000, cadence: 'annual', dueMonth: 1 },
      { id: 'b', categoryId: 'housing', label: 'Upkeep', amount: 12000, cadence: 'monthly' },
    ];
    const inputs = { ...DEFAULT_INPUTS, lifestyleExpenseInputMode: 'categories', spendingBlueprint: { ...LEDGER, lines }, lifestyleExpense: 24000 };
    renderSettings('spending', { inputs, projection: runProjection(inputs) });

    const strip = screen.getByRole('img', { name: /Monthly outgoings/ });
    const bars = [...strip.querySelectorAll('div')].filter((d) => d.style.borderRadius && d.style.backgroundColor);
    expect(bars).toHaveLength(12);
    // Every bar wears the same color: height already says which is
    // biggest, and a second encoding only invites "what does that mean?".
    const colors = new Set([...bars].map((b) => b.style.backgroundColor));
    expect(colors.size).toBe(1);
    const opacities = new Set([...bars].map((b) => b.style.opacity || ''));
    expect(opacities.size).toBe(1);
    // The figures live in the sentence above, not on the bars, so nothing
    // can collide with it at large text sizes.
    expect(within(strip).queryByText(/\$/)).toBeNull();
    expect(screen.getByText(/January is your heaviest month/)).toBeInTheDocument();
  });

  // Changelog 225: the money box has to hold the money.
  it('gives the amount box room, right-aligns it, and takes the spinner off', () => {
    const lines = [{ id: 'a', categoryId: 'other', label: 'Big trip', amount: 10000, cadence: 'annual', dueMonth: 9 }];
    renderSettings('spending', { inputs: { ...DEFAULT_INPUTS, lifestyleExpenseInputMode: 'categories', spendingBlueprint: { ...LEDGER, lines } } });
    const box = screen.getByLabelText('Amount per payment for line a');
    expect(box.className).toMatch(/amount-input/);
    // A per-payment figure can carry cents: the field takes decimals.
    expect(box.getAttribute('inputmode')).toBe('decimal');
    expect(box.value).toBe('10000');
  });

  // Changelog 224: the amount box is what you PAY, not what the year costs.
  it('writes the year\u2019s cost from what one payment is', () => {
    const updateInput = vi.fn();
    const lines = [{ id: 'a', categoryId: 'other', label: 'Trip', amount: 4000, cadence: 'quarterly', dueMonth: 1 }];
    renderSettings('spending', { updateInput, inputs: { ...DEFAULT_INPUTS, lifestyleExpenseInputMode: 'categories', spendingBlueprint: { ...LEDGER, lines } } });

    // 4,000 a year paid quarterly shows as 1,000 a payment.
    const box = screen.getByLabelText('Amount per payment for line a');
    expect(box.value).toBe('1000');
    expect(screen.getByText(/× 4 = \$4,000\/yr/)).toBeInTheDocument();

    // Entering 3,000 means 3,000 four times: twelve thousand a year.
    fireEvent.change(box, { target: { value: '3000' } });
    const written = Object.fromEntries(updateInput.mock.calls);
    expect(written.spendingBlueprint.lines[0].amount).toBe(12000);
    expect(written.lifestyleExpense).toBe(12000);
  });

  it('keeps the year\u2019s cost when only the frequency changes', () => {
    const updateInput = vi.fn();
    const lines = [{ id: 'a', categoryId: 'housing', label: 'Taxes', amount: 7000, cadence: 'annual', dueMonth: 1 }];
    renderSettings('spending', { updateInput, inputs: { ...DEFAULT_INPUTS, lifestyleExpenseInputMode: 'categories', spendingBlueprint: { ...LEDGER, lines } } });
    fireEvent.change(screen.getByLabelText('How often line a is paid'), { target: { value: 'quarterly' } });
    const written = Object.fromEntries(updateInput.mock.calls);
    // Paying the same bill four times a year does not make it four times
    // the bill -- it makes each payment a quarter of it.
    expect(written.spendingBlueprint.lines[0].amount).toBe(7000);
    expect(written.lifestyleExpense).toBe(7000);
  });

  // Changelog 223: the tab's three sections stack full width and collapse,
  // instead of sitting side by side in a three-column grid.
  it('stacks the three sections, open, each with its own heading', () => {
    renderSettings('spending');
    for (const title of ['Retirement Spending Target', 'Current Household Spending (Pre-Retirement)', 'Special Expenses']) {
      expect(screen.getByRole('button', { name: new RegExp(title.replace(/[()]/g, '.')) })).toBeInTheDocument();
    }
    // The ledger is no longer inside a third of the window, so the widest
    // thing on the tab is full width: no multi-column grid wraps them.
    expect(document.querySelectorAll('.form-grid[style*="320px"]')).toHaveLength(0);
  });

  it('collapses a section and brings it back', async () => {
    const user = userEvent.setup();
    renderSettings('spending');
    const header = screen.getByRole('button', { name: /Retirement Spending Target/ });
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/What you want to spend per year/)).toBeInTheDocument();

    await user.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/What you want to spend per year/)).toBeNull();
    // The other sections are untouched by that.
    expect(screen.getByRole('button', { name: /Current Household Spending/ }).getAttribute('aria-expanded')).toBe('true');

    await user.click(header);
    expect(screen.getByText(/What you want to spend per year/)).toBeInTheDocument();
  });

  it('opens and closes a section from the keyboard', async () => {
    const user = userEvent.setup();
    renderSettings('spending');
    const header = screen.getByRole('button', { name: /Current Household Spending/ });
    header.focus();
    await user.keyboard('{Enter}');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    await user.keyboard(' ');
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  // Changelog 221: how often each line is actually paid, and the calendar
  // that falls out of it.
  it('offers a payment frequency on every line, in every category', () => {
    const updateInput = vi.fn();
    renderSettings('spending', { ...inCategories(), updateInput });
    // Housing's taxes line and the pre-65 health line both get one -- the
    // control belongs to the LINE, not to a favored category.
    expect(screen.getAllByLabelText(/How often line .* is paid/).length).toBe(LEDGER.lines.length);
    fireEvent.change(screen.getAllByLabelText(/How often line .* is paid/)[0], { target: { value: 'annual' } });
    const written = Object.fromEntries(updateInput.mock.calls);
    expect(written.spendingBlueprint.lines[0].cadence).toBe('annual');
    // The annual total is untouched by the change -- this is a within-year
    // shape, and the plan must not move.
    expect(written.lifestyleExpense).toBe(36000);
  });

  it('asks which month a non-monthly line is due, and only then', () => {
    const lines = [
      { id: 'a', categoryId: 'housing', label: 'Taxes', amount: 7000, cadence: 'annual', dueMonth: 1 },
      { id: 'b', categoryId: 'housing', label: 'Upkeep', amount: 5000, cadence: 'monthly' },
    ];
    renderSettings('spending', { inputs: { ...DEFAULT_INPUTS, lifestyleExpenseInputMode: 'categories', spendingBlueprint: { ...LEDGER, lines } } });
    expect(screen.getAllByLabelText(/Month line .* is first due/)).toHaveLength(1);
    // Each control shows what that line is actually set to, or the ledger
    // would read as all-monthly however it was saved.
    const pickers = screen.getAllByLabelText(/How often line .* is paid/);
    expect(pickers[0].value).toBe('annual');
    expect(pickers[1].value).toBe('monthly');
    // Changelog 224: the box is what you PAY, and the row says what that
    // comes to over the year -- on every line, monthly included.
    expect(screen.getByLabelText('Amount per payment for line a').value).toBe('7000');
    expect(screen.getByText(/× 1 = \$7,000\/yr/)).toBeInTheDocument();
    expect(screen.getByLabelText('Amount per payment for line b').value).toBe('416.67');
    expect(screen.getByText(/× 12 = \$5,000\/yr/)).toBeInTheDocument();
  });

  it('shows the year by month once anything is not paid monthly', () => {
    const lines = [
      { id: 'a', categoryId: 'housing', label: 'Taxes', amount: 12000, cadence: 'annual', dueMonth: 1 },
      { id: 'b', categoryId: 'housing', label: 'Upkeep', amount: 12000, cadence: 'monthly' },
    ];
    const inputs = { ...DEFAULT_INPUTS, lifestyleExpenseInputMode: 'categories', spendingBlueprint: { ...LEDGER, lines }, lifestyleExpense: 24000 };
    renderSettings('spending', { inputs, projection: runProjection(inputs) });
    expect(screen.getByText(/When it falls due/)).toBeInTheDocument();
    // January carries the whole tax bill plus its twelfth of upkeep.
    expect(screen.getByText(/January is your heaviest month/)).toBeInTheDocument();
    expect(screen.getByText(/is what you have to carry/)).toBeInTheDocument();
  });

  it('says nothing about the calendar when every line is paid monthly', () => {
    const lines = [{ id: 'a', categoryId: 'housing', label: 'Rent', amount: 24000, cadence: 'monthly' }];
    const inputs = { ...DEFAULT_INPUTS, lifestyleExpenseInputMode: 'categories', spendingBlueprint: { ...LEDGER, lines } };
    renderSettings('spending', { inputs, projection: runProjection(inputs) });
    expect(screen.queryByText(/When it falls due/)).toBeNull();
  });

  // Changelog 218: the same money three ways, and the tax on top.
  it('states the budget by year, month and day, split by what could not be cut', () => {
    const inputs = { ...DEFAULT_INPUTS, lifestyleExpenseInputMode: 'categories', spendingBlueprint: LEDGER, lifestyleExpense: 36000 };
    renderWithSimulation(<SettingsTab />, { settingsSubTab: 'spending', inputs, projection: runProjection(inputs) });
    expect(screen.getByText('A month')).toBeInTheDocument();
    expect(screen.getByText('A day')).toBeInTheDocument();
    expect(screen.getByText('The part you could not cut')).toBeInTheDocument();
    expect(screen.getByText('The part that could flex')).toBeInTheDocument();
    // 36,000 a year is 3,000 a month, and the housing half is 24,000.
    const row = screen.getByText('All of it').closest('tr');
    expect(within(row).getByText('$3,000')).toBeInTheDocument();
    const essentials = screen.getByText('The part you could not cut').closest('tr');
    expect(within(essentials).getByText('$24,000')).toBeInTheDocument();
  });

  it('names the tax the budget does not include', () => {
    const inputs = { ...DEFAULT_INPUTS, lifestyleExpenseInputMode: 'categories', spendingBlueprint: LEDGER, lifestyleExpense: 36000 };
    renderWithSimulation(<SettingsTab />, { settingsSubTab: 'spending', inputs, projection: runProjection(inputs) });
    expect(screen.getByText(/your first retired\s+year, the plan pays/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing withholds it\s+for you any more/)).toBeInTheDocument();
  });

  it('makes Annual Lifestyle Spending read-only while the ledger drives it', () => {
    renderWithSimulation(<SettingsTab />, inCategories());
    const field = document.getElementById('field-lifestyleExpense-categories');
    expect(field).toBeTruthy();
    expect(field).toBeDisabled();
    // The editable one is not rendered in this mode.
    expect(document.getElementById('field-lifestyleExpense')).toBeNull();
  });

  it('writes the derived total and the fields the ledger owns on every edit', () => {
    const updateInput = vi.fn();
    renderWithSimulation(<SettingsTab />, { ...inCategories(), updateInput });
    fireEvent.click(screen.getByLabelText('Housing is essential'));
    const written = Object.fromEntries(updateInput.mock.calls);
    expect(written.lifestyleExpense).toBe(36000);
    expect(written.housingExpensePct).toBeCloseTo(66.7, 1);
    expect(written.healthcareBridgeCost).toBe(14000);
    expect(written.healthcareBridgePremiumPct).toBe(80);
  });

  it('unlinks a derived field without destroying the ledger', () => {
    const updateInput = vi.fn();
    renderWithSimulation(<SettingsTab />, { ...inCategories(), updateInput });
    fireEvent.click(screen.getByRole('button', { name: /Unlink housing share/i }));
    const written = Object.fromEntries(updateInput.mock.calls);
    expect(written.spendingBlueprint.unlinkedFields).toContain('housingExpensePct');
    // Ledger survives, and the total is still driven.
    expect(written.spendingBlueprint.lines).toHaveLength(3);
    expect(written.lifestyleExpense).toBe(36000);
    // The unlinked field is NOT written any more.
    expect(written.housingExpensePct).toBeUndefined();
  });

  // Housing Share of Spending lives on the Assumptions & Risk sub-tab. No
  // conditional guards here: a guarded assertion passes when the field is
  // absent, which would silently stop testing the thing that matters.
  it('disables the owned field elsewhere in Settings and badges it', () => {
    renderWithSimulation(<SettingsTab />, { ...inCategories(), settingsSubTab: 'assumptions' });
    const housing = document.getElementById('field-housingExpensePct');
    expect(housing).toBeTruthy();
    expect(housing).toBeDisabled();
    expect(screen.getByText('from your categories')).toBeInTheDocument();
  });

  it('leaves the owned field editable once unlinked', () => {
    renderWithSimulation(<SettingsTab />, {
      ...inCategories({ spendingBlueprint: { ...LEDGER, unlinkedFields: ['housingExpensePct'] } }),
      settingsSubTab: 'assumptions',
    });
    const housing = document.getElementById('field-housingExpensePct');
    expect(housing).toBeTruthy();
    expect(housing).not.toBeDisabled();
    expect(screen.queryByText('from your categories')).toBeNull();
  });

  it('leaves the owned field editable when the ledger is not in use at all', () => {
    renderWithSimulation(<SettingsTab />, { settingsSubTab: 'assumptions' });
    const housing = document.getElementById('field-housingExpensePct');
    expect(housing).toBeTruthy();
    expect(housing).not.toBeDisabled();
  });
});

describe('SettingsTab -- Retirement Spending bridge (rung 2, changelog 135)', () => {
  const AUTO = {
    mode: 'auto', income: 75000, salary: 75000, otherIncome: 0,
    taxes: 11915.5, contributions: 10000, nonCashAdjustments: 0,
    derived: 53084.5, applied: 53084.5, trimmedByDeficit: 0,
  };
  const ctx = (overrides = {}) => ({
    settingsSubTab: 'spending',
    projection: { years: [{ year: 2026, currentSpending: AUTO }] },
    ...overrides,
  });

  describe('free user', () => {
    it('explains the double-counting problem and offers nothing to fill in', () => {
      renderWithSimulation(<SettingsTab />, ctx(), { isPremium: false });
      expect(screen.getByText(/Turn that into a retirement target/)).toBeInTheDocument();
      expect(screen.getByText(/twice/)).toBeInTheDocument();
      // The whole point of the locked-card choice: no worksheet fields, so
      // nobody does the work and then meets a paywall.
      expect(document.getElementById('field-bridge-currentHealthPremiums')).toBeNull();
      expect(screen.queryByText(/Use this as my Annual Lifestyle Spending/)).toBeNull();
    });

    it('quotes the user their own starting figure', () => {
      renderWithSimulation(<SettingsTab />, ctx(), { isPremium: false });
      expect(screen.getByRole('button', { name: /see what it includes/i })).toBeInTheDocument();
    });
  });

  describe.skipIf(!hasBuiltChunk('spending'))('premium user', () => {
    beforeAll(installSpendingModule);
    const premiumCtx = (inputsOver = {}) => ctx({
      inputs: {
        ...DEFAULT_INPUTS,
        mortgagePayment: 18000,
        otherDebtPayment: 3000,
        spendingBridge: { currentHealthPremiums: 9000, workCostsThatStop: 6000, retirementIncreases: 12000 },
        ...inputsOver,
      },
    });

    it('shows the three questions and the derived debt line', async () => {
      renderWithSimulation(<SettingsTab />, premiumCtx(), { isPremium: true });
      await waitFor(() => expect(document.getElementById('field-bridge-currentHealthPremiums')).toBeTruthy());
      expect(document.getElementById('field-bridge-workCostsThatStop')).toBeTruthy();
      expect(document.getElementById('field-bridge-retirementIncreases')).toBeTruthy();
      // Both debt lines are derived from the plan, not asked for -- the
      // badge says so on each.
      expect(screen.getAllByText('from your plan')).toHaveLength(2);
      expect(screen.getByText('Mortgage payments')).toBeInTheDocument();
      expect(screen.getByText(/Credit cards, car loans/)).toBeInTheDocument();
    });

    it('advises clearing consumer debt before retirement, but not a mortgage', async () => {
      renderWithSimulation(<SettingsTab />, premiumCtx(), { isPremium: true });
      // The advisory belongs on consumer debt only -- a mortgage running
      // into retirement is a cost of living, not a problem to fix.
      expect(await screen.findByText(/Clearing consumer debt before you stop working/)).toBeInTheDocument();
      expect(screen.getByText(/often does continue into retirement/)).toBeInTheDocument();
    });

    it('congratulates rather than warns when there is no consumer debt', async () => {
      renderWithSimulation(<SettingsTab />, premiumCtx({ otherDebtPayment: 0 }), { isPremium: true });
      expect(await screen.findByText(/where you want to be at retirement/)).toBeInTheDocument();
      expect(screen.queryByText(/Clearing consumer debt before you stop working/)).toBeNull();
    });

    // Changelog 227: an exclusion with no destination reads as "we do not
    // model this", and the user enters it here anyway.
    it('names where every excluded cost is entered instead', async () => {
      renderWithSimulation(<SettingsTab />, premiumCtx(), { isPremium: true });
      expect(await screen.findByText(/Leave these out of the figure above/)).toBeInTheDocument();
      expect(screen.getByText(/Long-term care/)).toBeInTheDocument();
      expect(screen.getByText(/Add them under Life Events/)).toBeInTheDocument();
      // Every row says where it goes, and the one nobody enters says so.
      expect(screen.getByText(/Nothing to enter/)).toBeInTheDocument();
      expect(screen.getByText(/Enter the balances and payments under Balances & Debt/)).toBeInTheDocument();
    });

    it('points health premiums at the ledger when the ledger is driving', async () => {
      const ctx = premiumCtx();
      renderWithSimulation(<SettingsTab />, ctx, { isPremium: true });
      // Without a category ledger, the standalone field is the place.
      expect(await screen.findByText(/Enter it in Healthcare Bridge Cost/)).toBeInTheDocument();

      cleanup();
      renderWithSimulation(<SettingsTab />, {
        ...ctx,
        inputs: { ...ctx.inputs, lifestyleExpenseInputMode: 'categories', spendingBlueprint: { lines: [{ id: 'a', categoryId: 'housing', amount: 12000 }], essentialCategoryIds: [], unlinkedFields: [] } },
      }, { isPremium: true });
      // With one, the premiums belong in its own pre-65 section -- and NOT
      // in a category, which is the double-count this list exists to stop.
      expect(await screen.findByText(/under .Health coverage before 65. — not in the Insurance or Health categories/)).toBeInTheDocument();
    });

    it('writes lifestyleExpense once when applied, and does not lock the field', async () => {
      const updateInput = vi.fn();
      // updateInput is a CONTEXT value, not an input -- passing it through
      // premiumCtx's inputs override would silently do nothing.
      renderWithSimulation(<SettingsTab />, { ...premiumCtx(), updateInput }, { isPremium: true });
      const apply = await screen.findByRole('button', { name: /Use this as my Annual Lifestyle Spending/i });
      fireEvent.click(apply);
      // 53,084.50 - 21,000 - 9,000 - 6,000 + 12,000 = 29,084.50 -> 29,085
      expect(updateInput).toHaveBeenCalledWith('lifestyleExpense', 29085);
      // No source key is written: applying is one-way, not a live link.
      const keysWritten = updateInput.mock.calls.map((c) => c[0]);
      expect(keysWritten).not.toContain('lifestyleExpenseSource');
    });

    it('shows the button as already applied when the target matches', async () => {
      renderWithSimulation(<SettingsTab />, premiumCtx({ lifestyleExpense: 29085 }), { isPremium: true });
      expect(await screen.findByRole('button', { name: 'Applied' })).toBeDisabled();
    });

    it('flags an over-subtracted target instead of quietly showing zero', async () => {
      renderWithSimulation(
        <SettingsTab />,
        premiumCtx({ spendingBridge: { currentHealthPremiums: 40000, workCostsThatStop: 20000, retirementIncreases: 0 } }),
        { isPremium: true },
      );
      expect(await screen.findByText(/held at zero/)).toBeInTheDocument();
    });
  });
});

describe('SettingsTab -- current-spending residual readout (changelog 134)', () => {
  // Rung 1 of the Retirement Spending module. The figure has always been
  // computed; before this it was never shown. These pin the two things that
  // would make showing it worse than not showing it: a number without its
  // derivation, and a number that quietly differs from what the plan spent.
  const withBreakdown = (currentSpending) => ({
    settingsSubTab: 'spending',
    projection: { years: [{ year: 2026, currentSpending }] },
  });

  const AUTO = {
    mode: 'auto', income: 75000, salary: 75000, otherIncome: 0,
    taxes: 11915.5, contributions: 10000, nonCashAdjustments: 0,
    derived: 53084.5, applied: 53084.5, trimmedByDeficit: 0,
  };

  it('shows the annual figure, the monthly figure, and every line of the derivation', () => {
    renderWithSimulation(<SettingsTab />, withBreakdown(AUTO));
    expect(screen.getByText('What you have left to spend today')).toBeInTheDocument();
    expect(screen.getByText(/Income \(salary, pensions, other\)/)).toBeInTheDocument();
    expect(screen.getByText('Taxes')).toBeInTheDocument();
    expect(screen.getByText('Savings and contributions')).toBeInTheDocument();
    expect(screen.getByText('What is left')).toBeInTheDocument();
    // A monthly figure is the form the question is actually asked in.
    expect(screen.getByText(/a month/)).toBeInTheDocument();
  });

  it('prints both caveats next to the number rather than burying them', () => {
    renderWithSimulation(<SettingsTab />, withBreakdown(AUTO));
    expect(screen.getByText(/residual/)).toBeInTheDocument();
    expect(screen.getByText(/one-off years/)).toBeInTheDocument();
  });

  it('hides the non-cash line when it is zero, and shows it when it is not', () => {
    renderWithSimulation(<SettingsTab />, withBreakdown(AUTO));
    expect(screen.queryByText(/Vested shares kept/)).toBeNull();
  });

  it('shows the non-cash adjustment line when there is one', () => {
    renderWithSimulation(<SettingsTab />, withBreakdown({ ...AUTO, nonCashAdjustments: 12000, derived: 41084.5, applied: 41084.5 }));
    expect(screen.getByText(/Vested shares kept/)).toBeInTheDocument();
  });

  it('shows the mortgage and debt share of what is left, and what remains', () => {
    renderWithSimulation(<SettingsTab />, withBreakdown({ ...AUTO, debtPayments: 12000, applied: 41084.5 }));
    expect(screen.getByText(/Of that, mortgage and debt payments/)).toBeInTheDocument();
    expect(screen.getByText(/Left for everything else/)).toBeInTheDocument();
  });

  it('leaves the debt lines out when there are no debt payments', () => {
    renderWithSimulation(<SettingsTab />, withBreakdown(AUTO));
    expect(screen.queryByText(/Of that, mortgage and debt payments/)).toBeNull();
  });

  it('reports a deficit trim separately instead of showing one ambiguous number', () => {
    renderWithSimulation(<SettingsTab />, withBreakdown({ ...AUTO, applied: 21084.5, trimmedByDeficit: 32000 }));
    expect(screen.getByText(/could not fund this in full/)).toBeInTheDocument();
  });

  it('says so plainly when the plan starts already retired', () => {
    renderWithSimulation(<SettingsTab />, { settingsSubTab: 'spending', projection: { years: [{ year: 2026, currentSpending: null }] } });
    expect(screen.getByText(/no working year to derive it from/)).toBeInTheDocument();
  });

  it('does not show the readout at all in custom mode', () => {
    renderWithSimulation(<SettingsTab />, {
      settingsSubTab: 'spending',
      inputs: { ...DEFAULT_INPUTS, currentSpendingMode: 'custom' },
      projection: { years: [{ year: 2026, currentSpending: AUTO }] },
    });
    expect(screen.queryByText('What you have left to spend today')).toBeNull();
  });
});

describe('SettingsTab', () => {
  describe('sub-tab navigation', () => {
    it('defaults to the Household sub-tab', () => {
      renderWithSimulation(<SettingsTab />);
      expect(screen.getByText(/State of Residence/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Household' })).toHaveClass('active');
    });

    it('offers all eight life-domain sub-tabs plus Life Events and Plan Year', () => {
      renderWithSimulation(<SettingsTab />);
      for (const name of ['Household', 'Income', 'Savings', 'Balances & Debt', 'Spending',
                          'Taxes & Roth', 'Assumptions & Risk', 'Life Events', 'Plan Year & Review']) {
        expect(screen.getByRole('button', { name })).toBeInTheDocument();
      }
    });

    it('switches to Balances & Debt on click', async () => {
      const user = userEvent.setup();
      renderWithSimulation(<SettingsTab />);
      await user.click(screen.getByRole('button', { name: 'Balances & Debt' }));
      expect(screen.getByLabelText(/Pre-Tax .*Balance|Traditional/i)).toBeInTheDocument();
    });

    it('switches to Life Events on click', async () => {
      const user = userEvent.setup();
      renderWithSimulation(<SettingsTab />);
      await user.click(screen.getByRole('button', { name: 'Life Events' }));
      expect(screen.getByRole('heading', { name: 'Life Events' })).toBeInTheDocument();
    });

    it('switches to Plan Year on click without crashing', async () => {
      const user = userEvent.setup();
      renderWithSimulation(<SettingsTab />);
      await user.click(screen.getByRole('button', { name: 'Plan Year & Review' }));
      // Basic Parameters content should be gone once we've navigated away.
      expect(screen.queryByText(/State of Residence/)).not.toBeInTheDocument();
    });
  });

  describe('Basic Parameters -- computed displays', () => {
    it('shows the SS benefit multiplier for the default claiming age (67 = 100%)', () => {
      renderSettings('household');
      expect(screen.getByText(/Benefit multiplier: 100% of FRA baseline/)).toBeInTheDocument();
    });

    it('recomputes the SS benefit multiplier for a below-FRA claiming age', () => {
      renderSettings('household', { inputs: { claimingAge1: 62 } });
      // getSSMultiplier(62) = statutory 70% (36 months at 5/9% + 24 months at 5/12%)
      expect(screen.getByText(/Benefit multiplier: 70% of FRA baseline/)).toBeInTheDocument();
    });

    it('shows the life-expectancy-before-retirement warning when misconfigured', () => {
      renderSettings('household', { inputs: { retireAge1: 67, lifeExpectancy1: 60 } });
      expect(screen.getByText(/Life expectancy is younger than retirement age/)).toBeInTheDocument();
    });

    it('does not show the life-expectancy warning for a sane default plan', () => {
      renderSettings('household');
      expect(screen.queryByText(/Life expectancy is younger than retirement age/)).not.toBeInTheDocument();
    });

    it('shows the part-time-income-end-age warning when the end age is at or before retirement', () => {
      renderSettings('income', {
        inputs: { partTimeIncome1: 20000, partTimeIncomeEndAge1: 65, retireAge1: 67 },
      });
      expect(screen.getByText(/End age is at or before retirement age/)).toBeInTheDocument();
    });

    it('reveals the Spouse 2 block when Enable Spouse Planning is toggled on (data-driven)', () => {
      renderSettings('household', { inputs: { spouse2Enabled: true, spouse2Name: 'Jamie' } });
      expect(screen.getByText(/Jamie.?s SS Claiming Age/)).toBeInTheDocument();
    });

    it('calls updateInput when the Enable Spouse Planning switch is clicked', async () => {
      const user = userEvent.setup({ delay: null });
      const updateInput = vi.fn();
      renderSettings('household', { updateInput });
      // The switch text is a real <label htmlFor> paired with the
      // checkbox's id (fixed a11y issue) -- reachable via getByLabelText,
      // and clicking the visible text toggles it directly. Worded the same
      // as the Interview's question since 2026-09-02.
      expect(screen.getByLabelText('Planning with a spouse or partner?')).toBeInTheDocument();
      await user.click(screen.getByText('Planning with a spouse or partner?'));
      expect(updateInput).toHaveBeenCalledWith('spouse2Enabled', true);
      // Enabling a spouse on a Single-filing plan also moves it to MFJ,
      // matching the Interview and the setup wizard.
      expect(updateInput).toHaveBeenCalledWith('filingStatus', 'MFJ');
    });
  });

  describe('Basic Parameters -- CollapsibleHeader sections', () => {
    it('Equity Compensation (RSU/GSU) section is collapsed by default with no grants', () => {
      renderSettings('income');
      expect(screen.queryByText('Existing Grants')).not.toBeInTheDocument();
    });

    it('opens the Equity Compensation section on header click', async () => {
      const user = userEvent.setup();
      renderSettings('income');
      await user.click(screen.getByText('Equity Compensation (RSU/GSU)'));
      expect(screen.getByText('Existing Grants')).toBeInTheDocument();
      expect(screen.getByText('No grants entered yet.')).toBeInTheDocument();
    });

    it('Equity Compensation section defaults open when the plan already has a grant', () => {
      renderSettings('income', {
        inputs: { rsuGrants: [{ id: '1', spouse: 1, label: 'Existing Grant', grantYear: 2025, totalValue: 50000, vestingYears: 4, schedule: 'equal' }] },
      });
      expect(screen.getByText('Existing Grants')).toBeInTheDocument();
      // Exact (non-regex) match -- a substring/regex match here also hits
      // the "Existing Grants" section heading above.
      expect(screen.getByText('Existing Grant')).toBeInTheDocument();
    });

    it('opens Roth Conversion Optimization and shows the strategy selector', async () => {
      const user = userEvent.setup();
      renderSettings('taxes');
      await user.click(screen.getByText('Roth Conversion Optimization'));
      expect(screen.getByText('Roth Conversion Strategy')).toBeInTheDocument();
    });

    it('the Medicare Premiums (IRMAA) block is visible on Taxes & Roth without opening Roth conversions (changelog 260)', () => {
      renderSettings('taxes');
      expect(screen.queryByText('Roth Conversion Strategy')).toBeNull();
      expect(screen.getByText('Medicare Premiums (IRMAA)')).toBeInTheDocument();
      expect(document.getElementById('toggle-irmaaLifeChangeAppeal')).not.toBeNull();
    });
  });

  describe('Basic Parameters -- more toggle-driven conditional sections', () => {
    // Every toggle in this describe block reads/writes `inputs.X`, i.e.
    // SimulationContext state, not this component's own local useState --
    // same class of thing as riskSubTab/stressChartView (RiskTab) and
    // whatIfRetireAge (StrategyTab) elsewhere in this suite. testUtils'
    // default `updateInput` is a plain `vi.fn()` spy, not a real state
    // updater, so clicking a context-backed toggle and then asserting the
    // UI changed doesn't work -- these are tested in two separate halves
    // instead: the reveal itself via a direct fixture override (no click
    // needed), and the click's *effect* via asserting the updateInput call.

    it('Survivor Stress Test reveals the "who passes away" selector once already on (data-driven)', () => {
      renderSettings('household', { inputs: { spouse2Enabled: true, survivorStressEnabled: true } });
      expect(screen.getByLabelText('Who passes away prematurely?')).toBeInTheDocument();
    });

    it('Survivor Stress Test is hidden by default, and clicking it calls updateInput', () => {
      const updateInput = vi.fn();
      renderSettings('household', { updateInput, inputs: { spouse2Enabled: true } });
      expect(screen.queryByLabelText('Who passes away prematurely?')).not.toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('Survivor Stress Test'));
      expect(updateInput).toHaveBeenCalledWith('survivorStressEnabled', true);
    });

    it('LTC toggle reveals its cost/start-age/duration fields (data-driven)', () => {
      // ltcActive1 both auto-opens the "Special Expenses" CollapsibleHeader
      // (see its useState lazy initializer, which checks ltcActive1/2 among
      // other flags) and the LTC sub-fields themselves.
      renderSettings('spending', { inputs: { ltcActive1: true } });
      expect(screen.getByLabelText('Long-Term Care Annual Cost ($)')).toBeInTheDocument();
      expect(screen.getByLabelText('Long-Term Care Duration (years)')).toBeInTheDocument();
      expect(screen.queryByText(/modeling care that lasts the remainder/)).not.toBeInTheDocument();
    });

    it('LTC Ends in Death swaps the Duration field for a lifetime-cost note (data-driven), and its toggle calls updateInput', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('spending', { updateInput, inputs: { ltcActive1: true, ltcEndsInDeath1: true } });
      expect(screen.queryByLabelText('Long-Term Care Duration (years)')).not.toBeInTheDocument();
      expect(screen.getByText(/modeling care that lasts the remainder/)).toBeInTheDocument();

      // The label text is wrapped in a Tooltip (nested role="button" span),
      // and jsdom's native <label htmlFor> click-forwarding through that
      // nesting only reliably fires via userEvent.click, not fireEvent.click.
      await user.click(screen.getByText('Care Lasts for Life'));
      expect(updateInput).toHaveBeenCalledWith('ltcEndsInDeath1', false);
    });

    it('Backdoor Roth reveals its contribution amount fields once already on (data-driven)', async () => {
      const user = userEvent.setup();
      renderSettings('taxes', { inputs: { backdoorRothEnabled: true } });
      // Note: renderWithSimulation's `inputs` override is a *shallow*
      // replace of the whole inputs object (see makeDefaultContextValue),
      // not a merge with DEFAULT_INPUTS -- so every other field, including
      // rothConversionStrategy, is undefined here. showRothConversion's own
      // useState lazy-initializer treats `undefined !== 'none'` as true, so
      // this section is already open on mount; only click if it isn't.
      if (!screen.queryByLabelText(/Annual Backdoor Contribution/)) {
        await user.click(screen.getByText('Roth Conversion Optimization'));
      }
      expect(screen.getByLabelText(/Annual Backdoor Contribution/)).toBeInTheDocument();
    });

    it('Backdoor Roth is off by default, and clicking its toggle calls updateInput', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('taxes', { updateInput });
      await user.click(screen.getByText('Roth Conversion Optimization'));
      expect(screen.queryByLabelText(/Annual Backdoor Contribution/)).not.toBeInTheDocument();
      // Tooltip-wrapped label text -- userEvent.click, not fireEvent.click
      // (see comment on the LTC Ends in Death test above).
      await user.click(screen.getByText('Backdoor Roth Contributions'));
      expect(updateInput).toHaveBeenCalledWith('backdoorRothEnabled', true);
    });
  });

  describe('plain form fields -- a11y regression (KNOWN_ISSUES.md issue #2)', () => {
    it('a simple default-visible field is reachable via getByLabelText', () => {
      renderSettings('household');
      expect(screen.getByLabelText('State of Residence')).toBeInTheDocument();
    });

    it('a Tooltip-wrapped, loop-generated field (RSU Refresh Growth Rate) resolves to its own distinct id', () => {
      renderSettings('income', { inputs: { rsuRefreshEnabled1: true } });
      const growthRate = screen.getByLabelText('Grant Growth Rate (%/yr)');
      const annualGrant = screen.getByLabelText("Assumed Annual Grant ($, today's $)");
      expect(growthRate).not.toBe(annualGrant);
      expect(growthRate).toHaveAttribute('role', 'spinbutton');
    });

    it('an outer field and its nested sub-fields (Pension / Start Age) resolve to distinct, non-colliding ids', () => {
      // pension1 > 0 both reveals the Start Age/COLA sub-fields AND makes
      // the "Annuities, Rentals & Pensions" CollapsibleHeader default open
      // (see its useState initializer), so no click is needed here.
      renderSettings('income', { inputs: { pension1: 40000 } });

      const pensionAmount = screen.getByLabelText(/Pension \(\$\/yr\)/);
      const startAge = screen.getByLabelText('Start Age');
      expect(pensionAmount).not.toBe(startAge);
      expect(pensionAmount).toHaveValue('40,000');
    });

    it('ticking Military Pension seeds the COLA and 55% survivor benefit instead of throwing (2026-09-02 fix)', () => {
      // The handler used to call a setInputs() that useSimulation never
      // exposed -- a ReferenceError on click. It now writes the three keys
      // through updateInput, the same seeding the Interview does.
      const updateInput = vi.fn();
      renderSettings('income', { inputs: { ...DEFAULT_INPUTS, pension1: 40000, inflationRate: 3 }, updateInput });
      // A switch since changelog 279: the label points at the input by id.
      const box = document.getElementById('toggle-militaryPension1');
      expect(screen.getByText('Military Pension (State Tax Exempt)').closest('label')).toHaveAttribute('for', 'toggle-militaryPension1');
      fireEvent.click(box);
      expect(updateInput).toHaveBeenCalledWith('militaryPension1', true);
      expect(updateInput).toHaveBeenCalledWith('pension1COLA', 3);
      expect(updateInput).toHaveBeenCalledWith('pension1SurvivorBenefit', 55);
    });

    it('closes a section again on a second header click', async () => {
      const user = userEvent.setup();
      renderSettings('spending');
      const header = screen.getByText('Special Expenses');
      await user.click(header);
      expect(screen.getByText('Enable Three-Phase Lifestyle Curve')).toBeInTheDocument();
      await user.click(header);
      expect(screen.queryByText('Enable Three-Phase Lifestyle Curve')).not.toBeInTheDocument();
    });
  });

  describe('Basic Parameters -- RSU grant CRUD', () => {
    async function openRsuSection(user) {
      if (!screen.queryByText('Existing Grants')) {
        await user.click(screen.getByText('Equity Compensation (RSU/GSU)'));
      }
    }

    it('adds a new RSU grant via the mini-form', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('income', { updateInput });
      await openRsuSection(user);

      await user.type(fieldNear('Label'), 'Google 2026');
      await user.click(screen.getByRole('button', { name: /Add Grant/ }));

      expect(updateInput).toHaveBeenCalledWith('rsuGrants', [
        expect.objectContaining({ label: 'Google 2026', totalValue: 100000, vestingYears: 4, schedule: 'equal' }),
      ]);
    });

    it('deletes an existing RSU grant', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('income', {
        updateInput,
        inputs: { rsuGrants: [{ id: 'g1', spouse: 1, label: 'To Delete', grantYear: 2025, totalValue: 50000, vestingYears: 4, schedule: 'equal' }] },
      });
      await openRsuSection(user);

      // The grant's label ("To Delete") is rendered inside a <strong>
      // whose immediate parent is an "info" div -- the delete button is a
      // *sibling* of that info div, one level further up, under the row
      // div (see SettingsTab.jsx's Existing Grants list markup).
      const row = screen.getByText('To Delete').closest('div').parentElement;
      await user.click(within(row).getByRole('button'));

      expect(updateInput).toHaveBeenCalledWith('rsuGrants', []);
    });

    it('reveals the custom schedule text field only when Schedule is set to Custom', async () => {
      const user = userEvent.setup();
      renderSettings('income');
      await openRsuSection(user);

      expect(screen.queryByText('% per year (comma-separated)')).not.toBeInTheDocument();
      await user.selectOptions(fieldNear('Schedule'), 'custom');
      expect(screen.getByText('% per year (comma-separated)')).toBeInTheDocument();
    });

    it('switching Enter Grant As to Units swaps the value field and adds a unit-denominated grant', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('income', { updateInput });
      await openRsuSection(user);

      expect(screen.getByLabelText('Total Value ($)')).toBeInTheDocument();
      await user.selectOptions(fieldNear('Enter Grant As'), 'units');
      expect(screen.queryByLabelText('Total Value ($)')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Add Grant/ }));

      expect(updateInput).toHaveBeenCalledWith('rsuGrants', [
        expect.objectContaining({ units: 1000, totalValue: undefined, vestingYears: 4, schedule: 'equal' }),
      ]);
    });

    it('renders a unit grant row as units × price = value, and edits the per-spouse Current Share Price', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('income', {
        updateInput,
        inputs: { ...DEFAULT_INPUTS, rsuSharePrice1: 95.4, rsuGrants: [{ id: 'g1', spouse: 1, label: 'GSU 2026', grantYear: 2026, units: 1200, vestingYears: 4, schedule: 'equal' }] },
      });
      await openRsuSection(user);

      // 1,200 × $95.40 = $114,480 — the arithmetic is shown on the row.
      expect(screen.getByText(/1,200 units/)).toBeInTheDocument();
      expect(screen.getByText(/\$114,480/)).toBeInTheDocument();

      // The price label sits inside a Tooltip whose aria-label duplicates
      // the phrase (jsdom gotcha: HoverTooltip clones aria-labels), so
      // target the input by its id instead of an ambiguous label query.
      fireEvent.change(document.getElementById('field-rsuSharePrice1'), { target: { value: '120' } });
      expect(updateInput).toHaveBeenCalledWith('rsuSharePrice1', 120);
    });

    it('warns loudly when a unit grant has no share price entered (vests $0)', async () => {
      const user = userEvent.setup();
      renderSettings('income', {
        inputs: { ...DEFAULT_INPUTS, rsuSharePrice1: 0, rsuGrants: [{ id: 'g1', spouse: 1, label: 'GSU 2026', grantYear: 2026, units: 1200, vestingYears: 4, schedule: 'equal' }] },
      });
      await openRsuSection(user);

      expect(screen.getByText(/No share price entered for this spouse below/)).toBeInTheDocument();
      expect(screen.getByText(/contribute \$0 of vesting income until a price is entered/)).toBeInTheDocument();
    });
  });

  describe('Initial Balances -- distinctive logic', () => {
    beforeAll(installBuiltHoldingsModule);
    it('shows the reverse mortgage fields only once the toggle is on (data-driven)', () => {
      renderSettings('balances', { activeTab: 'settings', inputs: { reverseMortgageEnabled: true } });
      expect(screen.getByText('Current Home Value ($)')).toBeInTheDocument();
    });

    it('does not show reverse mortgage fields by default', () => {
      renderSettings('balances');
      expect(screen.queryByText('Current Home Value ($)')).not.toBeInTheDocument();
    });

    // Changelog 144: the home is its own thing now, and the reverse
    // mortgage hangs off it.
    it('Own Your Home reveals the value fields and the reverse-mortgage toggle without any loan', () => {
      renderSettings('balances', { inputs: { homeOwned: true, reverseMortgageEnabled: false } });
      expect(screen.getByText('Current Home Value ($)')).toBeInTheDocument();
      expect(screen.getByText('Home Appreciation Rate (%/yr)')).toBeInTheDocument();
      expect(document.getElementById('toggle-reverseMortgageEnabled')).toBeInTheDocument();
      expect(screen.queryByText('Loan Interest Rate (%/yr)')).not.toBeInTheDocument();
    });

    it('hides the reverse-mortgage toggle for a renter', () => {
      renderSettings('balances');
      expect(document.getElementById('toggle-reverseMortgageEnabled')).not.toBeInTheDocument();
      expect(screen.getByText('Other Estate Assets ($)')).toBeInTheDocument();
    });

    it('warns when there is a mortgage balance but no home in the plan', () => {
      renderSettings('balances', { inputs: { mortgageBalance: 250000, homeOwned: false } });
      expect(screen.getByText(/no home in the plan/)).toBeInTheDocument();
    });

    it('shows the other-assets growth rate only once a total is entered', () => {
      renderSettings('balances', { inputs: { otherEstateAssetsInit: 0 } });
      expect(screen.queryByText('Other Assets Growth Rate (%/yr)')).not.toBeInTheDocument();
      cleanup();
      renderSettings('balances', { inputs: { otherEstateAssetsInit: 150000 } });
      expect(screen.getByText('Other Assets Growth Rate (%/yr)')).toBeInTheDocument();
    });

    it('switches Employer Match Type to the percent-based formula fields', async () => {
      const user = userEvent.setup();
      renderSettings('savings');
      const select = fieldNear(/Employer Match Type/);
      await user.selectOptions(select, 'percent');
      expect(screen.getByText('Tier A: Match Rate (%)')).toBeInTheDocument();
    });

    it('shows an HSA-over-limit warning once contributions exceed the IRS limit', () => {
      renderSettings('savings', { inputs: { hsaContribution: 50000, hsaFamilyCoverage: false } });
      expect(screen.getByText(/exceeds the 2026 IRS HSA contribution limit/)).toBeInTheDocument();
    });

    // Savings Contribution dollar fields (Pre-Tax/Roth/Employer Match/HSA/
    // Taxable) now render via the shared CommaNumberInput (see
    // CommaNumberInput.test.jsx for that component's own unit coverage)
    // instead of a plain type="number" input -- distinctive relative to
    // this file's usual NumField pattern, so it earns a dedicated test here
    // per this describe block's own scoping rule.
    it('displays Savings Contribution dollar fields with thousands separators', () => {
      renderSettings('savings', {
        inputs: { spouse2Enabled: false, preTaxContribution1: 24500, rothContribution1: 8000, taxableContribution: 15000, hsaContribution: 4300 },
      });
      expect(screen.getByLabelText('Pre-Tax Savings ($/yr)')).toHaveValue('24,500');
      expect(screen.getByLabelText('Roth Savings ($/yr)')).toHaveValue('8,000');
      expect(screen.getByLabelText('Taxable Brokerage Savings ($/yr)')).toHaveValue('15,000');
      expect(screen.getByLabelText('HSA Savings ($/yr, combined employer + employee)')).toHaveValue('4,300');
    });

    it('parses a comma-formatted Pre-Tax Savings edit back into a plain number via updateInput', async () => {
      const updateInput = vi.fn();
      renderSettings('savings', { updateInput, inputs: { spouse2Enabled: false, preTaxContribution1: 0 } });
      const preTaxField = screen.getByLabelText('Pre-Tax Savings ($/yr)');
      fireEvent.focus(preTaxField);
      fireEvent.change(preTaxField, { target: { value: '24500' } });
      expect(updateInput).toHaveBeenCalledWith('preTaxContribution1', 24500);
    });

    it('sets lifeInsuranceIncreasingBenefit1 automatically when policy type is switched to Variable Appreciable Life', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('balances', { updateInput, inputs: { lifeInsuranceEnabled1: true } });
      await user.selectOptions(fieldNear('Policy Type'), 'variableAppreciableLife');
      expect(updateInput).toHaveBeenCalledWith('lifeInsurancePolicyType1', 'variableAppreciableLife');
      expect(updateInput).toHaveBeenCalledWith('lifeInsuranceIncreasingBenefit1', true);
    });

    it('renders the Roth IRA Eligibility panel using the real contribution advisory logic', () => {
      renderSettings('savings');
      expect(screen.getByText('Roth IRA Eligibility (approximate)')).toBeInTheDocument();
    });

    it('offers "Contribute the Max" in both spouses\' Auto-Max dropdowns', () => {
      renderSettings('savings', { inputs: { spouse2Enabled: true } });
      const options = screen.getAllByRole('option', { name: 'Contribute the Max (401k + IRA + HSA)' });
      expect(options).toHaveLength(2);
    });

    it('Contribute the Max disables that spouse\'s Pre-Tax, Roth AND the household HSA fields with computed-figure notes', () => {
      // The inputs override REPLACES the whole inputs object (see the note
      // in the Backdoor Roth test above), so spread DEFAULT_INPUTS to keep
      // planYear/birthYear1/retireAge1 defined -- the max-mode notes and
      // HSA gating all compute ages from them.
      renderSettings('savings', {
        inputs: { ...DEFAULT_INPUTS, spouse2Enabled: false, autoMaxContribution1: 'max', hsaContribution: 1000, salary1: 100000 },
      });
      expect(screen.getByLabelText('Pre-Tax Savings ($/yr)')).toBeDisabled();
      expect(screen.getByLabelText('Roth Savings ($/yr)')).toBeDisabled();
      expect(screen.getByLabelText('HSA Savings ($/yr, combined employer + employee)')).toBeDisabled();
      expect(screen.getByText(/Contribute the Max is computing \$24,500\/yr Pre-Tax here/)).toBeInTheDocument();
      expect(screen.getByText(/Contribute the Max is setting the household HSA/)).toBeInTheDocument();
    });

    it('Contribute the Max routes a high earner\'s catch-up to Roth in the field notes (SECURE 2.0)', () => {
      // DEFAULT birthYear1 puts Spouse 1 under 50, so pin an age 52 via
      // birthYear override (planYear defaults to TAX_YEAR, so this is
      // exact); $200k salary crosses the $150k wage threshold.
      const birthYear52 = TAX_YEAR - 52;
      renderSettings('savings', {
        inputs: { ...DEFAULT_INPUTS, spouse2Enabled: false, autoMaxContribution1: 'max', birthYear1: birthYear52, salary1: 200000 },
      });
      expect(screen.getByText(/catch-up goes to Roth below because SECURE 2.0 requires it/)).toBeInTheDocument();
      expect(screen.getByText(/directing this person’s \$8,000 catch-up here as Roth/)).toBeInTheDocument();
    });

    it('suppresses the manual-field over-limit warnings for a Contribute-the-Max spouse (stale disabled figures)', () => {
      renderSettings('savings', {
        inputs: { ...DEFAULT_INPUTS, spouse2Enabled: false, autoMaxContribution1: 'max', preTaxContribution1: 99000, hsaContribution: 50000 },
      });
      expect(screen.queryByText(/exceeds the 2026 IRS elective deferral limit/)).not.toBeInTheDocument();
      expect(screen.queryByText(/exceeds the 2026 IRS HSA contribution limit/)).not.toBeInTheDocument();
    });

    it('shows the 415(c) annual-additions warning in the Contribution Advisor when deferral + match breach it', () => {
      renderSettings('savings', {
        inputs: { ...DEFAULT_INPUTS, spouse2Enabled: false, preTaxContribution1: 24500, employerMatchMode1: 'flat', employerMatch1: 60000 },
      });
      expect(screen.getByText(/exceeds the \$72,000 overall §415\(c\) annual-additions limit/)).toBeInTheDocument();
    });

    // Moved to the Optimizers tab in IA Phase 3 -- it's an optimizer, and it
    // had been sitting ~800 lines below the fold on a data-entry page. Its
    // replacement coverage lives in StrategyTab.test.jsx; this asserts it is
    // no longer duplicated back here.
    it('no longer renders the Pre-Tax vs. Roth Split Optimizer (moved to Optimizers)', () => {
      renderSettings('savings');
      expect(screen.queryByText('Pre-Tax vs. Roth Contribution Split Optimizer')).not.toBeInTheDocument();
    });

    it('Concentrated Stock Position section (Basic Parameters, not Initial Balances) reveals its sub-fields once already on (data-driven)', async () => {
      const user = userEvent.setup();
      renderSettings('income', { inputs: { concentratedStockEnabled: true } });
      // This CollapsibleHeader lives among the other Equity Compensation /
      // Roth Conversion sections on Basic Parameters (SettingsTab.jsx's
      // default sub-tab) -- not Initial Balances, despite being about a
      // balance.
      // showConcentratedStock's lazy useState initializer reads
      // inputs.concentratedStockEnabled directly, so the section is already
      // open on mount here; only click if it isn't.
      if (!screen.queryByLabelText('Current Value ($)')) {
        await user.click(screen.getByText('Concentrated Stock Position'));
      }
      expect(screen.getByLabelText('Current Value ($)')).toBeInTheDocument();
    });

    it('Concentrated Stock Position toggle is off by default, and clicking it calls updateInput', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('income', { updateInput });
      await user.click(screen.getByText('Concentrated Stock Position'));
      expect(screen.queryByLabelText('Current Value ($)')).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('Track a Concentrated Stock Position'));
      expect(updateInput).toHaveBeenCalledWith('concentratedStockEnabled', true);
    });

    it('Concentrated Stock link dropdown only lists Taxable-tagged holdings, not Pre-Tax/Roth/HSA ones', async () => {
      const user = userEvent.setup();
      renderSettings('income', {
        inputs: { concentratedStockEnabled: true },
        holdings: [
          createHolding({ id: 'h1', symbol: 'GOOG', taxTreatment: 'taxable', shares: 10, currentPrice: 100 }),
          createHolding({ id: 'h2', symbol: 'VTI', taxTreatment: 'preTax', shares: 10, currentPrice: 100 }),
          createHolding({ id: 'h3', symbol: 'AAPL', taxTreatment: 'roth', shares: 10, currentPrice: 100 }),
        ],
      });
      if (!screen.queryByLabelText('Link to a Holding (optional)')) {
        await user.click(screen.getByText('Concentrated Stock Position'));
      }
      const select = screen.getByLabelText('Link to a Holding (optional)');
      expect(within(select).getByText(/GOOG/)).toBeInTheDocument();
      expect(within(select).queryByText(/VTI/)).not.toBeInTheDocument();
      expect(within(select).queryByText(/AAPL/)).not.toBeInTheDocument();
    });

    it('selecting a holding from the link dropdown sets both concentratedStockHoldingId and concentratedStockSource', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      const holding = createHolding({ symbol: 'GOOG', taxTreatment: 'taxable', shares: 10, currentPrice: 100 });
      renderSettings('income', {
        updateInput,
        inputs: { concentratedStockEnabled: true },
        holdings: [holding],
      });
      if (!screen.queryByLabelText('Link to a Holding (optional)')) {
        await user.click(screen.getByText('Concentrated Stock Position'));
      }
      await user.selectOptions(screen.getByLabelText('Link to a Holding (optional)'), holding.id);
      expect(updateInput).toHaveBeenCalledWith('concentratedStockHoldingId', holding.id);
      expect(updateInput).toHaveBeenCalledWith('concentratedStockSource', 'holdings');
    });

    it('disables Label/Current Value/Cost Basis % once linked, and shows the "now track this holding" note', async () => {
      const user = userEvent.setup();
      renderSettings('income', {
        inputs: { concentratedStockEnabled: true, concentratedStockSource: 'holdings', concentratedStockHoldingId: 'h1' },
        holdings: [createHolding({ id: 'h1', symbol: 'GOOG', taxTreatment: 'taxable', shares: 10, currentPrice: 100 })],
      });
      if (!screen.queryByLabelText('Current Value ($)')) {
        await user.click(screen.getByText('Concentrated Stock Position'));
      }
      expect(screen.getByLabelText('Label (optional)')).toBeDisabled();
      expect(screen.getByLabelText('Current Value ($)')).toBeDisabled();
      expect(screen.getByLabelText(/Cost Basis \(%\)/)).toBeDisabled();
      expect(screen.getByText(/now track this holding automatically/)).toBeInTheDocument();
      // Forward-looking assumptions never get disabled by the link.
      expect(screen.getByLabelText('Growth Rate (%/yr)')).not.toBeDisabled();
      expect(screen.getByLabelText(/Diversify \(%\/yr\)/)).not.toBeDisabled();
    });

    it('picking "Manual Entry" while linked unlinks both concentratedStockSource and concentratedStockHoldingId', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('income', {
        updateInput,
        inputs: { concentratedStockEnabled: true, concentratedStockSource: 'holdings', concentratedStockHoldingId: 'h1' },
        holdings: [createHolding({ id: 'h1', symbol: 'GOOG', taxTreatment: 'taxable', shares: 10, currentPrice: 100 })],
      });
      if (!screen.queryByLabelText('Link to a Holding (optional)')) {
        await user.click(screen.getByText('Concentrated Stock Position'));
      }
      await user.selectOptions(screen.getByLabelText('Link to a Holding (optional)'), '');
      expect(updateInput).toHaveBeenCalledWith('concentratedStockSource', 'manual');
      expect(updateInput).toHaveBeenCalledWith('concentratedStockHoldingId', null);
    });

    it('shows a hint instead of the dropdown options when there are no Taxable-tagged holdings', async () => {
      const user = userEvent.setup();
      renderSettings('income', { inputs: { concentratedStockEnabled: true }, holdings: [] });
      if (!screen.queryByLabelText('Link to a Holding (optional)')) {
        await user.click(screen.getByText('Concentrated Stock Position'));
      }
      expect(screen.getByText(/No Taxable-tagged holdings in Detailed Holdings yet/)).toBeInTheDocument();
    });

    it('vest routing toggle is off by default and clicking it calls updateInput with the position-1 key', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('income', { updateInput, inputs: { concentratedStockEnabled: true } });
      if (!screen.queryByText('Route New Vests Into This Position')) {
        await user.click(screen.getByText('Concentrated Stock Position'));
      }
      // Off by default: the cover/hold fields stay hidden.
      expect(screen.queryByLabelText(/Sold to Cover Taxes/)).not.toBeInTheDocument();
      // The label text sits inside a Tooltip (a focusable role="button"
      // span), which blocks jsdom's label->control click forwarding --
      // click the switch input itself, as a real pointer on the switch would.
      fireEvent.click(document.getElementById('toggle-concentratedStockVestRouting'));
      expect(updateInput).toHaveBeenCalledWith('concentratedStockVestRoutingEnabled', true);
    });

    it('vest routing fields write the position-1 keys, and "Whose Vests" only appears with a second spouse', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('income', {
        updateInput,
        inputs: { concentratedStockEnabled: true, concentratedStockVestRoutingEnabled: true, spouse2Enabled: false },
      });
      if (!screen.queryByLabelText(/Sold to Cover Taxes/)) {
        await user.click(screen.getByText('Concentrated Stock Position'));
      }
      fireEvent.change(screen.getByLabelText(/Sold to Cover Taxes/), { target: { value: '30' } });
      expect(updateInput).toHaveBeenCalledWith('concentratedStockVestCoverPct', 30);
      fireEvent.change(screen.getByLabelText(/Of the Rest, % You Hold/), { target: { value: '50' } });
      expect(updateInput).toHaveBeenCalledWith('concentratedStockVestHoldPct', 50);
      // Single-spouse plan: no spouse selector to render.
      expect(screen.queryByLabelText(/Whose Vests/)).not.toBeInTheDocument();
    });

    it('"Whose Vests" renders for a two-spouse plan and writes concentratedStockVestSpouse', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('income', {
        updateInput,
        inputs: { concentratedStockEnabled: true, concentratedStockVestRoutingEnabled: true, spouse2Enabled: true },
      });
      if (!screen.queryByLabelText(/Whose Vests/)) {
        await user.click(screen.getByText('Concentrated Stock Position'));
      }
      await user.selectOptions(screen.getByLabelText(/Whose Vests/), 'both');
      expect(updateInput).toHaveBeenCalledWith('concentratedStockVestSpouse', 'both');
    });

    it('"Track a Second Position" toggle appears once position 1 is on, and clicking it calls updateInput', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('income', { updateInput, inputs: { concentratedStockEnabled: true } });
      if (!screen.queryByText('Track a Second Position')) {
        await user.click(screen.getByText('Concentrated Stock Position'));
      }
      // Tooltip-wrapped label text doesn't forward clicks in jsdom (see
      // the vest-routing toggle test above) -- click the switch input.
      fireEvent.click(document.getElementById('toggle-concentratedStock2Enabled'));
      expect(updateInput).toHaveBeenCalledWith('concentratedStock2Enabled', true);
    });

    it('second position fields write the concentratedStock2* keys, independent of position 1', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('income', {
        updateInput,
        inputs: { concentratedStockEnabled: true, concentratedStock2Enabled: true },
      });
      if (!screen.queryAllByLabelText('Current Value ($)').length) {
        await user.click(screen.getByText('Concentrated Stock Position'));
      }
      // Both positions render the same labels -- the SECOND match is
      // position 2's field (position 1 renders first).
      const valueFields = screen.getAllByLabelText('Current Value ($)');
      expect(valueFields).toHaveLength(2);
      fireEvent.change(valueFields[1], { target: { value: '250000' } });
      expect(updateInput).toHaveBeenCalledWith('concentratedStock2Init', 250000);
      const labelFields = screen.getAllByLabelText('Label (optional)');
      fireEvent.change(labelFields[1], { target: { value: 'META' } });
      expect(updateInput).toHaveBeenCalledWith('concentratedStock2Label', 'META');
    });

    it('the two positions cannot link the same holding: each dropdown hides the other\'s linked holding', async () => {
      const user = userEvent.setup();
      // createHolding generates its own id -- capture the real ones rather
      // than passing ids it would ignore.
      const goog = createHolding({ symbol: 'GOOG', taxTreatment: 'taxable', shares: 10, currentPrice: 100 });
      const meta = createHolding({ symbol: 'META', taxTreatment: 'taxable', shares: 10, currentPrice: 100 });
      renderSettings('income', {
        inputs: {
          concentratedStockEnabled: true,
          concentratedStock2Enabled: true,
          concentratedStockSource: 'holdings',
          concentratedStockHoldingId: goog.id,
        },
        holdings: [goog, meta],
      });
      if (!screen.queryAllByLabelText('Link to a Holding (optional)').length) {
        await user.click(screen.getByText('Concentrated Stock Position'));
      }
      const dropdowns = screen.getAllByLabelText('Link to a Holding (optional)');
      expect(dropdowns).toHaveLength(2);
      // Position 2's dropdown must not offer GOOG (linked by position 1).
      expect(within(dropdowns[1]).queryByText(/GOOG/)).not.toBeInTheDocument();
      expect(within(dropdowns[1]).getByText(/META/)).toBeInTheDocument();
      // Position 1's own dropdown still shows its linked holding.
      expect(within(dropdowns[0]).getByText(/GOOG/)).toBeInTheDocument();
    });

    it('Employer Match "Add a Second Tier" reveals Tier B fields once already on (data-driven)', async () => {
      // renderWithSimulation's `inputs` override shallow-replaces the whole
      // inputs object rather than merging with DEFAULT_INPUTS (see
      // makeDefaultContextValue), so employerMatchMode1 must be passed
      // explicitly here -- Tier B only renders in 'percent' mode.
      renderSettings('savings', { inputs: { employerMatchMode1: 'percent', employerMatchTierBEnabled1: true } });
      expect(screen.getByText('Tier B: Match Rate (%)')).toBeInTheDocument();
    });

    it('Employer Match Tier B is off by default, and clicking "Add a Second Tier" calls updateInput', async () => {
      const updateInput = vi.fn();
      renderSettings('savings', { updateInput });
      expect(screen.queryByText('Tier B: Match Rate (%)')).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('Add a Second Tier'));
      expect(updateInput).toHaveBeenCalledWith('employerMatchTierBEnabled1', true);
    });

    it('Glide Allocation is disabled while Dynamic Rebalancing is off, and enabled once it is already on (data-driven)', async () => {
      renderSettings('assumptions', { inputs: { rebalancingEnabled: false } });
      expect(screen.getByLabelText('Glide Allocation (reduces stock %)')).toBeDisabled();
    });

    it('clicking Enable Dynamic Asset Allocation calls updateInput', async () => {
      const updateInput = vi.fn();
      renderSettings('assumptions', { updateInput, inputs: { rebalancingEnabled: false } });
      fireEvent.click(screen.getByLabelText('Enable Dynamic Asset Allocation (Stock/Bond Rebalancing)'));
      expect(updateInput).toHaveBeenCalledWith('rebalancingEnabled', true);
    });

    premiumIt('holdings')('renders read-only, linked-status Initial Balances fields when initialBalancesSource is "holdings"', async () => {
      renderSettings('balances', {
        inputs: { initialBalancesSource: 'holdings' },
        bucketTotals: { preTax: 100000, roth: 50000, taxable: 25000, hsa: 5000, total: 180000, unassignedCount: 0, count: 3 },
      });
      expect(screen.getByText(/Linked to Detailed Holdings/)).toBeInTheDocument();
      expect(screen.getByText(/\$180,000/)).toBeInTheDocument();
      expect(document.getElementById('field-preTaxInit')).toBeDisabled();
      expect(document.getElementById('field-rothInit')).toBeDisabled();
      expect(document.getElementById('field-taxableInit')).toBeDisabled();
      expect(document.getElementById('field-hsaInit')).toBeDisabled();
    });

    it('keeps Initial Balances fields editable by default (manual mode), with no linked badge', async () => {
      renderSettings('balances');
      expect(screen.queryByText(/Linked to Detailed Holdings/)).not.toBeInTheDocument();
      expect(document.getElementById('field-preTaxInit')).not.toBeDisabled();
      expect(document.getElementById('field-rothInit')).not.toBeDisabled();
      expect(document.getElementById('field-taxableInit')).not.toBeDisabled();
      expect(document.getElementById('field-hsaInit')).not.toBeDisabled();
    });

    premiumIt('holdings')('clicking Unlink on the linked badge switches initialBalancesSource back to "manual"', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('balances', {
        updateInput,
        inputs: { initialBalancesSource: 'holdings' },
        bucketTotals: { preTax: 100000, roth: 50000, taxable: 25000, hsa: 5000, total: 180000, unassignedCount: 0, count: 3 },
      });
      await user.click(screen.getByText('Unlink'));
      expect(updateInput).toHaveBeenCalledWith('initialBalancesSource', 'manual');
    });

    // initialBalancesSource is deliberately NOT gated on isPremium (see
    // calculator.js's DEFAULT_INPUTS comment) -- these cover what a user
    // actually sees if they link while premium, then premium lapses (JWT
    // expires, or they never had it and are seeing a plan someone else
    // built/shared). renderWithSimulation's entitlement default is
    // isPremium: false, so the three tests above already implicitly cover
    // "never had premium" for the badge/disabled-fields/Unlink mechanics;
    // these add the one thing they didn't check -- the premium-only "Edit
    // in Detailed Holdings" shortcut -- and confirm Unlink (the only way
    // back to manual entry once the tab itself is inaccessible) survives
    // the lapse.
    premiumIt('holdings')('hides "Edit in Detailed Holdings" from the linked badge when not premium, but keeps Unlink available', async () => {
      renderSettings('balances', {
        inputs: { initialBalancesSource: 'holdings' },
        bucketTotals: { preTax: 100000, roth: 50000, taxable: 25000, hsa: 5000, total: 180000, unassignedCount: 0, count: 3 },
      }, { isPremium: false });
      expect(screen.getByText(/Linked to Detailed Holdings/)).toBeInTheDocument();
      expect(screen.queryByText('Edit in Detailed Holdings')).not.toBeInTheDocument();
      expect(screen.getByText('Unlink')).toBeInTheDocument();
    });

    premiumIt('holdings')('shows "Edit in Detailed Holdings" in the linked badge when premium, and it navigates to the Detailed Holdings tab', async () => {
      const user = userEvent.setup();
      const setActiveTab = vi.fn();
      renderSettings('balances', {
        setActiveTab,
        inputs: { initialBalancesSource: 'holdings' },
        bucketTotals: { preTax: 100000, roth: 50000, taxable: 25000, hsa: 5000, total: 180000, unassignedCount: 0, count: 3 },
      }, { isPremium: true });
      // The button is the holdings module's initialBalancesCta mount,
      // loaded on demand -- hence findBy.
      await user.click(await screen.findByText('Edit in Detailed Holdings'));
      expect(setActiveTab).toHaveBeenCalledWith('portfolio');
    });

    premiumIt('holdings')('clicking Unlink still works once premium has lapsed while linked -- the user is never stuck on stale, un-editable holdings totals', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('balances', {
        updateInput,
        inputs: { initialBalancesSource: 'holdings' },
        bucketTotals: { preTax: 100000, roth: 50000, taxable: 25000, hsa: 5000, total: 180000, unassignedCount: 0, count: 3 },
      }, { isPremium: false });
      await user.click(screen.getByText('Unlink'));
      expect(updateInput).toHaveBeenCalledWith('initialBalancesSource', 'manual');
      // Once unlinked, the fields must actually become editable again --
      // not just fire the updateInput call. Render a second, separate
      // instance as manual mode would look post-click (this test's
      // updateInput mock doesn't itself mutate the inputs it was given),
      // scoped to its own container since the first instance is still
      // mounted alongside it.
      const secondRender = renderSettings('balances', { inputs: { initialBalancesSource: 'manual' } }, { isPremium: false });
      expect(secondRender.container.querySelector('#field-preTaxInit')).not.toBeDisabled();
    });
  });

  // Cost basis version of the "Initial Balances -- distinctive logic"
  // block above -- same link/unlink mechanics, but scoped to one field
  // (taxableBasisInit, in Basic Parameters rather than Initial Balances)
  // via the separate taxableBasisSource toggle. Basic Parameters is the
  // default sub-tab, so no nav click is needed to reach it -- but the
  // field itself lives inside the "Special Expenses" CollapsibleHeader
  // section, which defaults open or closed depending on several unrelated
  // flags (see showSpecialExpenses's useState initializer) -- and since a
  // sparse `inputs` override here replaces DEFAULT_INPUTS wholesale rather
  // than merging (see makeDefaultContextValue), those flags can read as
  // `undefined` and flip the default. openSpecialExpensesIfNeeded checks
  // rather than assumes, so these tests don't depend on that override
  // quirk one way or the other.
  const openSpecialExpensesIfNeeded = async (user) => {
    if (!document.getElementById('field-taxableBasisInit')) {
      await user.click(screen.getByText('Withdrawals & Taxable Account'));
    }
  };

  describe('Basic Parameters -- Taxable Cost Basis linking', () => {
    it('renders a read-only, linked-status Known Cost Basis field when taxableBasisSource is "holdings"', async () => {
      const user = userEvent.setup();
      renderSettings('spending', {
        inputs: { taxableBasisSource: 'holdings' },
        taxableCostBasis: 42000,
      });
      await openSpecialExpensesIfNeeded(user);
      expect(screen.getByText(/Linked to Detailed Holdings/)).toBeInTheDocument();
      expect(screen.getByText(/\$42,000/)).toBeInTheDocument();
      expect(document.getElementById('field-taxableBasisInit')).toBeDisabled();
    });

    it('keeps Known Cost Basis editable by default (manual mode), with no linked badge', async () => {
      const user = userEvent.setup();
      renderSettings('spending');
      await openSpecialExpensesIfNeeded(user);
      expect(screen.queryByText(/Linked to Detailed Holdings/)).not.toBeInTheDocument();
      expect(document.getElementById('field-taxableBasisInit')).not.toBeDisabled();
    });

    it('clicking Unlink on the cost-basis badge switches taxableBasisSource back to "manual"', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('spending', {
        updateInput,
        inputs: { taxableBasisSource: 'holdings' },
        taxableCostBasis: 42000,
      });
      await openSpecialExpensesIfNeeded(user);
      await user.click(screen.getByText('Unlink'));
      expect(updateInput).toHaveBeenCalledWith('taxableBasisSource', 'manual');
    });

    it('linking Taxable Cost Basis does not also link Initial Balances -- the two toggles are independent', async () => {
      // Post-regroup these two live on different sub-tabs -- Known Cost Basis
      // under Spending, Initial Balances under Balances & Debt -- so the
      // independence claim has to be checked one tab at a time.
      const ctx = {
        inputs: { taxableBasisSource: 'holdings', initialBalancesSource: 'manual' },
        taxableCostBasis: 42000,
        bucketTotals: { preTax: 0, roth: 0, taxable: 0, hsa: 0, total: 0, unassignedCount: 0, count: 0 },
      };
      const spending = renderSettings('spending', ctx);
      expect(spending.container.querySelector('#field-taxableBasisInit')).toBeDisabled();
      const balances = renderSettings('balances', ctx);
      expect(balances.container.querySelector('#field-preTaxInit')).not.toBeDisabled();
      expect(balances.container.querySelector('#field-taxableInit')).not.toBeDisabled();
    });
  });

  // Stock-allocation version of the same link/unlink mechanics, scoped to
  // stockAllocationPre only (via stockAllocationSource) -- the field lives
  // in the "Initial Balances" sub-tab's Dynamic Asset Allocation &
  // Rebalancing section, not Basic Parameters.
  describe('Initial Balances -- Stock Allocation (Working) linking', () => {
    it('renders a read-only, linked-status Stock Allocation field when stockAllocationSource is "holdings"', async () => {
      renderSettings('assumptions', {
        inputs: { stockAllocationSource: 'holdings', rebalancingEnabled: true },
        assetClassMix: { stockPctOfClassified: 72, classifiedTotal: 1000 },
      });
      expect(screen.getByText(/Linked to Detailed Holdings/)).toBeInTheDocument();
      expect(screen.getByText(/72% stock/)).toBeInTheDocument();
      expect(document.getElementById('field-stockAllocationPre')).toBeDisabled();
    });

    it('keeps Stock Allocation (Working) editable by default (manual mode), with no linked badge', async () => {
      renderSettings('assumptions', { inputs: { rebalancingEnabled: true } });
      expect(screen.queryByText(/Linked to Detailed Holdings/)).not.toBeInTheDocument();
      expect(document.getElementById('field-stockAllocationPre')).not.toBeDisabled();
    });

    it('clicking Unlink switches stockAllocationSource back to "manual"', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('assumptions', {
        updateInput,
        inputs: { stockAllocationSource: 'holdings', rebalancingEnabled: true },
        assetClassMix: { stockPctOfClassified: 72, classifiedTotal: 1000 },
      });
      await user.click(screen.getByText('Unlink'));
      expect(updateInput).toHaveBeenCalledWith('stockAllocationSource', 'manual');
    });

    it('leaves Stock Allocation (Retired) fully manual and editable even while Working is linked', async () => {
      renderSettings('assumptions', {
        inputs: { stockAllocationSource: 'holdings', rebalancingEnabled: true },
        assetClassMix: { stockPctOfClassified: 72, classifiedTotal: 1000 },
      });
      expect(document.getElementById('field-stockAllocationPost')).not.toBeDisabled();
    });

    it('linking Stock Allocation does not also link Taxable Cost Basis -- the toggles are independent', async () => {
      // Same split: Stock Allocation is under Assumptions & Risk, Known Cost
      // Basis is under Spending.
      const ctx = {
        inputs: { stockAllocationSource: 'holdings', taxableBasisSource: 'manual', rebalancingEnabled: true },
        assetClassMix: { stockPctOfClassified: 72, classifiedTotal: 1000 },
      };
      const assumptions = renderSettings('assumptions', ctx);
      expect(assumptions.container.querySelector('#field-stockAllocationPre')).toBeDisabled();
      const spending = renderSettings('spending', ctx);
      expect(spending.container.querySelector('#field-taxableBasisInit')).not.toBeDisabled();
    });
  });

  describe('Milestones & Rules -- CRUD', () => {
    it('shows the empty-state message with no milestones', () => {
      renderSettings('milestones');
      expect(screen.getByText(/No milestones defined/)).toBeInTheDocument();
    });

    it('adds a new milestone via the mini-form', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('milestones', { updateInput });

      await user.type(fieldNear('Milestone Name'), 'New Roof');
      await user.click(screen.getByRole('button', { name: /Add Milestone Event/ }));

      expect(updateInput).toHaveBeenCalledWith('milestones', [
        expect.objectContaining({ name: 'New Roof', type: 'outflow', amount: 50000 }),
      ]);
    });

    it('renders an existing milestone in the chronological timeline', () => {
      renderSettings('milestones', {
        inputs: {
          milestones: [
            { id: 'm1', name: 'Inheritance', type: 'inflow', amount: 100000, isRecurring: false, startAge: 70, endAge: 70, targetAccount: 'taxable', isTaxable: false, inflationCategory: 'General', fundedExternally: false },
          ],
        },
      });
      expect(screen.getByText('Inheritance')).toBeInTheDocument();
      expect(screen.getByText('Age 70')).toBeInTheDocument();
      expect(screen.getByText('+$100,000')).toBeInTheDocument();
    });

    it('deletes an existing milestone', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('milestones', {
        updateInput,
        inputs: {
          milestones: [
            { id: 'm1', name: 'To Delete', type: 'outflow', amount: 5000, isRecurring: false, startAge: 60, endAge: 60, targetAccount: 'auto', isTaxable: false, inflationCategory: 'General', fundedExternally: false },
          ],
        },
      });

      const row = screen.getByText('To Delete').closest('.glass-panel');
      // Named now that the row also carries the shift controls
      // (changelog 219), so this picks the right one of four buttons.
      await user.click(within(row).getByRole('button', { name: 'Delete To Delete' }));

      expect(updateInput).toHaveBeenCalledWith('milestones', []);
    });

    // Changelog 219: move an event in time without retyping it.
    it('shifts a one-off event, keeping its two ages together', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      const m = { id: 'm1', name: 'Roof', type: 'outflow', amount: 90000, isRecurring: false, startAge: 67, endAge: 67, targetAccount: 'auto', isTaxable: false, inflationCategory: 'General', fundedExternally: false };
      renderSettings('milestones', { updateInput, inputs: { milestones: [m] } });

      await user.click(screen.getByRole('button', { name: 'Move Roof five years later' }));
      expect(updateInput).toHaveBeenCalledWith('milestones', [{ ...m, startAge: 72, endAge: 72 }]);

      await user.click(screen.getByRole('button', { name: 'Move Roof one year earlier' }));
      expect(updateInput).toHaveBeenLastCalledWith('milestones', [{ ...m, startAge: 66, endAge: 66 }]);
    });

    it('shifts a recurring event without changing how long it lasts', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      const m = { id: 'm2', name: 'Care', type: 'outflow', amount: 60000, isRecurring: true, startAge: 66, endAge: 70, targetAccount: 'auto', isTaxable: false, inflationCategory: 'General', fundedExternally: false };
      renderSettings('milestones', { updateInput, inputs: { milestones: [m] } });

      await user.click(screen.getByRole('button', { name: 'Move Care one year later' }));
      expect(updateInput).toHaveBeenCalledWith('milestones', [{ ...m, startAge: 67, endAge: 71 }]);
    });

    it('will not walk an event back past age zero', () => {
      const m = { id: 'm3', name: 'Early', type: 'outflow', amount: 1000, isRecurring: false, startAge: 0, endAge: 0, targetAccount: 'auto', isTaxable: false, inflationCategory: 'General', fundedExternally: false };
      renderSettings('milestones', { inputs: { milestones: [m] } });
      expect(screen.getByRole('button', { name: 'Move Early one year earlier' })).toBeDisabled();
    });

    it('reveals the End Age field only when Recurring Range is toggled on', async () => {
      const user = userEvent.setup();
      renderSettings('milestones');

      expect(screen.queryByText('End Age')).not.toBeInTheDocument();
      // "Recurring Range:" is now a real <label htmlFor> paired with the
      // checkbox's id (fixed a11y issue) -- reachable via getByLabelText.
      await user.click(screen.getByLabelText('Recurring Range'));
      expect(screen.getByText('End Age')).toBeInTheDocument();
    });

    it('switches the target-account label based on Flow Type (inflow vs outflow)', async () => {
      const user = userEvent.setup();
      renderSettings('milestones');

      expect(screen.getByText('Withdraw From Account')).toBeInTheDocument();
      await user.selectOptions(fieldNear('Flow Type'), 'inflow');
      expect(screen.getByText('Deposit Target Account')).toBeInTheDocument();
    });

    it('the "funded externally" toggle only appears for outflow milestones (the default type), and hides the target-account field when on', async () => {
      const user = userEvent.setup();
      renderSettings('milestones');

      // newMilestoneType defaults to 'outflow', so this toggle is visible
      // without switching Flow Type first.
      expect(screen.getByLabelText('Already saved for this / funded outside this plan')).toBeInTheDocument();
      expect(screen.getByText('Withdraw From Account')).toBeInTheDocument();

      await user.click(screen.getByLabelText('Already saved for this / funded outside this plan'));
      expect(screen.queryByText('Withdraw From Account')).not.toBeInTheDocument();
    });

    it('the "Taxable as Ordinary Income" toggle only appears for inflow milestones', async () => {
      const user = userEvent.setup();
      renderSettings('milestones');

      expect(screen.queryByLabelText('Taxable as Ordinary Income')).not.toBeInTheDocument();
      await user.selectOptions(fieldNear('Flow Type'), 'inflow');
      expect(screen.getByLabelText('Taxable as Ordinary Income')).toBeInTheDocument();
      // Switching to inflow also removes the outflow-only "funded
      // externally" toggle.
      expect(screen.queryByLabelText('Already saved for this / funded outside this plan')).not.toBeInTheDocument();
    });
  });

  // Added 2026-08-19 alongside the control itself. The calculator has
  // supported this for a long time; there was simply no way to switch it
  // on, so no component test could exist. See the "Retirement return glide"
  // block in calculator.test.js for the engine behavior these controls feed.
  describe('Assumptions & Risk -- retirement return glide', () => {
    const GLIDE_LABEL = 'Get more conservative each year in retirement';

    it('renders the toggle, collapsed, with its two fields hidden until switched on', () => {
      renderSettings('assumptions');
      expect(screen.getByLabelText(GLIDE_LABEL)).not.toBeChecked();
      expect(screen.queryByLabelText('Annual Return Reduction (%)')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Return Floor (%)')).not.toBeInTheDocument();
    });

    it('reveals the rate and floor fields when enabled, seeded from inputs', () => {
      renderSettings('assumptions', {
        // renderWithSimulation's `inputs` override shallow-replaces the
        // whole object rather than merging with DEFAULT_INPUTS (see the
        // note on the Backdoor Roth test above), so everything this block
        // reads is spelled out.
        inputs: { postRetireReturn: 5, equityGlidePathEnabled: true, equityGlidePathRate: 0.4, equityGlidePathFloor: 3 },
      });
      expect(screen.getByLabelText('Annual Return Reduction (%)')).toHaveValue('0.4');
      expect(screen.getByLabelText('Return Floor (%)')).toHaveValue('3');
    });

    it('writes the toggle through to updateInput', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('assumptions', { updateInput });
      await user.click(screen.getByLabelText(GLIDE_LABEL));
      expect(updateInput).toHaveBeenCalledWith('equityGlidePathEnabled', true);
    });

    // The plain-language summary is the whole reason this control is
    // usable -- three numbers interacting over decades is hard to picture,
    // and getting it wrong is invisible in the results.
    it('spells out when the floor is reached, in retirement years', () => {
      renderSettings('assumptions', {
        inputs: { equityGlidePathEnabled: true, postRetireReturn: 5, equityGlidePathRate: 0.5, equityGlidePathFloor: 3 },
      });
      // 5% -> 3% at 0.5%/yr takes 4 steps, and the first retired year is
      // undiscounted, so the floor lands in retirement year 5.
      const summary = screen.getByText(/Your first retired year uses/);
      expect(summary).toHaveTextContent('5%');
      expect(summary).toHaveTextContent('retirement year');
      expect(summary).toHaveTextContent('5');
    });

    it('says so plainly when the settings would have no effect', () => {
      renderSettings('assumptions', {
        inputs: { equityGlidePathEnabled: true, postRetireReturn: 5, equityGlidePathRate: 0.5, equityGlidePathFloor: 6 },
      });
      expect(screen.getByText(/so nothing changes/)).toBeInTheDocument();
    });

    // The control claims Dynamic Asset Allocation supersedes it. The
    // calculator genuinely ignores it in that case (asserted in
    // calculator.test.js), so the UI must not invite input it will drop.
    it('is disabled, with an explanation, while Dynamic Asset Allocation is on', () => {
      renderSettings('assumptions', {
        inputs: { rebalancingEnabled: true, equityGlidePathEnabled: true, postRetireReturn: 5, equityGlidePathRate: 0.5, equityGlidePathFloor: 3 },
      });
      expect(screen.getByLabelText(GLIDE_LABEL)).toBeDisabled();
      expect(screen.getByText(/Unavailable while Dynamic Asset Allocation is on/)).toBeInTheDocument();
      // And its fields stay hidden, so nothing can be typed into a setting
      // the engine will ignore.
      expect(screen.queryByLabelText('Annual Return Reduction (%)')).not.toBeInTheDocument();
    });
  });


  // Added 2026-08-19 with the control. These two were never inert -- they
  // have shaped every Monte Carlo run all along at 15%/8% -- so the tests
  // care most about the two claims the UI makes: that they affect only the
  // Monte Carlo, and that Dynamic Asset Allocation supersedes them.
  describe('Assumptions & Risk -- market volatility', () => {
    it('renders both fields, seeded from inputs', () => {
      renderSettings('assumptions', { inputs: { volatilityPre: 15, volatilityPost: 8 } });
      expect(screen.getByLabelText(/Market Volatility .* Working/)).toHaveValue('15');
      expect(screen.getByLabelText(/Market Volatility .* Retired/)).toHaveValue('8');
    });

    it('writes edits through to updateInput', async () => {
      const user = userEvent.setup();
      const updateInput = vi.fn();
      renderSettings('assumptions', { inputs: { volatilityPre: 15, volatilityPost: 8 }, updateInput });
      await user.clear(screen.getByLabelText(/Market Volatility .* Retired/));
      await user.type(screen.getByLabelText(/Market Volatility .* Retired/), '11');
      expect(updateInput).toHaveBeenCalledWith('volatilityPost', expect.any(Number));
    });

    it('says plainly that it affects only the Monte Carlo', () => {
      renderSettings('assumptions', { inputs: { volatilityPre: 15, volatilityPost: 8 } });
      expect(screen.getByText(/only the Monte Carlo\s+simulation reads these/)).toBeInTheDocument();
    });

    // The one way this control can be misused is talking yourself into a
    // better number by assuming a calmer market. The UI has to say so.
    it('warns that lowering volatility does not make the plan safer', () => {
      renderSettings('assumptions', { inputs: { volatilityPre: 15, volatilityPost: 8 } });
      expect(screen.getByText(/isn.t any safer/)).toBeInTheDocument();
    });

    it('replaces the fields with the derived figures when Dynamic Asset Allocation is on', () => {
      renderSettings('assumptions', {
        inputs: { rebalancingEnabled: true, stockAllocationPre: 80, stockAllocationPost: 60, volatilityPre: 15, volatilityPost: 8 },
      });
      expect(screen.queryByLabelText(/Market Volatility .* Working/)).not.toBeInTheDocument();
      // 80/20 -> 13.8%, 60/40 -> 11.6%, from 16% stock / 5% bond.
      const note = screen.getByText(/Set automatically while Dynamic Asset Allocation is on/);
      expect(note).toHaveTextContent('13.8%');
      expect(note).toHaveTextContent('11.6%');
    });
  });


  describe('Life Events -- lifetime gifting', () => {
    it('is collapsed to a single toggle until switched on', () => {
      renderSettings('milestones');
      expect(screen.getByLabelText('Model a gifting plan')).not.toBeChecked();
      expect(screen.queryByLabelText('Gift Per Person ($/yr)')).not.toBeInTheDocument();
    });

    it('reveals the plan fields when enabled', () => {
      renderSettings('milestones', {
        inputs: { giftingEnabled: true, giftingRecipients: 3, giftingPerRecipient: 19000, giftingStartAge: 70, giftingYears: 10 },
      });
      expect(screen.getByLabelText('How Many People')).toHaveValue('3');
      expect(screen.getByLabelText('Gift Per Person ($/yr)')).toHaveValue('19,000');
    });

    // The distinction the whole feature exists to make visible: gifting is
    // not the same as spending your exemption, and the excess is invisible
    // anywhere else in the app.
    it('says an at-the-exclusion plan uses none of the lifetime exemption', () => {
      renderSettings('milestones', {
        inputs: { giftingEnabled: true, giftingRecipients: 2, giftingPerRecipient: 19000, giftingStartAge: 70, giftingYears: 10, giftingGrowWithInflation: false, inflationRate: 3 },
      });
      expect(screen.getByText(/uses none of your lifetime exemption/i)).toBeInTheDocument();
    });

    it('flags the excess, and what it costs later, when gifts exceed the exclusion', () => {
      renderSettings('milestones', {
        inputs: { giftingEnabled: true, giftingRecipients: 2, giftingPerRecipient: 119000, giftingStartAge: 70, giftingYears: 10, giftingGrowWithInflation: false, inflationRate: 3 },
      });
      expect(screen.getByText(/above the\s+annual exclusion/i)).toBeInTheDocument();
      expect(screen.getByText(/reduces the exemption sheltering/i)).toBeInTheDocument();
    });

    it('offers gift-splitting only when there is a spouse to split with', () => {
      renderSettings('milestones', { inputs: { giftingEnabled: true, spouse2Enabled: false } });
      expect(screen.queryByLabelText(/Split gifts with spouse/)).not.toBeInTheDocument();
    });

    // Silently ignoring the unlimited exclusions would understate what
    // someone can actually give, and the non-citizen spouse case is a real
    // trap rather than an edge case.
    it('names what it does not model, including the non-citizen spouse case', () => {
      renderSettings('milestones', { inputs: { giftingEnabled: true } });
      expect(screen.getByText(/Not modeled here/i)).toBeInTheDocument();
      expect(screen.getByText(/isn.t a US citizen/i)).toBeInTheDocument();
    });
  });


  describe('Household -- Married Filing Separately', () => {
    it('offers MFS alongside the other two statuses', () => {
      renderSettings('household');
      const select = screen.getByLabelText('Filing Status');
      expect([...select.options].map((o) => o.value)).toEqual(['MFJ', 'MFS', 'Single']);
    });

    // The lived-together question only makes sense for MFS, and it decides
    // three separate rules, so it must not be buried or shown out of context.
    it('reveals the lived-together toggle only when MFS is selected', () => {
      renderSettings('household', { inputs: { filingStatus: 'MFJ' } });
      expect(screen.queryByLabelText(/Lived with your spouse/)).not.toBeInTheDocument();

      renderSettings('household', { inputs: { filingStatus: 'MFS', mfsLivedWithSpouse: true } });
      expect(screen.getByLabelText(/Lived with your spouse/)).toBeInTheDocument();
    });

    it('warns about the $0 Social Security exemption when they lived together', () => {
      renderSettings('household', { inputs: { filingStatus: 'MFS', mfsLivedWithSpouse: true } });
      expect(screen.getByText(/expensive combination/i)).toBeInTheDocument();
      expect(screen.getByText(/\$0 exempt amount/)).toBeInTheDocument();
    });

    it('says the harsh rules do not apply when they lived apart all year', () => {
      renderSettings('household', { inputs: { filingStatus: 'MFS', mfsLivedWithSpouse: false } });
      expect(screen.queryByText(/expensive combination/i)).not.toBeInTheDocument();
      expect(screen.getByText(/treated as a single filer/i)).toBeInTheDocument();
    });
  });

});

// Changelog 243: the Medicare employer-plan setting lives with the other
// health costs, not inside the collapsed Roth Conversion section where John
// could not find it.
describe('Medicare while still on an employer plan — where it lives', () => {
  const couple = { ...DEFAULT_INPUTS, spouse2Enabled: true, spouse1Name: 'Partner A', spouse2Name: 'Partner B' };

  it('sits under Spending, right after Healthcare Bridge Cost', () => {
    renderSettings('spending', { inputs: { ...couple, medicareEmployerCoverage2: 'spouse' } });
    const box = screen.getByTestId('medicare-employer-coverage');
    const bridge = document.getElementById('field-healthcareBridgeCost');
    expect(bridge).toBeTruthy();
    // Document order: the bridge field comes first, the Medicare box next.
    expect(bridge.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.getElementById('field-medicareEmployerCoverage2').value).toBe('spouse');
    expect(box.textContent).toMatch(/Delay: covered through Partner A.s job/);
  });

  it('opens Special Expenses by itself once the setting is in use', () => {
    // A plain plan leaves the section closed ...
    renderSettings('spending', { inputs: couple });
    expect(screen.queryByTestId('medicare-employer-coverage')).toBeNull();
    cleanup();
    // ... and a plan using the setting opens it, so the choice is visible.
    renderSettings('spending', { inputs: { ...couple, medicareEmployerCoverage2: 'spouse' } });
    expect(screen.getByTestId('medicare-employer-coverage')).toBeTruthy();
  });

  it('is no longer inside Taxes & Roth', () => {
    renderSettings('taxes', { inputs: couple });
    expect(screen.queryByTestId('medicare-employer-coverage')).toBeNull();
  });
});
