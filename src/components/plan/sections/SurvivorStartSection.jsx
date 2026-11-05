// SurvivorStartSection -- when a widow or widower starts the survivor benefit
// (benefits-specialist review, 2026-11-02). Sits in the Social Security
// section of a two-person plan: one start-age choice per person, and on
// request a comparison that runs the plan once for each start age and says
// which leaves the most, so a survivor who needs the check at once and one
// who can afford to wait both see their own answer.
import React, { useDeferredValue, useMemo, useState } from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { getSurvivorFullRetirementAge as getFullRetirementAge } from '../../../calculator';
import { survivorStartComparison } from '../../../utils/survivorStart';
import { getPossessive } from '../getPossessive';

const money = (n) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString('en-US')}` : '—');
const note = { fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginTop: '6px', lineHeight: 1.5 };

// The start-age choices: as soon as possible, then 61 up to full
// retirement age.
function ageOptions(fra) {
  const top = Math.ceil(fra);
  const out = [<option key={0} value={0}>As soon as possible (from 60)</option>];
  for (let a = 61; a <= top; a += 1) out.push(<option key={a} value={a}>At {a}{a === top ? ' (full retirement age)' : ''}</option>);
  return out;
}

// One benefit first, then the other: each way run in full, and the one
// that leaves more than any single start age flagged. Use this changes the
// survivor's own claiming age, which also changes the plan if both live, so
// each says what changes and what it costs (review panel, 2026-11-04).
function Strategies({ result, who, onUse }) {
  if (!Array.isArray(result.strategies) || result.strategies.length === 0) return null;
  const s = who(result.survivor);
  const d = who(result.deceased);
  return (
    <div data-testid="survivor-start-strategies" style={{ marginTop: '6px' }}>
      <p style={{ ...note, marginTop: 0 }}>
        A survivor can also take one benefit first and switch to the other later. The same plan, each way:
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {result.strategies.map((st) => {
          const isBetter = result.betterStrategy && result.betterStrategy.id === st.id;
          return (
            <li key={st.id} data-testid={`survivor-strategy-${st.id}`} style={{ border: `${isBetter ? 2 : 1}px solid ${isBetter ? 'var(--success)' : 'var(--border-color, rgba(128,128,128,0.35))'}`, borderRadius: '8px', padding: '8px 12px', fontSize: 'var(--fs-xs)', lineHeight: 1.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <strong>{st.id === 'ownFirst'
                  ? `Own benefit at ${st.ownAge}, survivor benefit from ${st.survivorStartAge}`
                  : `Survivor benefit from ${st.survivorStartAge}, own benefit at ${st.ownAge}`}</strong>
                <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                  {isBetter && <span style={{ color: 'var(--status-success-text)', fontWeight: 600 }}>{result.status === 'past-fra' ? 'Leaves more than the plan as it is' : 'Leaves more than any single start age'}</span>}
                  <button type="button" className="btn-outline" style={{ padding: '2px 10px', minHeight: 0, lineHeight: 1.4, fontSize: 'var(--fs-xs)', whiteSpace: 'nowrap' }}
                    onClick={() => { onUse(result.ownField, st.ownAge); onUse(result.field, st.survivorStart); }}>Use this</button>
                </span>
              </div>
              <div>Savings at the end: <strong>{money(st.endBalance)}</strong>; Social Security to the end of the plan: {money(st.ssTotal)}</div>
              <div>{st.shortYears ? `Money runs short in ${st.shortYears} year${st.shortYears === 1 ? '' : 's'}` : 'Money never runs short'}</div>
              <div style={{ color: 'var(--text-muted)' }} data-testid={`survivor-strategy-${st.id}-cost`}>
                {st.id === 'ownFirst'
                  ? <>Use this also changes {getPossessive(s)} own claiming age from {result.ownClaim} to {st.ownAge}. If you both live, {getPossessive(s)} own check is smaller for life, and if {s} dies first, {getPossessive(d)} survivor benefit is capped.</>
                  : <>Use this also changes {getPossessive(s)} own claiming age from {result.ownClaim} to {st.ownAge}. If you both live, {getPossessive(s)} own check starts later and is larger.</>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Comparison({ inputs, names, onUse }) {
  const deferred = useDeferredValue(inputs);
  const result = useMemo(() => {
    try { return survivorStartComparison(deferred); } catch { return null; }
  }, [deferred]);
  if (!result) return null;
  const who = (n) => names[n];
  const stress = inputs.survivorStressEnabled ? ' (the Survivor Stress Test)' : '';

  if (result.status === 'no-survivor') {
    return <p style={note} data-testid="survivor-start-result">In this plan you both reach the end of the plan in the same year, so neither of you is ever on your own and the start age changes nothing.</p>;
  }
  const lead = `In this plan ${who(result.deceased)} dies at ${result.deceasedDeathAge}${stress}, when ${who(result.survivor)} is ${result.survivorAge}.`;
  if (result.status === 'past-fra') {
    return (
      <div data-testid="survivor-start-result">
        <p style={note}>
          {lead} That is past full retirement age, so the survivor benefit is not reduced whenever it starts and this
          setting changes nothing. To see an earlier death, turn on the Survivor Stress Test under Household.
        </p>
        <Strategies result={result} who={who} onUse={onUse} />
      </div>
    );
  }
  if (result.status === 'own-larger') {
    return (
      <p style={note} data-testid="survivor-start-result">
        {lead} {getPossessive(who(result.survivor))} own benefit is larger than the survivor benefit at every start
        age, so the survivor benefit is never used and this setting changes nothing.
      </p>
    );
  }

  const { rows, best, current } = result;
  const allShort = rows.every((r) => r.shortYears > 0);
  const takeover = rows[0].ownTakesOverAt;
  return (
    <div data-testid="survivor-start-result" style={{ marginTop: '8px' }}>
      <p style={{ ...note, marginTop: 0 }}>{lead} What each start age does for {who(result.survivor)}, in today&rsquo;s dollars:</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.map((r, i) => {
          const isBest = i === best;
          return (
            <li key={r.startAge} data-testid={`survivor-start-row-${r.effectiveAge}`}
              style={{ border: `${isBest ? 2 : 1}px solid ${isBest ? 'var(--success)' : 'var(--border-color, rgba(128,128,128,0.35))'}`, borderRadius: '8px', padding: '10px 12px', fontSize: 'var(--fs-xs)', lineHeight: 1.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 'var(--fs-sm)' }}>
                  Start at {r.effectiveAge}{r.startAge === 0 ? ' (as soon as possible)' : ''}
                </strong>
                <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                  {isBest && <span style={{ color: 'var(--status-success-text)', fontWeight: 600 }}>Best for this plan</span>}
                  {i === current && !result.currentPastTop
                    ? <span style={{ color: 'var(--text-muted)' }}>Chosen</span>
                    : <button type="button" className="btn-outline" style={{ padding: '2px 10px', minHeight: 0, lineHeight: 1.4, fontSize: 'var(--fs-xs)', whiteSpace: 'nowrap' }} onClick={() => onUse(result.field, r.startAge)}>Use this</button>}
                </span>
              </div>
              <div>Survivor check: <strong>{money(r.check)}</strong> a year</div>
              <div>Social Security to the end of the plan: {money(r.ssTotal)}</div>
              <div>Savings at the end: <strong>{money(r.endBalance)}</strong></div>
              <div>{r.shortYears ? `Money runs short in ${r.shortYears} year${r.shortYears === 1 ? '' : 's'}` : 'Money never runs short'}</div>
              {i > 0 && <div style={{ color: 'var(--text-muted)' }}>{r.breakEven ? `Waiting pays back by age ${r.breakEven}` : 'Waiting does not pay back within the plan'}</div>}
            </li>
          );
        })}
      </ul>
      {result.cappedEarly && (
        <p style={note}>
          {who(result.deceased)} claimed before full retirement age, so the survivor check stops growing at {result.topAge}.
          Waiting past {result.topAge} only gives up checks.
        </p>
      )}
      {result.currentPastTop && (
        <p style={note}>The age chosen now is past {result.topAge}: it pays the same check as {result.topAge}, starting later.</p>
      )}
      {takeover && (
        <p style={note}>
          From {takeover}, {getPossessive(who(result.survivor))} own benefit is larger and replaces the survivor benefit,
          so the survivor benefit only covers the years before that.
        </p>
      )}
      {result.cannotWait && (
        <p style={note} data-testid="survivor-start-cannot-wait">
          Starting at {result.shortFromAge} or later leaves years when the money runs short: this plan cannot wait that long for the survivor check.
        </p>
      )}
      {allShort && (
        <p style={note}>The money runs short whichever age is chosen; the start age alone does not fix this plan.</p>
      )}
      <Strategies result={result} who={who} onUse={onUse} />
      <p style={note}>
        &ldquo;Savings at the end&rdquo; counts the tax and the growth lost on the savings spent while waiting, which
        is why the age that collects the most Social Security is not always best. &ldquo;Waiting pays back&rdquo; is
        the age when the bigger checks have made up for the ones skipped. The best start age has the fewest short
        years, then the most left at the end.
      </p>
    </div>
  );
}

export default function SurvivorStartSection() {
  const { inputs, updateInput } = useSimulation();
  const [showCompare, setShowCompare] = useState(false);
  if (!inputs.spouse2Enabled) return null;
  const names = { 1: inputs.spouse1Name || 'Primary', 2: inputs.spouse2Name || 'Spouse' };
  const fra1 = getFullRetirementAge(inputs.birthYear1);
  const fra2 = getFullRetirementAge(inputs.birthYear2);
  return (
    <div className="form-group" data-testid="survivor-start-panel">
      <strong style={{ fontSize: 'var(--fs-sm)' }}>If one of you dies first</strong>
      <span style={note}>
        A widow or widower can draw a survivor benefit on the other&rsquo;s Social Security record from 60. Starting
        early pays a smaller check for more years; waiting, up to full retirement age, pays a bigger one (less if the
        one who died had claimed early). Some survivors need the money at once, others can wait.
      </span>
      <div style={{ marginTop: '8px' }}>
        <label htmlFor="field-survivorStartAge1">{names[1]} starts a survivor benefit</label>
        <select id="field-survivorStartAge1" className="form-input form-input-select" value={Number(inputs.survivorStartAge1) || 0}
          onChange={(e) => updateInput('survivorStartAge1', parseInt(e.target.value, 10))}>
          {ageOptions(fra1)}
        </select>
      </div>
      <div style={{ marginTop: '8px' }}>
        <label htmlFor="field-survivorStartAge2">{names[2]} starts a survivor benefit</label>
        <select id="field-survivorStartAge2" className="form-input form-input-select" value={Number(inputs.survivorStartAge2) || 0}
          onChange={(e) => updateInput('survivorStartAge2', parseInt(e.target.value, 10))}>
          {ageOptions(fra2)}
        </select>
      </div>
      <button type="button" className="btn-outline" style={{ marginTop: '10px', padding: '6px 14px' }} aria-expanded={showCompare}
        data-testid="survivor-start-compare" onClick={() => setShowCompare((v) => !v)}>
        {showCompare ? 'Hide the comparison' : 'Compare start ages for this plan'}
      </button>
      {showCompare && <Comparison inputs={inputs} names={names} onUse={(field, age) => updateInput(field, age)} />}
    </div>
  );
}
