// The Learn section: /learn and one page per lesson (changelog 388).
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEARN_LESSONS, LEARN_STANDING_LINE, LEARN_PARKERS_HREF, learnHasPage } from '../config/learnLessons';

const ROOT = join(__dirname, '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pages = LEARN_LESSONS.filter(learnHasPage);

describe('Learn pages', () => {
  it('there is at least the tour and lesson 1, and slugs are unique', () => {
    expect(pages.map((l) => l.slug)).toEqual(expect.arrayContaining(['site-tour', 'will-my-money-last']));
    expect(new Set(LEARN_LESSONS.map((l) => l.slug)).size).toBe(LEARN_LESSONS.length);
  });

  for (const lesson of pages) {
    describe(lesson.slug, () => {
      const html = read(`public/learn/${lesson.slug}.html`);

      it('writes every slide out as text, with its picture and a description of it', () => {
        lesson.slides.forEach((s, k) => {
          const n = String(k + 1).padStart(2, '0');
          expect(html, `slide ${n} narration`).toContain(`<p>${esc(s.say)}</p>`);
          expect(html, `slide ${n} alt`).toContain(`alt="${esc(s.alt)}"`);
          expect(s.alt.length, `slide ${n} alt length`).toBeGreaterThan(20);
          // Written for the picture, not pasted from its text: no shouting labels.
          expect(s.alt, `slide ${n} alt`).not.toMatch(/\b[A-Z]{4,} [A-Z]{2,}\b/);
          for (const f of [`${n}.webp`, `${n}-800.webp`]) {
            expect(existsSync(join(ROOT, 'public/learn/img', lesson.slug, f)), `${lesson.slug}/${f}`).toBe(true);
          }
        });
      });

      it('says it is education, not advice, and links into the planner', () => {
        expect(html).toContain(esc(LEARN_STANDING_LINE));
        const href = lesson.tryHref || LEARN_PARKERS_HREF;
        expect(href).toMatch(/^\/app\//);
        expect(html).toContain(`class="btn-go" href="${esc(href)}"`);
      });

      it('runs no script of its own and loads nothing from another site', () => {
        const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
        expect(scripts).toEqual(['<script src="/brand/theme.js">']);
        expect(html).not.toMatch(/src="https?:\/\/(?!www\.outlastretirement\.com)/);
        // The only link off the site is the lesson's own video, when it has one.
        const off = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('https://www.outlastretirement.com'));
        expect(off).toEqual(lesson.video ? [lesson.video] : []);
        if (lesson.video) expect(lesson.video).toMatch(/^https:\/\/(www\.youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/);
        expect(html).not.toMatch(/<iframe/i);
      });
    });
  }

  it('the hub links every lesson that has a page and none that does not', () => {
    const hub = read('public/learn.html');
    for (const l of LEARN_LESSONS) {
      if (learnHasPage(l)) expect(hub).toContain(`href="/learn/${l.slug}"`);
      else expect(hub).not.toContain(`href="/learn/${l.slug}"`);
      expect(hub).toContain(esc(l.title));
    }
  });

  it('each address is rewritten to its page', () => {
    const { rewrites } = JSON.parse(read('vercel.json'));
    expect(rewrites).toContainEqual({ source: '/learn', destination: '/learn.html' });
    expect(rewrites).toContainEqual({ source: '/learn/:slug', destination: '/learn/:slug.html' });
  });

  // An installed copy of the app must not carry the lessons: they are the
  // website's, read online, and would otherwise sit in the offline cache
  // for good and go stale there.
  it('are never stored for offline use', () => {
    const cfg = read('vite.config.js');
    const ignores = /globIgnores: \[([\s\S]*?)\],\n/.exec(cfg)[1];
    expect(ignores).toContain("'learn.html'");
    expect(ignores).toContain("'learn/**'");
    // Pictures are .webp, which the precache patterns do not include at all.
    expect(/globPatterns: \[([^\]]*)\]/.exec(cfg)[1]).not.toContain('webp');
  });
});
