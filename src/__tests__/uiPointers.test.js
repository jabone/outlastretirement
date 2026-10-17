// UI pointers resolve (changelog 264).
//
// The app tells people where a setting lives: "turn on X under Plan ->
// Taxes & Roth". Changelog 260 found one of those pointing at a control
// inside a collapsible section that is closed unless something else is
// on -- the setting existed, the pointer was "right", and nobody could
// find it. This test re-derives, from the source, what a pointer can
// legitimately name and checks every runtime pointer against it:
//
//   1. The first segment after "Plan ->" is one of Plan Settings' sub-tab
//      labels (or one of the other tabs' sub-tabs for "Tax & Estate ->",
//      "Optimizers ->").
//   2. Every later segment is a heading, a collapsible-section title, or a
//      control label that the Plan sections actually render.
//   3. A segment that is a control INSIDE a folded-by-default section must
//      be preceded by that section's fold title, so the pointer says what
//      to open. (The fold titles are the CollapsibleHeader titles of the
//      sections whose open state starts from `forceOpen || <condition>`,
//      or, since changelog 270, from useFoldState.)
//   4. Nobody says "Settings ->" or "Plan Settings ->" any more: the
//      sidebar entry is Plan (changelog 252).
//
// Runtime pointers are the ones a user meets while using the app --
// action plan, ledger badges, review steps, section notes, checklists.
// The Guide, the Input Dictionary and the changelog are prose about the
// app and are checked more loosely elsewhere.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&rarr;/g, '→').replace(/->/g, '→').replace(/&rsquo;/g, '’').replace(/\s+/g, ' ').trim();

// ---- What renders ---------------------------------------------------------
const sectionFiles = readdirSync(join(SRC, 'components/plan/sections')).filter((f) => f.endsWith('.jsx'));
const sectionSrc = Object.fromEntries(sectionFiles.map((f) => [f, read('components/plan/sections/' + f)]));

const subTabsOf = (file) => [...read(file).matchAll(/className=\{`sub-tab-button[^`]*`\}[^\n]*?>([^<>\n]+)<\/button>/g)].map((m) => decode(m[1]));
const PLAN_SUB_TABS = subTabsOf('components/tabs/SettingsTab.jsx');
const OTHER_TABS = {
  'Tax & Estate': subTabsOf('components/tabs/TaxEstateTab.jsx'),
  'Optimizers': subTabsOf('components/tabs/StrategyTab.jsx'),
  'Risk & Stress': subTabsOf('components/tabs/RiskTab.jsx'),
};

// Labels a section renders: h3/h4 text, CollapsibleHeader titles, <label>
// text and <strong>…:</strong> switch labels. Literal text only; a label
// built from an expression cannot be named by a pointer anyway.
function labelsIn(src) {
  const out = new Set();
  const grab = (re, i = 1) => { for (const m of src.matchAll(re)) out.add(decode(m[i])); };
  grab(/<h[34][^>]*>\s*([^<{]+?)\s*<\/h[34]>/g);
  grab(/<h[34][^>]*>\s*<span[^>]*>([^<{]+?)<\/span>\s*<\/h[34]>/g);
  grab(/title="([^"]+)"/g);
  grab(/<label[^>]*>\s*([^<{]+?)\s*<\/label>/g);
  grab(/<strong>([^<{]+?):?<\/strong>/g);
  grab(/<label[^>]*>\s*<Tooltip[^>]*>\s*([^<{]+?)\s*<\/Tooltip>/g);
  return out;
}
const SETTINGS_SHELL_LABELS = labelsIn(read('components/tabs/SettingsTab.jsx'));
const ALL_SECTION_LABELS = new Set([...SETTINGS_SHELL_LABELS]);
const FOLDS = {}; // fold title -> labels inside that section
for (const src of Object.values(sectionSrc)) {
  const labels = labelsIn(src);
  labels.forEach((l) => ALL_SECTION_LABELS.add(l));
  const folded = /useState\(\(\) => forceOpen \|\||useFoldState\(/.test(src);
  const title = (src.match(/<CollapsibleHeader\s+title="([^"]+)"/) || src.match(/<CollapsibleHeader[\s\S]*?title="([^"]+)"/) || [])[1];
  if (folded && title) FOLDS[decode(title)] = labels;
}
const CONTROL_IN_FOLD = new Map();
for (const [title, labels] of Object.entries(FOLDS)) labels.forEach((l) => { if (l !== title) CONTROL_IN_FOLD.set(l, title); });

// ---- What the app says ----------------------------------------------------
const RUNTIME_FILES = [
  'utils/actionPlan.js', 'utils/annualReview.js', 'utils/planFeedback.js', 'config/estateChecklist.js',
  'components/tabs/YearLedgerTab.jsx', 'components/tabs/ReadinessTab.jsx', 'components/tabs/DashboardTab.jsx',
  'components/plan/AnnualReviewPanel.jsx',
  ...sectionFiles.map((f) => 'components/plan/sections/' + f),
].filter((f) => { try { readFileSync(join(SRC, f)); return true; } catch { return false; } });

// A pointer: "<Tab> → seg → seg", stopping at sentence punctuation or a
// closing quote/paren. Comments are stripped first so a pointer in a
// code comment is not held to a user-facing standard.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const POINTER_RE = /\b(Plan Settings|Plan|Settings|Tax & Estate|Optimizers|Risk & Stress) → ([^.;"'`\n]+)/g;
function pointersIn(file) {
  // Entities and arrow spellings are normalized first so "&amp;" is not a
  // sentence end and "->" reads as an arrow.
  const src = stripComments(read(file)).replace(/&amp;/g, '&').replace(/&rarr;/g, '→').replace(/->/g, '→');
  const found = [];
  for (const m of src.matchAll(POINTER_RE)) {
    const head = decode(m[1]);
    // Segments; a trailing ") to model it" style tail stops at the first
    // unmatched close paren.
    let rest = m[2];
    let depth = 0; let cut = rest.length;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '(') depth++;
      else if (rest[i] === ')') { if (depth === 0) { cut = i; break; } depth--; }
    }
    rest = rest.slice(0, cut);
    const segs = decode(rest).split('→').map((s) => s.trim()).filter(Boolean)
      // "Household shows the resulting …" -- keep the label, drop prose.
      // "Household shows the resulting …" -- keep the label, drop prose; a
      // parenthetical that starts lowercase is an aside, not part of a name.
      .map((s) => s.replace(/\s*\((?=[a-z])[\s\S]*$/, '').replace(/\s+(--|—|is|are|to|shows|can|and|for|so|rather|beneath|below|the)\b[\s\S]*$/, '').trim());
    found.push({ file, head, segs, text: m[0] });
  }
  return found;
}
const POINTERS = RUNTIME_FILES.flatMap(pointersIn);

describe('UI pointers resolve to something on screen', () => {
  it('found the labels and the pointers it is about to judge', () => {
    expect(PLAN_SUB_TABS).toContain('Taxes & Roth');
    expect(Object.keys(FOLDS)).toContain('Roth Conversion Optimization');
    expect(CONTROL_IN_FOLD.get('ACA Subsidy Protection')).toBe('Roth Conversion Optimization');
    expect(ALL_SECTION_LABELS.has('Medicare Premiums (IRMAA)')).toBe(true);
    expect(POINTERS.length).toBeGreaterThanOrEqual(6);
  });

  it('nobody says Settings -> or Plan Settings -> any more; the sidebar entry is Plan', () => {
    const stale = POINTERS.filter((p) => p.head === 'Settings' || p.head === 'Plan Settings');
    expect(stale.map((p) => `${p.file}: ${p.text}`)).toEqual([]);
  });

  it('every Plan -> pointer names a sub-tab, then labels that render, and names the fold around a folded control', () => {
    const problems = [];
    for (const p of POINTERS.filter((x) => x.head === 'Plan')) {
      const [sub, ...rest] = p.segs;
      if (!PLAN_SUB_TABS.includes(sub)) { problems.push(`${p.file}: "${p.text}" -- "${sub}" is not a Plan sub-tab (${PLAN_SUB_TABS.join(', ')})`); continue; }
      rest.forEach((seg, i) => {
        if (!ALL_SECTION_LABELS.has(seg)) problems.push(`${p.file}: "${p.text}" -- nothing on the Plan renders the label "${seg}"`);
        const fold = CONTROL_IN_FOLD.get(seg);
        if (fold && !rest.slice(0, i).includes(fold)) problems.push(`${p.file}: "${p.text}" -- "${seg}" sits inside the folded "${fold}" section; name the fold`);
      });
    }
    expect(problems).toEqual([]);
  });

  it('pointers into the other tabs name a real sub-tab', () => {
    const problems = [];
    for (const p of POINTERS.filter((x) => OTHER_TABS[x.head])) {
      const [sub] = p.segs;
      if (!OTHER_TABS[p.head].includes(sub)) problems.push(`${p.file}: "${p.text}" -- "${sub}" is not a ${p.head} sub-tab (${OTHER_TABS[p.head].join(', ')})`);
    }
    expect(problems).toEqual([]);
  });
});
