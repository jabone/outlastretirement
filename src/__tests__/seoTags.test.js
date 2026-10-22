// One address per page, and a proper preview when a page is shared.
//
// The static pages answer at two addresses (/privacy and /privacy.html,
// through the vercel.json rewrites), the site linked to both, and nothing
// told a search engine which was the real one. Each page now names its own
// address with rel="canonical" (the clean one, without .html), that address
// is the one in the sitemap, and no static page links to the .html spelling. Each also carries Open Graph
// and Twitter tags, so a link pasted into Slack, iMessage or LinkedIn shows a
// title card rather than a bare URL.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const BASE = 'https://www.outlastretirement.com';

export const CANONICAL = {
  'index.html': `${BASE}/`,
  'public/privacy.html': `${BASE}/privacy`,
  'public/terms.html': `${BASE}/terms`,
  'public/accessibility.html': `${BASE}/accessibility`,
  'public/premium.html': `${BASE}/premium`,
  'public/verify.html': `${BASE}/verify`,
  'public/changelog.html': `${BASE}/changelog`,
  'public/how-the-math-works.html': `${BASE}/how-the-math-works`,
  'public/pricing-script.html': `${BASE}/pricing-script`,
  'public/learn.html': `${BASE}/learn`,
  'public/learn/site-tour.html': `${BASE}/learn/site-tour`,
  'public/learn/will-my-money-last.html': `${BASE}/learn/will-my-money-last`,
  'public/learn/who-pays-me-when-i-stop-working.html': `${BASE}/learn/who-pays-me-when-i-stop-working`,
  'public/learn/what-will-retirement-cost-me.html': `${BASE}/learn/what-will-retirement-cost-me`,
  'public/learn/build-my-own-plan.html': `${BASE}/learn/build-my-own-plan`,
  'public/learn/how-do-i-read-my-answer.html': `${BASE}/learn/how-do-i-read-my-answer`,
  'public/learn/my-plan-runs-short.html': `${BASE}/learn/my-plan-runs-short`,
  'public/learn/three-questions.html': `${BASE}/learn/three-questions`,
};

const tag = (html, re) => (re.exec(html) || [])[1];

describe('canonical addresses', () => {
  const sitemap = read('public/sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  for (const [file, url] of Object.entries(CANONICAL)) {
    it(`${file} names ${url} as its address, and the sitemap agrees`, () => {
      const html = read(file);
      expect(tag(html, /<link rel="canonical" href="([^"]+)"/)).toBe(url);
      expect(locs).toContain(url);
    });
  }

  it('the sitemap lists no address that is not a page’s canonical one', () => {
    expect(locs.sort()).toEqual(Object.values(CANONICAL).sort());
  });

  it('no static page links to the other spelling of a page', () => {
    const other = /href="\/(privacy|terms|accessibility|verify|premium|changelog|how-the-math-works|pricing-script|learn|learn\/[a-z-]+)\.html/;
    const hits = Object.keys(CANONICAL).concat('public/404.html')
      .filter((f) => other.test(read(f)));
    expect(hits).toEqual([]);
  });
});

describe('link previews', () => {
  for (const [file, url] of Object.entries(CANONICAL)) {
    it(`${file} has a title card for sharing`, () => {
      const html = read(file);
      expect(tag(html, /property="og:url" content="([^"]+)"/)).toBe(url);
      for (const name of [/property="og:title" content="([^"]+)"/, /property="og:description" content="([^"]+)"/, /name="twitter:title" content="([^"]+)"/]) {
        expect(tag(html, name), String(name)).toBeTruthy();
      }
      expect(tag(html, /property="og:image" content="([^"]+)"/)).toBe(`${BASE}/brand/og-outlastretirement.png`);
      expect(tag(html, /name="twitter:card" content="([^"]+)"/)).toBe('summary_large_image');
    });
  }

  it('each page’s preview names that page, not another', () => {
    const titles = Object.keys(CANONICAL).filter((f) => f !== 'index.html')
      .map((f) => tag(read(f), /property="og:title" content="([^"]+)"/));
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('every page carries the same icons and a complete preview image', () => {
  const pages = [...Object.keys(CANONICAL), 'app/index.html'];
  for (const file of pages) {
    it(`${file} has the square favicon, the touch icon and the preview image's size and alt`, () => {
      const html = read(file);
      expect(html).toContain('<link rel="icon" type="image/png" href="/favicon.png" />');
      expect(html).toMatch(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" \/>/);
      expect(html).not.toMatch(/rel="icon"[^>]*or-short/);
      expect(tag(html, /property="og:image:width" content="([^"]+)"/)).toBe('1200');
      expect(tag(html, /property="og:image:height" content="([^"]+)"/)).toBe('630');
      expect(tag(html, /property="og:image:alt" content="([^"]+)"/)).toBeTruthy();
    });
  }

  it('the landing page states one description, in its meta tag and its structured data', () => {
    const html = read('index.html');
    const meta = tag(html, /<meta name="description" content="([^"]+)"/);
    expect(html).toContain(`"description": "${meta}"`);
  });

  it('every static page has one main landmark', () => {
    for (const file of [...Object.keys(CANONICAL), 'public/404.html']) {
      expect((read(file).match(/<main[\s>]/g) || []).length, file).toBe(1);
    }
  });

  it('every static page has the same footer links', () => {
    const want = ['/privacy', '/terms', '/accessibility', '/verify', '/premium', 'mailto:hello@outlastretirement.com'];
    for (const file of [...Object.keys(CANONICAL), 'public/404.html']) {
      const footer = /<footer[\s\S]*?<\/footer>/.exec(read(file))[0];
      for (const href of want) expect(footer, `${file} footer lacks ${href}`).toContain(`href="${href}"`);
    }
  });
});

// Bing Webmaster Tools flags a meta description outside roughly 25 to 160
// characters (reported 2026-10-07); search results cut a longer one short.
describe('meta descriptions', () => {
  const unescape = (t) => t.replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  for (const file of Object.keys(CANONICAL).concat('public/404.html')) {
    it(`${file} has a description of 50 to 160 characters`, () => {
      const d = unescape(tag(read(file), /<meta name="description" content="([^"]*)"/) || '');
      expect(d.length, d).toBeGreaterThanOrEqual(50);
      expect(d.length, d).toBeLessThanOrEqual(160);
    });
  }
});

// PageSpeed, 2026-10-07: the home page's pictures are drawn up to 1040px
// wide, so a 1100px copy sits between the 800 and 1600 ones; the first
// picture is the largest thing on the first screen and is fetched first; and
// the built page carries its three small stylesheets inline.
describe('home page delivery', () => {
  const html = read('index.html');
  it('offers each screenshot at 800, 1100 and 1600 wide, sized to the column', () => {
    for (const name of ['dashboard', 'readiness', 'montecarlo']) {
      expect(html).toContain(`srcset="/brand/screens/${name}-800.webp 800w, /brand/screens/${name}-1100.webp 1100w, /brand/screens/${name}-1600.webp 1600w" sizes="(max-width: 1080px) calc(100vw - 40px), 1040px"`);
      for (const w of [800, 1100, 1600]) expect(existsSync(join(ROOT, 'public/brand/screens', `${name}-${w}.webp`)), `${name}-${w}`).toBe(true);
    }
  });
  it('fetches the first screenshot at high priority, and only that one', () => {
    expect(html.match(/fetchpriority="high"/g)).toHaveLength(1);
    expect(html).toMatch(/dashboard-1600\.webp"[^>]*loading="eager" fetchpriority="high"/);
  });
  it('the build inlines the three brand stylesheets', async () => {
    const { inlineLandingCss } = await import('../../vite.config.js');
    const built = inlineLandingCss(html);
    expect(built).not.toMatch(/<link rel="stylesheet" href="\/brand\//);
    for (const f of ['outlastretirement.tokens.css', 'site-theme.css', 'fonts.css']) expect(built).toContain(`<style data-from="/brand/${f}">`);
    expect(built).toContain('@font-face');
  });
});

// The home page sets emphasis upright, so no visitor downloads the italic
// face for a few words.
describe('home page fonts', () => {
  it('nothing on the home page asks for an italic', () => {
    const html = read('index.html');
    expect(html).toMatch(/\n\s*em \{ font-style: normal;/);
    expect(html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/font-style:\s*italic|<i>|<cite|<address|<dfn|<var/);
  });
});
