import React from 'react';
import { spendingBlueprintDerived } from '../../calculator';

// Which fields the category ledger is currently driving (§4.2). Both are
// disabled with a badge while it does, because a ledger states the same
// facts they do and leaving both live double-counts. The Unlink control
// lives on the ledger itself and is never entitlement-gated.
export const ledgerBadgeFor = (inputs) => {
  const ledgerDerived = inputs.lifestyleExpenseInputMode === 'categories'
    ? spendingBlueprintDerived(inputs.spendingBlueprint)
    : null;
  const ledgerOwns = (field) => Boolean(ledgerDerived?.owns?.[field]);
  const ledgerBadge = (field) => (ledgerOwns(field) ? (
    <span style={{ marginLeft: '6px', fontSize: 'var(--fs-2xs)', padding: '1px 6px', borderRadius: '999px', border: '1px solid var(--card-border)', color: 'var(--text-muted)' }}>
      from your categories
    </span>
  ) : null);
  return { ledgerOwns, ledgerBadge };
};
