// SalariesSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_salaries block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { getPossessive } from '../getPossessive';
import NumberInput from '../../NumberInput';

export default function SalariesSection() {
  const { inputs, updateInput } = useSimulation();
  return (
    <>
                <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '24px 0 16px 0', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  Pre-Retirement W-2 Salaries
                </h3>
                <div className="form-group">
                  <label htmlFor="field-salary1">{getPossessive(inputs.spouse1Name || 'Primary')} Annual Salary ($/yr)</label>
                  <NumberInput id="field-salary1" commas
                    step="5000"
                    min="0"
                    className="form-input"
                    value={inputs.salary1 !== undefined ? inputs.salary1 : 150000}
                    onChange={(e) => {
                      const val = (e.target.value === '' ? '' : parseFloat(e.target.value));
                      updateInput('salary1', isNaN(val) ? '' : val);
                    }} 
                  />
                </div>
                {inputs.spouse2Enabled && (
                  <div className="form-group">
                    <label htmlFor="field-salary2">{getPossessive(inputs.spouse2Name || 'Spouse')} Annual Salary ($/yr)</label>
                    <NumberInput id="field-salary2" commas
                      step="5000"
                      min="0"
                      className="form-input"
                      value={inputs.salary2 !== undefined ? inputs.salary2 : 80000}
                      onChange={(e) => {
                        const val = (e.target.value === '' ? '' : parseFloat(e.target.value));
                        updateInput('salary2', isNaN(val) ? '' : val);
                      }}
                    />
                  </div>
                )}

    </>
  );
}
