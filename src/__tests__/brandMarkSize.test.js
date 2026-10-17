// The logo was downloaded at 870x202 to be drawn 28 px tall (PageSpeed,
// 2026-09-28: 14 KB more than needed, and no width/height, so the header
// shifted when it arrived). Each mark now has a 96 px tall copy, offered
// through srcset alongside the original, with its space reserved.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { brandMarkProps } from '../utils/brandMarkProps';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('BrandMark', () => {
  it('uses the small copy by default and offers the original', () => {
    const p = brandMarkProps('full', 'dark', 28);
    expect(p.src).toBe('/brand/outlast-full-dark-h96.png');
    expect(p.srcSet).toBe('/brand/outlast-full-dark-h96.png 413w, /brand/outlast-full-dark.png 870w');
    expect(p.sizes).toBe('121px');
    expect([p.width, p.height]).toEqual([121, 28]);
  });

  it('reserves the right width for the short mark too', () => {
    const p = brandMarkProps('short', 'light', 32);
    expect(p.src).toBe('/brand/or-short-light-h96.png');
    expect([p.width, p.height]).toEqual([65, 32]);
  });

  it('every small copy exists and is smaller than its original', () => {
    for (const f of ['outlast-full-dark', 'outlast-full-light', 'or-short-dark', 'or-short-light']) {
      const small = join(ROOT, 'public', 'brand', `${f}-h96.png`);
      expect(existsSync(small), f).toBe(true);
      expect(statSync(small).size).toBeLessThan(statSync(join(ROOT, 'public', 'brand', `${f}.png`)).size);
    }
  });
});

describe('static page headers', () => {
  for (const page of ['index.html', 'public/privacy.html', 'public/terms.html', 'public/accessibility.html', 'public/premium.html', 'public/verify.html', 'public/404.html', 'public/changelog.html', 'public/how-the-math-works.html', 'public/pricing-script.html']) {
    it(`${page} uses the small logo with its size reserved`, () => {
      const html = readFileSync(join(ROOT, page), 'utf8');
      // Changelog 368: the paper-on-navy lockup for dark, the navy one for
      // light; site-theme.css shows one of them.
      const dark = /<img class="or-logo or-logo--full logo-on-dark"[^>]*>/.exec(html)[0];
      const light = /<img class="or-logo or-logo--full logo-on-light"[^>]*>/.exec(html)[0];
      expect(dark).toContain('src="/brand/outlast-full-dark-h96.png"');
      expect(light).toContain('src="/brand/outlast-full-light-h96.png"');
      for (const img of [dark, light]) expect(img).toContain('width="121" height="28"');
    });
  }
});
