// One guarded way to write localStorage.
//
// A bare localStorage.setItem throws when the browser's storage is full
// (QuotaExceededError) or unavailable. Called from a React effect, that
// throw unmounted the whole app into the crash screen -- which then told
// the user their data was safe, while their latest change was the one
// thing that had not been saved. Every plan write goes through here: a
// failed write returns false and raises STORAGE_WRITE_EVENT so the
// storage banner can say plainly what happened and what to do.
//
// It is also where "another tab changed your plan" takes effect: while a
// key is held (holdWrites), writes to it are refused, so this tab's older
// copy cannot silently overwrite the newer one the other tab just saved.
// The banner offers to load the newer version (a reload).
export const STORAGE_WRITE_EVENT = 'outlast:storage-write';

const held = new Set();
// Set by Erase everything on this device for the moments before its
// reload: nothing may be written back once the erase has started.
let allHeld = false;

export function holdWrites(keys) {
  for (const k of keys) held.add(k);
}
export function holdAllWrites() {
  allHeld = true;
}
export function releaseWrites() {
  held.clear();
  allHeld = false;
}
export function isWriteHeld(key) {
  return allHeld || held.has(key);
}

export function isQuotaError(err) {
  if (!err) return false;
  return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014;
}

function announce(detail) {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(STORAGE_WRITE_EVENT, { detail }));
    }
  } catch { /* announcing is best effort */ }
}

// Also exported for writers that already catch their own errors (the Life
// Plan, the estate checklist) so their failures reach the banner too.
export function notifyStorageWriteFailed(key, err) {
  announce({ key, ok: false, quota: isQuotaError(err) });
}

export function safeSetItem(key, value, storage = globalThis.localStorage) {
  if (isWriteHeld(key)) {
    announce({ key, ok: false, held: true });
    return false;
  }
  try {
    storage.setItem(key, value);
  } catch (err) {
    console.error(`Could not save "${key}" to this browser's storage`, err);
    notifyStorageWriteFailed(key, err);
    return false;
  }
  announce({ key, ok: true });
  return true;
}

export function safeRemoveItem(key, storage = globalThis.localStorage) {
  if (isWriteHeld(key)) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
