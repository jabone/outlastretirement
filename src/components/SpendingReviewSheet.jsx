import React, { useEffect } from 'react';
import { printSection } from '../utils/printSection';
import PrintFrame from './PrintFrame';
import { whenImagesReady } from '../utils/imagesReady';
import { createPortal } from 'react-dom';
import { spendingReviewModel } from './spendingReviewModel';

// The spending review sheet (changelog 297): the retirement budget on paper,
// for someone who wants to check it with a pen rather than open the app.
// Every line with how often it is paid, a box to tick and room to write the
// change. Mounted only when Print for review is pressed: it opens the print
// dialog itself (utils/printSection, "spending") and calls onDone when the
// dialog closes, so it never sits in the page repeating the ledger's text. Read-only: it reads the same ledger the Plan
// page edits and the same helpers the projection uses, so the paper cannot
// disagree with the plan.

const Box = () => <span className="review-box" aria-hidden="true" />;
// One set of column widths for every line table, so the sheet reads as one form.
const Cols = () => (
  <colgroup>
    <col style={{ width: '5%' }} /><col style={{ width: '22%' }} /><col style={{ width: '13%' }} /><col style={{ width: '14%' }} />
    <col style={{ width: '11%' }} /><col style={{ width: '11%' }} /><col style={{ width: '24%' }} />
  </colgroup>
);

// The sheet's content, reused inside the planner packet (changelog 298).
export function SpendingReviewContent({ inputs, formatCurrency, hideNames = false }) {
  const m = spendingReviewModel(inputs);
  const names = hideNames ? '' : [inputs.spouse1Name, inputs.spouse2Enabled ? inputs.spouse2Name : null].filter(Boolean).join(' & ');
  const fc = (v) => formatCurrency(Math.round(v));
  const printed = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return (
    <>
      <h1>Retirement spending{names ? ` — ${names}` : ''}</h1>
      <p className="review-lede">
        What the plan assumes you will spend each year once retired, in today&rsquo;s dollars. Tick each line that
        looks right; write the change beside any that does not. Printed {printed}.
      </p>

      <table className="review-summary">
        <tbody>
          <tr><td>Everything below, a year</td><td>{fc(m.total)}</td></tr>
          <tr><td>A month</td><td>{fc(m.total / 12)}</td></tr>
          {m.essentialTotal !== null && (
            <>
              <tr><td>The part you could not cut (essential)</td><td>{fc(m.essentialTotal)}</td></tr>
              <tr><td>The part that could flex</td><td>{fc(m.total - m.essentialTotal)}</td></tr>
            </>
          )}
        </tbody>
      </table>

      {m.fromLedger ? m.categories.map((c) => (
        <section key={c.id} className="review-category">
          <h2>{c.label}{c.essential ? ' (essential)' : ''} <span>{fc(c.total)} a year</span></h2>
          <table className="review-lines">
            <Cols />
            <thead>
              <tr><th className="review-check">OK</th><th>Line</th><th>How often</th><th>When</th><th className="num">Each time</th><th className="num">A year</th><th className="review-notes">Change to</th></tr>
            </thead>
            <tbody>
              {c.lines.map((l) => (
                <tr key={l.id}>
                  <td className="review-check"><Box /></td><td>{l.label}</td><td>{l.cadence}</td><td>{l.when}</td>
                  <td className="num">{fc(l.perPayment)}</td><td className="num">{fc(l.perYear)}</td><td className="review-notes" />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )) : (
        <p className="review-note">
          This plan uses one annual figure rather than a list of categories. To review it line by line, switch
          Plan &rarr; Spending to categories first.
        </p>
      )}

      {m.bridgeTotal > 0 && (
        <section className="review-category">
          <h2>Health coverage before 65 <span>{fc(m.bridgeTotal)} a year, per person under 65</span></h2>
          {m.bridge.length > 0 && (
            <table className="review-lines">
              <Cols />
              <tbody>
                {m.bridge.map((l) => (
                  <tr key={l.id}>
                    <td className="review-check"><Box /></td><td>{l.label}</td><td>{l.cadence}</td><td>{l.when}</td>
                    <td className="num">{fc(l.perPayment)}</td><td className="num">{fc(l.perYear)}</td><td className="review-notes" />
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="review-note">Added on top of the total above for each of you until 65. Medicare after 65 is worked out by the plan.</p>
        </section>
      )}

      {m.phases.length > 0 && (
        <section className="review-category">
          <h2>How it changes with age</h2>
          <table>
            <tbody>
              {m.phases.map((p) => (
                <tr key={p.name}><td className="review-check"><Box /></td><td>{p.name}</td><td>{p.ages}</td><td className="num">{fc(p.perYear)} a year</td><td className="review-notes" /></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="review-category">
        <h2>Not in these figures, on purpose</h2>
        <ul>
          <li>Mortgage{m.mortgagePayment > 0 ? ` (${fc(m.mortgagePayment)} a year)` : ''} and other debt{m.otherDebtPayment > 0 ? ` (${fc(m.otherDebtPayment)} a year)` : ''}: the plan pays these on their own schedule until they end.</li>
          <li>Income taxes, Medicare premiums and surcharges: worked out each year from your income.</li>
          <li>Long-term care, one-off events (a wedding, a roof, a move) and gifts: entered separately under Special Expenses and Life Events.</li>
        </ul>
      </section>

      <p className="review-footer">From OutlastRetirement. This page was printed on your own computer; nothing was sent anywhere.</p>
    </>
  );
}

export default function SpendingReviewSheet({ inputs, formatCurrency, onDone = () => {}, print }) {
  useEffect(() => {
    // Next frame, so the sheet is laid out before the dialog snapshots it.
    let canceled = false;
    const id = requestAnimationFrame(() => {
      // Once the header logo has loaded (changelog 333).
      whenImagesReady(document.querySelector('.section-print[data-section="spending"]')).then(() => {
        if (!canceled) printSection('spending', { onDone, ...(print ? { print } : {}) });
      });
    });
    return () => { canceled = true; cancelAnimationFrame(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="section-print" data-section="spending" data-testid="spending-review-sheet">
      <PrintFrame title="Spending Review"><SpendingReviewContent inputs={inputs} formatCurrency={formatCurrency} /></PrintFrame>
    </div>,
    document.body,
  );
}
