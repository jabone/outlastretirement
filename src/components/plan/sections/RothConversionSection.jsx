// RothConversionSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_rothConversion block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { CollapsibleHeader } from '../sectionShared';
import { getPossessive } from '../getPossessive';
import { useFoldState } from '../foldState';
import { Flame, BookOpen } from 'lucide-react';
import Tooltip from '../../Tooltip';
import { irmaaThresholdsFor } from '../../../calculator';
import NumberInput from '../../NumberInput';
import { US_STATES } from '../../../config/usStates';

const stateName = (code) => (US_STATES.find(([c]) => c === code) || [code, code])[1];

export default function RothConversionSection({ forceOpen = false }) {
  const { inputs, updateInput, getRMDAge, setActiveTab, setSettingsSubTab } = useSimulation();
  const [showRothConversion, toggleShowRothConversion] = useFoldState('rothConversion', () => (
    inputs.rothConversionStrategy !== 'none' || inputs.backdoorRothEnabled ||
    inputs.acaSubsidyProtectionEnabled || inputs.acaCliffProtectionEnabled || inputs.acaSubsidyAnnualValue > 0 || inputs.acaCreditSource === 'manual' || inputs.acaBenchmarkPremiumSource === 'manual' || inputs.qcdAnnualAmount > 0 || inputs.nuaEnabled
  ), forceOpen);
  return (
    <>
                <CollapsibleHeader
                  title="Roth Conversion Optimization"
                  icon={<Flame size={16} style={{ color: 'var(--accent-text)' }} />}
                  isOpen={showRothConversion}
                  onToggle={toggleShowRothConversion}
                  style={{ marginBottom: '16px' }}
                />
                {showRothConversion && (
                <>
                <div className="form-group">
                  <label htmlFor="field-rothConversionStrategy">Roth Conversion Strategy</label>
                  <select id="field-rothConversionStrategy" className="form-input form-input-select" value={inputs.rothConversionStrategy} onChange={(e) => updateInput('rothConversionStrategy', e.target.value)}>
                    <option value="none">No Conversions (Standard)</option>
                    <option value="fixed">Fixed Dollar Annual Conversions</option>
                    <option value="maxBracket">Maximize to a Marginal Tax Bracket</option>
                  </select>
                </div>

                {inputs.rothConversionStrategy === 'fixed' && (
                  <div className="form-group">
                    <label htmlFor="field-rothConversionAmount">Annual Conversion Amount ($)</label>
                    <NumberInput id="field-rothConversionAmount" step="5000" min="0" className="form-input" value={inputs.rothConversionAmount} onChange={(e) => updateInput('rothConversionAmount', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                  </div>
                )}

                {inputs.rothConversionStrategy === 'maxBracket' && (
                  <>
                    <div className="form-group">
                      <label htmlFor="field-rothConversionBracket">Target Bracket</label>
                      <select id="field-rothConversionBracket" className="form-input form-input-select" value={inputs.rothConversionBracket} onChange={(e) => updateInput('rothConversionBracket', (e.target.value === '' ? '' : parseFloat(e.target.value)))}>
                        <option value="0.12">12% Tax Bracket</option>
                        <option value="0.22">22% Tax Bracket</option>
                        <option value="0.24">24% Tax Bracket</option>
                        <option value="0.32">32% Tax Bracket</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-rothConversionBuffer">Buffer Below the Bracket or Medicare Surcharge (IRMAA) Limit ($)</label>
                      <NumberInput id="field-rothConversionBuffer" step="100" min="0" className="form-input" value={inputs.rothConversionBuffer} onChange={(e) => updateInput('rothConversionBuffer', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                    </div>
                  </>
                )}

                {/* IRMAA tier cap (changelog 250). A cap on whichever strategy
                    is active, like ACA Cliff Protection below it — never a
                    strategy of its own, so "fill the 24% bracket but stay
                    under the first surcharge" is one bracket + one cap. */}
                {inputs.rothConversionStrategy !== 'none' && (
                  <div className="form-group" style={{ borderLeft: '2.5px solid var(--series-2)', paddingLeft: '12px', marginTop: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: inputs.rothConversionIrmaaCapEnabled ? '10px' : 0 }}>
                      <label htmlFor="toggle-rothConversionIrmaaCap" style={{ fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
                        <Tooltip text="Holds back a conversion so this year's income stays under the IRMAA tier you pick, in any year one of you will be on Medicare two years later. Spending withdrawals can still cross it." more="Stay under an IRMAA">
                          Stay under an IRMAA tier
                        </Tooltip>
                      </label>
                      <span className="custom-switch">
                        <input id="toggle-rothConversionIrmaaCap" type="checkbox" checked={!!inputs.rothConversionIrmaaCapEnabled} onChange={(e) => updateInput('rothConversionIrmaaCapEnabled', e.target.checked)} />
                        <span className="slider-round"></span>
                      </span>
                    </div>
                    {inputs.rothConversionIrmaaCapEnabled && (() => {
                      const tiers = irmaaThresholdsFor(inputs.filingStatus, inputs.mfsLivedWithSpouse);
                      const money = (v) => (Number.isFinite(v) ? '$' + Math.round(v).toLocaleString() : null);
                      const labelFor = (i) => {
                        const top = money(tiers[i]);
                        if (i === 0) return top ? `No surcharge \u2014 income at or under ${top}` : 'No surcharge';
                        const above = money(tiers[i - 1]);
                        return top ? `Surcharge tier ${i} \u2014 up to ${top}${above ? ` (starts above ${above})` : ''}` : `Surcharge tier ${i}`;
                      };
                      return (
                        <>
                          <label htmlFor="field-rothConversionIrmaaTier">Highest tier to allow</label>
                          <select id="field-rothConversionIrmaaTier" className="form-input form-input-select" value={inputs.rothConversionIrmaaTier} onChange={(e) => updateInput('rothConversionIrmaaTier', parseInt(e.target.value))}>
                            {tiers.map((_, i) => <option key={i} value={i}>{labelFor(i)}</option>)}
                          </select>
                          <span style={{ fontSize: 'var(--fs-xs)', opacity: 0.75, display: 'block', marginTop: '6px', lineHeight: '1.5' }}>
                            2026 thresholds for your filing status, in today&rsquo;s dollars; the plan indexes them to the year the premium is charged.
                            The buffer above is subtracted from the threshold too. To convert <em>up to</em> a tier rather than a bracket, pick a bracket above it and let this cap set the ceiling.
                          </span>
                        </>
                      );
                    })()}
                  </div>
                )}

                <div className="form-group" style={{ borderLeft: '2.5px solid var(--series-3)', paddingLeft: '12px', marginTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: inputs.backdoorRothEnabled ? '12px' : 0 }}>
                    <label htmlFor="toggle-backdoorRothEnabled" style={{ fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
                      <Tooltip text="Non-deductible IRA contributions converted straight to Roth, for earners over the Roth income limits. With other pre-tax money in the bucket, the pro-rata rule makes each conversion only partly tax-free." more="Backdoor Roth">
                        Backdoor Roth Contributions
                      </Tooltip>
                    </label>
                    <span className="custom-switch">
                      <input id="toggle-backdoorRothEnabled" type="checkbox" checked={inputs.backdoorRothEnabled} onChange={(e) => updateInput('backdoorRothEnabled', e.target.checked)} />
                      <span className="slider-round"></span>
                    </span>
                  </div>
                  {(inputs.autoMaxContribution1 === 'max' || (inputs.spouse2Enabled && inputs.autoMaxContribution2 === 'max')) && (
                    <span style={{ fontSize: 'var(--fs-xs)', opacity: 0.75, display: 'block', margin: '6px 0 8px', lineHeight: '1.5' }}>
                      {[
                        ...(inputs.autoMaxContribution1 === 'max' ? [inputs.spouse1Name || 'Primary'] : []),
                        ...(inputs.spouse2Enabled && inputs.autoMaxContribution2 === 'max' ? [inputs.spouse2Name || 'Spouse'] : []),
                      ].join(' and ')}&rsquo;s Contribute-the-Max setting already makes an age-aware IRS-limit backdoor contribution every working year — it replaces (never adds to) that person&rsquo;s amount below, so nothing double-counts. Set a Roth Conversion Strategy so those dollars actually convert to Roth instead of sitting in Pre-Tax as basis.
                    </span>
                  )}
                  {inputs.backdoorRothEnabled && (
                    <>
                      <label htmlFor="field-backdoorRothAnnualAmount1">{getPossessive(inputs.spouse1Name || 'Primary')} Annual Backdoor Contribution ($/yr)</label>
                      <NumberInput id="field-backdoorRothAnnualAmount1" step="500" min="0" className="form-input" value={inputs.backdoorRothAnnualAmount1} onChange={(e) => updateInput('backdoorRothAnnualAmount1', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                      {inputs.spouse2Enabled && (
                        <>
                          <label htmlFor="field-backdoorRothAnnualAmount2" style={{ marginTop: '8px', display: 'block' }}>{getPossessive(inputs.spouse2Name || 'Spouse')} Annual Backdoor Contribution ($/yr)</label>
                          <NumberInput id="field-backdoorRothAnnualAmount2" step="500" min="0" className="form-input" value={inputs.backdoorRothAnnualAmount2} onChange={(e) => updateInput('backdoorRothAnnualAmount2', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                        </>
                      )}
                      <label htmlFor="field-preTaxBasisInit" style={{ marginTop: '10px', display: 'block' }}>Existing After-Tax Basis Already in Pre-Tax Accounts ($)</label>
                      <NumberInput id="field-preTaxBasisInit" step="1000" min="0" className="form-input" value={inputs.preTaxBasisInit} onChange={(e) => updateInput('preTaxBasisInit', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        From past non-deductible IRA contributions (e.g. reported on IRS Form 8606). Set the Roth Conversion Strategy above to "Fixed" or "Maximize to Marginal Tax Bracket" so these contributions actually get converted — otherwise they just sit in the Pre-Tax bucket as basis.
                      </span>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '15px 0' }}>
                  <label htmlFor="toggle-rothConversionDelay" style={{ fontSize: '14px', cursor: 'pointer' }}>Delay Conversions Until Retirement</label>
                  <span className="custom-switch">
                    <input id="toggle-rothConversionDelay" type="checkbox" checked={inputs.rothConversionDelayUntilRetire} onChange={(e) => updateInput('rothConversionDelayUntilRetire', e.target.checked)} />
                    <span className="slider-round"></span>
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '15px 0' }}>
                  <label htmlFor="toggle-acaSubsidyProtection" style={{ fontSize: '14px', color: 'var(--error)', cursor: 'pointer' }}>
                    <strong>ACA Subsidy Protection:</strong> <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>(Roth conversions that lift income to the federal poverty line, so you keep the ACA marketplace subsidy)</span>
                  </label>
                  <span className="custom-switch">
                    <input id="toggle-acaSubsidyProtection" type="checkbox" checked={inputs.acaSubsidyProtectionEnabled} onChange={(e) => updateInput('acaSubsidyProtectionEnabled', e.target.checked)} />
                    <span className="slider-round"></span>
                  </span>
                </div>

                {/* The other edge of the pre-Medicare window (changelog 119):
                    the 400%-of-FPL premium-tax-credit cliff, back for 2026
                    coverage now that the 2021-2025 enhanced subsidies have
                    expired. Protection caps voluntary conversions under it;
                    the dollar estimate makes crossing it cost what it costs. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '15px 0' }}>
                  <label htmlFor="toggle-acaCliffProtection" style={{ fontSize: '14px', color: 'var(--error)', cursor: 'pointer' }}>
                    <Tooltip text="Caps voluntary Roth conversions so ACA income stays at or under 400% of the poverty level while someone is retired and under 65, since one dollar over forfeits the year's credit. Spending draws can still cross it." more="ACA Subsidy Protection">
                      <strong>ACA Cliff Protection:</strong> <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>(Cap Roth conversions at 400% of the federal poverty line before 65)</span>
                    </Tooltip>
                  </label>
                  <span className="custom-switch">
                    <input id="toggle-acaCliffProtection" type="checkbox" checked={!!inputs.acaCliffProtectionEnabled} onChange={(e) => updateInput('acaCliffProtectionEnabled', e.target.checked)} />
                    <span className="slider-round"></span>
                  </span>
                </div>
                <div className="form-group">
                  <label htmlFor="field-acaCreditSource">
                    <Tooltip text="The marketplace credit on the pre-65 Healthcare Bridge while retired, under 65 and between 100% and 400% of the poverty line. Computed: the benchmark silver premium for your state and ages less 2.1% to 9.96% of income, settled on the return. Typed: your own figure." more="Premium Tax Credit">
                      ACA Premium Tax Credit
                    </Tooltip>
                  </label>
                  <select id="field-acaCreditSource" className="form-input" value={inputs.acaCreditSource === 'manual' ? 'manual' : 'formula'} onChange={(e) => updateInput('acaCreditSource', e.target.value)}>
                    <option value="formula">Computed from the benchmark premium and your income</option>
                    <option value="manual">A figure I type</option>
                  </select>
                  {inputs.acaCreditSource === 'manual' ? (
                    <>
                      <label htmlFor="field-acaSubsidyAnnualValue" style={{ marginTop: '10px', display: 'block' }}>Estimated ACA Premium Tax Credit ($/yr, today&rsquo;s dollars)</label>
                      <NumberInput id="field-acaSubsidyAnnualValue" step="500" min="0" className="form-input" value={inputs.acaSubsidyAnnualValue !== undefined ? inputs.acaSubsidyAnnualValue : 0} onChange={(e) => updateInput('acaSubsidyAnnualValue', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        Grows with your medical inflation rate. Only applies in years someone is retired and under 65; $0 = not modeled. A year that ends over the 400% line repays the whole credit as tax.
                      </span>
                    </>
                  ) : (
                    <>
                      <label htmlFor="field-acaBenchmarkPremiumSource" style={{ marginTop: '10px', display: 'block' }}>Benchmark premium</label>
                      <select id="field-acaBenchmarkPremiumSource" className="form-input" value={inputs.acaBenchmarkPremiumSource === 'manual' ? 'manual' : 'state'} onChange={(e) => updateInput('acaBenchmarkPremiumSource', e.target.value)}>
                        <option value="state">{stateName(inputs.stateOfResidence || 'TX')} average, scaled to each covered adult&rsquo;s age</option>
                        <option value="manual">My household&rsquo;s own benchmark from healthcare.gov</option>
                      </select>
                      {inputs.acaBenchmarkPremiumSource === 'manual' && (
                        <>
                          <label htmlFor="field-acaBenchmarkPremiumAnnual" style={{ marginTop: '10px', display: 'block' }}>Household benchmark premium ($/yr, today&rsquo;s dollars)</label>
                          <NumberInput id="field-acaBenchmarkPremiumAnnual" step="500" min="0" className="form-input" value={inputs.acaBenchmarkPremiumAnnual !== undefined ? inputs.acaBenchmarkPremiumAnnual : 0} onChange={(e) => updateInput('acaBenchmarkPremiumAnnual', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                        </>
                      )}
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        The second-lowest-cost silver plan for the people on the marketplace that year: a state average for a 40-year-old, scaled by the federal age curve (a 60-year-old pays about 2.1 times a 40-year-old; New York and Vermont charge every age the same), growing with your medical inflation rate. healthcare.gov&rsquo;s tax tool gives the exact figure for your zip code and ages. The credit never exceeds the premium share of your Healthcare Bridge cost, and is nothing above 400% of the poverty line.
                      </span>
                    </>
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="field-qcdAnnualAmount">
                    <Tooltip text="Once RMDs begin, sends this amount from Pre-Tax straight to charity. It satisfies the RMD but is never taxable income. Capped by the RMD and the IRS limit ($111,000 per person, 2026)." more="Qualified Charitable">
                      Qualified Charitable Distribution ($/yr)
                    </Tooltip>
                  </label>
                  <NumberInput id="field-qcdAnnualAmount" step="1000" min="0" className="form-input" value={inputs.qcdAnnualAmount} onChange={(e) => updateInput('qcdAnnualAmount', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>

                {inputs.spouse2Enabled && (
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <label htmlFor="toggle-rmdSpouseSoleBeneficiary" style={{ fontSize: '13px', cursor: 'pointer' }}>
                        <Tooltip text="Required minimum distributions divide the balance by a life-expectancy figure. When the sole beneficiary is a spouse more than 10 years younger, the law uses the joint-life table, which spreads the account over both lives and lowers each year's required draw." more="sole beneficiary of the Pre-Tax">
                          {inputs.spouse2Name || 'Spouse 2'} is the sole beneficiary of the Pre-Tax accounts
                        </Tooltip>
                        {(() => { const gap = (Number(inputs.birthYear2) || 0) - (Number(inputs.birthYear1) || 0); return gap > 10 ? ` (${gap} years younger: RMDs use the joint-life table)` : ' (within 10 years of age: no effect on RMDs)'; })()}
                      </label>
                      <span className="custom-switch">
                        <input id="toggle-rmdSpouseSoleBeneficiary" type="checkbox" checked={inputs.rmdSpouseSoleBeneficiary !== false} onChange={(e) => updateInput('rmdSpouseSoleBeneficiary', e.target.checked)} />
                        <span className="slider-round"></span>
                      </span>
                    </div>
                  </div>
                )}

                {/* One State of Residence, on Household. This spot used to
                    carry a second copy of the same select; it now shows the
                    value and links to the one field. */}
                <div style={{ marginBottom: '16px', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  State of Residence: <strong style={{ color: 'var(--text-primary)' }}>{stateName(inputs.stateOfResidence || 'TX')}</strong>{' '}
                  (used for the ACA Medicaid checks).{' '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => { setActiveTab?.('settings'); setSettingsSubTab?.('household'); }}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-text)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
                  >
                    Change it under Household
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '15px 0' }}>
                  <label htmlFor="toggle-nuaEnabled" style={{ fontSize: '14px', cursor: 'pointer' }}>
                    <Tooltip text="A one-time distribution of employer stock from the 401(k): ordinary income tax now on the cost basis only, with the appreciation moving to Taxable and taxed as capital gains when sold." more="Net Unrealized Appreciation">
                      NUA Employer Stock Distribution
                    </Tooltip>
                  </label>
                  <span className="custom-switch">
                    <input id="toggle-nuaEnabled" type="checkbox" checked={inputs.nuaEnabled} onChange={(e) => updateInput('nuaEnabled', e.target.checked)} />
                    <span className="slider-round"></span>
                  </span>
                </div>

                {inputs.nuaEnabled && (
                  <>
                    <div className="form-group">
                      <label htmlFor="field-nuaCostBasis">Employer Stock Cost Basis ($)</label>
                      <NumberInput id="field-nuaCostBasis" step="5000" min="0" className="form-input" value={inputs.nuaCostBasis} onChange={(e) => updateInput('nuaCostBasis', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-nuaCurrentValue">Employer Stock Current Value ($)</label>
                      <NumberInput id="field-nuaCurrentValue" step="5000" min="0" className="form-input" value={inputs.nuaCurrentValue} onChange={(e) => updateInput('nuaCurrentValue', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                    </div>
                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label htmlFor="field-nuaDistributionAge">Distribution Age (Spouse 1)</label>
                      <NumberInput id="field-nuaDistributionAge" step="1" min="50" max="80" className="form-input" value={inputs.nuaDistributionAge} onChange={(e) => updateInput('nuaDistributionAge', (e.target.value === '' ? '' : parseInt(e.target.value, 10)))} />
                    </div>
                    {inputs.nuaCurrentValue < inputs.nuaCostBasis && (
                      <div style={{ padding: '10px', marginBottom: '16px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>
                        Current value should be greater than or equal to cost basis — otherwise there's no appreciation to shelter from ordinary income tax.
                      </div>
                    )}
                  </>
                )}

                {/* Roth conversions explanation card */}
                <div style={{ padding: '14px', borderRadius: '8px', border: '1px solid rgba(42, 127, 122, 0.2)', backgroundColor: 'rgba(42, 127, 122, 0.05)', fontSize: 'var(--fs-sm)', display: 'flex', gap: '10px' }}>
                  <BookOpen size={18} style={{ flexShrink: 0, color: 'var(--accent-text)', marginTop: '2px' }} />
                  <div>
                    <strong>Why convert to Roth?</strong> Converting traditional Pre-Tax retirement account balances to Roth accounts shifts tax liability to today. This avoids forced <Tooltip text="The minimum amount you must withdraw from your retirement accounts each year, starting at age 73-75.">Required Minimum Distributions (RMDs)</Tooltip> at age {getRMDAge(inputs.birthYear1)} and funds tax-free compound growth, lowering tax bracket exposure in later years.
                  </div>
                </div>
                </>
                )}
    </>
  );
}
