// React.lazy with one recovery step for a stale page (review 4.12).
//
// Every lazily loaded chunk has a content hash in its file name. A tab left
// open across a deploy still runs the OLD app, which asks for the OLD
// hashes; once those are gone from the server (and from a service worker
// that has since updated), the first lazy import fails and the tab shows an
// error instead of the page the person clicked. Reloading fetches the new
// app, whose imports exist.
//
// The reload happens at most once per failure streak: a sessionStorage flag
// records it, so a chunk that is genuinely broken (or a network that is
// down) surfaces as the normal error instead of reloading forever. The flag
// clears on the next chunk that loads, so a later deploy gets its own
// reload.
import React from 'react';

export const CHUNK_RELOAD_KEY = 'retire_plan_chunk_reload';

const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading (CSS )?chunk .* failed/i;

export function isChunkLoadError(err) {
  if (!err) return false;
  if (err.name === 'ChunkLoadError') return true;
  return CHUNK_ERROR.test(String(err.message || err));
}

function safeStorage() {
  try { return window.sessionStorage; } catch { return null; }
}

export function importWithRetry(factory, {
  storage = safeStorage(),
  reload = () => window.location.reload(),
} = {}) {
  return factory().then(
    (mod) => {
      try { if (storage) storage.removeItem(CHUNK_RELOAD_KEY); } catch { /* nothing to clear */ }
      return mod;
    },
    (err) => {
      if (!isChunkLoadError(err) || !storage) throw err;
      let alreadyReloaded = true;
      try { alreadyReloaded = storage.getItem(CHUNK_RELOAD_KEY) !== null; } catch { /* treat as reloaded */ }
      if (alreadyReloaded) throw err;
      try { storage.setItem(CHUNK_RELOAD_KEY, String(Date.now())); } catch { throw err; }
      reload();
      // The page is going away; never settle, so nothing renders an error
      // in the moment before it does.
      return new Promise(() => {});
    },
  );
}

export function lazyWithRetry(factory) {
  return React.lazy(() => importWithRetry(factory));
}
