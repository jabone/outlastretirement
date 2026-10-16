// @vitest-environment jsdom
//
// cloudFileSync talks to two browser APIs that jsdom does not implement --
// showSaveFilePicker and IndexedDB-stored FileSystemFileHandles -- so
// everything here runs against hand-built fakes. That is a real limit worth
// naming: these tests prove the module's own decisions (does it treat a
// canceled picker as an error? does it re-check permission before writing?
// does it close the stream when a write throws?) but they cannot prove the
// browser behaves as assumed. The real-browser pass covers that.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isSaveFileSupported,
  pickSaveFile,
  ensureWritePermission,
  writePayloadToHandle,
  readFileFromHandle,
} from '../utils/cloudFileSync';

// A stand-in for FileSystemFileHandle: records what was written and lets
// each test dictate the permission answers.
function makeHandle({ name = 'plan.json', query = 'granted', request = 'granted', failWrite = false } = {}) {
  const written = [];
  let closed = false;
  return {
    name,
    written,
    get closed() { return closed; },
    queryPermission: vi.fn(async () => query),
    requestPermission: vi.fn(async () => request),
    createWritable: vi.fn(async () => ({
      write: vi.fn(async (chunk) => {
        if (failWrite) throw new Error('disk full');
        written.push(chunk);
      }),
      close: vi.fn(async () => { closed = true; }),
    })),
    getFile: vi.fn(async () => new File(['{"activeInputs":{}}'], name, { type: 'application/json' })),
  };
}

beforeEach(() => {
  // jsdom reports isSecureContext, but not always true -- pin it so the
  // capability check is testing what we mean it to.
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
});

afterEach(() => {
  delete window.showSaveFilePicker;
  vi.restoreAllMocks();
});

describe('isSaveFileSupported', () => {
  it('is false when the API is absent -- the Safari/iOS/Capacitor case', () => {
    expect(isSaveFileSupported()).toBe(false);
  });

  it('is true when showSaveFilePicker exists in a secure context', () => {
    window.showSaveFilePicker = vi.fn();
    expect(isSaveFileSupported()).toBe(true);
  });

  // createWritable is gated on a secure context, so a page served over
  // plain http would otherwise pass the check and fail at save time --
  // the worst possible moment to discover it.
  it('is false over an insecure connection even if the API is present', () => {
    window.showSaveFilePicker = vi.fn();
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    expect(isSaveFileSupported()).toBe(false);
  });
});

describe('pickSaveFile', () => {
  it('treats a canceled picker as null, not an error', async () => {
    // Canceling a file dialog is an ordinary thing to do. If this threw,
    // the caller would raise an alert saying something failed when the
    // user simply changed their mind.
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    window.showSaveFilePicker = vi.fn(async () => { throw abort; });
    await expect(pickSaveFile()).resolves.toBeNull();
  });

  it('rethrows a genuine failure so the caller can surface it', async () => {
    window.showSaveFilePicker = vi.fn(async () => { throw new Error('security error'); });
    await expect(pickSaveFile()).rejects.toThrow('security error');
  });

  it('refuses to run at all where the API is unsupported', async () => {
    await expect(pickSaveFile()).rejects.toThrow(/cannot link a save file/i);
  });
});

describe('ensureWritePermission', () => {
  it('does not prompt when permission is already granted', async () => {
    const handle = makeHandle({ query: 'granted' });
    await expect(ensureWritePermission(handle)).resolves.toBe(true);
    expect(handle.requestPermission).not.toHaveBeenCalled();
  });

  it('prompts when permission has lapsed, and reports the grant', async () => {
    // This is the ordinary case after a browser restart: Chrome revokes
    // access once every tab for the origin closes unless the user chose
    // "Allow on every visit".
    const handle = makeHandle({ query: 'prompt', request: 'granted' });
    await expect(ensureWritePermission(handle)).resolves.toBe(true);
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
  });

  it('reports false when the user denies', async () => {
    const handle = makeHandle({ query: 'prompt', request: 'denied' });
    await expect(ensureWritePermission(handle)).resolves.toBe(false);
  });

  it('reports false for no handle at all', async () => {
    await expect(ensureWritePermission(null)).resolves.toBe(false);
    await expect(ensureWritePermission(undefined)).resolves.toBe(false);
  });

  // queryPermission is a Chrome extension, not spec. A handle without it
  // has no permission model to consult, so there is nothing to deny --
  // treating that as "denied" would disable saving entirely on a browser
  // that implements the pickers without it, and it would look like a
  // broken button rather than a missing API.
  it('treats a handle with no permission API as permitted, not denied', async () => {
    await expect(ensureWritePermission({ name: 'x.json' })).resolves.toBe(true);
  });
});

describe('writePayloadToHandle', () => {
  it('writes the payload as pretty-printed JSON and closes the stream', async () => {
    const handle = makeHandle();
    await writePayloadToHandle(handle, { version: 'cfe-full-backup-1', activeInputs: { salary1: 1 } });
    expect(handle.written).toHaveLength(1);
    expect(JSON.parse(handle.written[0])).toEqual({ version: 'cfe-full-backup-1', activeInputs: { salary1: 1 } });
    expect(handle.written[0]).toContain('\n'); // indented, so the file is readable if opened by hand
    expect(handle.closed).toBe(true);
  });

  // The file being written usually sits in a folder a sync client is
  // watching. Leaving the browser holding an open writable on it after a
  // failure is worse than the failure.
  it('still closes the stream when the write throws', async () => {
    const handle = makeHandle({ failWrite: true });
    await expect(writePayloadToHandle(handle, {})).rejects.toThrow('disk full');
    expect(handle.closed).toBe(true);
  });
});

describe('readFileFromHandle', () => {
  it('returns a File, which is what parseFullBackupFile already consumes', async () => {
    // The point of this test is the contract, not the plumbing: the
    // linked-file restore path must reuse the upload path's validation
    // rather than growing a second copy of it.
    const file = await readFileFromHandle(makeHandle());
    expect(file).toBeInstanceOf(File);
    expect(await file.text()).toContain('activeInputs');
  });
});
