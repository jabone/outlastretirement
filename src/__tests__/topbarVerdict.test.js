// The phone top bar states the plan's verdict in words (changelog 325). It
// was a bare green/red dot: color only (WCAG 1.4.1), no label, hidden from
// screen readers, and driven by the old pass/fail flag rather than the one
// verdict (utils/planVerdict.js) the sidebar and Dashboard state.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(SRC, 'App.jsx'), 'utf8');
const css = readFileSync(join(SRC, 'index.css'), 'utf8');

describe('phone top bar verdict', () => {
  const bar = app.slice(app.indexOf('<div className="mobile-topbar">'), app.indexOf('</div>', app.indexOf('<div className="mobile-topbar">')));

  it('shows the shared verdict’s label, named for screen readers, and links to the Dashboard', () => {
    expect(bar).toMatch(/className=\{`mobile-topbar-verdict \$\{verdictClass\(verdict\.tone\)\}`\}/);
    expect(bar).toMatch(/<span className="mobile-topbar-verdict-dot" aria-hidden="true" \/>\s*\{verdict\.label\}\s*<\/a>/);
    expect(bar).toMatch(/aria-label=\{`Plan status: \$\{verdict\.label\}\. \$\{verdict\.detail\}`\}/);
    expect(bar).toMatch(/href=\{formatHash\(DEFAULT_TAB\)\}/);
  });

  it('no longer uses the pass/fail flag or a color-only dot', () => {
    expect(bar).not.toMatch(/kpis\.isSuccessful/);
    expect(app).not.toMatch(/mobile-topbar-status-dot/);
    expect(css).not.toMatch(/mobile-topbar-status-dot/);
  });

  it('is a comfortable tap target', () => {
    expect(css).toMatch(/\.mobile-topbar-verdict \{[^}]*min-height: 32px;/);
  });
});
