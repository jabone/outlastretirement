// Password-protected backup files (changelog 143). Runs in the default
// node environment: Node's globalThis.crypto is the same WebCrypto the
// browser exposes, so the round-trip here exercises the real PBKDF2 +
// AES-GCM path rather than a mock.
import { describe, it, expect } from 'vitest';
import {
  encryptBackupPayload,
  decryptBackupPayload,
  isEncryptedBackup,
  ENCRYPTED_BACKUP_VERSION,
  LEGACY_ENCRYPTED_BACKUP_VERSION,
  PBKDF2_ITERATIONS,
  WRONG_PASSWORD_ERROR,
} from '../utils/backupCrypto';

const SAMPLE = {
  version: 'cfe-full-backup-1',
  timestamp: '2026-09-08T12:00:00.000Z',
  activeInputs: { salary1: 150000, lifestyleExpense: 96000 },
  savedScenarios: [{ id: 's1', name: 'Base Case' }],
  portfolioHoldings: [{ id: 'h1', symbol: 'VTSAX', shares: 1200 }],
  premiumJwt: 'eyJ.fake.token',
};

describe('backupCrypto', () => {
  it('round-trips a payload through encrypt and decrypt', async () => {
    const env = await encryptBackupPayload(SAMPLE, 'correct horse battery');
    const back = await decryptBackupPayload(env, 'correct horse battery');
    expect(back).toEqual(SAMPLE);
  });

  it('produces an envelope that leaks nothing about the plan', async () => {
    const env = await encryptBackupPayload(SAMPLE, 'correct horse battery');
    expect(env.version).toBe(ENCRYPTED_BACKUP_VERSION);
    expect(env.timestamp).toBe(SAMPLE.timestamp);
    expect(env.kdf).toEqual(expect.objectContaining({ name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS }));
    expect(env.cipher.name).toBe('AES-GCM');
    expect(Object.keys(env).sort()).toEqual(['cipher', 'ciphertext', 'kdf', 'timestamp', 'version']);
    // Nothing recognisable from the plan appears in the serialised file:
    // not the JWT, not a symbol, not a field name. Every needle is five
    // characters or more: a three-letter one turned up by chance inside the
    // random base64 of the ciphertext once in a few hundred runs.
    const text = JSON.stringify(env);
    for (const needle of ['eyJ.fake.token', 'VTSAX', 'salary1', 'activeInputs', 'Base Case', '150000']) {
      expect(text).not.toContain(needle);
    }
  });

  it('uses a fresh salt and IV every time, so identical plans give different files', async () => {
    const a = await encryptBackupPayload(SAMPLE, 'same password');
    const b = await encryptBackupPayload(SAMPLE, 'same password');
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    // ...and both still open.
    expect(await decryptBackupPayload(a, 'same password')).toEqual(SAMPLE);
    expect(await decryptBackupPayload(b, 'same password')).toEqual(SAMPLE);
  });

  it('rejects a wrong password with the named error, never with garbage data', async () => {
    const env = await encryptBackupPayload(SAMPLE, 'correct horse battery');
    let caught = null;
    try { await decryptBackupPayload(env, 'correct horse batter'); } catch (e) { caught = e; }
    expect(caught).not.toBeNull();
    expect(caught.name).toBe(WRONG_PASSWORD_ERROR);
  });

  it('rejects an empty password on both sides', async () => {
    await expect(encryptBackupPayload(SAMPLE, '')).rejects.toThrow(/password is required/);
    const env = await encryptBackupPayload(SAMPLE, 'x'.repeat(8));
    let caught = null;
    try { await decryptBackupPayload(env, ''); } catch (e) { caught = e; }
    expect(caught?.name).toBe(WRONG_PASSWORD_ERROR);
  });

  it('detects tampering: a single altered ciphertext byte fails authentication', async () => {
    const env = await encryptBackupPayload(SAMPLE, 'correct horse battery');
    const bytes = Uint8Array.from(atob(env.ciphertext), c => c.charCodeAt(0));
    bytes[Math.floor(bytes.length / 2)] ^= 0x01;
    const tampered = { ...env, ciphertext: btoa(String.fromCharCode(...bytes)) };
    let caught = null;
    try { await decryptBackupPayload(tampered, 'correct horse battery'); } catch (e) { caught = e; }
    expect(caught?.name).toBe(WRONG_PASSWORD_ERROR);
  });

  it('isEncryptedBackup tells envelopes from plain backups and junk', async () => {
    const env = await encryptBackupPayload(SAMPLE, 'correct horse battery');
    expect(isEncryptedBackup(env)).toBe(true);
    expect(isEncryptedBackup(SAMPLE)).toBe(false);
    expect(isEncryptedBackup(null)).toBe(false);
    expect(isEncryptedBackup({ version: ENCRYPTED_BACKUP_VERSION })).toBe(false);
    expect(isEncryptedBackup('string')).toBe(false);
  });

  it('refuses to decrypt something that is not an envelope', async () => {
    await expect(decryptBackupPayload(SAMPLE, 'whatever')).rejects.toThrow(/not a password-protected/);
  });

  // A crafted file naming 60,000,000 iterations froze the tab for ~28 s per
  // password attempt. Out-of-range counts are refused before any derivation.
  it('refuses an iteration count outside the accepted range, quickly and not as a wrong password', async () => {
    const env = await encryptBackupPayload(SAMPLE, 'correct horse battery');
    for (const iterations of [60000000, 2000001, 99999, 1, -5, 'abc', 1.5]) {
      const crafted = { ...env, kdf: { ...env.kdf, iterations } };
      const started = Date.now();
      const err = await decryptBackupPayload(crafted, 'correct horse battery').catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).not.toBe(WRONG_PASSWORD_ERROR);
      expect(err.message).toMatch(/password settings/);
      expect(Date.now() - started).toBeLessThan(1000);
    }
  });

  // The cleartext fields are bound to the ciphertext as AES-GCM
  // additionalData, so an edited timestamp (or any other header field) no
  // longer slips through.
  it('writes the authenticated-header version', async () => {
    const env = await encryptBackupPayload(SAMPLE, 'correct horse battery');
    expect(env.version).toBe('cfe-encrypted-backup-2');
    expect(ENCRYPTED_BACKUP_VERSION).not.toBe(LEGACY_ENCRYPTED_BACKUP_VERSION);
  });

  it('opens a header whose keys are listed in a different order', async () => {
    const env = await encryptBackupPayload(SAMPLE, 'correct horse battery');
    const reordered = {
      ciphertext: env.ciphertext,
      cipher: { iv: env.cipher.iv, name: env.cipher.name },
      kdf: { salt: env.kdf.salt, iterations: env.kdf.iterations, hash: env.kdf.hash, name: env.kdf.name },
      timestamp: env.timestamp,
      version: env.version,
    };
    expect(await decryptBackupPayload(reordered, 'correct horse battery')).toEqual(SAMPLE);
  });

  it('rejects a new-format file whose cleartext fields were edited, as a wrong password or damaged file', async () => {
    const env = await encryptBackupPayload(SAMPLE, 'correct horse battery');
    const edits = {
      timestamp: { ...env, timestamp: '2020-01-01T00:00:00.000Z' },
      versionDowngrade: { ...env, version: LEGACY_ENCRYPTED_BACKUP_VERSION },
      kdfName: { ...env, kdf: { ...env.kdf, name: 'PBKDF3' } },
      kdfHash: { ...env, kdf: { ...env.kdf, hash: 'SHA-512' } },
      kdfIterations: { ...env, kdf: { ...env.kdf, iterations: PBKDF2_ITERATIONS + 1 } },
      kdfSalt: { ...env, kdf: { ...env.kdf, salt: btoa('0123456789abcdef') } },
      cipherName: { ...env, cipher: { ...env.cipher, name: 'AES-GCM-X' } },
      cipherIv: { ...env, cipher: { ...env.cipher, iv: btoa('0123456789ab') } },
      addedField: { ...env, note: 'hello' },
      addedKdfField: { ...env, kdf: { ...env.kdf, extra: 1 } },
    };
    for (const [what, tampered] of Object.entries(edits)) {
      const err = await decryptBackupPayload(tampered, 'correct horse battery').catch((e) => e);
      expect(err, what).toBeInstanceOf(Error);
      expect(err.name, what).toBe(WRONG_PASSWORD_ERROR);
      expect(err.message, what).toMatch(/password is wrong or the file has been altered/);
    }
  });

  // Written by the version 1 code (no additionalData) before headers were
  // authenticated. It must keep opening exactly as before.
  const OLD_FORMAT_FILE = {"version":"cfe-encrypted-backup-1","timestamp":"2026-09-08T12:00:00.000Z","kdf":{"name":"PBKDF2","hash":"SHA-256","iterations":600000,"salt":"aQ23KyB/glE8yO6JqMNDGA=="},"cipher":{"name":"AES-GCM","iv":"yfBkyFdIputfUePb"},"ciphertext":"yHy1NVlqfigUM88LXHfGGJqdW53+9ePa5NbwuV72qdKdhTrw3sslZUs4PVlJH11aVditfk4SGyN8MUK4RS8lWlWtZad6iK2V3LMuV2zgIHJG0ssd7/nLIPe91ivOm1uTlS7auy0G6sSjr2h279jEvmOmeWZlIKQ4AM+3Ss0oJYrla82yoKm28Wa5tME="};
  const OLD_FORMAT_PAYLOAD = { version: 'cfe-full-backup-1', timestamp: '2026-09-08T12:00:00.000Z', activeInputs: { salary1: 150000 }, savedScenarios: [] };

  it('still opens a file written in the old format', async () => {
    expect(isEncryptedBackup(OLD_FORMAT_FILE)).toBe(true);
    expect(await decryptBackupPayload(OLD_FORMAT_FILE, 'old format password')).toEqual(OLD_FORMAT_PAYLOAD);
    const err = await decryptBackupPayload(OLD_FORMAT_FILE, 'not the password').catch((e) => e);
    expect(err.name).toBe(WRONG_PASSWORD_ERROR);
  });

  it('applies the iteration bounds to old-format files too', async () => {
    const crafted = { ...OLD_FORMAT_FILE, kdf: { ...OLD_FORMAT_FILE.kdf, iterations: 60000000 } };
    const err = await decryptBackupPayload(crafted, 'old format password').catch((e) => e);
    expect(err.name).not.toBe(WRONG_PASSWORD_ERROR);
    expect(err.message).toMatch(/password settings/);
  });
});
