// @vitest-environment jsdom
//
// The public /pricing-script page carries the current Apps Script for users
// to copy. The Premium module's Copy button and notice are tested in the
// Premium repo; this file covers the page and the copyText helper.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { copyText } from '../../utils/copyText';
import { PRICING_SHEET_SCRIPT_CHANGELOG } from '../../utils/pricingSource';

// The Premium module links here; the page is the app's.
const PRICING_SCRIPT_PAGE = '/pricing-script';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const SCRIPT = read('scripts', 'pricing-sheet-apps-script.gs');
const decode = (html) => html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

afterEach(() => { vi.unstubAllGlobals(); });

describe('copyText', () => {
  it('falls back to the browser’s copy command when there is no clipboard API', async () => {
    vi.stubGlobal('navigator', {});
    document.execCommand = vi.fn(() => true);
    expect(await copyText('abc')).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('reports failure when neither route works', async () => {
    vi.stubGlobal('navigator', {});
    document.execCommand = vi.fn(() => false);
    expect(await copyText('abc')).toBe(false);
  });
});

describe('the public page', () => {
  const page = read('public', 'pricing-script.html');

  it('carries the current script, character for character', () => {
    const m = /<code id="pricing-script">([\s\S]*?)<\/code>/.exec(page);
    expect(m).not.toBeNull();
    expect(decode(m[1])).toBe(SCRIPT);
  });

  it('has a Copy button wired by a script file of its own, never inline', () => {
    expect(page).toContain('<button type="button" class="copy-button" id="copy-script">Copy the script</button>');
    expect(page).toContain('<script src="/pricing-script.js" defer></script>');
    expect(page).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    const js = read('public', 'pricing-script.js');
    expect(js).toContain("getElementById('copy-script')");
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/);
  });

  it('gives the steps and every version’s notes', () => {
    expect(page).toContain('Manage deployments');
    for (const v of PRICING_SHEET_SCRIPT_CHANGELOG) expect(page).toContain(`<strong>Version ${v.version}</strong>`);
  });

  it('is routed and in the sitemap', () => {
    expect(JSON.parse(read('vercel.json')).rewrites).toContainEqual({ source: '/pricing-script', destination: '/pricing-script.html' });
    expect(read('public', 'sitemap.xml')).toContain('https://www.outlastretirement.com/pricing-script<');
    expect(PRICING_SCRIPT_PAGE).toBe('/pricing-script');
  });
});
