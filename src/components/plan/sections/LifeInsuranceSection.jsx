// LifeInsuranceSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_lifeInsurance block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { getPossessive } from '../getPossessive';
import Tooltip from '../../Tooltip';
import NumberInput from '../../NumberInput';

export default function LifeInsuranceSection() {
  const { inputs, updateInput } = useSimulation();
  return (
    <>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  Life Insurance (Cash Value)
                </h3>
                {/* Fully independent per spouse -- it's common for each
                    spouse to carry their own separate policy (own type,
                    ownership, cash value, and face amount) rather than one
                    shared household policy. Mirrors the LTC section's same
                    per-spouse pattern above. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 12px' }}>
                  <label htmlFor="toggle-lifeInsuranceEnabled1" style={{ fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                    <Tooltip text="For permanent policies (whole, universal, variable life) that build spendable cash value alongside the death benefit. Term insurance has no cash value and is not tracked here." more="Life Insurance (Cash Value)">
                      {inputs.spouse2Enabled ? `${getPossessive(inputs.spouse1Name || 'Primary')} ` : ''}Permanent (Cash-Value) Policy
                    </Tooltip>
                  </label>
                  <span className="custom-switch">
                    <input id="toggle-lifeInsuranceEnabled1" type="checkbox" checked={inputs.lifeInsuranceEnabled1} onChange={(e) => updateInput('lifeInsuranceEnabled1', e.target.checked)} />
                    <span className="slider-round"></span>
                  </span>
                </div>
                {inputs.lifeInsuranceEnabled1 && (
                  <div style={{ borderLeft: '2.5px solid var(--accent-primary)', paddingLeft: '12px', marginBottom: '16px' }}>
                    <div className="form-group">
                      <label htmlFor="field-lifeInsurancePolicyType1">Policy Type</label>
                      <select id="field-lifeInsurancePolicyType1"
                        className="form-input form-input-select"
                        value={inputs.lifeInsurancePolicyType1}
                        onChange={(e) => {
                          const type = e.target.value;
                          updateInput('lifeInsurancePolicyType1', type);
                          // Variable Appreciable Life is designed around an
                          // always-increasing benefit (face + cash value) --
                          // default the toggle below to match, but the user
                          // can still switch it back off if their policy
                          // uses a level benefit rider instead.
                          if (type === 'variableAppreciableLife') {
                            updateInput('lifeInsuranceIncreasingBenefit1', true);
                          }
                        }}
                      >
                        <option value="wholeLife">Whole Life</option>
                        <option value="universalLife">Universal Life</option>
                        <option value="variableUniversalLife">Variable Universal Life</option>
                        <option value="variableAppreciableLife">Variable Appreciable Life</option>
                        <option value="indexedUniversalLife">Indexed Universal Life</option>
                        <option value="group">Group / Employer-Provided</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-lifeInsuranceOwnership1">
                        <Tooltip text="Who owns the policy decides whether the death benefit sits in your taxable estate. Self or spouse: yes. An ILIT or other third party held 3+ years: no. Heirs receive it income-tax-free either way." more="Ownership (Self / ILIT)">
                          Ownership
                        </Tooltip>
                      </label>
                      <select id="field-lifeInsuranceOwnership1" className="form-input form-input-select" value={inputs.lifeInsuranceOwnership1} onChange={(e) => updateInput('lifeInsuranceOwnership1', e.target.value)}>
                        <option value="self">Self / Spouse-Owned</option>
                        <option value="trust">Trust-Owned (ILIT) / Third Party</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-lifeInsuranceCashValueInit1">Current Cash Value ($)</label>
                      <NumberInput id="field-lifeInsuranceCashValueInit1" step="1000" min="0" className="form-input" value={inputs.lifeInsuranceCashValueInit1} onChange={(e) => updateInput('lifeInsuranceCashValueInit1', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-lifeInsuranceCashValueGrowthRate1">
                        <Tooltip text="Whole life typically credits a guaranteed rate plus dividends (often 4-6% all-in); universal/indexed/variable life varies with credited interest or subaccount performance and can run higher or lower.">
                          Cash Value Growth Rate (%/yr)
                        </Tooltip>
                      </label>
                      <NumberInput id="field-lifeInsuranceCashValueGrowthRate1" max="20" step="0.1" min="0" className="form-input" value={inputs.lifeInsuranceCashValueGrowthRate1} onChange={(e) => updateInput('lifeInsuranceCashValueGrowthRate1', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-lifeInsuranceLoanBalance1">
                        <Tooltip text="A loan against the cash value. No repayment is required; interest compounds onto the balance and reduces both your accessible cash value and the death benefit." more="Loan Balance ($)">
                          Outstanding Policy Loan Balance ($)
                        </Tooltip>
                      </label>
                      <NumberInput id="field-lifeInsuranceLoanBalance1" step="500" min="0" className="form-input" value={inputs.lifeInsuranceLoanBalance1} onChange={(e) => updateInput('lifeInsuranceLoanBalance1', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-lifeInsuranceLoanRate1">Policy Loan Interest Rate (%/yr)</label>
                      <NumberInput id="field-lifeInsuranceLoanRate1" max="30" step="0.1" min="0" className="form-input" value={inputs.lifeInsuranceLoanRate1} onChange={(e) => updateInput('lifeInsuranceLoanRate1', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-lifeInsuranceDeathBenefit1">Death Benefit / Face Amount ($)</label>
                      <NumberInput id="field-lifeInsuranceDeathBenefit1" step="10000" min="0" className="form-input" value={inputs.lifeInsuranceDeathBenefit1} onChange={(e) => updateInput('lifeInsuranceDeathBenefit1', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0 12px' }}>
                      <label htmlFor="toggle-lifeInsuranceIncreasingBenefit1" style={{ fontSize: '14px', cursor: 'pointer' }}>
                        <Tooltip text="On, the policy pays the face amount plus the accumulated cash value (Option B universal or variable life). Off, it pays the level face amount only (most whole life)." more="Increasing Benefit">
                          Increasing Death Benefit (Face + Cash Value)
                        </Tooltip>
                      </label>
                      <span className="custom-switch">
                        <input id="toggle-lifeInsuranceIncreasingBenefit1" type="checkbox" checked={inputs.lifeInsuranceIncreasingBenefit1} onChange={(e) => updateInput('lifeInsuranceIncreasingBenefit1', e.target.checked)} />
                        <span className="slider-round"></span>
                      </span>
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-lifeInsuranceAnnualPremium1">
                        <Tooltip text="Informational only — not deducted from your projected cash flow. Assumed to already be reflected in your regular expenses or savings elsewhere in this plan.">
                          Annual Premium ($/yr)
                        </Tooltip>
                      </label>
                      <NumberInput id="field-lifeInsuranceAnnualPremium1" step="500" min="0" className="form-input" value={inputs.lifeInsuranceAnnualPremium1} onChange={(e) => updateInput('lifeInsuranceAnnualPremium1', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                    </div>
                  </div>
                )}

                {inputs.spouse2Enabled && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 12px' }}>
                      <label htmlFor="toggle-lifeInsuranceEnabled2" style={{ fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                        <Tooltip text="For permanent policies (whole, universal, variable life) that build spendable cash value alongside the death benefit. Term insurance has no cash value and is not tracked here." more="Life Insurance (Cash Value)">
                          {getPossessive(inputs.spouse2Name || 'Spouse')} Permanent (Cash-Value) Policy
                        </Tooltip>
                      </label>
                      <span className="custom-switch">
                        <input id="toggle-lifeInsuranceEnabled2" type="checkbox" checked={inputs.lifeInsuranceEnabled2} onChange={(e) => updateInput('lifeInsuranceEnabled2', e.target.checked)} />
                        <span className="slider-round"></span>
                      </span>
                    </div>
                    {inputs.lifeInsuranceEnabled2 && (
                      <div style={{ borderLeft: '2.5px solid var(--accent-primary)', paddingLeft: '12px', marginBottom: '16px' }}>
                        <div className="form-group">
                          <label htmlFor="field-lifeInsurancePolicyType2">Policy Type</label>
                          <select id="field-lifeInsurancePolicyType2"
                            className="form-input form-input-select"
                            value={inputs.lifeInsurancePolicyType2}
                            onChange={(e) => {
                              const type = e.target.value;
                              updateInput('lifeInsurancePolicyType2', type);
                              if (type === 'variableAppreciableLife') {
                                updateInput('lifeInsuranceIncreasingBenefit2', true);
                              }
                            }}
                          >
                            <option value="wholeLife">Whole Life</option>
                            <option value="universalLife">Universal Life</option>
                            <option value="variableUniversalLife">Variable Universal Life</option>
                            <option value="variableAppreciableLife">Variable Appreciable Life</option>
                            <option value="indexedUniversalLife">Indexed Universal Life</option>
                            <option value="group">Group / Employer-Provided</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-lifeInsuranceOwnership2">
                            <Tooltip text="Who owns the policy decides whether the death benefit sits in your taxable estate. Self or spouse: yes. An ILIT or other third party held 3+ years: no. Heirs receive it income-tax-free either way." more="Ownership (Self / ILIT)">
                              Ownership
                            </Tooltip>
                          </label>
                          <select id="field-lifeInsuranceOwnership2" className="form-input form-input-select" value={inputs.lifeInsuranceOwnership2} onChange={(e) => updateInput('lifeInsuranceOwnership2', e.target.value)}>
                            <option value="self">Self / Spouse-Owned</option>
                            <option value="trust">Trust-Owned (ILIT) / Third Party</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-lifeInsuranceCashValueInit2">Current Cash Value ($)</label>
                          <NumberInput id="field-lifeInsuranceCashValueInit2" step="1000" min="0" className="form-input" value={inputs.lifeInsuranceCashValueInit2} onChange={(e) => updateInput('lifeInsuranceCashValueInit2', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-lifeInsuranceCashValueGrowthRate2">
                            <Tooltip text="Whole life typically credits a guaranteed rate plus dividends (often 4-6% all-in); universal/indexed/variable life varies with credited interest or subaccount performance and can run higher or lower.">
                              Cash Value Growth Rate (%/yr)
                            </Tooltip>
                          </label>
                          <NumberInput id="field-lifeInsuranceCashValueGrowthRate2" max="20" step="0.1" min="0" className="form-input" value={inputs.lifeInsuranceCashValueGrowthRate2} onChange={(e) => updateInput('lifeInsuranceCashValueGrowthRate2', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-lifeInsuranceLoanBalance2">
                            <Tooltip text="A loan against the cash value. No repayment is required; interest compounds onto the balance and reduces both your accessible cash value and the death benefit." more="Loan Balance ($)">
                              Outstanding Policy Loan Balance ($)
                            </Tooltip>
                          </label>
                          <NumberInput id="field-lifeInsuranceLoanBalance2" step="500" min="0" className="form-input" value={inputs.lifeInsuranceLoanBalance2} onChange={(e) => updateInput('lifeInsuranceLoanBalance2', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-lifeInsuranceLoanRate2">Policy Loan Interest Rate (%/yr)</label>
                          <NumberInput id="field-lifeInsuranceLoanRate2" max="30" step="0.1" min="0" className="form-input" value={inputs.lifeInsuranceLoanRate2} onChange={(e) => updateInput('lifeInsuranceLoanRate2', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-lifeInsuranceDeathBenefit2">Death Benefit / Face Amount ($)</label>
                          <NumberInput id="field-lifeInsuranceDeathBenefit2" step="10000" min="0" className="form-input" value={inputs.lifeInsuranceDeathBenefit2} onChange={(e) => updateInput('lifeInsuranceDeathBenefit2', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0 12px' }}>
                          <label htmlFor="toggle-lifeInsuranceIncreasingBenefit2" style={{ fontSize: '14px', cursor: 'pointer' }}>
                            <Tooltip text="On, the policy pays the face amount plus the accumulated cash value (Option B universal or variable life). Off, it pays the level face amount only (most whole life)." more="Increasing Benefit">
                              Increasing Death Benefit (Face + Cash Value)
                            </Tooltip>
                          </label>
                          <span className="custom-switch">
                            <input id="toggle-lifeInsuranceIncreasingBenefit2" type="checkbox" checked={inputs.lifeInsuranceIncreasingBenefit2} onChange={(e) => updateInput('lifeInsuranceIncreasingBenefit2', e.target.checked)} />
                            <span className="slider-round"></span>
                          </span>
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-lifeInsuranceAnnualPremium2">
                            <Tooltip text="Informational only — not deducted from your projected cash flow. Assumed to already be reflected in your regular expenses or savings elsewhere in this plan.">
                              Annual Premium ($/yr)
                            </Tooltip>
                          </label>
                          <NumberInput id="field-lifeInsuranceAnnualPremium2" step="500" min="0" className="form-input" value={inputs.lifeInsuranceAnnualPremium2} onChange={(e) => updateInput('lifeInsuranceAnnualPremium2', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {(inputs.lifeInsuranceEnabled1 || inputs.lifeInsuranceEnabled2) && (
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px', marginBottom: '16px' }}>
                    Net cash value (cash value minus any loan) is tracked as a living asset. The net death benefit (face amount, plus accrued cash value if increasing, minus any loan) flows into the Tax &amp; Estate tab's legacy projections. Each spouse's policy is tracked and taxed independently, including its own Ownership setting.
                  </span>
                )}
              </div>
    </>
  );
}
