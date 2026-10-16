// The committed outlastretirement_demo.json is a GENERATED artifact
// (`npx vite-node scripts/generateDemoBackup.mjs`) that doubles as the
// recording fixture for the video series in the cashflowengine-business
// repo. Every episode's click path assumes exactly these numbers.
//
// Nothing guarded it until now. generateDemoBackup.mjs claimed "a test in
// demoMode.test.js compares shapes" -- that test does not exist, and the
// file silently drifted TWO demoPlan commits behind: changelog 144 gave the
// Carters a home and re-tuned the inheritance scenarios from $2.0M/$2.2M
// down to $1.3M/$1.45M, and the fixture kept the old figures and had no
// home fields at all. Anyone recording from it would have filmed numbers
// the app no longer produces.
//
// So: deep-equal the committed file against what demoPlan.js builds today.
// Everything compared here is deterministic. The two fields that are NOT
// -- `timestamp` (stamped at load) and each scenario's `savedAt` -- are
// deliberately excluded. `metrics.successProbability` used to be a third
// (1,000 trials off an unseeded Math.random); since changelog 247 the
// Monte Carlo is seeded, so it is pinned below like everything else.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildDemoBackupPayload, DEMO_SCENARIO_DEFS } from '../config/demoPlan';
import { runMonteCarlo } from '../calculator';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const committed = JSON.parse(
  readFileSync(resolve(repoRoot, 'outlastretirement_demo.json'), 'utf8')
);

describe('outlastretirement_demo.json matches demoPlan.js (regenerate if this fails)', () => {
  const fresh = buildDemoBackupPayload();

  it('carries the current backup and inputs schema versions', () => {
    expect(committed.version).toBe(fresh.version);
    expect(committed.schemaVersion).toBe(fresh.schemaVersion);
    expect(committed.isDemoPlan).toBe(true);
  });

  it('activeInputs is byte-identical to buildDemoInputs()', () => {
    // Key-set first: a missing key is the drift that actually happened
    // (homeOwned/homeValueInit/homeAppreciationRate were absent), and
    // naming it beats a 300-key object diff.
    expect(Object.keys(committed.activeInputs).sort())
      .toEqual(Object.keys(fresh.activeInputs).sort());
    expect(committed.activeInputs).toEqual(fresh.activeInputs);
  });

  it('the home and other property from changelog 144 are present', () => {
    // The specific regression above, pinned so it cannot come back quietly.
    expect(committed.activeInputs.homeOwned).toBe(true);
    expect(committed.activeInputs.homeValueInit).toBeGreaterThan(0);
    expect(committed.activeInputs.otherEstateAssetsInit).toBeGreaterThan(0);
  });

  it('holdings, liquidations and the estate checklist match', () => {
    expect(committed.portfolioHoldings).toEqual(fresh.portfolioHoldings);
    expect(committed.liquidations).toEqual(fresh.liquidations);
    expect(committed.estateChecklist).toEqual(fresh.estateChecklist);
  });

  it('the saved scenarios are the current DEMO_SCENARIO_DEFS, with matching inputs', () => {
    expect(committed.savedScenarios.map((s) => s.name))
      .toEqual(DEMO_SCENARIO_DEFS.map((d) => d.name));

    // Names alone would not have caught the $2.0M -> $1.3M re-tune if the
    // label had been left alone, so compare each scenario's actual inputs
    // against the mutation applied to today's baseline.
    DEMO_SCENARIO_DEFS.forEach((def, i) => {
      expect(committed.savedScenarios[i].inputs)
        .toEqual(def.mutate(fresh.activeInputs));
    });
  });

  it('every scenario reports a success probability in range', () => {
    // A fixture generated without the simulations would have undefined
    // here and record as a blank column in the Scenarios tab.
    committed.savedScenarios.forEach((s) => {
      expect(typeof s.metrics.successProbability).toBe('number');
      expect(s.metrics.successProbability).toBeGreaterThanOrEqual(0);
      expect(s.metrics.successProbability).toBeLessThanOrEqual(100);
    });
  });

  it('the success probabilities are the ones the seeded Monte Carlo produces today', () => {
    // Changelog 247: reproducible for the plan's seed, so a video callout
    // that quotes one of these is quoting a number the app still shows.
    // buildDemoBackupPayload leaves the simulations to the generator
    // script, so run them here the way it does: each scenario's own
    // inputs, at the seed those inputs carry. ~1s per scenario.
    const today = DEMO_SCENARIO_DEFS.map((def) => runMonteCarlo(def.mutate(fresh.activeInputs)).successProbability);
    expect(committed.savedScenarios.map((s) => s.metrics.successProbability)).toEqual(today);
  }, 30000);
});
