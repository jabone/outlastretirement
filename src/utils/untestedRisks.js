// What a verdict leaves untested (changelog 466): the big risks a plan
// can switch on but has not. A plan with none of them on reads "On
// track" on the strength of fixed lifespans, no care bill, full Social
// Security and no early death; a planner would say so beside the verdict.
// Returns [] when every one is on.
export function untestedRisks(inputs) {
  const out = [];
  if (!inputs) return out;
  const couple = !!inputs.spouse2Enabled;
  if (couple && !inputs.survivorStressEnabled) out.push('a spouse dying early');
  if (!inputs.ltcActive1 && !(couple && inputs.ltcActive2) && !inputs.mcLtcEnabled) out.push('long-term care');
  // A Social Security cut is no longer listed here: the trust-fund case
  // is a standing second line under the verdict (utils/trustFundLine.js).
  if (!inputs.mcLongevityEnabled) out.push(couple ? 'living past the ages set' : 'living past the age set');
  return out;
}

// "Not tested: a spouse dying early, long-term care or living past the ages set."
export function untestedRisksSentence(inputs) {
  const list = untestedRisks(inputs);
  if (list.length === 0) return '';
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`;
  return `Not tested: ${joined}.`;
}
