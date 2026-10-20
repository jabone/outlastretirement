// One verdict for the whole app (outside review, 2026-09-28).
//
// The Dashboard used to answer "will my money last?" three ways at once:
// "Fully Funded" (the single average-returns projection), a Monte Carlo
// success rate underneath it, and a Plan Feedback card that showed 100% or
// 0% while the simulation was still running. A plan that lasts on average
// but in only half of simulated markets read as both a success and a
// shortfall. Every place that states the verdict now reads this function,
// so they cannot disagree, and a result that is not in yet says so.
//
// Inputs:
//   isSuccessful  the average-returns projection covers every year's spending
//   years         projection.years (for the first shortfall year)
//   mc            monteCarloRange(): { status: 'fresh'|'stale'|'none', successProbability, trials, longevitySampled }
//   mcPending     a Monte Carlo run is under way or about to start
//   history       (changelog 363) the plan's every-retirement-since-1928
//                 result, { lasted, count, firstStart }, or null. Used only
//                 while no Monte Carlo result for this plan is in -- in the
//                 phone apps, where the Monte Carlo does not run on its own,
//                 and during the first run -- so the verdict always rests
//                 on a market check. A fresh Monte Carlo always wins: one
//                 measure decides the label at a time, never two. With a
//                 fresh Monte Carlo it is still quoted as a second line.
//
// Returns { tone, label, detail }:
//   tone   'good' | 'caution' | 'risk' | 'pending' | 'neutral'
//   label  a few words for badges and the status bar
//   detail one sentence for the Dashboard card and screen readers

export const VERDICT_THRESHOLDS = Object.freeze({ good: 90, caution: 75 });

// The one comparison rule. Every surface that prints a Monte Carlo success
// rate prints it as a whole percent, so the band is decided on that same
// whole percent: 89.6% prints "90%" and reads "On track" everywhere, never
// "90%" beside "Mostly on track".
export function verdictPct(successProbability) {
  const n = Number(successProbability);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// 'good' | 'caution' | 'risk' for a success rate, or null when there is none.
export function verdictBand(successProbability) {
  const pct = verdictPct(successProbability);
  if (pct === null) return null;
  if (pct >= VERDICT_THRESHOLDS.good) return 'good';
  if (pct >= VERDICT_THRESHOLDS.caution) return 'caution';
  return 'risk';
}

// The first year spending is not fully covered: the same test the engine's
// isSuccessful uses (a shortfall over a cent). Every surface that names a
// run-out year reads this, so the Readiness cards and the verdict name the
// same year.
export function firstShortfallRow(years) {
  return (years || []).find((y) => (Number(y && y.shortfall) || 0) > 0.01) || null;
}

// "84 of 98 real retirements since 1928" -- the shared wording.
function historyPhrase(h, keep = '') {
  return `${h.lasted} of ${h.count} real retirements since ${h.firstStart}${keep}`;
}

// ", keeping at least $200,000" when the plan has a "keep at least" floor
// (changelog 448): the Monte Carlo and historical counts include it.
export function floorPhrase(floor) {
  const f = Math.max(0, Number(floor) || 0);
  return f > 0 ? `, keeping at least $${Math.round(f).toLocaleString('en-US')}` : '';
}

export function planVerdict({ isSuccessful, years = [], mc = { status: 'none' }, mcPending = false, history = null, floor = 0, floorBreachYear = null }) {
  const keep = floorPhrase(floor);
  // With average returns the money lasts, but it may still dip below the
  // floor; say so rather than let "Lasts" stand alone (changelog 448).
  const lastsAvg = keep && floorBreachYear
    ? `Lasts with average returns, though it dips below $${Math.round(floor).toLocaleString('en-US')} in ${floorBreachYear}`
    : 'Lasts with average returns';
  const fresh = mc && mc.status === 'fresh' && Number.isFinite(mc.successProbability);
  const histOk = history && history.count > 0 && Number.isFinite(history.lasted) ? history : null;
  const hist = !fresh ? histOk : null;
  // Changelog 364: with a fresh Monte Carlo deciding the label, the real
  // retirements since 1928 still appear as a second line of evidence.
  const alsoHist = fresh && histOk ? ` It also lasted through ${historyPhrase(histOk, keep)}.` : '';
  const pct = fresh ? verdictPct(mc.successProbability) : null;
  const band = fresh ? verdictBand(mc.successProbability) : null;
  const trials = fresh ? (mc.trials || 1000).toLocaleString('en-US') : null;
  const horizon = `${fresh && mc.longevitySampled ? 'as long as you do' : 'to the end of the plan'}${keep}`;

  if (!isSuccessful) {
    const short = firstShortfallRow(years);
    const when = short ? ` starting in ${short.year}` : '';
    const odds = fresh ? ` ${pct}% of ${trials} simulated markets last ${horizon}.${alsoHist}`
      : hist ? ` It lasted through ${historyPhrase(hist, keep)}.` : '';
    return {
      tone: 'risk',
      label: 'Runs short',
      detail: `Even with average returns, spending is not fully covered${when}.${odds}`,
    };
  }

  if (fresh) {
    if (band === 'good') {
      return {
        tone: 'good',
        label: 'On track',
        detail: `${lastsAvg}, and ${pct}% of ${trials} simulated markets last ${horizon}.${alsoHist}`,
      };
    }
    if (band === 'caution') {
      return {
        tone: 'caution',
        label: 'Mostly on track',
        detail: `${lastsAvg}, and ${pct}% of ${trials} simulated markets last ${horizon}; a poor run of markets could fall short.${alsoHist}`,
      };
    }
    return {
      tone: 'risk',
      label: 'At risk',
      detail: `${lastsAvg}, but only ${pct}% of ${trials} simulated markets last ${horizon}.${alsoHist}`,
    };
  }

  if (mcPending) {
    return {
      tone: 'pending',
      label: 'Checking markets',
      detail: hist
        ? `${lastsAvg} and through ${historyPhrase(hist, keep)}. Checking simulated markets too…`
        : `${lastsAvg}. Checking how it holds up across simulated good and bad markets…`,
    };
  }

  // No Monte Carlo yet: the real retirements since 1928, read on the same
  // bands as the Monte Carlo's success rate.
  if (hist) {
    const hPct = (hist.lasted / hist.count) * 100;
    const hBand = verdictBand(hPct);
    const tail = 'Run the Monte Carlo for the simulated-market check.';
    if (hBand === 'good') {
      return { tone: 'good', label: 'On track', detail: `${lastsAvg}, and through ${historyPhrase(hist, keep)}. ${tail}` };
    }
    if (hBand === 'caution') {
      return { tone: 'caution', label: 'Mostly on track', detail: `${lastsAvg}, and through ${historyPhrase(hist, keep)}; a poor run of markets could fall short. ${tail}` };
    }
    return { tone: 'risk', label: 'At risk', detail: `${lastsAvg}, but through only ${historyPhrase(hist, keep)}. ${tail}` };
  }

  return {
    tone: 'neutral',
    label: 'Lasts on average',
    detail: `${lastsAvg}. Run the Monte Carlo to see how often it lasts in good and bad markets.`,
  };
}

// A saved scenario's status in the same vocabulary (Scenarios side-by-side):
// its stored isSuccessful and Monte Carlo rate, read exactly as the
// Dashboard reads the live plan's.
export function scenarioVerdict(metrics) {
  const p = metrics?.successProbability;
  const has = p !== null && p !== undefined && p !== '' && Number.isFinite(Number(p));
  return planVerdict({
    isSuccessful: !!metrics?.isSuccessful,
    mc: has ? { status: 'fresh', successProbability: Number(p) } : { status: 'none' },
  });
}

// The color each tone is drawn in.
export function verdictColor(tone) {
  return { good: 'var(--success)', caution: 'var(--warning)', risk: 'var(--error)' }[tone] || 'var(--text-secondary)';
}

// The sidebar-status class for a tone (index.css).
export function verdictClass(tone) {
  return { good: 'success', caution: 'warning', risk: 'danger' }[tone] || 'neutral';
}
