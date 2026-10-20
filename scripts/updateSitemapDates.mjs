// Sets each <lastmod> in public/sitemap.xml to the date of the last commit
// that changed that page's file, so the sitemap never claims a page is
// older (or newer) than it is. Run from the private repo before a release
// (OPERATIONS.md, "Ship it"), after committing the page changes:
//   node scripts/updateSitemapDates.mjs
// It rewrites only the dates; adding or removing a page is a hand edit.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.outlastretirement.com';

export function fileForPath(path, root = ROOT) {
  if (path === '/') return 'index.html';
  for (const f of [`public${path}.html`, `public${path}/index.html`]) if (existsSync(join(root, f))) return f;
  return null;
}

export function updateSitemap(xml, dateFor) {
  return xml.replace(/<loc>([^<]+)<\/loc>(\s*)<lastmod>[^<]*<\/lastmod>/g, (whole, loc, gap) => {
    const date = dateFor(loc.replace(SITE, '') || '/');
    return date ? `<loc>${loc}</loc>${gap}<lastmod>${date}</lastmod>` : whole;
  });
}

function main() {
  const path = join(ROOT, 'public', 'sitemap.xml');
  const before = readFileSync(path, 'utf8');
  const after = updateSitemap(before, (p) => {
    const f = fileForPath(p);
    if (!f) { console.warn(`no file for ${p}; date left as is`); return null; }
    return execSync(`git log -1 --format=%cs -- "${f}"`, { cwd: ROOT }).toString().trim() || null;
  });
  if (after !== before) writeFileSync(path, after);
  console.log(after === before ? 'sitemap dates already current' : 'sitemap dates updated');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
