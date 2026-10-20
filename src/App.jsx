import React, { useState, useMemo, useEffect, useCallback, useRef, useId } from 'react';
import { flushSync } from 'react-dom';
import { readinessSummary } from './utils/readinessSummary';
import { planHorizon } from './utils/retirementReadiness';
import { monteCarloRange } from './utils/monteCarloRange';
import { historicalHeadline } from './utils/historicalStarts';
import { growthRange } from './utils/growthRange';
import { guardrailsComparisonForDisplay } from './utils/guardrailsDisplay';
import { buildTaxVisualizerData } from './utils/taxVisualizerData';
import usePersistentToggle, { OVERLAY_TAXES_KEY, OVERLAY_LIFESTYLE_KEY } from './utils/usePersistentToggle';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { useIdleMemo, runWhenIdle } from './utils/idle';

// Lazy load chart components to code-split Recharts bundle out of the entry chunk.
// lazyWithRetry reloads once when a chunk from an older deploy is gone.
const AssetGrowthChart = lazyWithRetry(() => import('./components/LazyCharts').then(m => ({ default: m.AssetGrowthChart })));
const TaxBracketChart = lazyWithRetry(() => import('./components/LazyCharts').then(m => ({ default: m.TaxBracketChart })));
const MonteCarloChart = lazyWithRetry(() => import('./components/LazyCharts').then(m => ({ default: m.MonteCarloChart })));
const DieWithZeroChart = lazyWithRetry(() => import('./components/LazyCharts').then(m => ({ default: m.DieWithZeroChart })));
const AgeFinderChart = lazyWithRetry(() => import('./components/LazyCharts').then(m => ({ default: m.AgeFinderChart })));
const EstateLegacyChart = lazyWithRetry(() => import('./components/LazyCharts').then(m => ({ default: m.EstateLegacyChart })));
const CashFlowSankeyChart = lazyWithRetry(() => import('./components/LazyCharts').then(m => ({ default: m.CashFlowSankeyChart })));
import Tooltip from './components/Tooltip';
import ErrorBoundary from './components/ErrorBoundary';
import ForeignYearsNotice from './components/ForeignYearsNoticeLoader';
import QuickUpdate from './components/QuickUpdate';
import MaximizeButton from './components/MaximizeButton';
import { ClaimingGridCorner, AxisName } from './components/ClaimingGridAxes';
import DataFreshnessBanner from './components/DataFreshnessBanner';
import PremiumExpiryBanner from './components/PremiumExpiryBanner';
import SafariStorageBanner from './components/SafariStorageBanner';
import AppDialog from './components/AppDialog';
import ModalShell from './components/ModalShell';
import { WIZARD_FIELDS } from './config/wizardFields';
import { planKey, readMonteCarloCache, writeMonteCarloCache, clearMonteCarloCache, MC_AUTO_RUN_KEY, MC_AUTO_RUN_DELAY_MS, isNativeShell } from './utils/monteCarloCache';
import { farFormatter, peakYearOf, ROUND_FAR_DOLLARS_KEY, ROUND_FAR_DOLLARS_DEFAULT } from './utils/farDollars';
import SimulationContext from './context/SimulationContext';
import EntitlementContext from './context/EntitlementContext';
import DashboardTab from './components/tabs/DashboardTab';
import { deflateProjectionForDisplay, monteCarloForDisplay, yearEndFactor, finalBalanceFactor } from './utils/displayDollars';
import { estateForProjection } from './utils/relocationCompare';
import Sidebar from './components/layout/Sidebar';
import { buildActionPlan } from './utils/actionPlan';
import {
  DISCLAIMER_TITLE, DISCLAIMER_PARAGRAPHS, DISCLAIMER_ACCEPT_LABEL,
  DISCLAIMER_SHORT, DISCLAIMER_PRINT,
} from './config/disclaimer';
import { ROUTES, DEFAULT_TAB, readRoute, formatHash, initialSubTab } from './utils/tabRouting';
import { readPlanMode, tabForMode } from './utils/planMode';
import { FOCUS_EVENT as FIND_SETTING_FOCUS } from './components/findSettingEvents';
import { compactDollars } from './utils/compactDollars';
import PrintPacketLoader from './components/PrintPacketLoader';
import PrintFrame from './components/PrintFrame';
import { printInputsFor, heirLabel } from './utils/printNames';
import BrandMark from './components/BrandMark';
import MigrationNotice from './components/MigrationNotice';
import { BRAND_NAME, BRAND_DOMAIN, COPYRIGHT_NOTICE, PRIVACY_PROMISE, PRIVACY_URL, TERMS_URL, ACCESSIBILITY_URL } from './config/branding';
import { growthSummary, monteCarloSummary, taxBracketSummary, estateSummary } from './utils/chartSummaries';
import { planVerdict, verdictColor, verdictClass } from './utils/planVerdict';
import { safeSetItem, safeRemoveItem } from './utils/safeStorage';
import { useThemePreference } from './utils/useThemePreference';
import { verifyPremiumJwt } from './utils/premiumJwt';
import { usePortfolioHoldings } from './context/usePortfolioHoldings';
import PremiumMount from './premium/PremiumMount';
import { relevantBrackets, allBracketsOn, sameBrackets, relevantIrmaaTiers, sameIrmaaTiers, allIrmaaOn, readBracketPref, writeBracketPref, clearBracketPref } from './utils/relevantTaxBrackets';
import { computeConcentratedStockLinkValues, computeBucketTotals, computeTaxableCostBasis, computeTaxableDistributionYield, canSyncFromHoldings, computeCashReserveFromHoldings, unlinkedBalanceGap } from './utils/holdingsCore';
import { recordPlanChange, requestPersistentStorage } from './utils/dataFreshness';
import { isDemoModeActive, enterDemoMode, fillScenarioOdds } from './utils/demoMode';
import { ODDS_VERSION, scenarioNeedsOdds } from './utils/scenarioOdds';
import { whatsNewMayShow } from './utils/whatsNewGate';
import { runMonteCarloBatch } from './utils/monteCarloAsync';
import DemoModeBanner from './components/DemoModeBanner';
import {
  loadPricingSource,
  savePricingSource,
  loadScriptAckVersion,
  saveScriptAckVersion,
  PRICING_SHEET_SCRIPT_VERSION,
} from './utils/pricingSource';

// Every tab but the Dashboard loads on first open instead of with the app
// (outside review, 2026-09-28: a 2.8 MB main bundle, 6.4 s before anything
// showed on a phone; the Plan tabs followed in the 2026-09-30 review). The
// service worker still precaches every chunk after the first load, so later
// opens -- and offline use -- are as fast as before. What's New is lazy for
// the same reason: it carries the whole changelog. lazyWithRetry reloads the
// page once when a tab left open across a deploy asks for a chunk that no
// longer exists.
const SettingsTab = lazyWithRetry(() => import('./components/tabs/SettingsTab'));
const InterviewTab = lazyWithRetry(() => import('./components/tabs/InterviewTab'));
const GuideTab = lazyWithRetry(() => import('./components/tabs/GuideTab'));
const TaxEstateTab = lazyWithRetry(() => import('./components/tabs/TaxEstateTab'));
const YearLedgerTab = lazyWithRetry(() => import('./components/tabs/YearLedgerTab'));
const ScenariosTab = lazyWithRetry(() => import('./components/tabs/ScenariosTab'));
const RiskTab = lazyWithRetry(() => import('./components/tabs/RiskTab'));
const ReadinessTab = lazyWithRetry(() => import('./components/tabs/ReadinessTab'));
const StrategyTab = lazyWithRetry(() => import('./components/tabs/StrategyTab'));
const LifePlanTab = lazyWithRetry(() => import('./components/tabs/LifePlanTab'));
const PreferencesTab = lazyWithRetry(() => import('./components/tabs/PreferencesTab'));
const PremiumTab = lazyWithRetry(() => import('./components/tabs/PremiumTab'));
const WhatsNewPopup = lazyWithRetry(() => import('./components/WhatsNewPopup'));

// The first-visit Quick Setup's sections, in one chunk that loads when Quick
// Setup opens. Each carries its own Suspense so the modal's markup is
// unchanged.
const quickSetupSection = (name) => {
  const Lazy = lazyWithRetry(() => import('./components/plan/quickSetupSections').then((m) => ({ default: m[name] })));
  const QuickSetupSection = (props) => (
    <React.Suspense fallback={null}><Lazy {...props} /></React.Suspense>
  );
  QuickSetupSection.displayName = name;
  return QuickSetupSection;
};
const GuidedSection = quickSetupSection('GuidedSection');
const DemographicsSection = quickSetupSection('DemographicsSection');
const SalariesSection = quickSetupSection('SalariesSection');
const SocialSecuritySection = quickSetupSection('SocialSecuritySection');
const AnnuitiesPensionsSection = quickSetupSection('AnnuitiesPensionsSection');
const InitialBalancesSection = quickSetupSection('InitialBalancesSection');
const RetirementSpendSection = quickSetupSection('RetirementSpendSection');
const ContributionsSection = quickSetupSection('ContributionsSection');

// Shown for the moment a lazily loaded tab takes to arrive.
const TabFallback = () => (
  <div role="status" style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
    Loading&hellip;
  </div>
);

// Dynamic loading fallback component for charts
const ChartFallback = () => (
  <div style={{ 
    width: '100%', 
    height: '100%', 
    display: 'flex', 
    flexDirection: 'column',
    alignItems: 'center', 
    justifyContent: 'center', 
    backgroundColor: 'rgba(255,255,255,0.01)', 
    borderRadius: '12px',
    border: '1px dashed var(--card-border)',
    minHeight: '240px'
  }}>
    <div className="spinner" style={{ 
      width: '24px', 
      height: '24px', 
      borderRadius: '50%', 
      border: '2px solid rgba(42, 127, 122, 0.2)', 
      borderTopColor: 'var(--accent-primary)',
      marginBottom: '8px'
    }} />
    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Loading chart visualization...</span>
  </div>
);

import {
  TrendingUp, Settings,
  CheckCircle,
  XCircle, X, Coins, Trophy, Sparkles, AlertTriangle,
  Play, Pause, Type, Menu, Zap,
  FlaskConical, Lightbulb, Star, ChevronDown,
} from 'lucide-react';
import {
  DEFAULT_INPUTS,
  INPUTS_SCHEMA_VERSION,
  migrateInputs,
  migrateScenarios,
  runProjection,
  legacyAfterTaxes,
  runOptimizer,
  gridBestExtraStrategy,
  findOptimalRetirementAge,
  runMonteCarlo,
  findDieWithZeroSpending,
  findTargetPortfolioSize,
  spouse2RetireAgeMatching,
  getSSClaimingHeatmap,
  dieWithZeroByLongevity,
  deflateEstateResultForDisplay,
  computeStressComparisonData,
  computeOptimizerResultsReal,
  computeAgeFinderResultsReal,
  runSensitivityAnalysis,
  computeSensitivityAnalysisReal,
  getRothBracketWithdrawalHeatmap,
  getRothLadderScheduleHeatmap,
  runHistoricalStarts,
  findHistoricalSafeMax,
  getMinimumRequiredReturn,
  stateTaxJurisdictionFor,
  readResidencyTimeline,
  planWideResidence,
  rmdStartAge,
} from './calculator';
import { hasStateRules, stateRulesName, stateRulesRate } from './utils/stateRulesSummary';

// Helper to compute RMD age dynamically based on birth year according to SECURE Act 2.0
const getRMDAge = rmdStartAge;

// Debounce hook: returns a value that only updates after `delay` ms of inactivity.
// Used to prevent expensive memos from re-running on every keystroke.
function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const timerRef = useRef(null);
  useEffect(() => {
    timerRef.current = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timerRef.current);
  }, [value, delay]);
  return debouncedValue;
}

export default function App() {
  // Input settings state
  const [inputs, setInputs] = useState(() => {
    const saved = localStorage.getItem('retire_plan_inputs');
    if (saved) {
      try {
        return migrateInputs(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved inputs", e);
      }
    }
    return DEFAULT_INPUTS;
  });

  // Auto-save to localStorage, stamped with the current schema version so a
  // future load can tell whether this data needs migrating (see migrateInputs
  // in calculator.js).
  useEffect(() => {
    // safeSetItem: a full or unavailable storage raises the storage
    // banner instead of throwing out of this effect (which unmounted the
    // whole app), and a plan another tab has since changed is not
    // overwritten (see safeStorage.js / StorageBanners.jsx).
    safeSetItem('retire_plan_inputs', JSON.stringify({
      schemaVersion: INPUTS_SCHEMA_VERSION,
      inputs,
    }));
    // Stamp "the plan has changed" for the backup-staleness reminder
    // (dataFreshness.js -- internally throttled to one write a minute, so
    // this is not a second store on every keystroke).
    recordPlanChange();
  }, [inputs]);

  // One-time, fire-and-forget ask to exempt this origin from automatic
  // storage eviction (disk pressure, Safari's inactivity expiry). Does
  // NOT protect against a deliberate "Clear browsing data" -- that is what
  // Backup Everything and the staleness reminder are for -- it only
  // narrows the accidental-loss surface. See dataFreshness.js.
  useEffect(() => {
    requestPersistentStorage();
  }, []);
  
  // Navigation active tab.
  //
  // Seeded from the URL hash so a reload, a bookmark, or a link someone
  // pasted into an email lands where it says it does. Read exactly once,
  // in a lazy initializer, rather than in an effect -- reading it later
  // would render Dashboard first and then jump, which looks like a bug
  // even when it settles correctly.
  //
  // No localStorage here on purpose. The URL is the only memory: opening
  // the app fresh with no hash always starts on Dashboard, which is the
  // orientation page. Restoring whatever section someone happened to be
  // editing last week would drop them mid-form with no context for how
  // they got there.
  const [initialRoute] = useState(() => readRoute());
  const [activeTab, setActiveTab] = useState(() => initialRoute?.tab || DEFAULT_TAB);

  // --- Premium entitlement: TEMPORARY dev-only stub + lightweight
  // self-issued token -- still neither one is the real EntitlementProvider
  // ---
  // See INTEGRATION_STRATEGY.md (repo root) Section 1: the real billing/
  // entitlement mechanism (Stripe+JWT, IAP, or something else) is a
  // deliberately open decision, not made yet. For now the one unlock path
  // is premiumJwtToken -- a self-issued RS256 token (see
  // scripts/mint-premium-jwt.mjs at the repo root), pasted into the
  // "Premium Access Key" field. No Stripe, no accounts, just a
  // manually-issued, cryptographically-verified, expiring credential,
  // checked in the browser only (there is no server-side check).
  // verifyPremiumJwt() does full signature verification and requires an
  // expiry, so a hand-crafted token fails rather than being merely
  // inconvenient to construct. (An early localhost-only "fake Premium"
  // switch for testing was removed entirely.)
  //
  // Whichever real provider eventually ships should replace it; nothing
  // downstream of useEntitlement() should need to change either way.
  const [premiumJwtToken, setPremiumJwtToken] = useState(() => localStorage.getItem('cfe_premium_jwt') || '');

  // Demo mode (utils/demoMode.js): read once per load. Entering/exiting
  // always goes through a full reload, so this can never go stale within
  // a session -- which is what makes it safe to fold into entitlement
  // memos and route guards below without a subscription.
  const [demoActive] = useState(() => isDemoModeActive());
  // Whether the What's New popup might have something to show (checked once,
  // the first time it is allowed to appear; see the popup's mount below).
  const [whatsNewPending, setWhatsNewPending] = useState(false);
  useEffect(() => {
    if (premiumJwtToken) {
      safeSetItem('cfe_premium_jwt', premiumJwtToken);
    } else {
      safeRemoveItem('cfe_premium_jwt');
    }
  }, [premiumJwtToken]);
  // Verification is async (jose's jwtVerify), so it can't live in the
  // entitlementState useMemo below. Re-checks whenever the stored token
  // changes (including on first mount) and again on a slow interval so a
  // token that expires mid-session stops being treated as valid without
  // requiring a page reload.
  // `checked` distinguishes "verified, and it's not valid" from "haven't
  // finished verifying yet". Both look like isPremium === false, but only
  // the first is a real answer -- and the URL router below has to wait for
  // a real answer before it decides a premium deep link is unreachable.
  const [premiumJwtStatus, setPremiumJwtStatus] = useState({ valid: false, expiresAt: null, licensedTo: null, checked: false });
  useEffect(() => {
    let canceled = false;
    const check = () => {
      verifyPremiumJwt(premiumJwtToken).then((result) => {
        if (!canceled) setPremiumJwtStatus({ ...result, checked: true });
      });
    };
    check();
    const intervalId = setInterval(check, 5 * 60 * 1000);
    return () => {
      canceled = true;
      clearInterval(intervalId);
    };
  }, [premiumJwtToken]);

  const entitlementState = useMemo(() => ({
    tier: premiumJwtStatus.valid ? 'premium' : 'free',
    isPremium: premiumJwtStatus.valid,
    // Read-only Detailed Holdings preview: demo mode shows the premium
    // tab's VIEW (with the fictional Carter holdings) to everyone, while
    // mutations stay gated on the real entitlement -- see demoMode.js's
    // contract and usePortfolioHoldings' allowMutations. Never true for
    // premium users (they get the real thing, demo or not).
    portfolioPreview: demoActive && !premiumJwtStatus.valid,
    demoActive,
    // TEMP: only a real EntitlementProvider should expose a setter like
    // this; it is here now only because the pasted key IS the entitlement
    // source for the time being.
    premiumJwtToken,
    setPremiumJwtToken,
    premiumJwtExpiresAt: premiumJwtStatus.expiresAt,
    // The address the key was issued to, shown in Preferences; null for a
    // key minted before keys carried one.
    licensedTo: premiumJwtStatus.valid ? premiumJwtStatus.licensedTo : null,
    // The key's serial, shown so a holder can name their key when asking
    // for it to be revoked or replaced; null for a key minted before
    // 2026-10-18.
    premiumKeySerial: premiumJwtStatus.valid ? (premiumJwtStatus.serial || null) : null,
  }), [premiumJwtToken, premiumJwtStatus, demoActive]);

  // KNOWN_ISSUES.md issue #1 fix: pairs each custom-switch's visible label
  // text with its checkbox via htmlFor/id -- previously two disconnected
  // siblings, so clicking the text did nothing. Declared unconditionally
  // here (rather than inline where each toggle renders, some of which are
  // behind conditional JSX branches) since hooks can't be called
  // conditionally -- the resulting ids are just plain strings referenced
  // from wherever each toggle actually renders.
  const growthChartTaxesOverlayId = useId();

  // Consolidated sub-tab states.
  //
  // ALL of these live here rather than as local useState inside their own
  // tab components, for two reasons:
  //
  // 1. Cross-tab deep links need them. DashboardTab's Plan Feedback
  //    recommendations each carry a {tab, subTab} target ("Adjust
  //    Retirement Allocations ->" means Plan Settings > Initial Balances,
  //    not just "Plan Settings"). Only riskSubTab used to be lifted here;
  //    the other four were local state, so those links silently dropped
  //    their sub-tab intent and dumped the user on whichever sub-tab was
  //    that component's hardcoded default -- often thousands of lines away
  //    from the control the recommendation actually named. (An earlier
  //    version called setSettingsSubTab/etc. directly from DashboardTab,
  //    where they don't exist, and threw a ReferenceError that crashed the
  //    whole tab -- see KNOWN_ISSUES.md.)
  //
  // 2. The tab panel wrapper below is keyed on activeTab, which forces a
  //    full unmount/remount of the tab component on every navigation. So
  //    local sub-tab state didn't merely fail to receive a deep link -- it
  //    couldn't survive leaving the tab at all, resetting to its default
  //    every single time. Hoisting it here makes sub-tab position persist
  //    across navigation, which is better behavior in its own right.
  //
  // Defaults below deliberately match each component's previous local
  // default exactly, so nothing changes for a user who never follows a
  // deep link.
  //
  // 3. The URL carries one of them as its second segment
  //    ('#/settings/taxes'), so they have to be readable and settable from
  //    here to round-trip through the address bar at all. initialSubTab()
  //    below applies the incoming route to whichever ONE state it names,
  //    and leaves the other five on their declared defaults.
  //
  // The valid ids for each are declared once in utils/tabRouting.js and
  // checked against these components' real source by tabRouting.test.js.
  const [riskSubTab, setRiskSubTab] = useState(() => initialSubTab(initialRoute, 'risk', 'stress'));
  const [settingsSubTab, setSettingsSubTab] = useState(() => initialSubTab(initialRoute, 'settings', 'household'));
  const [strategySubTab, setStrategySubTab] = useState(() => initialSubTab(initialRoute, 'strategy', 'optimizer'));
  const [taxestateSubTab, setTaxestateSubTab] = useState(() => initialSubTab(initialRoute, 'taxestate', 'brackets'));
  const [guideSubTab, setGuideSubTab] = useState(() => initialSubTab(initialRoute, 'guide', 'guide'));
  // A help popup's "Look it up" link lands on the Input Dictionary with its
  // search box filled (changelog 280): the term is parked here and read by
  // InputReference when it mounts or the term changes.
  const [dictionaryQuery, setDictionaryQuery] = useState('');
  const openDictionary = useCallback((term) => {
    setDictionaryQuery(String(term || ''));
    setGuideSubTab('dictionary');
    setActiveTab('guide');
  }, []);
  // "How is this figured?" links beside tax figures open Help -> How the
  // numbers are figured scrolled to one rule card (src/config/howFigured.js).
  // seq makes a second click on the same link scroll again.
  const [howFiguredTarget, setHowFiguredTarget] = useState(null);
  const openHowFigured = useCallback((ruleId) => {
    setHowFiguredTarget((prev) => ({ id: String(ruleId || ''), seq: (prev?.seq || 0) + 1 }));
    setGuideSubTab('howfigured');
    setActiveTab('guide');
  }, []);
  // Ctrl+K / Cmd+K opens "Find a setting" (changelog 290) from any page:
  // the box lives in the Plan header, so first go there if needed.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      const focus = () => window.dispatchEvent(new Event(FIND_SETTING_FOCUS));
      if (document.querySelector('[data-testid="find-setting-input"]')) { focus(); return; }
      setActiveTab(tabForMode(readPlanMode()));
      setTimeout(focus, 250);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Detailed Holdings' sub-tab was the last one still declared as local
  // state inside its own component (PortfolioTab.jsx), which meant it had
  // both problems described above -- it reset to Holdings every time you
  // navigated away and back, on the largest tab in the app. Lifted here
  // 2026-08-19 with the URL routing work, since a route segment can't
  // point at state the router can't reach.
  const [portfolioSubTab, setPortfolioSubTab] = useState(() => initialSubTab(initialRoute, 'portfolio', 'holdings'));
  // Year by Year's view (changelog 284): Balances & draws, Where the money
  // goes, or the cash-flow explorer that moved here from the Dashboard.
  const [yearledgerSubTab, setYearledgerSubTab] = useState(() => initialSubTab(initialRoute, 'yearledger', 'balances'));

  // --- URL <-> state sync ---
  //
  // The active sub-tab for whichever tab is showing. Tabs with no sub-tabs
  // contribute null, which formatHash() renders as a bare '#/scenarios'.
  const activeSubTab = {
    settings: settingsSubTab,
    risk: riskSubTab,
    strategy: strategySubTab,
    taxestate: taxestateSubTab,
    guide: guideSubTab,
    portfolio: portfolioSubTab,
    yearledger: yearledgerSubTab,
  }[activeTab] ?? null;

  // State -> URL. Runs after every navigation and writes the hash only when
  // it actually differs, which is what keeps this from fighting the
  // listener below: a hashchange sets state, this effect recomputes the
  // same hash, sees no difference, and stops. No "is this our own change"
  // flag needed, and no possibility of a loop.
  //
  // pushState (not replaceState) so the browser Back button walks back
  // through tabs. Cross-tab links -- Dashboard's "go fix this"
  // recommendations, the Interview's jump-to-Settings buttons -- were
  // one-way trips before this; Back is the return path.
  const didInitialRouteSync = useRef(false);
  useEffect(() => {
    const desired = formatHash(activeTab, activeSubTab);
    const isFirstRun = !didInitialRouteSync.current;
    // Mark the first run as done BEFORE the equality check, not after the
    // write. Landing on '#/settings' directly means the URL already matches
    // the state, so this effect returns early -- and if that early return
    // skipped the flag, the user's NEXT navigation would still count as
    // "the first run" and use replaceState. The effect of that was a
    // silently missing history entry: Back from the first section you
    // clicked left the app entirely instead of returning to the tab you
    // arrived on. Only reachable via a deep link, which is precisely the
    // case this whole feature is for.
    didInitialRouteSync.current = true;
    if (window.location.hash === desired) return;
    if (isFirstRun) {
      // First run. The URL either had nothing in it, or named an alias
      // ('#/ledger') or a default sub-tab we don't spell out. Rewrite in
      // place rather than pushing, so Back still leaves the app instead of
      // landing on a canonicalization step the user never navigated to.
      window.history.replaceState(null, '', desired);
      return;
    }
    window.history.pushState(null, '', desired);
  }, [activeTab, activeSubTab]);

  // URL -> state, for Back/Forward and for someone editing the address bar
  // directly. pushState does not fire hashchange, so this only ever sees
  // changes the app didn't make itself.
  useEffect(() => {
    const onHashChange = () => {
      const route = readRoute();
      // An unparseable hash means the user typed something we don't have a
      // tab for. Send them to Dashboard rather than leaving the previous
      // tab rendered under a URL that disagrees with it.
      const tab = route?.tab || DEFAULT_TAB;
      setActiveTab(tab);
      const setter = {
        settings: setSettingsSubTab,
        risk: setRiskSubTab,
        strategy: setStrategySubTab,
        taxestate: setTaxestateSubTab,
        guide: setGuideSubTab,
        portfolio: setPortfolioSubTab,
        yearledger: setYearledgerSubTab,
      }[tab];
      // Apply the sub-tab the URL names, or the tab's default when it
      // names none. Falling back to "leave whatever section was showing"
      // seems more preserving, but it's wrong: the hash is always written
      // from complete state, so leaving Settings while on Taxes pushes
      // '#/settings/taxes', not '#/settings'. A bare '#/settings' in the
      // history stack therefore always did mean the default section, and
      // preserving instead of resetting made Back stop undoing sub-tab
      // changes -- you'd go back to a URL that said Household while still
      // looking at Taxes & Roth.
      if (setter) setter(route?.subTab || ROUTES[tab].defaultSubTab);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Premium tabs render nothing without an entitlement, so '#/portfolio'
  // for a free user would otherwise show a blank panel under a URL that
  // claims otherwise. Redirect to Dashboard instead.
  //
  // Gated on premiumJwtStatus.checked, not just isPremium: token
  // verification is async, so a genuine subscriber opening
  // '#/portfolio/rebalance' is momentarily indistinguishable from a free
  // user. Redirecting on that first render would bounce exactly the people
  // the link is for. replaceState, not push -- an unreachable URL should
  // not become a Back-button destination.
  const entitlementResolved = premiumJwtStatus.checked;
  const isPremiumNow = premiumJwtStatus.valid;
  useEffect(() => {
    if (!entitlementResolved) return;
    // demoActive: the read-only preview makes premium-flagged tabs
    // legitimately viewable during a demo -- don't bounce off them.
    if (ROUTES[activeTab]?.premium && !isPremiumNow && !demoActive) setActiveTab(DEFAULT_TAB);
  }, [entitlementResolved, isPremiumNow, activeTab, demoActive]);


  // Per-browser connection to the user's own copy of the pricing Google
  // Sheet (see README's "Live Pricing" section). Lifted out of
  // PortfolioTab.jsx 2026-08-19 (IA Phase 2) because it is now editable
  // from TWO places -- Preferences (its canonical home, alongside every
  // other app-level setting) and the compact status row still shown on
  // Detailed Holdings, which is where you actually feel its absence. Two
  // independent useState copies of the same localStorage key would drift
  // the moment one wrote without the other re-reading -- exactly the
  // failure usePortfolioHoldings.js's own comment warns about -- so this
  // is single-sourced here and passed down through context instead.
  //
  // Deliberately NOT plan data: it's a per-browser data-source setting,
  // same category as the Premium Access Key, which is why it lives in its
  // own localStorage key rather than in `inputs`.
  const [pricingSource, setPricingSource] = useState(loadPricingSource);
  useEffect(() => {
    savePricingSource(pricingSource);
  }, [pricingSource]);

  // Tracks whether this browser's deployed copy of
  // scripts/pricing-sheet-apps-script.gs has fallen behind the reference
  // version in this repo -- they aren't linked by git, so a redeploy is
  // always a manual copy/paste and there's no other way to surface that.
  // null means "never tracked on this browser before"; the effect below
  // resolves that to "up to date" immediately rather than retroactively
  // nagging about versions that shipped before this feature existed.
  const [scriptAckVersion, setScriptAckVersion] = useState(loadScriptAckVersion);
  useEffect(() => {
    if (scriptAckVersion === null) {
      saveScriptAckVersion(PRICING_SHEET_SCRIPT_VERSION);
      setScriptAckVersion(PRICING_SHEET_SCRIPT_VERSION);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const acknowledgeScriptUpdate = useCallback(() => {
    saveScriptAckVersion(PRICING_SHEET_SCRIPT_VERSION);
    setScriptAckVersion(PRICING_SHEET_SCRIPT_VERSION);
  }, []);
  // True when the deployed Apps Script is behind the reference copy. Read
  // by both Preferences (which offers the redeploy instructions) and
  // Detailed Holdings (which shows the nag banner in context).
  const pricingScriptOutOfDate =
    !!pricingSource.scriptUrl && scriptAckVersion !== null && scriptAckVersion < PRICING_SHEET_SCRIPT_VERSION;

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('retire_plan_sidebar');
    return saved !== null ? JSON.parse(saved) : true;
  });
  // Persist sidebar state
  useEffect(() => {
    safeSetItem('retire_plan_sidebar', JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  // Mobile-only off-canvas drawer state, separate from isSidebarOpen (which
  // controls the desktop full-width/80px-icon-rail toggle -- that rail mode
  // doesn't make sense on a phone-width screen, so mobile gets its own
  // open/closed concept: fully hidden off-canvas vs. a full-width slide-in
  // drawer over a backdrop). Not persisted -- it should always start closed
  // on a fresh page load/tab switch so the Dashboard content is immediately
  // visible instead of a wall of sidebar buttons.
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  // Escape closes the phone menu, like any other menu.
  useEffect(() => {
    if (!isMobileNavOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setIsMobileNavOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isMobileNavOpen]);

  // The sticky Plan Status chip is fixed to the bottom-right corner, which
  // means on any page with a wide table or a chart running to the edge it
  // sits on top of real content -- the Strategy tab's optimizer table is the
  // clearest case, where it covers the last two rows outright. Rather than
  // move it (every corner covers something on some page) it's dismissible,
  // and the choice is remembered per browser. Preferences -> Display has the
  // control to bring it back, so dismissing it is never a one-way door.
  const [statusBarHidden, setStatusBarHidden] = useState(() => {
    try {
      return localStorage.getItem('retire_plan_status_bar_hidden') === 'true';
    } catch {
      // Private-mode/blocked storage: fall back to showing it, which is the
      // pre-existing behavior.
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('retire_plan_status_bar_hidden', String(statusBarHidden));
    } catch { /* storage unavailable — the choice just won't survive a reload */ }
  }, [statusBarHidden]);

  // The KPI strip on a phone (changelog 294). Five stacked cards are about
  // a screen and a half, so on every page but the Dashboard a phone shows
  // one line instead, which opens the full strip (slider included). The
  // collapse is CSS-only (.kpi-grid.kpi-collapsed under the phone
  // breakpoint), so desktop never sees any of it. Remembered per browser.
  const [kpiOpenMobile, setKpiOpenMobile] = useState(() => {
    try { return localStorage.getItem('retire_plan_kpi_open_mobile') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('retire_plan_kpi_open_mobile', String(kpiOpenMobile)); } catch { /* per-browser convenience only */ }
  }, [kpiOpenMobile]);

  // "Leave out names" in the print dialog (changelog 298) masks the report
  // too; set just before the print and cleared when the dialog closes.
  const [printHideNames, setPrintHideNames] = useState(false);
  const printInputs = useMemo(() => printInputsFor(inputs, printHideNames), [inputs, printHideNames]);

  // Auto-run the Monte Carlo (changelog 269). Off by default in the
  // Capacitor shells (a phone's battery and a thousand projections), on
  // everywhere else; the choice is this browser's, like the theme.
  const [mcAutoRun, setMcAutoRun] = useState(() => {
    try {
      const saved = localStorage.getItem(MC_AUTO_RUN_KEY);
      if (saved === 'true' || saved === 'false') return saved === 'true';
    } catch { /* fall through to the default */ }
    return !isNativeShell();
  });
  useEffect(() => {
    try { localStorage.setItem(MC_AUTO_RUN_KEY, String(mcAutoRun)); } catch { /* the choice just won't survive a reload */ }
  }, [mcAutoRun]);

  // Round far-future headline dollars (changelog 278): off by default,
  // this browser's choice like the theme.
  const [roundFarDollars, setRoundFarDollars] = useState(() => {
    try {
      const saved = localStorage.getItem(ROUND_FAR_DOLLARS_KEY);
      if (saved === 'true' || saved === 'false') return saved === 'true';
    } catch { /* fall through to the default */ }
    return ROUND_FAR_DOLLARS_DEFAULT;
  });
  useEffect(() => {
    try { localStorage.setItem(ROUND_FAR_DOLLARS_KEY, String(roundFarDollars)); } catch { /* the choice just won't survive a reload */ }
  }, [roundFarDollars]);

  // Real vs Nominal Dollar toggle
  const [useRealDollars, setUseRealDollars] = useState(true);
  const [stressChartView, setStressChartView] = useState('active');
  
  // Interactive Cash Flow Waterfall States
  const [waterfallYear, setWaterfallYear] = useState(2026);
  const [hoveredWaterfallNode, setHoveredWaterfallNode] = useState(null);
  const [waterfallPlaying, setWaterfallPlaying] = useState(false);
  const [waterfallViewMode] = useState('sankey'); // 'classic' or 'sankey'
  
  // Modals state
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    return localStorage.getItem('retire_plan_disclaimer_accepted') !== 'true';
  });
  // Reopening the disclaimer to read it is deliberately NOT the same state
  // as the first-visit gate. Reusing showDisclaimer would re-gate the whole
  // app -- hiding the nav status, the summary bar and every tab behind an
  // overlay -- for someone who only wanted to re-read what they agreed to.
  // It would also present an "I understand and Accept" button for terms
  // already accepted, implying something had changed.
  //
  // Until this existed there was no way back to the text at all:
  // setShowDisclaimer was only ever called with false, so one click on
  // first visit put the disclaimer permanently out of reach.
  const [showDisclaimerReview, setShowDisclaimerReview] = useState(false);
  // While the floating Plan Status bar is up, the page keeps room for it at
  // the bottom (so it never sits on the last form field or footer link) and
  // toasts stack above it. index.css reads html.status-bar-on.
  const statusBarShown = !showDisclaimer && !statusBarHidden;
  useEffect(() => {
    document.documentElement.classList.toggle('status-bar-on', statusBarShown);
    return () => document.documentElement.classList.remove('status-bar-on');
  }, [statusBarShown]);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    // Not over the demo: the Carters are already loaded, so "How would you
    // like to start?" answers a question nobody asked (outside review,
    // 2026-09-28). The flag is left unset, so a first-time visitor who
    // exits the demo still gets the chooser for their own plan.
    return localStorage.getItem('retire_plan_onboarding_completed') !== 'true' && !isDemoModeActive();
  });
  // 0 = the "how would you like to set up your plan?" choice screen shown
  // only on a genuine first visit (see showOnboarding's own initializer
  // above); 1-6 = the existing Quick Setup steps. Manually reopening this
  // via the sidebar's "Interactive Setup Wizard" button explicitly sets
  // this back to 1, skipping the choice screen -- that button is already an
  // explicit request for the quick path, so re-asking would be redundant.
  const [onboardingStep, setOnboardingStep] = useState(0);
  // Load the What's New popup only once it may appear AND has something to
  // show; see utils/whatsNewGate.js.
  const whatsNewEligible = !showDisclaimer && !showOnboarding && !demoActive;
  useEffect(() => {
    if (whatsNewEligible && whatsNewMayShow()) setWhatsNewPending(true);
  }, [whatsNewEligible]);
  const [calibrationResults, setCalibrationResults] = useState(null);
  // The plan exactly as it was before "Apply these changes", kept for the
  // Dashboard's Undo for the rest of the session (not persisted).
  const [calibrationUndo, setCalibrationUndo] = useState(null);
  const applyCalibration = useCallback(() => {
    if (!calibrationResults) return;
    const { patch } = calibrationResults;
    setInputs((prev) => {
      setCalibrationUndo(prev);
      return { ...prev, ...patch };
    });
    setCalibrationResults(null);
  }, [calibrationResults]);
  const undoCalibration = useCallback(() => {
    if (calibrationUndo) setInputs(calibrationUndo);
    setCalibrationUndo(null);
  }, [calibrationUndo]);
  const [maximizedComponent, setMaximizedComponent] = useState(null);
  // Escape leaves any maximized panel, including the ones that zoom in
  // place rather than through the chart dialog.
  useEffect(() => {
    if (!maximizedComponent) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) setMaximizedComponent(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [maximizedComponent]);
  const [showQuickUpdate, setShowQuickUpdate] = useState(false);
  // Busy flag for handleSaveScenario's off-main-thread Monte Carlo run
  // (changelog 133). The ref is the re-entrancy guard -- state alone lags a
  // synchronous second click by a render.
  const [isSavingScenario, setIsSavingScenario] = useState(false);
  const isSavingScenarioRef = useRef(false);

  // In-app alert/confirm/prompt replacement (see components/AppDialog.jsx).
  // Native window.alert/confirm/prompt block the JS thread entirely, which
  // freezes automated tooling and behaves inconsistently in mobile WebViews.
  const [dialog, setDialog] = useState(null);
  // These four (and several other handlers below) are wrapped in useCallback
  // with the narrowest deps their bodies actually need, purely so they get a
  // stable reference across renders that don't touch those deps — this is
  // what lets simulationState (built further down) be wrapped in useMemo
  // without recomputing on every render. Without stable function references,
  // memoizing simulationState would be pointless: an object containing even
  // one freshly-recreated function is a "changed" object every time.
  const showAlert = useCallback((message, title = 'Notice') => new Promise((resolve) => {
    setDialog({ type: 'alert', title, message, resolve });
  }), []);
  const showConfirm = useCallback((message, opts = {}) => new Promise((resolve) => {
    setDialog({
      type: 'confirm',
      title: opts.title || 'Please Confirm',
      message,
      danger: opts.danger,
      confirmLabel: opts.confirmLabel,
      cancelLabel: opts.cancelLabel,
      altLabel: opts.altLabel,
      toggle: opts.toggle,
      requireText: opts.requireText,
      resolve,
    });
  }), []);
  const showPrompt = useCallback((message, opts = {}) => new Promise((resolve) => {
    setDialog({
      type: 'prompt',
      title: opts.title || 'Input Required',
      message,
      defaultValue: opts.defaultValue || '',
      confirmLabel: opts.confirmLabel,
      inputType: opts.inputType,
      resolve,
    });
  }), []);
  const closeDialog = (result) => {
    setDialog((d) => {
      if (d && d.resolve) d.resolve(result);
      return null;
    });
  };

  // Overlay lines on the growth chart's full-screen zoom -- the same
  // remembered preferences as the Dashboard's own switches (changelog 202).
  const [taxesOverlay, setTaxesOverlay] = usePersistentToggle(OVERLAY_TAXES_KEY, false);
  const [lifestyleOverlay, setLifestyleOverlay] = usePersistentToggle(OVERLAY_LIFESTYLE_KEY, false);
  const growthChartLifestyleOverlayId = useId();

  // Target Portfolio "What-If" Solver State
  const [whatIfRetireAge, setWhatIfRetireAge] = useState('');
  const [whatIfSpend, setWhatIfSpend] = useState('');
  const [whatIfFundingMethod, setWhatIfFundingMethod] = useState('taxable'); // 'taxable' or 'proportional'

  // Tax Visualizer States — the single shared instance for both the
  // TaxEstateTab.jsx panel and the "Maximize Tax Chart" modal below (see
  // useSimulation()/SimulationContext; TaxEstateTab.jsx used to keep its
  // own separate local copies of this same state, which is what let the
  // modal drift out of sync and eventually reference a variable that no
  // longer existed anywhere).
  const [selectedTaxYear, setSelectedTaxYear] = useState(null);
  const [showIrmaa, setShowIrmaa] = useState(false);
  // Starts all-on and is narrowed to the brackets this plan actually
  // reaches as soon as a projection exists (see the effect below
  // taxVisualizerData). All-on is the right INITIAL value rather than a
  // guess, because before there is a projection there is nothing to derive
  // from, and showing too much briefly is better than hiding a line the
  // user was looking for.
  const savedLinePref = useMemo(() => readBracketPref(), []);
  const [enabledTaxBrackets, setEnabledTaxBrackets] = useState(() => savedLinePref?.brackets || allBracketsOn());
  const [enabledIrmaaTiers, setEnabledIrmaaTiers] = useState(() => savedLinePref?.irmaa || allIrmaaOn());
  // Once the user ticks any box themselves, stop auto-deriving. A default
  // that keeps re-asserting itself over a deliberate choice is worse than
  // no default at all. Persisted, so "stop" means across reloads rather
  // than until the next refresh -- and `resetLinePrefsToAuto` is the way
  // back, because a sticky choice with no reset is a trap.
  const userChoseBrackets = useRef(Boolean(savedLinePref));
  const setEnabledTaxBracketsManual = useCallback((next) => {
    userChoseBrackets.current = true;
    setEnabledTaxBrackets(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      writeBracketPref(resolved, enabledIrmaaTiers);
      return resolved;
    });
  }, [enabledIrmaaTiers]);
  const resetLinePrefsToAuto = useCallback(() => {
    userChoseBrackets.current = false;
    clearBracketPref();
    setEnabledTaxBrackets(relevantBrackets(taxVisualizerDataRef.current));
    setEnabledIrmaaTiers(relevantIrmaaTiers(taxVisualizerDataRef.current));
  }, []);
  // Read by resetLinePrefsToAuto, which must not re-create itself (and so
  // re-render every consumer) each time the projection changes.
  const taxVisualizerDataRef = useRef([]);

  // Social Security Heatmap States
  const [ssHeatmapMetric, setSsHeatmapMetric] = useState('totalSS'); // 'totalSS' or 'endingBalance'

  // Light / dark theme: the device's until someone chooses (changelog 368).
  const { theme, toggleTheme } = useThemePreference();

  // Large Text Mode state
  const [largeTextMode, setLargeTextMode] = useState(() => localStorage.getItem('retire_plan_large_text') === 'true');
  useEffect(() => {
    if (largeTextMode) {
      document.body.classList.add('large-text');
    } else {
      document.body.classList.remove('large-text');
    }
    safeSetItem('retire_plan_large_text', String(largeTextMode));
  }, [largeTextMode]);


  // Monte Carlo simulation state
  const [monteCarlo, setMonteCarlo] = useState(null);
  // The plan the current Monte Carlo result was run against (changelog
  // 254), as a plan key (changelog 268: a string of every sanitized input,
  // so the run survives a reload and an edit-and-undo, and goes stale only
  // when a value actually differs). Restored from this browser on load.
  const [mcKey, setMcKey] = useState(() => {
    const cached = readMonteCarloCache();
    return cached ? cached.key : null;
  });
  useEffect(() => {
    const cached = readMonteCarloCache();
    if (cached && cached.results) setMonteCarlo(cached.results);
  }, []);
  const currentPlanKey = useMemo(() => planKey(inputs), [inputs]);
  useEffect(() => {
    if (monteCarlo && mcKey) writeMonteCarloCache(mcKey, monteCarlo);
  }, [monteCarlo, mcKey]);
  // The printed report's Retirement Readiness section (changelog 253).
  // Its six answers cost ~45 projections (the walk-away spending search
  // alone is a 40-step bisection), far too much to keep current on every
  // keystroke for a container nobody sees until they print. So it is
  // computed at print time: `beforeprint` fires for every route to the
  // print dialog -- the sidebar button, the Action Plan and checklist
  // buttons, Cmd/Ctrl+P -- and flushSync commits the state to the DOM
  // before the browser takes its snapshot. Cleared afterwards so a stale
  // set never prints against a newer plan.
  const [printReadiness, setPrintReadiness] = useState(null);
  const [mcLoading, setMcLoading] = useState(false);
  const mcWorkerRef = useRef(null);

  // Terminate background worker on unmount
  useEffect(() => {
    return () => {
      if (mcWorkerRef.current) {
        mcWorkerRef.current.terminate();
      }
    };
  }, []);

  // "Heavy" background calculations: stress-scenario comparison, SS claiming
  // heatmap, withdrawal-strategy optimizer, and retirement-age finder each
  // run many full projections per call (100+ combined) — computed in a
  // persistent Web Worker (see heavyComputeWorker.js) instead of blocking the
  // main thread on every debounced input change. Posting effect lives further
  // down, after debouncedInputs is declared.
  const [heavyResults, setHeavyResults] = useState({
    stressComparisonData: [],
    ssClaimingHeatmapData: [],
    dieWithZeroLongevityData: null,
    optimizerResults: [],
    ageFinderResults: { simulations: [], earliestFundedAge: null },
    sensitivityResults: { baseline: { endingBalance: 0, isSuccessful: true }, results: [] },
    rothBracketHeatmapData: [],
    rothLadderScheduleHeatmapData: [],
    guardrailsComparisonData: [],
    historicalStartsData: null,
  });
  const [heavyResultsLoading, setHeavyResultsLoading] = useState(true);
  const heavyWorkerRef = useRef(null);
  const heavyRequestIdRef = useRef(0);
  // Consecutive worker crashes; at 3 the app stops retrying the worker.
  const heavyWorkerFailuresRef = useRef(0);

  // Terminate background worker on unmount
  useEffect(() => {
    return () => {
      if (heavyWorkerRef.current) {
        heavyWorkerRef.current.terminate();
        heavyWorkerRef.current = null;
      }
    };
  }, []);

  // Saved Scenarios State
  const [scenarios, setScenarios] = useState(() => {
    try {
      const saved = localStorage.getItem('retire_plan_scenarios');
      return saved ? migrateScenarios(JSON.parse(saved)) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    safeSetItem('retire_plan_scenarios', JSON.stringify({
      schemaVersion: INPUTS_SCHEMA_VERSION,
      scenarios,
    }));
    // Saved scenarios are plan data too -- same staleness stamp as inputs.
    recordPlanChange();
  }, [scenarios]);

  // Saved scenarios' Monte Carlo odds, filled in off the main thread a
  // moment after the Dashboard is up: the demo arrives without them so it
  // can open at once (demoPayload.buildQuickDemoPayload), and a scenario saved
  // under an earlier release carries odds from an older engine
  // (utils/scenarioOdds.js). Each scenario is tried once per release, so a
  // failed run cannot loop.
  const oddsAttempted = useRef(new Set());
  useEffect(() => {
    // The ref holds a cache (a Set), not a DOM node; the same Set is used by
    // the cleanup below.
    const attempted = oddsAttempted.current;
    const waiting = scenarios.filter((sc) => scenarioNeedsOdds(sc) && !attempted.has(`${sc.id}@${ODDS_VERSION}`));
    if (waiting.length === 0) return undefined;
    let canceled = false;
    const handle = setTimeout(() => {
      waiting.forEach((sc) => attempted.add(`${sc.id}@${ODDS_VERSION}`));
      fillScenarioOdds(waiting)
        .then((odds) => {
          if (canceled || Object.keys(odds).length === 0) return;
          setScenarios((prev) => prev.map((sc) => (odds[sc.id] === undefined ? sc
            : { ...sc, metrics: { ...sc.metrics, successProbability: odds[sc.id], oddsVersion: ODDS_VERSION } })));
        })
        .catch((e) => console.warn('Could not simulate the saved scenarios', e));
    }, 1500);
    return () => {
      canceled = true;
      clearTimeout(handle);
      // A run cut short by an unmount or a new scenario list may try again.
      waiting.forEach((sc) => attempted.delete(`${sc.id}@${ODDS_VERSION}`));
    };
  }, [scenarios]);

  // Reset helper
  const handleReset = useCallback(() => {
    showConfirm(
      "This resets your active plan to the default settings. Your saved scenarios, Detailed Holdings, estate checklist, Life Plan and preferences are kept.\n\nAny changes to the active plan that aren't in a backup or a saved scenario will be lost.\n\nTo remove everything this app keeps on this device instead, use Erase everything on this device in Preferences \u2192 Your Data.",
      {
        title: 'Reset Plan to Defaults',
        danger: true,
        confirmLabel: 'Reset Active Plan',
        // The safe alternative: some of the people reaching for Reset
        // really want "show me a full example" -- that's the demo's job,
        // and unlike Reset it is reversible. Hidden while already in a
        // demo (nothing to offer there but the reset itself).
        ...(demoActive ? {} : { altLabel: 'Explore the Demo Instead' }),
      }
    ).then((result) => {
      if (result === 'alt') {
        enterDemoMode();
      } else if (result === true) {
        setInputs(DEFAULT_INPUTS);
        setMonteCarlo(null);
        setMcKey(null);
        clearMonteCarloCache();
      }
    });
  }, [showConfirm, demoActive]);

  // Update specific input helper
  const updateInput = useCallback((key, value) => {
    setInputs(prev => {
      const next = { ...prev, [key]: value };

      // Soft-link State of Residence and State Tax Jurisdiction
      if (key === 'stateOfResidence' && prev.stateOfResidence !== value && !prev.stateTaxUnlinked) {
        // Shared with the residency timeline so the two can't disagree
        // (this copy used to send Virginia to a 5% flat rate).
        next.stateTaxState = stateTaxJurisdictionFor(value);
      } else if (key === 'stateTaxState') {
        next.stateTaxUnlinked = true;
      }

      return next;
    });
  }, []);

  // Portfolio Holdings (premium Detailed Holdings tab) -- lifted up from
  // PortfolioTab.jsx (2026-08-19) so this data is available here too, for
  // the Initial Balances auto-sync effect right below. Previously
  // PortfolioTab.jsx was this hook's only consumer, per its own header
  // comment ("If a second consumer needs this data, that's the point to
  // reconsider") -- SettingsTab.jsx now needing bucketTotals to show
  // synced/read-only balances is exactly that second consumer, so the hook
  // is called once here and threaded through simulationState below instead
  // of PortfolioTab.jsx calling it a second, independently-stateful time
  // (which would silently drift from this one despite reading the same
  // localStorage key -- the exact bug class fullBackup.js's header comment
  // warns about for a similar reason).
  const {
    holdings, addHolding, updateHolding, removeHolding,
    addHoldings, replaceHoldings, bucketTotals, taxableCostBasis, assetClassMix, liquidations,
    liquidateHolding, removeLiquidation, replaceLiquidations, addLiquidations,
  } = usePortfolioHoldings(isPremiumNow); // mutations require the REAL entitlement -- see the hook's allowMutations comment

  // Initial Balances <-> Detailed Holdings live sync (INTEGRATION_STRATEGY.md
  // Section 3, "direction of truth"). Once a user has opted in (see
  // PortfolioTab.jsx's handleSync, which sets initialBalancesSource:
  // 'holdings' the first time it's confirmed), the four Initial Balances
  // fields stop being independently-editable and instead silently track
  // bucketTotals -- no more remembering to click a manual re-sync button
  // after every holdings edit, and no risk of the two silently disagreeing.
  // Deliberately does nothing for 'manual' (the default, and the only state
  // free/non-premium users ever see) so this is a no-op until a user
  // explicitly opts in.
  // The holding the user has designated as their Concentrated Stock
  // position (only when actually LINKED to a holding, not a manual dollar
  // figure). It must be netted OUT of the Taxable bucket and its cost basis
  // before either feeds Initial Balances -- otherwise the same shares are
  // counted in the Taxable bucket AND the separate concentrated sleeve, and
  // grow in both (changelog 147, reported by the owner: "isn't the concentrated
  // GOOG actually in a brokerage account?"). Manual concentrated positions
  // can't be auto-netted -- the app has no way to know which holding, if
  // any, they overlap -- so the exclusion is scoped to linked positions,
  // and the UI note covers the manual case.
  const concentratedLinkedHoldingIds = [
    (inputs.concentratedStockEnabled && inputs.concentratedStockSource === 'holdings') ? inputs.concentratedStockHoldingId : null,
    (inputs.concentratedStock2Enabled && inputs.concentratedStock2Source === 'holdings') ? inputs.concentratedStock2HoldingId : null,
  ].filter(Boolean);
  // Stable primitive key so the memos below don't rerun every render.
  const concentratedLinkedKey = concentratedLinkedHoldingIds.join(',');

  // A LINKED cash floor holds the same dollars as the Taxable bucket:
  // bucket totals split by tax treatment, not asset class, so a money-market
  // fund tagged Taxable is already inside taxableInit. Netting the cash
  // holdings out is the same fix changelog 147 applied to a linked
  // concentrated position, arriving by a different door -- without it a plan
  // that links both Initial Balances and the cash floor spends the reserve
  // twice. Excluded from the concentrated position first, so a holding
  // claimed by both links is counted once, by the concentrated sleeve.
  const cashReserveLink = useMemo(
    () => computeCashReserveFromHoldings(holdings, { excludeHoldingIds: concentratedLinkedHoldingIds }),
    [holdings, concentratedLinkedKey] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const cashFloorLinked = inputs.cashFloorEnabled && inputs.cashFloorSource === 'holdings';
  const bucketExcludedIds = cashFloorLinked
    ? [...concentratedLinkedHoldingIds, ...cashReserveLink.holdingIds]
    : concentratedLinkedHoldingIds;
  const bucketExcludedKey = bucketExcludedIds.join(',');

  const derivedBucketTotals = useMemo(
    () => computeBucketTotals(holdings, { excludeHoldingIds: bucketExcludedIds }),
    [holdings, bucketExcludedKey] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Typed-in balances that no longer match the holdings -- see
  // unlinkedBalanceGap. Read by the Initial Nest Egg card and the Holdings
  // sub-tab so a holdings change that can't reach the plan says so.
  // Not in the demo: the Carters' sample holdings are illustrative and were
  // never meant to sum to their plan balances, and the fix the note offers
  // (Sync on Detailed Holdings) is not available in the read-only preview.
  // It was the first thing a demo visitor read on the Dashboard (outside
  // review, 2026-09-28).
  const balanceGap = useMemo(
    () => (demoActive ? null : unlinkedBalanceGap(inputs, holdings, derivedBucketTotals)),
    [demoActive, inputs, holdings, derivedBucketTotals]
  );
  const derivedTaxableCostBasis = useMemo(
    () => computeTaxableCostBasis(holdings, { excludeHoldingIds: bucketExcludedIds }),
    [holdings, bucketExcludedKey] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const derivedTaxableDividendYield = useMemo(
    // Every taxable distribution, not dividends alone -- see
    // computeTaxableDistributionYield. Returns an object; the linked input
    // only ever wants the rate.
    () => {
      const detail = computeTaxableDistributionYield(holdings, { excludeHoldingIds: concentratedLinkedHoldingIds });
      return detail === null ? null : detail.yield;
    },
    [holdings, concentratedLinkedKey] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Changelog 208: the qualified share rides the same link.
  const derivedQualifiedDividendPct = useMemo(
    () => {
      const detail = computeTaxableDistributionYield(holdings, { excludeHoldingIds: concentratedLinkedHoldingIds });
      return detail === null ? null : Math.round(detail.qualifiedShare * 100);
    },
    [holdings, concentratedLinkedKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (inputs.initialBalancesSource !== 'holdings') return;
    // An empty portfolio never writes -- see canSyncFromHoldings. Without
    // this, clearing the holdings (or failing to read them) drives a linked
    // plan's four balances to $0.
    if (!canSyncFromHoldings(holdings)) return;
    const targets = { preTaxInit: derivedBucketTotals.preTax, rothInit: derivedBucketTotals.roth, taxableInit: derivedBucketTotals.taxable, hsaInit: derivedBucketTotals.hsa };
    setInputs((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [key, value] of Object.entries(targets)) {
        const rounded = Math.round(value);
        if (Math.round(prev[key]) !== rounded) { next[key] = rounded; changed = true; }
      }
      return changed ? next : prev;
    });
  // The synced fields are deps too: loading a scenario replaces `inputs`
  // wholesale, and without them a scenario that is ALSO linked kept its
  // saved balances (the source flag and the holdings hadn't changed, so the
  // effect never re-ran) while Settings showed "Linked". Linked means the
  // holdings win, whatever wrote the field.
  }, [inputs.initialBalancesSource, holdings, derivedBucketTotals, inputs.preTaxInit, inputs.rothInit, inputs.taxableInit, inputs.hsaInit]);

  // Taxable Cost Basis <-> Detailed Holdings live sync -- same link/unlink
  // pattern as the Initial Balances effect just above, scoped to the one
  // field (taxableBasisInit) that cares about cost basis specifically. A
  // no-op until a user explicitly opts in via PortfolioTab.jsx's
  // handleSyncCostBasis (taxableBasisSource defaults to 'manual').
  useEffect(() => {
    if (inputs.taxableBasisSource !== 'holdings') return;
    if (!canSyncFromHoldings(holdings)) return;
    const rounded = Math.round(derivedTaxableCostBasis);
    setInputs((prev) => (Math.round(prev.taxableBasisInit) === rounded ? prev : { ...prev, taxableBasisInit: rounded }));
  }, [inputs.taxableBasisSource, holdings, derivedTaxableCostBasis, inputs.taxableBasisInit]);

  // Taxable Dividend Yield <-> Detailed Holdings live sync -- the same
  // link/unlink pattern, scoped to the tax engine's assumed yield on the
  // Taxable bucket (calculator.js taxableDividendYield). Guards on a real
  // Taxable-bucket value, the way the stock-allocation link guards on
  // classified holdings -- no taxable holdings means nothing to sync to.
  useEffect(() => {
    if (inputs.taxableDividendYieldSource !== 'holdings') return;
    if (derivedTaxableDividendYield === null) return;
    const rounded = Math.round(derivedTaxableDividendYield * 10000) / 100;
    setInputs((prev) => (Math.round((prev.taxableDividendYield || 0) * 100) === Math.round(rounded * 100) ? prev : { ...prev, taxableDividendYield: rounded }));
  }, [inputs.taxableDividendYieldSource, derivedTaxableDividendYield, inputs.taxableDividendYield]);
  useEffect(() => {
    if (inputs.taxableDividendYieldSource !== 'holdings') return;
    if (derivedQualifiedDividendPct === null) return;
    setInputs((prev) => (prev.taxableQualifiedDividendPct === derivedQualifiedDividendPct ? prev : { ...prev, taxableQualifiedDividendPct: derivedQualifiedDividendPct }));
  }, [inputs.taxableDividendYieldSource, derivedQualifiedDividendPct, inputs.taxableQualifiedDividendPct]);

  // Cash Reserve Floor <-> Detailed Holdings live sync -- same link/unlink
  // pattern as the effects above, scoped to cashFloorInit. Guards on
  // canSyncFromHoldings (an empty list must never rewrite a linked plan)
  // and on the floor being enabled at all: a disabled floor is inert in
  // calculator.js, and syncing into it would quietly stage a number the
  // user has not asked to use.
  useEffect(() => {
    if (!inputs.cashFloorEnabled || inputs.cashFloorSource !== 'holdings') return;
    if (!canSyncFromHoldings(holdings)) return;
    const rounded = Math.round(cashReserveLink.total);
    setInputs((prev) => (Math.round(prev.cashFloorInit || 0) === rounded ? prev : { ...prev, cashFloorInit: rounded }));
  }, [inputs.cashFloorEnabled, inputs.cashFloorSource, holdings, cashReserveLink, inputs.cashFloorInit]);

  // Working-life Stock Allocation <-> Detailed Holdings live sync -- same
  // link/unlink pattern as the two effects just above, scoped to
  // stockAllocationPre only (see calculator.js's stockAllocationSource
  // comment for why stockAllocationPost never links). A no-op until a user
  // explicitly opts in via PortfolioTab.jsx's handleSyncStockAllocation
  // (stockAllocationSource defaults to 'manual'). Guards on
  // classifiedTotal > 0 the same way the sync buttons themselves guard on
  // zero holdings -- an empty/all-"Other" portfolio has no real stock % to
  // sync to, so this simply does nothing until there's real classified
  // data, rather than driving stockAllocationPre to 0.
  useEffect(() => {
    if (inputs.stockAllocationSource !== 'holdings') return;
    if (!(assetClassMix.classifiedTotal > 0)) return;
    const rounded = Math.round(assetClassMix.stockPctOfClassified);
    setInputs((prev) => (Math.round(prev.stockAllocationPre) === rounded ? prev : { ...prev, stockAllocationPre: rounded }));
  }, [inputs.stockAllocationSource, assetClassMix, inputs.stockAllocationPre]);

  // Concentrated Stock Position <-> Detailed Holdings live sync -- same
  // link/unlink pattern as the three effects above, but scoped to ONE
  // specific holding (concentratedStockHoldingId) rather than an
  // aggregate (see calculator.js's concentratedStockSource comment). One
  // effect per position -- position 2 uses the concentratedStock2* keys
  // (see calculator.js's csPositionConfig for the key mapping). A no-op
  // until a user explicitly opts in via SettingsTab.jsx's "Link to a
  // Holding" dropdown. If the linked holding was deleted (or the id is
  // otherwise stale), reverts to manual instead of leaving a badge/values
  // pointing at nothing -- same defensive fallback the other three links
  // don't need (they link a whole bucket, which can't itself disappear the
  // way one specific holding can).
  useEffect(() => {
    if (inputs.concentratedStockSource !== 'holdings') return;
    const holding = holdings.find((h) => h.id === inputs.concentratedStockHoldingId);
    if (!holding) {
      setInputs((prev) => (
        prev.concentratedStockSource === 'manual' && prev.concentratedStockHoldingId === null
          ? prev
          : { ...prev, concentratedStockSource: 'manual', concentratedStockHoldingId: null }
      ));
      return;
    }
    const linked = computeConcentratedStockLinkValues(holding);
    const roundedValue = Math.round(linked.value);
    const roundedBasisPct = Math.round(linked.costBasisPct);
    setInputs((prev) => {
      const next = { ...prev };
      let changed = false;
      if (prev.concentratedStockLabel !== linked.label) { next.concentratedStockLabel = linked.label; changed = true; }
      if (Math.round(prev.concentratedStockInit) !== roundedValue) { next.concentratedStockInit = roundedValue; changed = true; }
      if (Math.round(prev.concentratedStockCostBasisPct) !== roundedBasisPct) { next.concentratedStockCostBasisPct = roundedBasisPct; changed = true; }
      return changed ? next : prev;
    });
  }, [inputs.concentratedStockSource, inputs.concentratedStockHoldingId, holdings, inputs.concentratedStockInit, inputs.concentratedStockCostBasisPct, inputs.concentratedStockLabel]);

  useEffect(() => {
    if (inputs.concentratedStock2Source !== 'holdings') return;
    const holding = holdings.find((h) => h.id === inputs.concentratedStock2HoldingId);
    if (!holding) {
      setInputs((prev) => (
        prev.concentratedStock2Source === 'manual' && prev.concentratedStock2HoldingId === null
          ? prev
          : { ...prev, concentratedStock2Source: 'manual', concentratedStock2HoldingId: null }
      ));
      return;
    }
    const linked = computeConcentratedStockLinkValues(holding);
    const roundedValue = Math.round(linked.value);
    const roundedBasisPct = Math.round(linked.costBasisPct);
    setInputs((prev) => {
      const next = { ...prev };
      let changed = false;
      if (prev.concentratedStock2Label !== linked.label) { next.concentratedStock2Label = linked.label; changed = true; }
      if (Math.round(prev.concentratedStock2Init) !== roundedValue) { next.concentratedStock2Init = roundedValue; changed = true; }
      if (Math.round(prev.concentratedStock2CostBasisPct) !== roundedBasisPct) { next.concentratedStock2CostBasisPct = roundedBasisPct; changed = true; }
      return changed ? next : prev;
    });
  }, [inputs.concentratedStock2Source, inputs.concentratedStock2HoldingId, holdings, inputs.concentratedStock2Init, inputs.concentratedStock2CostBasisPct, inputs.concentratedStock2Label]);

  // Debounced inputs — expensive calculations only fire 300 ms after the user stops typing
  const debouncedInputs = useDebounce(inputs, 300);

  // Run projections — gated on debouncedInputs to avoid re-running on every keystroke
  const rawProjection = useMemo(() => {
    const sanitizedInputs = { ...debouncedInputs };
    for (const key in sanitizedInputs) {
      if (sanitizedInputs[key] === '') {
        sanitizedInputs[key] = 0;
      }
    }
    return runProjection(sanitizedInputs);
  }, [debouncedInputs]);

  // Handle the Today's / Future dollars setting. Every money field on a
  // projection row is converted by utils/displayDollars.js, whose
  // ROW_FIELD_CLASS map classifies every numeric row field (a test fails
  // when the engine adds one it does not know). Flows use the year's price
  // index; end-of-year balances use the next year's; the lifetime totals
  // are re-derived from the converted rows as a present value.
  const projection = useMemo(
    () => {
      const shown = deflateProjectionForDisplay(rawProjection, useRealDollars);
      // Changelog 428: the plan's net to heirs after every tax, in display
      // dollars, priced on the NOMINAL projection (the estate thresholds
      // are indexed to the final year) and deflated by the same factor the
      // Ending Balance uses. The Action Plan compares it with the Roth
      // Ladder grid's cells, which carry the same figure in the same dollars.
      const nominal = legacyAfterTaxes(debouncedInputs, rawProjection);
      const factor = useRealDollars ? finalBalanceFactor(rawProjection?.years) : 1;
      return shown === rawProjection ? { ...shown, afterTaxLegacy: nominal } : { ...shown, afterTaxLegacy: nominal / factor };
    },
    [rawProjection, useRealDollars, debouncedInputs],
  );

  // Stress-scenario comparison, SS claiming heatmap, optimizer, and
  // age-finder results now come from heavyResults (populated by the worker
  // effect further below) instead of individual useMemo blocks — see that
  // effect for why.
  const stressComparisonData = heavyResults.stressComparisonData;

  // Waterfall Autoplay Effect
  useEffect(() => {
    let intervalId;
    if (waterfallPlaying && projection?.years?.length > 0) {
      intervalId = setInterval(() => {
        setWaterfallYear(prev => {
          const yearsArray = projection.years;
          const minYear = yearsArray[0].year;
          const maxYear = yearsArray[yearsArray.length - 1].year;
          if (prev >= maxYear) {
            return minYear;
          }
          return prev + 1;
        });
      }, 2000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [waterfallPlaying, projection]);

  // Sync Waterfall Year Bound with active projection
  useEffect(() => {
    if (projection?.years?.length > 0) {
      const minYear = projection.years[0].year;
      const maxYear = projection.years[projection.years.length - 1].year;
      if (waterfallYear < minYear || waterfallYear > maxYear) {
        setWaterfallYear(minYear);
      }
    }
  }, [projection, waterfallYear]);

  const optimizerResults = heavyResults.optimizerResults;
  const ageFinderResults = heavyResults.ageFinderResults;
  const sensitivityResults = heavyResults.sensitivityResults;
  const rothBracketHeatmapData = heavyResults.rothBracketHeatmapData;
  const rothLadderScheduleHeatmapData = heavyResults.rothLadderScheduleHeatmapData;
  const guardrailsComparisonData = heavyResults.guardrailsComparisonData;
  const dieWithZeroLongevityData = heavyResults.dieWithZeroLongevityData;
  const historicalStartsData = heavyResults.historicalStartsData;

  // Compute Die with Zero optimization
  // findDieWithZeroSpending now returns its finalProjection, so we don't need a second runProjection call
  // A search over many projections (48-130 ms) that only Retirement
  // Readiness and its maximized chart show: computed at once while one of
  // them is open, otherwise when the browser is idle, never inside a
  // keystroke (review 2026-09-30, H11). null until the first result.
  const dieWithZeroResults = useIdleMemo(() => {
    const res = findDieWithZeroSpending(debouncedInputs);
    const dwzProjection = res.finalProjection || { years: [] };

    // Merge current and DWZ projection ending balances for chart comparison
    const comparisonData = [];
    const length = Math.max(projection.years.length, (dwzProjection.years || []).length);
    for (let i = 0; i < length; i++) {
      const year = projection.years[i]?.year || dwzProjection.years[i]?.year;
      const dwzFactor = useRealDollars && dwzProjection.years[i] ? yearEndFactor(dwzProjection.years, i) : 1;
      comparisonData.push({
        year,
        currentBalance: Math.round(projection.years[i]?.totalPortfolioEnding || 0),
        dwzBalance: Math.round((dwzProjection.years[i]?.totalPortfolioEnding || 0) / dwzFactor),
      });
    }

    return {
      spending: res.dieWithZeroSpending,
      additionalSpend: res.additionalAnnualSpend,
      // E17: the engine's reason ('ok' | 'above-ceiling' | 'none-works' |
      // 'no-rows'); spending and additionalSpend are null unless 'ok' or
      // 'above-ceiling'. ReadinessTools' spendingSolve reads both.
      reason: res.reason,
      rows: projection.years.length,
      comparisonData,
    };
  }, [debouncedInputs, projection, useRealDollars], { immediate: activeTab === 'readiness' || maximizedComponent === 'dieWithZero' });

  // A search over many projections that only the Retirement Readiness tab
  // reads, so it runs when that tab is open rather than on every start
  // (mobile speed pass, 2026-09-28).
  const targetPortfolioResults = useMemo(() => {
    if (activeTab !== 'readiness') return null;
    const targetAge = whatIfRetireAge !== '' ? parseInt(whatIfRetireAge) : debouncedInputs.retireAge1;
    let targetAge2 = debouncedInputs.retireAge2;
    if (debouncedInputs.spouse2Enabled && whatIfRetireAge !== '') {
       targetAge2 = spouse2RetireAgeMatching(debouncedInputs, targetAge);
    }
    const targetSpend = whatIfSpend !== '' ? parseFloat(whatIfSpend) : debouncedInputs.lifestyleExpense;
    
    return findTargetPortfolioSize(debouncedInputs, targetAge, targetAge2, targetSpend, whatIfFundingMethod);
  }, [activeTab, debouncedInputs, whatIfRetireAge, whatIfSpend, whatIfFundingMethod]);

  // Compute KPI values
  const kpis = useMemo(() => {
    const initialNestEgg = (Number(inputs.preTaxInit) || 0) + (Number(inputs.rothInit) || 0) + (Number(inputs.taxableInit) || 0);
    const peak = projection.peakPortfolioWorth;
    const ending = projection.endingBalance;
    const isSuccessful = projection.isSuccessful;
    const years = projection.years || [];
    const startYear = years[0]?.year;
    const endYear = years[years.length - 1]?.year;
    const peakYear = peakYearOf(years, peak);

    return {
      initialNestEgg,
      peak,
      ending,
      isSuccessful,
      startYear,
      endYear,
      peakYear,
    };
  }, [projection, inputs]);

  // Planned moves (residency timeline, changelog 195), normalized the same
  // way the engine reads them, for the printable report.
  const residencyMoves = useMemo(
    () => readResidencyTimeline(inputs.residencyTimeline, planWideResidence(inputs)),
    [inputs],
  );

  // Compute estate legacy and heir tax results.
  //
  // Fed from rawProjection (NOMINAL), never the deflated `projection`, even
  // when "Today's Dollars" is on: the exemptions and brackets inside
  // calculateHeirEstateTax are indexed up to the plan's final year, so it
  // must see nominal balances or it compares real dollars against future
  // exemptions and silently zeroes the estate tax (changelog 145 -- this was
  // the "$0 NY tax on a plan that clearly crosses the line" bug). The result
  // is then converted to today's dollars for DISPLAY below, by the same
  // final-year factor the Ending Balance uses, so the two finally agree.
  const heirTaxResults = useMemo(() => {
    // Shared with the stay-vs-move compare (changelog 198), so the two can
    // never disagree about what the heirs receive.
    const nominal = estateForProjection(inputs, rawProjection);
    // Deflate to today's dollars for display when the toggle is on, by the
    // SAME final-year inflation factor projection.endingBalance used.
    const factor = useRealDollars ? finalBalanceFactor(rawProjection?.years) : 1;
    return deflateEstateResultForDisplay(nominal, factor);
  }, [rawProjection, inputs, useRealDollars]);

  // ~40 projection reruns via bisection (49-171 ms), read only by the
  // printed report's Risk Analysis section below (the Risk tab computes its
  // own). Keyed on the debounced inputs and computed when the browser is
  // idle, so it never runs inside a keystroke (review 2026-09-30, H11).
  // null until the first result.
  const minimumRequiredReturn = useIdleMemo(() => getMinimumRequiredReturn(debouncedInputs), [debouncedInputs]);

  const estateChartData = useMemo(() => {
    if (!projection?.years || projection.years.length === 0) return [];
    const lastYear = projection.years[projection.years.length - 1];
    const roth = Math.max(0, lastYear.rothEnd || 0);
    const taxable = Math.max(0, lastYear.taxableEnd || 0);
    // Pre-Tax IRA's "Gross" uses heirTaxResults.totalPreTaxWithdrawn (the
    // grown total actually paid out across the 10-year withdrawal
    // schedule), not the raw ending pre-tax balance -- heirTaxResults.
    // totalHeirTax is computed against those grown withdrawal amounts, so
    // pairing it with the un-grown balance here would make Net look smaller
    // relative to Gross than it actually is.
    const preTax = Math.max(0, heirTaxResults.totalPreTaxWithdrawn || 0);

    return [
      {
        name: 'Pre-Tax IRA',
        Gross: Math.round(preTax),
        Net: Math.round(Math.max(0, preTax - heirTaxResults.totalHeirTax)),
        TaxDrag: Math.round(heirTaxResults.totalHeirTax),
      },
      {
        name: 'Roth IRA',
        Gross: Math.round(roth),
        Net: Math.round(roth),
        TaxDrag: 0,
      },
      {
        name: 'Taxable Brokerage',
        Gross: Math.round(taxable),
        Net: Math.round(taxable),
        TaxDrag: 0,
      },
      // Life insurance proceeds are always income-tax-free (IRC Sec.
      // 101(a)), so Gross === Net here -- any state estate tax drag from a
      // self-owned policy being counted in the taxable estate is already
      // reflected in the Total Portfolio row below, same as how Roth/
      // Taxable also don't break out their own fractional share of it.
      ...((inputs.lifeInsuranceEnabled1 || inputs.lifeInsuranceEnabled2) ? [{
        name: 'Life Insurance',
        Gross: Math.round(heirTaxResults.totalLifeInsuranceProceeds || 0),
        Net: Math.round(heirTaxResults.totalLifeInsuranceProceeds || 0),
        TaxDrag: 0,
      }] : []),
      {
        name: 'Total Portfolio',
        Gross: Math.round(heirTaxResults.grossInherited),
        Net: Math.round(heirTaxResults.netInherited),
        TaxDrag: Math.round(heirTaxResults.totalHeirTax),
      }
    ];
  }, [projection, heirTaxResults, inputs.lifeInsuranceEnabled1, inputs.lifeInsuranceEnabled2]);

  // Tax Bracket Visualizer chart data. Computed once here (not as a local
  // useMemo inside TaxEstateTab.jsx) because the "Maximize Tax Chart" modal
  // below also needs it — same reasoning as heirTaxResults/estateChartData
  // above. This used to be a TaxEstateTab.jsx-local useMemo; when it was
  // extracted there, this maximized-modal block was left referencing a
  // taxVisualizerData variable that no longer existed anywhere in scope,
  // which threw a ReferenceError and crashed the whole app the moment
  // anyone clicked that specific maximize icon.
  const taxVisualizerData = useMemo(
    () => (projection && projection.years ? buildTaxVisualizerData(projection.years, useRealDollars, { mfsLivedWithSpouse: inputs.mfsLivedWithSpouse !== false }) : []),
    [projection, useRealDollars, inputs.mfsLivedWithSpouse],
  );

  // Narrow the bracket lines to the ones this plan can actually reach.
  //
  // Why an effect rather than deriving at render: the checkbox row is real
  // user-editable state, so it has to live in useState. This keeps that
  // state in step with the plan right up until the user expresses a
  // preference, then leaves it alone forever.
  //
  // The sameBrackets guard matters -- taxVisualizerData is recomputed on
  // every input change, and setting identical state on each one would
  // re-render the chart continuously while someone drags a slider.
  useEffect(() => {
    taxVisualizerDataRef.current = taxVisualizerData;
    if (userChoseBrackets.current) return;
    const next = relevantBrackets(taxVisualizerData);
    setEnabledTaxBrackets(prev => (sameBrackets(prev, next) ? prev : next));
    const nextIrmaa = relevantIrmaaTiers(taxVisualizerData);
    setEnabledIrmaaTiers(prev => (sameIrmaaTiers(prev, nextIrmaa) ? prev : nextIrmaa));
  }, [taxVisualizerData]);

  // Compute projections for all saved scenarios
  // Saved scenarios are projected fresh here rather than read from the
  // metrics stored at save time, and -- since changelog 187 -- converted to
  // today's dollars by the same helper the Change one thing panel uses.
  //
  // They used to be nominal while everything else on screen was real, which
  // put two different units in one column: the Side-by-Side table showed the
  // active plan at $4,410,875 next to saved scenarios at $12,280,441 for the
  // same household, and the comparison chart drew its lines to $18M under a
  // headline reading $4.4M. Same bug as changelog 184, one surface over.
  //
  // endingBalance and peakPortfolioWorth are published here so the Scenarios
  // tab renders THESE rather than sc.metrics, which are nominal and also
  // frozen at whatever the plan looked like when the scenario was saved.
  // successProbability stays on sc.metrics: it is a Monte Carlo result, too
  // expensive to recompute on every toggle, and a probability has no units
  // to convert.
  // Only the Scenarios tab reads these, so they are projected when it is
  // open, not on every start (eleven projections in the demo).
  const scenarioProjections = useMemo(() => {
    if (activeTab !== 'scenarios') return [];
    return scenarios.map(sc => {
      const shown = deflateProjectionForDisplay(runProjection(sc.inputs), useRealDollars);
      const years = shown.years || [];
      return {
        id: sc.id,
        name: sc.name,
        years,
        endingBalance: shown.endingBalance,
        isSuccessful: shown.isSuccessful,
        // Recomputed from the converted years rather than deflating the
        // engine's nominal peak by the FINAL year's factor -- the peak year
        // is usually not the final year, so that would convert it at the
        // wrong rate.
        peakPortfolioWorth: years.length
          ? years.reduce((mx, y) => Math.max(mx, Number(y.totalPortfolioEnding) || 0), -Infinity)
          : undefined,
      };
    });
  }, [activeTab, scenarios, useRealDollars]);

  // Merge scenario projections for line chart comparison
  const scenarioChartData = useMemo(() => {
    if (scenarios.length === 0) return [];
    
    let minYear = Infinity;
    let maxYear = -Infinity;
    
    scenarioProjections.forEach(sp => {
      if (sp.years.length > 0) {
        const start = sp.years[0].year;
        const end = sp.years[sp.years.length - 1].year;
        if (start < minYear) minYear = start;
        if (end > maxYear) maxYear = end;
      }
    });
    
    if (minYear === Infinity) return [];
    
    const data = [];
    for (let year = minYear; year <= maxYear; year++) {
      const row = { year };
      scenarioProjections.forEach(sp => {
        const yrData = sp.years.find(y => y.year === year);
        if (yrData) {
          row[sp.name] = Math.round(yrData.totalPortfolioEnding);
        }
      });
      data.push(row);
    }
    return data;
  }, [scenarios, scenarioProjections]);

  // Compute Tax Bracket Stack dataset

  const ssClaimingHeatmapData = heavyResults.ssClaimingHeatmapData;

  // Posts a calculation request to the heavy-compute worker (see
  // heavyComputeWorker.js) whenever the debounced inputs or the
  // real/nominal-dollars toggle change, covering all four "heavy" results
  // above. A persistent Worker is created once and reused; onmessage/onerror
  // are reassigned on every run of this effect (cheap) rather than only on
  // worker creation, so they always close over the current debouncedInputs
  // /useRealDollars/requestId instead of the values from whichever render
  // first created the worker.
  //
  // requestId + heavyRequestIdRef guards against race conditions: if the
  // user changes inputs again before a worker response comes back, the
  // older in-flight response is detected as stale (its requestId no longer
  // matches heavyRequestIdRef.current) and discarded instead of overwriting
  // newer results.
  //
  // If the worker dies, the last results stay on screen and the request is
  // retried on a fresh worker (twice). Only where no worker can run at all
  // (no Worker support, a CSP that blocks it, repeated crashes) do the same
  // calculator.js functions run on the main thread -- and then on idle, and
  // dropped when a newer edit arrives, never once per keystroke (review
  // 2026-09-30, H11b).
  useEffect(() => {
    const requestId = ++heavyRequestIdRef.current;
    setHeavyResultsLoading(true);
    let cancelFallback = null;

    const runFallbackSync = () => {
      if (requestId !== heavyRequestIdRef.current) return;
      try {
        const fallbackRothBracketHeatmapData = getRothBracketWithdrawalHeatmap(debouncedInputs, useRealDollars);
        const result = {
          stressComparisonData: computeStressComparisonData(debouncedInputs, useRealDollars),
          ssClaimingHeatmapData: getSSClaimingHeatmap(debouncedInputs),
          ageFinderResults: useRealDollars ? computeAgeFinderResultsReal(debouncedInputs) : findOptimalRetirementAge(debouncedInputs),
          sensitivityResults: useRealDollars ? computeSensitivityAnalysisReal(debouncedInputs) : runSensitivityAnalysis(debouncedInputs),
          rothBracketHeatmapData: fallbackRothBracketHeatmapData,
          // The grid's best cell joins the Hub's cards as a seventh, dynamic
          // strategy — same wiring as heavyComputeWorker.js (changelog 110).
          optimizerResults: useRealDollars
            ? computeOptimizerResultsReal(debouncedInputs, [gridBestExtraStrategy(fallbackRothBracketHeatmapData)])
            : runOptimizer(debouncedInputs, [gridBestExtraStrategy(fallbackRothBracketHeatmapData)]),
          rothLadderScheduleHeatmapData: getRothLadderScheduleHeatmap(debouncedInputs, useRealDollars),
          guardrailsComparisonData: guardrailsComparisonForDisplay(debouncedInputs, useRealDollars),
          dieWithZeroLongevityData: dieWithZeroByLongevity(debouncedInputs),
          historicalStartsData: (() => {
            const h = runHistoricalStarts(debouncedInputs);
            return h ? { ...h, safeMax: findHistoricalSafeMax(debouncedInputs) } : h;
          })(),
        };
        if (requestId === heavyRequestIdRef.current) setHeavyResults(result);
      } catch (err) {
        console.warn('Heavy-compute synchronous fallback failed', err);
      } finally {
        if (requestId === heavyRequestIdRef.current) setHeavyResultsLoading(false);
      }
    };
    const scheduleFallback = () => {
      if (requestId !== heavyRequestIdRef.current) return;
      cancelFallback = runWhenIdle(runFallbackSync, { timeout: 2000 });
    };

    const post = () => {
      if (heavyWorkerFailuresRef.current >= 3) { scheduleFallback(); return; }
      try {
        if (!heavyWorkerRef.current) {
          heavyWorkerRef.current = new Worker(new URL('./heavyComputeWorker.js', import.meta.url), { type: 'module' });
        }
      } catch (workerErr) {
        console.warn('Heavy-compute Web Worker unavailable; computing on the main thread when idle', workerErr);
        heavyWorkerFailuresRef.current = 3;
        scheduleFallback();
        return;
      }
      const worker = heavyWorkerRef.current;

      worker.onmessage = (e) => {
        const data = e.data || {};
        if (data.requestId !== heavyRequestIdRef.current) return; // superseded by a newer request
        heavyWorkerFailuresRef.current = 0;
        if (data.success) {
          setHeavyResults({
            stressComparisonData: data.stressComparisonData,
            ssClaimingHeatmapData: data.ssClaimingHeatmapData,
            optimizerResults: data.optimizerResults,
            ageFinderResults: data.ageFinderResults,
            sensitivityResults: data.sensitivityResults,
            rothBracketHeatmapData: data.rothBracketHeatmapData,
            rothLadderScheduleHeatmapData: data.rothLadderScheduleHeatmapData,
            guardrailsComparisonData: data.guardrailsComparisonData,
            dieWithZeroLongevityData: data.dieWithZeroLongevityData || null,
            historicalStartsData: data.historicalStartsData || null,
          });
        } else {
          // The calculation itself threw; the same code would throw on the
          // main thread too. Keep the last results.
          console.warn('Heavy-compute worker reported an error; keeping the last results', data.error);
        }
        setHeavyResultsLoading(false);
      };
      worker.onerror = (err) => {
        console.warn('Heavy-compute worker crashed; keeping the last results and retrying', err);
        worker.terminate();
        if (heavyWorkerRef.current === worker) heavyWorkerRef.current = null;
        heavyWorkerFailuresRef.current += 1;
        if (requestId === heavyRequestIdRef.current) post();
      };

      worker.postMessage({ requestId, inputs: debouncedInputs, useRealDollars });
    };
    post();
    return () => { if (cancelFallback) cancelFallback(); };
  }, [debouncedInputs, useRealDollars]);

  // Save current active inputs and metrics as a scenario.
  // `options.tag` is an optional machine-readable marker (e.g.
  // 'year-advance-backup', set by the Plan Year panel's Advance Year flow
  // in SettingsTab.jsx) so the Scenario Profile Manager can visually
  // distinguish an automatic pre-advance safety snapshot from a scenario
  // the user saved intentionally to compare plans. Every save also records
  // `planYearAtSave` regardless of tag, so any snapshot -- tagged or not --
  // shows which plan year it reflects once the active plan has moved on.
  // Saving a scenario used to run runMonteCarlo (1,000 lifetimes) on the
  // main thread, which froze the UI for seconds -- the same bug, in the same
  // shape, that changelog 129 fixed for entering demo mode. It now goes
  // through runMonteCarloBatch, which uses the Monte Carlo worker and falls
  // back to a synchronous run (yielding a frame between plans) wherever a
  // Worker cannot be constructed, so the button can show a busy state
  // instead of locking the page. Async now: callers fire-and-forget, and
  // isSavingScenario is what the UI reads.
  const handleSaveScenario = useCallback(async (name, options = {}) => {
    // A second click while the first save is still simulating would run a
    // duplicate 1,000-lifetime job and race the setScenarios below.
    if (isSavingScenarioRef.current) return;
    isSavingScenarioRef.current = true;
    setIsSavingScenario(true);
    let projResults;
    let mcResults;
    try {
      projResults = runProjection(inputs);
      // Never rejects for worker reasons -- see runMonteCarloBatch.
      [mcResults] = await runMonteCarloBatch([inputs]);
    } finally {
      isSavingScenarioRef.current = false;
      setIsSavingScenario(false);
    }

    const newScenario = {
      id: Date.now().toString(),
      name,
      inputs: JSON.parse(JSON.stringify(inputs)),
      metrics: {
        endingBalance: projResults.endingBalance,
        isSuccessful: projResults.isSuccessful,
        peakPortfolioWorth: projResults.peakPortfolioWorth,
        successProbability: mcResults.successProbability,
        oddsVersion: ODDS_VERSION,
      },
      planYearAtSave: inputs.planYear,
      savedAt: new Date().toISOString(),
      tag: options.tag || null
    };

    setScenarios(prev => {
      const filtered = prev.filter(sc => sc.name.toLowerCase() !== name.toLowerCase());
      return [...filtered, newScenario];
    });
  }, [inputs]);

  // Accept Disclaimer
  const acceptDisclaimer = () => {
    localStorage.setItem('retire_plan_disclaimer_accepted', 'true');
    setShowDisclaimer(false);
  };

  // Note: this used to also define `downloadSource`, a lightweight
  // activeInputs + projectionSummary-only JSON export ("Download Config" in
  // the Sidebar). Removed 2026-08-18 as part of consolidating to one JSON
  // backup path -- it was redundant with Backup Everything (fullBackup.js)
  // once that payload gained an optional projectionSummary field passed in
  // by the caller (see buildFullBackupPayload's `options` param), and it
  // was export-only (no restore counterpart), which made it a second,
  // easily-confused-with-the-real-one JSON download next to a button with
  // an almost identical name.

  // Helper formatting currencies — stable reference via useCallback
  const formatCurrency = useCallback((val) => {
    if (val === undefined || val === null) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  }, []);

  // Headline dollars far in the future are rounded to three significant
  // figures (farDollars.js, changelog 277): the KPI cards and the printed
  // report's summary, not the ledger or the charts.
  const formatEnding = useMemo(() => farFormatter(formatCurrency, kpis.endYear, kpis.startYear, roundFarDollars), [formatCurrency, kpis.endYear, kpis.startYear, roundFarDollars]);
  const formatPeak = useMemo(() => farFormatter(formatCurrency, kpis.peakYear, kpis.startYear, roundFarDollars), [formatCurrency, kpis.peakYear, kpis.startYear, roundFarDollars]);

  // Run Monte Carlo Simulation
  const handleRunMonteCarlo = useCallback(() => {
    setMcLoading(true);
    setMcKey(planKey(inputs));
    
    // Terminate any active worker
    if (mcWorkerRef.current) {
      mcWorkerRef.current.terminate();
    }
    
    try {
      // Instantiate background Web Worker
      const worker = new Worker(new URL('./monteCarloWorker.js', import.meta.url), { type: 'module' });
      mcWorkerRef.current = worker;
      
      worker.onmessage = (e) => {
        if (e.data && e.data.success) {
          setMonteCarlo(e.data.results);
        } else {
          console.warn("Monte Carlo worker failed, running fallback simulation synchronous", e.data?.error);
          const res = runMonteCarlo(inputs);
          setMonteCarlo(res);
        }
        setMcLoading(false);
        worker.terminate();
        mcWorkerRef.current = null;
      };
      
      worker.onerror = (err) => {
        console.warn("Monte Carlo worker lifecycle error, running fallback simulation synchronous", err);
        const res = runMonteCarlo(inputs);
        setMonteCarlo(res);
        setMcLoading(false);
        worker.terminate();
        mcWorkerRef.current = null;
      };
      
      worker.postMessage(inputs);
    } catch (workerErr) {
      console.warn("Failed to initialize Monte Carlo Web Worker, running fallback simulation synchronous", workerErr);
      const res = runMonteCarlo(inputs);
      setMonteCarlo(res);
      setMcLoading(false);
      mcWorkerRef.current = null;
    }
  }, [inputs]);

  // The plan settled and the run in hand is not for it: run again, quietly,
  // a few seconds after the last edit (changelog 269). The persisted result
  // and its key (changelog 268) mean this never runs twice for one plan --
  // a reload, or an edit undone, finds the run already there.
  useEffect(() => {
    if (!mcAutoRun || mcLoading) return undefined;
    if (mcKey === currentPlanKey && monteCarlo) return undefined;
    const handle = setTimeout(() => { handleRunMonteCarlo(); }, MC_AUTO_RUN_DELAY_MS);
    return () => clearTimeout(handle);
  }, [mcAutoRun, mcLoading, mcKey, currentPlanKey, monteCarlo, handleRunMonteCarlo]);

  // Note: autoCalibratePlan used to be defined here too, but it was dead
  // code -- never wired to any button, never called anywhere in this file.
  // DashboardTab.jsx has the real, actually-wired copy behind the
  // "Auto-Calibrate Plan (Easy Button)" button. It used to write results
  // into its own local calibrationResults state that nothing ever rendered
  // (this modal below only ever listened to THIS file's state, which this
  // dead function was the only thing that ever populated) -- so clicking
  // that button silently recalibrated the plan with zero visible
  // confirmation. Fixed by removing this dead duplicate and having
  // DashboardTab.jsx's real version write into this shared
  // calibrationResults state via context instead of its own local one.

  // Memoized so the context value only gets a new object identity when one
  // of its actual contents changes — without this, any unrelated state
  // change anywhere in the component (e.g. the waterfall autoplay interval
  // ticking waterfallYear, which isn't even part of this object) would
  // rebuild simulationState every render and invalidate it for every
  // consumer, making React.memo on tab components pointless even if added
  // later. This only helps because updateInput/handleReset/handleSaveScenario
  // /toggleTheme/showAlert/showConfirm/showPrompt were wrapped
  // in useCallback above — an object containing even one function that's
  // freshly recreated every render would defeat the memoization here too.
  //
  // Dependency list is exhaustive: every identifier read inside the object
  // literal below is listed here (verified with a script diffing the two,
  // not just by eye).
  const mcRange = useMemo(
    () => monteCarloRange(monteCarlo, mcKey, currentPlanKey, rawProjection, useRealDollars),
    [monteCarlo, mcKey, currentPlanKey, rawProjection, useRealDollars]
  );

  useEffect(() => {
    const before = () => {
      let lines = null;
      try { lines = readinessSummary(printInputs, projection, { useRealDollars, formatCurrency }); }
      catch (err) { console.warn('Retirement Readiness could not be summarized for the printed report', err); }
      flushSync(() => setPrintReadiness(lines));
    };
    const after = () => setPrintReadiness(null);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, [printInputs, projection, useRealDollars, formatCurrency]);

  // The one verdict every surface states (utils/planVerdict.js). A run that
  // is under way, or that auto-run is about to start, reads as pending
  // rather than as a made-up 100% or 0%.
  // While the Monte Carlo runs (about 17 s on a cold start, a few seconds
  // after each edit) the badge states the verdict the average-returns
  // projection already supports, and the detail says the market check is
  // under way; the Monte Carlo upgrades it when it lands.
  // Changelog 363: until a Monte Carlo result for this plan is in, the
  // every-retirement-since-1928 result stands in -- only once it belongs to
  // the plan on screen (the background run has finished for these inputs).
  const verdictHistory = useMemo(() => {
    if (heavyResultsLoading || debouncedInputs !== inputs) return null;
    const h = historicalHeadline(historicalStartsData);
    return h ? { lasted: h.lasted, count: h.count, firstStart: historicalStartsData.firstStart } : null;
  }, [heavyResultsLoading, debouncedInputs, inputs, historicalStartsData]);
  const verdict = useMemo(() => {
    const args = { isSuccessful: kpis.isSuccessful, years: projection.years, mc: mcRange, history: verdictHistory };
    const v = planVerdict({ ...args, mcPending: mcLoading || (mcAutoRun && mcRange.status !== 'fresh') });
    if (v.tone !== 'pending') return v;
    const settled = planVerdict({ ...args, mcPending: false });
    return { ...v, tone: settled.tone, label: settled.label, checking: true };
  }, [kpis.isSuccessful, projection.years, mcRange, mcLoading, mcAutoRun, verdictHistory]);

  // The Monte Carlo in the display basis (utils/displayDollars.js). The
  // engine's percentiles are future dollars; every screen and the print
  // read this copy so they match the Dashboard's Ending Balance. The raw
  // result stays in `monteCarlo` state for the cache.
  const monteCarloShown = useMemo(
    () => monteCarloForDisplay(monteCarlo, rawProjection, useRealDollars),
    [monteCarlo, rawProjection, useRealDollars]
  );

  const simulationState = useMemo(() => ({
    inputs, setInputs, updateInput, activeTab, setActiveTab, useRealDollars, setUseRealDollars,
    statusBarHidden, setStatusBarHidden,
    mcAutoRun, setMcAutoRun,
    roundFarDollars, setRoundFarDollars,
    projection, formatCurrency, getRMDAge,
    maximizedComponent, setMaximizedComponent,
    scenarios, setScenarios,
    handleRunMonteCarlo, mcLoading, monteCarlo: monteCarloShown, mcRange, verdict,
    riskSubTab, setRiskSubTab, settingsSubTab, setSettingsSubTab, strategySubTab, setStrategySubTab,
    pricingSource, setPricingSource, pricingScriptOutOfDate, scriptAckVersion, acknowledgeScriptUpdate,
    guideSubTab, setGuideSubTab, portfolioSubTab, setPortfolioSubTab,
    yearledgerSubTab, setYearledgerSubTab,
    dictionaryQuery, openDictionary, howFiguredTarget, openHowFigured,
    setShowDisclaimerReview,
    taxestateSubTab, setTaxestateSubTab,
    stressChartView, setStressChartView, kpis, handleReset, handleSaveScenario, isSavingScenario, theme, toggleTheme, largeTextMode, setLargeTextMode,
    showQuickUpdate, setShowQuickUpdate, showAlert, showConfirm, showPrompt,
    setShowOnboarding, setOnboardingStep,
    scenarioChartData, scenarioProjections,
    heirTaxResults, estateChartData,
    taxVisualizerData, selectedTaxYear, setSelectedTaxYear, showIrmaa, setShowIrmaa, enabledTaxBrackets, setEnabledTaxBrackets: setEnabledTaxBracketsManual, enabledIrmaaTiers, resetLinePrefsToAuto, userChoseLinePrefs: userChoseBrackets,
    optimizerResults, ageFinderResults, sensitivityResults, dieWithZeroResults, dieWithZeroLongevityData, targetPortfolioResults, ssClaimingHeatmapData, stressComparisonData, heavyResultsLoading,
    rothBracketHeatmapData, rothLadderScheduleHeatmapData, guardrailsComparisonData, historicalStartsData,
    whatIfRetireAge, setWhatIfRetireAge, whatIfSpend, setWhatIfSpend, whatIfFundingMethod, setWhatIfFundingMethod,
    calibrationResults, setCalibrationResults, calibrationUndo, undoCalibration,
    holdings, addHolding, updateHolding, removeHolding, addHoldings, replaceHoldings, bucketTotals, taxableCostBasis, assetClassMix, balanceGap,
    liquidations, liquidateHolding, removeLiquidation, replaceLiquidations, addLiquidations,
  }), [
    inputs, setInputs, updateInput, activeTab, setActiveTab, useRealDollars, setUseRealDollars,
    statusBarHidden, setStatusBarHidden,
    mcAutoRun, setMcAutoRun,
    roundFarDollars, setRoundFarDollars,
    projection, formatCurrency,
    maximizedComponent, setMaximizedComponent,
    scenarios, setScenarios,
    handleRunMonteCarlo, mcLoading, monteCarloShown, mcRange, verdict,
    riskSubTab, setRiskSubTab, settingsSubTab, setSettingsSubTab, strategySubTab, setStrategySubTab,
    pricingSource, setPricingSource, pricingScriptOutOfDate, scriptAckVersion, acknowledgeScriptUpdate,
    guideSubTab, setGuideSubTab, portfolioSubTab, setPortfolioSubTab,
    yearledgerSubTab, setYearledgerSubTab,
    dictionaryQuery, openDictionary, howFiguredTarget, openHowFigured,
    setShowDisclaimerReview,
    taxestateSubTab, setTaxestateSubTab,
    stressChartView, setStressChartView, kpis, handleReset, handleSaveScenario, isSavingScenario, theme, toggleTheme, largeTextMode, setLargeTextMode,
    showQuickUpdate, setShowQuickUpdate, showAlert, showConfirm, showPrompt,
    setShowOnboarding, setOnboardingStep,
    scenarioChartData, scenarioProjections,
    heirTaxResults, estateChartData,
    taxVisualizerData, selectedTaxYear, setSelectedTaxYear, showIrmaa, setShowIrmaa, enabledTaxBrackets, setEnabledTaxBracketsManual, enabledIrmaaTiers, resetLinePrefsToAuto,
    optimizerResults, ageFinderResults, sensitivityResults, dieWithZeroResults, dieWithZeroLongevityData, targetPortfolioResults, ssClaimingHeatmapData, stressComparisonData, heavyResultsLoading,
    rothBracketHeatmapData, rothLadderScheduleHeatmapData, guardrailsComparisonData, historicalStartsData,
    whatIfRetireAge, setWhatIfRetireAge, whatIfSpend, setWhatIfSpend, whatIfFundingMethod, setWhatIfFundingMethod,
    calibrationResults, setCalibrationResults, calibrationUndo, undoCalibration,
    holdings, addHolding, updateHolding, removeHolding, addHoldings, replaceHoldings, bucketTotals, taxableCostBasis, assetClassMix, balanceGap,
    liquidations, liquidateHolding, removeLiquidation, replaceLiquidations, addLiquidations,
  ]);

  return (
    <EntitlementContext.Provider value={entitlementState}>
    <SimulationContext.Provider value={simulationState}>
    <div className={`app-container ${!isSidebarOpen ? 'sidebar-closed' : ''}`}>
      {/* First stop for keyboard users: past the header and the sidebar's
          twelve destinations straight to the page. Visible only when
          focused. */}
      <a className="skip-link" href="#main-content" onClick={(e) => {
        e.preventDefault();
        const main = document.getElementById('main-content');
        if (main) { main.focus({ preventScroll: false }); main.scrollIntoView?.({ block: 'start' }); }
      }}>Skip to main content</a>
      {/* Mobile-only top bar: hamburger + logo + status dot, fixed so it's
          always visible without scrolling past the full sidebar first (the
          full sidebar is 10+ full-width buttons tall — far more than a
          phone screen can show at once). Hidden on desktop via CSS. */}
      <div className="mobile-topbar">
        <button
          className="mobile-topbar-hamburger"
          onClick={() => setIsMobileNavOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu size={22} />
        </button>
        <a className="logo-container brand-home" style={{ margin: 0 }} href={formatHash(DEFAULT_TAB)} aria-label="OutlastRetirement — go to Dashboard">
          <BrandMark variant="full" height={28} />
        </a>
        {/* The plan's verdict in words (changelog 325). This was a bare
            green/red dot: color alone, no label, hidden from screen
            readers, and on the old pass/fail flag rather than the one
            verdict every other surface states. Tapping it opens the
            Dashboard, where the verdict card explains it. */}
        {!showDisclaimer && (
          <a
            className={`mobile-topbar-verdict ${verdictClass(verdict.tone)}`}
            href={formatHash(DEFAULT_TAB)}
            aria-label={`Plan status: ${verdict.label}. ${verdict.detail}`}
            data-testid="mobile-topbar-verdict"
          >
            <span className="mobile-topbar-verdict-dot" aria-hidden="true" />
            {verdict.label}
          </a>
        )}
      </div>

      {/* Backdrop behind the mobile drawer -- tapping it closes the drawer,
          same as tapping outside any standard mobile nav menu. */}
      {isMobileNavOpen && (
        <div className="sidebar-backdrop" onClick={() => setIsMobileNavOpen(false)} />
      )}

      {/* Sidebar navigation */}
      <Sidebar
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        showDisclaimer={showDisclaimer}
        isMobileNavOpen={isMobileNavOpen}
        setIsMobileNavOpen={setIsMobileNavOpen}
      />

      {/* Main Workspace */}
      <main className="main-content" id="main-content" tabIndex={-1}>
        {/* With the sidebar collapsed to its icon rail the wordmark has
            nowhere else to live, so it sits on one slim line above the
            KPIs. Hidden under 768px, where the mobile top bar carries it. */}
        {!isSidebarOpen && (
          <a className="collapsed-brand brand-home" href={formatHash(DEFAULT_TAB)} aria-label="OutlastRetirement — go to Dashboard">
            {/* The spelled-out lockup, because the rail beside it is now
                showing the monogram. This line has the width for it, and
                between the two the product is named rather than initialled. */}
            <BrandMark variant="full" height={28} />
          </a>
        )}
        {/* The domain move. Above the KPIs rather than floating, because a
            floating pill is something you learn to look past and this one
            protects against losing a plan. Renders nothing off the old
            host. */}
        <MigrationNotice />
        {/* Premium key expiry (changelog 183). Renders nothing unless a
            real key is within a week of running out, or already has.
            Sits HERE, in flow above the KPIs, for the same reason
            MigrationNotice does — and because changelog 188 first tried
            it as a fixed banner at the top of the viewport, where it
            covered the Annual Lifestyle and Ending Balance cards. A notice
            that hides the numbers is worse than one you have to scroll
            to. DemoModeBanner can be fixed because it measures itself and
            pushes the layout down; this one does not need that machinery
            if it simply takes up space like everything else. */}
        {!showDisclaimer && <PremiumExpiryBanner />}
        {/* Safari's seven-day erase (changelog 370): Safari tabs only. */}
        {!showDisclaimer && !demoActive && <SafariStorageBanner />}
        {/* KPI Banner always visible on desktop; on a phone, a one-line
            summary everywhere but the Dashboard (changelog 294). */}
        {activeTab !== 'dashboard' && (
          <button
            type="button"
            className="kpi-compact"
            data-testid="kpi-compact"
            aria-expanded={kpiOpenMobile}
            aria-controls="kpi-grid"
            onClick={() => setKpiOpenMobile((o) => !o)}
          >
            <span style={{ color: 'var(--accent-text)', fontWeight: 700 }}>{formatCurrency(inputs.lifestyleExpense)}/yr</span>
            <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>&middot;</span>
            <span>Ends <strong style={{ color: kpis.ending > 0 ? 'var(--success)' : 'var(--error)' }}>{compactDollars(kpis.ending)}</strong></span>
            <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>&middot;</span>
            <span style={{ color: verdictColor(verdict.tone), fontWeight: 600 }}>{verdict.label}</span>
            <ChevronDown size={16} style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-muted)', transform: kpiOpenMobile ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>
        )}
        <section id="kpi-grid" className={`kpi-grid${activeTab !== 'dashboard' && !kpiOpenMobile ? ' kpi-collapsed' : ''}`}>
          {/* Shortcut, not the canonical home. This slider is genuinely
              useful for fast what-iffing from any tab, so it stays — but
              as of 2026-08-19 (IA Phase 2) the real field lives in Plan
              Settings > Basic Parameters > Retirement Spending Target,
              and this links there. Previously this slider, the onboarding
              wizard, the Interview and Die-with-Zero were the ONLY ways to
              set the single most consequential number in the plan. */}
          <div className="glass-panel kpi-card" style={{ padding: '16px' }}>
            <span className="kpi-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Coins size={14} /> Annual Lifestyle
              <button
                type="button"
                title="Edit in Plan Settings > Retirement Spending Target"
                aria-label="Edit Annual Lifestyle in Plan Settings"
                className="kpi-edit-btn"
                onClick={() => { setActiveTab('settings'); setSettingsSubTab('spending'); }}
                style={{ background: 'none', border: 'none', padding: 0, marginLeft: 'auto', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex' }}
              >
                <Settings size={12} />
              </button>
            </span>
            <span className="kpi-value" style={{ color: 'var(--accent-text)' }}>
              {formatCurrency(inputs.lifestyleExpense)}
            </span>
            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
              ≈ {formatCurrency(Math.round((Number(inputs.lifestyleExpense) || 0) / 12))} / mo
            </span>
            <input
              type="range"
              min="30000" 
              max="300000" 
              step="1000"
              value={inputs.lifestyleExpense}
              onChange={(e) => updateInput('lifestyleExpense', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
              className="custom-slider"
              style={{ marginTop: '8px' }}
              aria-label="Annual lifestyle spending"
              aria-valuetext={`${formatCurrency(inputs.lifestyleExpense)} per year`}
            />
          </div>
          <div className="glass-panel kpi-card">
            <span className="kpi-title">Initial Nest Egg</span>
            <span className="kpi-value">{formatCurrency(kpis.initialNestEgg)}</span>
            <span className="kpi-subtext" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px', lineHeight: 1.35 }}>
              Pre-Tax, Roth and Taxable today
            </span>
            {balanceGap && (
              <span className="kpi-subtext" data-testid="nest-egg-gap" style={{ fontSize: 'var(--fs-xs)', color: 'var(--warning)', marginTop: '6px', lineHeight: 1.35 }}>
                Typed in by hand &mdash; your holdings add up to {formatCurrency(Math.round(balanceGap.holdingsNestEgg))}. Use Sync to Initial Balances on Detailed Holdings.
              </span>
            )}
          </div>
          <div className="glass-panel kpi-card">
            <span className="kpi-title">Peak Portfolio Worth</span>
            <span className="kpi-value" style={{ color: 'var(--accent-text)' }}>{formatPeak(kpis.peak)}</span>
            {/* The dollar frame, said on the card (changelog 412): a figure
                decades out is in that year's dollars unless Today's Dollars
                is on, and most people read a bare number as today's money. */}
            <span className="kpi-subtext" data-testid="peak-frame" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
              {kpis.peakYear ? (useRealDollars ? `in ${kpis.peakYear}, in today's dollars` : `in ${kpis.peakYear}, in ${kpis.peakYear} dollars`) : ''}
            </span>
          </div>
          <div className="glass-panel kpi-card">
            <span className="kpi-title">Ending Balance</span>
            <span className="kpi-value" style={{ color: kpis.ending > 0 ? 'var(--success)' : 'var(--error)' }}>
              {formatEnding(kpis.ending)}
            </span>
            <span className="kpi-subtext" data-testid="ending-frame" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
              {kpis.endYear ? (useRealDollars ? `in ${kpis.endYear}, in today's dollars` : `in ${kpis.endYear}, in ${kpis.endYear} dollars`) : ''}
            </span>
            {/* The range behind the number (changelog 254): the Monte
                Carlo's P10-P90 when it was run for this plan; otherwise an
                honest note rather than a stale band. Same dollar frame as
                the figure above (see monteCarloRange). */}
            <span className="kpi-subtext" data-testid="ending-range" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px', lineHeight: 1.35 }}>
              {mcRange.status === 'fresh' && (
                <>Likely range {formatEnding(Math.round(mcRange.p10))} &ndash; {formatEnding(Math.round(mcRange.p90))} <Tooltip text="The 10th to 90th percentile of the Monte Carlo's ending balances: eight trials in ten ended inside this band, one in ten below it and one in ten above. It is the typical spread, not the odds of success." more="8 of 10 simulated markets">(P10&ndash;P90)</Tooltip></>
              )}
              {mcRange.status === 'stale' && (
                <button type="button" onClick={() => { setActiveTab('risk'); setRiskSubTab('montecarlo'); }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--warning)', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
                  Plan changed since the Monte Carlo ran &mdash; run it again for the range
                </button>
              )}
              {mcRange.status === 'none' && (
                <button type="button" onClick={() => { setActiveTab('risk'); setRiskSubTab('montecarlo'); }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-muted)', cursor: 'pointer', font: 'inherit', textAlign: 'left', textDecoration: 'underline' }}>
                  One path of many &mdash; run the Monte Carlo for the range
                </button>
              )}
            </span>
          </div>
          <div className="glass-panel kpi-card">
            <span className="kpi-title">Will It Last?</span>
            {/* One verdict (utils/planVerdict.js): the average-returns
                projection and the Monte Carlo, stated together. */}
            <span className="kpi-value" data-testid="plan-verdict" style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '6px', color: verdictColor(verdict.tone) }}>
              {verdict.tone === 'good' && <CheckCircle size={20} aria-hidden="true" />}
              {verdict.tone === 'caution' && <AlertTriangle size={20} aria-hidden="true" />}
              {verdict.tone === 'risk' && <XCircle size={20} aria-hidden="true" />}
              <span>{verdict.label}</span>
            </span>
            <span className="kpi-subtext" data-testid="success-odds" aria-live="polite" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px', lineHeight: 1.35 }}>
              {verdict.detail}
            </span>
          </div>
        </section>

        {/* Tab Panels — keyed wrapper forces remount on tab change, triggering CSS fade */}
        <div key={activeTab} className="tab-panel">
        {/* Per-tab boundary: one tab's render error shows here, inside the
            tab, and the sidebar and every other tab keep working. The keyed
            wrapper remounts it on each tab change, so leaving the broken
            tab clears it. */}
        <ErrorBoundary fallbackMessage="This tab hit an unexpected error and stopped rendering. Your data is unaffected — switch to another tab, or click Try Again below. If it keeps happening, Backup Everything in Preferences saves a copy of your data.">
        <React.Suspense fallback={<TabFallback />}>
        {activeTab === 'dashboard' && (
          <DashboardTab />
        )}

        {activeTab === 'readiness' && (
          <ReadinessTab />
        )}

        {activeTab === 'strategy' && (
          <StrategyTab />
        )}
        {activeTab === 'settings' && (
          <SettingsTab />
        )}

        {activeTab === 'interview' && (
          <InterviewTab />
        )}

        {activeTab === 'lifeplan' && (
          <LifePlanTab />
        )}

        {activeTab === 'taxestate' && (
          <TaxEstateTab />
        )}

        {activeTab === 'risk' && (
          <RiskTab />
        )}

        {/* 'ledger' was one tab doing two unrelated jobs; split into
            'yearledger' and 'scenarios' on 2026-08-19 (IA_REVIEW.md). Kept
            as an alias so any lingering in-app link still lands somewhere
            sensible rather than on a blank screen. */}
        {(activeTab === 'yearledger' || activeTab === 'ledger') && (
          <YearLedgerTab />
        )}
        {activeTab === 'scenarios' && (
          <ScenariosTab />
        )}

        {activeTab === 'guide' && (
          <GuideTab />
        )}

        {activeTab === 'preferences' && (
          <PreferencesTab />
        )}
        {/* 'reference' was its own nav destination until the Guide and the
            Input Dictionary were merged into one Help tab (2026-08-19).
            Kept as an alias so any saved state or in-app link pointing at
            it still lands somewhere sensible. */}
        {activeTab === 'reference' && (
          <GuideTab />
        )}

        {/* Deliberately NOT gated on an entitlement -- this is the page
            that exists for people without one. See PremiumTab.jsx. */}
        {activeTab === 'premium' && (
          <PremiumTab />
        )}

        {activeTab === 'portfolio' && (entitlementState.isPremium || entitlementState.portfolioPreview) && (
          <ErrorBoundary fallbackMessage="The Detailed Holdings tab hit an unexpected error and stopped rendering. Your holdings data is unaffected — switch to another tab and back, or click Try Again below.">
            <PremiumMount
              id="portfolioTab"
              fallback={<TabFallback />}
              locked={(
                // Only reachable in the demo when no demo delivery key is
                // configured (config/demoDeliveryKey.js); never a blank tab.
                <div className="glass-panel" role="status" style={{ padding: '18px 20px', borderRadius: '10px' }}>
                  <div style={{ fontWeight: 600 }}>The Detailed Holdings preview is not available right now</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', marginTop: '4px' }}>
                    The demo normally shows this household&rsquo;s holdings here, read-only. Everything else in the demo works as usual.
                  </div>
                </div>
              )}
            />
          </ErrorBoundary>
        )}
        </React.Suspense>
        </ErrorBoundary>

        </div>{/* end key={activeTab} wrapper */}

        {/* Always-visible disclaimer line.
            Until this existed, the only disclaimer a user saw in normal
            operation was the first-visit modal — one click, dismissed
            permanently. After that they could spend months in Optimizers
            (which names a "best" choice and quantifies the gain from
            taking it), Monte Carlo (a headline success percentage) and
            Tax & Estate (heir tax owed) with nothing on screen saying what
            the numbers are and aren't.
            Deliberately in the document flow rather than position: fixed --
            fixed elements are hidden by the print stylesheet, and it would
            compete with the sticky summary bar in the same corner. Hidden
            in print by its own rule, since the printed report already
            carries the longer DISCLAIMER_PRINT footer on every page.
            Gated on !showDisclaimer for the same reason the status badge
            is: nothing should render behind the acceptance modal. */}
        {!showDisclaimer && (
          <div className="app-disclaimer-footer">
            <span>{DISCLAIMER_SHORT}</span>
            <button
              type="button"
              onClick={() => setShowDisclaimerReview(true)}
              className="app-disclaimer-footer-link"
            >
              Read the full disclaimer
            </button>
            {/* The only route back to the marketing side. Everything else
                points one way — the landing page sends people in, and once
                in there was no way out but the back button or editing the
                URL. A real link and not a router push: it leaves the SPA.
                Lives in the footer rather than the nav because it is a
                once-in-a-while destination, not part of anyone's workflow. */}
            <a href="/" className="app-disclaimer-footer-link">
              About {BRAND_NAME}
            </a>
            {/* The terms the disclaimer is only one clause of. "Not advice"
                was the ONLY thing a user was ever shown before 2026-09-20 --
                nothing said what they may do with the software, and nothing
                capped what we are answerable for if a projection is wrong.
                A plain href for the same reason as the link above it: these
                are static documents outside the SPA. */}
            {/* The privacy policy: what the line below promises, in full.
                Every public page's footer has linked it; the app's did not. */}
            <a href={PRIVACY_URL} className="app-disclaimer-footer-link">
              Privacy
            </a>
            <a href={TERMS_URL} className="app-disclaimer-footer-link">
              Terms
            </a>
            {/* Where someone using assistive technology finds what works and
                how to report a barrier. Same plain static-document href. */}
            <a href={ACCESSIBILITY_URL} className="app-disclaimer-footer-link">
              Accessibility
            </a>
            {/* How to check the privacy line below for yourself (/verify). */}
            <a href="/verify" className="app-disclaimer-footer-link">
              Verify it yourself
            </a>
            {/* The copyright notice. Not required for the copyright to
                exist — it exists on authorship — but its absence is what
                lets a copier claim they did not know, so it goes where the
                software is actually used, not only on the marketing page. */}
            {/* The locked privacy line, from config/branding.js. */}
            <span className="app-disclaimer-footer-promise">{PRIVACY_PROMISE}</span>
            <span className="app-disclaimer-footer-copyright">{COPYRIGHT_NOTICE}</span>
          </div>
        )}
        {/* Sticky Summary Bar. Hidden while the legal disclaimer is up front-
            and-center — surfacing a "Plan Status: Successful" readout behind
            a modal the user hasn't accepted yet undercuts the disclaimer's
            own "this is not advice, review before you rely on it" message,
            and it was visible (dimmed, but legible) through the modal
            overlay on a brand-new visit before this fix. */}
        {!showDisclaimer && !statusBarHidden && (
        <div className="sticky-summary-bar" style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 900,
          background: 'var(--card-bg)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--card-border)',
          borderRadius: '16px',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.5)',
          transition: 'all 0.3s ease'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plan Status</span>
            <span style={{ fontSize: '14px', fontWeight: '600', color: verdictColor(verdict.tone) }}>
              {verdict.label}
            </span>
          </div>
          <div className="sticky-summary-bar-divider" style={{ width: '1px', height: '30px', background: 'var(--card-border)' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ending Balance</span>
            <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(kpis.ending)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBarHidden(true)}
            aria-label="Hide the Plan Status bar"
            title="Hide this. You can bring it back from Preferences → Display."
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '4px',
              marginLeft: '-12px',
              display: 'flex',
              alignItems: 'center',
              lineHeight: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>
        )}

      </main>

      {/* Quick Update Modal */}
      {showQuickUpdate && (
        <QuickUpdate onClose={() => setShowQuickUpdate(false)} />
      )}

      {/* "Keep the data real" reminders -- renders nothing unless the
          backup or portfolio-freshness clock is actually overdue. Not
          gated behind the disclaimer being accepted? It is: a brand-new
          visitor can't be overdue (both clocks seed a grace window on
          first run), so the gate below is belt-and-braces against ever
          stacking on the disclaimer modal. */}
      {!showDisclaimer && !demoActive && <DataFreshnessBanner />}

      {/* Demo-mode strip: pinned above everything whenever the Carters are
          loaded, with the only exit. See utils/demoMode.js. */}
      {demoActive && <DemoModeBanner />}

      {/* In-app alert/confirm/prompt replacement */}
      <AppDialog dialog={dialog} onClose={closeDialog} />

      {/* "What's New" popup -- only once the legal disclaimer has been
          accepted and the onboarding wizard (if any) is done, so it never
          stacks on top of either. WhatsNewPopup itself decides whether it
          actually has anything unseen to show (see its own localStorage
          logic); mounting it here just controls WHEN that check runs. */}
      {/* Not in the demo either: a visitor trying the Carters wants their
          answer, not release notes. Nothing is marked seen, so the notes
          are still waiting after Exit Demo. */}
      {/* whatsNewMayShow (utils/whatsNewGate.js) keeps the popup -- and the
          whole changelog it imports — off the network on the usual visit,
          when there is nothing unseen to show. */}
      {!showDisclaimer && !showOnboarding && !demoActive && whatsNewPending && (
        <React.Suspense fallback={null}>
          <WhatsNewPopup />
        </React.Suspense>
      )}

      {/* Disclaimer Modal Overlay */}
      {/* Not dismissible: it has to be accepted, so Escape and a backdrop
          click do nothing — but focus still moves into it. */}
      {showDisclaimer && (
        <ModalShell dismissible={false} labelledBy="disclaimer-title">
            <h2 id="disclaimer-title" style={{ fontSize: '22px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle className="text-yellow-500" style={{ color: 'var(--warning)' }} size={24} />
              <span>{DISCLAIMER_TITLE}</span>
            </h2>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '12px', margin: '20px 0' }}>
              {DISCLAIMER_PARAGRAPHS.map((text) => <p key={text}>{text}</p>)}
              <p>
                By clicking &ldquo;{DISCLAIMER_ACCEPT_LABEL}&rdquo; you confirm you have read the above.
              </p>
            </div>
            <button className="btn-primary" data-autofocus onClick={acceptDisclaimer} style={{ width: '100%', marginTop: '10px' }}>
              {DISCLAIMER_ACCEPT_LABEL}
            </button>
        </ModalShell>
      )}

      {/* The same text, reopened on demand. Same DISCLAIMER_PARAGRAPHS
          source as the modal above, so what someone re-reads is what they
          actually agreed to and not a restatement that drifted. Closes
          rather than re-accepts — see the showDisclaimerReview comment. */}
      {showDisclaimerReview && (
        <ModalShell onClose={() => setShowDisclaimerReview(false)} labelledBy="disclaimer-review-title">
            <h2 id="disclaimer-review-title" style={{ fontSize: '22px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle style={{ color: 'var(--warning)' }} size={24} />
              <span>{DISCLAIMER_TITLE}</span>
            </h2>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '12px', margin: '20px 0' }}>
              {DISCLAIMER_PARAGRAPHS.map((text) => <p key={text}>{text}</p>)}
            </div>
            <button className="btn-primary" onClick={() => setShowDisclaimerReview(false)} style={{ width: '100%', marginTop: '10px' }}>
              Close
            </button>
        </ModalShell>
      )}

      {/* Suggested changes (the Dashboard's "Suggest changes" button).
          A proposal only: every field that would change, before and after,
          and nothing is written until Apply. Apply keeps the exact previous
          plan for an Undo on the Dashboard for the rest of the session. */}
      {calibrationResults && (
        <ModalShell
          onClose={() => setCalibrationResults(null)}
          labelledBy="calibration-title"
          describedBy="calibration-intro"
          style={{ maxWidth: '600px', width: '100%' }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '12px' }}>
              <h2 id="calibration-title" style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Suggested changes</h2>
              <button
                aria-label="Close"
                onClick={() => setCalibrationResults(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>
              <p id="calibration-intro" style={{ lineHeight: '1.5', margin: 0 }}>
                {calibrationResults.changes.length === 0
                  ? 'No changes to suggest: these starting points are what the plan already has.'
                  : calibrationResults.isSuccessful
                    ? 'Suggested changes that make the plan last with average returns. Nothing in your plan changes unless you apply them.'
                    : 'Suggested changes to spending, savings and retirement timing. Nothing in your plan changes unless you apply them.'}
              </p>

              {calibrationResults.changes.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                        <th scope="col" style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--text-muted)' }}>Setting</th>
                        <th scope="col" style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--text-muted)' }}>Now</th>
                        <th scope="col" style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--text-muted)' }}>Suggested</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calibrationResults.changes.map((c) => {
                        const show = (v) => (c.kind === 'age' ? `Age ${v}` : `${formatCurrency(Number(v) || 0)} / yr`);
                        return (
                          <tr key={c.key} style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <th scope="row" style={{ textAlign: 'left', padding: '8px 4px', fontWeight: '500', color: 'var(--text-primary)' }}>{c.label}</th>
                            <td style={{ padding: '8px 4px', textAlign: 'right' }}>{show(c.from)}</td>
                            <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: '700', color: 'var(--text-primary)' }}>{show(c.to)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {calibrationResults.changes.length > 0 && (
                <p style={{ margin: 0, lineHeight: '1.5' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {calibrationResults.isSuccessful
                      ? 'With these changes, the money lasts through the plan with average returns.'
                      : 'Even with these changes, the plan runs short with average returns.'}
                  </strong>{' '}
                  How they are picked: spending starts at 75% of household salary (4% of savings when there is no
                  salary), savings at 10% of salary; then retirement and Social Security claiming move later a year
                  at a time up to 70, and spending comes down if it is still short.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: '20px' }}>
              <button className="btn-outline" data-autofocus onClick={() => setCalibrationResults(null)}>
                Cancel
              </button>
              {calibrationResults.changes.length > 0 && (
                <button className="btn-primary" onClick={applyCalibration}>
                  Apply these changes
                </button>
              )}
            </div>
        </ModalShell>
      )}

      {/* Step-by-Step Onboarding Setup Wizard.
          Gated on !showDisclaimer: both modals default to open on a first
          visit (neither localStorage flag is set yet), and this wizard's
          overlay is deliberately z-indexed above other modals (1100 vs the
          disclaimer's 100) so it stays on top of things like the calibration
          results modal. Without this gate it also paints over the mandatory
          legal disclaimer and captures every click, making "I understand and
          Accept" unreachable until the wizard is dismissed. Requiring the
          disclaimer to be accepted first restores the intended order. */}
      {showOnboarding && !showDisclaimer && (
        <ModalShell
          zIndex={1100}
          closeOnBackdrop={false}
          labelledBy="onboarding-title"
          onClose={() => {
            localStorage.setItem('retire_plan_onboarding_completed', 'true');
            setShowOnboarding(false);
          }}
          style={{ maxWidth: '600px', border: '1px solid rgba(42, 127, 122, 0.3)', padding: '28px' }}
        >
            {/* Header with Progress Bar */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '12px', flexWrap: 'wrap' }}>
                <span id="onboarding-title" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-text)' }}>
                  {onboardingStep === 0 ? "Let's Get Started" : `Interactive Setup Wizard — Step ${onboardingStep} of 6`}
                </span>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <button 
                    onClick={() => setLargeTextMode(!largeTextMode)} 
                    className="btn-outline" 
                    style={{ padding: '4px 8px', fontSize: 'var(--fs-sm)', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Type size={14} /> {largeTextMode ? 'Standard Text' : 'Large Text'}
                  </button>
                  <button 
                    aria-label="Close"
                    onClick={() => {
                      localStorage.setItem('retire_plan_onboarding_completed', 'true');
                      setShowOnboarding(false);
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--bg-secondary)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${onboardingStep * 16.6}%`, height: '100%', backgroundColor: 'var(--accent-primary)', transition: 'width 0.3s ease-in-out' }}></div>
              </div>
            </div>

            {/* Step 0: First-entry choice screen -- only reachable via the
                automatic first-visit trigger (see onboardingStep's own
                initializer above), never via the sidebar's "Interactive
                Setup Wizard" button, which explicitly requests the Quick
                Setup path and jumps straight to Step 1. */}
            {onboardingStep === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Welcome to {BRAND_NAME}!</h3>
                <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                  How would you like to start? Every door leads to the exact same plan, so you can always switch approaches later — nothing you enter is ever lost.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginTop: '4px' }}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setOnboardingStep(1)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOnboardingStep(1); } }}
                    style={{ padding: '20px', borderRadius: '12px', border: '2px solid var(--accent-primary)', background: 'rgba(78,130,195,0.10)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'all 0.2s ease' }}
                  >
                    <Zap size={22} style={{ color: 'var(--accent-text)' }} />
                    <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Quick Setup Wizard</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent-text)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>~2 minutes</div>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                      A fast, 6-step pass — ages, income, balances, spending, and savings rate. Get a baseline plan on screen right away.
                    </p>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { localStorage.setItem('retire_plan_onboarding_completed', 'true'); setShowOnboarding(false); setActiveTab('interview'); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); localStorage.setItem('retire_plan_onboarding_completed', 'true'); setShowOnboarding(false); setActiveTab('interview'); } }}
                    style={{ padding: '20px', borderRadius: '12px', border: '2px solid var(--card-border)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'all 0.2s ease' }}
                  >
                    <Sparkles size={22} style={{ color: 'var(--accent-text)' }} />
                    <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Full Guided Interview</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comprehensive</div>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                      A thorough, section-by-section walkthrough of every planning decision — taxes, Roth conversions, long-term care, estate planning, and more. Skips anything that doesn't apply to you.
                    </p>
                  </div>
                  {/* Third door: explore before entering anything. Marks
                      onboarding complete FIRST so the wizard doesn't
                      re-trigger over the demo after the reload (the
                      completed flag is deliberately not part of backups or
                      the demo snapshot, so it survives enter AND exit).
                      demoMode.js snapshots the starter plan and restores
                      it on exit, so this is fully reversible. */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { localStorage.setItem('retire_plan_onboarding_completed', 'true'); enterDemoMode(); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); localStorage.setItem('retire_plan_onboarding_completed', 'true'); enterDemoMode(); } }}
                    style={{ padding: '20px', borderRadius: '12px', border: '2px solid var(--card-border)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'all 0.2s ease' }}
                  >
                    <FlaskConical size={22} style={{ color: 'var(--accent-text)' }} />
                    <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Explore the Demo First</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>No typing required</div>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                      Load a complete fictional household — Sam &amp; Riley Carter — and see every feature working with realistic numbers. Exit any time from the top banner; your fresh plan will be waiting, and the Setup Wizard is always available in Preferences.
                    </p>
                  </div>
                  {/* Fourth card (was a lone button below the grid, which
                      left an unbalanced empty cell — the owner's call): skipping
                      is a first-class choice, presented with the same
                      weight as the other three doors. */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { localStorage.setItem('retire_plan_onboarding_completed', 'true'); setShowOnboarding(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); localStorage.setItem('retire_plan_onboarding_completed', 'true'); setShowOnboarding(false); } }}
                    style={{ padding: '20px', borderRadius: '12px', border: '2px solid var(--card-border)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'all 0.2s ease' }}
                  >
                    <Settings size={22} style={{ color: 'var(--text-secondary)' }} />
                    <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Skip — I'll Set It Up Myself</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Straight to the app</div>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                      Jump right in with a neutral starter plan and enter your numbers at your own pace. The wizard, the interview, and the demo all stay one click away if you change your mind.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Steps 1-5 (changelog 257): the Plan's own sections, shown at
                the wizard's density. Each step names the handful of keys
                a first pass needs and <GuidedSection only> hides everything
                else in that section, so the fields exist in one place
                (src/components/plan/sections) and this modal owns none. The
                suggestion boxes below are the wizard's own: they write a
                figure the person accepts, they are not a second copy of a
                field. */}
            {onboardingStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Tell us about yourself</h3>
                <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: '1.4', margin: 0 }}>
                  Let's start with basic milestones: your name, birth year, and planned retirement age.
                </p>
                <GuidedSection only={WIZARD_FIELDS.household}><DemographicsSection /></GuidedSection>
              </div>
            )}

            {onboardingStep === 2 && (() => {
              const estimateSS = (salary) => Math.min(45000, Math.round((Number(salary) || 0) * 0.32));
              const ssEstimate1 = estimateSS(inputs.salary1);
              const ssEstimate2 = inputs.spouse2Enabled ? estimateSS(inputs.salary2) : 0;
              return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Pre-Retirement Income & Social Security</h3>
                <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: '1.4', margin: 0 }}>
                  Enter your current working income, then the Social Security benefit at full retirement age from your statement on <a href="https://www.ssa.gov" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)' }}>ssa.gov</a>. No statement handy? Use the estimate below.
                </p>
                <GuidedSection only={WIZARD_FIELDS.salaries}><SalariesSection /></GuidedSection>
                <GuidedSection only={WIZARD_FIELDS.income}><SocialSecuritySection forceOpen /><AnnuitiesPensionsSection forceOpen /></GuidedSection>
                {ssEstimate1 > 0 && (
                  <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)', fontSize: 'var(--fs-sm)' }}>
                    <Lightbulb size={14} style={{ verticalAlign: '-2px', color: 'var(--accent-text)' }} /> <strong>Rough Social Security estimate:</strong> about 32% of salary, capped at $45,000 — {formatCurrency(ssEstimate1)}/yr for {inputs.spouse1Name || 'Primary'}{inputs.spouse2Enabled ? ` and ${formatCurrency(ssEstimate2)}/yr for ${inputs.spouse2Name || 'Spouse'}` : ''}. Your SSA statement is better.
                    <button
                      onClick={() => {
                        updateInput('ss1', ssEstimate1);
                        if (inputs.spouse2Enabled) updateInput('ss2', ssEstimate2);
                      }}
                      className="btn-outline"
                      style={{ padding: '4px 10px', fontSize: 'var(--fs-xs)', marginTop: '8px', display: 'block' }}
                    >
                      Use the estimate
                    </button>
                  </div>
                )}
              </div>
              );
            })()}

            {onboardingStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Current Savings (Nest Egg)</h3>
                <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: '1.4', margin: 0 }}>
                  Enter the approximate balances you currently have saved. Enter 0 if you're just starting out—it's okay to start from scratch!
                </p>
                <GuidedSection only={WIZARD_FIELDS.balances}><InitialBalancesSection /></GuidedSection>
              </div>
            )}

            {onboardingStep === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Retirement Lifestyle spending</h3>
                <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: '1.4', margin: 0 }}>
                  What is your target spending in retirement? A common starting point is 70% to 80% of your pre-retirement working salary. Replace it with your own figure. Want to build it up month by month instead? Use the Spending step of Plan (Guided).
                </p>
                <GuidedSection only={WIZARD_FIELDS.spending}><RetirementSpendSection /></GuidedSection>
                {(() => {
                  const totalSalary = (Number(inputs.salary1) || 0) + (inputs.spouse2Enabled ? (Number(inputs.salary2) || 0) : 0);
                  const suggestedExpense = totalSalary > 0 ? Math.round(totalSalary * 0.75) : 48000;
                  return (
                    <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)', fontSize: 'var(--fs-sm)' }}>
                      <Lightbulb size={14} style={{ verticalAlign: '-2px', color: 'var(--accent-text)' }} /> <strong>A common starting point:</strong> many retirement rules of thumb begin at about 75% of pre-retirement income. For an income of {formatCurrency(totalSalary)}, that is <strong>{formatCurrency(suggestedExpense)}</strong>. Your own spending is the better guide if you know it.
                      <button
                        onClick={() => updateInput('lifestyleExpense', suggestedExpense)}
                        className="btn-outline"
                        style={{ padding: '4px 10px', fontSize: 'var(--fs-xs)', marginTop: '8px', display: 'block' }}
                      >
                        Use 75%: {formatCurrency(suggestedExpense)}
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

            {onboardingStep === 5 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Savings Rate & Contributions</h3>
                <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: '1.4', margin: 0 }}>
                  How much are you planning to save each year while you work? A common rule of thumb is 10% of household income; enter what you actually expect to save.
                </p>
                <GuidedSection only={WIZARD_FIELDS.savings}><ContributionsSection /></GuidedSection>
                {(() => {
                  const totalSalary = (Number(inputs.salary1) || 0) + (inputs.spouse2Enabled ? (Number(inputs.salary2) || 0) : 0);
                  if (!(totalSalary > 0)) return null;
                  const suggestedSavings = Math.round(totalSalary * 0.10);
                  const spouseCount = inputs.spouse2Enabled ? 2 : 1;
                  // 60/20/20 across pre-tax, Roth and taxable, the per-spouse
                  // shares split evenly; the fields above show the result
                  // and take any correction.
                  const eachPreTax = Math.round(suggestedSavings * 0.6 / spouseCount);
                  const eachRoth = Math.round(suggestedSavings * 0.2 / spouseCount);
                  const suggestedTaxable = Math.round(suggestedSavings * 0.2);
                  return (
                    <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)', fontSize: 'var(--fs-sm)' }}>
                      <Lightbulb size={14} style={{ verticalAlign: '-2px', color: 'var(--accent-text)' }} /> <strong>The 10% rule of thumb:</strong> 10% of your income is <strong>{formatCurrency(suggestedSavings)} / year</strong> — 60% pre-tax, 20% Roth, 20% taxable{inputs.spouse2Enabled ? ', split evenly between you' : ''}.
                      <button
                        onClick={() => {
                          updateInput('preTaxContribution1', eachPreTax);
                          updateInput('rothContribution1', eachRoth);
                          if (inputs.spouse2Enabled) {
                            updateInput('preTaxContribution2', eachPreTax);
                            updateInput('rothContribution2', eachRoth);
                          }
                          updateInput('taxableContribution', suggestedTaxable);
                        }}
                        className="btn-outline"
                        style={{ padding: '4px 10px', fontSize: 'var(--fs-xs)', marginTop: '8px', display: 'block' }}
                      >
                        Use 10%: {formatCurrency(suggestedSavings)} / yr
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

            {onboardingStep === 6 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Quick Tour: How to use the app</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                  You are all set. Here is where things live in the sidebar:
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginTop: '8px' }}>
                  <div className="glass-panel" style={{ padding: '12px', borderLeft: '4px solid var(--accent-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', marginBottom: '4px' }}>
                      <Settings size={14} style={{ color: 'var(--accent-text)' }}/> Plan
                    </div>
                    <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>Every input: income, savings, balances, spending, taxes and life events. You just filled in the essentials; Ctrl+K (Cmd+K on a Mac) finds any setting by name.</span>
                  </div>
                  
                  <div className="glass-panel" style={{ padding: '12px', borderLeft: '4px solid var(--success)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', marginBottom: '4px' }}>
                      <TrendingUp size={14} style={{ color: 'var(--success)' }}/> Dashboard and Year by Year
                    </div>
                    <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>The headline figures and the portfolio chart, then every year in detail, including the cash-flow map.</span>
                  </div>

                  <div className="glass-panel" style={{ padding: '12px', borderLeft: '4px solid var(--accent-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', marginBottom: '4px' }}>
                      <CheckCircle size={14} style={{ color: 'var(--accent-text)' }}/> Retirement Readiness
                    </div>
                    <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>Straight answers to the big questions: could you walk away now, what a market drop does, and the earliest age that works.</span>
                  </div>

                  <div className="glass-panel" style={{ padding: '12px', borderLeft: '4px solid var(--warning)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', marginBottom: '4px' }}>
                      <Trophy size={14} style={{ color: 'var(--warning)' }}/> Explore more
                    </div>
                    <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>Optimizers, Risk &amp; Stress, Tax &amp; Estate, Scenarios, What Will You Do? and Preferences, one click below the main entries.</span>
                  </div>
                </div>
              </div>
            )}

            {/* Footer Buttons -- the Step 0 choice screen above has its own
                self-contained "Skip" button and card clicks, so this
                Back/Next/Generate footer only applies to the Quick Setup
                steps (1-6). */}
            {onboardingStep > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '28px', borderTop: '1px solid var(--card-border)', paddingTop: '20px' }}>
              {onboardingStep === 1 ? (
                <button 
                  onClick={() => {
                    localStorage.setItem('retire_plan_onboarding_completed', 'true');
                    setShowOnboarding(false);
                  }}
                  className="btn-outline"
                >
                  Skip Wizard (Use Defaults)
                </button>
              ) : (
                <button 
                  onClick={() => setOnboardingStep(prev => prev - 1)}
                  className="btn-outline"
                >
                  Back
                </button>
              )}

              {onboardingStep < 6 ? (
                <button 
                  onClick={() => setOnboardingStep(prev => prev + 1)}
                  className="btn-primary"
                  style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)', border: 'none' }}
                >
                  Next Step
                </button>
              ) : (
                <button 
                  onClick={() => {
                    localStorage.setItem('retire_plan_onboarding_completed', 'true');
                    setShowOnboarding(false);
                  }}
                  className="btn-primary animate-pulse"
                  style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)', border: 'none', fontWeight: '700' }}
                >
                  Generate My Plan!
                </button>
              )}
            </div>
            )}
        </ModalShell>
      )}

      {/* Maximized Component Modal Overlay */}
      {['growthChart', 'waterfall', 'ssHeatmap', 'taxVisualizer', 'monteCarlo', 'ageFinder', 'dieWithZero', 'estateLegacy'].includes(maximizedComponent) && (
        <ModalShell
          zIndex={1200}
          onClose={() => setMaximizedComponent(null)}
          labelledBy="maximized-title"
          className="modal-content maximized-chart-modal"
          style={{
            width: '95vw',
            maxWidth: '1200px',
            height: '85vh',
            maxHeight: '800px',
            display: 'flex',
            flexDirection: 'column',
            padding: '24px',
            border: '1px solid var(--card-border)',
          }}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--card-border)', paddingBottom: '12px' }}>
              <div style={{ minWidth: 0 }}>
                <h2 id="maximized-title" style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                  {maximizedComponent === 'growthChart' && 'Portfolio Projection Horizon'}
                  {maximizedComponent === 'waterfall' && 'Annual Cash Flow Waterfall'}
                  {maximizedComponent === 'ssHeatmap' && 'Social Security Claiming Age Matrix'}
                  {maximizedComponent === 'taxVisualizer' && 'Year-by-Year Income Stack vs Brackets'}
                  {maximizedComponent === 'monteCarlo' && 'Percentile Horizon Curves (Monte Carlo)'}
                  {maximizedComponent === 'ageFinder' && 'Optimal Retirement Age Finder'}
                  {maximizedComponent === 'dieWithZero' && 'Die with Zero Trajectory'}
                  {maximizedComponent === 'estateLegacy' && 'Gross Legacy vs. Net Heir Inheritance'}
                </h2>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  {maximizedComponent === 'growthChart' && 'Stacked growth of Pre-Tax, Roth, and Taxable Brokerage accounts'}
                  {maximizedComponent === 'waterfall' && 'Interactive flow map of gross household inflows splitting into taxes, savings, expenses, and surplus'}
                  {maximizedComponent === 'ssHeatmap' && 'Optimize claiming combinations (from age 62 to 70) for both spouses.'}
                  {maximizedComponent === 'taxVisualizer' && 'Inspect progressive tax filing lines and brackets across your retirement timeline'}
                  {maximizedComponent === 'monteCarlo' && 'Probability ranges representing the best (p90), median (p50), and worst-case (p10) legacy paths'}
                  {maximizedComponent === 'ageFinder' && 'Simulate all possible retirement ages to find the earliest successful combination'}
                  {maximizedComponent === 'dieWithZero' && 'Identify maximum allowable spending to reach $0 balance at life expectancy'}
                  {maximizedComponent === 'estateLegacy' && 'Evaluate the tax drag of different inherited account types on your beneficiaries'}
                </p>
              </div>
              <MaximizeButton target={maximizedComponent} current={maximizedComponent} setMaximizedComponent={setMaximizedComponent} />
            </div>

            {/* Maximized content container */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative', width: '100%', display: 'flex', flexDirection: 'column' }}>
              
              {/* 1. Growth Chart */}
              {maximizedComponent === 'growthChart' && (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label htmlFor={growthChartTaxesOverlayId} style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Overlay Taxes Paid</label>
                    <span className="custom-switch">
                      <input id={growthChartTaxesOverlayId} type="checkbox" checked={taxesOverlay} onChange={(e) => setTaxesOverlay(e.target.checked)} />
                      <span className="slider-round"></span>
                    </span>
                    <label htmlFor={growthChartLifestyleOverlayId} style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', cursor: 'pointer', marginLeft: '12px' }}>Overlay Lifestyle Spending</label>
                    <span className="custom-switch">
                      <input id={growthChartLifestyleOverlayId} type="checkbox" checked={lifestyleOverlay} onChange={(e) => setLifestyleOverlay(e.target.checked)} />
                      <span className="slider-round"></span>
                    </span>
                  </div>
                  <div style={{ flex: 1, minHeight: '350px' }}>
                    <React.Suspense fallback={<ChartFallback />}>
                      <AssetGrowthChart 
                        chartHeight={Math.max(350, Math.min(800, Math.round(window.innerHeight * 0.85)) - 250)}
                        data={projection.years}
                        range={growthRange(monteCarloShown, mcRange, inputs)}
                        inputs={inputs}
                        taxesOverlay={taxesOverlay}
                        lifestyleOverlay={lifestyleOverlay}
                        formatCurrency={formatCurrency}
                        onYearSelect={(year) => {
                          setWaterfallYear(year);
                          setWaterfallPlaying(false);
                        }}
                      />
                    </React.Suspense>
                  </div>
                  <p className="chart-summary">{growthSummary(projection.years, growthRange(monteCarloShown, mcRange, inputs))}</p>
                </div>
              )}

              {/* 2. Cash Flow Waterfall */}
              {maximizedComponent === 'waterfall' && (() => {
                const activeYearData = projection.years.find(y => y.year === waterfallYear) || projection.years[0];
                if (!activeYearData) return <ChartFallback />;

                const minYear = projection.years[0]?.year || 2026;
                const maxYear = projection.years[projection.years.length - 1]?.year || 2066;

                const salaryVal = activeYearData.salary || 0;
                const fixedVal = activeYearData.fixedInflows || 0;
                const drawdownVal = activeYearData.drawdown || 0;
                const totalInflowVal = salaryVal + fixedVal + drawdownVal;

                const lifestyleVal = activeYearData.lifestyleExpenses || 0;
                const taxVal = activeYearData.totalTaxesPaid || 0;
                const healthcareVal = (activeYearData.healthcareBridge || 0) + (activeYearData.irmaaCost || 0) + (activeYearData.ltcCost || 0);
                const savingsVal = activeYearData.totalContributions || 0;
                const surplusVal = Math.max(0, totalInflowVal - (lifestyleVal + taxVal + healthcareVal + savingsVal));

                const hoverDetails = {
                  salary: { title: "Salary, Stock Vesting and Deferred Comp", amount: salaryVal, color: "var(--success)" },
                  fixedInflows: { title: "Passive & Fixed Inflows", amount: fixedVal, color: "#6366f1" },
                  drawdown: { title: "Portfolio Drawdowns", amount: drawdownVal, color: "var(--accent-text)" },
                  center: { title: "Household Budget Hub", amount: totalInflowVal, color: "var(--text-primary)" },
                  lifestyleExpenses: { title: "Lifestyle Spending", amount: lifestyleVal, color: "var(--series-2)" },
                  totalTaxesPaid: { title: "Taxes Paid", amount: taxVal, color: "var(--warning)" },
                  healthcare: { title: "Healthcare & Medicare", amount: healthcareVal, color: "#f97316" },
                  totalContributions: { title: "Savings Contributions", amount: savingsVal, color: "#06b6d4" },
                  surplus: { title: "Surplus cash", amount: surplusVal, color: "var(--success)" }
                };

                const activeDetails = hoveredWaterfallNode ? hoverDetails[hoveredWaterfallNode] : hoverDetails['center'];

                const getPathStyle = (nodeKey, activeColor) => {
                  const isHovered = hoveredWaterfallNode === nodeKey;
                  const isAnyHovered = hoveredWaterfallNode !== null;
                  return {
                    stroke: isHovered ? activeColor : 'rgba(255,255,255,0.05)',
                    strokeWidth: isHovered ? 4 : 2,
                    strokeDasharray: isHovered ? 'none' : '5, 5',
                    opacity: isHovered ? 1 : (isAnyHovered ? 0.15 : 0.6),
                    style: { transition: 'all 0.25s ease' }
                  };
                };

                const getBlockStyle = (nodeKey, activeColor, hasValue) => {
                  const isHovered = hoveredWaterfallNode === nodeKey;
                  const isAnyHovered = hoveredWaterfallNode !== null;
                  if (!hasValue) {
                    return {
                      fill: 'rgba(255,255,255,0.02)',
                      stroke: 'rgba(255,255,255,0.05)',
                      strokeDasharray: '3, 3',
                      opacity: isAnyHovered ? (isHovered ? 1 : 0.3) : 0.45,
                      style: { transition: 'all 0.25s ease' }
                    };
                  }
                  return {
                    fill: 'var(--bg-secondary)',
                    stroke: isHovered ? activeColor : 'var(--card-border)',
                    strokeWidth: isHovered ? 2 : 1,
                    opacity: isHovered ? 1 : (isAnyHovered ? 0.35 : 1),
                    style: {
                      transition: 'all 0.25s ease',
                      filter: isHovered ? 'url(#waterfall-glow)' : 'none'
                    }
                  };
                };

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
                    {/* Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <button 
                        className="btn-outline"
                        onClick={() => setWaterfallPlaying(!waterfallPlaying)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: 'var(--fs-body)' }}
                      >
                        {waterfallPlaying ? <Pause size={12} /> : <Play size={12} />}
                        <span>{waterfallPlaying ? 'Pause Autoplay' : 'Autoplay Projections'}</span>
                      </button>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '3px 8px' }}>
                        <button 
                          onClick={() => { setWaterfallYear(prev => Math.max(minYear, prev - 1)); setWaterfallPlaying(false); }}
                          disabled={waterfallYear <= minYear}
                          style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', opacity: waterfallYear <= minYear ? 0.3 : 1, fontSize: 'var(--fs-body)', fontWeight: 'bold' }}
                        >
                          &lt;
                        </button>
                        <span style={{ fontSize: 'var(--fs-body)', fontWeight: '700', minWidth: '70px', textAlign: 'center', fontFamily: 'var(--font-heading)' }}>
                          Year {waterfallYear}
                        </span>
                        <button 
                          onClick={() => { setWaterfallYear(prev => Math.min(maxYear, prev + 1)); setWaterfallPlaying(false); }}
                          disabled={waterfallYear >= maxYear}
                          style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', opacity: waterfallYear >= maxYear ? 0.3 : 1, fontSize: 'var(--fs-body)', fontWeight: 'bold' }}
                        >
                          &gt;
                        </button>
                      </div>
                      <div style={{ fontSize: 'var(--fs-body)', fontWeight: '600', color: 'var(--accent-text)', marginLeft: '10px' }}>
                        Ages: {inputs.spouse1Name || 'Primary'}: {activeYearData.age1 !== null ? activeYearData.age1 : '†'}
                        {inputs.spouse2Enabled && ` / ${inputs.spouse2Name || 'Spouse'}: ${activeYearData.age2 !== null ? activeYearData.age2 : '†'}`}
                        {` (${activeYearData.isRetired ? 'Retired' : 'Working'})`}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', flex: 1, minHeight: 0 }}>
                      {waterfallViewMode === 'sankey' ? (
                        <div style={{ width: '100%', height: '100%', padding: '10px' }}>
                          <React.Suspense fallback={<ChartFallback />}>
                            <CashFlowSankeyChart 
                              yearData={activeYearData} 
                              formatCurrency={formatCurrency} 
                            />
                          </React.Suspense>
                        </div>
                      ) : (
                      <div style={{ border: '1px solid var(--card-border)', borderRadius: '12px', padding: '16px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
                        <svg viewBox="0 0 800 450" style={{ width: '100%', height: '100%', maxHeight: '420px', background: 'transparent' }}>
                          <defs>
                            <filter id="waterfall-glow" x="-20%" y="-20%" width="140%" height="140%">
                              <feGaussianBlur stdDeviation="5" result="blur" />
                              <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                          </defs>
                          
                          {/* Connection paths */}
                          {salaryVal > 0 && <path d="M 210,90 C 290,90 290,225 348,225" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
                          {fixedVal > 0 && <path d="M 210,225 C 290,225 290,225 348,225" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
                          {drawdownVal > 0 && <path d="M 210,360 C 290,360 290,225 348,225" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
                          
                          {lifestyleVal > 0 && <path d="M 452,225 C 510,225 510,50 590,50" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
                          {taxVal > 0 && <path d="M 452,225 C 510,225 510,138 590,138" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
                          {healthcareVal > 0 && <path d="M 452,225 C 510,225 510,225 590,225" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
                          {savingsVal > 0 && <path d="M 452,225 C 510,225 510,312 590,312" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
                          {surplusVal > 0 && <path d="M 452,225 C 510,225 510,400 590,400" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="6" />}
                          
                          {salaryVal > 0 && <path d="M 210,90 C 290,90 290,225 348,225" fill="none" {...getPathStyle('salary', 'var(--success)')} />}
                          {fixedVal > 0 && <path d="M 210,225 C 290,225 290,225 348,225" fill="none" {...getPathStyle('fixedInflows', '#6366f1')} />}
                          {drawdownVal > 0 && <path d="M 210,360 C 290,360 290,225 348,225" fill="none" {...getPathStyle('drawdown', 'var(--series-3)')} />}
                          
                          {lifestyleVal > 0 && <path d="M 452,225 C 510,225 510,50 590,50" fill="none" {...getPathStyle('lifestyleExpenses', 'var(--series-2)')} />}
                          {taxVal > 0 && <path d="M 452,225 C 510,225 510,138 590,138" fill="none" {...getPathStyle('totalTaxesPaid', 'var(--warning)')} />}
                          {healthcareVal > 0 && <path d="M 452,225 C 510,225 510,225 590,225" fill="none" {...getPathStyle('healthcare', '#f97316')} />}
                          {savingsVal > 0 && <path d="M 452,225 C 510,225 510,312 590,312" fill="none" {...getPathStyle('totalContributions', '#06b6d4')} />}
                          {surplusVal > 0 && <path d="M 452,225 C 510,225 510,400 590,400" fill="none" {...getPathStyle('surplus', 'var(--success)')} />}

                          {/* Nodes */}
                          <g onMouseEnter={() => setHoveredWaterfallNode('salary')} onMouseLeave={() => setHoveredWaterfallNode(null)} style={{ cursor: 'pointer' }}>
                            <rect x="30" y="63" width="180" height="54" rx="8" {...getBlockStyle('salary', 'var(--success)', salaryVal > 0)} />
                            <text x="120" y="85" textAnchor="middle" fontSize="11px" fontWeight="500" fill={salaryVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Pay, Stock &amp; Comp</text>
                            <text x="120" y="103" textAnchor="middle" fontSize="14px" fontWeight="700" fill={salaryVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{salaryVal > 0 ? formatCurrency(salaryVal) : '—'}</text>
                          </g>
                          <g onMouseEnter={() => setHoveredWaterfallNode('fixedInflows')} onMouseLeave={() => setHoveredWaterfallNode(null)} style={{ cursor: 'pointer' }}>
                            <rect x="30" y="198" width="180" height="54" rx="8" {...getBlockStyle('fixedInflows', '#6366f1', fixedVal > 0)} />
                            <text x="120" y="220" textAnchor="middle" fontSize="11px" fontWeight="500" fill={fixedVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Passive & Fixed Inflow</text>
                            <text x="120" y="238" textAnchor="middle" fontSize="14px" fontWeight="700" fill={fixedVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{fixedVal > 0 ? formatCurrency(fixedVal) : '—'}</text>
                          </g>
                          <g onMouseEnter={() => setHoveredWaterfallNode('drawdown')} onMouseLeave={() => setHoveredWaterfallNode(null)} style={{ cursor: 'pointer' }}>
                            <rect x="30" y="333" width="180" height="54" rx="8" {...getBlockStyle('drawdown', 'var(--series-3)', drawdownVal > 0)} />
                            <text x="120" y="355" textAnchor="middle" fontSize="11px" fontWeight="500" fill={drawdownVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Portfolio Drawdown</text>
                            <text x="120" y="373" textAnchor="middle" fontSize="14px" fontWeight="700" fill={drawdownVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{drawdownVal > 0 ? formatCurrency(drawdownVal) : '—'}</text>
                          </g>

                          <g onMouseEnter={() => setHoveredWaterfallNode('center')} onMouseLeave={() => setHoveredWaterfallNode(null)} style={{ cursor: 'pointer' }}>
                            <circle cx="400" cy="225" r="52" {...getBlockStyle('center', 'var(--accent-primary)', true)} />
                            <text x="400" y="212" textAnchor="middle" fontSize="10px" fontWeight="600" fill="var(--text-muted)" letterSpacing="0.05em">BUDGET HUB</text>
                            <text x="400" y="230" textAnchor="middle" fontSize="14px" fontWeight="800" fill="var(--text-primary)">{formatCurrency(totalInflowVal)}</text>
                            <text x="400" y="244" textAnchor="middle" fontSize="9px" fontWeight="500" fill="var(--accent-primary)" opacity="0.8">FLOW MIXER</text>
                          </g>

                          <g onMouseEnter={() => setHoveredWaterfallNode('lifestyleExpenses')} onMouseLeave={() => setHoveredWaterfallNode(null)} style={{ cursor: 'pointer' }}>
                            <rect x="590" y="23" width="180" height="54" rx="8" {...getBlockStyle('lifestyleExpenses', 'var(--series-2)', lifestyleVal > 0)} />
                            <text x="680" y="45" textAnchor="middle" fontSize="11px" fontWeight="500" fill={lifestyleVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Lifestyle Expenses</text>
                            <text x="680" y="63" textAnchor="middle" fontSize="14px" fontWeight="700" fill={lifestyleVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{lifestyleVal > 0 ? formatCurrency(lifestyleVal) : '—'}</text>
                          </g>
                          <g onMouseEnter={() => setHoveredWaterfallNode('totalTaxesPaid')} onMouseLeave={() => setHoveredWaterfallNode(null)} style={{ cursor: 'pointer' }}>
                            <rect x="590" y="111" width="180" height="54" rx="8" {...getBlockStyle('totalTaxesPaid', 'var(--warning)', taxVal > 0)} />
                            <text x="680" y="133" textAnchor="middle" fontSize="11px" fontWeight="500" fill={taxVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Taxes Paid</text>
                            <text x="680" y="151" textAnchor="middle" fontSize="14px" fontWeight="700" fill={taxVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{taxVal > 0 ? formatCurrency(taxVal) : '—'}</text>
                          </g>
                          <g onMouseEnter={() => setHoveredWaterfallNode('healthcare')} onMouseLeave={() => setHoveredWaterfallNode(null)} style={{ cursor: 'pointer' }}>
                            <rect x="590" y="198" width="180" height="54" rx="8" {...getBlockStyle('healthcare', '#f97316', healthcareVal > 0)} />
                            <text x="680" y="220" textAnchor="middle" fontSize="11px" fontWeight="500" fill={healthcareVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Healthcare & IRMAA</text>
                            <text x="680" y="238" textAnchor="middle" fontSize="14px" fontWeight="700" fill={healthcareVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{healthcareVal > 0 ? formatCurrency(healthcareVal) : '—'}</text>
                          </g>
                          <g onMouseEnter={() => setHoveredWaterfallNode('totalContributions')} onMouseLeave={() => setHoveredWaterfallNode(null)} style={{ cursor: 'pointer' }}>
                            <rect x="590" y="285" width="180" height="54" rx="8" {...getBlockStyle('totalContributions', '#06b6d4', savingsVal > 0)} />
                            <text x="680" y="307" textAnchor="middle" fontSize="11px" fontWeight="500" fill={savingsVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Portfolio Savings</text>
                            <text x="680" y="325" textAnchor="middle" fontSize="14px" fontWeight="700" fill={savingsVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{savingsVal > 0 ? formatCurrency(savingsVal) : '—'}</text>
                          </g>
                          <g onMouseEnter={() => setHoveredWaterfallNode('surplus')} onMouseLeave={() => setHoveredWaterfallNode(null)} style={{ cursor: 'pointer' }}>
                            <rect x="590" y="372" width="180" height="54" rx="8" {...getBlockStyle('surplus', 'var(--success)', surplusVal > 0)} />
                            <text x="680" y="394" textAnchor="middle" fontSize="11px" fontWeight="500" fill={surplusVal > 0 ? "var(--text-secondary)" : "var(--text-muted)"}>Cash Surplus</text>
                            <text x="680" y="412" textAnchor="middle" fontSize="14px" fontWeight="700" fill={surplusVal > 0 ? "var(--text-primary)" : "var(--text-muted)"}>{surplusVal > 0 ? formatCurrency(surplusVal) : '—'}</text>
                          </g>
                        </svg>
                      </div>
                    )}

                      {/* Detail Inspector Card */}
                      <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', boxSizing: 'border-box' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: activeDetails.color }}></div>
                          <h4 style={{ fontSize: 'var(--fs-body)', fontWeight: '700', margin: 0 }}>{activeDetails.title}</h4>
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: '800', margin: '4px 0', fontFamily: 'var(--font-heading)' }}>
                          {formatCurrency(activeDetails.amount)}
                        </div>
                        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                          {hoveredWaterfallNode ? activeDetails.desc : "Hover over any node block (such as Active Salary, Portfolio Drawdowns, Taxes Paid, or Healthcare) to audit detailed flow parameters."}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 3. SS Claiming Matrix Grid */}
              {maximizedComponent === 'ssHeatmap' && (() => {
                let minVal = Infinity;
                let maxVal = -Infinity;
                let optimalCell = null;

                for (const cell of ssClaimingHeatmapData) {
                  const val = ssHeatmapMetric === 'totalSS' ? cell.totalSS : cell.endingBalance;
                  if (val < minVal) minVal = val;
                  if (val > maxVal) {
                    maxVal = val;
                    optimalCell = cell;
                  }
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '220px' }}>
                        <label htmlFor="field-ssHeatmapMetric" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: '600' }}>Optimize Metric</label>
                        <select id="field-ssHeatmapMetric" className="form-input form-input-select" value={ssHeatmapMetric} onChange={(e) => setSsHeatmapMetric(e.target.value)} style={{ margin: 0 }}>
                          <option value="totalSS">Total Lifetime SS Benefits Received</option>
                          <option value="endingBalance">Ending Portfolio Legacy (Wealth)</option>
                        </select>
                      </div>
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                        {inputs.spouse2Enabled ? (
                          <span>
                            Rows: <AxisName axis="row">{inputs.spouse1Name || 'Primary'}</AxisName> claiming age | Columns: <AxisName axis="column">{inputs.spouse2Name || 'Spouse'}</AxisName> claiming age. Click cells to apply.
                          </span>
                        ) : (
                          'Click cells to select claiming age.'
                        )}
                      </div>
                    </div>

                    <div style={{ flex: 1, minHeight: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', border: '1px solid var(--card-border)', borderRadius: '12px', padding: '20px', backgroundColor: 'rgba(0,0,0,0.1)' }}>
                      {inputs.spouse2Enabled ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', maxWidth: '800px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '96px repeat(9, 1fr)', gap: '6px', textAlign: 'center' }}>
                            <ClaimingGridCorner rowName={inputs.spouse1Name || 'S1'} columnName={inputs.spouse2Name || 'S2'} />
                            {[62, 63, 64, 65, 66, 67, 68, 69, 70].map(age => (
                              <div key={age} style={{ fontSize: 'var(--fs-sm)', fontWeight: '700', padding: '6px 0', borderBottom: '2.5px solid var(--series-2)', color: 'var(--series-2-text)' }}>Age {age}</div>
                            ))}
                          </div>

                          {[62, 63, 64, 65, 66, 67, 68, 69, 70].map(age1 => (
                            <div key={age1} style={{ display: 'grid', gridTemplateColumns: '96px repeat(9, 1fr)', gap: '6px', alignItems: 'center' }}>
                              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '700', textAlign: 'right', paddingRight: '12px', borderRight: '2.5px solid var(--series-3)', color: 'var(--accent-text)' }}>Age {age1}</div>
                              {[62, 63, 64, 65, 66, 67, 68, 69, 70].map(age2 => {
                                const cell = ssClaimingHeatmapData.find(c => c.claimingAge1 === age1 && c.claimingAge2 === age2);
                                if (!cell) return <div key={age2} />;
                                const val = ssHeatmapMetric === 'totalSS' ? cell.totalSS : cell.endingBalance;
                                const range = maxVal - minVal;
                                const ratio = range > 0 ? (val - minVal) / range : 1.0;
                                const baseColor = ssHeatmapMetric === 'totalSS' ? '168, 85, 247' : '16, 185, 129';
                                const opacity = 0.08 + ratio * 0.72;
                                const cellBg = `rgba(${baseColor}, ${opacity})`;

                                const isCurrent = inputs.claimingAge1 === age1 && inputs.claimingAge2 === age2;
                                const isOptimal = optimalCell && optimalCell.claimingAge1 === age1 && optimalCell.claimingAge2 === age2;
                                let borderStyle = '1px solid var(--card-border)';
                                if (isCurrent) borderStyle = '2.5px solid var(--text-primary)';
                                else if (isOptimal) borderStyle = '1.5px dashed var(--accent-secondary)';

                                return (
                                  <div
                                    key={age2}
                                    onClick={() => {
                                      setSelectedHeatmapCell(cell);
                                      updateInput('claimingAge1', age1);
                                      updateInput('claimingAge2', age2);
                                    }}
                                    style={{
                                      height: '52px',
                                      backgroundColor: cellBg,
                                      border: borderStyle,
                                      borderRadius: '6px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease'
                                    }}
                                  >
                                    <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: '700', color: 'var(--text-primary)' }}>
                                      {formatCurrency(val / 1000)}k
                                    </span>
                                    {isOptimal && <span style={{ fontSize: '11px' }}><Star size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /></span>}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '8px', width: '100%', maxWidth: '650px' }}>
                          {[62, 63, 64, 65, 66, 67, 68, 69, 70].map(age1 => {
                            const cell = ssClaimingHeatmapData.find(c => c.claimingAge1 === age1);
                            if (!cell) return <div key={age1} />;
                            const val = ssHeatmapMetric === 'totalSS' ? cell.totalSS : cell.endingBalance;
                            const range = maxVal - minVal;
                            const ratio = range > 0 ? (val - minVal) / range : 1.0;
                            const baseColor = ssHeatmapMetric === 'totalSS' ? '168, 85, 247' : '16, 185, 129';
                            const opacity = 0.08 + ratio * 0.72;
                            const cellBg = `rgba(${baseColor}, ${opacity})`;

                            const isCurrent = inputs.claimingAge1 === age1;
                            const isOptimal = optimalCell && optimalCell.claimingAge1 === age1;
                            let borderStyle = '1px solid var(--card-border)';
                            if (isCurrent) borderStyle = '2.5px solid var(--text-primary)';
                            else if (isOptimal) borderStyle = '1.5px dashed var(--accent-secondary)';

                            return (
                              <div
                                key={age1}
                                onClick={() => {
                                  setSelectedHeatmapCell(cell);
                                  updateInput('claimingAge1', age1);
                                }}
                                style={{
                                  height: '75px',
                                  backgroundColor: cellBg,
                                  border: borderStyle,
                                  borderRadius: '8px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>Age {age1}</span>
                                <span style={{ fontSize: 'var(--fs-body)', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>
                                  {formatCurrency(val / 1000)}k
                                </span>
                                {isOptimal && <span style={{ fontSize: 'var(--fs-2xs)', marginTop: '2px' }}><Star size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> Optimal</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 4. Tax Bracket Chart */}
              {maximizedComponent === 'taxVisualizer' && (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Show Bracket Lines:</span>
                    {Object.keys(enabledTaxBrackets).map(key => {
                      const rateLabel = key.replace('limit', '') + '%';
                      return (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-sm)', cursor: 'pointer', userSelect: 'none' }}>
                          <input 
                            type="checkbox" 
                            checked={enabledTaxBrackets[key]} 
                            onChange={(e) => setEnabledTaxBrackets(prev => ({ ...prev, [key]: e.target.checked }))} 
                          />
                          <span>{rateLabel}</span>
                        </label>
                      );
                    })}

                    <div style={{ borderLeft: '1px solid var(--card-border)', height: '16px', margin: '0 8px' }}></div>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-sm)', cursor: 'pointer', userSelect: 'none', color: showIrmaa ? 'var(--success)' : 'var(--text-primary)' }}>
                      <input 
                        type="checkbox" 
                        checked={showIrmaa} 
                        onChange={(e) => setShowIrmaa(e.target.checked)} 
                      />
                      <span style={{ fontWeight: '600' }}>Medicare IRMAA Cliffs</span>
                    </label>
                  </div>

                  <div style={{ flex: 1, minHeight: '350px' }}>
                    <React.Suspense fallback={<ChartFallback />}>
                      <TaxBracketChart
                        data={taxVisualizerData}
                        enabledBrackets={enabledTaxBrackets}
                        showIrmaa={showIrmaa}
                        enabledIrmaaTiers={enabledIrmaaTiers}
                        formatCurrency={formatCurrency}
                        onYearSelect={(year) => {
                          setSelectedTaxYear(year);
                        }}
                      />
                    </React.Suspense>
                  </div>
                  <p className="chart-summary">{taxBracketSummary(taxVisualizerData)}</p>
                </div>
              )}

              {/* 5. Monte Carlo Probability */}
              {maximizedComponent === 'monteCarlo' && (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div className="glass-panel" style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>p90 Legacy (Top 10%)</span>
                      <strong style={{ display: 'block', fontSize: '16px', marginTop: '4px' }}>{formatCurrency(monteCarloShown.endingP90)}</strong>
                    </div>
                    <div className="glass-panel" style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>p50 Legacy (Median)</span>
                      <strong style={{ display: 'block', fontSize: '16px', marginTop: '4px' }}>{formatCurrency(monteCarloShown.endingP50)}</strong>
                    </div>
                    <div className="glass-panel" style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>p10 Legacy (Worst 10%)</span>
                      <strong style={{ display: 'block', fontSize: '16px', color: 'var(--error)', marginTop: '4px' }}>{formatCurrency(monteCarloShown.endingP10)}</strong>
                    </div>
                  </div>
                  <div style={{ flex: 1, minHeight: '350px' }}>
                    <React.Suspense fallback={<ChartFallback />}>
                      <MonteCarloChart 
                        data={monteCarloShown.growthCurves}
                        formatCurrency={formatCurrency}
                      />
                    </React.Suspense>
                  </div>
                  <p className="chart-summary">{monteCarloSummary(monteCarloShown.growthCurves, monteCarlo.successProbability)}</p>
                </div>
              )}

              {/* 6. Age Finder */}
              {maximizedComponent === 'ageFinder' && (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ flex: 1, minHeight: '350px' }}>
                    <React.Suspense fallback={<ChartFallback />}>
                      <AgeFinderChart
                        simulations={ageFinderResults.simulations}
                        activeAge={inputs.retireAge1}
                        earliestFundedAge={ageFinderResults.earliestFundedAge}
                        formatCurrency={formatCurrency}
                        onAgeSelect={(age) => {
                          updateInput('retireAge1', age);
                          if (inputs.spouse2Enabled) {
                            updateInput('retireAge2', spouse2RetireAgeMatching(inputs, age));
                          }
                        }}
                      />
                    </React.Suspense>
                  </div>
                </div>
              )}

              {/* 7. Die with Zero */}
              {maximizedComponent === 'dieWithZero' && (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ flex: 1, minHeight: '350px' }}>
                    <React.Suspense fallback={<ChartFallback />}>
                      <DieWithZeroChart 
                        data={dieWithZeroResults?.comparisonData || []}
                        formatCurrency={formatCurrency}
                      />
                    </React.Suspense>
                  </div>
                </div>
              )}

              {/* 8. Estate Legacy */}
              {maximizedComponent === 'estateLegacy' && (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ flex: 1, minHeight: '350px' }}>
                    <React.Suspense fallback={<ChartFallback />}>
                      <EstateLegacyChart 
                        data={estateChartData}
                        formatCurrency={formatCurrency}
                      />
                    </React.Suspense>
                  </div>
                  <p className="chart-summary">{estateSummary(estateChartData)}</p>
                </div>
              )}

            </div>
        </ModalShell>
      )}

      {/* The print dialog and planner packet (changelog 298). */}
      <PrintPacketLoader inputs={inputs} holdings={holdings} formatCurrency={formatCurrency} onHideNamesChange={setPrintHideNames} />

      {/* Hidden printable report container */}
      <div className="print-report-container">
        {/* The header repeats on every printed page (changelog 301). */}
        <PrintFrame note={useRealDollars ? 'Dollar figures in today’s dollars' : 'Dollar figures in future dollars'}>
        <ForeignYearsNotice inputs={inputs} />
        
        <div className="print-metric-grid">
          <div className="print-metric-card">
            <div className="label">Plan Success Rate</div>
            <div className="val" style={{ color: kpis.isSuccessful ? 'var(--success)' : 'var(--danger)' }}>
              {monteCarlo ? `${monteCarlo.successProbability.toFixed(0)}%` : kpis.isSuccessful ? 'Successful' : 'Shortfall'}
            </div>
          </div>
          <div className="print-metric-card">
            <div className="label">Ending Balance</div>
            <div className="val">{formatEnding(projection.endingBalance)}</div>
          </div>
          <div className="print-metric-card">
            <div className="label">Peak Portfolio Worth</div>
            <div className="val">{formatPeak(projection.peakPortfolioWorth)}</div>
          </div>
          <div className="print-metric-card">
            <div className="label">Retirement Ages</div>
            <div className="val">
              {inputs.retireAge1} {inputs.spouse2Enabled ? `/ ${inputs.retireAge2}` : ''}
            </div>
          </div>
        </div>

        {/* Retirement Readiness -- the six questions as six sentences,
            from the same utilities the Readiness tab uses (changelog 253),
            computed at print time (see printReadiness above). The horizon
            line beneath is the Readiness tab's own, from the SSA table. */}
        {printReadiness && (
          <div className="print-section">
            <h3>Retirement Readiness &mdash; the six questions</h3>
            <table className="print-table">
              <tbody>
                {printReadiness.map((line, idx) => (
                  <tr key={line.id} className={idx % 2 === 0 ? 'print-row-even' : ''}>
                    <td style={{ width: '38%', fontWeight: '600' }}>{line.question}</td>
                    <td>{line.answer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(() => {
              // The same odds the Readiness screen states (U14): each
              // person's chance of reaching their own planned age, and the
              // household's of anyone being here in the plan's last year.
              const horizon = planHorizon(inputs, projection);
              if (!horizon) return null;
              const [a, b] = horizon.people;
              const pctOf = (v) => `${Math.round(v * 100)}%`;
              const name1 = printInputs.spouse1Name || 'the primary member';
              const name2 = printInputs.spouse2Name || 'the spouse';
              return (
                <p style={{ fontSize: '11px', color: '#444', margin: '8px 0 0', lineHeight: 1.5 }}>
                  The plan runs to {horizon.lastYear}. By the Social Security Administration&rsquo;s period life table, {name1} (now {a.age}) has a {pctOf(a.reachPlanTo)} chance of reaching {a.planTo}
                  {b ? ` and ${name2} (now ${b.age}) a ${pctOf(b.reachPlanTo)} chance of reaching ${b.planTo}; the chance at least one of you is still here in ${horizon.lastYear} is ${pctOf(horizon.anyAliveAtEnd)}` : ''}.
                  A healthy, well-off household runs a few years better than the table.
                </p>
              );
            })()}
          </div>
        )}

        {/* Action Plan: shares its content with the always-visible
            ActionPlanCard on the Dashboard (via buildActionPlan) so the
            printed roadmap and the on-screen one never drift apart. */}
        {(() => {
          const actionPlan = buildActionPlan(printInputs, projection, formatCurrency, rothBracketHeatmapData, guardrailsComparisonData);
          return (
            <div className="print-section print-section--flows">
              <h3>Your Action Plan</h3>
              {actionPlan.sections.map((section) => (
                <div key={section.id} style={{ marginBottom: '14px' }}>
                  <div className="print-subhead" style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '10px 0 4px', color: '#333' }}>
                    {section.title}
                  </div>
                  {section.items.length > 0 && (
                    <table className="print-table">
                      <tbody>
                        {section.items.map((item, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'print-row-even' : ''}>
                            <td style={{ width: '45%', fontWeight: '600' }}>{item.label}</td>
                            <td>{item.detail || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          );
        })()}

        <div className="print-grid">
          <div className="print-section">
            <h3>Demographics & Assets Summary</h3>
            <table className="print-table">
              <tbody>
                <tr>
                  <td>{printInputs.spouse1Name || 'Spouse 1'}</td>
                  <td>Age {inputs.planYear - inputs.birthYear1} (Retire at {inputs.retireAge1}, SS at {inputs.claimingAge1})</td>
                </tr>
                {inputs.spouse2Enabled && (
                  <tr>
                    <td>{printInputs.spouse2Name || 'Spouse 2'}</td>
                    <td>Age {inputs.planYear - inputs.birthYear2} (Retire at {inputs.retireAge2}, SS at {inputs.claimingAge2})</td>
                  </tr>
                )}
                <tr>
                  <td>Filing Status</td>
                  <td>{inputs.filingStatus === 'MFJ' ? 'Married Filing Jointly' : 'Single'}</td>
                </tr>
                <tr>
                  <td>Traditional Pre-Tax Assets</td>
                  <td>{formatCurrency(inputs.preTaxInit)}</td>
                </tr>
                <tr>
                  <td>Roth Assets</td>
                  <td>{formatCurrency(inputs.rothInit)}</td>
                </tr>
                <tr>
                  <td>Taxable Brokerage Assets</td>
                  <td>{formatCurrency(inputs.taxableInit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div className="print-section">
            <h3>Assumptions & Expenses</h3>
            <table className="print-table">
              <tbody>
                <tr>
                  <td>Inflation Rate</td>
                  <td>{inputs.inflationRate}%</td>
                </tr>
                <tr>
                  <td>Growth Rates (Pre / Post)</td>
                  <td>
                    {inputs.rebalancingEnabled
                      ? `Rebalanced Stock/Bond Return (see Portfolio Allocation below)`
                      : `${inputs.preRetireReturn}% / ${inputs.postRetireReturn}%`}
                  </td>
                </tr>
                <tr>
                  <td>Portfolio Allocation</td>
                  <td>
                    {inputs.rebalancingEnabled ? (
                      <>
                        {inputs.stockAllocationPre}% stocks / {100 - inputs.stockAllocationPre}% bonds while working, shifting to {inputs.stockAllocationPost}% stocks / {100 - inputs.stockAllocationPost}% bonds at retirement (age {inputs.retireAge1}{inputs.spouse2Enabled ? ` / ${inputs.retireAge2}` : ''}) — a standard "glide path" that gets more conservative as you age.
                        <div style={{ fontSize: 'var(--fs-xs)', opacity: 0.8, marginTop: '4px' }}>
                          Assumed returns: {inputs.stockReturnRate}% stocks, {inputs.bondReturnRate}% bonds.
                        </div>
                      </>
                    ) : (
                      <>
                        Fixed blended return ({inputs.preRetireReturn}% / {inputs.postRetireReturn}%) — no age-based stock/bond rebalancing is modeled.
                        <div style={{ fontSize: 'var(--fs-xs)', opacity: 0.8, marginTop: '4px' }}>
                          To model a glide path that shifts to a more conservative mix at retirement, turn on Dynamic Asset Allocation under Plan → Assumptions &amp; Risk.
                        </div>
                      </>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Spending Guardrails</td>
                  <td>
                    {inputs.spendingGuardrails ? (
                      <>
                        ON
                        <div style={{ fontSize: 'var(--fs-xs)', opacity: 0.8, marginTop: '4px' }}>
                          If a market downturn hits in your very first year of retirement, spending is cut 10% for the rest of the plan. In any other year following a negative portfolio return, that year's inflation increase is skipped (spending held flat rather than rising).
                        </div>
                      </>
                    ) : (
                      <>
                        OFF
                        <div style={{ fontSize: 'var(--fs-xs)', opacity: 0.8, marginTop: '4px' }}>
                          Retirement spending rises with inflation every year regardless of market performance, including down years.
                        </div>
                      </>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Annual Lifestyle Spending</td>
                  <td>
                    {formatCurrency(inputs.lifestyleExpense)} / year
                    {inputs.lifestyleThreePhaseEnabled ? (
                      <div style={{ fontSize: 'var(--fs-xs)', opacity: 0.8, marginTop: '4px' }}>
                        Three-Phase Curve Active:<br />
                        • Go-Go (to age {inputs.goGoEndAge}): {Math.round(inputs.goGoMultiplier * 100)}% ({formatCurrency(inputs.lifestyleExpense * inputs.goGoMultiplier)}/yr)<br />
                        • Slow-Go (to age {inputs.slowGoEndAge}): {Math.round(inputs.slowGoMultiplier * 100)}% ({formatCurrency(inputs.lifestyleExpense * inputs.slowGoMultiplier)}/yr)<br />
                        • No-Go (age {inputs.slowGoEndAge + 1}+): {Math.round(inputs.noGoMultiplier * 100)}% ({formatCurrency(inputs.lifestyleExpense * inputs.noGoMultiplier)}/yr)
                      </div>
                    ) : (
                      inputs.goGoBumpEnabled && (
                        <div style={{ fontSize: 'var(--fs-xs)', opacity: 0.8, marginTop: '4px' }}>
                          Go-Go Bump: +{inputs.goGoBumpRate}% to age {inputs.goGoBumpEndAge}
                        </div>
                      )
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Healthcare Bridge / LTC</td>
                  <td>
                    {formatCurrency(inputs.healthcareBridgeCost)} / person <br />
                    {inputs.ltcActive1 ? `${inputs.spouse2Enabled ? (printInputs.spouse1Name || 'Primary') + ' ' : ''}LTC Active: ${formatCurrency(inputs.ltcCost1)} / year (age ${inputs.ltcStartAge1}${inputs.ltcEndsInDeath1 ? ', through end of life' : `, ${inputs.ltcDurationYears1}-yr episode`})` : `${inputs.spouse2Enabled ? (printInputs.spouse1Name || 'Primary') + ' ' : ''}LTC Inactive`}
                    {inputs.spouse2Enabled && (
                      <>
                        <br />
                        {inputs.ltcActive2 ? `${printInputs.spouse2Name || 'Spouse'} LTC Active: ${formatCurrency(inputs.ltcCost2)} / year (age ${inputs.ltcStartAge2}${inputs.ltcEndsInDeath2 ? ', through end of life' : `, ${inputs.ltcDurationYears2}-yr episode`})` : `${printInputs.spouse2Name || 'Spouse'} LTC Inactive`}
                      </>
                    )}
                  </td>
                </tr>
                {inputs.annuityPurchaseAmount > 0 && (
                  <tr>
                    <td>Lifetime Annuity Payout</td>
                    <td>
                      {formatCurrency(inputs.annuityPurchaseAmount)} purchase at age {inputs.annuityPurchaseAge} ({inputs.annuityPayoutRate}% rate, {inputs.annuityIndexation}% COLA) <br />
                      funded from {inputs.annuitySourceAccount === 'preTax' ? 'Pre-Tax' : inputs.annuitySourceAccount === 'roth' ? 'Roth' : 'Taxable Brokerage'} ({inputs.annuityIsTaxable ? 'Taxable Ordinary' : 'Tax-Free'})
                    </td>
                  </tr>
                )}
                <tr>
                  <td>State Tax Jurisdiction</td>
                  <td>
                    {inputs.stateTaxState === 'none' && 'Tax-Free (0%)'}
                    {inputs.stateTaxState === 'flat_5' && `Flat Tax (${inputs.stateTaxFlatRate !== undefined ? inputs.stateTaxFlatRate : 5.0}%)`}
                    {inputs.stateTaxState === 'state_rules' && (hasStateRules(inputs.stateOfResidence) ? `${stateRulesName(inputs.stateOfResidence)} (${stateRulesRate(inputs.stateOfResidence)})` : `Flat Tax (${inputs.stateTaxFlatRate !== undefined ? inputs.stateTaxFlatRate : 5.0}%)`)}
                    {inputs.stateTaxState === 'ca' && 'California (Progressive)'}
                    {inputs.stateTaxState === 'ny' && 'New York (Progressive)'}
                    {inputs.stateTaxState === 'il' && 'Illinois (Flat 4.95%)'}
                    {inputs.stateTaxState === 'co' && 'Colorado (Flat 4.4%)'}
                    {inputs.stateTaxState === 'pa' && 'Pennsylvania (Flat 3.07%)'}
                    {inputs.stateTaxState === 'va' && 'Virginia (Progressive)'}
                    {inputs.stateTaxState === 'wa' && 'Washington (Capital Gains; Income from 2028)'}
                    {residencyMoves.length > 0 && ' (starting state)'}
                  </td>
                </tr>
                {residencyMoves.map((m) => (
                  <tr key={m.id}>
                    <td>Move in {m.fromYear}</td>
                    <td>{m.kind === 'foreign'
                      ? `${m.countryName} (abroad${m.stateDomicileSevered || !m.stateOfResidence ? '' : `; ${m.stateOfResidence} still claims you`})`
                      : `${m.stateOfResidence}${m.stateTaxState === 'none' ? ' (no state income tax)' : ''}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tax & Roth Conversion Analysis -- lifetime tax totals plus, if a
            Roth Conversion Strategy is active, how much was converted and
            what it cost in tax. Summed here from projection.years rather
            than a pre-aggregated field, the same way the Action Plan above
            derives its own figures from the raw year-by-year data. */}
        {(() => {
          const totalConverted = projection.years.reduce((sum, y) => sum + (y.convertAmount || 0), 0);
          const totalConversionTax = projection.years.reduce((sum, y) => sum + (y.conversionTaxCost || 0), 0);
          const conversionActive = inputs.rothConversionStrategy && inputs.rothConversionStrategy !== 'none';
          return (
            <div className="print-section">
              <h3>Tax &amp; Roth Conversion Analysis</h3>
              <table className="print-table">
                <tbody>
                  <tr>
                    <td>Lifetime taxes paid</td>
                    <td>{formatEnding(projection.totalTaxesPaid)}</td>
                  </tr>
                  <tr>
                    <td>Lifetime Medicare premiums (incl. IRMAA)</td>
                    <td>{formatEnding(projection.totalIRMAAPaid)}</td>
                  </tr>
                  <tr>
                    <td>Lifetime forced RMDs (Pre-Tax)</td>
                    <td>{formatEnding(projection.totalRMDsForced)}</td>
                  </tr>
                  <tr>
                    <td>Roth Conversion Strategy</td>
                    <td>
                      {conversionActive ? (
                        <>
                          {inputs.rothConversionStrategy === 'fixed' && `Fixed annual conversion of ${formatCurrency(inputs.rothConversionAmount || 0)}`}
                          {inputs.rothConversionStrategy === 'maxBracket' && `Convert up to the top of the ${((inputs.rothConversionBracket || 0) * 100).toFixed(0)}% marginal tax bracket each year`}
                          {!['fixed', 'maxBracket'].includes(inputs.rothConversionStrategy) && inputs.rothConversionStrategy}
                          <div style={{ fontSize: 'var(--fs-xs)', opacity: 0.8, marginTop: '4px' }}>
                            {formatEnding(totalConverted)} converted over the plan's lifetime, at a total tax cost of {formatEnding(totalConversionTax)}{totalConverted > 0 ? ` (${((totalConversionTax / totalConverted) * 100).toFixed(1)}% effective rate)` : ''}. Converting pre-tax dollars to Roth pays tax now in exchange for tax-free growth and withdrawals later, and shrinks future Required Minimum Distributions.
                          </div>
                        </>
                      ) : (
                        <>
                          None active
                          <div style={{ fontSize: 'var(--fs-xs)', opacity: 0.8, marginTop: '4px' }}>
                            No Roth conversions are modeled in this plan. See Settings → Roth Conversion Optimization to evaluate one.
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* Estate & Legacy Summary -- reuses the same heirTaxResults already
            computed above for the Dashboard's Estate Legacy chart, so this
            section never drifts from what the Tax & Estate tab shows. */}
        <div className="print-section">
          <h3>Estate &amp; Legacy Summary</h3>
          <table className="print-table">
            <tbody>
              <tr>
                <td>Gross Inherited Wealth</td>
                <td>{formatCurrency(heirTaxResults.grossInherited)}</td>
              </tr>
              <tr>
                <td>Heir Income Tax Drag (IRS 10-Year Rule, federal only)</td>
                <td>{formatCurrency(heirTaxResults.totalHeirTax)}</td>
              </tr>
              <tr>
                <td>State Estate/Inheritance Tax ({'estateStateCode' in heirTaxResults ? (heirTaxResults.estateStateCode || (heirTaxResults.estateCountry ? `none \u2014 living in ${heirTaxResults.estateCountry}` : 'N/A')) : (inputs.stateOfResidence || 'N/A')})</td>
                <td>{formatCurrency(heirTaxResults.totalStateEstateTax || 0)}</td>
              </tr>
              {heirTaxResults.estateCountry && (
                <tr>
                  <td>Foreign Inheritance Tax ({heirTaxResults.estateCountry}{heirTaxResults.foreignEstateMethod === 'rate' ? ', your estimate' : ''})</td>
                  <td>{heirTaxResults.foreignEstateMethod == null ? 'Not included' : formatCurrency(heirTaxResults.totalForeignEstateTax || 0)}</td>
                </tr>
              )}
              <tr>
                <td>Federal Estate Tax</td>
                <td>{formatCurrency(heirTaxResults.totalFederalEstateTax || 0)}</td>
              </tr>
              {(inputs.lifeInsuranceEnabled1 || inputs.lifeInsuranceEnabled2) && (
                <tr>
                  <td>Life Insurance Proceeds to Heirs (income-tax-free)</td>
                  <td>{formatCurrency(heirTaxResults.totalLifeInsuranceProceeds || 0)}</td>
                </tr>
              )}
              <tr>
                <td>Net Heir Inheritance</td>
                <td style={{ fontWeight: '700' }}>{formatCurrency(heirTaxResults.netInherited)}</td>
              </tr>
            </tbody>
          </table>
          {heirTaxResults.perHeir && heirTaxResults.perHeir.length > 0 && (
            <table className="print-table" style={{ marginTop: '12px' }}>
              <thead>
                <tr>
                  <th>Heir</th>
                  <th>Split</th>
                  <th>Gross</th>
                  <th>State Tax</th>
                  <th>Federal Tax</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {heirTaxResults.perHeir.map((h, idx) => (
                  <tr key={h.id} className={idx % 2 === 0 ? 'print-row-even' : ''}>
                    <td>{heirLabel(h, idx, printHideNames)}</td>
                    <td>{h.splitPct.toFixed(0)}%</td>
                    <td>{formatCurrency(h.grossInherited)}</td>
                    <td>{formatCurrency(h.stateEstateTax || 0)}</td>
                    <td>{formatCurrency(h.federalEstateTax || 0)}</td>
                    <td>{formatCurrency(h.netInherited)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Risk Analysis -- Monte Carlo (only if the user has actually run
            the 1,000-trial simulation from the Risk tab; otherwise notes
            that it hasn't been run rather than omitting the row silently),
            the Minimum Required Rate of Return solver, and whether a
            Historical Stress Test is currently configured. */}
        <div className="print-section">
          <h3>Risk Analysis</h3>
          <table className="print-table">
            <tbody>
              <tr>
                <td>Monte Carlo Success Probability</td>
                <td>
                  {monteCarlo
                    ? `${monteCarlo.successProbability.toFixed(1)}% (1,000 randomized trials)`
                    : 'Not yet run for this plan — see Risk Analysis → Monte Carlo Probability.'}
                </td>
              </tr>
              {monteCarlo && (
                <tr>
                  <td>Legacy Range (p10 / p50 / p90)</td>
                  <td>{formatCurrency(monteCarloShown.endingP10)} / {formatCurrency(monteCarloShown.endingP50)} / {formatCurrency(monteCarloShown.endingP90)}</td>
                </tr>
              )}
              {monteCarlo && monteCarlo.seed !== undefined && (
                <tr>
                  <td>How the trials were drawn</td>
                  <td>
                    {monteCarlo.returnModel === 'bootstrap'
                      ? `Returns bootstrapped from ${monteCarlo.bootstrapBlockYears}-year blocks of real years (${monteCarlo.historyRange}), ${monteCarlo.bootstrapCenter === 'history' ? 'as history' : 're-centered on the stated assumptions'}`
                      : 'Returns lognormal around the stated compound rate'}, seed {monteCarlo.seed} (reproducible);
                    inflation {monteCarlo.returnModel === 'bootstrap' ? 'carried by each sampled year' : monteCarlo.inflationSampled ? 'sampled with the market' : 'held at the planned rate'};
                    lifespans {monteCarlo.longevitySampled ? `drawn from the SSA life table (${monteCarlo.beyondHorizonPct.toFixed(0)}% of trials outlived the planned horizon)` : 'fixed at the Life Expectancy ages'}.
                  </td>
                </tr>
              )}
              <tr>
                <td>Minimum Required Rate of Return</td>
                <td>
                  {!minimumRequiredReturn
                    ? 'Calculating\u2026'
                    : !minimumRequiredReturn.feasible
                    ? 'No feasible flat return keeps this plan solvent — even a 30%/yr average return falls short.'
                    : minimumRequiredReturn.belowSearchFloor
                      ? `Below -10%/yr — this plan is solvent even at a deeply negative average return.`
                      : `${minimumRequiredReturn.requiredReturn.toFixed(1)}%/yr, vs. an assumed ${minimumRequiredReturn.currentAssumedReturn.toFixed(1)}%/yr (${(minimumRequiredReturn.currentAssumedReturn - minimumRequiredReturn.requiredReturn >= 0 ? '+' : '')}${(minimumRequiredReturn.currentAssumedReturn - minimumRequiredReturn.requiredReturn).toFixed(1)} point cushion)`}
                </td>
              </tr>
              <tr>
                <td>Historical Stress Test</td>
                <td>
                  {inputs.stressType && inputs.stressType !== 'none'
                    ? `Currently modeling a ${inputs.stressType === 'crashYear' ? 'custom crash year' : inputs.stressType === 'history' ? `real ${inputs.stressHistoryStartYear} start` : inputs.stressType} scenario — the Ending Balance and success/shortfall figures throughout this report already reflect it.`
                    : 'None active — this report reflects steady assumed returns with no simulated crash.'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Planned Milestones & Special Events -- called out as its own
            scannable table (rather than folded only into the Action Plan
            prose above) so a one-time expense or windfall isn't missed on
            a printed page. Omitted entirely when no milestones are
            configured, rather than printing an empty table. */}
        {inputs.milestones && inputs.milestones.length > 0 && (
          <div className="print-section">
            <h3>Planned Milestones & Special Events</h3>
            <table className="print-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Type</th>
                  <th>Age</th>
                  <th>Amount</th>
                  <th>Funding / Destination</th>
                </tr>
              </thead>
              <tbody>
                {[...inputs.milestones]
                  .sort((a, b) => (a.startAge || 0) - (b.startAge || 0))
                  .map((m, idx) => {
                    const isOutflow = m.type === 'outflow';
                    const accountLabel = m.targetAccount === 'preTax' ? 'Pre-Tax' : m.targetAccount === 'roth' ? 'Roth' : 'Taxable Brokerage';
                    const fundingText = isOutflow
                      ? (m.fundedExternally ? 'Funded outside this plan (no account impact)' : (!m.targetAccount || m.targetAccount === 'auto') ? 'Drawn per withdrawal strategy' : `Drawn from ${accountLabel}`)
                      : `Deposited to ${accountLabel}${m.isTaxable ? ', taxed as ordinary income' : ''}`;
                    return (
                      <tr key={m.id || idx} className={idx % 2 === 0 ? 'print-row-even' : ''}>
                        <td>{m.name}</td>
                        <td>{isOutflow ? 'Expense' : 'Inflow'}</td>
                        <td>{m.isRecurring ? `${m.startAge}–${m.endAge}` : m.startAge}</td>
                        <td>{formatCurrency(m.amount)}{m.isRecurring ? '/yr' : ''}</td>
                        <td>{fundingText}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        <div className="print-section">
          <h3>Year-by-Year Projected Cash Flow Summary</h3>
          <table className="print-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>{printInputs.spouse1Name ? `${printInputs.spouse1Name}’s age` : 'Age 1'}</th>
                {inputs.spouse2Enabled && <th>{printInputs.spouse2Name ? `${printInputs.spouse2Name}’s age` : 'Age 2'}</th>}
                <th>Starting Balance</th>
                <th>Fixed Inflows</th>
                <th>Lifestyle + Bumps</th>
                <th>Taxes Paid</th>
                <th>Ending Balance</th>
                <th>Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {projection.years
                .filter((y, idx) => {
                  const retireYear1 = inputs.birthYear1 + inputs.retireAge1;
                  const retireYear2 = inputs.spouse2Enabled ? inputs.birthYear2 + inputs.retireAge2 : 0;
                  const isRetireYear = y.year === retireYear1 || y.year === retireYear2;
                  return idx === 0 || idx === projection.years.length - 1 || idx % 5 === 0 || isRetireYear;
                })
                .map((y, idx) => (
                  <tr key={y.year} className={idx % 2 === 0 ? 'print-row-even' : ''}>
                    <td>{y.year}</td>
                    <td>{y.age1 || '—'}</td>
                    {inputs.spouse2Enabled && <td>{y.age2 || '—'}</td>}
                    <td>{formatCurrency(y.preTaxStart + y.rothStart + y.taxableStart)}</td>
                    <td>{formatCurrency(y.fixedInflows)}</td>
                    <td>{formatCurrency(y.lifestyleExpenses)}</td>
                    <td>{formatCurrency(y.totalTaxesPaid)}</td>
                    <td>{formatCurrency(y.totalPortfolioEnding)}</td>
                    <td style={{ color: y.shortfall > 0 ? 'var(--danger)' : 'black' }}>
                      {y.shortfall > 0 ? formatCurrency(y.shortfall) : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        </PrintFrame>
      </div>

      {/* Print-only disclaimer footer -- a CSS class with position: fixed
          (defined in index.css's @media print block) so it repeats on
          every printed page, not just the last one. Condensed version of
          the same educational-tool-only language shown in the Disclaimer
          Modal on first visit (see acceptDisclaimer above). */}
    </div>
      {/* Outside .app-container (changelog 333): the planner packet and the
          spending review hide the app while they print, and the footer used
          to go with it, so only some printouts carried it. */}
      <div className="print-disclaimer-footer">
        <a href={`https://${BRAND_DOMAIN}`} className="print-brand-link"><BrandMark variant="short" height={22} className="print-footer-mark" /></a>
        <span>{DISCLAIMER_PRINT}</span>
      </div>
    </SimulationContext.Provider>
    </EntitlementContext.Provider>
  );
}
