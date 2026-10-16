// Builds the demo payload -- the Carters (config/demoPlan.js) plus their
// saved scenarios -- for demo mode (demoMode.js). A module of its own so the
// demo plan is downloaded only when someone enters the demo: demoMode.js is
// on the app's startup path, this is not (enterDemoMode imports it on use).
import { buildDemoBackupPayload, DEMO_SCENARIO_DEFS } from '../config/demoPlan';
import { buildParkersBackupPayload, PARKERS_SCENARIO_DEFS } from '../config/demoPlanParkers';
import { runProjection, runMonteCarlo } from '../calculator';
import { runMonteCarloBatch } from './monteCarloAsync';
import { ODDS_VERSION } from './scenarioOdds';
import { DEMO_HOUSEHOLD_DEFAULT } from './demoHouseholds';

// Builds the demo's saved scenarios with REAL metrics by running the
// actual projection/Monte Carlo over each variant -- hardcoding results in
// demoPlan.js would silently go stale every time the engine improves.
//
// Split in two because the two halves cost wildly different amounts. The
// projections are free (about 40ms for all five); the simulations are the
// entire cost of entering demo mode, roughly a second each, because every
// scenario runs its own 1,000 lifetimes. Keeping them apart lets the
// caller put just the expensive half on a worker.

// The cheap half: each scenario's inputs and its projection-derived
// metrics. Everything here is main-thread-safe.
function buildDemoScenarioDrafts(demoInputs, defs = DEMO_SCENARIO_DEFS) {
  return defs.map((def, i) => {
    const inputs = def.mutate(demoInputs);
    const proj = runProjection(inputs);
    return {
      id: `demo-scenario-${i + 1}`,
      name: def.name,
      inputs,
      metrics: {
        endingBalance: proj.endingBalance,
        isSuccessful: proj.isSuccessful,
        peakPortfolioWorth: proj.peakPortfolioWorth,
        successProbability: null, // filled in from the simulations below
      },
      planYearAtSave: inputs.planYear,
      savedAt: new Date().toISOString(),
      tag: 'demo',
    };
  });
}

// Attaches the simulated success probabilities to the drafts, in order.
function withSuccessProbabilities(drafts, mcResults) {
  return drafts.map((draft, i) => ({
    ...draft,
    metrics: { ...draft.metrics, successProbability: mcResults[i].successProbability, oddsVersion: ODDS_VERSION },
  }));
}

// Assembles the complete, ready-to-apply demo payload. Exported separately
// from enterDemoMode so the "export outlastretirement_demo.json" script and
// tests can get the exact bytes a real demo session would load.
export function buildLoadableDemoPayload() {
  const payload = buildDemoBackupPayload();
  payload.timestamp = new Date().toISOString();
  const drafts = buildDemoScenarioDrafts(payload.activeInputs);
  payload.savedScenarios = withSuccessProbabilities(drafts, drafts.map((d) => runMonteCarlo(d.inputs)));
  return payload;
}

// The same payload, with the simulations pushed onto a worker so the main
// thread stays responsive. onProgress receives (done, total) after each
// scenario finishes, which is what the entry button reports.
export async function buildLoadableDemoPayloadAsync({ onProgress } = {}) {
  const payload = buildDemoBackupPayload();
  payload.timestamp = new Date().toISOString();
  const drafts = buildDemoScenarioDrafts(payload.activeInputs);
  const mcResults = await runMonteCarloBatch(drafts.map((d) => d.inputs), { onProgress });
  payload.savedScenarios = withSuccessProbabilities(drafts, mcResults);
  return payload;
}

// The payload the live entry uses: the same plan and scenarios, WITHOUT the
// scenarios' Monte Carlo odds. Those were seven simulations run before the
// page could reload -- most of the demo's wait (outside review,
// 2026-09-28). The app fills them in the background once the Carters are on
// screen (fillDemoScenarioOdds, called from App.jsx); until then the
// Scenarios tab says "Calculating…".
// `household` picks which fictional household loads: the Carters (the
// default, every feature in use) or the Parkers (config/demoPlanParkers.js,
// the ordinary household the Learn lessons use). Anything unrecognized gets
// the Carters, so a mistyped link still opens a demo.
export function buildQuickDemoPayload(household = DEMO_HOUSEHOLD_DEFAULT) {
  const parkers = household === 'parkers';
  const payload = parkers ? buildParkersBackupPayload() : buildDemoBackupPayload();
  payload.timestamp = new Date().toISOString();
  payload.savedScenarios = buildDemoScenarioDrafts(payload.activeInputs, parkers ? PARKERS_SCENARIO_DEFS : DEMO_SCENARIO_DEFS);
  return payload;
}
