// scripts/updateSitemapDates.mjs: each sitemap date follows the last
// change to that page's file. The dates themselves depend on git history,
// so this checks the rewrite and that every listed page has a file.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateSitemap, fileForPath } from '../../scripts/updateSitemapDates.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sitemap = readFileSync(join(ROOT, 'public', 'sitemap.xml'), 'utf8');

describe('sitemap dates', () => {
  it('every listed page has a file the date can come from', () => {
    const paths = [...sitemap.matchAll(/<loc>https:\/\/www\.outlastretirement\.com([^<]*)<\/loc>/g)].map((m) => m[1] || '/');
    expect(paths.length).toBeGreaterThan(10);
    for (const p of paths) expect(fileForPath(p, ROOT), p).not.toBeNull();
  });

  it('rewrites only the dates, page by page', () => {
    const xml = '<url>\n  <loc>https://www.outlastretirement.com/privacy</loc>\n  <lastmod>2026-01-01</lastmod>\n</url><url><loc>https://www.outlastretirement.com/</loc><lastmod>2026-01-01</lastmod></url>';
    const out = updateSitemap(xml, (p) => (p === '/privacy' ? '2026-10-19' : null));
    expect(out).toContain('<loc>https://www.outlastretirement.com/privacy</loc>\n  <lastmod>2026-10-19</lastmod>');
    expect(out).toContain('<loc>https://www.outlastretirement.com/</loc><lastmod>2026-01-01</lastmod>');
  });

  it('every date is a real date', () => {
    for (const m of sitemap.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)) expect(m[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
