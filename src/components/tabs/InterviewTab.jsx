import React, { useState, useEffect, useRef } from 'react';
import { useSimulation } from '../../context/useSimulation';
import { notAskedForSection, notAskedByDomain, SETTINGS_DOMAINS } from '../../config/inputCoverage';
import {
  Users, DollarSign, Wallet, PiggyBank, Home, HeartPulse, TrendingDown,
  Landmark, Gift, Sparkles, CheckCircle, Briefcase, ClipboardCheck,
  ShieldCheck, ChevronRight, ChevronLeft, RefreshCw, ArrowRight,
} from 'lucide-react';
import { GuidedSection } from '../plan/sectionShared';
import FindSetting from '../FindSetting';
import PlanModeSwitch from '../plan/PlanModeSwitch';
import { writePlanMode, settingsSubTabFor } from '../../utils/planMode';
import DemographicsSection from '../plan/sections/DemographicsSection';
import SalariesSection from '../plan/sections/SalariesSection';
import PartTimeSection from '../plan/sections/PartTimeSection';
import AnnuitiesPensionsSection from '../plan/sections/AnnuitiesPensionsSection';
import SocialSecuritySection from '../plan/sections/SocialSecuritySection';
import InitialBalancesSection from '../plan/sections/InitialBalancesSection';
import BucketSharesSection from '../plan/sections/BucketSharesSection';
import ContributionsSection from '../plan/sections/ContributionsSection';
import ContribAdvisorSection from '../plan/sections/ContribAdvisorSection';
import RetirementSpendSection from '../plan/sections/RetirementSpendSection';
import CurrentSpendSection from '../plan/sections/CurrentSpendSection';
import SpendingPhasesSection from '../plan/sections/SpendingPhasesSection';
import HealthcareSection from '../plan/sections/HealthcareSection';
import WithdrawalSection from '../plan/sections/WithdrawalSection';
import RothConversionSection from '../plan/sections/RothConversionSection';
import MedicareIrmaaSection from '../plan/sections/MedicareIrmaaSection';
import RsuSection from '../plan/sections/RsuSection';
import NqdcSection from '../plan/sections/NqdcSection';
import ConcentratedStockSection from '../plan/sections/ConcentratedStockSection';
import LifeEventsSection from '../plan/sections/LifeEventsSection';
import DebtSection from '../plan/sections/DebtSection';
import LifeInsuranceSection from '../plan/sections/LifeInsuranceSection';
import ReturnAssumptionsSection from '../plan/sections/ReturnAssumptionsSection';
import GranularInflationSection from '../plan/sections/GranularInflationSection';
import StateTaxesSection from '../plan/sections/StateTaxesSection';
import LegislativeRisksSection from '../plan/sections/LegislativeRisksSection';
import EstateHeirsSection from '../plan/sections/EstateHeirsSection';
import { planVerdict, verdictClass } from '../../utils/planVerdict';
import { safeSetItem } from '../../utils/safeStorage';
import { SECTIONS } from './interviewSections';

// The Full Guided Interview -- a section-by-section walkthrough of the plan.
//
// IA Phase 3 step 2 (2026-09-24): this tab no longer carries its own copy of
// any field. Every step MOUNTS the same section components Plan Settings
// renders (src/components/plan/sections), wrapped in <GuidedSection>, which
// folds fields outside src/config/guidedCore.js under "More options". So
// there is exactly one piece of JSX per input in the app; what the
// Interview adds is the framing -- one step at a time, yes/no gates that
// skip whole topics, progress, the "not asked here" pointers, and the
// Review page. (The old version duplicated ~140 fields as simplified
// copies of Settings, and the two drifted; inputCoverage.test.js was the
// tripwire. It now reads the core list instead.)
//
// Every field reads and writes the same `inputs` object Plan Settings
// does -- start here, finish there, or the reverse; nothing is lost.
const PROGRESS_KEY = 'retire_plan_interview_progress';

const SectionHeader = ({ Icon, title, subtitle }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '22px' }}>
    <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(42, 127, 122, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={19} style={{ color: 'var(--accent-text)' }} />
    </div>
    <div>
      <h2 style={{ fontSize: '19px', fontWeight: '700', margin: 0 }}>{title}</h2>
      <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.5', maxWidth: '640px' }}>{subtitle}</p>
    </div>
  </div>
);

const Grid = ({ children, cols = 2 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: '4px 20px' }}>{children}</div>
);

const SubCard = ({ title, children }) => (
  <div style={{ padding: '16px 18px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', marginBottom: '16px' }}>
    {title && <h4 style={{ fontSize: 'var(--fs-body)', fontWeight: '600', margin: '0 0 12px 0', color: 'var(--text-primary)' }}>{title}</h4>}
    {children}
  </div>
);

const ToggleRow = ({ label, hint, checked, onChange }) => {
  const inputId = React.useId();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', margin: '4px 0' }}>
      <span className="custom-switch" style={{ marginTop: '2px', flexShrink: 0 }}>
        <input id={inputId} type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="slider-round"></span>
      </span>
      <div>
        <label htmlFor={inputId} style={{ fontSize: 'var(--fs-body)', color: 'var(--text-primary)', fontWeight: 500, cursor: 'pointer', display: 'block' }}>{label}</label>
        {hint && <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.4' }}>{hint}</div>}
      </div>
    </div>
  );
};

// A top-level yes/no "gate": the question is always visible; the sections
// inside only render once the user confirms it applies to them. This is
// what keeps the walkthrough from being "every input in the app" -- most
// households skip most gates. Gates are UI state, lazily opened when the
// plan already has something inside them, never written to the plan.
const Gate = ({ question, hint, checked, onToggle, children }) => (
  <div>
    <div className="glass-panel" style={{ padding: '16px 20px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)' }}>
      <ToggleRow label={question} hint={hint} checked={checked} onChange={onToggle} />
    </div>
    {checked && (
      <div style={{ borderLeft: '3px solid var(--accent-primary)', paddingLeft: '18px', marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {children}
      </div>
    )}
  </div>
);

// Points at what this step's sections fold away or leave to another tab.
// The list comes from src/config/inputCoverage.js, which a test re-derives
// against the core list so it can't quietly go stale.
const AlsoInPlanSettings = ({ sectionId, onGoTo }) => {
  const items = notAskedForSection(sectionId);
  if (!items.length) return null;
  return (
    <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px dashed var(--card-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Sparkles size={15} style={{ color: 'var(--text-muted)' }} />
        <h4 style={{ fontSize: 'var(--fs-body)', fontWeight: '600', margin: 0, color: 'var(--text-secondary)' }}>
          Not asked here, but available
        </h4>
      </div>
      <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', margin: '0 0 12px' }}>
        Folded under &ldquo;More options&rdquo; above, or on the Plan Settings page named beside each one. Everything already answered stays as it is.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {items.map((item) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--fs-body)', fontWeight: '600' }}>{item.title}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.blurb}</div>
            </div>
            <button
              type="button"
              className="btn-outline"
              style={{ whiteSpace: 'nowrap', padding: '4px 10px', fontSize: 'var(--fs-xs)' }}
              onClick={() => onGoTo(item.domain)}
            >
              {SETTINGS_DOMAINS[item.domain]} &rarr;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// Guided density: identical to Plan Settings, minus the fields the first
// pass folds away. Defined at module level so React keeps the section's
// state across re-renders (an inline wrapper would remount it every time).
const G = ({ children }) => <GuidedSection>{children}</GuidedSection>;

const InterviewTab = () => {
  const { inputs, formatCurrency, setActiveTab, setSettingsSubTab, setTaxestateSubTab, kpis, verdict: sharedVerdict } = useSimulation();
  const verdict = sharedVerdict || planVerdict({ isSuccessful: kpis?.isSuccessful });

  // ---- Section position + visited tracking (persisted separately from
  // `inputs` -- UI navigation state, not plan data). ---------------------
  const [current, setCurrent] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
      return SECTIONS.some(s => s.id === saved.current) ? saved.current : 'household';
    } catch { return 'household'; }
  });
  const [visited, setVisited] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
      return Array.isArray(saved.visited) ? saved.visited : [];
    } catch { return []; }
  });
  useEffect(() => {
    setVisited(prev => prev.includes(current) ? prev : [...prev, current]);
  }, [current]);
  useEffect(() => {
    safeSetItem(PROGRESS_KEY, JSON.stringify({ current, visited }));
  }, [current, visited]);

  const goTo = (id) => { setCurrent(id); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const idx = SECTIONS.findIndex(s => s.id === current);
  const goNext = () => { if (idx < SECTIONS.length - 1) goTo(SECTIONS[idx + 1].id); };
  const goBack = () => { if (idx > 0) goTo(SECTIONS[idx - 1].id); };
  const goToPlanSettings = (domain) => {
    setActiveTab('settings');
    if (domain) setSettingsSubTab(domain);
  };
  // This is the Guided view of the one Plan destination (changelog 252):
  // remember that, and let the switch carry the current step across to the
  // Plan Settings sub-tab holding the same sections.
  useEffect(() => { writePlanMode('guided'); }, []);
  const switchToAdvanced = () => {
    writePlanMode('advanced');
    setSettingsSubTab(settingsSubTabFor(current));
    setActiveTab('settings');
  };
  // "Find a setting" (changelog 290): land on the Guided step holding the
  // field; a field with no step (Plan Settings only) switches to Advanced.
  const findPick = (entry) => {
    if (entry.tab !== 'settings') {
      if (entry.tab === 'taxestate') setTaxestateSubTab(entry.subTab);
      setActiveTab(entry.tab);
    } else if (entry.step) {
      setCurrent(entry.step);
    } else {
      writePlanMode('advanced');
      setSettingsSubTab(entry.subTab);
      setActiveTab('settings');
    }
  };

  // Keep the current step's chip scrolled into view in the section rail.
  const railRef = useRef(null);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const activeBtn = rail.querySelector('.sub-tab-button.active');
    if (!activeBtn) return;
    const targetLeft = activeBtn.offsetLeft - (rail.clientWidth * 0.35) + (activeBtn.clientWidth / 2);
    rail.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }, [current]);

  // ---- Section gates. Lazy-initialized from whatever's already in the
  // plan so returning here after using Plan Settings doesn't hide something
  // already configured. ---------------------------------------------------
  const [gPension, setGPension] = useState(() => inputs.pension1 > 0 || (inputs.spouse2Enabled && inputs.pension2 > 0) || inputs.annuityIncome > 0 || inputs.rentalIncome > 0 || inputs.annuityPurchaseAmount > 0);
  const [gRoth, setGRoth] = useState(() => inputs.rothConversionStrategy !== 'none' || inputs.backdoorRothEnabled || inputs.qcdAnnualAmount > 0 || !!inputs.acaCliffProtectionEnabled || inputs.acaSubsidyAnnualValue > 0 || !!inputs.acaSubsidyProtectionEnabled);
  const [gEquity, setGEquity] = useState(() => (inputs.rsuGrants && inputs.rsuGrants.length > 0) || inputs.rsuRefreshEnabled1 || inputs.rsuRefreshEnabled2 || inputs.nqdcEnabled1 || inputs.nqdcEnabled2 || !!inputs.concentratedStockEnabled);
  const [gMilestones, setGMilestones] = useState(() => !!(inputs.milestones && inputs.milestones.length > 0) || !!inputs.giftingEnabled);
  const [gDebt, setGDebt] = useState(() => inputs.mortgageBalance > 0 || inputs.otherDebtBalance > 0 || !!inputs.reverseMortgageEnabled || !!inputs.homeOwned || inputs.otherEstateAssetsInit > 0 || !!inputs.lifeInsuranceEnabled1 || !!inputs.lifeInsuranceEnabled2);
  const [gPolicyRisk, setGPolicyRisk] = useState(() => !!(inputs.ssDepletionEnabled || inputs.tcjaSunsetEnabled || inputs.irmaaFreezeEnabled));

  // ---- Steps ------------------------------------------------------------
  const renderSection = () => {
    switch (current) {
      case 'household': return (
        <>
          <SectionHeader Icon={Users} title="Household & Identity" subtitle="Who this plan is for. These ages, names and Social Security figures drive every chart, tax calculation and benefit estimate in the app." />
          <G><DemographicsSection /></G>
          <G><SocialSecuritySection forceOpen /></G>
        </>
      );

      case 'income': return (
        <>
          <SectionHeader Icon={DollarSign} title="Income" subtitle="Current working income, and any part-time work after retirement. Social Security is on the Household step." />
          <G><SalariesSection /></G>
          <G><PartTimeSection /></G>
        </>
      );

      case 'pensions': return (
        <>
          <SectionHeader Icon={Briefcase} title="Pensions, Annuities & Other Income" subtitle="Income beyond salary and Social Security — pensions, existing annuities, rental income, or an annuity you plan to buy." />
          <Gate question="Do you (or your spouse) expect a pension, an annuity, or rental income in retirement?" checked={gPension} onToggle={setGPension}>
            <G><AnnuitiesPensionsSection forceOpen /></G>
          </Gate>
        </>
      );

      case 'balances': return (
        <>
          <SectionHeader Icon={Wallet} title="Current Account Balances" subtitle="What you already have saved, broken out by tax treatment — Pre-Tax, Roth and Taxable accounts are each taxed completely differently later." />
          <G><InitialBalancesSection /></G>
          <G><BucketSharesSection /></G>
        </>
      );

      case 'savings': return (
        <>
          <SectionHeader Icon={PiggyBank} title="Ongoing Savings & Employer Match" subtitle="How much you're setting aside each year while still working." />
          <G><ContributionsSection /></G>
          <G><ContribAdvisorSection /></G>
        </>
      );

      case 'spending': return (
        <>
          <SectionHeader Icon={Home} title="Retirement Spending & Lifestyle" subtitle="What you plan to spend once retired, what you spend today, and how the shape of spending changes through retirement." />
          <G><RetirementSpendSection /></G>
          <G><CurrentSpendSection /></G>
          <G><SpendingPhasesSection /></G>
        </>
      );

      case 'healthcare': return (
        <>
          <SectionHeader Icon={HeartPulse} title="Healthcare & Long-Term Care" subtitle="The pre-Medicare bridge, Medicare timing, and the bigger, less predictable risk of long-term care." />
          <G><HealthcareSection /></G>
        </>
      );

      case 'withdrawal': return (
        <>
          <SectionHeader Icon={TrendingDown} title="Withdrawal Strategy" subtitle="Which account you draw from first changes your lifetime tax bill substantially — compare all of them later in the Optimizers tab." />
          <G><WithdrawalSection forceOpen /></G>
        </>
      );

      case 'roth': return (
        <>
          <SectionHeader Icon={Sparkles} title="Roth Conversions, Medicare & Other Tax Strategies" subtitle="Converting Pre-Tax dollars to Roth ahead of RMDs, what Medicare will charge, and other ways to reduce lifetime taxes." />
          <Gate question="Do you want to model Roth conversions, backdoor Roth contributions, or ACA subsidy strategies?" checked={gRoth} onToggle={setGRoth}>
            <G><RothConversionSection forceOpen /></G>
          </Gate>
          <G><MedicareIrmaaSection /></G>
        </>
      );

      case 'equity': return (
        <>
          <SectionHeader Icon={Briefcase} title="Employer Equity Compensation" subtitle="RSUs/stock grants, non-qualified deferred compensation, or a large concentrated position in employer stock." />
          <Gate question="Does either of you receive stock grants, deferred compensation, or hold a large employer-stock position?" checked={gEquity} onToggle={setGEquity}>
            <G><RsuSection forceOpen /></G>
            <G><NqdcSection forceOpen /></G>
            <G><ConcentratedStockSection forceOpen /></G>
          </Gate>
        </>
      );

      case 'milestones': return (
        <>
          <SectionHeader Icon={Gift} title="Major Life Events & Milestones" subtitle="One-time or recurring cash events — a wedding, home purchase, inheritance, college, or downsizing — plus lifetime gifts and any planned move." />
          <Gate question="Any large one-off or recurring cash events, gifts, or a planned move to model?" checked={gMilestones} onToggle={setGMilestones}>
            <G><LifeEventsSection /></G>
          </Gate>
        </>
      );

      case 'debt': return (
        <>
          <SectionHeader Icon={Landmark} title="Debt, Home Equity & Life Insurance" subtitle="Mortgages, other debt, your home, an optional reverse mortgage, and any life insurance policy." />
          <Gate question="Do you have a mortgage, other debt, a home you own, or a life insurance policy?" checked={gDebt} onToggle={setGDebt}>
            <G><DebtSection /></G>
            <G><LifeInsuranceSection /></G>
          </Gate>
        </>
      );

      case 'estate': return (
        <>
          <SectionHeader Icon={ShieldCheck} title="Estate & Heirs" subtitle="What happens to what's left — who inherits, how it is split, and any charitable bequest." />
          <SubCard title="Heirs and bequests">
            <G><EstateHeirsSection /></G>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '14px 0 10px', lineHeight: 1.55 }}>
              The tax each heir would owe, the 10-year withdrawal schedule and the estate-tax picture are on the Tax &amp; Estate page.
            </p>
            <button
              type="button"
              className="btn-outline"
              onClick={() => { setActiveTab('taxestate'); if (setTaxestateSubTab) setTaxestateSubTab('estate'); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              See the Estate Legacy Planner <ArrowRight size={14} />
            </button>
          </SubCard>
        </>
      );

      case 'risk': return (
        <>
          <SectionHeader Icon={ClipboardCheck} title="Taxes, State & Market Assumptions" subtitle="The growth, inflation and state-tax assumptions your whole projection is built on." />
          <G><ReturnAssumptionsSection /></G>
          <G><GranularInflationSection /></G>
          <G><StateTaxesSection /></G>
          <Gate question="Model a future change in the law — a Social Security cut, TCJA rates lapsing, or IRMAA thresholds frozen?" checked={gPolicyRisk} onToggle={setGPolicyRisk}>
            <G><LegislativeRisksSection forceOpen /></G>
          </Gate>
        </>
      );

      case 'review': {
        const totalSalary = inputs.salary1 + (inputs.spouse2Enabled ? inputs.salary2 : 0);
        const totalBalances = inputs.preTaxInit + inputs.rothInit + inputs.taxableInit;
        return (
          <>
            <SectionHeader Icon={CheckCircle} title="Review & Summary" subtitle="Here's what you've told us. Jump back into any section to change something, or head to the Dashboard to see the projection." />
            {kpis && (
              <div className={`sidebar-status ${verdictClass(verdict.tone)}`} style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px', marginBottom: '20px', textAlign: 'left' }}>
                <span>{verdict.label}</span>
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, letterSpacing: 0, fontFamily: 'var(--font-body)' }}>{verdict.detail}</span>
              </div>
            )}
            <Grid cols={3}>
              <SubCard title="Household Income">
                <div style={{ fontSize: '20px', fontWeight: '700' }}>{formatCurrency(totalSalary)}<span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>/yr</span></div>
              </SubCard>
              <SubCard title="Current Balances">
                <div style={{ fontSize: '20px', fontWeight: '700' }}>{formatCurrency(totalBalances)}</div>
              </SubCard>
              <SubCard title="Target Spending">
                <div style={{ fontSize: '20px', fontWeight: '700' }}>{formatCurrency(inputs.lifestyleExpense)}<span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>/yr</span></div>
              </SubCard>
            </Grid>
            <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '24px 0 12px 0' }}>Sections Covered</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {SECTIONS.filter(s => s.id !== 'review').map(s => (
                <div key={s.id} onClick={() => goTo(s.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                  {visited.includes(s.id) ? <CheckCircle size={14} style={{ color: 'var(--success)' }} /> : <RefreshCw size={14} style={{ color: 'var(--text-muted)' }} />}
                  <span style={{ fontSize: 'var(--fs-body)' }}>{s.label}</span>
                  {!visited.includes(s.id) && <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginLeft: 'auto' }}>Not yet visited</span>}
                </div>
              ))}
            </div>
            <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '28px 0 4px 0' }}>What this walkthrough folded away</h3>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.55 }}>
              Your plan is complete and will project fine without any of these &mdash; they sit under &ldquo;More options&rdquo; on
              their step, and on Plan Settings under the page named beside each group.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {notAskedByDomain().map(({ domain, label, items }) => (
                <div key={domain}>
                  <button
                    type="button"
                    onClick={() => goToPlanSettings(domain)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: '700', color: 'var(--accent-text)', marginBottom: '6px' }}
                  >
                    Plan Settings &rarr; {label}
                  </button>
                  <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {items.map((item) => (
                      <li key={item.id} style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>{item.title}</strong> &mdash; {item.blurb}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Changelog 254: the walkthrough lands on Retirement Readiness
                — the six questions a person actually came to ask — with
                the Dashboard one click away. */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '28px', flexWrap: 'wrap' }}>
              <button className="btn-primary" onClick={() => setActiveTab('readiness')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>See how ready you are <ChevronRight size={16} /></button>
              <button className="btn-outline" onClick={() => setActiveTab('dashboard')}>See My Dashboard</button>
              <button className="btn-outline" onClick={() => setActiveTab('settings')}>Fine-Tune in Plan Settings</button>
            </div>
          </>
        );
      }

      default: return null;
    }
  };

  const pct = Math.round((visited.length / SECTIONS.length) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-panel" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Sparkles size={28} style={{ color: 'var(--accent-text)' }} />
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0 }}>Full Guided Interview</h1>
              <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginTop: '2px' }}>A section-by-section walkthrough of every planning decision &mdash; skip anything that doesn&rsquo;t apply. The same fields as Plan Settings, one step at a time, with the rarely-needed ones folded away.</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <FindSetting onPick={findPick} />
            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: '600', color: 'var(--accent-text)' }}>{visited.length} / {SECTIONS.length} sections visited</span>
            <PlanModeSwitch mode="guided" onSwitch={switchToAdvanced} />
          </div>
        </div>
        <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--accent-primary)', transition: 'width 0.3s ease-in-out' }}></div>
        </div>
      </div>

      <div className="sub-tab-container" ref={railRef}>
        {SECTIONS.map(s => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              className={`sub-tab-button ${current === s.id ? 'active' : ''}`}
              onClick={() => goTo(s.id)}
              style={{ opacity: visited.includes(s.id) || current === s.id ? 1 : 0.8 }}
            >
              {visited.includes(s.id) ? <CheckCircle size={14} style={{ color: 'var(--success)' }} /> : <Icon size={14} />}
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="glass-panel interview-step" style={{ padding: '28px' }}>
        {renderSection()}
        <AlsoInPlanSettings sectionId={current} onGoTo={goToPlanSettings} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px 20px' }}>
        <button className="btn-outline" onClick={goBack} disabled={idx === 0} style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: idx === 0 ? 0.4 : 1 }}>
          <ChevronLeft size={16} /> Back
        </button>
        {idx < SECTIONS.length - 1 ? (
          <button className="btn-primary" onClick={goNext} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            Next: {SECTIONS[idx + 1].label} <ChevronRight size={16} />
          </button>
        ) : (
          <button className="btn-primary" onClick={() => setActiveTab('readiness')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            Finish <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export default InterviewTab;
