// Builds src/config/fieldIndex.js -- every plan field the "Find a setting"
// box can jump to (changelog 290) -- from the Plan section sources:
//
//   * which Plan Settings sub-tab mounts each section (SettingsTab.jsx),
//   * the section's fold (useFoldState id + CollapsibleHeader title),
//   * each control's id (field-<key> / toggle-<key>) and its label text.
//
// Run with `node scripts/generateFieldIndex.mjs` after adding or
// renaming a field; fieldIndex.test.js fails when the committed file is
// stale, the same way the demo fixture does.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'src');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

const SUB_TAB_LABELS = {
  household: 'Household', income: 'Income', savings: 'Savings', balances: 'Balances & Debt', spending: 'Spending',
  taxes: 'Taxes & Roth', assumptions: 'Assumptions & Risk', milestones: 'Life Events', planyear: 'Plan Year & Review',
};

// Section component -> Plan Settings sub-tab, read from SettingsTab.jsx.
function sectionSubTabs() {
  const src = read('components/tabs/SettingsTab.jsx');
  const map = {};
  for (const m of src.matchAll(/\{settingsSubTab === '(\w+)' && \(([\s\S]*?)\n        \)\}/g)) {
    for (const s of m[2].matchAll(/<([A-Z]\w*Section)\b/g)) map[s[1]] = m[1];
  }
  return map;
}
// Section component -> Guided Interview step, read from InterviewTab.jsx's
// renderSection switch, so the finder can land on the right step in Guided.
function sectionSteps() {
  const src = read('components/tabs/InterviewTab.jsx');
  const map = {};
  const parts = src.split(/case '(\w+)': return \(/);
  for (let i = 1; i < parts.length; i += 2) {
    for (const s of parts[i + 1].matchAll(/<([A-Z]\w*Section)\b/g)) if (!map[s[1]]) map[s[1]] = parts[i];
  }
  return map;
}
// Sections mounted elsewhere than Plan Settings.
const OTHER_HOMES = {
  EstateHeirsSection: { tab: 'taxestate', subTab: 'estate', subTabLabel: 'Estate Legacy Planner', tabLabel: 'Tax & Estate' },
};
// Folds that live in SettingsTab.jsx rather than the section file.
const SHELL_FOLDS = {
  RetirementSpendSection: { fold: 'retirementSpend', foldTitle: 'Retirement Spending Target' },
  CurrentSpendSection: { fold: 'currentSpend', foldTitle: 'Current Household Spending (Pre-Retirement)' },
};

const stripBraces = (s) => { let prev; do { prev = s; s = s.replace(/\{[^{}]*\}/g, ' '); } while (s !== prev); return s; };
const decode = (s) => stripBraces(s
  .replace(/<[^>]+>/g, ' '))           // tags, then nested JSX expressions
  .replace(/&amp;/g, '&').replace(/&rsquo;/g, '’').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&rarr;/g, '→')
  .replace(/&frac12;/g, '½').replace(/&sect;/g, '§').replace(/&ldquo;|&rdquo;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/\(\s*\)/g, ' ')            // "( )" left by a stripped name expression
  .replace(/\s+/g, ' ').trim();

// End index (exclusive) of the JSX opening tag that starts at `start`,
// counting braces so a `=>` inside an onChange does not end it early.
function openTagEnd(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return i + 1;
  }
  return -1;
}
// Children of the element whose opening tag contains `id="<id>"`.
function childrenOf(src, tagName, id) {
  const re = new RegExp(`<${tagName}\\b`, 'g');
  let m;
  while ((m = re.exec(src))) {
    const end = openTagEnd(src, m.index);
    if (end < 0) return null;
    const tag = src.slice(m.index, end);
    if (!tag.includes(`id="${id}"`)) continue;
    if (tag.endsWith('/>')) return '';
    const close = src.indexOf(`</${tagName}>`, end);
    return close < 0 ? null : src.slice(end, close);
  }
  return null;
}

// A dropdown's static options, value -> label, so a printed page can show
// "Pro-Rata Proportional Draws" rather than "ProRata" (changelog 298).
// Options built with .map() are not captured; the page falls back to the
// stored value, made readable.
function optionsFor(src, id) {
  const re = /<select\b/g;
  let m;
  while ((m = re.exec(src))) {
    const end = openTagEnd(src, m.index);
    if (end < 0) return null;
    if (!src.slice(m.index, end).includes(`id="${id}"`)) continue;
    const close = src.indexOf('</select>', end);
    const body = close < 0 ? '' : src.slice(end, close);
    const out = {};
    for (const o of body.matchAll(/<option[^>]*value=(?:"([^"]*)"|\{(-?[\d.]+)\})[^>]*>([\s\S]*?)<\/option>/g)) {
      const label = decode(o[3]);
      if (label) out[o[1] ?? o[2]] = label;
    }
    return Object.keys(out).length ? out : null;
  }
  return null;
}

function labelFor(src, id) {
  // <label htmlFor="id" ...>...</label>
  let m = src.match(new RegExp(`<label[^>]*htmlFor="${id}"[^>]*>([\\s\\S]*?)<\\/label>`));
  if (m) { const t = decode(m[1]); if (t) return t; }
  // <SwitchRow id="id" ...>children</SwitchRow>
  const sw = childrenOf(src, 'SwitchRow', id);
  if (sw) { const t = decode(sw); if (t) return t; }
  // <input id="id" .../> inside <label>...</label> with trailing text
  m = src.match(new RegExp(`<label[^>]*>\\s*<input[^>]*\\bid="${id}"[\\s\\S]*?/>([\\s\\S]*?)<\\/label>`));
  if (m) { const t = decode(m[1]); if (t) return t; }
  // aria-label
  m = src.match(new RegExp(`\\bid="${id}"[^>]*aria-label="([^"]+)"`)) || src.match(new RegExp(`aria-label="([^"]+)"[^>]*\\bid="${id}"`));
  if (m) return m[1];
  return null;
}

const subTabs = sectionSubTabs();
const steps = sectionSteps();
const files = readdirSync(join(SRC, 'components/plan/sections')).filter((x) => x.endsWith('.jsx')).sort();
const sources = Object.fromEntries(files.map((f) => [f.replace('.jsx', ''), read('components/plan/sections/' + f)]));
// A section mounted by another section (Special Expenses holds Healthcare,
// Withdrawal, Spending Phases, ...) lives where its parent lives.
const parentOf = {};
for (const [name, src] of Object.entries(sources)) {
  for (const m of src.matchAll(/<([A-Z]\w*Section)\b/g)) if (m[1] !== name && sources[m[1]]) parentOf[m[1]] = name;
}
function stepOf(name, depth = 0) {
  if (steps[name]) return steps[name];
  if (parentOf[name] && depth < 5) return stepOf(parentOf[name], depth + 1);
  return null;
}
// The fold chain around a section, outermost first: a nested section's
// field is behind its parent's fold as well as its own.
function foldsOf(name, depth = 0) {
  const src = sources[name];
  const own = {
    id: (src.match(/useFoldState\('([^']+)'/) || [])[1] || SHELL_FOLDS[name]?.fold || null,
    title: (src.match(/<CollapsibleHeader[^>]*title="([^"]+)"/) || [])[1] || SHELL_FOLDS[name]?.foldTitle || null,
  };
  const above = parentOf[name] && depth < 5 ? foldsOf(parentOf[name], depth + 1) : [];
  return own.id || own.title ? [...above, { id: own.id, title: own.title ? decode(own.title) : null }] : above;
}
function homeOf(name, depth = 0) {
  if (OTHER_HOMES[name]) return OTHER_HOMES[name];
  if (subTabs[name]) return { tab: 'settings', subTab: subTabs[name], subTabLabel: SUB_TAB_LABELS[subTabs[name]], tabLabel: 'Plan' };
  if (parentOf[name] && depth < 5) return homeOf(parentOf[name], depth + 1);
  return null;
}
const entries = [];
for (const name of Object.keys(sources)) {
  const src = sources[name];
  const home = homeOf(name);
  if (!home) { console.warn(`fieldIndex: no home for ${name}`); continue; }
  const folds = foldsOf(name);
  const step = stepOf(name);
  const seen = new Set();
  for (const m of src.matchAll(/\bid="((?:field|toggle)-[A-Za-z0-9_]+)"/g)) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const label = labelFor(src, id);
    if (!label) continue;
    const key = id.replace(/^(field|toggle)-/, '');
    // Per-spouse twins share a label once the name expression is stripped;
    // say which spouse so the two results can be told apart.
    const sp = key.match(/(?:^|[A-Za-z])([12])(?=[A-Z]|$)/);
    const spouse = sp ? sp[1] : null;
    const shown = spouse && !/spouse/i.test(label) ? `${label} (Spouse ${spouse})` : label;
    const options = id.startsWith('field-') ? optionsFor(src, id) : null;
    entries.push({ id, key, label: shown, tab: home.tab, tabLabel: home.tabLabel, subTab: home.subTab, subTabLabel: home.subTabLabel, folds, step, section: name, ...(options ? { options } : {}) });
  }
}

const out = `// GENERATED by scripts/generateFieldIndex.mjs -- do not edit by hand.
// Every plan control the "Find a setting" box can jump to: its element id,
// input key, label, and where it lives (tab, sub-tab, fold). Regenerate
// with \`node scripts/generateFieldIndex.mjs\` after adding or
// renaming a field; fieldIndex.test.js fails when this file is stale.
export const FIELD_INDEX = [
${entries.map((e) => '  ' + JSON.stringify(e) + ',').join('\n')}
];
`;
const target = join(SRC, 'config/fieldIndex.js');
if (process.argv.includes('--check')) {
  // fieldIndex.test.js: fail when the committed file is stale.
  let current = '';
  try { current = readFileSync(target, 'utf8'); } catch { /* missing counts as stale */ }
  if (current !== out) { console.error('fieldIndex.js is stale: run `node scripts/generateFieldIndex.mjs`'); process.exit(1); }
  console.log('fieldIndex.js is current');
  process.exit(0);
}
writeFileSync(target, out);
console.log(`fieldIndex: ${entries.length} fields from ${new Set(entries.map((e) => e.section)).size} sections`);
