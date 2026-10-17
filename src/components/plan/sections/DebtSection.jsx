// DebtSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_debt block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import Tooltip from '../../Tooltip';
import NumberInput from '../../NumberInput';

export default function DebtSection() {
  const { inputs, updateInput } = useSimulation();
  return (
    <>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  Debt (Mortgage & Other Loans)
                </h3>
                <div className="form-group">
                  <label htmlFor="field-mortgageBalance">Mortgage Balance ($)</label>
                  <NumberInput id="field-mortgageBalance" step="10000" min="0" className="form-input" value={inputs.mortgageBalance} onChange={(e) => updateInput('mortgageBalance', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                </div>
                <div className="form-group">
                  <label htmlFor="field-mortgageRate">Mortgage Interest Rate (%)</label>
                  <NumberInput id="field-mortgageRate" max="30" step="0.1" min="0" className="form-input" value={inputs.mortgageRate} onChange={(e) => updateInput('mortgageRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>
                <div className="form-group">
                  <label htmlFor="field-mortgagePayment">
                    <Tooltip text="Total yearly mortgage payment, principal and interest. The balance amortizes at the rate above and payments stop when it is paid off. $0 if you have no mortgage." more="Mortgage Payment">
                      Annual Mortgage Payment ($/yr)
                    </Tooltip>
                  </label>
                  <NumberInput id="field-mortgagePayment" step="1000" min="0" className="form-input" value={inputs.mortgagePayment} onChange={(e) => updateInput('mortgagePayment', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                </div>
                <div className="form-group">
                  <label htmlFor="field-otherDebtBalance">Other Debt Balance ($)</label>
                  <NumberInput id="field-otherDebtBalance" step="1000" min="0" className="form-input" value={inputs.otherDebtBalance} onChange={(e) => updateInput('otherDebtBalance', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                </div>
                <div className="form-group">
                  <label htmlFor="field-otherDebtRate">Other Debt Interest Rate (%)</label>
                  <NumberInput id="field-otherDebtRate" max="40" step="0.1" min="0" className="form-input" value={inputs.otherDebtRate} onChange={(e) => updateInput('otherDebtRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>
                <div className="form-group">
                  <label htmlFor="field-otherDebtPayment">
                    <Tooltip text="A car loan, personal loan, or other fixed-payment debt outside your mortgage. Amortizes and stops the same way the mortgage does. Set to $0 to disable.">
                      Annual Other Debt Payment ($/yr)
                    </Tooltip>
                  </label>
                  <NumberInput id="field-otherDebtPayment" step="500" min="0" className="form-input" value={inputs.otherDebtPayment} onChange={(e) => updateInput('otherDebtPayment', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                </div>

                <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '28px 0 16px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  Home &amp; Other Property
                </h3>
                <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
                  Property is never drawn on for living expenses here &mdash; a sale is a one-time inflow Life Event. It matters for the <strong>estate</strong>: the home (net of any mortgage) and everything below enter the Estate Legacy Planner at full value, pass to heirs with a stepped-up basis, and can be the difference between clearing and crossing a state estate-tax exemption.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 12px' }}>
                  <label htmlFor="toggle-homeOwned" style={{ fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                    <Tooltip text="On if you own your home: it appreciates each year and its equity counts in your gross estate. Renters leave it off. Needed for a reverse mortgage." more="Own Your Home">
                      Own Your Home
                    </Tooltip>
                  </label>
                  <span className="custom-switch">
                    <input id="toggle-homeOwned" type="checkbox" checked={Boolean(inputs.homeOwned || inputs.reverseMortgageEnabled)} onChange={(e) => { updateInput('homeOwned', e.target.checked); if (!e.target.checked) updateInput('reverseMortgageEnabled', false); }} />
                    <span className="slider-round"></span>
                  </span>
                </div>
                {!(inputs.homeOwned || inputs.reverseMortgageEnabled) && inputs.mortgageBalance > 0 && (
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--warning)', margin: '0 0 12px' }}>
                    You have a mortgage balance above but no home in the plan &mdash; turn this on so the house counts in your estate.
                  </p>
                )}
                {(inputs.homeOwned || inputs.reverseMortgageEnabled) && (
                  <>
                    <div className="form-group">
                      <label htmlFor="field-homeValueInit">Current Home Value ($)</label>
                      <NumberInput id="field-homeValueInit" step="10000" min="0" className="form-input" value={inputs.homeValueInit} onChange={(e) => updateInput('homeValueInit', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-homeAppreciationRate">Home Appreciation Rate (%/yr)</label>
                      <NumberInput id="field-homeAppreciationRate" max="20" step="0.5" min="0" className="form-input" value={inputs.homeAppreciationRate} onChange={(e) => updateInput('homeAppreciationRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                    </div>
                  </>
                )}
                <div className="form-group">
                  <label htmlFor="field-otherEstateAssetsInit">
                    <Tooltip text="Everything else in your estate that is not an account or your home: a second property, land, a business, vehicles, art. One total in today's dollars, never spent, passed to heirs with a stepped-up basis." more="Other Estate Assets">
                      Other Estate Assets ($)
                    </Tooltip>
                  </label>
                  <NumberInput id="field-otherEstateAssetsInit" step="10000" min="0" className="form-input" value={inputs.otherEstateAssetsInit} onChange={(e) => updateInput('otherEstateAssetsInit', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                </div>
                {inputs.otherEstateAssetsInit > 0 && (
                  <div className="form-group">
                    <label htmlFor="field-otherEstateAssetsGrowthRate">
                      <Tooltip text="How the total above changes each year. Real estate and businesses tend to appreciate; vehicles and most personal property lose value — a blended figure for the mix you entered is fine. Negative is allowed.">
                        Other Assets Growth Rate (%/yr)
                      </Tooltip>
                    </label>
                    <NumberInput id="field-otherEstateAssetsGrowthRate" min="-20" max="20" step="0.5" className="form-input" value={inputs.otherEstateAssetsGrowthRate} onChange={(e) => updateInput('otherEstateAssetsGrowthRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                  </div>
                )}

                {(inputs.homeOwned || inputs.reverseMortgageEnabled) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '20px 0 12px' }}>
                  <label htmlFor="toggle-reverseMortgageEnabled" style={{ fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                    <Tooltip text="An HECM-style loan against home equity for owners 62+: no monthly payments, interest compounds onto the balance, never more than the home is worth, repaid when you move, sell or die." more="Reverse Mortgage">
                      Reverse Mortgage / Home Equity
                    </Tooltip>
                  </label>
                  <span className="custom-switch">
                    <input id="toggle-reverseMortgageEnabled" type="checkbox" checked={inputs.reverseMortgageEnabled} onChange={(e) => updateInput('reverseMortgageEnabled', e.target.checked)} />
                    <span className="slider-round"></span>
                  </span>
                </div>
                )}
                {inputs.reverseMortgageEnabled && (
                  <>
                    <div className="form-group">
                      <label htmlFor="field-reverseMortgageStartAge">
                        <Tooltip text="The age (Primary) the reverse mortgage originates — real HECM loans require the youngest borrower to be at least 62.">
                          Loan Start Age
                        </Tooltip>
                      </label>
                      <NumberInput id="field-reverseMortgageStartAge" step="1" min="62" max="100" className="form-input" value={inputs.reverseMortgageStartAge} onChange={(e) => updateInput('reverseMortgageStartAge', (e.target.value === '' ? '' : parseInt(e.target.value, 10)))} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-reverseMortgagePrincipalLimitPct">
                        <Tooltip text="The loan as a flat share of the home's value when it originates (40-60% is typical), fixed then. Real HECM limits come from HUD age and rate tables." more="Principal Limit">
                          Max Loan Amount (% of Home Value at Origination)
                        </Tooltip>
                      </label>
                      <NumberInput id="field-reverseMortgagePrincipalLimitPct" step="5" min="0" max="100" className="form-input" value={inputs.reverseMortgagePrincipalLimitPct} onChange={(e) => updateInput('reverseMortgagePrincipalLimitPct', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-reverseMortgageRate">Loan Interest Rate (%/yr)</label>
                      <NumberInput id="field-reverseMortgageRate" max="20" step="0.1" min="0" className="form-input" value={inputs.reverseMortgageRate} onChange={(e) => updateInput('reverseMortgageRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-reverseMortgagePayoutType">Payout Type</label>
                      <select id="field-reverseMortgagePayoutType" className="form-input form-input-select" value={inputs.reverseMortgagePayoutType} onChange={(e) => updateInput('reverseMortgagePayoutType', e.target.value)}>
                        <option value="monthly">Monthly Tenure Income (until the limit is used up)</option>
                        <option value="lumpSum">Lump Sum (draw the full limit immediately)</option>
                      </select>
                    </div>
                    {inputs.reverseMortgagePayoutType === 'monthly' && (
                      <div className="form-group">
                        <label htmlFor="field-reverseMortgageMonthlyPayout">Monthly Payout ($/mo)</label>
                        <NumberInput id="field-reverseMortgageMonthlyPayout" step="100" min="0" className="form-input" value={inputs.reverseMortgageMonthlyPayout} onChange={(e) => updateInput('reverseMortgageMonthlyPayout', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                      </div>
                    )}
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px', marginBottom: '16px' }}>
                      Payouts are tax-free loan proceeds (they reduce how much you need to draw from your other accounts, but never count as taxable income). The loan balance is non-recourse — it can never exceed your home's value, however large it grows.
                    </span>
                  </>
                )}
              </div>
    </>
  );
}
