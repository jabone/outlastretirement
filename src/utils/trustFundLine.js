// The Social Security trust-fund case as a standing second line under the
// verdict (planner's review item 17, changelog 468). The cut used to be a
// toggle most people never find; now every plan that counts on Social
// Security also states what the average-returns path looks like if the
// OASI trust fund runs out on the Trustees' schedule and benefits are cut.
// The cut's year and size are the plan's own settings (ssDepletionYear,
// ssCutPercent), so a plan that already has the cut on gets no second
// line: its verdict is the cut case.
import { runProjection } from '../calculator';
import { firstShortfallRow } from './planVerdict';

export function countsOnSocialSecurity(inputs) {
  if (!inputs) return false;
  return (Number(inputs.ss1) || 0) > 0 || (!!inputs.spouse2Enabled && (Number(inputs.ss2) || 0) > 0);
}

// Returns null when the line does not apply, else { year, cutPct, runsShort,
// firstShortYear, endingBalance, sentence }.
export function trustFundLine(inputs, baseProjection) {
  if (!countsOnSocialSecurity(inputs) || inputs.ssDepletionEnabled) return null;
  const year = Number(inputs.ssDepletionYear) || 0;
  const cutPct = Number(inputs.ssCutPercent) || 0;
  if (!(cutPct > 0) || !(year > 0)) return null;
  const cut = runProjection({ ...inputs, ssDepletionEnabled: true });
  const short = firstShortfallRow(cut.years);
  const baseShort = baseProjection ? firstShortfallRow(baseProjection.years) : null;
  const head = `If the Social Security trust fund runs out and benefits are cut ${cutPct}% from ${year}:`;
  let sentence;
  if (!short) sentence = `${head} the plan still lasts with average returns.`;
  else if (baseShort && baseShort.year <= short.year) sentence = `${head} spending is not fully covered starting in ${short.year}, as now.`;
  else sentence = `${head} spending is not fully covered starting in ${short.year}.`;
  return { year, cutPct, runsShort: !!short, firstShortYear: short ? short.year : null, endingBalance: cut.endingBalance, sentence };
}
