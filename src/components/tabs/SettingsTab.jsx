import React, { useState, useEffect } from 'react';
import { useSimulation } from '../../context/useSimulation';
import PlanModeSwitch from '../plan/PlanModeSwitch';
import FindSetting from '../FindSetting';
import { writePlanMode, interviewStepFor, setInterviewStep } from '../../utils/planMode';
import { CollapsibleHeader, SettingsPanel } from '../plan/sectionShared';
import { useFoldState } from '../plan/foldState';
import PlanYearPanel from './PlanYearPanel';
import DemographicsSection from '../plan/sections/DemographicsSection';
import LifeEventsSection from '../plan/sections/LifeEventsSection';
import SalariesSection from '../plan/sections/SalariesSection';
import RsuSection from '../plan/sections/RsuSection';
import ConcentratedStockSection from '../plan/sections/ConcentratedStockSection';
import NqdcSection from '../plan/sections/NqdcSection';
import RetirementSpendSection from '../plan/sections/RetirementSpendSection';
import CurrentSpendSection from '../plan/sections/CurrentSpendSection';
import PartTimeSection from '../plan/sections/PartTimeSection';
import GranularInflationSection from '../plan/sections/GranularInflationSection';
import StateTaxesSection from '../plan/sections/StateTaxesSection';
import LegislativeRisksSection from '../plan/sections/LegislativeRisksSection';
import AnnuitiesPensionsSection from '../plan/sections/AnnuitiesPensionsSection';
import SocialSecuritySection from '../plan/sections/SocialSecuritySection';
import WithdrawalSection from '../plan/sections/WithdrawalSection';
import RothConversionSection from '../plan/sections/RothConversionSection';
import MedicareIrmaaSection from '../plan/sections/MedicareIrmaaSection';
import SpecialExpensesSection from '../plan/sections/SpecialExpensesSection';
import PremiumUpsellSection from '../plan/sections/PremiumUpsellSection';
import InitialBalancesSection from '../plan/sections/InitialBalancesSection';
import DebtSection from '../plan/sections/DebtSection';
import LifeInsuranceSection from '../plan/sections/LifeInsuranceSection';
import ContributionsSection from '../plan/sections/ContributionsSection';
import ContribAdvisorSection from '../plan/sections/ContribAdvisorSection';
import ReturnAssumptionsSection from '../plan/sections/ReturnAssumptionsSection';
import DynamicAllocationSection from '../plan/sections/DynamicAllocationSection';
import BucketSharesSection from '../plan/sections/BucketSharesSection';

// Plan Settings -- the Advanced view of the Plan form. Each life-domain
// sub-tab composes section components from ../plan/sections (IA Phase 3
// step 1, 2026-09-24); this file keeps the sub-tab shell, the Life
// Events and Plan Year pages, and the state those share.
const SettingsTab = () => {
  const { settingsSubTab, setSettingsSubTab, setActiveTab, setTaxestateSubTab } = useSimulation();
  // "Find a setting" (changelog 290) hands over the field's home; the
  // component itself opens the fold and scrolls the control into view.
  const findPick = (entry) => {
    if (entry.tab !== 'settings') {
      if (entry.tab === 'taxestate') setTaxestateSubTab(entry.subTab);
      setActiveTab(entry.tab);
      return;
    }
    setSettingsSubTab(entry.subTab);
  };
  // This is the Advanced view of the one Plan destination (changelog 252):
  // remember that, and let the switch carry the current sub-tab across.
  useEffect(() => { writePlanMode('advanced'); }, []);
  const switchToGuided = () => {
    setInterviewStep(interviewStepFor(settingsSubTab));
    writePlanMode('guided');
    setActiveTab('interview');
  };


  // settingsSubTab is lifted into SimulationContext (see App.jsx) so cross-tab
  // deep links can target a specific sub-tab, and so the choice survives
  // this component's remount-on-navigation.
  const [maximizedComponent, setMaximizedComponent] = useState(null);

  // Collapse state for the less-frequently-touched settings sections.
  // Each one defaults OPEN if the plan already has something enabled inside
  // it -- e.g. if Backdoor Roth or a Roth Conversion Strategy is turned on,
  // "Roth Conversion Optimization" shouldn't be silently hidden behind a
  // collapsed header the next time this tab is opened. Sections with
  // nothing active in them still default collapsed to keep a routine visit
  // from being a wall of every possible input. These are lazy initializers
  // (run once, on mount) rather than a useEffect, because this whole
  // component unmounts when you navigate to a different top-level tab and
  // remounts fresh when you come back to Plan Settings -- so "on mount" and
  // "when you access that tab" are the same moment here.
  // The Spending sub-tab's three sections, stacked full width and each one
  // collapsible (changelog 223). They used to sit side by side in a
  // three-column grid, which left the category ledger -- the widest thing
  // on the tab, with five controls to a row -- living in a third of the
  // window. Both open by default: collapsing is for getting a long tab out
  // of the way once you know what is in it, not for hiding things from
  // someone who has never seen them -- the pre-retirement section holds the
  // spending bridge and the residual readout, which a closed section would
  // bury. Special Expenses keeps its own data-driven default below, because
  // that one really is about whether you use those features.
  const [showRetirementSpend, toggleRetirementSpend] = useFoldState('retirementSpend', () => true);
  const [showCurrentSpend, toggleCurrentSpend] = useFoldState('currentSpend', () => true);




  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0 }}>Plan Settings</h1>
        <FindSetting onPick={findPick} />
        <PlanModeSwitch mode="advanced" onSwitch={switchToGuided} />
      </div>
      <div className="sub-tab-container">
        <button className={`sub-tab-button ${settingsSubTab === 'household' ? 'active' : ''}`} onClick={() => setSettingsSubTab('household')}>Household</button>
        <button className={`sub-tab-button ${settingsSubTab === 'income' ? 'active' : ''}`} onClick={() => setSettingsSubTab('income')}>Income</button>
        <button className={`sub-tab-button ${settingsSubTab === 'savings' ? 'active' : ''}`} onClick={() => setSettingsSubTab('savings')}>Savings</button>
        <button className={`sub-tab-button ${settingsSubTab === 'balances' ? 'active' : ''}`} onClick={() => setSettingsSubTab('balances')}>Balances & Debt</button>
        <button className={`sub-tab-button ${settingsSubTab === 'spending' ? 'active' : ''}`} onClick={() => setSettingsSubTab('spending')}>Spending</button>
        <button className={`sub-tab-button ${settingsSubTab === 'taxes' ? 'active' : ''}`} onClick={() => setSettingsSubTab('taxes')}>Taxes & Roth</button>
        <button className={`sub-tab-button ${settingsSubTab === 'assumptions' ? 'active' : ''}`} onClick={() => setSettingsSubTab('assumptions')}>Assumptions & Risk</button>
        <button className={`sub-tab-button ${settingsSubTab === 'milestones' ? 'active' : ''}`} onClick={() => setSettingsSubTab('milestones')}>Life Events</button>
        <button className={`sub-tab-button ${settingsSubTab === 'planyear' ? 'active' : ''}`} onClick={() => setSettingsSubTab('planyear')}>Plan Year &amp; Review</button>
      </div>

        {settingsSubTab === 'household' && (
          <SettingsPanel maximizedComponent={maximizedComponent} setMaximizedComponent={setMaximizedComponent} id="household" title="Household">
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <div><DemographicsSection /></div>
            </div>
          </SettingsPanel>
        )}
        {settingsSubTab === 'income' && (
          <SettingsPanel maximizedComponent={maximizedComponent} setMaximizedComponent={setMaximizedComponent} id="income" title="Income">
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <div><SalariesSection /></div>
                <div><SocialSecuritySection /></div>
                <div><PartTimeSection /></div>
                <div><RsuSection /></div>
                <div><ConcentratedStockSection /></div>
                <div><NqdcSection /></div>
                <div><AnnuitiesPensionsSection /></div>
            </div>
          </SettingsPanel>
        )}
        {settingsSubTab === 'savings' && (
          <SettingsPanel maximizedComponent={maximizedComponent} setMaximizedComponent={setMaximizedComponent} id="savings" title="Savings">
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <ContributionsSection />
                <ContribAdvisorSection />
            </div>
          </SettingsPanel>
        )}
        {settingsSubTab === 'balances' && (
          <SettingsPanel maximizedComponent={maximizedComponent} setMaximizedComponent={setMaximizedComponent} id="balances" title="Balances & Debt">
            <PremiumUpsellSection />
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <InitialBalancesSection />
                <DebtSection />
                <LifeInsuranceSection />
            </div>
            <BucketSharesSection />
          </SettingsPanel>
        )}
        {settingsSubTab === 'spending' && (
          <SettingsPanel maximizedComponent={maximizedComponent} setMaximizedComponent={setMaximizedComponent} id="spending" title="Spending">
            {/* One column, three collapsible sections (changelog 223).
                Full width is the point: the ledger's rows need it. */}
            <div>
              <CollapsibleHeader
                title="Retirement Spending Target"
                isOpen={showRetirementSpend}
                onToggle={toggleRetirementSpend}
                style={{ marginTop: 0 }}
              />
              {showRetirementSpend && <RetirementSpendSection />}

              <CollapsibleHeader
                title="Current Household Spending (Pre-Retirement)"
                isOpen={showCurrentSpend}
                onToggle={toggleCurrentSpend}
              />
              {showCurrentSpend && <CurrentSpendSection />}

              <SpecialExpensesSection />
              <WithdrawalSection />
            </div>
          </SettingsPanel>
        )}
        {settingsSubTab === 'taxes' && (
          <SettingsPanel maximizedComponent={maximizedComponent} setMaximizedComponent={setMaximizedComponent} id="taxes" title="Taxes & Roth">
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <div><StateTaxesSection /></div>
                <div><RothConversionSection /></div>
                <div><MedicareIrmaaSection /></div>
            </div>
          </SettingsPanel>
        )}
        {settingsSubTab === 'assumptions' && (
          <SettingsPanel maximizedComponent={maximizedComponent} setMaximizedComponent={setMaximizedComponent} id="assumptions" title="Assumptions & Risk">
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <ReturnAssumptionsSection />
                <DynamicAllocationSection />
                <div><GranularInflationSection /></div>
                <div><LegislativeRisksSection /></div>
            </div>
          </SettingsPanel>
        )}
        {settingsSubTab === 'milestones' && (
          <LifeEventsSection maximizedComponent={maximizedComponent} setMaximizedComponent={setMaximizedComponent} />
        )}

        {settingsSubTab === 'planyear' && (
          <PlanYearPanel />
        )}

    </>
  );
};

export default SettingsTab;
