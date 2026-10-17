// No emoji in the UI (changelog 274). Emoji render differently on every OS,
// cannot follow the theme, and read as casual in a financial tool; the
// app's visual language is lucide icons. This scans every source file's
// non-comment text for emoji code points. The changelog and announcements
// are release notes and may keep theirs.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..');
const EXEMPT = new Set(['config/changelog.js', 'config/announcements.js']);
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{231A}-\u{23FF}\u{1F000}-\u{1F2FF}]/u;

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

describe('no emoji in user-facing source', () => {
  it('finds none outside comments', () => {
    const offenders = [];
    for (const p of walk(SRC)) {
      const f = relative(SRC, p);
      if (EXEMPT.has(f)) continue;
      const lines = stripComments(readFileSync(p, 'utf8')).split('\n');
      lines.forEach((l, i) => { const m = l.match(EMOJI); if (m) offenders.push(`${f}:${i + 1}: ${m[0]}`); });
    }
    expect(offenders).toEqual([]);
  });
});
