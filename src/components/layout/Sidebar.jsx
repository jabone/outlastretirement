import React, { useRef, useState } from 'react';
import { PRINT_PACKET_EVENT } from '../printPacketEvents';
import { useSimulation } from '../../context/useSimulation';
import { planVerdict, verdictClass } from '../../utils/planVerdict';
import { readPlanMode, tabForMode } from '../../utils/planMode';
import { useEntitlement } from '../../context/useEntitlement';
import { Compass, Gauge, ShieldAlert, HelpCircle, FileText, Settings, SlidersHorizontal, PanelLeftClose, PanelLeftOpen, TrendingUp, BarChart2, Trophy, Copy, Printer, CheckCircle, Zap, X, PieChart, Save, Upload, Lock, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { APP_VERSION } from '../../config/buildInfo';
import HoverTooltip from '../HoverTooltip';
import BrandMark from '../BrandMark';
import { formatHash, DEFAULT_TAB } from '../../utils/tabRouting';
import { NAV_PRIMARY, NAV_MORE, NAV_MORE_TABS, readNavMoreOpen, writeNavMoreOpen } from '../../config/navItems';
import { useFullBackupActions } from '../../context/useFullBackupActions';
import { computeFreshnessStatus, formatAgeDays } from '../../utils/dataFreshness';

// Icon names in config/navItems.js resolve here, so the config stays plain data.
const NAV_ICONS = { TrendingUp, Settings, Gauge, FileText, PieChart, Sparkles, HelpCircle, Trophy, ShieldAlert, BarChart2, Copy, Compass, SlidersHorizontal };

const Sidebar = ({ isSidebarOpen, setIsSidebarOpen, showDisclaimer, isMobileNavOpen, setIsMobileNavOpen }) => {
  const { activeTab, setActiveTab, kpis, verdict: sharedVerdict, scenarios, handleSaveScenario, isSavingScenario, setShowQuickUpdate, showPrompt } = useSimulation();
  const verdict = sharedVerdict || planVerdict({ isSuccessful: kpis?.isSuccessful });
  const { isPremium } = useEntitlement();
  const restoreFileInputRef = useRef(null);

  // Backup/restore behavior lives in useFullBackupActions (see that file
  // for why). These two buttons keep their always-visible placement on
  // purpose: they exist because a user lost an entire plan to a browser
  // reset, and recovery should never be more than one click from any tab.
  // Preferences > Your Data offers the same two actions as its canonical,
  // findable home -- both now run identical code.
  const { backupEverything, restoreFromFile } = useFullBackupActions();
  const handleBackupEverything = backupEverything;
  const handleRestoreFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    await restoreFromFile(file);
  };

  // Nav items are plain divs (not <button>/<a>) for layout flexibility, so they
  // need explicit keyboard semantics: reachable via Tab, activatable with Enter/Space.
  // Also closes the mobile drawer on selection -- on desktop setIsMobileNavOpen
  // is harmless (the drawer CSS only applies at narrow widths), but on mobile
  // a nav tap should both switch tabs AND dismiss the overlay, same as any
  // standard mobile nav drawer.
  // One Plan entry for the two Plan tabs (changelog 252): open whichever
  // view was used last. Both tab ids, routes and deep links are unchanged.
  const planTab = tabForMode(readPlanMode());
  const handleNavClick = (tabId) => () => {
    setActiveTab(tabId);
    if (setIsMobileNavOpen) setIsMobileNavOpen(false);
  };
  const handleNavKeyDown = (tabId) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setActiveTab(tabId);
      if (setIsMobileNavOpen) setIsMobileNavOpen(false);
    }
  };

  // "Explore more": remembered per browser, and forced open while the
  // current tab is one of its entries.
  const [moreOpenPref, setMoreOpenPref] = useState(() => readNavMoreOpen());
  const moreOpen = moreOpenPref || NAV_MORE_TABS.has(activeTab);
  const setMoreOpen = (fn) => {
    const next = typeof fn === 'function' ? fn(moreOpen) : fn;
    setMoreOpenPref(next);
    writeNavMoreOpen(next);
  };
  const renderNavItem = (e) => {
    const Icon = NAV_ICONS[e.icon];
    const target = e.id === 'plan' ? planTab : e.id;
    const active = e.matches.includes(activeTab);
    return (
      <HoverTooltip key={e.id} text={e.tip}>
        <div
          className={`nav-item ${active ? 'active' : ''}`}
          onClick={handleNavClick(target)}
          role="button"
          tabIndex={0}
          aria-current={active ? 'page' : undefined}
          onKeyDown={handleNavKeyDown(target)}
          data-nav={e.id}
        >
          <Icon size={18} />
          <span>{e.label}</span>
          {e.premiumLocked && <Lock size={12} style={{ marginLeft: 'auto', opacity: 0.6, flexShrink: 0 }} aria-label="Premium feature" />}
        </div>
      </HoverTooltip>
    );
  };

  return (
    <aside className={`sidebar ${!isSidebarOpen ? 'minimized' : ''} ${isMobileNavOpen ? 'mobile-open' : ''}`}>
        {/* Mobile-only close (X) button for the drawer -- hidden on desktop via CSS. */}
        <button
          className="mobile-drawer-close"
          onClick={() => setIsMobileNavOpen && setIsMobileNavOpen(false)}
          aria-label="Close navigation menu"
        >
          <X size={20} />
        </button>
        {/* Collapse/expand toggle: floats on the border between the sidebar
            and main content (half-overlapping each), rather than living
            cramped inside the logo row next to a long brand string. This is
            the same "edge-anchored" pattern VS Code/Notion/Linear use for
            their sidebar toggles — it stays in the exact same spot whether
            the sidebar is expanded or minimized, so it's always easy to find
            and never gets squeezed by neighboring content. */}
        <HoverTooltip text={isSidebarOpen ? "Minimize Sidebar" : "Expand Sidebar"}>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="sidebar-collapse-toggle"
            aria-label={isSidebarOpen ? "Minimize Sidebar" : "Expand Sidebar"}
          >
            {isSidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
        </HoverTooltip>
        {/* The mark is a link home, the way a site logo is. A real <a> and
            not a click handler: it is keyboard-reachable, it shows where it
            goes on hover, and middle-click still opens a tab. The href comes
            from the router's own default so it cannot drift from it. */}
        <a className="logo-container brand-home" href={formatHash(DEFAULT_TAB)} aria-label="OutlastRetirement — go to Dashboard">
          {/* The rail IS the compact nav surface the brand assigns the
              monogram to, and the full lockup does not fit in it — collapsed,
              it was clipping to "Outl / Retire". The wide line above the KPIs
              (App.jsx, .collapsed-brand) carries the spelled-out lockup while
              this is narrow, so the product is still named on the page. */}
          <BrandMark variant={isSidebarOpen ? 'full' : 'short'} height={isSidebarOpen ? 30 : 32} />
        </a>

        {/* Plan status badge. Hidden while the legal disclaimer modal is up
            front-and-center — this badge was visible (dimmed, but legible)
            through the modal overlay on a brand-new visit before this fix,
            which showed plan results before the user had accepted the terms. */}
        {!showDisclaimer && (
        <div className={`sidebar-status ${verdictClass(verdict.tone)}`} title={verdict.detail}>
          {verdict.label}
        </div>
        )}

        {/* Quick Update: the handful of numbers people actually change day-to-day,
            without having to dig through the full Plan Settings pages. */}
        <HoverTooltip text="Quick Update: balances, salary, retirement age & SS claiming age">
          <button
            className="btn-primary"
            onClick={() => setShowQuickUpdate(true)}
            style={{
              width: '100%',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isSidebarOpen ? 'flex-start' : 'center',
              gap: '8px',
              margin: '4px 0 8px',
              minHeight: 'auto',
            }}
          >
            <Zap size={16} />
            <span>Quick Update</span>
          </button>
        </HoverTooltip>

        {/* The nav (changelog 287): six entries always, the rest behind
            "Explore more" (config/navItems.js). The fold remembers its
            state per browser and opens itself when the current tab lives
            inside it, so a deep link or a Plan Feedback jump never lands
            on a hidden entry. */}
        <nav className="nav-links">
          {NAV_PRIMARY.filter((e) => (e.premium ? isPremium : e.premiumLocked ? !isPremium : true)).map((e) => renderNavItem(e))}
          <button
            type="button"
            className={`nav-item nav-more-toggle ${moreOpen ? 'open' : ''}`}
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-controls="nav-more"
            data-testid="nav-more-toggle"
            style={{ width: '100%', background: 'none', border: 'none', font: 'inherit', textAlign: 'left' }}
          >
            {moreOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span>{moreOpen ? 'Explore less' : 'Explore more'}</span>
          </button>
          {moreOpen && (
            <div id="nav-more" className="nav-more" data-testid="nav-more">
              {NAV_MORE.map((e) => renderNavItem(e))}
            </div>
          )}
        </nav>

        {/* Action items in sidebar footer */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* Backup Everything: deliberately the FIRST thing in this
              section, visible from every tab. Preferences > Your Data is
              its findable home; this copy exists so recovery is never more
              than one click away, and both run the same code
              (useFullBackupActions). This
              exists because "Saved to Browser Cache" below is true right
              up until something clears that cache — a fresh browser
              profile, "Clear browsing data," an incognito window, a new
              machine — and at that point the only copy of a user's plan
              is whatever file they'd already downloaded. */}
          <HoverTooltip text="Download everything needed to restore your plan on this or another browser">
            <button
              className="btn-outline"
              onClick={handleBackupEverything}
              style={{
                width: '100%',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: isSidebarOpen ? 'flex-start' : 'center',
                gap: '8px',
                borderColor: 'var(--accent-primary)',
                color: 'var(--accent-text)',
              }}
            >
              <Save size={14} />
              <span>Backup Everything</span>
            </button>
          </HoverTooltip>
          <HoverTooltip text="Restore your plan from a Backup Everything (or Cloud Backup & Sync) file">
            <button
              className="btn-outline"
              onClick={() => restoreFileInputRef.current?.click()}
              style={{
                width: '100%',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: isSidebarOpen ? 'flex-start' : 'center',
                gap: '8px',
              }}
            >
              <Upload size={14} />
              <span>Restore Backup</span>
              <input
                ref={restoreFileInputRef}
                type="file"
                accept=".json"
                onChange={handleRestoreFileChosen}
                style={{ display: 'none' }}
              />
            </button>
          </HoverTooltip>

          <HoverTooltip text="Save Current Scenario">
            <button
              className="btn-outline"
              disabled={isSavingScenario}
              aria-busy={isSavingScenario}
              onClick={() => {
                showPrompt('Enter a name for this scenario:', {
                  title: 'Save Scenario',
                  defaultValue: 'Scenario ' + (scenarios.length + 1),
                  confirmLabel: 'Save',
                }).then((name) => {
                  if (name && name.trim()) {
                    handleSaveScenario(name.trim());
                  }
                });
              }}
              style={{
                width: '100%',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: isSidebarOpen ? 'flex-start' : 'center',
                gap: '8px',
                borderColor: 'var(--accent-primary)',
                color: 'var(--accent-text)'
              }}
            >
              <Copy size={14} />
              <span>Save Current Scenario</span>
            </button>
          </HoverTooltip>
          <button
            className="btn-outline"
            data-testid="open-print-packet"
            onClick={() => window.dispatchEvent(new Event(PRINT_PACKET_EVENT))}
            style={{
              width: '100%',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              borderColor: 'var(--success)',
              color: 'var(--success)'
            }}
          >
            <Printer size={14} />
            <span>Print / PDF Report</span>
          </button>

          {/* "Download Config" (a lightweight activeInputs + projectionSummary
              -only export) was removed 2026-08-18 as part of consolidating to
              one JSON backup path — it was fully redundant with Backup
              Everything above once projectionSummary was folded into that
              payload (see fullBackup.js's buildFullBackupPayload options
              param), and having two similarly-named JSON downloads side by
              side (one restorable, one not) was exactly the kind of
              "too many export options" confusion this cleanup was for. */}
          {/* Live data-freshness readout (dataFreshness.js). Previously a
              static "Auto-saved to this browser only" disclosure (and
              before that, a misleading green "Saved to Browser Cache"
              checkmark). Now it states the two dates that actually matter
              — when a durable copy last left this browser, and when the
              portfolio numbers were last reconciled — and turns amber
              when either is overdue. The banner (DataFreshnessBanner)
              carries the actions; this line is the always-visible truth. */}
          {(() => {
            const fresh = computeFreshnessStatus();
            const stale = fresh.backupOverdue || fresh.portfolioOverdue;
            const backupText = fresh.everBackedUp
              ? `Backed up ${formatAgeDays(fresh.backupAgeDays)}`
              : 'Never backed up';
            const portfolioText = fresh.everPortfolioUpdated
              ? `data updated ${formatAgeDays(fresh.portfolioAgeDays)}`
              : 'data never reconciled';
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: 'var(--fs-xs)', color: stale ? 'var(--warning)' : 'var(--text-secondary)', opacity: stale ? 1 : 0.8, marginTop: '4px', textAlign: 'center' }}>
                {stale ? <ShieldAlert size={12} style={{ flexShrink: 0 }} /> : <CheckCircle size={12} style={{ flexShrink: 0 }} />}
                <span>
                  {`${backupText} · ${portfolioText} — auto-saved to this browser only`}
                </span>
              </div>
            );
          })()}
        </div>
        <div style={{ marginTop: 'auto', paddingTop: '24px', borderTop: '1px solid var(--card-border)', width: '100%' }}>
          {/* Theme, Large Text, Today's/Future Dollars, Reset Plan, the
              Premium Access Key, and
              the Setup Wizard all moved to the Preferences tab
              (2026-08-19, IA Phase 2 — see IA_REVIEW.md). They were app
              settings scattered through a nav rail, in two visually
              separate blocks ~200 lines apart, with no single place to
              look for them.

              What stays here is deliberate: Backup Everything and Restore
              Backup keep their always-visible placement because they exist
              in response to a real data-loss incident (see the comment on
              them above) — burying recovery one click deeper would undo
              that fix. Save Current Scenario stays for the same kind of
              reason: snapshotting the plan before experimenting is worth a
              one-click path from any tab, and the Scenarios tab's own copy
              is the findable home rather than the only door. Print renders
              the whole plan, not one tab's worth, so it has no better
              owner than here. */}
          <div style={{ marginTop: '12px', textAlign: 'center', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            {/* The changelog's version number, not package.json's (which
                never moved and shipped the whole manifest in the bundle). */}
            v{APP_VERSION}
          </div>
        </div>
      </aside>
  );
};

export default Sidebar;
