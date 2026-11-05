// Tax & Estate -> Survivor's Guide (What's New 492, 493): the notes each
// spouse writes for the other, the other survivor benefits (an employer's
// survivor income, group life insurance and the like, counted in the plan),
// where the money is kept, where the backup file is kept, a short preview
// of each guide, and the button that prints both. The guide itself is
// print-only (SurvivorGuideSheet).
import React, { useDeferredValue, useMemo, useState } from 'react';
import { HeartHandshake, Printer, Plus, Trash2 } from 'lucide-react';
import { useSimulation } from '../context/useSimulation';
import { buildSurvivorGuides, spouseName } from '../utils/survivorGuide';
import {
  readSurvivorNotes, writeSurvivorNotes, setSurvivorNote, setSurvivorField, includesHoldings,
  SURVIVOR_NOTE_MAX_LENGTH, ACCOUNT_KINDS,
} from '../utils/survivorNotes';
import { sanitizeSurvivorBenefit } from '../calculator';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import SwitchRow from './SwitchRow';

const SurvivorGuideSheet = lazyWithRetry(() => import('./SurvivorGuideSheet'));

const money = (n) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString('en-US')}` : '—');
const muted = { fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.5 };
const h3 = { fontSize: '16px', fontWeight: 600, margin: '0 0 4px' };
const card = { border: '1px solid var(--card-border)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' };
const lbl = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--fs-sm)' };
const newId = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Local date, not toISOString() -- see EstateChecklist's todayLocal for why.
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A text field that saves when it loses focus, so typing never re-runs the
// plan on every keystroke.
function BlurText({ id, label, value, onCommit, multiline = false, inputMode, placeholder, maxLength }) {
  const [draft, setDraft] = useState(value ?? '');
  const props = {
    id, className: 'form-input', value: draft, placeholder, maxLength, inputMode,
    onChange: (e) => setDraft(e.target.value),
    onBlur: () => { if (draft !== (value ?? '')) onCommit(draft); },
  };
  return (
    <label style={lbl} htmlFor={id}>
      <span>{label}</span>
      {multiline ? <textarea rows={3} style={{ resize: 'vertical', lineHeight: 1.5 }} {...props} /> : <input type="text" {...props} />}
    </label>
  );
}

function NoteBox({ from, to, entry, onSave }) {
  const [draft, setDraft] = useState(entry?.text || '');
  const id = `survivor-note-${from}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label htmlFor={id} style={{ fontWeight: 600, fontSize: 'var(--fs-body)' }}>A note from {to.from} to {to.to}</label>
      <span style={muted}>
        Printed at the top of {to.to}&rsquo;s guide. What would you want {to.to} to know? What the plan is trying to do,
        who to call first, what not to rush, what matters most to you.
      </span>
      <textarea id={id} data-testid={id} className="form-input" rows={5} maxLength={SURVIVOR_NOTE_MAX_LENGTH} value={draft}
        onChange={(e) => setDraft(e.target.value)} onBlur={() => onSave(from, draft)}
        style={{ resize: 'vertical', minHeight: '110px', lineHeight: 1.5 }} />
      {entry?.updatedAt && <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>Written {entry.updatedAt}</span>}
    </div>
  );
}

function BenefitEditor({ b, names, pay, onChange, onRemove }) {
  const set = (patch) => onChange({ ...b, ...patch });
  const payNow = Number(pay[b.whose]) || 0;
  const id = (k) => `survivor-benefit-${b.id}-${k}`;
  return (
    <div style={card} data-testid="survivor-benefit">
      <div style={grid}>
        <label style={lbl} htmlFor={id('whose')}>
          <span>Paid if this person dies</span>
          <select id={id('whose')} className="form-input form-input-select" value={b.whose} onChange={(e) => set({ whose: Number(e.target.value) })}>
            <option value={1}>{names[1]}</option>
            <option value={2}>{names[2]}</option>
          </select>
        </label>
        <BlurText id={id('name')} label="What it is" value={b.name} placeholder="Employer survivor income" maxLength={120} onCommit={(v) => set({ name: v })} />
        <label style={lbl} htmlFor={id('kind')}>
          <span>How it pays</span>
          <select id={id('kind')} className="form-input form-input-select" value={b.kind} onChange={(e) => set({ kind: e.target.value, taxed: e.target.value === 'yearly' })}>
            <option value="yearly">A yearly amount</option>
            <option value="once">One time</option>
          </select>
        </label>
        <label style={lbl} htmlFor={id('basis')}>
          <span>Set as</span>
          <select id={id('basis')} className="form-input form-input-select" value={b.payPct > 0 ? 'pay' : 'amount'}
            onChange={(e) => set(e.target.value === 'pay' ? { payPct: 50 } : { payPct: 0 })}>
            <option value="amount">A dollar amount</option>
            <option value="pay">A share of {names[b.whose]}&rsquo;s pay</option>
          </select>
        </label>
        {b.payPct > 0
          ? <div>
              <BlurText id={id('payPct')} label={`Percent of pay${payNow > 0 ? ` (about ${money(payNow * b.payPct / 100)})` : ''}`} value={String(b.payPct)} inputMode="decimal" onCommit={(v) => set({ payPct: v })} />
              {payNow <= 0 && <span style={{ ...muted, color: 'var(--warning-text, var(--text-muted))' }} data-testid="survivor-benefit-no-pay">No pay is entered for {names[b.whose]}, so this counts as $0. Use a dollar amount instead.</span>}
            </div>
          : <BlurText id={id('amount')} label={b.kind === 'once' ? 'Amount (today\u2019s dollars)' : 'Each year (today\u2019s dollars)'} value={b.amount ? String(b.amount) : ''} inputMode="decimal"
              onCommit={(v) => set({ amount: v })} />}
        {b.kind === 'yearly' && (
          <BlurText id={id('years')} label="For how many years" value={String(b.years)} inputMode="numeric" onCommit={(v) => set({ years: v })} />
        )}
      </div>
      <div style={grid}>
        <SwitchRow id={id('whileWorking')} checked={b.whileWorking} onChange={(v) => set({ whileWorking: v })} size="sm"
          hint={`Pays only if ${names[b.whose]} dies before retiring.`}>Only while working</SwitchRow>
        {b.kind === 'yearly' && (
          <SwitchRow id={id('indexed')} checked={b.indexed} onChange={(v) => set({ indexed: v })} size="sm"
            hint="Off: stays at the death year's dollars.">Rises with inflation</SwitchRow>
        )}
        <SwitchRow id={id('taxed')} checked={b.taxed} onChange={(v) => set({ taxed: v })} size="sm"
          hint="Life insurance (group or union) usually is not. An employer's survivor income or lump-sum death payment usually is.">Taxed as income</SwitchRow>
        <SwitchRow id={id('counted')} checked={b.counted} onChange={(v) => set({ counted: v })} size="sm"
          hint="Off: printed on the guide only.">Count it in the plan</SwitchRow>
      </div>
      <div style={grid}>
        <BlurText id={id('contact')} label="Who to contact" value={b.contact} placeholder="Benefits office, phone" maxLength={200} onCommit={(v) => set({ contact: v })} />
        <BlurText id={id('details')} label="Details for the survivor" value={b.details} multiline maxLength={1000} onCommit={(v) => set({ details: v })} />
      </div>
      <div><button type="button" className="btn-outline" onClick={onRemove} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Trash2 size={14} /> Remove</button></div>
    </div>
  );
}

function AccountEditor({ a, onChange, onRemove }) {
  const id = (k) => `survivor-account-${a.id}-${k}`;
  return (
    <div style={{ ...card, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }} data-testid="survivor-account">
      <div style={{ ...grid, flex: '1 1 480px' }}>
        <BlurText id={id('firm')} label="Firm" value={a.firm} placeholder="Fidelity" maxLength={120} onCommit={(v) => onChange({ ...a, firm: v })} />
        <label style={lbl} htmlFor={id('kind')}>
          <span>What it is</span>
          <select id={id('kind')} className="form-input form-input-select" value={a.kind} onChange={(e) => onChange({ ...a, kind: e.target.value })}>
            {ACCOUNT_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <BlurText id={id('owner')} label="In whose name" value={a.owner} maxLength={80} onCommit={(v) => onChange({ ...a, owner: v })} />
        <BlurText id={id('note')} label="Notes (no account numbers)" value={a.note} maxLength={300} onCommit={(v) => onChange({ ...a, note: v })} />
      </div>
      <button type="button" className="btn-outline" aria-label="Remove this account" onClick={onRemove}><Trash2 size={14} /></button>
    </div>
  );
}

function Preview({ g }) {
  const { deceased: d, survivor: s } = g.names;
  const o = g.outcome;
  return (
    <li data-testid={`survivor-preview-${g.deceased}`} style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.5 }}>
      <strong>If {d} dies this year:</strong> {Number.isFinite(g.spending.after) ? <>from {g.spending.year} {s} spends about {money(g.spending.after)} a year on everyday
      living, and </> : null}the savings {o.lasts ? <>last to {o.endAge} with about {money(o.endBalance)} left</> : <>run short at {o.shortAge}</>}
      {' '}(today&rsquo;s dollars, average returns).
    </li>
  );
}

export default function SurvivorGuidePanel() {
  const { inputs, updateInput, holdings = [] } = useSimulation();
  const [notes, setNotes] = useState(readSurvivorNotes);
  const [printing, setPrinting] = useState(false);
  const deferred = useDeferredValue(inputs);
  const couple = Boolean(inputs?.spouse2Enabled);
  const guides = useMemo(() => {
    if (!couple) return [];
    try { return buildSurvivorGuides(deferred).filter((g) => g.status === 'ok'); } catch { return []; }
  }, [couple, deferred]);

  const store = (next) => { setNotes(next); writeSurvivorNotes(next); };
  const saveNote = (from, text) => {
    const next = setSurvivorNote(notes, from, text, todayLocal());
    if (next !== notes) store(next);
  };
  const accounts = notes.accounts || [];
  const setAccounts = (list) => store(setSurvivorField(notes, 'accounts', list));

  const benefits = (Array.isArray(inputs?.survivorBenefits) ? inputs.survivorBenefits : []).map(sanitizeSurvivorBenefit);
  const setBenefits = (list) => updateInput('survivorBenefits', list.map(sanitizeSurvivorBenefit));

  const names = { 1: spouseName(inputs, 1), 2: spouseName(inputs, 2) };
  const holdingCount = Array.isArray(holdings) ? holdings.length : 0;

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }} data-testid="survivor-guide-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ maxWidth: '680px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <HeartHandshake size={20} style={{ color: 'var(--accent-text)' }} /> Survivor&rsquo;s Guide
          </h2>
          <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.6 }}>
            If one of you died, the other would carry this plan on, perhaps while grieving and perhaps without ever
            having run the household&rsquo;s money. The Survivor&rsquo;s Guide is that plan on paper, one guide for each
            of you, written as if the other died this year. Each guide opens with a note from the spouse who died, then
            the first steps and who to call, the money that keeps coming in, where the money is kept, how to open the plan
            in this app, how to run the plan each year in dollars, and the words it uses. Print it, keep it with the will,
            and print it again each year.
          </p>
        </div>
        {couple && (
          <button type="button" className="btn-primary" data-testid="survivor-guide-print" disabled={printing || guides.length === 0}
            onClick={() => setPrinting(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Printer size={14} /> {printing ? 'Preparing…' : 'Print the Survivor’s Guide'}
          </button>
        )}
      </div>
      {!couple ? (
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>The Survivor&rsquo;s Guide is for a plan with two people. Add a spouse under Plan, Household to use it.</p>
      ) : (
        <>
          {guides.length > 0 && <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>{guides.map((g) => <Preview key={g.deceased} g={g} />)}</ul>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <NoteBox from={1} to={{ from: names[1], to: names[2] }} entry={notes.from1} onSave={saveNote} />
            <NoteBox from={2} to={{ from: names[2], to: names[1] }} entry={notes.from2} onSave={saveNote} />
          </div>

          <section data-testid="survivor-benefits">
            <h3 style={h3}>Other survivor benefits</h3>
            <p style={muted}>
              Money a survivor would receive beyond Social Security, pensions and the life insurance you own: an employer
              that pays a share of salary for some years if an employee dies while working there, group life insurance
              through work, a union or association death benefit. Counted in the plan, each one changes the figures; every
              one prints on the guide with who to contact.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
              {benefits.map((b, i) => (
                <BenefitEditor key={b.id} b={b} names={names} pay={{ 1: inputs.salary1, 2: inputs.salary2 }}
                  onChange={(nb) => setBenefits(benefits.map((x, j) => (j === i ? nb : x)))}
                  onRemove={() => setBenefits(benefits.filter((_, j) => j !== i))} />
              ))}
            </div>
            <button type="button" className="btn-outline" data-testid="survivor-benefit-add" style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setBenefits([...benefits, { id: newId('sb'), whose: 1, kind: 'yearly', years: 10, whileWorking: true, taxed: true, counted: true }])}>
              <Plus size={14} /> Add a benefit
            </button>
          </section>

          <section data-testid="survivor-where-money">
            <h3 style={h3}>Where the money is kept</h3>
            <p style={muted}>
              So the one left knows where to look and whom to call. Firms and account names only; never write account
              numbers or passwords here. Saved in this browser and in Backup Everything, not in your plan settings.
            </p>
            {holdingCount > 0 && (
              <SwitchRow id="survivor-include-holdings" checked={includesHoldings(notes)} size="sm" style={{ margin: '8px 0' }}
                onChange={(v) => store(setSurvivorField(notes, 'includeHoldings', v))}
                hint={`Lists each firm and account name from Detailed Holdings (${holdingCount} holding${holdingCount === 1 ? '' : 's'}), with its tax type and value.`}>
                Include the accounts from Detailed Holdings
              </SwitchRow>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
              {accounts.map((a, i) => (
                <AccountEditor key={a.id} a={a}
                  onChange={(na) => setAccounts(accounts.map((x, j) => (j === i ? na : x)))}
                  onRemove={() => setAccounts(accounts.filter((_, j) => j !== i))} />
              ))}
            </div>
            <button type="button" className="btn-outline" data-testid="survivor-account-add" style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setAccounts([...accounts, { id: newId('acct'), firm: '', kind: 'bank', owner: '', note: '' }])}>
              <Plus size={14} /> Add a place money is kept
            </button>
          </section>

          <section>
            <h3 style={h3}>Opening the plan in this app</h3>
            <p style={muted}>
              The guide explains how to open the plan here and restore it from the backup file. Say where the backup is kept
              so the one left can find it (for example, &ldquo;Google Drive, folder Retirement&rdquo;). Never write a password here.
            </p>
            <BlurText id="survivor-app-notes" label="Where the backup file is kept" value={notes.appNotes || ''} multiline maxLength={1000}
              onCommit={(v) => store(setSurvivorField(notes, 'appNotes', v))} />
          </section>

          <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: 0 }}>
            The notes and the list of where money is kept stay in this browser and in Backup Everything; nothing is sent
            anywhere. The benefits are part of your plan. Educational only, not legal, tax or investment advice.
          </p>
        </>
      )}
      {printing && (
        <React.Suspense fallback={null}>
          <SurvivorGuideSheet inputs={inputs} holdings={holdings} onDone={() => setPrinting(false)} />
        </React.Suspense>
      )}
    </div>
  );
}
