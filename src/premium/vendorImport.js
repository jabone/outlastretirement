// Library files a signed Premium module loads after it runs: pdf.js and its
// worker for statement import, and two small stubs that look up the chart
// components and the pricing script in this app. They are third-party code
// (or one-line lookups), served from the module server without a key, and
// they are not signed themselves. Until changelog 444 a module loaded them
// with a plain import() of the module server's URL, which the CSP allowed,
// so the app trusted the server to serve them unaltered.
//
// Now the module's build records each file's SHA-256 inside the signed
// chunk, and the chunk asks this function for the file instead of importing
// it: the app fetches the bytes, checks them against that hash, and runs
// them from a blob: URL. A file that does not match is never run. Since
// nothing from the module server is imported directly any more, the CSP's
// script-src no longer names it (it stays in connect-src, for the fetch).
//
// Contract (PREMIUM_MODULE_CONTRACT.md 2.9): importVerified(url, integrity)
// where `integrity` is "sha256-<base64>", the subresource-integrity form.
// Returns the module namespace, like import(). Only URLs under the module
// server's /modules/vendor/ are accepted.

// The same server, and the same development override, as registry.js;
// kept here rather than imported so the host library (which publishes this
// function) does not pull the loader in with it. vendorImport444.test.js
// holds the two equal.
export const VENDOR_SERVER = 'https://premium.outlastretirement.com';
const configured = (import.meta.env?.VITE_PREMIUM_ORIGIN || '').replace(/\/+$/, '');
const DEV_ORIGIN = configured && import.meta.env?.DEV ? configured : '';

import { assertNetworkAllowed } from '../utils/localOnlyMode';

const cache = new Map(); // url -> Promise<namespace>

function fail(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function allowedVendorUrl(url) {
  const origins = new Set([VENDOR_SERVER, DEV_ORIGIN].filter(Boolean));
  try {
    const u = new URL(url);
    return [...origins].some((o) => `${u.origin}` === o) && u.pathname.startsWith('/modules/vendor/') && !u.search && !u.hash;
  } catch {
    return false;
  }
}

export async function sha256Integrity(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256-${bytesToBase64(digest)}`;
}

// Replaced in tests; runs verified source as a module.
let runModule = async (text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  try {
    return await import(/* @vite-ignore */ url);
  } finally {
    URL.revokeObjectURL(url);
  }
};

export function importVerified(url, integrity) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    if (!allowedVendorUrl(url)) throw fail(`Premium library file ${url} is not on the module server`, 'VENDOR_ORIGIN');
    if (typeof integrity !== 'string' || !/^sha256-[A-Za-z0-9+/]+=*$/.test(integrity)) {
      throw fail(`Premium library file ${url} came without a fingerprint`, 'VENDOR_NO_INTEGRITY');
    }
    // Local-Only Mode means no network requests at all, this one included.
    assertNetworkAllowed();
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw fail(`Premium library file ${url} answered ${res.status}`, 'VENDOR_FETCH');
    const bytes = new Uint8Array(await res.arrayBuffer());
    const actual = await sha256Integrity(bytes);
    if (actual !== integrity) throw fail(`Premium library file ${url} does not match its fingerprint`, 'VENDOR_INTEGRITY');
    return runModule(new TextDecoder().decode(bytes));
  })();
  // A failure is not cached: the next attempt fetches again.
  p.catch(() => cache.delete(url));
  cache.set(url, p);
  return p;
}

export function __resetVendorCache() { cache.clear(); }
export function __setVendorRunner(fn) { runModule = fn; }
