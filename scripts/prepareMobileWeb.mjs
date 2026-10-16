// Builds the folder the native (Capacitor) apps load: dist-mobile/.
//
// The web build puts the marketing page at dist/index.html and the app at
// dist/app/index.html. Capacitor opens its webDir's index.html, so pointing
// it at dist opened the native app on the brochure. This copies the web
// build and makes the APP the root page. The app's asset URLs are absolute
// (/assets/...), which is right here too: Capacitor serves webDir at the
// root of its local origin. The marketing documents stay in the copy, so
// the in-app Terms / Privacy links still resolve inside the native shell.
//
// Usage: node scripts/prepareMobileWeb.mjs [distDir] [outDir]
import { cpSync, existsSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function prepareMobileWeb(distDir, outDir) {
  const appHtml = resolve(distDir, 'app', 'index.html');
  if (!existsSync(appHtml)) {
    throw new Error(`${appHtml} not found -- run vite build first.`);
  }
  rmSync(outDir, { recursive: true, force: true });
  cpSync(distDir, outDir, { recursive: true });
  // The app is the entry page.
  copyFileSync(resolve(outDir, 'app', 'index.html'), resolve(outDir, 'index.html'));
  // No service worker in the native shell: the app's files ship inside the
  // installed package, and a worker's cache would keep serving the previous
  // version's files after a store update. Without sw.js, registration fails
  // quietly and the app runs as it does in a browser without workers.
  for (const f of readdirSync(outDir)) {
    if (f === 'sw.js' || /^workbox-.*\.js$/.test(f)) rmSync(resolve(outDir, f));
  }
  return outDir;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  const dist = resolve(root, process.argv[2] || 'dist');
  const out = resolve(root, process.argv[3] || 'dist-mobile');
  prepareMobileWeb(dist, out);
  console.log(`Native web assets ready in ${out}`);
}
