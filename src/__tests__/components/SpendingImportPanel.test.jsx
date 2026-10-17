// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SpendingImportPanel from '../../components/SpendingImportPanel';
import { DEFAULT_INPUTS } from '../../calculator';
import { renderWithSimulation } from '../testUtils.jsx';
import { loadBuiltFactory, premiumIt, hasBuiltChunk } from '../premiumTestHelpers.jsx';

// Rung 4 (changelog 140). The parser has its own unit tests; these cover the
// review gate -- that nothing is committed without a press, that the things
// the parser inferred are visible, and that a re-import spares hand-entered
// lines.
//
// The host panel (SpendingImportPanel) owns the heading, the categories
// prompt and the locked card; the import itself is the Premium module's
// `spendingImport` mount, taken from the Premium repo's built chunk
// (fixtures/spending.built.js) and rendered here with a hand-built host.
const fmt = (n) => `$${Math.round(n).toLocaleString()}`;

const CSV = [
  'Transaction Date,Description,Amount',
  '2026-01-05,SAFEWAY #123,-84.21',
  '2026-01-06,SHELL OIL,-45.00',
  '2026-01-07,PAYMENT THANK YOU,500.00',
  '2026-04-04,RENT PAYMENT LLC,-1800.00',
].join('\n');

const makeInputs = (over = {}) => ({
  ...DEFAULT_INPUTS,
  lifestyleExpenseInputMode: 'categories',
  spendingBlueprint: { lines: [], essentialCategoryIds: [], unlinkedFields: [] },
  ...over,
});

// The paid body, as the module ships it.
let SpendingImport;
beforeAll(async () => { if (hasBuiltChunk('spending')) SpendingImport = (await loadBuiltFactory('spending'))().mounts.spendingImport; });
const setup = (over = {}) => {
  const updateInput = vi.fn();
  render(<SpendingImport host={{ inputs: makeInputs(over), updateInput, formatCurrency: fmt }} />);
  return { updateInput };
};

// The host panel, inside the real providers (no module loader installed,
// so a Premium user would see the mount's fallback -- these cases never
// get that far).
const setupHost = (over = {}, premium = false) => {
  renderWithSimulation(<SpendingImportPanel inputs={makeInputs(over)} setActiveTab={vi.fn()} />, {}, { isPremium: premium, portfolioPreview: false });
};

const uploadCsv = async (text = CSV) => {
  const input = screen.getByLabelText('Choose a transactions CSV');
  const file = new File([text], 'tx.csv', { type: 'text/csv' });
  // jsdom's File.text() is not always present in older envs; make it explicit.
  file.text = () => Promise.resolve(text);
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText(/Read/)).toBeInTheDocument());
};

describe('SpendingImportPanel', () => {
  it('asks for categories mode before offering an import', () => {
    setupHost({ lifestyleExpenseInputMode: 'annual' }, true);
    expect(screen.getByText(/Switch to categories above first/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Choose a transactions CSV')).toBeNull();
  });

  it('explains the feature to a free user without offering the upload', () => {
    setupHost();
    expect(screen.getByText(/Re-importing later replaces what it added before/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Choose a transactions CSV')).toBeNull();
  });

  premiumIt('spending')('shows what it inferred: count, sign convention, and the span', async () => {
    setup();
    await uploadCsv();
    // A user has to be able to check the parser read the file their way.
    expect(screen.getByText(/negative amounts/)).toBeInTheDocument();
    expect(screen.getByText(/90 days/)).toBeInTheDocument();
  });

  premiumIt('spending')('marks a card payment as a transfer and leaves it out by default', async () => {
    setup();
    await uploadCsv();
    expect(screen.getByText(/looks like a transfer/)).toBeInTheDocument();
    expect(screen.getByLabelText('Include PAYMENT THANK YOU')).not.toBeChecked();
    expect(screen.getByLabelText('Include SAFEWAY #123')).toBeChecked();
  });

  premiumIt('spending')('commits nothing until the button is pressed', async () => {
    const { updateInput } = setup();
    await uploadCsv();
    expect(updateInput).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Add these to my ledger/i }));
    expect(updateInput).toHaveBeenCalledTimes(1);
    expect(updateInput.mock.calls[0][0]).toBe('spendingBlueprint');
  });

  premiumIt('spending')('keeps hand-entered lines and replaces a previous import', async () => {
    const { updateInput } = setup({
      spendingBlueprint: {
        lines: [
          { id: 'm1', categoryId: 'insurance', amount: 3000, source: 'manual' },
          { id: 'old', categoryId: 'food', amount: 1, source: 'import' },
        ],
        essentialCategoryIds: [], unlinkedFields: [],
      },
    });
    await uploadCsv();
    fireEvent.click(screen.getByRole('button', { name: /Add these to my ledger/i }));
    const written = updateInput.mock.calls[0][1];
    const ids = written.lines.map((l) => l.id);
    expect(ids).toContain('m1');
    expect(ids).not.toContain('old');
    expect(written.lines.some((l) => l.source === 'import')).toBe(true);
  });

  premiumIt('spending')('lets the user re-categorise a guess before committing', async () => {
    const { updateInput } = setup();
    await uploadCsv();
    fireEvent.change(screen.getByLabelText('Category for RENT PAYMENT LLC'), { target: { value: 'housing' } });
    fireEvent.click(screen.getByRole('button', { name: /Add these to my ledger/i }));
    const written = updateInput.mock.calls[0][1];
    expect(written.lines.find((l) => l.categoryId === 'housing')).toBeTruthy();
  });

  premiumIt('spending')('warns when a short window is being extrapolated a long way', async () => {
    const short = [
      'Date,Description,Amount',
      '2026-01-05,SAFEWAY,-84.21',
      '2026-01-20,SHELL,-45.00',
    ].join('\n');
    setup();
    await uploadCsv(short);
    expect(screen.getByText(/large extrapolation/)).toBeInTheDocument();
  });

  premiumIt('spending')('reports a file it cannot use instead of failing silently', async () => {
    setup();
    const input = screen.getByLabelText('Choose a transactions CSV');
    const bad = new File(['nothing,useful'], 'x.csv', { type: 'text/csv' });
    bad.text = () => Promise.resolve('nothing,useful');
    fireEvent.change(input, { target: { files: [bad] } });
    await waitFor(() => expect(screen.getByText(/no rows under its header|Could not find/i)).toBeInTheDocument());
  });
});
