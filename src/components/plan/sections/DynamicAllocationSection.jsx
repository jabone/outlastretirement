// DynamicAllocationSection -- "Your Stock and Bond Mix" on Plan -> Assumptions
// & Risk. Extracted from SettingsTab.jsx in IA Phase 3 step 1 (2026-09-24).
// Changelog 480 ("one return model"): this is where a plan's return comes
// from. The mix fields are always live (the historical starts use them
// whatever the return setting); the stock and bond returns and the glide
// are set aside while "Use my own average return" is on.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { useEntitlement } from '../../../context/useEntitlement';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { planReturnRates } from '../../../calculator';
import NumberInput from '../../NumberInput';

export default function DynamicAllocationSection() {
  const { inputs, updateInput, setActiveTab, assetClassMix } = useSimulation();
  const { isPremium } = useEntitlement();
  return (
    <>
              <div data-testid="stock-bond-mix">
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  Your Stock and Bond Mix
                </h3>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '12px' }}>
                  How much of your savings is in stocks, and what you expect stocks and bonds to return each year before
                  inflation and fees. Each year your plan earns your stock share times the stock return plus the rest times
                  the bond return, rebalanced to the mix. The historical starts and the bootstrap replay real stock and bond
                  years at this same mix.
                </p>
                {/* One return model (changelog 480): what the mix and the two
                    returns come to, in the plan's own numbers. */}
                {(() => {
                  const r = planReturnRates({ ...inputs, rebalancingEnabled: true });
                  const infl = Number.isFinite(Number(inputs.inflationRate)) ? Number(inputs.inflationRate) : 2.5;
                  const f = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;
                  const high = Number(inputs.stockReturnRate) > 8.5 || r.retired > 6.5;
                  return inputs.rebalancingEnabled ? (
                    <p data-testid="allocation-return-check" style={{ fontSize: 'var(--fs-sm)', color: high ? 'var(--warning)' : 'var(--text-secondary)', marginTop: 0, marginBottom: '12px' }}>
                      {high && <AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} />}{' '}
                      Your plan grows <strong>{f(r.working)}</strong> a year while you work and <strong>{f(r.retired)}</strong> once
                      retired, before fees: {f(r.working - infl)} and {f(r.retired - infl)} after {f(infl)} inflation.
                      {high ? ' That is more than most long-term outlooks assume; the Monte Carlo and the historical starts show what it costs to be wrong.' : ''}
                    </p>
                  ) : (
                    <div data-testid="allocation-override-note" style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.2)', fontSize: '12.5px', color: 'var(--warning)', marginBottom: '12px', fontWeight: '500' }}>
                      <AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> Your own average return is in use
                      ({inputs.preRetireReturn}% working, {inputs.postRetireReturn}% retired, under Return Assumptions), so the
                      stock and bond returns below are set aside. The mix still sets the historical starts and the bootstrap.
                      At these returns it would give {f(r.working)} and {f(r.retired)}.
                    </div>
                  );
                })()}
                <div style={{ borderLeft: '3px solid var(--accent-secondary)', paddingLeft: '16px', marginTop: '10px' }}>
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
                        disabled={inputs.stockAllocationSource === 'holdings'}
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
                        className="form-input"
                        value={inputs.stockAllocationPost}
                        onChange={(e) => updateInput('stockAllocationPost', (e.target.value === '' ? '' : parseFloat(e.target.value)))} 
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-stockReturnRate">Stock Return (%/yr)</label>
                      <NumberInput id="field-stockReturnRate"
                        step="0.1"
                        min="-30"
                        max="30"
                        disabled={!inputs.rebalancingEnabled}
                        className="form-input"
                        value={inputs.stockReturnRate}
                        onChange={(e) => updateInput('stockReturnRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                      />
                      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>Compound, before inflation. US stocks returned about 10% a year from 1928 to 2025, with inflation near 3%; most long-term outlooks expect less (about 5% to 7.5% in late 2026). The default is 6.5%.</span>
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-bondReturnRate">Bond Return (%/yr)</label>
                      <NumberInput id="field-bondReturnRate"
                        step="0.1"
                        min="-30"
                        max="30"
                        disabled={!inputs.rebalancingEnabled}
                        className="form-input"
                        value={inputs.bondReturnRate}
                        onChange={(e) => updateInput('bondReturnRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                      />
                      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>Compound, before inflation. Today&rsquo;s bond yields are the best guide: the 10-year Treasury paid about 5% in late 2026, and outlooks run about 4.5% to 6%. The default is 4.5%.</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '15px 0' }}>
                    <label htmlFor="toggle-glideAllocationEnabled" style={{ fontSize: 'var(--fs-body)', cursor: 'pointer' }}>Move toward bonds each year in retirement</label>
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
