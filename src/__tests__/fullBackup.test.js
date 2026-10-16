// buildFullBackupPayload/applyFullBackupToStorage read and write real
// localStorage, and parseFullBackupFile uses File/FileReader -- this
// file's default 'node' test environment (see vite.config.js) provides
// neither, so opt into jsdom just for this file, same as
// sheetPricing.test.js does for the same reason.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildFullBackupPayload,
  summarizeBackupPayload,
  applyFullBackupToStorage,
  parseFullBackupFile,
  willRestorePremiumHoldings,
  FULL_BACKUP_VERSION,
} from '../utils/fullBackup';
import { savePricingSource } from '../utils/pricingSource';
import { loadHoldings } from '../context/usePortfolioHoldings';
import { DEFAULT_INPUTS, INPUTS_SCHEMA_VERSION } from '../calculator';

// Covers the "one button that saves everything necessary to get back to a
// normal state" feature (added 2026-08-18 after a user reported losing all
// plan data when their browser's localStorage was cleared). See
// fullBackup.js's header comment for the full rationale and the exact
// field list this is meant to keep in sync with.
describe('fullBackup', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('buildFullBackupPayload', () => {
    it('returns sensible empty defaults when nothing has been saved yet', () => {
      const payload = buildFullBackupPayload();
      expect(payload.version).toBe(FULL_BACKUP_VERSION);
      expect(payload.activeInputs).toBeNull();
      expect(payload.savedScenarios).toEqual([]);
      expect(payload.portfolioHoldings).toEqual([]);
      expect(payload.liquidations).toEqual([]);
      expect(payload.interviewProgress).toBeNull();
      expect(payload.pricingSource).toEqual({ csvUrl: '', scriptUrl: '' });
      expect(payload.premiumJwt).toBeNull();
      expect(payload.projectionSummary).toBeUndefined();
    });

    it('reads every relevant localStorage key once populated', () => {
      localStorage.setItem('retire_plan_inputs', JSON.stringify({ schemaVersion: INPUTS_SCHEMA_VERSION, inputs: { ...DEFAULT_INPUTS, currentAge1: 42 } }));
      localStorage.setItem('retire_plan_scenarios', JSON.stringify({ schemaVersion: INPUTS_SCHEMA_VERSION, scenarios: [{ id: '1', name: 'Base Case', inputs: DEFAULT_INPUTS, metrics: {} }] }));
      localStorage.setItem('cfe_premium_holdings_v1', JSON.stringify([{ id: 'h1', symbol: 'AAPL' }]));
      localStorage.setItem('cfe_premium_liquidations_v1', JSON.stringify([{ id: 'l1', symbol: 'AAPL' }]));
      localStorage.setItem('retire_plan_interview_progress', JSON.stringify({ current: 3, visited: [1, 2, 3] }));
      localStorage.setItem('cfe_premium_jwt', 'fake.jwt.token');
      savePricingSource({ csvUrl: 'https://example.com/pub?output=csv', scriptUrl: 'https://script.google.com/x' });

      const payload = buildFullBackupPayload();
      expect(payload.activeInputs.currentAge1).toBe(42);
      expect(payload.savedScenarios).toHaveLength(1);
      expect(payload.portfolioHoldings).toEqual([{ id: 'h1', symbol: 'AAPL' }]);
      expect(payload.liquidations).toEqual([{ id: 'l1', symbol: 'AAPL' }]);
      expect(payload.interviewProgress).toEqual({ current: 3, visited: [1, 2, 3] });
      expect(payload.pricingSource).toEqual({ csvUrl: 'https://example.com/pub?output=csv', scriptUrl: 'https://script.google.com/x' });
      expect(payload.premiumJwt).toBe('fake.jwt.token');
    });

    it('tolerates a bare (unwrapped) legacy inputs shape', () => {
      localStorage.setItem('retire_plan_inputs', JSON.stringify({ ...DEFAULT_INPUTS, currentAge1: 55 }));
      const payload = buildFullBackupPayload();
      expect(payload.activeInputs.currentAge1).toBe(55);
    });

    it('includes projectionSummary only when the caller passes one in -- never guessed at from localStorage', () => {
      const withoutSummary = buildFullBackupPayload();
      expect(withoutSummary.projectionSummary).toBeUndefined();

      const withSummary = buildFullBackupPayload({
        projectionSummary: { peakPortfolioWorth: 900000, endingBalance: 50000, isSuccessful: true },
      });
      expect(withSummary.projectionSummary).toEqual({ peakPortfolioWorth: 900000, endingBalance: 50000, isSuccessful: true });
    });
  });

  describe('summarizeBackupPayload', () => {
    it('says there is nothing yet for a fully empty payload', () => {
      expect(summarizeBackupPayload({})).toBe('no plan data yet');
    });

    it('lists every non-empty section', () => {
      const summary = summarizeBackupPayload({
        activeInputs: DEFAULT_INPUTS,
        savedScenarios: [{ id: '1' }, { id: '2' }],
        portfolioHoldings: [{ id: 'h1' }],
        liquidations: [],
        pricingSource: { csvUrl: 'https://x' },
      });
      expect(summary).toContain('your active plan');
      expect(summary).toContain('2 saved scenarios');
      expect(summary).toContain('1 Detailed Holdings');
      expect(summary).not.toContain('liquidation');
      expect(summary).toContain('Live Pricing Sheet connection');
    });

    it('names the Premium Access credential explicitly when present, and omits it when absent', () => {
      const withJwt = summarizeBackupPayload({ activeInputs: DEFAULT_INPUTS, premiumJwt: 'fake.jwt.token' });
      expect(withJwt).toContain('your Premium Access credential');

      const withoutJwt = summarizeBackupPayload({ activeInputs: DEFAULT_INPUTS, premiumJwt: null });
      expect(withoutJwt).not.toContain('Premium Access credential');
    });
  });

  describe('applyFullBackupToStorage', () => {
    it('round-trips a full payload back through buildFullBackupPayload', () => {
      const original = {
        activeInputs: { ...DEFAULT_INPUTS, currentAge1: 61 },
        savedScenarios: [{ id: 's1', name: 'Retire Early', inputs: DEFAULT_INPUTS, metrics: { endingBalance: 100 } }],
        portfolioHoldings: [{ id: 'h1', symbol: 'VTI', shares: 10 }],
        liquidations: [{ id: 'l1', symbol: 'VTI' }],
        interviewProgress: { current: 'income', visited: ['household', 'income'] },
        pricingSource: { csvUrl: 'https://docs.google.com/spreadsheets/d/e/x/pub?output=csv', scriptUrl: 'https://script.google.com/y' },
        premiumJwt: 'fake.jwt.token',
        schemaVersion: INPUTS_SCHEMA_VERSION,
      };

      const restored = applyFullBackupToStorage(original, { restorePricingSource: true });
      expect(restored.some((r) => r.includes('active plan'))).toBe(true);
      expect(restored.some((r) => r.includes('saved scenario'))).toBe(true);
      expect(restored.some((r) => r.includes('Detailed Holdings'))).toBe(true);
      expect(restored.some((r) => r.includes('liquidation'))).toBe(true);
      expect(restored.some((r) => r.includes('Live Pricing'))).toBe(true);
      expect(restored.some((r) => r.includes('Premium Access credential'))).toBe(true);

      const rebuilt = buildFullBackupPayload();
      expect(rebuilt.activeInputs.currentAge1).toBe(61);
      expect(rebuilt.savedScenarios).toHaveLength(1);
      expect(rebuilt.savedScenarios[0].name).toBe('Retire Early');
      expect(rebuilt.portfolioHoldings[0].symbol).toBe('VTI');
      expect(rebuilt.liquidations[0].id).toBe('l1');
      expect(rebuilt.interviewProgress).toEqual({ current: 'income', visited: ['household', 'income'] });
      expect(rebuilt.pricingSource).toEqual(original.pricingSource);
      expect(rebuilt.premiumJwt).toBe('fake.jwt.token');
    });

    it('does not blank an existing Sheet connection when the backup has none (older-format file)', () => {
      savePricingSource({ csvUrl: 'https://already-connected.example/pub?output=csv', scriptUrl: 'https://script.google.com/existing' });

      // An older-format backup file (from before pricingSource existed) --
      // no pricingSource key at all.
      applyFullBackupToStorage({
        activeInputs: DEFAULT_INPUTS,
        savedScenarios: [],
        portfolioHoldings: [],
        liquidations: [],
      });

      const payload = buildFullBackupPayload();
      expect(payload.pricingSource.csvUrl).toBe('https://already-connected.example/pub?output=csv');
    });

    it('does not clear an active Premium Access Key when the backup has none (older-format file)', () => {
      localStorage.setItem('cfe_premium_jwt', 'still-active.jwt.token');

      applyFullBackupToStorage({
        activeInputs: DEFAULT_INPUTS,
        savedScenarios: [],
        portfolioHoldings: [],
        liquidations: [],
        // no premiumJwt field at all -- simulates a backup made before this existed.
      });

      const payload = buildFullBackupPayload();
      expect(payload.premiumJwt).toBe('still-active.jwt.token');
    });

    it('sanitizes malformed holdings/liquidations rather than storing them as-is', () => {
      // isPremium: true -- this test is about sanitization, not the
      // separate premium-gating behavior covered in the
      // "willRestorePremiumHoldings" describe block below.
      applyFullBackupToStorage({
        portfolioHoldings: [{ symbol: 'AAPL' }, 'not an object', null],
        liquidations: [{ id: 'ok1' }, { noId: true }, 'nope'],
      }, { isPremium: true });
      const payload = buildFullBackupPayload();
      expect(payload.portfolioHoldings).toHaveLength(1);
      expect(payload.portfolioHoldings[0].symbol).toBe('AAPL');
      expect(payload.liquidations).toEqual([{ id: 'ok1' }]);
    });

    // Direct unit coverage of the "premium lapses" restore behavior --
    // see calculator.js's initialBalancesSource comment and
    // LedgerTab.test.jsx's "Cloud Backup & Sync" describe block for the
    // component-level version of the same thing. isPremium here means
    // "is this browser premium right now, before this restore" -- passed
    // in by the caller (Sidebar.jsx / LedgerTab.jsx), not read from
    // context, since this module has no React dependency by design.
    // Changelog 398. The one-time lot-source retraction (changelog 347) is
    // a fact about the holdings, not the browser: a backup records that it
    // has run, and a restore onto a browser that never ran it must not run
    // it again on holdings the user has since labeled by hand.
    describe('the lot-source retraction flag travels with the holdings', () => {
      const dripLot = { id: 'lot1', date: '2026-01-05', shares: 3, pricePerShare: 100, source: 'drip' };
      const holdings = [{ id: 'h1', symbol: 'VTI', lots: [dripLot] }];

      it('a backup from a browser that has run the retraction says so', () => {
        localStorage.setItem('cfe_lot_source_retraction_v1', 'done');
        expect(buildFullBackupPayload().lotSourceRetraction).toBe('done');
        localStorage.clear();
        expect(buildFullBackupPayload().lotSourceRetraction).toBeNull();
      });

      it('restoring such a backup onto a fresh browser keeps a DRIP label the user set -- in one restore', () => {
        // The old failure: no flag on this browser, so the first load after
        // the restore retracted the label; only a second restore (with the
        // flag now set) kept it.
        applyFullBackupToStorage({ portfolioHoldings: holdings, lotSourceRetraction: 'done' }, { isPremium: true });
        expect(localStorage.getItem('cfe_lot_source_retraction_v1')).toBe('done');
        expect(loadHoldings()[0].lots[0].source).toBe('drip');
      });

      it('a backup written before the flag existed still gets the one-time correction', () => {
        applyFullBackupToStorage({ portfolioHoldings: holdings }, { isPremium: true });
        expect(localStorage.getItem('cfe_lot_source_retraction_v1')).toBeNull();
        expect(loadHoldings()[0].lots[0].source).toBe('unspecified');
        expect(localStorage.getItem('cfe_lot_source_retraction_v1')).toBe('done');
      });
    });

    describe('premium-gated portfolioHoldings/liquidations restore', () => {
      it('skips restoring portfolioHoldings/liquidations when not premium and the file grants no premium', () => {
        applyFullBackupToStorage({
          portfolioHoldings: [{ id: 'h1', symbol: 'VTI' }],
          liquidations: [{ id: 'l1' }],
        }, { isPremium: false });
        const payload = buildFullBackupPayload();
        expect(payload.portfolioHoldings).toEqual([]);
        expect(payload.liquidations).toEqual([]);
      });

      it('does not clobber pre-existing holdings/liquidations when the restore is skipped for lack of premium', () => {
        applyFullBackupToStorage({ portfolioHoldings: [{ id: 'old', symbol: 'MSFT' }], liquidations: [{ id: 'old-l' }] }, { isPremium: true });
        applyFullBackupToStorage({ portfolioHoldings: [{ id: 'new', symbol: 'VTI' }], liquidations: [{ id: 'new-l' }] }, { isPremium: false });
        const payload = buildFullBackupPayload();
        expect(payload.portfolioHoldings).toHaveLength(1);
        expect(payload.portfolioHoldings[0]).toMatchObject({ id: 'old', symbol: 'MSFT' });
        expect(payload.liquidations).toEqual([{ id: 'old-l' }]);
      });

      it('restores portfolioHoldings/liquidations when premium is already active', () => {
        applyFullBackupToStorage({
          portfolioHoldings: [{ id: 'h1', symbol: 'VTI' }],
          liquidations: [{ id: 'l1' }],
        }, { isPremium: true });
        const payload = buildFullBackupPayload();
        expect(payload.portfolioHoldings).toHaveLength(1);
        expect(payload.portfolioHoldings[0]).toMatchObject({ id: 'h1', symbol: 'VTI' });
        expect(payload.liquidations).toEqual([{ id: 'l1' }]);
      });

      it('restores portfolioHoldings/liquidations even when not currently premium, if the file itself carries a premiumJwt', () => {
        applyFullBackupToStorage({
          portfolioHoldings: [{ id: 'h1', symbol: 'VTI' }],
          liquidations: [{ id: 'l1' }],
          premiumJwt: 'fake.jwt.token',
        }, { isPremium: false });
        const payload = buildFullBackupPayload();
        expect(payload.portfolioHoldings).toHaveLength(1);
        expect(payload.portfolioHoldings[0]).toMatchObject({ id: 'h1', symbol: 'VTI' });
        expect(payload.liquidations).toEqual([{ id: 'l1' }]);
      });

      it('willRestorePremiumHoldings is a pure predicate: current premium OR a usable Premium key in the file, nothing else', () => {
        expect(willRestorePremiumHoldings({}, true)).toBe(true);
        expect(willRestorePremiumHoldings({}, false)).toBe(false);
        expect(willRestorePremiumHoldings({ premiumJwt: 'a.b.c' }, false)).toBe(true);
        // Not token-shaped: no longer unlocks the holdings restore.
        expect(willRestorePremiumHoldings({ premiumJwt: 'x' }, false)).toBe(false);
        // The interactive restore passes the signature check's answer.
        expect(willRestorePremiumHoldings({ premiumJwt: 'a.b.c' }, false, false)).toBe(false);
        expect(willRestorePremiumHoldings({ premiumJwt: null }, false)).toBe(false);
        expect(willRestorePremiumHoldings(null, false)).toBe(false);
      });
    });
  });

  describe('parseFullBackupFile', () => {
    it('resolves with the parsed object for a well-formed backup file', async () => {
      const file = new File(
        [JSON.stringify({ activeInputs: DEFAULT_INPUTS, savedScenarios: [] })],
        'backup.json',
        { type: 'application/json' }
      );
      const parsed = await parseFullBackupFile(file);
      expect(parsed.activeInputs).toBeTruthy();
    });

    it('rejects invalid JSON', async () => {
      const file = new File(['not json'], 'backup.json', { type: 'application/json' });
      await expect(parseFullBackupFile(file)).rejects.toThrow(/Invalid file format/);
    });

    it('rejects a JSON file that has none of the expected backup fields', async () => {
      const file = new File([JSON.stringify({ unrelated: true })], 'not-a-backup.json', { type: 'application/json' });
      await expect(parseFullBackupFile(file)).rejects.toThrow(/doesn't look like/);
    });
  });
});

// Password-protected files (changelog 143): parseFullBackupFile hands an
// encrypted envelope back untouched so the caller can ask for the
// password; the shape check then runs on the decrypted contents.
describe('fullBackup + backupCrypto', () => {
  it('parseFullBackupFile returns an encrypted envelope untouched, and the contents pass the shape check once opened', async () => {
    const { encryptBackupPayload, decryptBackupPayload, isEncryptedBackup } = await import('../utils/backupCrypto');
    const { assertBackupShape } = await import('../utils/fullBackup');
    const env = await encryptBackupPayload({ activeInputs: DEFAULT_INPUTS, savedScenarios: [] }, 'a strong enough password');
    const file = new File([JSON.stringify(env)], 'backup.json', { type: 'application/json' });
    const parsed = await parseFullBackupFile(file);
    expect(isEncryptedBackup(parsed)).toBe(true);
    // Not shape-checked yet -- the plan fields are inside the ciphertext.
    expect(parsed.activeInputs).toBeUndefined();
    const opened = await decryptBackupPayload(parsed, 'a strong enough password');
    expect(assertBackupShape(opened).activeInputs).toBeTruthy();
  });

  it('assertBackupShape rejects decrypted contents that are not a backup', async () => {
    const { assertBackupShape } = await import('../utils/fullBackup');
    expect(() => assertBackupShape({ hello: 'world' })).toThrow(/doesn't look like an? Outlast ?Retirement backup/i);
    expect(() => assertBackupShape(null)).toThrow(/not a valid backup/);
  });

  it('downloadEncryptedFullBackup writes an envelope, not the plan, and records the backup', async () => {
    const { downloadEncryptedFullBackup } = await import('../utils/fullBackup');
    const { isEncryptedBackup, decryptBackupPayload } = await import('../utils/backupCrypto');
    localStorage.setItem('retire_plan_inputs', JSON.stringify({ schemaVersion: INPUTS_SCHEMA_VERSION, inputs: { ...DEFAULT_INPUTS, currentAge1: 42 } }));
    localStorage.setItem('cfe_premium_jwt', 'live.credential.here');
    let written = null;
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = (blob) => { written = blob; return 'blob:fake'; };
    URL.revokeObjectURL = () => {};
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = () => {};
    try {
      const plain = await downloadEncryptedFullBackup('a strong enough password');
      expect(plain.activeInputs.currentAge1).toBe(42);
      const text = await written.text();
      expect(text).not.toContain('live.credential.here');
      expect(text).not.toContain('currentAge1');
      const env = JSON.parse(text);
      expect(isEncryptedBackup(env)).toBe(true);
      const back = await decryptBackupPayload(env, 'a strong enough password');
      expect(back.premiumJwt).toBe('live.credential.here');
    } finally {
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
