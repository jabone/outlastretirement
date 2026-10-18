// DeductionsSection -- the federal deduction choice (changelog 417): the
// plan takes the larger of the standard deduction and the four itemized
// lines it can see (state and property tax, mortgage interest, cash gifts,
// medical costs). Two of those are typed here; the others the engine
// already has.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import NumberInput from '../../NumberInput';
import Tooltip from '../../Tooltip';

export default function DeductionsSection() {
  const { inputs, updateInput } = useSimulation();
  const hasMortgage = (Number(inputs.mortgageBalance) || 0) > 0 && (Number(inputs.mortgagePayment) || 0) > 0;
  return (
    <>
                <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '24px 0 16px 0', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  Federal Deductions
                </h3>

                <div className="form-group">
                  <label htmlFor="field-itemizeDeductions">
                    <Tooltip text="Each year the return takes either the standard deduction or the total of the deductions the plan can see: state and property tax (capped), mortgage interest, cash gifts and medical costs over 7.5% of income. Auto takes whichever is larger, as a tax program does." more="Itemized deductions">
                      Deduction
                    </Tooltip>
                  </label>
                  <select id="field-itemizeDeductions" className="form-input form-input-select" value={inputs.itemizeDeductions === 'never' ? 'never' : 'auto'} onChange={(e) => updateInput('itemizeDeductions', e.target.value)}>
                    <option value="auto">Larger of the standard deduction and itemized deductions, each year</option>
                    <option value="never">Always the standard deduction</option>
                  </select>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    {inputs.itemizeDeductions === 'never'
                      ? 'The standard deduction every year, plus the small charitable deduction a non-itemizer gets from 2026.'
                      : 'Itemizing counts state income tax (what the plan computed for the year before), the property tax below, mortgage interest from your Debt entries, the cash gifts below, and health costs (the pre-65 bridge, long-term care and Medicare premiums) over 7.5% of income. The Tax & Estate view says which the year used.'}
                  </span>
                </div>

                <div className="form-group">
                  <label htmlFor="field-propertyTaxAnnual">Property tax ($/yr, today&rsquo;s dollars)</label>
                  <NumberInput id="field-propertyTaxAnnual" step="500" min="0" className="form-input" value={inputs.propertyTaxAnnual !== undefined ? inputs.propertyTaxAnnual : 0} onChange={(e) => updateInput('propertyTaxAnnual', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    Grows with your housing inflation rate. Counted with state income tax under the $40,400 cap for 2026 (rising 1% a year to 2029, then $10,000). Only for the deduction: the cost itself stays inside your Housing spending.
                  </span>
                </div>

                <div className="form-group">
                  <label htmlFor="field-charitableGivingAnnual">Cash gifts to charity ($/yr, today&rsquo;s dollars)</label>
                  <NumberInput id="field-charitableGivingAnnual" step="500" min="0" className="form-input" value={inputs.charitableGivingAnnual !== undefined ? inputs.charitableGivingAnnual : 0} onChange={(e) => updateInput('charitableGivingAnnual', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    Grows with inflation. Deductible when itemizing after a floor of 0.5% of income, and up to $1,000 ($2,000 joint) a year even when not. Qualified Charitable Distributions are separate: they leave your IRA untaxed and are never deducted twice. Only for the deduction: the giving itself stays inside your spending.
                  </span>
                </div>

                {hasMortgage && (
                  <div className="form-group">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <label htmlFor="toggle-mortgageIsAcquisitionDebt" style={{ fontSize: '13px', cursor: 'pointer' }}>
                        The mortgage bought or built the home (its interest is deductible, on up to $750,000 of principal)
                      </label>
                      <span className="custom-switch">
                        <input id="toggle-mortgageIsAcquisitionDebt" type="checkbox" checked={inputs.mortgageIsAcquisitionDebt !== false} onChange={(e) => updateInput('mortgageIsAcquisitionDebt', e.target.checked)} />
                        <span className="slider-round"></span>
                      </span>
                    </div>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                      Turn it off for a cash-out refinance or a home-equity loan, whose interest is not deductible.
                    </span>
                  </div>
                )}
    </>
  );
}
