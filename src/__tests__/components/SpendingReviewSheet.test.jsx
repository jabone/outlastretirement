// @vitest-environment jsdom
// The spending review sheet and section printing (changelog 297).
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import SpendingReviewSheet from '../../components/SpendingReviewSheet';
import { spendingReviewModel } from '../../components/spendingReviewModel';
import { printSection } from '../../utils/printSection';
import { DEFAULT_INPUTS } from '../../calculator';

afterEach(cleanup);

const ledger = {
  essentialCategoryIds: ['housing', 'food'],
  lines: [
    { id: 'a', categoryId: 'housing', label: 'Property taxes', amount: 7000, cadence: 'annual', dueMonth: 1 },
    { id: 'b', categoryId: 'housing', label: 'Electric', amount: 3600, cadence: 'monthly' },
    { id: 'c', categoryId: 'food', label: 'Groceries', amount: 6000, cadence: 'monthly' },
    { id: 'd', categoryId: 'personal', label: 'Small trip', amount: 6000, cadence: 'semiannual', dueMonth: 1 },
    { id: 'e', categoryId: 'healthBridgePre65', label: 'Health insurance', amount: 9000, cadence: 'monthly' },
  ],
};
const inputs = {
  ...DEFAULT_INPUTS, spouse1Name: 'Partner A', spouse2Enabled: true, spouse2Name: 'Partner B',
  lifestyleExpenseInputMode: 'categories', spendingBlueprint: ledger, lifestyleExpense: 22600,
  lifestyleThreePhaseEnabled: true, mortgagePayment: 24000,
};
const fc = (v) => `$${Math.round(v).toLocaleString('en-US')}`;

describe('spendingReviewModel', () => {
  it('lists each category with its lines, per-payment and yearly amounts, and the essential flag', () => {
    const m = spendingReviewModel(inputs);
    expect(m.fromLedger).toBe(true);
    expect(m.categories.map((c) => c.id)).toEqual(['housing', 'food', 'personal']);
    const housing = m.categories[0];
    expect(housing.essential).toBe(true);
    expect(housing.total).toBe(10600);
    const tax = housing.lines.find((l) => l.label === 'Property taxes');
    expect(tax).toMatchObject({ cadence: 'Once a year', when: 'Jan', perPayment: 7000, perYear: 7000 });
    expect(housing.lines.find((l) => l.label === 'Electric')).toMatchObject({ when: 'Every month', perPayment: 300 });
    expect(m.categories[2].lines[0]).toMatchObject({ cadence: 'Twice a year', perPayment: 3000, perYear: 6000 });
    expect(m.essentialTotal).toBe(16600);
  });

  it('keeps health coverage before 65 out of the categories and shows it on its own', () => {
    const m = spendingReviewModel(inputs);
    expect(m.categories.some((c) => c.id === 'healthBridgePre65')).toBe(false);
    expect(m.bridgeTotal).toBe(9000);
  });

  it('shows the age phases at the amounts the projection uses', () => {
    const m = spendingReviewModel(inputs);
    expect(m.phases.map((p) => p.name)).toEqual(['Go-Go', 'Slow-Go', 'No-Go']);
    // Floor-aware: the essential share stays whole, so No-Go is a smaller cut than 30%.
    expect(m.phases[2].perYear).toBeGreaterThan(22600 * 0.7);
  });

  it('falls back to the single figure when the plan does not use categories', () => {
    const m = spendingReviewModel({ ...inputs, lifestyleExpenseInputMode: 'single' });
    expect(m.fromLedger).toBe(false);
    expect(m.categories).toEqual([]);
    expect(m.total).toBe(22600);
  });
});

describe('<SpendingReviewSheet />', () => {
  it('renders outside the app (in body) with names, lines, tick boxes and what is left out', () => {
    const print = vi.fn();
    render(<div className="app-container"><SpendingReviewSheet inputs={inputs} formatCurrency={fc} print={print} /></div>);
    const sheet = screen.getByTestId('spending-review-sheet');
    expect(sheet.closest('.app-container')).toBeNull();
    expect(sheet.dataset.section).toBe('spending');
    expect(sheet.textContent).toMatch(/Partner A & Partner B/);
    expect(sheet.textContent).toMatch(/Property taxes/);
    expect(sheet.textContent).toMatch(/\$24,000 a year/);
    expect(sheet.querySelectorAll('.review-box').length).toBeGreaterThanOrEqual(5);
  });

  it('opens the print dialog itself and reports back when it closes', async () => {
    const print = vi.fn();
    const onDone = vi.fn();
    render(<SpendingReviewSheet inputs={inputs} formatCurrency={fc} print={print} onDone={onDone} />);
    await new Promise((r) => setTimeout(r, 1100));
    expect(print).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('afterprint'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('printSection', () => {
  it('marks the body for the print and clears it afterwards', () => {
    const print = vi.fn(() => { expect(document.body.dataset.printSection).toBe('spending'); });
    printSection('spending', { print });
    expect(print).toHaveBeenCalled();
    window.dispatchEvent(new Event('afterprint'));
    expect(document.body.dataset.printSection).toBeUndefined();
  });

  it('prints only the sheet: the app and the full report are hidden while a section is marked', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toMatch(/\.section-print \{\s*display: none;/);
    expect(css).toMatch(/body\[data-print-section\]:not\(\[data-print-report\]\)[^{]*\.app-container,\s*body\[data-print-section\]:not\(\[data-print-report\]\) \.print-report-container \{\s*display: none !important;/);
    // The life plan and estate checklist never ride along on someone else's printout.
    expect(css).toMatch(/body\[data-print-section\]:not\(\[data-print-section="lifeplan"\]\) \.life-plan-root,\s*body\[data-print-section\]:not\(\[data-print-section="estate"\]\) \.estate-checklist-root \{\s*display: none !important;/);
    expect(css).toMatch(/body\[data-print-section="spending"\] \.section-print\[data-section="spending"\]/);
  });
});
