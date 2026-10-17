// Builds the `host` object that PREMIUM_MODULE_CONTRACT.md section 2
// describes, from the host's own contexts. This is the ONLY way a Premium
// module sees the app: it never calls useSimulation()/useEntitlement()
// itself, so what a module can read and touch is exactly what is listed
// here. When you add a key, add it to the contract (and bump the minor).
import { useMemo } from 'react';
import { useSimulation } from '../context/useSimulation';
import { useEntitlement } from '../context/useEntitlement';
import Tooltip from '../components/Tooltip';
import ChartFigure from '../components/ChartFigure';
import DistributionMatrix from '../components/DistributionMatrix';
import { SortableTh } from '../components/SortableTable';
import { useColumnSort } from '../components/useColumnSort';
import { PrefSection } from '../components/PrefSection';
import { CONTRACT_VERSION } from './contract';

// Shared UI handed to modules so they do not duplicate it (contract 2.7).
// A frozen module-level constant so identity is stable across renders.
const HOST_UI = Object.freeze({ Tooltip, ChartFigure, SortableTh, useColumnSort, DistributionMatrix, PrefSection });

export function useHostApi() {
  const sim = useSimulation();
  const ent = useEntitlement();

  const {
    inputs, projection, kpis, verdict, useRealDollars, formatCurrency,
    updateInput,
    showAlert, showConfirm, showPrompt, setActiveTab,
    // holdings store (host-owned; contract 2.3)
    holdings, addHolding, updateHolding, removeHolding, addHoldings, replaceHoldings,
    bucketTotals, taxableCostBasis, assetClassMix, balanceGap,
    liquidations, liquidateHolding, removeLiquidation, replaceLiquidations, addLiquidations,
    pricingSource, setPricingSource, pricingScriptOutOfDate, scriptAckVersion, acknowledgeScriptUpdate,
    portfolioSubTab, setPortfolioSubTab,
  } = sim;

  const holdingsStore = useMemo(() => ({
    holdings, addHolding, updateHolding, removeHolding, addHoldings, replaceHoldings,
    bucketTotals, taxableCostBasis, assetClassMix, balanceGap,
    liquidations, liquidateHolding, removeLiquidation, replaceLiquidations, addLiquidations,
    pricingSource, setPricingSource, pricingScriptOutOfDate, scriptAckVersion, acknowledgeScriptUpdate,
  }), [
    holdings, addHolding, updateHolding, removeHolding, addHoldings, replaceHoldings,
    bucketTotals, taxableCostBasis, assetClassMix, balanceGap,
    liquidations, liquidateHolding, removeLiquidation, replaceLiquidations, addLiquidations,
    pricingSource, setPricingSource, pricingScriptOutOfDate, scriptAckVersion, acknowledgeScriptUpdate,
  ]);

  const entitlement = useMemo(() => ({
    isPremium: !!ent.isPremium,
    licensedTo: ent.licensedTo || null,
    expiresAt: ent.premiumJwtExpiresAt || null,
    preview: !!ent.portfolioPreview,
  }), [ent.isPremium, ent.licensedTo, ent.premiumJwtExpiresAt, ent.portfolioPreview]);

  // Sub-tab state is keyed by area so the host owns the route (contract 2.4).
  const subTabs = useMemo(() => ({
    holdings: { subTab: portfolioSubTab, setSubTab: setPortfolioSubTab },
  }), [portfolioSubTab, setPortfolioSubTab]);

  return useMemo(() => ({
    contractVersion: CONTRACT_VERSION,
    // 2.1 plan data
    inputs, projection, kpis, verdict, useRealDollars, formatCurrency,
    // 2.2 mutations
    updateInput,
    // 2.3 stores
    holdings: holdingsStore,
    // 2.4 dialogs and navigation
    showAlert, showConfirm, showPrompt, setActiveTab, subTabs,
    // 2.6 entitlement
    entitlement,
    // 2.7 shared UI
    ui: HOST_UI,
  }), [
    inputs, projection, kpis, verdict, useRealDollars, formatCurrency, updateInput,
    holdingsStore, showAlert, showConfirm, showPrompt, setActiveTab, subTabs, entitlement,
  ]);
}
