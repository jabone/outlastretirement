// PremiumUpsellSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_premiumUpsell block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { useEntitlement } from '../../../context/useEntitlement';
import { ArrowRight, Lock, PieChart } from 'lucide-react';

export default function PremiumUpsellSection() {
  const { setActiveTab } = useSimulation();
  const { isPremium } = useEntitlement();
  return (
    <>
            {/* Upsell entry point into the premium Detailed Holdings tab --
                see INTEGRATION_STRATEGY.md Section 2.

                Until 2026-08-20 the free-user branch here opened an alert
                reading "in development ... Not available to purchase yet",
                which had quietly become false: the tab is finished and
                shipping, and it was only the billing flow that didn't
                exist. Saying "in development" about working software is
                the kind of stale copy that makes a reader distrust the
                rest of the page. It now routes to the Premium tab, which
                describes the feature honestly and offers a real way to ask
                for a key. Still no fake Buy button — there is no billing
                flow, and there is no price. */}
            <div
              className="glass-panel-hover"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                padding: '14px 18px', borderRadius: '10px', marginBottom: '20px',
                border: `1px solid ${isPremium ? 'var(--accent-primary)' : 'var(--card-border)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <PieChart size={18} style={{ color: 'var(--accent-text)' }} />
                <div>
                  <div style={{ fontWeight: '600', fontSize: 'var(--fs-sm)' }}>Detailed Account Tracking (Premium)</div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                    Track real holdings, accounts, and cost basis, then link the totals to the four fields below instead of entering lump sums — once linked, they stay in sync automatically.
                  </div>
                </div>
              </div>
              {isPremium ? (
                <button
                  className="btn-outline"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                  onClick={() => setActiveTab('portfolio')}
                >
                  Manage Holdings <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  className="btn-outline"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                  onClick={() => setActiveTab('premium')}
                >
                  <Lock size={14} /> See What It Does
                </button>
              )}
            </div>
    </>
  );
}
