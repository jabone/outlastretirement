// BucketSharesSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_bucketShares block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { roundedShares } from '../../../utils/roundShares';

export default function BucketSharesSection() {
  const { inputs } = useSimulation();
  // Largest-remainder rounding, so the three shares print as a whole 100%.
  const [preTaxPct, rothPct, taxablePct] = roundedShares([inputs.preTaxInit, inputs.rothInit, inputs.taxableInit]);
  return (
    <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '20px', marginTop: '30px', borderTop: '1px solid var(--card-border)', paddingTop: '24px' }}>
              <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Pre-Tax Share</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '6px' }}>
                  {preTaxPct}%
                </div>
              </div>
              <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Roth Share</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '6px' }}>
                  {rothPct}%
                </div>
              </div>
              <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Taxable Share</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--sky-text)', marginTop: '6px' }}>
                  {taxablePct}%
                </div>
              </div>
            </div>
    </>
  );
}
