// The Learn section: /learn and one page per lesson (changelog 388).
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEARN_LESSONS, LEARN_GROUPS, LEARN_STANDING_LINE, LEARN_PARKERS_HREF, learnHasPage } from '../config/learnLessons';

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
        (lesson.slides || []).forEach((s, k) => {
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

      it('a text-only lesson writes out every paragraph and list item, with no pictures', () => {
        if (lesson.slides) return;
        expect(lesson.text.length).toBeGreaterThan(0);
        for (const t of lesson.text) {
          expect(html).toContain(`<h2>${esc(t.title)}</h2>`);
          for (const para of t.paras) expect(html).toContain(`<p>${esc(para)}</p>`);
          for (const x of t.list || []) expect(html).toContain(`<li>${esc(x)}</li>`);
        }
        expect(html).not.toContain('/learn/img/');
      });

      it('is in the sitemap', () => {
        expect(read('public/sitemap.xml')).toContain(`<loc>https://www.outlastretirement.com/learn/${lesson.slug}</loc>`);
      });

      it('says it is education, not advice, and links into the planner', () => {
        expect(html).toContain(esc(lesson.standing || LEARN_STANDING_LINE));
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
      if (learnHasPage(l) && !l.standalone) expect(hub).toContain(`href="/learn/${l.slug}"`);
      else expect(hub).not.toContain(`href="/learn/${l.slug}"`);
      if (!l.standalone) expect(hub).toContain(esc(l.title));
    }
  });

  it('the hub groups the lessons: the tour under Start here, then each group with its count', () => {
    const hub = read('public/learn.html');
    expect(LEARN_GROUPS.map((g) => g.id)).toEqual(['start', 'basics', 'decisions']);
    for (const l of LEARN_LESSONS.filter((x) => !x.standalone)) expect(LEARN_GROUPS.map((g) => g.id), l.slug).toContain(l.group);
    expect(LEARN_LESSONS.filter((l) => l.group === 'start').map((l) => l.slug)).toEqual(['site-tour']);
    expect(hub).toContain('<h2>Start here</h2>');
    expect(hub).toContain('<h2>The basics · 6 lessons</h2>');
    expect(hub).toContain('<h2>Big decisions · 2 lessons</h2>');
    // The groups appear in order, and no "X of N" anywhere.
    expect(hub.indexOf('Start here</h2>')).toBeLessThan(hub.indexOf('The basics ·'));
    expect(hub.indexOf('The basics ·')).toBeLessThan(hub.indexOf('Big decisions ·'));
    expect(hub).not.toMatch(/\b\d+ of \d+\b/);
    // Lessons 1-6 under the basics, lesson 7 under big decisions.
    const basics = hub.slice(hub.indexOf('The basics ·'), hub.indexOf('Big decisions ·'));
    for (let n = 1; n <= 6; n += 1) expect(basics).toContain(`Lesson ${n} ·`);
    expect(hub.slice(hub.indexOf('Big decisions ·'))).toContain('Lesson 7 ·');
  });

  it('the Live Pricing walkthrough stands alone: off the hub and the path, back to the written steps', () => {
    const hub = read('public/learn.html');
    const page = read('public/learn/live-pricing-setup.html');
    expect(hub).not.toContain('live-pricing-setup');
    expect(read('public/learn/start-social-security.html')).toContain('<a href="/learn">All lessons →</a>');
    expect(page).toContain('<a href="/pricing-script#first-time">← The written steps, with pictures</a>');
    expect(page).toContain('Watch the walkthrough');
    expect(page).not.toContain(esc(LEARN_STANDING_LINE));
    expect(page).toContain('class="btn-go" href="/app/#/preferences"');
    expect(read('public/pricing-script.html')).toContain('href="/learn/live-pricing-setup"');
  });

  it('lesson 7 sits under Big decisions and links back to lesson 6, which points ahead to it', () => {
    const l7 = read('public/learn/three-questions.html');
    const title = 'What do you want your retirement to do? (Lesson 7) — OutlastRetirement';
    expect(l7).toContain(`<title>${title}</title>`);
    expect(l7).toContain(`property="og:title" content="${title}"`);
    expect(l7).toContain(`name="twitter:title" content="${title}"`);
    expect(l7).toContain('<p class="eyebrow">Lessons · Big decisions</p>');
    expect(l7).toContain('<p class="meta">Lesson 7 · about 3 minutes · 7 pictures</p>');
    expect(l7).toContain('<a href="/learn/my-plan-runs-short">← Lesson 6</a>');
    expect(read('public/learn/my-plan-runs-short.html')).toContain('<a href="/learn/three-questions">Next: What do you want your retirement to do? →</a>');
    // Lesson 1 still names the tour it follows.
    expect(read('public/learn/will-my-money-last.html')).toContain('← Site tour: A two-minute tour of OutlastRetirement</a>');
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
