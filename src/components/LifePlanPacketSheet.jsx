import React from 'react';
import { LIFE_PLAN_SECTIONS, FREEFORM_PROMPT, readLifePlan } from '../config/lifePlan';

// "What Will You Do?" as a page of the planner packet (changelog 332). The
// answers are printed as written; an unanswered question gets ruled lines
// to write on, the way the page itself prints.
export default function LifePlanPacketSheet({ lifePlan = readLifePlan(), showTitle = true }) {
  const answer = (prompt) => {
    const entry = lifePlan[prompt.id];
    const text = entry?.text?.trim();
    return (
      <tr key={prompt.id}>
        <td>
          <strong>{prompt.question}</strong>
          {text ? (
            <>
              <div className="packet-answer">{text}</div>
              {entry.updatedAt ? <div className="packet-muted">Written {entry.updatedAt}</div> : null}
            </>
          ) : (
            <div className="packet-write-lines" aria-hidden="true"><span /><span /></div>
          )}
        </td>
      </tr>
    );
  };
  return (
    <div className="packet-page" data-testid="life-plan-packet-sheet">
      {showTitle ? <h1>What Will You Do?</h1> : <h2>What Will You Do?</h2>}
      <p className="review-lede">The other half of retirement: not whether the money lasts, but what the days are for.</p>
      {LIFE_PLAN_SECTIONS.map((section) => (
        <div key={section.id} className="packet-group">
          <h2>{section.title}</h2>
          <table className="packet-table"><tbody>{section.prompts.map(answer)}</tbody></table>
        </div>
      ))}
      <div className="packet-group">
        <h2>{FREEFORM_PROMPT.question}</h2>
        <table className="packet-table"><tbody>{answer({ ...FREEFORM_PROMPT, question: FREEFORM_PROMPT.hint })}</tbody></table>
      </div>
    </div>
  );
}
