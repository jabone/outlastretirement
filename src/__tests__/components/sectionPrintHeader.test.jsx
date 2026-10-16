// @vitest-environment jsdom
// The Life Plan and the estate checklist print with the same header as the
// report -- the lockup, the page's title and the date, repeated on every
// printed page (changelog 325). They print in place rather than from a
// hidden sheet, so the frame has to be invisible on screen.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import LifePlanTab from '../../components/tabs/LifePlanTab.jsx';
import EstateChecklist from '../../components/EstateChecklist.jsx';
import { renderWithSimulation } from '../testUtils.jsx';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = readFileSync(join(SRC, 'index.css'), 'utf8');

afterEach(() => localStorage.clear());

function frameOf(root) {
  const frame = root.querySelector(':scope > table.print-frame');
  expect(frame, 'the page is wrapped in the print frame').not.toBeNull();
  return frame;
}

describe('section print header', () => {
  it('the Life Plan is framed, titled and dated for print', () => {
    const { container } = renderWithSimulation(<LifePlanTab />);
    const frame = frameOf(container.querySelector('.life-plan-root'));
    expect(frame.classList.contains('print-frame--inline')).toBe(true);
    expect(frame.getAttribute('role')).toBe('presentation');
    expect(frame.querySelector('thead h2').textContent).toBe('Life Plan');
    expect(frame.querySelector('thead').textContent).toMatch(/Generated: /);
    // The page itself sits inside the frame, so it is what the header sits over.
    expect(frame.querySelector('tbody').textContent).toMatch(/What Will You Do\?/);
  });

  it('the estate checklist is framed, titled and dated for print', () => {
    const { container } = renderWithSimulation(<EstateChecklist />);
    const frame = frameOf(container.querySelector('.estate-checklist-root'));
    expect(frame.classList.contains('print-frame--inline')).toBe(true);
    expect(frame.querySelector('thead h2').textContent).toBe('Estate Documents Checklist');
    expect(frame.querySelector('tbody').textContent).toMatch(/Estate Documents Checklist/);
  });

  it('on screen the frame is see-through and its header hidden; in print it is a table again', () => {
    const screenRules = css.slice(css.indexOf('/* The inline frame'), css.indexOf('@media print', css.indexOf('/* The inline frame')));
    expect(screenRules).toMatch(/\.print-frame--inline > tbody > tr > td \{\s*display: contents;/);
    expect(screenRules).toMatch(/\.print-frame--inline > thead,\s*\.print-frame--inline > tfoot \{\s*display: none;/);
    const printRules = css.slice(css.indexOf('@media print', css.indexOf('/* The inline frame')));
    expect(printRules).toMatch(/\.print-frame--inline \{ display: table !important; \}/);
    expect(printRules).toMatch(/\.print-frame--inline > thead \{ display: table-header-group !important; \}/);
  });

  it('the sub-tab row stays off the paper, so the header starts page one', () => {
    expect(css).toMatch(/@media print \{\s*\.sub-tab-container \{ display: none !important; \}/);
  });

  it('nothing above the frame takes room on page one: the folded headline cards are off the paper', () => {
    expect(css).toMatch(/@media print \{\s*\.sub-tab-container \{ display: none !important; \}[\s\S]*?\.main-content > \.kpi-grid \{ display: none !important; \}/);
  });

  it('the checklist does not repeat its title under the printed header', () => {
    const src = readFileSync(join(SRC, 'components', 'EstateChecklist.jsx'), 'utf8');
    expect(src).toMatch(/<h3 className="no-print"[^>]*>Estate Documents Checklist<\/h3>/);
  });

  it('the attorney note prints under the intro, not alone at the end', () => {
    const { container } = renderWithSimulation(<EstateChecklist />);
    const note = container.querySelector('[data-testid="estate-print-note"]');
    expect(note.className).toBe('print-only');
    expect(note.textContent).toMatch(/questions for an estate attorney/);
    const endNote = [...container.querySelectorAll('p.no-print')].find((p) => /questions for an estate attorney/.test(p.textContent));
    expect(endNote).toBeTruthy();
    expect(css).toMatch(/\.estate-checklist-root \.print-only \{ display: none; \}/);
    expect(css).toMatch(/\.main-content > \.kpi-grid \{ display: none !important; \}\s*\.estate-checklist-root \.print-only \{ display: block !important; \}/);
  });

  it('nothing follows the frame on paper, so no blank last page', () => {
    expect(css).toMatch(/\.life-plan-root,\s*\.estate-checklist-root \{ margin-bottom: 0 !important; \}/);
    // The later rule must come after the one that gives them 14pt.
    expect(css.lastIndexOf('.estate-checklist-root { margin-bottom: 0 !important; }')).toBeGreaterThan(css.indexOf('margin: 0 0 14pt 0 !important;'));
  });

  it('on paper the main column steps aside, so no blank page follows (changelog 331)', () => {
    expect(css).toMatch(/body\[data-print-section="lifeplan"\] \.main-content,\s*body\[data-print-section="estate"\] \.main-content,\s*body\[data-print-section="lifeplan"\] \.tab-panel,\s*body\[data-print-section="estate"\] \.tab-panel \{ display: contents !important; \}/);
  });
});
