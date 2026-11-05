// The printed report's "Your Risk & Stress notes" (What's New 492): the
// personalized notes the Risk & Stress page shows on screen, carried onto
// paper as a record of what the plan said when it was printed -- the
// spending rule in dollars, what fees cost, and how the plan fared in every
// historical start. The rule's figures are worked out when the print dialog
// opens (like the readiness section), so a page nobody prints costs nothing.
import React, { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { riskGuardrailSnapshot } from '../calculator';
import { RiskGuardrailsNow } from './RiskGuardrailsSettings';
import { feeCardLabels } from '../utils/feeCardLabels';
import { historicalHeadline, safeMaxHeadline } from '../utils/historicalStarts';

const money = (n) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString('en-US')}` : '—');
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);

export function FeeRows({ data }) {
  if (!data) return null;
  const { mine, other } = data;
  const labels = feeCardLabels(data);
  const end = (x) => (x.runsOutYear ? `runs out in ${x.runsOutYear}` : money(x.endingBalance));
  return (
    <tr>
      <td>What fees cost you</td>
      <td>
        {labels.lede} Fees paid over the plan: {money(mine.lifetimeFees)} against {money(other.lifetimeFees)}.
        Left at the end: {end(mine)} against {end(other)}.
        {mine.historical && other.historical ? <> Historical starts lasted: {mine.historical.lasted} of {mine.historical.count} against {other.historical.lasted} of {other.historical.count}.</> : null}
        {Number.isFinite(mine.safeMax) && Number.isFinite(other.safeMax) ? <> Most you could spend a year and last through every start: {money(mine.safeMax)} against {money(other.safeMax)}.</> : null}
        {' '}Today&rsquo;s dollars.
      </td>
    </tr>
  );
}

export default function PrintRiskNotes({ inputs, feeData, historicalData }) {
  const [snap, setSnap] = useState(null);
  const on = Boolean(inputs?.riskGuardrailsEnabled);
  useEffect(() => {
    if (!on) return undefined;
    const before = () => {
      let s = null;
      try { s = riskGuardrailSnapshot(inputs); } catch (err) { console.warn('The spending rule could not be summarized for the printed report', err); }
      flushSync(() => setSnap(s));
    };
    const after = () => setSnap(null);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, [on, inputs]);

  const h = historicalHeadline(historicalData);
  const sm = safeMaxHeadline(historicalData);
  if (!on && !feeData && !h) return null;
  const target = num(inputs.riskGuardrailTargetPct, 80);
  const cutAt = Math.min(target, num(inputs.riskGuardrailCutAtPct, 50));
  const from = Number(inputs.historyFromYear) === 1871 ? 1871 : 1928;
  return (
    <div className="print-section" data-testid="print-risk-notes">
      <h3>Your Risk &amp; Stress notes</h3>
      <table className="print-table">
        <tbody>
          {on && snap && (
            <tr>
              <td>Risk-Based Guardrails, in your dollars</td>
              <td><RiskGuardrailsNow snap={snap} target={target} cutAt={cutAt} from={from} money={money} onPaper inputs={inputs} /></td>
            </tr>
          )}
          {h && (
            <tr>
              <td>Every retirement since {historicalData.firstStart}</td>
              <td>
                Your plan lasted in {h.lasted} of {h.count} real market histories{h.worstRunsOutYear ? <>; the hardest, starting in {h.worstStart}, runs out in {h.worstRunsOutYear}</> : null}.
                {sm && Number.isFinite(sm.amount) ? <> The most you could spend a year on everyday living and last through every start: {money(sm.amount)} (today&rsquo;s dollars).</> : null}
              </td>
            </tr>
          )}
          <FeeRows data={feeData} />
        </tbody>
      </table>
    </div>
  );
}
