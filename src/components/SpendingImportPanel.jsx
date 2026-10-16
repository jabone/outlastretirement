import React from 'react';
import PremiumMount from '../premium/PremiumMount';

// Rung 4 of the Retirement Spending module (changelog 140): a bank or
// credit-card CSV into the category ledger. The import itself is Premium
// and arrives through the `spendingImport` mount; this host component owns
// the heading, the "switch to categories first" prompt and the locked card.
export default function SpendingImportPanel({ inputs, setActiveTab }) {
  const inCategories = inputs.lifestyleExpenseInputMode === 'categories';

  const heading = (
    <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '24px 0 16px 0', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
      Fill the ledger from a bank or card export
    </h3>
  );

  if (!inCategories) {
    return (
      <>
        {heading}
        <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Switch to categories above first &mdash; this fills them in from a CSV your bank or card issuer already lets
          you download.
        </div>
      </>
    );
  }

  const locked = (
    <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 12px' }}>
        Rather than typing each category from memory, upload the CSV your bank or card issuer already offers. It
        sorts the transactions into your categories, you correct whatever it got wrong, and it fills the ledger in.
        Re-importing later replaces what it added before and leaves anything you typed yourself alone.
      </p>
      <button className="btn-outline" style={{ padding: '6px 12px', fontSize: 'var(--fs-xs)' }} onClick={() => setActiveTab('premium')}>
        Part of Premium &mdash; see what it includes
      </button>
    </div>
  );
  return (
    <>
      {heading}
      <PremiumMount id="spendingImport" locked={locked} />
    </>
  );
}
