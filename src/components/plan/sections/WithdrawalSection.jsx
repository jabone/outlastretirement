// WithdrawalSection -- withdrawal order, taxable-account basis and dividends, tax-loss harvesting, and the cash reserve floor.
// Split out of SpecialExpensesSection in IA Phase 3 step 2 (2026-09-24) so the
// guided Interview can mount it on its own step. JSX unchanged.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { CheckCircle2 } from 'lucide-react';
import { useEntitlement } from '../../../context/useEntitlement';
import Tooltip from '../../Tooltip';
import { CollapsibleHeader } from '../sectionShared';
import { useFoldState } from '../foldState';
import { computeTaxableDistributionYield, computeCashReserveFromHoldings } from '../../../utils/holdingsCore';
import NumberInput from '../../NumberInput';
import { qualifiedShareFromAllocation } from '../../../calculator';

export default function WithdrawalSection({ forceOpen = false }) {
  const { inputs, updateInput, formatCurrency, setActiveTab, taxableCostBasis, holdings } = useSimulation();
  // Its own fold on Plan -> Spending (it used to be buried inside "Special
  // Expenses"), open by default when any of it is in use.
  const [open, toggle] = useFoldState('withdrawals', () => (
    inputs.taxLossHarvestingEnabled || inputs.withdrawalStrategy !== 'TaxableFirst' || inputs.cashFloorEnabled
  ), forceOpen);
  const { isPremium } = useEntitlement();
  // Offered beside the Cash Reserve Floor field below. Not memoised against
  // the concentrated exclusion the way App.jsx's copy is -- this one only
  // decides whether to show the link button and what figure to put on it;
  // App.jsx owns the value that actually reaches the plan.
  const cashReserveFromHoldings = computeCashReserveFromHoldings(holdings || []);
  return (
    <>
                <CollapsibleHeader title="Withdrawals & Taxable Account" isOpen={open} onToggle={toggle} />
                {open && (
                <>
                <div className="form-group">
                  <label htmlFor="field-withdrawalStrategy">Withdrawal Order</label>
                  <select id="field-withdrawalStrategy" className="form-input form-input-select" value={inputs.withdrawalStrategy} onChange={(e) => updateInput('withdrawalStrategy', e.target.value)}>
                    <option value="TaxableFirst">Taxable Brokerage First (Standard)</option>
                    <option value="PreTaxFirst">Pre-Tax Account First</option>
                    <option value="RothFirst">Roth Account First</option>
                    <option value="ProRata">Pro-Rata Proportional Draws</option>
                  </select>
                </div>

                <div className="form-group" style={{ borderLeft: '2.5px solid var(--series-3)', paddingLeft: '12px', marginTop: '16px' }}>
                  <label htmlFor="field-taxableCapitalGainsRatio" style={{ fontWeight: '500' }}>Taxable Brokerage starting capital gains ratio (%)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <NumberInput id="field-taxableCapitalGainsRatio"
                      min="0"
                      max="100"
                      className="form-input"
                      style={{ flex: 1 }}
                      value={inputs.taxableCapitalGainsRatio !== undefined ? Math.round(inputs.taxableCapitalGainsRatio * 100) : 60}
                      onChange={(e) => {
                        const val = (e.target.value === '' ? '' : parseFloat(e.target.value));
                        updateInput('taxableCapitalGainsRatio', isNaN(val) ? 0.60 : val / 100);
                      }}
                    />
                    <span style={{ fontSize: 'var(--fs-body)', opacity: 0.8 }}>%</span>
                  </div>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    Only sets the STARTING assumption for what fraction of your current Taxable Brokerage balance is unrealized gain vs. cost basis (used if you leave "Known Cost Basis" below at $0). From there, basis is tracked dynamically as the account grows, gets contributed to, and is drawn down — it no longer applies this same fixed ratio to every withdrawal for the rest of the plan.
                  </span>
                  <label htmlFor="field-taxableBasisInit" style={{ marginTop: '10px', display: 'block' }}>Known Cost Basis of Taxable Brokerage Today ($, optional)</label>
                  {inputs.taxableBasisSource === 'holdings' ? (
                    // Linked mode, same pattern as Initial Balances above:
                    // driven by App.jsx's auto-sync effect from real
                    // Taxable-bucket holdings, so editable-by-hand doesn't
                    // apply here. "Unlink" only affects this app's basis
                    // source, not the holdings data itself.
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: 'var(--fs-xs)', color: 'var(--success)', marginBottom: '8px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                      <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                      <span>Linked to Detailed Holdings ({formatCurrency(taxableCostBasis || 0)}) — updates automatically.</span>
                      {isPremium && (
                        <button className="btn-outline" style={{ padding: '3px 8px', fontSize: 'var(--fs-xs)' }} onClick={() => setActiveTab('portfolio')}>
                          Edit in Detailed Holdings
                        </button>
                      )}
                      <button className="btn-outline" style={{ padding: '3px 8px', fontSize: 'var(--fs-xs)' }} onClick={() => updateInput('taxableBasisSource', 'manual')}>
                        Unlink
                      </button>
                    </div>
                  ) : null}
                  <NumberInput id="field-taxableBasisInit" step="1000" min="0" className="form-input" value={inputs.taxableBasisInit} disabled={inputs.taxableBasisSource === 'holdings'} onChange={(e) => updateInput('taxableBasisInit', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    If you know your actual cost basis (e.g. from a brokerage statement), enter it here for a more accurate starting point than the ratio above, or link it to your real Detailed Holdings lots from the Holdings sub-tab. Leave at $0 to auto-derive it from the ratio instead.
                  </span>

                  {inputs.spouse2Enabled && (
                    <>
                      <label htmlFor="field-taxableAccountOwner" style={{ marginTop: '10px', display: 'block' }}>How the Taxable Brokerage Account Is Held</label>
                      <select id="field-taxableAccountOwner" className="form-input" value={inputs.taxableAccountOwner || 'joint'} onChange={(e) => updateInput('taxableAccountOwner', e.target.value)}>
                        <option value="joint">Jointly</option>
                        <option value="spouse1">In {inputs.spouse1Name || 'Primary'}&rsquo;s name</option>
                        <option value="spouse2">In {inputs.spouse2Name || 'Spouse'}&rsquo;s name</option>
                      </select>
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        At the first death, what the spouse who died owned takes a new cost basis equal to its market value, so the survivor&rsquo;s later sales show less gain. Jointly held, half is reset; in one name, all of it if that spouse dies first and none if the other does. In a community-property state (AZ, CA, ID, LA, NM, NV, TX, WA, WI) all of it is reset, whatever this says. Concentrated stock positions follow the same rule.
                      </span>
                    </>
                  )}

                  <label htmlFor="field-taxableDividendYield" style={{ marginTop: '10px', display: 'block' }}>Taxable Brokerage Dividend Yield (%/yr)</label>
                  {inputs.taxableDividendYieldSource === 'holdings' ? (
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: 'var(--fs-xs)', color: 'var(--success)', marginBottom: '8px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
                      <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                      <span>Linked to Detailed Holdings ({(Number(inputs.taxableDividendYield) || 0).toFixed(2)}% blended yield of your Taxable holdings) — updates automatically.</span>
                      {isPremium && (
                        <button className="btn-outline" style={{ padding: '3px 8px', fontSize: 'var(--fs-xs)' }} onClick={() => setActiveTab('portfolio')}>
                          Edit in Detailed Holdings
                        </button>
                      )}
                      <button className="btn-outline" style={{ padding: '3px 8px', fontSize: 'var(--fs-xs)' }} onClick={() => updateInput('taxableDividendYieldSource', 'manual')}>
                        Unlink
                      </button>
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <NumberInput id="field-taxableDividendYield" step="0.1" min="0" max="15" className="form-input" value={inputs.taxableDividendYield} disabled={inputs.taxableDividendYieldSource === 'holdings'} onChange={(e) => updateInput('taxableDividendYield', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                    <span style={{ fontSize: 'var(--fs-body)', opacity: 0.8 }}>%</span>
                  </div>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    Dividends and fund distributions in a taxable account are taxed every year and count toward the income Medicare (IRMAA) and the ACA look at, even when reinvested. The balance&apos;s growth already includes them, so this only changes taxes, not cash flow. 2% is a broad-market default
                    {(() => { const d = computeTaxableDistributionYield(holdings || []); return d === null ? '' : `; your Taxable holdings currently distribute ${(d.yield * 100).toFixed(2)}%, ${Math.round(d.qualifiedShare * 100)}% of it qualified`; })()}.
                  </span>
                  {inputs.taxableDividendYieldSource !== 'holdings' && computeTaxableDistributionYield(holdings || []) !== null && (
                    <button type="button" className="btn-outline" style={{ padding: '3px 8px', fontSize: 'var(--fs-xs)', marginTop: '6px' }} onClick={() => updateInput('taxableDividendYieldSource', 'holdings')}>
                      Link the yield and its qualified share to Detailed Holdings
                    </button>
                  )}

                  <label htmlFor="field-taxableQualifiedDividendPct" style={{ marginTop: '10px', display: 'block' }}>Qualified share of that yield (%)</label>
                  {inputs.taxableDividendYieldSource !== 'holdings' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <label htmlFor="toggle-taxableQualifiedDividendFollowsAllocation" style={{ fontSize: '13px', cursor: 'pointer' }}>
                        Follow the plan&rsquo;s stock/bond split ({Number(inputs.stockAllocationPre) || 0}% stock working, {Number(inputs.stockAllocationPost) || 0}% retired): the stock side&rsquo;s dividends are qualified, the bond and cash side&rsquo;s interest is ordinary income
                      </label>
                      <span className="custom-switch">
                        <input id="toggle-taxableQualifiedDividendFollowsAllocation" type="checkbox" checked={inputs.taxableQualifiedDividendFollowsAllocation !== false} onChange={(e) => updateInput('taxableQualifiedDividendFollowsAllocation', e.target.checked)} />
                        <span className="slider-round"></span>
                      </span>
                    </div>
                  )}
                  {inputs.taxableDividendYieldSource !== 'holdings' && inputs.taxableQualifiedDividendFollowsAllocation !== false && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px', marginBottom: '8px', fontSize: '13px' }}>
                      <span>Weighted by what each side pays:</span>
                      <label htmlFor="field-taxableStockYieldPct" style={{ margin: 0 }}>Stock side yield (%)</label>
                      <NumberInput id="field-taxableStockYieldPct" step="0.1" min="0" max="20" className="form-input" style={{ width: '70px' }} value={inputs.taxableStockYieldPct} onChange={(e) => updateInput('taxableStockYieldPct', (e.target.value === '' ? '' : Math.min(20, Math.max(0, parseFloat(e.target.value)))))} />
                      <label htmlFor="field-taxableBondYieldPct" style={{ margin: 0 }}>Bond and cash side yield (%)</label>
                      <NumberInput id="field-taxableBondYieldPct" step="0.1" min="0" max="20" className="form-input" style={{ width: '70px' }} value={inputs.taxableBondYieldPct} onChange={(e) => updateInput('taxableBondYieldPct', (e.target.value === '' ? '' : Math.min(20, Math.max(0, parseFloat(e.target.value)))))} />
                      <span style={{ color: 'var(--text-muted)' }}>
                        {'\u2192 '}{Math.round(qualifiedShareFromAllocation(inputs.stockAllocationPre, inputs) * 100)}% qualified working, {Math.round(qualifiedShareFromAllocation(inputs.stockAllocationPost, inputs) * 100)}% retired
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <NumberInput id="field-taxableQualifiedDividendPct" step="5" min="0" max="100" className="form-input" value={inputs.taxableQualifiedDividendPct} disabled={inputs.taxableDividendYieldSource === 'holdings' || inputs.taxableQualifiedDividendFollowsAllocation !== false} onChange={(e) => updateInput('taxableQualifiedDividendPct', (e.target.value === '' ? '' : Math.min(100, Math.max(0, parseFloat(e.target.value)))))} />
                    <span style={{ fontSize: 'var(--fs-body)', opacity: 0.8 }}>%</span>
                  </div>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    The part taxed at the lower qualified-dividend and capital-gains rates. The rest &mdash; ordinary dividends, interest, money-market and most bond-fund income &mdash; is taxed as ordinary income. {inputs.taxableDividendYieldSource === 'holdings'
                      ? 'Linked: it follows each Taxable holding\u2019s Distribution Character (a bond, cash, REIT, option-income or business-development holding with none counts as ordinary; Mixed counts half; any other stock holding with none counts as qualified).'
                      : inputs.taxableQualifiedDividendFollowsAllocation !== false
                        ? 'Following the split, weighted by the two yields: bonds pay more than stocks, so a 60/40 account\u2019s income is about a third qualified, not 60%. The figure above is not used. Turn the switch off to type a share of your own; 100% treats the whole yield as qualified.'
                        : 'Linking the yield to Detailed Holdings sets this from each holding\u2019s Distribution Character.'}
                  </span>
                  <label htmlFor="field-dividendPayoutMode" style={{ marginTop: '14px', display: 'block' }}>
                    <Tooltip text="What happens to dividends once you retire. Tax is the same either way; what changes is how much has to be sold to fund the year." more="In retirement, dividends">
                      In retirement, dividends
                    </Tooltip>
                  </label>
                  <select
                    id="field-dividendPayoutMode"
                    className="form-input"
                    value={inputs.dividendPayoutMode}
                    onChange={(e) => updateInput('dividendPayoutMode', e.target.value)}
                  >
                    <option value="reinvest">Reinvest them, as now</option>
                    <option value="asNeeded">Take only what the year needs</option>
                    <option value="cash">Take them all as cash</option>
                  </select>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    Reinvesting and then selling shares to live on is doing the same trade twice: the sale realizes gains
                    the dividend could have covered. Taking them means fewer shares sold, fewer gains realized, and
                    nothing sold into a falling market. It changes nothing before you retire, and nothing about the tax
                    on the dividend itself. If you take more than you spend, the rest goes straight back in &mdash; so
                    stopping a DRIP you did not need to stop costs you nothing either.
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '15px 0' }}>
                  <label htmlFor="toggle-taxLossHarvesting" style={{ fontSize: '14px', cursor: 'pointer' }}>
                    <Tooltip text="In a down year, realizes the Taxable account's paper loss while staying invested. The loss offsets gains, then up to $3,000 of ordinary income, and carries forward. Approximated from the account's decline, not tax lots." more="Tax-Loss Harvesting">
                      Tax-Loss Harvesting
                    </Tooltip>
                  </label>
                  <span className="custom-switch">
                    <input id="toggle-taxLossHarvesting" type="checkbox" checked={inputs.taxLossHarvestingEnabled} onChange={(e) => updateInput('taxLossHarvestingEnabled', e.target.checked)} />
                    <span className="slider-round"></span>
                  </span>
                </div>


                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '15px 0' }}>
                  <label htmlFor="toggle-cashFloorEnabled" style={{ fontSize: '14px', cursor: 'pointer' }}>
                    <Tooltip text="A cash reserve sized in months of spending, spent first in a down-market retirement year instead of selling depressed holdings, then refilled from a later year's withdrawal." more="Cash Floor">
                      Cash Floor / Emergency Reserve
                    </Tooltip>
                  </label>
                  <span className="custom-switch">
                    <input id="toggle-cashFloorEnabled" type="checkbox" checked={!!inputs.cashFloorEnabled} onChange={(e) => updateInput('cashFloorEnabled', e.target.checked)} />
                    <span className="slider-round"></span>
                  </span>
                </div>
                {inputs.cashFloorEnabled && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', marginBottom: '15px' }}>
                    <div className="form-group">
                      <label htmlFor="field-cashFloorInit">Starting Reserve Balance ($)</label>
                      <NumberInput id="field-cashFloorInit" step="1000" min="0" className="form-input" value={inputs.cashFloorInit || 0} disabled={inputs.cashFloorSource === 'holdings'} onChange={(e) => updateInput('cashFloorInit', parseFloat(e.target.value) || 0)} />
                      {/* The one holdings link that lives entirely on this
                          screen. It belongs beside the field it drives, and
                          putting it here also means an expired subscription
                          can still unlink — Plan Settings is free. */}
                      {inputs.cashFloorSource === 'holdings' ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-2xs)', color: 'var(--success)', marginTop: '4px' }}>
                          Linked to your cash-equivalent holdings
                          <button
                            className="btn-outline"
                            style={{ padding: '3px 8px', fontSize: 'var(--fs-xs)' }}
                            onClick={() => updateInput('cashFloorSource', 'manual')}
                            title="Go back to entering the reserve by hand — your holdings are unaffected, and the last synced figure stays"
                          >
                            Unlink
                          </button>
                        </span>
                      ) : cashReserveFromHoldings.total > 0 ? (
                        <button
                          className="btn-outline"
                          style={{ padding: '3px 8px', fontSize: 'var(--fs-xs)', marginTop: '4px', width: 'auto' }}
                          onClick={() => updateInput('cashFloorSource', 'holdings')}
                          title="Track this from the Taxable-account cash equivalents in Detailed Holdings"
                        >
                          Link to holdings ({formatCurrency(cashReserveFromHoldings.total)})
                        </button>
                      ) : null}
                      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                        {inputs.cashFloorSource === 'holdings'
                          ? "Tracked from your Taxable-account money-market and T-bill holdings. Those holdings are netted OUT of the Taxable balance above, so the same dollars aren't counted twice. Only taxable cash counts — cash inside a Pre-Tax or Roth account is already modeled by those buckets, and drawing it is taxed differently."
                          : "If you already keep an emergency fund separate from the balances above, enter it here — it's tracked as its own bucket, not subtracted from Taxable."}
                      </span>
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-cashFloorTargetMonths">
                        <Tooltip text="Months of that year's total spending (lifestyle, health, LTC, IRMAA), so the target grows with inflation and your spending phases." more="Target Size">
                          Target Size (months of spending)
                        </Tooltip>
                      </label>
                      <NumberInput id="field-cashFloorTargetMonths" max="120" step="1" min="0" className="form-input" value={inputs.cashFloorTargetMonths !== undefined ? inputs.cashFloorTargetMonths : 24} onChange={(e) => updateInput('cashFloorTargetMonths', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-cashFloorReturnRate">Reserve Yield (%/yr)</label>
                      <NumberInput id="field-cashFloorReturnRate" max="20" step="0.1" min="0" className="form-input" value={inputs.cashFloorReturnRate !== undefined ? inputs.cashFloorReturnRate : 3.0} onChange={(e) => updateInput('cashFloorReturnRate', parseFloat(e.target.value) || 0)} />
                      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>Deliberately low/stable (a savings account or money-market fund) — not your portfolio's investment return, since the point of this bucket is to avoid market risk.</span>
                    </div>
                  </div>
                )}
                {inputs.cashFloorEnabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 15px' }}>
                    <label htmlFor="toggle-cashFloorPreFundEnabled" style={{ fontSize: '14px', cursor: 'pointer' }}>
                      <Tooltip text="While working, each year's leftover cash flow fills the reserve first, up to its target, instead of spilling into Taxable. Off, the reserve is built in retirement by a larger withdrawal." more="Build Up Gradually">
                        Build Up Gradually While Working
                      </Tooltip>
                    </label>
                    <span className="custom-switch">
                      <input id="toggle-cashFloorPreFundEnabled" type="checkbox" checked={!!inputs.cashFloorPreFundEnabled} onChange={(e) => updateInput('cashFloorPreFundEnabled', e.target.checked)} />
                      <span className="slider-round"></span>
                    </span>
                  </div>
                )}
                </>
                )}
    </>
  );
}
