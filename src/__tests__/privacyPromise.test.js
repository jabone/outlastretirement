// The locked privacy line, settled 2026-09-28:
//   "Local-first retirement education. Your numbers never leave your device."
// It was placed nowhere and paraphrased four different ways. This pins it
// word for word in every place it now appears, and keeps the retired
// paraphrases and the Local-Only Mode overclaim ("zero network requests")
// from coming back.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { PRIVACY_PROMISE } from '../config/branding';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SRC, '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const STATIC_PAGES = ['index.html', 'public/privacy.html', 'public/terms.html', 'public/accessibility.html', 'public/404.html', 'public/premium.html', 'public/verify.html', 'public/changelog.html', 'public/how-the-math-works.html', 'public/pricing-script.html'];

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== '__tests__') out.push(...sourceFiles(full)); }
    else if (/\.(jsx?|html)$/.test(name) && name !== 'changelog.js') out.push(full);
  }
  return out;
}

describe('the locked privacy line', () => {
  it('is the settled wording', () => {
    expect(PRIVACY_PROMISE).toBe('Local-first retirement education. Your numbers never leave your device.');
  });

  for (const page of STATIC_PAGES) {
    it(`appears word for word on ${page}`, () => {
      expect(read(page)).toContain(PRIVACY_PROMISE);
    });
  }

  it('leads the home page, in the hero and the search description', () => {
    const home = read('index.html');
    expect(home).toMatch(new RegExp(`<p class="privacy-line">${PRIVACY_PROMISE.replace(/\./g, '\\.')}`));
    expect(home).toMatch(new RegExp(`<meta name="description" content="${PRIVACY_PROMISE.replace(/\./g, '\\.')}`));
  });

  for (const page of STATIC_PAGES.filter((p) => p !== 'public/verify.html')) {
    it(`${page} links to /verify from its footer`, () => {
      const html = read(page);
      const footer = html.slice(html.lastIndexOf('<footer'), html.lastIndexOf('</footer>'));
      expect(footer).toContain('href="/verify"');
    });
  }

  it('the app footer links to /verify', () => {
    const app = read('src/App.jsx');
    const footer = app.slice(app.indexOf('app-disclaimer-footer'), app.indexOf('{PRIVACY_PROMISE}'));
    expect(footer).toContain('href="/verify"');
  });

  it('is the installed app’s description', () => {
    expect(read('vite.config.js')).toContain(`description: '${PRIVACY_PROMISE}'`);
  });

  it('is shown in the app footer and in Preferences, from the one constant', () => {
    expect(read('src/App.jsx')).toMatch(/\{PRIVACY_PROMISE\}/);
    expect(read('src/components/tabs/PreferencesTab.jsx')).toMatch(/\{PRIVACY_PROMISE\}/);
  });

  it('the premium page generator writes it, so a regeneration keeps it', () => {
    expect(read('scripts/generatePremiumPage.mjs')).toContain(PRIVACY_PROMISE);
  });
});

describe('retired wording stays retired', () => {
  const RETIRED = [
    /never leaves? your computer/i,
    /nothing you enter is ever uploaded/i,
    /plan data never leaves this device/i,
    /zero network requests/i,
    // Analytics goes to our own domain, and Live Pricing reaches Google, so
    // analytics was never the "only" outside request.
    /only third-party request/i,
  ];
  const files = [...sourceFiles(SRC), ...STATIC_PAGES.map((p) => join(ROOT, p)), join(ROOT, 'app', 'index.html'), join(ROOT, 'vite.config.js')];

  it('none of it is back', () => {
    const hits = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
      for (const re of RETIRED) if (re.test(text)) hits.push(`${relative(ROOT, f)}: ${re}`);
    }
    expect(hits).toEqual([]);
  });
});
