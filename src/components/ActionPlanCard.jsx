import React from 'react';
import { PRINT_PACKET_EVENT } from './printPacketEvents';
import { ClipboardCheck, Printer } from 'lucide-react';
import { buildActionPlan } from '../utils/actionPlan';

// Always-visible on-screen version of the Action Plan / execution roadmap.
// Shares its actual content (buildActionPlan) with the hidden print-only
// report in App.jsx, so the two never drift apart -- this component just
// owns the on-screen presentation of that same data.
const ActionPlanCard = ({ inputs, projection, formatCurrency, rothLadderHeatmap, guardrailsComparison }) => {
  const plan = buildActionPlan(inputs, projection, formatCurrency, rothLadderHeatmap, guardrailsComparison);
  const { headline, sections } = plan;

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--card-border)', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <ClipboardCheck size={18} style={{ color: 'var(--accent-text)' }} />
            <span>Your Action Plan</span>
          </h3>
          <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', margin: '8px 0 0', lineHeight: '1.5' }}>
            To land on a projected {headline.isSuccessful ? '' : '(currently short of) '}
            <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(headline.endingBalance)}</strong>
            {headline.horizonYear ? ` ending balance in ${headline.horizonYear}` : ' ending balance'}, spending{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(headline.targetSpending)}/yr</strong> in retirement, this is what the plan does:
          </p>
        </div>
        <button
          onClick={() => window.dispatchEvent(new Event(PRINT_PACKET_EVENT))}
          className="btn-outline"
          style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
        >
          <Printer size={14} />
          <span>Print / PDF Report</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {sections.map((section) => (
          <div key={section.id}>
            <h4 style={{ fontSize: 'var(--fs-sm)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-text)', fontWeight: '700', margin: '0 0 12px' }}>
              {section.title}
            </h4>
            {section.items.length === 0 ? (
              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: 0 }}>Nothing configured here.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {section.items.map((item, idx) => (
                  <li key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-primary)', marginTop: '7px', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 'var(--fs-body)', fontWeight: '600', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                        {item.label}
                      </div>
                      {item.detail && (
                        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '3px', lineHeight: '1.5' }}>
                          {item.detail}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActionPlanCard;
