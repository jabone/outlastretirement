// @vitest-environment jsdom
//
// InterviewTab.jsx after IA Phase 3 step 2 (2026-09-24): the 15-step guided
// walkthrough that MOUNTS the Plan section components at guided density
// rather than carrying fields of its own. So what this file tests is the
// framing -- navigation and progress, the gates, the Review page, the
// estate editor (changelog 258) -- plus the two things that make the new shape hold:
//
//   1. Every step really mounts the section it says it does (a
//      characteristic Plan Settings field id is present on each step), and
//      editing a field there writes through updateInput exactly as it does
//      on Plan Settings. The fields themselves are covered by
//      SettingsTab.test.jsx; there is nothing Interview-specific left to
//      test about them.
//   2. Guided density: fields outside src/config/guidedCore.js are folded
//      (class guided-hidden) until "More options (n)" is pressed, and a
//      block with no id'd control is never folded.
//
// And one source-level guard: the Interview writes no plan field itself.
// A `updateInput(` call reappearing in InterviewTab.jsx is the duplication
// this whole phase removed, so the test fails on the first one.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import InterviewTab from '../../components/tabs/InterviewTab';
import { renderWithSimulation } from '../testUtils';
import { DEFAULT_INPUTS } from '../../calculator';
import { isGuidedCore, GUIDED_CORE_KEYS } from '../../config/guidedCore';

const here = dirname(fileURLToPath(import.meta.url));

beforeEach(() => {
  localStorage.clear();
});

function clickToggle(labelText) {
  const label = screen.getByText(labelText);
  const checkbox = label.parentElement.parentElement.querySelector('input[type="checkbox"]');
  fireEvent.click(checkbox);
}

const field = (id) => document.getElementById(id);

describe('InterviewTab — writes no plan field of its own', () => {
  it('InterviewTab.jsx contains no updateInput call', () => {
    const src = readFileSync(resolve(here, '../../components/tabs/InterviewTab.jsx'), 'utf-8');
    expect(src.match(/updateInput\(/g) || []).toEqual([]);
    // And it does mount the shared sections rather than something else.
    expect(src).toMatch(/from '\.\.\/plan\/sections\/DemographicsSection'/);
    expect(src).toMatch(/GuidedSection/);
  });

  it('the core list is a real, spouse-agnostic list', () => {
    expect(GUIDED_CORE_KEYS.size).toBeGreaterThan(100);
    for (const k of GUIDED_CORE_KEYS) expect(k, k).not.toMatch(/[12]$/);
    expect(isGuidedCore('birthYear1')).toBe(true);
    expect(isGuidedCore('sex2')).toBe(false);
  });
});

describe('InterviewTab — navigation and progress', () => {
  it('starts on the Household section with no saved progress, and shows all 15 section rail buttons', () => {
    renderWithSimulation(<InterviewTab />);
    expect(screen.getByText('Household & Identity')).toBeInTheDocument();
    [
      'Household', 'Income & SS', 'Pensions & Other Income', 'Account Balances', 'Savings & Match',
      'Spending', 'Healthcare & LTC', 'Withdrawal Strategy', 'Roth & Medicare', 'Employer Equity',
      'Life Events', 'Debt, Home & Insurance', 'Estate & Heirs', 'Taxes & Assumptions', 'Review',
    ].forEach(label => expect(screen.getByText(label)).toBeInTheDocument());
  });

  it('clicking a rail button jumps straight to that section', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<InterviewTab />);
    await user.click(screen.getByText('Account Balances'));
    expect(screen.getByText('Current Account Balances')).toBeInTheDocument();
  });

  it('Back is disabled on the first section; Next advances one section at a time', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<InterviewTab />);
    expect(screen.getByRole('button', { name: /Back/ })).toBeDisabled();
    await user.click(screen.getByText(/Next: Income & SS/));
    expect(screen.getByRole('heading', { level: 2, name: 'Income' })).toBeInTheDocument();
  });

  it('the last section shows Finish (not Next), which lands on Retirement Readiness (changelog 254)', async () => {
    const user = userEvent.setup({ delay: null });
    const setActiveTab = vi.fn();
    renderWithSimulation(<InterviewTab />, { setActiveTab });
    await user.click(screen.getByText('Review'));
    expect(screen.queryByText(/^Next:/)).not.toBeInTheDocument();
    await user.click(screen.getByText('Finish'));
    expect(setActiveTab).toHaveBeenCalledWith('readiness');
    await user.click(screen.getByText('See My Dashboard'));
    expect(setActiveTab).toHaveBeenCalledWith('dashboard');
  });

  it('the visited-section counter increases as new sections are opened', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<InterviewTab />);
    expect(screen.getByText('1 / 15 sections visited')).toBeInTheDocument();
    await user.click(screen.getByText('Spending'));
    expect(screen.getByText('2 / 15 sections visited')).toBeInTheDocument();
  });

  it('resumes on the last-visited section after the component remounts', async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = renderWithSimulation(<InterviewTab />);
    await user.click(screen.getByText('Account Balances'));
    unmount();
    renderWithSimulation(<InterviewTab />);
    expect(screen.getByText('Current Account Balances')).toBeInTheDocument();
  });
});

describe('InterviewTab — every step mounts the Plan section it names', () => {
  // step rail label -> a field id that only that section renders, and the
  // gate to open first when the section sits behind one.
  const STEPS = [
    { rail: 'Household', id: 'field-birthYear1' },
    { rail: 'Income & SS', id: 'field-salary1' },
    { rail: 'Pensions & Other Income', id: 'field-pension1', gate: /expect a pension, an annuity, or rental income/ },
    { rail: 'Account Balances', id: 'field-preTaxInit' },
    { rail: 'Savings & Match', id: 'field-preTaxContribution1' },
    { rail: 'Spending', id: 'field-lifestyleExpense' },
    { rail: 'Healthcare & LTC', id: 'field-healthcareBridgeCost' },
    { rail: 'Withdrawal Strategy', id: 'field-withdrawalStrategy' },
    { rail: 'Roth & Medicare', id: 'field-rothConversionStrategy', gate: /model Roth conversions/ },
    { rail: 'Debt, Home & Insurance', id: 'field-mortgageBalance', gate: /mortgage, other debt, a home you own/ },
    { rail: 'Taxes & Assumptions', id: 'field-preRetireReturn' },
  ];

  it.each(STEPS)('$rail shows $id', async ({ rail, id, gate }) => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<InterviewTab />);
    await user.click(screen.getByText(rail));
    if (gate) {
      expect(field(id)).toBeNull();
      clickToggle(screen.getByText(gate).textContent);
    }
    expect(field(id), `${id} on ${rail}`).not.toBeNull();
  });

  it('a field edited on the Interview writes through updateInput exactly like Plan Settings', () => {
    const updateInput = vi.fn();
    renderWithSimulation(<InterviewTab />, { updateInput });
    fireEvent.change(field('field-birthYear1'), { target: { value: '1970' } });
    expect(updateInput).toHaveBeenCalledWith('birthYear1', 1970);
  });

  it('the spouse toggle still sets filingStatus with spouse2Enabled (the Demographics section does it)', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    renderWithSimulation(<InterviewTab />, { updateInput });
    await user.click(screen.getByText('Planning with a spouse or partner?'));
    expect(updateInput).toHaveBeenCalledWith('spouse2Enabled', true);
  });

  it('Employer Equity mounts all three equity sections, open, behind one gate', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<InterviewTab />);
    await user.click(screen.getByText('Employer Equity'));
    clickToggle(screen.getByText(/stock grants, deferred compensation/).textContent);
    expect(screen.getByText('Add Grant')).toBeInTheDocument();
    expect(field('toggle-nqdcEnabled1') || screen.queryByText(/Non-Qualified Deferred Compensation/)).toBeTruthy();
    expect(field('toggle-concentratedStockEnabled') || screen.queryByText(/Concentrated Stock/)).toBeTruthy();
  });

  it('Life Events mounts the same milestone page as Plan Settings, with the shift controls', async () => {
    const user = userEvent.setup({ delay: null });
    const inputs = { ...DEFAULT_INPUTS, milestones: [{ id: 'm1', name: 'New roof', type: 'outflow', amount: 30000, isRecurring: false, startAge: 66, endAge: 66, targetAccount: 'auto', isTaxable: false, inflationCategory: 'General', fundedExternally: false }] };
    renderWithSimulation(<InterviewTab />, { inputs });
    await user.click(screen.getByText('Life Events'));
    // Gate opens by itself because a milestone exists.
    expect(screen.getByText('New roof')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move New roof one year later' })).toBeInTheDocument();
  });

  it('Estate & Heirs mounts the heir editor (changelog 258): adding an heir writes inputs.heirs', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    const setActiveTab = vi.fn();
    const setTaxestateSubTab = vi.fn();
    renderWithSimulation(<InterviewTab />, { updateInput, setActiveTab, setTaxestateSubTab });
    await user.click(screen.getByText('Estate & Heirs'));
    expect(screen.getByText('Beneficiary Settings')).toBeInTheDocument();
    await user.click(screen.getByText('+ Add Heir'));
    expect(updateInput).toHaveBeenCalledTimes(1);
    const [key, heirs] = updateInput.mock.calls[0];
    expect(key).toBe('heirs');
    expect(heirs).toHaveLength(2);
    expect(heirs[1]).toMatchObject({ id: 2, name: 'Heir 2', splitPct: 0 });
    // The tax result still lives on Tax & Estate; the step links there.
    await user.click(screen.getByText(/See the Estate Legacy Planner/));
    expect(setActiveTab).toHaveBeenCalledWith('taxestate');
    expect(setTaxestateSubTab).toHaveBeenCalledWith('estate');
  });

  it('Estate & Heirs shows every heir the plan names', async () => {
    const user = userEvent.setup({ delay: null });
    const inputs = { ...DEFAULT_INPUTS, heirs: [
      { id: 1, name: 'Ada', filingStatus: 'Single', income: 100000, splitPct: 50 },
      { id: 2, name: 'Ben', filingStatus: 'Single', income: 100000, splitPct: 50 },
    ] };
    renderWithSimulation(<InterviewTab />, { inputs });
    await user.click(screen.getByText('Estate & Heirs'));
    expect(screen.getByDisplayValue('Ada')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ben')).toBeInTheDocument();
    expect(screen.queryByText('Heirs live on the Tax & Estate page')).toBeNull();
  });
});

describe('InterviewTab — gates', () => {
  it('a gate is closed by default and opens by itself when the plan already has something inside it', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<InterviewTab />);
    await user.click(screen.getByText('Pensions & Other Income'));
    expect(field('field-pension1')).toBeNull();
    // Now with a pension in the plan.
    localStorage.clear();
    renderWithSimulation(<InterviewTab />, { inputs: { ...DEFAULT_INPUTS, pension1: 20000 } });
    await user.click(screen.getAllByText('Pensions & Other Income')[1]);
    expect(field('field-pension1')).not.toBeNull();
  });
});

describe('InterviewTab — guided density (GuidedSection)', () => {
  it('folds fields outside the core list and offers More options with a count', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<InterviewTab />);
    // Household: birth year is core, Sex is not.
    const core = field('field-birthYear1').closest('.form-group');
    const advanced = field('field-sex1').closest('.form-group');
    expect(core.classList.contains('guided-hidden')).toBe(false);
    expect(advanced.classList.contains('guided-advanced')).toBe(true);
    expect(advanced.classList.contains('guided-hidden')).toBe(true);
    const more = screen.getByRole('button', { name: /More options \(\d+\)/ });
    await user.click(more);
    expect(advanced.classList.contains('guided-hidden')).toBe(false);
    expect(screen.getByRole('button', { name: 'Fewer options' })).toBeInTheDocument();
  });

  it('the fold count is the number of advanced blocks on the step', () => {
    renderWithSimulation(<InterviewTab />);
    const n = document.querySelectorAll('.guided-section .guided-advanced').length;
    expect(n).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: `More options (${n})` })).toBeInTheDocument();
  });

  it('a block with no id’d control is never folded', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<InterviewTab />);
    await user.click(screen.getByText('Account Balances'));
    // Bucket shares is a read-only panel with no field ids: visible.
    const hiddenWithoutIds = [...document.querySelectorAll('.guided-hidden')]
      .filter((g) => g.querySelectorAll('[id^="field-"], [id^="toggle-"]').length === 0);
    expect(hiddenWithoutIds).toEqual([]);
  });

  it('the fold classes are recomputed after a re-render (a core toggle revealing advanced fields)', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<InterviewTab />, { inputs: { ...DEFAULT_INPUTS, spouse2Enabled: true } });
    // Spouse fields rendered on mount: sex2 is advanced and folded too.
    expect(field('field-sex2').closest('.form-group').classList.contains('guided-hidden')).toBe(true);
    await user.click(screen.getByRole('button', { name: /More options/ }));
    expect(field('field-sex2').closest('.form-group').classList.contains('guided-hidden')).toBe(false);
  });
});

describe('InterviewTab — Review section', () => {
  it('totals household income, current balances, and target spending from inputs', async () => {
    const user = userEvent.setup({ delay: null });
    const inputs = { ...DEFAULT_INPUTS, salary1: 100000, spouse2Enabled: false, preTaxInit: 200000, rothInit: 50000, taxableInit: 30000, lifestyleExpense: 60000 };
    renderWithSimulation(<InterviewTab />, { inputs });
    await user.click(screen.getByText('Review'));
    expect(within(screen.getByText('Household Income').closest('div')).getByText('$100,000')).toBeInTheDocument();
    expect(within(screen.getByText('Current Balances').closest('div')).getByText('$280,000')).toBeInTheDocument();
    expect(within(screen.getByText('Target Spending').closest('div')).getByText('$60,000')).toBeInTheDocument();
  });

  it('clicking a not-yet-visited section in the Review list jumps to that section', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<InterviewTab />);
    await user.click(screen.getByText('Review'));
    expect(screen.getAllByText('Not yet visited').length).toBeGreaterThan(0);
    const sectionsList = screen.getByText('Sections Covered').nextElementSibling;
    await user.click(within(sectionsList).getByText('Employer Equity'));
    expect(screen.getByText('Employer Equity Compensation')).toBeInTheDocument();
  });

  it('lists what the walkthrough folded away, grouped by Plan Settings page', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<InterviewTab />);
    await user.click(screen.getByText('Review'));
    expect(screen.getByText('What this walkthrough folded away')).toBeInTheDocument();
    expect(screen.getAllByText(/^Plan Settings → /).length).toBeGreaterThan(3);
  });
});

describe('Estate & Heirs — equal split (changelog 259)', () => {
  it('equal mode shows each heir’s share as a read-out and the switch writes heirSplitMode', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    const inputs = { ...DEFAULT_INPUTS, heirSplitMode: 'equal', heirs: [
      { id: 1, name: 'Ada', filingStatus: 'Single', income: 100000, splitPct: 33 },
      { id: 2, name: 'Ben', filingStatus: 'Single', income: 100000, splitPct: 33 },
      { id: 3, name: 'Cy', filingStatus: 'Single', income: 100000, splitPct: 33 },
    ] };
    renderWithSimulation(<InterviewTab />, { inputs, updateInput });
    await user.click(screen.getByText('Estate & Heirs'));
    expect(screen.getByText('Equal shares: 1/3 (33.3%) each')).toBeInTheDocument();
    expect(screen.queryByText(/Split total/)).toBeNull();
    expect(document.getElementById('heir-split-1').tagName).toBe('DIV');
    await user.click(screen.getByText('Split the estate equally among heirs'));
    expect(updateInput).toHaveBeenCalledWith('heirSplitMode', 'custom');
  });

  it('custom mode keeps the per-heir Split % fields and the running total', async () => {
    const user = userEvent.setup({ delay: null });
    const inputs = { ...DEFAULT_INPUTS, heirSplitMode: 'custom', heirs: [
      { id: 1, name: 'Ada', filingStatus: 'Single', income: 100000, splitPct: 33 },
      { id: 2, name: 'Ben', filingStatus: 'Single', income: 100000, splitPct: 33 },
      { id: 3, name: 'Cy', filingStatus: 'Single', income: 100000, splitPct: 33 },
    ] };
    renderWithSimulation(<InterviewTab />, { inputs });
    await user.click(screen.getByText('Estate & Heirs'));
    expect(screen.getByText(/Split total: 99%/)).toBeInTheDocument();
    expect(document.getElementById('heir-split-1').tagName).toBe('INPUT');
  });
});

describe('Roth & Medicare — the Medicare block is outside the Roth gate (changelog 260)', () => {
  it('the SSA-44 switch is reachable with the Roth gate closed, and writes irmaaLifeChangeAppealEnabled', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    renderWithSimulation(<InterviewTab />, { updateInput });
    await user.click(screen.getByText('Roth & Medicare'));
    expect(field('field-rothConversionStrategy')).toBeNull();
    expect(screen.getByText('Medicare Premiums (IRMAA)')).toBeInTheDocument();
    await user.click(field('toggle-irmaaLifeChangeAppeal'));
    expect(updateInput).toHaveBeenCalledWith('irmaaLifeChangeAppealEnabled', true);
  });
});
