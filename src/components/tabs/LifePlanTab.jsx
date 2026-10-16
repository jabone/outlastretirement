// "What Will You Do?" -- see src/config/lifePlan.js for what this is and,
// more importantly, what it deliberately is not (no score, no dollars,
// nothing required).
import React, { useMemo, useState } from 'react';
import { printSection } from '../../utils/printSection';
import PrintFrame from '../PrintFrame';
import { Compass, Printer } from 'lucide-react';
import {
  LIFE_PLAN_SECTIONS, FREEFORM_PROMPT,
  readLifePlan, writeLifePlan, setLifePlanAnswer, answeredCount,
} from '../../config/lifePlan';
import { useSimulation } from '../../context/useSimulation';

// Local date, not toISOString() -- see EstateChecklist's todayLocal for why.
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Prompt({ prompt, entry, onSave }) {
  // Local draft so typing never round-trips through localStorage; the save
  // happens on blur, which also means there is no "unsaved changes" badge
  // to nag anyone.
  const [draft, setDraft] = useState(entry?.text || '');
  const [showHistory, setShowHistory] = useState(false);
  const history = entry?.history || [];

  return (
    <div className="life-plan-prompt" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label htmlFor={`life-${prompt.id}`} style={{ fontSize: 'var(--fs-body)', fontWeight: '600', color: 'var(--text-primary)' }}>
        {prompt.question}
      </label>
      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: '1.5' }}>{prompt.hint}</span>
      <textarea
        id={`life-${prompt.id}`}
        className="form-input"
        rows={3}
        value={draft}
        placeholder=""
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onSave(prompt.id, draft)}
        style={{ resize: 'vertical', minHeight: '76px', lineHeight: '1.5' }}
      />
      {(entry?.updatedAt || history.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
          {entry?.updatedAt && <span>Written {entry.updatedAt}</span>}
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent-text)', font: 'inherit', textDecoration: 'underline' }}
            >
              {showHistory ? 'Hide earlier answers' : `Earlier answers (${history.length})`}
            </button>
          )}
        </div>
      )}
      {showHistory && history.length > 0 && (
        <ul style={{ margin: '2px 0 0', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {history.map((h, i) => (
            <li key={i} style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              {h.text || <em>(cleared)</em>}
              {h.date && <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-2xs)', marginLeft: '8px' }}>{h.date}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LifePlanTab() {
  const { inputs } = useSimulation();
  const [state, setState] = useState(() => readLifePlan());

  const save = (promptId, text) => {
    setState((prev) => {
      const next = setLifePlanAnswer(prev, promptId, text, todayLocal());
      if (next !== prev) writeLifePlan(next);
      return next;
    });
  };

  // One factual line, no adjectives: the plan already knows the retirement
  // year and how long it runs. Stated in years rather than days on
  // purpose -- "about 8,000 days" reads as a countdown, and this page is
  // not here to alarm anyone.
  const horizon = useMemo(() => {
    const retireAge = Number(inputs?.retireAge1);
    const birthYear = Number(inputs?.birthYear1);
    const endAge = Number(inputs?.lifeExpectancy1);
    if (!Number.isFinite(retireAge) || !Number.isFinite(birthYear) || !Number.isFinite(endAge) || endAge <= retireAge) return null;
    return { year: birthYear + retireAge, retireAge, endAge, years: Math.round(endAge - retireAge) };
  }, [inputs]);

  const anyAnswers = answeredCount(state) > 0;

  return (
    <div className="life-plan-root" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PrintFrame inline title="Life Plan">
      <div className="glass-panel" style={{ padding: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <Compass size={22} style={{ color: 'var(--accent-text)', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: '1 1 340px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '700' }}>What Will You Do?</h3>
            <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              The rest of this app answers whether you can afford to stop working. This page is the other question, and
              it has no numbers in it. Most people have an answer ready for the trips &mdash; three weeks a year. This
              is about the other three hundred and forty days.
            </p>
            {horizon && (
              <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                Your plan has you stopping work in {horizon.year} at {horizon.retireAge}, and runs to {horizon.endAge}
                {' '}&mdash; about {horizon.years} years.
              </p>
            )}
            <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', lineHeight: '1.6' }}>
              Nothing here is required and nothing is scored. Answer one question or none of them. &ldquo;I haven&rsquo;t
              figured this out yet&rdquo; is a real answer and worth writing down &mdash; the useful thing about this
              page is reading it again in a few years. Answers are saved on this device with the rest of your plan, and
              they never change your projection.
            </p>
          </div>
          {anyAnswers && (
            <button className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }} onClick={() => printSection('lifeplan')}>
              <Printer size={14} /> Print
            </button>
          )}
        </div>
      </div>

      {LIFE_PLAN_SECTIONS.map((section) => (
        <div key={section.id} className="glass-panel life-plan-section" style={{ padding: '22px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: '700', display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
              {section.title}
              <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '400', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{section.pillar}</span>
            </h4>
            <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: '1.55' }}>{section.blurb}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {section.prompts.map((prompt) => (
              <Prompt key={prompt.id} prompt={prompt} entry={state[prompt.id]} onSave={save} />
            ))}
          </div>
        </div>
      ))}

      <div className="glass-panel life-plan-section" style={{ padding: '22px' }}>
        <Prompt prompt={FREEFORM_PROMPT} entry={state[FREEFORM_PROMPT.id]} onSave={save} />
      </div>

      <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', lineHeight: '1.6', maxWidth: '820px' }}>
        This page is a place to think, not advice. It is saved on this device only, travels with Backup Everything, and
        is deliberately left out of saved Scenarios &mdash; changing your retirement age should not rewrite what you
        want your life to be.
      </div>
      </PrintFrame>
    </div>
  );
}
