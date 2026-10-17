// Keeps src/config/inputCoverage.js honest.
//
// That file claims "these Plan Settings options are the ones the Full
// Interview never asks about." This test re-derives that claim from the
// actual source on every run -- reading InterviewTab.jsx, SettingsTab.jsx
// and DEFAULT_INPUTS -- and fails if the two disagree in either direction.
//
// The point is to not repeat INTERVIEW_SETTINGS_PARITY.md, which was a
// careful hand-written version of the same list and was wrong within a few
// weeks (it predates several shipped features and lists gaps that have
// since been closed). Prose describing code drifts; a test does not.
//
// If this fails, one of two things happened, and the message says which:
//   * You added a field to the Interview -> remove it from the map.
//   * You added a Settings-only field -> add it to the map (or to
//     LINK_STATE_KEYS if it's internal link plumbing, not a real option).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NOT_ASKED_IN_INTERVIEW, LINK_STATE_KEYS, SETTINGS_DOMAINS, notAskedForSection } from '../config/inputCoverage';
import { GUIDED_CORE_KEYS } from '../config/guidedCore';

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf-8');

// A trailing 1/2 is a spouse index. SettingsTab writes several of these as
// template literals (`nqdcEnabled${n}`) while the Interview writes them out
// literally (k="nqdcEnabled1"), so both sides have to be normalized or the
// comparison reports phantom gaps. Getting this wrong is exactly how an
// earlier pass "found" that NQDC was missing from the Interview when it
// isn't.
const strip = (k) => k.replace(/[12]$/, '');

function writtenKeys(src) {
  const literal = [...src.matchAll(/updateInput\('([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
  const fieldK = [...src.matchAll(/\bk="([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
  const template = [...src.matchAll(/updateInput\(`([A-Za-z0-9_]+)\$\{/g)].map((m) => m[1]);
  const templateK = [...src.matchAll(/\bk=\{`([A-Za-z0-9_]+)\$\{/g)].map((m) => m[1]);
  // SettingsTab's Concentrated Stock panel renders BOTH positions from one
  // field list via `updateInput(K('Name'), ...)` (see csKey there):
  // position 1 writes the un-numbered concentratedStock* keys, position 2
  // concentratedStock2*. Expand each K() write into both real key names so
  // this extractor stays honest about what Settings can edit.
  const csK = [...src.matchAll(/updateInput\(K\('([A-Za-z0-9_]+)'\)/g)].map((m) => m[1]);
  const csBoth = csK.flatMap((name) => [`concentratedStock${name}`, `concentratedStock2${name}`]);
  return new Set([...literal.map(strip), ...fieldK.map(strip), ...template, ...templateK, ...csBoth]);
}

function defaultInputKeys() {
  const lines = read('calculator.js').split('\n');
  const start = lines.findIndex((l) => l.startsWith('export const DEFAULT_INPUTS = {'));
  const end = lines.findIndex((l, i) => i > start && l.trimEnd() === '};');
  const body = lines.slice(start + 1, end).join('\n');
  return new Set([...body.matchAll(/^ {2}([A-Za-z0-9_]+):/gm)].map((m) => strip(m[1])));
}

// IA Phase 3 step 2 (2026-09-24): the Interview no longer writes fields of
// its own -- it mounts the Plan sections at guided density, and what it
// "asks" is exactly the core list in src/config/guidedCore.js. Everything
// else on those sections is folded under "More options", which is what
// NOT_ASKED_IN_INTERVIEW now describes.
const interviewKeys = new Set([...GUIDED_CORE_KEYS].map(strip));
// Plan Settings is composed of section components since IA Phase 3 step 1
// (2026-09-24), so "editable in Plan Settings" means the tab shell plus
// every file under components/plan.
const planFiles = ['components/tabs/SettingsTab.jsx', 'components/plan/sectionShared.jsx',
  ...fs.readdirSync(path.join(root, 'components/plan/sections')).map((f) => 'components/plan/sections/' + f)];
const settingsKeys = new Set(planFiles.flatMap((f) => [...writtenKeys(read(f))]));
const universe = defaultInputKeys();

// The real gap, derived fresh.
const actualGap = [...universe].filter((k) => settingsKeys.has(k) && !interviewKeys.has(k)).sort();

// What the map claims.
const claimed = new Set([
  ...NOT_ASKED_IN_INTERVIEW.flatMap((e) => e.keys.map(strip)),
  ...LINK_STATE_KEYS.map(strip),
]);

describe('inputCoverage map matches the actual code', () => {
  it('sanity: the extractors found a plausible amount of each', () => {
    expect(universe.size).toBeGreaterThan(150);
    expect(interviewKeys.size).toBeGreaterThan(80);
    expect(settingsKeys.size).toBeGreaterThan(120);
  });

  it('claims every option that is really Settings-only', () => {
    const missing = actualGap.filter((k) => !claimed.has(k));
    expect(
      missing,
      `\n\nThese inputs are editable in Plan Settings but folded away by the guided Interview (not in guidedCore.js), ` +
      `and are not listed in src/config/inputCoverage.js:\n  ${missing.join('\n  ')}\n\n` +
      `Add each to NOT_ASKED_IN_INTERVIEW (so the Interview can point users at it), ` +
      `or to LINK_STATE_KEYS if it is internal link plumbing rather than a real option.\n`
    ).toEqual([]);
  });

  it('does not claim anything the Interview actually does ask', () => {
    const stale = [...claimed].filter((k) => interviewKeys.has(k)).sort();
    expect(
      stale,
      `\n\nsrc/config/inputCoverage.js says the guided Interview folds these away, ` +
      `but guidedCore.js lists them as core:\n  ${stale.join('\n  ')}\n\n` +
      `Remove them from the map -- otherwise the Interview will tell users to go find ` +
      `something that was already right in front of them.\n`
    ).toEqual([]);
  });

  it('does not claim anything that is not a real plan input', () => {
    const unknown = [...claimed].filter((k) => !universe.has(k)).sort();
    expect(unknown, `Not present in DEFAULT_INPUTS: ${unknown.join(', ')}`).toEqual([]);
  });
});

describe('inputCoverage map is internally well-formed', () => {
  it('every entry points at a real Plan Settings domain', () => {
    for (const e of NOT_ASKED_IN_INTERVIEW) {
      expect(Object.keys(SETTINGS_DOMAINS), `entry "${e.id}"`).toContain(e.domain);
    }
  });

  it('every entry has a title, a plain-language blurb, and at least one key', () => {
    for (const e of NOT_ASKED_IN_INTERVIEW) {
      expect(e.title, `entry "${e.id}"`).toBeTruthy();
      expect(e.blurb?.length, `entry "${e.id}" blurb`).toBeGreaterThan(30);
      expect(e.keys.length, `entry "${e.id}" keys`).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids and no key claimed by two entries', () => {
    const ids = NOT_ASKED_IN_INTERVIEW.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = NOT_ASKED_IN_INTERVIEW.flatMap((e) => e.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every entry anchors to a real Interview section id', () => {
    // The Interview's steps live in interviewSections.js (InterviewTab.jsx imports them).
    const src = read('components/tabs/interviewSections.js');
    const sectionIds = new Set([...src.matchAll(/\{ id: '([a-z]+)', label: '/g)].map((m) => m[1]));
    expect(sectionIds.size).toBeGreaterThan(10);
    for (const e of NOT_ASKED_IN_INTERVIEW) {
      if (e.interviewSection) expect(sectionIds, `entry "${e.id}"`).toContain(e.interviewSection);
    }
  });
});

describe('where the Interview points at a planned move (changelog 212)', () => {
  it('sits on Life Events, the section it belongs to', () => {
    const ids = notAskedForSection('milestones').map((e) => e.id);
    expect(ids).toContain('residencyTimeline');
    expect(notAskedForSection('household').map((e) => e.id)).not.toContain('residencyTimeline');
  });
});
