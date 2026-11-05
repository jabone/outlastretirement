// The Survivor's Guide (What's New 492): the plan as the surviving spouse
// would carry it on, for someone who may never have run the household's
// money and is reading it in the worst year of their life.
//
// One guide per spouse. Each runs the plan as if the other spouse died this
// year (the Survivor Stress Test with the death age set to that spouse's age
// now), so the survivor is on their own from next year -- the plan a
// grieving spouse would actually have to run, whenever the paper is picked
// up. The plan's own deaths decades away would describe a different
// household; reprinting each year keeps the guide current.
//
// Everything here is read from that one projection, with average returns
// every year, no stress scenario and the plan's own Survivor Stress Test
// off: the income that continues and what changes later, the spending, the
// money each year needs and where it comes from, required withdrawals and
// conversions, the spending rule in dollars, and how long the money lasts.
// Every dollar is in today's dollars (a balance at a year's end at that
// year-end's prices, as Year by Year shows it), the only kind a newcomer to
// the household's finances can compare from one year to the next. The one
// exception is life insurance, printed at the policy's own amount, because
// that is the figure the insurer will quote.

import { runProjection, getSurvivorFullRetirementAge, getFullRetirementAge, rmdStartAge, sanitizeSurvivorBenefit, survivorBenefitBase } from '../calculator';
import { yearFactor, yearEndFactor, finalBalanceFactor } from './displayDollars';
import { sanitizeForProjection } from './oneLeverCompare';
import { survivorStartComparison } from './survivorStart';

const SHORT_EPS = 0.5;
const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// The person's name as the plan has it, or a plain stand-in.
export function spouseName(inputs, n) {
  const raw = n === 1 ? inputs?.spouse1Name : inputs?.spouse2Name;
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s || (n === 1 ? 'Spouse 1' : 'Spouse 2');
}

// Money a year brings in that is not a draw from savings.
function incomeParts(y) {
  const f = yearFactor(y);
  return {
    socialSecurity: n0(y.ssIncome) / f,
    pension: n0(y.pension) / f,
    // Salary already carries stock vesting and deferred-comp payouts.
    work: n0(y.salary) / f,
    // Other survivor benefits (an employer's survivor income and the like).
    benefit: n0(y.survivorBenefitIncome) / f,
    // Rent, annuities and reverse-mortgage payments: fixedInflows carries
    // Social Security, the pension and survivor benefits too.
    other: Math.max(0, n0(y.fixedInflows) - n0(y.ssIncome) - n0(y.pension) - n0(y.survivorBenefitIncome)) / f,
  };
}

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// One row of "running the plan each year": what the year needs (everyday
// spending, health, one-time costs, taxes, money set aside in the cash
// reserve) and where it comes from (income, then each kind of savings), so
// the two sides add up on paper.
function yearRow(y, survivor, endFactor) {
  const f = yearFactor(y);
  const income = incomeParts(y);
  const health = (n0(y.healthcareBridge) + n0(y.irmaaCost) + n0(y.medicareSupplement) + n0(y.ltcCost)) / f;
  const age = survivor === 1 ? y.age1 : y.age2;
  return {
    year: y.year,
    age,
    lifestyle: n0(y.lifestyleExpenses) / f,
    health,
    oneTime: n0(y.milestoneOutflow) / f,
    taxes: n0(y.totalTaxesPaid) / f,
    toCashReserve: (n0(y.cashReservePreFund) + n0(y.cashReserveReplenish)) / f,
    income: sum(income),
    incomeParts: income,
    fromPreTax: n0(y.drawPreTax) / f,
    fromRoth: n0(y.drawRoth) / f,
    fromTaxable: n0(y.drawTaxable) / f,
    fromHsa: (n0(y.hsaMedicalDraw) + n0(y.hsaGeneralDraw)) / f,
    fromCash: n0(y.cashReserveDraw) / f,
    fromStock: n0(y.concentratedStockProceedsSpent) / f,
    rmd: n0(y.rmdAmount) / f,
    conversion: n0(y.convertAmount) / f,
    lifeInsurance: n0(y.lifeInsurancePayoutToSurvivor) / f,
    benefitLump: n0(y.survivorBenefitLump) / f,
    savingsEnd: n0(y.totalPortfolioEnding) / endFactor,
    shortfall: n0(y.shortfall) / f,
    ruleAction: y.riskGuardrailAction || y.wrGuardrailAction || null,
    replanned: Boolean(y.riskGuardrailReplanned),
    filing: y.householdStatus || null,
    retired: Boolean(survivor === 1 ? (y.isRetired1 ?? y.isRetired) : y.isRetired),
    survivorBenefit: n0(survivor === 1 ? y.survivorBenefit1 : y.survivorBenefit2) / f,
    inheritedShare: n0(y.inheritedPreTaxShare),
  };
}

// Every change in income after the first year alone that a survivor has to
// act on or should expect: an income that starts, one that steps up well
// beyond inflation (Social Security switching to the survivor's own larger
// benefit, a second pension starting), work stopping or starting again.
// Each { kind, label, year, age, amount, change }.
const KINDS = [['socialSecurity', 'Social Security'], ['pension', 'Pension income'], ['benefit', 'Survivor benefit income'], ['other', 'Rent, annuity and other income']];
function incomeChanges(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const r = rows[i];
    for (const [k, label] of KINDS) {
      const a = prev.incomeParts[k];
      const b = r.incomeParts[k];
      if (a <= 0.5 && b > 0.5) out.push({ kind: k, label, year: r.year, age: r.age, amount: b, change: 'starts' });
      else if (a > 0.5 && b > a * 1.15 + 500) out.push({ kind: k, label, year: r.year, age: r.age, amount: b, change: 'rises' });
      else if (a > 0.5 && b <= 0.5) out.push({ kind: k, label, year: r.year, age: r.age, amount: 0, change: 'stops' });
    }
    if (prev.incomeParts.work > 0.5 && r.incomeParts.work <= 0.5) out.push({ kind: 'work', label: 'Work', year: r.year, age: r.age, amount: 0, change: 'stops' });
    if (prev.incomeParts.work <= 0.5 && r.incomeParts.work > 0.5) out.push({ kind: 'work', label: 'Work', year: r.year, age: r.age, amount: r.incomeParts.work, change: 'starts' });
  }
  return out;
}

// The year the survivor's Social Security moves from the survivor benefit to
// their own, larger one (the plan's own claiming age): Social Security does
// not always switch a survivor by itself, so the guide says to apply.
function ownBenefitSwitch(rows) {
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i - 1].survivorBenefit > 0.5 && rows[i].survivorBenefit <= 0.5 && rows[i].incomeParts.socialSecurity > rows[i - 1].incomeParts.socialSecurity + 500) {
      return { year: rows[i].year, age: rows[i].age, amount: rows[i].incomeParts.socialSecurity };
    }
  }
  return null;
}

// The spending rule as the survivor would apply it in their first retired
// year alone, in today's dollars. Only the risk-based rule has dollar lines;
// the other two are described in words by the sheet.
function ruleFor(inputs, y) {
  if (!y) return { kind: 'none' };
  if (inputs.riskGuardrailsEnabled) {
    const f = yearFactor(y);
    const own = Number(y.riskGuardrailMultiplier) > 0 ? Number(y.riskGuardrailMultiplier) : 1;
    const spendAt = (m) => (Number.isFinite(m) ? (n0(y.lifestyleExpenses) * (m / own)) / f : null);
    const fin = (v) => (Number.isFinite(v) ? v / f : null);
    return {
      kind: 'risk',
      year: y.year,
      action: y.riskGuardrailAction || null,
      spend: n0(y.lifestyleExpenses) / f,
      chance: Number.isFinite(y.riskGuardrailChance) ? y.riskGuardrailChance : null,
      savingsGoingIn: fin(y.riskGuardrailOpeningBalance),
      cutBelow: fin(y.riskGuardrailCutBalance),
      spendIfCut: spendAt(y.riskGuardrailMultiplierIfCut),
      raiseAt: fin(y.riskGuardrailRaiseBalance),
      spendIfRaised: spendAt(y.riskGuardrailMultiplierIfRaise),
      cutAtPct: n0(inputs.riskGuardrailCutAtPct) || 50,
      raiseAtPct: n0(inputs.riskGuardrailRaiseAtPct) || 99,
    };
  }
  if (inputs.withdrawalGuardrailsEnabled && !inputs.spendingGuardrails) return { kind: 'withdrawal', bandPct: n0(inputs.wrGuardrailBandPct) };
  if (inputs.spendingGuardrails) return { kind: 'spending' };
  return { kind: 'none' };
}

// Returns { status, ... }:
//   'no-spouse'   a one-person plan
//   'alone'       the other spouse is not alive in the plan's first year
//   'no-years'    the survivor's own plan ends this year too, so there is
//                 no year alone to describe
//   'ok'          the guide
export function buildSurvivorGuide(inputs, deceased, { run = runProjection } = {}) {
  if (!inputs || !inputs.spouse2Enabled) return { status: 'no-spouse' };
  const survivor = deceased === 1 ? 2 : 1;
  // The plan's own Survivor Stress Test would kill someone else, at another
  // age; a stress scenario would make the table one bad history.
  const safe = { ...sanitizeForProjection(inputs), stressType: 'none', survivorStressEnabled: false };
  const base = run(safe);
  const y0 = base.years?.[0];
  if (!y0 || !y0.spouse1Alive || !y0.spouse2Alive) return { status: 'alone' };
  const deathAge = deceased === 1 ? y0.age1 : y0.age2;
  const scenario = { ...safe, survivorStressEnabled: true, survivorStressSpouse: deceased, survivorStressAge: deathAge };
  const proj = run(scenario);
  const years = proj.years || [];
  const firstIndex = years.findIndex((y) => (survivor === 1 ? y.spouse1Alive && !y.spouse2Alive : y.spouse2Alive && !y.spouse1Alive));
  if (firstIndex < 1) return { status: 'no-years', names: { deceased: spouseName(inputs, deceased), survivor: spouseName(inputs, survivor) } };

  const couple = years[firstIndex - 1];
  const first = years[firstIndex];
  const aloneIdx = [];
  for (let i = firstIndex; i < years.length; i += 1) {
    if (survivor === 1 ? years[i].spouse1Alive : years[i].spouse2Alive) aloneIdx.push(i);
  }
  const alone = aloneIdx.map((i) => years[i]);
  const rows = aloneIdx.map((i) => yearRow(years[i], survivor, yearEndFactor(years, i)));
  const fFirst = yearFactor(first);
  const fCouple = yearFactor(couple);
  const sameYear = (yr) => (base.years || []).find((y) => y.year === yr);

  // Income: the first year alone against the same year of the plan together.
  const togetherFirst = sameYear(first.year) || couple;
  const before = incomeParts(togetherFirst);
  const after = incomeParts(first);

  // Spending: compared in the first year the survivor is retired, against
  // the same year of the plan together -- both are then the plan's
  // retirement budget, and the difference is the survivor drop. While the
  // survivor still works the plan may set spending from pay instead, which
  // the sheet says.
  const retiredRow = alone.find((y) => y.isRetired);
  const togetherRetired = retiredRow ? sameYear(retiredRow.year) : null;
  const spending = {
    firstYear: n0(first.lifestyleExpenses) / fFirst,
    year: retiredRow ? retiredRow.year : null,
    after: retiredRow ? n0(retiredRow.lifestyleExpenses) / yearFactor(retiredRow) : null,
    before: togetherRetired && togetherRetired.isRetired ? n0(togetherRetired.lifestyleExpenses) / yearFactor(togetherRetired) : null,
    dropPct: n0(safe.survivorExpenseDropPct),
    keepsHousing: Boolean(safe.survivorDropKeepsHousing),
    workingAtFirst: !first.isRetired,
    autoWhileWorking: safe.currentSpendingMode !== 'custom',
    // What's New 498: the working survivor keeps the couple's budget.
    keepsBudget: first.survivorWorkingBudget !== null && first.survivorWorkingBudget !== undefined,
    peak: rows.reduce((m, r) => Math.max(m, r.lifestyle), 0),
    peakAge: rows.reduce((best, r) => (r.lifestyle > best.v ? { v: r.lifestyle, age: r.age } : best), { v: -1, age: null }).age,
    raises: rows.some((r) => r.ruleAction === 'raise'),
  };

  // Life insurance at the policy's own amount (what the insurer pays), and
  // in today's dollars for the table.
  const insuranceNominal = alone.reduce((a, y) => a + n0(y.lifeInsurancePayoutToSurvivor), 0) + n0(couple.lifeInsurancePayoutToSurvivor);
  const insuranceReal = alone.reduce((a, y) => a + n0(y.lifeInsurancePayoutToSurvivor) / yearFactor(y), 0) + n0(couple.lifeInsurancePayoutToSurvivor) / fCouple;
  const short = rows.find((r) => r.shortfall > SHORT_EPS);
  const last = rows[rows.length - 1];

  // When to start the survivor check, from the same scenario; null when the
  // question does not arise (past full retirement age, own benefit larger).
  let ssStart = null;
  try {
    const cmp = survivorStartComparison(scenario, run);
    if (cmp.status === 'compare') {
      const pick = cmp.rows[cmp.best];
      const chosen = cmp.rows[cmp.current] || cmp.rows[0];
      const bs = cmp.betterStrategy;
      ssStart = {
        bestAge: pick.effectiveAge, bestCheck: pick.check, planAge: chosen.effectiveAge, planCheck: chosen.check, earliest: cmp.rows[0].effectiveAge,
        // Taking one benefit first and switching beats every single start
        // age: the guide names it, with what it leaves over the best one.
        switchPlan: bs ? { id: bs.id, ownAge: bs.ownAge, survivorAge: bs.survivorStartAge, moreAtEnd: bs.endBalance - pick.endBalance } : null,
      };
    } else if (cmp.status === 'past-fra') {
      const bs = cmp.betterStrategy;
      ssStart = { pastFra: true, switchPlan: bs ? { id: bs.id, ownAge: bs.ownAge, survivorAge: bs.survivorStartAge, moreAtEnd: bs.endBalance - cmp.planEndBalance } : null };
    }
    else if (cmp.status === 'own-larger') ssStart = { ownLarger: true };
  } catch { ssStart = null; }

  const start = (k) => n0(first[k]) / fFirst;
  const accounts = {
    preTax: start('preTaxStart'),
    roth: start('rothStart'),
    taxable: start('taxableStart'),
    hsa: start('hsaStart'),
    cash: n0(couple.cashReserveBalance) / yearEndFactor(years, firstIndex - 1),
    deferredComp: n0(survivor === 1 ? first.nqdcBalance1 : first.nqdcBalance2) / fFirst,
    deceasedDeferredComp: n0(deceased === 1 ? couple.nqdcBalance1 : couple.nqdcBalance2) / fCouple,
    companyStock: (n0(first.concentratedStockBalance) + n0(first.concentratedStock2Balance)) / fFirst,
  };
  const by = (n, k1, k2) => n0(n === 1 ? safe[k1] : safe[k2]);
  const pensionStart = by(deceased, 'pensionStartAge1', 'pensionStartAge2');
  const deceasedBirth = by(deceased, 'birthYear1', 'birthYear2');
  const survivorBirth = by(survivor, 'birthYear1', 'birthYear2');
  const survivorAge = survivor === 1 ? first.age1 : first.age2;
  const fra = getSurvivorFullRetirementAge(survivorBirth);
  const earlyPreTax = rows.some((r) => r.age < 59.5 && r.fromPreTax > 0.5);
  const firstConversion = rows[0] && rows[0].conversion > 0.5 ? rows[0].conversion : 0;

  // Every survivor benefit on this death, counted in the plan or not, with
  // whether it applies to a death this year (a while-working benefit does
  // not once that spouse has retired).
  const retireAgeDeceased = by(deceased, 'retireAge1', 'retireAge2');
  const benefits = (Array.isArray(inputs.survivorBenefits) ? inputs.survivorBenefits : [])
    .map(sanitizeSurvivorBenefit)
    .filter((b) => b.whose === deceased && (b.name.trim() || b.amount > 0 || b.payPct > 0 || b.details.trim()))
    .map((b) => ({ ...b, value: survivorBenefitBase(safe, b), applies: !b.whileWorking || deathAge < retireAgeDeceased }));

  return {
    status: 'ok',
    deceased,
    benefits,
    survivor,
    names: { deceased: spouseName(inputs, deceased), survivor: spouseName(inputs, survivor) },
    deathYear: couple.year,
    deathAge,
    firstYear: first.year,
    survivorAge,
    survivorFra: fra,
    income: {
      before,
      after,
      lifeInsurance: insuranceNominal,
      lifeInsuranceReal: insuranceReal,
      changes: incomeChanges(rows),
      ownSwitch: ownBenefitSwitch(rows),
    },
    spending,
    ssStart,
    rule: ruleFor(safe, retiredRow),
    ruleAge: retiredRow ? (survivor === 1 ? retiredRow.age1 : retiredRow.age2) : null,
    ruleYear: retiredRow ? retiredRow.year : null,
    accounts,
    rows,
    outcome: {
      lasts: !short,
      shortAge: short ? short.age : null,
      shortYear: short ? short.year : null,
      endAge: last ? last.age : null,
      endBalance: n0(proj.endingBalance) / finalBalanceFactor(years),
      // Less than one year's spending left: as good as running out.
      nearlyEmpty: !short && last ? n0(proj.endingBalance) / finalBalanceFactor(years) < last.lifestyle + last.health : false,
    },
    flags: {
      lifeInsurance: insuranceNominal > 0.5,
      lifeInsuranceInTrust: (deceased === 1 ? safe.lifeInsuranceEnabled1 && safe.lifeInsuranceOwnership1 === 'trust' : safe.lifeInsuranceEnabled2 && safe.lifeInsuranceOwnership2 === 'trust') || false,
      deceasedPension: by(deceased, 'pension1', 'pension2') > 0,
      deceasedPensionStarted: by(deceased, 'pension1', 'pension2') > 0 && deathAge >= pensionStart,
      deceasedPensionStartAge: pensionStart,
      deceasedPensionStartYear: deceasedBirth ? deceasedBirth + pensionStart : null,
      pensionSurvivorPct: n0(deceased === 1 ? safe.pension1SurvivorBenefit : safe.pension2SurvivorBenefit),
      deceasedClaimedSS: deathAge >= by(deceased, 'claimingAge1', 'claimingAge2'),
      deceasedAtRmdAge: deceasedBirth ? deathAge >= rmdStartAge(deceasedBirth) : false,
      deceasedWorking: deathAge < by(deceased, 'retireAge1', 'retireAge2'),
      deceasedStockAwards: n0(deceased === 1 ? couple.rsuIncome1 : couple.rsuIncome2) > 0.5,
      deceasedDeferredComp: accounts.deceasedDeferredComp > 0.5,
      companyStock: accounts.companyStock > 0.5,
      preTax: accounts.preTax > 0.5,
      roth: accounts.roth > 0.5,
      taxable: accounts.taxable > 0.5,
      hsa: accounts.hsa > 0.5,
      home: n0(first.homeValue) > 0.5,
      mortgage: n0(first.mortgageBalance) > 0.5,
      basisStepUp: n0(first.firstDeathBasisChange) > 0.5 || n0(couple.firstDeathBasisChange) > 0.5,
      under60: survivorAge < 60,
      under595: survivorAge < 59.5,
      under65: survivorAge < 65,
      irmaaAge: survivorAge >= 63,
      medicareYear: survivorAge < 65 && survivorBirth ? survivorBirth + 65 : null,
      working: after.work > 0.5,
      // The earnings test runs to the retirement FRA, even on a survivor
      // benefit (SSA), not the survivors-table one.
      workingBeforeFra: after.work > 0.5 && survivorAge < getFullRetirementAge(survivorBirth),
      earlyPreTax,
      // The plan keeps the spouse's Pre-Tax share as an inherited IRA until
      // the survivor is 59 1/2 (What's New 497).
      keepsInherited: Boolean(safe.survivorKeepsInheritedIra) && survivorAge < 59.5 && rows.some((r) => r.inheritedShare > 0),
      // The inherited IRA needs a yearly withdrawal before the survivor is
      // 59 1/2: the one who died reaches (or had reached) their RMD age first.
      inheritedRmd: Boolean(safe.survivorKeepsInheritedIra) && survivorAge < 59.5 && deceasedBirth
        ? rmdStartAge(deceasedBirth) - deathAge < 59.5 - survivorAge : false,
      firstConversion,
      rmd: rows.some((r) => r.rmd > 0.5),
      rmdAge: survivorBirth ? rmdStartAge(survivorBirth) : null,
      conversions: rows.some((r) => r.conversion > 0.5),
      cashReserve: accounts.cash > 0.5 || rows.some((r) => r.toCashReserve > 0.5 || r.fromCash > 0.5),
      ltcPlanned: Boolean(survivor === 1 ? safe.ltcActive1 : safe.ltcActive2),
      firstYearFiling: first.householdStatus || null,
    },
  };
}

// Both guides, deceased spouse 1 first. Each entry is buildSurvivorGuide's
// result.
export function buildSurvivorGuides(inputs, options) {
  if (!inputs || !inputs.spouse2Enabled) return [];
  return [buildSurvivorGuide(inputs, 1, options), buildSurvivorGuide(inputs, 2, options)];
}

// Where the money is kept, from Detailed Holdings: one line per firm and
// account, with its tax type and today's value -- names only, never
// numbers (the app holds none). Accounts with no firm or name are grouped
// by tax type.
export function holdingsAccounts(holdings, { computeMarketValue, taxLabel }) {
  const map = new Map();
  for (const h of Array.isArray(holdings) ? holdings : []) {
    if (!h || typeof h !== 'object') continue;
    const firm = typeof h.institution === 'string' ? h.institution.trim() : '';
    const account = typeof h.account === 'string' ? h.account.trim() : '';
    const tax = h.taxTreatment || 'taxable';
    const key = `${firm}\u0000${account}\u0000${tax}`;
    const cur = map.get(key) || { firm, account, tax: taxLabel(tax), value: 0, holdings: 0 };
    const v = Number(computeMarketValue(h));
    cur.value += Number.isFinite(v) ? v : 0;
    cur.holdings += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => (a.firm || '￿').localeCompare(b.firm || '￿') || a.account.localeCompare(b.account));
}
