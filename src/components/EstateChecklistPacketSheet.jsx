import React from 'react';
import { CHECKLIST_CATEGORIES, readChecklistState, checklistProgress } from '../config/estateChecklist';

// The estate documents checklist as a page of the planner packet (changelog
// 332): every item with a box, ticked with its date when done, and a blank
// to write the date in when not.
export const ESTATE_PACKET_NOTE = 'Educational checklist only — not legal or tax advice. Whether you need a trust, how a document should be worded, and what applies in your state are questions for an estate attorney.';

export default function EstateChecklistPacketSheet({ state = readChecklistState(), showTitle = true }) {
  const progress = checklistProgress(state);
  return (
    <div className="packet-page" data-testid="estate-packet-sheet">
      {/* Left off when the page header already carries this title. */}
      {showTitle ? <h1>Estate Documents Checklist</h1> : null}
      <p className="review-lede">{progress.done} of {progress.total} reviewed. {ESTATE_PACKET_NOTE}</p>
      {CHECKLIST_CATEGORIES.map((cat) => (
        <div key={cat.id} className="packet-group">
          <h2>{cat.title}</h2>
          <table className="packet-table">
            <thead><tr><th className="review-check">Done</th><th>Item</th><th className="packet-date">Date</th></tr></thead>
            <tbody>
              {cat.items.map((item) => {
                const entry = state[item.id];
                const done = Boolean(entry?.done);
                return (
                  <tr key={item.id}>
                    <td className="review-check"><span className={done ? 'review-box review-box--done' : 'review-box'} aria-label={done ? 'Done' : 'Not done'} /></td>
                    <td><strong>{item.title}</strong><div className="packet-muted">{item.detail}</div></td>
                    <td className="packet-date">{done ? (entry.completedAt || entry.date || '') : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
