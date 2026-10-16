// How retirement is actually funded, year by year, straight from the plan
// projection -- the Retirement Income sub-tab's source of truth.
//
// The projection (calculator.js runProjection) already knows, for every
// retired year, what the household spends (totalExpenses: lifestyle +
// healthcare + taxes + everything else), what arrives whatever the market
// does (Social Security, pensions, annuity payouts), what other cash comes
// in (rental income, part-time salary, deferred-comp payouts, one-off
// inflows, reverse-mortgage draws), and how much it withdraws from the
// portfolio (drawdown, RMDs included) to make up the rest. Its verdict
// (isSuccessful) is what the Dashboard calls "Fully Funded".
//
// Detailed Holdings adds one thing the engine doesn't model separately: the
// dividends the holdings pay. The engine keeps them inside the portfolio's
// return, reinvested, and covers spending by selling -- so a dividend
// taken in cash instead REPLACES a share sale dollar for dollar. That is
// why the withdrawal slice is split into "covered by dividends" and
// "share sales" rather than dividends being stacked as extra income: the
// plan's answer stays exactly the engine's, only its composition changes.
//
// None of this produces a second verdict. A plan funded by withdrawals is
// a funded plan; "dividends alone don't cover spending" is an
// income-investing preference, not a shortfall.

import { finalBalanceFactor } from './displayDollars';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Grows today's dividend total forward at `dividendGrowthRate` (%/yr) in
// the same dollar basis as the projection rows: deflated by inflation when
// the display is in today's dollars, nominal otherwise.
export function projectDividendIncome(todayAnnual, yearsOut, { dividendGrowthRate = 5, inflationRate = 0, realDollars = false } = {}) {
  const growth = (1 + num(dividendGrowthRate) / 100) / (realDollars ? 1 + num(inflationRate) / 100 : 1);
  return num(todayAnnual) * Math.pow(growth, Math.max(0, yearsOut));
}

// One row per retired year of the projection.
export function computeRetirementFunding(projection, dividendTotalToday, opts = {}) {
  const years = projection?.years || [];
  if (years.length === 0) return { rows: [], firstRetired: null, isSuccessful: Boolean(projection?.isSuccessful) };
  const baseYear = years[0].year;
  const rows = years
    .filter((y) => y.isRetired)
    .map((y) => {
      const spending = num(y.totalExpenses);
      // Guaranteed income, kept whole (the coverage math) AND split, so the
      // chart and cards can name Social Security on its own -- a single
      // "guaranteed" band hid when it starts.
      const socialSecurity = num(y.ssIncome);
      const pensions = num(y.pension) + num(y.annuityPayout);
      const guaranteed = socialSecurity + pensions;
      const otherIncome = num(y.rentalAnnuity) + num(y.salary) + num(y.nqdcDistribution1) + num(y.nqdcDistribution2) + num(y.milestoneInflow) + num(y.reverseMortgagePayoutThisYear);
      const withdrawals = num(y.drawdown);
      const rmd = num(y.rmdAmount);
      // The engine's drawdown includes the full required minimum
      // distribution even when it is more than spending needs -- it takes
      // the RMD (the law requires it), spends what spending requires, and
      // reinvests the surplus in the taxable account (calculator.js: the
      // cashNeeded < 0 branch). So only the part of the withdrawals that
      // spending actually consumes is "funding"; the rest is money moved
      // from one account to another, shown separately and never as spent.
      const rawNeeded = Math.min(withdrawals, Math.max(0, spending - guaranteed - otherIncome));
      // Below a dollar the difference is floating-point noise from the
      // engine's own arithmetic, not a real surplus.
      const forcedSurplus = withdrawals - rawNeeded > 1 ? withdrawals - rawNeeded : 0;
      const neededFromPortfolio = withdrawals - forcedSurplus;
      const dividends = projectDividendIncome(dividendTotalToday, y.year - baseYear, opts);
      // Dividends taken in cash can only replace share sales the plan
      // actually needs; any excess is simply reinvested (as the engine
      // already assumes) and does not count as spending cover.
      const dividendsAsCash = Math.min(dividends, neededFromPortfolio);
      const shareSales = Math.max(0, neededFromPortfolio - dividendsAsCash);
      const deficit = Math.max(0, num(y.lifestyleDeficit)) + Math.max(0, num(y.shortfall));
      const pct = (v) => (spending > 0 ? (v / spending) * 100 : 0);
      return {
        year: y.year,
        age1: y.age1,
        spending,
        guaranteed,
        socialSecurity,
        pensions,
        otherIncome,
        withdrawals,
        neededFromPortfolio,
        forcedSurplus,
        rmd,
        dividends,
        dividendsAsCash,
        shareSales,
        deficit,
        guaranteedPct: pct(guaranteed),
        socialSecurityPct: pct(socialSecurity),
        dividendPct: pct(dividends),
        incomePct: pct(guaranteed + otherIncome + dividendsAsCash),
        shareSalesPct: pct(shareSales),
      };
    });
  return { rows, firstRetired: rows[0] || null, socialSecurityFull: findSocialSecurityFull(rows), isSuccessful: Boolean(projection?.isSuccessful) };
}

// The first retired year in which Social Security reaches its full level --
// the year after its last step up (a claim, or a spouse's later claim). A
// step is a >15% jump; ordinary COLA growth in future dollars never is.
// null when there is no step after the first retired year (already fully
// claimed at retirement, or no benefit at all), so callers only mention it
// when it changes the story.
export function findSocialSecurityFull(rows) {
  let idx = -1;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].socialSecurity;
    if (rows[i].socialSecurity > 1 && rows[i].socialSecurity > prev * 1.15 + 1) idx = i;
  }
  return idx > 0 ? { year: rows[idx].year, age1: rows[idx].age1, socialSecurity: rows[idx].socialSecurity } : null;
}

// Step 1 / 2 / 3 -- what to do now, at retirement, and how the plan pays
// for retirement -- built from the plan and the holdings, not from an
// income-investing template. Returns plain data; the tab renders it.
const WITHDRAWAL_ORDER_LABELS = {
  TaxableFirst: 'Taxable → Pre-Tax → Roth',
  PreTaxFirst: 'Pre-Tax → Taxable → Roth',
  RothFirst: 'Roth → Taxable → Pre-Tax',
  ProRata: 'pro-rata across Taxable, Pre-Tax and Roth',
};

export function computeRetirementRoadmap({ holdings = [], funding, inputs = {}, rebalancePlan = null, yearsToRetirement = null, dividendTotals = null } = {}) {
  const first = funding?.firstRetired || null;
  const retired = yearsToRetirement !== null && yearsToRetirement <= 0;
  // Same truthiness as computeDripCashSplit, so the counts and the dollar
  // figures in the same sentence agree. Only holdings that actually pay
  // something are worth a DRIP suggestion.
  const paying = holdings.filter((h) => h && (Number(h.shares) || 0) * (Number(h.annualDividendPerShare) || 0) > 0);
  const dripOn = paying.filter((h) => h.dripEnabled);
  const dripOff = paying.filter((h) => !h.dripEnabled);
  const taxableHoldings = holdings.filter((h) => h?.taxTreatment === 'taxable');
  const sellRows = (rebalancePlan?.rows || []).filter((r) => r.action === 'sell' && Math.abs(r.diffDollars || 0) > 0);
  const trimRow = sellRows.length > 0 ? sellRows.reduce((max, r) => (Math.abs(r.diffDollars) > Math.abs(max.diffDollars) ? r : max), sellRows[0]) : null;
  const trimHolding = trimRow ? holdings.find((h) => h.id === trimRow.id) : null;

  const step1 = {
    title: retired ? 'Now — in retirement' : `Now — ${yearsToRetirement === null ? 'while working' : `${yearsToRetirement} year${yearsToRetirement === 1 ? '' : 's'} to retirement`}`,
    heading: retired ? 'Fund spending from the portfolio' : 'Keep compounding',
    bullets: [],
  };
  if (!retired) {
    if (dripOn.length > 0) {
      step1.bullets.push({ kind: 'keepDrip', text: `Keep reinvesting: DRIP is on for ${dripOn.length} holding${dripOn.length === 1 ? '' : 's'}${dividendTotals ? ` (${Math.round(dividendTotals.drip).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}/yr reinvested)` : ''} — every reinvested dividend buys shares that pay dividends in retirement.` });
    }
    if (dripOff.length > 0) {
      step1.bullets.push({ kind: 'turnOnDrip', symbols: dripOff.map((h) => h.symbol), text: `Consider turning DRIP on for ${dripOff.slice(0, 3).map((h) => h.symbol).join(', ')}${dripOff.length > 3 ? ` +${dripOff.length - 3} more` : ''}${dividendTotals ? ` — ${Math.round(dividendTotals.cash).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}/yr is being paid out in cash` : ''} while you are still accumulating.` });
    }
  } else {
    step1.bullets.push({ kind: 'dripToCash', text: `Take dividends in cash on Taxable holdings (${taxableHoldings.length}) so they fund spending before any shares are sold.` });
  }
  if (trimHolding) {
    step1.bullets.push({ kind: 'trim', symbol: trimHolding.symbol, amountDollars: Math.abs(trimRow.diffDollars), text: `Trim your largest overweight position, ${trimHolding.symbol}, by about ${Math.abs(trimRow.diffDollars).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} to its Target % (Rebalance sub-tab).` });
  } else {
    step1.bullets.push({ kind: 'noTrim', text: 'No overweight holdings to trim — set Target %s on the Rebalance sub-tab to get a real suggestion here.' });
  }

  const step2 = {
    title: first ? `${first.year} — first retired year` : 'First retired year',
    heading: 'Switch from growing to drawing',
    bullets: [],
  };
  if (first) {
    if (!retired && taxableHoldings.length > 0) {
      step2.bullets.push({ kind: 'flipDrip', text: `Switch DRIP to cash on your ${taxableHoldings.length} Taxable holding${taxableHoldings.length === 1 ? '' : 's'}: their dividends (${Math.round(first.dividendsAsCash).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}/yr by then) fund spending before any shares are sold. Retirement-account dividends can keep reinvesting.` });
    }
    const claim = [inputs.claimingAge1, inputs.spouse2Enabled ? inputs.claimingAge2 : null].filter(Boolean);
    step2.bullets.push({ kind: 'guaranteed', text: `Guaranteed income (Social Security${claim.length ? ` at ${claim.join(' / ')}` : ''}, pensions, annuities) covers ${first.guaranteedPct.toFixed(0)}% of that year's spending.` });
  } else {
    step2.bullets.push({ kind: 'none', text: 'Your plan has no retired year yet — set a retirement age on Plan Settings.' });
  }

  const order = WITHDRAWAL_ORDER_LABELS[inputs.withdrawalStrategy] || WITHDRAWAL_ORDER_LABELS.TaxableFirst;
  const step3 = {
    title: 'Through retirement',
    heading: first && first.shareSales > 0 ? 'Planned withdrawals' : 'Income covers spending',
    bullets: [],
  };
  if (first) {
    step3.bullets.push({ kind: 'withdrawals', text: `The plan withdraws ${Math.round(first.withdrawals).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}/yr from the portfolio in ${first.year}, in this order: ${order}. Dividends taken in cash cover ${Math.round(first.dividendsAsCash).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} of it; share sales cover the remaining ${Math.round(first.shareSales).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}.` });
    const firstSurplusYear = (funding.rows || []).find((r) => r.forcedSurplus > 0 && r.rmd > 0);
    if (firstSurplusYear) {
      step3.bullets.push({ kind: 'rmdSurplus', year: firstSurplusYear.year, text: `From ${firstSurplusYear.year} (age ${firstSurplusYear.age1}) required minimum distributions exceed what spending needs by ${Math.round(firstSurplusYear.forcedSurplus).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}/yr; the plan reinvests that surplus in your taxable account. From then on the DRIP logic flips: in your pre-tax accounts let dividends sit as cash so the RMD can be paid without selling shares (reinvesting inside an IRA doesn't shrink the RMD — it is set by the prior year-end balance); in Taxable, dividends can go back to reinvesting or be spent as discretionary.` });
    }
    step3.bullets.push({ kind: 'verdict', text: funding.isSuccessful ? 'With average returns, those withdrawals last through the end of your plan. The Dashboard\'s Will It Last? card adds how often they last across simulated markets.' : 'Even with average returns, these withdrawals run the portfolio down before the end of the plan, so the Dashboard says Runs short.' });
  }
  return { step1, step2, step3, retired };
}

// --- When to claim Social Security -----------------------------------------
// Re-runs the household's own plan with the primary earner claiming at each
// candidate age (the spouse's claiming age stays as set -- the Optimizers
// tab has the full two-way matrix) and reports what actually changes:
// the monthly benefit in the first year it is paid, how much extra the
// portfolio must be drawn on in the "bridge" years between retiring and
// claiming, lifetime benefits, the plan's ending balance and its verdict,
// and the age at which cumulative benefits from a later claim overtake an
// earlier one. Dollar figures follow the display basis (realDollars).
export function compareSsClaimingAges(inputs, { runProjection, ages = null, realDollars = false } = {}) {
  if (typeof runProjection !== 'function' || !inputs) return { rows: [], breakEven: null, current: null };
  const current = Number(inputs.claimingAge1) || 67;
  const candidates = [...new Set([...(ages || [62, 65, 67, 70]), current])].filter((a) => a >= 62 && a <= 70).sort((a, b) => a - b);

  const runs = candidates.map((age) => {
    const proj = runProjection({ ...inputs, claimingAge1: age });
    const years = proj.years || [];
    const deflate = (v, y) => (realDollars ? v / (y.priceIndex || y.inflFactor || 1) : v);
    // Spouse 1's OWN benefit (changelog 293). The household ssIncome starts
    // in whichever spouse claims first, so for a couple every row showed
    // the other spouse's first check and the same bridge whatever age this
    // row was for. Older projections without ssOwn1 fall back to the total.
    const own = (y) => (y.ssOwn1 !== undefined ? num(y.ssOwn1) : num(y.ssIncome));
    const retired1 = (y) => (y.isRetired1 !== undefined ? y.isRetired1 : y.isRetired);
    const firstPaid = years.find((y) => own(y) > 0) || null;
    // Retired through the year before this spouse's own benefit starts:
    // what the portfolio has to supply while waiting.
    const bridgeYears = years.filter((y) => retired1(y) && own(y) === 0 && y.age1 != null);
    const bridgeWithdrawals = bridgeYears.reduce((s, y) => s + deflate(num(y.drawdown), y), 0);
    const lifetimeSs = years.reduce((s, y) => s + deflate(num(y.ssIncome), y), 0);
    const cumulative = [];
    let running = 0;
    for (const y of years) { running += deflate(num(y.ssIncome), y); cumulative.push({ age: y.age1, total: running }); }
    const last = years[years.length - 1];
    return {
      age,
      isCurrent: age === current,
      firstBenefitYear: firstPaid ? firstPaid.year : null,
      // A full year's check: the first paid year is often partial (the
      // claim month) or reduced by the earnings test, so read the year after
      // when there is one.
      monthlyBenefit: (() => {
        if (!firstPaid) return 0;
        const i = years.indexOf(firstPaid);
        const y = years[i + 1] && own(years[i + 1]) > 0 ? years[i + 1] : firstPaid;
        return deflate(own(y), y) / 12;
      })(),
      bridgeYears: bridgeYears.length,
      bridgeWithdrawals,
      lifetimeSs,
      endingBalance: realDollars && last ? num(proj.endingBalance) / finalBalanceFactor(years) : num(proj.endingBalance),
      isSuccessful: Boolean(proj.isSuccessful),
      cumulative,
    };
  });

  const bestEnding = runs.reduce((b, r) => (b === null || r.endingBalance > b.endingBalance ? r : b), null);
  const currentRun = runs.find((r) => r.isCurrent) || null;
  runs.forEach((r) => {
    r.isBestEnding = bestEnding !== null && r.age === bestEnding.age;
    r.extraBridgeVsCurrent = currentRun ? r.bridgeWithdrawals - currentRun.bridgeWithdrawals : 0;
    r.endingVsCurrent = currentRun ? r.endingBalance - currentRun.endingBalance : 0;
  });

  // Break-even: the age at which claiming at 70 has paid out more in total
  // than claiming at 62 (null if never within the plan).
  const early = runs.find((r) => r.age === 62);
  const late = runs.find((r) => r.age === 70);
  let breakEven = null;
  if (early && late) {
    for (let i = 0; i < late.cumulative.length; i++) {
      const e = early.cumulative[i];
      const l = late.cumulative[i];
      if (e && l && l.total > e.total && l.total > 0) { breakEven = l.age; break; }
    }
  }
  return { rows: runs.map(({ cumulative: _c, ...r }) => r), breakEven, current, bestEnding: bestEnding ? bestEnding.age : null };
}
