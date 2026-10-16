// LifeEventsSection -- Plan Settings -> Life Events: milestones (one-off and
// recurring cash events with the -1/+1/+5 year shift controls), lifetime
// gifting, and the residency timeline. Extracted from SettingsTab.jsx in IA
// Phase 3 step 2 (2026-09-24) so the guided Interview mounts the same page.
// The maximize control is Plan Settings' own: the Interview passes nothing
// and the section renders in place. JSX unchanged.
import React, { useState } from 'react';
import { useSimulation } from '../../../context/useSimulation';
import MaximizeButton from '../../MaximizeButton';
import { ANNUAL_GIFT_EXCLUSION_2026, TAX_YEAR, computeGiftingTotals, planHorizonYear } from '../../../calculator';
import { BookOpen, Plus, Sparkles, Trash2 } from 'lucide-react';
import ResidencyTimelinePanel from '../../ResidencyTimelinePanel';
import NumberInput from '../../NumberInput';
import SwitchRow from '../../SwitchRow';

export default function LifeEventsSection({ maximizedComponent = null, setMaximizedComponent = () => {} }) {
  const { inputs, updateInput, formatCurrency, setActiveTab } = useSimulation();
  // Recomputed on every render rather than memoized, matching the other
  // derived figures on this page -- it is a short loop over the gifting
  // window, not a projection.
  const giftingTotals = computeGiftingTotals(inputs);
  const [newMilestoneName, setNewMilestoneName] = useState('');
  const [newMilestoneType, setNewMilestoneType] = useState('outflow');
  const [newMilestoneAmount, setNewMilestoneAmount] = useState(50000);
  const [newMilestoneIsRecurring, setNewMilestoneIsRecurring] = useState(false);
  const [newMilestoneStartAge, setNewMilestoneStartAge] = useState(65);
  const [newMilestoneEndAge, setNewMilestoneEndAge] = useState(65);
  const [newMilestoneTargetAccount, setNewMilestoneTargetAccount] = useState('auto');
  const [newMilestoneIsTaxable, setNewMilestoneIsTaxable] = useState(false);
  const [newMilestoneInflationCategory, setNewMilestoneInflationCategory] = useState('General');
  const [newMilestoneFundedExternally, setNewMilestoneFundedExternally] = useState(false);

  const handleAddMilestone = () => {
    if (!newMilestoneName || !newMilestoneAmount) return;
    const newMilestone = {
      id: Date.now().toString(),
      name: newMilestoneName,
      type: newMilestoneType,
      amount: newMilestoneAmount,
      isRecurring: newMilestoneIsRecurring,
      startAge: newMilestoneStartAge,
      endAge: newMilestoneEndAge,
      targetAccount: newMilestoneTargetAccount,
      isTaxable: newMilestoneIsTaxable,
      inflationCategory: newMilestoneInflationCategory,
      fundedExternally: newMilestoneType === 'outflow' ? newMilestoneFundedExternally : false
    };
    updateInput('milestones', [...(inputs.milestones || []), newMilestone]);
    setNewMilestoneName('');
    setNewMilestoneAmount(50000);
    setNewMilestoneFundedExternally(false);
  };

  const handleDeleteMilestone = (id) => {
    updateInput('milestones', (inputs.milestones || []).filter(m => m.id !== id));
  };

  // Move a life event in time without retyping it (changelog 219). The
  // Readiness tab can show what deferring a big expense would do, and
  // before this the only way to act on that was to delete the event and
  // enter it again. Ages are clamped at 0 and a one-off keeps its two ages
  // together, the way the add form writes them.
  const handleShiftMilestone = (id, years) => {
    updateInput('milestones', (inputs.milestones || []).map((m) => {
      if (m.id !== id) return m;
      const startAge = Math.max(0, Number(m.startAge) + years);
      return { ...m, startAge, endAge: m.isRecurring ? Math.max(startAge, Number(m.endAge) + years) : startAge };
    }));
  };
  return (
          <div 
            className={`glass-panel ${maximizedComponent === 'settingsMilestones' ? 'maximized-modal' : ''}`} 
            style={maximizedComponent === 'settingsMilestones' ? { 
              position: 'fixed', top: '20px', left: '20px', right: '20px', bottom: '20px', zIndex: 10000, overflowY: 'auto', padding: '30px', backgroundColor: 'rgba(15, 15, 25, 0.98)', border: '1px solid var(--accent-primary)', boxShadow: '0 0 50px rgba(0,0,0,0.8)'
            } : { padding: '24px' }}
          >
            <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '12px' }}>
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Life Events</h2>
                <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Plan a move between states, and model scheduled one-time and recurring cash inflows (inheritance, downsizing) or outflows (college, RV purchase) that dynamically affect your nest egg.
                </p>
              </div>
              <MaximizeButton target="settingsMilestones" current={maximizedComponent} setMaximizedComponent={setMaximizedComponent} />
            </div>

            {/* Where you live -- planned moves between states (changelog 195). */}
            <ResidencyTimelinePanel
              inputs={inputs}
              horizonYear={planHorizonYear(inputs)}
              onChange={(timeline) => updateInput('residencyTimeline', timeline)}
              onOpenPremium={() => setActiveTab('premium')}
            />

            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '30px' }}>
              {/* Form to Add Milestone */}
              <div>
                <div className="glass-panel" style={{ padding: '20px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Plus size={18} style={{ color: 'var(--accent-text)' }} />
                    <span>Create New Milestone</span>
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="form-group">
                      <label htmlFor="field-newMilestoneName">Milestone Name</label>
                      <input id="field-newMilestoneName" 
                        type="text" 
                        placeholder="e.g. Wedding, Travel, Downsize"
                        className="form-input"
                        value={newMilestoneName}
                        onChange={(e) => setNewMilestoneName(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="field-newMilestoneType">Flow Type</label>
                      <select id="field-newMilestoneType" 
                        className="form-input"
                        value={newMilestoneType}
                        onChange={(e) => {
                          setNewMilestoneType(e.target.value);
                          if (e.target.value === 'inflow') {
                            setNewMilestoneTargetAccount('taxable');
                          } else {
                            setNewMilestoneTargetAccount('auto');
                          }
                        }}
                      >
                        <option value="outflow">Outflow (Expense / Spend)</option>
                        <option value="inflow">Inflow (Liquidity / Asset Sale)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="field-newMilestoneAmount">Amount ($)</label>
                      <NumberInput id="field-newMilestoneAmount" commas 
                        min="0"
                        className="form-input"
                        value={newMilestoneAmount}
                        onChange={(e) => setNewMilestoneAmount((e.target.value === '' ? '' : parseFloat(e.target.value)))}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
                      <label htmlFor="toggle-newMilestoneIsRecurring" style={{ fontSize: 'var(--fs-body)', cursor: 'pointer' }}>Recurring Range</label>
                      <span className="custom-switch">
                        <input
                          id="toggle-newMilestoneIsRecurring"
                          type="checkbox"
                          checked={newMilestoneIsRecurring}
                          onChange={(e) => {
                            setNewMilestoneIsRecurring(e.target.checked);
                            if (!e.target.checked) {
                              setNewMilestoneEndAge(newMilestoneStartAge);
                            }
                          }} 
                        />
                        <span className="slider-round"></span>
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
                      <div className="form-group">
                        <label htmlFor="field-newMilestoneStartAge">{newMilestoneIsRecurring ? 'Start Age' : 'Age'}</label>
                        <NumberInput id="field-newMilestoneStartAge" 
                          min="30"
                          max="100"
                          className="form-input"
                          value={newMilestoneStartAge}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 60;
                            setNewMilestoneStartAge(val);
                            if (!newMilestoneIsRecurring) {
                              setNewMilestoneEndAge(val);
                            }
                          }}
                        />
                      </div>

                      {newMilestoneIsRecurring && (
                        <div className="form-group">
                          <label htmlFor="field-newMilestoneEndAge">End Age</label>
                          <NumberInput id="field-newMilestoneEndAge" 
                            min={newMilestoneStartAge}
                            max="100"
                            className="form-input"
                            value={newMilestoneEndAge}
                            onChange={(e) => setNewMilestoneEndAge(parseInt(e.target.value) || 60)}
                          />
                        </div>
                      )}
                    </div>

                    {/* Target Account settings */}
                    <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {newMilestoneType === 'outflow' && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                          <span className="custom-switch" style={{ marginTop: '2px', flexShrink: 0 }}>
                            <input
                              id="toggle-newMilestoneFundedExternally"
                              type="checkbox"
                              checked={newMilestoneFundedExternally}
                              onChange={(e) => setNewMilestoneFundedExternally(e.target.checked)}
                            />
                            <span className="slider-round"></span>
                          </span>
                          <div>
                            <label htmlFor="toggle-newMilestoneFundedExternally" style={{ fontSize: 'var(--fs-body)', cursor: 'pointer', display: 'block' }}>Already saved for this / funded outside this plan</label>
                            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              For expenses you're pre-funding separately (a dedicated savings account, gift, etc.) so this cost never has to draw from any account tracked here.
                            </div>
                          </div>
                        </div>
                      )}

                      {!(newMilestoneType === 'outflow' && newMilestoneFundedExternally) && (
                        <div className="form-group">
                          <label htmlFor="field-newMilestoneTargetAccount">{newMilestoneType === 'inflow' ? 'Deposit Target Account' : 'Withdraw From Account'}</label>
                          <select id="field-newMilestoneTargetAccount"
                            className="form-input"
                            value={newMilestoneTargetAccount}
                            onChange={(e) => setNewMilestoneTargetAccount(e.target.value)}
                          >
                            {newMilestoneType === 'outflow' && <option value="auto">Auto (Follow Active Drawdown Strategy)</option>}
                            <option value="taxable">Taxable Brokerage (Normal)</option>
                            <option value="preTax">Traditional Pre-Tax</option>
                            <option value="roth">Roth Account (Tax-Free)</option>
                          </select>
                        </div>
                      )}

                      {newMilestoneType === 'inflow' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <label htmlFor="toggle-newMilestoneIsTaxable" style={{ fontSize: 'var(--fs-body)', cursor: 'pointer' }}>Taxable as Ordinary Income</label>
                          <span className="custom-switch">
                            <input
                              id="toggle-newMilestoneIsTaxable"
                              type="checkbox"
                              checked={newMilestoneIsTaxable}
                              onChange={(e) => setNewMilestoneIsTaxable(e.target.checked)}
                            />
                            <span className="slider-round"></span>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="form-group">
                      <label htmlFor="field-newMilestoneInflationCategory">Inflation Category</label>
                      <select id="field-newMilestoneInflationCategory" 
                        className="form-input"
                        value={newMilestoneInflationCategory}
                        onChange={(e) => setNewMilestoneInflationCategory(e.target.value)}
                      >
                        <option value="General">General Lifestyle (Default)</option>
                        <option value="Housing">Housing</option>
                        <option value="Medical">Medical / Healthcare</option>
                        <option value="None">None (Fixed Amount)</option>
                      </select>
                    </div>

                    <button 
                      className="btn-primary" 
                      style={{ marginTop: '8px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      onClick={handleAddMilestone}
                    >
                      <Plus size={16} />
                      <span>Add Milestone Event</span>
                    </button>
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '16px', border: '1px solid var(--card-border)', marginTop: '20px', fontSize: 'var(--fs-body)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <BookOpen size={16} style={{ color: 'var(--accent-text)', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ color: 'var(--text-secondary)' }}>
                    <strong>Note:</strong> Milestones are denominated in present-value dollars and automatically adjust upward over time based on your inflation settings to preserve actual buying power.
                  </div>
                </div>
              </div>

              {/* Milestones Chronological Timeline */}
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={18} style={{ color: 'var(--warning)' }} />
                  <span>Timeline Chronology</span>
                </h3>

                {(!inputs.milestones || inputs.milestones.length === 0) ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--card-border)', borderRadius: '12px' }}>
                    No milestones defined. Add one using the form on the left to customize your retirement cash flow timeline.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', paddingLeft: '16px', borderLeft: '2px dashed var(--card-border)' }}>
                    {[...(inputs.milestones || [])]
                      .sort((a, b) => a.startAge - b.startAge)
                      .map((m) => {
                        const isOutflow = m.type === 'outflow';
                        const ageRange = m.isRecurring ? `Ages ${m.startAge}-${m.endAge}` : `Age ${m.startAge}`;
                        
                        return (
                          <div 
                            key={m.id} 
                            className="glass-panel" 
                            style={{ 
                              padding: '16px', 
                              position: 'relative', 
                              borderColor: isOutflow ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                              backgroundColor: isOutflow ? 'rgba(239,68,68,0.01)' : 'rgba(16,185,129,0.01)'
                            }}
                          >
                            {/* Marker dot on the timeline line */}
                            <div style={{
                              position: 'absolute',
                              left: '-23px',
                              top: '22px',
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              backgroundColor: isOutflow ? 'var(--error)' : 'var(--success)',
                              border: '2px solid var(--bg-primary)'
                            }} />

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                              <div>
                                <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', textTransform: 'uppercase', color: isOutflow ? 'var(--danger)' : 'var(--success)', letterSpacing: '0.05em' }}>
                                  {ageRange}
                                </span>
                                <h4 style={{ fontSize: '15px', fontWeight: '600', marginTop: '2px' }}>{m.name}</h4>
                                
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                                  <span style={{ fontSize: 'var(--fs-2xs)', padding: '3px 6px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}>
                                    {m.isRecurring ? 'Recurring' : 'One-time'}
                                  </span>
                                  <span style={{ fontSize: 'var(--fs-2xs)', padding: '3px 6px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}>
                                    {m.inflationCategory || 'General'} Inflation
                                  </span>
                                  {isOutflow && m.fundedExternally ? (
                                    <span style={{ fontSize: 'var(--fs-2xs)', padding: '3px 6px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}>
                                      Funded Outside Plan
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: 'var(--fs-2xs)', padding: '3px 6px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}>
                                      {!isOutflow ?
                                        `To ${m.targetAccount === 'preTax' ? 'Pre-Tax' : m.targetAccount === 'roth' ? 'Roth' : 'Taxable'}` :
                                        `From ${(!m.targetAccount || m.targetAccount === 'auto') ? 'Auto (Strategy)' : (m.targetAccount === 'preTax' ? 'Pre-Tax' : m.targetAccount === 'roth' ? 'Roth' : 'Taxable')}`
                                      }
                                    </span>
                                  )}
                                  {!isOutflow && m.isTaxable && (
                                    <span style={{ fontSize: 'var(--fs-2xs)', padding: '3px 6px', borderRadius: '4px', backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
                                      Ordinary Taxed
                                    </span>
                                  )}
                                  {isOutflow && m.fundedExternally && (
                                    <span style={{ fontSize: 'var(--fs-2xs)', padding: '3px 6px', borderRadius: '4px', backgroundColor: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>
                                      No Plan Impact
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                <div style={{ fontSize: '16px', fontWeight: '700', color: isOutflow ? 'var(--danger)' : 'var(--success)' }}>
                                  {isOutflow ? '-' : '+'}${m.amount.toLocaleString()}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {/* Shift in time, changelog 219 -- one click
                                      instead of delete-and-retype. */}
                                  <button
                                    className="btn-outline"
                                    style={{ padding: '4px 8px', fontSize: 'var(--fs-2xs)', borderRadius: '6px' }}
                                    title={`Move ${m.name} one year earlier`}
                                    aria-label={`Move ${m.name} one year earlier`}
                                    onClick={() => handleShiftMilestone(m.id, -1)}
                                    disabled={Number(m.startAge) <= 0}
                                  >
                                    &minus;1 yr
                                  </button>
                                  <button
                                    className="btn-outline"
                                    style={{ padding: '4px 8px', fontSize: 'var(--fs-2xs)', borderRadius: '6px' }}
                                    title={`Move ${m.name} one year later`}
                                    aria-label={`Move ${m.name} one year later`}
                                    onClick={() => handleShiftMilestone(m.id, 1)}
                                  >
                                    +1 yr
                                  </button>
                                  <button
                                    className="btn-outline"
                                    style={{ padding: '4px 8px', fontSize: 'var(--fs-2xs)', borderRadius: '6px' }}
                                    title={`Move ${m.name} five years later`}
                                    aria-label={`Move ${m.name} five years later`}
                                    onClick={() => handleShiftMilestone(m.id, 5)}
                                  >
                                    +5 yr
                                  </button>
                                  <button 
                                    className="btn-outline" 
                                    style={{ padding: '6px', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)', backgroundColor: 'rgba(239,68,68,0.05)', borderRadius: '6px' }}
                                    aria-label={`Delete ${m.name}`}
                                    onClick={() => handleDeleteMilestone(m.id)}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* Lifetime gifting. Lives with Life Events rather than on the
                Tax & Estate tab because it is an input that moves real cash
                in real years — Tax & Estate shows what it does. The
                estate-side effect (a smaller exemption when gifts exceed
                the annual exclusion) surfaces there. */}
            <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--card-border)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '6px' }}>Lifetime Gifting</h3>
              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }}>
                Giving money away while you&rsquo;re alive. Modeled as a real cash outflow in each year it happens &mdash;
                funded the same way as any other spending &mdash; so a plan that can&rsquo;t actually support the gifting
                shows a shortfall rather than quietly succeeding.
              </p>

              <SwitchRow id="toggle-giftingEnabled" checked={inputs.giftingEnabled} onChange={(v) => updateInput('giftingEnabled', v)} style={{ marginBottom: '12px' }}>Model a gifting plan</SwitchRow>

              {inputs.giftingEnabled && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    <div className="form-group">
                      <label htmlFor="field-giftingRecipients">How Many People</label>
                      <NumberInput id="field-giftingRecipients" min="0" max="50" className="form-input"
                        value={inputs.giftingRecipients}
                        onChange={(e) => updateInput('giftingRecipients', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>The exclusion is per recipient, per year &mdash; three children is three separate allowances.</span>
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-giftingPerRecipient">Gift Per Person ($/yr)</label>
                      <NumberInput id="field-giftingPerRecipient" commas min="0" step="1000" className="form-input"
                        value={inputs.giftingPerRecipient}
                        onChange={(e) => updateInput('giftingPerRecipient', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>The {TAX_YEAR} annual exclusion is {formatCurrency(ANNUAL_GIFT_EXCLUSION_2026)} per recipient.</span>
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-giftingStartAge">Start at Age</label>
                      <NumberInput id="field-giftingStartAge" min="18" max="110" className="form-input"
                        value={inputs.giftingStartAge}
                        onChange={(e) => updateInput('giftingStartAge', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-giftingYears">For How Many Years</label>
                      <NumberInput id="field-giftingYears" min="0" max="60" className="form-input"
                        value={inputs.giftingYears}
                        onChange={(e) => updateInput('giftingYears', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                    </div>
                  </div>

                  {inputs.spouse2Enabled && (
                    <SwitchRow id="toggle-giftingSplitWithSpouse" checked={inputs.giftingSplitWithSpouse} onChange={(v) => updateInput('giftingSplitWithSpouse', v)} style={{ marginTop: '10px' }}>Split gifts with spouse (doubles the exclusion per recipient)</SwitchRow>
                  )}

                  <SwitchRow id="toggle-giftingGrowWithInflation" checked={inputs.giftingGrowWithInflation} onChange={(v) => updateInput('giftingGrowWithInflation', v)} style={{ marginTop: '10px' }}>Grow the gift with inflation each year</SwitchRow>

                  {/* The whole reason to separate "gifted" from "uses your
                      exemption": almost nobody owes gift tax, but the
                      excess quietly shrinks the shelter over the estate
                      decades later, and nothing else in the app would
                      show that. */}
                  <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)', fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
                    Over {inputs.giftingYears || 0} year{Number(inputs.giftingYears) === 1 ? '' : 's'} this gives away{' '}
                    <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(giftingTotals.totalGifted)}</strong>.{' '}
                    {giftingTotals.totalTaxableGifts > 0 ? (
                      <>
                        <strong style={{ color: 'var(--warning)' }}>{formatCurrency(giftingTotals.totalTaxableGifts)}</strong> of that is above the
                        annual exclusion. That still costs you no gift tax now &mdash; but it reduces the exemption sheltering
                        your estate later by the same amount, and each such year needs a gift tax return (Form 709).
                      </>
                    ) : (
                      <>All of it sits within the annual exclusion, so it uses none of your lifetime exemption and needs no gift tax return.</>
                    )}
                  </div>

                  {/* Naming what is deliberately out of scope. A gifting
                      model that silently ignores the unlimited exclusions
                      (tuition, medical) would understate what someone can
                      actually give, and the non-citizen spouse rules are a
                      genuine trap: no unlimited marital deduction, and a
                      separate annual cap. */}
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '12px', marginBottom: 0, lineHeight: 1.6 }}>
                    <strong>Not modeled here.</strong> Tuition and medical bills paid <em>directly</em> to the school or provider
                    are excluded without limit and don&rsquo;t count against any of this. Nor are 529 five-year front-loading,
                    charitable giving, or gifts to a spouse who isn&rsquo;t a US citizen &mdash; that last one has no unlimited
                    marital deduction and its own separate annual cap. See <strong>Help &rarr; Guide</strong> for what those
                    involve.
                  </p>
                </>
              )}
            </div>
          </div>
  );
}
