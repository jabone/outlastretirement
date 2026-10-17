// "Erase everything on this device" (Preferences -> Your Data).
//
// The privacy policy and terms promise the user can erase what this app
// keeps on their device from Preferences -> Your Data. The only control
// there used to be Reset Plan to Defaults, which resets the active plan
// and leaves scenarios, holdings, the estate checklist, the Life Plan, the
// Premium key and the Live Pricing links in place. This is the control the
// promise describes.
//
// What goes:
//   * localStorage: every key under the app's prefixes (storageKeys.js),
//     then everything else on this origin -- the origin serves nothing but
//     this app, so nothing of anyone else's lives there;
//   * sessionStorage, the same way;
//   * the IndexedDB database holding the linked save file's handle (the
//     file itself, in the user's own folder, is not touched).
// What stays: the service worker's Cache Storage. It holds the app's own
// code (precached so the app opens offline) and no user data -- there is
// no runtime caching -- and removing it would leave an offline visitor
// with a page that cannot load after the reload below.
//
// Before anything is removed, every guarded write is held (safeStorage),
// so a React effect firing between the erase and the reload cannot write
// the old plan straight back.
import { APP_INDEXED_DB_NAMES, listAppKeys } from './storageKeys';
import { holdAllWrites } from './safeStorage';

function clearStorage(storage) {
  if (!storage) return;
  try {
    for (const key of listAppKeys(storage)) storage.removeItem(key);
    storage.clear();
  } catch (e) {
    console.error('Erase: could not clear a storage area', e);
  }
}

function deleteDatabase(idb, name, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    try {
      const req = idb.deleteDatabase(name);
      req.onsuccess = finish;
      req.onerror = finish;
      // "blocked" means a connection is still open; the delete completes
      // once it closes, which the reload that follows guarantees.
      req.onblocked = finish;
    } catch {
      finish();
    }
    setTimeout(finish, timeoutMs);
  });
}

export async function eraseEverythingOnDevice({
  local = globalThis.localStorage,
  session = globalThis.sessionStorage,
  idb = globalThis.indexedDB,
  timeoutMs = 1500,
} = {}) {
  holdAllWrites();
  clearStorage(local);
  clearStorage(session);
  if (idb && typeof idb.deleteDatabase === 'function') {
    await Promise.all(APP_INDEXED_DB_NAMES.map((name) => deleteDatabase(idb, name, timeoutMs)));
  }
}
