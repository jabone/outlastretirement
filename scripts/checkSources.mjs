#!/usr/bin/env node
// Year-end source review: fetch every official page the app cites and say
// which ones need a person to look at them. Maintainers only; nothing in the
// app runs this, and the test suite never does (it needs the network).
//
//   npm run check:sources            # markdown report on stdout
//   npm run check:sources > report.md
//
// For each entry in src/config/sources.js it reports the HTTP status, the
// final URL when the page redirected, whether the page still contains each
// phrase in the entry's optional `expect` list (the figures its note
// quotes), and whether its `verified` date is more than 12 months old. It
// also lists which cards in Help -> How the numbers are figured
// (src/config/howFigured.js) cite each source, so a changed page points
// straight at the text to re-read.
//
// Requests are sequential and polite: one at a time, a pause between them,
// a 20 second timeout, and a user agent that says what this is. PDFs are
// converted with `pdftotext` when it is installed (poppler); without it,
// their phrases are reported as not checked rather than as missing.
//
// Behind a proxy (a corporate network, a sandbox), run with
// NODE_USE_ENV_PROXY=1 so Node's fetch honors HTTPS_PROXY (Node 22.21+).
//
// Exit code 1 when anything needs attention, so a scheduled job can notice.
// See TAX_UPDATE_PROCESS.md, "Year-end source review (every December)".
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { SOURCES } = await import(pathToFileURL(join(ROOT, 'src/config/sources.js')).href);

const TIMEOUT_MS = 20000;
const PAUSE_MS = 1200;
const STALE_DAYS = 365;
const USER_AGENT = 'OutlastRetirement-source-check/1.0 (yearly check of cited official pages; https://outlastretirement.com)';

// Which How-figured cards cite each source. Read as text: howFigured.js
// imports the engine, which plain Node cannot load without the bundler.
function citingRules() {
  const text = readFileSync(join(ROOT, 'src/config/howFigured.js'), 'utf8');
  const map = {};
  for (const m of text.matchAll(/id: '([a-z0-9-]+)',[\s\S]*?sources: \[([^\]]*)\]/g)) {
    for (const s of m[2].matchAll(/'([^']+)'/g)) (map[s[1]] ||= []).push(m[1]);
  }
  return map;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: '-', mdash: '-', frac12: '½', sect: '§' };
export function normalize(s) {
  return s
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z][a-z0-9]*);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function pdfText(buffer) {
  const dir = mkdtempSync(join(tmpdir(), 'srccheck-'));
  try {
    const f = join(dir, 'doc.pdf');
    writeFileSync(f, buffer);
    return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const daysSince = (iso) => Math.floor((Date.now() - Date.parse(`${iso}T00:00:00Z`)) / 86400000);

export async function check(src) {
  const out = { id: src.id, url: src.url, status: null, finalUrl: null, phrases: [], error: null, pdfUnread: false };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(src.url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/pdf;q=0.9,*/*;q=0.8' } });
    out.status = res.status;
    if (res.url && res.url !== src.url) out.finalUrl = res.url;
    const type = res.headers.get('content-type') || '';
    let text = null;
    if (res.ok) {
      if (/pdf/i.test(type) || /\.pdf($|\?)/i.test(res.url || src.url)) {
        text = pdfText(Buffer.from(await res.arrayBuffer()));
        if (text === null) out.pdfUnread = true;
      } else {
        text = await res.text();
      }
    }
    if (text !== null && Array.isArray(src.expect)) {
      const hay = normalize(text);
      out.phrases = src.expect.map((p) => ({ phrase: p, found: hay.includes(normalize(p)) }));
    }
  } catch (err) {
    out.error = err.name === 'AbortError' ? `timed out after ${TIMEOUT_MS / 1000} s` : ([err.cause?.code, err.cause?.message].filter(Boolean).join(' ') || err.message);
  } finally {
    clearTimeout(timer);
  }
  return out;
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|');

async function main() {
  const cites = citingRules();
  const results = [];
  for (const [i, src] of SOURCES.entries()) {
    process.stderr.write(`[${i + 1}/${SOURCES.length}] ${src.id}\n`);
    results.push({ src, r: await check(src) });
    if (i < SOURCES.length - 1) await sleep(PAUSE_MS);
  }

  const attention = [];
  const rows = results.map(({ src, r }) => {
    const flags = [];
    if (r.error) flags.push(`unreachable: ${r.error}`);
    else if (r.status >= 400) flags.push(`HTTP ${r.status}`);
    if (r.finalUrl) flags.push('redirected');
    const missing = r.phrases.filter((p) => !p.found).map((p) => p.phrase);
    if (missing.length) flags.push(`missing: ${missing.join(', ')}`);
    if (r.pdfUnread && src.expect) flags.push('PDF not read (install pdftotext)');
    if (!src.verified) flags.push('no verified date');
    else if (daysSince(src.verified) > STALE_DAYS) flags.push(`verified ${src.verified}, over 12 months ago`);
    if (flags.length) attention.push({ src, r, flags });
    const phraseCell = !src.expect ? '-' : r.pdfUnread ? 'not checked' : r.phrases.length ? `${r.phrases.filter((p) => p.found).length}/${r.phrases.length}` : 'not checked';
    return `| ${cell(src.id)} | ${r.error ? 'error' : r.status} | ${cell(r.finalUrl || '')} | ${phraseCell} | ${src.verified || '-'} | ${cell((cites[src.id] || []).join(', '))} | ${cell(flags.join('; ') || 'ok')} |`;
  });

  const ok = results.length - attention.length;
  const lines = [
    '# Official source check',
    '',
    `Run ${new Date().toISOString().slice(0, 10)}: ${results.length} sources, ${ok} fine, ${attention.length} need a look.`,
    '',
  ];
  if (attention.length) {
    lines.push('## Needs attention', '');
    for (const { src, r, flags } of attention) {
      lines.push(`- **${src.id}** (${src.publisher}): ${flags.join('; ')}`);
      lines.push(`  - ${src.url}${r.finalUrl ? ` -> ${r.finalUrl}` : ''}`);
      if (cites[src.id]) lines.push(`  - cited by: ${cites[src.id].join(', ')}`);
    }
    lines.push('');
  }
  lines.push('## Every source', '', '| Source | HTTP | Redirected to | Phrases found | Verified | Cited by | Result |', '|---|---|---|---|---|---|---|', ...rows, '');
  process.stdout.write(lines.join('\n'));
  process.exitCode = attention.length ? 1 : 0;
}

// Run only when invoked directly, so the helpers can be imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
