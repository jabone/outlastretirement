// ConcentratedStockSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_concentratedStock block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { CollapsibleHeader } from '../sectionShared';
import { useFoldState } from '../foldState';
import { CheckCircle2, Coins } from 'lucide-react';
import Tooltip from '../../Tooltip';
import { computeMarketValue } from '../../../utils/holdingsCore';
import NumberInput from '../../NumberInput';

export default function ConcentratedStockSection({ forceOpen = false }) {
  const { inputs, updateInput, formatCurrency, holdings } = useSimulation();
  const [showConcentratedStock, toggleShowConcentratedStock] = useFoldState('concentratedStock', () => !!inputs.concentratedStockEnabled, forceOpen);
  // Only Taxable-tagged holdings are offered for the Concentrated Stock
  // link -- diversification proceeds always flow into the Taxable bucket
  // (calculator.js), so linking a Pre-Tax/Roth/HSA holding would
  // misrepresent the tax treatment this model assumes. Not memoized --
  // `holdings` is a small, premium-only list, same cost as the other
  // plain-filter derived values on this tab.
  const taxableHoldingsForConcentratedLink = (holdings || []).filter((h) => h?.taxTreatment === 'taxable');
  // One concentrated position's full field set. n=1 uses the original
  // un-numbered concentratedStock* input keys (existing plans and element
  // ids untouched); n=2 uses concentratedStock2*. calculator.js's
  // csPositionConfig() is the same mapping on the engine side.
  const csKey = (n, name) => (n === 1 ? `concentratedStock${name}` : `concentratedStock2${name}`);
  const renderConcentratedPositionFields = (n) => {
    const K = (name) => csKey(n, name);
    // Don't offer the holding the OTHER position is already linked to --
    // one real-world position shouldn't be counted twice.
    const otherN = n === 1 ? 2 : 1;
    const otherLinkedId = inputs[csKey(otherN, 'Source')] === 'holdings' ? inputs[csKey(otherN, 'HoldingId')] : null;
    const linkOptions = taxableHoldingsForConcentratedLink.filter((h) => h.id !== otherLinkedId);
    const vestSpouseValue = String(inputs[K('VestSpouse')] !== undefined ? inputs[K('VestSpouse')] : (n === 1 ? '1' : '2'));
    return (
      <div>
                        {/* Link to a real Detailed Holdings position -- unlike
                            the three bucket-level links elsewhere on this
                            tab, this one picks ONE specific holding per
                            position, restricted to Taxable-tagged holdings
                            since diversification proceeds always flow into
                            the Taxable bucket. See calculator.js's
                            concentratedStockSource comment and App.jsx's
                            sync effects. */}
                        <div className="form-group" style={{ marginBottom: '10px' }}>
                          <label htmlFor={`field-${K('Link')}`}>Link to a Holding (optional)</label>
                          <select
                            id={`field-${K('Link')}`}
                            className="form-input form-input-select"
                            value={inputs[K('Source')] === 'holdings' ? (inputs[K('HoldingId')] || '') : ''}
                            onChange={(e) => {
                              const id = e.target.value;
                              if (id === '') {
                                updateInput(K('Source'), 'manual');
                                updateInput(K('HoldingId'), null);
                              } else {
                                updateInput(K('HoldingId'), id);
                                updateInput(K('Source'), 'holdings');
                              }
                            }}
                          >
                            <option value="">Manual Entry</option>
                            {linkOptions.map((h) => (
                              <option key={h.id} value={h.id}>{h.symbol || '(no symbol)'} — {formatCurrency(computeMarketValue(h))}</option>
                            ))}
                          </select>
                          {inputs[K('Source')] === 'holdings' && (
                            <span style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: 'var(--fs-xs)', color: 'var(--success)', marginTop: '6px' }}>
                              <CheckCircle2 size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
                              <span>Label, Current Value, and Cost Basis % below now track this holding automatically. It is also pulled out of your Taxable Brokerage total so it isn&rsquo;t counted twice &mdash; once here and once in the bucket.</span>
                            </span>
                          )}
                          {linkOptions.length === 0 && (
                            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                              No Taxable-tagged holdings in Detailed Holdings yet — add one there to link it here instead of entering the fields below by hand.
                            </span>
                          )}
                        </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                        <div className="form-group">
                          <label htmlFor={`field-${K('Label')}`}>Label (optional)</label>
                          <input id={`field-${K('Label')}`} type="text" className="form-input" placeholder={n === 1 ? 'e.g. GOOG' : 'e.g. META'} disabled={inputs[K('Source')] === 'holdings'} value={inputs[K('Label')] || ''} onChange={(e) => updateInput(K('Label'), e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`field-${K('Init')}`}>Current Value ($)</label>
                          <NumberInput id={`field-${K('Init')}`} step="1000" min="0" className="form-input" disabled={inputs[K('Source')] === 'holdings'} value={inputs[K('Init')] || 0} onChange={(e) => updateInput(K('Init'), parseFloat(e.target.value) || 0)} />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`field-${K('CostBasisPct')}`}>
                            <Tooltip text={`The share of today's value that is cost basis rather than gain, one flat figure used to size the tax on a diversification sale.${inputs[K('VestRoutingEnabled')] ? ' With vest routing on, this seeds only today\u2019s position; routed vests arrive at full basis.' : ''}`} more="Cost Basis (%">
                              Cost Basis (%)
                            </Tooltip>
                          </label>
                          <NumberInput id={`field-${K('CostBasisPct')}`} step="1" min="0" max="100" className="form-input" disabled={inputs[K('Source')] === 'holdings'} value={inputs[K('CostBasisPct')] !== undefined ? inputs[K('CostBasisPct')] : 20} onChange={(e) => updateInput(K('CostBasisPct'), parseFloat(e.target.value) || 0)} />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`field-${K('GrowthRate')}`}>Growth Rate (%/yr)</label>
                          <NumberInput id={`field-${K('GrowthRate')}`} min="-50" max="50" step="0.1" className="form-input" value={inputs[K('GrowthRate')] !== undefined ? inputs[K('GrowthRate')] : 8} onChange={(e) => updateInput(K('GrowthRate'), parseFloat(e.target.value) || 0)} />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`field-${K('DiversifyPct')}`}>
                            <Tooltip text="% of the CURRENT balance sold off into Taxable Brokerage each year. Leave at 0 to simply hold and track the position with no active de-risking plan.">
                              Diversify (%/yr)
                            </Tooltip>
                          </label>
                          <NumberInput id={`field-${K('DiversifyPct')}`} step="1" min="0" max="100" className="form-input" value={inputs[K('DiversifyPct')] || 0} onChange={(e) => updateInput(K('DiversifyPct'), parseFloat(e.target.value) || 0)} />
                        </div>
                        {/* The flat rate is read only when the legacy
                            concentratedStockFlatTaxEnabled flag is on (plans
                            built before diversification gains ran through
                            the full capital-gains math). No control sets
                            that flag, so a plan without it has nothing to
                            edit here and the field stays hidden. */}
                        {inputs.concentratedStockFlatTaxEnabled && (
                        <div className="form-group">
                          <label htmlFor={`field-${K('DiversifyTaxRate')}`}>
                            <Tooltip text="This older plan taxes each year's diversification gain at this flat rate, apart from the rest of the year's taxes. Plans made today tax the gain like any other capital gain instead.">
                              Diversify Tax Rate (%)
                            </Tooltip>
                          </label>
                          <NumberInput id={`field-${K('DiversifyTaxRate')}`} step="1" min="0" max="100" className="form-input" value={inputs[K('DiversifyTaxRate')] !== undefined ? inputs[K('DiversifyTaxRate')] : 15} onChange={(e) => updateInput(K('DiversifyTaxRate'), parseFloat(e.target.value) || 0)} />
                        </div>
                        )}
                        {n === 1 && (
                          <div className="form-group">
                            <label htmlFor="field-concentratedStockConcentrationTargetPct">
                              <Tooltip text="The share of net worth above which a single stock is flagged as a concentration risk. Display only; advisors often suggest 10-15%." more="Risk Warning Threshold">
                                Risk Warning Threshold (%)
                              </Tooltip>
                            </label>
                            <NumberInput id="field-concentratedStockConcentrationTargetPct" step="1" min="0" max="100" className="form-input" value={inputs.concentratedStockConcentrationTargetPct !== undefined ? inputs.concentratedStockConcentrationTargetPct : 10} onChange={(e) => updateInput('concentratedStockConcentrationTargetPct', parseFloat(e.target.value) || 0)} />
                          </div>
                        )}
                      </div>
                      {/* Vest routing: hold new RSU/GSU shares as they vest
                          instead of the default sell-on-vest assumption.
                          Mirrors the big-tech sell-to-cover mechanic; see
                          calculator.js's concentratedStockVestRoutingEnabled
                          comment for the exact math. */}
                      <div style={{ marginTop: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <label htmlFor={`toggle-${K('VestRouting')}`} style={{ fontSize: 'var(--fs-body)', cursor: 'pointer' }}>
                            <Tooltip text="Keeps each year's vested shares in this position instead of selling them for cash. The vest is taxed as ordinary income either way." more="Route New Vests">
                              Route New Vests Into This Position
                            </Tooltip>
                          </label>
                          <span className="custom-switch">
                            <input
                              id={`toggle-${K('VestRouting')}`}
                              type="checkbox"
                              checked={!!inputs[K('VestRoutingEnabled')]}
                              onChange={(e) => updateInput(K('VestRoutingEnabled'), e.target.checked)}
                            />
                            <span className="slider-round"></span>
                          </span>
                        </div>
                        {!!inputs[K('VestRoutingEnabled')] && (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                              <div className="form-group">
                                <label htmlFor={`field-${K('VestCoverPct')}`}>
                                  <Tooltip text="The share of each vest your employer sells for tax withholding (about 35% is typical). Sets how many shares are left to hold; your actual tax is still computed on the full vest." more="Sold to Cover">
                                    Sold to Cover Taxes (%)
                                  </Tooltip>
                                </label>
                                <NumberInput id={`field-${K('VestCoverPct')}`} step="1" min="0" max="100" className="form-input" value={inputs[K('VestCoverPct')] !== undefined ? inputs[K('VestCoverPct')] : 35} onChange={(e) => updateInput(K('VestCoverPct'), parseFloat(e.target.value) || 0)} />
                              </div>
                              <div className="form-group">
                                <label htmlFor={`field-${K('VestHoldPct')}`}>
                                  <Tooltip text="Of the shares left after sell-to-cover, the share you keep. 100 holds everything; 0 sells on vest, the same as routing off." more="You Hold">
                                    Of the Rest, % You Hold
                                  </Tooltip>
                                </label>
                                <NumberInput id={`field-${K('VestHoldPct')}`} step="1" min="0" max="100" className="form-input" value={inputs[K('VestHoldPct')] !== undefined ? inputs[K('VestHoldPct')] : 100} onChange={(e) => updateInput(K('VestHoldPct'), parseFloat(e.target.value) || 0)} />
                              </div>
                              {inputs.spouse2Enabled && (
                                <div className="form-group">
                                  <label htmlFor={`field-${K('VestSpouse')}`}>
                                    <Tooltip text="Whose RSU/GSU vests feed this position. 'Both' is only right when both spouses hold the SAME employer's stock — if each spouse holds a different stock, give each their own position.">
                                      Whose Vests
                                    </Tooltip>
                                  </label>
                                  <select
                                    id={`field-${K('VestSpouse')}`}
                                    className="form-input form-input-select"
                                    value={vestSpouseValue}
                                    onChange={(e) => updateInput(K('VestSpouse'), e.target.value)}
                                  >
                                    <option value="1">{inputs.spouse1Name || 'Primary'}</option>
                                    <option value="2">{inputs.spouse2Name || 'Spouse'}</option>
                                    <option value="both">Both</option>
                                  </select>
                                </div>
                              )}
                            </div>
                            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                              Example: a $100k vest with 35% sold to cover and 100% of the rest held routes $65k into this position that year.
                            </span>
                          </>
                        )}
                      </div>
                      </div>
    );
  };
  return (
    <>
                <CollapsibleHeader
                  title="Concentrated Stock Position"
                  icon={<Coins size={16} style={{ color: 'var(--accent-text)' }} />}
                  isOpen={showConcentratedStock}
                  onToggle={toggleShowConcentratedStock}
                />
                {showConcentratedStock && (
                  <div>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '16px' }}>
                      Tracks accumulated employer stock (e.g. years of vested RSU/GSU shares you never sold) as its own risk bucket, separate from your diversified Taxable Brokerage balance — a single-company holding carries a concentration risk a diversified portfolio doesn't. Optionally model gradually selling it off ("diversifying") into Taxable Brokerage over time, and/or routing new vests in as they land. A second position is available for a household where each spouse holds a different employer's stock.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                      <label htmlFor="toggle-concentratedStockEnabled" style={{ fontSize: 'var(--fs-body)', cursor: 'pointer' }}>Track a Concentrated Stock Position</label>
                      <span className="custom-switch">
                        <input
                          id="toggle-concentratedStockEnabled"
                          type="checkbox"
                          checked={!!inputs.concentratedStockEnabled}
                          onChange={(e) => updateInput('concentratedStockEnabled', e.target.checked)}
                        />
                        <span className="slider-round"></span>
                      </span>
                    </div>
                    {inputs.concentratedStockEnabled && renderConcentratedPositionFields(1)}
                    {inputs.concentratedStockEnabled && (
                      <div style={{ marginTop: '18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                          <label htmlFor="toggle-concentratedStock2Enabled" style={{ fontSize: 'var(--fs-body)', cursor: 'pointer' }}>
                            <Tooltip text="A second, independent employer-stock position (one spouse's GOOG, the other's META), with its own value, growth and plan. Both share the risk threshold." more="Second Position">
                              Track a Second Position
                            </Tooltip>
                          </label>
                          <span className="custom-switch">
                            <input
                              id="toggle-concentratedStock2Enabled"
                              type="checkbox"
                              checked={!!inputs.concentratedStock2Enabled}
                              onChange={(e) => updateInput('concentratedStock2Enabled', e.target.checked)}
                            />
                            <span className="slider-round"></span>
                          </span>
                        </div>
                        {inputs.concentratedStock2Enabled && renderConcentratedPositionFields(2)}
                      </div>
                    )}
                  </div>
                )}

    </>
  );
}
