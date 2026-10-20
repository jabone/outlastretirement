// The wording of Risk -> What fees cost you (changelog 447), kept apart from
// the component so it can be tested on its own.
export const feePct = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  // 0.10%, 0.85%, 1%: two places unless it is a whole percent.
  return `${Number.isInteger(v) ? v : v.toFixed(2)}%`;
};
const pct = feePct;

export function feeCardLabels(data) {
  if (!data) return null;
  const withAdvisor = data.kind === 'withAdvisor';
  return {
    otherHeading: withAdvisor ? `With a ${pct(data.other.advisorFeePct)} advisor fee` : 'Without the advisor fee',
    lede: withAdvisor
      ? `You pay ${pct(data.mine.fundExpenseRatioPct)} a year in fund expenses and no advisor fee. Here is the same plan with a ${pct(data.other.advisorFeePct)} advisor fee added, the kind of percent-of-assets fee many managed accounts charge.`
      : `You pay ${pct(data.mine.fundExpenseRatioPct)} a year in fund expenses and a ${pct(data.mine.advisorFeePct)} advisor fee. Here is the same plan without the advisor fee.`,
  };
}
