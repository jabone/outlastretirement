import {
  SPENDING_CATEGORIES, SPENDING_CADENCES, SPENDING_HEALTH_BRIDGE_ID,
  readSpendingBlueprint, spendingBlueprintDerived, phaseMultiplierFor, acaBenchmarkPremiumAnnual,
} from '../calculator';

// The data behind the spending review sheet (SpendingReviewSheet.jsx).

// The typed bridge figure, or (changelog 469) the benchmark-priced cost at
// the first retirement age, for the sheet's one-line summary.
function bridgeDefault(inputs) {
  if (inputs?.healthcareBridgeSource === 'benchmark') {
    const share = Math.min(100, Math.max(1, Number(inputs.healthcareBridgePremiumPct) || 70)) / 100;
    const age = Math.min(64, Math.max(21, Number(inputs.retireAge1) || 60));
    return acaBenchmarkPremiumAnnual(inputs.stateOfResidence, [age]) / share;
  }
  return Number(inputs?.healthcareBridgeCost) || 0;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const cadenceOf = (id) => SPENDING_CADENCES.find((c) => c.id === id) || SPENDING_CADENCES[0];

export function spendingReviewModel(inputs) {
  const bp = readSpendingBlueprint(inputs?.spendingBlueprint);
  const derived = inputs?.lifestyleExpenseInputMode === 'categories' ? spendingBlueprintDerived(inputs?.spendingBlueprint) : null;
  const essential = new Set(bp.essentialCategoryIds);
  const lineRow = (l) => {
    const c = cadenceOf(l.cadence);
    return {
      id: l.id,
      label: l.label || '(no name)',
      cadence: c.label,
      when: c.perYear === 12 ? 'Every month' : MONTHS[(l.dueMonth || 1) - 1],
      perPayment: l.amount / c.perYear,
      perYear: l.amount,
    };
  };
  const known = SPENDING_CATEGORIES.map((c) => c.id);
  const categories = derived
    ? [
      ...SPENDING_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
      // A category the schema no longer knows is still the user's data.
      ...[...new Set(bp.lines.filter((l) => l.isCustom && l.categoryId !== SPENDING_HEALTH_BRIDGE_ID).map((l) => l.categoryId))]
        .filter((id) => !known.includes(id)).map((id) => ({ id, label: id })),
    ].map((c) => {
      const lines = bp.lines.filter((l) => l.categoryId === c.id).map(lineRow);
      return { ...c, essential: essential.has(c.id), lines, total: lines.reduce((t, l) => t + l.perYear, 0) };
    }).filter((c) => c.lines.length > 0)
    : [];
  const bridge = derived ? bp.lines.filter((l) => l.categoryId === SPENDING_HEALTH_BRIDGE_ID).map(lineRow) : [];
  const total = Number(inputs?.lifestyleExpense) || 0;
  const phases = inputs?.lifestyleThreePhaseEnabled ? [
    { name: 'Go-Go', ages: `to age ${inputs.goGoEndAge}`, perYear: total * phaseMultiplierFor(inputs, inputs.goGoMultiplier) },
    { name: 'Slow-Go', ages: `ages ${inputs.goGoEndAge + 1} to ${inputs.slowGoEndAge}`, perYear: total * phaseMultiplierFor(inputs, inputs.slowGoMultiplier) },
    { name: 'No-Go', ages: `age ${inputs.slowGoEndAge + 1} on`, perYear: total * phaseMultiplierFor(inputs, inputs.noGoMultiplier) },
  ] : [];
  return {
    fromLedger: Boolean(derived),
    total,
    essentialTotal: derived ? derived.essentialTotal : null,
    categories,
    bridge,
    bridgeTotal: bridge.reduce((t, l) => t + l.perYear, 0) || bridgeDefault(inputs),
    bridgeBenchmark: !derived && inputs?.healthcareBridgeSource === 'benchmark',
    phases,
    mortgagePayment: Math.max(0, Number(inputs?.mortgagePayment) || 0),
    otherDebtPayment: Math.max(0, Number(inputs?.otherDebtPayment) || 0),
  };
}
