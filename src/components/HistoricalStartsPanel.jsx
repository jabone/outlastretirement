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
import React from 'react';
import { Lock, History, Loader2 } from 'lucide-react';
import { RULE_LABELS, historicalHeadline, safeMaxHeadline, safeMaxMoney, safeMaxPct, SAFEMAX_CEILING } from '../utils/historicalStarts';
import PremiumMount from '../premium/PremiumMount';

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
        The most you could spend and still last through <strong>every one</strong> of those {sm.count} starts:{' '}
        <strong>{safeMaxMoney(sm.amount)} a year</strong> in today&rsquo;s dollars{withRule}
        {rate ? <>, about {rate} of your portfolio when you retire</> : null}.{' '}
        {sm.limitingStart ? <>Spend more and the {sm.limitingStart} start runs out first. </> : null}
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
    </p>
  );
}

// Changelog 336: any start can be replayed as the 'history' stress scenario
// (onReplay), which puts that whole retirement on the stress chart above.
export default function HistoricalStartsPanel({ data, loading, onOpenPremium, onReplay = null, replayingStart = null }) {
  const head = (
    <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
      <History size={18} style={{ color: 'var(--accent-text)' }} />
      <span>Every retirement since 1928</span>
    </h3>
  );
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
      <p style={{ fontSize: 'var(--fs-body)', margin: 0 }} data-testid="historical-headline">
        Your plan lasted in <strong>{h.lasted} of {h.count}</strong> real retirements.{' '}
        {h.worstRunsOutYear
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
      <SafeMaxLine data={data} guarded={guarded} />
      <PremiumMount
        id="historicalStarts"
        data={data}
        onReplay={onReplay}
        replayingStart={replayingStart}
        locked={(
          <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px dashed var(--card-border)', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <Lock size={14} style={{ marginTop: '2px', flexShrink: 0, color: 'var(--text-muted)' }} />
            <div>
              <div style={{ fontSize: 'var(--fs-sm)' }}>
                Every spending rule side by side over the same {data.count} starts &mdash; how often each lasts, its deepest cut,
                and what it spends over a lifetime &mdash; the most you could spend and last in 95% or 90% of them, and every
                start year, one row each.
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
