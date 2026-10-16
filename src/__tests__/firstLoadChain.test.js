// The first load's critical chain, from PageSpeed's mobile run on
// 2026-09-28 (changelog 323): service-worker registration was the longest
// chain though nothing on screen needed it, and the two first-paint fonts
// were found only after the stylesheet arrived.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

describe('first load', () => {
  it('registers the service worker after the page has loaded, not during', () => {
    const main = read('src/main.jsx').replace(/\/\/.*$/gm, '');
    expect(main).toMatch(/window\.addEventListener\('load',\s*\(\)\s*=>\s*\{\s*initPWA\(\);\s*\},\s*\{\s*once:\s*true\s*\}\)/);
    // No unconditional call at the top level.
    expect(main).not.toMatch(/^initPWA\(\);/m);
  });

  it('preloads the two first-paint fonts from the files the stylesheet uses', () => {
    const html = read('app/index.html');
    const preloads = [...html.matchAll(/<link rel="preload" as="font" type="font\/woff2" crossorigin href="\/(node_modules\/[^"]+\.woff2)" \/>/g)].map((m) => m[1]);
    expect(preloads).toEqual([
      'node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2',
      'node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2',
    ]);
    for (const p of preloads) expect(existsSync(join(ROOT, p)), p).toBe(true);
  });
});
