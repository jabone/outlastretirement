// Password protection for backup files (changelog 143).
//
// Why this exists: a Backup Everything file is the one copy of a plan that
// LEAVES the browser -- it lands in Downloads, gets dragged into iCloud or
// Drive, emailed to a spouse, or left on a USB stick -- and it carries the
// whole financial picture plus, when present, a live Premium access
// credential (see the KEYS comment in fullBackup.js). Everything else in
// this app stays in one browser profile; the backup file is where plain
// text is exposed to people and services the user never chose.
//
// What this deliberately is NOT: encryption of localStorage itself. That
// was considered and declined on 2026-09-08 -- separate OS accounts already
// isolate browser profiles, the only extra protection is against someone
// sharing the same login, and a forgotten password would mean a lost plan
// with no recovery path and no server to reset it from. A password on the
// exported file has a contained failure mode (one file, and the live plan
// is still in the browser), which is the trade the app can honestly make.
//
// Built entirely on WebCrypto (crypto.subtle), which every browser this app
// runs in already ships. No dependency, nothing loaded from a CDN.
//
//   Key derivation:  PBKDF2, SHA-256, 600,000 iterations, 16-byte random
//                    salt. (OWASP's 2023 recommendation for PBKDF2-SHA256
//                    is 600k -- on a laptop that is well under a second,
//                    which is the right cost for a file someone might try
//                    to brute-force offline.)
//   Cipher:          AES-256-GCM, 12-byte random IV, 128-bit tag. GCM is
//                    authenticated, so a wrong password or a tampered
//                    file fails to decrypt rather than yielding garbage
//                    that then gets "restored".
//
// The envelope stores the salt, IV and iteration count in the clear -- that
// is normal and necessary (they are not secrets; the password is). The
// `timestamp` is kept in the clear too, so a user can tell two encrypted
// files apart without decrypting either. Nothing else about the plan is
// visible without the password: not the scenario count, not whether a
// Premium credential is inside.
//
// Those cleartext fields are authenticated too (version 2 files): every
// field except the ciphertext is serialized as canonical JSON (keys sorted)
// and passed to AES-GCM as additionalData, so editing the timestamp, the
// version, the salt, the IV or the iteration count -- or adding a field --
// fails the tag exactly like a wrong password. Version 1 files (written
// before this) carry no additionalData and still open exactly as before.

export const ENCRYPTED_BACKUP_VERSION = 'cfe-encrypted-backup-2';
// Written before the cleartext fields were authenticated; read-only now.
export const LEGACY_ENCRYPTED_BACKUP_VERSION = 'cfe-encrypted-backup-1';
export const PBKDF2_ITERATIONS = 600000;
// The iteration count is read from the file on open, so a crafted file could
// name 60,000,000 and freeze the tab for half a minute per password attempt.
// Files this app writes always carry PBKDF2_ITERATIONS; anything outside this
// range is refused before any key derivation runs.
export const MIN_KDF_ITERATIONS = 100000;
export const MAX_KDF_ITERATIONS = 2000000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

// Thrown (as `err.name`) when decryption fails. AES-GCM cannot distinguish
// "wrong password" from "file was altered" -- both simply fail the
// authentication tag -- so the message covers both honestly.
export const WRONG_PASSWORD_ERROR = 'BackupPasswordError';

function subtle() {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error('This browser does not support the encryption features needed for a password-protected backup.');
  }
  return c;
}

function toBase64(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

function fromBase64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Deterministic JSON: object keys sorted at every level, so the same header
// always yields the same bytes regardless of the order a file lists them in.
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// The additionalData for a version 2 envelope: every cleartext field except
// the ciphertext itself.
function envelopeHeaderBytes(envelope) {
  const { ciphertext: _ciphertext, ...header } = envelope;
  return new TextEncoder().encode(canonicalJson(header));
}

async function deriveKey(password, salt, iterations) {
  const { subtle: s } = subtle();
  const baseKey = await s.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return s.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// True if `obj` is a password-protected backup envelope (as opposed to a
// plain backup payload). Used by the restore path to decide whether to ask
// for a password before validating the contents.
export function isEncryptedBackup(obj) {
  return Boolean(
    obj && typeof obj === 'object'
    && (obj.version === ENCRYPTED_BACKUP_VERSION || obj.version === LEGACY_ENCRYPTED_BACKUP_VERSION)
    && typeof obj.ciphertext === 'string'
    && obj.kdf && typeof obj.kdf.salt === 'string'
    && obj.cipher && typeof obj.cipher.iv === 'string'
  );
}

// Wraps a plain backup payload in an encrypted envelope. `password` must be
// non-empty -- the caller's UI decides how strong it has to be; this
// module only refuses the one value that would make the file look
// protected while it isn't.
export async function encryptBackupPayload(payload, password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('A password is required to create an encrypted backup.');
  }
  const c = subtle();
  const salt = c.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = c.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const header = {
    version: ENCRYPTED_BACKUP_VERSION,
    // Kept in the clear on purpose, and authenticated -- see the module comment.
    timestamp: typeof payload?.timestamp === 'string' ? payload.timestamp : new Date().toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
  };
  const ciphertext = await c.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: envelopeHeaderBytes(header) }, key, plaintext);
  return { ...header, ciphertext: toBase64(ciphertext) };
}

// Reverses encryptBackupPayload. Rejects with err.name === WRONG_PASSWORD_ERROR
// when the password is wrong or the file has been altered.
export async function decryptBackupPayload(envelope, password) {
  if (!isEncryptedBackup(envelope)) {
    throw new Error('That file is not a password-protected OutlastRetirement backup.');
  }
  if (typeof password !== 'string' || password.length === 0) {
    const err = new Error('A password is needed to open this backup.');
    err.name = WRONG_PASSWORD_ERROR;
    throw err;
  }
  const c = subtle();
  const iterations = envelope.kdf.iterations === undefined ? PBKDF2_ITERATIONS : Number(envelope.kdf.iterations);
  if (!Number.isInteger(iterations) || iterations < MIN_KDF_ITERATIONS || iterations > MAX_KDF_ITERATIONS) {
    throw new Error("This backup's password settings are outside what OutlastRetirement writes, so it won't be opened. Use a backup file saved by the app.");
  }
  const key = await deriveKey(password, fromBase64(envelope.kdf.salt), iterations);
  const params = { name: 'AES-GCM', iv: fromBase64(envelope.cipher.iv) };
  if (envelope.version !== LEGACY_ENCRYPTED_BACKUP_VERSION) params.additionalData = envelopeHeaderBytes(envelope);
  let plaintext;
  try {
    plaintext = await c.subtle.decrypt(
      params,
      key,
      fromBase64(envelope.ciphertext)
    );
  } catch {
    const err = new Error("That password didn't open this backup. Either the password is wrong or the file has been altered since it was saved.");
    err.name = WRONG_PASSWORD_ERROR;
    throw err;
  }
  return JSON.parse(new TextDecoder().decode(plaintext));
}
