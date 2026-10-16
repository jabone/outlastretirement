// SpendingPhasesSection -- the Go-Go / Slow-Go / No-Go spending phases and the go-go bump.
// Split out of SpecialExpensesSection in IA Phase 3 step 2 (2026-09-24) so the
// guided Interview can mount it on its own step. JSX unchanged.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { essentialShareOf, phaseMultiplierFor } from '../../../calculator';
import NumberInput from '../../NumberInput';

export default function SpendingPhasesSection() {
  const { inputs, updateInput, formatCurrency } = useSimulation();
  const essentialShare = essentialShareOf(inputs);
  return (
    <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <label htmlFor="toggle-lifestyleThreePhase" style={{ fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Enable Three-Phase Lifestyle Curve</label>
                  <span className="custom-switch">
                    <input id="toggle-lifestyleThreePhase" type="checkbox" checked={inputs.lifestyleThreePhaseEnabled} onChange={(e) => updateInput('lifestyleThreePhaseEnabled', e.target.checked)} />
                    <span className="slider-round"></span>
                  </span>
                </div>

                {inputs.lifestyleThreePhaseEnabled ? (
                  <div style={{ borderLeft: '2.5px solid var(--accent-primary)', paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label htmlFor="field-goGoEndAge">Go-Go End Age</label>
                        <NumberInput id="field-goGoEndAge" min="40" max="110" className="form-input" value={inputs.goGoEndAge} onChange={(e) => updateInput('goGoEndAge', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label htmlFor="field-goGoMultiplier">Go-Go Multiplier (%)</label>
                        <NumberInput id="field-goGoMultiplier" min="0" max="300" className="form-input" value={Math.round(inputs.goGoMultiplier * 100)} onChange={(e) => updateInput('goGoMultiplier', (e.target.value === '' ? '' : parseFloat(e.target.value)) / 100)} />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label htmlFor="field-slowGoEndAge">Slow-Go End Age</label>
                        <NumberInput id="field-slowGoEndAge" min="40" max="110" className="form-input" value={inputs.slowGoEndAge} onChange={(e) => updateInput('slowGoEndAge', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label htmlFor="field-slowGoMultiplier">Slow-Go Multiplier (%)</label>
                        <NumberInput id="field-slowGoMultiplier" min="0" max="300" className="form-input" value={Math.round(inputs.slowGoMultiplier * 100)} onChange={(e) => updateInput('slowGoMultiplier', (e.target.value === '' ? '' : parseFloat(e.target.value)) / 100)} />
                      </div>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label htmlFor="field-noGoMultiplier">No-Go Multiplier (%) (Starts at age {inputs.slowGoEndAge + 1})</label>
                      <NumberInput id="field-noGoMultiplier" min="0" max="300" className="form-input" value={Math.round(inputs.noGoMultiplier * 100)} onChange={(e) => updateInput('noGoMultiplier', (e.target.value === '' ? '' : parseFloat(e.target.value)) / 100)} />
                    </div>

                    {/* Floor-aware phases (changelog 262): only meaningful
                        once a ledger gives the plan an essential share. */}
                    {essentialShare !== null && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <label htmlFor="toggle-phasesFloorAware" style={{ fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
                          <strong>Apply the curve to discretionary spending only:</strong> <span style={{ color: 'var(--text-secondary)' }}>(your ledger says {Math.round(essentialShare * 100)}% of the budget is essential; that part stays whole in every phase)</span>
                        </label>
                        <span className="custom-switch">
                          <input id="toggle-phasesFloorAware" type="checkbox" checked={inputs.phasesFloorAware !== false} onChange={(e) => updateInput('phasesFloorAware', e.target.checked)} />
                          <span className="slider-round"></span>
                        </span>
                      </div>
                    )}

                    {/* Explanatory Live Calculation Card */}
                    <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(42, 127, 122, 0.2)', backgroundColor: 'rgba(42, 127, 122, 0.03)', fontSize: 'var(--fs-xs)', display: 'flex', gap: '8px', flexDirection: 'column' }}>
                      <div style={{ fontWeight: '700', color: 'var(--accent-text)' }}>Dynamic Lifestyle Targets (Base: {formatCurrency(inputs.lifestyleExpense)}/yr):</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div>• <strong>Go-Go</strong> (to age {inputs.goGoEndAge}): <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{formatCurrency(inputs.lifestyleExpense * phaseMultiplierFor(inputs, inputs.goGoMultiplier))}</span> / year</div>
                        <div>• <strong>Slow-Go</strong> (ages {inputs.goGoEndAge + 1} to {inputs.slowGoEndAge}): <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{formatCurrency(inputs.lifestyleExpense * phaseMultiplierFor(inputs, inputs.slowGoMultiplier))}</span> / year</div>
                        <div>• <strong>No-Go</strong> (ages {inputs.slowGoEndAge + 1}+): <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{formatCurrency(inputs.lifestyleExpense * phaseMultiplierFor(inputs, inputs.noGoMultiplier))}</span> / year</div>
                      </div>
                      <span style={{ opacity: 0.6, fontSize: 'var(--fs-2xs)' }}>*Indexed for inflation. Bypasses flat travel bump.</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                      <label htmlFor="toggle-goGoBumpEnabled" style={{ fontSize: '14px', cursor: 'pointer' }}>Enable Go-Go Travel Bumps</label>
                      <span className="custom-switch">
                        <input id="toggle-goGoBumpEnabled" type="checkbox" checked={inputs.goGoBumpEnabled} onChange={(e) => updateInput('goGoBumpEnabled', e.target.checked)} />
                        <span className="slider-round"></span>
                      </span>
                    </div>
                    {inputs.goGoBumpEnabled && (
                      <>
                        <div className="form-group">
                          <label htmlFor="field-goGoBumpRate">Go-Go Spending Bump (%)</label>
                          <NumberInput id="field-goGoBumpRate" min="0" max="200" className="form-input" value={inputs.goGoBumpRate} onChange={(e) => updateInput('goGoBumpRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-goGoBumpEndAge">Bump Ends at Age</label>
                          <NumberInput id="field-goGoBumpEndAge" min="40" max="110" className="form-input" value={inputs.goGoBumpEndAge} onChange={(e) => updateInput('goGoBumpEndAge', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                        </div>
                      </>
                    )}
                  </>
                )}
    </>
  );
}
