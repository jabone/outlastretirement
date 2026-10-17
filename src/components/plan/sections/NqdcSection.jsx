// NqdcSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_nqdc block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { CollapsibleHeader } from '../sectionShared';
import { getPossessive } from '../getPossessive';
import { useFoldState } from '../foldState';
import { Coins } from 'lucide-react';
import Tooltip from '../../Tooltip';
import NumberInput from '../../NumberInput';

export default function NqdcSection({ forceOpen = false }) {
  const { inputs, updateInput } = useSimulation();
  const [showNQDC, toggleShowNQDC] = useFoldState('nqdc', () => !!inputs.nqdcEnabled1 || !!inputs.nqdcEnabled2, forceOpen);
  return (
    <>
                <CollapsibleHeader
                  title="Non-Qualified Deferred Compensation (NQDC)"
                  icon={<Coins size={16} style={{ color: 'var(--accent-text)' }} />}
                  isOpen={showNQDC}
                  onToggle={toggleShowNQDC}
                />
                {showNQDC && (
                  <div>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '16px' }}>
                      A "top-hat" 409A plan some highly-compensated employees can use to defer salary/bonus pre-tax with no IRS dollar limit, unlike a 401(k). The tradeoff: it's just an unsecured promise from your employer (not held in a protected trust the way a 401(k) is), and the payout schedule must be locked in ahead of time. The deferral still reduces this spouse's taxable salary above, and is still subject to FICA in the year it's deferred (only income tax is postponed) — matching how a real NQDC plan works.
                    </p>
                    {[1, ...(inputs.spouse2Enabled ? [2] : [])].map(num => (
                      <div key={num} style={{ marginBottom: '16px', padding: '14px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: inputs[`nqdcEnabled${num}`] ? '12px' : '0' }}>
                          <label htmlFor={`toggle-nqdcEnabled${num}`} style={{ fontSize: 'var(--fs-body)', flex: 1, cursor: 'pointer' }}>
                            {getPossessive(num === 1 ? (inputs.spouse1Name || 'Primary') : (inputs.spouse2Name || 'Spouse'))} NQDC Deferral
                          </label>
                          <span className="custom-switch">
                            <input id={`toggle-nqdcEnabled${num}`} type="checkbox" checked={!!inputs[`nqdcEnabled${num}`]} onChange={(e) => updateInput(`nqdcEnabled${num}`, e.target.checked)} />
                            <span className="slider-round"></span>
                          </span>
                        </div>
                        {inputs[`nqdcEnabled${num}`] && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                            <div className="form-group">
                              <label htmlFor={`field-nqdcInit${num}`}>Existing Balance ($)</label>
                              <NumberInput id={`field-nqdcInit${num}`} step="1000" min="0" className="form-input" value={inputs[`nqdcInit${num}`] || 0} onChange={(e) => updateInput(`nqdcInit${num}`, parseFloat(e.target.value) || 0)} />
                            </div>
                            <div className="form-group">
                              <label htmlFor={`field-nqdcDeferralAmount${num}`}>Annual Deferral ($/yr)</label>
                              <NumberInput id={`field-nqdcDeferralAmount${num}`} step="1000" min="0" className="form-input" value={inputs[`nqdcDeferralAmount${num}`] || 0} onChange={(e) => updateInput(`nqdcDeferralAmount${num}`, parseFloat(e.target.value) || 0)} />
                              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>Stops once this spouse retires, same as salary.</span>
                            </div>
                            <div className="form-group">
                              <label htmlFor={`field-nqdcGrowthRate${num}`}>Credited Growth Rate (%/yr)</label>
                              <NumberInput id={`field-nqdcGrowthRate${num}`} min="-50" max="50" step="0.1" className="form-input" value={inputs[`nqdcGrowthRate${num}`] !== undefined ? inputs[`nqdcGrowthRate${num}`] : 6.0} onChange={(e) => updateInput(`nqdcGrowthRate${num}`, parseFloat(e.target.value) || 0)} />
                            </div>
                            <div className="form-group">
                              <label htmlFor={`field-nqdcDistributionStartAge${num}`}>
                                <Tooltip text="Real 409A plans require electing this in advance — typically either a specified future date or 'separation from service' (retirement). Defaults to this spouse's own Retirement Age.">
                                  Distribution Start Age
                                </Tooltip>
                              </label>
                              <NumberInput id={`field-nqdcDistributionStartAge${num}`} min="40" max="100" className="form-input" value={inputs[`nqdcDistributionStartAge${num}`] !== undefined ? inputs[`nqdcDistributionStartAge${num}`] : 67} onChange={(e) => updateInput(`nqdcDistributionStartAge${num}`, parseInt(e.target.value) || 0)} />
                            </div>
                            <div className="form-group">
                              <label htmlFor={`field-nqdcDistributionYears${num}`}>
                                <Tooltip text="How many years the balance is paid out over. 1 is a lump sum; more gives level installments recalculated each year against the remaining balance." more="Distribution Years">
                                  Distribution Years
                                </Tooltip>
                              </label>
                              <NumberInput id={`field-nqdcDistributionYears${num}`} min="1" max="30" className="form-input" value={inputs[`nqdcDistributionYears${num}`] !== undefined ? inputs[`nqdcDistributionYears${num}`] : 5} onChange={(e) => updateInput(`nqdcDistributionYears${num}`, parseInt(e.target.value) || 1)} />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Retirement Spending Target -- lifestyleExpense.
                    Added 2026-08-19 (IA Phase 2, see IA_REVIEW.md): this is
                    the single most consequential number in the plan, and
                    until now it could NOT be set from the tab named "Plan
                    Settings" at all — only from the KPI banner slider, the
                    onboarding wizard, the Full Interview, or Optimizers'
                    Die-with-Zero. Worse, the section immediately below has
                    always described itself as "separate from 'Annual
                    Lifestyle' above", referring to a field that wasn't
                    there. Both problems are fixed by giving it a real home
                    here; the slider at the top of every screen is now a
                    shortcut to this field rather than its only editor. */}
    </>
  );
}
