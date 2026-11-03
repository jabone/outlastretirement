// Every real retirement since 1928 (changelog 335, SPENDING_RULES_SPEC.md
// phase 2). The engine runs the plan through each real stretch of market
// returns and inflation, starting the year the household retires, once per
// spending rule; this panel only reads the result (runHistoricalStarts).
//
// Free / Premium line (the owner, 2026-09-29): the survival count for the plan as
// set, and what any guardrail the user has switched ON costs in spending,
// are free -- a success count that depends on a guardrail must not hide the
// guardrail's cost behind a paywall. The comparison of every rule and the
// start-by-start table are Premium, rendered by the `historicalStarts`
// mount of the readiness module.
//
// Changelog 358: the most the plan could spend and still last through every
// start (its own SAFEMAX) is free; the same figure for 95% and 90% of
// starts is Premium.
import React, { useContext, useState } from 'react';
import SimulationContext from '../context/SimulationContext';
import { runTextbookTest } from '../utils/textbookTest';
import { runProjection } from '../calculator';
import { yearFactor } from '../utils/displayDollars';
import { Lock, History, Loader2 } from 'lucide-react';
import { RULE_LABELS, historicalHeadline, safeMaxHeadline, safeMaxMoney, safeMaxPct, SAFEMAX_CEILING } from '../utils/historicalStarts';
import PremiumMount from '../premium/PremiumMount';
import { floorPhrase } from '../utils/planVerdict';

const pct = (x) => `${Math.round(x * 100)}%`;

const linkButton = { background: 'none', border: 'none', padding: 0, color: 'var(--accent-text)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' };

// The plan's own SAFEMAX, free (changelog 358).
function SafeMaxLine({ data, guarded }) {
  const sm = safeMaxHeadline(data);
  if (!sm) return null;
  const withRule = guarded ? ', with your guardrails' : '';
  let body;
  if (sm.status === 'ok') {
    const rate = safeMaxPct(sm.spendingRate);
    const diff = sm.amount - sm.planned;
    body = (
      <>
        The most you could spend and still last through <strong>every one</strong> of those {sm.count} starts{floorPhrase(sm.floor)}:{' '}
        <strong>{safeMaxMoney(sm.amount)} a year</strong> in today&rsquo;s dollars{withRule}
        {rate ? <>, about {rate} of your portfolio when you retire</> : null}.{' '}
        {sm.limitingStart ? <>Spend more and the {sm.limitingStart} start {sm.floor > 0 ? 'falls short' : 'runs out'} first. </> : null}
        {Math.abs(diff) >= 100
          ? <>Your plan spends {safeMaxMoney(sm.planned)}, {safeMaxMoney(Math.abs(diff))} {diff > 0 ? 'less than that' : 'more than that'}.</>
          : <>That is what your plan spends now.</>}
      </>
    );
  } else if (sm.status === 'aboveCeiling') {
    body = <>Your plan lasts through every one of those starts even spending {safeMaxMoney(SAFEMAX_CEILING)} a year; we stop searching there.</>;
  } else {
    body = <>No level of lifestyle spending lasts through every one of those starts{withRule}: something other than spending, such as retiring later, would have to change.</>;
  }
  return (
    <p style={{ fontSize: 'var(--fs-body)', margin: 0 }} data-testid="historical-safemax">
      {body}
      <span style={{ display: 'block', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '4px' }}>
        This is your own version of William Bengen&rsquo;s SAFEMAX (&ldquo;safe max&rdquo;), the highest starting withdrawal
        that survived every historical retirement in his research and the source of the 4% rule. Yours is worked out after
        tax, with your Social Security, pensions, accounts, stock and bond mix and horizon, so it can sit well above or
        below the rule.
      </span>
      <span style={{ display: 'block', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '4px' }} data-testid="historical-safemax-timing">
        Checking it against FI Calc or FIRECalc? Expect this to read a few percent lower for the same plan. From 1928 the
        inflation figures are averages for each year, so each year&rsquo;s spending rises by that same year&rsquo;s
        inflation; those calculators raise it by the year before&rsquo;s. Both are fair readings of the record. This
        plan also pays tax, Medicare and fees, which they leave out.
      </span>
    </p>
  );
}

// The textbook test (DIY-planner review, finding 5): the plan's balance and
// spending at retirement through the same starts with nothing else -- no
// taxes, Social Security, Medicare or fees -- the way FI Calc and the 4%
// rule research run it. Free, like the plan's own count. Computed on click
// (a few thousand simple steps), from the plan's first retired year.
function TextbookTest({ data }) {
  const sim = useContext(SimulationContext);
  const [result, setResult] = useState(null);
  if (!sim || !sim.inputs || !data || !data.horizonYears) return null;
  const inputs = sim.inputs;
  // The plan itself, not whatever stress scenario is on the chart: its
  // invested balance at the start of the first retired year, and its
  // lifestyle spending (the figure the most-you-could-spend line uses),
  // both in today's dollars.
  const run = () => {
    const years = runProjection({ ...inputs, stressType: 'none' }).years || [];
    const first = years.find((y) => y.isRetired);
    if (!first) return { none: true };
    const f = yearFactor(first) || 1;
    const balance = ((first.preTaxStart || 0) + (first.rothStart || 0) + (first.taxableStart || 0) + (first.hsaStart || 0)) / f;
    const spending = Math.max(0, Number(inputs.lifestyleExpense) || 0);
    const r = runTextbookTest({
      balance,
      spending,
      years: data.horizonYears,
      firstYear: data.firstStart,
      stockShare: data.stockShare,
      glideEnabled: !!data.glide,
      glideRate: inputs.glideAllocationRate,
      glideFloor: inputs.glideAllocationFloor,
    });
    return r ? { ...r, balance, spending } : { none: true };
  };
  const money = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
  const pctRate = (r) => `${(Math.round(r * 1000) / 10).toFixed(1)}%`;
  const fixed = (data.rules || []).find((r) => r.key === 'fixed');
  if (!result) {
    return (
      <div>
        <button type="button" className="btn-outline" style={{ padding: '4px 10px', fontSize: 'var(--fs-xs)' }} onClick={() => setResult(run())}>
          Compare with the textbook test
        </button>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginLeft: '8px' }}>
          Your balance and spending with nothing else, the way FI Calc and the 4% rule run it.
        </span>
      </div>
    );
  }
  if (result.none) return null;
  return (
    <div data-testid="textbook-test" style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
      <p style={{ fontSize: 'var(--fs-body)', margin: 0 }}>
        <strong>The textbook test:</strong> {money(result.balance)} when you retire, spending {money(result.spending)} a year
        ({pctRate(result.rate)} of it) rising with inflation, for {data.horizonYears} years at {Math.round(data.stockShare)}% stocks
        {data.glide ? ', moving toward bonds as your plan does' : ''}. It lasts in <strong>{result.lasted} of {result.count}</strong> starts
        since {result.firstStart}{fixed ? <>; your plan, as set, lasts in {fixed.lasted}</> : null}. The most it could spend and
        last through every start: <strong>{money(result.safeMax)} a year</strong>, {pctRate(result.safeMaxRate)} of the balance.
      </p>
      {result.failed.length > 0 && (
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
          Runs out starting in {result.failed.map((x) => x.start).join(', ')}.
        </p>
      )}
      <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
        No taxes, Social Security, pensions, Medicare or fees; spending is taken at the start of each year and raised by
        the previous year&rsquo;s inflation, as FI Calc and FIRECalc do, so the same inputs there should land close (their
        bond data differ a little). The spending is your plan&rsquo;s lifestyle spending in today&rsquo;s dollars, as in the most-you-could-spend line above. The gap with
        your plan&rsquo;s own count is what taxes, benefits and costs do to it.
      </p>
      <button type="button" style={{ ...linkButton, fontSize: 'var(--fs-xs)', marginTop: '6px' }} onClick={() => setResult(null)}>Hide</button>
    </div>
  );
}

// Changelog 336: any start can be replayed as the 'history' stress scenario
// (onReplay), which puts that whole retirement on the stress chart above.
// Changelog 449: `historyFrom` is the plan's choice of record, 1928 or 1871,
// and `onHistoryFrom` changes it. The years before 1928 are Robert
// Shiller's, and say so wherever they are in use.
// Changelog 450: `onReplayInLedger` replays a start and opens Year by Year,
// where the ledger (and its CSV) is that start, year by year.
export default function HistoricalStartsPanel({ data, loading, onOpenPremium, onReplay = null, replayingStart = null, historyFrom = 1928, onHistoryFrom = null, onReplayInLedger = null, csvPreamble = null }) {
  const from = data && data.firstStart ? data.firstStart : historyFrom;
  const head = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
      <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
        <History size={18} style={{ color: 'var(--accent-text)' }} />
        <span>Every retirement since {from}</span>
      </h3>
      {onHistoryFrom && (
        <label style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          Market record from
          <select
            className="form-input form-input-select"
            aria-label="Market record from"
            value={historyFrom}
            onChange={(e) => onHistoryFrom(Number(e.target.value))}
            style={{ margin: 0, width: 'auto' }}
          >
            <option value={1928}>1928</option>
            <option value={1871}>1871</option>
          </select>
        </label>
      )}
    </div>
  );
  const credit = from < 1928 ? (
    <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: 0 }} data-testid="shiller-credit">
      Stock, bond and inflation history before 1928: Robert J. Shiller, Yale University (the data behind{' '}
      <em>Irrational Exuberance</em>). From 1928: Aswath Damodaran, NYU Stern, and the Federal Reserve Bank of
      Minneapolis. Bond returns before 1928 are rebuilt from yields, and price records before 1913 are less complete,
      so the early starts are a rougher guide than the later ones.
    </p>
  ) : null;
  if (!data) {
    return (
      <div className="glass-panel" style={{ padding: '24px' }} data-testid="historical-starts">
        {head}
        <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {loading ? <><Loader2 className="animate-spin" size={14} /> Running your plan through every start year&hellip;</> : 'Your plan has no retirement years to test.'}
        </p>
      </div>
    );
  }
  if (!data.count) {
    return (
      <div className="glass-panel" style={{ padding: '24px' }} data-testid="historical-starts">
        {head}
        <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginTop: '8px' }}>
          Your retirement runs {data.horizonYears} years, longer than any stretch of market history on record, so there is
          no real start year to test it against.
        </p>
      </div>
    );
  }
  const h = historicalHeadline(data);
  const mine = h.rule;
  const guarded = mine.key !== 'fixed';
  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }} data-testid="historical-starts">
      {head}
      <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', margin: 0 }}>
        Your plan run through each real {data.horizonYears}-year stretch of stock and bond returns and inflation since{' '}
        {data.firstStart}, starting the year you retire. These are real sequences, not averages: the scenarios above
        replay a few crash years, while this replays whole retirements.
      </p>
      {Number.isFinite(data.stockShare) && (
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: 0 }} data-testid="historical-mix">
          Tested at {Math.round(data.stockShare)}% stocks and {100 - Math.round(data.stockShare)}% bonds, rebalanced each
          year{data.glide ? ', moving toward bonds as your glide sets' : ''}: the S&amp;P 500 and the 10-year Treasury. Each
          year earns what that mix earned then, so your average-return setting plays no part here. The mix is the Retired
          stock allocation under Plan &rarr; Assumptions &amp; Risk, in Your Stock and Bond Mix, and applies here even if
          you set your own average return.
        </p>
      )}
      <p style={{ fontSize: 'var(--fs-body)', margin: 0 }} data-testid="historical-headline">
        Your plan lasted in <strong>{h.lasted} of {h.count}</strong> real retirements{floorPhrase(h.floor)}.{' '}
        {h.worstFloorBreachYear && (!h.worstRunsOutYear || h.worstFloorBreachYear < h.worstRunsOutYear)
          ? <>The hardest start was <strong>{h.worstStart}</strong>, which dips below {safeMaxMoney(h.floor)} in {h.worstFloorBreachYear}.</>
          : h.worstRunsOutYear
            ? <>The hardest start was <strong>{h.worstStart}</strong>, which runs out in {h.worstRunsOutYear}.</>
            : <>The hardest start was <strong>{h.worstStart}</strong>, which leaves the least behind.</>}
        {onReplay && (
          <>
            {' '}
            {replayingStart === h.worstStart
              ? <span style={{ color: 'var(--text-secondary)' }}>It is on the chart above.</span>
              : <button type="button" style={linkButton} onClick={() => onReplay(h.worstStart)}>Replay it on the chart</button>}
          </>
        )}
        {onReplayInLedger && (
          <>
            {' '}
            <button type="button" style={linkButton} onClick={() => onReplayInLedger(h.worstStart)}>Check it year by year</button>
          </>
        )}
      </p>
      {guarded && (
        <p style={{ fontSize: 'var(--fs-body)', margin: 0 }} data-testid="historical-cost">
          What your {RULE_LABELS[mine.key].toLowerCase()} cost: across those starts, spending fell as far as{' '}
          <strong>{pct(mine.deepestCut)} below</strong> fixed spending ({mine.deepestCutStart} start), and a typical
          retirement spent <strong>{pct(mine.medianLifetimeShare)}</strong> of what fixed spending would have.
          {mine.essentialsTouchedStarts === 0 && ' Spending you marked essential was never touched.'}
          {mine.essentialsTouchedStarts > 0 && ` In ${mine.essentialsTouchedStarts} of those starts it dipped into spending you marked essential.`}
        </p>
      )}
      <SafeMaxLine data={data} guarded={guarded && data.safeMax?.rule !== 'fixed'} />
      {mine.key === 'risk' && data.safeMax && (
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: 0 }}>
          That figure holds your spending fixed. With risk-based guardrails on, your spending is set each year from the
          chance of lasting instead, so there is no single most-you-could-spend under them.
        </p>
      )}
      <TextbookTest data={data} />
      {credit}
      <PremiumMount
        id="historicalStarts"
        data={data}
        csvPreamble={csvPreamble}
        onReplay={onReplay}
        replayingStart={replayingStart}
        locked={(
          <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px dashed var(--card-border)', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <Lock size={14} style={{ marginTop: '2px', flexShrink: 0, color: 'var(--text-muted)' }} />
            <div>
              <div style={{ fontSize: 'var(--fs-sm)' }}>
                Every spending rule side by side over the same {data.count} starts &mdash; how often each lasts, its deepest cut,
                and what it spends over a lifetime &mdash; the most you could spend and last in 95% or 90% of them, how your plan
                does with 40% to 80% in stocks, and every start year, one row each.
              </div>
              <button type="button" className="btn-outline" style={{ marginTop: '8px', padding: '4px 10px', fontSize: 'var(--fs-xs)' }} onClick={onOpenPremium}>
                Part of Premium &mdash; see what it includes
              </button>
            </div>
          </div>
        )}
      />
    </div>
  );
}
