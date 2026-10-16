// Guard: the app must not fetch fonts from a third party (changelog 148).
// Local-Only Mode promises zero network requests; a stray @import from
// fonts.googleapis.com in the CSS would silently break that and leak the
// visitor's IP to Google. Fonts are bundled via @fontsource-variable/*.
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

  it('the bundled font families are imported in main.jsx and referenced by the CSS vars', () => {
    const main = readFileSync(resolve(root, 'main.jsx'), 'utf8');
    expect(main).toContain('@fontsource-variable/outfit');
    expect(main).toContain('@fontsource-variable/plus-jakarta-sans');
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
