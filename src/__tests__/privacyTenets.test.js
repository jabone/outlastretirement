// The absolute claims public/privacy.html makes, enforced against the code.
//
// This file exists because the policy was wrong twice in one day (2026-09-12):
// it said we collect no email addresses while email was the only route to
// Premium, and it said plan data "never leaves your device" while three
// features existed to move it. Neither was a lie anyone told on purpose --
// the page was written once and the software kept moving.
//
// So the test is a CENSUS, not a spot-check. It enumerates every way data can
// leave the browser and fails on anything it does not already know about.
// When it fails, the fix is not to widen the allowlist reflexively: it is to
// decide whether the new thing is acceptable, and if it is, update the policy
// in the SAME commit. A privacy claim and the code that has to honour it
// should never move apart again.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SRC, '..');

// CSS is included deliberately. The font leak this whole test exists to
// prevent (changelog 148) was an @import in index.css, not a line of
// JavaScript -- a scanner that only reads .js would have watched it happen.
function sourceFiles(dir, out = [], { css = true } = {}) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'assets') sourceFiles(full, out, { css });
    } else if (css ? /\.(js|jsx|css)$/.test(entry.name) : /\.(js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Comments describe intent; only code can break a promise.
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('privacy tenet: the app sends nothing on its own', () => {
  // Every browser API that can put bytes on the network. A new entry here is
  // how this test keeps working as the platform grows.
  const NETWORK_APIS = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon|sendBeacon)\s*\(/g;

  // The ONLY file allowed to reach the network, and why. Adding to this list
  // is a deliberate act that should come with a policy update.
  const ALLOWED = {
    'premium/registry.js':
      'Premium module loading: the loader fetches a Premium ' +
      'module (code, not data) from the module server and sends ONLY the Premium Access key, as a ' +
      'bearer header, never in the URL -- OPEN_CORE_PLAN.md decision 2. Nothing the user typed ' +
      'about their plan or holdings is sent. Gated by assertNetworkAllowed; the chunk is executed ' +
      'only after its Ed25519 signature verifies. Described in public/privacy.html ("Premium modules").',
  };

  it('makes no network call outside the allowlist', () => {
    const found = [];
    for (const file of sourceFiles(SRC, [], { css: false })) {
      const rel = relative(SRC, file).split('\\').join('/');
      const code = stripComments(readFileSync(file, 'utf8'));
      const hits = code.match(NETWORK_APIS) || [];
      if (hits.length && !ALLOWED[rel]) found.push(`${rel} (${hits.length}x: ${[...new Set(hits)].join(', ')})`);
    }
    expect(found, [
      'A new network call appeared. Before allowlisting it, answer:',
      '  1. Does it send anything the user typed? If so the policy\'s storage section is now false.',
      '  2. Is it behind assertNetworkAllowed, so Local-Only Mode still means what the policy says?',
      '  3. Does public/privacy.html describe it? Update it in THIS commit, not later.',
    ].join('\n')).toEqual([]);
  });

  it('keeps every allowed call behind the Local-Only gate', () => {
    // The policy says Local-Only Mode means "no network requests at all".
    // That is only true if the gate sits at the call site, not in the UI.
    for (const rel of Object.keys(ALLOWED)) {
      const code = stripComments(readFileSync(join(SRC, rel), 'utf8'));
      const calls = (code.match(/\bfetch\s*\(/g) || []).length;
      const gates = (code.match(/\bassertNetworkAllowed\s*\(/g) || []).length;
      expect(code, `${rel} must import the real gate`)
        .toMatch(/import \{[^}]*\bassertNetworkAllowed\b[^}]*\} from '(\.\/|(\.\.\/)+utils\/|@host\/utils\/)localOnlyMode'/);
      expect(gates, `${rel}: ${calls} fetch call(s) but only ${gates} gate(s)`).toBeGreaterThanOrEqual(calls);
    }
  });

  it('sends no analytics beacon until the user opts in AND Local-Only is off', () => {
    // Off by default is the claim. Both flags are read synchronously so a
    // first-time visitor sends nothing, not even the initial page view.
    const gated = stripComments(readFileSync(join(SRC, 'components', 'GatedAnalytics.jsx'), 'utf8'));
    expect(gated).toMatch(/if \(localOnly \|\| !optedIn\) return null;/);
    // And nothing else may import the analytics package directly, which would
    // bypass that component entirely.
    for (const file of sourceFiles(SRC, [], { css: false })) {
      const rel = relative(SRC, file).split('\\').join('/');
      if (rel === 'components/GatedAnalytics.jsx') continue;
      expect(stripComments(readFileSync(file, 'utf8')), `${rel} imports analytics directly`)
        .not.toMatch(/@vercel\/analytics|@vercel\/speed-insights/);
    }
  });
});

describe('privacy tenet: nothing third-party loads on open', () => {
  // "Opening the App reveals nothing to any font host." Both entry documents
  // must reach for nothing off-origin -- this is the claim a visitor can check
  // themselves in about ten seconds with a network tab, so it had better hold.
  for (const page of ['index.html', 'app/index.html', 'public/privacy.html', 'public/terms.html', 'public/accessibility.html', 'public/404.html', 'public/premium.html', 'public/verify.html', 'public/changelog.html', 'public/how-the-math-works.html', 'public/pricing-script.html']) {
    it(`${page} loads no off-origin resource`, () => {
      const html = readFileSync(join(ROOT, page), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
      const remote = [...html.matchAll(/(?:src|href)="(https?:)?\/\/([^/"]+)[^"]*"/g)]
        .filter((m) => !['outlastretirement.com', 'www.outlastretirement.com'].includes(m[2]))
        // A citation a reader can click is not a resource the page loads.
        .filter((m) => !/target="_blank"/.test(html.slice(Math.max(0, m.index - 200), m.index + 200)))
        .map((m) => m[0]);
      expect(remote).toEqual([]);
    });
  }

  it('pulls no remote resource in from a stylesheet', () => {
    for (const file of sourceFiles(SRC).filter((f) => f.endsWith('.css'))) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      const rel = relative(SRC, file).split('\\').join('/');
      expect(css, `${rel} has an @import`).not.toMatch(/@import/);
      const urls = [...css.matchAll(/url\(\s*['"]?(https?:)?\/\/[^)]*\)/g)].map((m) => m[0]);
      expect(urls, `${rel} loads a remote url()`).toEqual([]);
    }
  });

  it('loads from no font or tag-manager host anywhere in the app', () => {
    // Matched as a URL, not as a word. The changelog and release notes NAME
    // fonts.googleapis.com when describing the commit that stopped using it
    // (changelog 148) -- that is the record of a privacy fix and deleting it
    // would be the actual loss. What must not exist is a fetchable URL.
    const HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'googletagmanager.com', 'google-analytics.com'];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).split('\\').join('/');
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const host of HOSTS) {
        const asUrl = new RegExp(`(https?:)?//${host.replace(/\./g, '\\.')}`);
        expect(asUrl.test(code), `${rel} loads from ${host}`).toBe(false);
      }
    }
  });
});

describe('privacy tenet: the entitlement token carries what the policy says, and no more', () => {
  // The minting script ships only in the private repository.
  it.skipIf(!existsSync(join(ROOT, 'scripts', 'mint-premium-jwt.mjs')))('carries the address it was issued to, the premium flag and its lifetime', () => {
    // privacy.html, "If You Email Us": the key holds the email address we
    // sent it to, the Premium flag and the expiry, nothing else. A billing
    // system is the likely reason someone would add a claim; this is what
    // stops that shipping silently.
    const minter = readFileSync(join(ROOT, 'scripts', 'mint-premium-jwt.mjs'), 'utf8');
    const claims = /new SignJWT\(([^)]*)\)/.exec(minter)[1].replace(/\s/g, '');
    expect(claims, 'the Premium token gained a claim -- privacy.html lists what it has')
      .toBe('{premium:true,licensedTo}');
    // iat dated each key to the second it was minted; the address already
    // says whose it is, and nothing else needs to.
    expect(minter).not.toMatch(/setIssuedAt/);
  });
});
