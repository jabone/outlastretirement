// InitialBalancesSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_initialBalances block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import PremiumMount from '../../../premium/PremiumMount';
import { CheckCircle2 } from 'lucide-react';
import Tooltip from '../../Tooltip';
import NumberInput from '../../NumberInput';

export default function InitialBalancesSection() {
  const { inputs, updateInput, formatCurrency, bucketTotals } = useSimulation();
  return (
    <>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  Initial Account Balances
                </h3>
                {inputs.initialBalancesSource === 'holdings' && (
                  // Linked mode (INTEGRATION_STRATEGY.md Section 3): these
                  // four fields are derived from Detailed Holdings' real
                  // bucket totals (kept current by App.jsx's auto-sync
                  // effect) rather than hand-entered, so they're disabled
                  // here rather than editable -- editing them directly
                  // would just be silently overwritten the next time
                  // holdings change, which is more confusing than not
                  // being editable at all. "Unlink" doesn't touch your
                  // holdings data, only this app's Initial Balances mode.
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: 'var(--fs-xs)', color: 'var(--success)', marginBottom: '14px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                    <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                    <span>Linked to Detailed Holdings ({formatCurrency(bucketTotals?.total || 0)} total) — these fields update automatically.{(inputs.concentratedStockEnabled && inputs.concentratedStockSource === 'holdings' && inputs.concentratedStockHoldingId) || (inputs.concentratedStock2Enabled && inputs.concentratedStock2Source === 'holdings' && inputs.concentratedStock2HoldingId) ? ' Your linked concentrated position is excluded from the Taxable figure above and tracked separately below.' : ''}</span>
                    <PremiumMount id="initialBalancesCta" />
                    <button className="btn-outline" style={{ padding: '3px 8px', fontSize: 'var(--fs-xs)' }} onClick={() => updateInput('initialBalancesSource', 'manual')}>
                      Unlink
                    </button>
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="field-preTaxInit">Pre-Tax Portfolio (Traditional IRA / 401k) ($)</label>
                  <NumberInput id="field-preTaxInit" commas step="10000" min="0" className="form-input" value={inputs.preTaxInit} disabled={inputs.initialBalancesSource === 'holdings'} onChange={(e) => updateInput('preTaxInit', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>
                <div className="form-group">
                  <label htmlFor="field-rothInit">Roth Portfolio (Roth IRA / 401k) ($)</label>
                  <NumberInput id="field-rothInit" commas step="10000" min="0" className="form-input" value={inputs.rothInit} disabled={inputs.initialBalancesSource === 'holdings'} onChange={(e) => updateInput('rothInit', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                  <label htmlFor="field-rothBasisInit" style={{ marginTop: '10px', display: 'block', fontSize: 'var(--fs-xs)' }}>
                    <Tooltip text="Only matters for Roth withdrawals before 59 1/2, which come out contributions first (tax- and penalty-free), then conversions, then earnings. At 0, every early Roth dollar is treated as earnings." more="Roth Contribution Basis">Roth Contribution Basis Today ($, optional)</Tooltip>
                  </label>
                  <NumberInput id="field-rothBasisInit" commas step="1000" min="0" className="form-input" value={inputs.rothBasisInit} onChange={(e) => updateInput('rothBasisInit', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                  <label htmlFor="field-rothRecentConversionsInit" style={{ marginTop: '8px', display: 'block', fontSize: 'var(--fs-xs)' }}>Converted to Roth in the Last 4 Years ($, optional)</label>
                  <NumberInput id="field-rothRecentConversionsInit" commas step="1000" min="0" className="form-input" value={inputs.rothRecentConversionsInit} onChange={(e) => updateInput('rothRecentConversionsInit', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value))))} />
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    Conversions still inside their five-year clock (assumed spread evenly over those years). Older conversions are already penalty-free — count them as contribution basis above. Conversions this plan makes are tracked automatically.
                  </span>
                </div>
                <div className="form-group">
                  <label htmlFor="field-taxableInit">Taxable Portfolio (Brokerage / Liquid Cash) ($)</label>
                  <NumberInput id="field-taxableInit" commas step="10000" min="0" className="form-input" value={inputs.taxableInit} disabled={inputs.initialBalancesSource === 'holdings'} onChange={(e) => updateInput('taxableInit', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>
                <div className="form-group">
                  <label htmlFor="field-hsaInit">
                    <Tooltip text="A fourth account with a triple tax advantage: deductible going in, tax-free growth, tax-free out for qualified medical costs (here, the healthcare bridge, long-term care and IRMAA)." more="HSA">
                      HSA (Health Savings Account) ($)
                    </Tooltip>
                  </label>
                  <NumberInput id="field-hsaInit" commas step="1000" min="0" className="form-input" value={inputs.hsaInit} disabled={inputs.initialBalancesSource === 'holdings'} onChange={(e) => updateInput('hsaInit', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                </div>
              </div>
    </>
  );
}
