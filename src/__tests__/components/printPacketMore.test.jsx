// @vitest-environment jsdom
// One print dialog, everywhere (changelog 332): the estate checklist and the
// Life Plan are pages of the planner packet, and every "Print / PDF Report"
// button opens the same dialog instead of printing the report at once.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_CHOICES } from '../../components/printPacketChoices';
import LifePlanPacketSheet from '../../components/LifePlanPacketSheet';
import EstateChecklistPacketSheet from '../../components/EstateChecklistPacketSheet';
import { CHECKLIST_ITEM_COUNT } from '../../config/estateChecklist';
import { buildDemoEstateChecklist } from '../../config/demoPlan';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(SRC, p), 'utf8');

afterEach(() => localStorage.clear());

describe('planner packet: estate checklist and Life Plan pages', () => {
  it('are offered, unticked by default', () => {
    expect(DEFAULT_CHOICES.estate).toBe(false);
    expect(DEFAULT_CHOICES.lifeplan).toBe(false);
    const src = read('components/PrintPacket.jsx');
    expect(src).toMatch(/printing\.estate && <EstateChecklistPacketSheet showTitle=/);
    expect(src).toMatch(/printing\.lifeplan && <LifePlanPacketSheet showTitle=/);
  });

  it('the estate page ticks done items with their date and leaves the rest blank', () => {
    render(<EstateChecklistPacketSheet state={{ 'ben-primary': { done: true, completedAt: '2026-09-01' } }} />);
    const sheet = screen.getByTestId('estate-packet-sheet');
    expect(sheet.textContent).toMatch(new RegExp(`1 of ${CHECKLIST_ITEM_COUNT} reviewed`));
    expect(sheet.querySelectorAll('.review-box--done')).toHaveLength(1);
    expect(sheet.querySelectorAll('.review-box')).toHaveLength(CHECKLIST_ITEM_COUNT);
    expect(sheet.textContent).toMatch(/2026-09-01/);
  });

  it('the Life Plan page prints answers as written and ruled lines for the rest', () => {
    render(<LifePlanPacketSheet lifePlan={{ ordinaryTuesday: { text: 'Gym at 7.', updatedAt: '2026-09-20', history: [] } }} />);
    const sheet = screen.getByTestId('life-plan-packet-sheet');
    expect(sheet.textContent).toMatch(/What does an ordinary Tuesday look like\?Gym at 7\.Written 2026-09-20/);
    expect(sheet.querySelectorAll('.packet-write-lines').length).toBeGreaterThan(3);
  });
});

describe('every Print / PDF Report button opens the dialog', () => {
  for (const f of ['components/tabs/ReadinessTab.jsx', 'components/ActionPlanCard.jsx', 'components/layout/Sidebar.jsx']) {
    it(f, () => {
      const src = read(f);
      expect(src).toMatch(/window\.dispatchEvent\(new Event\(PRINT_PACKET_EVENT\)\)/);
      expect(src).not.toMatch(/window\.print\(\)/);
      expect(src).toMatch(/Print \/ PDF Report/);
    });
  }
});

describe('the demo checklist', () => {
  it('stores its dates where the checklist reads them, so they show on screen and on paper', () => {
    for (const entry of Object.values(buildDemoEstateChecklist())) {
      expect(entry.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('no repeated title when the checklist prints alone', () => {
  it('drops its own heading when the page header already names it', () => {
    render(<EstateChecklistPacketSheet state={{}} showTitle={false} />);
    expect(screen.getByTestId('estate-packet-sheet').querySelector('h1')).toBeNull();
  });
});

