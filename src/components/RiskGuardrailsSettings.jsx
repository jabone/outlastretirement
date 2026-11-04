// Risk-based guardrails (What's New 487) -- the settings block on Risk &
// Stress, under the other two guardrails. The rule itself lives in
// calculator.js (riskGuardrailModel); this explains it in plain words,
// shows what it says about the plan today (riskGuardrailSnapshot), and
// what moving each setting trades away (riskGuardrailAdvice). Reworked
// after the review panel (2026-11-03): ideas in teaching order, every
// "chance" on the screen tied together, numbers applied when a field is
// left rather than on every keystroke.
import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { riskGuardrailSnapshot, essentialShareOf } from '../calculator';
import { riskGuardrailAdvice } from '../utils/riskGuardrailAdvice';

const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);

// A percent field that applies its value when the field is left or Enter
// is pressed, so typing "90" does not first run the whole plan at 9%.
function PercentField({ id, label, help, value, onCommit }) {
  const [draft, setDraft] = useState(String(value ?? ''));
  useEffect(() => { setDraft(String(value ?? '')); }, [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(n)) { setDraft(String(value ?? '')); return; }
    const clamped = Math.min(100, Math.max(1, Math.round(n)));
    if (clamped !== value) onCommit(clamped);
    setDraft(String(clamped));
  };
  return (
    <label style={{ display: 'block', fontSize: 'var(--fs-sm)' }}>
      <span>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
        <input
          id={id}
          type="number"
          min="1"
          max="100"
          inputMode="numeric"
          className="form-input"
          style={{ width: '100px' }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        />
        <span style={{ color: 'var(--text-secondary)' }}>%</span>
      </div>
      <span style={{ display: 'block', fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px' }}>{help}</span>
    </label>
  );
}

export default function RiskGuardrailsSettings({ inputs, updateInput, formatCurrency, labelId }) {
  const on = !!inputs.riskGuardrailsEnabled;
  const target = num(inputs.riskGuardrailTargetPct, 80);
  // The lines as the engine uses them: the cut line never above the target,
  // the raise line never below it, the cut-back level between.
  const cutAt = Math.min(target, num(inputs.riskGuardrailCutAtPct, 50));
  const raiseAt = Math.max(target, num(inputs.riskGuardrailRaiseAtPct, 99));
  const cutTo = Math.min(target, Math.max(cutAt, num(inputs.riskGuardrailCutToPct, 70)));
  const move = num(inputs.riskGuardrailMovePct, 100);
  const typed = {
    target, cutAt: num(inputs.riskGuardrailCutAtPct, 50), raiseAt: num(inputs.riskGuardrailRaiseAtPct, 99),
    cutTo: num(inputs.riskGuardrailCutToPct, 70), move, raiseCap: num(inputs.riskGuardrailRaiseCapPct, 0), minChange: num(inputs.riskGuardrailMinChangePct, 0),
  };

  const snap = useMemo(() => (on ? riskGuardrailSnapshot(inputs) : null), [on, inputs]);
  const essential = essentialShareOf(inputs);
  const money = (v) => formatCurrency(Math.round(v || 0));
  const from = Number(inputs.historyFromYear) === 1871 ? 1871 : 1928;

  const toggle = (checked) => {
    updateInput('riskGuardrailsEnabled', checked);
    // One dynamic rule at a time: the other two measure spending against
    // a path this one replaces.
    if (checked) {
      if (inputs.spendingGuardrails) updateInput('spendingGuardrails', false);
      if (inputs.withdrawalGuardrailsEnabled) updateInput('withdrawalGuardrailsEnabled', false);
    }
  };

  const advice = on ? riskGuardrailAdvice(typed) : [];

  return (
    <div data-testid="risk-guardrails" style={{ borderTop: '1px solid var(--card-border)', paddingTop: '24px', marginTop: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ maxWidth: '620px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle size={18} style={{ color: 'var(--success)' }} />
            <span id={labelId}>Risk-Based Guardrails</span>
          </h3>
          <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Your <strong>chance of lasting</strong> is how many of every 100 real market histories since {from} your
            savings would survive at your current spending. With this on, the plan checks it again at the start of each
            retired year. Your two lines make a band: while the chance stays between them, spending stays the same. If it
            falls below the lower line, spending is cut back to a safer level; if it reaches the upper line, spending is
            raised. Turning this on turns the other two guardrails off.
          </p>
        </div>
        <label className="custom-switch">
          <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} aria-labelledby={labelId} />
          <span className="slider-round"></span>
        </label>
      </div>
      {on && (
        <>
          {snap && (
            <div data-testid="risk-guardrails-now" style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--card-border)', fontSize: 'var(--fs-sm)' }}>
              <p style={{ margin: 0 }}>
                When you retire{snap.age ? ` at ${snap.age}` : ''}, your plan spends about <strong>{money(snap.planSpend)}</strong> a
                year on lifestyle (today&rsquo;s dollars, before taxes and healthcare). At that spending your chance of lasting
                is <strong>{Math.round(snap.chance * 100)}%</strong>. Spending about {money(snap.atTarget)} would put it at {target}%,
                and spending above about {money(snap.atCutLine)} would put it below {cutAt}%, where the rule cuts.
              </p>
              <p style={{ margin: '6px 0 0' }}>
                {snap.firstAction === 'cut'
                  ? <>Because it starts below {cutAt}%, your spending starts lower, at about {money(snap.planSpend * snap.firstMultiplier)}.{' '}</>
                  : null}
                {snap.firstCutAge
                  ? <>On your plan&rsquo;s own projection, with average returns every year, the rule cuts spending at {snap.firstCutAge}; Year by Year shows each year.</>
                  : <>On your plan&rsquo;s own projection, with average returns every year, the rule makes no cuts; it acts when markets push the chance outside the band.</>}
              </p>
              {Number.isFinite(snap.cutBalance) && (
                <div style={{ margin: '6px 0 0' }} data-testid="risk-guardrails-dollars">
                  <p style={{ margin: 0 }}>
                    <strong>In savings</strong> (your Pre-Tax, Roth, Taxable and HSA accounts together, the Ending Portfolio in
                    Year by Year; not your home or cash reserve), in today&rsquo;s dollars: you start retirement with
                    about {money(snap.openingBalance)}.
                  </p>
                  <p style={{ margin: '4px 0 0' }}>
                    {snap.cutBalance > 0.5 ? (
                      <>
                        {snap.firstAction === 'cut' ? 'From there, the' : 'The'} plan would lower your spending only if savings started the year below about{' '}
                        <strong>{money(snap.cutBalance)}</strong>
                        {snap.openingBalance > snap.cutBalance ? <>, a fall of about {Math.round((1 - snap.cutBalance / snap.openingBalance) * 100)}%</> : null}
                        {Number.isFinite(snap.spendAfterCut) ? <>; it would then spend about {money(snap.spendAfterCut)} a year on lifestyle, instead of {money(snap.planSpend * (snap.firstMultiplier || 1))}</> : null}.
                      </>
                    ) : <>No balance would make the plan lower your spending in your first year.</>}
                  </p>
                  <p style={{ margin: '4px 0 0' }}>
                    {Number.isFinite(snap.raiseBalance)
                      ? <>Raises are allowed from {snap.raiseAge}. That year it would raise your spending if savings reached about <strong>{money(snap.raiseBalance)}</strong>{Number.isFinite(snap.spendAfterRaise) ? <>, to about {money(snap.spendAfterRaise)} a year on lifestyle{Number.isFinite(snap.raiseYearSpend) ? <>, instead of {money(snap.raiseYearSpend)}</> : null} (no single raise is more than 20%)</> : null}{Number.isFinite(snap.raiseCutBalance) && snap.raiseCutBalance > 0.5 ? <>, and lower it below about {money(snap.raiseCutBalance)}</> : null}.</>
                      : <>On this plan&rsquo;s own projection it would not raise your spending in any year.</>}
                    {' '}These amounts change each year with your age, income and spending, and after any cut or raise; Year by Year shows each year&rsquo;s. Nothing happens to your accounts: the amounts say when the plan would change what it spends.
                  </p>
                </div>
              )}
              <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                This {Math.round(snap.chance * 100)}% is your chance at your planned spending if nothing changes. The
                &ldquo;lasted in&rdquo; count under Every retirement since {from} and the Dashboard&rsquo;s figures run your plan
                with the rule making its cuts and raises, so they read higher; the Dashboard&rsquo;s simulated markets are
                made-up markets rather than history.
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px', marginTop: '16px' }}>
            <PercentField id="field-riskGuardrailCutAtPct" label="Cut when it falls below" value={typed.cutAt}
              help="If your chance falls below this, spending is cut." onCommit={(v) => updateInput('riskGuardrailCutAtPct', v)} />
            <PercentField id="field-riskGuardrailCutToPct" label="Cut back to" value={typed.cutTo}
              help="A cut brings your chance back up to this." onCommit={(v) => updateInput('riskGuardrailCutToPct', v)} />
            <PercentField id="field-riskGuardrailRaiseAtPct" label="Raise when it reaches" value={typed.raiseAt}
              help="If your chance reaches this, spending is raised." onCommit={(v) => updateInput('riskGuardrailRaiseAtPct', v)} />
            <PercentField id="field-riskGuardrailTargetPct" label="Raise to" value={typed.target}
              help="A raise brings your chance down to this." onCommit={(v) => updateInput('riskGuardrailTargetPct', v)} />
            <label style={{ display: 'block', fontSize: 'var(--fs-sm)' }}>
              <span>How far to move</span>
              <select
                id="field-riskGuardrailMovePct"
                className="form-input form-input-select"
                style={{ marginTop: '4px' }}
                value={String(move)}
                onChange={(e) => updateInput('riskGuardrailMovePct', Number(e.target.value))}
              >
                <option value="100">All the way</option>
                <option value="10">10% of the way</option>
                {move !== 100 && move !== 10 && <option value={String(move)}>{move}% of the way</option>}
              </select>
              <span style={{ display: 'block', fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px' }}>Each time a line is crossed.</span>
            </label>
            <label style={{ display: 'block', fontSize: 'var(--fs-sm)' }}>
              <span>Smallest change it makes</span>
              <select
                id="field-riskGuardrailMinChangePct"
                className="form-input form-input-select"
                style={{ marginTop: '4px' }}
                value={String(num(inputs.riskGuardrailMinChangePct, 0))}
                onChange={(e) => updateInput('riskGuardrailMinChangePct', Number(e.target.value))}
              >
                <option value="0">Any change</option>
                <option value="2">2% of spending</option>
                <option value="5">5% of spending</option>
                <option value="10">10% of spending</option>
                {![0, 2, 5, 10].includes(num(inputs.riskGuardrailMinChangePct, 0)) && (
                  <option value={String(num(inputs.riskGuardrailMinChangePct, 0))}>{num(inputs.riskGuardrailMinChangePct, 0)}% of spending</option>
                )}
              </select>
              <span style={{ display: 'block', fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px' }}>A raise smaller than this share of your lifestyle spending is skipped that year. A cut is never skipped: one this small is made at this size.</span>
            </label>
            <label style={{ display: 'block', fontSize: 'var(--fs-sm)' }}>
              <span>Highest raises can take spending</span>
              <select
                id="field-riskGuardrailRaiseCapPct"
                className="form-input form-input-select"
                style={{ marginTop: '4px' }}
                value={String(num(inputs.riskGuardrailRaiseCapPct, 0))}
                onChange={(e) => updateInput('riskGuardrailRaiseCapPct', Number(e.target.value))}
              >
                <option value="0">No limit</option>
                <option value="25">25% above your plan</option>
                <option value="50">50% above your plan</option>
                <option value="100">Double your plan</option>
                {![0, 25, 50, 100].includes(num(inputs.riskGuardrailRaiseCapPct, 0)) && (
                  <option value={String(num(inputs.riskGuardrailRaiseCapPct, 0))}>{num(inputs.riskGuardrailRaiseCapPct, 0)}% above your plan</option>
                )}
              </select>
              <span style={{ display: 'block', fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px' }}>Raises stop here, however many there are. Cuts are not affected.</span>
            </label>
          </div>

          <ul style={{ margin: '12px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
            <li>
              {essential !== null
                ? 'Spending you marked essential is never cut.'
                : <>Spending is never cut below half your plan&rsquo;s, about {money((snap?.planSpend || 0) * 0.5)} a year. To protect exactly what you could not cut, build your budget from categories under Plan &rarr; Spending &rarr; Retirement Spending Target and tick <strong>essential</strong> on those.</>}
            </li>
            <li>Raises wait until you have been retired five years, when a bad run of markets does the most harm, and no single raise is more than 20%{num(inputs.riskGuardrailRaiseCapPct, 0) > 0 ? `, and raises never take spending more than ${num(inputs.riskGuardrailRaiseCapPct, 0)}% above your plan` : ''}. Before raising, the plan also checks at least ten years ahead, in case you live longer than planned.</li>
            <li>Your investment fees and any Keep at Least floor count toward the chance.</li>
            <li>The chance uses the income, spending and taxes your plan expects, including any care costs you entered. It is updated for what has happened: from the year a spouse dies, it is measured with the survivor&rsquo;s income and spending; if you live past the age your plan assumes, it plans for up to five more years from there; and when the simulated markets draw a care episode you did not enter, it counts those costs from the year they begin. Like a household, it does not see a death or an unplanned care episode coming.</li>
            <li>Once spending has been cut, a raise back up to your plan&rsquo;s own spending only needs your chance to reach the raise line over the years you have left; raises above your plan also need it over at least ten more years.</li>
          </ul>

          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', margin: '10px 0 0' }}>
            The defaults are cut below 50% back to 70%, and raise at 99% to 80%. Michael Kitces&rsquo;s published version cuts
            later, below 25%, back to 45%, and raises at 100% to 80%; these act sooner, so a cut comes earlier in a bad run. There is
            no single right setting; what your settings trade away:
          </p>
          <ul data-testid="risk-guardrails-advice" style={{ margin: '6px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--fs-sm)' }}>
            {advice.map((a) => (
              <li key={a.text} style={{ color: a.tone === 'warn' ? 'var(--warning)' : 'var(--text-secondary)' }}>
                {a.tone === 'warn' && <AlertTriangle size={13} style={{ verticalAlign: '-2px', marginRight: '4px' }} />}
                {a.text}
              </li>
            ))}
          </ul>
          {cutTo !== typed.cutTo || cutAt !== typed.cutAt || raiseAt !== typed.raiseAt ? (
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--warning)', margin: '6px 0 0' }}>
              Using: cut below {cutAt}% back to {cutTo}%, raise at {raiseAt}% to {target}%.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
