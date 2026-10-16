// @vitest-environment jsdom
// The print dialog and planner packet (changelog 298).
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import PrintPacket, { PRINT_PACKET_EVENT } from '../../components/PrintPacket';
import { planDetailsModel, formatSetting } from '../../components/planDetailsModel';
import { maskNames, heirLabel } from '../../utils/printNames';
import { DEFAULT_INPUTS } from '../../calculator';
import { FIELD_INDEX } from '../../config/fieldIndex';

afterEach(cleanup);
beforeEach(() => { localStorage.clear(); delete document.body.dataset.printSection; delete document.body.dataset.printReport; });

const fc = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
const inputs = {
  ...DEFAULT_INPUTS, spouse1Name: 'Partner A', spouse2Enabled: true, spouse2Name: 'Partner B',
  heirs: [{ id: 1, name: 'Child 1', splitPct: 50, relationship: 'child', income: 80000, filingStatus: 'Single' },
    { id: 2, name: 'Child 2', splitPct: 50, relationship: 'child', income: 60000, filingStatus: 'Single' }],
  milestones: [{ id: 'm1', name: 'New roof', type: 'outflow', amount: 25000, isRecurring: false, startAge: 66 }],
  withdrawalStrategy: 'ProRata', lifestyleThreePhaseEnabled: true, goGoMultiplier: 1.2,
};
const open = () => act(() => { window.dispatchEvent(new Event(PRINT_PACKET_EVENT)); });
// Printing waits up to a second for the header logo (changelog 333); jsdom
// never loads images, so the tests wait out that timeout.
const frame = () => act(() => new Promise((r) => setTimeout(r, 1100)));

describe('planDetailsModel', () => {
  const groups = planDetailsModel(inputs, { formatCurrency: fc });
  const all = groups.flatMap((g) => g.rows);
  it('groups settings the way the Plan page is, in its order', () => {
    const ids = groups.map((g) => g.id);
    expect(ids[0]).toBe('household');
    expect(ids.indexOf('income')).toBeLessThan(ids.indexOf('assumptions'));
  });
  it('shows a dropdown by its label, a stored fraction as a percent, and dollars as currency', () => {
    expect(all.find((r) => r.key === 'withdrawalStrategy').value).toBe('Pro-Rata Proportional Draws');
    expect(all.find((r) => r.key === 'goGoMultiplier').value).toBe('120%');
    const money = all.find((r) => /\(\$/.test(r.label) && r.value.startsWith('$'));
    expect(money).toBeTruthy();
  });
  it('leaves out names, empty values, and fields inside a feature switched off', () => {
    expect(all.some((r) => r.key === 'spouse1Name')).toBe(false);
    expect(all.every((r) => r.value !== '$0' && r.value !== '0' && r.value !== 'Off')).toBe(true);
    const off = planDetailsModel({ ...inputs, lifestyleThreePhaseEnabled: false }, { formatCurrency: fc }).flatMap((g) => g.rows);
    expect(off.some((r) => r.key === 'goGoMultiplier')).toBe(false);
  });
  it('keeps core settings, lists changed ones, and hides untouched defaults of unused features', () => {
    const core = all.find((r) => r.key === 'retireAge1');
    expect(core).toBeTruthy();
    const plain = planDetailsModel({ ...DEFAULT_INPUTS, spouse2Enabled: true }, { formatCurrency: fc }).flatMap((g) => g.rows);
    const changed = planDetailsModel({ ...DEFAULT_INPUTS, spouse2Enabled: true, survivorStressAge: 70 }, { formatCurrency: fc }).flatMap((g) => g.rows);
    const nonCoreDefault = plain.filter((r) => !/Spouse|Age|Year|Salary|Balance/.test(r.label));
    expect(changed.length).toBeGreaterThanOrEqual(plain.length);
    expect(nonCoreDefault.every((r) => r.key !== 'survivorStressAge')).toBe(true);
  });

  it('prints years and ages without a thousands comma', () => {
    const e = FIELD_INDEX.find((x) => x.key === 'birthYear1');
    expect(formatSetting(e, 1980, fc)).toBe('1980');
  });

  it('drops Spouse 2 fields for a single-person plan', () => {
    const single = planDetailsModel({ ...inputs, spouse2Enabled: false }, { formatCurrency: fc }).flatMap((g) => g.rows);
    expect(single.some((r) => /\(Spouse 2\)$/.test(r.label))).toBe(false);
  });
  it('formats the stored value of an unknown dropdown readably', () => {
    const e = FIELD_INDEX.find((x) => x.key === 'withdrawalStrategy');
    expect(formatSetting({ ...e, options: undefined }, 'TaxableFirst', fc)).toBe('Taxable First');
  });
});

describe('plan details from a real printout (changelog 300)', () => {
  it('leaves Roth conversion details out when no conversions are planned, and prints a bracket as a percent', () => {
    const none = planDetailsModel({ ...inputs, rothConversionStrategy: 'none', rothConversionBracket: 0.1 }, { formatCurrency: fc }).flatMap((g) => g.rows);
    expect(none.some((r) => r.key === 'rothConversionBracket')).toBe(false);
    const e = FIELD_INDEX.find((x) => x.key === 'rothConversionBracket');
    expect(formatSetting({ ...e, options: undefined }, 0.1, fc)).toBe('10%');
  });
  it('capitalizes a lowercase stored word', () => {
    const e = FIELD_INDEX.find((x) => x.key === 'sex1');
    expect(formatSetting({ ...e, options: undefined }, 'male', fc)).toBe('Male');
  });
});

describe('print sizes and paper-only rules', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../../index.css'), 'utf8');
  it('prints at the normal scale even with Large Text on', () => {
    const printBlocks = css.split('@media print').slice(1).join('');
    expect(printBlocks).toMatch(/\.large-text \{\s*--fs-2xs: 10px;\s*--fs-xs: 11px;\s*--fs-sm: 12px;\s*--fs-body: 13px;/);
    expect(printBlocks).toMatch(/\.large-text \.section-print h2 \{ font-size: 11\.5pt !important; \}/);
    expect(printBlocks).toMatch(/\.large-text \.print-section h3 \{ font-size: 15px !important; \}/);
  });
  it('keeps the report header cards on one page', () => {
    expect(css).toMatch(/\.print-report-header,\s*\.print-metric-grid \{\s*break-inside: avoid;/);
  });
  it('the life plan and estate checklist print only themselves', () => {
    const read = (rel) => fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');
    expect(read('components/tabs/LifePlanTab.jsx')).toMatch(/printSection\('lifeplan'\)/);
    expect(read('components/EstateChecklist.jsx')).toMatch(/printSection\('estate'\)/);
  });
});

describe('the printed page header (changelog 301)', () => {
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');
  it('wraps the report, the packet and the spending sheet in the repeating header', () => {
    const frame = read('components/PrintFrame.jsx');
    expect(frame).toMatch(/<thead>[\s\S]*<PrintHeader/);
    const app = read('App.jsx');
    const report = app.slice(app.indexOf('<div className="print-report-container">'));
    expect(report.indexOf('<PrintFrame')).toBeGreaterThan(-1);
    expect(report.indexOf('<PrintFrame')).toBeLessThan(report.indexOf('print-metric-grid'));
    expect(read('components/PrintPacket.jsx')).toMatch(/<PrintFrame title=\{packetTitle\(printing\)\}>/);
    expect(read('components/SpendingReviewSheet.jsx')).toMatch(/<PrintFrame title="Spending Review">/);
  });
  it('repeats the header on every page and keeps the open page off the paper', () => {
    const css = read('index.css');
    expect(css).toMatch(/\.print-frame > thead \{ display: table-header-group; \}/);
    // ...and a footer row that keeps rows clear of the fixed disclaimer.
    expect(css).toMatch(/\.print-frame > tfoot \{ display: table-footer-group; \}/);
    expect(css).toMatch(/\.print-frame-footer-space \{ height: 52px; \}/);
    expect(css).not.toMatch(/padding: 20px 20px 60px 20px/);
    expect(read('components/PrintFrame.jsx')).toMatch(/<tfoot>[\s\S]*print-frame-footer-space/);
    expect(css).toMatch(/body:not\(\[data-print-section="lifeplan"\]\):not\(\[data-print-section="estate"\]\) \.main-content \{\s*display: none !important;/);
    expect(css).toMatch(/body\[data-print-report\] \.section-print \{\s*break-before: page;/);
  });
  it('renders the header with the title and date inside the packet', async () => {
    render(<PrintPacket inputs={inputs} formatCurrency={fc} print={vi.fn()} />);
    await open();
    fireEvent.click(screen.getByTestId('print-choice-questions'));
    fireEvent.click(screen.getByTestId('print-packet-go'));
    await frame();
    const sheet = screen.getByTestId('print-packet-sheet');
    expect(sheet.querySelector('.print-frame thead .print-report-header').textContent).toMatch(/For Your Planner\s*Generated:/);
  });
});

describe('name masking', () => {
  it('masks spouses and heirs and nothing else', () => {
    const m = maskNames(inputs);
    expect(m.spouse1Name).toBe('Spouse 1');
    expect(m.spouse2Name).toBe('Spouse 2');
    expect(m.heirs.map((h) => h.name)).toEqual(['Heir 1', 'Heir 2']);
    expect(m.heirs[0].splitPct).toBe(50);
    expect(inputs.spouse1Name).toBe('Partner A');
    expect(heirLabel(inputs.heirs[0], 0, false)).toBe('Child 1');
    expect(heirLabel(inputs.heirs[0], 0, true)).toBe('Heir 1');
  });
});

describe('<PrintPacket />', () => {
  it('opens from the sidebar event with the analysis report ticked by default', async () => {
    render(<PrintPacket inputs={inputs} formatCurrency={fc} print={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await open();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByTestId('print-choice-report').checked).toBe(true);
    expect(screen.getByTestId('print-choice-details').checked).toBe(false);
  });

  it('prints the chosen pages with the report, masks names everywhere, then cleans up', async () => {
    const print = vi.fn(() => {
      expect(document.body.dataset.printSection).toBe('packet');
      expect(document.body.dataset.printReport).toBe('yes');
    });
    const onHide = vi.fn();
    render(<PrintPacket inputs={inputs} formatCurrency={fc} onHideNamesChange={onHide} print={print} />);
    await open();
    for (const id of ['details', 'spending', 'questions', 'hideNames']) fireEvent.click(id === 'hideNames' ? document.getElementById('print-choice-hideNames') : screen.getByTestId(`print-choice-${id}`));
    fireEvent.click(screen.getByTestId('print-packet-go'));
    expect(onHide).toHaveBeenCalledWith(true);
    await frame();
    expect(print).toHaveBeenCalledTimes(1);
    const sheet = screen.getByTestId('print-packet-sheet');
    expect(sheet.textContent).toMatch(/Plan details — Spouse 1 and Spouse 2/);
    expect(sheet.textContent).toMatch(/Heir 1/);
    expect(sheet.textContent).not.toMatch(/Partner A|Partner B|Child 1|Child 2/);
    expect(sheet.textContent).toMatch(/New roof/);
    expect(sheet.textContent).toMatch(/What a planner will also ask for/);
    expect(JSON.parse(localStorage.getItem('retire_plan_print_choices')).details).toBe(true);
    act(() => { window.dispatchEvent(new Event('afterprint')); });
    expect(onHide).toHaveBeenLastCalledWith(false);
    expect(document.body.dataset.printSection).toBeUndefined();
    expect(document.body.dataset.printReport).toBeUndefined();
    expect(screen.queryByTestId('print-packet-sheet')).toBeNull();
  });

  it('will not print with nothing ticked', async () => {
    render(<PrintPacket inputs={inputs} formatCurrency={fc} print={vi.fn()} />);
    await open();
    fireEvent.click(screen.getByTestId('print-choice-report'));
    expect(screen.getByTestId('print-packet-go').disabled).toBe(true);
  });
});

describe('packet print CSS and wiring', () => {
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');
  it('lets the report ride along only when it was chosen', () => {
    const css = read('index.css');
    expect(css).toMatch(/body\[data-print-section\]\[data-print-report\] \.print-report-container \{\s*display: block !important;/);
    expect(css).toMatch(/body\[data-print-section="packet"\] \.section-print\[data-section="packet"\]/);
  });
  it('the sidebar button opens the dialog, and the report masks names through printInputs', () => {
    expect(read('components/layout/Sidebar.jsx')).toMatch(/dispatchEvent\(new Event\(PRINT_PACKET_EVENT\)\)/);
    const app = read('App.jsx');
    const report = app.slice(app.indexOf('<div className="print-report-container">'));
    expect(report).not.toMatch(/inputs\.spouse[12]Name/);
    expect(report).toMatch(/buildActionPlan\(printInputs,/);
    expect(report).toMatch(/heirLabel\(h, idx, printHideNames\)/);
  });
});
