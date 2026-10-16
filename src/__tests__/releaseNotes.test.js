// The public release notes (/changelog) and How the math works page are
// generated from config the app uses; these pin the rules that keep them
// honest: the newest weeks in full, older work by quarter, every What's New
// entry accounted for, and both pages current and reachable.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CHANGELOG } from '../config/changelog';
import { RELEASE_WEEKS, RELEASE_QUARTERS, RELEASE_NOTES_WEEKS, RELEASE_NOTES_LEFT_OUT } from '../config/releaseNotes';
import { layoutReleaseNotes, isMonday, addDays, quarterOf } from '../utils/releaseNotesLayout';
import { METHODOLOGY_SECTIONS } from '../config/methodology';
import { HOW_FIGURED_RULES } from '../config/howFigured';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

describe('release notes data', () => {
  it('weeks start on a Monday, are unique, and have a few bullets each', () => {
    const seen = new Set();
    for (const w of RELEASE_WEEKS) {
      expect(isMonday(w.weekOf), w.weekOf).toBe(true);
      expect(seen.has(w.weekOf)).toBe(false);
      seen.add(w.weekOf);
      expect(w.headline.length).toBeGreaterThan(10);
      expect(w.bullets.length).toBeGreaterThan(0);
      expect(w.bullets.length).toBeLessThanOrEqual(8);
      for (const b of w.bullets) {
        expect(b.title.length).toBeGreaterThan(2);
        expect(b.text.length).toBeGreaterThan(20);
        expect(b.ids.length).toBeGreaterThan(0);
      }
    }
  });

  it(`shows at most ${RELEASE_NOTES_WEEKS} weeks, and the quarter summaries meet them`, () => {
    expect(() => layoutReleaseNotes(RELEASE_WEEKS, RELEASE_QUARTERS, RELEASE_NOTES_WEEKS)).not.toThrow();
    expect(RELEASE_WEEKS.length).toBeLessThanOrEqual(RELEASE_NOTES_WEEKS);
  });

  it('every entry sits in the week its date falls in', () => {
    const byId = Object.fromEntries(CHANGELOG.map((e) => [e.id, e]));
    for (const w of RELEASE_WEEKS) {
      const end = addDays(w.weekOf, 6);
      for (const b of w.bullets) {
        for (const id of b.ids) {
          const e = byId[id];
          expect(e, `id ${id}`).toBeTruthy();
          expect(e.date >= w.weekOf && e.date <= end, `id ${id} (${e.date}) in week of ${w.weekOf}`).toBe(true);
        }
      }
    }
    for (const q of RELEASE_QUARTERS) {
      for (const id of q.ids) {
        const e = byId[id];
        expect(e, `id ${id}`).toBeTruthy();
        expect(e.date >= q.from && e.date <= q.through, `id ${id} (${e.date}) in ${q.quarter}`).toBe(true);
        expect(quarterOf(e.date)).toBe(q.quarter);
      }
    }
  });

  it('accounts for every What’s New entry', () => {
    const covered = new Set([
      ...RELEASE_WEEKS.flatMap((w) => w.bullets.flatMap((b) => b.ids)),
      ...RELEASE_QUARTERS.flatMap((q) => q.ids),
      ...RELEASE_NOTES_LEFT_OUT.flatMap((l) => l.ids),
    ]);
    const missing = CHANGELOG.map((e) => e.id).filter((id) => !covered.has(id));
    expect(missing, 'add these What’s New ids to a release-notes bullet (src/config/releaseNotes.js)').toEqual([]);
  });

  it('a left-out entry is left out for a reason, and is not also in a bullet', () => {
    const inBullets = new Set([...RELEASE_WEEKS.flatMap((w) => w.bullets.flatMap((b) => b.ids)), ...RELEASE_QUARTERS.flatMap((q) => q.ids)]);
    for (const l of RELEASE_NOTES_LEFT_OUT) {
      expect(l.why.length).toBeGreaterThan(5);
      for (const id of l.ids) expect(inBullets.has(id), `id ${id}`).toBe(false);
    }
  });

  it('the layout refuses a seventh week until it is folded into its quarter', () => {
    const extra = [...RELEASE_WEEKS, { weekOf: '2026-08-17', headline: 'x', bullets: [] }];
    expect(() => layoutReleaseNotes(extra, RELEASE_QUARTERS, RELEASE_NOTES_WEEKS)).toThrow(/fold it into its quarter/);
    const gap = RELEASE_QUARTERS.map((q) => ({ ...q, through: '2026-08-16' }));
    expect(() => layoutReleaseNotes(RELEASE_WEEKS, gap, RELEASE_NOTES_WEEKS)).toThrow(/oldest week shown/);
  });
});

describe('the public pages', () => {
  it('are current with the config (run node scripts/generatePublicPages.mjs)', () => {
    expect(() => execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'generatePublicPages.mjs'), '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('the release notes show each week and quarter, and mark Premium', () => {
    const page = read('public', 'changelog.html');
    for (const w of RELEASE_WEEKS) expect(page).toContain(`id="week-${w.weekOf}"`);
    for (const q of RELEASE_QUARTERS) expect(page).toContain(`id="quarter-${q.quarter}"`);
    expect(page).toContain('<span class="tag">Premium</span>');
    // Release notes, not the internal log: no changelog numbers.
    expect(page).not.toMatch(/changelog \d|entry \d{2,}/i);
  });

  it('How the math works carries every section and every rule with its source', () => {
    const page = read('public', 'how-the-math-works.html');
    for (const s of METHODOLOGY_SECTIONS) expect(page).toContain(`<h2 id="${s.id}">`);
    for (const r of HOW_FIGURED_RULES) expect(page).toContain(`id="rule-${r.id}"`);
    expect(page).toMatch(/href="https:\/\/www\.irs\.gov\//);
  });

  it('are served at clean addresses, in the sitemap, and linked from the home page', () => {
    const rewrites = JSON.parse(read('vercel.json')).rewrites;
    expect(rewrites).toContainEqual({ source: '/changelog', destination: '/changelog.html' });
    expect(rewrites).toContainEqual({ source: '/how-the-math-works', destination: '/how-the-math-works.html' });
    const sitemap = read('public', 'sitemap.xml');
    expect(sitemap).toContain('https://www.outlastretirement.com/changelog<');
    expect(sitemap).toContain('https://www.outlastretirement.com/how-the-math-works<');
    const home = read('index.html');
    expect(home).toContain('href="/changelog"');
    expect(home).toContain('href="/how-the-math-works"');
  });
});
