// Saved scenarios keep their Monte Carlo odds from the moment they were
// saved, while their balances are re-run live. After a release that changes
// the projection, those odds described an older engine and sat next to
// current balances with nothing to say so. Each saved figure now carries
// the release it was computed under; one from an earlier release is
// recomputed in the background, and shown as "Calculating…" until then.
import { LATEST_CHANGELOG_ID } from '../config/changelogLatest';

export const ODDS_VERSION = LATEST_CHANGELOG_ID;

export function scenarioOddsCurrent(sc) {
  const m = sc && sc.metrics;
  return !!m && Number.isFinite(m.successProbability) && m.oddsVersion === ODDS_VERSION;
}

// True when a saved scenario's odds are missing or from an earlier release.
export function scenarioNeedsOdds(sc) {
  return !!sc && !!sc.inputs && !scenarioOddsCurrent(sc);
}

// The odds to show for a saved scenario: its figure when current, else null
// (the caller shows "Calculating…" while the background run finishes).
export function shownScenarioOdds(sc) {
  return scenarioOddsCurrent(sc) ? sc.metrics.successProbability : null;
}
