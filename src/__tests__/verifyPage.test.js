// /verify is the page that tells people how to check our privacy claim
// themselves. It is only worth anything if it matches what we actually
// ship, so the parts that can drift are tied to their sources here: the
// header it prints is the header vercel.json sends, and the locked line is
// word for word.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const page = read('public/verify.html');
const vercel = JSON.parse(read('vercel.json'));

export const LOCKED_LINE = 'Local-first retirement education. Your numbers never leave your device.';

// The text a reader sees in the header block: tags removed, whitespace
// collapsed, entities for quotes undone.
export function printedPolicy(html) {
  const start = html.indexOf('data-testid="csp-block"');
  if (start === -1) return '';
  const open = html.indexOf('>', start) + 1;
  const end = html.indexOf('</div>', open);
  return html.slice(open, end).replace(/<[^>]+>/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').replace(/ ;/g, ';').trim();
}

const shippedPolicy = () => vercel.headers.find((h) => h.source === '/(.*)').headers
  .find((h) => h.key === 'Content-Security-Policy').value;

describe('/verify', () => {
  it('is served at /verify', () => {
    expect(vercel.rewrites).toContainEqual({ source: '/verify', destination: '/verify.html' });
  });

  it('prints the header exactly as vercel.json sends it', () => {
    expect(printedPolicy(page)).toBe(shippedPolicy().replace(/\s+/g, ' ').trim());
  });

  it('uses the locked line word for word', () => {
    expect(page).toContain(LOCKED_LINE);
  });

  it('lists every feature that can make a connection', () => {
    for (const feature of ['Loading the app', 'Update check', 'Anonymous analytics', 'Live Pricing', 'Contacting us']) {
      expect(page, feature).toContain(`<td>${feature}`);
    }
    // Things that never connect are named under the table, not in it: the
    // table is only what can actually touch the network.
    for (const feature of ['Backups', 'Premium key']) {
      expect(page, feature).not.toContain(`<td>${feature}`);
    }
    expect(page).toMatch(/Never touch the network:<\/strong>[^<]*backups[^<]*imports[^<]*Premium key[^<]*module server/);
    expect(page).toMatch(/Ticker symbols only/);
  });

  it('says the browser allows any Google Sheet and the app picks yours', () => {
    expect(page).toMatch(/permits any Google Sheet/);
    expect(page).toMatch(/<details class="more">[\s\S]*script\.google\.com[\s\S]*docs\.google\.com[\s\S]*googleusercontent\.com[\s\S]*Links you click are not covered[\s\S]*<\/details>/);
  });

  it('ends by opening the demo plan, named by what to try', () => {
    // The closing button said "try Test 1" and opened an empty app: by the
    // bottom of the page "Test 1" was a long scroll away, and a new visitor
    // had no numbers to change. The demo has a plan loaded and works offline.
    expect(page).toContain('<a class="btn btn-ghost" href="/app/?demo=1">Open the demo plan and try the airplane-mode test</a>');
    expect(page).not.toMatch(/try Test 1</);
  });

  it('is linked from the home page, the Guide and the sitemap', () => {
    expect(read('index.html')).toContain('href="/verify"');
    expect(read('src/components/tabs/GuideTab.jsx')).toContain('href="/verify"');
    expect(read('public/sitemap.xml')).toContain('https://www.outlastretirement.com/verify<');
  });

  it('self-check: a printed header that drifted would fail', () => {
    const drifted = page.replace('https://docs.google.com', 'https://docs.google.com https://example.com');
    expect(printedPolicy(drifted)).not.toBe(shippedPolicy().replace(/\s+/g, ' ').trim());
  });
});
