// The outside review of 2026-09-28: quick wins that must not come back.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PREMIUM_AREAS } from '../config/premiumOffering';
import { SUNSET_DATE } from '../config/migration';

const SRC = path.resolve(__dirname, '..');
const ROOT = path.resolve(SRC, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const noComments = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
  .replace(/<!--[\s\S]*?-->/g, '');

function uiFiles(dir = SRC) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__') out.push(...uiFiles(full)); }
    else if (/\.(jsx|js)$/.test(e.name)) out.push(full);
  }
  return out;
}
const UI = uiFiles().map((f) => [path.relative(SRC, f), noComments(fs.readFileSync(f, 'utf8'))]);
const STATIC = ['index.html', 'public/privacy.html', 'public/terms.html', 'public/accessibility.html', 'public/404.html', 'public/verify.html']
  .map((f) => [f, noComments(read(f))]);

describe('one cutoff date for cashflowengine.app', () => {
  it('is October 1', () => {
    expect(SUNSET_DATE).toBe('2026-10-01');
  });
  it('no copy anywhere names October 27', () => {
    const hits = [...UI, ...STATIC].filter(([, s]) => /October 27|Oct(\.)? 27/i.test(s)).map(([f]) => f);
    expect(hits).toEqual([]);
  });
});

describe('the home page names every Premium area', () => {
  const home = read('index.html').replace(/&amp;/g, '&');
  for (const area of PREMIUM_AREAS) {
    it(area.name, () => {
      // The feature card, the Premium list and the FAQ each name it.
      expect(home.split(area.name).length - 1).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('site basics', () => {
  it('serves a favicon.ico and a branded 404 page', () => {
    expect(fs.existsSync(path.join(ROOT, 'public', 'favicon.ico'))).toBe(true);
    expect(read('public', '404.html')).toMatch(/Page not found/);
  });
  it('answers /privacy, /terms and /accessibility without .html', () => {
    const rewrites = JSON.parse(read('vercel.json')).rewrites;
    for (const page of ['privacy', 'terms', 'accessibility']) {
      expect(rewrites).toContainEqual({ source: `/${page}`, destination: `/${page}.html` });
    }
  });
});

describe('no pointers to a README users cannot see', () => {
  it('app copy never sends people to the repo', () => {
    const hits = UI.filter(([f, s]) => !f.startsWith('config/changelog') && /README|the repo\b|this repo\b|mint-premium-jwt/.test(s)).map(([f]) => f);
    expect(hits).toEqual([]);
  });
});

describe('no advice-sounding copy', () => {
  const PHRASES = [/we recommend/i, /we suggest/i, /exactly what to trade/i, /Peak Recommendation/, /generally recommended/i, /no change recommended/i];
  it('none of the flagged phrases remain', () => {
    const hits = [];
    for (const [f, s] of [...UI, ...STATIC]) {
      if (f.startsWith('config/changelog')) continue;
      for (const re of PHRASES) if (re.test(s)) hits.push(`${f}: ${re}`);
    }
    expect(hits).toEqual([]);
  });
});

describe('Medicare totals are labeled as premiums, not as IRMAA alone', () => {
  it('the optimizer cards and the one-lever compare', () => {
    expect(read('src', 'components', 'tabs', 'StrategyTab.jsx')).toContain('>Lifetime Medicare premiums (incl. IRMAA)</Tooltip>');
    expect(read('src', 'components', 'OneLeverCompare.jsx')).toContain("label: 'Lifetime Medicare premiums (incl. IRMAA)'");
  });
  it('the printed report uses the same label for the same figure', () => {
    const app = read('src', 'App.jsx');
    expect(app).toContain('<td>Lifetime Medicare premiums (incl. IRMAA)</td>');
    expect(app).not.toContain('IRMAA Surcharges');
  });
});

describe('every static page names its favicon', () => {
  // Chrome showed a blank globe on /premium: the static pages had no icon
  // link, and a browser that once cached /favicon.ico as missing keeps it.
  for (const f of ['privacy.html', 'terms.html', 'accessibility.html', '404.html', 'premium.html', 'changelog.html', 'how-the-math-works.html', 'pricing-script.html']) {
    it(f, () => {
      expect(read('public', f)).toContain('<link rel="icon" type="image/png" href="/favicon.png" />');
    });
  }
});
