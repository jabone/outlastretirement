// DynamicAllocationSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_dynamicAllocation block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { useEntitlement } from '../../../context/useEntitlement';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import NumberInput from '../../NumberInput';

export default function DynamicAllocationSection() {
  const { inputs, updateInput, setActiveTab, assetClassMix } = useSimulation();
  const { isPremium } = useEntitlement();
  return (
    <>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  Dynamic Asset Allocation & Rebalancing
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '15px 0' }}>
                  <label htmlFor="toggle-rebalancingEnabled" style={{ fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Enable Dynamic Asset Allocation (Stock/Bond Rebalancing)</label>
                  <span className="custom-switch">
                    <input id="toggle-rebalancingEnabled" type="checkbox" checked={inputs.rebalancingEnabled} onChange={(e) => updateInput('rebalancingEnabled', e.target.checked)} />
                    <span className="slider-round"></span>
                  </span>
                </div>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '12px' }}>
                  When enabled, your rate of return is calculated dynamically based on your stock/bond ratio instead of using a simple flat percentage rate.
                </p>

                {/* The notice sits outside the dimmed block so it stays readable. */}
                {!inputs.rebalancingEnabled && (
                  <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.2)', fontSize: '12.5px', color: 'var(--warning)', marginBottom: '12px', fontWeight: '500' }}>
                    <AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> Currently Overridden: The calculator is using the flat Return Assumptions set just above ({inputs.preRetireReturn}% working, {inputs.postRetireReturn}% retired). Toggle the switch above ("Enable Dynamic Asset Allocation") to activate this stock/bond allocation model instead.
                  </div>
                )}
                <div style={{ borderLeft: '3px solid var(--accent-secondary)', paddingLeft: '16px', marginTop: '10px', opacity: inputs.rebalancingEnabled ? 1 : 0.6 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
                    <div className="form-group">
                      <label htmlFor="field-stockAllocationPre">Stock Allocation (Working) (%)</label>
                      {inputs.stockAllocationSource === 'holdings' ? (
                        // Linked mode, same pattern as Initial Balances/Known
                        // Cost Basis above: driven by App.jsx's auto-sync
                        // effect from real Detailed Holdings (real stock/
                        // bond/cash mix via computeAssetClassMix), so
                        // editable-by-hand doesn't apply here. Only Pre links
                        // -- see calculator.js's stockAllocationSource
                        // comment for why Post always stays manual.
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: 'var(--fs-xs)', color: 'var(--success)', marginBottom: '8px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                          <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                          <span>Linked to Detailed Holdings ({Math.round(assetClassMix?.stockPctOfClassified ?? inputs.stockAllocationPre)}% stock) — updates automatically.</span>
                          {isPremium && (
                            <button className="btn-outline" style={{ padding: '3px 8px', fontSize: 'var(--fs-xs)' }} onClick={() => setActiveTab('portfolio')}>
                              Edit in Detailed Holdings
                            </button>
                          )}
                          <button className="btn-outline" style={{ padding: '3px 8px', fontSize: 'var(--fs-xs)' }} onClick={() => updateInput('stockAllocationSource', 'manual')}>
                            Unlink
                          </button>
                        </div>
                      ) : null}
                      <NumberInput id="field-stockAllocationPre"
                        min="0"
                        max="100"
                        disabled={!inputs.rebalancingEnabled || inputs.stockAllocationSource === 'holdings'}
                        className="form-input"
                        value={inputs.stockAllocationPre}
                        onChange={(e) => updateInput('stockAllocationPre', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-stockAllocationPost">Stock Allocation (Retired) (%)</label>
                      <NumberInput id="field-stockAllocationPost" 
                        min="0" 
                        max="100" 
                        disabled={!inputs.rebalancingEnabled}
                        className="form-input" 
                        value={inputs.stockAllocationPost} 
                        onChange={(e) => updateInput('stockAllocationPost', (e.target.value === '' ? '' : parseFloat(e.target.value)))} 
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-stockReturnRate">Assumed Stock Return Rate (%)</label>
                      <NumberInput id="field-stockReturnRate"
                        step="0.1"
                        min="-30"
                        max="30"
                        disabled={!inputs.rebalancingEnabled}
                        className="form-input"
                        value={inputs.stockReturnRate}
                        onChange={(e) => updateInput('stockReturnRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-bondReturnRate">Assumed Bond Return Rate (%)</label>
                      <NumberInput id="field-bondReturnRate"
                        step="0.1"
                        min="-30"
                        max="30"
                        disabled={!inputs.rebalancingEnabled}
                        className="form-input"
                        value={inputs.bondReturnRate}
                        onChange={(e) => updateInput('bondReturnRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '15px 0' }}>
                    <label htmlFor="toggle-glideAllocationEnabled" style={{ fontSize: 'var(--fs-body)', cursor: 'pointer' }}>Glide Allocation (reduces stock %)</label>
                    <span className="custom-switch">
                      <input
                        id="toggle-glideAllocationEnabled"
                        type="checkbox"
                        disabled={!inputs.rebalancingEnabled}
                        checked={inputs.glideAllocationEnabled}
                        onChange={(e) => updateInput('glideAllocationEnabled', e.target.checked)}
                      />
                      <span className="slider-round"></span>
                    </span>
                  </div>

                  {inputs.glideAllocationEnabled && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px', marginTop: '8px' }}>
                      <div className="form-group">
                        <label htmlFor="field-glideAllocationRate">Annual Stock reduction (%)</label>
                        <NumberInput id="field-glideAllocationRate"
                          step="0.1"
                          min="0"
                          max="20"
                          disabled={!inputs.rebalancingEnabled}
                          className="form-input"
                          value={inputs.glideAllocationRate}
                          onChange={(e) => updateInput('glideAllocationRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="field-glideAllocationFloor">Stock Allocation Floor (%)</label>
                        <NumberInput id="field-glideAllocationFloor"
                          min="0"
                          max="100"
                          disabled={!inputs.rebalancingEnabled}
                          className="form-input"
                          value={inputs.glideAllocationFloor}
                          onChange={(e) => updateInput('glideAllocationFloor', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
    </>
  );
}
