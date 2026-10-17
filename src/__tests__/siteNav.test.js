// Changelog 369: every public page has the same header links, from one list.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_NAV, HOME_NAV_HREF } from '../config/siteNav';

const ROOT = join(__dirname, '..', '..');
const PAGES = ['index.html', 'public/privacy.html', 'public/terms.html', 'public/accessibility.html', 'public/premium.html', 'public/verify.html', 'public/404.html', 'public/changelog.html', 'public/how-the-math-works.html', 'public/pricing-script.html', 'public/learn.html', 'public/learn/site-tour.html', 'public/learn/will-my-money-last.html', 'public/learn/who-pays-me-when-i-stop-working.html', 'public/learn/what-will-retirement-cost-me.html', 'public/learn/build-my-own-plan.html', 'public/learn/how-do-i-read-my-answer.html', 'public/learn/my-plan-runs-short.html'];

function headerLinks(html) {
  const header = /<header[\s\S]*?<\/header>/.exec(html)[0];
  return [...header.matchAll(/<a\b([^>]*)>([^<]+)<\/a>/g)]
    .map(([, attrs, text]) => ({ href: /href="([^"]*)"/.exec(attrs)[1], label: text.trim() }))
    .filter((l) => l.href !== '/' && l.label !== 'Try the Demo Plan');
}

describe('site header', () => {
  for (const page of PAGES) {
    it(`${page} carries the shared header links`, () => {
      const links = headerLinks(readFileSync(join(ROOT, page), 'utf8'));
      const want = SITE_NAV.map((l) => ({ href: page === 'index.html' ? (HOME_NAV_HREF[l.href] || l.href) : l.href, label: l.label }));
      expect(links).toEqual(want);
    });
  }

  it('the footer names the pages the same way', () => {
    for (const page of PAGES) {
      const html = readFileSync(join(ROOT, page), 'utf8');
      const foot = /<footer[\s\S]*?<\/footer>/.exec(html)[0];
      expect(foot, page).toContain('>How the math works</a>');
      expect(foot, page).toContain('>Free and Premium</a>');
      expect(foot, page).not.toContain('>The math</a>');
    }
  });
});
