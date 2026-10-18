// The app's single home for everything that is NOT plan data.
//
// Why this file exists (2026-08-19, IA Phase 2 -- see IA_REVIEW.md): the
// word "settings" meant three unrelated things in this app, and only one
// of them had a home.
//
//   1. Plan data -- the ~241 inputs feeding the projection. Home: the
//      "Plan Settings" tab (and the Full Interview, which writes the same
//      `inputs` object).
//   2. Display preferences -- theme, large text, today's-vs-future
//      dollars. Home: scattered across the sidebar footer, with theme and
//      Large Text in a separate visual block ~200 lines away from the
//      dollars toggle.
//   3. Data-source / account config -- the Premium Access Key (a
//      showPrompt() dialog hanging off a nav rail) and the Live Pricing
//      Google Sheet URLs (a disclosure panel three levels deep inside
//      Detailed Holdings).
//
// Categories 2 and 3 now live here. Category 1 deliberately does NOT --
// "Plan Settings" stays the home for anything that changes your
// projection, and this tab stays the home for anything that changes the
// app. That split is the whole point; resist the temptation to park a
// plan input here because it feels settings-ish.
//
// Everything on this page writes to its own localStorage key rather than
// to `inputs`, which is exactly why none of it belongs in a saved
// Scenario: switching scenarios should never silently flip your theme or
// disconnect your pricing Sheet.
import PremiumMount from '../../premium/PremiumMount';
import PremiumModuleVersions from '../../premium/PremiumModuleVersions';
import { PrefSection } from '../PrefSection';
import React, { useRef, useState, useEffect } from 'react';
import {
  Settings, Sun, Moon, Type, Coins, KeyRound, Save, Upload,
  RefreshCw, Sparkles, BookOpen, AlertTriangle, CheckCircle2, ExternalLink,
  FolderSync, Link2Off, Eye, BellRing, ShieldCheck, Lock, Dices, Hash, Trash2,
} from 'lucide-react';
import { useSimulation } from '../../context/useSimulation';
import { useEntitlement } from '../../context/useEntitlement';
import { COPYRIGHT_NOTICE, PRIVACY_PROMISE, TERMS_URL, PRIVACY_URL, ACCESSIBILITY_URL } from '../../config/branding';
import { versionLabel, BUILD_DATE } from '../../config/buildInfo';
import { CONTACT_EMAIL } from '../../config/premiumOffering';
import { useFullBackupActions } from '../../context/useFullBackupActions';
import { eraseEverythingOnDevice } from '../../utils/eraseDevice';
import { getFreshnessState, setPortfolioReminderCadence, computeFreshnessStatus, formatAgeDays } from '../../utils/dataFreshness';
import { isLocalOnlyMode, setLocalOnlyMode, subscribeLocalOnlyMode } from '../../utils/localOnlyMode';
import { isAnalyticsEnabled, setAnalyticsEnabled, subscribeAnalyticsEnabled } from '../../utils/analyticsOptIn';
import { ANALYTICS_SENDS } from '../../config/analyticsDisclosure';

// Local-Only Mode card (changelog 115). Self-contained so it owns its own
// subscription: the same flag is toggled from the top-of-app banner, and
// this switch must follow along live. See utils/localOnlyMode.js for what
// the mode actually enforces (no analytics beacons, no pricing fetches --
// refused at the sheetPricing.js choke points, fail-closed).
const LocalOnlyModeCard = () => {
  const [on, setOn] = useState(isLocalOnlyMode);
  useEffect(() => subscribeLocalOnlyMode(setOn), []);
  return (
    <div style={{
      padding: '14px', borderRadius: '8px',
      border: `1px solid ${on ? 'var(--success)' : 'var(--card-border)'}`,
      backgroundColor: 'var(--bg-secondary)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <ShieldCheck size={18} style={{ flexShrink: 0, color: on ? 'var(--success)' : 'var(--accent-text)' }} />
        <span style={{ fontWeight: 600 }}>Local-Only Mode</span>
      </div>
      <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
        Your numbers never leave your device either way &mdash; this switch goes further and stops the app
        making the optional connections too. <strong>With it off</strong>, the only things the app can send are the Live Pricing refresh
        (bare ticker symbols, and only if you&rsquo;ve connected a Sheet) and &mdash; only if you turn on Usage
        Analytics below &mdash; anonymous page-view counts. By default both are off, so nothing leaves but the
        app loading itself, like any website. <strong>With it on</strong>, the app <strong>sends none of your data and makes no optional
        connections</strong>: analytics and Live Pricing are both refused at the code level. Your browser still loads the app and checks for updates when you reload. Everything else &mdash; projections, optimizers, charts, exports &mdash; works exactly
        the same, and a small reminder stays at the top of the app so you&rsquo;ll know why prices aren&rsquo;t
        refreshing.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <label htmlFor="toggle-localOnlyMode" style={{ fontSize: 'var(--fs-sm)', margin: 0, cursor: 'pointer' }}>
          Turn off optional connections
        </label>
        <span className="custom-switch">
          <input
            id="toggle-localOnlyMode"
            type="checkbox"
            checked={on}
            onChange={(e) => setLocalOnlyMode(e.target.checked)}
          />
          <span className="slider-round"></span>
        </span>
      </div>
    </div>
  );
};

// Anonymous usage analytics -- OFF by default (changelog 149), the app's
// only third-party beacon. Sits beside Local-Only Mode; when that mode is
// on, analytics never send regardless of this switch (GatedAnalytics).
const AnalyticsOptInCard = () => {
  const [on, setOn] = useState(isAnalyticsEnabled);
  const [localOnly, setLocalOnly] = useState(isLocalOnlyMode);
  useEffect(() => subscribeAnalyticsEnabled(setOn), []);
  useEffect(() => subscribeLocalOnlyMode(setLocalOnly), []);
  return (
    <div style={{
      padding: '14px', borderRadius: '8px',
      border: '1px solid var(--card-border)', backgroundColor: 'var(--bg-secondary)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <Eye size={18} style={{ flexShrink: 0, color: 'var(--accent-text)' }} />
        <span style={{ fontWeight: 600 }}>Anonymous Usage Analytics</span>
      </div>
      <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
        <strong>Off by default.</strong> Turn this on to share anonymous page-view counts with the developer. Each view sends {ANALYTICS_SENDS}
        It goes to our own domain; leaving this off sends no usage beacon at all. Local-Only Mode
        overrides it either way &mdash; while that&rsquo;s on, nothing is sent no matter what this is set to.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <label htmlFor="toggle-analyticsOptIn" style={{ fontSize: 'var(--fs-sm)', margin: 0, cursor: 'pointer' }}>
          Share anonymous usage analytics
        </label>
        <span className="custom-switch">
          <input
            id="toggle-analyticsOptIn"
            type="checkbox"
            checked={on && !localOnly}
            disabled={localOnly}
            onChange={(e) => setAnalyticsEnabled(e.target.checked)}
          />
          <span className="slider-round"></span>
        </span>
      </div>
      {localOnly && (
        <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: '8px 0 0' }}>
          Paused while Local-Only Mode is on.
        </p>
      )}
    </div>
  );
};

// Shared shell so every section on this page reads the same way: an icon,
// a title, one line of plain-language "what is this for", then controls.

// A labeled on/off row. Deliberately a real <button> with aria-pressed
// rather than the app's custom-switch markup: these are actions on app
// state, not fields in a form, and this keeps the whole page keyboard- and
// screen-reader-navigable without needing the htmlFor/id pairing dance
// that KNOWN_ISSUES.md documents for the custom switches.
const PrefToggle = ({ icon: Icon, label, hint, active, activeLabel, inactiveLabel, onClick, danger }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className="btn-outline"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      width: '100%',
      padding: '12px 16px',
      textAlign: 'left',
      borderColor: active ? (danger ? 'var(--danger)' : 'var(--accent-primary)') : 'var(--card-border)',
      color: 'var(--text-primary)',
      background: active ? 'rgba(42, 127, 122, 0.08)' : 'transparent',
    }}
  >
    <Icon size={18} style={{ flexShrink: 0, color: active ? 'var(--accent-text)' : 'var(--text-secondary)' }} />
    <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {hint && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', fontWeight: 400 }}>{hint}</span>}
    </span>
    <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: active ? 'var(--accent-text)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
      {active ? (activeLabel || 'On') : (inactiveLabel || 'Off')}
    </span>
  </button>
);

const PreferencesTab = () => {
  const {
    theme, toggleTheme, largeTextMode, setLargeTextMode,
    statusBarHidden, setStatusBarHidden,
    mcAutoRun, setMcAutoRun,
    roundFarDollars, setRoundFarDollars,
    useRealDollars, setUseRealDollars,
    handleReset, showPrompt, showConfirm,
    setActiveTab, setShowOnboarding, setOnboardingStep,
    setShowDisclaimerReview,
  } = useSimulation();
  const {
    isPremium,
    premiumJwtToken, setPremiumJwtToken, premiumJwtExpiresAt, licensedTo, premiumKeySerial,
  } = useEntitlement();

  const restoreFileInputRef = useRef(null);

  // Erase everything on this device -- the control privacy.html and
  // terms.html point to. Unlike Reset Plan to Defaults (active plan only)
  // it removes every key the app keeps (eraseDevice.js), so the dialog
  // names each kind of data, offers a backup first, and needs ERASE typed.
  const handleEraseEverything = async () => {
    const answer = await showConfirm(
      "This removes everything OutlastRetirement keeps on this device: your plan, saved scenarios, Detailed Holdings, estate checklist, Life Plan, annual review, Premium Access key, Live Pricing connection and preferences. Backup files you've saved, and a linked save file in your own folder, are not touched.\n\nThere is no undo. If you may want any of it again, back up everything first.",
      {
        title: 'Erase everything on this device',
        danger: true,
        confirmLabel: 'Erase Everything',
        altLabel: 'Back Up Everything First',
        requireText: 'ERASE',
      }
    );
    if (answer === 'alt') {
      backupEverything();
      return;
    }
    if (answer !== true) return;
    await eraseEverythingOnDevice();
    // No hash: the reload lands on the first-run screens, not on the tab
    // the erase was started from.
    window.location.replace(window.location.pathname);
  };

  // Backup/restore run through useFullBackupActions, the single shared
  // implementation. This copy previously called downloadFullBackup() with
  // no options while the Sidebar passed a projectionSummary -- so the same
  // labeled action produced a different file depending on which button
  // you pressed. Fixed by there being only one of it now.
  const {
    backupEverything, backupEverythingEncrypted, restoreFromFile,
    isSaveFileSupported, getLinkedFileHandle,
    linkSaveFile, saveToLinkedFile, restoreFromLinkedFile, unlinkSaveFile,
  } = useFullBackupActions();

  // --- Linked save file ---------------------------------------------
  //
  // Free for everyone, deliberately. The obvious move was to make this
  // Premium, but the two things it could be sold as don't hold up: on a
  // desktop it is indistinguishable from Backup Everything into a folder
  // the user's Drive client already watches (they can do that by hand
  // today), and recovery from data loss is the one thing in this app that
  // should never be behind a paywall -- this whole subsystem exists
  // because a plan was lost once.
  //
  // The honest paid boundary is device reach, not storage: this API is
  // Chromium-only and absent from iOS entirely (Chrome on iOS is a WebKit
  // shell, and no alternative engine has shipped there even under the
  // DMA) and from both Capacitor builds. Reaching a phone needs a real
  // Drive/Dropbox API integration, which is a separate feature.
  const [linkedFileName, setLinkedFileName] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [savingFile, setSavingFile] = useState(false);
  const saveFileSupported = isSaveFileSupported();

  useEffect(() => {
    if (!saveFileSupported) return;
    let canceled = false;
    getLinkedFileHandle().then((handle) => {
      if (!canceled && handle) setLinkedFileName(handle.name);
    });
    return () => { canceled = true; };
  }, [saveFileSupported, getLinkedFileHandle]);

  const handleLinkSaveFile = async () => {
    setSavingFile(true);
    try {
      const name = await linkSaveFile();
      if (name) {
        setLinkedFileName(name);
        setLastSavedAt(new Date());
      }
    } finally {
      setSavingFile(false);
    }
  };

  // "Keep the data real" reminder cadence (dataFreshness.js). Lives in
  // the freshness store, not in plan inputs -- it's an app preference,
  // like the theme, but it IS included in Backup Everything because the
  // dates beside it are a real record.
  const [reminderCadence, setReminderCadence] = useState(() => getFreshnessState().portfolioReminderCadence);
  const handleCadenceChange = (e) => {
    const v = e.target.value;
    setReminderCadence(v);
    setPortfolioReminderCadence(v);
  };

  const handleSaveNow = async () => {
    setSavingFile(true);
    try {
      // Only stamp the time on a real write. Showing "saved just now"
      // after a permission denial or a missing file would be a lie about
      // the one thing this feature exists to promise.
      if (await saveToLinkedFile()) setLastSavedAt(new Date());
    } finally {
      setSavingFile(false);
    }
  };

  const handleRestoreFromFile = async () => {
    setSavingFile(true);
    try {
      // On success this reloads the page, so there is nothing to update
      // here; the finally exists for the canceled and failed paths.
      await restoreFromLinkedFile();
    } finally {
      setSavingFile(false);
    }
  };

  const handleUnlinkSaveFile = async () => {
    await unlinkSaveFile();
    setLinkedFileName(null);
    setLastSavedAt(null);
  };
  const handleBackupEverything = backupEverything;
  const handleRestoreFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    await restoreFromFile(file);
  };

  const handlePremiumKeyClick = async () => {
    const pasted = await showPrompt(
      'Paste the Premium access key we emailed you. It starts with "eyJ" — copy the whole thing.\n\n' +
      `Don't have one, or has it expired? Email ${CONTACT_EMAIL} and we'll send a new one.\n\n` +
      'Clear this field and submit to remove a saved key.',
      { title: 'Premium Access Key', defaultValue: premiumJwtToken }
    );
    if (pasted === null || pasted === undefined) return;
    setPremiumJwtToken(pasted.trim());
  };

  const premiumKeyStatusLabel = !premiumJwtToken
    ? 'Not set'
    : premiumJwtExpiresAt
      ? `Active until ${premiumJwtExpiresAt.toLocaleDateString()}${licensedTo ? ` \u00b7 licensed to ${licensedTo}` : ''}${premiumKeySerial ? ` \u00b7 key ${premiumKeySerial.slice(0, 8)}` : ''}`
      : 'Invalid or expired';
  const premiumKeyStatusColor = !premiumJwtToken
    ? 'var(--text-secondary)'
    : premiumJwtExpiresAt
      ? 'var(--accent-primary)'
      : 'var(--danger)';


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div className="glass-panel" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
          <Settings size={32} style={{ color: 'var(--accent-text)' }} />
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>Preferences</h1>
        </div>
        <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, maxWidth: '820px' }}>
          Settings for <strong>the app itself</strong> &mdash; how it looks, what it&rsquo;s connected to, and your saved
          copies. None of it affects your projection. Anything that changes your actual numbers lives in{' '}
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-text)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
          >
            Plan Settings
          </button>{' '}
          or the Full Interview instead.
        </p>
      </div>

      {/* --- Display ------------------------------------------------- */}
      <PrefSection
        icon={Sun}
        title="Display"
        description="How the app looks and how figures are shown. These apply to this browser only and aren't part of your plan or your saved scenarios."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '620px' }}>
          <PrefToggle
            icon={theme === 'dark' ? Moon : Sun}
            label="Theme"
            hint="Switch between the dark and light color schemes."
            active={theme === 'dark'}
            activeLabel="Dark"
            inactiveLabel="Light"
            onClick={toggleTheme}
          />
          <PrefToggle
            icon={Type}
            label="Large text"
            hint="Increases the base font size across every tab."
            active={largeTextMode}
            onClick={() => setLargeTextMode(!largeTextMode)}
          />
          <PrefToggle
            icon={Coins}
            label="Show figures in"
            hint="Today's Dollars adjusts every future figure back to what it would buy now. Future Dollars shows the raw, un-adjusted amounts."
            active={useRealDollars}
            activeLabel="Today's Dollars"
            inactiveLabel="Future Dollars"
            onClick={() => setUseRealDollars(!useRealDollars)}
          />
          <PrefToggle
            icon={Eye}
            label="Plan Status bar"
            hint="The floating status and ending-balance readout pinned to the bottom-right corner. It sits on top of page content on wide tables, so it can be dismissed from the bar itself — this is where you bring it back."
            active={!statusBarHidden}
            activeLabel="Shown"
            inactiveLabel="Hidden"
            onClick={() => setStatusBarHidden(!statusBarHidden)}
          />
          <PrefToggle
            icon={Dices}
            label="Monte Carlo runs itself"
            hint="A few seconds after you stop editing, the Monte Carlo re-runs in the background so the range on the Ending Balance card stays current. It never runs twice for the same plan. Off, you press Run on Risk & Stress yourself. Defaults off in the phone apps."
            active={!!mcAutoRun}
            activeLabel="Automatic"
            inactiveLabel="Manual"
            onClick={() => setMcAutoRun(!mcAutoRun)}
          />
          <PrefToggle
            icon={Hash}
            label="Round far-future dollars"
            hint="Headline figures more than ten years out (Peak, Ending Balance, its range, the Readiness balances, the printed summary) show three significant figures — $3,410,000 rather than $3,408,199 — since a projection that far out is not precise to the dollar. The Year by Year ledger and the charts always keep every digit."
            active={!!roundFarDollars}
            activeLabel="Rounded"
            inactiveLabel="Exact"
            onClick={() => setRoundFarDollars(!roundFarDollars)}
          />
        </div>
      </PrefSection>

      {/* --- Live Pricing (Detailed Holdings module) ------------------ */}
      <PremiumMount id="preferencesPricing" />

      {/* --- Premium Access ------------------------------------------ */}
      <PrefSection
        icon={KeyRound}
        title="Premium Access"
        description="Unlocks Premium: Detailed Holdings, Retirement Spending, Readiness in Full, and Relocation & Residency. A key is sent by email and carries the address it was sent to, the Premium flag and its expiry, nothing else. Live Pricing is part of Detailed Holdings — each user connects their own Sheet for that."
        accent={premiumKeyStatusColor}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '620px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-sm)', marginBottom: '2px' }}>
            {isPremium
              ? <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
              : <AlertTriangle size={16} style={{ color: 'var(--text-secondary)' }} />}
            <span style={{ color: 'var(--text-secondary)' }}>
              Status: <strong style={{ color: premiumKeyStatusColor }}>{premiumKeyStatusLabel}</strong>
            </span>
          </div>
          {isPremium && <PremiumModuleVersions />}
          <button
            type="button"
            className="btn-outline"
            onClick={handlePremiumKeyClick}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
              padding: '12px 16px', textAlign: 'left', borderColor: 'var(--card-border)',
            }}
          >
            <KeyRound size={18} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
            <span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span style={{ fontWeight: 600 }}>Premium Access Key</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', fontWeight: 400 }}>
                Paste, replace, or clear your access token.
              </span>
            </span>
          </button>

        </div>
      </PrefSection>

      {/* --- Your Data ------------------------------------------------ */}
      <PrefSection
        icon={Save}
        title="Your Data"
        description="Everything in this app lives only in this browser's storage — a browser reset, 'Clear browsing data', a private window, or a new machine will wipe it with nothing left to recover from. A copy kept outside this browser is the only durable one."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '620px' }}>
          {/* Rendered only where the File System Access API actually
              exists. Showing a disabled button on Safari/iOS would be
              worse than showing nothing: it advertises a capability the
              browser will never gain, on the one page where a user goes
              looking for how to keep their data safe. Backup Everything
              below works everywhere and writes the identical file. */}
          {saveFileSupported && (
            <div style={{
              padding: '14px', borderRadius: '8px',
              border: `1px solid ${linkedFileName ? 'var(--accent-primary)' : 'var(--card-border)'}`,
              backgroundColor: 'var(--bg-secondary)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <FolderSync size={18} style={{ flexShrink: 0, color: 'var(--accent-text)' }} />
                <span style={{ fontWeight: 600 }}>Save to a file in your cloud folder</span>
              </div>
              <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
                Pick a file once, then save your whole plan to it in one click &mdash; no download, no hunting through
                your Downloads folder. This app never talks to Google, Dropbox or Apple and needs no account: it
                writes a file, and your own sync app is what uploads it.
              </p>
              {/* Front and center, not a parenthetical.
                  The original copy mentioned "whatever folder your computer
                  already syncs" in passing and assumed the reader knew
                  whether they had a sync client at all. Someone without one
                  would pick a file, see "Saved", and believe they had a
                  cloud backup while holding a purely local file — false
                  confidence, on the one feature whose entire job is to
                  prevent data loss. Worse than not shipping it.
                  And the app genuinely cannot check: the File System Access
                  API exposes handle.name and nothing else, so there is no
                  path to inspect and no way to tell a synced folder from
                  any other. Since it can't verify, it has to say so, and
                  hand the user a way to verify for themselves. */}
              <div style={{
                display: 'flex', gap: '9px', padding: '10px 12px', borderRadius: '6px',
                border: '1px solid rgba(234,179,8,0.25)', backgroundColor: 'rgba(234,179,8,0.06)',
                fontSize: 'var(--fs-xs)', lineHeight: 1.5, marginBottom: '12px',
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, color: 'var(--warning)', marginTop: '1px' }} />
                <div style={{ color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--warning)' }}>This only reaches the cloud if you already sync a folder.</strong>{' '}
                  You need a desktop sync app installed &mdash; Google Drive for Desktop, Dropbox, iCloud Drive or
                  OneDrive &mdash; and you have to pick a file <em>inside</em> the folder it watches.{' '}
                  <strong>This app can&rsquo;t check that for you:</strong> it only ever sees the file&rsquo;s name,
                  never where it lives. Pick somewhere else and the file is saved on this computer only, which a
                  failed disk or a new machine still loses.
                </div>
              </div>

              {/* The warning above tells the user they need a sync app;
                  without this it never tells them how to get one, which
                  leaves anyone who doesn't already have one at a dead end
                  on the page that just told them their data isn't safe.
                  Collapsed by default — the people who already sync a
                  folder (probably most) don't need to read any of it, and
                  the panel already carries a warning box.
                  Links are to first-party support pages only, each checked
                  2026-08-20. Deliberately not to download mirrors or
                  marketing pages: this is an app about someone's financial
                  data telling them to go install something. */}
              <details style={{ marginBottom: '12px' }}>
                <summary style={{
                  cursor: 'pointer', fontSize: 'var(--fs-xs)', color: 'var(--accent-text)',
                  display: 'flex', alignItems: 'center', gap: '6px', listStyle: 'revert',
                }}>
                  <BookOpen size={14} style={{ flexShrink: 0 }} />
                  <span>Don&rsquo;t have one of these? How to set one up</span>
                </summary>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: 1.6, padding: '10px 0 0 20px' }}>
                  <p style={{ margin: '0 0 10px' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Check first &mdash; you may already have one.</strong>{' '}
                    Click <strong>Choose a File</strong> above and look down the sidebar of the save dialog, or in your
                    home folder, for something called <em>Google Drive</em>, <em>Dropbox</em>, <em>iCloud Drive</em> or
                    <em> OneDrive</em>. If one is there, save into it and you&rsquo;re done &mdash; nothing else to install.
                  </p>
                  <p style={{ margin: '0 0 8px' }}>Otherwise, pick whichever service you already have an account with:</p>
                  <ul style={{ margin: '0 0 10px', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    <li>
                      <strong>Google Drive</strong> &mdash; install{' '}
                      <a href="https://support.google.com/drive/answer/10838124" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)' }}>
                        Drive for desktop <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'baseline' }} />
                      </a>. Adds a <em>Google Drive</em> location to Finder or File&nbsp;Explorer.
                    </li>
                    <li>
                      <strong>Dropbox</strong> &mdash; install the{' '}
                      <a href="https://www.dropbox.com/install" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)' }}>
                        desktop app <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'baseline' }} />
                      </a>. Creates a <em>Dropbox</em> folder in your home folder.
                    </li>
                    <li>
                      <strong>iCloud Drive</strong> &mdash; already on every Mac; turn it on in{' '}
                      <a href="https://support.apple.com/en-us/118443" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)' }}>
                        System Settings &rarr; your name &rarr; iCloud <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'baseline' }} />
                      </a>. Appears as <em>iCloud Drive</em> in the Finder sidebar.
                    </li>
                    <li>
                      <strong>OneDrive</strong> &mdash; built into Windows, or{' '}
                      <a href="https://support.microsoft.com/en-us/onedrive/download-onedrive" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)' }}>
                        download it <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'baseline' }} />
                      </a>. Creates a <em>OneDrive</em> folder in your home folder.
                    </li>
                  </ul>
                  <p style={{ margin: 0 }}>
                    Don&rsquo;t want to install anything? <strong>Backup Everything</strong> below needs none of this and
                    produces the identical file &mdash; it just downloads it, and where you keep it is up to you.
                  </p>
                </div>
              </details>

              {linkedFileName ? (
                <>
                  <div style={{ fontSize: 'var(--fs-xs)', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle2 size={15} style={{ flexShrink: 0, color: 'var(--success)' }} />
                      <code style={{ color: 'var(--text-primary)' }}>{linkedFileName}</code>
                    </div>
                    <div style={{ color: 'var(--text-muted)', marginTop: '4px', paddingLeft: '23px' }}>
                      {lastSavedAt
                        ? `Saved at ${lastSavedAt.toLocaleTimeString()}`
                        : 'Not saved yet this session — click Save Now to write your current plan.'}
                    </div>
                    {lastSavedAt && (
                      <div style={{ color: 'var(--text-muted)', marginTop: '6px', paddingLeft: '23px' }}>
                        Worth checking once: open your cloud service in a browser (drive.google.com, dropbox.com,
                        iCloud Drive) and confirm <code>{linkedFileName}</code> is actually there. If it isn&rsquo;t,
                        the file you picked is outside your synced folder &mdash; use <strong>Change File</strong> to
                        pick one inside it.
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button type="button" className="btn-primary" disabled={savingFile} onClick={handleSaveNow}
                      style={{ padding: '8px 16px', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <Save size={15} /> {savingFile ? 'Saving...' : 'Save Now'}
                    </button>
                    {/* The reverse direction. Restore Backup below can
                        open this same file through a file dialog, but the
                        app already knows which file it is — making the
                        user navigate to it again would be busywork. Routes
                        through the identical confirm-and-reload path, so
                        it is one fewer click, not a second restore
                        implementation. */}
                    <button type="button" className="btn-outline" disabled={savingFile} onClick={handleRestoreFromFile}
                      style={{ padding: '8px 14px', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <Upload size={15} /> Restore From It
                    </button>
                    <button type="button" className="btn-outline" disabled={savingFile} onClick={handleLinkSaveFile}
                      style={{ padding: '8px 14px', minHeight: 'auto' }}>
                      Change File
                    </button>
                    <button type="button" className="btn-outline" disabled={savingFile} onClick={handleUnlinkSaveFile}
                      style={{ padding: '8px 14px', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <Link2Off size={15} /> Unlink
                    </button>
                  </div>
                  <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
                    Saving is deliberate, not automatic &mdash; nothing is written until you click. Unlinking only
                    makes this app forget the file; the file itself is left exactly where it is.
                  </p>
                </>
              ) : (
                <button type="button" className="btn-outline" disabled={savingFile} onClick={handleLinkSaveFile}
                  style={{ padding: '9px 16px', minHeight: 'auto', borderColor: 'var(--accent-primary)', color: 'var(--accent-text)' }}>
                  Choose a File...
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            className="btn-outline"
            onClick={handleBackupEverything}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 16px',
              textAlign: 'left', borderColor: 'var(--accent-primary)', color: 'var(--accent-text)',
            }}
          >
            <Save size={18} style={{ flexShrink: 0 }} />
            <span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span style={{ fontWeight: 600 }}>Backup Everything</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', fontWeight: 400 }}>
                Downloads your plan, scenarios, holdings, and settings as one JSON file. Also in the sidebar, from any tab.
              </span>
            </span>
          </button>

          {/* Same file as Backup Everything, wrapped in a password
              (backupCrypto.js). Lives here rather than in the sidebar on
              purpose: the sidebar's two buttons are the emergency path
              and should stay a single click; this is the considered one. */}
          <button
            type="button"
            className="btn-outline"
            onClick={backupEverythingEncrypted}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 16px', textAlign: 'left' }}
          >
            <Lock size={18} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
            <span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span style={{ fontWeight: 600 }}>Encrypted Backup</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', fontWeight: 400 }}>
                The same file, locked with a password you choose (AES-256). For copies that leave this computer &mdash; cloud folders, email, a USB stick. There is no way to recover a forgotten password.
              </span>
            </span>
          </button>

          <button
            type="button"
            className="btn-outline"
            onClick={() => restoreFileInputRef.current?.click()}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 16px', textAlign: 'left' }}
          >
            <Upload size={18} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
            <span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span style={{ fontWeight: 600 }}>Restore Backup</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', fontWeight: 400 }}>
                Replaces everything in this browser with a backup file&rsquo;s contents, then reloads. Opens plain and password-protected files alike.
              </span>
            </span>
            <input
              ref={restoreFileInputRef}
              type="file"
              accept=".json"
              onChange={handleRestoreFileChosen}
              style={{ display: 'none' }}
            />
          </button>

          {/* Reminder cadence for the "keep the data real" banner --
              how often the app may prompt for a statement import /
              balance refresh, and (unconditionally, at 14 days with
              unsaved changes) a backup. See dataFreshness.js. */}
          <div style={{
            padding: '14px', borderRadius: '8px',
            border: '1px solid var(--card-border)', backgroundColor: 'var(--bg-secondary)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <BellRing size={18} style={{ flexShrink: 0, color: 'var(--accent-text)' }} />
              <span style={{ fontWeight: 600 }}>Data freshness reminders</span>
            </div>
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
              A projection is only as honest as its inputs. When a new brokerage statement should have arrived,
              a banner reminds you to import it (or refresh balances in Quick Update); a separate reminder appears
              when the plan has changed but hasn&rsquo;t been backed up for two weeks. Dismissing either snoozes it
              for a week &mdash; it never goes away for good, on purpose.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label htmlFor="field-portfolio-reminder-cadence" style={{ fontSize: 'var(--fs-sm)', margin: 0 }}>
                Remind me to update portfolio data
              </label>
              <select
                id="field-portfolio-reminder-cadence"
                className="form-input form-input-select"
                style={{ width: 'auto', minWidth: '140px' }}
                value={reminderCadence}
                onChange={handleCadenceChange}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="off">Never</option>
              </select>
            </div>
            {(() => {
              const fresh = computeFreshnessStatus();
              return (
                <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
                  {fresh.everPortfolioUpdated
                    ? `Portfolio data last updated ${formatAgeDays(fresh.portfolioAgeDays)}.`
                    : 'Portfolio data has not been reconciled yet this cycle.'}{' '}
                  {fresh.everBackedUp
                    ? `Last backup ${formatAgeDays(fresh.backupAgeDays)}.`
                    : 'No backup has been made yet.'}
                </p>
              );
            })()}
          </div>

          <LocalOnlyModeCard />
          <AnalyticsOptInCard />

          <button
            type="button"
            className="btn-outline"
            onClick={() => { setOnboardingStep(1); setShowOnboarding(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 16px', textAlign: 'left' }}
          >
            <Sparkles size={18} style={{ flexShrink: 0, color: 'var(--accent-text)' }} />
            <span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span style={{ fontWeight: 600 }}>Re-run the Setup Wizard</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', fontWeight: 400 }}>
                Walks back through the six-step quick setup. Your existing answers are pre-filled, nothing is cleared.
              </span>
            </span>
          </button>


          {/* Moved here from Ledger & Scenarios' "Cloud Backup & Sync" panel
              when that duplicate was removed (2026-08-19). It belongs
              wherever the buttons are: the file really does contain a
              working credential when Premium is active, and that's worth
              saying next to the button that produces it, not on a tab the
              user may never open. */}
          <div
            style={{
              marginTop: '4px', padding: '12px 14px', borderRadius: '8px',
              border: '1px solid rgba(234,179,8,0.25)', backgroundColor: 'rgba(234,179,8,0.06)',
              fontSize: 'var(--fs-xs)', display: 'flex', gap: '10px', lineHeight: 1.5,
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0, color: 'var(--warning)', marginTop: '1px' }} />
            <div style={{ color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--warning)' }}>Handle backup files like a password file.</strong> They&rsquo;re
              plain, unencrypted JSON &mdash; and if you have an active Premium Access Key, the file carries that working
              credential too. Anything with access to wherever you store them (Google Drive, iCloud, a shared folder)
              can read them in the clear.
            </div>
          </div>

          {/* Destructive, so it's last, visually separated, and styled as
              the only red control on the page. It was previously a plain
              footer button sitting directly above the Premium Access Key,
              one mis-click away at all times from every tab. */}
          <div style={{ marginTop: '8px', paddingTop: '16px', borderTop: '1px solid var(--card-border)' }}>
            <button
              type="button"
              className="btn-outline"
              onClick={handleReset}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 16px',
                textAlign: 'left', borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--danger)',
              }}
            >
              <RefreshCw size={18} style={{ flexShrink: 0 }} />
              <span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={{ fontWeight: 600 }}>Reset Plan to Defaults</span>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', fontWeight: 400 }}>
                  Resets the active plan only. Saved scenarios, holdings, the checklist and your Life Plan stay.
                </span>
              </span>
            </button>
          </div>

          {/* The danger zone's last control, and the one privacy.html and
              terms.html name: removes everything the app keeps here. */}
          <div style={{ paddingTop: '12px', borderTop: '1px dashed rgba(239, 68, 68, 0.4)' }}>
            <button
              type="button"
              className="btn-outline"
              data-testid="erase-everything"
              onClick={handleEraseEverything}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 16px',
                textAlign: 'left', borderColor: 'var(--danger)', color: 'var(--danger)',
              }}
            >
              <Trash2 size={18} style={{ flexShrink: 0 }} />
              <span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={{ fontWeight: 600 }}>Erase everything on this device</span>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', fontWeight: 400 }}>
                  Removes your plan, scenarios, holdings, checklist, Life Plan, Premium Access key, Live Pricing connection and preferences from this browser. Back up first: this can&rsquo;t be undone.
                </span>
              </span>
            </button>
          </div>

          {/* The disclaimer had no way back to it: setShowDisclaimer was
              only ever called with false, so one click on first visit put
              the text permanently out of reach. Placed here rather than in
              a section of its own because Preferences is already where
              "about this app, not about my plan" lives, and a whole
              PrefSection for one link would give it more visual weight
              than the Reset control above it deserves to lose. */}
          <div style={{ marginTop: '4px', paddingTop: '14px', borderTop: '1px solid var(--card-border)' }}>
            <button
              type="button"
              className="btn-outline"
              onClick={() => setShowDisclaimerReview(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 16px', textAlign: 'left' }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
              <span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={{ fontWeight: 600 }}>Educational Tool Disclaimer</span>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', fontWeight: 400 }}>
                  Re-read the terms shown when you first opened the app. Also linked from the footer of every tab.
                </span>
              </span>
            </button>
          </div>

          {/* Terms, policy and copyright. The disclaimer above says the
              numbers are not advice; these say what you may do with the
              software and what we hold about you — neither had a route
              from inside the app until 2026-09-20, when the product got a
              license and terms at all. Plain links, not buttons: they open
              static documents that live outside the SPA. */}
          <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--card-border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
            <a href={TERMS_URL} className="app-disclaimer-footer-link">Terms of Use</a>
            <a href={PRIVACY_URL} className="app-disclaimer-footer-link">Privacy Policy</a>
            <a href={ACCESSIBILITY_URL} className="app-disclaimer-footer-link">Accessibility</a>
            <a href="/verify" className="app-disclaimer-footer-link">Verify it yourself</a>
            <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{COPYRIGHT_NOTICE}</span>
            {/* Which build this is, for support questions. */}
            <span data-testid="build-version" title={BUILD_DATE ? `Built ${BUILD_DATE}` : undefined} style={{ flexBasis: '100%', color: 'var(--text-muted)' }}>{versionLabel()}</span>
            <p style={{ flexBasis: '100%', margin: '4px 0 0', color: 'var(--text-primary)', fontWeight: 600 }}>{PRIVACY_PROMISE}</p>
          </div>
        </div>
      </PrefSection>
    </div>
  );
};

export default PreferencesTab;
