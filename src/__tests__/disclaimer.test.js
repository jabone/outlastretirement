// The disclaimer text now has four consumers -- the first-visit modal, the
// re-readable copy, the footer line under every tab, and the printed
// report's repeating footer. That is the same shape that let three copies
// of "back up everything" drift apart (see useFullBackupActions.js), and a
// legal notice drifting is worse than a button drifting: the version a
// user actually read would depend on where they were standing.
//
// These tests assert the properties that matter if someone edits the text
// later, not the wording itself -- pinning exact prose would just make the
// tests something to silence.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  DISCLAIMER_TITLE,
  DISCLAIMER_PARAGRAPHS,
  DISCLAIMER_ACCEPT_LABEL,
  DISCLAIMER_SHORT,
  DISCLAIMER_PRINT,
} from '../config/disclaimer';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

describe('disclaimer text', () => {
  it('is non-empty everywhere it is consumed', () => {
    expect(DISCLAIMER_TITLE.trim().length).toBeGreaterThan(0);
    expect(DISCLAIMER_PARAGRAPHS.length).toBeGreaterThanOrEqual(3);
    DISCLAIMER_PARAGRAPHS.forEach((p) => expect(p.trim().length).toBeGreaterThan(40));
    expect(DISCLAIMER_ACCEPT_LABEL.trim().length).toBeGreaterThan(0);
  });

  // The substantive claim. If an edit ever drops "not advice" from the
  // full text, that is the one thing this notice exists to say.
  it('says plainly that it is not advice, in every variant', () => {
    const full = DISCLAIMER_PARAGRAPHS.join(' ');
    for (const [label, text] of [['full', full], ['short', DISCLAIMER_SHORT], ['print', DISCLAIMER_PRINT]]) {
      expect(text.toLowerCase(), `${label} variant must disclaim advice`).toMatch(/advice/);
      expect(text.toLowerCase(), `${label} variant must name the domains`).toMatch(/financial|tax|legal|investment/);
    }
  });

  it('keeps the on-screen line short enough to actually be read', () => {
    // It sits under every tab permanently. A paragraph there gets tuned
    // out within a day, which is worse than a sentence that gets read.
    expect(DISCLAIMER_SHORT.length).toBeLessThan(120);
    expect(DISCLAIMER_PRINT.length).toBeGreaterThan(DISCLAIMER_SHORT.length);
  });

  // The drift guard. App.jsx must render from this module, not from its
  // own copy of the words.
  it('is the single source App.jsx renders from', () => {
    const app = read('App.jsx');
    expect(app).toMatch(/from '\.\/config\/disclaimer'/);
    for (const token of ['DISCLAIMER_TITLE', 'DISCLAIMER_PARAGRAPHS', 'DISCLAIMER_SHORT', 'DISCLAIMER_PRINT']) {
      expect(app, `App.jsx should render ${token} rather than inlining it`).toContain(token);
    }
    // And no hardcoded copy left behind.
    expect(app).not.toContain('is designed solely for educational, informational');
  });

  it('renders the acceptance gate and the re-readable copy from the same paragraphs', () => {
    const app = read('App.jsx');
    const uses = [...app.matchAll(/DISCLAIMER_PARAGRAPHS\.map/g)];
    expect(uses.length, 'both the first-visit modal and the review modal should map the same array').toBe(2);
  });
});
