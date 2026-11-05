// The Survivor's Guide on paper (What's New 492): one guide for each spouse,
// each the plan as the other would carry it on if this spouse died this
// year. Written for a reader who may be new to the household's money, in
// the order a grieving reader needs it: the planner's own note, the first
// steps by when they are due, then what the plan intends, the money that
// keeps coming in, the savings, blanks for where things are, how to run the
// plan each year in dollars (a table whose rows add up), and the words it
// uses.
//
// Mounted only when the guide is printed: it builds both guides, opens the
// print dialog itself (utils/printSection, "survivor") and calls onDone when
// the dialog closes, like the spending review sheet.
import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import PrintFrame from './PrintFrame';
import { printSection } from '../utils/printSection';
import { whenImagesReady } from '../utils/imagesReady';
import { buildSurvivorGuides, holdingsAccounts } from '../utils/survivorGuide';
import { readSurvivorNotes, noteFrom, includesHoldings, ACCOUNT_KINDS } from '../utils/survivorNotes';
import { firstSteps, WHERE_THINGS_ARE, yearlyRoutine, GLOSSARY, SURVIVOR_GUIDE_NOTE, openingTheApp } from '../config/survivorGuideContent';
import { computeMarketValue, TAX_TREATMENTS } from '../utils/holdingsCore';
import { getFreshnessState } from '../utils/dataFreshness';
import { BRAND_DOMAIN } from '../config/branding';

const money = (n) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString('en-US')}` : '—');
const cellMoney = (n) => (Number.isFinite(n) && Math.abs(n) >= 0.5 ? money(n) : '');
const Box = () => <span className="review-box" aria-hidden="true" />;
const Lines = ({ n = 2 }) => (
  <div className="packet-write-lines" aria-hidden="true">{Array.from({ length: n }, (_, i) => <span key={i} />)}</div>
);

const RULE_WORDS = { cut: 'cut by the rule', raise: 'raised by the rule' };

function PlanInBrief({ g }) {
  const { survivor: s } = g.names;
  const sp = g.spending;
  const o = g.outcome;
  const first = g.rows[0];
  const needs = first ? first.lifestyle + first.health + first.taxes + first.oneTime : 0;
  return (
    <section className="packet-group">
      <h2>The plan in brief</h2>
      {sp.workingAtFirst && (
        <p>
          While {s} works, {sp.autoWhileWorking
            ? <>the plan spends what is left of pay after taxes and savings, about {money(sp.firstYear)} in {g.firstYear}; check that against your real bills.</>
            : <>the plan spends the amount set for your working years, about {money(sp.firstYear)} in {g.firstYear}.</>}
        </p>
      )}
      {Number.isFinite(sp.after) && (
        <p>
          {sp.workingAtFirst ? <>Once {s} retires, in {sp.year}, the</> : <>From {sp.year}, the</>} plan spends
          about <strong>{money(sp.after)}</strong> a year on everyday living
          {Number.isFinite(sp.before) && sp.before > 0.5 ? <> (the plan for both of you would spend about {money(sp.before)} that year; it assumes {sp.keepsHousing ? 'spending other than housing' : 'spending'} falls {sp.dropPct}% for one person)</> : sp.dropPct > 0 ? <> (the plan assumes {sp.keepsHousing ? 'spending other than housing' : 'spending'} falls {sp.dropPct}% for one person)</> : null},
          with healthcare and taxes on top.
          {sp.raises && sp.peak > sp.after * 1.05 ? <> With average returns the spending rule raises it, to about {money(sp.peak)} by {sp.peakAge}.</> : null}
        </p>
      )}
      <p>
        {first && first.income > needs
          ? <>In {g.firstYear} income covers the year&rsquo;s spending, healthcare and taxes.</>
          : first && first.income > 0.5
            ? <>In {g.firstYear} Social Security, pensions and work bring in about {money(first.income)}; the rest comes from savings.</>
            : <>No income arrives in {g.firstYear}, so the year&rsquo;s money comes from savings.</>}
        {' '}
        {o.lasts && !o.nearlyEmpty
          ? <>With average returns every year, the savings last to the end of the plan, at {o.endAge}, with about {money(o.endBalance)} left.</>
          : o.lasts
            ? <>With average returns every year, the savings about run out at {o.endAge}, the end of the plan. The plan should be looked at again with a planner.</>
            : <>With average returns every year, the savings run short at {o.shortAge}, in {o.shortYear}. The plan should be looked at again, with {s}&rsquo;s spending and Social Security start age in mind; a planner can help.</>}
        {' '}Markets will not be average: the spending rule below, and printing this guide again each year, are how the plan stays on course.
      </p>
      {!g.flags.ltcPlanned && <p>This plan sets nothing aside for long-term care. Living alone, you would likely pay for any care yourself; a planner can help you weigh that.</p>}
      <RuleText g={g} />
    </section>
  );
}

function RuleText({ g }) {
  const r = g.rule;
  if (r.kind === 'risk') {
    return (
      <div data-testid="survivor-guide-rule">
        <p>
          <strong>The spending rule.</strong> The plan uses risk-based guardrails: each January it checks the chance of
          lasting (see Words at the end) and changes spending only when that chance leaves a band, {r.cutAtPct}% to {r.raiseAtPct}%.
          {g.ruleYear && g.ruleYear !== g.firstYear ? <> It starts when {g.names.survivor} retires, in {g.ruleYear} at {g.ruleAge}; the figures below are for that year.</> : null}
          {Number.isFinite(r.chance) ? <> In {r.year} the chance is about {Math.round(r.chance * 100)}%.</> : null}
          {r.action === 'cut' ? <> Because it starts below {r.cutAtPct}%, spending starts lower that year, at about {money(r.spend)}.</> : null}
          {Number.isFinite(r.chance) && r.chance * 100 >= r.raiseAtPct && !Number.isFinite(r.raiseAt) ? <> That is above the band, but the plan waits until the fifth retired year before allowing a raise.</> : null}
        </p>
        <ul>
          {Number.isFinite(r.cutBelow) && r.cutBelow > 0.5
            ? <li>If savings start a year below about <strong>{money(r.cutBelow)}</strong>, cut everyday spending to about {money(r.spendIfCut)} a year. Cut travel, gifts and extras first; housing, food, health and insurance come first.</li>
            : <li>In {r.year} no balance would make the plan cut spending.</li>}
          {Number.isFinite(r.raiseAt)
            ? <li>If savings reach about <strong>{money(r.raiseAt)}</strong>, you may raise it to about {money(r.spendIfRaised)} a year.</li>
            : <li>Raises are allowed from the fifth retired year; the table marks the years the plan raises spending.</li>}
          <li>Between those, keep spending the same, rising with inflation. The lines move each year with age and spending; the app&rsquo;s Year by Year shows each year&rsquo;s, and printing this guide again updates them.</li>
        </ul>
      </div>
    );
  }
  if (r.kind === 'withdrawal') {
    return <p data-testid="survivor-guide-rule"><strong>The spending rule.</strong> The plan lowers everyday spending when the year&rsquo;s withdrawals run {r.bandPct}% above what it expected, and raises it when they run as far below.</p>;
  }
  if (r.kind === 'spending') {
    return <p data-testid="survivor-guide-rule"><strong>The spending rule.</strong> After a year when the savings lose money, skip that year&rsquo;s inflation increase in spending. A loss in the very first year of retirement cuts spending 10% for good.</p>;
  }
  return <p data-testid="survivor-guide-rule"><strong>The spending rule.</strong> The plan keeps spending the same each year, rising with inflation, whatever markets do. If savings fall well below the table&rsquo;s figures, spend less until they recover, starting with travel, gifts and extras.</p>;
}

const CHANGE_WORDS = { starts: 'starts', rises: 'rises', stops: 'stops' };

function MoneyComingIn({ g }) {
  const { before, after, lifeInsurance, lifeInsuranceReal, changes } = g.income;
  const rows = [
    ['Social Security', before.socialSecurity, after.socialSecurity],
    ['Pensions', before.pension, after.pension],
    ['Other survivor benefits', before.benefit, after.benefit],
    ['Work', before.work, after.work],
    ['Rent, annuities and other income', before.other, after.other],
  ].filter(([, a, b]) => a > 0.5 || b > 0.5);
  return (
    <section className="packet-group">
      <h2>Money coming in <span>a year, {g.firstYear}</span></h2>
      {rows.length > 0 ? (
        <table className="packet-table">
          <thead><tr><th>Source</th><th className="num">Both of you</th><th className="num">{g.names.survivor} alone</th></tr></thead>
          <tbody>
            {rows.map(([label, a, b]) => <tr key={label}><td>{label}</td><td className="num">{money(a)}</td><td className="num">{money(b)}</td></tr>)}
          </tbody>
        </table>
      ) : <p>No Social Security, pension or work income arrives in {g.firstYear}; see below for when it starts.</p>}
      {changes.length > 0 && (
        <>
          <p style={{ marginBottom: 0 }}>Later:</p>
          <ul data-testid="survivor-guide-later">
            {changes.map((c, i) => (
              <li key={`${c.kind}-${c.year}-${i}`}>
                {c.change === 'stops'
                  ? <>{c.label} stops in {c.year}, at {c.age}.</>
                  : <>{c.label} {CHANGE_WORDS[c.change]} in {c.year}, at {c.age}, to about {money(c.amount)} a year.</>}
              </li>
            ))}
          </ul>
        </>
      )}
      {g.rows.some((r) => r.benefitLump > 0.5) && <p>Once: about {money(g.rows.reduce((a, r) => a + r.benefitLump, 0))} from the other survivor benefits listed in the first steps, added to savings.</p>}
      {lifeInsurance > 0.5 && <p>Once: the life insurance, {money(lifeInsurance)} (the policy&rsquo;s own amount; about {money(lifeInsuranceReal)} in today&rsquo;s dollars), added to savings.</p>}
      <p className="packet-muted">Social Security pays you the larger of your own benefit and the survivor benefit, not both added together; the first steps explain how to start one and switch to the other.</p>
    </section>
  );
}

function Savings({ g }) {
  const a = g.accounts;
  const rows = [
    ['Pre-Tax', a.preTax, 'Traditional IRA and 401(k): taxed when taken out.'],
    ['Roth', a.roth, 'Usually tax-free when taken out.'],
    ['Taxable', a.taxable, 'Bank and brokerage accounts.'],
    ['HSA', a.hsa, 'Tax-free for medical costs.'],
    ['Company stock', a.companyStock, 'Sold over time to pay part of the spending.'],
    ['Deferred pay', a.deferredComp, 'Paid out on the plan’s schedule, taxed as income.'],
    ['Cash reserve', a.cash, 'Kept aside for bills and bad years; not counted in savings.'],
  ].filter(([, v]) => v > 0.5);
  if (!rows.length) return null;
  return (
    <section className="packet-group">
      <h2>Your savings <span>at the start of {g.firstYear}</span></h2>
      <table className="packet-table">
        <tbody>
          {rows.map(([label, v, what]) => <tr key={label}><td><strong>{label}</strong><div className="packet-muted">{what}</div></td><td className="num">{money(v)}</td></tr>)}
        </tbody>
      </table>
      <p className="packet-muted">&ldquo;Savings&rdquo; in this guide means the Pre-Tax, Roth, Taxable and HSA accounts together, not the house or the cash reserve.</p>
    </section>
  );
}

function FirstSteps({ g }) {
  return (
    <section className="packet-group">
      <h2>First steps <span>tick each when done</span></h2>
      {firstSteps(g).map((group) => (
        <div key={group.id} className="survivor-step-group">
          <h3 className="survivor-step-title">{group.title}</h3>
          <table className="packet-table">
            <tbody>
              {group.items.map((it) => (
                <tr key={it.id} data-testid={`survivor-step-${it.id}`}>
                  <td className="review-check"><Box /></td>
                  <td><strong>{it.title}</strong><div className="packet-muted">{it.detail}</div></td>
                  <td className="packet-date" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

const KIND_LABEL = Object.fromEntries(ACCOUNT_KINDS);
const TAX_LABEL = Object.fromEntries(TAX_TREATMENTS.map((t) => [t.value, t.label]));

// Where the money is kept (What's New 493): the household's own list, and
// the accounts in Detailed Holdings unless switched off. Names and firms,
// never numbers, so the survivor knows where to look and whom to call.
function WhereMoneyIsKept({ notes, holdings }) {
  const own = (notes.accounts || []).filter((a) => a.firm.trim() || a.note.trim() || a.owner.trim());
  const fromHoldings = includesHoldings(notes)
    ? holdingsAccounts(holdings, { computeMarketValue, taxLabel: (t) => TAX_LABEL[t] || t })
    : [];
  if (!own.length && !fromHoldings.length) return null;
  return (
    <section className="packet-group" data-testid="survivor-guide-where-money">
      <h2>Where the money is kept <span>names, never account numbers</span></h2>
      {own.length > 0 && (
        <table className="packet-table">
          <thead><tr><th>Firm</th><th>What it is</th><th>In whose name</th><th>Notes</th></tr></thead>
          <tbody>
            {own.map((a) => <tr key={a.id}><td><strong>{a.firm}</strong></td><td>{KIND_LABEL[a.kind] || ''}</td><td>{a.owner}</td><td className="packet-answer" style={{ margin: 0 }}>{a.note}</td></tr>)}
          </tbody>
        </table>
      )}
      {fromHoldings.length > 0 && (
        <>
          <p className="packet-muted" style={{ marginTop: own.length ? '6pt' : 0 }}>From the app&rsquo;s Detailed Holdings, valued at the latest prices it had:</p>
          <table className="packet-table">
            <thead><tr><th>Firm</th><th>Account</th><th>Tax type</th><th className="num">Value</th></tr></thead>
            <tbody>
              {fromHoldings.map((a, i) => <tr key={i}><td>{a.firm || '\u2014'}</td><td>{a.account || '\u2014'}</td><td>{a.tax}</td><td className="num">{money(a.value)}</td></tr>)}
            </tbody>
          </table>
        </>
      )}
      <p className="packet-muted">Mail, email and tax forms (1099s and 5498s each January) also show where accounts are; a firm you have not heard of on a tax form is worth a call.</p>
    </section>
  );
}

function OpeningTheApp({ notes, lastBackupAt }) {
  const o = openingTheApp({ lastBackupAt, appNotes: notes.appNotes, domain: BRAND_DOMAIN });
  return (
    <section className="packet-group" data-testid="survivor-guide-open-app">
      <h2>Opening the plan in the app</h2>
      <ul>{o.steps.map((t, i) => <li key={i}>{t}</li>)}</ul>
      <p>{o.last}</p>
      {o.notes ? <p className="packet-answer"><strong>Where the backup is kept:</strong> {o.notes}</p> : <><p className="packet-muted" style={{ marginBottom: 0 }}>Where the backup file is kept:</p><Lines n={2} /></>}
    </section>
  );
}

function WhereThingsAre() {
  return (
    <section className="packet-group">
      <h2>Where things are <span>write these in by hand</span></h2>
      <p className="packet-muted">The app never stores account numbers or passwords, so write the details here and keep this page somewhere safe.</p>
      <table className="packet-table">
        <tbody>
          {WHERE_THINGS_ARE.map((w) => (
            <tr key={w.id}><td style={{ width: '38%' }}>{w.label}</td><td>{w.prefill ? <span>{w.prefill}</span> : <Lines n={w.lines || 1} />}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// Where a year's money comes from, one line per source, so a row adds up:
// spending + healthcare + one-time costs + taxes + money put in the cash
// reserve = income + these.
function sources(r) {
  const out = [];
  if (r.fromPreTax > 0.5) out.push(`Pre-Tax ${money(r.fromPreTax)}${r.rmd > 0.5 ? (r.rmd >= r.fromPreTax - 0.5 ? ' (all required)' : ` (${money(r.rmd)} required)`) : ''}`);
  if (r.fromRoth > 0.5) out.push(`Roth ${money(r.fromRoth)}`);
  if (r.fromTaxable > 0.5) out.push(`Taxable ${money(r.fromTaxable)}`);
  if (r.fromStock > 0.5) out.push(`Company stock ${money(r.fromStock)}`);
  if (r.fromHsa > 0.5) out.push(`HSA ${money(r.fromHsa)}`);
  if (r.fromCash > 0.5) out.push(`Cash reserve ${money(r.fromCash)}`);
  return out;
}

function YearTable({ g }) {
  const survivor = g.names.survivor;
  return (
    <section className="packet-group">
      <h2>Running the plan each year</h2>
      <ul>{yearlyRoutine(g).map((t, i) => <li key={i}>{t}</li>)}</ul>
      <table className="packet-table survivor-years" data-testid="survivor-guide-years">
        <thead>
          <tr>
            <th>Year</th><th className="num">{survivor}&rsquo;s age</th><th className="num">Everyday spending</th><th className="num">Healthcare</th>
            <th className="num">One-time costs</th><th className="num">Taxes</th><th className="num">Social Security, pensions, work and benefits</th>
            <th>Take from savings</th><th className="num">Roth conversion</th><th className="num">Savings at year end</th>
          </tr>
        </thead>
        <tbody>
          {g.rows.map((r) => (
            <tr key={r.year}>
              <td>{r.year}</td>
              <td className="num">{r.age}</td>
              <td className="num">{money(r.lifestyle)}{r.ruleAction && RULE_WORDS[r.ruleAction] ? <div className="packet-muted">{RULE_WORDS[r.ruleAction]}</div> : null}</td>
              <td className="num">{cellMoney(r.health)}</td>
              <td className="num">{cellMoney(r.oneTime)}</td>
              <td className="num">{cellMoney(r.taxes)}</td>
              <td className="num">{cellMoney(r.income)}{r.lifeInsurance > 0.5 ? <div className="packet-muted">+{money(r.lifeInsurance)} insurance, to savings</div> : null}{r.benefitLump > 0.5 ? <div className="packet-muted">+{money(r.benefitLump)} benefit, to savings</div> : null}</td>
              <td>
                {sources(r).map((t) => <div key={t}>{t}</div>)}
                {r.toCashReserve > 0.5 ? <div className="packet-muted">{money(r.toCashReserve)} of it into the cash reserve</div> : null}
              </td>
              <td className="num">{cellMoney(r.conversion)}</td>
              <td className="num">{r.shortfall > 0.5 ? <>short {money(r.shortfall)}</> : money(r.savingsEnd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="packet-muted">
        Today&rsquo;s dollars, average returns every year. Each row adds up: spending, healthcare, one-time costs, taxes and
        any money put in the cash reserve are paid by income and the money taken from savings (dividends kept in cash
        cover a little more). Taxes are federal and state income tax plus the Social Security and Medicare tax on wages,
        which comes out of pay; any early-withdrawal penalty is included. &ldquo;Required&rdquo; is the RMD, part of what is taken from
        Pre-Tax. A Roth conversion moves money from Pre-Tax to Roth; it is not spent, but its tax is in the Taxes column.
        &ldquo;Cut&rdquo; or &ldquo;raised&rdquo; means the spending rule changed spending that year. A blank is nothing that year.
      </p>
    </section>
  );
}

function Glossary() {
  return (
    <section className="packet-group survivor-glossary">
      <h2>Words used in this guide</h2>
      <table className="packet-table">
        <tbody>{GLOSSARY.map((w) => <tr key={w.term}><td style={{ width: '22%' }}><strong>{w.term}</strong></td><td>{w.text}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

export function SurvivorGuidePage({ guide: g, note, notes = {}, holdings = [], lastBackupAt = null }) {
  const { deceased: d, survivor: s } = g.names;
  return (
    <div className="packet-page" data-testid={`survivor-guide-${g.deceased}`}>
      <h1>If {d} dies first: {s}&rsquo;s guide</h1>
      <p className="review-lede">
        This is the plan as {s} would carry it on if {d} died this year, {g.deathYear}, so that {s} is on their own
        from {g.firstYear}. Every dollar is in {g.deathYear} dollars. Keep it with the will and print it again each year;
        if you are reading it after {g.firstYear}, the figures are out of date, so update the balances in the app and print
        it again, or ask the person you trust to.
      </p>
      <p className="review-lede">
        In the first weeks, start with the first steps. Once things settle, read the plan in brief and how to run the plan
        each year. Words like Pre-Tax and RMD are explained at the end.
      </p>
      <section className="packet-group">
        <h2>A note from {d}{note?.updatedAt ? <span>written {note.updatedAt}</span> : null}</h2>
        {note?.text ? <p className="packet-answer">{note.text}</p> : <Lines n={5} />}
      </section>
      <FirstSteps g={g} />
      <PlanInBrief g={g} />
      <MoneyComingIn g={g} />
      <Savings g={g} />
      <WhereMoneyIsKept notes={notes} holdings={holdings} />
      <WhereThingsAre />
      <OpeningTheApp notes={notes} lastBackupAt={lastBackupAt} />
      <YearTable g={g} />
      <Glossary />
      <p className="review-footer">{SURVIVOR_GUIDE_NOTE}</p>
    </div>
  );
}

// The first weeks (What's New 496): one page per spouse for the days right
// after a death, beside the full guide -- the note, the steps that cannot
// wait in one line each, the calls to make, and that money is not urgent.
const FIRST_CALLS = ['insurance', 'employer', 'pension', 'banks', 'tax', 'attorney', 'helper'];
export function SurvivorFirstWeeksPage({ guide: g, note }) {
  const { deceased: d, survivor: s } = g.names;
  const groups = firstSteps(g).filter((grp) => grp.id !== 'year');
  const steps = groups.flatMap((grp) => grp.items).filter((it) => it.short);
  const first = g.rows[0] || null;
  const o = g.outcome;
  const calls = WHERE_THINGS_ARE.filter((w) => FIRST_CALLS.includes(w.id));
  return (
    <div className="packet-page survivor-first-weeks" data-testid={`survivor-weeks-${g.deceased}`}>
      <h1>The first weeks, if {d} dies</h1>
      <p className="review-lede">
        For {s}. Do these first; nothing else about money has to happen yet. The full Survivor&rsquo;s Guide has the rest:
        how to run the plan each year, where the money is kept, and the words it uses.
      </p>
      {note?.text && (
        <section className="packet-group">
          <h2>A note from {d}</h2>
          <p className="packet-answer">{note.text}</p>
        </section>
      )}
      <section className="packet-group">
        <h2>First steps <span>tick each when done</span></h2>
        <table className="packet-table">
          <tbody>
            {steps.map((it) => (
              <tr key={it.id} data-testid={`survivor-weeks-step-${it.id}`}>
                <td className="review-check"><Box /></td>
                <td><strong>{it.title}</strong><div>{it.short}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="packet-group">
        <h2>Who to call</h2>
        <table className="packet-table">
          <tbody>
            <tr><td style={{ width: '38%' }}>Social Security</td><td>1-800-772-1213, ssa.gov</td></tr>
            {calls.map((w) => <tr key={w.id}><td style={{ width: '38%' }}>{w.label}</td><td><Lines n={1} /></td></tr>)}
          </tbody>
        </table>
      </section>
      <section className="packet-group">
        <h2>Money for now</h2>
        <p>
          {first && first.income > 0.5
            ? <>In {g.firstYear} about {money(first.income)} keeps coming in (Social Security, pensions, work and benefits).</>
            : <>No regular income arrives in {g.firstYear}; the year&rsquo;s money comes from savings, as the plan expects.</>}
          {g.flags.cashReserve ? <> The cash reserve, about {money(g.accounts.cash)}, is for bills while you settle things.</> : null}
          {g.income.lifeInsurance > 0.5 ? <> The life insurance, {money(g.income.lifeInsurance)}, can sit in a savings account until you are ready.</> : null}
          {' '}{o.lasts && !o.nearlyEmpty
            ? <>With average returns the plan lasts to {o.endAge}: there is time.</>
            : <>The plan needs another look within the year; a planner can help.</>}
        </p>
      </section>
      <p className="review-footer">{SURVIVOR_GUIDE_NOTE}</p>
    </div>
  );
}

export function SurvivorFirstWeeksContent({ inputs, notes = readSurvivorNotes() }) {
  const guides = useMemo(() => {
    try { return buildSurvivorGuides(inputs).filter((g) => g.status === 'ok'); } catch { return []; }
  }, [inputs]);
  if (!guides.length) return <div className="packet-page"><p>The first-weeks page needs a plan for two people who are both alive this year.</p></div>;
  return <>{guides.map((g) => <SurvivorFirstWeeksPage key={g.deceased} guide={g} note={noteFrom(notes, g.deceased)} />)}</>;
}

export function SurvivorGuideContent({ inputs, notes = readSurvivorNotes(), holdings = [], lastBackupAt = getFreshnessState().lastBackupAt }) {
  const results = useMemo(() => {
    try { return buildSurvivorGuides(inputs); } catch { return []; }
  }, [inputs]);
  const guides = results.filter((g) => g.status === 'ok');
  const skipped = results.filter((g) => g.status === 'no-years' && g.names);
  if (!guides.length) {
    return <div className="packet-page"><p>The Survivor&rsquo;s Guide needs a plan for two people who are both alive this year and whose plan runs past this year.</p></div>;
  }
  return (
    <>
      {guides.map((g) => <SurvivorGuidePage key={g.deceased} guide={g} note={noteFrom(notes, g.deceased)} notes={notes} holdings={holdings} lastBackupAt={lastBackupAt} />)}
      {skipped.map((g) => (
        <div key={`skip-${g.names.deceased}`} className="packet-page"><p>No guide for {g.names.survivor} on their own: the plan ends for {g.names.survivor} this year too. Raise {g.names.survivor}&rsquo;s life expectancy under Plan, Household to print one.</p></div>
      ))}
    </>
  );
}

export default function SurvivorGuideSheet({ inputs, holdings = [], onDone = () => {}, print, weeks = false }) {
  useEffect(() => {
    let canceled = false;
    const id = requestAnimationFrame(() => {
      whenImagesReady(document.querySelector('.section-print[data-section="survivor"]')).then(() => {
        if (!canceled) printSection('survivor', { onDone, ...(print ? { print } : {}) });
      });
    });
    return () => { canceled = true; cancelAnimationFrame(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="section-print" data-section="survivor" data-testid="survivor-guide-sheet">
      <PrintFrame title={weeks ? 'The First Weeks' : 'Survivor\u2019s Guide'} note={'Dollar figures in today\u2019s dollars'}>
        {weeks ? <SurvivorFirstWeeksContent inputs={inputs} /> : <SurvivorGuideContent inputs={inputs} holdings={holdings} />}
      </PrintFrame>
    </div>,
    document.body,
  );
}
