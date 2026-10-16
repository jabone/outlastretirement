// User-facing copy is about what the app does, not when it changed
// (changelog 273). "Since changelog 181 ..." and "(changelog 265)" are
// release notes; they belong in src/config/changelog.js and nowhere a
// user reads. This scans every source file's NON-comment text -- code
// comments are for developers and may cite changelogs freely -- for a
// changelog number, a "since <month> 2026" clause, or (in the Guide and
// the Input Dictionary, which are prose) a bare ISO date.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..');

// Files whose job is history or dated data.
const EXEMPT = new Set([
  'config/changelog.js', 'config/announcements.js', 'config/sources.js', 'config/demoPlan.js',
  'utils/portfolioHoldings.js', 'config/historicalReturns.js', 'config/lifeTable.js',
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('no release notes in user-facing copy', () => {
  const files = walk(SRC).map((p) => relative(SRC, p)).filter((f) => !EXEMPT.has(f));

  it('scans a plausible number of files', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('components/tabs/GuideTab.jsx');
  });

  it('no changelog numbers or "since <month> 2026" outside comments', () => {
    const offenders = [];
    for (const f of files) {
      const text = stripComments(readFileSync(join(SRC, f), 'utf8'));
      for (const m of text.matchAll(/changelog ?\d+|\bsince (?:January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\b/gi)) {
        const line = text.slice(0, m.index).split('\n').length;
        offenders.push(`${f}:${line}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the Guide and the Input Dictionary carry no dated or before-and-after phrasing', () => {
    const MONTH = '(?:January|February|March|April|May|June|July|August|September|October|November|December)';
    const pattern = new RegExp(`\\b(?:Until|Added|Before|After|As of|From) ${MONTH} 20\\d\\d\\b|\\(was [^)]{1,40}\\)`, 'gi');
    const offenders = [];
    for (const f of ['components/tabs/GuideTab.jsx', 'components/InputReference.jsx']) {
      const text = stripComments(readFileSync(join(SRC, f), 'utf8'));
      for (const m of text.matchAll(pattern)) offenders.push(`${f}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('the Guide and the Input Dictionary carry no bare ISO dates', () => {
    const offenders = [];
    for (const f of ['components/tabs/GuideTab.jsx', 'components/InputReference.jsx']) {
      const text = stripComments(readFileSync(join(SRC, f), 'utf8'));
      for (const m of text.matchAll(/\b20\d\d-\d\d-\d\d\b/g)) offenders.push(`${f}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
