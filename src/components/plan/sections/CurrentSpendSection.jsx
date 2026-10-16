// CurrentSpendSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_currentSpend block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { CurrentSpendingResidual, SpendingBridgePanel } from '../sectionShared';
import NumberInput from '../../NumberInput';

export default function CurrentSpendSection() {
  const { inputs, updateInput, formatCurrency, setActiveTab, projection } = useSimulation();
  // Rung 1 of the Retirement Spending module (changelog 134): the first
  // pre-retirement year's spending residual, for the auto-mode readout below.
  // The FIRST year specifically, because that one is in today's dollars
  // (its inflation factor is 1) -- later years are inflated and would need
  // deflating before they could be shown as "what you spend now".
  // Null once the plan starts retired, which is when the readout has nothing
  // to say and hides itself.
  const autoSpendingBreakdown = (projection?.years || [])
    .find((y) => y.currentSpending && y.currentSpending.mode === 'auto')?.currentSpending || null;
  // The bridge starts from what the household spends today, whichever way
  // that was arrived at -- the rung-1 residual in auto mode, or the figure
  // the user typed in custom mode. Both are today's-dollars annual amounts,
  // so the bridge arithmetic is identical either way.
  const bridgeStartingResidual = inputs.currentSpendingMode === 'custom'
    ? (Number(inputs.currentHouseholdSpendingCustom) || 0)
    : (autoSpendingBreakdown?.derived || 0);
  return (
    <>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '16px' }}>
                  What you actually spend <em>while still working</em> — separate from "Annual Lifestyle" above, which is your retirement <strong>target</strong> spend. These are often different: your retirement target might be $120k/yr, but if you're still working and saving toward it, your real day-to-day spending today could be less. Keeping them separate stops the model from ever drawing down retirement accounts to cover a gap that's really just the difference between what you spend now and what you plan to spend later.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <label htmlFor="toggle-currentSpendingCustom" style={{ fontSize: 'var(--fs-body)', cursor: 'pointer' }}>Enter my own budget instead of auto-calculating</label>
                  <span className="custom-switch">
                    <input
                      id="toggle-currentSpendingCustom"
                      type="checkbox"
                      checked={inputs.currentSpendingMode === 'custom'}
                      onChange={(e) => updateInput('currentSpendingMode', e.target.checked ? 'custom' : 'auto')}
                    />
                    <span className="slider-round"></span>
                  </span>
                </div>
                {inputs.currentSpendingMode === 'custom' ? (
                  <div className="form-group">
                    <label htmlFor="field-currentHouseholdSpendingCustom">Current Household Spending ($/yr)</label>
                    <NumberInput id="field-currentHouseholdSpendingCustom"
                      step="1000"
                      min="0"
                      className="form-input"
                      value={inputs.currentHouseholdSpendingCustom !== undefined ? inputs.currentHouseholdSpendingCustom : 60000}
                      onChange={(e) => {
                        const val = (e.target.value === '' ? '' : parseFloat(e.target.value));
                        updateInput('currentHouseholdSpendingCustom', isNaN(val) ? '' : val);
                      }}
                    />
                    <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>Your actual known budget today, in today's dollars — the model adjusts it for inflation each year. Leave out mortgage and debt payments; the plan adds those from Balances &amp; Debt.</span>
                  </div>
                ) : (
                  <CurrentSpendingResidual breakdown={autoSpendingBreakdown} formatCurrency={formatCurrency} />
                )}

                <SpendingBridgePanel formatCurrency={formatCurrency} setActiveTab={setActiveTab} residual={bridgeStartingResidual} />

    </>
  );
}
