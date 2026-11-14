// "Worth a closer look" (the Dashboard's in-app checks).
//
// Plan Feedback names general patterns. These checks name the exact years
// and amounts in this plan's own projection where a small change could
// matter: income just over or just under a Medicare or marketplace line,
// room left in the 12% bracket, gifts to charity that could come from an
// IRA, and a withdrawal order or claiming age that does better on the
// plan's own numbers.
//
// Every figure is the engine's: read from the projection's rows, or from a
// second projection with one setting changed. Nothing here re-prices tax.
// Amounts are in today's dollars, rounded to $1,000. Each finding says what
// the plan shows and links to the page that tests it, never what to do.
//
// `projection` must be the engine's own (nominal) projection, the one
// runProjection returns, not a copy already converted for display.
//
// thingsToLookAt(inputs, projection) runs no new projections. Passing
// { runProjection } adds the checks that re-run the plan with one setting
// changed (bracket room, withdrawal order, claiming age, the marketplace
// credit at stake): about ten more projections, so the card runs them just
// after first paint.

import { irmaaScaledThresholds, irmaaTierReached, legacyAfterTaxes } from '../calculator';
import { compareSsClaimingAges } from './retirementFunding';
import { sanitizeForProjection } from './oneLeverCompare';
import { finalBalanceFactor } from './displayDollars';

// What makes a finding worth a line, in today's dollars. Shown on the card.
export const NEAR_LINE = 10000; // income this close above a Medicare or marketplace line
export const NEAR_LINE_BELOW = 5000; // income this close below one
export const MIN_BRACKET_ROOM = 5000; // a year's room in the 12% bracket
export const MIN_PRE_TAX = 25000; // pre-tax savings left for that room to matter
export const MIN_SAVING = 10000; // what a withdrawal order must save over the plan...
export const MIN_SAVING_SHARE = 0.02; // ...and at least this share of lifetime taxes and premiums
export const MIN_CLAIM_GAIN = 25000; // what a claiming age must add to the ending balance...
export const MIN_CLAIM_SHARE = 0.03; // ...and at least this share of it
export const HORIZON_YEARS = 20; // years further out than this are left off a list of years

export const WITHDRAWAL_ORDER_LABEL = {
  TaxableFirst: 'from brokerage (taxable) accounts first',
  PreTaxFirst: 'from pre-tax accounts first',
  RothFirst: 'from Roth accounts first',
  ProRata: 'from every account at once, in proportion to its balance',
};
// The option text on Plan > Spending > Withdrawals, so a link can name it.
export const WITHDRAWAL_ORDER_OPTION = {
  TaxableFirst: 'Taxable Brokerage First (Standard)',
  PreTaxFirst: 'Pre-Tax Account First',
  RothFirst: 'Roth Account First',
  ProRata: 'Pro-Rata Proportional Draws',
};

const BASIS = 'This is with average returns every year and the plan’s set lifespans; a different order of returns or a longer life can change it.';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const real = (v, row) => num(v) / (num(row.priceIndex) || num(row.inflFactor) || 1);
const usd = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
// "about $4,000", or "less than $1,000" for a figure that rounds to nothing.
export const about = (v) => (Math.abs(v) < 1000 ? 'less than $1,000' : `about ${usd(Math.round(Math.abs(v) / 1000) * 1000)}`);
const range = (lo, hi) => (Math.round(lo / 1000) === Math.round(hi / 1000) ? about(lo) : `${usd(Math.round(lo / 1000) * 1000)} to ${usd(Math.round(hi / 1000) * 1000)}`);
const statusOf = (row) => row.bracketStatus || row.householdStatus || 'Single';

// Consecutive years as "2041" or "2041–2047"; several runs joined with "and".
export function yearSpan(years) {
  const runs = [];
  for (const y of years) {
    const last = runs[runs.length - 1];
    if (last && y === last[1] + 1) last[1] = y; else runs.push([y, y]);
  }
  const parts = runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`));
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function firstRun(rows, same = () => true) {
  const out = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && (r.year !== last.year + 1 || !same(last, r))) break;
    out.push(r);
  }
  return out;
}

function nameOf(inputs, which) {
  const n = which === 1 ? inputs.spouse1Name : inputs.spouse2Name;
  const fallback = which === 1 ? 'Primary' : 'Spouse';
  return n && n !== fallback ? n : null;
}

const firstShortYear = (proj) => {
  const r = (proj.years || []).find((y) => num(y.shortfall) > 0 || num(y.lifestyleDeficit) > 0);
  return r ? r.year : null;
};
const runsShort = (proj) => proj.isSuccessful === false;

// 1. The plan runs short on average returns: everything else waits.
function shortfallCheck(inputs, projection) {
  if (!runsShort(projection)) return null;
  const row = (projection.years || []).find((r) => num(r.shortfall) > 0 || num(r.lifestyleDeficit) > 0);
  if (!row) return null;
  let age = '';
  if (row.age1 != null && row.spouse1Alive !== false) {
    const n = nameOf(inputs, 1);
    age = ` (${n ? `${n} is` : 'you are'} ${row.age1})`;
  } else if (row.age2 != null && row.spouse2Alive !== false) {
    const n = nameOf(inputs, 2);
    age = ` (${n ? `${n} is` : 'your spouse is'} ${row.age2})`;
  }
  return {
    id: 'shortfall',
    tone: 'danger',
    title: `The money runs short in ${row.year}`,
    text: `With average returns every year, this plan runs out of savings in ${row.year}${age}. That comes first: Three changes that would help, at the top of the Dashboard, shows what would make it last. Ideas for paying less tax only matter once the plan lasts, so this list leaves them out until then.`,
    action: { scrollTo: 'three-changes', label: 'See the three changes →' },
    figure: { year: row.year },
  };
}

// 2. Medicare: the income that sets a year's premium is just over a
// surcharge line, or just under one. The premium is set from the tax
// return two years earlier, at that return's filing status.
function irmaaCheck(inputs, projection) {
  const years = projection.years || [];
  const byYear = new Map(years.map((r) => [r.year, r]));
  const first = years.length ? years[0].year : 0;
  const over = [];
  const under = [];
  for (const r of years) {
    if (r.irmaaBasisSource !== 'lookback' || !(num(r.irmaaCost) > 0)) continue;
    const basis = byYear.get(r.year - 2);
    if (!basis || basis.year < first) continue;
    const status = basis.householdStatus || statusOf(basis);
    if (status === 'MFS') continue; // priced per spouse on their own share; not checked here
    const t = irmaaScaledThresholds(status, !!inputs.mfsLivedWithSpouse, num(r.irmaaThresholdFactor) || 1, Number.isFinite(r.irmaaTopTierFactor) ? r.irmaaTopTierFactor : null);
    const magi = num(r.irmaaBasisMagi);
    let tier = -1;
    for (let i = 0; i < t.length; i++) if (Number.isFinite(t[i]) && irmaaTierReached(magi, t, i)) tier = i;
    if (tier >= 0 && real(magi - t[tier], r) <= NEAR_LINE) over.push({ r, basis, by: real(magi - t[tier], r), nominal: magi - t[tier] });
    else if (tier + 1 < t.length && Number.isFinite(t[tier + 1]) && real(t[tier + 1] - magi, r) <= NEAR_LINE_BELOW) under.push({ r, basis, by: real(t[tier + 1] - magi, r) });
  }
  const horizon = first + HORIZON_YEARS;
  const lever = (b, amount) => {
    if (num(b.convertAmount) >= amount) return 'a smaller Roth conversion that year';
    if (num(b.realizedGains) >= amount) return 'less in realized gains (profit on investments sold) that year';
    return null;
  };
  const action = (b) => (num(b.convertAmount) > 0 && !inputs.rothConversionIrmaaCapEnabled
    ? { tab: 'settings', subTab: 'taxes', field: 'toggle-rothConversionIrmaaCap', label: 'Open the Stay under an IRMAA tier setting →' }
    : { tab: 'yearledger', label: 'See the Medicare figures in Year by Year →' });
  const intro = 'Medicare sets each year’s premium from your income two years earlier, and adds a surcharge (called IRMAA) in steps once that income passes set lines.';
  if (over.length) {
    const f = over[0];
    const others = over.slice(1).map((o) => o.r.year).filter((y) => y <= horizon);
    const how = lever(f.basis, f.nominal);
    return {
      id: 'irmaaOver',
      tone: 'warning',
      title: `Just over a Medicare surcharge line in ${f.r.year}`,
      text: `${intro} Income in ${f.basis.year} is ${about(f.by)} over one of those lines (today's dollars), so the ${f.r.year} premium is one step higher for the whole year; a single dollar over adds the full step. About that much less income in ${f.basis.year}${how ? `, from ${how},` : ''} would keep the ${f.r.year} premium one step lower.${others.length ? ` The same happens in ${yearSpan(others)}.` : ''}`,
      action: action(f.basis),
      figure: { year: f.r.year, basisYear: f.basis.year, over: Math.round(f.by) },
    };
  }
  if (under.length) {
    const f = under[0];
    return {
      id: 'irmaaUnder',
      tone: 'info',
      title: `Close to a Medicare surcharge line in ${f.r.year}`,
      text: `${intro} Income in ${f.basis.year} is ${about(f.by)} below one of those lines (today's dollars). A larger Roth conversion, or selling more investments at a gain, in ${f.basis.year} could cross it and raise the ${f.r.year} premium a step for the whole year.`,
      action: action(f.basis),
      figure: { year: f.r.year, basisYear: f.basis.year, under: Math.round(f.by) },
    };
  }
  return null;
}

// 3. Marketplace health insurance before 65: income over or near the line
// where the premium credit stops (400% of the federal poverty level). Only
// when the plan works the credit out; a plan whose health cost is entered
// already net of any credit has nothing here to gain or lose.
function acaCheck(inputs, projection, runProjection) {
  if (inputs.acaCreditSource === 'manual') return null;
  const rows = (projection.years || []).filter((r) => num(r.acaCliffThreshold) > 0);
  if (!rows.length) return null;
  const intro = 'Before Medicare at 65, this plan buys health insurance on the ACA marketplace (HealthCare.gov). The premium credit that lowers that cost stops completely once income passes 400% of the federal poverty level.';
  const over = rows.filter((r) => r.acaCliffBreached);
  const byConversion = over.filter((r) => num(r.convertAmount) > 0 && num(r.convertAmount) >= num(r.acaMagi) - num(r.acaCliffThreshold));
  if (byConversion.length) {
    const span = yearSpan(byConversion.map((r) => r.year));
    let stake = 0;
    if (typeof runProjection === 'function' && !inputs.acaCliffProtectionEnabled) {
      const alt = runProjection(sanitizeForProjection({ ...inputs, acaCliffProtectionEnabled: true }));
      const altBy = new Map((alt.years || []).map((r) => [r.year, r]));
      for (const r of byConversion) {
        const a = altBy.get(r.year);
        if (a) stake += real(num(a.acaSubsidyApplied) - num(r.acaSubsidyApplied), r);
      }
    }
    const one = byConversion.length === 1;
    return {
      id: 'acaOver',
      tone: 'warning',
      title: `Roth conversions cost the marketplace credit in ${span}`,
      text: `${intro} Roth conversions push income over that line in ${span}, so the plan gets no credit ${one ? 'that year' : 'in those years'}.${stake >= 1000 ? ` Keeping conversions under the line would keep ${about(stake)} of credit (today's dollars), though converting less now can mean more tax later.` : ''}${inputs.acaCliffProtectionEnabled ? '' : ' ACA Cliff Protection keeps conversions under that line; turning it on shows the whole effect.'}`,
      action: inputs.acaCliffProtectionEnabled
        ? { tab: 'yearledger', label: 'See those years in Year by Year →' }
        : { tab: 'settings', subTab: 'taxes', field: 'toggle-acaCliffProtection', label: 'Open ACA Cliff Protection →' },
      figure: { years: byConversion.map((r) => r.year), stake: Math.round(stake) },
    };
  }
  const near = over.filter((r) => real(num(r.acaMagi) - num(r.acaCliffThreshold), r) <= NEAR_LINE);
  if (near.length) {
    const f = near[0];
    const others = near.slice(1).map((r) => r.year);
    return {
      id: 'acaOver',
      tone: 'warning',
      title: `Just over the marketplace credit line in ${f.year}`,
      text: `${intro} Income in ${f.year} is ${about(real(num(f.acaMagi) - num(f.acaCliffThreshold), f))} over that line (today's dollars), so the plan gets no credit that year.${others.length ? ` The same happens in ${yearSpan(others)}.` : ''} Each year is flagged in the Year by Year ledger's ACA / FPL column.`,
      action: { tab: 'yearledger', label: 'See those years in Year by Year →' },
      figure: { years: near.map((r) => r.year) },
    };
  }
  const under = rows.filter((r) => !r.acaCliffBreached && num(r.acaMagi) > 0 && real(num(r.acaCliffThreshold) - num(r.acaMagi), r) <= NEAR_LINE_BELOW);
  if (under.length) {
    const f = under[0];
    return {
      id: 'acaUnder',
      tone: 'info',
      title: `Close to the marketplace credit line in ${f.year}`,
      text: `${intro} Income in ${f.year} is ${about(real(num(f.acaCliffThreshold) - num(f.acaMagi), f))} below that line (today's dollars). A larger Roth conversion, or selling more investments at a gain, that year could cross it and lose the whole credit for the year.`,
      action: { tab: 'yearledger', label: 'See those years in Year by Year →' },
      figure: { year: f.year },
    };
  }
  return null;
}

// 4. Retired years with room left in the 12% bracket, sized by the engine:
// the plan re-run converting to the top of the 12% bracket, so taxable
// Social Security, state tax and Medicare lines all come out as they would.
// Left out while the plan runs short, and in marketplace years.
export function bracketRoomCheck(inputs, projection, runProjection) {
  if (typeof runProjection !== 'function' || runsShort(projection)) return null;
  const years = projection.years || [];
  if (!years.some((r) => r.isRetired && num(r.marginalBracket) <= 0.12 && real(r.preTaxStart, r) >= MIN_PRE_TAX)) return null;
  const altInputs = { ...inputs, rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.12, rothConversionDurationYears: 0, rothConversionDelayUntilRetire: true };
  const alt = runProjection(sanitizeForProjection(altInputs));
  const altBy = new Map((alt.years || []).map((r) => [r.year, r]));
  const extra = new Map();
  const rows = years.filter((r) => {
    const a = altBy.get(r.year);
    if (!a || !r.isRetired || num(r.acaCliffThreshold) > 0 || num(a.acaCliffThreshold) > 0) return false;
    if (num(r.marginalBracket) > 0.12 || real(r.preTaxStart, r) < MIN_PRE_TAX) return false;
    const more = num(a.convertAmount) - num(r.convertAmount);
    extra.set(r, { more, tax: num(a.federalTax) + num(a.stateTax) - num(r.federalTax) - num(r.stateTax) });
    return real(more, r) >= MIN_BRACKET_ROOM;
  });
  if (!rows.length) return null;
  const run = firstRun(rows, (a, b) => statusOf(a) === statusOf(b));
  const amounts = run.map((r) => real(extra.get(r).more, r));
  const moved = run.reduce((s, r) => s + extra.get(r).more, 0);
  const taxed = run.reduce((s, r) => s + extra.get(r).tax, 0);
  const rate = moved > 0 ? Math.round((taxed / moved) * 100) : 0;
  const span = yearSpan(run.map((r) => r.year));
  const one = run.length === 1;
  const already = run.some((r) => num(r.convertAmount) > 0);
  const legacy = (p, i) => legacyAfterTaxes(i, p) / (finalBalanceFactor(p.years || []) || 1);
  const legacyDiff = legacy(alt, altInputs) - legacy(projection, inputs);
  const rateText = rate > 13
    ? `about ${rate}% on this plan, more than 12% because extra income also makes more of Social Security taxable and adds state tax`
    : `about ${rate}% on this plan`;
  return {
    id: 'bracketRoom',
    tone: 'info',
    title: `Room in the 12% bracket in ${span}`,
    text: `In ${span}, the plan's taxable income stays below the top of the 12% federal tax bracket${already ? ', even with the Roth conversions it already makes' : ''}. A Roth conversion moves pre-tax savings (traditional IRA and 401(k) money) into a Roth account and pays the income tax that year. Converting up to the top of the 12% bracket would move ${range(Math.min(...amounts), Math.max(...amounts))} ${one ? 'that year' : 'a year'} (today's dollars), and the federal and state tax on it works out to ${rateText}. Doing that every year it fits, the plan ends with ${about(legacyDiff)} ${legacyDiff >= 0 ? 'more' : 'less'} after tax (today's dollars). Converting pays off only if that money would otherwise be taxed at a higher rate later, and the extra income also counts toward Medicare's surcharge lines two years on. The Roth Ladder Optimizer tests filling each bracket on this plan.`,
    action: { tab: 'strategy', subTab: 'rothladder', label: 'Open the Roth Ladder Optimizer →' },
    figure: { years: run.map((r) => r.year), low: Math.round(Math.min(...amounts)), high: Math.round(Math.max(...amounts)), rate, legacyDiff: Math.round(legacyDiff) },
  };
}

// 5. Gifts to charity paid from other money while an IRA could pay them.
// The engine lets the pre-tax owner give from 71: Spouse 1 while alive,
// then the survivor.
function qcdCheck(inputs, projection) {
  const gifts = num(inputs.charitableGivingAnnual);
  if (!(gifts > 0) || num(inputs.qcdAnnualAmount) > 0) return null;
  const years = projection.years || [];
  const row = years.find((r) => {
    if (!(real(r.preTaxStart, r) > 0)) return false;
    if (r.spouse1Alive !== false) return r.age1 != null && r.age1 >= 71;
    return r.age2 != null && r.age2 >= 71 && r.spouse2Alive !== false;
  });
  if (!row) return null;
  const owner = row.spouse1Alive !== false ? 1 : 2;
  const who = nameOf(inputs, owner) || (owner === 1 ? 'the first person' : 'the surviving spouse');
  const rmd = years.find((r) => num(r.rmdAmount) > 0);
  return {
    id: 'qcd',
    tone: 'info',
    title: `Gifts to charity could come from an IRA from ${row.year}`,
    text: `The plan gives ${usd(gifts)} a year to charity (today's dollars) from cash or a brokerage account. People who take the standard deduction usually get no tax break for gifts like that. From age 70½, a gift sent straight from a traditional IRA to the charity (a qualified charitable distribution, or QCD) is not counted as income at all${rmd ? `, and from ${rmd.year} it also counts toward the required minimum distributions (the amount the IRS requires you to take out of pre-tax accounts each year)` : ''}. It has to come from an IRA, so 401(k) money would first need to move to one, and there is a yearly limit ($111,000 in 2026). The plan would start them in ${row.year}, the year ${who} turns 71; the Qualified Charitable Distribution setting shows the effect.`,
    action: { tab: 'settings', subTab: 'taxes', field: 'field-qcdAnnualAmount', label: 'Open the charitable distribution setting →' },
    figure: { year: row.year },
  };
}

const sumReal = (proj, f) => (proj.years || []).reduce((s, r) => s + real(f(r), r), 0);
const taxesOf = (proj) => sumReal(proj, (r) => num(r.totalTaxesPaid));
const premiumsOf = (proj) => sumReal(proj, (r) => num(r.irmaaCost));
const convertedOf = (proj) => sumReal(proj, (r) => num(r.convertAmount));
const afterTaxEnd = (proj, inputs) => legacyAfterTaxes(inputs, proj) / (finalBalanceFactor(proj.years || []) || 1);

// 6. Another withdrawal order does better on this plan's own numbers: lasts
// longer when the plan runs short; otherwise costs less in taxes and
// Medicare premiums without leaving less after tax.
export function withdrawalOrderCheck(inputs, projection, runProjection) {
  if (typeof runProjection !== 'function') return null;
  const current = inputs.withdrawalStrategy || 'TaxableFirst';
  const curLabel = WITHDRAWAL_ORDER_LABEL[current] || current;
  const action = (order) => ({ tab: 'settings', subTab: 'spending', field: 'field-withdrawalStrategy', label: `Open the withdrawal order (${WITHDRAWAL_ORDER_OPTION[order]}) →` });
  const runs = Object.keys(WITHDRAWAL_ORDER_LABEL).filter((o) => o !== current).map((order) => {
    const i = sanitizeForProjection({ ...inputs, withdrawalStrategy: order });
    return { order, inputs: i, proj: runProjection(i) };
  });
  const rothNote = (order) => (order === 'RothFirst' ? ' Spending Roth money first uses up the account that is never taxed: the money that most often pays for late-life care, softens a surviving spouse’s higher single-filer tax rates, or passes to heirs tax-free. Once spent it cannot be put back.' : '');

  if (runsShort(projection)) {
    const baseShort = firstShortYear(projection);
    let best = null;
    for (const r of runs) {
      const y = runsShort(r.proj) ? firstShortYear(r.proj) : Infinity;
      if (baseShort !== null && y >= baseShort + 2 && (!best || y > best.y)) best = { ...r, y };
    }
    if (!best) return null;
    const lasts = best.y === Infinity;
    return {
      id: 'withdrawalOrder',
      tone: 'info',
      title: `Withdrawing ${WITHDRAWAL_ORDER_LABEL[best.order]} lasts longer`,
      text: `On this plan, taking withdrawals ${WITHDRAWAL_ORDER_LABEL[best.order]} instead of ${curLabel} makes the money ${lasts ? 'last to the end of the plan' : `last until ${best.y} instead of ${baseShort}`}, with everything else the same.${rothNote(best.order)} ${BASIS}`,
      action: action(best.order),
      figure: { order: best.order, lastsUntil: lasts ? null : best.y, was: baseShort },
    };
  }

  const base = { taxes: taxesOf(projection), premiums: premiumsOf(projection), end: afterTaxEnd(projection, inputs), converted: convertedOf(projection) };
  const floor = Math.max(MIN_SAVING, MIN_SAVING_SHARE * (base.taxes + base.premiums));
  let best = null;
  for (const r of runs) {
    if (runsShort(r.proj)) continue;
    const c = { taxes: taxesOf(r.proj), premiums: premiumsOf(r.proj), end: afterTaxEnd(r.proj, r.inputs), converted: convertedOf(r.proj) };
    const saving = base.taxes + base.premiums - c.taxes - c.premiums;
    if (c.end < base.end || saving < floor) continue;
    if (!best || saving > best.saving) best = { ...r, c, saving };
  }
  if (!best) return null;
  const taxSave = base.taxes - best.c.taxes;
  const premSave = base.premiums - best.c.premiums;
  const part = (v, what) => (Math.abs(v) < 1000 ? `about the same in ${what}` : `${about(v)} ${v > 0 ? 'less' : 'more'} in ${what}`);
  const endMore = best.c.end - base.end;
  const convDiff = best.c.converted - base.converted;
  return {
    id: 'withdrawalOrder',
    tone: 'info',
    title: `Withdrawing ${WITHDRAWAL_ORDER_LABEL[best.order]} costs less over the plan`,
    text: `On this plan, taking withdrawals ${WITHDRAWAL_ORDER_LABEL[best.order]} instead of ${curLabel} pays ${part(taxSave, 'income taxes')} and ${part(premSave, 'Medicare premiums')} in total over the ${(projection.years || []).length} years of the plan${endMore >= 1000 ? `, and leaves ${about(endMore)} more after tax at the end` : ''} (today's dollars).${Math.abs(convDiff) >= 10000 ? ` With the plan's Roth conversion setting, this order also converts ${about(convDiff)} ${convDiff < 0 ? 'less' : 'more'} over the plan, which is part of the difference.` : ''}${rothNote(best.order)} ${BASIS}`,
    action: action(best.order),
    figure: { order: best.order, saving: Math.round(best.saving), taxSave: Math.round(taxSave), premSave: Math.round(premSave), endMore: Math.round(endMore) },
  };
}

// 7. A claiming age the plan does not use ends with clearly more (first
// person only; the claiming grid has both). Not once checks have started.
export function claimingCheck(inputs, projection, runProjection) {
  if (typeof runProjection !== 'function') return null;
  const planYear = num(inputs.planYear) || new Date().getFullYear();
  const ageNow = planYear - num(inputs.birthYear1);
  const current = num(inputs.claimingAge1) || 67;
  if (ageNow >= current) return null;
  const ages = [62, 65, 67, 70].filter((a) => a > ageNow);
  const res = compareSsClaimingAges(sanitizeForProjection(inputs), { runProjection: (i) => runProjection(sanitizeForProjection(i)), ages, realDollars: true });
  const cur = res.rows.find((r) => r.isCurrent);
  if (!cur || cur.firstBenefitYear === null) return null;
  const candidates = res.rows.filter((r) => !r.isCurrent && r.age > ageNow);
  const best = candidates.reduce((b, r) => (b === null || r.endingBalance > b.endingBalance ? r : b), null);
  if (!best) return null;
  const fixes = best.isSuccessful && !cur.isSuccessful;
  const gain = best.endingBalance - cur.endingBalance;
  if (!fixes && (!cur.isSuccessful || gain < Math.max(MIN_CLAIM_GAIN, MIN_CLAIM_SHARE * Math.abs(cur.endingBalance)))) return null;
  const who = nameOf(inputs, 1);
  const later = best.age > cur.age;
  return {
    id: 'claiming',
    tone: 'info',
    title: `Starting Social Security at ${best.age} ${fixes ? 'makes the plan last' : 'ends with more'}`,
    text: `With average returns every year, ${who ? `${who} starting` : 'the first person starting'} Social Security at ${best.age} instead of ${cur.age} ${fixes ? 'makes the plan last to the end' : `ends the plan with ${about(gain)} more (today's dollars)`}, with everything else the same. ${later ? 'Waiting means more withdrawals from savings until the checks start, and a larger check for life, which is also what a surviving spouse keeps if it is the larger of the two checks.' : 'Starting earlier means a smaller check for life, which is also what a surviving spouse keeps if it is the larger of the two checks.'} The result depends on living to the plan's set ages; a shorter life favors starting earlier. Once checks start, the choice is hard to undo. The claiming grid shows every pair of ages.`,
    action: { tab: 'strategy', subTab: 'ssheatmap', label: 'Open the claiming grid →' },
    figure: { age: best.age, current: cur.age, gain: Math.round(gain), fixes },
  };
}

const ORDER = ['shortfall', 'acaOver', 'irmaaOver', 'withdrawalOrder', 'claiming', 'bracketRoom', 'qcd', 'acaUnder', 'irmaaUnder'];

export function thingsToLookAt(inputs, projection, { runProjection = null } = {}) {
  if (!inputs || !projection || !Array.isArray(projection.years)) return [];
  const found = [
    shortfallCheck(inputs, projection),
    irmaaCheck(inputs, projection),
    acaCheck(inputs, projection, runProjection),
    qcdCheck(inputs, projection),
  ];
  if (runProjection) {
    found.push(bracketRoomCheck(inputs, projection, runProjection));
    found.push(withdrawalOrderCheck(inputs, projection, runProjection));
    found.push(claimingCheck(inputs, projection, runProjection));
  }
  return found.filter(Boolean).sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
}
