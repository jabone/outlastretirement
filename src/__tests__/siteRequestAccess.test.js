// The site's pages ask for Premium the way the app does (changelog 474):
// the same three web mail compose links and the same copy-the-address steps,
// and no mailto: request link left anywhere.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CONTACT_EMAIL, REQUEST_SUBJECT, REQUEST_BODY } from '../config/premiumOffering';
import { WEBMAIL_SERVICES } from '../utils/webmailCompose';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

describe('asking for Premium on the website', () => {
  it('the home page block is current (run node scripts/generatePremiumPage.mjs)', () => {
    expect(() => execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'generatePremiumPage.mjs'), '--check'], { stdio: 'pipe' })).not.toThrow();
  });
  for (const page of ['index.html', 'public/premium.html']) {
    it(`${page} has the three compose links, the copy steps, and no mailto request`, () => {
      const html = read(page);
      for (const s of WEBMAIL_SERVICES) {
        expect(html).toContain(`href="${escAttr(s.url(CONTACT_EMAIL, REQUEST_SUBJECT, REQUEST_BODY))}"`);
        expect(html).toContain(`Write it in ${s.label}`);
      }
      expect(html).toContain(`data-copy="${CONTACT_EMAIL}"`);
      expect(html).toContain(`data-copy="${REQUEST_SUBJECT}"`);
      expect(html).toContain('<script src="/copy-text.js"></script>');
      expect(html).not.toMatch(/mailto:support@/);
      expect(html).not.toMatch(/mailto-fallback/);
    });
  }
  it('the copy script exists and is kept out of the app cache, like the other site scripts', () => {
    expect(read('public/copy-text.js')).toMatch(/button\[data-copy\]/);
    expect(read('vite.config.js')).toMatch(/'copy-text\.js'/);
  });
});
