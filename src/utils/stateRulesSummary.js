// Plain-English summary of a STATE_TAX_RULES record (changelog 361), for
// State Income Taxes, the residency timeline and the plan summary. Reads
// the same record the engine prices with, so the two cannot drift.
import { STATE_TAX_RULES } from '../config/stateTaxRules';

const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (r) => `${Number((r * 100).toFixed(3))}%`;

export function hasStateRules(code) {
  return typeof code === 'string' && Boolean(STATE_TAX_RULES[code.toUpperCase()]);
}

// "Flat 4.99%" or "1.4%–10.75%".
export function stateRulesRate(code) {
  const r = hasStateRules(code) ? STATE_TAX_RULES[code.toUpperCase()] : null;
  if (!r) return '';
  if (r.displayRate) return r.displayRate;
  const rates = [...r.brackets.single, ...r.brackets.mfj].map((b) => b.rate).filter((x) => x > 0);
  const lo = Math.min(...rates);
  const hi = Math.max(...rates);
  return lo === hi ? `Flat ${pct(hi)}` : `${pct(lo)}–${pct(hi)}`;
}

function exclusionLine(re) {
  const what = [re.covers.pension && 'pensions', re.covers.ira && 'IRA and 401(k) withdrawals', re.covers.investment && 'investment income']
    .filter(Boolean);
  const subject = what.length > 1 ? `${what.slice(0, -1).join(', ')} and ${what[what.length - 1]}` : what[0];
  const cap = (t) => {
    if (t.amount === null) return 'fully excluded';
    if (re.perReturn) return t.amountMfj != null && t.amountMfj !== t.amount
      ? `up to ${usd(t.amount)} excluded (${usd(t.amountMfj)} joint)`
      : `up to ${usd(t.amount)} a return excluded`;
    return `up to ${usd(t.amount)} a person excluded`;
  };
  const age = (t) => (t.minAge > 0 ? ` from ${t.minAge}` : '');
  const tiers = [...re.tiers].sort((a, b) => b.minAge - a.minAge);
  let text = `${subject[0].toUpperCase()}${subject.slice(1)}: ${cap(tiers[0])}${age(tiers[0])}`;
  if (tiers.length > 1) text += ` (${tiers.slice(1).map((t) => `${t.amount === null ? 'all' : usd(t.amount)}${age(t)}`).join('; ')})`;
  if (re.iraMinAge > 0) text += ` (IRA money from ${String(re.iraMinAge).replace('.5', '½')})`;
  if (re.reducedBySS) text += ', less any Social Security';
  if (re.agiPhase) text += ', shrinking as income rises';
  return `${text}.`;
}

// The record's main rules as short sentences.
export function stateRulesSummary(code) {
  const r = hasStateRules(code) ? STATE_TAX_RULES[code.toUpperCase()] : null;
  if (!r) return [];
  const lines = [`${stateRulesRate(code)} on taxable income.`];
  const ss = r.socialSecurity;
  if (ss === 'exempt') lines.push('Social Security is exempt.');
  else if (ss === 'taxed') lines.push('Social Security is taxed as it is federally.');
  else if (ss && ss.exemptIfAgiBelow) lines.push(`Social Security is exempt up to ${usd(ss.exemptIfAgiBelow.single)} of income (${usd(ss.exemptIfAgiBelow.mfj)} joint), ${ss.maxTaxableShare != null ? `with at most ${pct(ss.maxTaxableShare)} of it taxed above` : 'taxed above'}.`);
  if (r.retirementExclusion) lines.push(exclusionLine(r.retirementExclusion));
  const sourceExempt = [r.govPensionExempt && 'government', r.militaryExempt && 'military'].filter(Boolean);
  if (sourceExempt.length) lines.push(`${sourceExempt.join(' and ').replace(/^./, (c) => c.toUpperCase())} pensions are exempt.`);
  if (r.capitalGainsExempt) lines.push('Capital gains are exempt.');
  if (r.surtax) lines.push(`Plus ${pct(r.surtax.rate)} on income over ${usd(r.surtax.over)}.`);
  if (r.localRate) lines.push(`Includes a typical ${pct(r.localRate)} county income tax.`);
  return lines;
}

export function stateRulesName(code) {
  return hasStateRules(code) ? STATE_TAX_RULES[code.toUpperCase()].name : '';
}

export function stateRulesYear(code) {
  return hasStateRules(code) ? STATE_TAX_RULES[code.toUpperCase()].taxYear : null;
}
