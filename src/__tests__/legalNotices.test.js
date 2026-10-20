// Copyright, license and terms -- the things the product shipped without
// until 2026-09-20.
//
// Before this commit there was no LICENSE file, no copyright notice in the
// app itself, and no terms of any kind: the only legal text a user had ever
// been shown was the educational-tool disclaimer, which says the numbers are
// not advice and nothing else. Nothing said what a reader of the delivered
// JavaScript may do with it, and nothing limited what we are answerable for
// when a projection is wrong.
//
// The failure mode this guards against is the one privacyTenets.test.js was
// written for: a legal page written once while the software keeps moving.
// Terms that name a license the repo does not carry, or a footer that names a
// company that is not the copyright holder, are worse than none -- they look
// settled. So these are assertions about the LINKS and the NAMES, the two
// things that go stale silently.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SRC, '..');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');

const ENTITY = 'OutlastRetirement LLC';

// Two states, one test file. The working repository is proprietary; the
// public repository scripts/export-public.mjs builds from it carries the
// AGPL. The LICENSE file says which this checkout is, and package.json has
// to agree with it either way.
describe('the repository is licensed', () => {
  const license = existsSync(join(ROOT, 'LICENSE')) ? read('LICENSE') : '';
  const isPublic = /GNU AFFERO GENERAL PUBLIC LICENSE/.test(license);

  it('carries a LICENSE, and the copyright holder is named (in NOTICE for the public repo)', () => {
    expect(license, 'no LICENSE file').not.toBe('');
    if (isPublic) {
      // LICENSE is the verbatim AGPL so license detection works; the
      // copyright notice sits beside it in NOTICE.
      expect(license).toMatch(/Version 3, 19 November 2007/);
      expect(license).not.toContain(ENTITY);
      expect(read('NOTICE')).toContain(ENTITY);
    } else {
      expect(license).toContain(ENTITY);
      expect(license).toMatch(/All rights reserved/i);
    }
  });

  it('package.json agrees with the LICENSE file', () => {
    // `license` absent from package.json is not neutral -- npm and every
    // tool that reads it treat a missing field as unspecified, and a
    // dependency-scanner report of "unknown" invites someone to "fix" it
    // with MIT. UNLICENSED is the registry's word for proprietary; the
    // public repo names the AGPL by its SPDX id.
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.license, 'package.json declares no license').toBe(isPublic ? 'AGPL-3.0-only' : 'UNLICENSED');
    expect(pkg.private, 'the package is publishable to npm').toBe(true);
  });

  it('does not claim to grant rights the LICENSE withholds', () => {
    // An MIT/Apache permission grant pasted in beside "all rights reserved"
    // (or beside a copyleft license) is a contradiction a court reads
    // against the drafter -- us.
    expect(license).not.toMatch(/Permission is hereby granted, free of charge/i);
  });
});

describe('the terms of use are reachable from everywhere they apply', () => {
  const TERMS = '/terms';

  it('exists as a page', () => {
    expect(existsSync(join(ROOT, 'public', 'terms.html')), 'no terms.html').toBe(true);
  });

  // The app is where the software is actually used, so it is where the terms
  // have to be reachable -- a link on the marketing page only covers people
  // who arrived through the front door.
  for (const [name, file] of [
    ['the app footer', join('src', 'App.jsx')],
    ['Preferences', join('src', 'components', 'tabs', 'PreferencesTab.jsx')],
    ['the landing page', 'index.html'],
    ['the privacy policy', join('public', 'privacy.html')],
  ]) {
    it(`${name} links to the terms`, () => {
      const source = read(file);
      // Either a literal href or the TERMS_URL constant that resolves to it.
      const linked = source.includes(`href="${TERMS}"`) || /href=\{TERMS_URL\}/.test(source);
      expect(linked, `${name} has no route to ${TERMS}`).toBe(true);
    });
  }

  it('is listed in the sitemap alongside the policy', () => {
    const sitemap = read('public', 'sitemap.xml');
    expect(sitemap).toContain('https://www.outlastretirement.com/terms');
  });

  it('can actually be replied to', () => {
    // Same trap privacy.html fell into: a contact address on a legal page
    // at a domain this project does not own (privacy@retireplan.app, until
    // 2026-09-12).
    const terms = read('public', 'terms.html');
    const mailtos = [...terms.matchAll(/mailto:([^"?]+)/g)].map((m) => m[1]);
    expect(mailtos.length).toBeGreaterThan(0);
    for (const address of mailtos) expect(address).toBe('hello@outlastretirement.com');
  });

  it('no page offers a Gmail address to write to, and security reports go to security@', () => {
    // The contact addresses moved to the outlastretirement.com domain
    // (2026-10-19). The privacy policy still NAMES the old Gmail address,
    // to say mail to it is forwarded, but nothing links to it.
    const pages = ['index.html', ...readdirSync(join(ROOT, 'public')).filter((f) => f.endsWith('.html')).map((f) => join('public', f))];
    for (const f of pages) expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(/mailto:[^"]*@gmail\.com/i);
    expect(readFileSync(join(ROOT, 'public', '.well-known', 'security.txt'), 'utf8')).toMatch(/^Contact: mailto:security@outlastretirement\.com$/m);
  });

  it('names the company, not just the product', () => {
    // "OutlastRetirement" alone is a brand. A limitation of liability and a
    // copyright notice have to name the entity that holds them.
    const terms = read('public', 'terms.html');
    expect(terms).toContain(ENTITY);
    expect(terms).toMatch(/<h2>Limitation of Liability<\/h2>/);
    expect(terms).toMatch(/<h2>No Warranty<\/h2>/);
  });

  it('still disclaims advice, in the terms and not only in the app modal', () => {
    // The disclaimer the user accepts on first visit is a modal they dismiss.
    // The same claim has to exist somewhere binding.
    const terms = read('public', 'terms.html');
    expect(terms).toMatch(/not a financial adviser/i);
  });
});

describe('the copyright notice names one owner everywhere', () => {
  // Three surfaces carried "© 2026 OutlastRetirement" -- the product name,
  // which identifies no legal person. They now name the company, and a
  // fourth (the app itself) has a notice at all. Counted rather than
  // spot-checked because the failure is one surface being missed in a
  // rename, which is exactly what a per-file assertion catches and a
  // "somewhere in the repo" assertion does not.
  for (const [name, file] of [
    ['the landing page', 'index.html'],
    ['the privacy policy', join('public', 'privacy.html')],
    ['the terms of use', join('public', 'terms.html')],
    ['the accessibility statement', join('public', 'accessibility.html')],
    ['the not-found page', join('public', '404.html')],
    ['the Free and Premium page', join('public', 'premium.html')],
    ['the release notes', join('public', 'changelog.html')],
    ['How the math works', join('public', 'how-the-math-works.html')],
  ]) {
    it(`${name} names ${ENTITY}`, () => {
      const source = read(file);
      expect(source, `${name} has no copyright line`).toMatch(/©\s*2026\s*OutlastRetirement LLC/);
    });
  }

  it('gives the app its own notice, from the shared constant', () => {
    const branding = read('src', 'config', 'branding.js');
    expect(branding).toMatch(/export const LEGAL_ENTITY = 'OutlastRetirement LLC';/);
    // A clock-read year is the VISITOR's year, not a publication fact.
    // Comments stripped first: this file EXPLAINS why it does not read the
    // clock, and matching the word rather than the call failed on the
    // explanation -- the same shape as the renamed-symbol trap that let a
    // disabled assertNetworkAllowed pass its own guard.
    const brandingCode = branding.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(brandingCode, 'the notice reads the visitor clock').not.toMatch(/getFullYear/);
    expect(read('src', 'App.jsx')).toContain('COPYRIGHT_NOTICE');
  });

  it('leaves no surface claiming the product name holds the copyright', () => {
    for (const file of ['index.html', join('public', 'privacy.html'), join('public', 'terms.html'), join('public', 'accessibility.html')]) {
      const source = read(file);
      // "© 2026 OutlastRetirement ·" -- the old shape, product name only.
      const bare = [...source.matchAll(/©\s*2026\s+OutlastRetirement(?!\s+LLC)/g)];
      expect(bare.map((m) => m[0]), `${file} still credits the product name`).toEqual([]);
    }
  });
});
