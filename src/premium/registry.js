// Where Premium modules come from: the Premium module server (the private
// repo's Vercel project, premium.outlastretirement.com). The loader sends
// the user's key, verifies the chunk's Ed25519 signature against the public
// key shipped in this bundle, and executes it. Client-side key, server-side
// delivery -- OPEN_CORE_PLAN.md decision 2. This repo holds no Premium code.
//
// VITE_PREMIUM_ORIGIN names the server. Unset (a bare checkout with no env),
// every Premium mount shows its locked card: there is nothing local to fall
// back to. For Premium development, point it at a local run of the Premium
// repo's server.
//
// A module is loaded at most once per page and the instance (the factory's
// return value) is cached by area. The factory is pure (contract section 4);
// components receive the live `host` as a prop.
import { AREAS, isCompatibleContract } from './contract';
import { assertNetworkAllowed } from '../utils/localOnlyMode';
import { PREMIUM_CHUNK_PUBLIC_KEY_BASE64 } from '../config/premiumChunkPublicKey';

// The only origin the CSP (vercel.json) lets the app fetch chunks from.
// Anything else in VITE_PREMIUM_ORIGIN is ignored outside development, so a
// misconfigured build cannot quietly send keys somewhere new.
export const PREMIUM_MODULE_SERVER = 'https://premium.outlastretirement.com';
const configured = (import.meta.env?.VITE_PREMIUM_ORIGIN || '').replace(/\/+$/, '');
export const PREMIUM_ORIGIN = configured && (configured === PREMIUM_MODULE_SERVER || import.meta.env?.DEV) ? configured : '';
export function isRemoteLoading() { return PREMIUM_ORIGIN !== ''; }

const cache = new Map(); // area -> Promise<moduleInstance>
const versions = new Map(); // area -> version string, once loaded
const testLoaders = new Map(); // area -> () => Promise<instance>; tests only

function fail(message, code) {
  const err = new Error(message);
  if (code) err.code = code;
  return err;
}

function checkInstance(area, instance) {
  if (!instance || instance.area !== area) throw fail(`Premium module "${area}" reported area "${instance?.area}"`);
  if (!isCompatibleContract(instance.contractVersion)) {
    throw fail(`Premium module "${area}" was built for contract ${instance.contractVersion}`, 'CONTRACT_MISMATCH');
  }
  return instance;
}

// --- remote ---------------------------------------------------------------

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

let verifyKeyPromise = null;
function chunkVerifyKey() {
  if (!verifyKeyPromise) {
    verifyKeyPromise = crypto.subtle.importKey('raw', base64ToBytes(PREMIUM_CHUNK_PUBLIC_KEY_BASE64), { name: 'Ed25519' }, false, ['verify']);
  }
  return verifyKeyPromise;
}

export async function verifyChunkSignature(bytes, signatureBase64) {
  if (!PREMIUM_CHUNK_PUBLIC_KEY_BASE64) return false;
  if (!signatureBase64) return false;
  const key = await chunkVerifyKey();
  return crypto.subtle.verify({ name: 'Ed25519' }, key, base64ToBytes(signatureBase64), bytes);
}

// Executes a signed chunk. The chunk is an IIFE that registers its factory
// on window.__OR_HOST__.modules[area]; it reads host packages and lib from
// the same object. Nothing is eval'd before the signature verifies.
let runChunk = async (text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  try {
    await import(/* @vite-ignore */ url);
  } finally {
    URL.revokeObjectURL(url);
  }
};

async function executeChunk(area, text) {
  // Lazy: hostLib pulls the data layer and shared components into one
  // chunk, which must not ride along with the startup bundle.
  const { publishHostLib } = await import('./hostLib');
  const hostLib = publishHostLib();
  await runChunk(text);
  const factory = hostLib.modules[area];
  if (typeof factory !== 'function') throw fail(`Premium chunk "${area}" did not register a factory`);
  return factory;
}

export async function loadRemote(area, token) {
  if (!token) throw fail('No Premium key', 'NO_KEY');
  // Local-Only mode: the app sends nothing, Premium included. The mount
  // shows a card saying so rather than loading over the user's objection.
  assertNetworkAllowed();
  if (!PREMIUM_CHUNK_PUBLIC_KEY_BASE64 && !import.meta.env?.DEV) {
    throw fail('This build has no chunk-signing key; remote Premium loading is off', 'NO_VERIFY_KEY');
  }
  const res = await fetch(`${PREMIUM_ORIGIN}/modules/${area}.js`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/javascript' },
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403) throw fail('Premium key not accepted', 'KEY_REJECTED');
  if (res.status === 404) throw fail(`No Premium module is published for "${area}"`, 'NOT_PUBLISHED');
  if (!res.ok) throw fail(`Premium module server answered ${res.status}`, 'SERVER');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const signature = res.headers.get('x-module-signature');
  const version = res.headers.get('x-module-version') || 'unknown';
  if (PREMIUM_CHUNK_PUBLIC_KEY_BASE64) {
    const ok = await verifyChunkSignature(bytes, signature);
    if (!ok) throw fail(`Premium module "${area}" failed signature verification`, 'BAD_SIGNATURE');
  }
  const factory = await executeChunk(area, new TextDecoder().decode(bytes));
  const instance = checkInstance(area, factory());
  return { ...instance, version: instance.version || version, servedVersion: version };
}

// --- public ---------------------------------------------------------------

export function loadModule(area, { token } = {}) {
  if (!AREAS.includes(area)) return Promise.reject(fail(`Unknown Premium area "${area}"`));
  if (!cache.has(area)) {
    const override = testLoaders.get(area);
    const p = override
      ? Promise.resolve().then(override).then((inst) => checkInstance(area, inst))
      : isRemoteLoading()
        ? loadRemote(area, token)
        : Promise.reject(fail('No Premium module server is configured for this build', 'NOT_CONFIGURED'));
    cache.set(area, p);
    p.then((inst) => versions.set(area, inst.version), () => cache.delete(area)); // a transient failure retries on next mount
  }
  return cache.get(area);
}

// Every loaded module's version, for Preferences (plan step 3).
export function loadedModuleVersions() {
  return Object.fromEntries(versions);
}

// Test seams only. __setModuleLoader installs a whole-area loader that
// bypasses fetch and signature checks but NOT the instance checks (area,
// contract version), which is what the mount tests are about.
export function __setModuleLoader(area, loader) { testLoaders.set(area, loader); cache.delete(area); }
export function __resetModuleCache() { cache.clear(); versions.clear(); testLoaders.clear(); }
export function __setChunkRunner(fn) { runChunk = fn; }
