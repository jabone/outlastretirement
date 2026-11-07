// How retirement is actually funded, year by year, straight from the plan
// projection -- the Retirement Income sub-tab's source of truth.
//
// The projection (calculator.js runProjection) already knows, for every
// retired year, what the household spends (totalExpenses: lifestyle +
// healthcare + taxes + everything else, net of medical bills the HSA pays),
// what arrives whatever the market does (Social Security, pensions, annuity
// payouts), what other cash comes in (rental income, part-time salary with
// deferred-comp payouts, reverse-mortgage draws, a survivor benefit, a
// company-stock sale, the cash reserve), and how much it withdraws from each
// kind of account to make up the rest, in the plan's withdrawal order. A
// one-off inflow (an inheritance) is not spending money: the engine puts it
// in the brokerage account, so it appears in the balances, not here. Its verdict
// (isSuccessful) is what the Dashboard calls "Fully Funded".
//
// Withdrawals are shown BY ACCOUNT, because that is what the plan decides
// and what decides the tax: brokerage (taxable), traditional IRA/401(k)
// (pre-tax) and Roth. A dividend is not a separate source of money. Inside
// an IRA it is cash inside the IRA, and spending it is still an IRA
// withdrawal. In the brokerage account it is taxed in the year paid whether
// it is spent or reinvested; when the plan takes it as cash
// (dividendPayoutMode 'cash' or 'asNeeded') the engine counts it as its own
// line (dividendCash), outside the brokerage withdrawal.
//
// Every row reconciles (tested on the demo families, cash reserves,
// company stock, survivors, short plans and every withdrawal order):
//   spending = guaranteed + otherIncome + fromStockSale + fromCashReserve
//            + dividendCash + fromTaxable + fromPreTax + fromRoth + otherCash
//            - notSpent + notCovered
//   notSpent = movedToBrokerage + toCashReserve + oneTimeFromAccount
// where fromPreTax leaves out charitable distributions (QCDs), which go to
// charity and are never spent; movedToBrokerage is money withdrawn but not
// needed (most often an RMD), which the plan puts back in the brokerage
// account; toCashReserve tops up the cash reserve; and oneTimeFromAccount is
// a one-time expense paid straight from the account it names, which is not
// part of the year's spending need. otherCash catches anything left (more
// than a few dollars of engine rounding), so a row can never silently fail
// to add up.
//
// None of this produces a second verdict.

import { finalBalanceFactor } from './displayDollars';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pos = (v) => (num(v) > 0.5 ? num(v) : 0);

// Grows today's dividend total forward at `dividendGrowthRate` (%/yr) in
// the same dollar basis as the projection rows: deflated by inflation when
// the display is in today's dollars, nominal otherwise. Used only by the
// income-investing what-if; the funding rows use the engine's own figures.
export function projectDividendIncome(todayAnnual, yearsOut, { dividendGrowthRate = 5, inflationRate = 0, realDollars = false } = {}) {
  const growth = (1 + num(dividendGrowthRate) / 100) / (realDollars ? 1 + num(inflationRate) / 100 : 1);
  return num(todayAnnual) * Math.pow(growth, Math.max(0, yearsOut));
}

// One row per retired year of the projection. `opts.dividendPayoutMode` is
// the plan's setting ('reinvest' | 'cash' | 'asNeeded'). The second
// argument used to be today's holdings dividend total; it is no longer used
// and a number there is ignored.
export function computeRetirementFunding(projection, optsOrLegacy = {}, legacyOpts = undefined) {
  const opts = (typeof optsOrLegacy === 'number' || optsOrLegacy === null) ? (legacyOpts || {}) : (optsOrLegacy || {});
  const payoutMode = opts.dividendPayoutMode || 'reinvest';
  const years = projection?.years || [];
  if (years.length === 0) return { rows: [], firstRetired: null, isSuccessful: Boolean(projection?.isSuccessful), payoutMode };
  const rows = years
    .filter((y) => y.isRetired)
    .map((y) => {
      const spending = num(y.totalExpenses);
      const socialSecurity = num(y.ssIncome);
      const pensions = num(y.pension) + num(y.annuityPayout);
      const guaranteed = socialSecurity + pensions;
      // salary already includes deferred-comp payouts (calculator.js adds
      // them in), so they are not added again here.
      const otherIncome = num(y.rentalAnnuity) + num(y.salary) + num(y.reverseMortgagePayoutThisYear) + num(y.survivorBenefitIncome);
      const fromStockSale = Math.max(0, num(y.concentratedStockProceedsSpent));
      const fromCashReserve = Math.max(0, num(y.cashReserveDraw));
      const dividendCash = Math.max(0, num(y.dividendCash));
      const toCharity = Math.max(0, num(y.qcdAmount));
      const fromTaxable = Math.max(0, num(y.drawTaxable));
      const fromPreTax = Math.max(0, num(y.drawPreTax) - toCharity);
      const fromRoth = Math.max(0, num(y.drawRoth));
      const movedToBrokerage = pos(y.surplusReinvested);
      const toCashReserve = pos(num(y.cashReserveReplenish) + num(y.cashReservePreFund));
      const oneTimeFromAccount = pos(num(y.milestoneOutflow) - num(y.milestoneOutflowGeneral) - num(y.milestoneOutflowExternal));
      const notSpent = movedToBrokerage + toCashReserve + oneTimeFromAccount;
      const notCovered = Math.max(0, num(y.lifestyleDeficit)) + Math.max(0, num(y.shortfall));
      const residual = spending - guaranteed - otherIncome - fromStockSale - fromCashReserve - dividendCash - fromTaxable - fromPreTax - fromRoth + notSpent - notCovered;
      // A few dollars either way is the engine's own rounding in a
      // pro-rata or pre-tax-first year, not a source worth a column.
      const otherCash = residual > 5 ? residual : 0;
      const withdrawals = fromTaxable + fromPreTax + fromRoth;
      // What savings actually paid toward spending this year: the three
      // withdrawals and any dividends taken as cash, less what was not spent.
      const fromSavings = Math.max(0, withdrawals + dividendCash - notSpent);
      // For the chart: money not spent is drawn above the spending line, so
      // take it off the sources it came from (pre-tax first -- an RMD --
      // then dividends taken as cash, then the rest) to show what was spent.
      let back = notSpent;
      const spentPart = (v) => { const t = Math.min(v, back); back -= t; return v - t; };
      const preTaxSpent = spentPart(fromPreTax);
      const dividendCashSpent = spentPart(dividendCash);
      const taxableSpent = spentPart(fromTaxable);
      const rothSpent = spentPart(fromRoth);
      const taxableDividends = Math.max(0, num(y.taxableDividends));
      // Reinvested brokerage dividends that, taken as cash instead, would
      // stand in for part of the brokerage withdrawal (never more than it).
      const dividendCover = payoutMode === 'reinvest' ? Math.min(taxableDividends, fromTaxable) : 0;
      const pct = (v) => (spending > 0 ? (v / spending) * 100 : 0);
      return {
        year: y.year,
        age1: y.age1,
        age: y.age1 ?? y.age2 ?? null,
        spending,
        guaranteed,
        socialSecurity,
        pensions,
        otherIncome,
        dividendCash,
        fromTaxable,
        fromPreTax,
        fromRoth,
        withdrawals,
        fromSavings,
        fromStockSale,
        fromCashReserve,
        toCharity,
        movedToBrokerage,
        toCashReserve,
        oneTimeFromAccount,
        oneTimeNames: Array.isArray(y.milestoneOutflowNames) ? y.milestoneOutflowNames : [],
        notSpent,
        notCovered,
        otherCash,
        preTaxSpent,
        dividendCashSpent,
        taxableSpent,
        rothSpent,
        rmd: num(y.rmdAmount),
        taxableDividends,
        dividendCover,
        taxes: Math.max(0, num(y.totalTaxesPaid)),
        rothConversion: Math.max(0, num(y.convertAmount)),
        conversionTax: Math.max(0, num(y.conversionTaxCost)),
        hsaMedical: Math.max(0, num(y.hsaMedicalDraw)),
        // Kept for older readers: the deficit, and the former dividends /
        // share-sales split, so a Premium module built before this change
        // still shows sensible figures on a newer app until it is replaced.
        deficit: notCovered,
        dividends: taxableDividends,
        dividendsAsCash: dividendCash + dividendCover,
        shareSales: Math.max(0, fromSavings - dividendCash - dividendCover),
        neededFromPortfolio: fromSavings,
        forcedSurplus: movedToBrokerage,
        dividendPct: pct(taxableDividends),
        incomePct: Math.min(100, pct(guaranteed + otherIncome + dividendCash + dividendCover)),
        guaranteedPct: pct(guaranteed),
        socialSecurityPct: pct(socialSecurity),
      };
    });
  return { rows, firstRetired: rows[0] || null, socialSecurityFull: findSocialSecurityFull(rows), isSuccessful: Boolean(projection?.isSuccessful), payoutMode };
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

// The plan's withdrawal order, in the account names the page uses.
export const WITHDRAWAL_ORDER_LABELS = {
  TaxableFirst: 'brokerage, then IRA/401(k), then Roth',
  PreTaxFirst: 'IRA/401(k), then brokerage, then Roth',
  RothFirst: 'Roth, then brokerage, then IRA/401(k)',
  ProRata: 'a share from brokerage, IRA/401(k) and Roth each year',
};

const usd = (v) => Math.round(num(v)).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// Step 1 / 2 / 3 -- what the plan does now, at retirement, and through
// retirement -- built from the plan and the holdings. Every bullet states
// what the plan assumes or what the numbers show; none tells the reader
// what to do (education, not advice). Returns plain data; the tab renders it.
export function computeRetirementRoadmap({ holdings = [], funding, inputs = {}, rebalancePlan = null, yearsToRetirement = null, dividendTotals = null } = {}) {
  const first = funding?.firstRetired || null;
  const retired = yearsToRetirement !== null && yearsToRetirement <= 0;
  const payoutMode = funding?.payoutMode || inputs.dividendPayoutMode || 'reinvest';
  // Same truthiness as computeDripCashSplit, so the counts and the dollar
  // figures in the same sentence agree. Only holdings that actually pay
  // something are worth mentioning.
  const paying = holdings.filter((h) => h && (Number(h.shares) || 0) * (Number(h.annualDividendPerShare) || 0) > 0);
  const dripOff = paying.filter((h) => !h.dripEnabled);
  const payingTaxable = paying.filter((h) => h.taxTreatment === 'taxable');
  const sellRows = (rebalancePlan?.rows || []).filter((r) => r.action === 'sell' && Math.abs(r.diffDollars || 0) > 0);
  const trimRow = sellRows.length > 0 ? sellRows.reduce((max, r) => (Math.abs(r.diffDollars) > Math.abs(max.diffDollars) ? r : max), sellRows[0]) : null;
  const trimHolding = trimRow ? holdings.find((h) => h.id === trimRow.id) : null;

  // What brokerage dividends do in a given year of the plan, as a statement.
  const brokerageDividendLine = (row) => {
    if (!row || payingTaxable.length === 0) return null;
    if (payoutMode !== 'reinvest') {
      return row.dividendCash > 0.5
        ? { kind: 'dividendsTaken', text: payoutMode === 'asNeeded'
          ? `Your plan takes brokerage dividends as cash when the year needs them (${usd(row.dividendCash)} in ${row.year}); the setting is on Plan Settings.`
          : `Your plan takes brokerage dividends as cash (${usd(row.dividendCash)} in ${row.year}) before anything is sold; the setting is on Plan Settings.` }
        : null;
    }
    if (row.fromTaxable > 0.5) {
      return { kind: 'dividendsCouldCover', text: `In ${row.year} your plan draws ${usd(row.fromTaxable)} from the brokerage account. Brokerage dividends paid as cash instead of reinvested would cover up to ${usd(row.dividendCover)} of it, so that much less is sold. They are taxed in the year paid either way. Dividends inside IRAs and Roths stay in those accounts.` };
    }
    return { kind: 'noBrokerageDraw', text: `In ${row.year} your plan draws nothing from the brokerage account, so its dividends stay invested.` };
  };

  const step1 = {
    title: retired ? 'Now — in retirement' : `Now — ${yearsToRetirement === null ? 'while working' : `${yearsToRetirement} year${yearsToRetirement === 1 ? '' : 's'} to retirement`}`,
    heading: retired ? 'Spending comes from savings' : 'Saving and growing',
    bullets: [],
  };
  if (!retired) {
    if (dripOff.length > 0) {
      step1.bullets.push({ kind: 'cashDividends', symbols: dripOff.map((h) => h.symbol), text: `${dripOff.length} holding${dripOff.length === 1 ? ' pays' : 's pay'} dividends in cash${dividendTotals ? ` (${usd(dividendTotals.cash)}/yr)` : ''}: ${dripOff.slice(0, 3).map((h) => h.symbol).join(', ')}${dripOff.length > 3 ? ` +${dripOff.length - 3} more` : ''}. Cash that sits uninvested doesn't grow. Some people set dividends to reinvest automatically (called DRIP) while they are still working.` });
    } else if (paying.length > 0) {
      step1.bullets.push({ kind: 'allReinvested', text: `Every paying holding reinvests its dividends${dividendTotals ? ` (${usd(dividendTotals.drip)}/yr)` : ''}.` });
    }
  } else {
    const line = brokerageDividendLine(first);
    if (line) step1.bullets.push(line);
  }
  if (trimHolding) {
    step1.bullets.push({ kind: 'trim', symbol: trimHolding.symbol, amountDollars: Math.abs(trimRow.diffDollars), text: `Your largest position above its Target % is ${trimHolding.symbol}, by about ${usd(Math.abs(trimRow.diffDollars))} (Rebalance sub-tab).` });
  } else {
    step1.bullets.push({ kind: 'noTrim', text: 'No holding is above its Target %, or no Target %s are set yet (Rebalance sub-tab).' });
  }

  const step2 = {
    title: first ? `${first.year} — first retired year` : 'First retired year',
    heading: 'From saving to drawing',
    bullets: [],
  };
  if (first) {
    if (!retired) {
      const line = brokerageDividendLine(first);
      if (line) step2.bullets.push(line);
    }
    const claim = [inputs.claimingAge1, inputs.spouse2Enabled ? inputs.claimingAge2 : null].filter(Boolean);
    step2.bullets.push({ kind: 'guaranteed', text: `Guaranteed income (Social Security${claim.length ? ` at ${claim.join(' / ')}` : ''}, pensions, annuities) covers ${first.guaranteedPct.toFixed(0)}% of that year's spending.` });
  } else {
    step2.bullets.push({ kind: 'none', text: 'Your plan has no retired year yet — set a retirement age on Plan Settings.' });
  }

  const order = WITHDRAWAL_ORDER_LABELS[inputs.withdrawalStrategy] || WITHDRAWAL_ORDER_LABELS.TaxableFirst;
  const step3 = {
    title: 'Through retirement',
    heading: first && first.withdrawals + first.dividendCash > 0.5 ? 'Planned withdrawals' : 'Income covers spending',
    bullets: [],
  };
  if (first) {
    const parts = [
      first.fromTaxable > 0.5 ? `brokerage ${usd(first.fromTaxable)}` : null,
      first.fromPreTax > 0.5 ? `IRA/401(k) ${usd(first.fromPreTax)}` : null,
      first.fromRoth > 0.5 ? `Roth ${usd(first.fromRoth)}` : null,
    ].filter(Boolean);
    step3.bullets.push({ kind: 'withdrawals', text: parts.length > 0
      ? `In ${first.year} the plan withdraws ${usd(first.withdrawals)} from savings (${parts.join(', ')}), in your plan's order: ${order}.${first.dividendCash > 0.5 ? ` Brokerage dividends taken as cash add ${usd(first.dividendCash)}.` : ''}`
      : `In ${first.year} the plan withdraws nothing from savings; its order, when it does, is ${order}.` });
    const surplusRow = (funding.rows || []).find((r) => r.movedToBrokerage > 0.5 && r.rmd > 0);
    if (surplusRow) {
      step3.bullets.push({ kind: 'rmdSurplus', year: surplusRow.year, text: `From ${surplusRow.year}${surplusRow.age != null ? ` (age ${surplusRow.age})` : ''} required minimum distributions are more than spending needs, by ${usd(surplusRow.movedToBrokerage)} that year. The plan moves the extra to your brokerage account; it is taxed as income either way. An RMD can also be taken in kind, as shares moved to the brokerage account without selling.` });
    }
    const qcdRow = (funding.rows || []).find((r) => r.toCharity > 0.5);
    if (qcdRow) {
      step3.bullets.push({ kind: 'qcd', year: qcdRow.year, text: `From ${qcdRow.year}, ${usd(qcdRow.toCharity)} a year goes from your IRA straight to charity. It isn't taxed as income and isn't spending; once required minimum distributions begin, it also counts toward them.` });
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
