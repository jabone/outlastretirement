import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  createHolding,
  withPriceSnapshot,
  computeBucketTotals,
  computeTaxableCostBasis,
  computeAssetClassMix,
  createLiquidation,
  applyLiquidationToHolding,
  retractGuessedLotSources,
  migrateDistributionCharacters,
} from '../utils/holdingsCore';
import { recordPortfolioUpdate } from '../utils/dataFreshness';
import { safeSetItem } from '../utils/safeStorage';

// A newly added holding's current price is its first known price -- dated
// today, so it can anchor value reconstruction from day one.
// `source` lets an import say where that price came from ('statement').
const seedSnapshot = (h, source = 'added') => (Number(h?.currentPrice) > 0 && !(Array.isArray(h.priceSnapshots) && h.priceSnapshots.length > 0)
  ? { ...h, priceSnapshots: withPriceSnapshot(h, h.currentPrice, undefined, source) }
  : h);

// Storage key deliberately separate from 'retire_plan_inputs' (see App.jsx)
// and outside calculator.js's DEFAULT_INPUTS/migrateInputs/INPUTS_SCHEMA_VERSION
// pipeline -- this feature is still taking shape, and coupling it to that
// migration system now would mean every future holdings-schema tweak also
// needs a schema-version bump and migration path for the *whole app's*
// inputs, not just this tab. Mirrors PTA's own pattern of one dedicated
// localStorage key per concern (see docs/ARCHITECTURE.md in that project's
// "Storage Keys Matrix") rather than one shared blob.
const STORAGE_KEY = 'cfe_premium_holdings_v1';

// Liquidations get their own dedicated key rather than living inside the
// holdings blob above -- same "one key per concern" reasoning, and it also
// means a liquidation record survives even after the holding it came from
// is fully sold and removed from STORAGE_KEY entirely (see
// createLiquidation's symbol/account/taxTreatment snapshot fields in
// portfolioHoldings.js -- the record never actually needs to look the
// holding back up).
const LIQUIDATIONS_STORAGE_KEY = 'cfe_premium_liquidations_v1';

// One-shot flag for the lot-source retraction below. Its own key, set the
// first time it runs, so a user who afterwards labels a lot as DRIP
// Reinvestment keeps that answer on every later load.
const LOT_SOURCE_RETRACTION_KEY = 'cfe_lot_source_retraction_v1';

export function loadHoldings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    // 'stcg' was a Distribution Character until 2026-09-10; a fund's
    // short-term capital gains are reported as ordinary dividends, so
    // holdings carrying it are remapped rather than left pointing at an
    // option that no longer exists. Unconditional and idempotent -- no flag,
    // because there is one correct answer and an old backup deserves it too.
    const characterMigrated = migrateDistributionCharacters(parsed);
    if (characterMigrated.changed) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(characterMigrated.holdings)); } catch { /* storage unavailable */ }
    }

    // See retractGuessedLotSources: the importer used to assert 'drip' on
    // every share addition after the first, and that label now decides
    // whether shares count as dividend income. Retract those guesses once
    // rather than reporting a funding history as income received.
    let done = false;
    try { done = localStorage.getItem(LOT_SOURCE_RETRACTION_KEY) === 'done'; } catch { /* storage unavailable */ }
    if (done) return characterMigrated.holdings;
    const { holdings, changed } = retractGuessedLotSources(characterMigrated.holdings);
    try {
      if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
      localStorage.setItem(LOT_SOURCE_RETRACTION_KEY, 'done');
    } catch { /* storage unavailable -- retried next load, which is harmless */ }
    return holdings;
  } catch (e) {
    console.error('Failed to parse saved portfolio holdings', e);
    return [];
  }
}

function loadLiquidations() {
  try {
    const saved = localStorage.getItem(LIQUIDATIONS_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to parse saved liquidations', e);
    return [];
  }
}

// Self-contained CRUD + rollup hook for the premium Detailed Holdings tab.
// Called ONCE, from App.jsx, and threaded through SimulationContext's
// simulationState memo alongside everything else -- PortfolioTab.jsx and
// SettingsTab.jsx both consume it from there now (SettingsTab.jsx needs
// bucketTotals for the Initial Balances <-> Detailed Holdings live sync,
// see App.jsx's useEffect right after this hook's call site). Originally
// this hook was called directly by PortfolioTab.jsx alone; it was lifted
// up here specifically to avoid two independent useState-backed instances
// both reading STORAGE_KEY and silently drifting apart within a session
// (see fullBackup.js's header for the same class of bug). Do not add a
// second direct call to this hook anywhere else -- consume it via
// useSimulation() instead.
// `allowMutations` (added 2026-08-23 with demo mode): when false, every
// mutator below is a fail-closed no-op. This is the single choke point all
// holdings/liquidations writes flow through, which is what makes the demo
// mode's read-only Portfolio preview enforceable in one place: App.jsx
// passes the REAL entitlement (isPremium) here, never a demo flag -- so
// someone who defeats the preview UI still can't mutate through the hook
// without the actual entitlement, and a premium user keeps full editing
// even inside the demo. Reads (holdings, rollups) are never gated.
export function usePortfolioHoldings(allowMutations = true) {
  const [holdings, setHoldings] = useState(loadHoldings);
  const [liquidations, setLiquidations] = useState(loadLiquidations);
  const blocked = !allowMutations;

  useEffect(() => {
    safeSetItem(STORAGE_KEY, JSON.stringify(holdings));
  }, [holdings]);

  useEffect(() => {
    safeSetItem(LIQUIDATIONS_STORAGE_KEY, JSON.stringify(liquidations));
  }, [liquidations]);

  // Every DELIBERATE holdings mutation below also stamps the portfolio-
  // freshness clock (dataFreshness.js) -- adding, editing, importing, or
  // selling a holding is the user reconciling their data with reality.
  // The one exception: updateHolding's { silent: true } option, used by
  // the Live Pricing refresh loop in PortfolioTab. An automatic price
  // fetch proves nothing about share counts or missed contributions, so
  // it must NOT quiet the "update your portfolio data" reminder --
  // otherwise fresh prices hide a stale portfolio indefinitely.
  const addHolding = useCallback((overrides) => {
    if (blocked) return;
    setHoldings((prev) => [...prev, seedSnapshot(createHolding(overrides))]);
    recordPortfolioUpdate();
  }, [blocked]);

  const updateHolding = useCallback((id, patch, opts = {}) => {
    if (blocked) return;
    setHoldings((prev) => prev.map((h) => {
      if (h.id !== id) return h;
      // A price set by hand or by a statement import re-anchors a proxy-
      // priced holding: the next Refresh records the proxy's price against
      // this one instead of scaling it (see applyProxyPrice).
      const reanchor = patch.currentPrice !== undefined && !('pricingAnchor' in patch) && h.pricingSymbol
        ? { pricingAnchor: null } : {};
      // Every learned price becomes a dated snapshot (withPriceSnapshot),
      // which is what lets the trajectory chart / Milestones reconstruct
      // past value at the cadence the user actually updates prices.
      const snapshot = Number(patch.currentPrice) > 0 && !('priceSnapshots' in patch)
        ? { priceSnapshots: withPriceSnapshot(h, patch.currentPrice, undefined, opts.priceSource || (opts.silent ? 'refresh' : 'manual')) } : {};
      return { ...h, ...patch, ...reanchor, ...snapshot };
    }));
    if (!opts.silent) recordPortfolioUpdate();
  }, [blocked]);

  const removeHolding = useCallback((id) => {
    if (blocked) return;
    setHoldings((prev) => prev.filter((h) => h.id !== id));
    recordPortfolioUpdate();
  }, [blocked]);

  // Bulk variants for the PTA backup import flow (PortfolioTab.jsx) -- a
  // single setHoldings call for N holdings instead of N re-renders.
  const addHoldings = useCallback((newHoldings, opts = {}) => {
    if (blocked) return;
    setHoldings((prev) => [...prev, ...newHoldings.map((h) => seedSnapshot(h, opts.priceSource))]);
    recordPortfolioUpdate();
  }, [blocked]);

  const replaceHoldings = useCallback((newHoldings) => {
    if (blocked) return;
    setHoldings(newHoldings);
    recordPortfolioUpdate();
  }, [blocked]);

  const bucketTotals = useMemo(() => computeBucketTotals(holdings), [holdings]);
  const taxableCostBasis = useMemo(() => computeTaxableCostBasis(holdings), [holdings]);
  const assetClassMix = useMemo(() => computeAssetClassMix(holdings), [holdings]);

  // The one non-CRUD action: sells sharesToSell out of holdingId (FIFO
  // across its lots, or its flat shares if it has none -- see
  // createLiquidation/applyLiquidationToHolding in portfolioHoldings.js),
  // records an immutable liquidation entry, and either updates the holding
  // in place (partial sale) or removes it entirely (full sale, matching
  // Portfolio Tracker's own precedent of not leaving a permanent $0/0-share
  // row behind). Returns the new liquidation record on success, or null if
  // the sale couldn't be filled (e.g. requesting more shares than the
  // holding has) -- the caller should treat null as "nothing happened."
  const liquidateHolding = useCallback((holdingId, params) => {
    if (blocked) return null;
    const holding = holdings.find((h) => h.id === holdingId);
    if (!holding) return null;
    const liquidation = createLiquidation(holding, params);
    if (!liquidation) return null;
    const { updatedHolding, isFullyLiquidated } = applyLiquidationToHolding(holding, liquidation);
    setHoldings((prev) =>
      isFullyLiquidated
        ? prev.filter((h) => h.id !== holdingId)
        : prev.map((h) => (h.id === holdingId ? updatedHolding : h))
    );
    setLiquidations((prev) => [liquidation, ...prev]);
    recordPortfolioUpdate();
    return liquidation;
  }, [holdings, blocked]);

  const removeLiquidation = useCallback((id) => {
    if (blocked) return;
    setLiquidations((prev) => prev.filter((l) => l.id !== id));
  }, [blocked]);

  // Bulk variant for Cloud Backup & Sync restore (LedgerTab.jsx) -- mirrors
  // replaceHoldings above.
  const replaceLiquidations = useCallback((newLiquidations) => {
    if (blocked) return;
    setLiquidations(newLiquidations);
  }, [blocked]);

  // Bulk variant for the PTA backup import flow (PortfolioTab.jsx ->
  // PtaImportPanel.jsx) -- mirrors addHoldings above. Ledger-derived
  // liquidations (negative-sharesAdded entries, replayed into real sale
  // records by applyTaxTreatments in portfolioHoldings.js) are always
  // additive, even when the import's holdings are committed via
  // "Replace All Holdings" -- a liquidation is a historical closed-position
  // record independent of what's currently held (the same reason a full
  // sale already keeps its liquidation after removing the holding), so a
  // holdings replace has no business erasing sale history that came in
  // with this same import.
  const addLiquidations = useCallback((newLiquidations) => {
    if (blocked) return;
    if (!newLiquidations || newLiquidations.length === 0) return;
    setLiquidations((prev) => [...newLiquidations, ...prev]);
  }, [blocked]);

  return {
    holdings,
    addHolding,
    updateHolding,
    removeHolding,
    addHoldings,
    replaceHoldings,
    bucketTotals,
    taxableCostBasis,
    assetClassMix,
    liquidations,
    liquidateHolding,
    removeLiquidation,
    replaceLiquidations,
    addLiquidations,
  };
}
