// Demo mode touches localStorage and (on enter/exit) window.location, so
// jsdom -- same opt-in as fullBackup.test.js.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEMO_MODE_KEY,
  isDemoModeActive,
  enterDemoMode,
  exitDemoMode,
} from '../utils/demoMode';
import { buildLoadableDemoPayload } from '../utils/demoPayload';
import { buildDemoInputs, buildDemoHoldings, buildDemoLiquidations } from '../config/demoPlan';
import { sanitizeImportedHoldings, sanitizeImportedLiquidations } from '../utils/portfolioHoldings';
import { migrateInputs, runProjection, DEFAULT_INPUTS, INPUTS_SCHEMA_VERSION } from '../calculator';

// jsdom's location.reload is "not implemented" -- replace it so enter/exit
// can be exercised without navigation. Each test that calls them asserts
// reload was requested, since the reload IS part of the contract (the app
// reseeds all state from localStorage on load).
const stubReload = () => {
  const reload = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload, hash: '' },
    writable: true,
  });
  return reload;
};

describe('demo mode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('the demo payload itself', () => {
    it('carries inputs that migrate cleanly at the current schema version', () => {
      const inputs = buildDemoInputs();
      const migrated = migrateInputs({ schemaVersion: INPUTS_SCHEMA_VERSION, inputs });
      // Every DEFAULT_INPUTS key must exist -- the spread guarantees it,
      // and this catches a future key-rename stranding the demo.
      for (const key of Object.keys(DEFAULT_INPUTS)) {
        expect(migrated, key).toHaveProperty(key);
      }
      expect(migrated.spouse1Name).toBe('Sam');
      expect(migrated.stateTaxState).toBe('ny');
      // Residence and tax jurisdiction must agree -- the UI soft-links
      // them on edit, but demo data is written directly, and a Texan
      // paying NY income tax shipped once (screenshot-caught).
      expect(migrated.stateOfResidence).toBe('NY');
    });

    it('produces a plan the projection can actually run, successfully', () => {
      const proj = runProjection(buildDemoInputs());
      expect(proj.years.length).toBeGreaterThan(30);
      expect(Number.isFinite(proj.endingBalance)).toBe(true);
      // The Carters are engineered to SUCCEED -- a demo that ends broke
      // would make every video a downer and bury the features in alarm UI.
      expect(proj.isSuccessful).toBe(true);
    });

    it('holdings and liquidations survive the import sanitizers without loss', () => {
      const holdings = buildDemoHoldings();
      expect(sanitizeImportedHoldings(holdings)).toHaveLength(holdings.length);
      const liqs = buildDemoLiquidations();
      expect(sanitizeImportedLiquidations(liqs)).toHaveLength(liqs.length);
      // The fictional employer ticker demonstrates manualPricing.
      expect(holdings.find((h) => h.symbol === 'NIMB').manualPricing).toBe(true);
      // At least one holding tracks multi-lot cost basis.
      expect(holdings.some((h) => Array.isArray(h.lots) && h.lots.length > 1)).toBe(true);
    });

    // These build the whole demo payload, which runs a 1,000-trial Monte
    // Carlo per saved scenario -- five of them since changelog 128. In a
    // browser that work goes to a Worker (changelog 129), but jsdom has no
    // Worker, so under test runMonteCarloBatch takes its synchronous
    // fallback and these are as slow as they ever were. Hence the explicit
    // budget: the fallback path is the one being exercised here, and it
    // being slow is the point of moving it off the main thread in the
    // first place.
    it('builds scenarios with real computed metrics and never carries a credential or pricing source', () => {
      const payload = buildLoadableDemoPayload();
      expect(payload.isDemoPlan).toBe(true);
      expect(payload.savedScenarios.length).toBeGreaterThanOrEqual(3);
      for (const sc of payload.savedScenarios) {
        expect(sc.metrics).toBeTruthy();
        expect(Number.isFinite(sc.metrics.endingBalance)).toBe(true);
        expect(sc.tag).toBe('demo');
      }
      expect(payload.premiumJwt).toBeUndefined();
      expect(payload.pricingSource).toBeUndefined();
      expect(payload.dataFreshness).toBeUndefined();
      // And it must serialize -- the committed demo file is this payload.
      expect(() => JSON.stringify(payload)).not.toThrow();
    }, 90000);
  });

  describe('enter / exit round trip', () => {
    const seedUserData = () => {
      localStorage.setItem('retire_plan_inputs', JSON.stringify({
        schemaVersion: INPUTS_SCHEMA_VERSION,
        inputs: { ...DEFAULT_INPUTS, spouse1Name: 'RealUser', taxableInit: 12345 },
      }));
      localStorage.setItem('cfe_premium_holdings_v1', JSON.stringify([
        { id: 'mine-1', symbol: 'REAL', taxTreatment: 'taxable', shares: 1, avgBuyPrice: 1, currentPrice: 1, lots: [], distributionEvents: [], priceSnapshots: [] },
      ]));
      localStorage.setItem('cfe_premium_jwt', 'user-token-untouchable');
    };

    it('snapshots the user, loads the Carters, and never touches the JWT', async () => {
      const reload = stubReload();
      seedUserData();
      expect(await enterDemoMode()).toBe(true);
      expect(reload).toHaveBeenCalled();
      expect(isDemoModeActive()).toBe(true);
      // Demo data is live...
      const inputs = JSON.parse(localStorage.getItem('retire_plan_inputs')).inputs;
      expect(inputs.spouse1Name).toBe('Sam');
      const holdings = JSON.parse(localStorage.getItem('cfe_premium_holdings_v1'));
      expect(holdings.some((h) => h.symbol === 'NIMB')).toBe(true);
      // ...the snapshot holds the user's originals...
      const stored = JSON.parse(localStorage.getItem(DEMO_MODE_KEY));
      expect(stored.snapshot.activeInputs.spouse1Name).toBe('RealUser');
      expect(stored.snapshot.portfolioHoldings[0].symbol).toBe('REAL');
      // ...and the entitlement is exactly as it was.
      expect(localStorage.getItem('cfe_premium_jwt')).toBe('user-token-untouchable');
    }, 90000);

    it('a visitor who had no plan leaves the demo with none, and nothing of the Carters lingers', async () => {
      // the owner, 2026-09-28: straight into the demo, Exit Demo, and the
      // Carters' Monte Carlo range and "backed up today" were still there
      // on an empty plan. Exit now puts storage back exactly.
      const reload = stubReload();
      localStorage.setItem('retire_plan_theme', 'dark');
      await enterDemoMode();
      // What a demo session leaves behind.
      localStorage.setItem('retire_plan_monte_carlo_v1', '{"carters":true}');
      localStorage.setItem('cfe_data_freshness_v1', '{"lastBackupAt":1}');
      localStorage.setItem('cfe_estate_checklist_v1', '{"will":{"done":true}}');
      // Device choices made during the demo.
      localStorage.setItem('retire_plan_disclaimer_accepted', 'true');
      localStorage.setItem('retire_plan_theme', 'light');
      exitDemoMode();
      expect(reload).toHaveBeenCalled();
      expect(isDemoModeActive()).toBe(false);
      for (const key of ['retire_plan_inputs', 'retire_plan_scenarios', 'cfe_premium_holdings_v1', 'retire_plan_monte_carlo_v1', 'cfe_data_freshness_v1', 'cfe_estate_checklist_v1']) {
        expect(localStorage.getItem(key), key).toBeNull();
      }
      expect(localStorage.getItem('retire_plan_disclaimer_accepted')).toBe('true');
      expect(localStorage.getItem('retire_plan_theme')).toBe('light');
    }, 90000);

    it('a demo entered before the exact copy existed still exits cleanly', () => {
      stubReload();
      localStorage.setItem(DEMO_MODE_KEY, JSON.stringify({ active: true, snapshot: { schemaVersion: INPUTS_SCHEMA_VERSION, activeInputs: { ...DEFAULT_INPUTS, spouse1Name: 'OldFormat' }, savedScenarios: [] } }));
      localStorage.setItem('retire_plan_monte_carlo_v1', '{"carters":true}');
      exitDemoMode();
      expect(JSON.parse(localStorage.getItem('retire_plan_inputs')).inputs.spouse1Name).toBe('OldFormat');
      expect(localStorage.getItem('retire_plan_monte_carlo_v1')).toBeNull();
    });

    it('exit restores the original plan exactly and discards demo-session changes', async () => {
      stubReload();
      seedUserData();
      await enterDemoMode();
      // Simulate demo-session tampering.
      localStorage.setItem('retire_plan_inputs', JSON.stringify({
        schemaVersion: INPUTS_SCHEMA_VERSION,
        inputs: { ...DEFAULT_INPUTS, spouse1Name: 'TamperedDemo' },
      }));
      exitDemoMode();
      expect(isDemoModeActive()).toBe(false);
      const inputs = JSON.parse(localStorage.getItem('retire_plan_inputs')).inputs;
      expect(inputs.spouse1Name).toBe('RealUser');
      expect(inputs.taxableInit).toBe(12345);
      const holdings = JSON.parse(localStorage.getItem('cfe_premium_holdings_v1'));
      expect(holdings).toHaveLength(1);
      expect(holdings[0].symbol).toBe('REAL');
      expect(localStorage.getItem('cfe_premium_jwt')).toBe('user-token-untouchable');
    }, 90000);

    it('refuses to double-enter (a demo snapshot must never capture a demo)', async () => {
      stubReload();
      seedUserData();
      expect(await enterDemoMode()).toBe(true);
      expect(await enterDemoMode()).toBe(false);
      // The snapshot still holds the REAL user, not the Carters.
      const stored = JSON.parse(localStorage.getItem(DEMO_MODE_KEY));
      expect(stored.snapshot.activeInputs.spouse1Name).toBe('RealUser');
    }, 90000);

    it('does not clobber the user\'s Live Pricing connection on enter', async () => {
      stubReload();
      seedUserData();
      localStorage.setItem('cfe_premium_pricing_source_v1', JSON.stringify({ csvUrl: 'https://example.com/my.csv', scriptUrl: '' }));
      await enterDemoMode();
      const src = JSON.parse(localStorage.getItem('cfe_premium_pricing_source_v1'));
      expect(src.csvUrl).toBe('https://example.com/my.csv');
    }, 90000);

    // Changelog 129. Entry used to write the safety snapshot, THEN spend
    // several seconds building the demo payload on the main thread. For the
    // length of that freeze localStorage said demo mode was active while the
    // user's own plan was still loaded -- so a tab closed in that window
    // reopened to an Exit Demo banner sitting over real data. The snapshot
    // is now written only once the payload is in hand.
    it('does not claim demo mode is active until the demo payload is ready', async () => {
      stubReload();
      seedUserData();
      const seenDuringBuild = [];
      await enterDemoMode({
        onProgress: () => {
          // Called while the scenarios are still simulating: at this point
          // nothing may have been written yet.
          seenDuringBuild.push({
            demoKey: localStorage.getItem(DEMO_MODE_KEY),
            spouse1Name: JSON.parse(localStorage.getItem('retire_plan_inputs')).inputs.spouse1Name,
          });
        },
      });
      expect(seenDuringBuild.length).toBeGreaterThan(0);
      for (const snap of seenDuringBuild) {
        expect(snap.demoKey).toBeNull();       // no half-entered demo
        expect(snap.spouse1Name).toBe('RealUser'); // user's plan untouched
      }
      // And once it finishes, both are true at once.
      expect(isDemoModeActive()).toBe(true);
      expect(JSON.parse(localStorage.getItem('retire_plan_inputs')).inputs.spouse1Name).toBe('Sam');
    }, 90000);

    it('refuses a second entry while the first is still simulating', async () => {
      stubReload();
      seedUserData();
      let second = null;
      const first = enterDemoMode({
        onProgress: () => { if (second === null) second = enterDemoMode(); },
      });
      expect(await first).toBe(true);
      expect(await second).toBe(false);
      // The snapshot still holds the REAL user, not a half-built demo.
      const stored = JSON.parse(localStorage.getItem(DEMO_MODE_KEY));
      expect(stored.snapshot.activeInputs.spouse1Name).toBe('RealUser');
    }, 90000);

    it('exit with a corrupted key still clears demo mode instead of trapping the user', () => {
      stubReload();
      localStorage.setItem(DEMO_MODE_KEY, '{not json');
      exitDemoMode();
      expect(isDemoModeActive()).toBe(false);
    });
  });
});

// Outside review, 2026-09-28: the demo waited on seven scenario simulations
// before it could open. Entry now loads without them and the app fills the
// odds in afterwards.
describe('the demo opens without waiting on its scenario simulations', () => {
  it('the quick payload is the full payload minus the odds', async () => {
    const { buildQuickDemoPayload, buildLoadableDemoPayload } = await import('../utils/demoPayload');
    const quick = buildQuickDemoPayload();
    const full = buildLoadableDemoPayload();
    expect(quick.savedScenarios.map((s) => s.id)).toEqual(full.savedScenarios.map((s) => s.id));
    expect(quick.savedScenarios.map((s) => s.inputs)).toEqual(full.savedScenarios.map((s) => s.inputs));
    expect(quick.savedScenarios.every((s) => s.metrics.successProbability === null)).toBe(true);
    expect(full.savedScenarios.every((s) => Number.isFinite(s.metrics.successProbability))).toBe(true);
  }, 60000);

  it('fillDemoScenarioOdds fills only the demo scenarios that are waiting', async () => {
    const { buildQuickDemoPayload } = await import('../utils/demoPayload');
    const { fillDemoScenarioOdds, demoScenarioNeedsOdds } = await import('../utils/demoMode');
    const [a, b] = buildQuickDemoPayload().savedScenarios;
    const mine = { ...a, id: 'mine', tag: undefined };
    const done = { ...b, id: 'done', metrics: { ...b.metrics, successProbability: 88 } };
    expect([a, mine, done].map(demoScenarioNeedsOdds)).toEqual([true, false, false]);
    const odds = await fillDemoScenarioOdds([a, mine, done]);
    expect(Object.keys(odds)).toEqual([a.id]);
    expect(odds[a.id]).toBeGreaterThanOrEqual(0);
    expect(odds[a.id]).toBeLessThanOrEqual(100);
  }, 60000);

  it('entry stores the scenarios without odds, for the app to fill', async () => {
    stubReload();
    localStorage.clear();
    const { enterDemoMode: enter } = await import('../utils/demoMode');
    expect(await enter()).toBe(true);
    const stored = JSON.parse(localStorage.getItem('retire_plan_scenarios'));
    const list = Array.isArray(stored) ? stored : stored.scenarios;
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((s) => s.metrics.successProbability === null)).toBe(true);
  }, 90000);
});

