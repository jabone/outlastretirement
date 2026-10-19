// "Erase everything on this device" (utils/eraseDevice.js) is the control
// the privacy policy promises. It had no test of its own; a bug here either
// leaves data the user asked to erase, or lets a React effect write the old
// plan straight back before the reload.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { eraseEverythingOnDevice } from '../utils/eraseDevice';
import { safeSetItem, isWriteHeld, releaseWrites } from '../utils/safeStorage';
import { APP_INDEXED_DB_NAMES } from '../utils/storageKeys';

// A storage area with the Storage API's shape (length/key/getItem/
// removeItem/clear), seeded with app keys and one foreign key.
function fakeStorage(entries) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
  };
}

afterEach(() => releaseWrites());

describe('eraseEverythingOnDevice', () => {
  it('removes every app key, then everything else on the origin, from both storage areas', async () => {
    const local = fakeStorage({ retire_plan_inputs: '{}', cfe_premium_jwt: 'eyJ', cfe_premium_holdings_v1: '[]', unrelated: 'x' });
    const session = fakeStorage({ retire_plan_tab: 'risk', other: 'y' });
    await eraseEverythingOnDevice({ local, session, idb: null });
    expect(local.length).toBe(0);
    expect(session.length).toBe(0);
  });

  it('deletes the app\'s IndexedDB database(s) and waits for the request to settle', async () => {
    const deleted = [];
    const idb = {
      deleteDatabase: (name) => {
        deleted.push(name);
        const req = {};
        setTimeout(() => req.onsuccess && req.onsuccess(), 0);
        return req;
      },
    };
    await eraseEverythingOnDevice({ local: fakeStorage({}), session: fakeStorage({}), idb });
    expect(deleted).toEqual([...APP_INDEXED_DB_NAMES]);
    expect(deleted).toContain('cfe-cloud-file');
  });

  it('does not hang on a database delete that never answers, and survives one that throws', async () => {
    const silent = { deleteDatabase: () => ({}) };
    const t0 = Date.now();
    await eraseEverythingOnDevice({ local: fakeStorage({}), session: fakeStorage({}), idb: silent, timeoutMs: 20 });
    expect(Date.now() - t0).toBeLessThan(1000);
    const throwing = { deleteDatabase: () => { throw new Error('no idb'); } };
    await expect(eraseEverythingOnDevice({ local: fakeStorage({}), session: fakeStorage({}), idb: throwing, timeoutMs: 20 })).resolves.toBeUndefined();
  });

  it('holds every guarded write from the moment the erase starts, so nothing is written back before the reload', async () => {
    const local = fakeStorage({ retire_plan_inputs: '{"a":1}' });
    expect(isWriteHeld('retire_plan_inputs')).toBe(false);
    await eraseEverythingOnDevice({ local, session: fakeStorage({}), idb: null });
    expect(isWriteHeld('retire_plan_inputs')).toBe(true);
    // An effect firing after the erase is refused and leaves storage empty.
    expect(safeSetItem('retire_plan_inputs', '{"a":1}', local)).toBe(false);
    expect(local.length).toBe(0);
  });

  it('a storage area that throws is logged, not fatal, and the other area is still cleared', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { get length() { throw new Error('SecurityError'); }, key: () => null, getItem: () => null, removeItem: () => {}, clear: () => { throw new Error('SecurityError'); } };
    const session = fakeStorage({ retire_plan_tab: 'risk' });
    await eraseEverythingOnDevice({ local: broken, session, idb: null });
    expect(session.length).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('tolerates a browser with no storage at all', async () => {
    await expect(eraseEverythingOnDevice({ local: undefined, session: undefined, idb: undefined })).resolves.toBeUndefined();
  });
});
