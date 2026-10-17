// GranularInflationSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_granularInflation block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { ledgerBadgeFor } from '../ledgerBadgeFor';
import Tooltip from '../../Tooltip';
import NumberInput from '../../NumberInput';

export default function GranularInflationSection() {
  const { inputs, updateInput } = useSimulation();
  const { ledgerOwns, ledgerBadge } = ledgerBadgeFor(inputs);
  return (
    <>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  Granular Inflation Assumptions
                </h3>
                
                <div className="form-group">
                  <label htmlFor="field-inflationRate">General Inflation (%)</label>
                  <NumberInput id="field-inflationRate" step="0.1" min="-5" max="20" className="form-input" value={inputs.inflationRate !== undefined ? inputs.inflationRate : 2.5} onChange={(e) => updateInput('inflationRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>
                <div className="form-group">
                  <label htmlFor="field-housingInflationRate">Housing Inflation (%)</label>
                  <NumberInput id="field-housingInflationRate" step="0.1" min="-5" max="20" className="form-input" value={inputs.housingInflationRate !== undefined ? inputs.housingInflationRate : 3.0} onChange={(e) => updateInput('housingInflationRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>
                <div className="form-group">
                  <label htmlFor="field-housingExpensePct">
                    <Tooltip text="The share of your lifestyle budget that is housing (rent, property tax, insurance, upkeep). That slice grows at Housing Inflation; the rest at General Lifestyle Inflation." more="Housing Share">
                      Housing Share of Spending (%)
                    </Tooltip>
                    {ledgerBadge('housingExpensePct')}
                  </label>
                  <NumberInput id="field-housingExpensePct" step="1" min="0" max="100" className="form-input" disabled={ledgerOwns('housingExpensePct')} value={inputs.housingExpensePct !== undefined ? inputs.housingExpensePct : 30} onChange={(e) => updateInput('housingExpensePct', (e.target.value === '' ? '' : Math.max(0, Math.min(100, parseFloat(e.target.value)))))} />
                  {ledgerOwns('housingExpensePct') && (
                    <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                      Your housing category&rsquo;s share of the ledger. Unlink it on the ledger in Spending to type your own.
                    </span>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="field-medicalInflationRate">Medical / Healthcare Inflation (%)</label>
                  <NumberInput id="field-medicalInflationRate" step="0.1" min="-5" max="20" className="form-input" value={inputs.medicalInflationRate !== undefined ? inputs.medicalInflationRate : 5.0} onChange={(e) => updateInput('medicalInflationRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>
                <div className="form-group">
                  <label htmlFor="field-ltcInflationRate">
                    <Tooltip text="The yearly growth applied to your Long-Term Care costs only. LTC costs have historically grown at their own pace, apart from general medical inflation." more="(LTC) Inflation">
                      Long-Term Care (LTC) Inflation (%)
                    </Tooltip>
                  </label>
                  <NumberInput id="field-ltcInflationRate" step="0.1" min="-5" max="20" className="form-input" value={inputs.ltcInflationRate !== undefined ? inputs.ltcInflationRate : 4.0} onChange={(e) => updateInput('ltcInflationRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>
                <div className="form-group">
                  <label htmlFor="field-ssCOLA">Social Security <Tooltip text="Cost-Of-Living Adjustment: the annual percentage increase applied to Social Security benefits to keep pace with inflation. Historically has averaged around 2-3% per year.">COLA</Tooltip> (%)</label>
                  <NumberInput id="field-ssCOLA" step="0.1" min="-5" max="20" className="form-input" value={inputs.ssCOLA !== undefined ? inputs.ssCOLA : 2.5} onChange={(e) => updateInput('ssCOLA', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                    <label htmlFor="toggle-ssColaAnnounced" style={{ fontSize: '13px', cursor: 'pointer' }}>
                      Use SSA&rsquo;s announced figure for a year it has announced (3.6% for 2027) while the rate above is the default
                    </label>
                    <span className="custom-switch">
                      <input id="toggle-ssColaAnnounced" type="checkbox" checked={inputs.ssColaAnnounced !== false} onChange={(e) => updateInput('ssColaAnnounced', e.target.checked)} />
                      <span className="slider-round"></span>
                    </span>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="field-medicarePartBInflationRate">
                    <Tooltip text="Medicare Part B's premium plus its IRMAA surcharge (if your income is high enough). Historically Part B premiums have grown faster than general inflation, averaging roughly 5-6% per year over the last two decades.">
                      Medicare Part B Inflation (%)
                    </Tooltip>
                  </label>
                  <NumberInput id="field-medicarePartBInflationRate" step="0.1" min="-5" max="20" className="form-input" value={inputs.medicarePartBInflationRate !== undefined ? inputs.medicarePartBInflationRate : 5.0} onChange={(e) => updateInput('medicarePartBInflationRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>
                <div className="form-group">
                  <label htmlFor="field-medicarePartDInflationRate">
                    <Tooltip text="Medicare Part D's national base premium plus its own IRMAA surcharge (a separate tier schedule from Part B's, though based on the same income). Has historically grown at a similar pace to Part B.">
                      Medicare Part D Inflation (%)
                    </Tooltip>
                  </label>
                  <NumberInput id="field-medicarePartDInflationRate" step="0.1" min="-5" max="20" className="form-input" value={inputs.medicarePartDInflationRate !== undefined ? inputs.medicarePartDInflationRate : 5.0} onChange={(e) => updateInput('medicarePartDInflationRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>
                <div className="form-group">
                  <label htmlFor="field-taxBracketInflationRate">Tax Brackets Annual Inflation (%)</label>
                  <NumberInput id="field-taxBracketInflationRate" step="0.1" min="-5" max="20" className="form-input" value={inputs.taxBracketInflationRate !== undefined ? inputs.taxBracketInflationRate : 2.5} onChange={(e) => updateInput('taxBracketInflationRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>
                <div className="form-group">
                  <label htmlFor="field-safeWithdrawalRate">
                    <Tooltip text="The rate that sizes your FI number: target expenses divided by this rate. 4% means 25x expenses. Lower is more conservative." more="Safe Withdrawal Rate">
                      Safe Withdrawal Rate (for FI Crossover) (%)
                    </Tooltip>
                  </label>
                  <NumberInput id="field-safeWithdrawalRate" step="0.1" min="0.5" max="15" className="form-input" value={inputs.safeWithdrawalRate !== undefined ? inputs.safeWithdrawalRate : 4.0} onChange={(e) => updateInput('safeWithdrawalRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>
    </>
  );
}
