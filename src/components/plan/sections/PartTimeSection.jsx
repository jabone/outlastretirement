// PartTimeSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_partTime block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useSimulation } from '../../../context/useSimulation';
import { getPossessive } from '../getPossessive';
import NumberInput from '../../NumberInput';

export default function PartTimeSection() {
  const { inputs, updateInput } = useSimulation();
  return (
    <>
                <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '24px 0 16px 0', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  Phased / Part-Time Retirement Income
                </h3>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '16px' }}>
                  Optional reduced earned income (consulting, part-time work) after retirement age, taxed the same as salary. Leave at $0 to model a full stop of income at retirement.
                </p>
                <div className="form-group">
                  <label htmlFor="field-partTimeIncome1">{getPossessive(inputs.spouse1Name || 'Primary')} Part-Time Income ($/yr)</label>
                  <NumberInput id="field-partTimeIncome1"
                    step="1000"
                    min="0"
                    className="form-input"
                    value={inputs.partTimeIncome1 !== undefined ? inputs.partTimeIncome1 : 0}
                    onChange={(e) => {
                      const val = (e.target.value === '' ? '' : parseFloat(e.target.value));
                      updateInput('partTimeIncome1', isNaN(val) ? '' : val);
                    }}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="field-partTimeIncomeEndAge1">{getPossessive(inputs.spouse1Name || 'Primary')} Part-Time Income End Age</label>
                  <NumberInput id="field-partTimeIncomeEndAge1"
                    min={inputs.retireAge1 || 40}
                    max="120"
                    className="form-input"
                    value={inputs.partTimeIncomeEndAge1 !== undefined ? inputs.partTimeIncomeEndAge1 : 70}
                    onChange={(e) => {
                      const val = (e.target.value === '' ? '' : parseInt(e.target.value));
                      updateInput('partTimeIncomeEndAge1', isNaN(val) ? '' : val);
                    }}
                  />
                  {inputs.partTimeIncome1 > 0 && inputs.partTimeIncomeEndAge1 !== '' && inputs.retireAge1 !== '' && inputs.partTimeIncomeEndAge1 <= inputs.retireAge1 && (
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', display: 'block', marginTop: '4px' }}>
                      <AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> End age is at or before retirement age — this part-time income will never apply.
                    </span>
                  )}
                </div>
                {inputs.spouse2Enabled && (
                  <>
                    <div className="form-group">
                      <label htmlFor="field-partTimeIncome2">{getPossessive(inputs.spouse2Name || 'Spouse')} Part-Time Income ($/yr)</label>
                      <NumberInput id="field-partTimeIncome2"
                        step="1000"
                        min="0"
                        className="form-input"
                        value={inputs.partTimeIncome2 !== undefined ? inputs.partTimeIncome2 : 0}
                        onChange={(e) => {
                          const val = (e.target.value === '' ? '' : parseFloat(e.target.value));
                          updateInput('partTimeIncome2', isNaN(val) ? '' : val);
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-partTimeIncomeEndAge2">{getPossessive(inputs.spouse2Name || 'Spouse')} Part-Time Income End Age</label>
                      <NumberInput id="field-partTimeIncomeEndAge2"
                        min={inputs.retireAge2 || 40}
                        max="120"
                        className="form-input"
                        value={inputs.partTimeIncomeEndAge2 !== undefined ? inputs.partTimeIncomeEndAge2 : 70}
                        onChange={(e) => {
                          const val = (e.target.value === '' ? '' : parseInt(e.target.value));
                          updateInput('partTimeIncomeEndAge2', isNaN(val) ? '' : val);
                        }}
                      />
                      {inputs.partTimeIncome2 > 0 && inputs.partTimeIncomeEndAge2 !== '' && inputs.retireAge2 !== '' && inputs.partTimeIncomeEndAge2 <= inputs.retireAge2 && (
                        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', display: 'block', marginTop: '4px' }}>
                          <AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> End age is at or before retirement age — this part-time income will never apply.
                        </span>
                      )}
                    </div>
                  </>
                )}
    </>
  );
}
