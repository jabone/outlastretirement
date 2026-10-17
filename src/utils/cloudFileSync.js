// "Save to a file that lives in your cloud folder."
//
// The app never talks to Google, Dropbox or Apple here -- there is no
// OAuth, no API key, no account, and no server. The user picks one file
// once (typically inside a folder their desktop sync client already
// watches: Google Drive, Dropbox, iCloud Drive, OneDrive), and Save writes
// the same JSON payload that Backup Everything downloads. Their own sync
// client moves it to the cloud and onto their other machines.
//
// Why this shape rather than a real Drive integration:
//
//  - A Drive/Dropbox integration means an OAuth consent screen, a client
//    id in a static bundle, and provider review to get past the free-tier
//    user caps (Google: 100 users and 7-day token expiry until the app is
//    verified; Dropbox: linking freezes shortly after 50 users). All of
//    that to move one JSON file the user could have saved themselves.
//  - It also puts this app between the user and their financial data,
//    which is the opposite of the promise made everywhere else in the
//    README and the Guide: the data never leaves your computer.
//
// Why saving is an explicit button and not an autosave:
//
//  - App.jsx writes `inputs` to localStorage on every keystroke. Mirroring
//    that to a file would be constant disk churn and constant sync-client
//    wakeups for no benefit.
//  - It makes the multi-device story honest. Two browsers each hold their
//    own localStorage copy, and there is no server to arbitrate between
//    them, so *something* has to lose when both have edits. A save the
//    user deliberately clicked is a decision; a background sync silently
//    overwriting the other machine's afternoon of work is a data-loss bug
//    -- and this whole subsystem exists because someone already lost a
//    plan once (see fullBackup.js).
//  - Permission prompts land at a sensible moment. The browser may ask to
//    confirm write access; asking right after the user clicked "Save" reads
//    as normal, whereas the same prompt appearing on its own during
//    background autosave reads as something going wrong.
//
// Browser support is the real limitation. showSaveFilePicker is Chromium-
// only (MDN lists the File System Access API as Limited availability, not
// Baseline) and desktop-only, so it does not exist in Safari, Firefox, or
// the Capacitor mobile builds. Everything here is behind
// isSaveFileSupported() and the UI hides the whole feature when it returns
// false, rather than offering a button that cannot work.

// Handles are structured-cloneable but NOT JSON-serializable, so they
// cannot live in localStorage with everything else -- IndexedDB is the
// only web storage that can hold one. That is the sole reason this module
// carries its own tiny IDB wrapper instead of reusing the localStorage
// helpers the rest of the app uses.
const DB_NAME = 'cfe-cloud-file';
const DB_VERSION = 1;
const STORE = 'handles';
const HANDLE_KEY = 'linkedSaveFile';

export function isSaveFileSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.showSaveFilePicker === 'function' &&
    // createWritable is gated on a secure context; without this a page
    // served over plain http would pass the check above and then fail at
    // the moment of saving, which is the worst time to find out.
    typeof window.isSecureContext === 'boolean' && window.isSecureContext
  );
}

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB, so a linked file cannot be remembered.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open local storage for the linked file.'));
  });
}

function idbPut(key, value) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  }));
}

function idbGet(key) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => { const v = req.result; db.close(); resolve(v ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  }));
}

function idbDelete(key) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  }));
}

// Returns the previously linked handle, or null. Never throws for the
// ordinary "nothing linked yet" case -- and swallows IndexedDB failures
// too, because not being able to remember a file is a reason to show the
// "choose a file" state, not to break the Preferences tab.
export async function getLinkedFileHandle() {
  try {
    return await idbGet(HANDLE_KEY);
  } catch {
    return null;
  }
}

export async function clearLinkedFileHandle() {
  try {
    await idbDelete(HANDLE_KEY);
  } catch {
    // Nothing useful to do: the user asked to forget the file, and the
    // in-memory state is cleared by the caller either way.
  }
}

const DEFAULT_FILE_NAME = 'outlastretirement-plan.json';

// Opens the browser's save dialog and remembers whatever the user picks.
// Resolves to { handle, name } on success, or null if they canceled --
// canceling is a normal outcome, not an error, so it must not surface as
// an alert.
export async function pickSaveFile(suggestedName = DEFAULT_FILE_NAME) {
  if (!isSaveFileSupported()) throw new Error('This browser cannot link a save file.');
  let handle;
  try {
    handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{
        description: 'OutlastRetirement backup',
        accept: { 'application/json': ['.json'] },
      }],
    });
  } catch (err) {
    if (err && err.name === 'AbortError') return null;
    throw err;
  }
  await idbPut(HANDLE_KEY, handle);
  return { handle, name: handle.name };
}

// Chrome 122+ can grant a stored handle persistent access, but only if the
// user chooses "Allow on every visit" at the prompt (installed PWAs get it
// without one). Until then access is revoked once every tab for the origin
// closes, so a stored handle has to be re-checked on each visit rather than
// assumed live. queryPermission never prompts; requestPermission does, and
// requires transient user activation -- which is why this is only ever
// called from a click handler.
export async function ensureWritePermission(handle) {
  if (!handle) return false;
  // queryPermission/requestPermission are a Chrome-specific extension, not
  // part of the File System Access spec. A handle without them isn't
  // "denied" -- it's a browser with no permission model to ask, so there is
  // nothing to grant and the write should proceed. Refusing here instead
  // would silently disable saving on any conforming browser that ships the
  // pickers without Chrome's extension, and the failure would look like a
  // broken button rather than a missing API. If the handle turns out to be
  // unusable, createWritable() throws and the caller reports that.
  if (typeof handle.queryPermission !== 'function') return true;
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

// Writes the payload as pretty-printed JSON. Same bytes Backup Everything
// downloads -- deliberately, so a file saved here can be dragged into
// Restore Backup on any other browser, including ones that have no File
// System Access API at all.
export async function writePayloadToHandle(handle, payload) {
  const writable = await handle.createWritable();
  try {
    await writable.write(JSON.stringify(payload, null, 2));
  } finally {
    // close() in a finally so a failed write still releases the file
    // rather than leaving the browser holding a lock on something sitting
    // in the user's sync folder.
    await writable.close();
  }
}

// Returns a File, which is exactly what parseFullBackupFile already
// consumes -- so the linked-file restore path runs the same validation as
// the upload path instead of a parallel copy of it.
export async function readFileFromHandle(handle) {
  return handle.getFile();
}

export const LINKED_FILE_DEFAULT_NAME = DEFAULT_FILE_NAME;
