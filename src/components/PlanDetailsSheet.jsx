import React from 'react';
import { heirLabel } from '../utils/printNames';
import { planDetailsModel, humanize } from './planDetailsModel';

// "Every plan setting" for the planner packet (changelog 298): each Plan
// field with a value, grouped the way the Plan page is, in the form's own
// labels. Built from the generated field index, so a new field shows up
// here without anyone maintaining this page. A setting is listed when it is
// one a planner always needs (ALWAYS_PRINT) or when it differs from the
// app's default -- so the untouched defaults of features the plan does not
// use (a pension at $0 with its start age still 65) stay off the page. Blank, zero and off are
// never listed, nor is anything after an enable switch that is off.

export default function PlanDetailsSheet({ inputs, formatCurrency, hideNames = false }) {
  const groups = planDetailsModel(inputs, { formatCurrency: (v) => formatCurrency(Math.round(v)) });
  const names = hideNames
    ? (inputs.spouse2Enabled ? 'Spouse 1 and Spouse 2' : 'Spouse 1')
    : [inputs.spouse1Name, inputs.spouse2Enabled ? inputs.spouse2Name : null].filter(Boolean).join(' and ');
  const milestones = Array.isArray(inputs.milestones) ? inputs.milestones : [];
  const heirs = Array.isArray(inputs.heirs) ? inputs.heirs : [];
  return (
    <div className="packet-page" data-testid="plan-details-sheet">
      <h1>Plan details{names ? ` — ${names}` : ''}</h1>
      <p className="review-lede">
        The settings a planner always needs, and every other setting changed from the app&rsquo;s default, grouped the way the
        Plan page is. Settings left at zero, blank or off, and anything inside a feature that is switched off, are not
        listed. Dollar figures are as entered, in today&rsquo;s dollars unless the label says otherwise.
      </p>
      {groups.map((g) => (
        <section key={g.id} className="review-category packet-group">
          <h2>{g.label}</h2>
          <table className="packet-table packet-kv">
            <tbody>
              {g.rows.map((r) => (<tr key={r.key}><td>{r.label}</td><td className="num">{r.value}</td></tr>))}
            </tbody>
          </table>
        </section>
      ))}
      {milestones.length > 0 && (
        <section className="review-category">
          <h2>Life events</h2>
          <table className="packet-table">
            <thead><tr><th>Event</th><th>In or out</th><th>Ages</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {milestones.map((m, i) => (
                <tr key={m.id || i}>
                  <td>{m.name || `Event ${i + 1}`}</td>
                  <td>{m.type === 'inflow' ? 'Money in' : 'Money out'}{m.fundedExternally ? ' (paid from outside the plan)' : ''}</td>
                  <td>{m.isRecurring ? `${m.startAge} to ${m.endAge}, yearly` : `${m.startAge}`}</td>
                  <td className="num">{formatCurrency(Math.round(Number(m.amount) || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {heirs.length > 0 && (
        <section className="review-category">
          <h2>Heirs</h2>
          <table className="packet-table">
            <thead><tr><th>Heir</th><th>Relationship</th><th className="num">Share</th><th className="num">Their income</th><th>Filing</th></tr></thead>
            <tbody>
              {heirs.map((h, i) => (
                <tr key={h.id || i}>
                  <td>{heirLabel(h, i, hideNames)}</td>
                  <td>{h.relationship ? humanize(h.relationship) : ''}</td>
                  <td className="num">{Number(h.splitPct) ? `${Math.round(Number(h.splitPct) * 10) / 10}%` : ''}</td>
                  <td className="num">{Number(h.income) ? formatCurrency(Math.round(Number(h.income))) : ''}</td>
                  <td>{h.filingStatus || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
