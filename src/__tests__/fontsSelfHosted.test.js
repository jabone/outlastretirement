// Guard: the app must not fetch fonts from a third party (changelog 148).
// Local-Only Mode promises zero network requests; a stray @import from
// fonts.googleapis.com in the CSS would silently break that and leak the
// visitor's IP to Google. Since 2026-11-14 the app links the same
// self-hosted copy the static pages use, /brand/fonts.css (copied from
// @fontsource-variable/*), rather than bundling the files a second time.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('fonts are self-hosted (changelog 148)', () => {
  it('index.css pulls no fonts (or anything) from a remote @import', () => {
    const css = readFileSync(resolve(root, 'index.css'), 'utf8');
    expect(css).not.toMatch(/@import\s+url\(\s*['"]?https?:/i);
    expect(css).not.toContain('fonts.googleapis.com');
    expect(css).not.toContain('fonts.gstatic.com');
  });

  it('the app links the shared self-hosted faces once, and the CSS vars name them', () => {
    const html = readFileSync(resolve(root, '..', 'app', 'index.html'), 'utf8');
    expect(html).toMatch(/<link rel="stylesheet" href="\/brand\/fonts\.css" \/>/);
    const main = readFileSync(resolve(root, 'main.jsx'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(main).not.toMatch(/import '@fontsource/);
    const faces = readFileSync(resolve(root, '..', 'public', 'brand', 'fonts.css'), 'utf8');
    expect(faces).toContain("font-family: 'Outfit Variable'");
    expect(faces).toContain("font-family: 'Plus Jakarta Sans Variable'");
    expect(faces).not.toMatch(/url\(\s*['"]?https?:/);
    const css = readFileSync(resolve(root, 'index.css'), 'utf8');
    expect(css).toContain("'Outfit Variable'");
    expect(css).toContain("'Plus Jakarta Sans Variable'");
  });

  it('the font packages are declared as dependencies', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, '..', 'package.json'), 'utf8'));
    expect(pkg.dependencies['@fontsource-variable/outfit']).toBeTruthy();
    expect(pkg.dependencies['@fontsource-variable/plus-jakarta-sans']).toBeTruthy();
  });
});
