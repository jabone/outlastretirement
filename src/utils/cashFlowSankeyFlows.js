// The money in and out of one projected year, as the Cash Flow map draws it
// (moved out of LazyCharts' CashFlowSankeyChart so the chart and its written
// summary read the same numbers -- changelog 325).
const rsuOf = (y) => (y.rsuIncome1 || 0) + (y.rsuIncome2 || 0);
const nqdcOf = (y) => (y.nqdcDistribution1 || 0) + (y.nqdcDistribution2 || 0);

export function cashFlowSankeyFlows(yearData) {
  if (!yearData) return { inflows: [], outflows: [] };
  const inflows = [
    // The engine's `salary` carries salary and part-time pay, RSU/GSU
    // vesting and deferred-comp payouts together; each is its own node so a
    // retired year's NQDC payout never reads as salary.
    { name: 'Salary', value: Math.max(0, (yearData.salary || 0) - rsuOf(yearData) - nqdcOf(yearData)) },
    { name: 'Stock vesting', value: rsuOf(yearData) },
    { name: 'Deferred comp payout', value: nqdcOf(yearData) },
    { name: 'Social Security', value: yearData.ssIncome || 0 },
    { name: 'Pension/Annuity', value: (yearData.pension || 0) + (yearData.annuityPayout || 0) },
    { name: 'Passive/Rental', value: yearData.rentalAnnuity || 0 },
    { name: 'Discretionary Draws', value: (yearData.drawTaxable || 0) + (yearData.discretionaryDrawPreTax || 0) + (yearData.drawRoth || 0) },
    { name: 'RMDs (Forced)', value: yearData.rmdAmount || 0 },
    // The HSA paying a shortfall once every other account is empty.
    { name: 'HSA for general spending', value: yearData.hsaGeneralDraw || 0 },
    { name: 'Milestone Inflows', value: yearData.milestoneInflow || 0 }
  ].filter(i => i.value > 0);

  const totalInflows = inflows.reduce((sum, i) => sum + i.value, 0);

  // conversionTaxCost isolates the marginal federal + state tax caused by
  // this year's Roth conversion (see calculator.js's conversionTaxCost
  // comment) -- split out of the single "Taxes Paid" bucket into its own
  // node so a conversion year visibly shows *why* taxes jumped, instead of
  // silently folding it into one lump total indistinguishable from any
  // other high-tax year. Clamped to totalTaxesPaid as a defensive floor
  // against floating-point edge cases, since it's derived from a separate
  // counterfactual tax calculation.
  const conversionTaxCost = Math.min(yearData.totalTaxesPaid || 0, Math.max(0, yearData.conversionTaxCost || 0));
  const otherTaxesPaid = (yearData.totalTaxesPaid || 0) - conversionTaxCost;

  const outflows = [
    { name: 'Taxes Paid', value: otherTaxesPaid },
    { name: 'Roth Conversion Tax', value: conversionTaxCost },
    { name: 'Living Expenses', value: (yearData.lifestyleExpenses || 0) + (yearData.ltcCost || 0) + (yearData.irmaaCost || 0) + (yearData.medicareSupplement || 0) + (yearData.healthcareBridge || 0) },
    { name: 'Milestone Expenses', value: yearData.milestoneOutflow || 0 },
    { name: 'Savings/Reinvested', value: (yearData.totalContributions || 0) }
  ].filter(o => o.value > 0);

  // Correct precision errors
  const totalOutflows = outflows.reduce((sum, i) => sum + i.value, 0);
  if (totalInflows > totalOutflows) {
    const diff = totalInflows - totalOutflows;
    if (diff > 10) { // allow $10 rounding buffer
      const savingsIndex = outflows.findIndex(o => o.name === 'Savings/Reinvested');
      if (savingsIndex >= 0) outflows[savingsIndex].value += diff;
      else outflows.push({ name: 'Saved / Reinvested', value: diff });
    }
  } else if (totalOutflows > totalInflows) {
    const diff = totalOutflows - totalInflows;
    if (diff > 10) {
      inflows.push({ name: 'Portfolio Drawdown', value: diff });
    }
  }

  return { inflows, outflows };
}

// A node label broken into lines of at most `maxChars` characters, so it
// fits the label column beside the diagram instead of running off the
// chart's edge ("Savings/Reinvested" was cut to "Savings/Reinvest"). Lines
// break at spaces and after a slash; a single word longer than the limit is
// cut with an ellipsis, and the chart keeps the full name as its tooltip.
// At most `maxLines` lines; whatever does not fit ends the last one with an
// ellipsis.
export function wrapSankeyLabel(name, maxChars, maxLines = 3) {
  const text = String(name ?? '');
  if (text.length <= maxChars) return [text];
  const clip = (s) => (s.length <= maxChars ? s : `${s.slice(0, Math.max(1, maxChars - 1))}…`);
  // Tokens keep their trailing slash ("Savings/"), and remember whether a
  // space followed them, so the rejoined line reads as the original.
  const tokens = [];
  const re = /[^\s/]+\/?|\//g;
  let m;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ word: m[0], spaceBefore: m.index > 0 && /\s/.test(text[m.index - 1]) });
  }
  const lines = [];
  let line = '';
  for (const t of tokens) {
    const joined = line ? `${line}${t.spaceBefore ? ' ' : ''}${t.word}` : t.word;
    if (line && joined.length > maxChars) {
      lines.push(line);
      line = t.word;
    } else {
      line = joined;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    kept[maxLines - 1] = `${last.length < maxChars ? last : last.slice(0, Math.max(1, maxChars - 1))}…`;
    return kept.map(clip);
  }
  return lines.map(clip);
}
