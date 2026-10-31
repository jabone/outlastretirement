// AnnuitiesPensionsSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_annuitiesPensions block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { CollapsibleHeader } from '../sectionShared';
import { getPossessive } from '../getPossessive';
import { useFoldState } from '../foldState';
import Tooltip from '../../Tooltip';
import SwitchRow from '../../SwitchRow';
import NumberInput from '../../NumberInput';

export default function AnnuitiesPensionsSection({ forceOpen = false }) {
  const { inputs, updateInput } = useSimulation();
  const [showAnnuitiesPensions, toggleShowAnnuitiesPensions] = useFoldState('annuitiesPensions', () => (
    inputs.pension1 > 0 || (inputs.spouse2Enabled && inputs.pension2 > 0) ||
    inputs.annuityIncome > 0 || inputs.rentalIncome > 0 || (Number(inputs.annuityPurchaseAmount) || 0) > 0
  ), forceOpen);
  // The annuity-purchase fields show once the switch is on, even before an
  // amount is typed; turning the switch off zeroes the purchase.
  const [annuityPurchaseOpen, setAnnuityPurchaseOpen] = React.useState(false);
  return (
    <>
                <CollapsibleHeader title="Annuities, Rentals & Pensions" isOpen={showAnnuitiesPensions} onToggle={toggleShowAnnuitiesPensions} />
                {showAnnuitiesPensions && (
                <>
                {/* Advanced Pension 1 */}
                <div className="form-group" style={{ borderLeft: '2.5px solid var(--accent-primary)', paddingLeft: '12px', margin: '16px 0' }}>
                  <label htmlFor="field-pension1" style={{ fontWeight: '500' }}>{getPossessive(inputs.spouse1Name || 'Primary')} Pension ($/yr)</label>
                  <NumberInput id="field-pension1" commas min="0" className="form-input" value={inputs.pension1} onChange={(e) => updateInput('pension1', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                  
                  {inputs.pension1 > 0 && (
                    <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label htmlFor="field-pensionStartAge1" style={{ fontSize: 'var(--fs-xs)' }}>Start Age</label>
                        <NumberInput id="field-pensionStartAge1" min="40" max="100" className="form-input" style={{ padding: '4px 8px', fontSize: 'var(--fs-sm)' }} value={inputs.pensionStartAge1} onChange={(e) => updateInput('pensionStartAge1', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label htmlFor="field-pension1COLA" style={{ fontSize: 'var(--fs-xs)' }}>Pension <Tooltip text="Cost-Of-Living Adjustment: the annual percentage increase applied to this pension to keep pace with inflation. Not all pensions include one — check your plan documents if you're unsure.">COLA</Tooltip> (%)</label>
                        <NumberInput id="field-pension1COLA" step="0.1" min="0" max="20" className="form-input" style={{ padding: '4px 8px', fontSize: 'var(--fs-sm)' }} value={inputs.pension1COLA !== undefined ? inputs.pension1COLA : 2.0} onChange={(e) => updateInput('pension1COLA', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                      </div>
                      {inputs.spouse2Enabled && (
                        <div className="form-group" style={{ gridColumn: 'span 2', margin: 0 }}>
                          <label htmlFor="field-pension1SurvivorBenefit" style={{ fontSize: 'var(--fs-xs)' }}>Spousal Survivor Benefit (%)</label>
                          <NumberInput id="field-pension1SurvivorBenefit" min="0" max="100" className="form-input" style={{ padding: '4px 8px', fontSize: 'var(--fs-sm)' }} value={inputs.pension1SurvivorBenefit !== undefined ? inputs.pension1SurvivorBenefit : 50} onChange={(e) => updateInput('pension1SurvivorBenefit', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                        </div>
                      )}
                      <div className="form-group" style={{ gridColumn: 'span 2', margin: '4px 0 0 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <SwitchRow id="toggle-militaryPension1" size="sm" checked={inputs.militaryPension1 || false} onChange={(isChecked) => {
                          // Was a setInputs() call that isn't in scope
                          // here (useSimulation exposes updateInput), so
                          // ticking this box threw. Same seeding, one
                          // key at a time.
                          updateInput('militaryPension1', isChecked);
                          if (isChecked) {
                            updateInput('pension1COLA', inputs.inflationRate !== undefined ? inputs.inflationRate : 2.5);
                            updateInput('pension1SurvivorBenefit', 55);
                          }
                        }}>Military Pension (State Tax Exempt)</SwitchRow>
                        <SwitchRow id="toggle-governmentPension1" size="sm" checked={inputs.governmentPension1 || false} onChange={(on) => updateInput('governmentPension1', on)}>
                          Government Pension (NY: fully state-exempt)
                        </SwitchRow>
                        <SwitchRow id="toggle-pension1LumpSum" size="sm" checked={inputs.pension1LumpSum || false} onChange={(on) => updateInput('pension1LumpSum', on)}>
                          Take as Lump-Sum Payout
                        </SwitchRow>
                      </div>
                      {inputs.pension1LumpSum && (
                        <div className="form-group" style={{ gridColumn: 'span 2', margin: 0 }}>
                          <label htmlFor="field-pension1LumpSumValue" style={{ fontSize: 'var(--fs-xs)' }}>Lump-Sum Value ($)</label>
                          <NumberInput id="field-pension1LumpSumValue" commas min="0" className="form-input" style={{ padding: '4px 8px', fontSize: 'var(--fs-sm)' }} value={inputs.pension1LumpSumValue !== undefined ? inputs.pension1LumpSumValue : 250000} onChange={(e) => updateInput('pension1LumpSumValue', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                          {/* IRC s 402(c): a direct rollover of the lump sum to an IRA
                              recognizes no income now — the money lands in Pre-Tax
                              and is taxed as it comes back out. Left off, the lump
                              sum is spendable cash and ordinary income this year. */}
                          <SwitchRow id="toggle-pension1LumpSumRollover" size="sm" style={{ marginTop: '6px' }} checked={inputs.pension1LumpSumRollover || false} onChange={(on) => updateInput('pension1LumpSumRollover', on)}>
                            Roll over to Pre-Tax (no tax this year)
                          </SwitchRow>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Advanced Pension 2 */}
                {inputs.spouse2Enabled && (
                  <div className="form-group" style={{ borderLeft: '2.5px solid var(--accent-secondary)', paddingLeft: '12px', margin: '16px 0' }}>
                    <label htmlFor="field-pension2" style={{ fontWeight: '500' }}>{getPossessive(inputs.spouse2Name || 'Spouse')} Pension ($/yr)</label>
                    <NumberInput id="field-pension2" commas min="0" className="form-input" value={inputs.pension2} onChange={(e) => updateInput('pension2', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                    
                    {inputs.pension2 > 0 && (
                      <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label htmlFor="field-pensionStartAge2" style={{ fontSize: 'var(--fs-xs)' }}>Start Age</label>
                          <NumberInput id="field-pensionStartAge2" min="40" max="100" className="form-input" style={{ padding: '4px 8px', fontSize: 'var(--fs-sm)' }} value={inputs.pensionStartAge2} onChange={(e) => updateInput('pensionStartAge2', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label htmlFor="field-pension2COLA" style={{ fontSize: 'var(--fs-xs)' }}>Pension <Tooltip text="Cost-Of-Living Adjustment: the annual percentage increase applied to this pension to keep pace with inflation. Not all pensions include one — check your plan documents if you're unsure.">COLA</Tooltip> (%)</label>
                          <NumberInput id="field-pension2COLA" step="0.1" min="0" max="20" className="form-input" style={{ padding: '4px 8px', fontSize: 'var(--fs-sm)' }} value={inputs.pension2COLA !== undefined ? inputs.pension2COLA : 0.0} onChange={(e) => updateInput('pension2COLA', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                        </div>
                        <div className="form-group" style={{ gridColumn: 'span 2', margin: 0 }}>
                          <label htmlFor="field-pension2SurvivorBenefit" style={{ fontSize: 'var(--fs-xs)' }}>Spousal Survivor Benefit (%)</label>
                          <NumberInput id="field-pension2SurvivorBenefit" min="0" max="100" className="form-input" style={{ padding: '4px 8px', fontSize: 'var(--fs-sm)' }} value={inputs.pension2SurvivorBenefit !== undefined ? inputs.pension2SurvivorBenefit : 50} onChange={(e) => updateInput('pension2SurvivorBenefit', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                        </div>
                        <div className="form-group" style={{ gridColumn: 'span 2', margin: '4px 0 0 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <SwitchRow id="toggle-militaryPension2" size="sm" checked={inputs.militaryPension2 || false} onChange={(isChecked) => {
                            updateInput('militaryPension2', isChecked);
                            if (isChecked) {
                              updateInput('pension2COLA', inputs.inflationRate !== undefined ? inputs.inflationRate : 2.5);
                              updateInput('pension2SurvivorBenefit', 55);
                            }
                          }}>Military Pension (State Tax Exempt)</SwitchRow>
                          <SwitchRow id="toggle-governmentPension2" size="sm" checked={inputs.governmentPension2 || false} onChange={(on) => updateInput('governmentPension2', on)}>
                            Government Pension (NY: fully state-exempt)
                          </SwitchRow>
                          <SwitchRow id="toggle-pension2LumpSum" size="sm" checked={inputs.pension2LumpSum || false} onChange={(on) => updateInput('pension2LumpSum', on)}>
                            Take as Lump-Sum Payout
                          </SwitchRow>
                        </div>
                        {inputs.pension2LumpSum && (
                          <div className="form-group" style={{ gridColumn: 'span 2', margin: 0 }}>
                            <label htmlFor="field-pension2LumpSumValue" style={{ fontSize: 'var(--fs-xs)' }}>Lump-Sum Value ($)</label>
                            <NumberInput id="field-pension2LumpSumValue" commas min="0" className="form-input" style={{ padding: '4px 8px', fontSize: 'var(--fs-sm)' }} value={inputs.pension2LumpSumValue !== undefined ? inputs.pension2LumpSumValue : 250000} onChange={(e) => updateInput('pension2LumpSumValue', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                            {/* IRC s 402(c): a direct rollover of the lump sum to an IRA
                              recognizes no income now — the money lands in Pre-Tax
                              and is taxed as it comes back out. Left off, the lump
                              sum is spendable cash and ordinary income this year. */}
                            <SwitchRow id="toggle-pension2LumpSumRollover" size="sm" style={{ marginTop: '6px' }} checked={inputs.pension2LumpSumRollover || false} onChange={(on) => updateInput('pension2LumpSumRollover', on)}>
                              Roll over to Pre-Tax (no tax this year)
                            </SwitchRow>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="field-annuityIncome">
                    <Tooltip text="An annuity you already own, in today's dollars, taxed as ordinary income. Most pay a level amount for life; tick the box below if yours rises with inflation. For an annuity you may buy later, use the purchase below." more="Annuity Income">Annuity Income ($/yr)</Tooltip>
                  </label>
                  <NumberInput id="field-annuityIncome" min="0" className="form-input" value={inputs.annuityIncome} onChange={(e) => updateInput('annuityIncome', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>
                {(Number(inputs.annuityIncome) || 0) > 0 && (
                  <>
                    <div className="form-group">
                      <label htmlFor="field-annuityIncomeStartAge">Annuity Starts at {getPossessive(inputs.spouse1Name || 'Primary')} Age (0 = already paying)</label>
                      <NumberInput id="field-annuityIncomeStartAge" min="0" max="120" className="form-input" value={inputs.annuityIncomeStartAge} onChange={(e) => updateInput('annuityIncomeStartAge', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                    </div>
                    <div className="form-group">
                      <SwitchRow id="toggle-annuityIncomeIndexed" size="sm" checked={!!inputs.annuityIncomeIndexed} onChange={(on) => updateInput('annuityIncomeIndexed', on)}>
                        Payment rises with inflation each year
                      </SwitchRow>
                      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        Off: a level payment, which inflation erodes over the years. The payment continues for the whole plan; a survivor reduction is not modeled.
                      </span>
                    </div>
                  </>
                )}
                {/* Buying an annuity in retirement (changelog 286). Moved here
                    from Optimizers, where it was the only editor of these
                    plan inputs; a purchase is a plan decision, not a search. */}
                <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                  <SwitchRow id="toggle-annuityPurchaseEnabled" checked={(Number(inputs.annuityPurchaseAmount) || 0) > 0 || annuityPurchaseOpen} onChange={(on) => {
                    setAnnuityPurchaseOpen(on);
                    if (!on) updateInput('annuityPurchaseAmount', 0);
                  }} hint="Buy a Single Premium Immediate Annuity or Deferred Income Annuity at a chosen age. The purchase leaves the account you pick and pays a guaranteed lifetime income that offsets your withdrawals.">
                    <strong>Buy an annuity in retirement</strong>
                  </SwitchRow>
                </div>
                {((Number(inputs.annuityPurchaseAmount) || 0) > 0 || annuityPurchaseOpen) && (
                <div className="form-group" style={{ gridColumn: '1 / -1', borderLeft: '2.5px solid var(--accent-secondary)', paddingLeft: '12px', margin: '4px 0 12px' }}>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <div className="form-group">
              <label htmlFor="field-annuityPurchaseAmount">Annuity Purchase Amount ($)</label>
              <NumberInput id="field-annuityPurchaseAmount" 
                step="10000" 
                min="0"
                className="form-input" 
                value={inputs.annuityPurchaseAmount || 0} 
                onChange={(e) => updateInput('annuityPurchaseAmount', (e.target.value === '' ? '' : parseFloat(e.target.value)))} 
              />
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Set to $0 to disable annuity</span>
            </div>

            <div className="form-group">
              <label htmlFor="field-annuityPurchaseAge">Annuity Purchase Age (Spouse 1)</label>
              <NumberInput id="field-annuityPurchaseAge" 
                min="50"
                max="90"
                className="form-input" 
                value={inputs.annuityPurchaseAge || 65} 
                onChange={(e) => updateInput('annuityPurchaseAge', parseInt(e.target.value) || 65)} 
              />
            </div>

            <div className="form-group">
              <label htmlFor="field-annuityPayoutRate">Annual Payout Rate (%)</label>
              <NumberInput id="field-annuityPayoutRate" 
                step="0.1" 
                min="1"
                max="15"
                className="form-input" 
                value={inputs.annuityPayoutRate || 6.0} 
                onChange={(e) => updateInput('annuityPayoutRate', parseFloat(e.target.value) || 6.0)} 
              />
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Typical rates: 5% - 7.5%</span>
            </div>

            <div className="form-group">
              <label htmlFor="field-annuityIndexation">Annual <Tooltip text="Cost-Of-Living Adjustment: the annual percentage increase applied to this annuity's payout to keep pace with inflation. Set to 0% if your annuity pays a fixed amount for life.">COLA</Tooltip> Adjustment (%)</label>
              <NumberInput id="field-annuityIndexation" 
                step="0.1" 
                min="0"
                max="8"
                className="form-input" 
                value={inputs.annuityIndexation || 0.0} 
                onChange={(e) => updateInput('annuityIndexation', (e.target.value === '' ? '' : parseFloat(e.target.value)))} 
              />
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>0% for flat nominal payout</span>
            </div>

            <div className="form-group">
              <label htmlFor="field-annuitySourceAccount">Funding Source Account</label>
              <select id="field-annuitySourceAccount" 
                className="form-input form-input-select"
                value={inputs.annuitySourceAccount || 'taxable'} 
                onChange={(e) => updateInput('annuitySourceAccount', e.target.value)}
              >
                <option value="taxable">Taxable Brokerage</option>
                <option value="preTax">Pre-Tax (Traditional IRA/401k)</option>
                <option value="roth">Roth IRA/401k</option>
              </select>
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label htmlFor="toggle-annuityIsTaxable" style={{ fontSize: 'var(--fs-body)', margin: 0, cursor: 'pointer' }}>Tax Every Dollar of the Payout</label>
                <span className="custom-switch">
                  <input
                    id="toggle-annuityIsTaxable"
                    type="checkbox"
                    checked={inputs.annuityIsTaxable !== false}
                    onChange={(e) => updateInput('annuityIsTaxable', e.target.checked)}
                  />
                  <span className="slider-round"></span>
                </span>
              </div>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
                Turn this off to tax the payout by where the money came from: Pre-Tax is fully
                taxable, Roth is fully tax-free, and a brokerage purchase gets the IRC &sect; 72(b)
                exclusion ratio &mdash; part of each payment is your own premium coming back
                tax-free until the whole premium has been recovered.
              </span>
            </div>
          </div>
                </div>
                )}
                <div className="form-group">
                  <label htmlFor="field-rentalIncome">Rental Income ($/yr)</label>
                  <NumberInput id="field-rentalIncome" min="0" className="form-input" value={inputs.rentalIncome} onChange={(e) => updateInput('rentalIncome', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>
                </>
                )}
    </>
  );
}
