// Retirement Readiness -- the six questions a retiree actually asks,
// answered from the plan (changelog 214). Two cards to start: where the
// first five years come from, and what working longer buys.
//
// House rule for every card here: the answer is a value the engine already
// published. Nothing on this tab recomputes a number that exists in the
// projection, and nothing asks the user for something the plan already
// knows. See src/utils/retirementReadiness.js.
import React, { useMemo, useState } from 'react';
import { PRINT_PACKET_EVENT } from '../printPacketEvents';
import { Gauge, CalendarClock, Hourglass, TrendingDown, DoorOpen, CalendarX, Lock, Printer } from 'lucide-react';
import { useSimulation } from '../../context/useSimulation';
import { useEntitlement } from '../../context/useEntitlement';
import { historicalHeadline, safeMaxHeadline, safeMaxMoney } from '../../utils/historicalStarts';
import { ageReachedWithProbability } from '../../utils/mortality';
import { verdictBand, verdictPct, verdictColor } from '../../utils/planVerdict';
import {
  firstYearsPlan, workLongerCompare, FIRST_YEARS,
  crashCompare, CRASH_HEADLINE_RETURN, walkAwayNow,
  SPENDING_SOLVE_TEXT, printable, paidOutFigures, joinParts, planHorizon,
} from '../../utils/retirementReadiness';
import { findBigExpenses, BIG_SHARE, WINDOW_YEARS } from '../../utils/bigExpenses';
import PremiumMount from '../../premium/PremiumMount';
import { farFormatter } from '../../utils/farDollars';
import { invalidInputLines, CHECK_INPUTS_TITLE } from '../../utils/planNotices';
import { spouse2RetireAgeMatching } from '../../calculator';
import { RetirementAgeExplorer, SpendingCeiling, TargetPortfolioSolver } from '../ReadinessTools';

const card = {
  border: '1px solid var(--card-border)',
  borderRadius: '12px',
  padding: '18px 20px',
  backgroundColor: 'var(--card-bg)',
  marginBottom: '16px',
};
const hint = { fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.55 };
const pct = (v) => `${Math.round(v * 100)}%`;
// A share of the portfolio is the right test and a hard number to feel.
// The same fact in withdrawals is one you can judge, so it is said in
// months while that reads better and in years once it does not.
const drawSpan = (years) => {
  if (years === null || years === undefined || !(years > 0)) return null;
  if (years < 1.75) return `${Math.round(years * 12)} months`;
  return `${years.toFixed(1)} years`;
};

// The Monte Carlo's answer beside the deterministic one (changelog 269):
// only when a run exists for THIS plan. A stale run is not quoted -- the
// Ending Balance card already says to run again.
function MonteCarloLine({ mcRange, monteCarlo, setActiveTab, framing }) {
  if (!mcRange || mcRange.status !== 'fresh' || !monteCarlo) return null;
  const pct = verdictPct(mcRange.successProbability);
  const model = monteCarlo.returnModel === 'bootstrap' ? 'blocks of real years' : 'a lognormal draw';
  const extras = [monteCarlo.longevitySampled ? 'lifespans' : null, monteCarlo.ltcSampled ? 'long-term care' : null].filter(Boolean);
  return (
    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '10px 0 0', lineHeight: 1.5 }}>
      <strong style={{ color: verdictColor(verdictBand(pct)) }}>
        {pct}% of {mcRange.trials.toLocaleString()} trials
      </strong>{' '}
      {framing} across {model}{extras.length ? ` with ${extras.join(' and ')} drawn too` : ''}.{' '}
      <button type="button" onClick={() => setActiveTab('risk')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-text)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>
        The Monte Carlo
      </button>
    </p>
  );
}

function CardShell({ icon: Icon, question, children }) {
  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <Icon size={18} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
        <h3 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700 }}>{question}</h3>
      </div>
      {children}
    </section>
  );
}

// The paywall on this tab is the DETAIL, never the question and never the
// user's own headline figure: a card that hides the number the plan
// already shows elsewhere would be theatre.
function LockedDetail({ what, onOpenPremium }) {
  return (
    <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '8px', border: '1px dashed var(--card-border)', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <Lock size={14} style={{ marginTop: '2px', flexShrink: 0, color: 'var(--text-muted)' }} />
      <div>
        <div style={{ fontSize: 'var(--fs-sm)' }}>{what}</div>
        <button type="button" className="btn-outline" style={{ marginTop: '8px', padding: '4px 10px', fontSize: 'var(--fs-xs)' }} onClick={onOpenPremium}>
          Part of Premium &mdash; see what it includes
        </button>
      </div>
    </div>
  );
}

// "How long does the plan have to last?" -- the one assumption all six
// cards share, with the SSA life-table odds behind it. Ages come from the
// plan the way the engine reads them (planYear - birthYear); the horizon
// is the projection's own last year, so a two-person plan reports the
// chance that at least one of them is still alive when it ends.
function HorizonNote({ inputs, projection }) {
  // One computation shared with the spend-to-zero table and the printed
  // report (retirementReadiness.planHorizon), so the three state the same
  // odds for the same ages (U14).
  const horizon = planHorizon(inputs, projection);
  if (!horizon) return null;
  const { lastYear, people, anyAliveAtEnd: anyAlive } = horizon;
  const noun = (sex) => (sex === 'male' ? 'man' : sex === 'female' ? 'woman' : 'person');
  const pct = (x) => `${Math.round(x * 100)}%`;
  return (
    // Full width, like the question cards under it (changelog 334).
    <div className="glass-panel" data-testid="horizon-card" style={{ padding: '14px 18px', marginBottom: '18px' }}>
      <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: '6px' }}>How long the plan has to last</div>
      <p style={{ ...hint, margin: 0 }}>
        The plan runs to <strong>{lastYear}</strong>
        {people.map((p, i) => (
          <React.Fragment key={p.name}>
            {i === 0 ? ' \u2014 ' : ' and '}{p.name} to age {p.planTo}{people.length === 2 ? ` (${p.endYear})` : ''}
          </React.Fragment>
        ))}.
        {' '}By the Social Security Administration&rsquo;s life table,
        {people.map((p, i) => (
          <React.Fragment key={p.name}>
            {i === 0 ? ' ' : ' and '}a {noun(p.sex)} of {p.age} has a <strong>{pct(p.reachPlanTo)}</strong> chance of
            reaching {p.planTo} (one in four reach {ageReachedWithProbability(p.sex, p.age, 0.25)}, one in ten reach {ageReachedWithProbability(p.sex, p.age, 0.10)})
          </React.Fragment>
        ))}.
        {people.length === 2 && (
          <> The chance that at least one of you is still here in {lastYear}, when the plan ends, is <strong>{pct(anyAlive)}</strong>.</>
        )}
        {' '}Healthier and wealthier than average runs a few years better than the table.
        {anyAlive >= 0.25 && (
          <> Every card below stops at {lastYear}; the years past it are tested only by the Monte Carlo&rsquo;s longevity option (Plan &rarr; Assumptions &amp; Risk &rarr; Longevity Uncertainty (Monte Carlo)).</>
        )}
      </p>
    </div>
  );
}

export default function ReadinessTab() {
  const {
    inputs, projection, formatCurrency, useRealDollars, setActiveTab, mcRange, monteCarlo, roundFarDollars, updateInput,
    historicalStartsData, setRiskSubTab,
    // The question tools that moved here from Optimizers (changelog 285);
    // their results are computed once in App.jsx and shared.
    ageFinderResults, heavyResultsLoading, dieWithZeroResults, dieWithZeroLongevityData, targetPortfolioResults,
    whatIfRetireAge, setWhatIfRetireAge, whatIfSpend, setWhatIfSpend, whatIfFundingMethod, setWhatIfFundingMethod,
    setMaximizedComponent,
  } = useSimulation();
  const { isPremium } = useEntitlement();
  const [extraYears, setExtraYears] = useState(3);
  // A plan with no years to project (life expectancy below the current age)
  // has nothing for any card to say; the tab says so once instead of
  // rendering sentences with holes in them (E17).
  const hasRows = (projection?.years || []).length > 0;

  // No extra projection: questions 5 and 3 restate the projection in hand.
  // End-of-plan dollars are rounded to three significant figures once the
  // end is more than ten years off (farDollars.js, changelog 277).
  const formatFar = useMemo(() => {
    const planYears = projection.years || [];
    return farFormatter(formatCurrency, planYears[planYears.length - 1]?.year, planYears[0]?.year, !!roundFarDollars);
  }, [formatCurrency, projection, roundFarDollars]);
  const firstYears = useMemo(() => firstYearsPlan(projection, { years: FIRST_YEARS }), [projection]);
  // The paid comparison for the chosen number of years runs inside the
  // Premium module; free users get the three-year sentence, one projection.
  const freeLonger = useMemo(
    () => (isPremium || !hasRows ? null : workLongerCompare(inputs, { extraYears: 3, useRealDollars })),
    [inputs, useRealDollars, isPremium, hasRows]
  );
  // Three projections for the headline, memoised on the plan. The ~twenty
  // more for the break-point search run inside the Premium module.
  const crash = useMemo(() => (hasRows ? crashCompare(inputs, { useRealDollars }) : null), [inputs, useRealDollars, hasRows]);
  const history = historicalHeadline(historicalStartsData);
  const safeMax = safeMaxHeadline(historicalStartsData);
  // A projection plus the engine's 40-iteration spending search, so it is
  // memoised on the plan like the others. "What would make it a yes" is
  // the module's.
  const walkAway = useMemo(() => (hasRows ? walkAwayNow(inputs, { useRealDollars }) : null), [inputs, useRealDollars, hasRows]);
  // Free: just the list, which costs nothing beyond the projection in hand.
  // The timing what-ifs are the module's.
  const bigList = useMemo(() => (hasRows ? findBigExpenses(inputs, projection) : []), [inputs, projection, hasRows]);
  const openPremium = () => setActiveTab('premium');
  // Explicit applies from the tools below. Ages move both spouses together,
  // keeping the age gap, exactly as the Age Finder on Optimizers did.
  const applyRetirementAge = (age) => {
    if (!updateInput) return;
    updateInput('retireAge1', age);
    if (inputs.spouse2Enabled) {
      updateInput('retireAge2', spouse2RetireAgeMatching(inputs, age));
    }
  };
  const applyBudget = (amount) => { if (updateInput) updateInput('lifestyleExpense', amount); };
  // A bar on the age chart picks how many more years the table compares.
  const compareAgeFromChart = (age) => {
    const more = Number(age) - (Number(inputs.retireAge1) || 0);
    if (more >= 1) setExtraYears(more);
  };

  // An input the engine could not run as entered (E28), or no year at all:
  // one card in place of the answers, since every answer would describe a
  // plan the user did not enter.
  const invalidLines = invalidInputLines(projection, inputs);
  if (!hasRows || invalidLines.length) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
          <Gauge size={20} />
          <h2 style={{ margin: 0, fontSize: 'var(--fs-xl)', fontWeight: 700 }}>Retirement Readiness</h2>
        </div>
        <section style={card} data-testid="readiness-no-rows">
          <h3 style={{ margin: '0 0 6px', fontSize: 'var(--fs-lg)', fontWeight: 600 }}>{CHECK_INPUTS_TITLE}</h3>
          {invalidLines.map((line) => (
            <p key={line} style={{ fontSize: 'var(--fs-body)', margin: '0 0 6px' }}>{line}</p>
          ))}
          <p style={{ fontSize: 'var(--fs-body)', margin: 0 }}>
            {!hasRows && <><strong>{SPENDING_SOLVE_TEXT.noRows}</strong> </>}
            Each person&rsquo;s life expectancy has to be above their current age for the plan to have years to
            answer these questions about. Both are on the Household page of Plan Settings.
          </p>
        </section>
      </div>
    );
  }

  // The walk-away headline (E17): every figure is checked before it goes in
  // a sentence, and a search that found no real spending level says which
  // way it failed instead of printing its bound.
  const stopIn = printable(walkAway.retirementYear) ? ` in ${walkAway.retirementYear}` : '';
  const supportsOk = walkAway.supportsStatus === 'ok';
  const supportsText = SPENDING_SOLVE_TEXT[walkAway.supportsStatus] || '';
  const headlineMoney = firstYears ? paidOutFigures(firstYears.headline) : null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <Gauge size={20} />
        <h2 style={{ margin: 0, fontSize: 'var(--fs-xl)', fontWeight: 700 }}>Retirement Readiness</h2>
        {/* The printed report carries these six answers as six sentences
            (changelog 253) — the way to hand them to a spouse or an
            advisor without the app. */}
        <button
          type="button"
          className="btn-outline"
          onClick={() => window.dispatchEvent(new Event(PRINT_PACKET_EVENT))}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: 'var(--fs-sm)' }}
        >
          <Printer size={14} /> Print / PDF Report
        </button>
      </div>
      {/* Full width like the cards, with room before the first one (changelog 334). */}
      <p data-testid="readiness-intro" style={{ ...hint, marginTop: 0, marginBottom: '14px' }}>
        The questions a retiree actually asks, answered from your own plan rather than a rule of thumb. Every figure
        here is one the projection already produced &mdash; change the plan and these change with it.
      </p>

      {/* The horizon every card below assumes, and the odds behind it
          (changelog 248). Free: three life-table lookups, no projection. */}
      <HorizonNote inputs={inputs} projection={projection} />

      <CardShell icon={DoorOpen} question="If you walked away today, could the portfolio carry this lifestyle?">
        <p style={{ fontSize: 'var(--fs-body)', margin: '0 0 4px' }}>
          {walkAway.isSuccessful ? (
            <>
              <strong>Yes.</strong> Stopping work{stopIn} on {formatCurrency(walkAway.budget)} a
              year, the plan reaches the end of its horizon
              {!supportsOk
                ? <>. {supportsText}</>
                : walkAway.headroom > 0
                  ? <> with room for about {formatCurrency(walkAway.headroom)} a year more than you are planning to spend.</>
                  : <>, but with nothing spare.</>}
            </>
          ) : (
            <>
              <strong>Not on {formatCurrency(walkAway.budget)} a year.</strong> Stopping work{stopIn},
              {printable(walkAway.depletionYear)
                ? <> the portfolio runs out in {walkAway.depletionYear}{walkAway.depletionAge ? ` (age ${walkAway.depletionAge})` : ''}.</>
                : <> the plan comes up short.</>}
              {supportsOk
                ? <> The most this plan supports from a standing start is about {formatCurrency(walkAway.supports)} a
                  year &mdash; {formatCurrency(Math.abs(walkAway.headroom))} a year below your budget, and that figure spends
                  the portfolio to nothing, so the real gap is a little wider.</>
                : <> {supportsText}</>}
            </>
          )}
        </p>
        <div style={hint}>
          {walkAway.alreadyRetired
            ? 'Your plan already retires you this year, so this is the plan itself rather than a what-if.'
            : 'Everything else is held where you set it — the same returns, the same Social Security at the same age, the same life expectancy. Only the leaving date moves.'}
        </div>
        {walkAway.alreadyRetired && (
          <MonteCarloLine mcRange={mcRange} monteCarlo={monteCarlo} setActiveTab={setActiveTab} framing="of this plan lasted to the end" />
        )}

        <PremiumMount
          id="readinessDetail"
          section="walkAway"
          walkAway={walkAway}
          locked={(
            <LockedDetail
              what="The full comparison: your budget against the most a standing-start retirement supports, the first year's tax on top, and whether the income that arrives regardless covers the part of your spending you said you could not cut."
              onOpenPremium={openPremium}
            />
          )}
        />
        <SpendingCeiling
          inputs={inputs}
          dieWithZeroResults={dieWithZeroResults}
          dieWithZeroLongevityData={dieWithZeroLongevityData}
          formatCurrency={formatCurrency}
          onApply={applyBudget}
          setMaximizedComponent={setMaximizedComponent}
        />
        <TargetPortfolioSolver
          inputs={inputs}
          formatCurrency={formatCurrency}
          targetPortfolioResults={targetPortfolioResults}
          whatIfRetireAge={whatIfRetireAge}
          setWhatIfRetireAge={setWhatIfRetireAge}
          whatIfSpend={whatIfSpend}
          setWhatIfSpend={setWhatIfSpend}
          whatIfFundingMethod={whatIfFundingMethod}
          setWhatIfFundingMethod={setWhatIfFundingMethod}
        />
      </CardShell>


      <CardShell icon={Hourglass} question="What would working longer actually buy you?">
        <PremiumMount
          id="readinessDetail"
          section="workLonger"
          walkAway={walkAway}
          extraYears={extraYears}
          setExtraYears={setExtraYears}
          formatFar={formatFar}
          locked={(
            <>
              {freeLonger && (
                <p style={{ fontSize: 'var(--fs-body)', margin: '0 0 4px' }}>
                  {printable(freeLonger.later.retirementYear, freeLonger.base.retirementYear, freeLonger.yearsGivenUp)
                    ? <>Working 3 more years would leave you retiring in <strong>{freeLonger.later.retirementYear}</strong> instead
                      of {freeLonger.base.retirementYear}, with {freeLonger.yearsGivenUp} fewer years of retirement.</>
                    : <>Your plan does not retire inside its horizon, so working longer has no retirement years to trade.</>}
                </p>
              )}
              <LockedDetail
                what="What those years buy: ending balance, lifetime taxes and the size of your first year's withdrawal, side by side, for one, two, three or five more years."
                onOpenPremium={openPremium}
              />
            </>
          )}
        />
        <RetirementAgeExplorer
          ageFinderResults={ageFinderResults}
          loading={!!heavyResultsLoading && !(ageFinderResults?.simulations || []).length}
          inputs={inputs}
          formatFar={formatFar}
          compareAge={(Number(inputs.retireAge1) || 0) + (isPremium ? extraYears : 3)}
          onCompare={isPremium ? compareAgeFromChart : null}
          onApply={applyRetirementAge}
          setMaximizedComponent={setMaximizedComponent}
        />
      </CardShell>


      {/* Changelog 239: questions 5 and 3 as one card. Where the money comes
          from and how it reaches you are two sides of the same five years. */}
      <CardShell icon={CalendarClock} question={`Where does your first ${FIRST_YEARS} years of money come from, and how does it reach you?`}>
        {firstYears === null ? (
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0 }}>
            Your plan has no retired year inside its horizon yet, so there is no first year to describe and no paycheck to
            replace. Set a retirement age in Plan Settings and this fills in.
          </p>
        ) : (
          <>
            {/* U12: the total is named for what it is -- everything the
                year pays out, tax and one-time events included — and
                split into parts that add up to it, so it can be set beside
                the Dashboard's lifestyle figure. */}
            <p data-testid="first-years-headline" style={{ fontSize: 'var(--fs-body)', margin: '0 0 4px' }}>
              In <strong>{firstYears.headline.year}</strong> your plan pays out {formatCurrency(headlineMoney.paidOut)} for
              the year, about {formatCurrency(headlineMoney.paidOut / 12)} a month: {joinParts(headlineMoney.parts, formatCurrency)}.{' '}
              {headlineMoney.arrives > 0
                ? `${formatCurrency(headlineMoney.arrives)} of it arrives on its own. The rest comes out of the portfolio in one transfer of ${formatCurrency(headlineMoney.fromPortfolio)} for the year`
                : `None of it arrives on its own yet, so the whole year comes out of the portfolio in one transfer of ${formatCurrency(headlineMoney.fromPortfolio)}`}
              {headlineMoney.fromPortfolio > 0 && firstYears.headline.biggestDrawLabel
                ? <>, mostly from <strong>{firstYears.headline.biggestDrawLabel}</strong></>
                : null}
              {headlineMoney.toReserve > 0
                ? `; ${formatCurrency(headlineMoney.toReserve)} of that tops up the cash reserve rather than being paid out.`
                : '.'}
            </p>
            <div style={hint}>
              Which accounts pay is what controls your tax bill and, before 65, what your health coverage costs. Nothing
              withholds tax for you any more: on this plan that is about {formatCurrency(firstYears.headline.taxesPerQuarter)} a
              quarter to set aside.
              {firstYears.reserveEnabled
                ? ` Your cash reserve would cover about ${Math.round(firstYears.headline.reserveMonths)} months on its own.`
                : ' Your plan has no cash reserve, so every transfer is a sale — including in a year the market is down. It lives in Plan Settings under Cash Floor / Emergency Reserve.'}
            </div>

            <PremiumMount
              id="readinessDetail"
              section="firstYears"
              firstYears={firstYears}
              locked={(
                <LockedDetail
                  what={`The year-by-year plan for ${firstYears.startYear}–${firstYears.endYear} — every source and which account it comes from, what lands on its own, what you have to move and the tax to hold back each quarter, how many months the reserve covers, and why each year looks the way it does (conversions, RMDs, the ACA subsidy, IRMAA).`}
                  onOpenPremium={openPremium}
                />
              )}
            />
          </>
        )}
      </CardShell>

      <CardShell icon={TrendingDown} question={`If the market fell ${Math.abs(CRASH_HEADLINE_RETURN)}% right after you retire, could you stay retired without changing your lifestyle?`}>
        <p style={{ fontSize: 'var(--fs-body)', margin: '0 0 4px' }}>
          {crash.held.isSuccessful ? (
            <>
              <strong>Yes</strong> &mdash; on your plan&rsquo;s own assumptions, spending exactly as planned. It costs
              you {formatFar(Math.max(0, crash.baseline.endingBalance - crash.held.endingBalance))} of what you
              would otherwise leave behind, ending at {formatFar(crash.held.endingBalance)} instead
              of {formatFar(crash.baseline.endingBalance)}.
            </>
          ) : (
            <>
              <strong>Not without changing something.</strong> Spending exactly as planned,
              {printable(crash.held.depletionYear)
                ? <> the portfolio runs out in {crash.held.depletionYear}{crash.held.depletionAge ? ` (age ${crash.held.depletionAge})` : ''}.</>
                : <> the plan comes up short.</>}
            </>
          )}
        </p>
        <div style={hint}>
          A one-year fall of {Math.abs(CRASH_HEADLINE_RETURN)}% in the first year of retirement, with inflation left at
          your plan&rsquo;s own rate so the only thing that moved is the market.
        </div>
        <MonteCarloLine mcRange={mcRange} monteCarlo={monteCarlo} setActiveTab={setActiveTab} framing="of this plan as entered lasted to the end when every year's return was uncertain, not just the first" />
        {history && (
          <p style={{ ...hint, marginTop: '6px' }} data-testid="readiness-history-line">
            In real history, your plan lasted in <strong>{history.lasted} of {history.count}</strong> retirements since{' '}
            {historicalStartsData.firstStart}; the hardest start was {history.worstStart}.{' '}
            {safeMax && safeMax.status === 'ok' && (
              <span data-testid="readiness-safemax">
                The most you could spend and still last through every one is{' '}
                <strong>{safeMaxMoney(safeMax.amount)} a year</strong> in today&rsquo;s dollars, your own SAFEMAX after William Bengen&rsquo;s &ldquo;safe max&rdquo;.{' '}
              </span>
            )}
            <button type="button" onClick={() => { setRiskSubTab('stress'); setActiveTab('risk'); }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-text)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>
              See every start
            </button>
          </p>
        )}

        <PremiumMount
          id="readinessDetail"
          section="crash"
          crash={crash}
          formatFar={formatFar}
          locked={(
            <LockedDetail
              what="The exact fall your plan breaks at, and the three scenarios side by side — no crash, crash with spending unchanged, and crash with withdrawal-rate guardrails doing the adjusting for you."
              onOpenPremium={openPremium}
            />
          )}
        />
      </CardShell>


      <CardShell icon={CalendarX} question="Are your biggest expenses landing in the years that can least absorb them?">
        {bigList.length === 0 ? (
          <p style={{ fontSize: 'var(--fs-body)', margin: 0 }}>
            <strong>Nothing flagged.</strong> No single life event in your first {WINDOW_YEARS} retired years takes
            {' '}{Math.round(BIG_SHARE * 100)}% or more of the portfolio in one go. Money you have already set aside
            outside the plan is left out of this, as it should be.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 'var(--fs-body)', margin: '0 0 4px' }}>
              {bigList.length === 1 ? 'One life event lands' : `${bigList.length} life events land`} in your
              first {WINDOW_YEARS} retired years big enough to matter. The largest
              is <strong>{bigList[0].name}</strong> in {bigList[0].year} at {formatCurrency(bigList[0].amount)}
              {' '}&mdash; {Math.round(bigList[0].portfolioShare * 100)}% of the portfolio that year
              {drawSpan(bigList[0].drawYears)
                ? `, or about ${drawSpan(bigList[0].drawYears)} of your normal withdrawals in one go`
                : ''}
              {bigList[0].sharpEnd ? ', and it falls in the first five years, where a sale hurts most.' : '.'}
            </p>
            <div style={hint}>
              The risk is not the cost, which your plan already carries. It is selling that much in a year the market is
              down and the portfolio has not recovered.
              {bigList[0].flexShare !== null && (
                <> In {bigList[0].year}, about {pct(bigList[0].flexShare)} of your spending could flex to absorb some of it.</>
              )}
            </div>

            <PremiumMount
              id="readinessDetail"
              section="bigExpenses"
              bigList={bigList}
              formatFar={formatFar}
              locked={(
                <LockedDetail
                  what={`What ${bigList[0].name} does to the plan where it sits, in a normal market and in a 20% fall at retirement — and what the same expense two, three or five years later would do instead.`}
                  onOpenPremium={openPremium}
                />
              )}
            />
          </>
        )}
      </CardShell>

      <p data-testid="readiness-outro" style={hint}>
        Not advice, and not a score. These answer what your plan currently projects, on the assumptions you set.
      </p>
    </div>
  );
}
