// The Content-Security-Policy is what turns "we don't send your numbers
// anywhere" into "the browser won't let us." It is set once, in vercel.json,
// for every path. These tests pin the parts that carry the promise:
//
//   - connect-src: the only hosts the app may fetch from are its own and the
//     Google hosts Live Pricing talks to (the user's own Sheet and Apps
//     Script, which Google serves from googleusercontent.com after a
//     redirect). Adding any other host has to be a deliberate edit here.
//   - script-src 'self' plus blob: -- no inline scripts, no eval, no other
//     origin. blob: is for the Premium loader (src/premium/registry.js),
//     which runs a chunk only after verifying its Ed25519 signature
//     against the public key built into the app, and for the library files
//     a verified chunk loads (src/premium/vendorImport.js), which run only
//     after their bytes match the SHA-256 the signed chunk carries. Until
//     changelog 444 the module server was listed here so a chunk could
//     import those files directly, unchecked.
//   - connect-src also names the Premium module server, which receives the
//     Premium Access key (as a header) and nothing else; see
//     public/privacy.html, "Premium Modules".
//   - img-src / font-src: no remote hosts, which closes the old trick of
//     smuggling data out in an image or font URL.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function parseCsp(value) {
  const out = {};
  for (const part of value.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out[name] = sources;
  }
  return out;
}

function cspFromVercel(json) {
  const rule = (json.headers || []).find((h) => h.source === '/(.*)');
  const header = rule && rule.headers.find((h) => h.key.toLowerCase() === 'content-security-policy');
  return header ? header.value : null;
}

// An inline script that the browser would EXECUTE (JSON-LD is data, not code,
// and is not governed by script-src).
export function inlineScripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/\bsrc=/.test(m[1]))
    .filter((m) => !/type="application\/ld\+json"/.test(m[1]))
    .map((m) => m[2].trim().slice(0, 60));
}

const LIVE_PRICING_HOSTS = ['https://script.google.com', 'https://docs.google.com', 'https://*.googleusercontent.com'];
const PREMIUM_MODULE_SERVER = 'https://premium.outlastretirement.com';

describe('Content-Security-Policy (vercel.json)', () => {
  const csp = cspFromVercel(JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')));
  const d = csp ? parseCsp(csp) : {};

  it('is set on every path', () => {
    expect(csp).toBeTruthy();
  });

  it('lets the app fetch only from itself, Live Pricing’s Google hosts, and the Premium module server', () => {
    expect([...d['connect-src']].sort()).toEqual(["'self'", ...LIVE_PRICING_HOSTS, PREMIUM_MODULE_SERVER].sort());
  });

  it('runs only the site’s own script files, plus verified Premium chunks and library files', () => {
    expect(d['default-src']).toEqual(["'self'"]);
    expect(d['script-src']).toEqual(["'self'", 'blob:']);
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['base-uri']).toEqual(["'self'"]);
    expect(d['frame-ancestors']).toEqual(["'none'"]);
  });

  it('starts a worker only from this origin or a blob it made (the pdf.js worker, changelog 431)', () => {
    expect(d['worker-src']).toEqual(["'self'", 'blob:']);
  });

  it('loads images, fonts and workers from no other host', () => {
    for (const name of ['img-src', 'font-src', 'worker-src', 'style-src', 'manifest-src', 'form-action']) {
      expect(d[name], name).toBeTruthy();
      expect(d[name].filter((s) => /^https?:|^\*/.test(s)), name).toEqual([]);
    }
  });

  it('allows the hosts the Live Pricing setup asks for', () => {
    // utils/pricingSource.js is the allowlist the app enforces on pasted
    // pricing URLs; the CSP must let each of those hosts through.
    const src = readFileSync(join(ROOT, 'src', 'utils', 'pricingSource.js'), 'utf8');
    for (const host of ['https://script.google.com', 'https://docs.google.com']) {
      expect(src).toContain(host.replace('https://', ''));
      expect(d['connect-src']).toContain(host);
    }
  });

  it('self-check: a wider policy would fail these rules', () => {
    const loose = parseCsp("default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://example.com");
    expect(loose['script-src']).not.toEqual(["'self'"]);
    expect([...loose['connect-src']].sort()).not.toEqual(["'self'", ...LIVE_PRICING_HOSTS].sort());
  });
});

describe('no page relies on inline script (script-src would block it)', () => {
  const pages = ['index.html', 'app/index.html', ...readdirSync(join(ROOT, 'public')).filter((f) => f.endsWith('.html')).map((f) => `public/${f}`)];

  for (const page of pages) {
    it(`${page} has no inline script or on* handler`, () => {
      const html = readFileSync(join(ROOT, page), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
      expect(inlineScripts(html)).toEqual([]);
      expect(html.match(/\son[a-z]+="/g) || []).toEqual([]);
    });
  }

  it('self-check: finds an inline script and ignores JSON-LD and src scripts', () => {
    expect(inlineScripts('<script>alert(1)</script>')).toHaveLength(1);
    expect(inlineScripts('<script type="application/ld+json">{}</script>')).toHaveLength(0);
    expect(inlineScripts('<script src="/home-installed.js"></script>')).toHaveLength(0);
  });
});

describe('offline precache', () => {
  it('includes the PDF.js worker (.mjs), so statement import works offline', () => {
    const config = readFileSync(join(ROOT, 'vite.config.js'), 'utf8');
    const glob = /globPatterns:\s*\['([^']+)'\]/.exec(config);
    expect(glob).not.toBeNull();
    expect(glob[1]).toMatch(/\bmjs\b/);
  });
});

// S6: the same policy ships inside the built app page as a <meta>, so a
// copy served without Vercel's headers (the Capacitor apps, a mirror) is
// still covered. frame-ancestors is not allowed in a meta and is dropped.
describe('Content-Security-Policy <meta> in the app page', () => {
  it('mirrors the vercel.json header minus frame-ancestors, for production builds only', async () => {
    const { cspMetaContent, default: config } = await import('../../vite.config.js');
    const header = parseCsp(cspFromVercel(JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))));
    const meta = parseCsp(cspMetaContent());
    const { 'frame-ancestors': dropped, ...rest } = header;
    expect(dropped).toEqual(["'none'"]);
    expect(meta).toEqual(rest);
    const plugin = config.plugins.flat().find((p) => p && p.name === 'outlast-csp-meta');
    expect(plugin.apply).toBe('build');
    const html = '<head><meta charset="UTF-8" /></head>';
    expect(plugin.transformIndexHtml.handler(html, { filename: '/x/app/index.html' })).toContain('http-equiv="Content-Security-Policy"');
    expect(plugin.transformIndexHtml.handler(html, { filename: '/x/index.html' })).toBe(html);
  });
});
