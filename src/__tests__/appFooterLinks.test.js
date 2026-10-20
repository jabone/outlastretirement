// The app's footer links the static documents the app itself is governed
// by. Privacy was missing until 2026-10-19, though every public page's
// footer had it; this pins the set.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVACY_URL, TERMS_URL, ACCESSIBILITY_URL } from '../config/branding';

const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'App.jsx'), 'utf8');
const footer = app.slice(app.indexOf('app-disclaimer-footer-link'), app.indexOf('app-disclaimer-footer-promise'));

describe('the app footer', () => {
  it('links the privacy policy, the terms, accessibility and the verify page', () => {
    expect(PRIVACY_URL).toBe('/privacy');
    expect(footer).toMatch(/href=\{PRIVACY_URL\}[^>]*>\s*Privacy\s*</);
    expect(footer).toMatch(/href=\{TERMS_URL\}[^>]*>\s*Terms\s*</);
    expect(footer).toMatch(/href=\{ACCESSIBILITY_URL\}[^>]*>\s*Accessibility\s*</);
    expect(footer).toMatch(/href="\/verify"[^>]*>\s*Verify it yourself\s*</);
    expect(TERMS_URL && ACCESSIBILITY_URL).toBeTruthy();
  });
});
