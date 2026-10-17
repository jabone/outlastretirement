// One- or two-sentence text alternatives for the charts (WCAG 1.1.1).
//
// Each summary is built from exactly the rows the chart draws, so it can
// never say something the picture does not show. The sentence is rendered
// as the chart's <figcaption>: visible to everyone, printed with the page,
// and read by a screen reader as the figure's name. Rule for every summary:
// where it starts, where it turns, where it ends, and the answer to the
// question the chart exists for. No advice, no new math.

// "$4.46 million" rather than "$4.46M": a screen reader says "M" as a letter.
export function spokenDollars(value) {
  const v = Number(value) || 0;
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1e6) {
    const m = (a / 1e6).toFixed(2).replace(/\.?0+$/, '');
    return `${sign}$${m} million`;
  }
  if (a >= 1e3) return `${sign}$${(Math.round(a / 1e3) * 1e3).toLocaleString('en-US')}`;
  return `${sign}$${Math.round(a).toLocaleString('en-US')}`;
}

// Series on the Risk tab's historical stress comparison, in legend order.
// LazyCharts draws its lines from this list, so the names cannot drift apart.
export const STRESS_SERIES = Object.freeze([
  { key: 'none', name: 'Baseline Plan' },
  { key: '1929', name: '1929 Great Depression' },
  { key: '1966', name: '1966 Lost Decade' },
  { key: '1973', name: '1973 Stagflation' },
  { key: '2000', name: '2000 Dot-Com Crash' },
  { key: '2008', name: '2008 Financial Crisis' },
]);

// The Dashboard's portfolio-over-time chart (projection.years). Each point
// is a year-END balance across every account the chart draws (HSA, stock
// and deferred comp included), so the first point is "the end of" the first
// year, not the Initial Nest Egg typed in at its start.
export function growthSummary(years, range = null) {
  if (!Array.isArray(years) || years.length === 0) return '';
  const total = (y) => Number(y.totalPortfolioEnding) || 0;
  const first = years[0];
  const last = years[years.length - 1];
  let peak = first;
  for (const y of years) if (total(y) > total(peak)) peak = y;

  let shape;
  if (peak === first) {
    shape = `Your savings are ${spokenDollars(total(first))} at the end of ${first.year} and are ${spokenDollars(total(last))} by ${last.year}.`;
  } else if (peak === last) {
    shape = `Your savings grow from ${spokenDollars(total(first))} at the end of ${first.year} to ${spokenDollars(total(last))} in ${last.year}.`;
  } else {
    shape = `Your savings grow from ${spokenDollars(total(first))} at the end of ${first.year} to a peak of ${spokenDollars(total(peak))} in ${peak.year}, then are ${spokenDollars(total(last))} in ${last.year}.`;
  }
  const short = years.find((y) => (Number(y.shortfall) || 0) > 0.01);
  const outcome = short
    ? `Starting in ${short.year}, the plan cannot fully cover your spending.`
    : `Every year's spending is covered through ${last.year}.`;
  // Changelog 363: the shaded Monte Carlo range, when it is drawn.
  const band = Array.isArray(range) && range.length ? range[range.length - 1] : null;
  const spread = band
    ? ` That is with average returns; in 8 of 10 simulated markets savings in ${band.year} end between ${spokenDollars(band.p10)} and ${spokenDollars(band.p90)}.`
    : '';
  return `${shape} ${outcome}${spread}`;
}

// The Risk tab's Monte Carlo percentile curves (rows of { year, p10, p50, p90 }).
export function monteCarloSummary(curves, successProbability) {
  if (!Array.isArray(curves) || curves.length === 0) return '';
  const last = curves[curves.length - 1];
  const parts = [];
  if (Number.isFinite(successProbability)) {
    parts.push(`In ${Math.round(successProbability)}% of the simulated markets the money lasts through ${last.year}.`);
  }
  parts.push(`By ${last.year}, a typical market (the median) leaves ${spokenDollars(last.p50)}, a strong one (best 10%) ${spokenDollars(last.p90)}, and a weak one (worst 10%) ${spokenDollars(last.p10)}.`);
  const out = curves.find((r) => (Number(r.p10) || 0) <= 0);
  if (out) parts.push(`In a weak market, savings run out around ${out.year}.`);
  return parts.join(' ');
}

// The Risk tab's historical stress comparison (rows of { year, none, 1929, ... }).
export function stressSummary(data, historyName = null) {
  if (!Array.isArray(data) || data.length === 0) return '';
  const last = data[data.length - 1];
  // Changelog 336: a replayed real start is its own line when present.
  const series = historyName && last.history !== undefined
    ? [...STRESS_SERIES, { key: 'history', name: historyName }]
    : STRESS_SERIES;
  const describe = ({ key, name }) => {
    const out = data.find((r) => (Number(r[key]) || 0) <= 0);
    return { name, end: Number(last[key]) || 0, out: out ? out.year : null };
  };
  const [base, ...rest] = series.map(describe);
  const baseText = base.out
    ? `Without a historical crash, savings run out in ${base.out}.`
    : `Without a historical crash, savings end at ${spokenDollars(base.end)} in ${last.year}.`;
  const each = rest
    .map((s) => (s.out ? `${s.name}, run out in ${s.out}` : `${s.name}, ${spokenDollars(s.end)}`))
    .join('; ');
  const worst = rest.reduce((w, s) => {
    const rank = (x) => (x.out ? x.out - 1e6 : x.end); // running out earliest is worst
    return rank(s) < rank(w) ? s : w;
  });
  return `${baseText} Replaying each historical market: ${each}. The hardest for this plan is the ${worst.name}.`;
}

// ---------------------------------------------------------------------------
// Second group (changelog 315): tax brackets, estate, scenario comparison,
// retirement funding.
// ---------------------------------------------------------------------------

const pct = (rate) => `${Math.round((Number(rate) || 0) * 100)}%`;

// Tax & Estate's bracket chart (taxVisualizerData rows).
export function taxBracketSummary(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const income = (r) => Number(r.totalOrdinaryGross) || 0;
  let peak = rows[0];
  for (const r of rows) if (income(r) > income(peak)) peak = r;
  const parts = [`Income subject to ordinary tax peaks at ${spokenDollars(income(peak))} in ${peak.year}, in the ${pct(peak.marginalBracket)} bracket.`];
  const retired = rows.filter((r) => r.isRetired && Number.isFinite(Number(r.marginalBracket)));
  if (retired.length > 0) {
    let top = retired[0];
    for (const r of retired) if (Number(r.marginalBracket) > Number(top.marginalBracket)) top = r;
    const counts = new Map();
    for (const r of retired) counts.set(Number(r.marginalBracket), (counts.get(Number(r.marginalBracket)) || 0) + 1);
    const common = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    parts.push(common === Number(top.marginalBracket)
      ? `In retirement, most years sit in the ${pct(common)} bracket.`
      : `In retirement, most years sit in the ${pct(common)} bracket; the highest is ${pct(top.marginalBracket)}, first in ${top.year}.`);
  }
  const conv = rows.filter((r) => (Number(r.convertAmount) || 0) > 0);
  if (conv.length > 0) {
    const total = conv.reduce((s, r) => s + (Number(r.convertAmount) || 0), 0);
    parts.push(`Roth conversions add ${spokenDollars(total)} of income from ${conv[0].year} to ${conv[conv.length - 1].year}.`);
  }
  return parts.join(' ');
}

// Tax & Estate's legacy chart (estateChartData rows; the 'Total Portfolio'
// row carries the totals the rest of the tab shows).
export function estateSummary(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const total = rows.find((r) => r.name === 'Total Portfolio');
  if (!total || !(total.Gross > 0)) return '';
  const cents = Math.round((total.Net / total.Gross) * 100);
  const parts = [`Your heirs would inherit ${spokenDollars(total.Gross)} and keep about ${spokenDollars(total.Net)} after taxes, roughly ${cents} cents of every dollar.`];
  const dragged = rows.filter((r) => r.name !== 'Total Portfolio' && (Number(r.TaxDrag) || 0) > 0).sort((a, b) => b.TaxDrag - a.TaxDrag);
  if (dragged.length > 0) {
    parts.push(`The largest share of the tax falls on the ${dragged[0].name}, which heirs pay income tax on as they withdraw it.`);
  } else if (total.TaxDrag > 0) {
    parts.push('The tax here is estate tax on the estate as a whole.');
  } else {
    parts.push('No tax is due on what they inherit.');
  }
  return parts.join(' ');
}

// Scenarios comparison and the one-lever compare (rows of { year, [name]: balance }).
export function scenarioSummary(data, names) {
  if (!Array.isArray(data) || data.length === 0 || !Array.isArray(names) || names.length === 0) return '';
  const outcome = (name) => {
    const withValue = data.filter((r) => Number.isFinite(Number(r[name])));
    if (withValue.length === 0) return null;
    const last = withValue[withValue.length - 1];
    const out = withValue.find((r) => Number(r[name]) <= 0);
    return { name, end: Number(last[name]), year: last.year, out: out ? out.year : null };
  };
  const all = names.map(outcome).filter(Boolean);
  if (all.length === 0) return '';
  const say = (o) => (o.out ? `${o.name} runs out in ${o.out}` : `${o.name} ends with ${spokenDollars(o.end)} in ${o.year}`);
  if (all.length === 2) {
    const [a, b] = all;
    let diff = '';
    if (!a.out && !b.out) {
      const d = b.end - a.end;
      diff = Math.abs(d) < 1000 ? ' The two end within $1,000 of each other.' : ` The difference is ${spokenDollars(Math.abs(d))}, in favor of ${d > 0 ? b.name : a.name}.`;
    }
    return `${say(a)}; ${say(b)}.${diff}`;
  }
  if (all.length <= 5) return `${all.map(say).join('; ')}.`;
  const rank = (o) => (o.out ? o.out - 1e9 : o.end);
  const sorted = [...all].sort((x, y) => rank(y) - rank(x));
  const brief = (o) => `${o.name}, ${o.out ? `which runs out in ${o.out}` : `at ${spokenDollars(o.end)} in ${o.year}`}`;
  return `Of ${all.length} scenarios, the strongest is ${brief(sorted[0])}; the weakest is ${brief(sorted[sorted.length - 1])}.`;
}

// Detailed Holdings' retirement funding chart (computeRetirementFunding rows).
export function fundingSummary(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const first = rows[0];
  const last = rows[rows.length - 1];
  const whole = (v) => `${Math.round(Number(v) || 0)}%`;
  const cashDividendPct = first.spending > 0 ? ((Number(first.dividendsAsCash) || 0) / first.spending) * 100 : 0;
  const parts = [`In ${first.year}, guaranteed income covers ${whole(first.guaranteedPct)} of spending (taxes included), dividends taken as cash ${whole(cashDividendPct)}, and selling investments ${whole(first.shareSalesPct)}.`];
  if (last !== first) parts.push(`By ${last.year}, guaranteed income covers ${whole(last.guaranteedPct)}.`);
  const short = rows.find((r) => (Number(r.deficit) || 0) > 0.5);
  parts.push(short ? `From ${short.year}, spending is not fully covered.` : 'Spending is covered in every retired year.');
  return parts.join(' ');
}

// ---- The smaller charts (changelog 325) ----

// Readiness: Die with Zero (rows of { year, currentBalance, dwzBalance }).
export function dieWithZeroSummary(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const last = rows[rows.length - 1];
  const current = Number(last.currentBalance) || 0;
  const dwz = Number(last.dwzBalance) || 0;
  return `Spending as you plan to now leaves ${spokenDollars(current)} in ${last.year}. `
    + `The Die with Zero path spends more along the way and leaves ${spokenDollars(dwz)}.`;
}

// Readiness: retirement age finder (rows of { age, endingBalance }).
export function ageFinderSummary(rows, earliestFundedAge) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const first = rows[0];
  const last = rows[rows.length - 1];
  const bal = (r) => Number(r.endingBalance) || 0;
  const parts = [`Retiring at ${first.age} ends the plan with ${spokenDollars(bal(first))}; retiring at ${last.age}, with ${spokenDollars(bal(last))}.`];
  const funded = rows.find((r) => r.age === earliestFundedAge);
  parts.push(funded
    ? `The earliest age tried at which the money lasts is ${funded.age}.`
    : 'At none of the ages tried does the money last.');
  return parts.join(' ');
}

// The Cash Flow map for one year (cashFlowSankeyFlows output).
export function cashFlowSummary(year, flows) {
  const inflows = (flows && flows.inflows) || [];
  const outflows = (flows && flows.outflows) || [];
  if (inflows.length === 0 && outflows.length === 0) return '';
  const total = inflows.reduce((s, f) => s + f.value, 0);
  const top = (list) => [...list].sort((a, b) => b.value - a.value).slice(0, 3)
    .map((f) => `${f.name.toLowerCase()} ${spokenDollars(f.value)}`);
  const join = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
  const lead = year ? `In ${year}, ` : '';
  const from = inflows.length === 1 ? `all of it from ${inflows[0].name.toLowerCase()}` : `the most from ${join(top(inflows))}`;
  return `${lead}${spokenDollars(total)} comes in, ${from}. `
    + `The most goes to ${join(top(outflows))}.`;
}

// Holdings: benchmark trajectory (rows of { year, invested, spy, qqq, portfolio }).
export function benchmarkSummary(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const last = rows[rows.length - 1];
  const parts = [`By ${last.year} you had put in ${spokenDollars(last.invested)}.`];
  parts.push(`The same money in the S&P 500 would be ${spokenDollars(last.spy)}, and in the Nasdaq-100 ${spokenDollars(last.qqq)}.`);
  if (last.portfolio !== null && last.portfolio !== undefined && Number.isFinite(Number(last.portfolio))) {
    parts.push(`Your portfolio is ${spokenDollars(last.portfolio)}.`);
  }
  return parts.join(' ');
}

// Holdings: current vs. target weights (rows of { symbol, 'Current %', 'Target %' }).
export function rebalanceSummary(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const pct = (v) => `${(Math.round((Number(v) || 0) * 10) / 10).toString()}%`;
  const gaps = rows
    .map((r) => ({ symbol: r.symbol, cur: Number(r['Current %']) || 0, tgt: Number(r['Target %']) || 0 }))
    .map((r) => ({ ...r, gap: r.cur - r.tgt }))
    .filter((r) => Math.abs(r.gap) >= 0.5)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  if (gaps.length === 0) return rows.length === 1 ? 'The holding is within half a percent of its target.' : `All ${rows.length} holdings are within half a percent of their targets.`;
  const say = (r) => `${r.symbol} is ${pct(r.cur)} against a target of ${pct(r.tgt)}`;
  const shown = gaps.slice(0, 2).map(say).join('; ');
  const more = gaps.length > 2 ? ` ${gaps.length - 2} more ${gaps.length - 2 === 1 ? 'holding is' : 'holdings are'} off target by half a percent or more.` : '';
  return `The largest gaps: ${shown}.${more}`;
}

// Holdings: a donut of slices ({ label, value, pct? }).
export function allocationSummary(slices, what = 'Your holdings') {
  const list = (Array.isArray(slices) ? slices : []).filter((s) => (Number(s.value) || 0) > 0);
  if (list.length === 0) return '';
  const total = list.reduce((s, x) => s + Number(x.value), 0);
  const share = (x) => Math.round((Number(x.value) / total) * 100);
  const sorted = [...list].sort((a, b) => b.value - a.value);
  const shown = sorted.slice(0, 3).map((x) => `${x.label} ${share(x)}%`);
  const rest = sorted.slice(3);
  const tail = rest.length > 0
    ? `, and ${rest.length} other${rest.length === 1 ? '' : 's'} ${100 - sorted.slice(0, 3).reduce((s, x) => s + share(x), 0)}%`
    : '';
  return `${what}, ${spokenDollars(total)} in all: ${shown.join(', ')}${tail}.`;
}

// Holdings: dividends by month (computeRollingDividendTimeline rows with
// { value, settled, basis, longLabel }).
export function dividendMonthSummary(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const val = (r) => Number(r.value) || 0;
  const past = rows.filter((r) => r.settled);
  const ahead = rows.filter((r) => !r.settled);
  const parts = [];
  if (past.length > 0) {
    const recorded = past.filter((r) => r.basis === 'actual').length;
    const basis = recorded === past.length ? 'all recorded'
      : recorded === 0 ? 'all estimated' : `${recorded} recorded, the rest estimated`;
    parts.push(`Over the past ${past.length === 1 ? 'month' : `${past.length} months`}, dividends total ${spokenDollars(past.reduce((s, r) => s + val(r), 0))} (${basis}).`);
  }
  if (ahead.length > 0) parts.push(`${ahead.length === 1 ? 'The next month is' : `The next ${ahead.length} months are`} estimated at ${spokenDollars(ahead.reduce((s, r) => s + val(r), 0))}.`);
  const big = rows.reduce((m, r) => (val(r) > val(m) ? r : m), rows[0]);
  if (val(big) > 0) parts.push(`The largest month is ${big.longLabel || big.label} at ${spokenDollars(val(big))}.`);
  return parts.join(' ');
}
