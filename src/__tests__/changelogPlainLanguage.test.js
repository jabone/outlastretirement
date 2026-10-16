// What's New is read by retirees, not developers. Every entry's title,
// summary and items must say what changed for the reader, without the
// internals behind it: function names, source file names, audit question
// ids, self-references to release numbers, or sentences about the test
// suite. Code comments in changelog.js may cite anything; this scans only
// the text the app renders.
import { describe, it, expect } from 'vitest';
import { CHANGELOG } from '../config/changelog';

// Brand and product names that happen to look like code identifiers.
// Keep this list short and add a reason with each entry.
const ALLOWED_TERMS = new Set([
  'iOS', // Apple's phone operating system
  'OutlastRetirement', // our product name
  'iPhone', // Apple device name
  'VoiceOver', // Apple's screen reader
]);

const RULES = [
  { name: 'code call like word()', re: /\b[A-Za-z_$][\w$.]*\(\)/g },
  // camelCase with two or more humps (computeRebalancePlan, setupRefreshTrigger)
  { name: 'camelCase identifier', re: /\b[a-z]+[A-Z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g },
  { name: 'source file name', re: /\b[\w-]+\.(?:js|jsx|mjs|md)\b/g },
  { name: 'audit question id', re: /\bQ-\d+/g },
  { name: 'release-number self-reference', re: /\bchangelog \d+/gi },
  { name: 'sentence about a test', re: /\ba test /gi },
  { name: 'sentence about a test', re: /\btests? (?:holds?|pins?|scans?|asserts?)\b/gi },
];

function findLeaks(entries) {
  const leaks = [];
  for (const entry of entries) {
    const fields = [
      ['title', entry.title],
      ['summary', entry.summary],
      ...(entry.items || []).map((text, i) => [`items[${i}]`, text]),
    ];
    for (const [field, text] of fields) {
      if (typeof text !== 'string') continue;
      for (const { name, re } of RULES) {
        for (const match of text.matchAll(re)) {
          if (ALLOWED_TERMS.has(match[0])) continue;
          leaks.push(`entry ${entry.id} ${field}: ${name} "${match[0]}"`);
        }
      }
    }
  }
  return leaks;
}

describe('What’s New is written in plain language', () => {
  it('no entry leaks code names, file names, audit ids or test talk', () => {
    expect(findLeaks(CHANGELOG)).toEqual([]);
  });

  it('every rule catches the leak it exists for', () => {
    const planted = [
      'Uses the same runProjection() engine.',
      'computeRebalancePlan now targets each holding.',
      'See KNOWN_ISSUES.md for the rest.',
      'Fixed in App.jsx and calculator.js.',
      'This closes audit question Q-14.',
      'As described in changelog 181.',
      'Kept that way. A test scans the source.',
      'The tests pin the vocabulary.',
    ];
    const leaks = findLeaks(planted.map((text, i) => ({ id: i, title: 'T', summary: 'S', items: [text] })));
    const hitIds = new Set(leaks.map((l) => Number(l.split(' ')[1])));
    expect([...hitIds].sort((a, b) => a - b)).toEqual(planted.map((_, i) => i));
  });

  it('allowed brand names pass', () => {
    const entry = { id: 1, title: 'OutlastRetirement on iPhone and iOS', summary: 'Works with VoiceOver.', items: [] };
    expect(findLeaks([entry])).toEqual([]);
  });

  it('an entry that had details keeps at least one', () => {
    for (const entry of CHANGELOG) {
      expect(Array.isArray(entry.items), `entry ${entry.id} has no items array`).toBe(true);
      expect(entry.items.length, `entry ${entry.id} has no items`).toBeGreaterThan(0);
    }
  });
});
