// host.lib -- the explicit list of host code a Premium module may use
// (PREMIUM_MODULE_CONTRACT.md 2.8). A module written in this repo imports
// these as `@host/<path>`; the Premium repo's build turns every such import
// into a lookup on window.__OR_HOST__ (published by publishHostLib below),
// so a separately built chunk shares the host's React and never bundles a
// second copy. Anything NOT listed here is not reachable from a module.
//
// Two kinds of entry:
//   static -- imported here, so it lands in the host bundle alongside the
//             Premium host plumbing
//   lazy   -- a function returning the dynamic import, for heavy or
//             text-only things that must stay out of the startup chunk
//
// Keep the keys equal to the `@host/` specifier with the prefix removed.
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as jsxRuntime from 'react/jsx-runtime';
import * as lucide from 'lucide-react';

import * as portfolioHoldings from '../utils/portfolioHoldings';
import * as holdingsCore from '../utils/holdingsCore';
import * as pricingSource from '../utils/pricingSource';
import * as planFundImport from '../utils/planFundImport';
import * as localOnlyMode from '../utils/localOnlyMode';
import * as retirementFunding from '../utils/retirementFunding';
import * as reconciliation from '../utils/reconciliation';
import * as printSection from '../utils/printSection';
import * as priceRefreshStamp from '../utils/priceRefreshStamp';
import * as planVerdict from '../utils/planVerdict';
import * as imagesReady from '../utils/imagesReady';
import * as dataFreshness from '../utils/dataFreshness';
import * as csvSafety from '../utils/csvSafety';
import * as copyText from '../utils/copyText';
import * as chartSummaries from '../utils/chartSummaries';
import * as premiumOffering from '../config/premiumOffering';
import * as Tooltip from '../components/Tooltip';
import * as SwitchRow from '../components/SwitchRow';
import * as SortableTable from '../components/SortableTable';
import * as useColumnSort from '../components/useColumnSort';
import * as sortRows from '../components/sortRows';
import * as PrintFrame from '../components/PrintFrame';
import * as DistributionMatrix from '../components/DistributionMatrix';
import * as ChartFigure from '../components/ChartFigure';
import * as NumberInput from '../components/NumberInput';
import * as calculator from '../calculator';
import * as retirementReadiness from '../utils/retirementReadiness';
import * as bigExpenses from '../utils/bigExpenses';
import * as historicalStarts from '../utils/historicalStarts';
import * as relocationCompare from '../utils/relocationCompare';
import * as jurisdictionCatalog from '../config/jurisdictionCatalog';

export const HOST_PACKAGES = Object.freeze({
  react: React,
  'react-dom': ReactDOM,
  'react/jsx-runtime': jsxRuntime,
  'lucide-react': lucide,
});

export const HOST_STATIC = Object.freeze({
  'utils/portfolioHoldings': portfolioHoldings,
  'utils/holdingsCore': holdingsCore,
  'utils/pricingSource': pricingSource,
  'utils/planFundImport': planFundImport,
  'utils/localOnlyMode': localOnlyMode,
  'utils/retirementFunding': retirementFunding,
  'utils/reconciliation': reconciliation,
  'utils/printSection': printSection,
  'utils/priceRefreshStamp': priceRefreshStamp,
  'utils/planVerdict': planVerdict,
  'utils/imagesReady': imagesReady,
  'utils/dataFreshness': dataFreshness,
  'utils/csvSafety': csvSafety,
  'utils/copyText': copyText,
  'utils/chartSummaries': chartSummaries,
  'config/premiumOffering': premiumOffering,
  'components/Tooltip': Tooltip,
  'components/SwitchRow': SwitchRow,
  'components/SortableTable': SortableTable,
  'components/useColumnSort': useColumnSort,
  'components/sortRows': sortRows,
  'components/PrintFrame': PrintFrame,
  'components/DistributionMatrix': DistributionMatrix,
  'components/ChartFigure': ChartFigure,
  'components/NumberInput': NumberInput,
  // The engine entry: open code, published whole so a module computes with
  // the same functions the host does (spending bridge, essential share).
  calculator,
  'utils/retirementReadiness': retirementReadiness,
  'utils/bigExpenses': bigExpenses,
  'utils/historicalStarts': historicalStarts,
  'utils/relocationCompare': relocationCompare,
  'config/jurisdictionCatalog': jurisdictionCatalog,
});

export const HOST_LAZY = Object.freeze({
  'components/LazyCharts': () => import('../components/LazyCharts'),
  'scripts/pricing-sheet-apps-script.gs?raw': () => import('../../scripts/pricing-sheet-apps-script.gs?raw'),
});

export const HOST_LIB_VERSION = 1;

// Publish once, before a remote chunk is executed. Idempotent. The chunk
// reads window.__OR_HOST__ at load time; the host never reads it back.
export function publishHostLib() {
  if (typeof window === 'undefined') return null;
  if (!window.__OR_HOST__) {
    window.__OR_HOST__ = Object.freeze({
      version: HOST_LIB_VERSION,
      packages: HOST_PACKAGES,
      static: HOST_STATIC,
      lazy: HOST_LAZY,
      // A chunk registers its factory here under its area id.
      modules: {},
    });
  }
  return window.__OR_HOST__;
}
