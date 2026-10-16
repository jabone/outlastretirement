// Control vocabulary (changelog 279).
//
// One on/off setting is a switch (SwitchRow / .custom-switch). A bare
// checkbox is for picking several rows out of a list: import rows,
// scenarios to compare, checklist items, essential categories, which
// chart lines to show. One of N options is a <select>, with two named
// exceptions John chose to keep as cards to browse -- the stress-scenario
// cards and the heir-distribution strategies -- because the point of those
// screens is reading the options, not just picking one. This test pins
// the rule from the source so the vocabulary cannot drift.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..');
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : walk(p);
    return p.endsWith('.jsx') ? [p] : [];
  });
}
const FILES = walk(SRC).map((p) => relative(SRC, p).split('\\').join('/'));
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

// Files whose bare checkboxes are list/table multi-selects.
const LIST_CHECKBOX_FILES = new Set([
  'App.jsx',                                   // bracket lines to show; onboarding checklist
  'components/tabs/TaxEstateTab.jsx',          // bracket lines and IRMAA cliffs to show
  'components/tabs/ScenariosTab.jsx',          // scenarios to compare
  'components/EstateChecklist.jsx',            // checklist items
  'components/PrintPacket.jsx',                // pages to include in the printout
  'components/plan/sectionShared.jsx',         // essential categories; ledger columns
  'components/ResidencyTimelinePanel.jsx',     // the state move's own flat-rate options
]);

function bareCheckboxes(src) {
  const lines = src.split('\n');
  const out = [];
  lines.forEach((l, i) => {
    if (!l.includes('type="checkbox"')) return;
    const ctx = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
    if (!ctx.includes('custom-switch')) out.push(i + 1);
  });
  return out;
}

describe('control vocabulary', () => {
  it('found the controls it is about to judge', () => {
    expect(FILES.length).toBeGreaterThan(60);
    expect(FILES).toContain('components/SwitchRow.jsx');
    expect(bareCheckboxes(read('components/tabs/ScenariosTab.jsx')).length).toBeGreaterThan(0);
  });

  it('a single on/off setting is a switch; bare checkboxes live only in list and table pickers', () => {
    const offenders = [];
    for (const f of FILES) {
      if (LIST_CHECKBOX_FILES.has(f)) continue;
      const lines = bareCheckboxes(read(f));
      if (lines.length) offenders.push(`${f}:${lines.join(',')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('no plan section renders a bare checkbox at all', () => {
    const sections = FILES.filter((f) => f.startsWith('components/plan/sections/'));
    expect(sections.length).toBeGreaterThan(20);
    const offenders = sections.filter((f) => bareCheckboxes(read(f)).length);
    expect(offenders).toEqual([]);
  });

  it('SwitchRow ties its label to the input and renders the app switch', () => {
    const src = read('components/SwitchRow.jsx');
    expect(src).toMatch(/<label htmlFor=\{id\}/);
    expect(src).toMatch(/<span className="custom-switch">/);
    expect(src).toMatch(/id=\{id\}\s+type="checkbox"/);
  });

  it('no switch has two labels (a label beside it and a label wrapped round it)', () => {
    // Lighthouse flagged "Overlay Taxes Paid" on 2026-09-28: a
    // <label htmlFor> plus the <label className="custom-switch"> around the
    // same input. The wrapper is a <span> wherever a htmlFor label exists;
    // index.css makes the invisible input cover the track so a click on the
    // switch itself still toggles it.
    const offenders = [];
    for (const f of FILES) {
      const src = read(f);
      for (const m of src.matchAll(/<label className="custom-switch"[^>]*>([\s\S]*?)<\/label>/g)) {
        const id = /\bid=\{([^}]+)\}/.exec(m[1]);
        if (id && src.includes(`htmlFor={${id[1]}}`)) offenders.push(`${f}: ${id[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('click-a-card choices exist only where John kept them: stress scenarios and heir distribution', () => {
    const allowed = { 'components/tabs/RiskTab.jsx': 'stressType', 'components/tabs/DashboardTab.jsx': 'stressType', 'components/plan/sections/EstateHeirsSection.jsx': 'heirDistributionStrategy' };
    const offenders = [];
    for (const f of FILES) {
      const src = read(f);
      for (const m of src.matchAll(/glass-panel-hover[\s\S]{0,600}?onClick=\{\(\) => updateInput\('(\w+)'/g)) {
        if (allowed[f] !== m[1]) offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('NYC and Yonkers are one select, not two exclusive checkboxes', () => {
    const src = read('components/plan/sections/StateTaxesSection.jsx');
    expect(src).toContain('id="field-nyLocality"');
    expect(src).not.toContain('toggle-nycResident');
    expect(src).not.toContain('toggle-yonkersResident');
    expect(src).toMatch(/updateInput\('nycResident', e\.target\.value === 'nyc'\)/);
    expect(src).toMatch(/updateInput\('yonkersResident', e\.target\.value === 'yonkers'\)/);
  });

  it('the circled question mark means hover help and nothing else; notes use an open book', () => {
    // Where a circled ? may appear: the help popup itself, and the Help
    // destination (sidebar entry, Guide and Dictionary headers).
    const HELP_MARK_ALLOWED = new Set(['components/Tooltip.jsx', 'components/layout/Sidebar.jsx', 'components/tabs/GuideTab.jsx', 'components/InputReference.jsx']);
    // The circled i is a dialog-kind icon in the modal dialog only; a note
    // box in page copy carries BookOpen, which nobody mistakes for a popup.
    const INFO_ALLOWED = new Set(['components/AppDialog.jsx']);
    const offenders = [];
    for (const f of FILES) {
      const src = read(f);
      if (/<HelpCircle\b|Icon: HelpCircle/.test(src) && !HELP_MARK_ALLOWED.has(f)) offenders.push(`${f}: HelpCircle`);
      if (/<Info\b|Icon: Info\b/.test(src) && !INFO_ALLOWED.has(f)) offenders.push(`${f}: Info`);
    }
    expect(offenders).toEqual([]);
    expect(read('components/plan/sections/RothConversionSection.jsx')).toMatch(/<BookOpen size=\{18\}/);
  });

  it('a control label carries no trailing colon: the switch or select beside it is the punctuation', () => {
    const offenders = [];
    for (const f of FILES) {
      const src = read(f);
      if (/<\/Tooltip>:/.test(src)) offenders.push(`${f}: colon after </Tooltip>`);
      if (/:\s*\n\s*<\/Tooltip>/.test(src)) offenders.push(`${f}: colon inside a Tooltip label`);
      for (const m of src.matchAll(/<label[^>]*>([^<]*):<\/label>/g)) offenders.push(`${f}: "${m[1].trim().slice(0, 40)}:"`);
    }
    expect(offenders).toEqual([]);
  });
});
