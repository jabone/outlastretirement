// Guard for WCAG 4.1.2 (Name, Role, Value): every form control and every
// icon-only button in the app's JSX must carry a name a screen reader can
// announce. The automated accessibility scan found 62 unnamed controls; this
// keeps new ones from creeping back in. It is a source check, so it accepts
// the ways the app names things: aria-label / aria-labelledby, an id that a
// <label htmlFor> points at, a wrapping <label>, or a wrapping <HoverTooltip>
// (which copies its text onto the child as aria-label).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');

function jsxFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...jsxFiles(full));
    } else if (entry.name.endsWith('.jsx')) {
      out.push(full);
    }
  }
  return out;
}

// Blank out comments (keeping line numbers) so prose mentioning <input> is ignored.
function stripComments(src) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, pre) => pre + ' '.repeat(m.length - pre.length));
}

// The opening tag starting at `start`, honoring {...} expressions.
function openingTag(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

function insideOpen(src, start, tagName) {
  const before = src.slice(Math.max(0, start - 500), start);
  return before.lastIndexOf(`<${tagName}`) > before.lastIndexOf(`</${tagName}>`);
}

const NAMED = /\b(aria-label|aria-labelledby)=/;
const lineOf = (src, i) => src.slice(0, i).split('\n').length;

export function unnamedControls(file, raw) {
  const src = stripComments(raw);
  const bad = [];
  for (const m of src.matchAll(/<(input|select|textarea)\b/g)) {
    const tag = openingTag(src, m.index);
    if (/type="(hidden|file|submit|button)"/.test(tag)) continue;
    if (NAMED.test(tag) || /\bid=/.test(tag) || tag.includes('{...')) continue;
    if (insideOpen(src, m.index, 'label')) continue;
    bad.push(`${path.relative(SRC, file)}:${lineOf(src, m.index)} <${m[1]}>`);
  }
  return bad;
}

export function unnamedIconButtons(file, raw) {
  const src = stripComments(raw);
  const bad = [];
  for (const m of src.matchAll(/<button\b/g)) {
    const tag = openingTag(src, m.index);
    if (tag.endsWith('/>')) continue;
    if (NAMED.test(tag) || tag.includes('{...')) continue;
    if (insideOpen(src, m.index, 'HoverTooltip')) continue;
    const bodyStart = m.index + tag.length;
    const body = src.slice(bodyStart, src.indexOf('</button>', bodyStart));
    const text = body.replace(/<[^>]*>/g, '');
    if (/[A-Za-z]/.test(text)) continue; // visible text or an expression that renders some
    bad.push(`${path.relative(SRC, file)}:${lineOf(src, m.index)} <button>`);
  }
  return bad;
}

describe('accessible names (WCAG 4.1.2)', () => {
  const files = jsxFiles(SRC);

  it('every input, select and textarea has a name', () => {
    const bad = files.flatMap((f) => unnamedControls(f, fs.readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('every icon-only button has a name', () => {
    const bad = files.flatMap((f) => unnamedIconButtons(f, fs.readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('flags the cases the scan found (self-check)', () => {
    expect(unnamedControls('x.jsx', '<input type="range" className="custom-slider" />')).toHaveLength(1);
    expect(unnamedControls('x.jsx', '<select value={v}><option>A</option></select>')).toHaveLength(1);
    expect(unnamedControls('x.jsx', '<input type="range" aria-label="Annual spending" />')).toHaveLength(0);
    expect(unnamedControls('x.jsx', '<label>Name <input type="text" /></label>')).toHaveLength(0);
    expect(unnamedControls('x.jsx', '// a plain <input type="number"> here\n')).toHaveLength(0);
    expect(unnamedIconButtons('x.jsx', '<button onClick={f}><Trash2 size={12} /></button>')).toHaveLength(1);
    expect(unnamedIconButtons('x.jsx', '<button aria-label="Delete"><Trash2 size={12} /></button>')).toHaveLength(0);
    expect(unnamedIconButtons('x.jsx', '<button>Load Plan</button>')).toHaveLength(0);
    expect(unnamedIconButtons('x.jsx', '<HoverTooltip text="Close"><button><X /></button></HoverTooltip>')).toHaveLength(0);
  });
});

describe('sliders speak their value with its unit', () => {
  // VoiceOver read the spending slider as a bare "48000". aria-valuetext
  // lets each slider say "$48,000 per year" or "3.5 percent" instead.
  it('every range input sets aria-valuetext', () => {
    const bad = [];
    for (const f of jsxFiles(SRC)) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      for (const m of src.matchAll(/<input\b/g)) {
        const tag = openingTag(src, m.index);
        if (/type="range"/.test(tag) && !/aria-valuetext=/.test(tag)) bad.push(`${path.relative(SRC, f)}:${lineOf(src, m.index)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('keyboard access to sideways-scrolling tables (WCAG 2.1.1)', () => {
  it('the per-heir breakdown can take focus and is announced as a region', () => {
    const src = fs.readFileSync(path.join(SRC, 'components/tabs/TaxEstateTab.jsx'), 'utf8');
    const tag = src.match(/<div className="scroll-region"[^>]*aria-label="Per-heir breakdown"[^>]*>/);
    expect(tag, 'per-heir breakdown wrapper').toBeTruthy();
    expect(tag[0]).toMatch(/tabIndex=\{0\}/);
    expect(tag[0]).toMatch(/role="region"/);
    const css = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');
    expect(css).toMatch(/\.scroll-region:focus-visible\s*\{[^}]*outline:/);
  });
});

describe('the accessibility statement', () => {
  const ROOT = path.resolve(SRC, '..');
  const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

  it('exists, is in English, and gives a way to report a barrier', () => {
    const page = read('public', 'accessibility.html');
    expect(page).toMatch(/<html lang="en">/);
    expect(page).toMatch(/WCAG\) 2\.1, Level AA/);
    expect(page).toMatch(/href="mailto:hello@outlastretirement\.com\?subject=Accessibility"/);
    expect(page).toMatch(/Last reviewed: /);
    // It must say what still falls short, not only what works.
    expect(page).toMatch(/What Still Falls Short/);
  });

  it('is linked from every place the other legal pages are', () => {
    expect(read('src', 'config', 'branding.js')).toMatch(/ACCESSIBILITY_URL = '\/accessibility'/);
    expect(read('src', 'App.jsx')).toMatch(/href=\{ACCESSIBILITY_URL\}/);
    expect(read('src', 'components', 'tabs', 'PreferencesTab.jsx')).toMatch(/href=\{ACCESSIBILITY_URL\}/);
    for (const file of [['index.html'], ['public', 'privacy.html'], ['public', 'terms.html']]) {
      expect(read(...file), file.join('/')).toContain('href="/accessibility"');
    }
    expect(read('public', 'sitemap.xml')).toContain('https://www.outlastretirement.com/accessibility');
  });
});

