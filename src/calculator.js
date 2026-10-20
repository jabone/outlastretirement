// Core Math & Cash Flow Engine for RetirePlan Beta (2026 baseline)

// Bump this whenever DEFAULT_INPUTS's shape changes in a way that isn't safely
// handled by a plain object merge (e.g. a field is renamed or restructured,
// not just added). App.jsx and LedgerTab.jsx stamp this version on every
// localStorage save (retire_plan_inputs, retire_plan_scenarios) so a future
// load can detect old data and run a migration step before using it, instead
// of silently merging a possibly-incompatible shape into the live plan.
export const INPUTS_SCHEMA_VERSION = 4;

// The tax year every hardcoded dollar figure below (brackets, contribution
// limits, IRMAA thresholds, the federal poverty level, state estate tax
// tables, etc.) was last verified against -- see TAX_UPDATE_PROCESS.md at
// the repo root for the annual checklist that bumps this and its downstream
// constants. This is DIFFERENT from "what calendar year does a given PLAN
// think it's in" -- that's inputs.planYear (below in DEFAULT_INPUTS), a
// per-plan, user-advanceable value (see the "Advance Year" flow in
// PlanYearPanel.jsx) that starts out equal to TAX_YEAR for a brand-new plan
// but can move independently of it. Advancing a plan's own planYear forward
// (e.g. a year later, without a code update) keeps its ages and projection
// timeline current; it does NOT change which year's tax figures this file
// actually computes with -- those only move when TAX_YEAR itself is bumped
// here, which requires a code change. Moved to the top of the file (rather
// than living alongside the dollar-figure constants further down, where it
// used to sit) specifically so DEFAULT_INPUTS below can reference it without
// a temporal-dead-zone error -- `const` bindings aren't accessible until
// their own declaration has run.
export const TAX_YEAR = 2026;

// Migrates a persisted inputs blob (from localStorage or an imported backup
// file) to the current INPUTS_SCHEMA_VERSION shape. Handles both the legacy
// unversioned format (a bare inputs object, saved before this versioning
// existed) and the versioned wrapper format { schemaVersion, inputs }.
// Add version-specific migration steps here as the schema evolves in the
// future — this is the one place that needs to change, instead of every
// call site guessing at the shape.
import { sampleDeathAge, survivalCurve } from './utils/mortality';
import { sampleLtcEpisode } from './utils/ltcRisk';
import { HISTORICAL_RETURNS, HISTORY_FIRST_YEAR, HISTORY_LAST_YEAR } from './config/historicalReturns';
import { HISTORICAL_RETURNS_PRE1928, PRE1928_FIRST_YEAR } from './config/historicalReturnsPre1928';
import { historicalPortfolioReturn, historicalGeometricMean, historicalMeanInflation, bootstrapPath, recenterReturn } from './utils/bootstrap';
import { spendingCost } from './utils/spendingCost';
import { JOINT_LIFE_TABLE_II, JOINT_LIFE_TABLE_II_SPOUSE_MIN_AGE } from './config/rmdJointLifeTable';
import { LIFE_TABLE_MAX_AGE } from './config/lifeTable';
import { finalBalanceFactor, yearEndFactor } from './utils/displayDollars';
import { STATE_TAX_RULES } from './config/stateTaxRules';

// Volatility the Monte Carlo derives from a stock/bond mix (16% stock /
// 5% bond -- long-run US annual figures), used by the Dynamic Asset
// Allocation branch of runMonteCarlo and, since changelog 247, as the
// retired default for the flat branch too. Percent in, percent out.
export const STOCK_VOLATILITY_PCT = 16.0;
export const BOND_VOLATILITY_PCT = 5.0;
export function derivedVolatility(stockAllocationPct) {
  const stock = Number(stockAllocationPct);
  const s = Number.isFinite(stock) ? Math.min(100, Math.max(0, stock)) : 60;
  return Math.round(((s * STOCK_VOLATILITY_PCT + (100 - s) * BOND_VOLATILITY_PCT) / 100) * 10) / 10;
}

// The plan's stock share for one projection year, in percent: the Working
// or Retired allocation, walked down by the glide path once retired when
// rebalancing and the glide are both on. The one formula the return blend,
// the historical replay and (changelog 414) the qualified share of the
// taxable yield all read, so the three can never disagree about what the
// portfolio is in a given year. Clamped to 0-100 and never NaN: a plan
// with the allocation fields blank reads as the 80/60 defaults.
export function planStockShareForYear(inputs, isRetired, year, householdRetirementYear) {
  const raw = isRetired ? inputs.stockAllocationPost : inputs.stockAllocationPre;
  const fallback = isRetired ? DEFAULT_INPUTS.stockAllocationPost : DEFAULT_INPUTS.stockAllocationPre;
  let share = Number.isFinite(Number(raw)) && raw !== '' && raw !== null ? Number(raw) : fallback;
  if (isRetired && householdRetirementYear !== null && householdRetirementYear !== undefined
    && inputs.rebalancingEnabled && inputs.glideAllocationEnabled) {
    const yearsRetired = year - householdRetirementYear;
    share = Math.max(inputs.glideAllocationFloor, share - (yearsRetired * inputs.glideAllocationRate));
  }
  return Math.min(100, Math.max(0, share));
}

// The qualified share of a taxable account's yield when it follows the
// stock/bond split (changelog 441): the stock side's share of the INCOME,
// not of the balance. Bonds yield more than stocks -- about 4% against
// about 1.3% -- so a 60/40 account earns 0.78% + 1.60% = 2.38%, of which
// only a third is qualified; the balance split said 60%. The two yields
// are plan inputs (taxableStockYieldPct, taxableBondYieldPct) used only
// for this weighting; the account's total yield is still taxableDividendYield.
export function qualifiedShareFromAllocation(stockSharePct, inputs = DEFAULT_INPUTS) {
  const s = Math.min(1, Math.max(0, (Number(stockSharePct) || 0) / 100));
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null && Number(v) >= 0 ? Number(v) : d);
  const stockYield = num(inputs.taxableStockYieldPct, DEFAULT_INPUTS.taxableStockYieldPct);
  const bondYield = num(inputs.taxableBondYieldPct, DEFAULT_INPUTS.taxableBondYieldPct);
  const income = s * stockYield + (1 - s) * bondYield;
  if (income <= 0) return s;
  return Math.min(1, Math.max(0, (s * stockYield) / income));
}

// Deterministic PRNG (mulberry32) so a Monte Carlo run is reproducible for
// a given seed. Returns a function yielding uniforms in [0, 1).
export function mulberry32(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Parameters of a lognormal annual return whose MEDIAN compound growth is
// the stated rate g (as a fraction, 0.07 for 7%) and whose arithmetic
// standard deviation is sigma (0.15 for 15%). With m = 1 + g and the
// log-return ~ N(ln m, s), the gross return is m * exp(s * z):
//   median  = m                       (so the median trial compounds at g)
//   mean    = m * exp(s^2 / 2)
//   var     = m^2 * exp(s^2) * (exp(s^2) - 1)
// Solving var = sigma^2 for s: with x = exp(s^2), x^2 - x - (sigma/m)^2 = 0,
// x = (1 + sqrt(1 + 4 (sigma/m)^2)) / 2, s = sqrt(ln x). Closed form, no
// iteration, and s -> 0 as sigma -> 0 so a zero-volatility trial is the
// deterministic plan exactly. A stated rate at or below -100% has no
// positive median gross return; the caller treats that year as a wipeout.
// Investment fees (changelog 447): the plan's total yearly fee, as a
// fraction (0.0010 = 0.10%), and a before-fees return expressed after
// them. The engine charges the fee on the year-end balance, so a year
// grows by (1 + r)(1 - f); netReturnPct says the same as a rate.
export function totalFeeFraction(inputs) {
  const f = (Number(inputs?.fundExpenseRatioPct) || 0) + (Number(inputs?.advisorFeePct) || 0);
  return Math.min(0.1, Math.max(0, f / 100));
}
export function netReturnPct(grossPct, inputs) {
  const f = totalFeeFraction(inputs);
  return ((1 + (Number(grossPct) || 0) / 100) * (1 - f) - 1) * 100;
}

export function lognormalReturnParams(g, sigma) {
  const m = 1 + g;
  if (!(m > 0)) return { m: 0, mu: -Infinity, s: 0, mean: -1 };
  const q = (sigma / m) * (sigma / m);
  const x = (1 + Math.sqrt(1 + 4 * q)) / 2;
  const s = Math.sqrt(Math.log(x));
  return { m, mu: Math.log(m), s, mean: m * Math.exp((s * s) / 2) - 1 };
}

// Reads a persisted plan in any shape this app has ever saved and returns
// it at the current INPUTS_SCHEMA_VERSION, recording both versions:
//   { schemaVersion: INPUTS_SCHEMA_VERSION, fromVersion, inputs }
// fromVersion is the version the data was saved under -- 0 for a bare
// inputs object saved before versioning existed. Version 1 covered many
// shape changes that were each detected by sniffing for an old key
// (migrateVersion1Shapes below); every plan written by a build at version 2
// or later has been through all of them and carries every current key, so
// they run only for version 0 and 1. Each step is idempotent: it acts only
// when the new key is missing and the old one is present. A later shape
// change bumps the version and adds its own step here, keyed on
// fromVersion, instead of another sniff.
export function migratePersistedInputs(persisted) {
  if (!persisted || typeof persisted !== 'object') {
    return { schemaVersion: INPUTS_SCHEMA_VERSION, fromVersion: 0, inputs: { ...DEFAULT_INPUTS } };
  }

  let raw = persisted;
  let fromVersion = 0;
  if (persisted.schemaVersion !== undefined && persisted.inputs !== undefined) {
    raw = persisted.inputs && typeof persisted.inputs === 'object' ? persisted.inputs : {};
    const v = Number(persisted.schemaVersion);
    fromVersion = Number.isFinite(v) && v > 0 ? v : 0;
  }
  if (fromVersion < 2) raw = migrateVersion1Shapes(raw);
  if (fromVersion < 3) raw = migrateWashingtonJurisdiction(raw);
  if (fromVersion < 4) raw = migrateStateRulesJurisdiction(raw);

  return { schemaVersion: INPUTS_SCHEMA_VERSION, fromVersion, inputs: { ...DEFAULT_INPUTS, ...raw } };
}

// Version 4 (changelog 361): the 35 states and DC without a hand-written
// model got their own rules ('state_rules'). Choosing one of them as your
// state used to set the flat rate at 5% with no exclusions. A plan (or a
// residency-timeline move) still on exactly that untouched setting -- the
// flat rate at 5%, Social Security untaxed, pensions taxed -- in a state
// that now has a record moves to its state's rules. A flat rate the owner
// changed in any way is a deliberate choice and stays.
function untouchedFlatRate(e) {
  if (!e || e.stateTaxState !== 'flat_5') return false;
  const rate = e.stateTaxFlatRate === undefined ? 5 : Number(e.stateTaxFlatRate);
  const code = typeof e.stateOfResidence === 'string' ? e.stateOfResidence.trim().toUpperCase() : '';
  return rate === 5 && e.stateTaxSocialSecurityTaxable !== true && e.stateTaxPensionTaxable !== false
    && Boolean(STATE_TAX_RULES[code]);
}
function migrateStateRulesJurisdiction(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  let out = untouchedFlatRate(raw) ? { ...raw, stateTaxState: 'state_rules' } : raw;
  if (Array.isArray(raw.residencyTimeline)) {
    let changed = false;
    const timeline = raw.residencyTimeline.map((e) => {
      if (e && typeof e === 'object' && (e.kind || 'domestic') === 'domestic' && untouchedFlatRate(e)) {
        changed = true;
        return { ...e, stateTaxState: 'state_rules' };
      }
      return e;
    });
    if (changed) out = { ...out, residencyTimeline: timeline };
  }
  return out;
}

// Version 3 (changelog 350): Washington got its own State Income Tax
// Jurisdiction ('wa', changelog 349) for its capital gains tax and its
// income tax from 2028. A plan saved before that, living in Washington on
// the old no-income-tax choice, is moved to 'wa' -- the owner's decision:
// those households owe the tax, so the plan should charge it without
// waiting for them to notice the new choice. The same applies to a
// residency-timeline move to Washington. A Washington plan on any other
// choice (a deliberate flat rate) is left alone.
const WA_OLD_NO_TAX = new Set(['none', 'TX_FL']);
function migrateWashingtonJurisdiction(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const isWa = (v) => typeof v === 'string' && v.trim().toUpperCase() === 'WA';
  let out = raw;
  if (isWa(raw.stateOfResidence) && WA_OLD_NO_TAX.has(raw.stateTaxState)) {
    out = { ...out, stateTaxState: 'wa' };
  }
  if (Array.isArray(raw.residencyTimeline)) {
    let changed = false;
    const timeline = raw.residencyTimeline.map((e) => {
      if (e && typeof e === 'object' && isWa(e.stateOfResidence) && WA_OLD_NO_TAX.has(e.stateTaxState)) {
        changed = true;
        return { ...e, stateTaxState: 'wa' };
      }
      return e;
    });
    if (changed) out = { ...out, residencyTimeline: timeline };
  }
  return out;
}

// The bare, current-shape inputs of a persisted plan (see
// migratePersistedInputs, which also reports the versions).
export function migrateInputs(persisted) {
  return migratePersistedInputs(persisted).inputs;
}

// Every shape change made while INPUTS_SCHEMA_VERSION was 1, each detected
// by the old key it replaced. Runs for unversioned and version-1 data only.
function migrateVersion1Shapes(raw) {
  // Multi-heir migration: a plan saved before the `heirs` array existed has
  // heirFilingStatus/heirIncome (a single implicit heir) but no `heirs` key.
  // Without this step, the plain object-merge below would silently overwrite
  // that plan's real (if implicit) heir data with DEFAULT_INPUTS.heirs —
  // losing the user's heirIncome/heirFilingStatus choice on next load.
  if (!Array.isArray(raw.heirs) && (raw.heirFilingStatus !== undefined || raw.heirIncome !== undefined)) {
    raw = {
      ...raw,
      heirs: [{
        id: 1,
        name: 'Heir 1',
        filingStatus: raw.heirFilingStatus || 'Single',
        income: raw.heirIncome !== undefined ? raw.heirIncome : 100000,
        splitPct: 100,
        relationship: DEFAULT_HEIR_RELATIONSHIP,
      }],
    };
  }

  // Heir split mode (changelog 259): a plan saved before heirSplitMode
  // existed keeps exactly the division it had -- 'custom' when its heirs'
  // splits differ, 'equal' (the same result) when they are all alike.
  if (raw.heirSplitMode === undefined && Array.isArray(raw.heirs) && raw.heirs.length > 1) {
    const pcts = raw.heirs.map((h) => Math.max(0, Number(h.splitPct) || 0));
    const allAlike = pcts.every((p) => Math.abs(p - pcts[0]) < 1e-9);
    raw = { ...raw, heirSplitMode: allAlike ? 'equal' : 'custom' };
  }

  // Home-ownership migration (changelog 144): before `homeOwned` existed
  // the house was in the plan exactly when the reverse mortgage was on.
  // Carry that forward so no saved plan's estate changes on load.
  if (raw.homeOwned === undefined && raw.reverseMortgageEnabled !== undefined) {
    raw = { ...raw, homeOwned: Boolean(raw.reverseMortgageEnabled) };
  }

  // Per-spouse Pre-Tax/Roth migration: a plan saved before preTaxContribution
  // /rothContribution were split into preTaxContribution1/2 and
  // rothContribution1/2 has the old single shared field but not the new
  // ones. Carry the old value forward onto BOTH spouse fields so the
  // household total is unchanged on load (this app's pre-existing
  // convention was that both spouses contribute the same shared amount by
  // default) -- the user can then split them apart manually going forward.
  if (raw.preTaxContribution1 === undefined && raw.preTaxContribution !== undefined) {
    raw = { ...raw, preTaxContribution1: raw.preTaxContribution, preTaxContribution2: raw.preTaxContribution };
  }
  if (raw.rothContribution1 === undefined && raw.rothContribution !== undefined) {
    raw = { ...raw, rothContribution1: raw.rothContribution, rothContribution2: raw.rothContribution };
  }

  // Per-spouse LTC migration: a plan saved before LTC was split into
  // ltcActive1/2 etc. has the old single shared fields but not the new
  // ones. Carry the old settings forward onto BOTH spouse fields so the
  // plan's projected numbers are unchanged on load (the old behavior WAS
  // "both spouses get the same LTC cost at the same age") -- the user can
  // then make them independent manually going forward.
  if (raw.ltcActive1 === undefined && raw.ltcActive !== undefined) {
    const migrated = { ...raw };
    migrated.ltcActive1 = raw.ltcActive;
    migrated.ltcActive2 = raw.ltcActive;
    if (raw.ltcCost !== undefined) { migrated.ltcCost1 = raw.ltcCost; migrated.ltcCost2 = raw.ltcCost; }
    if (raw.ltcStartAge !== undefined) { migrated.ltcStartAge1 = raw.ltcStartAge; migrated.ltcStartAge2 = raw.ltcStartAge; }
    if (raw.ltcDurationYears !== undefined) { migrated.ltcDurationYears1 = raw.ltcDurationYears; migrated.ltcDurationYears2 = raw.ltcDurationYears; }
    if (raw.ltcEndsInDeath !== undefined) { migrated.ltcEndsInDeath1 = raw.ltcEndsInDeath; migrated.ltcEndsInDeath2 = raw.ltcEndsInDeath; }
    raw = migrated;
  }

  // Per-spouse Life Insurance migration: a plan saved before Life
  // Insurance was split into lifeInsuranceEnabled1/2 etc. has the old
  // single shared fields but not the new ones. Unlike the LTC migration
  // above, this carries the old policy forward onto SPOUSE 1 ONLY (not
  // duplicated onto both) -- it represented one specific policy with one
  // specific death benefit, so copying it onto both spouses would double
  // the estate's life insurance proceeds out of nowhere. Spouse 2 starts
  // with no policy (matching the old app's behavior, which only ever had
  // one), and the user can add their own real policy manually.
  // Per-spouse Backdoor Roth migration (changelog 108): the old single
  // backdoorRothAnnualAmount applied to EACH working spouse, so copying it
  // onto both new fields reproduces the old numbers exactly.
  if (raw.backdoorRothAnnualAmount1 === undefined && raw.backdoorRothAnnualAmount !== undefined) {
    raw = {
      ...raw,
      backdoorRothAnnualAmount1: raw.backdoorRothAnnualAmount,
      backdoorRothAnnualAmount2: raw.backdoorRothAnnualAmount,
    };
  }

  // Retired-volatility reconciliation (changelog 247): a plan saved before
  // the Monte Carlo seed existed and still carrying the old 8% retired
  // default moves to the allocation-derived figure the Dynamic Asset
  // Allocation branch has always used (16% stock / 5% bond at the plan's
  // own retired mix -- 11.6% at the default 60/40). A plan that chose any
  // other value keeps it. monteCarloSeed is the version marker: every plan
  // saved after 247 carries it, so this runs at most once per plan.
  if (raw.monteCarloSeed === undefined && Number(raw.volatilityPost) === 8) {
    raw = { ...raw, volatilityPost: derivedVolatility(raw.stockAllocationPost) };
  }

  if (raw.lifeInsuranceEnabled1 === undefined && raw.lifeInsuranceEnabled !== undefined) {
    raw = {
      ...raw,
      lifeInsuranceEnabled1: raw.lifeInsuranceEnabled,
      lifeInsurancePolicyType1: raw.lifeInsurancePolicyType,
      lifeInsuranceOwnership1: raw.lifeInsuranceOwnership,
      lifeInsuranceCashValueInit1: raw.lifeInsuranceCashValueInit,
      lifeInsuranceCashValueGrowthRate1: raw.lifeInsuranceCashValueGrowthRate,
      lifeInsuranceLoanBalance1: raw.lifeInsuranceLoanBalance,
      lifeInsuranceLoanRate1: raw.lifeInsuranceLoanRate,
      lifeInsuranceDeathBenefit1: raw.lifeInsuranceDeathBenefit,
      lifeInsuranceIncreasingBenefit1: raw.lifeInsuranceIncreasingBenefit,
      lifeInsuranceAnnualPremium1: raw.lifeInsuranceAnnualPremium,
    };
  }

  // A21: plans from before birth years stored each person's age. Convert
  // it here, before the merge below fills birthYear1/2 from the defaults
  // and hides that the plan ever had an age (sanitizeInputs keeps the same
  // fallback for callers that skip this function).
  for (const n of [1, 2]) {
    const age = Number(raw[`currentAge${n}`]);
    if (raw[`birthYear${n}`] === undefined && raw[`currentAge${n}`] !== undefined && Number.isFinite(age)) {
      const asOf = Number.isFinite(Number(raw.planYear)) && raw.planYear !== undefined ? Number(raw.planYear) : TAX_YEAR;
      raw = { ...raw, [`birthYear${n}`]: asOf - age };
    }
  }

  return raw;
}

// Same idea for the saved-scenarios list — each scenario embeds its own full
// inputs snapshot, so each one needs the same defaulting treatment (an old
// scenario saved before a new field existed shouldn't produce holes in the
// plan when it's loaded back in).
export function migrateScenarios(persisted) {
  let list = [];
  // The list wrapper's version is each scenario's version: the inputs
  // inside are stored bare. A bare array predates versioning.
  let listVersion;
  if (Array.isArray(persisted)) {
    list = persisted; // legacy unversioned format: a bare array
  } else if (persisted && Array.isArray(persisted.scenarios)) {
    list = persisted.scenarios; // versioned wrapper: { schemaVersion, scenarios }
    listVersion = persisted.schemaVersion;
  }
  return list.map(sc => {
    const scInputs = sc.inputs || {};
    const migratedInputs = migrateInputs(listVersion !== undefined ? { schemaVersion: listVersion, inputs: scInputs } : scInputs);
    // Backfill missing `metrics` for scenarios saved by an older, buggy
    // version of the Save Scenario button that stored { id, name, inputs }
    // with no metrics at all — the scenario comparison table/chart reads
    // sc.metrics.endingBalance/isSuccessful/peakPortfolioWorth/
    // successProbability and would crash on any such legacy row. Backfill
    // with a fresh runProjection (cheap) rather than also running Monte
    // Carlo here (comparatively expensive to do for every saved scenario on
    // every app load) — successProbability is left null, which the
    // comparison table already renders as "Not Simulated," matching how it
    // already treats any scenario saved before its own Monte Carlo run.
    let metrics = sc.metrics;
    if (!metrics || typeof metrics.endingBalance !== 'number') {
      const proj = runProjection(migratedInputs);
      metrics = {
        endingBalance: proj.endingBalance,
        isSuccessful: proj.isSuccessful,
        peakPortfolioWorth: proj.peakPortfolioWorth,
        successProbability: (sc.metrics && sc.metrics.successProbability) ?? null,
      };
    }
    return {
      ...sc,
      // Route each scenario's embedded inputs through the same migration
      // path as the live plan (schemaVersion wrapper unwrapping, legacy
      // heirs conversion, etc.) rather than a bare object-merge, so an old
      // saved scenario doesn't lose its heir data the same way a bare merge
      // would.
      inputs: migratedInputs,
      metrics,
    };
  });
}

export const DEFAULT_INPUTS = {
  // Names
  spouse1Name: 'Primary',
  spouse2Name: 'Spouse',
  // Changelog 248: 'female' | 'male' | 'unstated'. Read ONLY by the SSA
  // life-table odds (utils/mortality.js) -- the sentence next to Life
  // Expectancy, the Readiness horizon note, and the Monte Carlo's optional
  // longevity sampling. Nothing in the tax or benefit engine reads it.
  // Unstated uses a 50/50 blend of the two curves.
  sex1: 'unstated',
  sex2: 'unstated',

  // The calendar year THIS PLAN currently treats as "now" -- every age,
  // and the projection's "Year 1", are computed from this instead of
  // directly from TAX_YEAR (see the comment on TAX_YEAR near the top of
  // this file for the full explanation of the split). Defaults to TAX_YEAR
  // for a brand-new plan, but is meant to be advanced independently as real
  // time passes without a code update -- see the "Advance Year" flow in
  // PlanYearPanel.jsx. A plan saved before this field existed is backfilled
  // to TAX_YEAR automatically by the DEFAULT_INPUTS merge in
  // migrateInputs() below, which preserves its exact prior behavior (every
  // plan before this feature implicitly assumed "now" was TAX_YEAR anyway).
  planYear: TAX_YEAR,

  // Demographics
  birthYear1: 1980,
  // Matches claimingAge1 below (Full Retirement Age) instead of retiring
  // 2 years before claiming -- also part of what keeps this default plan
  // solvent; see the preTaxContribution1 comment further down for the
  // other half of that fix.
  retireAge1: 67,
  lifeExpectancy1: 90,
  claimingAge1: 67,

  birthYear2: 1982,
  retireAge2: 67,
  lifeExpectancy2: 90,
  claimingAge2: 67,
  
  spouse2Enabled: false,
  filingStatus: 'Single', // 'MFJ', 'MFS' or 'Single'
  // Married filing separately files TWO returns. This is the share of the
  // household's taxable income that lands on the first of them (audit Q-1,
  // changelog 127). 50 = an even split, the planning default; 100 puts it
  // all on one return, which is right for a one-earner couple and is what
  // the engine used to assume for everybody.
  mfsIncomeSplitPct: 50,
  // Married Filing Separately splits into two quite different regimes, and
  // which one applies turns on a single fact: whether the couple lived
  // together at ANY point in the year. Living apart for the whole year is
  // treated as Single for the harshest rules -- Social Security's base
  // amount, the Roth phase-out, and the Medicare IRMAA schedule. Living
  // together at all triggers a $0 Social Security base amount, a $0-$10,000
  // Roth phase-out, and a three-bracket IRMAA table.
  //
  // Defaults to true because it is the ordinary case: couples who file
  // separately usually still live together.
  mfsLivedWithSpouse: true,

  // Assets
  preTaxInit: 80000,
  rothInit: 20000,
  taxableInit: 15000,
  // 'manual' (default, and the only option that's ever REACHABLE for
  // free/non-premium users -- linking itself only happens via the premium
  // Detailed Holdings tab) or 'holdings' -- when 'holdings',
  // preTaxInit/rothInit/taxableInit/hsaInit above are treated as derived
  // from that tab's real bucket totals (see INTEGRATION_STRATEGY.md
  // Section 3) rather than hand-entered, and get kept in sync
  // automatically (App.jsx's useEffect) instead of needing a manual "Sync
  // to Initial Balances" click every time holdings change. Set the first
  // time a premium user confirms PortfolioTab.jsx's sync/link action;
  // cleared again by SettingsTab.jsx's "unlink" control.
  //
  // Deliberately NOT gated by isPremium once set -- App.jsx's sync effect
  // and SettingsTab.jsx's disabled/badge rendering both key off this
  // field alone, not entitlement. Concretely, that means: if premium
  // lapses while linked, the four fields do NOT revert to manual or
  // become editable -- they stay disabled and keep showing whatever
  // usePortfolioHoldings()'s bucketTotals compute to (that hook itself
  // also isn't isPremium-gated; it just can no longer be EDITED, since
  // the Detailed Holdings tab that would let a user change it is hidden
  // without premium -- see App.jsx's `activeTab === 'portfolio' &&
  // entitlementState.isPremium` guard). Two things keep this safe rather
  // than a lock-out: (1) SettingsTab.jsx's "Unlink" button is NOT
  // isPremium-gated, so a lapsed user can always get back to manual entry
  // themselves; only the "Edit in Detailed Holdings" shortcut next to it
  // is hidden, since that destination is unreachable without premium.
  // (2) Restoring a full backup (fullBackup.js) can still overwrite the
  // underlying holdings/liquidations data even without premium, since
  // Backup/Restore isn't a premium-gated feature -- so a lapsed user's
  // linked totals could in principle change on a restore despite having
  // no way to see the holdings driving them. Worth another look if that
  // ever proves confusing in practice.
  initialBalancesSource: 'manual',

  // Assumptions
  // The return figures are COMPOUND (geometric / CAGR) rates: the main
  // projection grows a balance by exactly this much every year, and since
  // changelog 247 the Monte Carlo draws lognormal returns whose MEDIAN
  // compound growth is this figure, so the two agree by construction. The
  // arithmetic mean of the trials is higher by roughly half the variance
  // (7% at 15% volatility has a ~8.1% arithmetic mean); see
  // lognormalReturnParams for the exact relationship.
  preRetireReturn: 7.0,
  postRetireReturn: 5.0,
  // Standard deviation of one year's return, in percent. Only the Monte
  // Carlo reads these. The retired default was 8% until changelog 247;
  // it is now the figure the Dynamic Asset Allocation branch derives at
  // this app's default 60/40 retired mix (16% stock / 5% bond), so
  // toggling that option no longer changes the assumed retirement risk by
  // half. migrateInputs lifts plans still on the old 8% default.
  volatilityPre: 15.0,
  volatilityPost: 11.6,
  // Monte Carlo trials are reproducible (changelog 247): the same plan and
  // the same seed give the same 1,000 lifetimes and the same success
  // probability, run after run. Reshuffle on the Monte Carlo panel picks a
  // new seed. Any positive integer.
  monteCarloSeed: 1,
  // Optional inflation uncertainty in the Monte Carlo (changelog 247).
  // Off: every trial inflates at inflationRate exactly (bit-identical to
  // the pre-247 behavior apart from the return model). On: each trial
  // year samples inflation around inflationRate with the given standard
  // deviation, correlated with that year's return draw. The sampled
  // figure is applied as a delta from inflationRate to each compounding
  // lifestyle slice's own rate (general, Housing, Health); a year's
  // salary, milestones and the granular SS / medical / Medicare factors
  // stay on their planned rates.
  mcInflationEnabled: false,
  mcInflationVolatility: 1.5,
  // Correlation between a year's return draw and its inflation draw.
  // US annual data since 1928 puts it mildly negative (bad markets and
  // inflation shocks tend to arrive together, 1973-74 being the textbook
  // case). -1 to 1.
  mcInflationReturnCorrelation: -0.2,
  // Optional longevity uncertainty in the Monte Carlo (changelog 248).
  // Off: every trial runs to the Life Expectancy ages exactly. On: each
  // trial draws an age at death per person from the SSA period life table
  // (conditioned on their current age and stated sex), and that trial's
  // plan ends there -- earlier or later than the planned horizon. Success
  // then means the money outlasted the people, which is the real question.
  mcLongevityEnabled: false,
  // Optional long-term care uncertainty in the Monte Carlo (changelog 266).
  // Off: the fixed LTC episode on Healthcare & LTC (if any) runs in every
  // trial. On: each trial draws, per person, whether a paid-care episode
  // happens, when, and for how long (src/utils/ltcRisk.js), charging that
  // person's annual LTC cost for those years and replacing the fixed
  // episode in the trials. The deterministic plan is untouched.
  mcLtcEnabled: false,
  // How the Monte Carlo draws each trial's market path (changelog 267).
  // 'lognormal': each year independently from a lognormal centered on the
  // stated compound return (changelog 247). 'bootstrap': blocks of
  // consecutive real years from 1928 on (src/config/historicalReturns.js),
  // each year bringing its own inflation, so bad markets cluster and the
  // 1970s pairing of falling stocks and rising prices is reachable.
  // mcBootstrapBlockYears is the block length; mcBootstrapCenter 'plan'
  // re-centers the sampled returns and inflation on the plan's own
  // assumptions (the shape of history, the level of the plan) and
  // 'history' uses the raw figures.
  mcReturnModel: 'lognormal',
  mcBootstrapBlockYears: 5,
  mcBootstrapCenter: 'plan',
  inflationRate: 2.5,
  taxBracketInflationRate: 2.5,
  // The withdrawal rate used to size the FI number for FI/CoastFIRE
  // Crossover (fiNumber = target expenses / (safeWithdrawalRate / 100)).
  // 4.0 reproduces the classic "25x expenses" rule of thumb.
  safeWithdrawalRate: 4.0,

  // Granular Inflation Assumptions: category-specific rates that override
  // the general inflationRate above for the cost lines named below. Each
  // defaults to a historically reasonable rate distinct from general CPI
  // (Social Security COLA tracks CPI-W and has averaged ~2-3%/yr;
  // Medicare Part B/D premiums have historically grown faster than
  // general inflation, averaging roughly 5-6%/yr over the last two
  // decades). housingInflationRate is intentionally NOT applied yet --
  // see its own comment further down, near reverseMortgageEnabled.
  // Detailed Holdings -> Retirement Income assumptions. Plan inputs (not
  // tab-local UI state) so they persist, travel with scenarios and Backup
  // Everything, and can differ per scenario. Neither touches the projection
  // engine itself: dividendGrowthRate grows today's holdings dividend total
  // forward for the coverage-by-year view; holdingsYieldPct is the what-if
  // planner's assumed portfolio yield (null = the holdings' actual yield).
  dividendGrowthRate: 5,
  holdingsYieldPct: null,
  ssCOLA: 2.5, // Social Security benefit growth (ss1/ss2), instead of inflationRate
  ssColaAnnounced: true, // on the default COLA, a year SSA has announced uses the announced figure (SS_ANNOUNCED)
  medicalInflationRate: 5.0, // healthcareBridgeCost, instead of inflationRate
  medicarePartBInflationRate: 5.0, // Medicare Part B premium + IRMAA surcharge tiers
  medicarePartDInflationRate: 5.0, // Medicare Part D premium + IRMAA surcharge tiers
  // Long-term care costs have historically grown at their own pace,
  // somewhat independent of general medical trend -- e.g. Genworth's/
  // Northwestern Mutual's own Cost of Care surveys have cited LTC-specific
  // increases in the mid-3% range in some years, noticeably below the 5-6%
  // typically assumed for Medicare/general medical trend. Kept as its own
  // rate (rather than reusing medicalInflationRate) so a plan can reflect
  // that difference instead of assuming LTC and routine healthcare costs
  // always move in lockstep. Applies to ltcCost1/2 only.
  ltcInflationRate: 4.0,
  // housingInflationRate has no dedicated dollar line item to attach to --
  // lifestyleExpense is one blended household budget number, not split
  // into categories. housingExpensePct carves out the % of that budget
  // assumed to be housing-related (rent/property tax/insurance/
  // maintenance), which then grows at housingInflationRate while the
  // remaining (1 - housingExpensePct) share keeps growing at the general
  // inflationRate -- see the currentHousingMultiplier block in
  // runProjection, right next to currentLifestyleMultiplier.
  housingInflationRate: 3.0,
  housingExpensePct: 30,

  equityGlidePathEnabled: false,
  equityGlidePathRate: 0.1, // % return decrease per year retired
  equityGlidePathFloor: 4.0,

  // Income
  salary1: 75000,
  salary2: 45000,
  // Phased/part-time retirement: optional reduced earned income between
  // retireAge and the end age below (0 = feature off, matches prior
  // behavior of a hard cliff to $0 income at retireAge).
  partTimeIncome1: 0,
  partTimeIncomeEndAge1: 70,
  partTimeIncome2: 0,
  partTimeIncomeEndAge2: 70,
  ss1: 24000, // SS benefit at FRA (age 67)
  ss2: 18000,
  // Spousal benefit (42 U.S.C. 402(b)/(c)). When on, that spouse's benefit
  // becomes their own retirement benefit PLUS the "excess spousal" top-up:
  // max(0, 50% of the OTHER spouse's FRA benefit - their own FRA benefit),
  // reduced for early claiming on the spousal schedule (25/36 of 1% per
  // month for the first 36 months before FRA, 5/12 of 1% beyond; no
  // delayed credits past FRA). The top-up is payable only once the other
  // spouse has filed, and under deemed filing its reduction is fixed by the
  // age at which it becomes payable. Off by default: with both off the
  // engine pays exactly ss1 + ss2 as before, so existing plans are
  // untouched. Survivor logic (greater of the two own benefits from 62) is
  // unchanged -- spousal benefits end at the worker's death.
  ssSpousalEnabled1: false,
  ssSpousalEnabled2: false,
  pension1: 0,
  pensionStartAge1: 65,
  // NY (and only NY, today) fully exempts pensions paid by New York State,
  // a NY local government, or the federal government -- no dollar cap and no
  // age test. Separate from the $20,000 private-pension exclusion, and much
  // larger. See calculateStateTaxes.
  // Yonkers residents pay a surcharge on top of their New York State tax.
  // Only consulted when stateTaxState is 'ny'.
  yonkersResident: false,
  // New York City residents pay the city's own resident income tax on top
  // of state tax -- a real bracket schedule, not a Yonkers-style
  // multiplier. Only consulted when stateTaxState is 'ny'; mutually
  // exclusive with yonkersResident (the Settings UI enforces one or the
  // other, since nobody resides in both).
  nycResident: false,
  governmentPension1: false,
  militaryPension1: false,
  pension2: 0,
  pensionStartAge2: 65,
  governmentPension2: false,
  militaryPension2: false,
  annuityIncome: 0,
  rentalIncome: 0,

  // Equity Compensation (RSU/GSU): stock grants tracked separately from
  // salary1/2 because they vest on their own multi-year schedule
  // (typically 4 years) rather than a flat annual amount, and because it's
  // common to hold several overlapping grants at once -- a new grant issued
  // each year, each still vesting from its own start date. This is split
  // into two independent pieces:
  //
  // 1. rsuGrants: grants you already know about today -- each one vests
  //    independently. { id, spouse: 1|2, label, grantYear, totalValue
  //    (today's/grant-date dollars -- NOT re-inflated for later tranches,
  //    since a grant's total value is fixed at issuance; only its eventual
  //    real-dollar payout varies with the stock price, which this model
  //    doesn't attempt to predict), vestingYears, schedule: 'equal' (each
  //    year gets 1/vestingYears of the total) or 'custom' (a
  //    customSchedule array of vestingYears percentages, e.g. a back-loaded
  //    [10, 20, 30, 40], for companies that don't vest evenly). Vesting
  //    income stops being counted once that spouse reaches retireAge1/2,
  //    same cliff as salary1/2 -- this models the common real-world case
  //    where unvested equity is forfeited on departure (some employers have
  //    retirement-eligibility carve-outs that let it keep vesting after
  //    leaving; if that applies to you, just extend retireAge or the
  //    grant's own vestingYears to cover it).
  //
  //    UNIT-DENOMINATED GRANTS (opt-in per grant, the owner's 2026-09-01
  //    design): a grant may carry `units` (> 0) instead of a dollar
  //    totalValue -- e.g. "1,200 GSUs" straight off the grant letter.
  //    Its effective total value is then units × that spouse's
  //    rsuSharePrice1/2 below, recomputed on every projection run, so
  //    when the stock moves you update ONE price field and every unit
  //    grant for that spouse reprices -- unvested tranches included --
  //    instead of re-deriving dollars by hand. Deliberately FLAT at
  //    today's price (no assumed appreciation on unvested units): the
  //    dollar-grant philosophy above -- this model doesn't attempt to
  //    predict the stock -- carries over unchanged; entering units just
  //    moves the "what's it worth today" arithmetic into the app. When
  //    `units` is set, totalValue is ignored for that grant; a unit
  //    grant with no price entered vests $0 (the UI warns loudly).
  //
  // 2. Assumed future "refresh" grants (rsuRefreshEnabled1/2 and friends):
  //    a forward-looking ASSUMPTION, not a known fact -- that a new grant
  //    of about this size gets issued every year on top of whatever's
  //    already vesting from rsuGrants above. Kept completely separate from
  //    rsuGrants because it's inherently uncertain (a smaller
  //    refresh, a layoff, or simply not getting one at all are all real
  //    possibilities) -- see rsuRefreshGapEnabled below for stress-testing
  //    exactly that.
  rsuGrants: [],
  // Current share price for each spouse's employer stock -- the single
  // manual price that every unit-denominated grant of that spouse
  // reprices from (see the rsuGrants comment above). One field per
  // spouse, not per grant (different employers per spouse, one ticker
  // each -- the owner's household reality), and deliberately manual rather
  // than wired to the premium live-pricing Sheet: it's a core free-tier
  // projection input. 0 (default) means "not entered": dollar grants
  // never read it, and a unit grant then contributes $0 with a visible
  // UI warning. Today's dollars; NOT inflated forward (it's a spot
  // price, and the flat-at-today's-price rule above already fixes the
  // projection currency).
  rsuSharePrice1: 0,
  rsuSharePrice2: 0,
  rsuRefreshEnabled1: false,
  rsuRefreshAnnualValue1: 0, // today's-dollars value of an assumed NEW grant issued each year
  rsuRefreshVestingYears1: 4,
  rsuRefreshSchedule1: 'equal', // 'equal' or 'custom'
  rsuRefreshCustomSchedule1: [25, 25, 25, 25], // % per year, only used when schedule1 is 'custom'; should have rsuRefreshVestingYears1 entries summing to ~100
  // How much bigger each successive year's ASSUMED new grant is than the
  // last -- reflects typical promotions/comp growth/refresh-sizing trends,
  // separate from inflationRate since refresh grant sizing rarely tracks
  // general inflation directly.
  rsuRefreshGrowthRate1: 5.0,
  rsuRefreshEnabled2: false,
  rsuRefreshAnnualValue2: 0,
  rsuRefreshVestingYears2: 4,
  rsuRefreshSchedule2: 'equal',
  rsuRefreshCustomSchedule2: [25, 25, 25, 25],
  rsuRefreshGrowthRate2: 5.0,
  // Refresh Grant Gap: a stress test, off by default. Suppresses ONLY the
  // assumed future refresh grant above for a chosen window -- grants
  // already in rsuGrants (or already issued by the refresh assumption
  // before the gap starts) keep vesting on their own schedule untouched.
  // Models a layoff, a stock-price crash gutting refresh $ value, a poor
  // performance cycle, or simply not being granted a refresh that year.
  rsuRefreshGapEnabled: false,
  // A string (not a number) on purpose -- 'both' needs to survive
  // sanitizeInputs' type-preserving coercion, which treats a numeric
  // default as "must be a number" and would otherwise zero out 'both'.
  rsuRefreshGapSpouse: '1', // '1', '2', or 'both'
  rsuRefreshGapStartYear: 2028,
  rsuRefreshGapDurationYears: 4,

  // Concentrated Stock Position: tracks accumulated employer stock (e.g.
  // years of vested RSU/GSU shares that were never sold) as its OWN
  // risk-exposure bucket, separate from the diversified Taxable Brokerage
  // balance. A single-company holding carries concentration risk a
  // diversified portfolio doesn't -- most advisors flag anything above
  // roughly 10-15% of net worth in one stock as a risk worth actively
  // managing down. Off by default since most users don't hold a
  // significant single-stock position outside what RSU vesting already
  // adds to salary/taxable income.
  concentratedStockEnabled: false,
  concentratedStockLabel: '', // free-text, e.g. "GOOG" -- display only
  concentratedStockInit: 0, // current market value of the position today
  // 'manual' | 'holdings' -- same link/unlink pattern as
  // initialBalancesSource/taxableBasisSource/stockAllocationSource above,
  // but this one links a SINGLE specific Detailed Holdings holding rather
  // than an aggregate bucket, since only one concentrated position is
  // modeled here (concentratedStockHoldingId points at that holding's id).
  // Once linked, concentratedStockLabel/Init/CostBasisPct all sync from
  // that real holding (SettingsTab.jsx's "Link to a Holding" dropdown,
  // restricted to Taxable-tagged holdings -- diversification proceeds
  // always flow into the Taxable bucket below, so linking a Pre-Tax/Roth/
  // HSA holding would misrepresent the tax treatment this model assumes).
  // Growth Rate, Diversify %, Diversify Tax Rate, and Concentration Target
  // stay manual even when linked -- they're forward assumptions about
  // what you plan to DO with the position, not facts read from it today.
  concentratedStockSource: 'manual',
  concentratedStockHoldingId: null,
  // What fraction of the current balance is cost basis vs. unrealized
  // gain -- used only to size the tax hit when diversifying (see below).
  // A single flat assumed % rather than true per-lot tracking, the same
  // simplification the app already makes for the main Taxable Brokerage
  // bucket's taxableCapitalGainsRatio fallback.
  concentratedStockCostBasisPct: 20,
  concentratedStockGrowthRate: 8.0, // single-stock expected return can differ from a diversified portfolio's
  // % of the CURRENT balance sold off ("diversified") into Taxable
  // Brokerage each year -- 0 models simply holding and tracking risk with
  // no active de-risking plan.
  concentratedStockDiversifyPct: 0,
  // Flat assumed tax rate applied to the realized-gain portion of each
  // year's diversification sale. A simplification (the real rate depends
  // on that year's full income picture, same as every other capital gain
  // in the app) -- kept flat and self-contained here specifically so
  // enabling this feature can never change any OTHER year's tax bracket
  // math or cash-flow-needed calculation.
  // Legacy escape hatch (audit Q-10(b), changelog 127). Off, the gain a
  // diversification realizes runs through the real capital-gains engine --
  // 0/15/20% stacking, NIIT, state tax, and every MAGI. On, it reverts to
  // concentratedStockDiversifyTaxRate applied outside the engine, which is
  // what plans built before changelog 127 were doing.
  concentratedStockFlatTaxEnabled: false,
  concentratedStockDiversifyTaxRate: 15,
  // Threshold (% of total net worth) above which the UI flags the position
  // as a concentration risk worth addressing -- display-only, doesn't
  // affect the projection itself.
  concentratedStockConcentrationTargetPct: 10,
  // Vest routing: model HOLDING new RSU/GSU shares as they vest, instead of
  // the default assumption that vest proceeds are sold and land as
  // diversified cash. Mirrors the common big-tech mechanic (e.g. Google):
  // the employer sells a fixed % of each vest to cover taxes
  // ("sell-to-cover"), and the remaining net shares land in your account,
  // where you choose to keep or sell them. When enabled, the held slice of
  // each year's vest value is diverted OUT of cash flow (it never becomes
  // spendable/investable cash) and INTO concentratedStockBalance as new
  // shares with full (100%) cost basis -- basis at vest equals that day's
  // market price, so a just-vested share carries no unrealized gain. The
  // vest income itself is still fully ordinary income in `salary` either
  // way (holding shares doesn't change what the IRS taxes at vest).
  // Entirely inert unless BOTH concentratedStockEnabled and this flag are
  // on, so it cannot change any existing plan's numbers.
  concentratedStockVestRoutingEnabled: false,
  // % of each vest's shares the employer sells at vest to cover tax
  // withholding (Google-style sell-to-cover). ~35 is typical for
  // supplemental-wage withholding + FICA. The engine still computes the
  // ACTUAL tax on the full vest through the normal tax math -- this input
  // only determines how many shares are left to potentially hold.
  concentratedStockVestCoverPct: 35,
  // Of the shares remaining AFTER sell-to-cover, the % you keep as shares
  // (100 = hold everything the employer leaves you; 0 = sell on vest, which
  // is identical to leaving routing disabled).
  concentratedStockVestHoldPct: 100,
  // Whose vests feed the position: '1', '2', or 'both'. 'both' is for the
  // case where both spouses hold the SAME employer's stock; when each
  // spouse holds a DIFFERENT employer's stock, use the second position
  // below for the other spouse instead.
  concentratedStockVestSpouse: '1',

  // Second concentrated position -- for the household where each spouse
  // holds a different employer's stock (one's GOOG, the other's META).
  // Same model as position 1 in every respect; the un-numbered keys above
  // stay as position 1 so existing saved plans are untouched. Both
  // positions share concentratedStockConcentrationTargetPct as the risk
  // threshold -- each stock's concentration % is judged against the same
  // household net worth. calculator.js's csPositionConfig() is the single
  // mapping between the two key families.
  concentratedStock2Enabled: false,
  concentratedStock2Label: '',
  concentratedStock2Init: 0,
  concentratedStock2Source: 'manual', // 'manual' | 'holdings' -- same link pattern as position 1
  concentratedStock2HoldingId: null,
  concentratedStock2CostBasisPct: 20,
  concentratedStock2GrowthRate: 8.0,
  concentratedStock2DiversifyPct: 0,
  concentratedStock2DiversifyTaxRate: 15,
  concentratedStock2VestRoutingEnabled: false,
  concentratedStock2VestCoverPct: 35,
  concentratedStock2VestHoldPct: 100,
  concentratedStock2VestSpouse: '2', // defaults to the OTHER spouse's vests

  // Cash Floor / Emergency Reserve: the classic retirement "bucket
  // strategy" defense against sequence-of-returns risk -- keep a stable
  // cash reserve (money market/HYSA-type yield, not market-invested) sized
  // to a chosen number of months of spending, spend it FIRST during a
  // down-market retirement year instead of selling depressed investments,
  // and top it back off out of that year's withdrawal once markets recover.
  // Off by default; entirely inert (no effect on any existing plan) unless
  // enabled.
  cashFloorEnabled: false,
  cashFloorInit: 0, // starting reserve balance, if you already keep one
  // 'manual' (default) or 'holdings' -- when linked, cashFloorInit tracks
  // the Taxable-account cash-equivalent holdings in Detailed Holdings, and
  // those same holdings are netted OUT of the Taxable bucket so the dollars
  // are not counted in both places (see computeCashReserveFromHoldings, and
  // concentratedStockSource for the same pattern). Free users never leave
  // 'manual'; losing Premium keeps the last synced figure, and Unlink is on
  // this screen, not behind the paywall.
  cashFloorSource: 'manual',
  // Target size of the reserve, expressed as months of that year's
  // spending (lifestyle + healthcare + LTC + IRMAA, the same total the
  // FI/CoastFIRE Crossover target uses) -- rather than a fixed $ amount, so
  // the target naturally grows with inflation and lifestyle-phase changes
  // over a multi-decade retirement.
  cashFloorTargetMonths: 24,
  // Assumed yield on the reserve itself -- deliberately low/stable (a
  // savings account or money-market fund), not the portfolio's investment
  // return, since the entire point of this bucket is to NOT be exposed to
  // market risk.
  cashFloorReturnRate: 3.0,
  // Optional: while still working, redirect leftover cash flow (income minus
  // taxes, living expenses, and planned contributions -- the same "surplus"
  // that would otherwise just spill into Taxable Brokerage every year) into
  // the reserve first, up to its target, instead of leaving the entire
  // reserve to be built with one large top-off draw in the first retirement
  // year. Uses the same months-of-spending target as retirement (based on
  // that year's projected lifestyle+healthcare+LTC+IRMAA cost), so the
  // reserve is naturally sized correctly by the time you actually retire.
  // Off by default; no effect unless cashFloorEnabled is also on.
  cashFloorPreFundEnabled: false,

  // Non-Qualified Deferred Compensation (NQDC / "top-hat" 409A plan): lets
  // a highly-compensated employee defer salary/bonus pre-tax with NO IRS
  // dollar limit (unlike a 401(k)'s elective deferral cap), in exchange for
  // real tradeoffs this app models: the deferred balance is just an
  // unsecured promise from the employer (not held in a protected trust like
  // a 401(k) -- employer bankruptcy risk isn't modeled here, but the money
  // isn't yours to touch early the way a brokerage account would be), the
  // distribution schedule must be elected in advance and followed exactly
  // (real 409A violations trigger severe penalty taxes, not modeled here --
  // this always pays out exactly on the elected schedule), and unlike a
  // 401(k) contribution, the deferral IS still subject to FICA/payroll tax
  // in the year it's deferred (only income tax is postponed) -- this falls
  // out automatically here since FICA wages are computed from gross salary,
  // untouched by any contribution/deferral field. Off by default per spouse.
  nqdcEnabled1: false,
  nqdcInit1: 0, // existing NQDC balance already accrued, if any
  nqdcDeferralAmount1: 0, // $/yr deferred from salary while still working
  nqdcGrowthRate1: 6.0, // this plan's own credited-earnings rate, tracked separately from the portfolio
  // Age distributions begin -- real 409A plans require electing this in
  // advance as either a specified future date or "separation from
  // service" (i.e. retirement); defaults to a typical "pay out starting at
  // retirement" election.
  nqdcDistributionStartAge1: 67,
  // Years the payout is spread over once it starts (1 = lump sum in a
  // single year; more = level installments, recalculated against the
  // remaining balance each year so it self-corrects for growth during the
  // payout phase).
  nqdcDistributionYears1: 5,
  nqdcEnabled2: false,
  nqdcInit2: 0,
  nqdcDeferralAmount2: 0,
  nqdcGrowthRate2: 6.0,
  nqdcDistributionStartAge2: 67,
  nqdcDistributionYears2: 5,

  // Survivor Stress Test
  survivorStressEnabled: false,
  survivorStressSpouse: 1, // 1 or 2
  survivorStressAge: 75,
  survivorExpenseDropPct: 20,

  // Savings / Contributions (annual limits). Pre-Tax and Roth are tracked
  // per spouse (preTaxContribution1/2, rothContribution1/2) since two
  // working spouses very often contribute different dollar amounts to
  // their own 401(k)s. Taxable brokerage stays a single combined field —
  // that account is much more often genuinely joint/household savings
  // rather than tied to one paycheck. See migrateInputs() for how a plan
  // saved before this split (a bare preTaxContribution/rothContribution)
  // gets carried forward without losing data.
  //
  // Sized to ~13.3% of salary1 (7000+2000+1000 on a $75k salary) -- still
  // squarely within the 10-15% of income most retirement guidance
  // (Fidelity, Vanguard, etc.) recommends saving, rather than the ~6%
  // these used to default to. That earlier, lower rate combined with
  // employerMatch1 defaulting to a flat $0 (see employerMatchMode1 below)
  // meant a brand-new visitor's very first look at the app -- before
  // touching a single input -- showed a projected shortfall. That's a bad
  // first impression for a tool meant to help someone plan a successful
  // retirement, and not even an accurate one: real median/average 401(k)
  // and Social Security balances (Vanguard 2025, SSA) are actually in the
  // same ballpark as the OLD defaults already were, so the fix here isn't
  // "inflate the numbers" -- it's "stop defaulting to an unrealistic $0
  // employer match, and default the savings rate to what's actually
  // recommended" rather than what the least-prepared savers manage.
  //
  // Bumped again from 6000 to 7000 (12% -> 13.3%, still inside that same
  // 10-15% band) alongside retireAge1/2 moving to 67 above, after Social
  // Security COLA, Medical, Housing, and Medicare Part B/D were each wired
  // up to their own dedicated (and mostly higher-than-general) inflation
  // rate -- without this nudge, those more realistic cost assumptions on
  // their own pushed this same default plan to a projected $0 shortfall.
  preTaxContribution1: 7000,
  preTaxContribution2: 3000,
  rothContribution1: 2000,
  rothContribution2: 1200,
  taxableContribution: 1000,
  // Mega Backdoor Roth: whether that spouse's OWN employer plan allows
  // after-tax (non-Roth) employee contributions beyond the elective
  // deferral limit, AND either in-plan Roth conversions or in-service
  // withdrawals to actually move those dollars into Roth status. This is
  // a much less common plan feature than a plain Roth 401(k) option, and
  // can't be inferred from anything else already in this model -- it has
  // to be confirmed against the plan's own Summary Plan Description or
  // with its administrator. Defaults to false (don't assume it's
  // available) so the Contribution Advisor doesn't tell someone they have
  // room to use a feature their plan doesn't actually offer.
  afterTaxContributionsAllowed1: false,
  afterTaxContributionsAllowed2: false,
  // Auto-Max Contribution: overrides that spouse's own preTaxContribution1/2
  // each year with the current-year, age-aware IRS limit instead of a
  // flat $ amount you have to manually update as the limit changes.
  // 'off' (default) keeps the manual preTaxContribution1/2 amount.
  // '401k' maxes to the elective deferral limit (getElectiveDeferralLimit
  // -- 401(k)/403(b)/governmental 457/TSP-style plans, the most generous
  // account type). 'ira' maxes to the much lower Traditional/Roth IRA
  // limit (getIRAContributionLimit) -- use this if your Pre-Tax/Roth
  // savings actually represent IRA contributions rather than a workplace
  // plan.
  //
  // 'max' is the one-click "contribute the maximum" easy button: it maxes
  // EVERYTHING this spouse can legally stack in a year --
  //   (1) the full 401(k)-style elective deferral, split by
  //       getMaxContributionSplit (base limit Pre-Tax; the catch-up
  //       portion flips to Roth automatically in years SECURE 2.0's
  //       mandatory-Roth-catch-up rule applies), OVERRIDING this spouse's
  //       manual preTaxContribution AND rothContribution fields;
  //   (2) an IRA on top -- a separate limit that legally stacks on the
  //       401(k) -- contributed at the age-aware IRA limit every working
  //       year through the app's existing backdoor Roth mechanism
  //       (income-limit-proof by construction, and correctly subject to
  //       the pro-rata rule; it REPLACES, never adds to, that spouse's
  //       configured backdoorRothAnnualAmount so nothing double-counts);
  //   (3) the household HSA at its legal limit (self/family per
  //       hsaFamilyCoverage, 55+ catch-up) while a 'max'-mode spouse is
  //       working and under 65 -- 65+ is treated as Medicare-enrolled and
  //       HSA-ineligible, falling back to the manual hsaContribution.
  // All three pieces are age-aware per spouse and grow with inflation,
  // exactly like the existing modes.
  autoMaxContribution1: 'off', // 'off', '401k', 'ira', 'max'
  autoMaxContribution2: 'off',
  // Employer 401(k)/403(b) match — credited only while that spouse is
  // working. Deliberately kept separate from preTaxContribution: employer
  // match is "free money" that doesn't draw down household cash flow and
  // doesn't count against the employee's own IRS elective deferral limit
  // (see getElectiveDeferralLimit / the contribution-limit warning in
  // SettingsTab.jsx), so mixing it into preTaxContribution would both
  // overstate the household's own savings rate and trigger false
  // contribution-limit warnings.
  //
  // employerMatchMode1/2: 'flat' (a simple annual $ amount, inflated like
  // salary — the original behavior, still the default) or 'percent' (a
  // real matching formula, since many real employer matches are tied to
  // percentages of pay/deferrals and IRS limits rather than a fixed
  // dollar figure that has to be hand-updated every year). See
  // calculateEmployerMatch() for how the percent-mode fields below
  // combine into a match amount.
  //
  // Spouse 1 defaults to 'percent' rather than 'flat' -- a brand-new plan
  // otherwise implied a $75k earner whose employer match is a flat $0,
  // which is a far less realistic default than "no 401(k)/403(b) match at
  // all" sounds like it should be (most employers offering a workplace
  // plan match at least something). The percent-mode fields below were
  // already configured with a plausible 50%-of-deferrals formula; this
  // just turns that on for the primary earner instead of leaving it inert.
  employerMatch1: 0,
  employerMatch2: 0,
  employerMatchMode1: 'percent',
  employerMatchMode2: 'flat',
  // Tier A: rate (%) applied to elective deferrals, capped at capAPct% of
  // that spouse's own IRS elective deferral limit for the year (100% =
  // match applies up to the full limit).
  employerMatchRateA1: 50,
  employerMatchCapAPct1: 100,
  employerMatchRateA2: 50,
  employerMatchCapAPct2: 100,
  // Tier B (optional): a second rate (%) applied to deferrals, capped at
  // a flat dollar amount (inflated forward like other statutory-style
  // dollar limits in this model) instead of a percentage of the IRS
  // limit -- e.g. "100% of the first $3,000 contributed." Combined with
  // Tier A via employerMatchCombine: 'greaterOf' takes whichever tier's
  // result is larger (common for "either/or" match formulas like the
  // example this feature was built from); 'sumOfTiers' adds them
  // together (common for simple graduated match schedules).
  employerMatchTierBEnabled1: false,
  employerMatchRateB1: 100,
  employerMatchCapB1: 3000,
  employerMatchCombine1: 'greaterOf', // 'greaterOf', 'sumOfTiers'
  employerMatchTierBEnabled2: false,
  employerMatchRateB2: 100,
  employerMatchCapB2: 3000,
  employerMatchCombine2: 'greaterOf',
  deficitReductionStrategy: 'reduceTaxableFirst',

  // HSA (Health Savings Account) — a fourth account bucket alongside
  // Pre-Tax/Roth/Taxable. Contributions reduce taxable salary like a
  // Pre-Tax contribution, growth is tax-free like Roth, and withdrawals
  // are tax-free *specifically when used for qualified medical costs*
  // (this app applies that to healthcareBridge/ltcCost/irmaaCost). Set
  // hsaContribution to $0 to disable, matching the pattern used for the
  // optional annuity purchase above.
  hsaInit: 0,
  hsaContribution: 0,
  hsaFamilyCoverage: false, // affects the 2026 IRS limit warning only

  // Qualified Charitable Distribution: once RMDs begin, an annual amount
  // (capped by the RMD itself, and by the IRS per-person QCD limit) that
  // goes straight from the Pre-Tax account to charity instead of to the
  // household — satisfies the RMD requirement but is excluded from taxable
  // income entirely (unlike a normal RMD). Set to $0 to disable.
  qcdAnnualAmount: 0,
  // Whether the spouse is the sole beneficiary of the Pre-Tax accounts
  // (changelog 416). While both are alive and the spouse is more than 10
  // years younger than the owner, that puts the RMD on the joint-life
  // table (getRMDDivisor). Off when a trust, a child or several people are
  // named instead. Nothing else reads it.
  rmdSpouseSoleBeneficiary: true,

  // Federal deductions (changelog 417). 'auto' takes the larger of the
  // standard deduction and the itemized total each year (itemizedDeductionFor);
  // 'never' takes the standard deduction whatever the itemized total, which
  // is how every plan was taxed before 417. The two dollar inputs are
  // today's dollars: property tax grows at the housing rate, gifts at the
  // general rate. The mortgage switch says the mortgage is acquisition
  // debt (bought or built the home) rather than a cash-out or home-equity
  // loan, whose interest is not deductible.
  itemizeDeductions: 'auto',
  propertyTaxAnnual: 0,
  charitableGivingAnnual: 0,
  mortgageIsAcquisitionDebt: true,

  // Expenses
  lifestyleExpense: 48000,

  // How lifestyleExpense (above) gets entered in the UI -- 'annual' (a
  // single lump $/yr figure, the default/original behavior) or 'monthly'
  // (12 separate January-December figures that get summed to produce
  // lifestyleExpense). Purely a data-entry convenience: calculator.js and
  // every projection function only ever read the annual lifestyleExpense
  // total, never lifestyleExpenseMonthly directly, regardless of which mode
  // was used to build it -- so nothing downstream needs to know or care
  // which mode a given plan was entered in.
  lifestyleExpenseInputMode: 'annual',
  // The 12 monthly figures backing 'monthly' mode, January first. Only
  // meaningful when lifestyleExpenseInputMode === 'monthly' -- otherwise
  // stale/unused. Defaults to an even split of the default annual figure
  // above so switching into monthly mode for the first time doesn't start
  // from all-zeros.
  lifestyleExpenseMonthly: [4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000],
  // Rung 3 of the Retirement Spending module (changelog 137): the category
  // ledger backing 'categories' mode. FREE -- the paid analytics that read
  // the essential flag come later (rung 6).
  //
  // ONE key holding structured data, following the `milestones: []`
  // precedent: one InputReference row, one inputCoverage entry, and it rides
  // into saved scenarios and fullBackup for free. An object rather than a
  // bare array because the essential flags are per CATEGORY, not per line,
  // and a sibling key would need its own coverage entry for the same concept.
  //
  // `lines` is FLAT and each line carries a canonical `categoryId` -- never
  // an index, never a label -- so re-import can replace imported lines
  // without disturbing hand-entered ones (rung 4), and so renaming a
  // category in the UI never orphans data. `source` and `importedAt` are
  // already here for that reason even though nothing imports yet.
  //
  // Like every other structured input, sanitizeInputs passes this through
  // UNCHECKED -- readSpendingBlueprint() below is the normalizer.
  spendingBlueprint: {
    lines: [],
    // Canonical category ids the household treats as essential. Category
    // level, not line level: a per-line flag turns the ledger into
    // bookkeeping, and a ledger nobody finishes is worse than the single
    // box it replaces.
    essentialCategoryIds: ['housing', 'food', 'health', 'insurance'],
    // Derived fields the user has taken back manual control of. Copies
    // initialBalancesSource's safety property: unlinking is NOT
    // entitlement-gated and does NOT destroy the ledger, so nobody is ever
    // locked out of a field they used to be able to edit.
    unlinkedFields: [],
  },
  // Step 6 of the Retirement Spending module (changelog 139). PAID surface,
  // but the ENGINE branches on this flag -- data -- never on entitlement, so
  // a lapsed subscriber's saved plan keeps projecting the same numbers.
  //
  // Off by default: with it off the retirement-entry-crash guardrail cuts a
  // flat 10% of the whole budget, exactly as it always has.
  //
  // On, and with an essential share known from the ledger, the cut comes out
  // of DISCRETIONARY spending only and can never reach into essentials --
  // which is what a real household does. A plan whose essentials are most of
  // its budget therefore cannot cut its way out of a bad market, and the
  // projection stops pretending it can.
  floorAwareGuardrailsEnabled: false,
  // How hard discretionary spending is cut when the floor-aware guardrail
  // fires. The user's policy, not ours -- 25% of the discretionary half is a
  // deeper cut than today's flat 10% of everything for most budgets, and a
  // shallower one for a household that is nearly all essentials.
  discretionaryCutPct: 25,

  // Withdrawal-rate guardrails (changelog 216) -- the "dynamic spending"
  // rule the retirement-readiness question 2 asks about: if the market
  // falls right after you retire, at what point would you actually have to
  // change your lifestyle, and if it runs hot, when may you spend more?
  //
  // OFF by default, and when off nothing below is read, so an existing plan
  // projects to the bit exactly as it did before this existed.
  //
  // The rule watches the withdrawal RATE -- last year's total portfolio
  // withdrawals over the portfolio it started that year with -- against the
  // rate the household retired on. Rising past the upper band means the
  // portfolio is shrinking faster than the plan assumed, so lifestyle
  // spending steps down; falling below the lower band means the opposite,
  // so it steps up. Both steps are permanent until the next trigger, and
  // both are capped, because a household will neither cut forever nor treat
  // one good decade as a permanent raise.
  withdrawalGuardrailsEnabled: false,
  // How far the rate may drift from the retirement-year rate before the
  // rule acts, as a PERCENTAGE OF that rate: 20 means a 4.0% starting rate
  // triggers a cut above 4.8% and a raise below 3.2%.
  wrGuardrailBandPct: 20,
  // The size of one step, as a percentage of current lifestyle spending.
  wrGuardrailCutPct: 10,
  wrGuardrailRaisePct: 10,
  // The rails on the rails. Lifestyle spending never sits more than this
  // far below, or above, the plan's own figure however many times the rule
  // fires.
  wrGuardrailMaxCutPct: 20,
  wrGuardrailMaxRaisePct: 20,

  // Current Household Spending — a SEPARATE figure from lifestyleExpense.
  // lifestyleExpense is the retirement-TARGET spend (also drives
  // fiTargetExpenses/fiNumber/CoastFIRE, so it must never change based on
  // employment status). Pre-retirement years, though, often spend
  // differently than that target -- typically less, since income is also
  // funding savings/contributions that stop at retirement. Before this
  // field existed, pre-retirement years used lifestyleExpense as a stand-in
  // for actual current spending, which could show retirement accounts being
  // drawn down while still working whenever lifestyleExpense (the target)
  // exceeded current take-home pay after taxes and savings -- money that in
  // real life was never actually spent that way. 'auto' derives current
  // spending from take-home pay (salary + pensions/SS/etc minus taxes minus
  // savings contributions) each year; 'custom' lets the user enter their
  // actual known budget instead. Only affects pre-retirement (!isRetired)
  // years -- once retired, lifestyleExpense (the target) takes over as
  // originally designed.
  currentSpendingMode: 'auto', // 'auto' | 'custom'
  currentHouseholdSpendingCustom: 60000,
  // Rung 2 of the Retirement Spending module (changelog 135): the three
  // figures the bridge cannot derive, kept as ONE key holding an object,
  // following the `milestones: []` precedent -- one InputReference row, one
  // inputCoverage entry, and it rides into saved scenarios and fullBackup
  // for free. Everything else the bridge needs it already knows: the
  // starting residual comes from the projection, and current debt service
  // comes from mortgagePayment + otherDebtPayment.
  //
  // All three are annual, in today's dollars, and default to 0 so the
  // bridge is inert until someone fills it in. sanitizeInputs passes
  // objects through unchecked, so readSpendingBridge() below normalizes.
  spendingBridge: {
    // Health premiums and out-of-pocket costs you pay WHILE WORKING. These
    // sit inside the residual (they come out of take-home pay) but the plan
    // adds retirement health cost as its own line -- healthcareBridgeCost
    // before 65, irmaaCost after -- so leaving them in would double-count.
    currentHealthPremiums: 0,
    // Costs that stop the day you stop working: commuting, parking, lunches
    // out, work clothes, professional dues, a second car. Modeled nowhere
    // else in the app, so this is the one genuinely new number.
    workCostsThatStop: 0,
    // What goes UP in retirement: travel, hobbies, grandchildren. The
    // three-phase curve shapes the level over time; it does not set it.
    retirementIncreases: 0,
  },

  goGoBumpEnabled: false,
  goGoBumpRate: 10.0, // +10% travel bump
  goGoBumpEndAge: 75,
  healthcareBridgeCost: 12000, // per spouse prior to 65
  // What share of that pre-65 cost is INSURANCE PREMIUMS rather than
  // out-of-pocket care (audit Q-8, changelog 126). It matters because an
  // HSA may not be spent on health-insurance premiums: IRS Publication 969
  // says "You may not use HSA funds to pay for insurance" and lists only
  // four exceptions -- long-term care insurance, COBRA-style continuation
  // coverage, coverage while receiving unemployment compensation, and
  // Medicare and other coverage at 65 or older. A marketplace policy bought
  // before 65 is none of those. The out-of-pocket remainder (deductibles,
  // copays, dental, prescriptions) is qualified as normal.
  healthcareBridgePremiumPct: 70,
  // The one case where those pre-65 premiums DO qualify: the coverage is
  // COBRA continuation, or is being paid while the household receives
  // unemployment compensation. Off by default -- an early retiree on a
  // marketplace plan is the common case and cannot use the HSA for it.
  hsaPreMedicarePremiumsQualified: false,
  // LTC is fully independent per spouse -- each spouse can have their own
  // Active toggle, Cost, Start Age, Duration, and "Ends in Death" setting,
  // since real LTC need varies hugely by individual (one spouse may never
  // need it, or need a very different kind/cost of care than the other).
  ltcActive1: false,
  ltcCost1: 60000,
  ltcStartAge1: 82,
  // How many years the LTC cost applies for, starting at ltcStartAge1.
  // Real long-term-care episodes average ~2-3 years, not the remainder of
  // life — 3 is a slightly conservative (higher-cost) default within that
  // real-world range. Ignored when ltcEndsInDeath1 is true.
  ltcDurationYears1: 3,
  // When true, this spouse's LTC cost is NOT bounded by ltcDurationYears1
  // -- it instead runs every year from ltcStartAge1 onward until their own
  // death (their lifeExpectancy age), modeling a permanent decline rather
  // than a bounded episode. Off by default since most real LTC episodes
  // are bounded, not lifelong.
  ltcEndsInDeath1: false,
  ltcActive2: false,
  ltcCost2: 60000,
  ltcStartAge2: 82,
  ltcDurationYears2: 3,
  ltcEndsInDeath2: false,
  lifestyleThreePhaseEnabled: false,
  // Floor-aware phases (changelog 262): when a category ledger drives the
  // budget, each phase multiplier applies to the DISCRETIONARY share only
  // and the essential share stays whole -- No-Go at 0.70 on a budget that
  // is 65% essential is a 10.5% cut, not 30%. Without a ledger there is no
  // essential share and this has no effect. See phaseMultiplierFor.
  phasesFloorAware: true,
  goGoEndAge: 75,
  goGoMultiplier: 1.10,
  slowGoEndAge: 83,
  slowGoMultiplier: 0.85,
  noGoMultiplier: 0.70,
  // Lifetime gifting. Giving money away while you're alive is the one
  // estate lever that shrinks the taxable estate AND gets the money to
  // people while you can watch them use it -- but it is also the one most
  // often modeled wrong, because "the gift tax" almost never actually
  // applies. Gifts inside the annual exclusion cost nothing and don't even
  // require a return; gifts above it don't trigger tax either, they just
  // eat into the same lifetime exemption that would otherwise shelter the
  // estate. That trade is what this models.
  //
  // Deliberately NOT modeled here (see the Guide's gifting notes): gifts
  // to a spouse who isn't a US citizen, which have their own separate cap
  // and no unlimited marital deduction; 529 five-year front-loading;
  // direct tuition and medical payments, which are unlimited and excluded
  // entirely; and charitable giving.
  giftingEnabled: false,
  giftingRecipients: 2,
  giftingPerRecipient: 19000,
  // Gift-splitting: a married couple can treat a gift from one of them as
  // made half by each, doubling the exclusion per recipient. Requires
  // consent on a gift tax return in real life; modeled here as a simple
  // doubling since the plan-level effect is identical.
  giftingSplitWithSpouse: false,
  giftingStartAge: 70,
  giftingYears: 10,
  giftingGrowWithInflation: true,

  // Deprecated single-heir fields — kept only so migrateInputs can convert
  // old persisted plans/scenarios into the `heirs` array below. New code
  // should read/write `heirs`, not these.
  heirFilingStatus: 'Single',
  heirIncome: 100000,
  // 'rmd_10' (default since changelog 125, audit Q-21): the annual
  // life-expectancy RMDs a non-eligible designated beneficiary must take in
  // years 1-9 when the owner died on or after the required beginning date
  // (Reg. s.1.401(a)(9)-5(d)), then the balance in year 10. 'flat_10',
  // 'lump_sum_start' and 'lump_sum_end' remain as voluntary patterns;
  // 'lump_sum_end' is not permitted after the RBD and is replaced by
  // 'rmd_10' in that case (heirStrategyApplied says so).
  heirDistributionStrategy: 'rmd_10',
  // How the estate is divided among the heirs (changelog 259): 'equal'
  // gives each heir 1/n and ignores splitPct; 'custom' uses each heir's
  // splitPct, normalized to sum to 100. Equal is the default because it is
  // what most people with more than one child mean and it never leaves a
  // "1% unassigned" remainder; migrateInputs keeps a plan whose splits
  // already differ on 'custom'.
  heirSplitMode: 'equal',
  // Multi-heir estate splitting: each heir has their own filing status and
  // baseline outside income (used to compute their marginal tax drag on an
  // inherited pre-tax IRA/401k share), plus a splitPct of the total ending
  // portfolio they receive. splitPct values are normalized to sum to 100 in
  // calculateHeirEstateTax, so they don't need to add up exactly as the user
  // edits them. heirDistributionStrategy (above) applies to every heir's
  // pre-tax share alike — this app doesn't model per-heir withdrawal timing.
  heirs: [
    // isSkipPerson marks a beneficiary two or more generations below you --
    // a grandchild, or an unrelated person more than 37.5 years younger.
    // Their share can attract generation-skipping transfer tax ON TOP of
    // estate tax; see GST_EXEMPTION_2026 below.
    // `relationship` drives which beneficiary class the five inheritance-tax
    // states put this heir in (see STATE_INHERITANCE_SCHEDULES). The literal
    // rather than DEFAULT_HEIR_RELATIONSHIP because that constant is declared
    // far below this object and would be in the temporal dead zone here;
    // calculator.test.js asserts the two stay in sync.
    // `age` (today, in the plan year) drives the single-life divisor of the
    // inherited-IRA RMD schedule; absent, the heir is assumed 30 years
    // younger than the first spouse.
    { id: 1, name: 'Heir 1', filingStatus: 'Single', income: 100000, splitPct: 100, isSkipPerson: false, relationship: 'child', age: undefined },
  ],

  // Charitable bequest: a slice of the estate left to charity instead of to
  // heirs. The estate tax deduction for it is unlimited, which makes it the
  // one lever that reduces the taxable estate without limit -- unlike gifts,
  // which are capped, or the marital deduction, which only defers.
  // Audit Q-13: carry the estate/GST/state exemptions and the heirs' tax
  // brackets forward to the plan's final year at the Tax Bracket Inflation
  // Rate, so a nominal estate thirty years out is not measured against 2026
  // thresholds. Off restores the unindexed comparison.
  estateIndexingEnabled: true,
  charitableBequestEnabled: false,
  charitableBequestMode: 'percent', // 'percent' or 'amount'
  charitableBequestPct: 10,
  charitableBequestAmount: 100000,
  // Which accounts the bequest is drawn from. 'proportional' is the
  // historical behavior and stays the default so existing saved plans
  // produce identical numbers. See CHARITABLE_SOURCE_ORDERS.
  charitableBequestSource: 'proportional',

  // Net Unrealized Appreciation (NUA): a one-time in-kind distribution of
  // employer stock held inside the Pre-Tax 401(k), typically taken at
  // separation from service / retirement. nuaCostBasis is what was actually
  // paid for the stock inside the plan (taxed as ordinary income at
  // distribution); nuaCurrentValue is the stock's value at distribution
  // (nuaCurrentValue - nuaCostBasis, the "net unrealized appreciation," is
  // untaxed at distribution and moves into the Taxable account, taxed at
  // capital-gains rates only when eventually realized). nuaDistributionAge
  // is spouse 1's age when the one-time event fires.
  nuaEnabled: false,
  nuaCostBasis: 0,
  nuaCurrentValue: 0,
  nuaDistributionAge: 65,

  // Debt (mortgage + other, e.g. auto/personal loans): simple annual-step
  // amortizing balances. Set a payment to $0 to disable that debt entirely.
  // Payoff age/year is a derived output (the year the balance hits $0), not
  // a direct input — set the payment high enough to pay it off on the
  // desired timeline.
  mortgageBalance: 0,
  mortgageRate: 6.5,
  mortgagePayment: 0,
  otherDebtBalance: 0,
  otherDebtRate: 8,
  otherDebtPayment: 0,

  // Reverse Mortgage (HECM-style) / Home Equity. A separate asset+loan
  // pair from the forward mortgage above: instead of paying down a
  // balance, a reverse mortgage lets a homeowner 62+ borrow AGAINST home
  // equity with no required monthly payments -- interest simply
  // compounds onto a growing loan balance, repaid (non-recourse, capped
  // at the home's value) when the home is eventually sold or inherited.
  // Note: this app doesn't model an outright home-sale/downsizing event
  // -- that's already fully expressible with a one-time Milestone (an
  // "inflow" milestone targeting the Taxable account for your net sale
  // proceeds), so it doesn't need dedicated inputs here.
  // Whether the household owns its home at all (changelog 144). Until this
  // existed the residence only reached the estate when a reverse mortgage
  // was switched on -- an ordinary paid-off house, usually the largest
  // non-portfolio asset, was left out of estate tax and Gross Inherited
  // Wealth entirely. Off by default so a renter never gets a phantom
  // $400,000 house; migrateInputs sets it from reverseMortgageEnabled for
  // plans saved before the field existed, so nobody's numbers move on
  // load. Turning on the reverse mortgage implies ownership (sanitizeInputs
  // enforces that). Home value and appreciation below apply either way.
  homeOwned: false,
  reverseMortgageEnabled: false,
  homeValueInit: 400000,
  homeAppreciationRate: 3.0, // % per year
  // Everything else in the gross estate that is neither a portfolio bucket
  // nor the home (changelog 144): a second home or rental, land, a
  // business interest, vehicles, jewelry, art, collectibles. One today's-
  // dollar figure with its own appreciation rate -- itemising would be
  // false precision for estate planning. Never drawn on for living
  // expenses (sell it with an inflow Milestone if you mean to); enters the
  // estate at full value under IRC s 2033 and passes to heirs with a
  // stepped-up basis (s 1014), so no income tax on the heir's side.
  otherEstateAssetsInit: 0,
  otherEstateAssetsGrowthRate: 2.0, // % per year
  reverseMortgageStartAge: 62, // HECM eligibility floor; based on age1
  // Real HECM "principal limits" (the max loan amount) come from IRS/HUD
  // actuarial tables based on age and interest rates -- a level of detail
  // disproportionate to this app's other simplifications. Instead, the
  // max loan amount is modeled as a flat percentage of the home's value
  // at the moment the loan originates (locked in then, not re-evaluated
  // as the home continues to appreciate afterward).
  reverseMortgagePrincipalLimitPct: 50,
  reverseMortgageRate: 6.5, // % per year, compounds on the growing balance
  reverseMortgagePayoutType: 'monthly', // 'monthly' (tenure-style tax-free income until the limit is used up) or 'lumpSum' (draw the full principal limit immediately)
  reverseMortgageMonthlyPayout: 1500,

  // Life Insurance (Cash Value): tracks a permanent life insurance
  // policy's cash value as a real, living asset -- separate from its
  // death benefit. Term life is intentionally NOT modeled here: it
  // builds no cash value, so there's nothing to track until death,
  // which is outside this retirement-income projection's scope.
  //
  // Fully independent per spouse (lifeInsuranceEnabled1/2 and friends) --
  // it's common for each spouse to carry their own separate policy, with
  // its own type, ownership, cash value, and face amount, rather than one
  // shared household policy. Mirrors the same per-spouse pattern already
  // used for LTC (ltcActive1/2) and pensions (pension1/2) elsewhere in
  // this file. See migrateInputs() for how a plan saved before this split
  // (a single shared lifeInsuranceEnabled/etc.) carries forward onto
  // spouse 1 only, rather than duplicating it onto both -- unlike LTC's
  // migration, duplicating a life insurance policy (a specific dollar
  // death benefit) onto both spouses would double-count it.
  //
  // Policy type matters for two reasons. First, whether the death
  // benefit stays level (whole life, and most universal life "Option
  // A") or grows alongside the cash value ("Option B" universal/
  // variable life, and Variable Appreciable Life, which is designed
  // around an always-increasing benefit) -- see
  // lifeInsuranceIncreasingBenefit1/2 below. Second, estate planning: who
  // OWNS the policy determines whether the death benefit counts toward
  // the taxable estate under IRC Sec. 2042. Self-owned (or owned by a
  // spouse who leaves it back into the estate) pulls the full net death
  // benefit into the gross estate; a policy owned by an irrevocable
  // life insurance trust (ILIT) or another third party (for 3+ years)
  // passes to heirs entirely outside the taxable estate -- a common,
  // simple estate-tax-avoidance technique. Either way, the proceeds
  // still reach heirs income-tax-free (IRC Sec. 101(a)) -- ownership
  // only changes whether they're counted for state estate tax. Each
  // spouse's policy has its own Ownership setting, since one spouse's
  // policy might be self-owned while the other's sits in an ILIT.
  lifeInsuranceEnabled1: false,
  lifeInsurancePolicyType1: 'wholeLife', // 'term' (no cash value; not modeled), 'wholeLife', 'universalLife', 'variableUniversalLife', 'variableAppreciableLife', 'indexedUniversalLife', 'group'
  lifeInsuranceOwnership1: 'self', // 'self' (or spouse) -- counted in the taxable estate; 'trust' -- owned by an ILIT/third party, excluded from the taxable estate
  lifeInsuranceCashValueInit1: 0,
  lifeInsuranceCashValueGrowthRate1: 4.0, // % per year -- whole life uses its guaranteed/dividend rate; universal/variable life varies with credited interest or subaccount performance
  lifeInsuranceLoanBalance1: 0, // outstanding policy loans against the cash value; compounds like the reverse mortgage above, and reduces both the living cash-out value and the eventual death benefit if left unpaid
  lifeInsuranceLoanRate1: 8.0, // % per year
  lifeInsuranceDeathBenefit1: 0, // current face amount
  lifeInsuranceIncreasingBenefit1: false, // true for "Option B"-style policies (and Variable Appreciable Life by design): death benefit = face amount + cash value, growing over time. False ("Option A"-style, most whole life): death benefit stays level at the face amount.
  lifeInsuranceAnnualPremium1: 0, // informational only -- not deducted from cash flow (funding it is assumed to already be reflected in your expenses/savings elsewhere)
  lifeInsuranceEnabled2: false,
  lifeInsurancePolicyType2: 'wholeLife',
  lifeInsuranceOwnership2: 'self',
  lifeInsuranceCashValueInit2: 0,
  lifeInsuranceCashValueGrowthRate2: 4.0,
  lifeInsuranceLoanBalance2: 0,
  lifeInsuranceLoanRate2: 8.0,
  lifeInsuranceDeathBenefit2: 0,
  lifeInsuranceIncreasingBenefit2: false,
  lifeInsuranceAnnualPremium2: 0,

  // Roth Conversions
  rothConversionStrategy: 'none', // 'none', 'fixed', 'maxBracket'
  rothConversionAmount: 25000,
  rothConversionBracket: 0.22, // 12% (0.12), 22% (0.22), 24% (0.24)
  rothConversionBuffer: 1000,
  // Changelog 250: hold a voluntary conversion under an IRMAA tier. A cap
  // on whatever strategy is active (fixed or bracket-fill), the way ACA
  // Cliff Protection caps it under 400% FPL -- not a strategy of its own,
  // so it composes: "fill the 24% bracket, but never past the first
  // Medicare surcharge". Applies only in a year whose MAGI will price
  // someone's Part B/D two years later (the lookback): a spouse alive and
  // 65+ in year+2 and not still on an employer plan then. In every other
  // year it is inert. rothConversionIrmaaTier is the highest tier whose
  // ceiling the conversion may reach: 0 = no surcharge at all (MAGI at or
  // under the first threshold), 1 = under the second threshold, ... 4 =
  // under the top (frozen) threshold. rothConversionBuffer is subtracted
  // from the threshold, as it is from a bracket limit.
  rothConversionIrmaaCapEnabled: false,
  rothConversionIrmaaTier: 0,
  rothConversionDelayUntilRetire: true,
  rothConversionDurationYears: 0, // 0 = unlimited/no cap; >0 caps a "Roth ladder" to that many years

  // Backdoor Roth / Pro-Rata Rule. Per-spouse amounts (changelog 108):
  // each spouse makes their own non-deductible IRA contribution, and a
  // household often wants different amounts (or one spouse at zero). A
  // plan saved with the old single backdoorRothAnnualAmount is migrated
  // by copying it onto both spouses -- exactly the old behavior, which
  // applied the one amount to each working spouse. Defaults are the 2026
  // IRA contribution limit ($7,500, Rev. Proc. 2025-32); the old $7,000
  // default was the 2025 limit.
  backdoorRothEnabled: false,
  backdoorRothAnnualAmount1: 7500,
  backdoorRothAnnualAmount2: 7500,
  preTaxBasisInit: 0, // existing after-tax basis already sitting in the Pre-Tax bucket
  // Roth basis (IRC 408A(d)(4) ordering rules). A Roth withdrawal is
  // deemed to come first from regular contributions (always tax- and
  // penalty-free), then from conversions oldest-first (penalty-free once
  // the conversion is five tax years old, otherwise the 10% early
  // distribution tax applies to the part that was taxable when converted),
  // and only then from earnings (ordinary income + 10% before 59.5).
  //   rothBasisInit              regular Roth contributions made to date
  //                              (Form 8606 Part III / your custodian's
  //                              contribution history)
  //   rothRecentConversionsInit  total converted to Roth in the last FOUR
  //                              calendar years -- the ones still inside
  //                              their five-year clock at plan start
  //                              (spread evenly across those years)
  // Both default to 0, which reproduces the previous behavior: every
  // pre-59.5 Roth dollar treated as earnings. The engine tracks the plan's
  // own contributions and conversions from there. After 59.5 the account is
  // assumed to satisfy the five-year account rule, so everything is
  // qualified. See splitRothDraw.
  rothBasisInit: 0,
  rothRecentConversionsInit: 0,
  // Known cost basis of the Taxable Brokerage account today. 0 (default)
  // means "unknown/not set" -- runProjection auto-derives a starting basis
  // from taxableCapitalGainsRatio instead (taxableInit * (1 - ratio)), so
  // existing plans behave exactly as before until a user enters a real
  // basis figure. From that starting point basis is tracked dynamically
  // (contributions and inflows add 100% basis, withdrawals consume it
  // proportionally, growth never touches it) rather than assuming the same
  // flat realized-gain ratio forever -- see taxableBasis in runProjection.
  taxableBasisInit: 0,
  // How the Taxable Brokerage account is held, for the basis reset at the
  // first death (changelog 360): 'joint' (half is reset outside a
  // community-property state), 'spouse1' or 'spouse2'.
  taxableAccountOwner: 'joint',
  // 'manual' (default) or 'holdings' -- mirrors initialBalancesSource's
  // link/unlink pattern. When 'holdings', taxableBasisInit stops being
  // independently editable and instead tracks the real summed cost basis
  // of this browser's Taxable-bucket Detailed Holdings (App.jsx's
  // auto-sync effect), the same way the four Initial Balances fields can
  // track bucketTotals. See PortfolioTab.jsx's handleSyncCostBasis for the
  // opt-in entry point.
  taxableBasisSource: 'manual',
  // Dividend yield the tax engine assumes on the Taxable Brokerage bucket,
  // %/yr. Dividends are never a separate cash inflow here -- the bucket's
  // return already includes them, reinvested -- but they ARE taxable income
  // every year (capital-gains rates, and they count toward MAGI for IRMAA
  // and ACA). Was a hard-coded 2%; 2.0 keeps every existing plan's numbers.
  taxableDividendYield: 2.0,
  // What happens to those dividends once you retire (changelog 231).
  //
  //   'reinvest'  -- they buy more shares, which is what the plan has
  //                  always assumed and stays the default: a plan saved
  //                  before this existed projects identically.
  //   'cash'      -- they stop reinvesting and land as spendable cash.
  //   'asNeeded'  -- only as much as the year actually needs is taken;
  //                  the rest stays invested.
  //
  // In force only from the first retired year, because taking dividends as
  // cash while still drawing a salary is not what anyone means by it.
  //
  // What this does NOT change, and the UI says so: the tax. Dividends are
  // taxed as income the year they arrive whichever box is ticked, and they
  // count toward IRMAA and ACA income either way. What changes is how much
  // has to be SOLD to fund the year -- fewer shares sold means fewer gains
  // realized, and in a falling year it means not selling into the fall.
  dividendPayoutMode: 'reinvest',
  // 'manual' (default) or 'holdings' -- same link/unlink pattern as
  // taxableBasisSource: when 'holdings', taxableDividendYield tracks the
  // real blended yield of this browser's Taxable-bucket Detailed Holdings
  // (App.jsx's auto-sync effect). See PortfolioTab.jsx's
  // handleSyncDividendYield for the opt-in entry point.
  taxableDividendYieldSource: 'manual',
  // Share of that yield taxed at qualified-dividend / capital-gains rates,
  // %. The rest -- ordinary dividends, interest, money-market income -- is
  // ordinary income (changelog 208). Linked to holdings, it follows each
  // holding's Distribution Character. Otherwise, while the switch below is
  // on (changelog 414, the default), the figure typed here is ignored and
  // the share follows the plan's own stock/bond split year by year
  // (planStockShareForYear): the stock share of the yield is qualified, the
  // bond/cash share is interest, which is ordinary income. 100 is kept as
  // the typed figure so a plan that turns the switch off is taxed exactly
  // as every plan was before 414.
  taxableQualifiedDividendPct: 100,
  taxableQualifiedDividendFollowsAllocation: true,
  // The yields the split is weighted by while the switch is on (changelog
  // 441): what the stock side and the bond/cash side of the account each
  // pay, %. They set only the qualified SHARE -- the income itself is
  // taxableDividendYield -- and 1.3% / 4% are the broad-market figures.
  taxableStockYieldPct: 1.3,
  taxableBondYieldPct: 4.0,

  // Milestones
  milestones: [],

  // Annuity Inputs
  annuityPurchaseAmount: 0,
  annuityPurchaseAge: 65,
  annuityPayoutRate: 6.0,
  annuityIndexation: 0.0,
  annuitySourceAccount: 'taxable',
  annuityIsTaxable: true, // force every payout fully ordinary-taxable, overriding
                          // the source-account treatment below (audit Q-9(b))

  // Withdrawal Strategy
  withdrawalStrategy: 'TaxableFirst', // 'TaxableFirst', 'PreTaxFirst', 'RothFirst', 'ProRata'

  // Stress Scenarios
  stressType: 'none', // 'none', 'crashYear', '1929', '1966', '1973', '2000', '2008', 'history'
  // Changelog 336: with stressType 'history', the real calendar year whose
  // returns and inflation replay from the stress start year to the end of
  // the plan (or until the record runs out). Raw history, at the plan's
  // stock/bond mix -- the same run "Every retirement since 1928" makes for
  // that start.
  stressHistoryStartYear: 1966,
  stressStartMode: 'retirement', // 'retirement', 'specific', 'random'
  stressStartYear: 2028,
  stressCrashYear: 2028,
  stressCrashReturn: -20.0,
  stressCrashInflation: 8.0,
  spendingGuardrails: false,
  // How a Historical Stress Test's crash-year inflation override interacts
  // with the Granular Inflation Assumptions above, during the specific
  // years the crash is actually depressing/spiking inflation (no effect in
  // any other year, or when stressType is 'none'). 'partial' (default):
  // General lifestyle spending and Housing switch to the crash's actual
  // inflation for those years (matching a real broad CPI shock); Social
  // Security COLA, Medical, and Medicare Part B/D keep compounding at their
  // own configured rates, since those don't uniformly track headline CPI in
  // a single bad year. 'delta': instead of a full override, each of those
  // custom rates is nudged by the gap between the crash's inflation and the
  // plan's assumed baseline general inflation rate that year, so a specific
  // rate's own character is preserved while still reacting to the shock's
  // severity. 'custom': ignore the crash's inflation override entirely for
  // Housing and every custom rate -- only General lifestyle spending
  // responds (this was the app's only behavior before this option existed).
  stressInflationStrategy: 'partial',

  // Legislative & Policy Risk toggles -- each models a "what if a
  // currently-scheduled benefit/protection goes away" scenario. All default
  // OFF; the baseline plan always assumes current law continues unchanged.
  //
  // Simulates the Social Security OASI trust fund actually running out
  // instead of being fully funded indefinitely. Per the SSA Trustees' 2026
  // Annual Report (ssa.gov/oact/TR/2026/II_A_highlights.html, fetched
  // 2026-09-30), the OASI trust fund is projected to be depleted in the
  // fourth quarter of 2032, at which point projected income would pay 78% of
  // scheduled benefits -- a 22% cut -- unless Congress acts first. (The 2025
  // report said 2033 and 77%.) Saved plans keep their own figures.
  ssDepletionEnabled: false,
  ssDepletionYear: 2032,
  ssCutPercent: 22.0,
  // Models a future Congress letting the TCJA's individual ordinary-income
  // rates lapse (reverting to the pre-2018 10/15/25/28/33/35/39.6% rate
  // schedule) instead of continuing today's 10/12/22/24/32/35/37% rates.
  // NOTE: as of the One Big Beautiful Bill Act (signed July 2025), current
  // law already made the TCJA rates PERMANENT -- the sunset originally
  // scheduled for after 2025 will not happen on its own. This toggle is a
  // hypothetical future-policy-reversal stress test, not a projection of
  // current law. Simplification: reuses today's bracket WIDTHS with the
  // pre-TCJA RATES substituted in, rather than modeling the old law's own
  // (differently-sized) brackets, and approximates the standard deduction
  // reverting to roughly half its current size -- it does not model the
  // separate per-person personal exemption that existed pre-TCJA and would
  // also return, so this understates how much a sunset would actually cost.
  tcjaSunsetEnabled: false,
  // Freezes Medicare IRMAA's income thresholds at their current-year dollar
  // level instead of letting them rise with inflation like the rest of the
  // tax code. In reality CMS does adjust IRMAA thresholds for inflation
  // (unlike the never-adjusted Social Security taxability thresholds), so a
  // freeze is itself the policy-risk scenario -- it would push more
  // retirees into a surcharge tier every year purely from nominal income
  // growth, exactly like real bracket creep.
  irmaaFreezeEnabled: false,
  // Medicare sets each year's IRMAA tier from the tax return filed two
  // years earlier (2024 MAGI decides 2026 premiums); the projection now
  // does the same (changelog 121). A retiree whose income fell can ask SSA
  // to use the current year's estimated MAGI instead by filing Form SSA-44
  // after a "life-changing event" -- stopping work and the death of a
  // spouse both qualify. With this on, in the year of such an event and
  // the two years after it, the engine charges the lower of the lookback
  // premium and the current-year premium, which is what a filed SSA-44
  // achieves. Off by default because the appeal has to be filed: the
  // default projection shows the overpayment that happens when it isn't.
  // The MAGI on the two tax returns filed BEFORE the plan starts, so the
  // two-year lookback has history for the plan's first two years
  // (changelog 179). Without them the engine has nothing to look back to
  // and prices those years off their own MAGI -- and for someone whose
  // plan starts at 63-65, those are exactly the years the surcharge bites
  // hardest, because the returns Medicare is really reading are the
  // working-income ones from before the plan began.
  //
  // Both default to 0, which means "not provided": the engine then behaves
  // exactly as it did before, so no existing plan moves. A year left at 0
  // falls back to its own MAGI independently of the other, which is why
  // the seeds carry an `unknown` flag rather than being treated as a
  // genuine $0 of income.
  irmaaTwoYearsPriorMagi: 0, // the return for planYear - 2
  irmaaPriorYearMagi: 0,     // the return for planYear - 1
  // A Form SSA-44 life-changing event the USER declares, for the five of
  // the eight the engine cannot possibly detect (changelog 180).
  //
  // SSA-44 recognizes eight events. This engine can see exactly two of
  // them: a spouse stops working, and a spouse dies. The other six are not
  // "unimplemented detection" -- they are life events the model has no
  // concept of. There is no marriage or divorce anywhere in the projection,
  // no pension end age, rental income is a flat perpetual stream that never
  // stops, and an employer settlement is not modeled at all. Even work
  // REDUCTION is unreachable: salary1 is a single constant with no
  // mid-career change, so the only reduction expressible is the move to
  // part-time at retireAge, which already registers as a stoppage.
  //
  // So the honest answer is not to guess harder. It is to let someone say
  // what happened and when. A declared year covers all eight events,
  // including the ones no amount of engine work could infer.
  //
  // 0 means "nothing declared" -- the plan detects what it can, exactly as
  // before. The type is display only and changes no arithmetic; it exists
  // so the Action Plan can name the evidence Social Security will ask for,
  // which differs by event.
  irmaaLifeChangeEventYear: 0,
  irmaaLifeChangeEventType: '',
  irmaaLifeChangeAppealEnabled: false,

  // Delaying Medicare on employer coverage (changelog 241, the owner 2026-09-24:
  // "if I still have medical insurance through work, we can defer my spouse's
  // obligation to enroll"). Per spouse: 'none' (default -- Medicare from 65,
  // exactly as before), 'own' (covered through their own current job) or
  // 'spouse' (through the other spouse's current job). While the covering
  // job lasts, that spouse pays no Part B / Part D premium and no IRMAA;
  // premiums start the year the covering worker retires. Real only when the
  // employer has 20 or more employees -- below that Medicare is primary at
  // 65 and delaying Part B brings a lifetime penalty -- which is why it is
  // off by default: the plan cannot know the employer's size. Their cover in
  // the meantime is the employer plan, already inside the paycheck.
  medicareEmployerCoverage1: 'none',
  medicareEmployerCoverage2: 'none',

  // State Income Tax Modeling (Ultimate Upgrade)
  stateTaxState: 'none', // 'none', 'TX_FL' (0%), 'flat_5' (5%), 'state_rules' (stateOfResidence's own rules), 'ca', 'ny', 'il', 'co', 'pa', 'va', 'wa'
  stateTaxSocialSecurityTaxable: false, // SS taxability indicator
  stateTaxPensionTaxable: true, // Pension taxability indicator
  stateTaxFlatRate: 5.0, // custom flat state tax rate percentage

  // Two-letter state of residence, used for the ACA Medicaid non-expansion
  // "coverage gap" check below (separate from stateTaxState, which drives
  // state income tax). Defaults to 'TX' to match the Settings dropdown's
  // displayed default so the stored value and the UI agree from the start.
  stateOfResidence: 'TX',
  // Residency timeline (changelog 195, RELOCATION_SPEC.md rung 1).
  //
  // The plan's state is not a constant. A household can move -- and the
  // year it moves changes state income tax, the ACA non-expansion check,
  // and which state's estate or inheritance tax applies at death.
  //
  // Each entry is a move: { id, fromYear, kind: 'domestic',
  // stateOfResidence, stateTaxState, stateTaxFlatRate,
  // stateTaxSocialSecurityTaxable, stateTaxPensionTaxable, nycResident,
  // yonkersResident }. Entries are step changes: the entry with the
  // greatest fromYear <= the projection year governs that year. Years
  // before the first entry use the plan-wide state inputs above, so an
  // existing plan needs no migration.
  //
  // An EMPTY array means one state for the whole plan, and the engine
  // behaves exactly as it did before this key existed. That is the
  // regression contract (residencyTimeline.test.js).
  //
  // Like every other structured input, sanitizeInputs passes this through
  // UNCHECKED -- readResidencyTimeline() below is the normalizer. Foreign
  // moves (kind: 'foreign') are rung 2 of the spec and are dropped by the
  // normalizer until the engine can price them.
  residencyTimeline: [],
  // Forces an additional Roth conversion in years where taxable income
  // would otherwise fall below 100% FPL in a non-expansion state, so the
  // household still qualifies for ACA marketplace subsidies. See
  // ACA_NON_EXPANSION_STATES / getFederalPovertyLevel below.
  acaSubsidyProtectionEnabled: false,
  // The other edge of the same window (changelog 119). With the enhanced
  // ARPA/IRA subsidies expired after 2025, the 400%-of-FPL eligibility
  // cliff is back for 2026 coverage: one dollar of MAGI over it forfeits
  // the entire premium tax credit for the year. Roth conversions are the
  // usual culprit for an early retiree. When on, voluntary conversions in
  // pre-Medicare retired years are capped so estimated ACA MAGI stays at
  // or under ACA_SUBSIDY_CLIFF_FPL_MULTIPLE x FPL. On by default since
  // changelog 443: with the credit computed (415) a conversion that crosses
  // the line costs the whole year's credit, $17k-$25k for a couple of 60,
  // and nothing in a new plan should do that unasked. It does nothing in a
  // plan with no marketplace year or no conversion; a saved plan keeps the
  // setting it saved.
  acaCliffProtectionEnabled: true,
  // Your estimated marketplace premium tax credit, $/yr in today's
  // dollars (healthcare.gov quotes it). Reduces the Healthcare Bridge cost
  // in years the household is retired, under 65, and inside the 100%-400%
  // FPL eligibility band; a year whose actual MAGI lands over the cliff (or
  // in the non-expansion coverage gap) repays the whole credit as tax,
  // which is what Form 8962 does. 0 = not modeled (the bridge cost is
  // then read as already net of any subsidy, exactly as before).
  // Read only when acaCreditSource is 'manual' (changelog 415).
  acaSubsidyAnnualValue: 0,
  // 'formula' (default, changelog 415): the credit is computed each year
  // as IRC 36B does it -- the benchmark premium less the applicable
  // percentage of ACA MAGI (acaPremiumTaxCredit), estimated before the
  // withdrawal solver from the income known then and re-figured on the
  // settled MAGI afterwards, the difference reconciled as tax or refund the
  // way Form 8962 does. 'manual': the typed figure above, repaid in full
  // over the cliff, exactly as before 415. A plan saved before 415 with a
  // typed figure keeps it (sanitizeInputs).
  acaCreditSource: 'formula',
  // Where the benchmark premium comes from under 'formula': 'state' uses
  // the state's average 2026 second-lowest-cost silver premium scaled by
  // each covered adult's age (acaBenchmarkPremiumAnnual); 'manual' uses
  // the household figure below, $/yr in today's dollars, as healthcare.gov's
  // tax tool reports it for the household's own zip code and ages.
  acaBenchmarkPremiumSource: 'state',
  acaBenchmarkPremiumAnnual: 0,

  // Capital Gains
  taxableCapitalGainsRatio: 0.60, // portion of taxable draws that is realized gains
  taxLossHarvestingEnabled: false, // realize paper losses in down years to offset gains/income

  // Advanced Pension Options
  pension1COLA: 2.0, // annual cost-of-living adjustments for pension 1
  pension2COLA: 0.0,
  pension1SurvivorBenefit: 50.0, // % of pension remaining for survivor
  pension2SurvivorBenefit: 50.0,
  pension1LumpSum: false, // lump sum instead of annuity option
  pension1LumpSumValue: 250000,
  pension1LumpSumRollover: false, // direct rollover to Pre-Tax (IRC s 402(c)) instead of cash
  pension2LumpSum: false,
  pension2LumpSumValue: 250000,
  pension2LumpSumRollover: false,

  // Rebalancing & Dynamic Asset Allocation
  rebalancingEnabled: false,
  stockAllocationPre: 80.0,
  stockAllocationPost: 60.0,
  // 'manual' | 'holdings' -- same link/unlink pattern as
  // initialBalancesSource/taxableBasisSource above, but only ever applies
  // to stockAllocationPre, not stockAllocationPost. Pre ("Working") has a
  // real present-day analog to sync to -- your actual current stock/bond/
  // cash mix from Detailed Holdings (computeAssetClassMix's
  // stockPctOfClassified, portfolioHoldings.js). Post ("Retired") is a
  // forward-looking target assumption with no current-holdings equivalent
  // to derive it from, so it always stays manual even when Pre is linked.
  // See App.jsx's stockAllocationSource sync effect and
  // PortfolioTab.jsx's handleSyncStockAllocation.
  stockAllocationSource: 'manual',
  stockReturnRate: 8.0,
  bondReturnRate: 4.0,
  // Investment fees (changelog 447), charged on the invested accounts --
  // Pre-Tax, Roth, Taxable and HSA -- every year, after the year's return:
  // growth is (1 + return) x (1 - fees). Two settings so an advisor's fee is
  // its own visible line. Every return above (and every Monte Carlo draw,
  // stress year and historical start) is BEFORE fees.
  //   fundExpenseRatioPct: what the funds themselves charge (their expense
  //     ratios). 0.10% is a broad index-fund portfolio.
  //   advisorFeePct: a percent-of-assets fee to an advisor or managed
  //     account. 0 by default: the app is built for people who invest
  //     themselves, and the Fees card shows what a 1% fee would cost them.
  // Not charged on the cash reserve (its yield is already net), the home,
  // other property or a concentrated-stock position. Not deductible: see
  // How the numbers are figured -> Investment fees.
  fundExpenseRatioPct: 0.10,
  advisorFeePct: 0,
  // "Keep at least" (changelog 448): a balance, in today's dollars, the
  // household wants never to dip below once retired -- a reserve or a
  // legacy floor. A TEST, not a spending rule: the plan does not cut
  // spending to defend it. A retired year whose invested accounts plus the
  // cash reserve end below it (deflated to today's dollars) is a breach;
  // Monte Carlo, the historical starts and the safe-spending search count
  // a run as lasting only if it never breaches. 0 = off.
  portfolioFloorReal: 0,
  // Where the historical starts begin (changelog 449): 1928 (Aswath
  // Damodaran's annual table, the default) or 1871 (adds Robert Shiller's
  // record of the years before). The Monte Carlo's bootstrap is unaffected.
  historyFromYear: 1928,
  glideAllocationEnabled: false,
  glideAllocationRate: 1.0, // reduction in stock % per year retired
  glideAllocationFloor: 30.0,
};

// Calculate FICA Taxes
// wageIndexFactor: cumulative wage growth since the plan's first year. The
// Social Security wage base is re-set every year from the national Average
// Wage Index (42 U.S.C. 430), so it rises roughly in step with the salaries
// the projection is inflating; holding it at the 2026 dollar figure while
// wages grew meant that after 15-20 years a mid-six-figure earner's 6.2% SS
// tax appeared to stop at $184,500 of a far larger paycheck, understating
// FICA in the working years. The Additional Medicare Tax threshold below is
// statutory and NOT indexed, so it stays fixed on purpose.
// Figures SSA has already announced for a coming year (the October press
// release: COLA, the wage base, the earnings-test amounts). A year in this
// table uses the announced figure; the years after the last one index
// forward from it at the plan's rate, so each October's announcement
// replaces one year of estimate. 2027: ssa.gov/news/press/releases,
// 2026-10-14 (COLA 3.6%, wage base $192,300, earnings test $25,560 /
// $67,920, ssa.gov/news/en/cola/factsheets/2027.html); changelog 410.
export const SS_ANNOUNCED = {
  2026: { cola: 2.5, wageBase: 184500, earningsTestUnderFra: 24480, earningsTestFraYear: 65160 },
  2027: { cola: 3.6, wageBase: 192300, earningsTestUnderFra: 25560, earningsTestFraYear: 67920 },
};
const SS_ANNOUNCED_LAST_YEAR = 2027;
// An announced dollar figure for `year`, or the last announced one indexed
// forward at `ratePct` a year; before the first table year, the 2026
// figure (the engine's base) scaled by `factor` as before.
function ssAnnouncedFigure(field, year, ratePct, factor = 1) {
  if (!Number.isFinite(year)) return SS_ANNOUNCED[2026][field] * factor;
  if (SS_ANNOUNCED[year]) return SS_ANNOUNCED[year][field];
  if (year > SS_ANNOUNCED_LAST_YEAR) return SS_ANNOUNCED[SS_ANNOUNCED_LAST_YEAR][field] * Math.pow(1 + (ratePct || 0) / 100, year - SS_ANNOUNCED_LAST_YEAR);
  return SS_ANNOUNCED[2026][field] * factor;
}
export function ssWageBaseFor(year, ratePct, factor = 1) { return ssAnnouncedFigure('wageBase', year, ratePct, factor); }
// The benefit-growth factor from the plan start to `year`: the announced
// COLA for a year that has one, the plan's own rate (ssCOLA) otherwise.
// Compounds year by year, so an announced 3.6% for 2027 replaces the
// plan's 2.5% for that one step and every later year rides on it.
export function ssColaFactorFor(startYear, year, ratePct) {
  let f = 1;
  for (let y = startYear + 1; y <= year; y++) {
    const a = SS_ANNOUNCED[y];
    f *= 1 + (a && Number.isFinite(a.cola) ? a.cola : ratePct || 0) / 100;
  }
  return f;
}

export function calculateFICATaxes(salary1, salary2, filingStatus, wageIndexFactor = 1, year = undefined, wageRatePct = undefined) {
  // The SS wage base: SSA's announced figure where there is one (SS_ANNOUNCED),
  // the 2026 figure ($184,500, verified 2026-08-20 against
  // ssa.gov/oact/cola/cbb.html) indexed by wageIndexFactor otherwise.
  const ssLimit = ssWageBaseFor(year, wageRatePct, wageIndexFactor);
  let fica1 = 0;
  let fica2 = 0;
  
  if (salary1 > 0) {
    fica1 = (Math.min(salary1, ssLimit) * 0.062) + (salary1 * 0.0145);
  }
  if (salary2 > 0) {
    fica2 = (Math.min(salary2, ssLimit) * 0.062) + (salary2 * 0.0145);
  }
  
  let addMed = 0;
  // $125,000 for MFS -- the same statutory scheme as NIIT (IRS Q&A on the
  // Additional Medicare Tax). Not indexed for either. MFS is a per-return
  // tax, so each spouse's own wages are tested against $125,000 separately
  // (audit Q-23, changelog 124); a joint return tests combined wages.
  if (filingStatus === 'MFS') {
    addMed = (Math.max(0, salary1 - 125000) + Math.max(0, salary2 - 125000)) * 0.009;
  } else {
    const totalSalary = salary1 + salary2;
    const addMedThreshold = filingStatus === 'MFJ' ? 250000 : 200000;
    if (totalSalary > addMedThreshold) {
      addMed = (totalSalary - addMedThreshold) * 0.009;
    }
  }
  
  return fica1 + fica2 + addMed;
}

// Elective deferral limits for 401(k)/403(b)/governmental 457/TSP plans —
// tax year 2026 (IRS Notice 2025-67). Source: irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500
// The age 60-63 "super" catch-up (SECURE 2.0) REPLACES the regular 50+
// catch-up rather than stacking with it.
export const ELECTIVE_DEFERRAL_LIMIT_2026 = 24500;
export const CATCHUP_50_2026 = 8000;
export const CATCHUP_60_63_2026 = 11250;

// Overall Section 415(c) "annual additions" limit -- tax year 2026 (IRS
// Notice 2025-67). This is a SEPARATE, higher cap than the elective
// deferral limit above: it covers employee deferrals (Pre-Tax + Roth,
// but only up to the base ELECTIVE_DEFERRAL_LIMIT_2026 -- catch-up
// contributions sit outside this limit entirely, on top of it) PLUS
// employer contributions (match/profit-sharing) PLUS after-tax (non-Roth)
// employee contributions, all combined. The gap between this limit and
// (base deferral + employer match) is a "Mega Backdoor Roth" candidate --
// after-tax room that, IF the plan allows after-tax contributions and
// in-plan conversion/in-service withdrawal, can be moved into Roth with
// no income limit at all (unlike a Roth IRA). See
// afterTaxContributionsAllowed1/2 above and getContributionAdvisory below.
export const ANNUAL_ADDITIONS_LIMIT_2026 = 72000;

// IRA (Traditional + Roth combined) contribution limit — tax year 2026.
export const IRA_LIMIT_2026 = 7500;
export const IRA_CATCHUP_50_2026 = 1100;

// SECURE 2.0: starting in 2026, a participant age 50+ whose PRIOR-YEAR
// FICA wages from the plan's sponsoring employer exceeded this threshold
// must make any catch-up contribution as Roth, not Traditional -- a
// mandate, not a restriction (source: IRS Notice 2025-67; the threshold
// itself is wage-indexed and was raised from an originally-proposed
// $145,000 to $150,000 for 2026). This app doesn't track a separate
// prior-year wage figure, so getContributionAdvisory approximates it with
// the current year's salary1/salary2 input.
export const MANDATORY_ROTH_CATCHUP_WAGE_THRESHOLD_2026 = 150000;

// Roth IRA MAGI phase-out ranges [floor, ceiling] -- tax year 2026 (IRS
// Notice 2025-67). Below the floor: full contribution allowed. Between
// floor and ceiling: a reduced (phased-out) amount. At or above the
// ceiling: $0 -- a "backdoor Roth IRA" (nondeductible Traditional IRA
// contribution, then converted) is the usual workaround, subject to the
// pro-rata rule if other pre-tax IRA balances exist.
export const ROTH_IRA_PHASEOUT_MFJ = [242000, 252000];
export const ROTH_IRA_PHASEOUT_SINGLE = [153000, 168000];
// Not a typo and not indexed: a separate filer who lived with their spouse
// at any point in the year phases out between $0 and $10,000 of MAGI, so
// in practice a Roth IRA contribution is off the table entirely (IRS
// Publication 590-A). Living apart for the whole year uses the Single
// range instead.
export const ROTH_IRA_PHASEOUT_MFS_TOGETHER = [0, 10000];

// Returns the applicable combined Pre-Tax + Roth 401(k)-style elective
// deferral limit for a given age this tax year. Used to warn users whose
// "Annual Savings Contribution" inputs exceed what's actually legal.
export function getElectiveDeferralLimit(age) {
  if (age >= 60 && age <= 63) return ELECTIVE_DEFERRAL_LIMIT_2026 + CATCHUP_60_63_2026;
  if (age >= 50) return ELECTIVE_DEFERRAL_LIMIT_2026 + CATCHUP_50_2026;
  return ELECTIVE_DEFERRAL_LIMIT_2026;
}

// Returns the applicable combined Traditional + Roth IRA contribution limit
// for a given age this tax year.
export function getIRAContributionLimit(age) {
  if (age >= 50) return IRA_LIMIT_2026 + IRA_CATCHUP_50_2026;
  return IRA_LIMIT_2026;
}

// "Contribute the Max" (autoMaxContribution mode 'max'): splits one
// spouse's maxed-out 401(k)-style elective deferral between Pre-Tax and
// Roth for a single projection year. The base limit always goes Pre-Tax
// (tax-deferral-maximizing, and the predictable default the owner chose over
// ratio-preserving splits); the age-based catch-up portion flips to Roth
// only when SECURE 2.0's mandatory-Roth-catch-up rule forces it -- age
// 50+ AND wages above the (inflation-scaled) $150,000 threshold, using
// this year's salary+RSU wages as the app's standing approximation of
// prior-year FICA wages (same stand-in getContributionAdvisory uses).
// `wages` and the returned figures are in the projection year's nominal
// dollars; `inflFactor` scales both the limits and the wage threshold so
// the comparison stays in one currency.
//
// Pure and exported so the Settings UI can show the exact same split it
// will project (with inflFactor 1 for the current year) and tests can hit
// the boundary cases directly.
export function getMaxContributionSplit(age, wages, inflFactor = 1) {
  const baseLimit = ELECTIVE_DEFERRAL_LIMIT_2026 * inflFactor;
  const fullLimit = getElectiveDeferralLimit(age) * inflFactor;
  const catchup = fullLimit - baseLimit;
  const mandatoryRothCatchup = age >= 50 && catchup > 0
    && (wages || 0) > MANDATORY_ROTH_CATCHUP_WAGE_THRESHOLD_2026 * inflFactor;
  return mandatoryRothCatchup
    ? { preTax: baseLimit, roth: catchup, mandatoryRothCatchup: true }
    : { preTax: fullLimit, roth: 0, mandatoryRothCatchup: false };
}

// Computes one spouse's employer match for the year. `deferralAmount` is
// that spouse's own elective deferral (Pre-Tax + Roth contributions) for
// the year; `deferralLimitThisYear` is their age-based IRS elective
// deferral limit already scaled to this year's dollars (inflFactor
// applied by the caller). `config.mode === 'flat'` reproduces the
// original flat-dollar-amount behavior; `'percent'` applies a real
// matching formula built from up to two tiers -- see the
// employerMatchMode1/2 DEFAULT_INPUTS comment for the field-by-field
// meaning of `config`.
export function calculateEmployerMatch(deferralAmount, deferralLimitThisYear, inflFactor, config) {
  const { mode, flatAmount, rateA, capAPct, tierBEnabled, rateB, capB, combine } = config;
  if (mode !== 'percent') return Math.max(0, flatAmount || 0) * inflFactor;

  const safeDeferral = Math.max(0, deferralAmount || 0);
  const capA = (Math.max(0, capAPct || 0) / 100) * Math.max(0, deferralLimitThisYear || 0);
  const tierA = (Math.max(0, rateA || 0) / 100) * Math.min(safeDeferral, capA);
  if (!tierBEnabled) return tierA;

  const capBInflated = Math.max(0, capB || 0) * inflFactor;
  const tierB = (Math.max(0, rateB || 0) / 100) * Math.min(safeDeferral, capBInflated);
  return combine === 'sumOfTiers' ? (tierA + tierB) : Math.max(tierA, tierB);
}

// Returns the % of a grant's total value that vests in year index
// `yearIndex` (0-based, 0 = the grant's own first year) out of
// `vestingYears` total years, for either an 'equal' schedule (each year
// gets 1/vestingYears) or a 'custom' one (a caller-supplied array of
// percentages, expected to have `vestingYears` entries summing to ~100 --
// falls back to 'equal' if the array is missing or the wrong length, so a
// half-configured custom schedule doesn't silently drop income).
function getVestingSchedulePct(scheduleMode, customSchedule, vestingYears, yearIndex) {
  const equalPct = 100 / vestingYears;
  if (scheduleMode === 'custom' && Array.isArray(customSchedule) && customSchedule.length === vestingYears) {
    return Number(customSchedule[yearIndex]) || 0;
  }
  return equalPct;
}

// RSU/GSU equity compensation vesting income for one spouse in one
// simulation `year`. Combines two independent sources -- see the
// rsuGrants/rsuRefreshEnabled1/2 comments in DEFAULT_INPUTS for the full
// rationale:
//
// 1. Explicit grants (inputs.rsuGrants) already known today, each vesting
//    on its own schedule from its own grantYear.
// 2. An assumed future "refresh" grant, synthesized fresh for every year
//    that spouse was actively employed (age < retireAge) at the time of
//    issuance. A configured "gap" window suppresses only the synthesis of
//    NEW grants during that window; grants already issued before it are
//    unaffected by the gap itself.
//
// Both sources apply the SAME cutoff, though, once a tranche's own vesting
// year arrives: `year - birthYear < retireAge`, exactly mirroring salary1/2's
// cliff. This models the common real-world case where unvested equity is
// forfeited on departure -- a grant issued while still employed doesn't
// keep paying out tranches after that spouse has already retired. Some
// employers have retirement-eligibility carve-outs that let equity keep
// vesting after leaving; if that applies to you, model it by extending
// retireAge or that specific grant's vestingYears to cover it.
//
// Pure and stateless -- everything it needs (birth year, retire age, the
// grants list, the refresh assumption) is static plan configuration, so it
// can be called independently for any (spouse, year) pair without any
// running total carried between years.
export function getRSUVestingIncomeForYear(inputs, spouseNum, year, startYear) {
  const birthYear = spouseNum === 1 ? inputs.birthYear1 : inputs.birthYear2;
  const retireAge = spouseNum === 1 ? inputs.retireAge1 : inputs.retireAge2;
  if (year - birthYear >= retireAge) return 0; // already retired -- no tranche pays out this year, from either source
  let total = 0;

  // 1. Explicit grants. A unit-denominated grant (units > 0) is worth
  //    units × this spouse's current share price -- resolved fresh on
  //    every call, so changing rsuSharePrice1/2 reprices every unvested
  //    tranche of every unit grant at once (see the DEFAULT_INPUTS
  //    comments); a dollar grant keeps its fixed totalValue exactly as
  //    before. Flat at today's price by design: no growth assumption on
  //    unvested units.
  const sharePrice = Math.max(0, (spouseNum === 1 ? inputs.rsuSharePrice1 : inputs.rsuSharePrice2) || 0);
  (inputs.rsuGrants || []).forEach(g => {
    if ((Number(g.spouse) || 1) !== spouseNum) return;
    const vestingYears = Math.max(1, Math.round(g.vestingYears) || 4);
    const yearIndex = year - g.grantYear;
    if (yearIndex < 0 || yearIndex >= vestingYears) return;
    const pct = getVestingSchedulePct(g.schedule, g.customSchedule, vestingYears, yearIndex);
    const units = Math.max(0, Number(g.units) || 0);
    const grantValue = units > 0 ? units * sharePrice : Math.max(0, g.totalValue || 0);
    total += grantValue * (pct / 100);
  });

  // 2. Assumed future refresh grants
  const refreshEnabled = spouseNum === 1 ? inputs.rsuRefreshEnabled1 : inputs.rsuRefreshEnabled2;
  const annualValue = Math.max(0, (spouseNum === 1 ? inputs.rsuRefreshAnnualValue1 : inputs.rsuRefreshAnnualValue2) || 0);
  if (refreshEnabled && annualValue > 0) {
    const vestingYears = Math.max(1, Math.round(spouseNum === 1 ? inputs.rsuRefreshVestingYears1 : inputs.rsuRefreshVestingYears2) || 4);
    const growthRate = (spouseNum === 1 ? inputs.rsuRefreshGrowthRate1 : inputs.rsuRefreshGrowthRate2) || 0;
    const scheduleMode = spouseNum === 1 ? inputs.rsuRefreshSchedule1 : inputs.rsuRefreshSchedule2;
    const customSchedule = spouseNum === 1 ? inputs.rsuRefreshCustomSchedule1 : inputs.rsuRefreshCustomSchedule2;

    const gapSpouseStr = String(inputs.rsuRefreshGapSpouse !== undefined ? inputs.rsuRefreshGapSpouse : '1');
    const gapApplies = !!inputs.rsuRefreshGapEnabled && (gapSpouseStr === 'both' || Number(gapSpouseStr) === spouseNum);
    const gapStart = inputs.rsuRefreshGapStartYear;
    const gapEnd = gapStart + Math.max(0, inputs.rsuRefreshGapDurationYears || 0);

    // A grant issued in `issuanceYear` could still be vesting in `year` if
    // issuanceYear is anywhere in (year - vestingYears, year]. Every
    // candidate issuanceYear here is <= year, and the function already
    // returned early above if `year` itself is at/after retirement, so
    // every candidate is automatically still pre-retirement too -- no
    // separate employment check needed for issuance specifically.
    const earliestIssuance = Math.max(startYear, year - vestingYears + 1);
    for (let issuanceYear = earliestIssuance; issuanceYear <= year; issuanceYear++) {
      if (gapApplies && issuanceYear >= gapStart && issuanceYear < gapEnd) continue; // suppressed by the refresh gap
      const yearsSinceStart = issuanceYear - startYear;
      const grantValue = annualValue * Math.pow(1 + growthRate / 100, yearsSinceStart);
      const yearIndex = year - issuanceYear;
      const pct = getVestingSchedulePct(scheduleMode, customSchedule, vestingYears, yearIndex);
      total += grantValue * (pct / 100);
    }
  }

  return total;
}

// Contribution Advisor: a checklist of where each spouse stands against
// the current-year (2026) rules governing Pre-Tax vs. Roth savings --
// elective deferral usage, the new mandatory-Roth-catch-up rule for high
// earners 50+, Mega Backdoor Roth room, and Roth IRA eligibility. This is
// deliberately a checklist of computed facts and IRS/plan-design
// mechanics, NOT a recommendation of how much to save or which account is
// "better" for you -- that depends on a comparison between your current
// and future tax brackets that only you (or the fuller contribution-split
// projection this app may add later) can make.
//
// All dollar thresholds here are current-year constants (2026) rather
// than inflation-projected, matching how getElectiveDeferralLimit and
// getIRAContributionLimit already behave elsewhere in this file.
export function getContributionAdvisory(rawInputs) {
  const inputs = sanitizeInputs(rawInputs);
  const currentYear = inputs.planYear;

  function forSpouse(num) {
    const birthYear = num === 1 ? inputs.birthYear1 : inputs.birthYear2;
    const salary = Math.max(0, (num === 1 ? inputs.salary1 : inputs.salary2) || 0);
    const afterTaxAllowed = !!(num === 1 ? inputs.afterTaxContributionsAllowed1 : inputs.afterTaxContributionsAllowed2);
    const matchMode = num === 1 ? inputs.employerMatchMode1 : inputs.employerMatchMode2;

    const age = currentYear - (Number(birthYear) || 0);

    // A spouse in 'max' mode has both manual fields overridden by the
    // imputed split, so the checklist grades what the projection will
    // actually contribute, not the stale (disabled-in-UI) manual figures.
    // The pre-existing '401k'/'ira' modes keep their long-standing
    // manual-field reading here -- only Pre-Tax is overridden for those,
    // and their disabled field still shows its own inline note.
    const autoMaxMode = num === 1 ? inputs.autoMaxContribution1 : inputs.autoMaxContribution2;
    const maxSplit = autoMaxMode === 'max' ? getMaxContributionSplit(age, salary) : null;
    const preTax = maxSplit ? maxSplit.preTax : Math.max(0, (num === 1 ? inputs.preTaxContribution1 : inputs.preTaxContribution2) || 0);
    const roth = maxSplit ? maxSplit.roth : Math.max(0, (num === 1 ? inputs.rothContribution1 : inputs.rothContribution2) || 0);
    const totalDeferral = preTax + roth;
    const catchupLimit = (age >= 60 && age <= 63) ? CATCHUP_60_63_2026 : (age >= 50 ? CATCHUP_50_2026 : 0);
    const deferralLimit = ELECTIVE_DEFERRAL_LIMIT_2026 + catchupLimit;

    // Only the amount ABOVE the base limit (up to the age-based catch-up
    // cap) counts as catch-up -- mirrors the real-world mechanic where a
    // plan automatically starts treating contributions as catch-up once
    // the base limit is hit, not something split by the participant's own
    // designation.
    const cappedDeferral = Math.min(totalDeferral, deferralLimit);
    const catchupUsed = Math.max(0, cappedDeferral - ELECTIVE_DEFERRAL_LIMIT_2026);
    const catchupRemaining = Math.max(0, catchupLimit - catchupUsed);

    // Mandatory Roth catch-up (SECURE 2.0): approximated using this
    // year's salary as a stand-in for prior-year FICA wages -- see the
    // MANDATORY_ROTH_CATCHUP_WAGE_THRESHOLD_2026 comment above.
    const mandatoryRothCatchup = age >= 50 && salary > MANDATORY_ROTH_CATCHUP_WAGE_THRESHOLD_2026;
    // Compliance check: if this spouse is subject to the mandate, any
    // Traditional dollars above the base limit are catch-up money sitting
    // in the wrong (non-Roth) bucket. Uses preTax alone (not the combined
    // total) since Roth catch-up dollars are already compliant regardless
    // of how much Roth they've contributed.
    const catchupMisallocatedToTraditional = mandatoryRothCatchup ? Math.max(0, Math.min(preTax, deferralLimit) - ELECTIVE_DEFERRAL_LIMIT_2026) : 0;

    // Mega Backdoor Roth room: the gap between the overall 415(c) limit
    // and (this spouse's BASE deferral + their employer's contribution).
    // Catch-up is excluded from both sides of this calculation -- it sits
    // outside the 415(c) limit entirely (see ANNUAL_ADDITIONS_LIMIT_2026).
    const baseDeferral = Math.min(totalDeferral, ELECTIVE_DEFERRAL_LIMIT_2026);
    const employerMatchConfig = {
      mode: matchMode,
      flatAmount: num === 1 ? inputs.employerMatch1 : inputs.employerMatch2,
      rateA: num === 1 ? inputs.employerMatchRateA1 : inputs.employerMatchRateA2,
      capAPct: num === 1 ? inputs.employerMatchCapAPct1 : inputs.employerMatchCapAPct2,
      tierBEnabled: num === 1 ? inputs.employerMatchTierBEnabled1 : inputs.employerMatchTierBEnabled2,
      rateB: num === 1 ? inputs.employerMatchRateB1 : inputs.employerMatchRateB2,
      capB: num === 1 ? inputs.employerMatchCapB1 : inputs.employerMatchCapB2,
      combine: num === 1 ? inputs.employerMatchCombine1 : inputs.employerMatchCombine2,
    };
    const employerMatch = calculateEmployerMatch(baseDeferral, ELECTIVE_DEFERRAL_LIMIT_2026, 1, employerMatchConfig);
    const megaBackdoorRoom = Math.max(0, ANNUAL_ADDITIONS_LIMIT_2026 - baseDeferral - employerMatch);

    // § 415(c) annual-additions check (the owner's "are there legal limits on
    // employer matches?" question, 2026-08-31): there is NO separate cap
    // on the match itself -- the binding constraint is the overall
    // $72,000 (2026) annual-additions limit on employee base deferral +
    // ALL employer contributions + after-tax dollars combined (catch-up
    // sits outside it entirely). This is warn-only by design: the
    // projection never silently clips anyone's inputs.
    const annualAdditionsUsed = baseDeferral + employerMatch;
    const annualAdditionsBreached = annualAdditionsUsed > ANNUAL_ADDITIONS_LIMIT_2026;

    return {
      age, salary, preTax, roth, totalDeferral,
      deferralLimit, catchupLimit, catchupUsed, catchupRemaining,
      mandatoryRothCatchup, catchupMisallocatedToTraditional,
      employerMatch, megaBackdoorRoom, afterTaxAllowed,
      annualAdditionsUsed, annualAdditionsBreached,
    };
  }

  // Roth IRA eligibility uses combined household wages as a MAGI stand-in
  // (this app doesn't model a full MAGI figure independent of the tax
  // engine's own year-by-year calculation). MFS is modeled as of
  // 2026-08-20: living together at any point during the year collapses the
  // phase-out to $0-$10,000, which in practice rules a Roth IRA
  // contribution out entirely.
  const isMFJ = inputs.filingStatus === 'MFJ';
  const magiProxy = Math.max(0, inputs.salary1 || 0) + (inputs.spouse2Enabled ? Math.max(0, inputs.salary2 || 0) : 0);
  const mfsTogetherRoth = inputs.filingStatus === 'MFS' && inputs.mfsLivedWithSpouse;
  const [phaseFloor, phaseCeiling] = mfsTogetherRoth
    ? ROTH_IRA_PHASEOUT_MFS_TOGETHER
    : isMFJ ? ROTH_IRA_PHASEOUT_MFJ : ROTH_IRA_PHASEOUT_SINGLE;
  let rothIraEligibility = 'full';
  if (magiProxy >= phaseCeiling) rothIraEligibility = 'none';
  else if (magiProxy > phaseFloor) rothIraEligibility = 'partial';

  return {
    spouse1: forSpouse(1),
    spouse2: inputs.spouse2Enabled ? forSpouse(2) : null,
    rothIra: { eligibility: rothIraEligibility, magiProxy, phaseFloor, phaseCeiling, isMFJ },
  };
}

// HSA (Health Savings Account) contribution limits — tax year 2026.
// Source: IRS Notice 2025-05 / irs.gov HSA inflation adjustments for 2026.
// Verified 2026-08-20 against Rev. Proc. 2025-19, which sets the 2026 § 223
// amounts. Note these come from their OWN revenue procedure published in
// May, not from the general annual inflation Rev. Proc. published in October.
export const HSA_LIMIT_SELF_2026 = 4400;
export const HSA_LIMIT_FAMILY_2026 = 8750;
// Fixed by statute at IRC § 223(b)(3)(B), NOT inflation-indexed -- which is
// why Rev. Proc. 2025-19 adjusts every other § 223 figure and is silent on
// this one. Safe to leave at $1,000 until Congress changes it, so it does
// not belong on the annual update checklist.
export const HSA_CATCHUP_55_2026 = 1000; // age 55+, and not yet enrolled in Medicare

// Returns the applicable HSA contribution limit for a given age and
// coverage type this tax year. Used to warn users whose "Employer +
// Employee HSA Savings" input exceeds what's actually legal.
// inflFactor indexes the base limit only; the $1,000 catch-up is fixed in
// dollars by statute, so it is added unindexed.
export function getHSAContributionLimit(age, isFamilyCoverage, inflFactor = 1) {
  const base = (isFamilyCoverage ? HSA_LIMIT_FAMILY_2026 : HSA_LIMIT_SELF_2026) * inflFactor;
  return age >= 55 ? base + HSA_CATCHUP_55_2026 : base;
}

// Qualified Charitable Distribution (QCD) annual limit, per individual —
// tax year 2026. Indexed for inflation under SECURE 2.0 (was a flat
// $100,000 pre-2023). Each spouse gets their own limit, so an MFJ household
// can shelter up to double this. Source: irs.gov Notice 2025-XX / QCD
// inflation adjustment for 2026.
// Verified 2026-08-20 against IRS Notice 2025-67 directly: "increased from
// $108,000 to $111,000". Worth knowing where this lives -- it is NOT in
// Rev. Proc. 2025-32 (the general annual inflation procedure that carries
// the brackets and the estate exclusion) but in the separate retirement-plans
// notice, which is where to look when updating it next year.
//
// Not modeled: the separate ONE-TIME election under 408(d)(8)(F)(i)(II) to
// fund a split-interest entity (CRAT/CRUT/charitable gift annuity) from an
// IRA, capped at $55,000 for 2026. That is a feature gap rather than an
// error in this number.
export const QCD_LIMIT_2026 = 111000;
// A QCD is allowed from the day the owner reaches 70 1/2 (s 408(d)(8)(B)(ii)).
// The engine works in whole ages attained in the year, so it allows one
// from the year the owner turns 71, by which every owner has passed 70 1/2
// (an owner born January to June could give from the year they turn 70;
// the engine is a half-year conservative for them). Changelog 418; until
// then a QCD needed an RMD to ride on, which starts at 73 or 75.
export const QCD_START_AGE = 71;

// Standard deductions — tax year 2026 (IRS Rev. Proc. 2025-32, reflecting the
// One Big Beautiful Bill Act). Source: irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026
// NOTE: these dollar figures are fixed to a single tax year and are NOT
// auto-updated. Re-verify against the current year's IRS Rev. Proc. every
// January — search "IRS tax inflation adjustments tax year <year>".
// (TAX_YEAR itself now lives at the top of this file, near
// INPUTS_SCHEMA_VERSION — see the comment there for why.)
export const DEDUCTION_MFJ = 32200;
export const DEDUCTION_SINGLE = 16100;
const DEDUCTION_MFS = 16100; // Rev. Proc. 2025-32; half of MFJ, same as Single
// Approximation of the standard deduction reverting under a TCJA sunset --
// see the tcjaSunsetEnabled comment in DEFAULT_INPUTS for what this does and
// doesn't account for (notably: no personal exemption modeling).
const DEDUCTION_MFJ_PRETCJA = DEDUCTION_MFJ / 2;
const DEDUCTION_MFS_PRETCJA = DEDUCTION_MFS / 2;
const DEDUCTION_SINGLE_PRETCJA = DEDUCTION_SINGLE / 2;

// Additional standard deduction for the aged (IRC s 63(f)) -- tax year 2026,
// Rev. Proc. 2025-32: $1,650 per spouse aged 65+ on a married return
// (MFJ, MFS, surviving spouse), $2,050 for an unmarried filer. Indexed
// annually like the basic deduction, so it rides taxBracketInflationFactor.
// (The blind add-on is the same figures again; not modeled.) Verified
// 2026-08-29.
export const ADDITIONAL_DEDUCTION_AGED_MARRIED_2026 = 1650;
export const ADDITIONAL_DEDUCTION_AGED_SINGLE_2026 = 2050;

// OBBBA "senior bonus" deduction (P.L. 119-21 s 70104, IRC s 151(d)(5)
// as added): $6,000 per individual aged 65+, tax years 2025 through 2028
// only, available whether or not the filer itemizes, phased out at 6
// cents per dollar of MAGI over $75,000 ($150,000 MFJ), MFS excluded, no
// inflation indexing on either the amount or the thresholds. Stacks on
// top of the s 63(f) amount above. Verified 2026-08-29 (IRS/H&R Block/
// PGPF summaries of the enacted text).
export const SENIOR_BONUS_DEDUCTION = 6000;
export const SENIOR_BONUS_FIRST_YEAR = 2025;
export const SENIOR_BONUS_LAST_YEAR = 2028;
export const SENIOR_BONUS_PHASEOUT_RATE = 0.06;
export const SENIOR_BONUS_PHASEOUT_SINGLE = 75000;
export const SENIOR_BONUS_PHASEOUT_MFJ = 150000;

// s 63(f) add-on for `seniorCount` filers aged 65+ on this return.
export function additionalStandardDeductionAged(status, seniorCount, inflationFactor = 1) {
  if (!(seniorCount > 0)) return 0;
  const per = status === 'Single' ? ADDITIONAL_DEDUCTION_AGED_SINGLE_2026 : ADDITIONAL_DEDUCTION_AGED_MARRIED_2026;
  return per * seniorCount * inflationFactor;
}

// OBBBA senior bonus for `seniorCount` filers aged 65+, after the MAGI
// phase-out. Deliberately NOT multiplied by any inflation factor. Returns 0
// outside 2025-2028 and for MFS.
export function seniorBonusDeduction(magi, status, calendarYear, seniorCount) {
  if (!(seniorCount > 0)) return 0;
  if (calendarYear < SENIOR_BONUS_FIRST_YEAR || calendarYear > SENIOR_BONUS_LAST_YEAR) return 0;
  if (status === 'MFS') return 0;
  const threshold = status === 'MFJ' ? SENIOR_BONUS_PHASEOUT_MFJ : SENIOR_BONUS_PHASEOUT_SINGLE;
  // The phase-out reduces EACH qualifying individual's $6,000 separately
  // (s 151(d)(5)(C) reduces "the $6,000 amount"), so a joint return with
  // two seniors is fully phased out at $250,000 of MAGI, not $350,000.
  const reduction = Math.max(0, (magi || 0) - threshold) * SENIOR_BONUS_PHASEOUT_RATE;
  return seniorCount * Math.max(0, SENIOR_BONUS_DEDUCTION - reduction);
}

// Itemized deductions (changelog 417). The return takes the larger of the
// standard deduction and the sum of four lines the engine can see:
//   SALT      state income tax paid plus property tax, under the OBBBA cap
//             (s 164(b)(6) as amended by P.L. 119-21 s 70120): $40,000 for
//             2025, up 1% a year through 2029 ($40,400 for 2026), reduced
//             by 30% of MAGI over $500,000 (2025, also +1%/yr) but never
//             below $10,000; $10,000 flat from 2030. MFS: half of each.
//   Mortgage  the year's interest on acquisition debt, on at most $750,000
//             of principal (s 163(h)(3)(F); $375,000 MFS), pro-rated when
//             the balance is higher.
//   Charity   cash gifts, at most 60% of AGI (s 170(b)(1)(G)), less the
//             0.5%-of-AGI floor for itemizers from 2026 (s 70425).
//   Medical   unreimbursed medical costs over 7.5% of AGI (s 213(a)).
// AGI is approximated by the engine's MAGI (the same figure the senior
// bonus phases out against). A non-itemizer deducts cash gifts up to
// $1,000 / $2,000 MFJ from 2026 (s 170(p), P.L. 119-21 s 70424) on top of
// the standard deduction. Not modeled: the 35% ceiling on the value of
// itemized deductions in the 37% bracket (s 68 as amended), investment
// interest, casualty losses, state itemizing rules.
export const SALT_CAP_BY_YEAR = { 2025: 40000, 2026: 40400, 2027: 40804, 2028: 41212, 2029: 41624 };
export const SALT_PHASEDOWN_THRESHOLD_BY_YEAR = { 2025: 500000, 2026: 505000, 2027: 510050, 2028: 515151, 2029: 520302 };
export const SALT_CAP_FLOOR = 10000;
export const SALT_PHASEDOWN_RATE = 0.30;
export const MORTGAGE_ACQUISITION_DEBT_LIMIT = 750000;
export const CHARITABLE_AGI_LIMIT = 0.60;
export const CHARITABLE_ITEMIZER_FLOOR = 0.005;      // from 2026
export const CHARITABLE_ITEMIZER_FLOOR_FIRST_YEAR = 2026;
export const NON_ITEMIZER_CHARITABLE_SINGLE = 1000;  // from 2026
export const NON_ITEMIZER_CHARITABLE_MFJ = 2000;
export const NON_ITEMIZER_CHARITABLE_FIRST_YEAR = 2026;
export const MEDICAL_AGI_FLOOR = 0.075;

// The SALT cap for a year, filing status and MAGI. Statutory dollars: the
// cap's own 1% steps are the law's, so no inflation factor applies.
export function saltCapFor(year, status, magi) {
  const half = status === 'MFS' ? 0.5 : 1;
  if (year < 2025 || year > 2029) return SALT_CAP_FLOOR * half;
  const cap = SALT_CAP_BY_YEAR[year];
  const threshold = SALT_PHASEDOWN_THRESHOLD_BY_YEAR[year] * half;
  const reduced = cap * half - Math.max(0, (magi || 0) - threshold) * SALT_PHASEDOWN_RATE;
  return Math.max(SALT_CAP_FLOOR * half, reduced);
}

// The non-itemizer charitable deduction a year allows.
export function nonItemizerCharitableFor(year, status, cashGifts) {
  if (year < NON_ITEMIZER_CHARITABLE_FIRST_YEAR) return 0;
  if (status === 'MFS') return Math.min(Math.max(0, cashGifts || 0), NON_ITEMIZER_CHARITABLE_SINGLE);
  const cap = status === 'MFJ' ? NON_ITEMIZER_CHARITABLE_MFJ : NON_ITEMIZER_CHARITABLE_SINGLE;
  return Math.min(Math.max(0, cashGifts || 0), cap);
}

// The four lines and their total for one year. Every figure in the year's
// own dollars. `mortgageBalance` is the balance the interest accrued on.
export function itemizedDeductionFor({ magi, status, year, stateTax = 0, propertyTax = 0, mortgageInterest = 0, mortgageBalance = 0, mortgageAcquisition = true, charitable = 0, medical = 0 }) {
  const agi = Math.max(0, magi || 0);
  const salt = Math.min(Math.max(0, stateTax) + Math.max(0, propertyTax), saltCapFor(year, status, agi));
  const debtLimit = status === 'MFS' ? MORTGAGE_ACQUISITION_DEBT_LIMIT / 2 : MORTGAGE_ACQUISITION_DEBT_LIMIT;
  const mortgage = mortgageAcquisition && mortgageInterest > 0
    ? mortgageInterest * (mortgageBalance > debtLimit ? debtLimit / mortgageBalance : 1)
    : 0;
  const gifts = Math.min(Math.max(0, charitable), CHARITABLE_AGI_LIMIT * agi);
  const giftFloor = year >= CHARITABLE_ITEMIZER_FLOOR_FIRST_YEAR ? CHARITABLE_ITEMIZER_FLOOR * agi : 0;
  const charity = Math.max(0, gifts - giftFloor);
  const medicalExcess = Math.max(0, Math.max(0, medical) - MEDICAL_AGI_FLOOR * agi);
  return { total: salt + mortgage + charity + medicalExcess, salt, mortgage, charitable: charity, medical: medicalExcess };
}

// Federal Poverty Level guidelines (48 contiguous states + DC) — HHS/ASPE,
// effective 2026, verified 2026-08-20 against the Federal Register notice
// itself (91 FR 1797, 15 Jan 2026, "Annual Update of the HHS Poverty
// Guidelines") rather than a secondary summary.
// Linked in sources.js to the Federal Register notice (the ASPE topic page
// refuses automated link checks).
//
// Two documented simplifications, both deliberate:
//
//   1. Alaska and Hawaii have their own higher guidelines ($19,950 / $7,100
//      and $18,360 / $6,530 respectively for 2026). Not modeled -- the ACA
//      floor below would sit slightly too low for a resident of either, and
//      neither is currently a non-expansion state, so the coverage-gap
//      branch that consumes this never fires for them anyway.
//
//   2. (Resolved, changelog 409.) ACA premium tax credits for a coverage
//      year use the guidelines in effect at the start of the enrollment
//      period -- the PRIOR year's: 2026 coverage is measured against the
//      2025 guidelines (45 CFR 155.300 and the s 36B regulations, which
//      look to the poverty line "for the taxable year" as most recently
//      published before open enrollment). Until changelog 409 the engine
//      read the 2026 figures for 2026 and inflated forward, which put every
//      cliff and floor one year of indexing too high ($86,560 against
//      $84,600 for a couple), so a conversion the app called safe could
//      cross the real line and forfeit the year's whole credit.
// Premium tax credits end at this multiple of the FPL. The ARPA/IRA
// enhancement that removed the ceiling for 2021-2025 expired; 2026
// coverage is back on the statutory 400% cliff (IRC 36B(c)(1)(A)).
export const ACA_SUBSIDY_CLIFF_FPL_MULTIPLE = 4.0;
// The guideline tables, by the year HHS published them (48 states + DC).
// 2025: 90 FR 5917 (17 Jan 2025). 2026: 91 FR 1797 (15 Jan 2026).
export const FPL_2025_BASE = 15650;
export const FPL_2025_PER_ADDITIONAL_PERSON = 5500;
export const FPL_2026_BASE = 15960; // 1-person household, 48 states + DC
export const FPL_2026_PER_ADDITIONAL_PERSON = 5680;
const FPL_TABLES = { 2025: [FPL_2025_BASE, FPL_2025_PER_ADDITIONAL_PERSON], 2026: [FPL_2026_BASE, FPL_2026_PER_ADDITIONAL_PERSON] };
const FPL_LATEST_TABLE_YEAR = 2026;

// The Federal Poverty Level that governs marketplace coverage in
// `coverageYear`, for a household of the given size (1 = single filer,
// 2 = MFJ couple -- this app doesn't model dependents, so household size
// never exceeds 2): the guideline published the year BEFORE. Beyond the
// newest table the latest guideline is indexed forward at `inflationRate`
// (percent a year) from the coverage year it governs, so each January's
// update replaces one year of estimate. Called with the coverage year
// alone it answers for 2026 coverage.
export function getFederalPovertyLevel(householdSize, coverageYear = 2026, inflationRate = 0) {
  const size = Math.max(1, householdSize);
  const tableYear = Math.min(FPL_LATEST_TABLE_YEAR, Math.max(2025, coverageYear - 1));
  const [base, perPerson] = FPL_TABLES[tableYear];
  const yearsBeyond = Math.max(0, coverageYear - 1 - FPL_LATEST_TABLE_YEAR);
  const indexed = yearsBeyond > 0 ? Math.pow(1 + (inflationRate || 0) / 100, yearsBeyond) : 1;
  return (base + perPerson * (size - 1)) * indexed;
}

// The premium tax credit itself (changelog 415). IRC 36B(b): the credit is
// the benchmark premium (the second-lowest-cost silver plan covering the
// household) less the household's own contribution, which is the
// "applicable percentage" of household income, and never more than the
// premium actually paid. The percentage slides with income as a share of
// the poverty line; the 2026 table is Rev. Proc. 2025-25 (the original
// statutory schedule, indexed -- the 2021-2025 enhancement expired).
// Within a band the percentage moves linearly from `initial` at the
// band's floor to `final` at its ceiling (36B(b)(3)(A)(i)). Nothing below
// 100% of FPL (Medicaid or the coverage gap) and nothing above 400%.
// Later years keep the 2026 schedule: its indexing moves a few hundredths
// of a point a year and no table is published more than a year ahead.
export const ACA_APPLICABLE_PCT_2026 = [
  // [from x FPL, to x FPL, initial %, final %]
  [1.00, 1.33, 2.10, 2.10],
  [1.33, 1.50, 3.14, 4.19],
  [1.50, 2.00, 4.19, 6.60],
  [2.00, 2.50, 6.60, 8.44],
  [2.50, 3.00, 8.44, 9.96],
  [3.00, 4.00, 9.96, 9.96],
];
export function acaApplicablePercent(fplRatio) {
  if (!(fplRatio >= 1) || fplRatio > ACA_SUBSIDY_CLIFF_FPL_MULTIPLE) return null;
  for (const [from, to, initial, final] of ACA_APPLICABLE_PCT_2026) {
    if (fplRatio >= from && (fplRatio < to || to === ACA_SUBSIDY_CLIFF_FPL_MULTIPLE)) {
      return initial + (final - initial) * ((fplRatio - from) / (to - from));
    }
  }
  return null;
}

// Average 2026 benchmark premium for a 40-year-old, monthly, by state
// (KFF: second-lowest-cost silver premium per county, weighted by plan
// selections; via Becker's Payer Issues, 20 Nov 2025). The US average is the
// fallback for a state not listed. Re-check each autumn when the next
// year's rates are filed.
export const ACA_BENCHMARK_40_MONTHLY_2026 = {
  US: 625,
  AL: 645, AK: 1032, AZ: 532, AR: 774, CA: 570, CO: 557, CT: 870, DE: 691, DC: 610, FL: 683,
  GA: 615, HI: 541, ID: 490, IL: 646, IN: 474, IA: 501, KS: 670, KY: 590, LA: 646, ME: 709,
  MD: 414, MA: 494, MI: 523, MN: 448, MS: 662, MO: 605, MT: 692, NE: 710, NV: 497, NH: 401,
  NJ: 545, NM: 623, NY: 817, NC: 638, ND: 570, OH: 513, OK: 604, OR: 543, PA: 572, RI: 506,
  SC: 564, SD: 655, TN: 711, TX: 661, UT: 640, VT: 1299, VA: 455, WA: 612, WV: 1073, WI: 611, WY: 1090,
};
// The federal default age curve (45 CFR 147.102), 21-24 = 1.000, 64+ =
// 3.000; a 40-year-old is 1.278, which is what the table above is quoted
// at. New York and Vermont are community-rated (every adult pays the same),
// and Massachusetts compresses the curve to 2:1.
const ACA_AGE_CURVE = {
  21: 1.000, 22: 1.000, 23: 1.000, 24: 1.000, 25: 1.004, 26: 1.024, 27: 1.048, 28: 1.087, 29: 1.119,
  30: 1.135, 31: 1.159, 32: 1.183, 33: 1.198, 34: 1.214, 35: 1.222, 36: 1.230, 37: 1.238, 38: 1.246, 39: 1.262,
  40: 1.278, 41: 1.302, 42: 1.325, 43: 1.357, 44: 1.397, 45: 1.444, 46: 1.500, 47: 1.563, 48: 1.635, 49: 1.706,
  50: 1.786, 51: 1.865, 52: 1.952, 53: 2.040, 54: 2.135, 55: 2.230, 56: 2.333, 57: 2.437, 58: 2.548, 59: 2.603,
  60: 2.714, 61: 2.810, 62: 2.873, 63: 2.952, 64: 3.000,
};
export function acaAgeFactor(age, state) {
  if (state === 'NY' || state === 'VT') return 1;
  const a = Math.min(64, Math.max(21, Math.round(Number(age) || 21)));
  const federal = ACA_AGE_CURVE[a];
  // Massachusetts: the same shape, half the climb.
  return state === 'MA' ? 1 + (federal - 1) / 2 : federal;
}
// The household's benchmark premium for a year, in that year's dollars:
// one benchmark per covered adult, at the state's 40-year-old rate scaled
// by the age curve, times the medical inflation factor.
export function acaBenchmarkPremiumAnnual(state, ages, medicalInflFactor = 1) {
  const base40 = ACA_BENCHMARK_40_MONTHLY_2026[state] ?? ACA_BENCHMARK_40_MONTHLY_2026.US;
  const ageScale = acaAgeFactor(40, state);
  let monthly = 0;
  for (const age of ages || []) monthly += base40 * (acaAgeFactor(age, state) / ageScale);
  return monthly * 12 * medicalInflFactor;
}
// The credit for a year: benchmark less the contribution, capped at the
// premium paid. `fplRatio` and `applicablePct` come back for the ledger.
export function acaPremiumTaxCredit({ benchmark, magi, fpl, premiumPaid }) {
  const fplRatio = fpl > 0 ? Math.max(0, magi) / fpl : 0;
  const applicablePct = acaApplicablePercent(fplRatio);
  if (applicablePct === null) return { credit: 0, fplRatio, applicablePct: null, contribution: 0 };
  const contribution = Math.max(0, magi) * applicablePct / 100;
  const credit = Math.max(0, Math.min(premiumPaid, benchmark - contribution));
  return { credit, fplRatio, applicablePct, contribution };
}

// States that have not adopted ACA Medicaid expansion, as of 2026. Adults
// in these states with income below 100% FPL fall into the "coverage gap":
// too much income for the state's non-expanded Medicaid, too little for ACA
// marketplace subsidies (which require >=100% FPL) — leaving no affordable
// coverage option. Georgia's partial "Pathways to Coverage" program (work
// requirement, capped at 100% FPL) is treated as non-expansion here since it
// doesn't remove the gap the way full expansion does.
// Source: healthinsurance.org/medicaid/expansion (state-by-state tracker) —
// re-check every year, since a state can expand (or a program can lapse)
// at any time, not just in January like the dollar-figure constants above.
// Wisconsin is NOT on the list (changelog 418): it never adopted the
// expansion, but its BadgerCare Plus waiver covers childless adults up to
// 100% of FPL, exactly where marketplace subsidies begin, so there is no
// gap to fall into (KFF, "Status of State Medicaid Expansion Decisions").
export const ACA_NON_EXPANSION_STATES = new Set(['AL', 'FL', 'GA', 'KS', 'MS', 'SC', 'TN', 'TX', 'WY']);

// ---------------------------------------------------------------------------
// Residency timeline (changelog 195, RELOCATION_SPEC.md rung 1)
// ---------------------------------------------------------------------------

// Every value stateTaxState can take. calculateStateTaxes models the named
// states' actual rules; everything else with an income tax is priced as a
// flat rate, and the no-income-tax states return zero.
export const STATE_TAX_JURISDICTIONS = ['none', 'TX_FL', 'flat_5', 'state_rules', 'ca', 'ny', 'il', 'co', 'pa', 'va', 'wa'];

// States with no tax on wage and retirement income. Washington is not
// here: its capital gains tax, and from 2028 its income tax, have their own
// jurisdiction ('wa', changelog 349).
const NO_INCOME_TAX_STATES = new Set(['TX', 'FL', 'NV', 'SD', 'WY', 'AK', 'NH', 'TN']);

// The state-income-tax jurisdiction that goes with a two-letter state.
// Shared by the Settings soft-link (App.jsx) and a residency-timeline entry
// that names only a state, so the two can never disagree. The soft-link
// used to carry its own copy, which had no Virginia branch -- choosing VA
// as your state set a 5% flat rate instead of Virginia's own rules.
// Community-property states (IRC 1014(b)(6): both halves of community
// property take a new basis at the first death). Changelog 360.
export const COMMUNITY_PROPERTY_STATES = Object.freeze(['AZ', 'CA', 'ID', 'LA', 'NM', 'NV', 'TX', 'WA', 'WI']);
export const TAXABLE_ACCOUNT_OWNERS = Object.freeze(['joint', 'spouse1', 'spouse2']);

// The share of the household's taxable money whose basis is reset to market
// value at the first death. `state` is the US state the household lives in
// that year (null abroad); `owner` how the taxable account is held;
// `deceased` 1 or 2.
export function firstDeathBasisResetShare({ state, owner, deceased }) {
  if (state && COMMUNITY_PROPERTY_STATES.includes(String(state).toUpperCase())) return 1;
  if (owner === `spouse${deceased}`) return 1;
  if (owner === 'spouse1' || owner === 'spouse2') return 0;
  return 0.5;
}

export function stateTaxJurisdictionFor(stateCode) {
  const code = typeof stateCode === 'string' ? stateCode.toUpperCase() : '';
  if (NO_INCOME_TAX_STATES.has(code)) return 'none';
  const modeled = { CA: 'ca', NY: 'ny', IL: 'il', CO: 'co', PA: 'pa', VA: 'va', WA: 'wa' };
  if (modeled[code]) return modeled[code];
  // Every other state with an income tax has its own record (changelog 361).
  return STATE_TAX_RULES[code] ? 'state_rules' : 'flat_5';
}

// ---------------------------------------------------------------------------
// Foreign residence (changelog 196, RELOCATION_SPEC.md rung 2)
// ---------------------------------------------------------------------------
//
// A move abroad keeps the whole US engine running -- a US citizen owes US
// tax on worldwide income wherever they live -- and adds a second, foreign
// layer on top: local income tax, any local health/social contribution,
// and the US foreign tax credit that offsets part of it. Everything the
// foreign layer knows comes from the user (Custom Country); rung 3's
// presets will only ever prefill these same fields.

// How a foreign country treats a US Roth IRA. There is no default: the
// Where-you-live panel will not save a foreign move until one is chosen,
// so the most flattering answer can never be a silent one.
//   respect        -- no local tax on withdrawals or growth.
//   taxableAccount -- the country looks through the wrapper and taxes the
//                     account like a brokerage account: its dividends each
//                     year, and the earnings share of every withdrawal, at
//                     the local investment-income rate.
//   rate           -- a flat local rate on every Roth withdrawal.
//   earnings       -- the earnings share of every withdrawal is ordinary
//                     local income, taxed on the local scale; the
//                     contributions come back untaxed (changelog 197:
//                     Portugal, on practitioner consensus).
// Foreign tax on a Roth never earns a US credit -- there is no US tax on
// the Roth to offset -- so the last two are pure added cost.
export const FOREIGN_ROTH_TREATMENTS = ['respect', 'taxableAccount', 'rate', 'earnings'];

const pctOr = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// A bracket table in local currency: [{ upTo, rate }], sorted, the last
// band open (upTo null). Anything unusable is dropped.
function readBracketTable(raw) {
  return Array.isArray(raw)
    ? raw
      .map((b) => ({
        upTo: b && b.upTo != null && b.upTo !== '' && Number.isFinite(Number(b.upTo)) ? Number(b.upTo) : null,
        rate: pctOr(b && b.rate, 0),
      }))
      .filter((b, i, arr) => b.upTo !== null || i === arr.length - 1)
      .sort((a, b) => (a.upTo === null ? 1 : b.upTo === null ? -1 : a.upTo - b.upTo))
    : [];
}

// A special regime for new residents (changelog 199, RELOCATION_SPEC 3.3):
//   flatRate -- one rate on all foreign-source income (Italy's 7%, art.
//               24-ter; Greece's 7%, art. 5B);
//   lumpSum  -- a fixed yearly amount in local currency covering all
//               foreign income, plus a fixed amount per extra adult
//               (Italy art. 24-bis; Greece art. 5A). Not indexed.
// `years` is how long it lasts, counted from the year of the move. When it
// runs out the country's ordinary rules apply -- a step change in the
// ledger, never a smoothed one. `creditable` defaults to false: a US
// credit for a regime's tax is the answer that has to be argued for.
export const FOREIGN_REGIME_KINDS = ['flatRate', 'lumpSum'];
function readRegime(raw) {
  if (!raw || typeof raw !== 'object' || !FOREIGN_REGIME_KINDS.includes(raw.kind)) return null;
  const yearsRaw = Math.trunc(Number(raw.years));
  const untilRaw = Math.trunc(Number(raw.untilYear));
  // Changelog 203: a regime can instead end on a fixed calendar year
  // (Malaysia's exemption runs to 2036 whenever you arrive).
  const untilYear = Number.isFinite(untilRaw) && untilRaw > 1900 ? untilRaw : null;
  const years = Number.isFinite(yearsRaw) && yearsRaw > 0 ? yearsRaw : (untilYear ? 999 : null);
  if (!years) return null;
  return {
    kind: raw.kind,
    untilYear,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : (raw.kind === 'flatRate' ? 'Flat-rate regime' : 'Lump-sum regime'),
    rate: pctOr(raw.rate, 0),
    amount: pctOr(raw.amount, 0),
    amountPerExtraAdult: pctOr(raw.amountPerExtraAdult, 0),
    years,
    creditable: raw.creditable === true,
    exemptsWealthTax: raw.exemptsWealthTax === true,
    // Foreign assets outside the country's inheritance tax while the regime
    // runs (Italy's lump sum; changelog 200).
    exemptsInheritance: raw.exemptsInheritance === true,
  };
}

// A yearly tax on account balances (changelog 199): Italy's IVAFE, Spain's
// wealth and solidarity taxes. Brackets in local currency per adult, NOT
// indexed (the thresholds are fixed in law), over the balances of the
// accounts it reaches. Never creditable -- it is not an income tax.
function readWealthTax(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const brackets = readBracketTable(raw.brackets);
  if (brackets.length === 0) return null;
  const a = raw.accounts && typeof raw.accounts === 'object' ? raw.accounts : {};
  return {
    brackets,
    accounts: { taxable: a.taxable !== false, roth: a.roth === true, preTax: a.preTax === true },
  };
}

// Remittance-basis taxation (changelog 200, Thailand): foreign income is
// taxed only when brought into the country. The plan treats what the
// household spends there as brought in, capped at the year's foreign
// income; `share` (0-100) lowers that for spending paid from abroad.
// Savings from before a cut-off (Thailand: 2024) are not tracked, which
// leans cautious.
function readRemittance(raw) {
  if (!raw || typeof raw !== 'object' || raw.enabled === false) return null;
  const share = Number(raw.share);
  return { share: Number.isFinite(share) ? Math.min(100, Math.max(0, share)) : 100 };
}

// Foreign inheritance tax, per heir (changelog 200). Replaces the flat
// estimate when present.
//   basis 'heir'   -- each heir's share on the schedule for their
//                     relationship: an allowance, then bands on the rest;
//   basis 'estate' -- one schedule on the whole estate, shared pro rata
//                     (Philippines).
//   worldwideAfterYears -- the country reaches a US citizen's worldwide
//                     estate only after this many years living there
//                     (France 5; 0 = from the first year). Before that it
//                     taxes only local assets, which the plan does not hold.
// Amounts are local currency and NOT indexed. Relationships missing from
// `classes` fall back: parent -> child; sibling, niece, inLaw -> other.
export const INHERITANCE_CLASS_FALLBACK = { parent: 'child', sibling: 'other', niece: 'other', inLaw: 'other' };
function readInheritanceClass(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = { allowance: pctOr(raw.allowance, 0), brackets: readBracketTable(raw.brackets) };
  // Changelog 203: the band's rate applies to the WHOLE taxable amount, not
  // just the slice in it (Germany's ErbStG; its hardship smoothing at band
  // edges is not modeled, which overstates slightly).
  if (raw.wholeAmount === true) out.wholeAmount = true;
  return out;
}

// Tax on an amount under a class: marginal bands, or the reached band's
// rate on the whole amount.
export function inheritanceClassTax(cls, amount) {
  const taxable = Math.max(0, amount - cls.allowance);
  if (!cls.wholeAmount) return progressiveTax(taxable, cls.brackets);
  if (taxable <= 0) return 0;
  const band = cls.brackets.find((b) => b.upTo === null || taxable <= b.upTo) || cls.brackets[cls.brackets.length - 1];
  return taxable * (band.rate / 100);
}
function readInheritance(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const basis = raw.basis === 'estate' ? 'estate' : 'heir';
  const after = Math.trunc(Number(raw.worldwideAfterYears));
  const out = { basis, worldwideAfterYears: Number.isFinite(after) && after > 0 ? after : 0 };
  if (basis === 'estate') {
    const estate = readInheritanceClass(raw.estate);
    if (!estate || estate.brackets.length === 0) return null;
    out.estate = estate;
    return out;
  }
  const classes = {};
  if (raw.classes && typeof raw.classes === 'object') {
    for (const [k, v] of Object.entries(raw.classes)) {
      const c = readInheritanceClass(v);
      if (c) classes[k] = c;
    }
  }
  if (Object.keys(classes).length === 0) return null;
  out.classes = classes;
  return out;
}

// The inheritance class that applies to a relationship, or null (untaxed).
export function inheritanceClassFor(inheritance, relationship) {
  const c = inheritance.classes || {};
  if (c[relationship]) return c[relationship];
  const fallback = INHERITANCE_CLASS_FALLBACK[relationship];
  if (fallback && c[fallback]) return c[fallback];
  return relationship === 'spouse' ? null : (c.other || null);
}

const str = (v) => (typeof v === 'string' && v ? v : null);
function readPresetNotes(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    rothLine: str(raw.rothLine),
    estateNote: str(raw.estateNote),
    estateKept: raw.estateKept === true,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((x) => typeof x === 'string' && x) : [],
  };
}

// Normalizes the `foreign` block of a foreign timeline entry. Unknown or
// missing fields take the conservative value -- the one that shows MORE
// tax, never less.
export function readForeignTerms(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const brackets = readBracketTable(f.brackets);
  const ordinaryRate = pctOr(f.ordinaryRate, 0);
  const investmentBrackets = readBracketTable(f.investmentBrackets);
  return {
    taxMode: f.taxMode === 'brackets' && brackets.length > 0 ? 'brackets' : 'effectiveRate',
    ordinaryRate,
    brackets,
    fxRate: pctOr(f.fxRate, 0) > 0 ? Number(f.fxRate) : 1,
    fxDriftPct: Number.isFinite(Number(f.fxDriftPct)) ? Number(f.fxDriftPct) : 0,
    investmentRate: pctOr(f.investmentRate, ordinaryRate),
    taxesSocialSecurity: f.taxesSocialSecurity !== false,
    taxesRetirementIncome: f.taxesRetirementIncome !== false,
    taxesInvestmentIncome: f.taxesInvestmentIncome !== false,
    roth: FOREIGN_ROTH_TREATMENTS.includes(f.roth) ? f.roth : 'taxableAccount',
    rothRate: pctOr(f.rothRate, 0),
    treatyResourcing: f.treatyResourcing === true,
    usExemptsSocialSecurity: f.usExemptsSocialSecurity === true,
    contributionRate: pctOr(f.contributionRate, 0),
    contributionCap: pctOr(f.contributionCap, 0),
    healthcareCost: pctOr(f.healthcareCost, 0),
    medicarePartBRetained: f.medicarePartBRetained !== false,
    // Rung 3 (changelog 197). Every default below reproduces rung 2
    // exactly, so a Custom Country entry saved before these existed prices
    // the same.
    //   splitIncome     -- tax each adult on an equal share of the
    //                      household's income (Portugal's joint quotient;
    //                      the nearest fit to Mexico's individual filing).
    //                      Brackets only.
    //   pensionDeduction-- local currency per adult, taken off pensions,
    //                      IRA withdrawals and taxed Social Security before
    //                      the scale (Portugal's specific deduction, or
    //                      Mexico's contested pension exemption).
    //   creditsUsTaxOnSocialSecurity -- the country gives its own credit for
    //                      the US tax on Social Security (Portugal).
    //   investmentMode  -- 'flat' at investmentRate, or 'ordinary': added
    //                      on top of other income on the local scale.
    //   dividendSurtax  -- an extra % on dividends (Mexico's 10%).
    //   contributionBase-- 'income', or 'declared': a fixed declared income
    //                      in today's US dollars (Costa Rica's CAJA).
    splitIncome: f.splitIncome === true,
    pensionDeduction: pctOr(f.pensionDeduction, 0),
    creditsUsTaxOnSocialSecurity: f.creditsUsTaxOnSocialSecurity === true,
    investmentMode: ['ordinary', 'brackets'].includes(f.investmentMode) && (f.investmentMode !== 'brackets' || investmentBrackets.length > 0) ? f.investmentMode : 'flat',
    // Changelog 199. 'brackets': investment income on its own scale
    // (Spain's savings base). rothEarningsOn: which scale Roth earnings
    // join under Roth option 'earnings' ('investment' = Spain, V1291-22).
    investmentBrackets,
    rothEarningsOn: f.rothEarningsOn === 'investment' ? 'investment' : 'ordinary',
    // The treaty re-sources Social Security too, so the US credits the
    // country's tax on it (Italy, Art. 23(4)(c)).
    treatyResourcesSocialSecurity: f.treatyResourcesSocialSecurity === true,
    regime: readRegime(f.regime),
    wealthTax: readWealthTax(f.wealthTax),
    // Changelog 200.
    remittance: readRemittance(f.remittance),
    creditsUsTaxOnInvestmentIncome: f.creditsUsTaxOnInvestmentIncome === true,
    // Changelog 203. The share of US Social Security the country taxes
    // (Germany: 84% for a pension starting in 2026); an allowance on
    // investment income per adult, local currency (Germany EUR 1,000); the
    // country's own credit for US tax on pensions and IRA withdrawals
    // (Greece), and a cap on all its credits for US tax as a % of that tax
    // (Malaysia without a treaty: 50%).
    socialSecurityTaxableShare: f.socialSecurityTaxableShare === undefined || f.socialSecurityTaxableShare === null || f.socialSecurityTaxableShare === ''
      ? 100 : Math.min(100, pctOr(f.socialSecurityTaxableShare, 100)),
    investmentAllowance: pctOr(f.investmentAllowance, 0),
    // Changelog 209: the share of a realized gain the country taxes
    // (Australia 50% for an asset held over a year) and the share of an
    // IRA / 401(k) withdrawal it taxes (Australia taxes only the growth,
    // as a trust distribution). Both default to all of it.
    capitalGainsTaxedPct: f.capitalGainsTaxedPct === undefined || f.capitalGainsTaxedPct === null || f.capitalGainsTaxedPct === ''
      ? 100 : Math.min(100, pctOr(f.capitalGainsTaxedPct, 100)),
    // Changelog 213: a separate scale for capital gains (the UK taxes them
    // at 18/24% while dividends run 10.75-39.35%), and investment brackets
    // that sit ON TOP of your other income rather than starting again at
    // the bottom band. Both off unless the country says otherwise.
    capitalGainsRate: f.capitalGainsRate === undefined || f.capitalGainsRate === null || f.capitalGainsRate === ''
      || !Number.isFinite(Number(f.capitalGainsRate)) || Number(f.capitalGainsRate) < 0
      ? null : Number(f.capitalGainsRate),
    capitalGainsAllowance: pctOr(f.capitalGainsAllowance, 0),
    investmentStacked: f.investmentStacked === true,
    retirementAccountTaxedPct: f.retirementAccountTaxedPct === undefined || f.retirementAccountTaxedPct === null || f.retirementAccountTaxedPct === ''
      ? 100 : Math.min(100, pctOr(f.retirementAccountTaxedPct, 100)),
    creditsUsTaxOnRetirementIncome: f.creditsUsTaxOnRetirementIncome === true,
    localCreditCapPct: f.localCreditCapPct === undefined || f.localCreditCapPct === null || f.localCreditCapPct === ''
      ? 100 : Math.min(100, pctOr(f.localCreditCapPct, 100)),
    inheritance: readInheritance(f.inheritance),
    dividendSurtax: pctOr(f.dividendSurtax, 0),
    contributionBase: ['declared', 'investment'].includes(f.contributionBase) ? f.contributionBase : 'income',
    declaredIncome: pctOr(f.declaredIncome, 0),
    presetId: typeof f.presetId === 'string' && f.presetId ? f.presetId : null,
    // The user changed at least one of the preset's figures after applying it.
    presetEdited: f.presetEdited === true,
    // Opt-in assumptions from the preset that are switched on.
    presetAssumptions: Array.isArray(f.presetAssumptions) ? f.presetAssumptions.filter((x) => typeof x === 'string') : [],
    // What the years-abroad notice says about this summary, snapshotted
    // when the move was added (the summaries themselves are Premium and
    // not in the open app): our Roth line if the move keeps our Roth
    // answer, our estate note if it keeps our estate rules, and the
    // warning behind each assumption switched on. Absent on moves added
    // before the snapshot existed; the notice then says less.
    presetNotes: readPresetNotes(f.presetNotes),
    estateRate: f.estateRate === null || f.estateRate === undefined || f.estateRate === '' ? null : pctOr(f.estateRate, null),
  };
}

// The state-tax fields a residence carries, as a unit.
const STATE_CLAIM_KEYS = ['stateOfResidence', 'stateTaxState', 'stateTaxFlatRate',
  'stateTaxSocialSecurityTaxable', 'stateTaxPensionTaxable', 'nycResident', 'yonkersResident'];
const NO_STATE_CLAIM = {
  stateOfResidence: null, stateTaxState: 'none', stateTaxFlatRate: 5.0,
  stateTaxSocialSecurityTaxable: false, stateTaxPensionTaxable: true,
  nycResident: false, yonkersResident: false,
};

// Normalizes inputs.residencyTimeline. Always returns an array of
// well-formed moves sorted by fromYear, one per year (a later entry for
// the same year wins). Anything unusable is dropped rather than guessed
// at: no fromYear, or a domestic move with no state.
//
// A foreign move carries the state-tax fields of the US state that still
// claims the household -- the state it lived in just before -- unless the
// move says domicile there was severed, in which case no state taxes it.
// Pass the plan-wide residence so a first move abroad knows which state
// that is; without it (a caller only listing moves) the claim is unknown
// and reads as none.
export function readResidencyTimeline(raw, planWide = null) {
  if (!Array.isArray(raw)) return [];
  const byYear = new Map();
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const kind = e.kind || 'domestic';
    if (kind !== 'domestic' && kind !== 'foreign') continue;
    const fromYear = Number(e.fromYear);
    if (!Number.isFinite(fromYear)) continue;
    const year = Math.trunc(fromYear);
    const id = e.id != null ? String(e.id) : String(year);
    // Changelog 203: the month the move takes effect (1 = January, the
    // behavior before) and living costs there as a % of spending now.
    const month = Math.trunc(Number(e.fromMonth));
    const fromMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;
    const col = Number(e.costOfLivingPct);
    const costOfLivingPct = Number.isFinite(col) && col > 0 ? Math.min(300, col) : 100;
    if (kind === 'foreign') {
      const name = typeof e.countryName === 'string' && e.countryName.trim() ? e.countryName.trim() : 'Abroad';
      byYear.set(year, {
        id, fromYear: year, fromMonth, costOfLivingPct, kind: 'foreign', countryName: name,
        stateDomicileSevered: e.stateDomicileSevered === true,
        foreign: readForeignTerms(e.foreign),
      });
      continue;
    }
    const state = typeof e.stateOfResidence === 'string' ? e.stateOfResidence.trim().toUpperCase() : '';
    if (!/^[A-Z]{2}$/.test(state)) continue;
    const stateTaxState = STATE_TAX_JURISDICTIONS.includes(e.stateTaxState)
      ? e.stateTaxState
      : stateTaxJurisdictionFor(state);
    const flat = Number(e.stateTaxFlatRate);
    const isNy = stateTaxState === 'ny';
    const nycResident = isNy && e.nycResident === true;
    byYear.set(year, {
      id,
      fromYear: year,
      fromMonth,
      costOfLivingPct,
      kind: 'domestic',
      stateOfResidence: state,
      stateTaxState,
      stateTaxFlatRate: Number.isFinite(flat) && flat >= 0 ? flat : DEFAULT_INPUTS.stateTaxFlatRate,
      stateTaxSocialSecurityTaxable: e.stateTaxSocialSecurityTaxable === true,
      stateTaxPensionTaxable: e.stateTaxPensionTaxable !== false,
      // A household resides in NYC or Yonkers, never both; NYC wins a tie.
      nycResident,
      yonkersResident: isNy && !nycResident && e.yonkersResident === true,
      foreign: null,
    });
  }
  const sorted = [...byYear.values()].sort((a, b) => a.fromYear - b.fromYear);
  // Walk in order so each foreign move inherits the claim of whatever
  // residence came before it.
  let prev = planWide;
  for (const e of sorted) {
    // A move home from abroad takes effect from January (changelog 203):
    // the foreign layer is priced for the months of a move out only.
    if (e.kind === 'domestic' && prev && prev.kind === 'foreign') e.fromMonth = 1;
    if (e.kind === 'foreign') {
      const claim = e.stateDomicileSevered || !prev ? NO_STATE_CLAIM : prev;
      for (const k of STATE_CLAIM_KEYS) e[k] = claim[k] ?? NO_STATE_CLAIM[k];
    }
    prev = e;
  }
  return sorted;
}

// The plan-wide state inputs, in the same shape as a timeline entry. This
// is what every year uses until the first move.
export function planWideResidence(inputs) {
  return {
    fromYear: null,
    fromMonth: 1,
    costOfLivingPct: 100,
    kind: 'domestic',
    stateOfResidence: inputs.stateOfResidence,
    stateTaxState: inputs.stateTaxState,
    stateTaxFlatRate: inputs.stateTaxFlatRate,
    stateTaxSocialSecurityTaxable: inputs.stateTaxSocialSecurityTaxable,
    stateTaxPensionTaxable: inputs.stateTaxPensionTaxable,
    nycResident: inputs.nycResident,
    yonkersResident: inputs.yonkersResident,
    foreign: null,
  };
}

function residenceAt(timeline, planWide, year) {
  let current = planWide;
  for (const e of timeline) {
    if (e.fromYear > year) break;
    current = e;
  }
  return current;
}

// Where the household lives in a given calendar year. Pass
// already-sanitized inputs.
export function residenceForYear(inputs, year) {
  const planWide = planWideResidence(inputs);
  return residenceAt(readResidencyTimeline(inputs.residencyTimeline, planWide), planWide, year);
}

// Progressive tax on `income` over [{ upTo, rate }] bands (rate in %; the
// last band's upTo is null = no ceiling), each threshold scaled by `scale`.
export function progressiveTax(income, brackets, scale = 1) {
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upTo === null ? Infinity : b.upTo * scale;
    if (income <= lower) break;
    tax += (Math.min(income, upper) - lower) * (b.rate / 100);
    lower = upper;
  }
  return tax;
}

// The capital-gains rate differential adjustment's reference rate: the top
// ordinary rate a preferential-rate gain is scaled against in the s 904
// limitation (s 904(b)(2)(B)).
const FTC_TOP_ORDINARY_RATE = 0.37;

// One year's foreign layer. Pure, so the withdrawal solver can price it
// against every candidate draw.
//
// ctx (fixed for the year, US dollars):
//   f              -- readForeignTerms() output
//   inflFactor     -- the plan's tax-bracket inflation to this year
//                     (scales local brackets and the contribution cap)
//   fxFactor       -- local currency per USD this year
//   wages          -- earned income (foreign-source: creditable anyway)
//   pension, iraBase (RMDs, Pre-Tax milestones, NUA, taxable conversions),
//   rentalAnnuity, ssGross, dividends (all of them, US dollars)
//   ordinaryDividends -- the non-qualified share of `dividends`, which the
//                     US taxes as ordinary income (passive basket room)
//   rothStart      -- Roth balance at the start of the year
//   dividendYield  -- fraction; drives the look-through Roth dividends
//   cf             -- { general, passive } unexpired credit carryforward
// d (depends on the draw):
//   preTaxOrdinary, realizedGains, rothDraw, rothEarnings,
//   usRegularTax   -- US income tax BEFORE NIIT and the 10% penalty
//   usOrdinaryIncome, usCapGains, usCapGainsTax (regular, no NIIT)
//
// The s 904 limitation is the pro-rata one: US regular tax times the
// basket's share of US income, with preferential-rate gains scaled down by
// the rate differential. US-source income is foreign-source only where the
// treaty re-sources it (treatyResourcing); wages earned abroad always are.
// Two baskets -- passive (dividends, gains) and general (pensions, IRA
// distributions, wages) -- because an excess in one can never shelter the
// other. Tax on Social Security, US rent, the Roth, and local
// contributions is never creditable here.
export function priceForeignYear(ctx, d) {
  const f = ctx.f;
  const adults = Math.max(1, ctx.adults || 1);
  // The share of a split move year lived there (changelog 203): every
  // income layer, contribution and balance tax is prorated by it.
  const share = ctx.yearShare === undefined ? 1 : ctx.yearShare;
  const retirementAll = (f.taxesRetirementIncome
    ? ctx.pension + (f.retirementAccountTaxedPct < 100 ? (ctx.iraBase + d.preTaxOrdinary) * (f.retirementAccountTaxedPct / 100) : ctx.iraBase + d.preTaxOrdinary)
    : 0) * share;
  const ssAll = (f.taxesSocialSecurity ? ctx.ssGross * (f.socialSecurityTaxableShare / 100) : 0) * share;
  const gainsTaxed = f.capitalGainsTaxedPct < 100 ? d.realizedGains * (f.capitalGainsTaxedPct / 100) : d.realizedGains;
  // One pool of investment income, unless the country taxes capital gains
  // on a scale of their own (changelog 213) -- then dividends and gains are
  // two pools with an allowance each.
  const gainsSeparate = f.capitalGainsRate !== null;
  const dividendGross = f.taxesInvestmentIncome ? Math.max(0, ctx.dividends) * share : 0;
  const gainsGross = f.taxesInvestmentIncome ? Math.max(0, gainsTaxed) * share : 0;
  const investmentGross = gainsSeparate ? dividendGross : (f.taxesInvestmentIncome ? Math.max(0, ctx.dividends + gainsTaxed) * share : 0);
  const investmentAll = Math.max(0, investmentGross - (f.investmentAllowance * adults / ctx.fxFactor));
  const gainsAll = gainsSeparate ? Math.max(0, gainsGross - (f.capitalGainsAllowance * adults / ctx.fxFactor)) : 0;
  const rothEarningsAll = (f.roth === 'earnings' ? Math.max(0, d.rothEarnings) : 0) * share;
  const lookThroughAll = (f.roth === 'taxableAccount'
    ? Math.max(0, ctx.rothStart) * ctx.dividendYield + Math.max(0, d.rothEarnings)
    : 0) * share;
  const rothDrawAll = (f.roth === 'rate' ? Math.max(0, d.rothDraw) : 0) * share;
  // A remittance-basis country taxes only the foreign income brought in
  // (changelog 200): every foreign layer is scaled by the same share.
  let remitted = 1;
  if (f.remittance) {
    const foreignIncome = retirementAll + ssAll + ctx.rentalAnnuity * share + investmentAll + gainsAll + rothEarningsAll + lookThroughAll + rothDrawAll;
    const brought = Math.max(0, ctx.spendingThere || 0) * (f.remittance.share / 100);
    remitted = foreignIncome > 0 ? Math.min(1, brought / foreignIncome) : 1;
  }
  const retirement = retirementAll * remitted;
  const ss = ssAll * remitted;
  const rental = ctx.rentalAnnuity * share * remitted;
  const investment = investmentAll * remitted;
  const gains = gainsAll * remitted;
  const rothEarnings = rothEarningsAll * remitted;
  const lookThrough = lookThroughAll * remitted;
  const rothDrawTaxed = rothDrawAll * remitted;
  const ordinaryLocal = Math.max(0, ctx.wages + retirement + ss + rental);
  // A special regime, while it lasts (changelog 199).
  const regime = f.regime && (ctx.yearsSinceMove ?? 0) < f.regime.years
    && !(f.regime.untilYear && ctx.year > f.regime.untilYear) ? f.regime : null;
  // The US regular tax on some US income, pro rata -- what a country that
  // credits US tax takes off its own, capped by localCreditCapPct.
  const usIncomeAll = Math.max(0, d.usOrdinaryIncome) + Math.max(0, d.usCapGains);
  const usTaxOn = (usAmount) => (usIncomeAll > 0
    ? Math.max(0, d.usRegularTax) * Math.min(1, Math.max(0, usAmount) / usIncomeAll) * (f.localCreditCapPct / 100)
    : 0);

  // Local tax on a layer of income in US dollars. Brackets are in local
  // currency and move with the plan's bracket inflation; an equal-split
  // country taxes each adult on their share.
  const pensionRelief = Math.min(retirement + ss, (f.pensionDeduction * ctx.inflFactor / ctx.fxFactor) * adults);
  const onBrackets = (usd, table) => {
    const n = f.splitIncome ? adults : 1;
    return n * progressiveTax((Math.max(0, usd) / n) * ctx.fxFactor, table, ctx.inflFactor) / ctx.fxFactor;
  };
  const scaleTax = (usd) => {
    const taxable = Math.max(0, usd - pensionRelief);
    if (f.taxMode !== 'brackets') return taxable * (f.ordinaryRate / 100);
    return onBrackets(taxable, f.brackets);
  };
  // Stacked: the investment bands start where your other income left off,
  // which is how the UK taxes dividends and gains (changelog 213).
  const investScale = f.investmentStacked
    ? (usd) => {
      const n = f.splitIncome ? adults : 1;
      const base = Math.max(0, ordinaryLocal) / n;
      return n * (progressiveTax((base + Math.max(0, usd) / n) * ctx.fxFactor, f.investmentBrackets, ctx.inflFactor)
        - progressiveTax(base * ctx.fxFactor, f.investmentBrackets, ctx.inflFactor)) / ctx.fxFactor;
    }
    : (usd) => onBrackets(usd, f.investmentBrackets);

  let localOrdinaryTaxGross;
  let localInvestmentTax;
  let rothTax = 0;
  let ssLocalCredit = 0;
  let investmentLocalCredit = 0;
  let retirementLocalCredit = 0;
  let generalCreditable;
  let passiveCreditable;
  const creditableOrdinaryIncome = ctx.wages + (f.treatyResourcing ? retirement : 0)
    + (f.treatyResourcing && f.treatyResourcesSocialSecurity ? ss : 0);

  if (regime) {
    // Wages earned there are local income: the ordinary scale, always.
    const onWages = ctx.wages > 0 ? scaleTax(ctx.wages) : 0;
    const foreignIncome = retirement + ss + rental;
    if (regime.kind === 'flatRate') {
      const r = regime.rate / 100;
      localOrdinaryTaxGross = onWages + foreignIncome * r;
      // A regime rate covers gains too, whatever scale they are on normally.
      localInvestmentTax = (investment + gains) * r;
      const rothBase = f.roth === 'rate' ? rothDrawTaxed
        : f.roth === 'earnings' ? rothEarnings
          : f.roth === 'taxableAccount' ? lookThrough : 0;
      rothTax = rothBase * r;
      const resourced = regime.creditable && f.treatyResourcing;
      generalCreditable = onWages + (resourced ? (retirement + (f.treatyResourcesSocialSecurity ? ss : 0)) * r : 0);
      passiveCreditable = resourced ? localInvestmentTax : 0;
    } else {
      const lump = (regime.amount + regime.amountPerExtraAdult * (adults - 1)) * share / ctx.fxFactor;
      localOrdinaryTaxGross = onWages + lump;
      localInvestmentTax = 0;
      generalCreditable = onWages + (regime.creditable && f.treatyResourcing ? lump : 0);
      passiveCreditable = 0;
    }
  } else {
    // Layered in a fixed order -- ordinary, then investment (when it is on
    // the ordinary scale), then Roth earnings -- so each layer's tax is its
    // own.
    localOrdinaryTaxGross = scaleTax(ordinaryLocal);
    const investOnScale = f.investmentMode === 'ordinary' ? investment : 0;
    const withInvestment = investOnScale > 0 ? scaleTax(ordinaryLocal + investOnScale) : localOrdinaryTaxGross;
    // On the dividends the country actually reaches this year: the split-
    // year share and the remitted share, like every other layer (changelog
    // 405; it used to charge the whole year's dividends for a December move).
    const surtax = f.taxesInvestmentIncome ? dividendGross * remitted * (f.dividendSurtax / 100) : 0;
    localInvestmentTax = (f.investmentMode === 'ordinary'
      ? withInvestment - localOrdinaryTaxGross
      : f.investmentMode === 'brackets'
        ? investScale(investment)
        : investment * (f.investmentRate / 100)) + surtax
      + (gainsSeparate ? gains * (f.capitalGainsRate / 100) : 0);

    if (f.roth === 'rate') rothTax = rothDrawTaxed * (f.rothRate / 100);
    else if (f.roth === 'taxableAccount') {
      // On the local scale where the country taxes investment income there.
      rothTax = f.investmentMode === 'ordinary'
        ? scaleTax(ordinaryLocal + investOnScale + lookThrough) - withInvestment
        : f.investmentMode === 'brackets'
          ? investScale(investment + lookThrough) - investScale(investment)
          : lookThrough * (f.investmentRate / 100);
    } else if (rothEarnings > 0) {
      if (f.rothEarningsOn === 'investment') {
        rothTax = f.investmentMode === 'brackets'
          ? investScale(investment + rothEarnings) - investScale(investment)
          : rothEarnings * (f.investmentRate / 100);
      } else {
        rothTax = scaleTax(ordinaryLocal + investOnScale + rothEarnings) - withInvestment;
      }
    }

    // What the credit can reach. The tax on Social Security is excluded pro
    // rata (unless the treaty re-sources it): gross local tax times the
    // creditable share of local income.
    generalCreditable = ordinaryLocal > 0 ? localOrdinaryTaxGross * Math.min(1, creditableOrdinaryIncome / ordinaryLocal) : 0;
    passiveCreditable = f.treatyResourcing ? localInvestmentTax : 0;
  }
  // The country's own credit for US tax on the same income, item by item
  // and capped at its own tax on that item: Social Security (Portugal),
  // pensions and IRA withdrawals (Greece), investment income (Uruguay,
  // Greece). Not under a lump sum, which is a fixed charge. The US figures
  // are prorated the same way the local ones are.
  if (!(regime && regime.kind === 'lumpSum')) {
    const r = regime ? regime.rate / 100 : null;
    const localShareOf = (amount) => (r !== null
      ? amount * r
      : (ordinaryLocal > 0 ? localOrdinaryTaxGross * (amount / ordinaryLocal) : 0));
    const usScale = share * remitted;
    if (f.creditsUsTaxOnSocialSecurity && ss > 0) {
      ssLocalCredit = Math.min(localShareOf(ss), usTaxOn((d.usTaxableSS || 0) * usScale));
    }
    if (f.creditsUsTaxOnRetirementIncome && retirement > 0) {
      retirementLocalCredit = Math.min(localShareOf(retirement), usTaxOn((ctx.pension + ctx.iraBase + d.preTaxOrdinary) * usScale));
    }
    if (f.creditsUsTaxOnInvestmentIncome && localInvestmentTax > 0) {
      investmentLocalCredit = Math.min(localInvestmentTax, usTaxOn(Math.max(0, ctx.dividends + d.realizedGains) * usScale));
      localInvestmentTax -= investmentLocalCredit;
    }
  }
  const localOrdinaryTax = localOrdinaryTaxGross - ssLocalCredit - retirementLocalCredit;
  // The US credit can only reach tax actually left after the country's own.
  passiveCreditable = Math.min(passiveCreditable, localInvestmentTax);
  generalCreditable = Math.min(generalCreditable, Math.max(0, localOrdinaryTax));

  const contributionBase = f.contributionBase === 'declared'
    ? f.declaredIncome * ctx.inflFactor * share
    // 'investment' reaches dividends and gains whether or not the income
    // tax does (France's social levies on a US citizen's credited income).
    : f.contributionBase === 'investment' ? Math.max(0, ctx.dividends + d.realizedGains) * share : ordinaryLocal + investment;
  const cap = f.contributionCap > 0 ? f.contributionCap * ctx.inflFactor : Infinity;
  const contributions = Math.min(contributionBase, cap) * (f.contributionRate / 100);

  // A yearly tax on balances, per adult, thresholds fixed in local currency.
  let wealthTax = 0;
  if (f.wealthTax && !(regime && regime.exemptsWealthTax)) {
    const a = f.wealthTax.accounts;
    const balances = (a.taxable ? Math.max(0, ctx.taxableStart || 0) : 0)
      + (a.roth ? Math.max(0, ctx.rothStart || 0) : 0)
      + (a.preTax ? Math.max(0, ctx.preTaxStart || 0) : 0);
    wealthTax = adults * progressiveTax((balances / adults) * ctx.fxFactor, f.wealthTax.brackets, 1) / ctx.fxFactor * share;
  }

  // The s 904 limitation, per basket.
  const capGains = Math.max(0, d.usCapGains);
  const adj = capGains > 0 ? Math.min(1, (Math.max(0, d.usCapGainsTax) / capGains) / FTC_TOP_ORDINARY_RATE) : 0;
  const denom = Math.max(0, d.usOrdinaryIncome) + capGains * adj;
  const usRegular = Math.max(0, d.usRegularTax);
  // US-source income is foreign-source only while the household is a
  // treaty resident there (the split-year share) and, under a remittance
  // regime, only to the extent remitted -- the same scaling the local tax
  // and the country's own credits use (changelog 405; before this a
  // December move re-sourced the whole year's pension and gains and let
  // one month's foreign tax wipe out eleven months of US tax). Wages
  // earned there are foreign-source in full.
  const resourceScale = share * remitted;
  const generalNum = ctx.wages + (f.treatyResourcing ? (ctx.pension + ctx.iraBase + d.preTaxOrdinary) * resourceScale : 0)
    + (f.treatyResourcing && f.treatyResourcesSocialSecurity && f.taxesSocialSecurity ? Math.max(0, d.usTaxableSS || 0) * resourceScale : 0);
  // Changelog 365: dividends the US taxes at ordinary rates (the
  // non-qualified share, inside usOrdinaryIncome) are passive income too;
  // the room used to count only the preferential-rate dividends and gains,
  // which understated the passive limit for a re-sourcing treaty.
  // Only where the country taxes investment income at all (changelog 405):
  // a passive carryforward must not shelter US tax on gains the country
  // exempts, the way the general basket already tests taxesSocialSecurity.
  const passiveOrdinary = Math.min(Math.max(0, ctx.ordinaryDividends || 0), Math.max(0, d.usOrdinaryIncome));
  const passiveNum = f.treatyResourcing && f.taxesInvestmentIncome
    ? (capGains * adj * (f.capitalGainsTaxedPct < 100 ? f.capitalGainsTaxedPct / 100 : 1) + passiveOrdinary) * resourceScale
    : 0;
  const limitGeneral = denom > 0 ? usRegular * Math.min(1, generalNum / denom) : 0;
  const limitPassive = denom > 0 ? usRegular * Math.min(1, passiveNum / denom) : 0;

  const creditGeneral = Math.min(generalCreditable + (ctx.cf?.general || 0), limitGeneral);
  const creditPassive = Math.min(passiveCreditable + (ctx.cf?.passive || 0), limitPassive);
  const credit = creditGeneral + creditPassive;
  const gross = localOrdinaryTax + localInvestmentTax + rothTax + contributions + wealthTax;
  return {
    localTax: localOrdinaryTax + localInvestmentTax,
    rothTax,
    contributions,
    wealthTax,
    ssLocalCredit,
    investmentLocalCredit,
    retirementLocalCredit,
    remittedShare: remitted,
    regimeActive: !!regime,
    gross,
    creditable: { general: generalCreditable, passive: passiveCreditable },
    credit: { general: creditGeneral, passive: creditPassive },
    creditTotal: credit,
    net: gross - credit,
  };
}

// Foreign tax credit carryforward (s 904(c)): unused credit carries 10
// years forward, basket by basket, oldest used first. (The one-year
// carryback is not modeled -- it would reprice a year already closed.)
export const FTC_CARRYFORWARD_YEARS = 10;

export function ftcCarryforwardAvailable(pools, year) {
  const sum = (arr) => arr.filter((v) => year - v.year <= FTC_CARRYFORWARD_YEARS).reduce((t, v) => t + v.amount, 0);
  return { general: sum(pools.general), passive: sum(pools.passive) };
}

// After the year settles: consume this year's creditable tax first, then
// the oldest carryforward, and bank what is left of this year's.
export function settleFtcCarryforward(pools, year, priced) {
  const next = {};
  for (const b of ['general', 'passive']) {
    const live = pools[b].filter((v) => year - v.year <= FTC_CARRYFORWARD_YEARS).map((v) => ({ ...v }));
    const current = priced.creditable[b];
    const used = priced.credit[b];
    let fromCf = Math.max(0, used - current);
    for (const v of live) {
      if (fromCf <= 0) break;
      const take = Math.min(v.amount, fromCf);
      v.amount -= take;
      fromCf -= take;
    }
    const kept = live.filter((v) => v.amount > 0.005);
    const unusedCurrent = Math.max(0, current - used);
    if (unusedCurrent > 0.005) kept.push({ year, amount: unusedCurrent });
    next[b] = kept;
  }
  return next;
}

// The last calendar year of the projection -- the year the last survivor
// reaches life expectancy. Identical to runProjection's horizonYear.
export function planHorizonYear(inputs) {
  const age1Init = inputs.planYear - inputs.birthYear1;
  const age2Init = inputs.planYear - inputs.birthYear2;
  return inputs.planYear + Math.max(
    inputs.lifeExpectancy1 - age1Init,
    inputs.spouse2Enabled ? (inputs.lifeExpectancy2 - age2Init) : 0,
  );
}

// Federal tax bracket structures — tax year 2026 (IRS Rev. Proc. 2025-32)
export const BRACKETS_MFJ = [
  { limit: 24800, rate: 0.10 },
  { limit: 100800, rate: 0.12 },
  { limit: 211400, rate: 0.22 },
  { limit: 403550, rate: 0.24 },
  { limit: 512450, rate: 0.32 },
  { limit: 768700, rate: 0.35 },
  { limit: Infinity, rate: 0.37 }
];

// Married Filing Separately. Every federal figure below is EXACTLY half the
// MFJ one -- that is how the statute is written, not an approximation, and
// it is why MFS matches Single at every threshold except the top: MFJ's 35%
// band ends at $768,700, so MFS's ends at $384,350 while Single's runs to
// $640,600. Someone filing separately therefore reaches 37% at a little
// over half the income a single filer does.
//
// All values verified against Rev. Proc. 2025-32 (the IRS's own 2026
// inflation-adjustment document) rather than derived, precisely because
// "MFS is just Single" is the intuitive assumption and it is wrong.
export const BRACKETS_MFS = [
  { limit: 12400, rate: 0.10 },
  { limit: 50400, rate: 0.12 },
  { limit: 105700, rate: 0.22 },
  { limit: 201775, rate: 0.24 },
  { limit: 256225, rate: 0.32 },
  { limit: 384350, rate: 0.35 },
  { limit: Infinity, rate: 0.37 }
];

export const BRACKETS_SINGLE = [
  { limit: 12400, rate: 0.10 },
  { limit: 50400, rate: 0.12 },
  { limit: 105700, rate: 0.22 },
  { limit: 201775, rate: 0.24 },
  { limit: 256225, rate: 0.32 },
  { limit: 640600, rate: 0.35 },
  { limit: Infinity, rate: 0.37 }
];

// Pre-TCJA-sunset rate schedule (see the tcjaSunsetEnabled comment in
// DEFAULT_INPUTS for the full explanation and its documented limitations).
// Reuses BRACKETS_MFJ/SINGLE's own bracket WIDTHS with the pre-TCJA RATES
// (10/15/25/28/33/35/39.6%) substituted in, rather than reconstructing the
// old law's own differently-sized brackets.
const PRETCJA_RATES = [0.10, 0.15, 0.25, 0.28, 0.33, 0.35, 0.396];
export const BRACKETS_MFJ_PRETCJA = BRACKETS_MFJ.map((b, i) => ({ limit: b.limit, rate: PRETCJA_RATES[i] }));
export const BRACKETS_SINGLE_PRETCJA = BRACKETS_SINGLE.map((b, i) => ({ limit: b.limit, rate: PRETCJA_RATES[i] }));
export const BRACKETS_MFS_PRETCJA = BRACKETS_MFS.map((b, i) => ({ limit: b.limit, rate: PRETCJA_RATES[i] }));

// One place that answers "which table applies to this filing status".
//
// Before MFS existed every site did its own `status === 'MFJ' ? a : b`,
// which silently made MFS behave as Single the moment the status was
// offered -- right for most thresholds and wrong for the two that matter
// most (the top bracket and the AMT exemption). Routing every lookup
// through these makes adding a status a change in one place instead of
// fifteen, and makes "did we miss a site?" a question a test can answer.
export function bracketsFor(status, preTcja = false) {
  if (preTcja) {
    if (status === 'MFJ') return BRACKETS_MFJ_PRETCJA;
    if (status === 'MFS') return BRACKETS_MFS_PRETCJA;
    return BRACKETS_SINGLE_PRETCJA;
  }
  if (status === 'MFJ') return BRACKETS_MFJ;
  if (status === 'MFS') return BRACKETS_MFS;
  return BRACKETS_SINGLE;
}

// Married filing separately is a single person's return, so anything that
// counts people -- household size for the poverty level, the number of
// estate exemptions, a second spouse's pension exclusion -- treats MFS the
// same as Single. Those sites are left as `MFJ ? x : y` on purpose; this
// note is here so the omission reads as deliberate rather than missed.
export function isJointReturn(status) {
  return status === 'MFJ';
}


// Alternative Minimum Tax — tax year 2026 (post-OBBBA figures). Source:
// IRS Rev. Proc. 2025-32 AMT exemption/phase-out amounts.
// A SIMPLIFIED AMT model. AMTI is the regular taxable income plus the
// deductions the AMT does not allow: the standard deduction, or for a year
// that itemizes (changelog 417) the state and local tax line (s 56(b)(1));
// mortgage interest, charitable gifts and medical costs over the floor are
// allowed under both systems and stay deducted. The senior deduction is
// added back. Not modeled: incentive stock option exercise spreads and
// private activity bond interest, the other two common preference items.
// Capital gains are taxed identically under AMT and regular tax (same
// preferential rates), so they're deliberately left out of both sides of
// the AMT-vs-regular-tax comparison below rather than double counted.
//
// For a standard-deduction filer the add-back is never large enough on its
// own to make the tentative minimum tax exceed regular tax, at any income
// (checked from $90k through $10M+ of AMTI), which is historically
// accurate: post-2017, AMT is rare for taxpayers who neither itemize heavily
// nor exercise ISOs. An itemizer with a large SALT line can still owe it,
// which is why the machinery is here. Until changelog 433 an itemizer's
// AMTI was the income before ANY deduction, so gifts and mortgage interest
// the regular tax had subtracted were compared against a tentative tax that
// had not, and a phantom AMT of $8k-$23k appeared for the households that
// itemize.
export const AMT_EXEMPTION_MFJ_2026 = 140200;
export const AMT_EXEMPTION_SINGLE_2026 = 90100;
// Not 90100 -- MFS is half of MFJ here, which is LOWER than Single.
export const AMT_EXEMPTION_MFS_2026 = 70100;
export const AMT_PHASEOUT_MFJ_2026 = 1000000;
export const AMT_PHASEOUT_SINGLE_2026 = 500000;
export const AMT_PHASEOUT_MFS_2026 = 500000;
export const AMT_RATE_BREAKPOINT_2026 = 244500; // same dollar figure for MFJ and Single
export const AMT_RATE_BREAKPOINT_MFS_2026 = 122250; // half of joint (Rev. Proc. 2025-32 s.03; audit Q-12)
export const AMT_PHASEOUT_RATE = 0.5; // OBBBA raised this from 0.25

// Returns the AMT "tentative minimum tax" on the given AMTI approximation.
// Callers compare this against the regular ordinary-income tax and charge
// the excess, if any — see the amtTax calculation in runProjection.
// --- Married filing separately: two returns, not one -------------------
//
// Audit Q-1 (changelog 127). A household that files separately files TWO
// returns, and the engine only ever had one household income figure. It
// used to put the whole of it on a single return and apply the halved MFS
// brackets, which is the arithmetic of a couple where one spouse earns
// everything and the other files a zero return -- the worst case, and about
// twice the real bill for a couple whose incomes are anywhere near equal.
// (MFS brackets are exactly half of MFJ below the top, so taxing the
// combined income on them is the same as taxing DOUBLE that income jointly.)
//
// The fix is to split the household figure across the two returns and add
// the results. mfsIncomeSplitPct says how: 50 means an even split, which is
// the planning default and makes MFS land where MFJ does apart from the
// rules that genuinely differ; 100 restores the old single-return
// behavior, which is right for a one-earner couple. Everything already
// modeled as MFS-specific -- the AMT exemption, the $125,000 NIIT and
// Additional Medicare thresholds, the $1,500 capital-loss limit, the lost
// senior bonus, the Roth phase-out -- keeps biting, because those are the
// real cost of filing separately and are exactly what a user turns MFS on
// to see.
export const MFS_DEFAULT_INCOME_SPLIT_PCT = 50;

// A plan with no second spouse enabled is one person, so there is only one
// return to file however the status reads -- the whole income stays on it.
// This is what keeps a single-person MFS plan (someone modeling their own
// half of a separate-filing couple) behaving exactly as it always has.
export function effectiveMfsSplitPct(inputs) {
  if (!inputs || !inputs.spouse2Enabled) return 100;
  const v = inputs.mfsIncomeSplitPct;
  return v === undefined || v === null ? MFS_DEFAULT_INCOME_SPLIT_PCT : v;
}

// The larger of the two MFS returns' shares of every household figure
// (1 when there is one return). A per-return line -- a bracket ceiling, an
// IRMAA tier -- is crossed by the larger return first, so the HOUSEHOLD
// figure can reach line / largerShare before either return crosses it.
export function mfsLargerShare(inputs, status) {
  if (status !== 'MFS' || !inputs || !inputs.spouse2Enabled) return 1;
  const pct = effectiveMfsSplitPct(inputs);
  const share = Math.max(pct, 100 - pct) / 100;
  return share > 0 && share <= 1 ? share : 1;
}

// The last argument the federal helpers take is a "split": the income-split
// percentage (a number; every figure divides between the two returns in
// that proportion), or, for two MFS returns that each carry their OWN
// standard deduction, an object { pct, ordinary, deductions: [d1, d2] }.
// `ordinary` is the household's ordinary income BEFORE the deduction, so
// each return's taxable income can be floored at zero on its own: a 20%
// return whose share of the income is under its deduction wastes the rest
// of it, which dividing the summed deduction in the income proportion
// hid (the "approximation otherwise" that Rule 1.1 carried until
// changelog 407). The projection builds these with mfsSplitSpec.
export function mfsSplitSpec(inputs, ordinaryBeforeDeduction, deductions) {
  const pct = effectiveMfsSplitPct(inputs);
  if (!Array.isArray(deductions) || deductions.length !== 2 || !inputs || !inputs.spouse2Enabled || !(pct > 0 && pct < 100)) return pct;
  return { pct, ordinary: Math.max(0, ordinaryBeforeDeduction || 0), deductions };
}
// The deduction of the return with the larger share (Spouse 1's when the
// split is 50 or more), for the per-return lines that return crosses first.
export function mfsLargerReturnDeduction(pct, deductions) {
  return pct >= 50 ? deductions[0] : deductions[1];
}
const isReturnSpec = (split) => split !== null && typeof split === 'object' && Array.isArray(split.deductions);
const splitPctOf = (split) => (isReturnSpec(split) ? split.pct : split);
// The two returns of a spec: each one's share of every household figure,
// its own deduction, its taxable ordinary income and the deduction left
// unused (what shelters gains, as in capGainsTaxForOneReturn).
export function mfsReturnsOf(split) {
  const share = Math.min(1, Math.max(0, split.pct / 100));
  const other = Math.min(1, Math.max(0, (100 - split.pct) / 100));
  return [[share, split.deductions[0]], [other, split.deductions[1]]].map(([s, d]) => ({
    share: s,
    deduction: d,
    taxable: Math.max(0, s * split.ordinary - d),
    unusedDeduction: Math.max(0, d - s * split.ordinary),
  }));
}

// Runs `fn` once per return for MFS and once for everyone else. `parts` is
// the list of amounts to divide between the two returns in the same
// proportion (ordinary income, gains, deductions all move together). A
// return spec (above) is read for its percentage here; the helpers that
// need the per-return deductions handle it themselves.
export function forEachSeparateReturn(status, parts, splitPct, fn) {
  if (status !== 'MFS') return fn(parts, 1);
  const pct = splitPctOf(splitPct);
  const raw = pct === undefined || pct === null ? MFS_DEFAULT_INCOME_SPLIT_PCT : pct;
  const share = Math.min(1, Math.max(0, raw / 100));
  const other = 1 - share;
  if (other <= 0) return fn(parts, 1);
  return fn(parts.map((v) => v * share), share) + fn(parts.map((v) => v * other), other);
}

export function calculateAMT(amti, status, inflationFactor = 1, mfsSplitPct = MFS_DEFAULT_INCOME_SPLIT_PCT) {
  return forEachSeparateReturn(status, [amti], mfsSplitPct, ([a]) => amtForOneReturn(a, status, inflationFactor));
}

function amtForOneReturn(amti, status, inflationFactor = 1) {
  if (amti <= 0) return 0;
  // MFS's AMT exemption is LOWER than Single's ($70,100 vs $90,100),
  // because it is half of MFJ. Falling through to the Single value would
  // understate AMT for exactly the filers most likely to hit it.
  const exemption = (status === 'MFJ' ? AMT_EXEMPTION_MFJ_2026 : status === 'MFS' ? AMT_EXEMPTION_MFS_2026 : AMT_EXEMPTION_SINGLE_2026) * inflationFactor;
  const phaseoutThreshold = (status === 'MFJ' ? AMT_PHASEOUT_MFJ_2026 : status === 'MFS' ? AMT_PHASEOUT_MFS_2026 : AMT_PHASEOUT_SINGLE_2026) * inflationFactor;
  const breakpoint = (status === 'MFS' ? AMT_RATE_BREAKPOINT_MFS_2026 : AMT_RATE_BREAKPOINT_2026) * inflationFactor;

  let effectiveExemption = exemption;
  if (amti > phaseoutThreshold) {
    effectiveExemption = Math.max(0, exemption - AMT_PHASEOUT_RATE * (amti - phaseoutThreshold));
  }

  const amtBase = Math.max(0, amti - effectiveExemption);
  if (amtBase <= breakpoint) {
    return amtBase * 0.26;
  }
  return breakpoint * 0.26 + (amtBase - breakpoint) * 0.28;
}

// Shared progressive-bracket-filling helper, used by both the Dashboard's
// tax bracket visualization and the Tax & Estate tab's bracket chart. This
// used to be copy-pasted independently in App.jsx and TaxEstateTab.jsx with
// its own hardcoded bracket literals — a single source of truth here means
// the two charts can no longer drift out of sync with each other or with
// calculateTaxes() below.
export function getBracketFilling(taxableIncome, status, inflationFactor = 1) {
  const brackets = bracketsFor(status);

  let prevLimit = 0;
  return brackets.map(b => {
    const currentLimit = b.limit === Infinity ? Infinity : b.limit * inflationFactor;
    const ratePercent = `${(b.rate * 100).toFixed(0)}%`;
    const capacity = currentLimit === Infinity ? Infinity : currentLimit - prevLimit;

    // Calculate how much of our taxableIncome falls in this bracket
    let filled = 0;
    if (taxableIncome > prevLimit) {
      filled = Math.min(capacity, taxableIncome - prevLimit);
    }

    const tax = filled * b.rate;
    const percent = capacity === Infinity ? (filled > 0 ? 100 : 0) : (filled / capacity) * 100;

    const rangeText = currentLimit === Infinity
      ? `$${Math.round(prevLimit).toLocaleString()}+`
      : `$${Math.round(prevLimit).toLocaleString()} to $${Math.round(currentLimit).toLocaleString()}`;

    const res = {
      rate: ratePercent,
      rateVal: b.rate,
      rangeText,
      filled,
      capacity,
      percent,
      tax
    };

    prevLimit = currentLimit;
    return res;
  });
}

// Progressive California Brackets (estimated 2026)
// Yonkers levies a resident income tax as a SURCHARGE ON NEW YORK STATE TAX,
// not as its own bracket schedule: 16.75% of the state liability. Verified
// 2026-08-20 against NY Publication NYS-50-T-Y (1/26), which instructs
// "Multiply the result by 16.75% (0.1675)".
//
// That structure is why this is cheap to model and was worth doing: the
// figure it multiplies is one the app already computes exactly. Before this,
// a Yonkers resident's total tax was understated by a flat sixth.
//
// NYC is deliberately NOT modeled here. It has its own bracket schedule
// rather than a multiplier, and its current combined rates could not be
// confirmed from a first-party document. See KNOWN_ISSUES.md.
export const YONKERS_RESIDENT_SURCHARGE = 0.1675;

// California's additional tax on early distributions, on top of the federal
// 10%. Verified 2026-08-20 against FTB Form 3805P instructions: "the portion
// of the early distribution that is included in income is subject to an
// additional 2 1/2% tax", and "California and federal laws are generally the
// same for the tax on early distributions except for the rate of tax
// assessed."
//
// This matters disproportionately for this app's audience: the whole point
// of modeling a Roth conversion ladder or a 72(t) is deciding how to reach
// money before 59 1/2, and a Californian doing it pays 12.5% in penalties,
// not 10%.
//
// CAVEAT worth knowing: California does not conform to every federal
// exception to the penalty. This app applies a single blanket age test for
// both, matching how it already treats the federal 10% -- so a distribution
// that qualifies for an exception (72(t) substantially-equal payments,
// separation from service at 55+, disability) is over-penalized at both
// levels equally. That is a pre-existing simplification, not one introduced
// here, but it is the reason the state figure inherits the same shape.
export const CA_EARLY_DISTRIBUTION_TAX_RATE = 0.025;

// Returns the STATE-level additional tax on an early distribution. Zero for
// every state but California today.
export function stateEarlyDistributionTax(stateType, earlyDistributionAmount, age) {
  if (stateType !== 'ca') return 0;
  if (!(age < 59.5)) return 0;
  return Math.max(0, earlyDistributionAmount || 0) * CA_EARLY_DISTRIBUTION_TAX_RATE;
}

// California brackets, tax year 2025 -- the most recent FTB has published.
//
// Verified 2026-08-20 against the FTB's own rate schedules PDF
// (ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf), Schedule X
// ("Single or Married/RDP Filing Separately") and Schedule Y ("Married/RDP
// Filing Jointly or Qualifying Surviving Spouse/RDP").
//
// WHY 2025 AND NOT 2026: California indexes these to the California CPI
// every year, but FTB does not publish the new table until LATE DECEMBER.
// There is no 2026 schedule yet -- the URL 404s -- and FTB's own 2026 Form
// 540-ES instructs taxpayers to "figure your tax on the amount on line 3
// using the 2025 tax table". Using 2025 is what the state itself does right
// now. Refresh in January; see TAX_UPDATE_PROCESS.md.
//
// These REPLACE a table that was roughly 2023 vintage AND partially
// corrupted -- several thresholds matched no published year at all
// ($54,000 where 2023 was $54,081, $697,271 where 2023 was $698,271,
// $108,000 where 2023 was $108,162). Not one of the eighteen values matched
// 2025. Because California indexes annually and the table never moved, the
// error compounded every year and always in the same direction: stale
// thresholds push income into higher brackets sooner, so the app
// consistently OVERSTATED California tax. A single filer with $80,000 of CA
// taxable income was charged about $217/yr too much, and that gap widens
// with every year the table is not refreshed.
// Changelog 430: the 2025 figures are a VINTAGE, not a freeze. California
// indexes every one of them (brackets, standard deduction, exemption
// credit and its phase-out) to the California CPI each year, so a plan
// carries them forward from 2025 by the Tax Bracket Inflation Rate --
// (1 + r) to reach 2026, then the plan's own indexing factor from there --
// exactly as the federal figures carry forward from their 2026 vintage
// (changelog 419). Until 430 every year of a plan used the 2025 figures
// unindexed, so California tax was overstated more with every year. When
// FTB publishes the 2026 schedule (late December), replace the table and
// set CA_VINTAGE_YEAR to 2026.
export const CA_VINTAGE_YEAR = 2025;
export function californiaIndexFactor(extras = {}) {
  const base = Number(extras.inflationFactor) || 1;
  const rate = Number(extras.taxBracketInflationRate) || 0;
  return base * Math.pow(1 + rate / 100, TAX_YEAR - CA_VINTAGE_YEAR);
}
const BRACKETS_CA_SINGLE = [
  { limit: 11079, rate: 0.01 },
  { limit: 26264, rate: 0.02 },
  { limit: 41452, rate: 0.04 },
  { limit: 57542, rate: 0.06 },
  { limit: 72724, rate: 0.08 },
  { limit: 371479, rate: 0.093 },
  { limit: 445771, rate: 0.103 },
  { limit: 742953, rate: 0.113 },
  { limit: Infinity, rate: 0.123 }
];

const BRACKETS_CA_MFJ = [
  { limit: 22158, rate: 0.01 },
  { limit: 52528, rate: 0.02 },
  { limit: 82904, rate: 0.04 },
  { limit: 115084, rate: 0.06 },
  { limit: 145448, rate: 0.08 },
  { limit: 742958, rate: 0.093 },
  { limit: 891542, rate: 0.103 },
  { limit: 1485906, rate: 0.113 },
  { limit: Infinity, rate: 0.123 }
];

// California's 1% surcharge on taxable income above $1,000,000, from
// Proposition 63 (2004). Renamed for tax years from 2025: it was the Mental
// Health Services Tax, and is now the BEHAVIORAL Health Services Tax, after
// Prop 1 / SB 326 renamed the underlying Act.
//
// This was missing entirely, which is why the app's top California rate was
// 12.3% when the widely-quoted figure is 13.3%.
//
// The threshold is the SAME $1,000,000 for every filing status -- it is not
// halved for MFS. (There is a $500,000 MFS figure in California guidance,
// but it belongs to the estimated-tax safe-harbor rule, an unrelated
// provision. Halving here would be a plausible-looking mistake.)
//
// Note the surcharge threshold and the top bracket do NOT line up, so the
// marginal rate does not simply step to 13.3%:
//   * Single: the 12.3% bracket starts at $742,953, below the $1M
//     surcharge, so there is a genuine 12.3%-only band up to $1M.
//   * Joint: the 12.3% bracket does not start until $1,485,906, ABOVE the
//     surcharge, so a joint filer goes 11.3% -> 12.3% at $1M -> 13.3% at
//     $1,485,906. Modeling "13.3% above $1M" for joint filers would be
//     wrong in both directions across that range.
// Applying it as a separate additive surcharge, rather than folding it into
// the bracket table, is what gets both cases right without special-casing.
export const CA_BHS_TAX_THRESHOLD = 1000000;
export const CA_BHS_TAX_RATE = 0.01;

export function californiaBehavioralHealthServicesTax(taxableIncome) {
  return Math.max(0, (taxableIncome || 0) - CA_BHS_TAX_THRESHOLD) * CA_BHS_TAX_RATE;
}

// New York brackets, tax year 2026.
//
// Verified 2026-08-20 against NY Tax Law s 601 directly (nysenate.gov), the
// subsections governing "taxable years beginning after two thousand
// twenty-five and before two thousand twenty-seven": s 601(a)(1)(vii) for
// joint filers and s 601(c)(1)(vii) for single/MFS.
//
// These REPLACE a set labeled "estimated 2026" that was wrong three
// separate ways, every one of which overstated tax for a New York resident:
//
//   1. Every rate was about 0.1 point high (4% vs 3.90%, 4.5% vs 4.40%, and
//      so on). NY cut the middle-class rates in the FY2026 budget.
//   2. Two breakpoints did not exist at all -- $21,400 single and $43,000
//      joint, with a 6.33% rate found nowhere in the statute. They came from
//      a roughly 2018-2021 vintage schedule.
//   3. Worst by far: the 9.65% rate started at $215,400 (single) and
//      $323,200 (joint). The statute does not reach 9.65% until $1,077,550
//      and $2,155,350. A single filer with $300,000 of NY taxable income was
//      charged a 9.65% marginal rate where the real one is 6.85%.
//
// NOT inflation-indexed. s 601-a indexed these thresholds only through tax
// year 2017; since then they are fixed dollar amounts in statute, changed
// only by legislation. Do NOT apply a CPI factor to them.
//
// 2026-08-23: the two scheduled step-downs already written into s 601 ARE
// now modeled -- see NY_TAX_ERAS below. The projection passes each year's
// calendar year through to calculateStateTaxes, which picks the era:
//   * 2026 (and any earlier year): this schedule, s 601(a)/(c)(1)(vii).
//   * 2027-2032: the bottom five rates drop to 3.80 / 4.30 / 5.05 / 5.30 /
//     5.80 (s 601(a)/(c)(1)(viii)); thresholds unchanged.
//   * 2033 onward: the 9.65 / 10.30 / 10.90 brackets expire and the top
//     rate reverts to 8.82% from $1,077,550 single / $2,155,350 joint
//     (s 601(a)/(c)(1)(ix)).
// Every era keeps the same fixed dollar thresholds -- the no-CPI rule above
// applies to all of them.
const BRACKETS_NY_SINGLE = [
  { limit: 8500, rate: 0.039 },
  { limit: 11700, rate: 0.044 },
  { limit: 13900, rate: 0.0515 },
  { limit: 80650, rate: 0.054 },
  { limit: 215400, rate: 0.059 },
  { limit: 1077550, rate: 0.0685 },
  { limit: 5000000, rate: 0.0965 },
  { limit: 25000000, rate: 0.103 },
  { limit: Infinity, rate: 0.109 }
];

const BRACKETS_NY_MFJ = [
  { limit: 17150, rate: 0.039 },
  { limit: 23600, rate: 0.044 },
  { limit: 27900, rate: 0.0515 },
  { limit: 161550, rate: 0.054 },
  { limit: 323200, rate: 0.059 },
  { limit: 2155350, rate: 0.0685 },
  { limit: 5000000, rate: 0.0965 },
  { limit: 25000000, rate: 0.103 },
  { limit: Infinity, rate: 0.109 }
];

// New York tax table benefit recapture, tax year 2026 -- Tax Law s 601(d-5).
//
// Once NY AGI passes $107,650, New York claws back the benefit of the
// graduated brackets: a fixed "recapture base" plus an "incremental benefit"
// that phases in over a $50,000 window of AGI above each row's threshold.
// With full recapture, tax lands (to within a dollar of statutory rounding)
// at the taxpayer's marginal rate times their ENTIRE taxable income -- e.g.
// exactly 9.65% x $5,000,000 = $482,500 for a single filer at $5M.
//
// Verified 2026-08-23 two independent ways:
//   1. The 2026 IT-2105-I tax computation worksheets (tax.ny.gov,
//      current_forms/it/it2105i.pdf), which print these exact dollar
//      amounts and the divide-by-$50,000, round-to-4-decimals mechanics.
//   2. Re-derived from the s 601 rate schedules themselves: each row's
//      cumulative recapture equals sum over lower brackets of
//      (row rate - lower rate) x lower bracket width, within $1.25 of the
//      published integers (the statute rounds; we carry its integers).
//
// The single-filer figures below are NOT the ones in the 2025 table
// (s 601(d-4): $568 / $1,831 / ...). The FY2026 budget's rate cuts changed
// the recapture arithmetic and the 2026 table moved with it -- reading the
// 2025 table against the 2026 rate schedule is exactly the reconciliation
// failure recorded when this gap was first found. Both tables' rows chain
// (each row's base equals the previous row's base + incremental), which is
// the internal check that catches a stale or mistranscribed row.
//
// Rows are selected by TAXABLE income; the phase-in fraction runs on AGI.
// This app does not model New York deductions, so its stateTaxableIncome is
// closer to NY AGI than to NY taxable income, and the same figure is used
// for both. Since NY AGI >= NY taxable income, this can only understate the
// phase-in fraction (never the row selection) inside a $50,000 band above
// each threshold -- a small, bounded, conservative-for-the-state error.
//
// MFS uses the single table, same as the brackets: s 601(d-5)(3) is headed
// "resident unmarried individuals [and] resident married individuals filing
// separate returns", one table for both.
//
// tiAbove: the row applies when taxable income exceeds this (and does not
//          exceed the next row's tiAbove); agiOver: the phase-in threshold.
const NY_RECAPTURE_SINGLE = [
  { tiAbove: 80650, agiOver: 107650, base: 0, incremental: 567 },
  { tiAbove: 215400, agiOver: 215400, base: 567, incremental: 2047 },
  { tiAbove: 1077550, agiOver: 1077550, base: 2614, incremental: 30172 },
  { tiAbove: 5000000, agiOver: 5000000, base: 32786, incremental: 32500 },
];

const NY_RECAPTURE_MFJ = [
  { tiAbove: 27900, agiOver: 107650, base: 0, incremental: 333 },
  { tiAbove: 161550, agiOver: 161550, base: 333, incremental: 807 },
  { tiAbove: 323200, agiOver: 323200, base: 1140, incremental: 3071 },
  { tiAbove: 2155350, agiOver: 2155350, base: 4211, incremental: 60350 },
  { tiAbove: 5000000, agiOver: 5000000, base: 64561, incremental: 32500 },
];

// -------------------------------------------------------------------------
// New York's future eras: 2027-2032 and 2033+, added 2026-08-23.
//
// s 601 already contains the next two rate schedules as enacted law, and
// each has its own matching recapture subsection -- the two are coupled by
// construction and must always move together:
//
//   * 2027-2032: s 601(a)/(c)(1)(viii) rates with the s 601(d-6) recapture.
//   * 2033+:     s 601(a)/(c)(1)(ix) rates with the s 601(d-7) recapture.
//     The 9.65/10.30/10.90 brackets expire; the top rate reverts to 8.82%,
//     and with them the $25M "flat 10.9% on everything" clause disappears
//     ((d-7) carries no AGI ceiling and no flat override).
//
// Sourcing note (2026-08-23): the consolidated-law page truncates before
// (d-6)/(d-7), so their integers were transcribed from the FY2026 budget
// bill print (budget.ny.gov revenue Article VII). The executive print
// numbers its subsections one year earlier than the enacted chapter, but
// the tables themselves are the ones enacted -- every row below re-derives
// from the ENACTED (viii)/(ix) rate schedules via the same
// sum-over-lower-brackets formula to within $1 of print, chains internally,
// and lands the flat identities exactly (2027 era: 9.65% x $5M = $482,500
// from EITHER filing status's table; 2033 era: 8.82% x $1,077,550 =
// $95,040 single). Re-verify against DTF's own IT-2105-I worksheets for
// 2027 when those publish (early 2027) -- rounding of individual rows may
// differ by a dollar, as (d-5)'s did.
const BRACKETS_NY_SINGLE_2027 = [
  { limit: 8500, rate: 0.038 },
  { limit: 11700, rate: 0.043 },
  { limit: 13900, rate: 0.0505 },
  { limit: 80650, rate: 0.053 },
  { limit: 215400, rate: 0.058 },
  { limit: 1077550, rate: 0.0685 },
  { limit: 5000000, rate: 0.0965 },
  { limit: 25000000, rate: 0.103 },
  { limit: Infinity, rate: 0.109 }
];

const BRACKETS_NY_MFJ_2027 = [
  { limit: 17150, rate: 0.038 },
  { limit: 23600, rate: 0.043 },
  { limit: 27900, rate: 0.0505 },
  { limit: 161550, rate: 0.053 },
  { limit: 323200, rate: 0.058 },
  { limit: 2155350, rate: 0.0685 },
  { limit: 5000000, rate: 0.0965 },
  { limit: 25000000, rate: 0.103 },
  { limit: Infinity, rate: 0.109 }
];

const BRACKETS_NY_SINGLE_2033 = [
  { limit: 8500, rate: 0.038 },
  { limit: 11700, rate: 0.043 },
  { limit: 13900, rate: 0.0505 },
  { limit: 80650, rate: 0.053 },
  { limit: 215400, rate: 0.058 },
  { limit: 1077550, rate: 0.0685 },
  { limit: Infinity, rate: 0.0882 }
];

const BRACKETS_NY_MFJ_2033 = [
  { limit: 17150, rate: 0.038 },
  { limit: 23600, rate: 0.043 },
  { limit: 27900, rate: 0.0505 },
  { limit: 161550, rate: 0.053 },
  { limit: 323200, rate: 0.058 },
  { limit: 2155350, rate: 0.0685 },
  { limit: Infinity, rate: 0.0882 }
];

const NY_RECAPTURE_SINGLE_2027 = [
  { tiAbove: 80650, agiOver: 107650, base: 0, incremental: 568 },
  { tiAbove: 215400, agiOver: 215400, base: 568, incremental: 2261 },
  { tiAbove: 1077550, agiOver: 1077550, base: 2829, incremental: 30172 },
  { tiAbove: 5000000, agiOver: 5000000, base: 33001, incremental: 32500 },
];

const NY_RECAPTURE_MFJ_2027 = [
  { tiAbove: 27900, agiOver: 107650, base: 0, incremental: 333 },
  { tiAbove: 161550, agiOver: 161550, base: 333, incremental: 808 },
  { tiAbove: 323200, agiOver: 323200, base: 1141, incremental: 3393 },
  { tiAbove: 2155350, agiOver: 2155350, base: 4534, incremental: 60350 },
  { tiAbove: 5000000, agiOver: 5000000, base: 64884, incremental: 32500 },
];

const NY_RECAPTURE_SINGLE_2033 = [
  { tiAbove: 80650, agiOver: 107650, base: 0, incremental: 568 },
  { tiAbove: 215400, agiOver: 215400, base: 568, incremental: 2261 },
  { tiAbove: 1077550, agiOver: 1077550, base: 2829, incremental: 21228 },
];

const NY_RECAPTURE_MFJ_2033 = [
  { tiAbove: 27900, agiOver: 107650, base: 0, incremental: 333 },
  { tiAbove: 161550, agiOver: 161550, base: 333, incremental: 808 },
  { tiAbove: 323200, agiOver: 323200, base: 1141, incremental: 3393 },
  { tiAbove: 2155350, agiOver: 2155350, base: 4534, incremental: 42461 },
];

// One era per row; pick by the projection year's calendar year. Years
// before 2027 (including pre-2026 history) use the 2026 schedule -- the
// app's tax vintage. flatAgi null = no $25M flat-top clause in that era.
const NY_TAX_ERAS = [
  {
    firstYear: 2027, lastYear: 2032,
    single: BRACKETS_NY_SINGLE_2027, mfj: BRACKETS_NY_MFJ_2027,
    recaptureSingle: NY_RECAPTURE_SINGLE_2027, recaptureMfj: NY_RECAPTURE_MFJ_2027,
    flatAgi: 25000000, flatRate: 0.109,
  },
  {
    firstYear: 2033, lastYear: Infinity,
    single: BRACKETS_NY_SINGLE_2033, mfj: BRACKETS_NY_MFJ_2033,
    recaptureSingle: NY_RECAPTURE_SINGLE_2033, recaptureMfj: NY_RECAPTURE_MFJ_2033,
    flatAgi: null, flatRate: 0.0882,
  },
];

// Below this AGI there is no recapture at all; above an era's flatAgi
// the graduated schedule is abandoned entirely and the whole taxable income
// is taxed at the top rate (IT-2105-I worksheet 6/11: "Multiply line 1 by
// 10.9%"). That produces a genuine ~$150k discontinuity at $25M -- New
// York's, not ours. The flat clause exists in the 2026 and 2027-2032 eras
// only; (d-7) (2033+) drops it along with the top three brackets.
export const NY_RECAPTURE_AGI_FLOOR = 107650;
export const NY_RECAPTURE_FLAT_AGI = 25000000;
export const NY_TOP_RATE = 0.109;

// Resolves the bracket/recapture era for a calendar year. Exported for
// tests. Anything at or before 2026 gets the 2026 era (the app's vintage);
// legislation can of course rewrite the future eras before they arrive --
// TAX_UPDATE_PROCESS.md's NY section says to re-read s 601 after any state
// budget for exactly that reason.
export function newYorkEraForYear(calendarYear) {
  const y = Number(calendarYear) || TAX_YEAR;
  for (const era of NY_TAX_ERAS) {
    if (y >= era.firstYear && y <= era.lastYear) return era;
  }
  return {
    firstYear: -Infinity, lastYear: 2026,
    single: BRACKETS_NY_SINGLE, mfj: BRACKETS_NY_MFJ,
    recaptureSingle: NY_RECAPTURE_SINGLE, recaptureMfj: NY_RECAPTURE_MFJ,
    flatAgi: NY_RECAPTURE_FLAT_AGI, flatRate: NY_TOP_RATE,
  };
}

// Exported for tests. `agi` and `taxableIncome` are separate parameters so
// the statute's real shape is testable, but the app currently passes the
// same figure for both (see the block comment above). calendarYear picks
// the (d-5)/(d-6)/(d-7) table; omitted = 2026.
export function newYorkBenefitRecapture(agi, taxableIncome, status, calendarYear = TAX_YEAR) {
  if (!(agi > NY_RECAPTURE_AGI_FLOOR)) return 0;
  const era = newYorkEraForYear(calendarYear);
  const table = (status === 'MFJ') ? era.recaptureMfj : era.recaptureSingle;
  let row = null;
  for (const r of table) {
    if (taxableIncome > r.tiAbove) row = r;
  }
  if (!row) return 0;
  // IT-2105-I: "Divide line 7 by $50,000 and round the result to the fourth
  // decimal place." Matching the department's own rounding keeps this
  // reproducible against a filled-in worksheet to the dollar.
  const excess = Math.max(0, Math.min(50000, agi - row.agiOver));
  const fraction = Math.round((excess / 50000) * 10000) / 10000;
  return row.base + row.incremental * fraction;
}

// -------------------------------------------------------------------------
// New York City resident income tax, verified 2026-08-23.
//
// NYC levies its own resident income tax ON TOP of state tax, with its own
// bracket schedule rather than Yonkers' multiplier. The rates below are the
// COMBINED s 1304 base + s 1304-B additional tax, confirmed from a
// first-party document at last: the 2026 IT-2105-I's "New York City tax
// rate schedule" (tax.ny.gov, current_forms/it/it2105i.pdf) -- which is the
// confirmation the KNOWN_ISSUES entry was waiting on. Cross-checked: each
// printed cumulative base re-derives from the rates ($665 at $21,600 joint,
// $3,264 at $90,000 joint, $1,813 at $50,000 single, within $1 of print).
//
// The schedule's dollar thresholds are statutory and have not moved since
// 2015 -- no indexing, nothing scheduled, so no era table. Single and MFS
// share one schedule, same as the state's. NYC has NO benefit recapture of
// its own.
//
// The city taxes the same base the state does: Social Security is fully
// exempt and the state's pension exclusions (government pensions in full,
// $20,000 private from 59 1/2) flow through -- so this applies to the same
// stateTaxableIncome the state brackets use.
const BRACKETS_NYC_SINGLE = [
  { limit: 12000, rate: 0.03078 },
  { limit: 25000, rate: 0.03762 },
  { limit: 50000, rate: 0.03819 },
  { limit: Infinity, rate: 0.03876 }
];

const BRACKETS_NYC_MFJ = [
  { limit: 21600, rate: 0.03078 },
  { limit: 45000, rate: 0.03762 },
  { limit: 90000, rate: 0.03819 },
  { limit: Infinity, rate: 0.03876 }
];

// Exported for tests.
export function newYorkCityTax(taxableIncome, status) {
  if (!(taxableIncome > 0)) return 0;
  const brackets = (status === 'MFJ') ? BRACKETS_NYC_MFJ : BRACKETS_NYC_SINGLE;
  return applyStateBrackets(taxableIncome, brackets);
}

// -------------------------------------------------------------------------
// California exemption credits, verified 2026-08-23 against FTB's 2025
// Form 540 instructions and FTB's own SB 1144 bill analysis ("the
// exemption credit amounts for the 2025 taxable year are $475 per dependent
// and $153 per all other exemptions").
//
// California gives flat CREDITS AGAINST TAX, not deductions: $153 per
// personal exemption plus another $153 per spouse aged 65+. (Blind and
// dependent credits exist too; this app has no blindness or dependent
// inputs, so they are not modeled -- a retiree-planning simplification
// that can only overstate CA tax.)
//
// Higher-income phase-out, from the 540's AGI Limitation Worksheet: each
// credit is reduced by $6 for every $2,500 ($1,250 for MFS), OR FRACTION
// THEREOF, of federal AGI above the threshold. 2025 thresholds: $252,203
// single, $504,411 joint, $252,203 MFS. These ARE CPI-indexed -- refresh
// with the bracket table each January (TAX_UPDATE_PROCESS.md s 8); the
// amounts here are the 2025 set, matching the 2025 bracket schedule the
// app carries.
export const CA_EXEMPTION_CREDIT = 153;
const CA_EXEMPTION_PHASEOUT = { Single: 252203, MFJ: 504411, MFS: 252203 };

// Exported for tests. `federalAGI` is the phase-out driver; the projection
// passes its best AGI proxy (pre-deduction ordinary income plus capital
// gains). Since the proxy runs a little low, the phase-out can start a
// little late -- bounded by the full credit (a few hundred dollars).
export function californiaExemptionCredits(federalAGI, status, age1 = 65, age2 = 65, indexFactor = 1) {
  let credits = (status === 'MFJ') ? 2 : 1;
  if (age1 >= 65) credits += 1;
  if (status === 'MFJ' && age2 >= 65) credits += 1;
  // The credit and its phase-out threshold are indexed (changelog 430);
  // the $2,500 step and the $6 reduction are statutory (R&TC s 17054(e)).
  const threshold = (CA_EXEMPTION_PHASEOUT[status] ?? CA_EXEMPTION_PHASEOUT.Single) * indexFactor;
  const excess = Math.max(0, (federalAGI || 0) - threshold);
  const step = (status === 'MFS') ? 1250 : 2500;
  const perCreditReduction = 6 * Math.ceil(excess / step);
  return credits * Math.max(0, CA_EXEMPTION_CREDIT * indexFactor - perCreditReduction);
}

// California military retirement exclusion, verified 2026-08-23 against the
// FTB's 2025 Form 540 booklet (R&TC ss 17132.9 / 17132.10): for taxable
// years 2025 THROUGH 2029 ONLY, up to $20,000 of federal uniformed-services
// retirement pay (or SBP annuity) is excluded -- but only when federal AGI
// is at or below $125,000 single / $250,000 joint. Sunsets after 2029
// unless extended; the calendarYear check below enforces that, and
// TAX_UPDATE_PROCESS.md flags re-checking it in the 2030 January pass.
//
// Before this, the app subtracted military pension in FULL for every state
// including California -- correct for the states that fully exempt it, too
// generous for CA (which taxed it fully before 2025 and caps it now).
export const CA_MILITARY_EXCLUSION_CAP = 20000;
export const CA_MILITARY_EXCLUSION_LAST_YEAR = 2029;
const CA_MILITARY_AGI_LIMIT = { Single: 125000, MFJ: 250000, MFS: 125000 };

export function californiaMilitaryExclusion(militaryPension, federalAGI, status, calendarYear = TAX_YEAR) {
  if (!(militaryPension > 0)) return 0;
  if (calendarYear > CA_MILITARY_EXCLUSION_LAST_YEAR) return 0;
  const limit = CA_MILITARY_AGI_LIMIT[status] ?? CA_MILITARY_AGI_LIMIT.Single;
  if ((federalAGI || 0) > limit) return 0;
  return Math.min(CA_MILITARY_EXCLUSION_CAP, militaryPension);
}

// ---------------------------------------------------------------------------
// Virginia (changelog 114). Verified 2026-08-31 against Va. Code
// s 58.1-322.03 (law.lis.virginia.gov) and tax.virginia.gov's Deductions
// and Military Benefits Subtraction FAQ pages.
//
// Shape of the return: Social Security is fully subtracted (Virginia
// exempts every dollar the federal return taxed), pensions and retirement
// account withdrawals are fully taxable, and the bracket schedule is the
// SAME for every filing status -- $17,000 is where the 5.75% top rate
// starts whether Single, MFJ, or MFS, which makes Virginia nearly flat in
// practice. What the old flat-5.75% approximation missed is everything
// below the brackets: the standard deduction ($8,750 / $17,500 -- the
// 2025-2026 amounts; scheduled to sunset after 2026 but routinely
// extended, so they're held constant like the other states' figures and
// flagged in TAX_UPDATE_PROCESS.md), the $930-per-person exemption plus
// $800 more for each filer 65+, and the age deduction below.
//
// Known simplification: the Spouse Tax Adjustment (a two-earner MFJ
// credit worth at most $259/yr) is not modeled.
const BRACKETS_VA = [
  { limit: 3000, rate: 0.02 },
  { limit: 5000, rate: 0.03 },
  { limit: 17000, rate: 0.05 },
  { limit: Infinity, rate: 0.0575 },
];
// State standard deductions and exemption allowances (audit Q-17, changelog
// 126). Every state that starts from a federal-style income figure gives one
// of these, and leaving them out overstated state tax by several hundred to
// ~$1,500 a year. Like the state bracket tables (and VA's figures below),
// these are carried at their published nominal amounts and are NOT inflated
// forward -- see TAX_UPDATE_PROCESS.md for the annual refresh.
//   California  -- FTB 2025 Form 540 booklet, fetched 2026-09-02. Indexed to
//                  the CCPI each year; MFS shares the single amount.
export const CA_STD_DEDUCTION_SINGLE = 5706;
export const CA_STD_DEDUCTION_MFJ = 11412;
//   New York    -- tax.ny.gov standard deduction table, fetched 2026-09-02.
//                  Statutory (Tax Law s 615) and unchanged for years; MFS
//                  takes the single amount, not half the joint one.
export const NY_STD_DEDUCTION_SINGLE = 8000;
export const NY_STD_DEDUCTION_MFJ = 16050;
//   Illinois    -- $2,925 per person for tax year 2026 (IDOR Informational
//                  Bulletin FY 2026-15, fetched 2026-09-30; it was $2,850 for
//                  2025 per IL-1040 Step 4), $1,000 more per person 65+ (and
//                  again if blind, which the engine does not model), and
//                  NOTHING at all above $250,000 of federal AGI ($500,000
//                  joint) -- a cliff, not a taper.
export const IL_EXEMPTION_ALLOWANCE = 2925;
export const IL_EXEMPTION_AGE_65 = 1000;
export const IL_EXEMPTION_AGI_LIMIT_SINGLE = 250000;
export const IL_EXEMPTION_AGI_LIMIT_MFJ = 500000;

// Illinois' exemption allowance for the year: per person, plus the age-65
// addition per person, unless federal AGI is over the cliff.
export function illinoisExemptionAllowance(federalAGI, status, age1 = 65, age2 = 65) {
  const limit = status === 'MFJ' ? IL_EXEMPTION_AGI_LIMIT_MFJ : IL_EXEMPTION_AGI_LIMIT_SINGLE;
  if ((federalAGI || 0) > limit) return 0;
  const people = status === 'MFJ' ? 2 : 1;
  let allowance = IL_EXEMPTION_ALLOWANCE * people;
  if (age1 >= 65) allowance += IL_EXEMPTION_AGE_65;
  if (status === 'MFJ' && age2 >= 65) allowance += IL_EXEMPTION_AGE_65;
  return allowance;
}

export const VA_STD_DEDUCTION_SINGLE = 8750;
export const VA_STD_DEDUCTION_MFJ = 17500;
export const VA_PERSONAL_EXEMPTION = 930;
export const VA_AGE_EXEMPTION = 800; // extra personal exemption at 65+
export const VA_AGE_DEDUCTION = 12000;
const VA_AGE_DEDUCTION_THRESHOLD = { single: 50000, married: 75000 };
export const VA_MILITARY_SUBTRACTION_CAP = 40000; // per recipient, TY2025+

// Age deduction (s 58.1-322.03(5)): $12,000 per filer aged 65+, reduced
// $1-for-$1 by the amount AFAGI exceeds $50,000 (single) / $75,000
// (married, combined -- one threshold and one excess against the couple's
// combined $24,000, which is why it is fully gone at $99,000). AFAGI is
// federal AGI minus the Social Security that AGI included, so SS never
// counts against the phase-out -- but Roth conversions and IRA
// withdrawals do, which is exactly why large-conversion years usually
// zero this out. Filers born on or before 1/1/1939 keep the full $12,000
// with no income test (grandfathered from the pre-2004 rules); with only
// ages in hand, birth year is approximated as calendarYear - age.
export function virginiaAgeDeduction(afagi, status, age1, age2, calendarYear = TAX_YEAR) {
  let grandfathered = 0;
  let phased = 0;
  if (age1 >= 65) {
    if (calendarYear - age1 <= 1938) grandfathered += VA_AGE_DEDUCTION;
    else phased += VA_AGE_DEDUCTION;
  }
  if (status === 'MFJ' && age2 >= 65) {
    if (calendarYear - age2 <= 1938) grandfathered += VA_AGE_DEDUCTION;
    else phased += VA_AGE_DEDUCTION;
  }
  if (grandfathered + phased === 0) return 0;
  const threshold = (status === 'MFJ' || status === 'MFS')
    ? VA_AGE_DEDUCTION_THRESHOLD.married
    : VA_AGE_DEDUCTION_THRESHOLD.single;
  const excess = Math.max(0, (afagi || 0) - threshold);
  return grandfathered + Math.max(0, phased - excess);
}

// Military benefits subtraction (s 58.1-322.02(24)): up to $40,000 of
// military retirement per RECIPIENT (phased in $20k/2023, $30k/2024,
// $40k/2025+; the age-55 requirement was removed starting TY2024, and the
// projection only runs 2026+, so neither old rule appears here). The
// per-spouse breakdown rides in pensionDetail.military1/military2; a
// caller without it gets a single $40,000 cap on the combined figure --
// conservative for a genuine two-military-pension couple, exact for
// everyone else.
export function virginiaMilitarySubtraction(militaryPension, pensionDetail = null) {
  if (!(militaryPension > 0)) return 0;
  if (pensionDetail && (pensionDetail.military1 !== undefined || pensionDetail.military2 !== undefined)) {
    return Math.min(Math.max(0, pensionDetail.military1 || 0), VA_MILITARY_SUBTRACTION_CAP)
      + Math.min(Math.max(0, pensionDetail.military2 || 0), VA_MILITARY_SUBTRACTION_CAP);
  }
  return Math.min(militaryPension, VA_MILITARY_SUBTRACTION_CAP);
}

// --- Washington (changelog 349) ----------------------------------------
//
// Washington taxes no wages or retirement income before 2028, but it has
// two taxes a retiree can owe, and the 'wa' jurisdiction prices both.
//
// 1. The capital gains excise tax, RCW 82.87 (tax years 2022 on). 7% of
//    "Washington capital gains" (RCW 82.87.040(1)), plus an additional
//    2.9% of the part over $1,000,000 from tax year 2025 (RCW
//    82.87.040(2), ESSB 5813, c 421 L 2025; the $1,000,000 is not an
//    RCW 82.87.150 "applicable amount", so it is NOT indexed). Washington
//    capital gains are federal net LONG-TERM gains (RCW 82.87.020) less a
//    standard deduction of $250,000 per individual, or combined for
//    spouses or domestic partners "regardless of whether [they] file a
//    joint or separate return" (RCW 82.87.060(1); WAC 458-20-300). The
//    deduction is indexed to Seattle-area CPI each October (RCW
//    82.87.150): $262,000 (2023), $270,000 (2024), $278,000 (2025), per
//    dor.wa.gov. The tax-year-2026 figure is not yet published, so
//    $278,000 is carried as the 2026 figure and grown with the plan's Tax
//    Bracket Inflation Rate. Real estate and gains inside 401(k)s and IRAs
//    are exempt (RCW 82.87.050); the engine has no real-estate gain and
//    never taxes gains inside retirement accounts, so neither needs a
//    special case. Qualified dividends are not capital gains and are not
//    part of this base. The engine treats every realized gain as long-term
//    (as its federal side does).
//
// 2. The income tax, ESSB 6346 (c 238 L 2026), from January 1, 2028:
//    9.90% of Washington taxable income (s 201). Washington base income is
//    federal AGI with ALL long-term capital gains taken out and the
//    Washington capital gains taxed under RCW 82.87 put back (s 302) --
//    i.e. after the capital-gains standard deduction. Taxable income is
//    that less a $1,000,000 standard deduction per individual, or combined
//    for spouses or domestic partners whether they file jointly or not
//    (s 314). There is no exclusion for Social Security, pensions or IRA
//    withdrawals. The capital gains tax for the same year is a
//    NONREFUNDABLE credit against this tax, with no carryover (s 205), so
//    the household pays the larger of the two taxes. The deduction is
//    adjusted "beginning October 2029 and each October of an odd-numbered
//    year thereafter" by the latest ONE-year CPI change (s 316), "for
//    taxes due in the following calendar year". As with the capital gains
//    tax (whose identical wording the department applies to the next tax
//    year), the first adjusted figure is taken to apply to tax year 2030,
//    and every second year after. The adjustment is one year's inflation
//    every two years, so the deduction grows at roughly half the rate of
//    prices; the engine applies the plan's average yearly bracket
//    inflation once per adjustment. Not modeled: the $100,000 charitable
//    deduction (s 309), which the app has no input for, and the smaller
//    AGI modifications (state bond interest, federal obligation interest,
//    net operating losses, wagering, tribal income).
export const WA_CAPITAL_GAINS_RATE = 0.07;
export const WA_CAPITAL_GAINS_ADDITIONAL_RATE = 0.029;
export const WA_CAPITAL_GAINS_ADDITIONAL_THRESHOLD = 1000000;
export const WA_CAPITAL_GAINS_STD_DEDUCTION = 278000;
export const WA_INCOME_TAX_RATE = 0.099;
export const WA_INCOME_TAX_FIRST_YEAR = 2028;
export const WA_INCOME_TAX_STD_DEDUCTION = 1000000;
export const WA_INCOME_TAX_FIRST_INDEXED_YEAR = 2030;

// The income tax's standard deduction for a tax year. `inflationFactor`
// is the plan's bracket-indexing factor for that year (1 = TAX_YEAR).
export function washingtonIncomeTaxDeduction(calendarYear, inflationFactor = 1) {
  const y = Number(calendarYear) || TAX_YEAR;
  if (y < WA_INCOME_TAX_FIRST_INDEXED_YEAR) return WA_INCOME_TAX_STD_DEDUCTION;
  const adjustments = Math.floor((y - WA_INCOME_TAX_FIRST_INDEXED_YEAR) / 2) + 1;
  const f = Math.max(1, Number(inflationFactor) || 1);
  const yearlyRate = y > TAX_YEAR ? Math.pow(f, 1 / (y - TAX_YEAR)) - 1 : 0;
  return Math.round(WA_INCOME_TAX_STD_DEDUCTION * Math.pow(1 + yearlyRate, adjustments) / 1000) * 1000;
}

// Washington's tax for one return. `agi` is the return's federal AGI
// (long-term gains included); `longTermGains` the net long-term gains
// inside it. `deductionShare` is this return's share of the household's
// one standard deduction (1 on a joint or single return; the income split
// on each of two separate returns, since the law gives spouses one
// combined deduction however they file). Returns the parts so callers and
// tests can see which tax binds.
export function washingtonStateTax(agi, longTermGains, calendarYear = TAX_YEAR, inflationFactor = 1, deductionShare = 1) {
  const f = Math.max(1, Number(inflationFactor) || 1);
  const share = Math.min(1, Math.max(0, Number.isFinite(deductionShare) ? deductionShare : 1));
  const gains = Math.max(0, longTermGains || 0);
  const waGains = Math.max(0, gains - WA_CAPITAL_GAINS_STD_DEDUCTION * f * share);
  const capitalGainsTax = waGains * WA_CAPITAL_GAINS_RATE
    + Math.max(0, waGains - WA_CAPITAL_GAINS_ADDITIONAL_THRESHOLD) * WA_CAPITAL_GAINS_ADDITIONAL_RATE;
  const year = Number(calendarYear) || TAX_YEAR;
  if (year < WA_INCOME_TAX_FIRST_YEAR) {
    return { capitalGainsTax, incomeTaxBeforeCredit: 0, incomeTax: 0, total: capitalGainsTax };
  }
  const baseIncome = Math.max(0, (agi || 0) - gains) + waGains;
  const taxableIncome = Math.max(0, baseIncome - washingtonIncomeTaxDeduction(year, f) * share);
  const incomeTaxBeforeCredit = taxableIncome * WA_INCOME_TAX_RATE;
  const incomeTax = Math.max(0, incomeTaxBeforeCredit - capitalGainsTax);
  return { capitalGainsTax, incomeTaxBeforeCredit, incomeTax, total: capitalGainsTax + incomeTax };
}

// Helper to compute state taxes
// `pensionDetail` is optional and, when absent, every state behaves exactly
// as it did before this parameter existed. It carries the breakdown NY needs
// and no other state currently uses:
//   stateExempt -- pension a state may exempt outright because of its SOURCE
//                  (government or military), already de-duplicated so a
//                  pension flagged both ways is counted once.
//   private1/2  -- each spouse's remaining, ordinary pension income.
//   military1/2 -- each spouse's military pension, for Virginia's
//                  per-recipient $40,000 subtraction cap (a subset of
//                  stateExempt, never added on top of it).
// NOTE: the positional signature is frozen at these thirteen -- everything
// added 2026-08-23 or later rides in `extras`, the options object the older
// note here asked for:
//   calendarYear -- the projection year's calendar year. Drives New York's
//                   era selection (2026 / 2027-2032 / 2033+ schedules and
//                   their coupled recapture tables) and California's
//                   military-exclusion sunset. Defaults to TAX_YEAR, which
//                   preserves the old single-era behavior exactly.
//   nycResident  -- adds New York City's resident income tax (its own
//                   bracket schedule) on top of the state figure. NY only.
//   hsaAddback   -- this year's HSA contribution plus estimated HSA
//                   earnings; California does not conform to federal HSA
//                   law, so this is added back to CA taxable income.
//   federalAGI   -- best available federal AGI proxy, for California's
//                   exemption-credit phase-out and military-exclusion AGI
//                   test. Defaults to `income`.
//   retirementDistributions -- (changelog 120, audit Q-15) the taxable
//                   qualified-plan / IRA distributions sitting inside
//                   `income` OTHER than pensions and Roth conversions:
//                   taxable RMDs (after any QCD), the discretionary Pre-Tax
//                   draw, milestone Pre-Tax withdrawals, NUA cost basis,
//                   and the taxable earnings slice of an early Roth draw.
//   rothConversionTaxable -- the taxable part of this year's Roth
//                   conversions, also inside `income`. Kept separate from
//                   the distributions because Pennsylvania treats a
//                   conversion as a non-taxable rollover at any age while
//                   it only exempts ordinary distributions after 59 1/2.
//                   Illinois exempts both outright; New York lets both
//                   share the $20,000-per-person exclusion at 59 1/2+.
//                   Omitting both keeps the pre-changelog-120 behavior
//                   (distributions taxed in full in IL/PA/NY).
//   longTermGains -- (changelog 349) the realized long-term capital gains
//                   inside `income` (not dividends). Washington only: its
//                   capital gains excise tax is levied on them and its
//                   income tax swaps them for the taxed amount.
//   inflationFactor -- the year's bracket-indexing factor (1 = TAX_YEAR),
//                   for Washington's CPI-indexed standard deductions.
//   waDeductionShare -- set by the two-return MFS split: this return's
//                   share of Washington's one combined deduction.
//   stateCode    -- (changelog 361) the residence's two-letter state; picks
//                   the STATE_TAX_RULES record a 'state_rules' jurisdiction
//                   prices with.
//   earnedIncome -- (changelog 361) the year's wages inside `income`, so a
//                   retirement exclusion that also covers investment income
//                   (Georgia, Delaware) can tell the two apart. Omitted: no
//                   investment income is treated as covered.
export function calculateStateTaxes(income, pension, ss, stateType, taxSS, taxPension, status, age1 = 65, age2 = 65, flatRate = 5.0, militaryPension = 0, pensionDetail = null, yonkersResident = false, extras = {}) {
  // The year of a move that takes effect after January (changelog 203): the
  // year's state tax is shared by months between the residence before and
  // the one after -- each priced on the whole year's income, weighted by
  // the months lived there. An approximation of a part-year return.
  const partYear = extras && extras.partYear;
  if (partYear && partYear.share < 1) {
    const rest = { ...extras, partYear: null };
    const after = calculateStateTaxes(income, pension, ss, stateType, taxSS, taxPension, status, age1, age2, flatRate, militaryPension, pensionDetail, yonkersResident, rest);
    const p = partYear.prior;
    const before = calculateStateTaxes(income, pension, ss, p.stateTaxState, p.stateTaxSocialSecurityTaxable, p.stateTaxPensionTaxable, status, age1, age2, p.stateTaxFlatRate, militaryPension, pensionDetail, p.yonkersResident,
      { ...rest, nycResident: p.nycResident, yonkersResident: p.yonkersResident, stateTaxFlatRate: p.stateTaxFlatRate, stateCode: p.stateOfResidence });
    return partYear.share * after + (1 - partYear.share) * before;
  }
  if (stateType === 'none' || stateType === 'TX_FL') return 0;

  // Married filing separately with the income split between two returns
  // (extras.mfsSplitPct, the same split the federal side uses -- see
  // forEachSeparateReturn): each spouse files their own state return on the
  // single/MFS schedule with their own deduction, exemptions and age tests,
  // and the two liabilities are added. Every dollar figure divides in the
  // split proportion; each return's pensions are that spouse's own. Pricing
  // the whole household on one single-schedule return taxed a California
  // couple with $75,000 each at $9,705 against $5,549 filing jointly.
  const mfsSplit = extras && extras.mfsSplitPct;
  if (status === 'MFS' && mfsSplit > 0 && mfsSplit < 100) {
    const oneReturn = (f, ownAge, idx) => {
      const pd = pensionDetail ? {
        stateExempt: (pensionDetail.stateExempt || 0) * f,
        private1: ((pensionDetail.private1 || 0) + (pensionDetail.private2 || 0)) * f,
        private2: 0,
        military1: ((pensionDetail.military1 || 0) + (pensionDetail.military2 || 0)) * f,
        military2: 0,
      } : null;
      const scaled = { ...extras, mfsSplitPct: null, mfsReturnDeductions: null };
      scaled.federalAGI = (extras.federalAGI ?? income) * f;
      scaled.federalTaxableSS = (extras.federalTaxableSS ?? ss) * f;
      for (const k of ['retirementDistributions', 'rothConversionTaxable', 'hsaAddback', 'federalDeduction', 'paCompensationAddback', 'longTermGains', 'earnedIncome']) {
        if (extras[k] !== undefined && extras[k] !== null) scaled[k] = extras[k] * f;
      }
      // A state that starts from the federal deduction takes this return's
      // own (changelog 407), not a share of the pair's.
      if (Array.isArray(extras.mfsReturnDeductions) && extras.federalDeduction !== undefined && extras.federalDeduction !== null) scaled.federalDeduction = extras.mfsReturnDeductions[idx];
      // Washington gives spouses ONE standard deduction however they file
      // (capital gains and income tax alike), so each return takes its share.
      scaled.waDeductionShare = f;
      return calculateStateTaxes(income * f, pension * f, ss * f, stateType, taxSS, taxPension, status,
        ownAge, ownAge, flatRate, militaryPension * f, pd, yonkersResident, scaled);
    };
    const share = mfsSplit / 100;
    return oneReturn(share, age1, 0) + oneReturn(1 - share, age2, 1);
  }

  // Washington (changelog 349): its capital gains excise tax, and from 2028
  // its income tax, which start from federal AGI with no exclusion for
  // Social Security, pensions or IRA money -- so none of the state
  // subtractions below apply. See washingtonStateTax.
  if (stateType === 'wa') {
    return washingtonStateTax(extras.federalAGI ?? income, extras.longTermGains, extras.calendarYear ?? TAX_YEAR,
      extras.inflationFactor ?? 1, extras.waDeductionShare ?? 1).total;
  }

  // The 35 states and DC without a hand-written model (changelog 361):
  // their own rates, deductions, Social Security rule and retirement
  // exclusion, from the table in config/stateTaxRules.js. A residence that
  // names no state with a record falls back to the flat rate.
  if (stateType === 'state_rules') {
    const rules = STATE_TAX_RULES[typeof extras.stateCode === 'string' ? extras.stateCode.toUpperCase() : ''];
    if (rules) {
      return stateRulesTax(rules, {
        income, pension, ss, status, age1, age2, militaryPension, pensionDetail,
        federalAGI: extras.federalAGI ?? income,
        ssInIncome: extras.federalTaxableSS ?? ss,
        federalDeduction: extras.federalDeduction,
        retirementDistributions: Math.max(0, extras.retirementDistributions || 0) + Math.max(0, extras.rothConversionTaxable || 0),
        earnedIncome: extras.earnedIncome,
        longTermGains: Math.max(0, extras.longTermGains || 0),
        inflationFactor: extras.inflationFactor ?? 1,
      });
    }
    stateType = 'flat_5';
  }

  const calendarYear = extras.calendarYear ?? TAX_YEAR;
  const federalAGI = extras.federalAGI ?? income;

  // How much Social Security is actually sitting inside `income`. The
  // projection passes its federal ordinary-income base, which carries only
  // the FEDERALLY TAXABLE portion of benefits (0% / 50% / 85%), never the
  // gross check -- so that is what an exempting state must back out, and
  // what a taxing state keeps (every state that taxes benefits starts from
  // the federal taxable amount). Subtracting gross `ss` from a base that
  // only held 85% of it manufactured a phantom deduction of the other 15%
  // (or 50-100% of benefits for lower-income filers) against wages,
  // pensions, and IRA withdrawals. Direct callers that pass a gross AGI
  // and omit extras.federalTaxableSS keep the old gross-SS convention.
  const ssInIncome = extras.federalTaxableSS ?? ss;

  let taxableSS = ssInIncome;
  // Military pension: subtracted in full for every state EXCEPT California,
  // which never fully exempted it -- CA taxed military retirement like any
  // pension until 2025, and now excludes at most $20,000, AGI-tested and
  // sunsetting after 2029 (see californiaMilitaryExclusion). Every other
  // modeled state's full subtraction stands: IL and PA exempt all
  // retirement income anyway, NY treats military as a government pension
  // (fully exempt), and the generic flat-rate state keeps the simple rule.
  const militaryExcluded = (stateType === 'ca')
    ? californiaMilitaryExclusion(militaryPension, federalAGI, status, calendarYear)
    : (stateType === 'va')
      ? virginiaMilitarySubtraction(militaryPension, pensionDetail)
      : (stateType === 'co')
        ? coloradoMilitarySubtraction(militaryPension, age1, age2, status, calendarYear)
        : militaryPension;
  let taxablePension = Math.max(0, pension - militaryExcluded);
  
  // Apply state-specific SS exemption rules
  // Colorado (audit Q-14a, changelog 125): Social Security is exempt in
  // full only from 65 (C.R.S. s 39-22-104(4)(f), TY2022+). At 55-64 it is
  // exempt in full when federal AGI is at or under $75,000 single /
  // $95,000 joint (TY2025+, HB 24-1142); above that it competes with
  // pensions and IRA money for the $20,000 cap below. Under 55 nothing is
  // subtracted. Benefits are split evenly between the spouses of a joint
  // return (the engine does not attribute a household benefit per spouse).
  // The full SS subtraction is not extra to the pension cap: per Colorado
  // DOR ("Social Security, Pensions, and Annuities", tax.colorado.gov),
  // "any subtraction claimed for Social Security benefits will reduce the
  // subtraction an individual can claim for any other pension and annuity
  // income." So each person's $24,000 / $20,000 room for pensions and IRA
  // money is what their Social Security left of it. (The engine used to
  // subtract all of the SS AND a further full $24,000.)
  let coSsInCap = 0;
  let coCapRoom = 0;
  if (stateType === 'co') {
    const coAgiLimit = status === 'MFJ' ? 95000 : 75000;
    const ages = status === 'MFJ' ? [age1, age2] : [age1];
    const perPerson = ssInIncome / ages.length;
    let remaining = 0;
    for (const a of ages) {
      const cap = a >= 65 ? 24000 : a >= 55 ? 20000 : 0;
      if (a >= 65 || (a >= 55 && federalAGI <= coAgiLimit)) {
        coCapRoom += Math.max(0, cap - perPerson);       // fully subtracted, uses the cap
      } else if (a >= 55) {
        coSsInCap += perPerson;                          // within the $20,000 cap
        coCapRoom += cap;
      } else {
        remaining += perPerson;                          // under 55: taxed
      }
    }
    taxableSS = remaining;
  } else if (['ca', 'ny', 'il', 'pa', 'va'].includes(stateType)) {
    taxableSS = 0; // Social security is fully exempt in these states
  } else {
    if (!taxSS) taxableSS = 0;
  }
  
  // Apply state-specific pension exemption rules
  let nyExclusionRoom = 0;
  let coPensionCap = 0;
  if (['il', 'pa'].includes(stateType)) {
    taxablePension = 0; // Pension is fully exempt in Illinois and Pennsylvania
  } else if (stateType === 'ny') {
    // New York has TWO separate pension exclusions, and the difference
    // between them is large. Verified 2026-08-20 against tax.ny.gov's
    // "Information for retired persons" and Tax Law s 612(c)(3) / (3-a).
    //
    //   1. Government pensions -- New York State, a NY local government, or
    //      the FEDERAL government -- are excluded IN FULL. No dollar cap and
    //      no age test: "you may subtract the amount of distribution that was
    //      included in your federal adjusted gross income, regardless of your
    //      age or of the form the payment(s) take." This is IT-201 line 26.
    //      A federal retiree with a $60,000 pension excludes all $60,000.
    //
    //   2. Everything else qualifying gets the $20,000 exclusion, from age
    //      59 1/2. IT-201 line 29. The statute defines this as pensions "not
    //      otherwise excluded pursuant to paragraph three", i.e. it applies
    //      to what the government exclusion did not already cover -- so a
    //      government retiree with separate private pension income can use
    //      both, on different money.
    //
    // Two things this used to get wrong. It applied the $20,000 cap to
    // government pensions, badly overstating tax for the many New Yorkers
    // with a state, local, or federal pension. And it granted a second
    // $20,000 whenever both spouses were 59 1/2, even if only one of them
    // actually had pension income -- NY is explicit that the exclusion is per
    // recipient and that "neither of you can claim any unused part of your
    // spouse's exclusion", so that under-taxed a single-pension couple.
    if (pensionDetail) {
      const exempt = Math.max(0, pensionDetail.stateExempt || 0);
      const p1 = Math.max(0, pensionDetail.private1 || 0);
      const p2 = Math.max(0, pensionDetail.private2 || 0);
      // Capped at that spouse's OWN income -- no borrowing, no pooling.
      const excl1 = age1 >= 59.5 ? Math.min(20000, p1) : 0;
      const excl2 = (status === 'MFJ' && age2 >= 59.5) ? Math.min(20000, p2) : 0;
      taxablePension = Math.max(0, pension - exempt - excl1 - excl2);
      // Whatever each 59 1/2+ spouse's $20,000 didn't use on pension is
      // available for IRA / 401(k) distributions and conversions below.
      nyExclusionRoom = (age1 >= 59.5 ? 20000 - excl1 : 0) + ((status === 'MFJ' && age2 >= 59.5) ? 20000 - excl2 : 0);
    } else {
      // No breakdown supplied (direct callers and older tests). Falls back to
      // the previous approximation rather than silently exempting nothing.
      let exclusion = 0;
      if (age1 >= 59.5) exclusion += 20000;
      if (status === 'MFJ' && age2 >= 59.5) exclusion += 20000;
      nyExclusionRoom = Math.max(0, exclusion - Math.min(exclusion, Math.max(0, pension - militaryExcluded)));
      taxablePension = Math.max(0, pension - exclusion);
    }
  } else if (stateType === 'co') {
    // Colorado's pension-and-annuity subtraction (s 39-22-104(4)(f)) is
    // $24,000 per person 65+, $20,000 at 55-64, nothing under 55, and it
    // covers pensions, IRA/401(k) distributions that are not premature, and
    // (55-64, over the AGI limit) Social Security together. The cap is
    // computed here and applied below once the IRA money is known.
    // coCapRoom is the per-person caps less any Social Security that was
    // subtracted in full above (it shares the same cap).
    coPensionCap = coCapRoom;
  } else if (stateType === 'va') {
    // Virginia taxes pensions and retirement withdrawals in full; the only
    // source-based break is the military subtraction already taken out of
    // taxablePension above. Rules auto-apply, so the generic taxPension
    // toggle is deliberately ignored, same as the other modeled states.
  } else {
    if (!taxPension) taxablePension = 0;
  }

  // Retirement-account distributions (changelog 120, audit Q-15). Verified
  // 2026-09-02 against the statutes and each department's own guidance:
  //   Illinois -- 35 ILCS 5/203(a)(2)(F): distributions from qualified
  //     plans, IRAs and Roth conversions are subtracted in full, at any
  //     age (IL-1040 Schedule M / line 5).
  //   Pennsylvania -- 72 P.S. s 7301(d); PA PIT Guide ch. 7: distributions
  //     from an eligible employer plan or IRA after retirement age (59 1/2
  //     for an IRA) are not compensation and are untaxed; a Roth conversion
  //     is a rollover and never taxable in PA. Before 59 1/2 PA taxes only
  //     the amount above the taxpayer's own contributions -- this model
  //     taxes the whole early distribution (basis tracking per account is
  //     outside the engine), which is conservative.
  //   New York -- Tax Law s 612(c)(3-a); TSB-M-98(7)I: the $20,000
  //     pension-and-annuity exclusion covers IRA / 401(k) distributions and
  //     Roth conversion income from 59 1/2, sharing each recipient's single
  //     $20,000 cap with any private pension. The engine's Pre-Tax bucket
  //     is household-level, so the room is pooled across the 59 1/2+
  //     spouses rather than attributed per owner -- exact for one IRA
  //     owner, at most $20,000 too generous for a couple who each hold an
  //     IRA but only one of whom has income to exclude.
  // Before this, only `pension` was exempted and every IRA withdrawal, RMD
  // and conversion was taxed at the full state rate -- overstating the
  // cost of a Roth ladder by 4.95% (IL) / 3.07% (PA) of every dollar.
  const retirementDistributions = Math.max(0, extras.retirementDistributions || 0);
  const rothConversionTaxable = Math.max(0, extras.rothConversionTaxable || 0);
  const ownerAge = (age1 !== null && age1 !== undefined) ? age1 : age2;
  let exemptDistributions = 0;
  if (stateType === 'il') {
    exemptDistributions = retirementDistributions + rothConversionTaxable;
  } else if (stateType === 'pa') {
    exemptDistributions = rothConversionTaxable + (ownerAge >= 59.5 ? retirementDistributions : 0);
  } else if (stateType === 'ny') {
    exemptDistributions = Math.min(retirementDistributions + rothConversionTaxable, Math.max(0, nyExclusionRoom));
  } else if (stateType === 'co') {
    // Q-14(c): IRA and 401(k) distributions (federal line 4b, not
    // premature) and Roth conversion income share the per-person cap with
    // pensions and any 55-64 Social Security over the AGI limit. A
    // premature distribution (owner under 59 1/2) does not qualify.
    const iraEligible = ownerAge >= 59.5 ? retirementDistributions + rothConversionTaxable : 0;
    const eligible = taxablePension + iraEligible + coSsInCap;
    // The SS-in-cap slice stays in the base so the cap can absorb it; the
    // whole subtraction is then expressed through exemptDistributions.
    taxableSS += coSsInCap;
    exemptDistributions = Math.min(eligible, coPensionCap);
  }

  // Adjusted taxable income for state
  let stateTaxableIncome = income - ssInIncome - pension + taxableSS + taxablePension - exemptDistributions;
  // Colorado starts from FEDERAL TAXABLE INCOME (s 39-22-104(1); DR 0104
  // line 1), so the federal standard deduction comes off the base (audit
  // Q-14e). The projection passes it in extras; direct callers that omit
  // it keep the pre-deduction base.
  if (stateType === 'co') stateTaxableIncome -= Math.max(0, extras.federalDeduction || 0);
  // Pennsylvania does not exclude an employee's own 401(k)/403(b) elective
  // deferrals from compensation (PA PIT Guide, "Gross Compensation":
  // contributions "to an IRC Section 401 plan are not excludable from
  // Pennsylvania-taxable compensation"), so the Pre-Tax deferrals the federal
  // base left out come back in. HSA contributions stay out (PA allows the
  // HSA deduction) and so do NQDC deferrals (taxed by PA when paid, not
  // when deferred).
  if (stateType === 'pa') stateTaxableIncome += Math.max(0, extras.paCompensationAddback || 0);
  if (stateTaxableIncome <= 0) return 0;
  
  if (stateType === 'flat_5') {
    return stateTaxableIncome * (flatRate / 100);
  }
  if (stateType === 'il') {
    // Illinois' exemption allowance comes off the base before the flat rate
    // (audit Q-17, changelog 126); above the AGI cliff it is simply zero.
    const ilTaxable = stateTaxableIncome - illinoisExemptionAllowance(federalAGI, status, age1, age2);
    if (ilTaxable <= 0) return 0;
    return ilTaxable * 0.0495; // Illinois flat rate
  }
  if (stateType === 'co') {
    return stateTaxableIncome * 0.044; // Colorado flat rate
  }
  if (stateType === 'pa') {
    return stateTaxableIncome * 0.0307; // Pennsylvania flat rate
  }

  if (stateType === 'va') {
    // Virginia taxable income = the SS-and-military-adjusted base, less the
    // standard deduction, personal exemptions ($930 each + $800 each 65+),
    // and the age deduction. AFAGI for the age-deduction phase-out is
    // federal AGI with its taxable Social Security backed out. MFS uses the
    // single-filer schedule and deduction (like CA/NY below) but the
    // married phase-out threshold, per the statute's "married taxpayers"
    // language. Spouse ages only count on a joint return.
    const isMFJ = status === 'MFJ';
    const vaStd = isMFJ ? VA_STD_DEDUCTION_MFJ : VA_STD_DEDUCTION_SINGLE;
    let vaExemptions = VA_PERSONAL_EXEMPTION * (isMFJ ? 2 : 1);
    if (age1 >= 65) vaExemptions += VA_AGE_EXEMPTION;
    if (isMFJ && age2 >= 65) vaExemptions += VA_AGE_EXEMPTION;
    const afagi = Math.max(0, federalAGI - ssInIncome);
    const vaAgeDeduction = virginiaAgeDeduction(afagi, status, age1, age2, calendarYear);
    const vaTaxable = stateTaxableIncome - vaStd - vaExemptions - vaAgeDeduction;
    if (vaTaxable <= 0) return 0;
    return applyStateBrackets(vaTaxable, BRACKETS_VA);
  }

  // MFS falls through to the SINGLE schedule for both states below. Both
  // are now verified correct, from each state's own primary source.
  //
  // California: the FTB's own 540 rate schedules put "Single or Married/RDP
  // Filing Separately" together on Schedule X, so MFS and Single genuinely
  // share brackets.
  //
  // New York: confirmed 2026-08-20 from the statute. NY Tax Law s 601(c) is
  // headed "Resident unmarried individuals, resident married individuals
  // filing separate returns and resident estates and trusts" -- one schedule
  // covering all three. There is no separate MFS subsection, and MFS
  // thresholds are NOT half of joint (single's second bracket ends at
  // $11,700; half of joint's $23,600 would be $11,800). The department's own
  // tax tables carry the same column heading, "Single or Married filing
  // separately".
  if (stateType === 'ca') {
    // California does not conform to federal HSA law: contributions are not
    // deductible for state purposes and the account's internal earnings are
    // taxable annually. The projection passes both as one addback; the
    // addback joins taxable income BEFORE the brackets and the BHS
    // surcharge, since both operate on California taxable income.
    // The California standard deduction (audit Q-17, changelog 126) comes
    // off after the HSA addback and before the brackets. California has no
    // extra standard deduction at 65 -- age shows up in the exemption
    // credits below instead.
    // Every figure carries forward from its 2025 vintage (changelog 430);
    // the $1,000,000 surcharge threshold is statutory and does not.
    const caIndex = californiaIndexFactor(extras);
    const caStd = ((status === 'MFJ') ? CA_STD_DEDUCTION_MFJ : CA_STD_DEDUCTION_SINGLE) * caIndex;
    const caTaxableIncome = Math.max(0, stateTaxableIncome + Math.max(0, extras.hsaAddback || 0) - caStd);
    if (caTaxableIncome <= 0) return 0;
    const brackets = ((status === 'MFJ') ? BRACKETS_CA_MFJ : BRACKETS_CA_SINGLE)
      .map((b) => ({ limit: b.limit === Infinity ? Infinity : b.limit * caIndex, rate: b.rate }));
    // Surcharge added on top of the bracket result, not merged into it --
    // see californiaBehavioralHealthServicesTax for why that distinction
    // matters for joint filers between $1,000,000 and $1,485,906.
    const beforeCredits = applyStateBrackets(caTaxableIncome, brackets)
      + californiaBehavioralHealthServicesTax(caTaxableIncome);
    // Exemption credits come off the TAX, not the income -- modeling them
    // as deductions is the mistake the KNOWN_ISSUES entry warned against.
    // They cannot drive the liability below zero (nonrefundable).
    return Math.max(0, beforeCredits - californiaExemptionCredits(federalAGI, status, age1, age2, caIndex));
  }

  if (stateType === 'ny') {
    const era = newYorkEraForYear(calendarYear);
    const brackets = (status === 'MFJ') ? era.mfj : era.single;
    // In the 2026 and 2027-2032 eras, above $25M of AGI the statute
    // abandons the graduated schedule: the whole taxable income is taxed at
    // the top rate (s 601(d-5)/(d-6) last clause; IT-2105-I "Multiply line
    // 1 by 10.9%"). The 2033+ era has no such clause. Otherwise: brackets
    // plus the era's tax table benefit recapture.
    // The New York standard deduction (audit Q-17, changelog 126) comes off
    // the base to reach taxable income. The $25M flat clause and the tax
    // table benefit recapture are both measured against NY AGI -- the
    // PRE-deduction figure -- while the rate schedule runs on taxable
    // income, so the two are now passed separately to the recapture (it
    // takes agi and ti; before the deduction existed they were the same
    // number).
    const nyStd = (status === 'MFJ') ? NY_STD_DEDUCTION_MFJ : NY_STD_DEDUCTION_SINGLE;
    const nyTaxableIncome = Math.max(0, stateTaxableIncome - nyStd);
    const stateTax = (era.flatAgi !== null && stateTaxableIncome > era.flatAgi)
      ? nyTaxableIncome * era.flatRate
      : applyStateBrackets(nyTaxableIncome, brackets)
        + newYorkBenefitRecapture(stateTaxableIncome, nyTaxableIncome, status, calendarYear);
    // Yonkers is a multiplier on the state liability, so it has to be applied
    // after (brackets + recapture) rather than folded into them. The
    // recapture is part of the state tax the surcharge multiplies: the
    // Yonkers rate applies to the "net state tax", which the IT-201 reaches
    // via these same worksheets.
    const withYonkers = yonkersResident ? stateTax * (1 + YONKERS_RESIDENT_SURCHARGE) : stateTax;
    // New York City's resident tax is additive, with its own schedule on
    // the same taxable-income base (SS exempt, pension exclusions flow
    // through). It is NOT part of the figure Yonkers multiplies -- the two
    // residencies are mutually exclusive in reality and the UI enforces
    // that, but computing them independently keeps this correct even if
    // both flags somehow arrive true.
    // NYC's schedule runs on NY taxable income (IT-201 line 47 starts from
    // line 38, after the standard deduction), so it uses the same
    // post-deduction figure the state brackets do.
    const nycTax = extras.nycResident ? newYorkCityTax(nyTaxableIncome, status) : 0;
    return withYonkers + nycTax;
  }

  return 0;
}

// State income tax from a STATE_TAX_RULES record (changelog 361; TAX_RULES_SPEC
// Rule 4.9). One return: the caller has already split a two-return MFS
// household. Only MFJ uses the joint schedule; every other status the
// single one. The household's IRA money is not attributed to a spouse, so
// per-person exclusion caps are pooled across the spouses who qualify (as
// New York's is). Figures marked indexed are carried forward by the
// year's bracket factor; the rest stay at their statutory dollars.
export function stateRulesTax(rules, c) {
  const mfj = c.status === 'MFJ';
  const st = mfj ? 'mfj' : 'single';
  const ages = mfj ? [c.age1, c.age2] : [c.age1];
  const people = ages.length;
  const fB = rules.bracketsIndexed ? (c.inflationFactor || 1) : 1;
  const fD = rules.deductionsIndexed ? (c.inflationFactor || 1) : 1;
  const agi = Math.max(0, c.federalAGI);
  const ssIn = Math.max(0, c.ssInIncome || 0);

  // Social Security: what of the federally taxable benefit stays in.
  let taxableSS = ssIn;
  const ssRule = rules.socialSecurity;
  if (ssRule === 'exempt') taxableSS = 0;
  else if (ssRule && typeof ssRule === 'object' && ssRule.exemptIfAgiBelow) {
    if (agi <= ssRule.exemptIfAgiBelow[st] * fD) taxableSS = 0;
    // Connecticut, above its line: at most a share of the gross benefit.
    else if (ssRule.maxTaxableShare != null) taxableSS = Math.min(ssIn, ssRule.maxTaxableShare * Math.max(0, c.ss || 0));
  }

  // Pensions the state exempts by source: military, and (where the state
  // exempts them) federal, state and local government pensions.
  // pensionDetail.stateExempt holds government and military together.
  const military = Math.max(0, c.militaryPension || 0);
  const govAndMilitary = c.pensionDetail ? Math.max(military, c.pensionDetail.stateExempt || 0) : military;
  let sourceExempt = 0;
  if (rules.govPensionExempt) sourceExempt = rules.militaryExempt ? govAndMilitary : govAndMilitary - military;
  else if (rules.militaryExempt) sourceExempt = military;
  sourceExempt = Math.min(Math.max(0, c.pension), Math.max(0, sourceExempt));
  const pensionLeft = Math.max(0, c.pension - sourceExempt);

  // The retirement exclusion.
  let exclusion = 0;
  const re = rules.retirementExclusion;
  if (re) {
    const fR = re.indexed ? (c.inflationFactor || 1) : 1;
    const tierFor = (age) => re.tiers.reduce((best, t) => (age >= t.minAge ? t : best), null);
    const distributions = Math.max(0, c.retirementDistributions || 0);
    // Michigan and Mississippi: IRA withdrawals and conversions qualify only
    // from 59 1/2. The bucket is household-level, so the older spouse's age
    // stands in for the owner's.
    const iraQualifies = !(re.iraMinAge > 0) || Math.max(...ages.map((a) => a ?? -1)) >= re.iraMinAge;
    const investment = (re.covers.investment && Number.isFinite(c.earnedIncome))
      ? Math.max(0, agi - c.earnedIncome - ssIn - c.pension - distributions) : 0;
    const eligible = (re.covers.pension ? pensionLeft : 0) + (re.covers.ira && iraQualifies ? distributions : 0) + investment;
    let cap = 0;
    let unlimited = false;
    if (re.perReturn) {
      const t = tierFor(Math.max(...ages.map((a) => a ?? -1)));
      if (t) {
        if (t.amount === null) unlimited = true;
        else cap = (mfj && t.amountMfj != null ? t.amountMfj : t.amount) * fR;
        if (re.reducedBySS) cap = Math.max(0, cap - Math.max(0, c.ss || 0));
      }
    } else {
      const ssEach = Math.max(0, c.ss || 0) / people;
      for (const a of ages) {
        const t = tierFor(a ?? -1);
        if (!t) continue;
        if (t.amount === null) { unlimited = true; continue; }
        cap += Math.max(0, t.amount * fR - (re.reducedBySS ? ssEach : 0));
      }
    }
    let share = 1;
    if (re.agiPhase) {
      const test = re.phaseExcludesSS ? agi - ssIn : agi;
      const step = re.agiPhase.find((p) => test <= p.agiUpTo[st]);
      share = step ? (mfj && step.shareMfj != null ? step.shareMfj : step.share) : 0;
    }
    if (unlimited) exclusion = eligible * share;
    else if (re.ofIncome && share < 1) exclusion = eligible * share;
    else exclusion = Math.min(eligible, cap * share);
  }

  let base = agi - ssIn + taxableSS - sourceExempt - exclusion
    - (rules.capitalGainsExempt ? Math.min(c.longTermGains || 0, agi) : 0);
  if (rules.base === 'federalTaxable') base -= Math.max(0, c.federalDeduction || 0);
  const seniors = ages.filter((a) => a >= 65).length;
  // Arizona takes the federal deduction without the s 63(f) 65+ add-on.
  const std = rules.standardDeduction === 'federal'
    ? Math.max(0, (c.federalDeduction || 0) - (rules.excludeFederalAged65 ? additionalStandardDeductionAged(c.status, seniors, c.inflationFactor || 1) : 0))
    : (rules.standardDeduction ? rules.standardDeduction[st] : 0) * fD;
  const extra65 = typeof rules.extraDeduction65 === 'object' && rules.extraDeduction65 !== null
    ? rules.extraDeduction65[st] : rules.extraDeduction65;
  const taxable = Math.max(0, base - std - (rules.personalExemption * people + extra65 * seniors) * fD);
  if (taxable <= 0) return 0;

  const brackets = rules.brackets[st].map((b) => ({ limit: b.limit === null ? Infinity : b.limit * fB, rate: b.rate }));
  let tax = applyStateBrackets(taxable, brackets);
  if (rules.surtax) tax += Math.max(0, taxable - rules.surtax.over * (c.inflationFactor || 1)) * rules.surtax.rate;
  tax = Math.max(0, tax - rules.personalCredit * people);
  return tax + taxable * (rules.localRate || 0);
}

function applyStateBrackets(taxableIncome, brackets) {
  let tax = 0;
  let prevLimit = 0;
  for (let i = 0; i < brackets.length; i++) {
    const currentLimit = brackets[i].limit;
    const rate = brackets[i].rate;
    if (taxableIncome > currentLimit) {
      tax += (currentLimit - prevLimit) * rate;
      prevLimit = currentLimit;
    } else {
      tax += (taxableIncome - prevLimit) * rate;
      break;
    }
  }
  return tax;
}

export function calculateTaxes(taxableIncome, status, inflationFactor = 1, useTcjaSunset = false, mfsSplitPct = MFS_DEFAULT_INCOME_SPLIT_PCT) {
  if (status === 'MFS' && isReturnSpec(mfsSplitPct)) {
    // Two returns, each with its own deduction: taxable income is floored
    // per return, so the household figure passed in is not used.
    return mfsReturnsOf(mfsSplitPct).reduce((t, r) => t + ordinaryTaxForOneReturn(r.taxable, status, inflationFactor, useTcjaSunset), 0);
  }
  return forEachSeparateReturn(status, [taxableIncome], mfsSplitPct,
    ([ti]) => ordinaryTaxForOneReturn(ti, status, inflationFactor, useTcjaSunset));
}

function ordinaryTaxForOneReturn(taxableIncome, status, inflationFactor = 1, useTcjaSunset = false) {
  if (taxableIncome <= 0) return 0;
  const brackets = useTcjaSunset
    ? bracketsFor(status, true)
    : bracketsFor(status);
  let tax = 0;
  let prevLimit = 0;

  for (let i = 0; i < brackets.length; i++) {
    const currentLimit = brackets[i].limit === Infinity ? Infinity : brackets[i].limit * inflationFactor;
    const rate = brackets[i].rate;
    if (taxableIncome > currentLimit) {
      tax += (currentLimit - prevLimit) * rate;
      prevLimit = currentLimit;
    } else {
      tax += (taxableIncome - prevLimit) * rate;
      break;
    }
  }
  return tax;
}

// unusedDeduction (changelog 124, audit Q-3): the part of the standard
// deduction that ordinary income did not use up. Taxable income is AGI
// minus the deduction, and the 0%/15%/20% bands stack on TAXABLE income,
// so a retiree living off a brokerage account with $10,000 of ordinary
// income and a $32,200 deduction has $22,200 of gains sheltered entirely
// before the 0% band even starts (Schedule D Tax Worksheet). Callers pass
// max(0, deduction - ordinaryIncomeBeforeDeduction); omitting it keeps the
// old floor-at-zero behavior.
// otherNetInvestmentIncome (changelog 125, audit Q-10a): net rental income
// and non-qualified annuity income are ordinary income for the brackets but
// are ALSO net investment income under s.1411(c)(1)(A)(i), so they widen
// the NIIT base without touching the 0/15/20% stacking. Pass the year's
// rental + annuity income; omitting it keeps the gains-only NIIT base.
export function calculateCapitalGainsTaxes(ordinaryIncome, capitalGains, status, inflationFactor = 1, standardDeduction = 0, unusedDeduction = 0, otherNetInvestmentIncome = 0, mfsSplitPct = MFS_DEFAULT_INCOME_SPLIT_PCT) {
  if (status === 'MFS' && isReturnSpec(mfsSplitPct)) return capGainsTaxOnReturns(mfsSplitPct, capitalGains, status, inflationFactor, otherNetInvestmentIncome, false);
  // Every figure here is a dollar amount that divides between the two
  // separate returns in the same proportion, so the whole computation --
  // the 0/15/20% bands AND the NIIT threshold test -- runs once per return
  // (audit Q-1).
  return forEachSeparateReturn(
    status,
    [ordinaryIncome, capitalGains, standardDeduction, unusedDeduction, otherNetInvestmentIncome],
    mfsSplitPct,
    ([oi, cg, sd, ud, oni]) => capGainsTaxForOneReturn(oi, cg, status, inflationFactor, sd, ud, oni),
  );
}

// The 3.8% net investment income tax alone -- the part of
// calculateCapitalGainsTaxes that no foreign tax credit can ever reduce
// (IRC s 1411 sits in Chapter 2A; ss 27/901 credits run against Chapter 1;
// the Federal Circuit reversed the treaty-credit cases on 2026-08-31,
// Christensen v. United States, No. 2024-1284). Same arguments, same
// per-return split. Changelog 196.
export function calculateNetInvestmentIncomeTax(ordinaryIncome, capitalGains, status, inflationFactor = 1, standardDeduction = 0, unusedDeduction = 0, otherNetInvestmentIncome = 0, mfsSplitPct = MFS_DEFAULT_INCOME_SPLIT_PCT) {
  if (status === 'MFS' && isReturnSpec(mfsSplitPct)) return capGainsTaxOnReturns(mfsSplitPct, capitalGains, status, inflationFactor, otherNetInvestmentIncome, true);
  return forEachSeparateReturn(
    status,
    [ordinaryIncome, capitalGains, standardDeduction, unusedDeduction, otherNetInvestmentIncome],
    mfsSplitPct,
    ([oi, cg, sd, ud, oni]) => capGainsTaxForOneReturn(oi, cg, status, inflationFactor, sd, ud, oni, true),
  );
}

// Two MFS returns with their own deductions: gains and other NII divide in
// the income proportion; each return stacks its share of the gains on its
// OWN taxable ordinary income and shelters them with its OWN unused
// deduction.
function capGainsTaxOnReturns(spec, capitalGains, status, inflationFactor, otherNetInvestmentIncome, niitOnly) {
  return mfsReturnsOf(spec).reduce((t, r) => t + capGainsTaxForOneReturn(
    r.taxable, capitalGains * r.share, status, inflationFactor, r.deduction, r.unusedDeduction, (otherNetInvestmentIncome || 0) * r.share, niitOnly,
  ), 0);
}

// niitOnly returns just the NIIT slice; every existing caller omits it and
// gets the combined figure exactly as before.
function capGainsTaxForOneReturn(ordinaryIncome, capitalGains, status, inflationFactor = 1, standardDeduction = 0, unusedDeduction = 0, otherNetInvestmentIncome = 0, niitOnly = false) {
  const otherNii = Math.max(0, otherNetInvestmentIncome || 0);
  if (capitalGains <= 0) {
    // No gains, but rents/annuities can still owe NIIT on their own.
    if (otherNii <= 0) return 0;
    const magiNoGains = Math.max(0, ordinaryIncome) + Math.max(0, standardDeduction) - Math.max(0, unusedDeduction);
    const thresh = status === 'MFJ' ? 250000 : status === 'MFS' ? 125000 : 200000;
    return magiNoGains > thresh ? Math.min(otherNii, magiNoGains - thresh) * 0.038 : 0;
  }
  const base = Math.max(0, ordinaryIncome);
  // AGI for the NIIT test: taxable ordinary income + the full gains + the
  // deduction that was actually used. Computed before the gains are
  // reduced, because NIIT is on MAGI, not taxable income.
  const magiForNiit = base + capitalGains + Math.max(0, standardDeduction) - Math.max(0, unusedDeduction);
  const grossGains = capitalGains;
  capitalGains = Math.max(0, capitalGains - Math.max(0, unusedDeduction));
  if (capitalGains <= 0 && grossGains > 0) {
    // Fully sheltered from the rate bands; NIIT can still apply on MAGI.
    const niitThreshEarly = status === 'MFJ' ? 250000 : status === 'MFS' ? 125000 : 200000;
    return magiForNiit > niitThreshEarly ? Math.min(grossGains + otherNii, magiForNiit - niitThreshEarly) * 0.038 : 0;
  }
  
  // Long-term capital gains brackets — tax year 2026 (IRS Rev. Proc. 2025-32)
  // MFS = half of MFJ (Rev. Proc. 2025-32). Matches Single at the 0% edge
  // but not the 15% one: $306,850 against Single's $545,500.
  const thresh15 = (status === 'MFJ' ? 98900 : 49450) * inflationFactor;
  const thresh20 = (status === 'MFJ' ? 613700 : status === 'MFS' ? 306850 : 545500) * inflationFactor;
  
  let tax = 0;
  let niit = 0;
  const total = base + capitalGains;
  
  // 15% rate bracket
  const start15 = Math.max(base, thresh15);
  const end15 = Math.min(total, thresh20);
  if (end15 > start15) {
    tax += (end15 - start15) * 0.15;
  }
  
  // 20% rate bracket
  const start20 = Math.max(base, thresh20);
  if (total > start20) {
    tax += (total - start20) * 0.20;
  }
  
  // Net Investment Income Tax (NIIT) - 3.8% on the lesser of net investment
  // income or MAGI over $250k MFJ / $125k MFS / $200k Single (IRC 1411).
  // Two things matter here that the brackets above don't share:
  //   1. The thresholds are set by statute and are NOT inflation-indexed --
  //      they have been the same dollars since 2013 and are deliberately
  //      left un-multiplied by inflationFactor, so bracket creep pulls more
  //      households across them as nominal income grows. (An earlier
  //      version indexed them, quietly suppressing the tax in later years.)
  //   2. The test is against MAGI (AGI for nearly everyone), not taxable
  //      income after the standard deduction -- so the deduction is added
  //      back when the caller supplies it.
  const niitThresh = status === 'MFJ' ? 250000 : status === 'MFS' ? 125000 : 200000;
  const magi = magiForNiit;
  if (magi > niitThresh) {
    const excess = magi - niitThresh;
    const niitTaxable = Math.min(grossGains + otherNii, excess);
    niit = niitTaxable * 0.038;
    tax += niit;
  }
  
  return niitOnly ? niit : tax;
}


// Derived from BRACKETS_MFJ / BRACKETS_SINGLE (single source of truth) rather
// than a third copy of the literal bracket dollar amounts.
export function getTaxBracketLimit(status, rate, inflationFactor = 1) {
  const brackets = bracketsFor(status);
  const limits = brackets.reduce((acc, b) => { acc[b.rate] = b.limit; return acc; }, {});
  const val = limits[rate];
  if (val === undefined) return 0;
  if (val === Infinity) return Infinity;
  return val * inflationFactor;
}

// IRS Publication 590-B Uniform Lifetime Table (2022 update, current as of 2026).
// Covers the full table through age 120+ so long-life-expectancy plans (this
// app allows unbounded lifeExpectancy1/2 inputs) don't silently understate
// RMDs/taxes in the tail years by flatlining at the age-95 factor.
//
// Changelog 416: given the sole-beneficiary spouse's age as well, an owner
// whose spouse is more than 10 years younger (the ages both attain in the
// year, Reg. 1.401(a)(9)-5(c)(2)) reads Table II, the Joint and Last
// Survivor table, which stretches the divisor and lowers the RMD -- a
// 75-year-old with a 60-year-old spouse divides by 28.3, not 24.6. A gap
// of 10 years or less, no spouse, or a spouse who is not the sole
// beneficiary reads Table III as before.
export function getRMDDivisor(age, spouseAge = null) {
  if (age < 73) return 0;
  if (spouseAge !== null && spouseAge !== undefined && Number.isFinite(Number(spouseAge)) && age - spouseAge > 10) {
    const row = JOINT_LIFE_TABLE_II[Math.min(120, Math.floor(age))];
    const col = Math.max(JOINT_LIFE_TABLE_II_SPOUSE_MIN_AGE, Math.floor(spouseAge)) - JOINT_LIFE_TABLE_II_SPOUSE_MIN_AGE;
    if (row && col < row.length) return row[col];
  }
  const divisorTable = {
    73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
    80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2,
    87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1,
    94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4,
    101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1,
    108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0,
    115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3
  };
  if (age >= 120) return 2.0;
  return divisorTable[age] || 0;
}

// 2026 Medicare Part B IRMAA brackets & total monthly premiums.
// Source: CMS "2026 Medicare Parts A & B Premiums and Deductibles" fact sheet
// (cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles).
// NOTE: IRMAA is based on MAGI from two years prior (2024 MAGI determines
// 2026 premiums). This function prices whatever MAGI it is handed against
// the thresholds it is handed; runProjection passes it the two-years-prior
// MAGI (changelog 121) while other callers may pass a current-year figure.
//
// Exported as named constants (rather than inlined only in calculateIRMAA)
// so TaxEstateTab.jsx's bracket-visualizer chart can derive its IRMAA tier
// thresholds from these same numbers instead of keeping its own hardcoded
// copy — that duplication caused real drift bugs earlier (see #15 in the
// project's fix history). One place to update per year now, not two.
export const IRMAA_STANDARD_PREMIUM = 202.90;
export const IRMAA_TIER_PREMIUMS = [284.10, 405.80, 527.50, 649.20, 689.90];
export const IRMAA_THRESHOLDS_MFJ = [218000, 274000, 342000, 410000, 750000];
export const IRMAA_THRESHOLDS_SINGLE = [109000, 137000, 171000, 205000, 500000];
// MFS while living together is the one schedule with a genuinely different
// SHAPE rather than different numbers: three brackets instead of six, and
// crossing the first one jumps straight to the second-highest premium.
// $202.90 standard, then $649.20 above $109,000, then $689.90 at $391,000
// (2026 Medicare Part B release). The unused tiers are Infinity so the
// highest-to-lowest walk in calculateIRMAA lands correctly with no special
// casing. Living apart all year is treated as Single, which is the rule.
export const IRMAA_THRESHOLDS_MFS_TOGETHER = [Infinity, Infinity, Infinity, 109000, 391000];

// partBInflationFactor defaults to 1 (no growth) so existing callers that
// don't pass it keep getting the flat 2026 premium schedule, unchanged.
// thresholdInflationFactor (also defaults to 1) separately controls whether
// the MAGI dollar thresholds themselves grow -- in reality CMS does adjust
// these annually, similar to tax brackets, so callers should normally pass
// the same taxBracketInflationFactor used elsewhere unless the
// irmaaFreezeEnabled scenario is active (see its DEFAULT_INPUTS comment).
// Resolves the IRMAA table, including MFS's three-bracket variant. Kept as
// a function rather than a ternary at both call sites so the two can't
// drift -- they already had to be unified once (see the note above).
// ---------------------------------------------------------------------------
// Retirement Spending bridge (rung 2, changelog 135)
//
// Turns "what you spend now" into a defensible `lifestyleExpense`. Kept here,
// as a pure function of (inputs, residual), so the arithmetic is testable on
// its own and the UI cannot drift from it.
//
// THE RULE THAT MAKES THIS HARD. `lifestyleExpense` is NOT total retirement
// spending. It is total retirement spending minus every line the projection
// already adds for itself. runProjection sums:
//
//   expensesExcludingTaxes = lifestyleCost + goGoBump + healthcareBridge
//     + ltcCost + irmaaCost + milestoneOutflowGeneral + totalDebtPayment
//     + gifts
//
// So anything on that list must come OUT of the bridge's answer, or the plan
// charges it twice -- silently, and for the whole retirement. The single box
// on Plan Settings gives no hint that health, debt, LTC and Medicare live
// elsewhere, which is why a hand-entered figure is so often too high.
//
// What the bridge does NOT have to subtract, because the residual already
// did: payroll and income tax (the residual nets baseTaxes) and savings and
// contributions (it nets totalContributions). Saying so on the page is worth
// as much as the subtractions -- it is why the answer is smaller than people
// expect.
// ---------------------------------------------------------------------------
// Retirement Spending ledger (rung 3, changelog 137)
//
// Canonical category ids. These are STORED in user data and in saved
// scenarios, so they are permanent: rename a label freely, never an id.
// Seven ordinary categories, deliberately few -- a ledger nobody finishes is
// worse than the single box it replaces -- plus a custom escape hatch so the
// list never has to fit everyone's life exactly.
export const SPENDING_CATEGORIES = [
  { id: 'housing', label: 'Housing', hint: 'Rent or the running cost of the home: property taxes, HOME insurance, utilities, upkeep. Home insurance belongs here rather than under Insurance, because here it grows at your housing inflation rate, which is what it actually tracks. Not the mortgage payment itself — the plan amortizes that separately.' },
  { id: 'food', label: 'Food and groceries', hint: 'Groceries and eating out.' },
  { id: 'transport', label: 'Transport', hint: 'Fuel, servicing, registration, fares. Not a car loan — that is debt, and the plan models it separately.' },
  { id: 'health', label: 'Health, ongoing', hint: 'Routine out-of-pocket health spending across all years. Cover before 65 goes on its own line below, and Medicare and IRMAA are computed for you.' },
  { id: 'insurance', label: 'Insurance', hint: 'Auto, umbrella, life — the policies that are not about the house. Home insurance goes under Housing instead, so it compounds with housing costs. Not health cover either.' },
  { id: 'personal', label: 'Personal and discretionary', hint: 'Travel, hobbies, gifts to friends, subscriptions, everything you would cut first.' },
  { id: 'other', label: 'Other', hint: 'Anything that does not fit above.' },
];

// The pre-65 health line is NOT one of the seven and never enters
// lifestyleExpense. It exists to own `healthcareBridgeCost`, which the
// projection adds as its OWN line, per living spouse under 65, on top of
// lifestyle spending (§4.2). A user with "health — $9,000" in the ledger and
// the $12,000 bridge default would otherwise double-pay in exactly the pre-65
// years the ACA cliff logic is most sensitive to.
export const SPENDING_HEALTH_BRIDGE_ID = 'healthBridgePre65';

export const SPENDING_CATEGORY_IDS = SPENDING_CATEGORIES.map((c) => c.id);

// How often a budget line is actually PAID (changelog 221). A household
// does not meet its year in twelve equal parts: the property tax bill
// arrives in one month, insurance can be monthly or annual, and the
// difference is the whole of "can I manage this month".
//
// This is a WITHIN-YEAR shape and nothing else. A line's `amount` is still
// the annual total, the ledger still sums to the same `lifestyleExpense`,
// and the projection -- which is annual -- cannot tell the difference. If a
// change here ever moves a projected number, something is wired wrong.
export const SPENDING_CADENCES = [
  { id: 'monthly', label: 'Monthly', perYear: 12 },
  { id: 'quarterly', label: 'Quarterly', perYear: 4 },
  { id: 'semiannual', label: 'Twice a year', perYear: 2 },
  { id: 'annual', label: 'Once a year', perYear: 1 },
];
export const SPENDING_CADENCE_IDS = SPENDING_CADENCES.map((c) => c.id);

// Which inflation rate each category compounds at (rung 3.5 / step 5 of the
// module, changelog 138). Deliberately mapped onto the rates the app ALREADY
// has as inputs -- general, housing and medical -- rather than inventing a
// per-category rate nobody set. Seven categories at three rates is the same
// arithmetic `blendedLifestyleMultiplier` already does at two.
export const SPENDING_CATEGORY_INFLATION_GROUP = {
  housing: 'housing',
  health: 'medical',
  food: 'general',
  transport: 'general',
  insurance: 'general',
  personal: 'general',
  other: 'general',
};

// The budget's split across those three rates -- the "shape" in the spec's
// level x shape contract. A shape, never a level: `lifestyleExpense` stays
// the scalar the tornado sensitivity, Die-With-Zero's 40-iteration search and
// the required-portfolio solver all scale, and this rides along
// multiplicatively.
//
// Shares always sum to 1. With no ledger this returns exactly the two-way
// housing blend the engine has always used (medical share 0), so a plan that
// never opens the ledger is bit-for-bit unchanged.
// The essential share of the lifestyle budget, as a FRACTION (§3: never
// dollars -- a fraction stays coherent under Die-With-Zero's 40-iteration
// search over lifestyleExpense, where a dollar floor would not).
//
// Returns null when there is nothing to say: no ledger, or no essential
// categories ticked. Callers must treat null as "behave exactly as before".
export function essentialShareOf(inputs) {
  if (inputs?.lifestyleExpenseInputMode !== 'categories') return null;
  const derived = spendingBlueprintDerived(inputs.spendingBlueprint);
  if (!derived || !(derived.lifestyleExpense > 0)) return null;
  if (!(derived.essentialShare > 0)) return null;
  return Math.min(1, derived.essentialShare);
}

// The multiplier a phase actually applies (changelog 262). With a ledger
// and phasesFloorAware on, the essential share is left at 1.0 and only the
// discretionary share takes the phase's setting:
//   applied = essential + (1 - essential) * setting
// so Go-Go 1.10 on a 35% discretionary budget is 1.035 and No-Go 0.70 is
// 0.895. With no ledger (essentialShareOf is null) or the option off, the
// setting applies to the whole budget as it always did.
export function phaseMultiplierFor(inputs, setting) {
  const m = Number(setting);
  if (!Number.isFinite(m)) return 1;
  if (inputs?.phasesFloorAware === false) return m;
  const essential = essentialShareOf(inputs);
  if (essential === null) return m;
  return essential + (1 - essential) * m;
}

export function spendingShapeShares(inputs) {
  const fallbackHousing = Math.max(0, Math.min(100,
    inputs?.housingExpensePct !== undefined ? inputs.housingExpensePct : 30)) / 100;

  if (inputs?.lifestyleExpenseInputMode !== 'categories') {
    return { housing: fallbackHousing, medical: 0, general: 1 - fallbackHousing, source: 'housingShare' };
  }
  const derived = spendingBlueprintDerived(inputs.spendingBlueprint);
  if (!derived || !(derived.lifestyleExpense > 0)) {
    return { housing: fallbackHousing, medical: 0, general: 1 - fallbackHousing, source: 'housingShare' };
  }

  const { lines } = readSpendingBlueprint(inputs.spendingBlueprint);
  const totals = { housing: 0, medical: 0, general: 0 };
  for (const l of lines) {
    if (l.categoryId === SPENDING_HEALTH_BRIDGE_ID) continue; // its own engine line
    const group = SPENDING_CATEGORY_INFLATION_GROUP[l.categoryId] || 'general';
    totals[group] += l.amount;
  }
  const sum = totals.housing + totals.medical + totals.general;
  if (!(sum > 0)) {
    return { housing: fallbackHousing, medical: 0, general: 1 - fallbackHousing, source: 'housingShare' };
  }
  return {
    housing: totals.housing / sum,
    medical: totals.medical / sum,
    general: totals.general / sum,
    source: 'categories',
  };
}


// Normalizer. sanitizeInputs coerces only numbers and booleans and passes
// objects/arrays through untouched, so anything at all can arrive here from
// an old backup or a hand-edited export.
export function readSpendingBlueprint(raw) {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const rawLines = Array.isArray(src.lines) ? src.lines : [];
  const known = new Set([...SPENDING_CATEGORY_IDS, SPENDING_HEALTH_BRIDGE_ID]);

  const lines = rawLines
    .filter((l) => l && typeof l === 'object')
    .map((l, i) => {
      const amount = Number(l.amount);
      const categoryId = typeof l.categoryId === 'string' && l.categoryId ? l.categoryId : 'other';
      return {
        // An id is needed for React keys and for import replacement; make one
        // deterministically rather than dropping the line.
        id: typeof l.id === 'string' && l.id ? l.id : `line-${i}`,
        // An unrecognised id is kept as a custom category rather than
        // discarded -- losing a user's data to a schema change is worse than
        // carrying a category we do not have a label for.
        categoryId,
        isCustom: !known.has(categoryId),
        label: typeof l.label === 'string' ? l.label : '',
        amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
        source: l.source === 'import' ? 'import' : 'manual',
        importedAt: typeof l.importedAt === 'string' ? l.importedAt : undefined,
        // Only meaningful on the pre-65 health line: the share of it that is
        // insurance premiums, which an HSA may not pay (IRS Pub. 969).
        premiumShare: Number.isFinite(Number(l.premiumShare))
          ? Math.min(100, Math.max(0, Number(l.premiumShare)))
          : undefined,
        // Changelog 221. Missing means monthly, which is what every plan
        // saved before this existed was implicitly assumed to be -- so an
        // old ledger's calendar reads exactly as it did.
        cadence: SPENDING_CADENCE_IDS.includes(l.cadence) ? l.cadence : 'monthly',
        // The month the first payment of the year falls in, 1-12. Only
        // meaningful when the cadence is not monthly.
        dueMonth: Number.isFinite(Number(l.dueMonth))
          ? Math.min(12, Math.max(1, Math.round(Number(l.dueMonth))))
          : 1,
      };
    });

  const rawEssential = Array.isArray(src.essentialCategoryIds) ? src.essentialCategoryIds : [];
  const essentialCategoryIds = rawEssential.filter((id) => typeof id === 'string');
  const rawUnlinked = Array.isArray(src.unlinkedFields) ? src.unlinkedFields : [];
  const unlinkedFields = rawUnlinked.filter((f) => typeof f === 'string');

  return { lines, essentialCategoryIds, unlinkedFields };
}

// Everything the ledger derives, in one place so the UI cannot disagree with
// it. Returns null when the ledger is empty, which is how "categories mode is
// selected but nothing entered yet" stays distinguishable from "zero".
export function spendingBlueprintDerived(rawBlueprint) {
  const { lines, essentialCategoryIds, unlinkedFields } = readSpendingBlueprint(rawBlueprint);
  if (lines.length === 0) return null;
  const unlinked = new Set(unlinkedFields);

  const bridgeLines = lines.filter((l) => l.categoryId === SPENDING_HEALTH_BRIDGE_ID);
  const budgetLines = lines.filter((l) => l.categoryId !== SPENDING_HEALTH_BRIDGE_ID);

  const sum = (arr) => arr.reduce((t, l) => t + l.amount, 0);
  const lifestyleExpense = sum(budgetLines);
  const housing = sum(budgetLines.filter((l) => l.categoryId === 'housing'));
  const healthcareBridgeCost = sum(bridgeLines);

  // Weighted premium share across however many bridge lines there are; the
  // projection wants one percentage.
  const premiumWeighted = bridgeLines.reduce(
    (t, l) => t + l.amount * (l.premiumShare === undefined ? 70 : l.premiumShare), 0,
  );

  const essentialSet = new Set(essentialCategoryIds);
  const essentialTotal = sum(budgetLines.filter((l) => essentialSet.has(l.categoryId)));

  return {
    lifestyleExpense,
    // Share of the budget that grows at housingInflationRate rather than the
    // general rate. A housing CATEGORY states the same fact housingExpensePct
    // does, so both active would weight housing twice (§4.2).
    housingExpensePct: lifestyleExpense > 0 ? (housing / lifestyleExpense) * 100 : 0,
    healthcareBridgeCost,
    healthcareBridgePremiumPct: healthcareBridgeCost > 0
      ? premiumWeighted / healthcareBridgeCost
      : undefined,
    // Free to compute and free to show; what READS it (the guaranteed-income
    // floor and floor-aware guardrails) is the paid part, and is not built
    // yet — rung 6.
    essentialTotal,
    essentialShare: lifestyleExpense > 0 ? essentialTotal / lifestyleExpense : 0,
    lineCount: lines.length,
    // Which of the derived fields the ledger is actually driving right now.
    owns: {
      lifestyleExpense: true,
      housingExpensePct: !unlinked.has('housingExpensePct'),
      healthcareBridgeCost: !unlinked.has('healthcareBridgeCost') && healthcareBridgeCost > 0,
    },
  };
}

export function readSpendingBridge(rawBridge) {
  // sanitizeInputs passes objects through UNCHECKED (it coerces only numbers
  // and booleans), so a malformed object from an old backup would reach the
  // arithmetic below. Normalize here, the way the ledger will need to.
  const b = (rawBridge && typeof rawBridge === 'object') ? rawBridge : {};
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    currentHealthPremiums: num(b.currentHealthPremiums),
    workCostsThatStop: num(b.workCostsThatStop),
    retirementIncreases: num(b.retirementIncreases),
  };
}

// Current annual debt service the plan already models on its own amortization
// schedule (and stops automatically at payoff). Derived, never asked for.
//
// Split, because the two halves are not the same kind of fact. A mortgage is
// a cost of living that legitimately continues into retirement for plenty of
// households -- the plan amortizes it and stops at payoff, so it belongs out
// of the lifestyle target but it is not a problem to be solved. Consumer debt
// -- credit cards, car loans -- carried INTO retirement is a different thing:
// it is serviced out of portfolio withdrawals, which are taxable, so every
// dollar of it costs more than a dollar of working income did. The bridge
// says so on the line rather than silently netting it off.
export function currentDebtService(inputs) {
  return currentMortgageService(inputs) + currentConsumerDebtService(inputs);
}

export function currentMortgageService(inputs) {
  return Math.max(0, Number(inputs?.mortgagePayment) || 0);
}

export function currentConsumerDebtService(inputs) {
  return Math.max(0, Number(inputs?.otherDebtPayment) || 0);
}

// `residual` is the rung-1 figure (row.currentSpending.derived). Returns the
// ordered steps for display plus the resulting target, so the UI renders the
// same numbers the arithmetic used rather than recomputing them.
export function computeSpendingBridge(inputs, residual) {
  const bridge = readSpendingBridge(inputs?.spendingBridge);
  const start = Math.max(0, Number(residual) || 0);
  // A typed budget leaves debt payments out (the field says so, and since
  // changelog 383 the projection adds them on top of it), so there is nothing
  // to take off: subtracting here too removed the mortgage twice and set the
  // retirement target too low by a full year of payments (changelog 387).
  // The automatic figure is everything left after taxes and saving, debt
  // payments included, so there they do come out.
  const debtAlreadyOut = inputs?.currentSpendingMode === 'custom';
  const planMortgage = currentMortgageService(inputs);
  const planConsumerDebt = currentConsumerDebtService(inputs);
  const mortgage = debtAlreadyOut ? 0 : planMortgage;
  const consumerDebt = debtAlreadyOut ? 0 : planConsumerDebt;
  const debt = mortgage + consumerDebt;
  const leftOutNote = 'Nothing to subtract: the budget you typed already leaves these payments out, and the plan adds them from Balances & Debt.';

  const steps = [
    {
      id: 'start',
      label: 'What you have left to spend today',
      amount: start,
      direction: 'start',
      note: debtAlreadyOut
        ? 'The budget you typed, which leaves out taxes, saving, and mortgage and debt payments.'
        : 'From your income, taxes and savings — already excludes both.',
    },
    {
      id: 'mortgage',
      label: 'Mortgage payments',
      amount: mortgage,
      direction: 'subtract',
      derived: true,
      note: debtAlreadyOut && planMortgage > 0
        ? leftOutNote
        : 'A cost of living like any other, and one that often does continue into retirement. The plan amortizes it on its own schedule and stops it at payoff, so it must not also sit inside your target.',
    },
    {
      id: 'consumerDebt',
      label: 'Credit cards, car loans and other debt',
      amount: consumerDebt,
      direction: 'subtract',
      derived: true,
      // Deliberately advisory, and only when there is something to advise
      // about. Consumer debt carried into retirement is serviced from
      // portfolio withdrawals, which are taxable -- so a dollar of it costs
      // more than a dollar of it did while working.
      note: debtAlreadyOut && planConsumerDebt > 0
        ? `${leftOutNote} Still worth a second look: in retirement this debt is paid out of portfolio withdrawals, and those are taxable.`
        : consumerDebt > 0
        ? 'Handled the same way, but worth a second look: in retirement this is paid out of portfolio withdrawals, and those are taxable. Clearing consumer debt before you stop working is usually worth more than the interest rate alone suggests.'
        : 'Nothing to subtract, which is where you want to be at retirement.',
    },
    {
      id: 'health',
      label: 'Health premiums and out-of-pocket, while working',
      amount: bridge.currentHealthPremiums,
      direction: 'subtract',
      note: 'Retirement health cost is its own line — the pre-65 bridge, then Medicare and IRMAA after 65.',
    },
    {
      id: 'work',
      label: 'Costs that stop when you stop working',
      amount: bridge.workCostsThatStop,
      direction: 'subtract',
      note: 'Commuting, parking, lunches out, work clothes, dues, a second car. Nothing else in the plan models these.',
    },
    {
      id: 'increases',
      label: 'What goes up in retirement',
      amount: bridge.retirementIncreases,
      direction: 'add',
      note: 'Travel, hobbies, grandchildren. The Go-Go/Slow-Go curve shapes this over time; it does not set the starting level.',
    },
  ];

  const raw = start - debt - bridge.currentHealthPremiums - bridge.workCostsThatStop + bridge.retirementIncreases;
  const target = Math.max(0, raw);

  return {
    steps,
    start,
    target,
    // True when the subtractions exceed the starting figure. The plan cannot
    // spend a negative amount, so the target clamps at zero -- but silently
    // clamping would hide a data-entry error, so the UI says so.
    debtAlreadyOut,
    isNegative: raw < 0,
    raw,
    // What the bridge deliberately leaves out, and where each one lives
    // instead. Most of the value is here: without it a user has no way to
    // know the plan models these separately.
    // What the target deliberately leaves out, and WHERE EACH ONE IS
    // ENTERED instead (changelog 227). The second half is the point: a
    // list of exclusions with no destination reads as "we do not model
    // this", and a user who believes that enters it here anyway. Each
    // `where` is a place in this app, phrased as an instruction; `entered`
    // is false for the ones nobody enters at all.
    excluded: [
      { label: 'Your mortgage, and any other debt still running', where: 'Enter the balances and payments under Balances & Debt', entered: true },
      {
        label: 'Health insurance before 65',
        // The ledger owns this figure whenever it is on, and that is the
        // common case; the standalone field is the fallback. Saying both
        // is what stops the premiums being typed into a category as well.
        where: inputs?.lifestyleExpenseInputMode === 'categories'
          ? 'Enter the premiums below, under “Health coverage before 65” — not in the Insurance or Health categories'
          : 'Enter it in Healthcare Bridge Cost, just below',
        entered: true,
      },
      { label: 'Medicare premiums and IRMAA', where: 'Nothing to enter — worked out from your income each year', entered: false },
      { label: 'Long-term care', where: 'Turn it on under Special Expenses → Long-Term Care, per spouse', entered: true },
      { label: 'One-off events — a wedding, a roof, a move', where: 'Add them under Life Events', entered: true },
      { label: 'Lifetime gifting', where: 'Set it up under Life Events → Gifting', entered: true },
    ],
  };
}

export function irmaaThresholdsFor(status, mfsLivedWithSpouse = true) {
  if (status === 'MFJ') return IRMAA_THRESHOLDS_MFJ;
  // Separate filers who lived apart for the entire year use the ordinary
  // single-filer schedule; only living together triggers the compressed one.
  if (status === 'MFS' && mfsLivedWithSpouse) return IRMAA_THRESHOLDS_MFS_TOGETHER;
  return IRMAA_THRESHOLDS_SINGLE;
}


// The BBA-2018 top tier is NOT indexed like the others. 42 U.S.C. 1395r(i):
// the general rule indexes "each dollar amount in paragraph (2) or (3)" to
// CPI, but an express carve-out says that rule "shall not apply with respect
// to each dollar amount in paragraph (3) of $500,000", and indexing resumes
// only "in the case of any calendar year beginning after 2027" (from an
// August 2026 base). So the $500,000 single / $750,000 joint top threshold
// is frozen in nominal dollars through 2027 and moves from 2028 on. That is
// why those two figures have been literally unchanged since 2019 while every
// lower tier moved every year.
//
// The MFS-living-together top figure is not a separate dollar amount in
// the statute: s 1395r(i)(3)(C)(ii) sets it at $500,000 less the (indexed)
// lower MFS threshold -- $391,000 = $500,000 - $109,000 in 2026. So it moves
// year to year only because the subtracted amount does; the $500,000 in it
// is the same frozen top-tier figure. It is derived that way below.
//
// topTierInflationFactor defaults to null, which means "same as the others"
// -- that keeps every existing caller and test on the old behavior.
export const IRMAA_TOP_TIER_FREEZE_THROUGH_YEAR = 2027;

export function irmaaScaledThresholds(status, mfsLivedWithSpouse, thresholdInflationFactor, topTierInflationFactor = null) {
  const base = irmaaThresholdsFor(status, mfsLivedWithSpouse);
  const scaled = base.map(t => t * thresholdInflationFactor);
  if (status === 'MFS' && mfsLivedWithSpouse) {
    const topFactor = topTierInflationFactor !== null ? topTierInflationFactor : thresholdInflationFactor;
    const lower = scaled[3];
    scaled[4] = Math.max(lower, IRMAA_THRESHOLDS_SINGLE[4] * topFactor - lower);
    return scaled;
  }
  if (topTierInflationFactor !== null) {
    const top = base.length - 1;
    if (Number.isFinite(base[top])) scaled[top] = base[top] * topTierInflationFactor;
  }
  return scaled;
}

// Inflation factor to apply to the frozen top tier in a given projection
// year: 1 (flat at its statutory nominal level) through 2027, then the
// growth accumulated since 2027 only.
export function irmaaTopTierFactor(year, thresholdInflationFactor, baseYear) {
  if (!(year > IRMAA_TOP_TIER_FREEZE_THROUGH_YEAR)) return 1;
  const yearsOfGrowth = year - baseYear;
  if (!(yearsOfGrowth > 0) || !(thresholdInflationFactor > 0)) return 1;
  // thresholdInflationFactor is (1+r)^(year-baseYear); recover r and
  // re-raise it over the years since the freeze lifted.
  const rate = Math.pow(thresholdInflationFactor, 1 / yearsOfGrowth);
  return Math.pow(rate, year - IRMAA_TOP_TIER_FREEZE_THROUGH_YEAR);
}

// True when `magi` lands in tier i or above: > the tier's floor, except the
// top tier, which starts AT its floor.
export function irmaaTierReached(magi, thresholds, i) {
  return i === thresholds.length - 1 ? magi >= thresholds[i] : magi > thresholds[i];
}

export function calculateIRMAA(magi, status, membersOver65, partBInflationFactor = 1, thresholdInflationFactor = 1, mfsLivedWithSpouse = true, topTierInflationFactor = null) {
  if (membersOver65 <= 0) return 0;
  const thresholds = irmaaScaledThresholds(status, mfsLivedWithSpouse, thresholdInflationFactor, topTierInflationFactor);

  let premium = IRMAA_STANDARD_PREMIUM;
  // Walk tiers highest-to-lowest so the first (largest) threshold crossed wins.
  // CMS words every tier as "greater than" its floor except the top one,
  // which is "greater than or equal to" ($500,000 / $750,000 / $391,000).
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (irmaaTierReached(magi, thresholds, i)) {
      premium = IRMAA_TIER_PREMIUMS[i];
      break;
    }
  }
  return premium * partBInflationFactor * 12 * membersOver65;
}

// 2026 Medicare Part D national base premium & IRMAA surcharges. Source:
// SSA POMS Part D IRMAA table, via Kiplinger's "Medicare Premiums 2026:
// IRMAA Brackets and Surcharges for Parts B and D" (kiplinger.com).
// Uses the SAME income thresholds as Part B (IRMAA_THRESHOLDS_MFJ/SINGLE)
// -- SSA applies one combined MAGI test to determine both Part B and Part D
// surcharge tiers simultaneously, they just have different dollar amounts
// at each tier. Unlike Part B (a single CMS-set national premium), actual
// Part D premiums vary by the specific plan someone enrolls in -- this
// models the national base beneficiary premium as a stand-in, since this
// app doesn't track a specific Part D plan choice.
// $38.99 for 2026 (CMS, "Annual Release of Part D National Average Bid
// Amount and Other Part C & D Bid Information," July 28, 2025 -- audit
// Q-6, changelog 124; $34.50 was the 2024 figure).
export const PART_D_BASE_PREMIUM = 38.99;
export const PART_D_IRMAA_SURCHARGES = [14.50, 37.50, 60.40, 83.30, 91.00];

// partDInflationFactor defaults to 1 (no growth), same convention as
// calculateIRMAA's partBInflationFactor above. thresholdInflationFactor is
// the same concept as calculateIRMAA's -- see its comment above.
export function calculateMedicarePartD(magi, status, membersOver65, partDInflationFactor = 1, thresholdInflationFactor = 1, mfsLivedWithSpouse = true, topTierInflationFactor = null) {
  if (membersOver65 <= 0) return 0;
  const thresholds = irmaaScaledThresholds(status, mfsLivedWithSpouse, thresholdInflationFactor, topTierInflationFactor);

  let surcharge = 0;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (irmaaTierReached(magi, thresholds, i)) {
      surcharge = PART_D_IRMAA_SURCHARGES[i];
      break;
    }
  }
  return (PART_D_BASE_PREMIUM + surcharge) * partDInflationFactor * 12 * membersOver65;
}

// Social Security benefit as a fraction of PIA for a given claiming age,
// full retirement age 67 (everyone born 1960 or later). Statutory
// schedule, 42 U.S.C. 402(q) and 402(w):
//   - Early: 5/9 of 1% per month for the first 36 months before FRA
//     (6.67%/yr), then 5/12 of 1% per month beyond that (5%/yr). Age 62 =
//     70% of PIA, not the 60% a flat 8%/yr would give -- the old linear
//     formula understated an age-62 benefit by a seventh.
//   - Delayed: 2/3 of 1% per month (8%/yr) up to age 70 = 124%.
// Fractional ages are honoured month-by-month (62.5 -> 72.5%) and the
// result is clamped to the 62-70 claiming window.
// Full retirement age by year of birth (ssa.gov/benefits/retirement/
// planner/agereduction.html, fetched 2026-09-02; audit Q-7, changelog 124):
// 66 for 1943-1954, then two months a year to 67 for 1960 and later. Born
// before 1943 is 65 + 2 months a year from 1938, which no plan this app
// projects will hit, but the table is complete anyway. Returned in years
// with a fractional month part (66 + 6/12 for 1957).
export function getFullRetirementAge(birthYear) {
  const y = Number(birthYear);
  if (!Number.isFinite(y) || y >= 1960) return 67;
  if (y >= 1955) return 66 + (y - 1954) * 2 / 12;
  if (y >= 1943) return 66;
  if (y >= 1938) return 65 + (y - 1937) * 2 / 12;
  return 65;
}

// SECURE 2.0 RMD start age by year of birth: 75 for anyone born 1960 or
// later, 73 before. The one copy of the rule; the engine's RMD loop, the
// heir-rule helper and the Tax & Estate chart (App.jsx getRMDAge) read it.
// An unreadable birth year counts as 1960+ (the later start).
export function rmdStartAge(birthYear) {
  const y = parseInt(birthYear, 10);
  return Number.isFinite(y) && y < 1960 ? 73 : 75;
}

// Benefit factor for a claim at `claimingAge` against a full retirement age
// `fra` (default 67). Early: 5/9 of 1% per month for the first 36 months,
// 5/12 of 1% beyond that, down to 62. Delayed: 2/3 of 1% per month (8% a
// year) until 70 -- so a 1957-born claimant with FRA 66 1/2 earns 42
// months of credits, not 36, and claiming at 66 is 6 months early, not 12.
// Retirement Earnings Test exempt amounts -- 2026, verified 2026-09-14
// against ssa.gov/oact/cola/rtea.html (up from $23,400 / $62,160 in 2025).
//
// 42 U.S.C. 403(b)/(f). Claim before full retirement age while still
// earning, and Social Security withholds $1 of benefit for every $2 of
// earnings above the lower amount. In the CALENDAR YEAR you attain FRA a
// higher amount applies and the rate falls to $1 for every $3, counting
// only earnings in the months BEFORE the month you reach FRA. From the
// month you reach FRA the test stops entirely, however much you earn.
//
// Indexed here by the plan's general inflation factor, which is the same
// AWI stand-in `calculateFICATaxes` already uses for the Social Security
// wage base -- both are wage-indexed in reality, neither is CPI.
export const SS_EARNINGS_TEST_EXEMPT_UNDER_FRA = 24480;
export const SS_EARNINGS_TEST_EXEMPT_FRA_YEAR = 65160;
export const SS_EARNINGS_TEST_RATE_UNDER_FRA = 1 / 2;
export const SS_EARNINGS_TEST_RATE_FRA_YEAR = 1 / 3;

// What the earnings test withholds this year, and how many months of
// benefit that represents. Returns zeroes whenever the test does not bite,
// so callers never branch.
//
// `earnedIncome` is WAGES AND NET SELF-EMPLOYMENT ONLY. SSA is explicit
// that pensions, annuities, investment income, interest, veterans' and
// other government or military retirement benefits do NOT count -- and
// neither, therefore, do IRA/401(k) withdrawals, Roth conversions or
// realized gains, all of which this plan generates in quantity. Passing
// anything but earned income here would invent a benefit cut.
//
// The withheld amount is capped at the benefit itself: the test can take a
// benefit to zero but never below it, and never reaches other income.
export function ssEarningsTestWithholding(earnedIncome, annualBenefit, age, fra, inflationFactor = 1, year = undefined, ratePct = undefined) {
  const zero = { withheld: 0, monthsWithheld: 0, inFraYear: false };
  if (!(annualBenefit > 0) || !(earnedIncome > 0)) return zero;
  // "The calendar year you attain FRA" -- this engine steps a year at a
  // time and models no birth month, so the year in which `age` reaches the
  // integer part of FRA is that year. It has to be tested BEFORE the
  // age >= fra exit: with FRA 67 the FRA year is age 67, which that exit
  // used to swallow, so the $65,160 test never ran for anyone born 1960+.
  // SSA counts only the earnings in the months before the FRA month; with
  // no birth month the engine counts the whole calendar year's earnings
  // against the higher amount -- conservative for someone whose FRA falls
  // early in the year.
  const inFraYear = Math.floor(age) === Math.floor(fra);
  if (age >= fra && !inFraYear) return zero; // after the FRA year the test is over
  // SSA's announced amount for the year where there is one (SS_ANNOUNCED),
  // the 2026 amount indexed otherwise.
  const exempt = ssAnnouncedFigure(inFraYear ? 'earningsTestFraYear' : 'earningsTestUnderFra', year, ratePct, inflationFactor);
  const rate = inFraYear ? SS_EARNINGS_TEST_RATE_FRA_YEAR : SS_EARNINGS_TEST_RATE_UNDER_FRA;

  const withheld = Math.min(annualBenefit, Math.max(0, earnedIncome - exempt) * rate);
  return {
    withheld,
    // Benefits are withheld in whole months, and it is the COUNT of those
    // months that FRA gives back (below). A part-year of withholding is
    // carried as a fraction rather than rounded, so a plan does not gain or
    // lose a month to rounding every year it is near the threshold.
    monthsWithheld: 12 * (withheld / annualBenefit),
    inFraYear,
  };
}

// The claiming age to price a benefit at once FRA is reached, given the
// months the earnings test withheld along the way.
//
// This is the half of the rule that stops it being a pure penalty, and
// leaving it out would make the plan alarmist rather than wrong-in-detail.
// SSA recomputes the benefit at FRA "to give you credit for the months we
// reduced or withheld benefits due to your excess earnings" -- arithmetically
// identical to having claimed that many months later, which is exactly what
// getSSMultiplier already takes. Capped at FRA: the credit can undo an early
// claim entirely but never earns delayed retirement credits.
export function ssEffectiveClaimingAge(claimingAge, monthsWithheld, fra) {
  if (!(monthsWithheld > 0)) return claimingAge;
  return Math.min(fra, claimingAge + monthsWithheld / 12);
}

export function getSSMultiplier(claimingAge, fra = 67) {
  const monthsFromFRA = Math.round((claimingAge - fra) * 12);
  if (monthsFromFRA >= 0) {
    const maxDelayed = Math.max(0, Math.round((70 - fra) * 12));
    return 1.0 + Math.min(maxDelayed, monthsFromFRA) * (2 / 3) / 100;
  }
  const maxEarly = Math.max(0, Math.round((fra - 62) * 12));
  const early = Math.min(maxEarly, -monthsFromFRA);
  const first36 = Math.min(36, early) * (5 / 9) / 100;
  const beyond36 = Math.max(0, early - 36) * (5 / 12) / 100;
  return 1.0 - first36 - beyond36;
}

// Spousal-benefit reduction factor, 42 U.S.C. 402(b)(2)/(q)(1)(B): 25/36 of
// 1% per month for the first 36 months before FRA (6.67%/yr → 83.33% at
// 64), then 5/12 of 1% per month (5%/yr → 70% at 62, i.e. 35% of the
// worker's PIA). There are NO delayed retirement credits on a spousal
// benefit, so the factor is clamped to 1.0 at or after FRA. Fractional
// ages are honoured month-by-month like getSSMultiplier.
export function getSpousalSSMultiplier(claimingAge, fra = 67) {
  const monthsFromFRA = Math.round((claimingAge - fra) * 12);
  if (monthsFromFRA >= 0) return 1.0;
  const early = Math.min(Math.max(0, Math.round((fra - 62) * 12)), -monthsFromFRA);
  const first36 = Math.min(36, early) * (25 / 36) / 100;
  const beyond36 = Math.max(0, early - 36) * (5 / 12) / 100;
  return 1.0 - first36 - beyond36;
}

// Survivor benefit, 42 U.S.C. 402(e)/(f) (changelog 265). What a widow or
// widower can draw on the deceased spouse's record:
//   * The base is what the deceased was receiving, or would have been: the
//     full benefit with delayed credits earned up to the death (capped at
//     70) if they died before claiming; their claimed benefit otherwise.
//   * The survivor may claim from 60 (50 if disabled -- not modeled), at
//     71.5% of the base, rising a straight line to 100% at the survivor's
//     own full retirement age. Claiming at or after FRA pays 100%.
//   * RIB-LIM (402(e)(2)(D)): if the deceased claimed EARLY, the survivor
//     gets no more than the larger of the deceased's reduced benefit and
//     82.5% of the deceased's full benefit, whatever the survivor's age.
// The survivor's own retirement benefit is unaffected by drawing a
// survivor benefit, so the engine pays the larger of the two each year --
// which is also what "take the survivor benefit at 60, switch to my own
// at 70" produces.
//
// Before this the engine paid max(own, deceased's benefit) from 62 with
// no survivor reduction and no RIB-LIM: too generous for a survivor under
// FRA, too stingy for one whose spouse died before claiming after FRA.
// The survivor FRA table differs slightly from the retirement one for
// 1957-1961 births; the retirement FRA is used for both.
export function survivorSSBenefit({ deceasedFull, deceasedClaimAge, deceasedFra = 67, deceasedDeathAge, survivorFra = 67, survivorClaimAge }) {
  const full = Math.max(0, Number(deceasedFull) || 0);
  if (full === 0) return 0;
  const claimedBeforeDeath = Number.isFinite(deceasedDeathAge) && deceasedDeathAge >= deceasedClaimAge;
  const claim = Math.max(60, Number(survivorClaimAge) || 60);
  let ageFactor = 1;
  if (claim < survivorFra) {
    const monthsEarly = Math.round((survivorFra - claim) * 12);
    const totalMonths = Math.max(1, Math.round((survivorFra - 60) * 12));
    ageFactor = 1 - 0.285 * Math.min(monthsEarly, totalMonths) / totalMonths;
  }
  if (claimedBeforeDeath && deceasedClaimAge < deceasedFra) {
    const reduced = full * getSSMultiplier(deceasedClaimAge, deceasedFra);
    return Math.min(full * ageFactor, Math.max(reduced, 0.825 * full));
  }
  const creditedTo = claimedBeforeDeath ? deceasedClaimAge : Math.min(70, Number(deceasedDeathAge) || deceasedFra);
  const base = full * (creditedTo > deceasedFra ? getSSMultiplier(creditedTo, deceasedFra) : 1);
  return base * ageFactor;
}

// Annual "excess spousal" top-up for spouse `me` given the other spouse's
// FRA benefit, in the same dollars as the two FRA amounts passed in.
//   ownFra      my own FRA (PIA) benefit
//   otherFra    the other spouse's FRA benefit
//   myClaimAge  the age I claim my own benefit
//   otherClaimAge  the age the other spouse claims (the top-up cannot start
//               before they file -- 42 U.S.C. 402(b)(1)(B))
//   ageGap      my age minus the other spouse's age (constant), so the age
//               I am when they file is otherClaimAge + ageGap
//   myAge       my age this year
// Returns 0 until both of us have filed; afterwards the excess (if any),
// reduced on the spousal schedule at the age it first became payable
// (deemed filing, 42 U.S.C. 402(r), applies to everyone born 1954+).
export function spousalSSTopUp(ownFra, otherFra, myClaimAge, otherClaimAge, ageGap, myAge, fra = 67) {
  const excess = Math.max(0, 0.5 * (otherFra || 0) - (ownFra || 0));
  if (!(excess > 0)) return 0;
  const startAge = Math.max(myClaimAge, otherClaimAge + ageGap, 62);
  if (myAge < startAge) return 0;
  return excess * getSpousalSSMultiplier(startAge, fra);
}

// ---------------------------------------------------------------------
// Roth basis layers (IRC 408A(d)(4)). `layers` is a plain object the
// projection mutates year by year:
//   { contrib: number,                       regular contributions
//     conversions: [{ year, taxable, nontaxable }] oldest first }
// A conversion's five-year clock starts on January 1 of the conversion
// year, so its taxable part is penalty-free in tax years >= year + 5
// (Reg. 1.408A-6 Q&A-5). The non-taxable part of a conversion (basis that
// came across pro-rata) is never penalized.
// ---------------------------------------------------------------------
export const ROTH_CONVERSION_CLOCK_YEARS = 5;

export function makeRothLayers(contrib = 0, conversions = []) {
  return {
    contrib: Math.max(0, contrib || 0),
    conversions: conversions
      .filter((c) => c && (c.taxable > 0 || c.nontaxable > 0))
      .map((c) => ({ year: c.year, taxable: Math.max(0, c.taxable || 0), nontaxable: Math.max(0, c.nontaxable || 0) }))
      .sort((a, b) => a.year - b.year),
  };
}

export function rothLayersBasis(layers) {
  return layers.contrib + layers.conversions.reduce((s, c) => s + c.taxable + c.nontaxable, 0);
}

// How a Roth withdrawal of `amount` splits under the ordering rules, given
// the layers as they stand, the account balance, the tax year and the
// owner's age. Pure -- does not consume anything. Returns:
//   contrib      from regular contributions (free)
//   convFree     from conversions past their clock, or non-taxable parts
//   convPenalized from taxable parts of conversions inside their clock
//                (10% penalty before 59.5, never income-taxed again)
//   earnings     the remainder above total basis
//   taxableEarnings  earnings that are ordinary income this year (before
//                59.5; after 59.5 the distribution is qualified)
//   penalized    dollars subject to the 10% early-distribution tax
export function splitRothDraw(amount, layers, balance, year, age) {
  const out = { contrib: 0, convFree: 0, convPenalized: 0, earnings: 0, taxableEarnings: 0, penalized: 0 };
  let remaining = Math.max(0, amount || 0);
  if (!(remaining > 0)) return out;
  const under = age < 59.5;
  out.contrib = Math.min(layers.contrib, remaining);
  remaining -= out.contrib;
  for (const c of layers.conversions) {
    if (remaining <= 0) break;
    const clockOpen = year < c.year + ROTH_CONVERSION_CLOCK_YEARS;
    const t = Math.min(c.taxable, remaining);
    remaining -= t;
    if (clockOpen) out.convPenalized += t; else out.convFree += t;
    const n = Math.min(c.nontaxable, remaining);
    remaining -= n;
    out.convFree += n;
  }
  // Whatever basis says, you cannot take out more than is there; the
  // excess over basis is earnings only to the extent the balance has
  // grown above basis.
  out.earnings = Math.min(remaining, Math.max(0, (balance || 0) - rothLayersBasis(layers)));
  if (under) {
    out.taxableEarnings = out.earnings;
    out.penalized = out.convPenalized + out.earnings;
  }
  return out;
}

// Consume `amount` from the layers in ordering-rule sequence (mutates).
export function consumeRothLayers(amount, layers) {
  let remaining = Math.max(0, amount || 0);
  const c0 = Math.min(layers.contrib, remaining);
  layers.contrib -= c0;
  remaining -= c0;
  for (const c of layers.conversions) {
    if (remaining <= 0) break;
    const t = Math.min(c.taxable, remaining);
    c.taxable -= t; remaining -= t;
    const n = Math.min(c.nontaxable, remaining);
    c.nontaxable -= n; remaining -= n;
  }
  layers.conversions = layers.conversions.filter((c) => c.taxable > 0.005 || c.nontaxable > 0.005);
  return layers;
}

// Withdrawal solver that handles circular tax feedback loop
function solveWithdrawals(
  preTaxAvail, rothAvail, taxableAvail, cashNeeded, baseOrdinaryTaxableIncome, standardDeduction,
  status, inflationFactor, strategy, stateType, taxSS, taxPension, pension, ssIncome,
  taxableDividends, inputs, age1, age2, militaryPension, taxableBasisRatioForYear = 0,
  pensionDetail = null, stateExtras = {}, rothDrawSplit = null, capitalLossCarryforward = 0,
  preTaxTaxableShare = 1, ssResettle = null, foreignPricer = null, ordinaryOffsetReclaimable = 0
) {
  // ordinaryOffsetReclaimable (changelog 404): the up-to-$3,000 ($1,500
  // MFS) of harvested loss the caller has already set against ORDINARY
  // income this year. s 1211(b) allows that only for loss left over after
  // every capital gain is netted, and the gains this draw realizes are not
  // known until the solve. So when a candidate draw's gains exceed the
  // carryforward, the ordinary offset is reclaimed to cover them first:
  // ordinary income rises by the reclaimed amount and the gains fall by it.
  // The caller mirrors the reclaim for the draw it settles on.
  const reclaimFor = (grossGains) => {
    const afterCarryforward = Math.max(0, grossGains - Math.max(0, capitalLossCarryforward));
    return Math.min(Math.max(0, ordinaryOffsetReclaimable), afterCarryforward);
  };
  let dPreTax = 0;
  let dRoth = 0;
  let dTaxable = 0;

  // standardDeduction may be a plain number or a function of MAGI (the
  // projection passes deductionFor so the OBBBA senior bonus phases out
  // against the income this candidate draw produces).
  const deductionAt = typeof standardDeduction === 'function' ? standardDeduction : () => standardDeduction;

  // Returns the SAME total getTax always returned, plus the federal/state
  // decomposition it was already computing internally and throwing away
  // (changelog 182). Splitting it here rather than at the call sites is
  // what makes the change safe: not one arithmetic expression below moved,
  // and `getTax` is now a thin `.total` accessor over this, so the binary
  // search and every sequential strategy price exactly what they did
  // before. The 10% early-withdrawal penalty is federal; a state's own
  // additional tax on the same distribution is not.
  const getTaxParts = (preTaxDraw, taxableDraw = 0, rothDraw = 0) => {
    // Roth ordering rules: with a splitter supplied by the projection, only
    // the earnings slice of a pre-59.5 Roth draw is ordinary income and
    // only earnings + young conversions carry the 10% penalty. Without one
    // (legacy callers), the whole draw is penalized as before.
    const rothSplit = rothDrawSplit ? rothDrawSplit(rothDraw) : null;
    const rothTaxableEarnings = rothSplit ? rothSplit.taxableEarnings : 0;
    const rothPenalizedDraw = rothSplit ? rothSplit.penalized : rothDraw;
    // Only the non-basis share of a Pre-Tax draw is ordinary income: IRC
    // s 72(e)(8) / s 408(d)(2) pro-rata (audit Q-9(c), changelog 126).
    const preTaxOrdinary = preTaxDraw * preTaxTaxableShare;

    // Capital gains from Taxable Brokerage withdrawals -- realized fraction
    // is this year's actual basis ratio (taxableBasisRatioForYear, tracked
    // dynamically in runProjection) rather than a flat assumption, so it
    // evolves as the account is drawn down or built up over time.
    // A harvested capital-loss carryforward nets against these realized
    // gains first (s.1211/1212; audit Q-11) -- the caller consumes the
    // used amount after the solve.
    // Computed BEFORE ordinaryInc because realized gains are part of AGI and
    // therefore part of the provisional-income test re-settled just below.
    const grossGains = taxableDraw * (1 - taxableBasisRatioForYear);
    const reclaim = reclaimFor(grossGains);
    const realizedGains = Math.max(0, grossGains - Math.max(0, capitalLossCarryforward)) - reclaim;
    const capGains = taxableDividends + realizedGains;

    // Social Security taxability has to be re-settled against THIS candidate
    // draw. Provisional income is AGI excluding SS plus half of benefits, and
    // a discretionary Pre-Tax draw, the realized gains on a Taxable draw and
    // the taxable earnings slice of a pre-59.5 Roth draw are all AGI -- none
    // of which exist until this solver runs. Pricing the draw against the
    // pre-solver taxableSS understates tax for any household whose benefits
    // are not already pinned at the 85% cap: the draw taken to cover spending
    // is itself what pushes benefits up a tier ("tax torpedo"), so the solver
    // has to see that cost while sizing the draw, not after. This is the same
    // ordering fix changelog 123 made for IRMAA MAGI; SS was left behind.
    // Households comfortably above the upper threshold are unaffected -- the
    // 85% cap binds first and the delta is exactly zero.
    // ssResettle is optional so legacy callers keep the old behavior.
    let ssAdjustment = 0;
    if (ssResettle) {
      const extraProvisional = preTaxOrdinary + rothTaxableEarnings + realizedGains;
      ssAdjustment = ssResettle.taxableSSFor(ssResettle.provisionalOther + extraProvisional) - ssResettle.baseTaxableSS;
    }
    const ordinaryInc = baseOrdinaryTaxableIncome + reclaim + preTaxOrdinary + rothTaxableEarnings + ssAdjustment;
    const deduction = deductionAt(ordinaryInc + capGains);
    const ordinaryTaxable = Math.max(0, ordinaryInc - deduction);
    
    const mfsSplit = mfsSplitSpec(inputs, ordinaryInc, stateExtras.mfsReturnDeductions);
    const fedOrdinaryTax = calculateTaxes(ordinaryTaxable, status, inflationFactor, inputs.tcjaSunsetEnabled, mfsSplit);
    const fedCapGainsTax = calculateCapitalGainsTaxes(ordinaryTaxable, capGains, status, inflationFactor, deduction, Math.max(0, deduction - ordinaryInc), stateExtras.niiOther || 0, mfsSplit);
    const fedTax = fedOrdinaryTax + fedCapGainsTax;
    
    // State taxes apply to ordinary income, dividends, and realized capital gains
    const totalIncomeForState = ordinaryInc + capGains;
    // stateExtras carries the projection year (NY era selection), the NYC
    // flag, and California's HSA addback; the AGI proxy tracks this draw's
    // income so the solver prices CA's phase-outs consistently.
    const stateTax = calculateStateTaxes(
      totalIncomeForState, pension, ssIncome, stateType,
      taxSS, taxPension, status, age1, age2,
      // The year's residence (stateExtras carries it, like nycResident);
      // the plan-wide input is only the fallback for a caller without one.
      stateExtras.stateTaxFlatRate ?? inputs.stateTaxFlatRate, militaryPension,
      pensionDetail, stateExtras.yonkersResident ?? inputs.yonkersResident,
      {
        ...stateExtras,
        federalAGI: totalIncomeForState,
        federalDeduction: deduction,
        // Keep the state engine's view of how much SS sits inside the income
        // base consistent with the base actually handed to it -- ordinaryInc
        // carries the re-settled taxable SS, so a state that exempts benefits
        // must exempt the same, larger amount or it over-taxes the draw.
        federalTaxableSS: (stateExtras.federalTaxableSS || 0) + ssAdjustment,
        // Q-15: this candidate's Pre-Tax draw (and the taxable earnings of
        // an early Roth draw) are IRA/401(k) distributions too.
        retirementDistributions: (stateExtras.retirementDistributions || 0) + preTaxOrdinary + rothTaxableEarnings,
        // Changelog 349: this candidate's realized gains are long-term
        // gains too (Washington's capital gains tax).
        longTermGains: (stateExtras.longTermGains || 0) + realizedGains,
      }
    );
    
    // IRS 10% Early Withdrawal Penalty for Pre-Tax and Roth before age 59.5,
    // plus any STATE additional tax on the same distribution. California
    // charges 2.5% on top of the federal 10%, so a Californian bridging to
    // 59.5 pays 12.5%, not 10% -- see stateEarlyDistributionTax.
    let earlyWithdrawalPenalty = 0;
    let stateEarlyTax = 0;
    if (age1 < 59.5) {
      const earlyDistribution = preTaxOrdinary + rothPenalizedDraw;
      earlyWithdrawalPenalty = earlyDistribution * 0.10;
      stateEarlyTax = stateEarlyDistributionTax(stateType, earlyDistribution, age1);
    }
    
    const federal = fedTax + earlyWithdrawalPenalty;
    const state = stateTax + stateEarlyTax;
    if (!foreignPricer) return { total: federal + state, federal, state };
    // A year abroad (changelog 196): the foreign layer is priced against
    // this same candidate draw, so the solver grosses the draw up for it.
    // The credit is limited by US REGULAR tax -- never NIIT, never the 10%
    // penalty.
    const niit = calculateNetInvestmentIncomeTax(ordinaryTaxable, capGains, status, inflationFactor, deduction, Math.max(0, deduction - ordinaryInc), stateExtras.niiOther || 0, mfsSplit);
    const foreignParts = foreignPricer({
      preTaxOrdinary,
      realizedGains,
      rothDraw,
      rothEarnings: rothSplit ? rothSplit.earnings : 0,
      usRegularTax: fedOrdinaryTax + fedCapGainsTax - niit,
      usOrdinaryIncome: ordinaryInc,
      usCapGains: capGains,
      usCapGainsTax: fedCapGainsTax - niit,
      usTaxableSS: (stateExtras.federalTaxableSS || 0) + ssAdjustment,
    });
    return { total: federal + state + foreignParts.net, federal, state, foreign: foreignParts.net, foreignParts };
  };

  const getTax = (preTaxDraw, taxableDraw = 0, rothDraw = 0) =>
    getTaxParts(preTaxDraw, taxableDraw, rothDraw).total;

  const baseTax = getTax(0, 0, 0);

  // The federal/state split of whatever draw the solver settles on. Computed
  // ONCE at the end from the chosen draw rather than threaded through the
  // 40-iteration search, so the search itself is untouched: same arithmetic,
  // same iteration count, same answer. `taxIncrease` is unchanged and stays
  // authoritative; the two new fields are a decomposition of it and sum back
  // to it exactly.
  const baseParts = getTaxParts(0, 0, 0);
  const finish = (result) => {
    const parts = getTaxParts(result.dPreTax || 0, result.dTaxable || 0, result.dRoth || 0);
    const out = {
      ...result,
      taxIncreaseFederal: parts.federal - baseParts.federal,
      taxIncreaseState: parts.state - baseParts.state,
    };
    if (foreignPricer) {
      out.taxIncreaseForeign = parts.foreign - baseParts.foreign;
      out.foreignParts = parts.foreignParts;
      out.foreignBaseParts = baseParts.foreignParts;
    }
    return out;
  };

  if (strategy === 'ProRata') {
    const totalAvail = preTaxAvail + rothAvail + taxableAvail;
    if (totalAvail <= 0) {
      return finish({ dPreTax: 0, dRoth: 0, dTaxable: 0, taxIncrease: 0, shortfall: cashNeeded });
    }
    
    // Binary search for fraction f in [0, 1]
    let low = 0;
    let high = 1;
    let bestF = 1;
    
    for (let iter = 0; iter < 40; iter++) {
      const mid = (low + high) / 2;
      const drawPre = mid * preTaxAvail;
      const drawRoth = mid * rothAvail;
      const drawTax = mid * taxableAvail;
      const taxInc = getTax(drawPre, drawTax, drawRoth) - baseTax;
      const netCash = drawPre + drawRoth + drawTax - taxInc;
      
      if (netCash >= cashNeeded) {
        bestF = mid;
        high = mid;
      } else {
        low = mid;
      }
    }
    
    // Check edge case if even f=1 is not enough
    const maxTaxInc = getTax(preTaxAvail, taxableAvail, rothAvail) - baseTax;
    const maxNetCash = preTaxAvail + rothAvail + taxableAvail - maxTaxInc;
    
    if (maxNetCash < cashNeeded) {
      return finish({
        dPreTax: preTaxAvail,
        dRoth: rothAvail,
        dTaxable: taxableAvail,
        taxIncrease: maxTaxInc,
        shortfall: cashNeeded - maxNetCash
      });
    } else {
      const finalDrawPre = bestF * preTaxAvail;
      const finalDrawTax = bestF * taxableAvail;
      const finalDrawRoth = bestF * rothAvail;
      return finish({
        dPreTax: finalDrawPre,
        dRoth: finalDrawRoth,
        dTaxable: finalDrawTax,
        taxIncrease: getTax(finalDrawPre, finalDrawTax, finalDrawRoth) - baseTax,
        shortfall: 0
      });
    }
  }

  // Sequential strategies
  let order = [];
  if (strategy === 'TaxableFirst') {
    order = ['taxable', 'preTax', 'roth'];
  } else if (strategy === 'PreTaxFirst') {
    order = ['preTax', 'taxable', 'roth'];
  } else if (strategy === 'RothFirst') {
    order = ['roth', 'taxable', 'preTax'];
  } else {
    order = ['taxable', 'preTax', 'roth'];
  }

  let remainingCashNeeded = cashNeeded;

  for (const acct of order) {
    if (remainingCashNeeded <= 0) break;
    
    if (acct === 'taxable') {
      if (taxableAvail <= 0) continue;
      
      let low = 0;
      let high = taxableAvail;
      let solvedDraw = taxableAvail;
      let isSuff = false;

      for (let iter = 0; iter < 40; iter++) {
        const mid = (low + high) / 2;
        const taxInc = getTax(dPreTax, dTaxable + mid, dRoth) - getTax(dPreTax, dTaxable, dRoth);
        const netCash = mid - taxInc;
        if (netCash >= remainingCashNeeded) {
          solvedDraw = mid;
          high = mid;
          isSuff = true;
        } else {
          low = mid;
        }
      }

      if (isSuff) {
        dTaxable += solvedDraw;
        remainingCashNeeded = 0;
      } else {
        const maxDraw = taxableAvail;
        const taxInc = getTax(dPreTax, dTaxable + maxDraw, dRoth) - getTax(dPreTax, dTaxable, dRoth);
        const netCash = maxDraw - taxInc;
        dTaxable += maxDraw;
        remainingCashNeeded -= netCash;
      }
    } else if (acct === 'roth') {
      if (rothAvail <= 0) continue;
      
      let low = 0;
      let high = rothAvail;
      let solvedDraw = rothAvail;
      let isSuff = false;

      for (let iter = 0; iter < 40; iter++) {
        const mid = (low + high) / 2;
        const taxInc = getTax(dPreTax, dTaxable, dRoth + mid) - getTax(dPreTax, dTaxable, dRoth);
        const netCash = mid - taxInc;
        if (netCash >= remainingCashNeeded) {
          solvedDraw = mid;
          high = mid;
          isSuff = true;
        } else {
          low = mid;
        }
      }

      if (isSuff) {
        dRoth += solvedDraw;
        remainingCashNeeded = 0;
      } else {
        const maxDraw = rothAvail;
        const taxInc = getTax(dPreTax, dTaxable, dRoth + maxDraw) - getTax(dPreTax, dTaxable, dRoth);
        const netCash = maxDraw - taxInc;
        dRoth += maxDraw;
        remainingCashNeeded -= netCash;
      }
    } else if (acct === 'preTax') {
      if (preTaxAvail <= 0) continue;
      
      let low = 0;
      let high = preTaxAvail;
      let solvedDraw = preTaxAvail;
      let isSuff = false;

      for (let iter = 0; iter < 40; iter++) {
        const mid = (low + high) / 2;
        const taxInc = getTax(dPreTax + mid, dTaxable, dRoth) - getTax(dPreTax, dTaxable, dRoth);
        const netCash = mid - taxInc;
        if (netCash >= remainingCashNeeded) {
          solvedDraw = mid;
          high = mid;
          isSuff = true;
        } else {
          low = mid;
        }
      }

      if (isSuff) {
        dPreTax += solvedDraw;
        remainingCashNeeded = 0;
      } else {
        const maxDraw = preTaxAvail;
        const taxInc = getTax(dPreTax + maxDraw, dTaxable, dRoth) - getTax(dPreTax, dTaxable, dRoth);
        const netCash = maxDraw - taxInc;
        dPreTax += maxDraw;
        remainingCashNeeded -= netCash;
      }
    }
  }

  const taxInc = getTax(dPreTax, dTaxable, dRoth) - baseTax;
  return finish({
    dPreTax,
    dRoth,
    dTaxable,
    taxIncrease: taxInc,
    shortfall: Math.max(0, remainingCashNeeded)
  });
}

export function sanitizeInputs(inputs) {
  // Legacy fallback for callers that bypass migrateInputs (tests, direct
  // runProjection calls with an old backup object): the old single
  // backdoorRothAnnualAmount applied to each working spouse, so it maps
  // onto both per-spouse fields (changelog 108).
  if (inputs && inputs.backdoorRothAnnualAmount1 === undefined && inputs.backdoorRothAnnualAmount !== undefined) {
    inputs = {
      ...inputs,
      backdoorRothAnnualAmount1: inputs.backdoorRothAnnualAmount,
      backdoorRothAnnualAmount2: inputs.backdoorRothAnnualAmount,
    };
  }
  const clean = {};
  const defaults = DEFAULT_INPUTS;
  for (const key in defaults) {
    const val = inputs[key];
    if (typeof defaults[key] === 'number') {
      // "5,000" or "$5,000" typed or pasted into a saved plan is 5000, not
      // NaN (E28).
      let num = typeof val === 'string' ? parseMoneyString(val) : Number(val);
      if (isNaN(num)) {
        if (key.includes('Age') || key.includes('Year') || key.includes('Expectancy') || key.includes('Return')) {
          num = defaults[key];
        } else {
          num = 0;
        }
      }
      clean[key] = num;
    } else if (typeof defaults[key] === 'boolean') {
      clean[key] = val === undefined ? defaults[key] : Boolean(val);
    } else {
      clean[key] = val === undefined ? defaults[key] : val;
    }
  }

  // Legacy config migration: If birthYear1/2 are at default but user had currentAge1/2 in their old config
  if (inputs.currentAge1 !== undefined && inputs.birthYear1 === undefined) {
    clean.birthYear1 = TAX_YEAR - Number(inputs.currentAge1);
  }
  if (inputs.currentAge2 !== undefined && inputs.birthYear2 === undefined) {
    clean.birthYear2 = TAX_YEAR - Number(inputs.currentAge2);
  }

  // A reverse mortgage is a loan against a home you own (changelog 144).
  if (clean.reverseMortgageEnabled) clean.homeOwned = true;

  // Inputs added after a plan was saved: a missing NUMBER above becomes 0,
  // which for these would silently change existing plans' numbers. Keep
  // the pre-existence behavior instead (the yield was a hard-coded 2%).
  if (inputs.taxableDividendYield === undefined || inputs.taxableDividendYield === null) clean.taxableDividendYield = defaults.taxableDividendYield;
  // Changelog 208: a plan saved before the qualified share existed was
  // taxed as 100% qualified, and must stay that way -- not become 0%.
  if (inputs.taxableQualifiedDividendPct === undefined || inputs.taxableQualifiedDividendPct === null || inputs.taxableQualifiedDividendPct === '') clean.taxableQualifiedDividendPct = defaults.taxableQualifiedDividendPct;
  // Changelog 414: a plan saved before the switch existed follows the
  // stock/bond split only if its qualified share was still the old 100%
  // default. A figure someone typed is theirs and stays in force.
  if (typeof inputs.taxableQualifiedDividendFollowsAllocation !== 'boolean') {
    clean.taxableQualifiedDividendFollowsAllocation = Number(clean.taxableQualifiedDividendPct) === 100;
  }
  // Changelog 441: a plan saved before the weighting yields existed gets
  // the defaults; a blank or negative figure does too.
  for (const k of ['taxableStockYieldPct', 'taxableBondYieldPct']) {
    const v = Number(inputs[k]);
    if (inputs[k] === undefined || inputs[k] === null || inputs[k] === '' || !Number.isFinite(v) || v < 0) clean[k] = defaults[k];
  }
  // Changelog 415: a plan saved before the computed credit existed keeps a
  // credit it typed; one that typed nothing gets the formula.
  if (inputs.acaCreditSource !== 'formula' && inputs.acaCreditSource !== 'manual') {
    clean.acaCreditSource = Number(clean.acaSubsidyAnnualValue) > 0 ? 'manual' : 'formula';
  }
  if (inputs.acaBenchmarkPremiumSource !== 'state' && inputs.acaBenchmarkPremiumSource !== 'manual') clean.acaBenchmarkPremiumSource = 'state';
  if (!TAXABLE_ACCOUNT_OWNERS.includes(inputs.taxableAccountOwner)) clean.taxableAccountOwner = 'joint';
  if (clean.cashFloorSource !== 'holdings') clean.cashFloorSource = 'manual';
  if (inputs.dividendGrowthRate === undefined || inputs.dividendGrowthRate === null) clean.dividendGrowthRate = defaults.dividendGrowthRate;
  // Changelog 216: the withdrawal-rate guardrail's five settings. Missing
  // means "this plan predates the feature" (or a caller flipped only the
  // flag), and a missing number here must be the documented default, not
  // the 0 the loop above would leave -- 0 would make the band zero-wide and
  // every step do nothing, which reads as a broken feature rather than an
  // absent one.
  for (const key of ['wrGuardrailBandPct', 'wrGuardrailCutPct', 'wrGuardrailRaisePct', 'wrGuardrailMaxCutPct', 'wrGuardrailMaxRaisePct']) {
    const raw = inputs[key];
    if (raw === undefined || raw === null || raw === '') clean[key] = defaults[key];
  }
  // Changelog 336: a replayed start year must be a year on record. Missing
  // (a plan saved before the feature) is the default, never year 0.
  {
    const raw = Number(inputs.stressHistoryStartYear);
    clean.stressHistoryStartYear = Number.isFinite(raw) && raw > 0
      ? Math.min(HISTORY_LAST_YEAR, Math.max(PRE1928_FIRST_YEAR, Math.round(raw)))
      : defaults.stressHistoryStartYear;
  }
  // Changelog 449: the historical starts begin in 1928 or 1871, nothing else.
  clean.historyFromYear = historyFirstYear(inputs);
  // Changelog 247: the Monte Carlo's seed and inflation-uncertainty
  // settings. A missing seed must not become 0 (mulberry32 would treat it
  // as 1 anyway, but the Risk panel shows the figure), a missing inflation
  // volatility must not silently make the toggle do nothing, and the
  // correlation is clamped to [-1, 1] because the Cholesky step below
  // takes its square root. A plan saved before 247 with no volatility
  // figures at all keeps the documented defaults rather than 0 (a
  // zero-volatility Monte Carlo is just the plan repeated 1,000 times).
  for (const key of ['monteCarloSeed', 'mcInflationVolatility', 'mcInflationReturnCorrelation', 'volatilityPre', 'volatilityPost']) {
    const raw = inputs[key];
    if (raw === undefined || raw === null || raw === '') clean[key] = defaults[key];
  }
  clean.monteCarloSeed = Math.max(1, Math.floor(Math.abs(clean.monteCarloSeed))) || 1;
  // Changelog 250: the IRMAA cap's tier is an index 0-4; missing means 0.
  clean.rothConversionIrmaaTier = Math.max(0, Math.min(4, Math.floor(Number(clean.rothConversionIrmaaTier) || 0)));
  // Changelog 248: sex is one of three strings; anything else is unstated.
  for (const key of ['sex1', 'sex2']) {
    if (clean[key] !== 'female' && clean[key] !== 'male') clean[key] = 'unstated';
  }
  clean.mcInflationReturnCorrelation = Math.min(1, Math.max(-1, clean.mcInflationReturnCorrelation));

  // E28 (2026-09-30 review): clamps at the engine boundary. The Plan
  // screens validate each field as it is typed; these keep a saved,
  // imported or hand-edited plan from hanging the engine (a life
  // expectancy of 1e9), turning balances negative (a -150% return) or
  // silently running zero years. What was clamped because the plan could
  // not be run as entered is listed in invalidInputs, which runProjection
  // returns; a merely out-of-range figure is clamped quietly.
  const invalid = [];
  const clampKey = (key, lo, hi) => {
    const v = clean[key];
    if (!Number.isFinite(v)) { clean[key] = defaults[key]; return; }
    clean[key] = Math.min(hi, Math.max(lo, v));
  };
  const latestBirthYear = clean.planYear - 18;
  clampKey('birthYear1', 1900, latestBirthYear);
  clampKey('birthYear2', 1900, latestBirthYear);
  for (const n of [1, 2]) {
    const key = `lifeExpectancy${n}`;
    const age = clean.planYear - clean[`birthYear${n}`];
    const raw = clean[key];
    // Living to exactly today's age is one year of plan, so Spouse 1's
    // floor is the current age: below it there is no year to run at all.
    // Spouse 2 below today's age is how a plan says the spouse has already
    // died (the survivor rules key off it), so only the ceiling applies.
    if (n === 1 && Number.isFinite(raw) && raw < age) {
      invalid.push({ key, value: raw, reason: 'below-current-age', usedValue: age });
    }
    clampKey(key, n === 1 ? age : 0, 120);
    // Retirement past life expectancy is how a plan says "never retires",
    // so the ceiling is generous; claiming follows the statute's window.
    clampKey(`retireAge${n}`, 30, 120);
    clampKey(`claimingAge${n}`, 62, 70);
  }
  for (const key of ['preRetireReturn', 'postRetireReturn', 'stockReturnRate', 'bondReturnRate', 'cashFloorReturnRate', 'stressCrashReturn']) {
    clampKey(key, -99, 100);
  }
  // Fees (changelog 447): 0 to 5% a year each.
  for (const key of ['fundExpenseRatioPct', 'advisorFeePct']) {
    clampKey(key, 0, 5);
  }
  const nonNegative = [
    'preTaxInit', 'rothInit', 'taxableInit', 'hsaInit', 'concentratedStockInit', 'concentratedStock2Init', 'cashFloorInit',
    'homeValueInit', 'otherEstateAssetsInit', 'preTaxBasisInit', 'rothBasisInit', 'rothRecentConversionsInit', 'taxableBasisInit',
    'salary1', 'salary2', 'lifestyleExpense', 'ss1', 'ss2', 'pension1', 'pension2',
    'preTaxContribution1', 'preTaxContribution2', 'rothContribution1', 'rothContribution2', 'taxableContribution', 'hsaContribution',
    'currentHouseholdSpendingCustom', 'healthcareBridgeCost', 'partTimeIncome1', 'partTimeIncome2',
    'annuityPurchaseAmount', 'annuityIncome', 'rentalIncome',
    'portfolioFloorReal',
  ];
  for (const key of nonNegative) {
    if (key in defaults) clampKey(key, 0, Infinity);
  }
  // Lists: anything that is not a list becomes the default; entries of a
  // list of records that are not records are dropped, and a life event's
  // figures are parsed the way a typed field is.
  for (const key of ['milestones', 'rsuGrants', 'heirs', 'residencyTimeline']) {
    const list = Array.isArray(clean[key]) ? clean[key] : defaults[key];
    clean[key] = list.filter((e) => e !== null && typeof e === 'object' && !Array.isArray(e));
  }
  for (const key of ['rsuRefreshCustomSchedule1', 'rsuRefreshCustomSchedule2', 'lifestyleExpenseMonthly']) {
    if (!Array.isArray(clean[key])) { clean[key] = defaults[key]; continue; }
    clean[key] = clean[key].map((v) => {
      const num = typeof v === 'string' ? parseMoneyString(v) : Number(v);
      return Number.isFinite(num) ? num : 0;
    });
  }
  // A life event's typed figures: "5,000" is 5000, and an amount that is
  // not a number counts as $0 rather than turning the plan into NaN. Only
  // string fields are touched, so a well-formed event is returned as is.
  clean.milestones = clean.milestones.map((m) => {
    if (typeof m.amount !== 'string' && typeof m.startAge !== 'string' && typeof m.endAge !== 'string') return m;
    const out = { ...m };
    if (typeof m.amount === 'string') {
      const v = parseMoneyString(m.amount);
      out.amount = Number.isFinite(v) ? v : 0;
    }
    for (const k of ['startAge', 'endAge']) {
      if (typeof m[k] === 'string') out[k] = parseMoneyString(m[k]);
    }
    return out;
  });
  Object.defineProperty(clean, 'invalidInputs', { value: invalid, enumerable: false });

  return clean;
}

// "5,000", "$5,000", " 5000 " -> 5000; anything else -> NaN.
function parseMoneyString(str) {
  const cleaned = String(str).replace(/[$,\s]/g, '');
  return cleaned === '' ? NaN : Number(cleaned);
}

// Changelog 336: the history table by calendar year, for the 'history'
// stress type.
// Changelog 449: with the pre-1928 years (Robert Shiller's data) in the
// same map, a real start year from 1871 on can be replayed. The Monte
// Carlo's bootstrap still draws from HISTORICAL_RETURNS (1928 on) only.
const HISTORY_BY_YEAR = new Map([...HISTORICAL_RETURNS_PRE1928, ...HISTORICAL_RETURNS].map((r) => [r[0], r]));

// Where the historical starts begin (changelog 449): 1928 by default
// (Damodaran's table), or 1871 when the plan asks for Robert Shiller's
// longer record.
export const HISTORY_FROM_CHOICES = Object.freeze([HISTORY_FIRST_YEAR, PRE1928_FIRST_YEAR]);
export function historyFirstYear(inputs) {
  return Number(inputs?.historyFromYear) === PRE1928_FIRST_YEAR ? PRE1928_FIRST_YEAR : HISTORY_FIRST_YEAR;
}

// The named Historical Stress Tests: each is a window of real calendar
// years replayed from HISTORICAL_RETURNS (A30). Exported so the Risk tab
// can list the same years the engine runs.
export const NAMED_STRESS_SCENARIOS = {
  1929: { start: 1929, years: 4 },
  1966: { start: 1966, years: 4 },
  1973: { start: 1973, years: 4 },
  2000: { start: 2000, years: 3 },
  2008: { start: 2008, years: 3 },
};

// Spending rules spec (changelog 335): the portfolio a guardrail measures.
// Sum of the four invested buckets at a row's end -- the same set the
// withdrawal-rate guardrail has always divided by.
function investedEnd(row) {
  return (row.preTaxEnd || 0) + (row.rothEnd || 0) + (row.taxableEnd || 0) + (row.hsaEnd || 0);
}
function investedStart(row) {
  return (row.preTaxStart || 0) + (row.rothStart || 0) + (row.taxableStart || 0) + (row.hsaStart || 0);
}

// The withdrawal-rate guardrail compares each year against the PLAN'S OWN
// path (changelog 335): the same plan with both guardrails off, no stress
// scenario and no sampled markets. It used to compare against the first
// retired year's total drawdown, which carried the cash-reserve fill, one-off
// events and conversion tax -- so the demo's anchor was 14.5% and the rule
// raised spending 20% for life on a smooth projection. Measured against the
// plan's own path, anything the plan SCHEDULED (Social Security starting,
// the health bridge ending, a reserve fill, a wedding) appears on both sides
// and cancels; only the markets and inflation move the rule. A smooth
// projection therefore never triggers it.
//
// Memoized: the Monte Carlo asks for the same path once per trial.
const plannedSpendingPathCache = new Map();
const PLANNED_PATH_CACHE_MAX = 16;
function plannedSpendingPath(inputs) {
  const planned = { ...inputs, withdrawalGuardrailsEnabled: false, spendingGuardrails: false, stressType: 'none' };
  const key = JSON.stringify(planned);
  const hit = plannedSpendingPathCache.get(key);
  if (hit) return hit;
  const path = new Map();
  for (const row of runProjection(planned).years) {
    path.set(row.year, {
      spend: row.lifestyleExpenses || 0,
      portfolio: investedStart(row),
      realEnd: investedEnd(row) / (row.inflFactor || 1),
    });
  }
  if (plannedSpendingPathCache.size >= PLANNED_PATH_CACHE_MAX) {
    plannedSpendingPathCache.delete(plannedSpendingPathCache.keys().next().value);
  }
  plannedSpendingPathCache.set(key, path);
  return path;
}

// Single trial projection calculation
export function runProjection(rawInputs = DEFAULT_INPUTS, monteCarloReturnOverride = null, monteCarloInflationOverride = null, seedDeferralCuts = null) {
  const inputs = sanitizeInputs(rawInputs);
  // E13 (2026-09-30 review): a working year whose take-home cannot fund its
  // planned savings has those savings cut. The cut has to happen BEFORE the
  // deferral is matched, taxed as deducted, or converted -- cutting it after
  // the fact left Pre-Tax negative, kept the employer match on money never
  // deferred, and priced the tax as if the deferral had happened. So a run
  // that cut any savings is re-run with those cuts applied up front (where
  // the contribution is set), and the in-year cut then only covers what the
  // up-front cut made visible (mostly the tax on the deferral that is no
  // longer deducted). Cuts only accumulate, so this settles in two or three
  // passes; plans that never cut savings run exactly once.
  // seedDeferralCuts: the Monte Carlo passes the deterministic plan's cuts,
  // so a trial starts where the plan settled instead of re-discovering them.
  let deferralCuts = seedDeferralCuts;
  let cutLog = new Map();
  let result = runProjectionCore(inputs, monteCarloReturnOverride, monteCarloInflationOverride, deferralCuts, cutLog);
  for (let pass = 0; pass < 4 && cutLog.size > 0; pass++) {
    const next = new Map(deferralCuts || []);
    for (const [year, c] of cutLog) {
      const prev = next.get(year) || { preTax: 0, roth: 0, taxable: 0 };
      next.set(year, { preTax: prev.preTax + c.preTax, roth: prev.roth + c.roth, taxable: prev.taxable + c.taxable });
    }
    deferralCuts = next;
    cutLog = new Map();
    result = runProjectionCore(inputs, monteCarloReturnOverride, monteCarloInflationOverride, deferralCuts, cutLog);
  }
  // Not enumerable: no display, diff or export ever sees it.
  Object.defineProperty(result, 'deferralCuts', { value: deferralCuts, enumerable: false });
  return result;
}

function runProjectionCore(inputs, monteCarloReturnOverride, monteCarloInflationOverride, deferralCuts, cutLog) {
  const years = [];
  const planWarnings = [];
  let acaPremiumWarned = false;
  // A24: a debt payment that does not cover the first year's interest never
  // pays the loan off -- the balance grows every year. The math is left as
  // entered (it may be deliberate); the plan just says so.
  for (const [balKey, rateKey, payKey, code, label] of [
    ['mortgageBalance', 'mortgageRate', 'mortgagePayment', 'mortgage-payment-below-interest', 'mortgage'],
    ['otherDebtBalance', 'otherDebtRate', 'otherDebtPayment', 'debt-payment-below-interest', 'other debt'],
  ]) {
    const bal = inputs[balKey] || 0;
    const interest = bal * ((inputs[rateKey] || 0) / 100);
    const pay = inputs[payKey] || 0;
    if (bal > 0 && pay > 0 && pay <= interest) {
      planWarnings.push({ code, message: `The ${label} payment does not cover its interest, so the balance grows every year and is never paid off.` });
    }
  }
  // A27: a lump-sum pension is one payment at its start age. A start age
  // before the plan's first year means it was already paid, so the plan
  // adds nothing (the money is assumed to be in the balances entered) and
  // says so, in case it was meant to arrive now.
  for (const n of [1, 2]) {
    if (n === 2 && !inputs.spouse2Enabled) continue;
    const ageNow = inputs.planYear - inputs[`birthYear${n}`];
    if (inputs[`pension${n}`] > 0 && inputs[`pension${n}LumpSum`] && inputs[`pensionStartAge${n}`] < ageNow) {
      planWarnings.push({
        code: `pension${n}-lump-sum-already-paid`,
        message: `The lump-sum pension's start age (${inputs[`pensionStartAge${n}`]}) is before this plan's first year, so it is treated as already received and is not paid again.`,
      });
    }
  }
  
  // Starting values
  let preTax = inputs.preTaxInit;
  let roth = inputs.rothInit;
  let taxable = inputs.taxableInit;
  let hsa = inputs.hsaInit;
  // After-tax basis sitting inside the combined Pre-Tax bucket -- see the
  // Backdoor Roth contribution logic and the Roth Conversion pro-rata
  // logic below for how this is built up and spent.
  let preTaxBasis = inputs.preTaxBasisInit || 0;
  // How much of a non-qualified annuity's IRC s 72(c)(1) "investment in the
  // contract" has been recovered tax-free so far. Once the whole investment
  // has come back the exclusion stops and every later payout is fully
  // ordinary income -- s 72(b)(2) (audit Q-9(b), changelog 126).
  let annuityBasisRecovered = 0;
  // E18: the share of the stated premium the source account could actually
  // pay. A $500k purchase from a $50k account buys a $50k contract, so its
  // payout (and its s 72 investment) is scaled by this. 1 for a contract
  // bought before the plan's first year, which no account pays for here.
  let annuityPaidShare = 1;
  // Roth ordering-rule layers (see rothBasisInit in DEFAULT_INPUTS and
  // splitRothDraw). Recent conversions are spread evenly over the four
  // calendar years before the plan starts -- the ones whose five-year
  // clocks are still running -- and treated as fully taxable when made.
  const rothLayers = makeRothLayers(
    inputs.rothBasisInit,
    (inputs.rothRecentConversionsInit > 0)
      ? [1, 2, 3, 4].map((back) => ({ year: inputs.planYear - back, taxable: inputs.rothRecentConversionsInit / 4, nontaxable: 0 }))
      : []
  );
  // Taxable Brokerage cost basis, tracked as an evolving pool rather than
  // the flat taxableCapitalGainsRatio-forever assumption this replaces. If
  // the user hasn't entered a known basis (taxableBasisInit <= 0), derive a
  // starting point from the existing flat-ratio assumption so year-1
  // behavior is unchanged for anyone who doesn't touch the new setting.
  let taxableBasis = inputs.taxableBasisInit > 0
    ? Math.min(inputs.taxableBasisInit, Math.max(0, inputs.taxableInit))
    : Math.max(0, inputs.taxableInit) * (1 - (inputs.taxableCapitalGainsRatio !== undefined ? inputs.taxableCapitalGainsRatio : 0.60));
  // Net Unrealized Appreciation (NUA): a one-time flag so the lump-sum
  // employer-stock distribution below only fires once per projection, the
  // year age1 first reaches nuaDistributionAge.
  let nuaTriggered = false;
  // Concentrated Stock Position (e.g. accumulated employer stock from years
  // of RSU/GSU vesting that hasn't been sold/diversified) -- tracked as its
  // own risk-exposure bucket, separate from the diversified Taxable
  // Brokerage balance, since a single-company holding carries a
  // concentration risk a diversified portfolio doesn't. See the
  // concentratedStock* block inside the year loop below for how it grows
  // and diversifies.
  // Two independent concentrated positions are modeled (e.g. one spouse's
  // GOOG and the other's META). Position 1 keeps the original un-numbered
  // `concentratedStock*` input keys so existing saved plans are untouched;
  // position 2 uses `concentratedStock2*`. csPositionConfig() is the one
  // place that mapping lives.
  const csPositionConfig = (n) => {
    const p = n === 1 ? 'concentratedStock' : 'concentratedStock2';
    const num = (name, dflt) => {
      const v = inputs[`${p}${name}`];
      return v !== undefined ? v : dflt;
    };
    return {
      enabled: !!inputs[`${p}Enabled`],
      init: Math.max(0, inputs[`${p}Init`] || 0),
      costBasisPct: Math.max(0, Math.min(100, num('CostBasisPct', 20))),
      growthRate: num('GrowthRate', 8) || 0,
      diversifyPct: Math.max(0, Math.min(100, inputs[`${p}DiversifyPct`] || 0)),
      diversifyTaxRate: Math.max(0, Math.min(100, num('DiversifyTaxRate', 15))),
      vestRoutingEnabled: !!inputs[`${p}VestRoutingEnabled`],
      vestCoverPct: Math.max(0, Math.min(100, num('VestCoverPct', 35))),
      vestHoldPct: Math.max(0, Math.min(100, num('VestHoldPct', 100))),
      // Position 2 defaults to spouse 2's vests -- the whole reason a
      // second position exists is "each spouse holds a different
      // employer's stock".
      vestSpouse: String(num('VestSpouse', n === 1 ? '1' : '2')),
    };
  };
  const csConfigs = [csPositionConfig(1), csPositionConfig(2)];
  // Per-position running state. basisDollars is cost basis in DOLLARS,
  // consulted only when that position's vest routing is on. The flat
  // CostBasisPct assumption stops being adequate once new vests join the
  // position, because just-vested shares are 100% basis (basis = vest-day
  // market price) while the accumulated position may be mostly gain -- a
  // single flat % would overtax the new shares' eventual diversification.
  // Seeded from the flat % applied to today's balance; grows only when
  // vests are routed in, shrinks proportionally when shares are
  // diversified away. When routing is OFF basisDollars is never consulted,
  // preserving the legacy flat-% math bit-for-bit.
  const csState = csConfigs.map((cfg) => ({
    balance: cfg.enabled ? cfg.init : 0,
    basisDollars: (cfg.enabled ? cfg.init : 0) * (cfg.costBasisPct / 100),
    // Set by the basis reset at the first death (changelog 360): from then
    // on basisDollars is the position's basis even without vest routing.
    basisTracked: false,
  }));
  // Cash Floor / Emergency Reserve: a stable, low-yield "bucket" of cash
  // held apart from the market-invested portfolio specifically to be spent
  // FIRST in a down-market retirement year, instead of selling depressed
  // Taxable/Pre-Tax/Roth holdings at a loss -- the classic "bucket strategy"
  // defense against sequence-of-returns risk. Replenished from that year's
  // withdrawal in an up year when under its target. See the cashFloor*
  // block inside the year loop below for the full mechanics.
  let cashReserveBalance = inputs.cashFloorEnabled ? Math.max(0, inputs.cashFloorInit || 0) : 0;
  // Non-Qualified Deferred Compensation (NQDC) balances -- an unsecured
  // bookkeeping account per spouse, entirely separate from the
  // Pre-Tax/Roth/Taxable buckets: grows while deferring salary, then pays
  // out on its own elected schedule. See the nqdc* block inside the year
  // loop below.
  let nqdcBalance1 = inputs.nqdcEnabled1 ? Math.max(0, inputs.nqdcInit1 || 0) : 0;
  let nqdcBalance2 = inputs.nqdcEnabled2 ? Math.max(0, inputs.nqdcInit2 || 0) : 0;
  // Debt balances, amortized down year by year below.
  let mortgageBalance = inputs.mortgageBalance || 0;
  let otherDebtBalance = inputs.otherDebtBalance || 0;
  // Tax-Loss Harvesting: running balance of realized-but-unused capital
  // losses, carried forward year to year per IRC Sec. 1212 until fully
  // absorbed against future gains/ordinary income. See the harvesting
  // block below (near forcedRealizedGains) for how it's built up and spent.
  let lossCarryforward = 0;
  // Reverse Mortgage / Home Equity: homeValue grows every year once
  // enabled (real estate appreciation happens regardless of whether the
  // loan has originated yet); reverseMortgageBalance is the growing loan
  // balance once it has; reverseMortgageOriginated flags the one-time
  // origination event; reverseMortgageAvailable tracks how much of the
  // locked-in principal limit is left to draw under 'monthly' payout mode.
  // The home is in the plan when owned; the reverse mortgage is a loan
  // against it, not the reason it exists (changelog 144).
  const homeInPlan = Boolean(inputs.homeOwned || inputs.reverseMortgageEnabled);
  let homeValue = homeInPlan ? Math.max(0, inputs.homeValueInit || 0) : 0;
  // Non-portfolio estate assets (changelog 144): appreciate, never spent.
  let otherEstateAssetsValue = Math.max(0, inputs.otherEstateAssetsInit || 0);
  let reverseMortgageBalance = 0;
  let reverseMortgageOriginated = false;
  let reverseMortgageAvailable = 0;
  // Life Insurance (Cash Value): cash value and any outstanding policy
  // loan balance each compound at their own rate every year, mirroring
  // the reverse-mortgage pattern above -- just with no origination event,
  // since the policy already exists from day one if enabled. Tracked
  // independently per spouse (see DEFAULT_INPUTS comment above).
  let lifeInsuranceCashValue1 = inputs.lifeInsuranceEnabled1 ? Math.max(0, inputs.lifeInsuranceCashValueInit1 || 0) : 0;
  let lifeInsuranceLoanBalance1 = inputs.lifeInsuranceEnabled1 ? Math.max(0, inputs.lifeInsuranceLoanBalance1 || 0) : 0;
  let lifeInsuranceCashValue2 = inputs.lifeInsuranceEnabled2 ? Math.max(0, inputs.lifeInsuranceCashValueInit2 || 0) : 0;
  let lifeInsuranceLoanBalance2 = inputs.lifeInsuranceEnabled2 ? Math.max(0, inputs.lifeInsuranceLoanBalance2 || 0) : 0;
  // Life-insurance policy state across the first death (2026-08-30 audit
  // F-1). A policy pays exactly once, at the insured's death:
  //  - self/spouse-owned, survivor still alive: the net death benefit is
  //    paid to the survivor and invested in Taxable (income-tax-free under
  //    IRC 101(a), so it lands as 100% basis); the policy then ceases to
  //    exist -- no more cash-value/loan growth and nothing at plan end.
  //  - trust-owned (ILIT): proceeds bypass the survivor and are held for
  //    the heirs, frozen at their value in the year of death (an ILIT
  //    corpus does grow in reality, but modeling its investments is out
  //    of scope; freezing beats the old behavior of compounding the cash
  //    value and loan on a policy whose insured is dead).
  // A policy on the second-to-die (or on a single planner) still pays at
  // plan end through the estate calculation, unchanged.
  let lifeInsurancePaidOut1 = false;
  // The basis reset at the first death happens once (changelog 360).
  let firstDeathBasisResetDone = false;
  let firstDeathBasisResetShareApplied = null;
  let firstDeathBasisResetYear = null;
  let lifeInsurancePaidOut2 = false;
  let lifeInsuranceHeldForHeirs1 = 0;
  let lifeInsuranceHeldForHeirs2 = 0;

  const startYear = inputs.planYear;
  const birthYear1 = inputs.birthYear1;
  const birthYear2 = inputs.spouse2Enabled ? inputs.birthYear2 : birthYear1;
  
  // Set up ages
  const age1Init = startYear - birthYear1;
  const age2Init = startYear - birthYear2;

  const lifeExpectancy1 = inputs.lifeExpectancy1;
  const lifeExpectancy2 = inputs.spouse2Enabled ? inputs.lifeExpectancy2 : 0;
  
  const maxYearIndex = Math.max(
    lifeExpectancy1 - age1Init, 
    inputs.spouse2Enabled ? (lifeExpectancy2 - age2Init) : 0
  );

  const horizonYear = startYear + maxYearIndex;

  // Track retirement year for glide path
  let householdRetirementYear = null;
  // Changelog 415: last year's settled ACA MAGI, the figure a household
  // projects this year's marketplace income from once it is on the
  // marketplace (null in any year it was not).
  let prevAcaMagi = null;

  // IRMAA two-year lookback (changelog 121). Each year's IRMAA MAGI and
  // filing status are appended here AFTER the year's premium is priced, so
  // history[length - 2] is the return "filed two years earlier" that SSA
  // actually uses. The first two projection years have no such row and
  // fall back to their own MAGI (the plan does not ask for prior-year
  // income). lastIrmaaLifeChangeYear records the most recent SSA-44
  // qualifying event -- a spouse stopping work or dying -- for the
  // optional appeal below.
  // Months of benefit the Retirement Earnings Test has withheld so far, per
  // spouse. Carried across years the same way irmaaMagiHistory is, because
  // the credit Social Security gives back at FRA depends on the whole run of
  // withheld months, not just this year's.
  let ssEarningsTestMonths1 = 0;
  // Survivor benefit claim ages (changelog 265): fixed in the first year
  // the survivor is alone and at least 60, and held from then on, since
  // the age reduction is set when the survivor benefit starts.
  let survivorClaimAge1 = null;
  let survivorClaimAge2 = null;
  let ssEarningsTestMonths2 = 0;

  const irmaaMagiHistory = [];
  // Seed the two pre-plan returns (changelog 179). Pushed oldest-first so
  // the existing `length - 2` lookback finds planYear-2 in the plan's first
  // year and planYear-1 in its second, with no other change to that logic.
  //
  // Filing status for a pre-plan year is taken as the plan's STARTING
  // status: the engine knows nothing about the household before the plan
  // begins, and a survivor transition inside the plan must not reach
  // backwards into a return that was already filed.
  //
  // A figure left at 0 is "not provided", not "$0 of income" -- it is
  // marked unknown and the lookback falls back to that year's own MAGI, the
  // same behavior as before this existed. Seeding happens only when at
  // least one figure is given, so an untouched plan is bit-for-bit
  // unchanged.
  {
    const priorTwo = Math.max(0, Number(inputs.irmaaTwoYearsPriorMagi) || 0);
    const priorOne = Math.max(0, Number(inputs.irmaaPriorYearMagi) || 0);
    if (priorTwo > 0 || priorOne > 0) {
      irmaaMagiHistory.push({ magi: priorTwo, status: inputs.filingStatus, seeded: true, unknown: !(priorTwo > 0) });
      irmaaMagiHistory.push({ magi: priorOne, status: inputs.filingStatus, seeded: true, unknown: !(priorOne > 0) });
    }
  }
  let lastIrmaaLifeChangeYear = null;
  let prevSpouse1Working = null;
  let prevSpouse2Working = null;
  let prevSpouse1Alive = true;
  let prevSpouse2Alive = !!inputs.spouse2Enabled;

  // Track negative return history for spending guardrails
  let initialRetirementCrashOccurred = false;
  // Last year's market return. Spending and withdrawals are set at the
  // START of a year, before that year's return is known (growth is applied
  // after them), so every decision that reacts to "a down market" reacts
  // to the year that has already finished, never the one still under way.
  let lastYearReturnRate = null;
  // Running total of investment fees paid (changelog 447), nominal dollars.
  let feesPaidCumulative = 0;
  let lifestyleSpendingCutMultiplier = 1.0;
  // Withdrawal-rate guardrails (changelog 216). Persistent across years:
  // each trigger moves the multiplier and it stays moved until the next one.
  let wrGuardrailMultiplier = 1.0;
  // The plan's own path, which both guardrails measure against (changelog
  // 335). Only built when one of them is on.
  const guardrailPlannedPath = (inputs.withdrawalGuardrailsEnabled || inputs.spendingGuardrails)
    ? plannedSpendingPath(inputs) : null;
  // Crash guardrail catch-up (changelog 335). The freeze used to be
  // permanent: every down year skipped that year's inflation raise for the
  // rest of the plan, and in the 1940s and 1970s sequences real spending
  // ended 40-47% below plan. These track where each slice WOULD be without
  // the freezes, so spending can catch back up once the portfolio is back on
  // the plan's own path.
  let crashGuardTrackLifestyle = 1.0;
  let crashGuardTrackHousing = 1.0;
  let crashGuardTrackMedical = 1.0;
  let crashGuardRecovered = false;
  // Realized price level (changelog 335). inflFactor compounds the plan's
  // inflation RATE whatever a run actually used; this compounds the rate
  // each year really had, so a stress scenario or a historical sequence can
  // be shown in today's dollars honestly. Identical to inflFactor -- the
  // same number, not a recomputation of it -- until a year's inflation
  // departs from the plan's.
  let priceIndexRaw = 1.0;
  let priceIndexDiverged = false;
  // Changelog 420: true from the first sampled year whose inflation differed
  // from the plan's; the indexed factors chain from then on.
  let mcIndexingDiverged = false;

  // Residency timeline (changelog 195): resolved once, looked up per year.
  // With no moves every year gets planResidence, whose fields ARE the
  // plan-wide inputs -- so a plan without a timeline prices exactly as it
  // did before the timeline existed.
  const planResidence = planWideResidence(inputs);
  const residencyTimeline = readResidencyTimeline(inputs.residencyTimeline, planResidence);
  // Years abroad (changelog 196): the foreign tax credit carryforward, by
  // basket, and the years each spouse went without Medicare Part B while
  // abroad (each one adds 10% to the Part B premium for life on return).
  let ftcPools = { general: [], passive: [] };
  let partBGapYears1 = 0;
  let partBGapYears2 = 0;

  for (let year = startYear; year <= horizonYear; year++) {
    const age1 = age1Init + (year - startYear);
    const age2 = age2Init + (year - startYear);
    // Where the household lives this year: drives state income tax, the ACA
    // non-expansion check, and the row's residenceState.
    const residence = residencyTimeline.length > 0
      ? residenceAt(residencyTimeline, planResidence, year)
      : planResidence;
    const abroad = residence.kind === 'foreign';
    const foreignTerms = abroad ? residence.foreign : null;
    // The move year of a move after January (changelog 203): the share of
    // the year lived in the new place, and where the rest was lived.
    const moveShare = residence.fromYear === year && residence.fromMonth > 1 ? (13 - residence.fromMonth) / 12 : 1;
    const priorResidence = moveShare < 1 ? residenceAt(residencyTimeline, planResidence, year - 1) : null;
    // Living costs there as a share of spending now, blended in a split
    // move year.
    const priorCostOfLiving = priorResidence ? priorResidence.costOfLivingPct : residence.costOfLivingPct;
    const costOfLivingFactor = (moveShare * residence.costOfLivingPct + (1 - moveShare) * priorCostOfLiving) / 100;

    let spouse1Alive = age1 <= lifeExpectancy1;
    let spouse2Alive = inputs.spouse2Enabled && (age2 <= lifeExpectancy2);

    // Apply Survivor Stress Test. The stress age is the age the spouse
    // passes away, read the way Life Expectancy is: alive through that
    // year (a joint return for the year of death, IRC s 6013(a)(3)), gone
    // from the next. Until changelog 411 the stress path ended the marriage
    // in the year the spouse turned the stress age, a year earlier than the
    // same age entered as Life Expectancy, and filed that year Single.
    if (inputs.spouse2Enabled && inputs.survivorStressEnabled) {
      if (inputs.survivorStressSpouse === 1 && age1 > inputs.survivorStressAge) {
        spouse1Alive = false;
      }
      if (inputs.survivorStressSpouse === 2 && age2 > inputs.survivorStressAge) {
        spouse2Alive = false;
      }
    }

    if (!spouse1Alive && !spouse2Alive) break;

    // Whose age governs the Pre-Tax and Roth buckets this year. The buckets
    // have no per-spouse owner: while Spouse 1 lives they are keyed to
    // Spouse 1, and once Spouse 1 has died the survivor owns them (a spousal
    // rollover -- the same treatment the RMD schedule below already uses).
    // So the 59 1/2 penalty test, the Roth ordering rules and the state
    // retirement-income age tests follow the survivor's age, not the age
    // Spouse 1 would have reached. The survivor also files the return
    // alone, so the state tax helpers see the survivor as the filer.
    const ownerAge = spouse1Alive ? age1 : (spouse2Alive ? age2 : age1);

    // Household status
    let currentStatus = inputs.filingStatus;
    if (inputs.spouse2Enabled) {
      if (spouse1Alive && spouse2Alive) {
        currentStatus = inputs.filingStatus;
      } else {
        currentStatus = 'Single'; // survivor changes status to Single
      }
    }

    const isSpouse1Retired = age1 >= inputs.retireAge1;
    const isSpouse2Retired = spouse2Alive ? (age2 >= inputs.retireAge2) : true;
    const isRetired = (spouse1Alive ? isSpouse1Retired : true) && (spouse2Alive ? isSpouse2Retired : true);

    if (isRetired && householdRetirementYear === null) {
      householdRetirementYear = year;
    }

    // SSA-44 life-changing events: a spouse who was drawing a salary stops
    // working, or a spouse dies. Recorded whether or not the appeal toggle
    // is on so the ledger can explain the lookback either way.
    {
      const spouse1Working = spouse1Alive && !isSpouse1Retired && ((inputs.salary1 || 0) > 0);
      const spouse2Working = spouse2Alive && !isSpouse2Retired && ((inputs.salary2 || 0) > 0);
      const stoppedWork = (prevSpouse1Working === true && !spouse1Working) || (prevSpouse2Working === true && !spouse2Working);
      const spouseDied = (prevSpouse1Alive && !spouse1Alive) || (prevSpouse2Alive && !spouse2Alive);
      if (stoppedWork || spouseDied) lastIrmaaLifeChangeYear = year;
      // A stoppage that happened BEFORE the plan starts (changelog 179).
      // `stoppedWork` above needs a working -> retired transition inside the
      // projection, so a plan that begins the year someone retires never
      // records one -- and the SSA-44 toggle silently did nothing for
      // exactly the household the pre-plan MAGI fields are built for: enter
      // your working-income returns, watch the surcharge appear, switch the
      // appeal on, and nothing moved.
      //
      // Recorded WITHOUT reference to the appeal toggle, exactly like the
      // in-projection events above and for the same reason: the ledger's
      // SSA-44 badge and the Action Plan item exist to TELL people the form
      // is worth filing, and gating that on a toggle they would only switch
      // on if they already knew is circular. (A first pass did gate it. The
      // gate changed no test result, because the appeal is only APPLIED
      // when the toggle is on -- which is what exposed it as both dead and
      // contrary to the design note above.)
      //
      // Anchored at startYear - 1, the latest the stoppage could have been,
      // opening the same window the seeded returns cover. With no seeds
      // there is no lookback row in those years, so nothing is computed and
      // no existing plan moves. The appeal is still only ever applied where
      // it LOWERS the premium.
      if (lastIrmaaLifeChangeYear === null && isRetired && year === startYear) {
        lastIrmaaLifeChangeYear = startYear - 1;
      }

      // A declared event (changelog 180) wins whenever it is the most
      // recent one, and may sit before the plan starts -- retiring the year
      // before year one is the commonest case. Taking the LATER of declared
      // and detected matters: someone who declares a divorce at 63 and then
      // stops working at 65 should get the window from the stoppage, which
      // is the event that actually lowers their income.
      {
        const declared = Math.round(Number(inputs.irmaaLifeChangeEventYear) || 0);
        if (declared > 0 && year >= declared && (lastIrmaaLifeChangeYear === null || declared > lastIrmaaLifeChangeYear)) {
          lastIrmaaLifeChangeYear = declared;
        }
      }
      prevSpouse1Working = spouse1Working;
      prevSpouse2Working = spouse2Working;
      prevSpouse1Alive = spouse1Alive;
      prevSpouse2Alive = spouse2Alive;
    }

    // Determine growth and inflation rates
    let baseReturnRate = 0;
    if (inputs.rebalancingEnabled) {
      const stockAlloc = planStockShareForYear(inputs, isRetired, year, householdRetirementYear);
      const bondAlloc = 100 - stockAlloc;
      baseReturnRate = (stockAlloc * inputs.stockReturnRate + bondAlloc * inputs.bondReturnRate) / 100;
    } else {
      baseReturnRate = isRetired ? inputs.postRetireReturn : inputs.preRetireReturn;
      // Apply Glide Path
      if (inputs.equityGlidePathEnabled && isRetired && householdRetirementYear !== null) {
        const yearsRetired = year - householdRetirementYear;
        baseReturnRate = Math.max(
          inputs.equityGlidePathFloor,
          baseReturnRate - (yearsRetired * inputs.equityGlidePathRate)
        );
      }
    }
    let activeInflationRate = inputs.inflationRate;
    // True only in a year a Historical Stress Test scenario is actively
    // overriding activeInflationRate below -- distinct from just checking
    // activeInflationRate !== inputs.inflationRate, which would misfire if
    // a custom crash's inflation rate happens to equal the baseline. Drives
    // the Stress Inflation Strategy blending further down (see
    // stressInflationStrategy in DEFAULT_INPUTS).
    let stressInflationOverrideActive = false;
    // Changelog 247: this year's sampled-inflation delta from a Monte Carlo
    // trial (0 outside the Monte Carlo, and in every trial year that was
    // not sampled). See the override block below.
    let mcInflationDelta = 0;


    let returnRate = baseReturnRate;

    // Monte Carlo / Stress overrides
    if (monteCarloReturnOverride !== null && monteCarloReturnOverride[year] !== undefined && monteCarloReturnOverride[year] !== null) {
      // (!== undefined/null rather than truthy: a sampled return of exactly
      // 0 is a valid year and must not fall through to the base assumption.)
      // Floor at -100% so no override can turn a balance negative (F-5).
      //
      // Changelog 422: a Monte Carlo trial hands this year its random draw
      // and the ENGINE turns it into a return, from the base return and
      // the volatility of the phase the engine itself is in -- so a
      // Survivor Stress Test death, a long-term-care episode that ends a
      // life, a glide path, every rule this loop knows, shapes the trial
      // the way it shapes the plan. The trial loop used to work out the
      // phase on its own and ignore the stress test, so with it on the
      // median trial sat far above the plan at zero volatility. A plain
      // number is still an absolute return (the stress paths and tests).
      const override = monteCarloReturnOverride[year];
      if (typeof override === 'number') {
        returnRate = Math.max(-100, override);
      } else {
        const stockShareNow = planStockShareForYear(inputs, isRetired, year, householdRetirementYear);
        if (override.bootstrapRow !== undefined) {
          // One real year at the plan's own mix (changelog 267).
          const row = HISTORICAL_RETURNS[override.bootstrapRow];
          const raw = historicalPortfolioReturn(row, stockShareNow);
          returnRate = override.recenter ? recenterReturn(raw, historicalGeometricMean(stockShareNow), baseReturnRate) : raw;
        } else {
          const volatility = inputs.rebalancingEnabled
            ? (stockShareNow * STOCK_VOLATILITY_PCT + (100 - stockShareNow) * BOND_VOLATILITY_PCT) / 100
            : (isRetired ? inputs.volatilityPost : inputs.volatilityPre);
          const { m, s: sd } = lognormalReturnParams(baseReturnRate / 100, volatility / 100);
          returnRate = m > 0 ? (m * Math.exp(sd * override.z) - 1) * 100 : -100;
        }
        returnRate = Math.max(-100, returnRate);
      }
      // Changelog 247: a Monte Carlo trial may also sample this year's
      // inflation. It is applied as a DELTA from the planned rate, added to
      // each compounding lifestyle slice's own rate -- general spending
      // (activeInflationRate), Housing and Health -- so a sampled 3.5% in
      // a 2.5% plan lifts Housing's own 3% to 4%, rather than replacing it
      // the way a Historical Stress Test's crash-year figure does under
      // 'partial'. A year sampled at exactly the planned rate is therefore
      // bit-identical to no override. Salary, milestones and the granular
      // SS / medical / Medicare factors stay on their planned rates. Only
      // meaningful alongside a return override: the two draws are
      // correlated, so a trial is either fully sampled or not at all.
      if (monteCarloInflationOverride !== null && monteCarloInflationOverride[year] !== undefined && monteCarloInflationOverride[year] !== null) {
        mcInflationDelta = monteCarloInflationOverride[year] - inputs.inflationRate;
        activeInflationRate = inputs.inflationRate + mcInflationDelta;
        if (mcInflationDelta !== 0) mcIndexingDiverged = true;
      }
    } else {
      // Apply Stress Scenarios
      let recessionStartYear = 2030;
      if (inputs.stressStartMode === 'retirement') {
        recessionStartYear = householdRetirementYear || 2030;
      } else {
        recessionStartYear = inputs.stressStartYear || inputs.stressCrashYear || 2030;
      }

      const yearsSinceStress = year - recessionStartYear;

      // A30 (2026-09-30 review): the named scenarios are real calendar
      // windows replayed the same way as 'history' -- the plan's own
      // stock/bond mix of that year's S&P 500 and 10-year Treasury returns,
      // and that year's CPI from the same table -- rather than 100%-equity
      // index returns applied to the whole portfolio beside a replay that
      // used the plan's mix.
      const named = NAMED_STRESS_SCENARIOS[inputs.stressType];
      const replayYear = named
        ? (yearsSinceStress >= 0 && yearsSinceStress < named.years ? named.start + yearsSinceStress : null)
        : (inputs.stressType === 'history' && yearsSinceStress >= 0 ? inputs.stressHistoryStartYear + yearsSinceStress : null);
      if (named || inputs.stressType === 'history') {
        // Changelog 336: a real start year, replayed for as long as the
        // record lasts (a named scenario, for its own window). The return
        // is the plan's stock/bond mix of that calendar year's S&P 500 and
        // 10-year Treasury total returns, with the same glide the
        // historical-starts run uses.
        const row = replayYear !== null ? HISTORY_BY_YEAR.get(replayYear) : null;
        if (row) {
          const stockShare = planStockShareForYear(inputs, isRetired, year, householdRetirementYear);
          returnRate = historicalPortfolioReturn(row, stockShare);
          activeInflationRate = row[3];
          stressInflationOverrideActive = true;
        }
      } else if (inputs.stressType === 'crashYear') {
        if (yearsSinceStress === 0) {
          returnRate = inputs.stressCrashReturn;
          activeInflationRate = inputs.stressCrashInflation;
          stressInflationOverrideActive = true;
        }
      }
    }

    // A crash in the first year of retirement triggers the spending cut
    // from the following year: the budget for a year is set when the year
    // begins, so the crash can only be acted on once it has happened.
    if (lastYearReturnRate !== null && lastYearReturnRate < 0
      && isRetired && householdRetirementYear !== null && year === householdRetirementYear + 1) {
      initialRetirementCrashOccurred = true;
    }

    // Standard deductions and brackets inflation
    // A 'history' replay (not a Monte Carlo trial) indexes the brackets and
    // Social Security's COLA to the replayed year's CPI, whatever the
    // Stress Inflation Strategy says: a real 1966 start saw the 1970s CPI in
    // its benefits and brackets, not the plan's flat rate. Floored at 0
    // because neither the COLA nor bracket indexing goes negative. Years
    // outside the record fall back to the plan's own rates, compounding on
    // from wherever the replay left them.
    const historyIndexing = inputs.stressType === 'history' && monteCarloReturnOverride === null;
    // Changelog 419: every statutory dollar figure in this file is the
    // TAX_YEAR's (brackets, deductions, IRMAA thresholds and premiums,
    // contribution and QCD limits, the wage base, the estate exemption).
    // A plan whose first year is not TAX_YEAR must carry those figures
    // from their own vintage, not from the plan's first year: a 2027 plan
    // used to price its first year on unindexed 2026 figures, and a 2026
    // plan opened after the figures roll to 2027 would have priced 2026
    // on 2027's. `vintageShift` is the one-off step between the two years
    // at the rate each figure indexes by; the user's own today's-dollar
    // amounts (spending, benefits, gifts) still index from the plan's
    // first year, which is their "today".
    const vintageYears = startYear - TAX_YEAR;
    const vintageShift = (ratePct) => (vintageYears === 0 ? 1 : Math.pow(1 + (ratePct || 0) / 100, vintageYears));
    const historyIndexedFactor = (fieldName, planRate, base = 1) => {
      if (year === startYear) return base;
      const prevRow = years[year - startYear - 1];
      const prev = prevRow && prevRow[fieldName] !== undefined ? prevRow[fieldName] : base;
      const rate = stressInflationOverrideActive ? Math.max(0, activeInflationRate) : planRate;
      return prev * (1 + rate / 100);
    };
    const bracketVintage = vintageShift(inputs.taxBracketInflationRate);
    // In a Monte Carlo trial that samples inflation the brackets follow
    // the sampled rate, compounding from the prior year's row (changelog
    // 420); mcInflationDelta is set above, before this point.
    const taxBracketInflationFactor = historyIndexing
      ? historyIndexedFactor('taxBracketInflationFactor', inputs.taxBracketInflationRate, bracketVintage)
      : (monteCarloInflationOverride !== null && mcIndexingDiverged)
        ? historyIndexedFactor('taxBracketInflationFactor', inputs.taxBracketInflationRate + mcInflationDelta, bracketVintage)
        : Math.pow(1 + inputs.taxBracketInflationRate / 100, year - startYear) * bracketVintage;
    // MFS with both spouses alive and the income split between them is TWO
    // returns (see forEachSeparateReturn), and each return carries its own
    // MFS standard deduction and its own spouse's age-65 add-on. The
    // household figure below is the sum of both; the tax helpers then divide
    // it between the returns in the income-split proportion, which is exact
    // for an even split between spouses of the same age bracket and an
    // approximation otherwise. A 100% (or 0%) split is one return: only
    // Spouse 1's return is modeled, as before.
    const mfsSplitForYear = effectiveMfsSplitPct(inputs);
    const mfsTwoReturns = currentStatus === 'MFS' && spouse1Alive && spouse2Alive
      && mfsSplitForYear > 0 && mfsSplitForYear < 100;
    const stdDeductionBase = (inputs.tcjaSunsetEnabled
      ? (currentStatus === 'MFJ' ? DEDUCTION_MFJ_PRETCJA : currentStatus === 'MFS' ? DEDUCTION_MFS_PRETCJA : DEDUCTION_SINGLE_PRETCJA)
      : (currentStatus === 'MFJ' ? DEDUCTION_MFJ : currentStatus === 'MFS' ? DEDUCTION_MFS : DEDUCTION_SINGLE))
      * (mfsTwoReturns ? 2 : 1);
    // Filers aged 65+ on this year's return(s). On a joint return both
    // count; a survivor counts as themself, whichever spouse survived; MFS
    // split across two returns counts each spouse on their own return; a
    // one-return MFS plan models Spouse 1's return only.
    const seniorCount = (spouse1Alive && age1 >= 65 ? 1 : 0)
      + (spouse2Alive && age2 >= 65
        && (currentStatus === 'MFJ' || mfsTwoReturns || !spouse1Alive) ? 1 : 0);
    // Basic standard deduction plus the s 63(f) age-65 add-on (both
    // indexed). Income-independent, so a plain number.
    const stdDeduction = stdDeductionBase * taxBracketInflationFactor
      + additionalStandardDeductionAged(currentStatus, seniorCount, taxBracketInflationFactor);
    // Two MFS returns: each spouse's own deduction (the MFS basic amount
    // plus their own age-65 add-on; MFS gets no senior bonus), which the
    // federal helpers floor per return (mfsSplitSpec). The pair sums to
    // stdDeduction.
    const mfsReturnDeductions = mfsTwoReturns ? [age1, age2].map((age) =>
      (stdDeductionBase / 2) * taxBracketInflationFactor
        + additionalStandardDeductionAged(currentStatus, age >= 65 ? 1 : 0, taxBracketInflationFactor)) : null;
    const mfsSplitFor = (ordinaryBeforeDeduction) => mfsSplitSpec(inputs, ordinaryBeforeDeduction, mfsReturnDeductions);
    // The OBBBA senior bonus (2025-2028) depends on MAGI through its
    // phase-out, and MAGI depends on this year's Pre-Tax draws and
    // conversions -- so the full deduction is a function of the income it
    // is being applied to. Every tax computation below prices its own
    // income through this, including the withdrawal solver (which accepts
    // a function here) and the max-bracket conversion sizing.
    const seniorBonusFor = (magi) => seniorBonusDeduction(magi, currentStatus, year, seniorCount);
    // Changelog 417: the larger of the standard and itemized deductions,
    // the senior bonus allowed with either. The itemized lines are read
    // when the function is called, so the figures the year settles later
    // (mortgage interest, the health costs net of the ACA credit and the
    // HSA draw) are the ones the solver and the final row see; the SALT
    // line is last year's settled state tax (what was paid in the year,
    // cash basis) plus this year's property tax. A plan with the switch
    // at 'never', or two MFS returns, takes the standard deduction as
    // before. A non-itemizer still deducts cash gifts up to the s 170(p)
    // cap from 2026.
    const itemizing = inputs.itemizeDeductions !== 'never' && !mfsTwoReturns;
    const charitableGiftsThisYear = Math.max(0, Number(inputs.charitableGivingAnnual) || 0) * Math.pow(1 + inputs.inflationRate / 100, year - startYear);
    const propertyTaxThisYear = Math.max(0, Number(inputs.propertyTaxAnnual) || 0)
      * Math.pow(1 + (inputs.housingInflationRate !== undefined ? inputs.housingInflationRate : inputs.inflationRate) / 100, year - startYear);
    const priorYearStateTax = Math.max(0, prevYearEndingField(years, 'stateTax') || 0);
    let itemizedMortgageInterest = 0;   // set by the amortization below
    let itemizedMortgageBalance = 0;
    let itemizedMedicalCosts = 0;       // set once the year's health costs are known
    const itemizedFor = (magi) => itemizedDeductionFor({
      magi, status: currentStatus, year,
      stateTax: priorYearStateTax, propertyTax: propertyTaxThisYear,
      mortgageInterest: itemizedMortgageInterest, mortgageBalance: itemizedMortgageBalance,
      mortgageAcquisition: inputs.mortgageIsAcquisitionDebt !== false,
      charitable: charitableGiftsThisYear, medical: itemizedMedicalCosts,
    });
    const nonItemizerCharitable = nonItemizerCharitableFor(year, currentStatus, charitableGiftsThisYear);
    const deductionChoice = (magi) => {
      const standard = stdDeduction + nonItemizerCharitable;
      if (!itemizing) return { amount: standard, itemized: false };
      const total = itemizedFor(magi).total;
      return total > standard ? { amount: total, itemized: true } : { amount: standard, itemized: false };
    };
    const deductionFor = (magi) => deductionChoice(magi).amount + seniorBonusFor(magi);

    // Hoist inflation factor — used by salary, rental, and any other cost
    // line that hasn't been broken out into its own Granular Inflation
    // Assumption below (SS, medical, and Medicare each use their own
    // dedicated rate instead of this general one).
    const inflFactor = Math.pow(1 + inputs.inflationRate / 100, year - startYear);
    if (year > startYear) {
      priceIndexRaw *= 1 + activeInflationRate / 100;
      if (activeInflationRate !== inputs.inflationRate) priceIndexDiverged = true;
    }
    const priceIndex = priceIndexDiverged ? priceIndexRaw : inflFactor;
    // Granular Inflation Assumptions -- category-specific factors that
    // override inflFactor for their respective cost lines (see the
    // DEFAULT_INPUTS comment above ssCOLA for why each defaults the way
    // it does). Under the 'delta' Stress Inflation Strategy, a Historical
    // Stress Test's crash-year inflation nudges these away from their flat
    // configured rate for the specific years it's active, so they can no
    // longer be expressed as a single Math.pow from startYear -- instead
    // each compounds forward from the previous year's own factor (looked up
    // off the prior year's row via prevGranularFactor). inflationDelta is 0
    // in every year the stress test isn't actively overriding inflation
    // (including when stressType is 'none'), so this produces the exact
    // same numbers as the plain Math.pow formula in every such year.
    const useDeltaShift = inputs.stressInflationStrategy === 'delta';
    // Changelog 420: a Monte Carlo trial that samples inflation moves
    // every inflation-linked factor by the sampled delta, compounding year
    // on year -- the brackets and deductions, Social Security's COLA, the
    // Medicare premiums, the medical and long-term-care costs, and the
    // statutory limits -- not only the spending slices (changelog 247).
    // Prices and wages rise together in an inflation shock; a trial that
    // raised spending but left the brackets and the COLA on the planned
    // path charged more tax and paid less benefit than such a year would,
    // and overstated the harm. The chain runs through every year of a
    // sampled trial so a year sampled at the planned rate stays on the
    // path the earlier years set; with every delta zero it is the plain
    // formula.
    // A trial sampled at the planned rate so far stays on the closed-form
    // path, bit for bit; chaining starts the first year a sample differs.
    const mcSampled = monteCarloInflationOverride !== null && mcIndexingDiverged;
    const chainIndexing = useDeltaShift || mcSampled;
    const inflationDelta = (stressInflationOverrideActive ? (activeInflationRate - inputs.inflationRate) : 0) + mcInflationDelta;
    const prevGranularFactor = (fieldName) => {
      if (year === startYear) return 1;
      const prevYearData = years[year - startYear - 1];
      return (prevYearData && prevYearData[fieldName] !== undefined) ? prevYearData[fieldName] : 1;
    };
    const granularFactor = (fieldName, baseRate, base = 1) => {
      if (!chainIndexing) return Math.pow(1 + baseRate / 100, year - startYear) * base;
      if (year === startYear) return base; // no compounding yet in the starting year, matching Math.pow's exponent-0 case
      return prevGranularFactor(fieldName) * (1 + (baseRate + inflationDelta) / 100);
    };
    // Changelog 419: the general factor for statutory dollars (contribution
    // and QCD limits, the wage base), carried from TAX_YEAR; in a sampled
    // trial it follows the sampled rate (changelog 420).
    const statutoryInflFactor = mcSampled
      ? granularFactor('statutoryInflFactor', inputs.inflationRate, vintageShift(inputs.inflationRate))
      : inflFactor * vintageShift(inputs.inflationRate);
    // Benefit growth: the plan's COLA assumption -- except that, on a plan
    // still using the default assumption, a year SSA has already announced
    // a COLA for (SS_ANNOUNCED: 2027 at 3.6%) uses the announced figure
    // (changelog 410). A COLA the user set themselves is theirs, every
    // year; history-indexed and stress-shifted plans keep their own path.
    const ssColaRate = inputs.ssCOLA !== undefined ? inputs.ssCOLA : inputs.inflationRate;
    // ssColaAnnounced (default on; absent on older plans means on) lets a
    // plan opt out -- the demo households do, so the lessons' pictures stay
    // the story they tell.
    const ssColaIsDefault = (inputs.ssCOLA === undefined || inputs.ssCOLA === DEFAULT_INPUTS.ssCOLA) && inputs.ssColaAnnounced !== false;
    // Changelog 420: in a sampled trial the COLA follows the sampled
    // inflation (CPI-W is what sets it), except in a year SSA has already
    // announced, which stays at the announced figure.
    const announcedCola = ssColaIsDefault && SS_ANNOUNCED[year] && Number.isFinite(SS_ANNOUNCED[year].cola) ? SS_ANNOUNCED[year].cola : null;
    const ssColaFactor = historyIndexing
      ? historyIndexedFactor('ssColaFactor', ssColaRate)
      : mcSampled
        ? (year === startYear ? 1 : prevGranularFactor('ssColaFactor') * (1 + (announcedCola !== null ? announcedCola : ssColaRate + mcInflationDelta) / 100))
        : (useDeltaShift || !ssColaIsDefault) ? granularFactor('ssColaFactor', ssColaRate) : ssColaFactorFor(startYear, year, ssColaRate);
    const medicalInflFactor = granularFactor('medicalInflFactor', inputs.medicalInflationRate !== undefined ? inputs.medicalInflationRate : inputs.inflationRate);
    const ltcInflFactor = granularFactor('ltcInflFactor', inputs.ltcInflationRate !== undefined ? inputs.ltcInflationRate : inputs.medicalInflationRate);
    // The Part B and D premiums are TAX_YEAR figures: carried from that
    // vintage (changelog 419), like the brackets above.
    const partBRate = inputs.medicarePartBInflationRate !== undefined ? inputs.medicarePartBInflationRate : inputs.inflationRate;
    const partDRate = inputs.medicarePartDInflationRate !== undefined ? inputs.medicarePartDInflationRate : inputs.inflationRate;
    const partBInflFactor = granularFactor('partBInflFactor', partBRate, vintageShift(partBRate));
    const partDInflFactor = granularFactor('partDInflFactor', partDRate, vintageShift(partDRate));
    // A life event's Inflation Category (Plan > Life Events). Amounts are
    // entered in plan-start dollars: General grows with inflationRate,
    // Housing with housingInflationRate, Medical with the medical factor
    // above, and None stays the fixed nominal amount entered. A missing or
    // unknown category is General, which is what every event used before
    // the category was honored.
    const housingEventFactor = Math.pow(1 + (inputs.housingInflationRate !== undefined ? inputs.housingInflationRate : inputs.inflationRate) / 100, year - startYear);
    const milestoneInflFactor = (m) => {
      switch (m && m.inflationCategory) {
        case 'None': return 1;
        case 'Housing': return housingEventFactor;
        case 'Medical': return medicalInflFactor;
        default: return inflFactor;
      }
    };

    // Income calculations
    let salary = 0;
    if (spouse1Alive && age1 < inputs.retireAge1) {
      salary += inputs.salary1 * inflFactor;
    } else if (spouse1Alive && inputs.partTimeIncome1 > 0 && age1 >= inputs.retireAge1 && age1 < inputs.partTimeIncomeEndAge1) {
      salary += inputs.partTimeIncome1 * inflFactor;
    }
    if (spouse2Alive && age2 < inputs.retireAge2) {
      salary += inputs.salary2 * inflFactor;
    } else if (spouse2Alive && inputs.partTimeIncome2 > 0 && age2 >= inputs.retireAge2 && age2 < inputs.partTimeIncomeEndAge2) {
      salary += inputs.partTimeIncome2 * inflFactor;
    }

    // RSU/GSU equity compensation vesting income -- see
    // getRSUVestingIncomeForYear for the full mechanics (explicit grants +
    // an assumed future refresh grant, each on its own vesting schedule).
    // Folded straight into `salary` so it automatically flows through
    // every downstream use of that variable (ordinary taxable income, SS
    // taxability, IRMAA MAGI, and the 'auto' current-spending derivation)
    // without needing separate wiring at each of those call sites.
    const rsuIncome1 = spouse1Alive ? getRSUVestingIncomeForYear(inputs, 1, year, startYear) : 0;
    const rsuIncome2 = spouse2Alive ? getRSUVestingIncomeForYear(inputs, 2, year, startYear) : 0;
    salary += rsuIncome1 + rsuIncome2;

    // Vest routing (see concentratedStockVestRoutingEnabled in
    // DEFAULT_INPUTS): the held slice of this year's vests never becomes
    // cash -- it stays as employer shares. Computed per position here while
    // the year's vest income is at hand; the total is (1) added to cash
    // needed below, exactly like an expense, since that cash was never
    // available to spend or invest, and (2) added to each position's
    // balance (with full basis) in the concentrated-stock block further
    // down. The full gross vest stays in `salary` regardless -- holding
    // shares doesn't change the ordinary income tax due at vest.
    const csVestedIn = csConfigs.map((cfg) => {
      if (!cfg.enabled || !cfg.vestRoutingEnabled) return 0;
      const vestBase = cfg.vestSpouse === 'both' ? (rsuIncome1 + rsuIncome2)
        : cfg.vestSpouse === '2' ? rsuIncome2
        : rsuIncome1;
      return vestBase * (1 - cfg.vestCoverPct / 100) * (cfg.vestHoldPct / 100);
    });
    const concentratedStockVestedInTotal = csVestedIn[0] + csVestedIn[1];

    // Non-Qualified Deferred Compensation (NQDC): grows the unsecured
    // bookkeeping balance, credits this year's deferral (if still working),
    // then pays out a level installment once the elected distribution
    // window has started. Computed here, before `salary` is finalized, so
    // distributions can be folded straight into it the same way RSU
    // vesting is above -- flowing automatically into ordinary taxable
    // income, SS taxability, and IRMAA MAGI. nqdcDeferral1/2 (this year's
    // deferred amount, reducing taxable income the same way a Pre-Tax 401(k)
    // contribution does) are picked up later, in the contribution block,
    // via baseOrdinaryTaxableIncome and adjustedTotalContributions.
    let nqdcDeferral1 = 0, nqdcDeferral2 = 0, nqdcDistribution1 = 0, nqdcDistribution2 = 0;
    if (inputs.nqdcEnabled1) {
      nqdcBalance1 *= (1 + (inputs.nqdcGrowthRate1 || 0) / 100);
      if (spouse1Alive && age1 < inputs.retireAge1) {
        nqdcDeferral1 = Math.max(0, inputs.nqdcDeferralAmount1 || 0);
        nqdcBalance1 += nqdcDeferral1;
      }
      const distYears1 = Math.max(1, Math.round(inputs.nqdcDistributionYears1) || 1);
      const yearsIntoDistribution1 = age1 - inputs.nqdcDistributionStartAge1;
      if (spouse1Alive && yearsIntoDistribution1 >= 0 && yearsIntoDistribution1 < distYears1 && nqdcBalance1 > 0) {
        nqdcDistribution1 = nqdcBalance1 / (distYears1 - yearsIntoDistribution1);
        nqdcBalance1 = Math.max(0, nqdcBalance1 - nqdcDistribution1);
      } else if (spouse1Alive && yearsIntoDistribution1 >= distYears1 && nqdcBalance1 > 0) {
        // A25: a payout window that closed before the plan began (or a
        // balance left after it) is owed now: paid in full this year.
        nqdcDistribution1 = nqdcBalance1;
        nqdcBalance1 = 0;
      }
    }
    if (inputs.nqdcEnabled2) {
      nqdcBalance2 *= (1 + (inputs.nqdcGrowthRate2 || 0) / 100);
      if (spouse2Alive && age2 < inputs.retireAge2) {
        nqdcDeferral2 = Math.max(0, inputs.nqdcDeferralAmount2 || 0);
        nqdcBalance2 += nqdcDeferral2;
      }
      const distYears2 = Math.max(1, Math.round(inputs.nqdcDistributionYears2) || 1);
      const yearsIntoDistribution2 = age2 - inputs.nqdcDistributionStartAge2;
      if (spouse2Alive && yearsIntoDistribution2 >= 0 && yearsIntoDistribution2 < distYears2 && nqdcBalance2 > 0) {
        nqdcDistribution2 = nqdcBalance2 / (distYears2 - yearsIntoDistribution2);
        nqdcBalance2 = Math.max(0, nqdcBalance2 - nqdcDistribution2);
      } else if (spouse2Alive && yearsIntoDistribution2 >= distYears2 && nqdcBalance2 > 0) {
        // A25: a payout window that closed before the plan began (or a
        // balance left after it) is owed now: paid in full this year.
        nqdcDistribution2 = nqdcBalance2;
        nqdcBalance2 = 0;
      }
    }
    salary += nqdcDistribution1 + nqdcDistribution2;

    // Earned income, per spouse. Used for FICA below AND for the Social
    // Security Retirement Earnings Test just underneath -- the two count the
    // same thing (wages and net self-employment), which is why there is one
    // definition rather than two that could drift apart.
    //
    // Mirrors the salary/else-if cliff logic above rather than reusing the
    // `salary` variable, for two reasons: `salary` does not distinguish
    // spouse 1 from spouse 2 once summed, and by this point it also carries
    // NQDC distributions, which are neither FICA wages at distribution nor
    // earnings for the test. RSU/GSU vesting income IS real wages for both
    // (Social Security tax up to the wage base, uncapped Medicare tax, same
    // as any other supplemental wage payment), so rsuIncome1/2 are added.
    const ficaWages1 = (spouse1Alive && age1 < inputs.retireAge1
      ? inputs.salary1 * inflFactor
      : (spouse1Alive && inputs.partTimeIncome1 > 0 && age1 >= inputs.retireAge1 && age1 < inputs.partTimeIncomeEndAge1 ? inputs.partTimeIncome1 * inflFactor : 0)) + rsuIncome1;
    const ficaWages2 = (spouse2Alive && age2 < inputs.retireAge2
      ? inputs.salary2 * inflFactor
      : (spouse2Alive && inputs.partTimeIncome2 > 0 && age2 >= inputs.retireAge2 && age2 < inputs.partTimeIncomeEndAge2 ? inputs.partTimeIncome2 * inflFactor : 0)) + rsuIncome2;

    // SS Benefits
    let ssIncome = 0;
    const ssFra1 = getFullRetirementAge(inputs.birthYear1);
    const ssFra2 = getFullRetirementAge(inputs.birthYear2);
    // Retirement Earnings Test, part two: the credit. Before FRA the benefit
    // is priced at the age actually claimed. From FRA onward it is priced at
    // the claiming age PLUS the months the test withheld -- Social Security
    // recomputes the benefit at FRA to give those months back, so a claim at
    // 62 that was fully withheld for three years ends up paying roughly what
    // a claim at 65 would have. Leaving this out would show the withholding
    // as a permanent loss, which is not what the law does.
    const ssEffClaim1 = age1 >= ssFra1 ? ssEffectiveClaimingAge(inputs.claimingAge1, ssEarningsTestMonths1, ssFra1) : inputs.claimingAge1;
    const ssEffClaim2 = age2 >= ssFra2 ? ssEffectiveClaimingAge(inputs.claimingAge2, ssEarningsTestMonths2, ssFra2) : inputs.claimingAge2;
    const ss1Multiplier = getSSMultiplier(ssEffClaim1, ssFra1);
    const ss2Multiplier = getSSMultiplier(ssEffClaim2, ssFra2);
    const ss1Full = inputs.ss1 * ssColaFactor;
    const ss2Full = inputs.ss2 * ssColaFactor;
    // SS Trust Fund Depletion scenario (see the ssDepletionEnabled comment
    // in DEFAULT_INPUTS) -- applies to whatever benefit is actually being
    // paid that year, on top of (not instead of) the early/delayed claiming
    // multiplier below, since a benefit cut would reduce whatever amount a
    // claimant is otherwise entitled to.
    const ssDepletionFactor = (inputs.ssDepletionEnabled && year >= inputs.ssDepletionYear)
      ? Math.max(0, 1 - (inputs.ssCutPercent / 100))
      : 1;
    const ss1Benefit = ss1Full * ss1Multiplier * ssDepletionFactor;
    const ss2Benefit = ss2Full * ss2Multiplier * ssDepletionFactor;

    // Changelog 255: the household benefit this year under each way the
    // household could be alive, whatever the plan's fixed Life Expectancy
    // says about who is. expectedLifetimeSS weights these by the SSA
    // table's survival probabilities so a claiming age can be judged by
    // what it is EXPECTED to pay, not by what it pays if everyone lives to
    // exactly the planned age. The earnings-test withholding share is
    // applied below, once the test has run.
    const ssTopUps = inputs.spouse2Enabled
      ? ((inputs.ssSpousalEnabled1 ? spousalSSTopUp(ss1Full, ss2Full, inputs.claimingAge1, inputs.claimingAge2, age1 - age2, age1, ssFra1) * ssDepletionFactor : 0)
        + (inputs.ssSpousalEnabled2 ? spousalSSTopUp(ss2Full, ss1Full, inputs.claimingAge2, inputs.claimingAge1, age2 - age1, age2, ssFra2) * ssDepletionFactor : 0))
      : 0;
    const ssIfBoth = inputs.spouse2Enabled
      ? (age1 >= inputs.claimingAge1 ? ss1Benefit : 0) + (age2 >= inputs.claimingAge2 ? ss2Benefit : 0) + ssTopUps
      : 0;
    // Survivor benefits (changelog 265): what each spouse could draw on the
    // other's record. The death ages are the plan's own (life expectancy,
    // or the survivor stress age); a claim before that age means the
    // deceased had claimed. The alive-state amounts assume the survivor
    // benefit starts at the survivor's current age (no earlier than 60);
    // the paid branch below fixes the start age in the first alone year.
    const deathAge1 = (inputs.survivorStressEnabled && inputs.survivorStressSpouse === 1) ? inputs.survivorStressAge : lifeExpectancy1;
    const deathAge2 = (inputs.survivorStressEnabled && inputs.survivorStressSpouse === 2) ? inputs.survivorStressAge : lifeExpectancy2;
    const survivorOn2 = (claimAge) => survivorSSBenefit({
      deceasedFull: ss2Full, deceasedClaimAge: inputs.claimingAge2, deceasedFra: ssFra2, deceasedDeathAge: deathAge2,
      survivorFra: ssFra1, survivorClaimAge: claimAge,
    }) * ssDepletionFactor;
    const survivorOn1 = (claimAge) => survivorSSBenefit({
      deceasedFull: ss1Full, deceasedClaimAge: inputs.claimingAge1, deceasedFra: ssFra1, deceasedDeathAge: deathAge1,
      survivorFra: ssFra2, survivorClaimAge: claimAge,
    }) * ssDepletionFactor;
    const own1Now = age1 >= inputs.claimingAge1 ? ss1Benefit : 0;
    const own2Now = age2 >= inputs.claimingAge2 ? ss2Benefit : 0;
    const ssIfOnly1 = inputs.spouse2Enabled
      ? Math.max(own1Now, age1 >= 60 ? survivorOn2(age1) : 0)
      : own1Now;
    const ssIfOnly2 = inputs.spouse2Enabled ? Math.max(own2Now, age2 >= 60 ? survivorOn1(age2) : 0) : 0;

    if (spouse1Alive && spouse2Alive) {
      if (age1 >= inputs.claimingAge1) ssIncome += ss1Benefit;
      if (age2 >= inputs.claimingAge2) ssIncome += ss2Benefit;
      // Spousal top-ups (see ssSpousalEnabled1 in DEFAULT_INPUTS). Paid
      // only while both are alive: at the worker's death the survivor's
      // benefit (below) already steps up to the greater of the two.
      if (inputs.ssSpousalEnabled1) {
        ssIncome += spousalSSTopUp(ss1Full, ss2Full, inputs.claimingAge1, inputs.claimingAge2, age1 - age2, age1, ssFra1) * ssDepletionFactor;
      }
      if (inputs.ssSpousalEnabled2) {
        ssIncome += spousalSSTopUp(ss2Full, ss1Full, inputs.claimingAge2, inputs.claimingAge1, age2 - age1, age2, ssFra2) * ssDepletionFactor;
      }
    } else if (spouse1Alive && !inputs.spouse2Enabled) {
      // Single-person plan: there is no survivor benefit to fall back on,
      // so the benefit starts at the chosen claiming age, full stop. This
      // used to fall into the survivor branch below, which (a) started
      // paying at 62 no matter what claimingAge1 said -- so "claim at 70"
      // paid the 124% delayed benefit from age 62 -- and (b) compared
      // against ss2, which DEFAULT_INPUTS leaves at $18,000 even when
      // Spouse 2 is off. Found by the 2026-08-29 tax-rules spec survey.
      if (age1 >= inputs.claimingAge1) ssIncome += ss1Benefit;
    } else if (spouse1Alive) {
      // Spouse 2 has died: own benefit, or the survivor benefit on spouse
      // 2's record from 60, whichever is larger this year.
      if (survivorClaimAge1 === null && age1 >= 60) survivorClaimAge1 = age1;
      ssIncome += Math.max(own1Now, survivorClaimAge1 !== null ? survivorOn2(survivorClaimAge1) : 0);
    } else if (spouse2Alive) {
      if (survivorClaimAge2 === null && age2 >= 60) survivorClaimAge2 = age2;
      ssIncome += Math.max(own2Now, survivorClaimAge2 !== null ? survivorOn1(survivorClaimAge2) : 0);
    }

    // Retirement Earnings Test, part one: the withholding (42 U.S.C. 403).
    //
    // Applied per spouse against that spouse's OWN benefit and that spouse's
    // OWN earned income, after the benefit is assembled above. Until this
    // existed the plan paid every claimed benefit in full regardless of
    // wages, so a household claiming at 62 while working part-time was shown
    // income it would not receive -- the single largest overstatement the
    // engine could still produce for a common plan.
    //
    // Only the worker's own retirement benefit is reduced here. A spousal
    // top-up is also subject to the test on the WORKER's earnings, which is
    // not modeled; see the Guide and Input Dictionary, which say so.
    let ssEarningsTestWithheld = 0;
    let ssEarningsTestInFraYear = false;
    let ssWithheld1 = 0;
    if (spouse1Alive && age1 >= inputs.claimingAge1 && (age1 < ssFra1 || (inputs.claimingAge1 < ssFra1 && Math.floor(age1) === Math.floor(ssFra1)))) {
      const t1 = ssEarningsTestWithholding(ficaWages1, ss1Benefit, age1, ssFra1, inflFactor, year, inputs.inflationRate);
      ssWithheld1 = t1.withheld;
      ssEarningsTestWithheld += t1.withheld;
      ssEarningsTestMonths1 += t1.monthsWithheld;
      ssEarningsTestInFraYear = ssEarningsTestInFraYear || t1.inFraYear;
    }
    if (inputs.spouse2Enabled && spouse2Alive && age2 >= inputs.claimingAge2 && (age2 < ssFra2 || (inputs.claimingAge2 < ssFra2 && Math.floor(age2) === Math.floor(ssFra2)))) {
      const t2 = ssEarningsTestWithholding(ficaWages2, ss2Benefit, age2, ssFra2, inflFactor, year, inputs.inflationRate);
      ssEarningsTestWithheld += t2.withheld;
      ssEarningsTestMonths2 += t2.monthsWithheld;
      ssEarningsTestInFraYear = ssEarningsTestInFraYear || t2.inFraYear;
    }
    // Never below zero: a survivor branch above may be paying the larger of
    // the two benefits rather than the one the test was computed against.
    ssEarningsTestWithheld = Math.min(ssEarningsTestWithheld, ssIncome);
    const ssBeforeEarningsTest = ssIncome;
    ssIncome = Math.max(0, ssIncome - ssEarningsTestWithheld);
    // Spouse 1's own retirement benefit actually paid this year, apart from
    // the household total (changelog 293): the claiming-age comparison
    // varies only spouse 1's age, and the household figure starts in
    // whichever spouse claims first. No spousal top-up or survivor benefit.
    const ssOwn1 = spouse1Alive ? Math.max(0, own1Now - ssWithheld1) : 0;
    // The alive-state amounts (changelog 255) carry the same withholding
    // share as the benefit actually paid, so an early claim while still
    // working is not credited with money the test takes back.
    const ssEarningsTestKeep = ssBeforeEarningsTest > 0 ? ssIncome / ssBeforeEarningsTest : 1;
    const ssIfBothPaid = ssIfBoth * ssEarningsTestKeep;
    const ssIfOnly1Paid = ssIfOnly1 * ssEarningsTestKeep;
    const ssIfOnly2Paid = ssIfOnly2 * ssEarningsTestKeep;

    // Pension Benefits (with COLA, Survivor Benefits, and Lump-Sum options)
    let pension = 0;
    let militaryPension = 0;
    // Per-spouse military split, because Virginia's $40,000 military
    // subtraction is capped per RECIPIENT (virginiaMilitarySubtraction).
    let military1Pension = 0;
    let military2Pension = 0;
    // Split of this year's pension income for state purposes: how much a
    // state may exempt outright because of its SOURCE (government or
    // military), and how much of the rest belongs to each spouse. The
    // per-spouse split matters because NY's $20,000 exclusion is per person
    // and explicitly cannot be shared -- one spouse's unused portion does not
    // pass to the other.
    let stateExemptPension = 0;
    let privatePension1 = 0;
    let privatePension2 = 0;
    
    // Pension 1
    if (inputs.pension1 > 0) {
      const reachedStartAge1 = age1 >= inputs.pensionStartAge1;
      const reachedStartAge1ThisYear = age1 === inputs.pensionStartAge1;
      
      if (inputs.pension1LumpSum) {
        if (spouse1Alive && reachedStartAge1ThisYear) {
          const lump1 = inputs.pension1LumpSumValue * inflFactor;
          if (inputs.pension1LumpSumRollover) {
            // A direct rollover of an eligible rollover distribution to an
            // IRA (IRC s 402(c)(1)): no income recognized now, no cash to
            // spend, and the whole amount is taxed later as it comes out of
            // the Pre-Tax bucket (audit Q-9(a), changelog 126).
            preTax += lump1;
          } else {
            // Taken in cash: ordinary income in the year received, with the
            // same state treatment (government/military exempt vs private)
            // the recurring pension would have had.
            pension += lump1;
            if (inputs.militaryPension1) { militaryPension += lump1; military1Pension += lump1; }
            if (inputs.militaryPension1 || inputs.governmentPension1) {
              stateExemptPension += lump1;
            } else {
              privatePension1 += lump1;
            }
          }
        }
      } else {
        if (reachedStartAge1) {
          // E26: the amount entered is the first payment (or today's, for a
          // pension already being paid). The COLA compounds from the year
          // payments begin, never across the years before it starts.
          const colaFrom1 = Math.max(startYear, inputs.birthYear1 + inputs.pensionStartAge1);
          const growthFactor = Math.pow(1 + (inputs.pension1COLA !== undefined ? inputs.pension1COLA : 2.0) / 100, Math.max(0, year - colaFrom1));
          const baseValue = inputs.pension1 * growthFactor;
          let p1Amt = 0;
          if (spouse1Alive) {
            p1Amt = baseValue;
          } else if (spouse2Alive) {
            p1Amt = baseValue * ((inputs.pension1SurvivorBenefit !== undefined ? inputs.pension1SurvivorBenefit : 50) / 100);
          }
          pension += p1Amt;
          if (inputs.militaryPension1) { militaryPension += p1Amt; military1Pension += p1Amt; }
          // A federal military pension is ALSO a federal government pension,
          // so these two flags overlap. Deciding per spouse whether the whole
          // amount is state-exempt -- rather than summing two buckets -- is
          // what stops a pension flagged both ways being excluded twice.
          if (inputs.militaryPension1 || inputs.governmentPension1) {
            stateExemptPension += p1Amt;
          } else {
            privatePension1 += p1Amt;
          }
        }
      }
    }
    
    // Pension 2
    if (inputs.pension2 > 0) {
      const reachedStartAge2 = age2 >= inputs.pensionStartAge2;
      const reachedStartAge2ThisYear = age2 === inputs.pensionStartAge2;
      
      if (inputs.pension2LumpSum) {
        if (spouse2Alive && reachedStartAge2ThisYear) {
          const lump2 = inputs.pension2LumpSumValue * inflFactor;
          if (inputs.pension2LumpSumRollover) {
            preTax += lump2;
          } else {
            pension += lump2;
            if (inputs.militaryPension2) { militaryPension += lump2; military2Pension += lump2; }
            if (inputs.militaryPension2 || inputs.governmentPension2) {
              stateExemptPension += lump2;
            } else {
              privatePension2 += lump2;
            }
          }
        }
      } else {
        if (reachedStartAge2) {
          const colaFrom2 = Math.max(startYear, inputs.birthYear2 + inputs.pensionStartAge2);
          const growthFactor = Math.pow(1 + (inputs.pension2COLA !== undefined ? inputs.pension2COLA : 0.0) / 100, Math.max(0, year - colaFrom2));
          const baseValue = inputs.pension2 * growthFactor;
          let p2Amt = 0;
          if (spouse2Alive) {
            p2Amt = baseValue;
          } else if (spouse1Alive) {
            p2Amt = baseValue * ((inputs.pension2SurvivorBenefit !== undefined ? inputs.pension2SurvivorBenefit : 50) / 100);
          }
          pension += p2Amt;
          if (inputs.militaryPension2) { militaryPension += p2Amt; military2Pension += p2Amt; }
          if (inputs.militaryPension2 || inputs.governmentPension2) {
            stateExemptPension += p2Amt;
          } else {
            privatePension2 += p2Amt;
          }
        }
      }
    }

    // Annuity Purchase
    // The long-term gain realized by selling Taxable holdings to pay the
    // premium (E18); taxed with the year's other forced gains below.
    let annuityPurchaseRealizedGain = 0;
    if (age1 === inputs.annuityPurchaseAge && inputs.annuityPurchaseAmount > 0) {
      const purchaseVal = inputs.annuityPurchaseAmount * inflFactor;
      let paid = 0;
      if (inputs.annuitySourceAccount === 'preTax') {
        paid = Math.min(Math.max(0, preTax), purchaseVal);
        preTax -= paid;
      } else if (inputs.annuitySourceAccount === 'roth') {
        paid = Math.min(Math.max(0, roth), purchaseVal);
        consumeRothLayers(paid, rothLayers);
        roth -= paid;
      } else {
        // Bought with after-tax money: the premium is the investment in the
        // contract and comes back tax-free under the s 72(b) exclusion ratio
        // applied in the payout block below. Paying it means selling
        // Taxable holdings, which takes a pro rata slice of basis with it
        // and realizes the rest as gain, like any other Taxable sale.
        paid = Math.min(Math.max(0, taxable), purchaseVal);
        const basisRatio = taxable > 0 ? Math.min(1, Math.max(0, taxableBasis) / taxable) : 0;
        taxableBasis = Math.max(0, taxableBasis - paid * basisRatio);
        annuityPurchaseRealizedGain = paid * (1 - basisRatio);
        taxable -= paid;
      }
      annuityPaidShare = purchaseVal > 0 ? paid / purchaseVal : 0;
    }

    // Annuity Payout Inflow
    let annuityPayout = 0;
    let taxableAnnuityOrdinary = 0;
    if (age1 >= inputs.annuityPurchaseAge && inputs.annuityPurchaseAmount > 0) {
      const yearsSincePurchase = age1 - inputs.annuityPurchaseAge;
      const purchaseYearInflFactor = Math.pow(1 + inputs.inflationRate / 100, inputs.annuityPurchaseAge - age1Init);
      const basePayout = inputs.annuityPurchaseAmount * annuityPaidShare * (inputs.annuityPayoutRate / 100) * purchaseYearInflFactor;
      annuityPayout = basePayout * Math.pow(1 + inputs.annuityIndexation / 100, yearsSincePurchase);

      // How much of the payout is ordinary income depends on what bought
      // the contract (audit Q-9(b), changelog 126):
      //   preTax  -- a qualified annuity with no basis: fully taxable.
      //   roth    -- a qualified distribution: fully excluded.
      //   taxable -- non-qualified: IRC s 72(b)(1) excludes the fraction
      //              investment-in-the-contract / expected return, until the
      //              investment is fully recovered (s 72(b)(2)).
      // annuityIsTaxable stays as an explicit "treat it all as ordinary"
      // override for plans that were built before this split existed.
      if (inputs.annuityIsTaxable || inputs.annuitySourceAccount === 'preTax') {
        taxableAnnuityOrdinary = annuityPayout;
      } else if (inputs.annuitySourceAccount === 'roth') {
        taxableAnnuityOrdinary = 0;
      } else {
        // Expected return: the payouts this plan itself projects, from the
        // purchase year through spouse 1's life expectancy, indexed the same
        // way the payout is.
        const payoutYears = Math.max(1, Math.round((inputs.lifeExpectancy1 || inputs.annuityPurchaseAge) - inputs.annuityPurchaseAge) + 1);
        const g = 1 + inputs.annuityIndexation / 100;
        const growthSum = (Math.abs(g - 1) < 1e-12)
          ? payoutYears
          : (Math.pow(g, payoutYears) - 1) / (g - 1);
        const expectedReturn = basePayout * growthSum;
        // The premium in the money of the purchase year -- the same figure
        // the purchase block debited from Taxable, and still right for a
        // contract bought before the plan's first year.
        const annuityInvestment = inputs.annuityPurchaseAmount * annuityPaidShare * purchaseYearInflFactor;
        const exclusionRatio = expectedReturn > 0
          ? Math.min(1, annuityInvestment / expectedReturn)
          : 0;
        const excluded = Math.min(
          annuityPayout * exclusionRatio,
          Math.max(0, annuityInvestment - annuityBasisRecovered)
        );
        annuityBasisRecovered += excluded;
        taxableAnnuityOrdinary = annuityPayout - excluded;
      }
    }

    // Reverse Mortgage / Home Equity: homeValue appreciates every year
    // once enabled. The loan originates once (a one-time event, like
    // NUA) the year age1 first reaches reverseMortgageStartAge, locking
    // in a principal limit as a % of the home's value at that moment.
    // 'lumpSum' draws the whole limit immediately; 'monthly' draws a
    // fixed tax-free annual amount (the monthly figure x12, inflation-
    // adjusted) each year until the limit is exhausted -- tenure-style
    // HECM income. Either way, interest then compounds on the growing
    // balance every year with no required payments, capped (non-
    // recourse) at the home's current value -- the loan can never exceed
    // what the home is actually worth, by law.
    let reverseMortgagePayoutThisYear = 0;
    let reverseMortgageForwardPayoff = 0;
    if (homeInPlan) {
      homeValue *= (1 + (inputs.homeAppreciationRate || 0) / 100);
    }
    otherEstateAssetsValue *= (1 + (inputs.otherEstateAssetsGrowthRate || 0) / 100);
    if (inputs.reverseMortgageEnabled) {
      if (!reverseMortgageOriginated && spouse1Alive && age1 >= inputs.reverseMortgageStartAge) {
        reverseMortgageAvailable = homeValue * (Math.max(0, inputs.reverseMortgagePrincipalLimitPct || 0) / 100);
        reverseMortgageOriginated = true;
        // A26: a reverse mortgage must first retire any forward mortgage on
        // the home. The payoff comes out of the principal limit (so the
        // household nets that much less) and starts the loan balance; the
        // forward payments stop.
        const forwardPayoff = Math.min(Math.max(0, mortgageBalance), reverseMortgageAvailable);
        if (forwardPayoff > 0) {
          reverseMortgageAvailable -= forwardPayoff;
          mortgageBalance -= forwardPayoff;
          reverseMortgageForwardPayoff = forwardPayoff;
        }
        if (inputs.reverseMortgagePayoutType === 'lumpSum') {
          reverseMortgagePayoutThisYear = reverseMortgageAvailable;
          reverseMortgageAvailable = 0;
        }
      }
      if (reverseMortgageOriginated && inputs.reverseMortgagePayoutType === 'monthly' && reverseMortgageAvailable > 0) {
        const desiredPayout = Math.max(0, inputs.reverseMortgageMonthlyPayout || 0) * 12 * inflFactor;
        const payout = Math.min(desiredPayout, reverseMortgageAvailable);
        reverseMortgagePayoutThisYear += payout;
        reverseMortgageAvailable -= payout;
      }
      reverseMortgageBalance *= (1 + (inputs.reverseMortgageRate || 0) / 100);
      reverseMortgageBalance += reverseMortgagePayoutThisYear + reverseMortgageForwardPayoff;
      reverseMortgageBalance = Math.min(reverseMortgageBalance, homeValue);
    }
    // Net equity = value less BOTH loans against it: the reverse mortgage
    // and any forward mortgage still being paid down (amortised further
    // down this loop; the year-end balance is used at the row, below).
    // Both are s 2053 debts of the estate, so the net figure is what the
    // estate is measured on. Kept as a `let` and finalized after the debt
    // block so the forward mortgage's year-end balance is the one used.
    let homeEquity = homeInPlan ? Math.max(0, homeValue - reverseMortgageBalance) : 0;

    // Life Insurance (Cash Value): grows each spouse's cash value and any
    // outstanding policy loan every year at their own independent
    // rates. The loan is capped at the cash value (an insurer will
    // lapse/limit the loan before it exceeds the value backing it).
    // Net cash value is what you could access today (surrender or
    // withdraw); net death benefit is the face amount (plus accrued
    // cash value for "increasing benefit" policies) less any unpaid
    // loan, since insurers deduct outstanding loans from the payout.
    // Policies only live (grow, compound loans) while their insured does.
    if (inputs.lifeInsuranceEnabled1 && spouse1Alive && !lifeInsurancePaidOut1) {
      lifeInsuranceCashValue1 *= (1 + (inputs.lifeInsuranceCashValueGrowthRate1 || 0) / 100);
      lifeInsuranceLoanBalance1 *= (1 + (inputs.lifeInsuranceLoanRate1 || 0) / 100);
      lifeInsuranceLoanBalance1 = Math.min(lifeInsuranceLoanBalance1, lifeInsuranceCashValue1);
    }
    if (inputs.lifeInsuranceEnabled2 && spouse2Alive && !lifeInsurancePaidOut2) {
      lifeInsuranceCashValue2 *= (1 + (inputs.lifeInsuranceCashValueGrowthRate2 || 0) / 100);
      lifeInsuranceLoanBalance2 *= (1 + (inputs.lifeInsuranceLoanRate2 || 0) / 100);
      lifeInsuranceLoanBalance2 = Math.min(lifeInsuranceLoanBalance2, lifeInsuranceCashValue2);
    }
    // First death: pay out the deceased spouse's policy (audit F-1; see
    // the state comment at the lifeInsurancePaidOut1 declaration). Runs at
    // most once per policy -- the year its insured is first dead while the
    // other spouse is still alive. If both deaths land in the same final
    // year, the loop has already broken and the estate pays instead.
    let lifeInsurancePayoutToSurvivor = 0;
    const policy1DeathBenefitNow = () => Math.max(0, (inputs.lifeInsuranceDeathBenefit1 || 0) + (inputs.lifeInsuranceIncreasingBenefit1 ? lifeInsuranceCashValue1 : 0) - lifeInsuranceLoanBalance1);
    const policy2DeathBenefitNow = () => Math.max(0, (inputs.lifeInsuranceDeathBenefit2 || 0) + (inputs.lifeInsuranceIncreasingBenefit2 ? lifeInsuranceCashValue2 : 0) - lifeInsuranceLoanBalance2);
    if (inputs.lifeInsuranceEnabled1 && !spouse1Alive && spouse2Alive && !lifeInsurancePaidOut1) {
      const benefit = policy1DeathBenefitNow();
      if (inputs.lifeInsuranceOwnership1 === 'trust') {
        lifeInsuranceHeldForHeirs1 = benefit; // frozen for heirs, outside the estate
      } else {
        taxable += benefit;
        taxableBasis += benefit; // IRC 101(a): income-tax-free, so all basis
        lifeInsurancePayoutToSurvivor += benefit;
      }
      lifeInsurancePaidOut1 = true;
      lifeInsuranceCashValue1 = 0;
      lifeInsuranceLoanBalance1 = 0;
    }
    if (inputs.lifeInsuranceEnabled2 && !spouse2Alive && spouse1Alive && !lifeInsurancePaidOut2) {
      const benefit = policy2DeathBenefitNow();
      if (inputs.lifeInsuranceOwnership2 === 'trust') {
        lifeInsuranceHeldForHeirs2 = benefit;
      } else {
        taxable += benefit;
        taxableBasis += benefit;
        lifeInsurancePayoutToSurvivor += benefit;
      }
      lifeInsurancePaidOut2 = true;
      lifeInsuranceCashValue2 = 0;
      lifeInsuranceLoanBalance2 = 0;
    }
    // Basis reset at the first death (IRC 1014; changelog 360). What the
    // spouse who died owned takes a basis equal to its market value on the
    // date of death -- a step-up, or in law a step-down if it is under water
    // (the Taxable pool never is here: its basis is capped at market value
    // each year, so the reset is zero or upward). The
    // year a spouse is first counted dead stands in for the date, so the
    // reset uses this year's opening balances. How much of the household's
    // taxable money that covers:
    //   community-property state that year (1014(b)(6)): all of it --
    //     both halves of community property are reset;
    //   otherwise, by how the account is held (taxableAccountOwner):
    //     jointly (the default) half, 2040(b) / 1014(b)(9); owned by the
    //     spouse who died, all of it; owned by the survivor, none.
    // Applies to the Taxable Brokerage basis pool and both concentrated
    // positions. Pre-Tax money is income in respect of a decedent and gets
    // no reset (1014(c)); Roth needs none. Years abroad use the
    // common-law rule.
    let firstDeathBasisChange = 0;
    if (inputs.spouse2Enabled && !firstDeathBasisResetDone && spouse1Alive !== spouse2Alive) {
      firstDeathBasisResetDone = true;
      const deceased = spouse1Alive ? 2 : 1;
      const share = firstDeathBasisResetShare({
        state: abroad ? null : residence.stateOfResidence,
        owner: inputs.taxableAccountOwner,
        deceased,
      });
      firstDeathBasisResetShareApplied = share;
      firstDeathBasisResetYear = year;
      if (share > 0) {
        const marketValue = Math.max(0, taxable);
        const newBasis = taxableBasis + share * (marketValue - taxableBasis);
        firstDeathBasisChange += newBasis - taxableBasis;
        taxableBasis = Math.max(0, Math.min(marketValue, newBasis));
        csConfigs.forEach((cfg, i) => {
          if (!cfg.enabled) return;
          const state = csState[i];
          const oldBasis = (cfg.vestRoutingEnabled || state.basisTracked)
            ? state.basisDollars
            : state.balance * (cfg.costBasisPct / 100);
          const reset = oldBasis + share * (state.balance - oldBasis);
          firstDeathBasisChange += reset - oldBasis;
          state.basisDollars = Math.max(0, reset);
          // From here on the position's basis is the tracked dollar figure,
          // not the flat percentage entered for today's holding.
          state.basisTracked = true;
        });
      }
    }
    const lifeInsuranceNetCashValue1 = inputs.lifeInsuranceEnabled1
      ? Math.max(0, lifeInsuranceCashValue1 - lifeInsuranceLoanBalance1)
      : 0;
    const lifeInsuranceNetCashValue2 = inputs.lifeInsuranceEnabled2
      ? Math.max(0, lifeInsuranceCashValue2 - lifeInsuranceLoanBalance2)
      : 0;
    // What the policy would still pay at death: 0 once paid to the
    // survivor; the frozen amount when held for heirs in an ILIT; the live
    // computation otherwise.
    const lifeInsuranceNetDeathBenefit1 = inputs.lifeInsuranceEnabled1
      ? (lifeInsurancePaidOut1 ? lifeInsuranceHeldForHeirs1 : policy1DeathBenefitNow())
      : 0;
    const lifeInsuranceNetDeathBenefit2 = inputs.lifeInsuranceEnabled2
      ? (lifeInsurancePaidOut2 ? lifeInsuranceHeldForHeirs2 : policy2DeathBenefitNow())
      : 0;
    // Combined totals across both spouses -- kept under the original
    // (pre-split) field names in the year output below so existing
    // consumers (Ledger display, print report, etc.) that just want "the
    // household's life insurance" in one number keep working unchanged.
    const lifeInsuranceCashValue = lifeInsuranceCashValue1 + lifeInsuranceCashValue2;
    const lifeInsuranceLoanBalance = lifeInsuranceLoanBalance1 + lifeInsuranceLoanBalance2;
    const lifeInsuranceNetCashValue = lifeInsuranceNetCashValue1 + lifeInsuranceNetCashValue2;
    const lifeInsuranceNetDeathBenefit = lifeInsuranceNetDeathBenefit1 + lifeInsuranceNetDeathBenefit2;

    const rentalAnnuity = (inputs.annuityIncome + inputs.rentalIncome) * inflFactor;
    // A cash lump sum is already inside `pension` (it is ordinary income);
    // a rolled-over lump sum went straight to Pre-Tax and is not spendable
    // cash at all, so neither is added again here (audit Q-9(a)).
    const pensionInflowThisYear = pension;
    // Reverse mortgage payouts are loan proceeds, not income -- they're
    // tax-free (unlike ssIncome/pension, which ARE separately taxed) but
    // still reduce how much the household needs to draw from its other
    // accounts to cover expenses, exactly like any other cash inflow.
    const fixedInflows = ssIncome + pensionInflowThisYear + rentalAnnuity + annuityPayout + reverseMortgagePayoutThisYear;

    // Expenses (lifestyle with inflation guardrails)
    let currentLifestyleMultiplier = 1.0;
    // Housing slice of the lifestyle budget: tracked as its own compounding
    // multiplier, gated by the same spending-guardrails freeze as the
    // general slice (a bad-market freeze pauses the whole household budget
    // together), normally compounding at housingInflationRate instead of
    // activeInflationRate. Whether a Historical Stress Test's crash-year
    // inflation overrides this (like General lifestyle spending always
    // does, just above) instead of Housing's own rate depends on
    // stressInflationStrategy -- 'partial' and 'delta' both switch Housing
    // to the crash's actual inflation for the specific years it's active
    // (matching a real broad CPI shock hitting housing costs too); 'custom'
    // leaves Housing on its own rate always, ignoring the stress test
    // entirely, which was this app's only behavior before this option
    // existed.
    const housingFollowsStressInflation = stressInflationOverrideActive && inputs.stressInflationStrategy !== 'custom';
    let currentHousingMultiplier = 1.0;
    // Third compounding slice (changelog 138): the ongoing-health share of a
    // category ledger grows at medicalInflationRate, the way the housing
    // share grows at housingInflationRate. Only ever non-zero when a ledger
    // is driving the shape -- without one its share is 0 and this multiplier
    // is inert, which is why a plan that never opens the ledger is unchanged.
    // Follows the same stress-inflation override as housing: a broad CPI
    // shock hits medical costs too.
    let currentMedicalMultiplier = 1.0;
    if (year > startYear) {
      const prevYearData = years[year - startYear - 1];
      let prevMultiplier = prevYearData ? prevYearData.lifestyleMultiplier : 1.0;
      let prevHousingMultiplier = prevYearData ? (prevYearData.housingMultiplier !== undefined ? prevYearData.housingMultiplier : 1.0) : 1.0;
      let prevMedicalMultiplier = prevYearData ? (prevYearData.medicalMultiplier !== undefined ? prevYearData.medicalMultiplier : 1.0) : 1.0;
      let shouldFreeze = inputs.spendingGuardrails && prevYearData && prevYearData.growthRate < 0;
      // mcInflationDelta (changelog 247) is 0 outside a sampled Monte Carlo
      // year; activeInflationRate already carries it for the general slice.
      const housingRateThisYear = (housingFollowsStressInflation ? activeInflationRate : (inputs.housingInflationRate || 0)) + mcInflationDelta;
      const medicalRateThisYear = (housingFollowsStressInflation ? activeInflationRate : (inputs.medicalInflationRate || 0)) + mcInflationDelta;
      // A freeze skips the inflation RAISE; it never refuses a fall. In a
      // deflationary year (1929-33) holding the nominal budget flat would
      // be a real-terms raise, so a frozen slice takes the lower of flat
      // and deflated.
      const frozenOrInflated = (prev, rate) => (shouldFreeze ? Math.min(prev, prev * (1 + rate / 100)) : prev * (1 + rate / 100));
      currentLifestyleMultiplier = frozenOrInflated(prevMultiplier, activeInflationRate);
      currentHousingMultiplier = frozenOrInflated(prevHousingMultiplier, housingRateThisYear);
      // The guardrail freeze pauses the whole household budget together, so
      // every slice freezes or none does.
      currentMedicalMultiplier = frozenOrInflated(prevMedicalMultiplier, medicalRateThisYear);
      crashGuardTrackLifestyle *= 1 + activeInflationRate / 100;
      crashGuardTrackHousing *= 1 + housingRateThisYear / 100;
      crashGuardTrackMedical *= 1 + medicalRateThisYear / 100;
      // Changelog 335: the crash guardrail restores what it froze once the
      // portfolio is back on the plan's own path, in real terms -- the point
      // at which the freeze has done its job. (Not "back to where it
      // retired": a plan that spends down never gets there, even after the
      // markets fully recover.) While the portfolio sits at or above the
      // path, a down year does not freeze anything either.
      const plannedPrev = inputs.spendingGuardrails && guardrailPlannedPath && prevYearData
        ? guardrailPlannedPath.get(prevYearData.year) : null;
      if (isRetired && prevYearData.isRetired && plannedPrev) {
        const prevReal = investedEnd(prevYearData) / (prevYearData.priceIndex || prevYearData.inflFactor || 1);
        if (prevReal >= plannedPrev.realEnd) {
          currentLifestyleMultiplier = crashGuardTrackLifestyle;
          currentHousingMultiplier = crashGuardTrackHousing;
          currentMedicalMultiplier = crashGuardTrackMedical;
          crashGuardRecovered = true;
        }
      }
    } else {
      currentLifestyleMultiplier = 1.0;
      currentHousingMultiplier = 1.0;
      currentMedicalMultiplier = 1.0;
    }

    // Changelog 335: the cut lifts once the portfolio has recovered. (The
    // multiplier persists across years, so lifting it means setting it.)
    if (crashGuardRecovered) lifestyleSpendingCutMultiplier = 1.0;
    if (inputs.spendingGuardrails && initialRetirementCrashOccurred && isRetired && !crashGuardRecovered) {
      // Today's behavior: a flat 10% off the whole budget.
      lifestyleSpendingCutMultiplier = 0.90;

      // Floor-aware version (changelog 139). Branches on the FLAG and on
      // whether an essential share exists -- data, never entitlement.
      //
      // A uniform 10% cut quietly assumes every dollar is equally cuttable.
      // It is not: you do not cut 10% off the mortgage, the groceries and
      // the insurance. Here the cut comes entirely out of discretionary
      // spending and stops at the floor, so:
      //   - a household with plenty of discretionary cuts DEEPER than 10%
      //     (25% of discretionary by default), because it genuinely can;
      //   - a household that is nearly all essentials cuts LESS, because it
      //     genuinely cannot, and the plan stops flattering it.
      const essentialShare = essentialShareOf(inputs);
      if (inputs.floorAwareGuardrailsEnabled && essentialShare !== null) {
        const discretionaryShare = Math.max(0, 1 - essentialShare);
        const cutPct = Math.max(0, Math.min(100, inputs.discretionaryCutPct ?? 25)) / 100;
        // Cut is expressed as a share of TOTAL spending, so it can never
        // exceed the discretionary share -- essentials are untouchable.
        const cutOfTotal = Math.min(discretionaryShare, discretionaryShare * cutPct);
        lifestyleSpendingCutMultiplier = 1 - cutOfTotal;
      }
    }

    // Withdrawal-rate guardrails (changelog 216). Opt-in; when the flag is
    // off none of this runs and the multiplier stays 1.0.
    //
    // Everything here reads LAST year's finished row, never this year's
    // half-built one, so there is no circularity: the rate that triggers a
    // step is a fact about a year that is already closed.
    //
    // Changelog 335: the rate is SPENDING over the invested portfolio --
    // last year's lifestyle spending, not its total drawdown -- and it is
    // judged against the rate the plan's own path had (plannedSpendingPath
    // above), not against the first retired year. So a reserve fill, a
    // wedding, conversion tax or Social Security starting never moves the
    // rule; being behind or ahead of the plan does.
    //
    // Changelog 421: the portfolio in the rate is THIS year's opening
    // balance (last year's closing one), not last year's opening balance.
    // Both are closed facts, and this is the rate the household faces
    // going into the year: last year's spending against what is left to
    // fund it. Against last year's opening balance a crash in 2028 was
    // invisible in 2029 (that balance predated it) and first moved the
    // rule in 2030, a year late. The planned rate is read the same way:
    // the plan's spending last year over its portfolio at the start of
    // this year.
    let wrGuardrailRate = null;
    let wrGuardrailPlannedRate = null;
    let wrGuardrailAction = null;
    if (inputs.withdrawalGuardrailsEnabled && isRetired && year > startYear) {
      const prevRow = years[year - startYear - 1];
      const plannedPrev = prevRow && guardrailPlannedPath ? guardrailPlannedPath.get(prevRow.year) : null;
      const plannedNow = guardrailPlannedPath ? guardrailPlannedPath.get(year) : null;
      if (prevRow && prevRow.isRetired) {
        const openingTotal = investedEnd(prevRow);
        // No planned spending or no planned portfolio means the plan was
        // not relying on the portfolio then, so there is nothing to measure
        // against: hold.
        if (openingTotal > 0 && plannedPrev && plannedPrev.spend > 0 && plannedNow && plannedNow.portfolio > 0) {
          wrGuardrailRate = (prevRow.lifestyleExpenses || 0) / openingTotal;
          wrGuardrailPlannedRate = plannedPrev.spend / plannedNow.portfolio;
          const band = Math.max(0, inputs.wrGuardrailBandPct ?? 20) / 100;
          const upper = wrGuardrailPlannedRate * (1 + band);
          const lower = wrGuardrailPlannedRate * (1 - band);
          if (wrGuardrailRate > upper) {
            wrGuardrailMultiplier *= 1 - Math.max(0, Math.min(100, inputs.wrGuardrailCutPct ?? 10)) / 100;
            wrGuardrailAction = 'cut';
          } else if (wrGuardrailRate < lower) {
            wrGuardrailMultiplier *= 1 + Math.max(0, inputs.wrGuardrailRaisePct ?? 10) / 100;
            wrGuardrailAction = 'raise';
          } else {
            wrGuardrailAction = 'hold';
          }
          const floor = 1 - Math.max(0, Math.min(100, inputs.wrGuardrailMaxCutPct ?? 20)) / 100;
          const ceiling = 1 + Math.max(0, inputs.wrGuardrailMaxRaisePct ?? 20) / 100;
          wrGuardrailMultiplier = Math.min(ceiling, Math.max(floor, wrGuardrailMultiplier));
        } else {
          wrGuardrailAction = 'hold';
        }
      }
    }

    let phaseMultiplier = 1.0;
    let phaseName = 'Pre-Retirement';
    if (isRetired) {
      if (inputs.lifestyleThreePhaseEnabled) {
        const activeAge = spouse1Alive ? age1 : age2;
        let phaseSetting;
        if (activeAge <= inputs.goGoEndAge) {
          phaseSetting = inputs.goGoMultiplier;
          phaseName = 'Go-Go';
        } else if (activeAge <= inputs.slowGoEndAge) {
          phaseSetting = inputs.slowGoMultiplier;
          phaseName = 'Slow-Go';
        } else {
          phaseSetting = inputs.noGoMultiplier;
          phaseName = 'No-Go';
        }
        phaseMultiplier = phaseMultiplierFor(inputs, phaseSetting);
      } else {
        phaseName = 'Retirement';
      }
    }

    let survivorExpenseMultiplier = 1.0;
    if (inputs.spouse2Enabled && inputs.survivorStressEnabled && (!spouse1Alive || !spouse2Alive)) {
      survivorExpenseMultiplier = 1.0 - (inputs.survivorExpenseDropPct / 100);
    }

    // Blend each slice of the budget at the rate it actually grows at. This
    // has always been a two-way blend -- housing at housingInflationRate,
    // everything else at the general rate -- and changelog 138 generalizes
    // it to three when a category ledger is driving the shape, so ongoing
    // health grows at medicalInflationRate too. Same arithmetic, more terms.
    //
    // Crucially this is a SHAPE, not a level: `lifestyleExpense` is still the
    // scalar that the tornado sensitivity scales by +/-10%, that
    // findDieWithZeroSpending's 40-iteration binary search sets, and that the
    // required-portfolio solver overwrites. All three keep working because
    // the shape rides along multiplicatively.
    //
    // With no ledger, shape.medical is 0 and shape.housing is
    // housingExpensePct -- identical to the old two-way blend, to the bit.
    const lifestyleShape = spendingShapeShares(inputs);
    const blendedLifestyleMultiplier = (lifestyleShape.housing * currentHousingMultiplier)
      + (lifestyleShape.medical * currentMedicalMultiplier)
      + (lifestyleShape.general * currentLifestyleMultiplier);
    // Changelog 335: with floor-aware guardrails on, neither rule -- the
    // crash freeze and cut, or the withdrawal-rate cut -- takes spending
    // below the essential floor. Measured against the path with no freezes
    // at all, so the floor is a share of what the plan would have spent.
    let lifestyleCost = inputs.lifestyleExpense * blendedLifestyleMultiplier * phaseMultiplier * lifestyleSpendingCutMultiplier * wrGuardrailMultiplier * survivorExpenseMultiplier * costOfLivingFactor;
    if (isRetired && inputs.floorAwareGuardrailsEnabled && (inputs.spendingGuardrails || inputs.withdrawalGuardrailsEnabled)) {
      const essentialShareFloor = essentialShareOf(inputs);
      if (essentialShareFloor !== null) {
        const trackBlend = (lifestyleShape.housing * crashGuardTrackHousing)
          + (lifestyleShape.medical * crashGuardTrackMedical)
          + (lifestyleShape.general * crashGuardTrackLifestyle);
        const kept = trackBlend > 0 ? (blendedLifestyleMultiplier * lifestyleSpendingCutMultiplier * wrGuardrailMultiplier) / trackBlend : 1;
        if (kept < essentialShareFloor) {
          lifestyleCost = inputs.lifestyleExpense * trackBlend * phaseMultiplier * essentialShareFloor * survivorExpenseMultiplier * costOfLivingFactor;
        }
      }
    }
    // Constant across years for now -- categories do not vary by year yet.
    // Computed here so the row can report the floor against the SETTLED
    // lifestyleCost rather than the raw input.
    const essentialShareThisYear = essentialShareOf(inputs);

    // Bumps & additions
    let goGoBump = 0;
    if (!inputs.lifestyleThreePhaseEnabled && inputs.goGoBumpEnabled && isRetired && ((spouse1Alive && age1 <= inputs.goGoBumpEndAge) || (spouse2Alive && age2 <= inputs.goGoBumpEndAge))) {
      goGoBump = lifestyleCost * (inputs.goGoBumpRate / 100);
    }

    let healthcareBridge = 0;
    // "On the marketplace": retired, and at least one living spouse is
    // still under 65. This is the population the ACA floor (below) and the
    // 400% cliff both apply to.
    // Abroad there is no US marketplace to buy from (changelog 196): the ACA
    // bridge, its credit and every ACA check switch off, and the plan pays
    // the household's own figure for health cover abroad instead.
    // Married filing separately cannot claim the premium tax credit at all
    // (s 36B(c)(1)(C); the domestic-abuse / abandonment exception is not
    // modeled), so an MFS year has no credit to apply, no 400% cliff to
    // protect and no coverage gap to escape: every marketplace check below
    // is off and the bridge cost is paid in full.
    const onMarketplace = !abroad && isRetired && currentStatus !== 'MFS'
      && ((spouse1Alive && age1 < 65) || (spouse2Alive && age2 < 65));
    const foreignHealthcare = abroad ? foreignTerms.healthcareCost * medicalInflFactor * moveShare : 0;
    if (isRetired && !abroad) {
      if (spouse1Alive && age1 < 65) {
        healthcareBridge += inputs.healthcareBridgeCost * medicalInflFactor;
      }
      if (spouse2Alive && age2 < 65) {
        healthcareBridge += inputs.healthcareBridgeCost * medicalInflFactor;
      }
    } else if (isRetired && abroad && moveShare < 1 && priorResidence.kind !== 'foreign') {
      // The US months of a split year abroad (changelog 203): the bridge
      // cost for those months, with no marketplace credit (the year's
      // marketplace checks are off once the household is abroad).
      const usShare = 1 - moveShare;
      if (spouse1Alive && age1 < 65) healthcareBridge += inputs.healthcareBridgeCost * medicalInflFactor * usShare;
      if (spouse2Alive && age2 < 65) healthcareBridge += inputs.healthcareBridgeCost * medicalInflFactor * usShare;
    }
    // The premium tax credit is applied provisionally against the bridge
    // cost further down, once this year's conversion is chosen (changelog
    // 415): it is estimated from the income known before the withdrawal
    // solver and reconciled against the settled MAGI after it.
    let acaSubsidyApplied = 0;
    let acaBenchmarkPremium = 0;
    let acaApplicablePct = null;
    let acaCreditSettled = 0;
    let acaSubsidyRefund = 0;
    // The premium share of the bridge cost: the credit can never exceed the
    // premium (36B(b)(2)(A)); the out-of-pocket remainder is not insurance.
    const bridgePremiumShare = Math.min(1, Math.max(0, (inputs.healthcareBridgePremiumPct ?? 70) / 100));
    // Filled in after the solver: the 400% x FPL line for this year, the
    // household's settled ACA MAGI, and whether it crossed.
    const acaCliffThreshold = onMarketplace
      ? ACA_SUBSIDY_CLIFF_FPL_MULTIPLE * getFederalPovertyLevel(currentStatus === 'MFJ' ? 2 : 1, year, inputs.taxBracketInflationRate)
      : 0;
    let acaMagi = 0;
    let acaCliffBreached = false;
    let acaCliffCappedConversion = 0;
    // Changelog 250: how much conversion the IRMAA cap held back this year,
    // and the MAGI ceiling it applied (0 when the cap was inert).
    let irmaaCappedConversion = 0;
    let irmaaCapCeiling = 0;
    let acaSubsidyClawback = 0;

    // LTC is fully independent per spouse -- each spouse has their own
    // Active/Cost/Start Age/Duration/EndsInDeath setting, since one spouse
    // may never need LTC at all while the other needs a very different
    // kind or cost of care. Each spouse's cost applies for a bounded
    // episode (their own ltcDurationYearsN, default 3 -- real episodes
    // average ~2-3 years) rather than the rest of the modeled lifespan,
    // which would overstate lifetime LTC drag for long-lived scenarios.
    // If that spouse's ltcEndsInDeathN is enabled, that bound is removed
    // instead -- the cost runs every year from their own start age through
    // their own last living year (spouseNAlive already goes false starting
    // the year after their lifeExpectancy age), modeling a permanent
    // decline rather than a bounded episode.
    let ltcCost = 0;
    if (inputs.ltcActive1) {
      const ltcEndAge1 = inputs.ltcEndsInDeath1 ? Infinity : inputs.ltcStartAge1 + inputs.ltcDurationYears1;
      if (spouse1Alive && age1 >= inputs.ltcStartAge1 && age1 < ltcEndAge1) {
        ltcCost += inputs.ltcCost1 * ltcInflFactor;
      }
    }
    if (inputs.ltcActive2) {
      const ltcEndAge2 = inputs.ltcEndsInDeath2 ? Infinity : inputs.ltcStartAge2 + inputs.ltcDurationYears2;
      if (spouse2Alive && age2 >= inputs.ltcStartAge2 && age2 < ltcEndAge2) {
        ltcCost += inputs.ltcCost2 * ltcInflFactor;
      }
    }
    // Changelog 434: the medical line the deduction can see from here on,
    // so a fill-to-bracket conversion is sized against the itemized total
    // the year will actually claim. Until 434 the sizing saw no medical
    // costs at all (the line was seeded only after the conversion was
    // chosen) and under-filled the bracket by the medical deduction. The
    // ACA credit, Medicare premiums and the HSA draw refine the line before
    // the solver runs, and the base pricing is redone then.
    itemizedMedicalCosts = healthcareBridge + ltcCost;

    // Debt (mortgage + other, e.g. auto loans/personal loans): simple
    // annual-step amortization — interest accrues once per year on the
    // outstanding balance, the user's fixed annual payment is applied
    // (interest first, remainder to principal), and the payment
    // automatically stops the year the balance is fully paid off rather
    // than continuing to drain cash flow for a debt that no longer exists.
    // Not inflation-adjusted (a fixed-rate mortgage payment doesn't rise
    // with inflation the way lifestyle spending does).
    let mortgagePaymentThisYear = 0;
    if (mortgageBalance > 0 && inputs.mortgagePayment > 0) {
      const interest = mortgageBalance * ((inputs.mortgageRate || 0) / 100);
      // Changelog 417: the year's interest, for the itemized deduction.
      itemizedMortgageInterest = interest;
      itemizedMortgageBalance = mortgageBalance;
      const payment = Math.min(inputs.mortgagePayment, mortgageBalance + interest);
      const principal = payment - interest;
      mortgageBalance = Math.max(0, mortgageBalance - principal);
      mortgagePaymentThisYear = payment;
    }
    let otherDebtPaymentThisYear = 0;
    if (otherDebtBalance > 0 && inputs.otherDebtPayment > 0) {
      const interest = otherDebtBalance * ((inputs.otherDebtRate || 0) / 100);
      const payment = Math.min(inputs.otherDebtPayment, otherDebtBalance + interest);
      const principal = payment - interest;
      otherDebtBalance = Math.max(0, otherDebtBalance - principal);
      otherDebtPaymentThisYear = payment;
    }
    const totalDebtPayment = mortgagePaymentThisYear + otherDebtPaymentThisYear;
    // Forward mortgage is the other lien on the home -- see the homeEquity
    // comment where it is first computed. Year-end balance, after this
    // year's principal payment.
    if (homeInPlan) homeEquity = Math.max(0, homeValue - reverseMortgageBalance - mortgageBalance);

    // Standard Medicare Cost / IRMAA surcharges
    const membersOver65 = (spouse1Alive && age1 >= 65 ? 1 : 0) + (spouse2Alive && age2 >= 65 ? 1 : 0);
    // Changelog 241: a spouse over 65 still on a current employer's plan
    // delays Part B/D. The covering job lasts while its worker is alive and
    // has not reached their retirement age.
    const stillWorking1 = spouse1Alive && age1 < inputs.retireAge1;
    const stillWorking2 = !!inputs.spouse2Enabled && spouse2Alive && age2 < inputs.retireAge2;
    const employerCovered = (who) => {
      const src = who === 1 ? inputs.medicareEmployerCoverage1 : inputs.medicareEmployerCoverage2;
      if (src === 'own') return who === 1 ? stillWorking1 : stillWorking2;
      if (src === 'spouse') return who === 1 ? stillWorking2 : stillWorking1;
      return false;
    };
    const medicareDeferred1 = spouse1Alive && age1 >= 65 && employerCovered(1);
    const medicareDeferred2 = !!inputs.spouse2Enabled && spouse2Alive && age2 >= 65 && employerCovered(2);
    const medicareOver65 = membersOver65 - (medicareDeferred1 ? 1 : 0) - (medicareDeferred2 ? 1 : 0);
    // Medicare pays for almost nothing outside the US, so a household abroad
    // may drop Part B. Only the CHARGE stops -- the IRMAA MAGI history still
    // records every year, so a return prices off the right lookback.
    const partBDroppedAbroad = abroad && !foreignTerms.medicarePartBRetained;
    const medicareMembers = partBDroppedAbroad ? 0 : medicareOver65;
    if (partBDroppedAbroad) {
      if (spouse1Alive && age1 >= 65) partBGapYears1++;
      if (spouse2Alive && age2 >= 65) partBGapYears2++;
    }

    // Contribution logic — track each working spouse independently.
    // Pre-Tax and Roth each have their own per-spouse field
    // (preTaxContribution1/2, rothContribution1/2) since two working
    // spouses very often save different dollar amounts. Auto-Max
    // Contribution (autoMaxContribution1/2) overrides that spouse's own
    // manual figure with their own age-based IRS limit for the year, since
    // the limit can differ between spouses of different ages and changes
    // every year on its own -- this is also why each spouse's own deferral
    // is tracked separately below (spouse1Deferral/spouse2Deferral), for
    // the employer match formula. Taxable brokerage and HSA stay single
    // shared household fields (see the DEFAULT_INPUTS comment for why), so
    // -- unlike preTaxContribution1/2/rothContribution1/2 -- they must only
    // be added ONCE per year, not once per working spouse. They used to be
    // added inside both the spouse-1 and spouse-2 blocks below, which
    // silently doubled both figures for any year both spouses were still
    // working (fixed here by pulling them out into their own
    // household-level block, gated on "at least one spouse is still
    // working" rather than duplicated per spouse).
    let preTaxContribution = 0;
    let rothContribution = 0;
    let taxableContribution = 0;
    let hsaContribution = 0;
    let spouse1Deferral = 0;
    let spouse2Deferral = 0;
    // The per-spouse split as ACTUALLY contributed this year, which is not
    // the same as the manual input fields whenever an Auto-Max mode is on
    // ('401k', 'ira' or 'max' all override them). Carried on the year row
    // so the Action Plan can narrate what the engine really did rather than
    // reading the now-ignored inputs -- see changelog 130.
    let preTaxContribution1 = 0;
    let rothContribution1 = 0;
    let preTaxContribution2 = 0;
    let rothContribution2 = 0;

    const spouse1Working = spouse1Alive && age1 < inputs.retireAge1;
    const spouse2Working = inputs.spouse2Enabled && spouse2Alive && age2 < inputs.retireAge2;

    if (spouse1Working) {
      let pretax1 = inputs.preTaxContribution1;
      let roth1 = inputs.rothContribution1;
      if (inputs.autoMaxContribution1 === '401k') {
        // SECURE 2.0: above the wage threshold the age-50+ catch-up must go
        // in as Roth, in this mode exactly as in 'max'.
        const split1k = getMaxContributionSplit(age1, inputs.salary1 * inflFactor + rsuIncome1, statutoryInflFactor);
        pretax1 = split1k.preTax;
        roth1 += split1k.roth;
      } else if (inputs.autoMaxContribution1 === 'ira') pretax1 = getIRAContributionLimit(age1) * statutoryInflFactor;
      else if (inputs.autoMaxContribution1 === 'max') {
        // 'max' overrides BOTH manual fields -- wages include this year's
        // RSU vests since they're FICA wages for the SECURE 2.0 test.
        const split1 = getMaxContributionSplit(age1, inputs.salary1 * inflFactor + rsuIncome1, statutoryInflFactor);
        pretax1 = split1.preTax;
        roth1 = split1.roth;
      }
      preTaxContribution += pretax1;
      rothContribution += roth1;
      preTaxContribution1 = pretax1;
      rothContribution1 = roth1;
      spouse1Deferral = pretax1 + roth1;
    }
    if (spouse2Working) {
      let pretax2 = inputs.preTaxContribution2;
      let roth2 = inputs.rothContribution2;
      if (inputs.autoMaxContribution2 === '401k') {
        // SECURE 2.0: above the wage threshold the age-50+ catch-up must go
        // in as Roth, in this mode exactly as in 'max'.
        const split2k = getMaxContributionSplit(age2, inputs.salary2 * inflFactor + rsuIncome2, statutoryInflFactor);
        pretax2 = split2k.preTax;
        roth2 += split2k.roth;
      } else if (inputs.autoMaxContribution2 === 'ira') pretax2 = getIRAContributionLimit(age2) * statutoryInflFactor;
      else if (inputs.autoMaxContribution2 === 'max') {
        const split2 = getMaxContributionSplit(age2, inputs.salary2 * inflFactor + rsuIncome2, statutoryInflFactor);
        pretax2 = split2.preTax;
        roth2 = split2.roth;
      }
      preTaxContribution += pretax2;
      rothContribution += roth2;
      preTaxContribution2 = pretax2;
      rothContribution2 = roth2;
      spouse2Deferral = pretax2 + roth2;
    }
    if (spouse1Working || spouse2Working) {
      taxableContribution += inputs.taxableContribution;
      // 'max' mode's HSA piece: while any 'max'-mode spouse is working and
      // under 65 (65+ is treated as Medicare-enrolled, which ends HSA
      // eligibility), the single household HSA field is overridden to the
      // legal limit -- self-only vs family per hsaFamilyCoverage, with the
      // age 55+ catch-up keyed to the oldest qualifying 'max' spouse. With
      // no qualifying 'max' spouse this falls back to the manual amount,
      // exactly the pre-existing behavior.
      const hsaMaxAges = [];
      if (spouse1Working && inputs.autoMaxContribution1 === 'max' && age1 < 65) hsaMaxAges.push(age1);
      if (spouse2Working && inputs.autoMaxContribution2 === 'max' && age2 < 65) hsaMaxAges.push(age2);
      if (hsaMaxAges.length > 0) {
        hsaContribution += getHSAContributionLimit(Math.max(...hsaMaxAges), !!inputs.hsaFamilyCoverage, statutoryInflFactor);
      } else {
        hsaContribution += (inputs.hsaContribution || 0);
      }
    }

    // E13: savings an earlier pass found this year could not fund are cut
    // here, before the match is computed and before any tax sees the
    // deferral. Each spouse's deferral shrinks in proportion.
    let preCutSavings = 0;
    const deferralCut = deferralCuts ? deferralCuts.get(year) : null;
    if (deferralCut) {
      const cutTaxable = Math.min(taxableContribution, deferralCut.taxable);
      taxableContribution -= cutTaxable;
      const cutRoth = Math.min(rothContribution, deferralCut.roth);
      if (cutRoth > 0) {
        const keep = 1 - cutRoth / rothContribution;
        rothContribution1 *= keep;
        rothContribution2 *= keep;
        rothContribution -= cutRoth;
      }
      const cutPreTax = Math.min(preTaxContribution, deferralCut.preTax);
      if (cutPreTax > 0) {
        const keep = 1 - cutPreTax / preTaxContribution;
        preTaxContribution1 *= keep;
        preTaxContribution2 *= keep;
        preTaxContribution -= cutPreTax;
      }
      spouse1Deferral = preTaxContribution1 + rothContribution1;
      spouse2Deferral = preTaxContribution2 + rothContribution2;
      preCutSavings = cutTaxable + cutRoth + cutPreTax;
    }

    // Employer 401(k) match — added straight to the Pre-Tax balance below,
    // deliberately NOT folded into preTaxContribution (see the DEFAULT_INPUTS
    // comment on employerMatch1/2 for why: it isn't the employee's own money
    // and shouldn't count against their elective deferral limit or look like
    // part of the household's own savings rate). See calculateEmployerMatch
    // for the flat-vs-percent formula logic.
    let employerMatchAmount = 0;
    if (spouse1Alive && age1 < inputs.retireAge1) {
      const deferralLimit1 = getElectiveDeferralLimit(age1) * statutoryInflFactor;
      employerMatchAmount += calculateEmployerMatch(spouse1Deferral, deferralLimit1, statutoryInflFactor, {
        mode: inputs.employerMatchMode1, flatAmount: inputs.employerMatch1,
        rateA: inputs.employerMatchRateA1, capAPct: inputs.employerMatchCapAPct1,
        tierBEnabled: inputs.employerMatchTierBEnabled1, rateB: inputs.employerMatchRateB1, capB: inputs.employerMatchCapB1,
        combine: inputs.employerMatchCombine1,
      });
    }
    if (inputs.spouse2Enabled && spouse2Alive && age2 < inputs.retireAge2) {
      const deferralLimit2 = getElectiveDeferralLimit(age2) * statutoryInflFactor;
      employerMatchAmount += calculateEmployerMatch(spouse2Deferral, deferralLimit2, statutoryInflFactor, {
        mode: inputs.employerMatchMode2, flatAmount: inputs.employerMatch2,
        rateA: inputs.employerMatchRateA2, capAPct: inputs.employerMatchCapAPct2,
        tierBEnabled: inputs.employerMatchTierBEnabled2, rateB: inputs.employerMatchRateB2, capB: inputs.employerMatchCapB2,
        combine: inputs.employerMatchCombine2,
      });
    }

    // Taxable Brokerage basis ratio for this year, locked in once at the
    // start of the year (using last year's ending taxable/taxableBasis,
    // before any of this year's contributions/milestones/NUA/withdrawals
    // touch the account) and applied consistently to every reduction below
    // -- mirrors preTaxBasisRatioForYear's pattern for the Roth Conversion
    // pro-rata rule further down, just computed earlier since taxable gets
    // touched by several distinct events across a single year rather than
    // one.
    const taxableBasisRatioForYear = taxable > 0 ? Math.min(1, Math.max(0, taxableBasis) / taxable) : 0;

    // Sum milestones for this year
    let milestoneOutflow = 0;
    // Changelog 240: the names behind milestoneOutflow, so the ledger's
    // "Where the money goes" view can say WHICH life event without
    // re-deriving the engine's age window and funding rules.
    const milestoneOutflowNames = [];
    let milestoneOutflowGeneral = 0;
    let milestoneOutflowPreTax = 0;
    let milestoneOutflowRoth = 0;
    let milestoneOutflowTaxable = 0;
    let milestoneOutflowExternal = 0;
    let taxableInflowOrdinary = 0;

    if (inputs.milestones && inputs.milestones.length > 0) {
      for (const m of inputs.milestones) {
        if (age1 >= m.startAge && age1 <= m.endAge) {
          const mAmount = m.amount * milestoneInflFactor(m);
          if (m.type === 'outflow') {
            // fundedExternally = the user has already set this money aside
            // outside the accounts this app tracks (a separate savings/
            // checking account, e.g.) specifically to cover this expense, so
            // it should never draw down -- or even be counted as cash-flow
            // pressure against -- any modeled account. Tracked separately
            // (milestoneOutflowExternal) purely so it can still show up as a
            // life event on the timeline/ledger; it never feeds into
            // milestoneOutflow or any of the per-account buckets below.
            if (m.fundedExternally) {
              milestoneOutflowExternal += mAmount;
              continue;
            }
            milestoneOutflow += mAmount;
            milestoneOutflowNames.push(m.name || 'Life event');
            if (m.targetAccount === 'preTax') milestoneOutflowPreTax += mAmount;
            else if (m.targetAccount === 'roth') milestoneOutflowRoth += mAmount;
            else if (m.targetAccount === 'taxable') milestoneOutflowTaxable += mAmount;
            else milestoneOutflowGeneral += mAmount;
          } else if (m.type === 'inflow') {
            if (m.isTaxable) {
              taxableInflowOrdinary += mAmount;
            }
            if (m.targetAccount === 'preTax') {
              preTax += mAmount;
            } else if (m.targetAccount === 'roth') {
              roth += mAmount;
              // New Roth principal arriving as a milestone inflow is basis
              // (a rollover-in or contribution), never earnings.
              rothLayers.contrib += mAmount;
            } else {
              taxable += mAmount;
              // New principal landing in Taxable this instant is 100%
              // basis -- whether or not it was ordinary-taxed on the way in
              // (taxableInflowOrdinary above), taxing it again as a capital
              // gain later would double-tax it.
              taxableBasis += mAmount;
            }
          }
        }
      }
    }

    // Backdoor Roth: a non-deductible ("after-tax") contribution to a
    // Traditional IRA, typically converted to Roth immediately afterward.
    // It still lands in this app's combined Pre-Tax bucket (which doesn't
    // separate 401(k) from Traditional IRA -- a pre-existing
    // simplification), but as basis (preTaxBasis) rather than newly-
    // deducted pre-tax money, so the IRS pro-rata rule logic in the Roth
    // Conversions section below can return it tax-free later instead of
    // taxing it as ordinary income like a real pre-tax contribution.
    // Gated the same way preTaxContribution is (per working spouse) since
    // backdoor Roth is a pre-retirement income-limit workaround, not a
    // retirement drawdown strategy.
    // A spouse in 'max' mode contributes the age-aware IRA limit through
    // this same backdoor mechanism every working year -- the IRA is a
    // separate limit that legally stacks on the 401(k), and routing it as
    // a backdoor contribution is income-limit-proof by construction (the
    // MAGI phase-out only blocks DIRECT Roth IRA contributions) while
    // still honoring the pro-rata rule above. It REPLACES that spouse's
    // configured backdoorRothAnnualAmount (never adds to it), so turning
    // both features on can't double-count; the other spouse's behavior is
    // untouched. Inflated like the other 'max' limits, unlike the flat
    // manual backdoor amounts.
    let backdoorRothContribution = 0;
    if (spouse1Alive && age1 < inputs.retireAge1) {
      if (inputs.autoMaxContribution1 === 'max') backdoorRothContribution += getIRAContributionLimit(age1) * statutoryInflFactor;
      else if (inputs.backdoorRothEnabled) backdoorRothContribution += (inputs.backdoorRothAnnualAmount1 || 0);
    }
    if (inputs.spouse2Enabled && spouse2Alive && age2 < inputs.retireAge2) {
      if (inputs.autoMaxContribution2 === 'max') backdoorRothContribution += getIRAContributionLimit(age2) * statutoryInflFactor;
      else if (inputs.backdoorRothEnabled) backdoorRothContribution += (inputs.backdoorRothAnnualAmount2 || 0);
    }

    // The year's RMD owner and divisor, figured here because the QCD below
    // feeds the basis ratio. The Pre-Tax balance is one pooled household
    // number, so RMDs follow whichever spouse currently "owns" it: Spouse 1
    // while alive, and after Spouse 1's death the surviving Spouse 2 -- who,
    // as a sole-beneficiary spouse, rolls the IRA into their own name and
    // takes RMDs on THEIR age and THEIR birth-year start age (73, or 75 for
    // anyone born 1960+). Gating this on spouse1Alive alone used to switch
    // RMDs off entirely the year Spouse 1 died, letting a surviving spouse
    // hold the IRA untouched for decades. The SECURE 2.0 start age is
    // evaluated per owner, so a widow born in 1961 inheriting from a
    // husband born in 1957 does not start RMDs until 75.
    const rmdOwnerAge = spouse1Alive || spouse2Alive ? ownerAge : null;
    const rmdAge = rmdStartAge(spouse1Alive ? birthYear1 : birthYear2);
    const rmdApplies = rmdOwnerAge !== null && rmdOwnerAge >= rmdAge;
    // Changelog 416: while both spouses are alive and the younger one is
    // the account's sole beneficiary (the default), a spouse more than 10
    // years younger than the owner puts the RMD on the joint-life table.
    // The owner is Spouse 1 while alive; a younger Spouse 2 stretches the
    // divisor, an older one does not, since the pooled balance is read as
    // Spouse 1's.
    const rmdSpouseAge = spouse1Alive && spouse2Alive && inputs.spouse2Enabled && inputs.rmdSpouseSoleBeneficiary !== false ? age2 : null;
    const rmdDivisor = rmdApplies ? getRMDDivisor(rmdOwnerAge, rmdSpouseAge) : 0;
    const rmdJointLifeTable = rmdApplies && rmdSpouseAge !== null && rmdOwnerAge - rmdSpouseAge > 10;
    // B3: the RMD is figured on the prior December 31 balance (the plan's
    // opening balance in its first year), not on this year's balance after
    // contributions -- and can never exceed what is there.
    const priorYearEndPreTax = prevYearEndingField(years, 'preTaxEnd') ?? inputs.preTaxInit;
    const rmdFromPriorBalance = rmdDivisor > 0 ? Math.max(0, priorYearEndPreTax) / rmdDivisor : 0;
    // The Qualified Charitable Distribution, figured ahead of the basis
    // ratio (changelog 405). Two things s 408(d)(8)(D) and Form 8606 say:
    // a QCD comes only from the otherwise-taxable part of the account, so
    // it is capped at the balance less basis; and a QCD sits in neither
    // Form 8606's year-end balance nor its distributions, so the pro-rata
    // ratio every OTHER distribution uses is basis over the pool LESS the
    // QCD. Capped at what the user asked for, the balance and the IRS
    // annual limit; the RMD block below takes the final figure. Changelog
    // 418: allowed from QCD_START_AGE whether or not an RMD is due, and
    // not capped at the RMD -- the law lets a QCD exceed it (the excess is
    // simply a further tax-free distribution), and before RMDs begin
    // there is nothing to cap it at. Until 418 a QCD needed an RMD to
    // ride on and could not exceed it.
    const qcdLimit = QCD_LIMIT_2026 * statutoryInflFactor;
    const qcdTaxableRoom = Math.max(0, preTax - Math.max(0, preTaxBasis));
    const qcdEligible = rmdOwnerAge !== null && rmdOwnerAge >= QCD_START_AGE;
    // Capped at what will still be in the account after this year's
    // Life-Event Pre-Tax withdrawal, which comes out below (changelog 440).
    const qcdPlanned = qcdEligible
      ? Math.max(0, Math.min(inputs.qcdAnnualAmount || 0, Math.max(0, preTax - Math.max(0, milestoneOutflowPreTax || 0)), qcdLimit, qcdTaxableRoom))
      : 0;

    // After-tax basis inside the Pre-Tax bucket, as a share of the balance
    // BEFORE any of this year's distributions (audit Q-9(c), changelog 126).
    // IRC s 72(e)(8) / s 408(d)(2) apply pro-rata to EVERY distribution, not
    // just conversions: a Life-Event withdrawal, an RMD and the solver's
    // discretionary draw all come out part-taxable, part-basis. One ratio
    // governs the whole year, the way Form 8606 works off a single figure.
    // This year's non-deductible (backdoor) contribution counts in both the
    // numerator and the denominator, which is why it is computed just above:
    // Form 8606 line 2 adds the current year's basis before the ratio, so a
    // pure backdoor contribution converted the same year still comes out
    // 100% tax-free. The 401(k)-vs-IRA caveat under the Roth conversion
    // pro-rata below applies here too.
    // Less the QCD (changelog 405): see qcdPlanned above.
    const preTaxBalanceForBasisRatio = Math.max(0, preTax + backdoorRothContribution - qcdPlanned);
    const preTaxBasisRatioForYear = preTaxBalanceForBasisRatio > 0
      ? Math.min(1, (Math.max(0, preTaxBasis) + backdoorRothContribution) / preTaxBalanceForBasisRatio)
      : 0;

    // Force deduct targeted outflows from respective accounts
    let actualMilestonePreTax = 0;
    let milestonePreTaxBasisRecovered = 0;
    let actualMilestoneRoth = 0;
    let actualMilestoneTaxable = 0;
    
    if (milestoneOutflowPreTax > 0) {
      actualMilestonePreTax = Math.min(preTax, milestoneOutflowPreTax);
      preTax -= actualMilestonePreTax;
      milestonePreTaxBasisRecovered = actualMilestonePreTax * preTaxBasisRatioForYear;
      preTaxBasis = Math.max(0, preTaxBasis - milestonePreTaxBasisRecovered);
      milestoneOutflowGeneral += (milestoneOutflowPreTax - actualMilestonePreTax);
    }
    // The ordinary-income share of a Life-Event Pre-Tax withdrawal, after
    // the pro-rata basis recovery above.
    const milestonePreTaxTaxable = actualMilestonePreTax - milestonePreTaxBasisRecovered;
    if (milestoneOutflowRoth > 0) {
      actualMilestoneRoth = Math.min(roth, milestoneOutflowRoth);
      roth -= actualMilestoneRoth;
      consumeRothLayers(actualMilestoneRoth, rothLayers);
      milestoneOutflowGeneral += (milestoneOutflowRoth - actualMilestoneRoth);
    }
    if (milestoneOutflowTaxable > 0) {
      actualMilestoneTaxable = Math.min(taxable, milestoneOutflowTaxable);
      taxable -= actualMilestoneTaxable;
      taxableBasis = Math.max(0, taxableBasis - actualMilestoneTaxable * taxableBasisRatioForYear);
      milestoneOutflowGeneral += (milestoneOutflowTaxable - actualMilestoneTaxable);
    }


    // totalContributions computed once here and reused below. Includes
    // hsaContribution (real cash leaving the household's paycheck to fund
    // the HSA) and backdoorRothContribution (real after-tax household
    // cash, unlike employerMatchAmount) but deliberately NOT
    // employerMatchAmount (never touches household cash flow in the
    // first place).
    const totalContributions = preTaxContribution + rothContribution + taxableContribution + hsaContribution + backdoorRothContribution + nqdcDeferral1 + nqdcDeferral2;

    // Apply contributions
    preTax += preTaxContribution + employerMatchAmount + backdoorRothContribution;
    preTaxBasis += backdoorRothContribution;
    roth += rothContribution;
    rothLayers.contrib += rothContribution;
    taxable += taxableContribution;
    taxableBasis += taxableContribution;
    hsa += hsaContribution;

    // The RMD (owner, divisor and prior-balance figure above, beside the
    // QCD): the prior December 31 balance over the divisor, never more
    // than what is there now.
    let rmdAmount = 0;
    if (rmdApplies && rmdDivisor > 0) rmdAmount = Math.min(Math.max(0, preTax), rmdFromPriorBalance);
    preTax = Math.max(0, preTax - rmdAmount);

    // Qualified Charitable Distribution. The money still leaves the Pre-Tax
    // account either way (rmdAmount above is unchanged — that's the real,
    // legally-required RMD, and stays that way for the "Forced RMDs"
    // display), but the portion routed to charity via QCD is excluded from
    // taxable income entirely rather than landing in the household's
    // pocket. Capped three ways: can't exceed what the user asked for,
    // can't exceed the RMD itself (a QCD can't manufacture extra
    // distributions beyond what's actually being withdrawn), and can't
    // exceed the per-person IRS annual QCD limit. Changelog 418: available
    // from QCD_START_AGE (70 1/2 in the law), with or without an RMD; the
    // part that exceeds the RMD is a further distribution from Pre-Tax,
    // tax-free and never in the household's pocket.
    const qcdAmount = Math.min(qcdPlanned, rmdAmount + Math.max(0, preTax));
    const qcdBeyondRmd = Math.max(0, qcdAmount - rmdAmount);
    preTax = Math.max(0, preTax - qcdBeyondRmd);
    // The taxable/spendable portion of the RMD — used everywhere below that
    // rmdAmount previously fed into taxable income or household cash flow.
    // Basis is applied pro-rata to the non-QCD remainder only: a QCD is
    // deemed to come first from otherwise-taxable amounts (s 408(d)(8)(D)),
    // so it never consumes basis. Basis recovered stops being basis.
    const rmdCashPortion = rmdAmount - Math.min(qcdAmount, rmdAmount);
    const rmdBasisRecovered = rmdCashPortion * preTaxBasisRatioForYear;
    preTaxBasis = Math.max(0, preTaxBasis - rmdBasisRecovered);
    const rmdTaxableAmount = rmdCashPortion - rmdBasisRecovered;
    // Cash vs. tax: the household receives the whole non-QCD RMD
    // (rmdCashPortion). Only rmdTaxableAmount is income; the basis share is
    // a tax-free return of after-tax money, but it is still cash in hand, so
    // the cash-need lines below credit rmdCashPortion, never rmdTaxableAmount.

    // Net Unrealized Appreciation (NUA): a one-time, in-kind lump-sum
    // distribution of employer stock held inside the Pre-Tax 401(k), taken
    // the year age1 reaches nuaDistributionAge. Ordinary income tax is owed
    // immediately on the stock's cost basis only (nuaCostBasis) — NOT its
    // full current value, unlike a normal Pre-Tax withdrawal/RMD. The
    // untaxed appreciation (current value minus cost basis) moves into the
    // Taxable brokerage account instead, where it joins the account's
    // regular tracked basis pool (taxableBasis, see below) at its
    // appreciation-only value -- i.e. it counts as unrealized gain, not
    // basis, same as any other taxable holding's growth (the cost-basis
    // portion, above, is added to taxableBasis separately once it's already
    // been taxed). This isn't distinct per-lot NUA tracking with its own
    // permanent LTCG treatment regardless of holding period, which is at
    // least as favorable as this model's blended treatment, so the
    // simplification here is conservative, not optimistic, for the user).
    let nuaOrdinaryIncome = 0;
    if (inputs.nuaEnabled && !nuaTriggered && spouse1Alive && age1 === inputs.nuaDistributionAge && preTax > 0) {
      const nuaCurrentValue = Math.max(0, inputs.nuaCurrentValue || 0);
      const nuaDistributionAmount = Math.min(preTax, nuaCurrentValue);
      const nuaCostBasis = Math.min(nuaDistributionAmount, Math.max(0, inputs.nuaCostBasis || 0));
      preTax = Math.max(0, preTax - nuaDistributionAmount);
      taxable += nuaDistributionAmount;
      // The cost-basis portion was just taxed as ordinary income
      // (nuaOrdinaryIncome below) the instant it landed here, so it's
      // effectively an after-tax dollar now -- becomes real basis in the
      // Taxable bucket, same as any other after-tax contribution. Only the
      // untaxed appreciation above cost basis is unrealized gain.
      taxableBasis += nuaCostBasis;
      nuaOrdinaryIncome = nuaCostBasis;
      nuaTriggered = true;
    }

    // Concentrated stock: grow the position and take this year's
    // diversification slice HERE, before the tax engine runs, so the gain it
    // realizes is taxed like any other realized gain (audit Q-10(b),
    // changelog 127). It used to happen at the very end of the year and be
    // charged a flat user-set rate that never touched the brackets, NIIT,
    // state tax or any MAGI -- so selling $2,000,000 of a founder position
    // could show a 15% bill while leaving ACA subsidies and IRMAA
    // untouched. The proceeds still land in Taxable at the end of the year
    // (phase B below), after Taxable's own growth, so they are not
    // double-compounded in the year they move across.
    const csYear = csConfigs.map((cfg, i) => {
      const state = csState[i];
      const out = { diversified: 0, realizedGain: 0, diversificationTax: 0, netProceeds: 0 };
      if (!cfg.enabled) return out;
      state.balance *= (1 + cfg.growthRate / 100);
      out.diversified = state.balance * (cfg.diversifyPct / 100);
      // With vest routing on, the flat basis % is replaced by the tracked
      // basis-dollars fraction (see csState above): routed-in vests are
      // 100% basis, so the blended fraction rises as new shares join and
      // the flat % would overstate the tax. Growth raises the balance but
      // not the basis, so the fraction also decays realistically between
      // vests. Without routing, the legacy flat % applies unchanged.
      const effectiveBasisFrac = (cfg.vestRoutingEnabled || state.basisTracked)
        ? (state.balance > 0 ? Math.min(1, state.basisDollars / state.balance) : 0)
        : cfg.costBasisPct / 100;
      out.realizedGain = Math.max(0, out.diversified * (1 - effectiveBasisFrac));
      if (inputs.concentratedStockFlatTaxEnabled) {
        // Legacy behavior, kept so a plan built before changelog 127 can
        // reproduce its old numbers: a flat rate outside the tax engine.
        out.diversificationTax = out.realizedGain * (cfg.diversifyTaxRate / 100);
      }
      out.netProceeds = out.diversified - out.diversificationTax;
      state.balance = Math.max(0, state.balance - out.diversified);
      // A proportional slice of basis leaves with the shares sold.
      state.basisDollars = Math.max(0, state.basisDollars - out.diversified * effectiveBasisFrac);
      return out;
    });
    // Only counted in the tax base when the real engine is doing the work.
    const concentratedStockRealizedGain = inputs.concentratedStockFlatTaxEnabled
      ? 0
      : csYear[0].realizedGain + csYear[1].realizedGain;

    const forcedRealizedGains = actualMilestoneTaxable * (1 - taxableBasisRatioForYear) + concentratedStockRealizedGain + annuityPurchaseRealizedGain;
    const taxableDividendYield = Math.max(0, Number(inputs.taxableDividendYield ?? 2)) / 100;
    const taxableDividendsFromYield = Math.max(0, taxable * taxableDividendYield);
    // Changelog 208: the non-qualified share of the yield is ordinary
    // income. It joins every ordinary-income sum below (the brackets, SS
    // provisional income, ACA and IRMAA MAGI, the NIIT base, the state
    // base); only the qualified share and realized gains stay on the
    // capital-gains rates. At 100% qualified this is exactly zero.
    // Changelog 414: unless the yield is linked to Detailed Holdings (which
    // sets the typed figure from each holding's character) or the switch is
    // off, the share is the year's stock allocation: a brokerage account
    // holding the plan's own stock/bond mix earns qualified dividends on
    // its stock side and interest on its bond and cash side, and interest
    // is ordinary income. 100% qualified was never true of a 60/40
    // account; it only understated the tax.
    const followsAllocation = inputs.taxableQualifiedDividendFollowsAllocation !== false
      && inputs.taxableDividendYieldSource !== 'holdings';
    // Changelog 441: weighted by what each side yields, not by the balance
    // split -- see qualifiedShareFromAllocation.
    const qualifiedDividendShare = followsAllocation
      ? qualifiedShareFromAllocation(planStockShareForYear(inputs, isRetired, year, householdRetirementYear), inputs)
      : Math.min(100, Math.max(0, Number(inputs.taxableQualifiedDividendPct ?? 100))) / 100;
    const ordinaryDividends = qualifiedDividendShare < 1 ? taxableDividendsFromYield * (1 - qualifiedDividendShare) : 0;
    const taxableDividendsGross = (qualifiedDividendShare < 1 ? taxableDividendsFromYield - ordinaryDividends : taxableDividendsFromYield) + forcedRealizedGains;

    // Tax-Loss Harvesting: when enabled, a down year (returnRate < 0) is
    // treated as an opportunity to realize the taxable account's paper
    // loss by swapping into a similar-but-not-identical fund (avoiding the
    // IRS wash-sale rule) while staying fully invested. This app doesn't
    // track individual tax lots, so the harvested loss is the loss the
    // account as a whole holds after the decline (changelog 429, below),
    // never more than the decline itself. The harvested loss first offsets this
    // year's realized capital gains/dividends dollar-for-dollar, then up
    // to $3,000 (2026; inflated forward for consistency with how every
    // other statutory dollar limit in this model is projected in nominal
    // terms, even though the real IRS limit is not actually indexed)
    // against ordinary income, with any remainder carried forward
    // indefinitely to future years -- mirroring the real IRS capital-loss
    // carryforward rule (IRC Sec. 1211-1212).
    //
    // Changelog 429: only a loss the account actually holds can be
    // harvested. A sale realizes basis less value, so the loss available
    // after this year's decline is the basis over the declined value --
    // nothing at all while the account sits on gains, as most do after a
    // few years of growth, and never more than the decline itself. Until
    // 429 the whole balance's decline was booked as a loss whatever the
    // basis was, and the basis was never lowered by the sale, so the same
    // dollar of loss was deducted now AND sheltered gain later. The swap
    // sells at the declined value and rebuys, so the basis is reset to
    // that value at the growth step below. One lot the pool cannot see is
    // this year's own contribution, bought at today's prices and under
    // water by the whole decline whatever the older lots show, so that
    // slice is harvestable on its own.
    let taxLossHarvestedThisYear = 0;
    if (inputs.taxLossHarvestingEnabled && returnRate < 0 && taxable > 0) {
      const declineShare = Math.abs(returnRate) / 100;
      const declinedValue = taxable * (1 - declineShare);
      const decline = taxable - declinedValue;
      const poolLoss = Math.max(0, Math.min(taxable, taxableBasis) - declinedValue);
      const newMoneyLoss = Math.max(0, taxableContribution) * declineShare;
      taxLossHarvestedThisYear = Math.min(decline, Math.max(poolLoss, newMoneyLoss));
      lossCarryforward += taxLossHarvestedThisYear;
    }
    // Audit Q-11 (changelog 124): a capital loss nets against CAPITAL
    // GAINS -- here the realized gains on Life-Event Taxable withdrawals,
    // and (inside the solver below) the gains realized by this year's
    // discretionary Taxable draw. It never absorbs qualified dividends,
    // which are ordinary income taxed at preferential rates, not gains.
    // The ordinary-income offset is $3,000 ($1,500 MFS, s.1211(b)) and is
    // NOT indexed by statute, so it is no longer inflated forward.
    const harvestedGainsOffset = Math.min(lossCarryforward, forcedRealizedGains);
    lossCarryforward -= harvestedGainsOffset;
    const taxableDividends = Math.max(0, taxableDividendsGross - harvestedGainsOffset);
    const harvestedOrdinaryOffsetLimit = currentStatus === 'MFS' ? 1500 : 3000;
    // Provisional: the solver below may reclaim part of this for the gains
    // its draw realizes (s 1211(b) nets losses against gains first), and
    // the settled figure is written back after the solve (changelog 404).
    let harvestedOrdinaryOffset = inputs.taxLossHarvestingEnabled ? Math.min(lossCarryforward, harvestedOrdinaryOffsetLimit) : 0;
    lossCarryforward -= harvestedOrdinaryOffset;

    // SS taxability -- IRS "provisional income" (a.k.a. combined income)
    // test: AGI excluding SS + tax-exempt interest + 50% of SS benefits,
    // compared against two thresholds that are NOT indexed for inflation
    // and have been unchanged since 1993 (lower) / 1984 (upper) -- more
    // retirees cross into the 85% tier every year purely from ordinary
    // nominal income growth, not any bracket change. taxableSSFor below is
    // the exact Publication 915 worksheet (changelog 119).
    // The single harshest MFS rule, and the one most likely to wreck a
    // retirement projection: filing separately while having lived with
    // your spouse at any point sets the base amount to $0 (IRS
    // Publication 915). There is no exempt band at all -- benefits start
    // being taxed against the first dollar of other income, and the
    // 85% tier is reached almost immediately. Living apart all year gets
    // the ordinary single-filer amounts.
    const mfsTogether = currentStatus === 'MFS' && inputs.mfsLivedWithSpouse;
    const ssLowerThreshold = mfsTogether ? 0 : (currentStatus === 'MFJ') ? 32000 : 25000;
    const ssUpperThreshold = mfsTogether ? 0 : (currentStatus === 'MFJ') ? 44000 : 34000;
    // Taxable Social Security for a given amount of OTHER income in the
    // provisional-income test. A function rather than a number because a
    // Roth conversion is itself provisional income: a conversion sized
    // against the pre-conversion taxableSS can lift benefits from the 0%
    // or 50% tier to the 85% tier, and that extra taxable SS lands on top
    // of a conversion that had already filled the bracket -- the "tax
    // torpedo." The max-bracket sizing below and the post-conversion
    // taxableSS both go through this.
    // Exact IRS Publication 915 worksheet (changelog 119; resolves audit
    // question Q-5). Between the thresholds, taxable SS is the LESSER of 50%
    // of benefits and 50% of the excess over the lower threshold; above the
    // upper threshold it is the lesser of 85% of benefits and 85% of the
    // excess over the upper threshold plus the (capped) 50% tier. The flat
    // 0/50/85% tiers this replaced were right only well above the upper
    // threshold: an MFJ couple with $40,000 of benefits and $24,000 of
    // pension (provisional $44,000) has $6,000 of taxable benefits under
    // the worksheet, not $20,000 -- and that band is exactly where the
    // "tax torpedo" a Roth-conversion sizing has to reason about lives.
    // Still monotone non-decreasing in otherIncome, so the bisection in the
    // max-bracket sizing below is unaffected.
    const taxableSSFor = (otherIncome) => {
      if (!(ssIncome > 0)) return 0;
      // Residents of a handful of treaty countries (Canada, Germany,
      // Ireland, Italy, the UK and a few others -- IRS Pub 915) owe the US
      // no tax on their benefits at all. The user says so per move.
      if (abroad && foreignTerms.usExemptsSocialSecurity) return 0;
      const combinedIncome = otherIncome + 0.5 * ssIncome;
      if (combinedIncome <= ssLowerThreshold) return 0;
      if (combinedIncome <= ssUpperThreshold) {
        return Math.min(0.5 * ssIncome, 0.5 * (combinedIncome - ssLowerThreshold));
      }
      const lowerTier = Math.min(0.5 * ssIncome, 0.5 * (ssUpperThreshold - ssLowerThreshold));
      return Math.min(0.85 * ssIncome, 0.85 * (combinedIncome - ssUpperThreshold) + lowerTier);
    };
    // Other income entering provisional income before any conversion.
    // Provisional income is built from AGI, so salary enters NET of the
    // deferrals that never reach AGI in the first place -- 401(k), HSA and
    // NQDC -- matching baseOrdinaryTaxableIncome below. Through changelog
    // 132 this used GROSS salary, which overstated provisional income (and
    // so the taxable share of benefits) for anyone still working and
    // deferring: a 63-year-old claiming early while deferring $30,000 was
    // tested as if that $30,000 were on their return. Fixed in changelog
    // 133. Retired years are unaffected -- salary is zero there.
    // Every other ordinary item that is on the return -- Life-Event Pre-Tax
    // withdrawals, the purchased annuity's taxable slice, taxable windfalls
    // and the NUA cost basis -- is in AGI (baseOrdinaryTaxableIncome below)
    // and so in provisional income too; they were missing here, so $40,000
    // arriving as a Life-Event IRA withdrawal left benefits untaxed where
    // the same $40,000 as a pension did not. The capital-loss ordinary
    // offset is an above-the-line deduction and comes off AGI the same way.
    // One figure feeds provisional income, the max-bracket conversion
    // sizing, and the ACA / IRMAA conversion caps, so they cannot drift.
    const provisionalSalary = Math.max(0, salary - preTaxContribution - hsaContribution - nqdcDeferral1 - nqdcDeferral2);
    const otherOrdinaryAgi = Math.max(0, provisionalSalary + pension + rentalAnnuity + rmdTaxableAmount
      + taxableInflowOrdinary + taxableAnnuityOrdinary + milestonePreTaxTaxable + nuaOrdinaryIncome + ordinaryDividends
      - harvestedOrdinaryOffset);
    const provisionalOtherIncome = otherOrdinaryAgi + taxableDividends;
    let taxableSS = taxableSSFor(provisionalOtherIncome);

    // Roth Conversions
    let convertAmount = 0;
    let isConversionYear = true;
    if (inputs.rothConversionDelayUntilRetire && !isRetired) {
      isConversionYear = false;
    }

    // Bounded "Roth ladder" duration: caps how many years the conversion
    // strategy runs for, counted from whichever year conversions actually
    // start (immediately at the plan's start year, or at retirement if
    // rothConversionDelayUntilRetire is on) rather than from the plan's
    // start year in every case. 0 (default) means unlimited -- keep
    // converting for as long as rothConversionStrategy dictates, matching
    // every plan's behavior before this existed. householdRetirementYear
    // is guaranteed non-null here whenever rothConversionDelayUntilRetire
    // is on, since isConversionYear above already requires isRetired to be
    // true in that case, and isRetired becoming true is exactly what sets
    // householdRetirementYear (see the isRetired check earlier in this loop).
    if (isConversionYear && inputs.rothConversionDurationYears > 0) {
      const conversionStartYear = inputs.rothConversionDelayUntilRetire ? householdRetirementYear : startYear;
      const yearsSinceConversionStart = year - conversionStartYear;
      if (yearsSinceConversionStart >= inputs.rothConversionDurationYears) {
        isConversionYear = false;
      }
    }

    // IRS Pro-Rata Rule (Backdoor Roth): if the Pre-Tax bucket contains
    // any after-tax basis (preTaxBasis -- built up via non-deductible
    // Backdoor Roth contributions above, or an initial preTaxBasisInit
    // balance), every dollar converted to Roth this year is only
    // partially taxable, in the same proportion basis bears to the whole
    // Pre-Tax balance (IRC Sec. 408(d)(2)) -- you can't cherry-pick
    // converting "just the after-tax part." This app doesn't separate
    // 401(k) from Traditional IRA within the Pre-Tax bucket (a
    // pre-existing simplification), so in reality only the IRA portion
    // would be subject to pro-rata; applying the ratio to the whole
    // bucket understates the tax-free portion for a household whose
    // Pre-Tax money is mostly 401(k) -- conservative, not optimistic.
    // (preTaxBasisRatioForYear is computed above, before this year's RMD.)

    // Changelog 423: the max-bracket fill's ceiling and taxable-income
    // rule, kept for the trim after the withdrawal solver has drawn.
    let maxBracketFill = null;
    if (isConversionYear && inputs.rothConversionStrategy !== 'none' && preTax > 0) {
      if (inputs.rothConversionStrategy === 'fixed') {
        convertAmount = Math.min(preTax, inputs.rothConversionAmount);
      } else if (inputs.rothConversionStrategy === 'maxBracket') {
        const targetRate = inputs.rothConversionBracket;
        // The ceiling is a per-return figure. MFS splits the household's
        // taxable income across two returns (forEachSeparateReturn), so the
        // household can fill to the ceiling divided by the larger return's
        // share before that return crosses the bracket (changelog 403;
        // until then an even split converted half of what fit).
        const bracketLimit = getTaxBracketLimit(currentStatus, targetRate, taxBracketInflationFactor) / mfsLargerShare(inputs, currentStatus);
        const ceiling = bracketLimit - inputs.rothConversionBuffer;
        // Ordinary income other than Social Security and the conversion.
        const otherOrdinary = otherOrdinaryAgi; // net of NQDC deferrals, plus NUA basis, as in baseOrdinaryTaxableIncome
        // Only (1 - preTaxBasisRatioForYear) of each nominal dollar
        // converted actually becomes taxable income, so a larger nominal
        // conversion is needed to fill the same bracket headroom when
        // basis is present.
        const taxableShare = 1 - preTaxBasisRatioForYear;
        // Taxable ordinary income if `c` (nominal) is converted -- with the
        // Social Security tier and the OBBBA senior-bonus phase-out both
        // re-solved against the conversion. Monotone non-decreasing in c,
        // so the largest conversion that still fits under the ceiling can
        // be found by bisection. Two feedback effects live here that a
        // one-shot "ceiling minus today's taxable income" missed: the SS
        // tax torpedo (taxableSSFor) and the senior bonus shrinking as
        // MAGI rises (deductionFor).
        // Two MFS returns: the larger return's taxable income is its share
        // of the ordinary income less its OWN deduction, so in household
        // terms (the ceiling above is household terms) the deduction to
        // take off is that one divided by the share -- the same as the
        // summed deduction for an even split between spouses of one age
        // band, and the exact figure otherwise (changelog 407).
        const largerReturnDeduction = mfsReturnDeductions
          ? mfsLargerReturnDeduction(mfsSplitForYear, mfsReturnDeductions) / mfsLargerShare(inputs, currentStatus)
          : null;
        const taxableIncomeWith = (c) => {
          const cTaxable = c * taxableShare;
          const ss = taxableSSFor(provisionalOtherIncome + cTaxable);
          const ordinary = otherOrdinary + ss + cTaxable;
          return ordinary - (largerReturnDeduction !== null ? largerReturnDeduction : deductionFor(ordinary + taxableDividends));
        };
        if (taxableShare > 0) {
          maxBracketFill = {
            ceiling,
            taxableIncomeFor: (ordinary, capGains) => ordinary - (largerReturnDeduction !== null ? largerReturnDeduction : deductionFor(ordinary + capGains)),
          };
        }
        if (taxableShare <= 0) {
          // 100% basis: the conversion is tax-free, convert it all (as before).
          convertAmount = preTax;
        } else if (taxableIncomeWith(0) >= ceiling) {
          convertAmount = 0;
        } else if (taxableIncomeWith(preTax) <= ceiling) {
          convertAmount = preTax;
        } else {
          let lo = 0;
          let hi = preTax;
          for (let i = 0; i < 60; i++) {
            const mid = (lo + hi) / 2;
            if (taxableIncomeWith(mid) <= ceiling) lo = mid; else hi = mid;
          }
          convertAmount = lo;
        }
      }
      // ACA cliff protection: in a marketplace year, never let a voluntary
      // conversion push estimated ACA MAGI over 400% of FPL. ACA MAGI is AGI
      // plus the untaxed slice of Social Security (and tax-exempt interest,
      // not modeled), so it counts ALL of this year's SS, not just the
      // taxable part. Discretionary Pre-Tax draws the solver picks later
      // can still cross the line -- that case is flagged (acaCliffBreached)
      // rather than prevented, since the draw is what funds the year.
      if (inputs.acaCliffProtectionEnabled && onMarketplace && convertAmount > 0) {
        const otherOrdinaryForAca = otherOrdinaryAgi; // net of NQDC deferrals, plus NUA basis, as in baseOrdinaryTaxableIncome
        const baseAcaMagi = otherOrdinaryForAca + ssIncome + taxableDividends;
        const taxableShare = 1 - preTaxBasisRatioForYear;
        const headroom = acaCliffThreshold - baseAcaMagi;
        const maxConversion = taxableShare > 0 ? Math.max(0, headroom) / taxableShare : convertAmount;
        if (convertAmount > maxConversion) {
          acaCliffCappedConversion = convertAmount - maxConversion;
          convertAmount = maxConversion;
        }
      }
      // IRMAA tier cap (changelog 250). This year's MAGI is the one the
      // two-year lookback prices Medicare against in year+2, so the cap
      // binds only when someone will be on Part B/D then: alive, 65 or
      // older, and not still deferring Medicare on an employer plan (the
      // same rule medicareDeferred1/2 apply, moved two years forward). The
      // thresholds are the ones that will be in force in year+2 -- two more
      // years of indexing, with the top tier's statutory freeze honored --
      // against the filing status in force now (a status change in the
      // gap is not anticipated). MAGI here is what the conversion can see:
      // ordinary income, taxable SS re-solved against the conversion, and
      // dividends. The withdrawal solver's later discretionary Pre-Tax draw
      // and any realized gains can still lift the year's MAGI over the
      // line, exactly as with the ACA cap above; the Medicare column two
      // years on shows the result either way.
      if (inputs.rothConversionIrmaaCapEnabled && convertAmount > 0) {
        const alive1In2 = spouse1Alive && (age1 + 2) <= inputs.lifeExpectancy1;
        const alive2In2 = !!inputs.spouse2Enabled && spouse2Alive && (age2 + 2) <= inputs.lifeExpectancy2;
        const working1In2 = alive1In2 && (age1 + 2) < inputs.retireAge1;
        const working2In2 = alive2In2 && (age2 + 2) < inputs.retireAge2;
        const deferredIn2 = (who) => {
          const src = who === 1 ? inputs.medicareEmployerCoverage1 : inputs.medicareEmployerCoverage2;
          if (src === 'own') return who === 1 ? working1In2 : working2In2;
          if (src === 'spouse') return who === 1 ? working2In2 : working1In2;
          return false;
        };
        const onMedicareIn2 = (alive1In2 && (age1 + 2) >= 65 && !deferredIn2(1) ? 1 : 0)
          + (alive2In2 && (age2 + 2) >= 65 && !deferredIn2(2) ? 1 : 0);
        if (onMedicareIn2 > 0) {
          const factorIn2 = inputs.irmaaFreezeEnabled
            ? 1
            : taxBracketInflationFactor * Math.pow(1 + inputs.taxBracketInflationRate / 100, 2);
          const topIn2 = inputs.irmaaFreezeEnabled ? 1 : irmaaTopTierFactor(year + 2, factorIn2, startYear);
          const tiersIn2 = irmaaScaledThresholds(currentStatus, inputs.mfsLivedWithSpouse, factorIn2, topIn2);
          const tierIdx = Math.max(0, Math.min(tiersIn2.length - 1, Math.floor(inputs.rothConversionIrmaaTier)));
          // MFS prices each spouse on their own share of the MAGI (see
          // priceIrmaa), so the household figure can reach the tier line
          // divided by the larger share before either return crosses it.
          const limit = tiersIn2[tierIdx] / mfsLargerShare(inputs, currentStatus);
          if (Number.isFinite(limit)) {
            const ceiling = limit - inputs.rothConversionBuffer;
            irmaaCapCeiling = ceiling;
            const otherOrdinaryForIrmaa = otherOrdinaryAgi; // net of NQDC deferrals, plus NUA basis, as in baseOrdinaryTaxableIncome
            const taxableShare = 1 - preTaxBasisRatioForYear;
            // MAGI if `c` (nominal) is converted; monotone in c, so the
            // largest fit is found by bisection, as for the bracket fill.
            const magiWith = (c) => {
              const cTaxable = c * taxableShare;
              return otherOrdinaryForIrmaa + taxableSSFor(provisionalOtherIncome + cTaxable) + cTaxable + taxableDividends;
            };
            let maxConversion = convertAmount;
            if (taxableShare <= 0) {
              maxConversion = convertAmount; // a basis-only conversion adds no MAGI
            } else if (magiWith(0) >= ceiling) {
              maxConversion = 0;
            } else if (magiWith(convertAmount) > ceiling) {
              let lo = 0;
              let hi = convertAmount;
              for (let i = 0; i < 60; i++) {
                const mid = (lo + hi) / 2;
                if (magiWith(mid) <= ceiling) lo = mid; else hi = mid;
              }
              maxConversion = lo;
            }
            if (convertAmount > maxConversion) {
              irmaaCappedConversion = convertAmount - maxConversion;
              convertAmount = maxConversion;
            }
          }
        }
      }
      preTax = Math.max(0, preTax - convertAmount);
      roth += convertAmount;
    }

    // Taxable portion of this year's conversion(s) after the pro-rata
    // split above; the rest is a tax-free return of basis. Basis consumed
    // moves with the converted dollars into the Roth account, so it comes
    // out of preTaxBasis permanently. ACA Subsidy Protection below adds
    // to this same pool using this same year's ratio.
    let convertAmountTaxable = convertAmount * (1 - preTaxBasisRatioForYear);
    // The conversion is provisional income too -- settle taxable SS against
    // it now so the year's actual tax (not just the sizing above) reflects
    // any tier jump the conversion caused.
    taxableSS = taxableSSFor(provisionalOtherIncome + convertAmountTaxable);
    preTaxBasis = Math.max(0, preTaxBasis - (convertAmount - convertAmountTaxable));
    if (convertAmount > 0) {
      // This year's conversion becomes a Roth layer with its own five-year
      // clock; the basis that came across pro-rata is never penalized.
      rothLayers.conversions.push({ year, taxable: convertAmountTaxable, nontaxable: convertAmount - convertAmountTaxable });
    }

    // Solve taxes (Federal Ordinary Income Taxes + Capital Gains/Qualified Dividend Taxes + State Income Taxes)
    // Rental Income and Annuity Income (the flat $/yr Plan Settings inputs,
    // inflated together as rentalAnnuity) are ordinary income: net rental
    // income lands on Schedule E and non-qualified/pension-style annuity
    // payments on line 5b, both taxed at ordinary rates and both counted in
    // MAGI for IRMAA and the ACA. They already fed cash inflows and the SS
    // provisional-income test, but had been left out of the taxable-income
    // base -- so a plan with $30k of rent paid $0 federal, state, or IRMAA
    // on it and the Roth-conversion optimizer saw $30k of headroom that
    // wasn't there. (The single-premium annuity purchased through the
    // Annuity feature is separate: its exclusion-ratio split is
    // taxableAnnuityOrdinary.)
    let baseOrdinaryTaxableIncome = Math.max(0, salary - preTaxContribution - hsaContribution - nqdcDeferral1 - nqdcDeferral2) + pension + taxableSS + rentalAnnuity + rmdTaxableAmount + convertAmountTaxable + taxableInflowOrdinary + taxableAnnuityOrdinary + milestonePreTaxTaxable + nuaOrdinaryIncome + ordinaryDividends;
    // Snapshot before the harvest offset below, so the "what would taxes
    // have been without harvesting" reference calc further down (used to
    // keep harvested tax savings from leaking into auto-derived current
    // spending -- see the Current Household Spending comment) isolates just
    // the harvesting effect.
    const preHarvestOrdinaryTaxableIncome = baseOrdinaryTaxableIncome;
    // Tax-loss harvesting's $3k/year ordinary-income offset (see
    // taxLossHarvestedThisYear above) reduces ordinary taxable income
    // directly, the same way an above-the-line capital loss deduction does.
    baseOrdinaryTaxableIncome = Math.max(0, baseOrdinaryTaxableIncome - harvestedOrdinaryOffset);

    // ACA Subsidy Protection / Medicaid non-expansion "coverage gap" --
    // declared here, but evaluated AFTER the withdrawal solver below (see
    // the block just before totalTaxesPaid). It used to run right here,
    // against baseOrdinaryTaxableIncome alone, which omits the Pre-Tax
    // withdrawals the solver hasn't chosen yet -- so a household funding a
    // $130k lifestyle out of its IRA (taxable income squarely in the 22%
    // bracket) was flagged as "below the poverty line" and, with
    // Protection on, handed a forced conversion it never needed. Fixed
    // 2026-08-28.
    let acaSubsidyBoost = 0;
    let inAcaCoverageGap = false;

    // Changelog 417: the medical line the pre-solver pricing can see (the
    // bridge before its ACA credit, and long-term care); Medicare premiums,
    // the credit and the HSA draw refine it below before the solver runs.
    itemizedMedicalCosts = healthcareBridge + ltcCost;
    const medicalLineAtBasePricing = itemizedMedicalCosts;
    const baseDeduction = deductionFor(baseOrdinaryTaxableIncome + taxableDividends);
    const ordinaryFedTaxes = calculateTaxes(Math.max(0, baseOrdinaryTaxableIncome - baseDeduction), currentStatus, taxBracketInflationFactor, inputs.tcjaSunsetEnabled, mfsSplitFor(baseOrdinaryTaxableIncome));
    // Q-10(a): rents and annuity income are net investment income for the
    // 3.8% NIIT even though they are ordinary income for the brackets.
    // The purchased annuity's taxable slice counts only when it is a
    // non-qualified contract bought with Taxable money: a distribution from
    // a qualified plan or IRA is excluded from net investment income
    // (s 1411(c)(5)), so a Pre-Tax-funded annuity owes no NIIT.
    const niiAnnuity = inputs.annuitySourceAccount === 'taxable' ? taxableAnnuityOrdinary : 0;
    const niiOtherForYear = rentalAnnuity + niiAnnuity + ordinaryDividends;
    const baseCapGainsTaxes = calculateCapitalGainsTaxes(Math.max(0, baseOrdinaryTaxableIncome - baseDeduction), taxableDividends, currentStatus, taxBracketInflationFactor, baseDeduction, Math.max(0, baseDeduction - baseOrdinaryTaxableIncome), niiOtherForYear, mfsSplitFor(baseOrdinaryTaxableIncome));
    // What the diversification actually cost, now that it is taxed inside
    // the engine: the year's capital-gains tax with the gain, less the same
    // figure without it. That is the marginal number a user wants -- it
    // includes the 0/15/20% band the gain landed in and any NIIT it
    // triggered, so it can be far above the old flat 15% assumption when
    // the sale is large (audit Q-10(b)). Measured on the pre-solver base,
    // like every other diagnostic in this block.
    const concentratedStockGainTax = concentratedStockRealizedGain > 0
      ? Math.max(0, baseCapGainsTaxes - calculateCapitalGainsTaxes(
        Math.max(0, baseOrdinaryTaxableIncome - baseDeduction),
        Math.max(0, taxableDividends - concentratedStockRealizedGain),
        currentStatus, taxBracketInflationFactor, baseDeduction,
        Math.max(0, baseDeduction - baseOrdinaryTaxableIncome), niiOtherForYear, mfsSplitFor(baseOrdinaryTaxableIncome),
      ))
      : 0;

    // How much tax-loss harvesting saved this year (ordinary + capital
    // gains offset combined), isolated by re-pricing federal tax against
    // the pre-harvest income/gains figures. Only computed pre-retirement
    // and only when harvesting actually did something, since it's the one
    // place this figure is used (see Current Household Spending below) --
    // ACA Subsidy Protection's baseOrdinaryTaxableIncome adjustment never
    // overlaps with this (it's gated on isRetired, this is gated on
    // !isRetired), so no reference recompute is needed for that.
    let harvestTaxSavings = 0;
    if (!isRetired && (harvestedOrdinaryOffset > 0 || harvestedGainsOffset > 0)) {
      const refDeduction = deductionFor(preHarvestOrdinaryTaxableIncome + taxableDividendsGross);
      const refOrdinaryFedTaxes = calculateTaxes(Math.max(0, preHarvestOrdinaryTaxableIncome - refDeduction), currentStatus, taxBracketInflationFactor, inputs.tcjaSunsetEnabled, mfsSplitFor(preHarvestOrdinaryTaxableIncome));
      const refCapGainsTaxes = calculateCapitalGainsTaxes(Math.max(0, preHarvestOrdinaryTaxableIncome - refDeduction), taxableDividendsGross, currentStatus, taxBracketInflationFactor, refDeduction, Math.max(0, refDeduction - preHarvestOrdinaryTaxableIncome), niiOtherForYear, mfsSplitFor(preHarvestOrdinaryTaxableIncome));
      harvestTaxSavings = Math.max(0, (refOrdinaryFedTaxes + refCapGainsTaxes) - (ordinaryFedTaxes + baseCapGainsTaxes));
    }

    // Alternative Minimum Tax. AMTI starts from the regular taxable income
    // and adds back what the AMT does not allow: the standard deduction (so
    // a standard-deduction year's AMTI is the ordinary income itself, as
    // before) or, for a year that itemizes (changelog 417), the state and
    // local tax line only -- mortgage interest, charitable gifts and
    // medical costs over the floor are deductible under the AMT too
    // (s 56(b)(1)). The senior deduction is added back either way, as it
    // was. Until changelog 433 an itemizer's AMTI was still the income
    // before any deduction, so the tentative minimum tax was compared with
    // a regular tax that had subtracted $100k of gifts and interest and
    // "AMT" of $8k-$23k appeared for exactly the households that itemize.
    // See calculateAMT's comment for the other simplifications. Charge the
    // excess of the tentative minimum tax over the regular ordinary tax, if
    // any; capital gains are taxed the same under both systems so they're
    // excluded from both sides of this comparison rather than double
    // counted.
    const baseChoice = deductionChoice(baseOrdinaryTaxableIncome + taxableDividends);
    const amtAllowedDeduction = baseChoice.itemized
      ? Math.max(0, baseChoice.amount - itemizedFor(baseOrdinaryTaxableIncome + taxableDividends).salt)
      : 0;
    const tentativeMinimumTax = calculateAMT(Math.max(0, baseOrdinaryTaxableIncome - amtAllowedDeduction), currentStatus, taxBracketInflationFactor, effectiveMfsSplitPct(inputs));
    let amtTax = Math.max(0, tentativeMinimumTax - ordinaryFedTaxes);

    // A Life-Event Pre-Tax withdrawal before 59 1/2 is an early
    // distribution like any other: the 10% additional tax (s 72(t)) on its
    // taxable share, plus California's 2.5% -- the same age test and state
    // rule the withdrawal solver applies to its own draws. It used to be
    // taxed as ordinary income with no penalty at all.
    const milestoneEarlyPenalty = ownerAge < 59.5 ? milestonePreTaxTaxable * 0.10 : 0;
    const milestoneStateEarlyTax = stateEarlyDistributionTax(residence.stateTaxState, milestonePreTaxTaxable, ownerAge);
    let baseFedTaxes = ordinaryFedTaxes + baseCapGainsTaxes + amtTax + milestoneEarlyPenalty;
    
    const totalIncomeForState = baseOrdinaryTaxableIncome + taxableDividends;
    // Shared per-year state-tax context (see calculateStateTaxes' extras):
    // `year` is this projection row's calendar year, which drives New
    // York's era-aware brackets/recapture and California's military
    // exclusion sunset. The HSA addback (California non-conformity) is this
    // year's contribution plus estimated earnings on the balance carried
    // into the year -- estimated with this year's return because actual
    // growth is applied later in the loop, and floored at zero (a down year
    // is no state deduction; interest and dividends inside the account are
    // still taxable and this model doesn't decompose them from price
    // moves).
    const stateExtrasForYear = {
      calendarYear: year,
      // Two MFS returns: the state tax is priced per return too.
      mfsSplitPct: mfsTwoReturns ? mfsSplitForYear : null,
      // ...and the federal side floors each return's own deduction.
      mfsReturnDeductions,
      // Employee 401(k) deferrals, which Pennsylvania taxes as compensation.
      paCompensationAddback: preTaxContribution,
      // Changelog 203: a split move year's state tax is shared by months.
      partYear: priorResidence ? { share: moveShare, prior: priorResidence } : null,
      nycResident: residence.nycResident,
      yonkersResident: residence.yonkersResident,
      stateTaxFlatRate: residence.stateTaxFlatRate,
      // Changelog 361: which state's rules a 'state_rules' residence uses,
      // and the year's wages (a retirement exclusion that also covers
      // investment income -- Georgia's -- applies to what is not wages,
      // Social Security, pension or IRA money).
      stateCode: residence.stateOfResidence,
      earnedIncome: ficaWages1 + ficaWages2,
      hsaAddback: hsaContribution + Math.max(0, (hsa - hsaContribution) * (returnRate / 100)),
      // The SS actually inside the ordinary-income base handed to the state
      // engine (see calculateStateTaxes' ssInIncome note).
      federalTaxableSS: taxableSS,
      // Q-15: the qualified-plan / IRA distributions already inside the
      // ordinary base (the solver adds its own Pre-Tax draw on top).
      retirementDistributions: rmdTaxableAmount + milestonePreTaxTaxable + nuaOrdinaryIncome,
      rothConversionTaxable: convertAmountTaxable,
      niiOther: niiOtherForYear,
      // Changelog 349, Washington: the realized long-term gains inside the
      // base (Life-Event Taxable withdrawals, concentrated-stock and
      // annuity-purchase sales, net of any harvested loss) -- not the
      // dividends -- and the year's indexing factor. The solver and the
      // later re-pricings add their own draw's gains on top.
      longTermGains: Math.max(0, forcedRealizedGains - harvestedGainsOffset),
      inflationFactor: taxBracketInflationFactor,
      // Changelog 430: California's figures carry forward from their 2025
      // vintage by this rate for the year before the plan's indexing starts.
      taxBracketInflationRate: inputs.taxBracketInflationRate,
    };
    const baseStateIncomeTaxes = calculateStateTaxes(
      totalIncomeForState, pension, ssIncome, residence.stateTaxState,
      residence.stateTaxSocialSecurityTaxable, residence.stateTaxPensionTaxable,
      currentStatus, ownerAge, age2, residence.stateTaxFlatRate, militaryPension,
      { stateExempt: stateExemptPension, private1: privatePension1, private2: privatePension2, military1: military1Pension, military2: military2Pension },
      residence.yonkersResident, { ...stateExtrasForYear, federalAGI: totalIncomeForState, federalDeduction: baseDeduction }
    );
    let baseStateTaxes = baseStateIncomeTaxes + milestoneStateEarlyTax;
    const ficaTaxes = calculateFICATaxes(ficaWages1, ficaWages2, currentStatus, statutoryInflFactor, year, inputs.inflationRate);
    let baseTaxes = baseFedTaxes + baseStateTaxes + ficaTaxes;

    // The foreign layer on this year's income before any withdrawal
    // (changelog 196). The solver prices the rest against its own draw.
    let foreignCtx = null;
    let foreignBase = null;
    if (abroad) {
      foreignCtx = {
        f: foreignTerms,
        inflFactor: taxBracketInflationFactor,
        fxFactor: foreignTerms.fxRate * Math.pow(1 + foreignTerms.fxDriftPct / 100, year - startYear),
        wages: ficaWages1 + ficaWages2,
        pension,
        iraBase: rmdTaxableAmount + milestonePreTaxTaxable + nuaOrdinaryIncome + convertAmountTaxable,
        rentalAnnuity,
        ssGross: ssIncome,
        dividends: taxableDividends + ordinaryDividends,
        // The non-qualified share, taxed by the US at ordinary rates
        // (passive-basket room, changelog 365).
        ordinaryDividends,
        rothStart: roth,
        dividendYield: taxableDividendYield,
        cf: ftcCarryforwardAvailable(ftcPools, year),
        adults: (spouse1Alive ? 1 : 0) + (spouse2Alive ? 1 : 0),
        // Changelog 199: how long the household has lived here (a regime
        // runs from the year of the move), and the balances a wealth tax
        // reaches, as they stand at the start of the year.
        yearsSinceMove: year - residence.fromYear,
        preTaxStart: preTax,
        taxableStart: taxable,
        // Changelog 200: what the household spends there -- the money a
        // remittance-basis country sees brought in.
        spendingThere: lifestyleCost + goGoBump + ltcCost + foreignHealthcare,
        // Changelog 203: the share of a split move year lived there, and
        // the calendar year (for a regime that ends on a fixed date).
        yearShare: moveShare,
        year,
      };
      const baseNiit = calculateNetInvestmentIncomeTax(Math.max(0, baseOrdinaryTaxableIncome - baseDeduction), taxableDividends, currentStatus, taxBracketInflationFactor, baseDeduction, Math.max(0, baseDeduction - baseOrdinaryTaxableIncome), niiOtherForYear, mfsSplitFor(baseOrdinaryTaxableIncome));
      foreignBase = priceForeignYear(foreignCtx, {
        preTaxOrdinary: 0, realizedGains: 0, rothDraw: 0, rothEarnings: 0,
        usRegularTax: ordinaryFedTaxes + baseCapGainsTaxes - baseNiit,
        usOrdinaryIncome: baseOrdinaryTaxableIncome,
        usCapGains: taxableDividends,
        usCapGainsTax: baseCapGainsTaxes - baseNiit,
        usTaxableSS: taxableSS,
      });
      baseTaxes += foreignBase.net;
    }

    // Marginal federal + state income tax attributable to this year's Roth
    // conversion, isolated the same way harvestTaxSavings (above) isolates
    // tax-loss harvesting's savings: re-price tax against a "what if this
    // year's conversion hadn't happened" counterfactual and take the
    // difference. Pure decomposition for display (the Cash Flow Sankey's
    // "Roth Conversion Tax" node) -- doesn't feed back into cashNeeded or
    // totalTaxesPaid, which are computed against the real (with-conversion)
    // income exactly as before. FICA and AMT are left out of both sides,
    // same simplification harvestTaxSavings makes; IRMAA (a two-year-lagged,
    // cliff-based surcharge rather than a marginal tax) isn't attributed
    // here either, so this understates the conversion's true cash-flow
    // impact for a household right at an IRMAA tier threshold.
    let conversionTaxCost = 0;
    if (convertAmountTaxable > 0) {
      const noConversionOrdinaryIncome = Math.max(0, baseOrdinaryTaxableIncome - convertAmountTaxable);
      const refDeduction = deductionFor(noConversionOrdinaryIncome + taxableDividends);
      const refOrdinaryFedTaxes = calculateTaxes(Math.max(0, noConversionOrdinaryIncome - refDeduction), currentStatus, taxBracketInflationFactor, inputs.tcjaSunsetEnabled, mfsSplitFor(noConversionOrdinaryIncome));
      const refCapGainsTaxes = calculateCapitalGainsTaxes(Math.max(0, noConversionOrdinaryIncome - refDeduction), taxableDividends, currentStatus, taxBracketInflationFactor, refDeduction, Math.max(0, refDeduction - noConversionOrdinaryIncome), niiOtherForYear, mfsSplitFor(noConversionOrdinaryIncome));
      const refTotalIncomeForState = noConversionOrdinaryIncome + taxableDividends;
      const refStateTaxes = calculateStateTaxes(
        refTotalIncomeForState, pension, ssIncome, residence.stateTaxState,
        residence.stateTaxSocialSecurityTaxable, residence.stateTaxPensionTaxable,
        currentStatus, ownerAge, age2, residence.stateTaxFlatRate, militaryPension,
        null, false, { ...stateExtrasForYear, federalAGI: refTotalIncomeForState, federalDeduction: refDeduction, rothConversionTaxable: 0 }
      );
      conversionTaxCost = Math.max(0, (ordinaryFedTaxes + baseCapGainsTaxes + baseStateIncomeTaxes) - (refOrdinaryFedTaxes + refCapGainsTaxes + refStateTaxes));
    }

    // IRMAA MAGI is AGI plus tax-exempt interest (SSA POMS HI 01101.010),
    // and AGI carries only the TAXABLE part of Social Security -- so
    // taxableSS, not ssIncome (changelog 123, audit Q-4b; gross benefits
    // used to be counted, which for a couple on $40,000 of benefits with
    // little other income put ~$34,000 of phantom income into the tier
    // test). This pre-solver figure is an ESTIMATE: it omits the
    // discretionary Pre-Tax draw, realized gains on the Taxable draw and
    // taxable Roth earnings, none of which exist until solveWithdrawals
    // has run. The settled figure (irmaaMagiFinal, below the solver) is
    // what goes into the lookback history, and any year priced off the
    // estimate (no history yet, or an SSA-44 appeal) is trued up there.
    // Same AGI logic as provisionalSalary above: an NQDC deferral is not in
    // AGI either, so it does not belong in the figure Medicare reads
    // (changelog 133 -- this line had netted 401(k) and HSA but not NQDC).
    const magiForIRMAA = Math.max(0, salary - preTaxContribution - hsaContribution - nqdcDeferral1 - nqdcDeferral2) + pension + taxableSS + rentalAnnuity + rmdTaxableAmount + convertAmountTaxable + taxableDividends + taxableInflowOrdinary + taxableAnnuityOrdinary + milestonePreTaxTaxable + nuaOrdinaryIncome + ordinaryDividends;
    // irmaaCost combines Medicare Part B (premium + IRMAA surcharge) and
    // Part D (national base premium + its own IRMAA surcharge) -- both
    // use the same MAGI/thresholds but grow independently via their own
    // Granular Inflation Assumption rates (medicarePartBInflationRate /
    // medicarePartDInflationRate), unlike the flat 2026 figures either
    // function returns on its own when no inflation factor is passed.
    // The MAGI thresholds themselves normally track taxBracketInflationFactor
    // (CMS does adjust them for inflation in reality) unless irmaaFreezeEnabled
    // is on, in which case they stay flat at their 2026 dollar levels --
    // see the irmaaFreezeEnabled comment in DEFAULT_INPUTS.
    const irmaaThresholdFactor = inputs.irmaaFreezeEnabled ? 1 : taxBracketInflationFactor;
    // The BBA-2018 top tier ($500,000 single / $750,000 joint) is frozen in
    // statute through 2027 and indexes only from 2028 -- see the
    // irmaaScaledThresholds comment. This is CURRENT LAW, not the
    // hypothetical irmaaFreezeEnabled stress test, so it applies either way:
    // with the stress test on, every tier is already flat and this changes
    // nothing; with it off, the lower four tiers index as CMS really does
    // index them while the top one correctly stays put until 2028.
    const irmaaTopFactor = inputs.irmaaFreezeEnabled
      ? 1
      : irmaaTopTierFactor(year, taxBracketInflationFactor, startYear);
    // Two-year lookback (changelog 121; SSA "Medicare Premiums: Rules for
    // Higher-Income Beneficiaries"): this year's tier comes from the MAGI
    // and filing status of the return filed two years ago, priced against
    // THIS year's (indexed) thresholds -- exactly how 2024 income meets the
    // 2026 table. The first two projection years have no history and use
    // their own MAGI. irmaaBasisSource tells the ledger which applied:
    // 'lookback', 'current' (no history yet) or 'appeal' (SSA-44 used).
    // Married filing separately is two returns, and each spouse's premium is
    // set by the MAGI on their OWN return, not the household's: each spouse
    // on Medicare is priced on their share of the income (the same
    // mfsIncomeSplitPct split the tax uses) and the two premiums are added.
    // Pricing both on the combined MAGI charged a $75,000-each couple the
    // top-but-one MFS tier twice. A one-person MFS plan (no Spouse 2) is
    // the whole income on one return, as before.
    const irmaaShare1 = effectiveMfsSplitPct(inputs) / 100;
    const onMedicare1 = !partBDroppedAbroad && spouse1Alive && age1 >= 65 && !medicareDeferred1;
    const onMedicare2 = !partBDroppedAbroad && spouse2Alive && age2 >= 65 && !medicareDeferred2;
    const priceIrmaaReturn = (magi, status, members) => ({
      partB: calculateIRMAA(magi, status, members, partBInflFactor, irmaaThresholdFactor, inputs.mfsLivedWithSpouse, irmaaTopFactor),
      partD: calculateMedicarePartD(magi, status, members, partDInflFactor, irmaaThresholdFactor, inputs.mfsLivedWithSpouse, irmaaTopFactor),
    });
    const priceIrmaa = (magi, status) => {
      if (status !== 'MFS' || !inputs.spouse2Enabled) return priceIrmaaReturn(magi, status, medicareMembers);
      const p1 = priceIrmaaReturn(magi * irmaaShare1, status, onMedicare1 ? 1 : 0);
      const p2 = priceIrmaaReturn(magi * (1 - irmaaShare1), status, onMedicare2 ? 1 : 0);
      return { partB: p1.partB + p2.partB, partD: p1.partD + p2.partD };
    };
    // A seeded pre-plan year the user did not supply is treated as absent,
    // not as a $0 return -- otherwise a blank box would quietly buy someone
    // the standard premium.
    const rawLookbackRow = irmaaMagiHistory.length >= 2 ? irmaaMagiHistory[irmaaMagiHistory.length - 2] : null;
    const lookbackRow = (rawLookbackRow && rawLookbackRow.unknown) ? null : rawLookbackRow;
    let irmaaBasisMagi = magiForIRMAA;
    let irmaaBasisSource = 'current';
    // What filing Form SSA-44 would be worth this year, in premium dollars.
    let irmaaAppealSavings = 0;
    let irmaaPriced = priceIrmaa(magiForIRMAA, currentStatus);
    if (lookbackRow) {
      irmaaBasisMagi = lookbackRow.magi;
      irmaaBasisSource = 'lookback';
      irmaaPriced = priceIrmaa(lookbackRow.magi, lookbackRow.status);
      // Form SSA-44: after a life-changing event (a spouse stopped working,
      // or died) the beneficiary may ask SSA to substitute the current
      // year's estimated MAGI for the lookback year's. The form covers the
      // event year and the year after it, so the last premium year whose
      // lookback predates post-event income is event + 2. Charged only when
      // it helps, which is the only case anyone files.
      // The saving is worked out whether or not the toggle is on, because
      // a plan that has NOT assumed the appeal is exactly the one that needs
      // telling the form exists (changelog 130). Zero unless there is an
      // open window, somebody is actually on Medicare, and the lookback
      // year genuinely prices higher than the current one.
      if (lastIrmaaLifeChangeYear !== null && year <= lastIrmaaLifeChangeYear + 2 && medicareMembers > 0) {
        const appealPriced = priceIrmaa(magiForIRMAA, currentStatus);
        const lookbackTotal = irmaaPriced.partB + irmaaPriced.partD;
        const appealTotal = appealPriced.partB + appealPriced.partD;
        if (appealTotal < lookbackTotal) {
          irmaaAppealSavings = lookbackTotal - appealTotal;
          if (inputs.irmaaLifeChangeAppealEnabled) {
            irmaaBasisMagi = magiForIRMAA;
            irmaaBasisSource = 'appeal';
            irmaaPriced = appealPriced;
          }
        }
      }
    }
    let partBCost = irmaaPriced.partB;
    let partDCost = irmaaPriced.partD;
    const irmaaCost = partBCost + partDCost; // charged before the solver; see irmaaTrueUp
    // Part B late-enrollment penalty: 10% of the STANDARD premium for every
    // full year a spouse went without Part B while abroad, for life, once
    // they are covered again (changelog 196). Foreign coverage does not stop
    // the clock. (Part D has its own penalty; not modeled.)
    const partBPenaltyYears = (medicareMembers > 0 && spouse1Alive && age1 >= 65 ? partBGapYears1 : 0)
      + (medicareMembers > 0 && spouse2Alive && age2 >= 65 ? partBGapYears2 : 0);
    const medicarePenalty = partBPenaltyYears > 0
      ? partBPenaltyYears * 0.10 * IRMAA_STANDARD_PREMIUM * partBInflFactor * 12
      : 0;
    let irmaaTrueUp = 0;

    // Current Household Spending -- the pre-retirement counterpart to
    // lifestyleCost. lifestyleCost is the retirement TARGET (also drives
    // fiTargetExpenses/fiNumber/coastFireNumber below, so it must stay
    // anchored to that target regardless of employment status and is never
    // touched here). Before this existed, pre-retirement years used
    // lifestyleCost -- the retirement target -- as a stand-in for actual
    // current spending. Whenever that target exceeded real take-home pay,
    // the deficit-reduction block below would eventually still fall short
    // and quietly draw down retirement accounts while still working, which
    // never happens in real life (people cut spending or savings first).
    // 'auto' instead derives current spending as a residual of real
    // take-home pay (income minus taxes minus savings); 'custom' lets the
    // user enter their actual known budget. Only applies pre-retirement --
    // retired years still use lifestyleCost exactly as before.
    //
    // Mortgage and other debt payments are paid OUT OF this residual, not
    // on top of it. The residual is everything left of the paycheck after
    // tax and savings, so the payment is one of the things it buys. The
    // figure itself is left whole here (it is the "what you have left to
    // spend today" number the Plan page shows and the bridge starts from,
    // and the bridge subtracts the mortgage from it); the debt share is
    // taken out of the everyday-spending cost a few lines below, because
    // totalDebtPayment is charged on its own line in expensesExcludingTaxes.
    //
    // History: a first version subtracted the payment inside the residual,
    // which is the same arithmetic, and was reverted because a mortgage then
    // "had zero effect" on a working year. That is the right answer in auto
    // mode -- the household earns and saves the same either way -- but the
    // revert charged the payment a second time, so every working year ran a
    // deficit the size of the payment and the deficit block cut the 401(k)
    // contributions (and the employer match with them) to cover it. A plan
    // with a mortgage saved nothing until the loan was gone. A payment that
    // continues into retirement still costs real money there: it is added
    // to the retirement target until payoff, as before.
    //
    // harvestTaxSavings is subtracted here on top of baseTaxes so a
    // tax-loss-harvesting-driven tax cut doesn't silently inflate this
    // residual (and therefore this year's spending) by the exact amount it
    // saved -- without this, harvesting would show a lower totalTaxesPaid
    // but leave endingBalance completely unchanged, since every dollar of
    // tax savings would just become extra lifestyle spending instead of
    // extra wealth. baseTaxes itself (used for actual cash flow just below
    // and in totalTaxesPaid) is untouched -- only this spending residual is
    // adjusted, so the saved tax dollars still exist and flow to the
    // portfolio as ordinary surplus, the same way they would post-retirement.
    //
    // concentratedStockVestedInTotal is subtracted for the same reason:
    // vest value held as employer shares (vest routing) is inside `salary`
    // but was never take-home CASH -- the shares went straight into the
    // concentrated position. Without this, 'auto' would derive that value
    // as extra spending, and the +vestedIn added to cashNeeded below would
    // then force the deficit-reduction block to claw the same dollars back
    // out of savings/spending, polluting the savingsDeficit/
    // lifestyleDeficit warnings with a "deficit" that's really deliberate
    // share retention. With this subtraction the two entries cancel exactly
    // and auto mode stays a true residual of spendable cash.
    let currentSpendingCost = lifestyleCost;
    if (!isRetired) {
      if (inputs.currentSpendingMode === 'custom') {
        currentSpendingCost = Math.max(0, (inputs.currentHouseholdSpendingCustom || 0) * inflFactor * survivorExpenseMultiplier);
      } else {
        // Planned savings (E13): an up-front savings cut must not read as
        // extra take-home to spend, or each pass would cut again.
        currentSpendingCost = Math.max(0, salary + fixedInflows - baseTaxes - harvestTaxSavings - (totalContributions + preCutSavings) - concentratedStockVestedInTotal);
      }
    }
    // The residual, kept as its own reportable object (changelog 134). This
    // arithmetic has run on every pre-retirement year since auto mode
    // existed, but only ever as an internal input -- it was never surfaced
    // as a figure, so a user in auto mode saw no number at all for what
    // they spend today. It answers "how much do I actually need a month?"
    // WITHOUT enumerating categories, which is why it cannot miss one the
    // way a bottom-up budget can.
    //
    // `derived` is the figure BEFORE the deficit-reduction block below can
    // trim it (reduceLifestyle), because the trim is a consequence of the
    // plan not balancing, not a statement about what the household spends.
    // `trimmedByDeficit` reports that separately so a reader can see both.
    // Retired years get null: there is no residual then, only the target.
    const currentSpendingDerived = isRetired ? null : currentSpendingCost;
    // The debt share of the residual (see the note above). Auto mode only:
    // a custom figure is charged as typed, with debt payments beside it.
    // Capped at the residual, so a payment larger than what is left still
    // shows up as a deficit instead of as negative spending.
    let currentSpendingDebtShare = 0;
    if (!isRetired && inputs.currentSpendingMode !== 'custom') {
      currentSpendingDebtShare = Math.min(totalDebtPayment, currentSpendingCost);
      currentSpendingCost -= currentSpendingDebtShare;
    }

    // Gifting is a real cash outflow in the year it happens, funded by the
    // same withdrawal strategy as everything else -- so a gifting plan the
    // portfolio can't actually support shows up as a shortfall rather than
    // quietly succeeding. No tax effect either way: gifts aren't deductible
    // to the giver and aren't income to the recipient.
    const giftThisYear = giftingForAge(inputs, age1);

    // The premium tax credit, applied provisionally against the bridge
    // cost. Eligibility and size depend on the year's ACA MAGI, which is
    // only settled after the withdrawal solver, so this is an estimate
    // from the income known now -- pensions, Social Security, dividends,
    // RMDs, the conversion just chosen -- and the settled year reconciles
    // it below (acaSubsidyClawback / acaSubsidyRefund), as Form 8962 does.
    // 'manual' is the figure the user typed, repaid in full over the cliff,
    // exactly as before changelog 415.
    const acaCreditFormula = inputs.acaCreditSource !== 'manual';
    const acaPremiumPaid = healthcareBridge * bridgePremiumShare;
    if (onMarketplace && !acaCreditFormula && inputs.acaSubsidyAnnualValue > 0) {
      acaSubsidyApplied = Math.min(healthcareBridge, inputs.acaSubsidyAnnualValue * medicalInflFactor);
      healthcareBridge -= acaSubsidyApplied;
    } else if (onMarketplace && acaCreditFormula && acaPremiumPaid > 0) {
      const coveredAges = [];
      if (spouse1Alive && age1 < 65) coveredAges.push(age1);
      if (spouse2Alive && age2 < 65) coveredAges.push(age2);
      acaBenchmarkPremium = inputs.acaBenchmarkPremiumSource === 'manual' && Number(inputs.acaBenchmarkPremiumAnnual) > 0
        ? Number(inputs.acaBenchmarkPremiumAnnual) * medicalInflFactor
        : acaBenchmarkPremiumAnnual(residence.stateOfResidence, coveredAges, medicalInflFactor);
      // What the household would tell the marketplace: last year's settled
      // MAGI if it was on the marketplace then (the usual projection), or
      // this year's known income if higher -- a conversion chosen this year
      // is a plan, not a surprise.
      // Changelog 443: the default bridge cost ($12,000 a person, 70% of it
      // premium) is not age-rated while the benchmark is, so for a couple
      // of 60 the premium typed sits at half the benchmark and the credit
      // covers all of it -- a plan that never checked the figure gets a
      // free premium and a $17k-$25k cliff. Say so, once.
      if (!acaPremiumWarned && acaBenchmarkPremium > 0 && acaPremiumPaid < acaBenchmarkPremium * 0.75) {
        acaPremiumWarned = true;
        planWarnings.push({
          code: 'aca-premium-below-benchmark',
          message: `The marketplace premium in ${year} (${Math.round(acaPremiumPaid).toLocaleString('en-US')}) is well under the benchmark plan for the household's ages and state (${Math.round(acaBenchmarkPremium).toLocaleString('en-US')}), so the computed credit covers all of it; check the Healthcare Bridge cost against a real quote.`,
          premium: Math.round(acaPremiumPaid),
          benchmark: Math.round(acaBenchmarkPremium),
          year,
        });
      }
      const magiEstimate = Math.max(prevAcaMagi ?? 0, otherOrdinaryAgi + ssIncome + taxableDividends + convertAmountTaxable);
      const fplForCredit = getFederalPovertyLevel(currentStatus === 'MFJ' ? 2 : 1, year, inputs.taxBracketInflationRate);
      const est = acaPremiumTaxCredit({ benchmark: acaBenchmarkPremium, magi: magiEstimate, fpl: fplForCredit, premiumPaid: acaPremiumPaid });
      acaSubsidyApplied = est.credit;
      acaApplicablePct = est.applicablePct;
      healthcareBridge -= acaSubsidyApplied;
    }

    let expensesExcludingTaxes = (isRetired ? lifestyleCost : currentSpendingCost) + goGoBump + healthcareBridge + ltcCost + irmaaCost + milestoneOutflowGeneral + totalDebtPayment + giftThisYear.gifted;
    // Health cover abroad and any Part B late-enrollment penalty (both zero
    // unless a move abroad is planned).
    if (foreignHealthcare + medicarePenalty > 0) expensesExcludingTaxes += foreignHealthcare + medicarePenalty;

    // HSA tax-free qualified medical withdrawal. This is the whole point of
    // an HSA over a regular Pre-Tax account: money spent on qualifying
    // medical costs (modeled here as healthcareBridge + ltcCost + irmaaCost)
    // is never taxed, on the way in OR the way out. Draw it first, tax-free,
    // reducing what actually has to come out of taxable income sources
    // below — must happen here (before cashNeeded is solved) rather than as
    // a withdrawal-strategy option, since it isn't a taxable draw at all.
    // Only the part of the pre-65 healthcare cost that is NOT insurance
    // premiums is HSA-qualified (audit Q-8, changelog 126; IRS Pub. 969) --
    // unless the premiums are COBRA or paid while on unemployment, which the
    // hsaPreMedicarePremiumsQualified toggle covers. Long-term care services
    // and Medicare Part B/D premiums at 65+ are qualified either way, which
    // is why ltcCost and irmaaCost are counted in full.
    const bridgeHsaEligible = inputs.hsaPreMedicarePremiumsQualified
      ? healthcareBridge
      : healthcareBridge * (1 - bridgePremiumShare);
    const qualifiedMedicalCosts = bridgeHsaEligible + ltcCost + irmaaCost;
    const hsaMedicalDraw = Math.min(hsa, qualifiedMedicalCosts);
    hsa -= hsaMedicalDraw;
    expensesExcludingTaxes -= hsaMedicalDraw;
    // Changelog 417: the year's deductible medical costs -- the bridge net
    // of its ACA credit, long-term care, Part B and D premiums with IRMAA --
    // less what the HSA paid tax-free, which cannot be deducted twice.
    itemizedMedicalCosts = Math.max(0, healthcareBridge + ltcCost + irmaaCost - hsaMedicalDraw);
    // Changelog 434: the base federal and state tax above were priced with
    // the medical line as it stood before the ACA credit, the Medicare
    // premiums and the HSA draw were known. The solver and every later
    // re-pricing read the final line, and each adds its own increase to the
    // base -- so the base must be priced on the same line, or the year's
    // tax is off by the whole shift (an HSA that paid the bridge tax-free
    // left the year under-taxed by 70%; an ACA credit by half). Re-price
    // the base deduction, ordinary tax, gains tax, AMT and state tax with
    // the final line and carry the difference. Nothing else in the base
    // block depends on the medical line (the harvest and concentrated-stock
    // diagnostics are differences that cancel it; a year abroad keeps its
    // pre-credit baseline, a small simplification).
    if (itemizing && Math.abs(itemizedMedicalCosts - medicalLineAtBasePricing) > 0.005) {
      const magiForBase = baseOrdinaryTaxableIncome + taxableDividends;
      const deduction2 = deductionFor(magiForBase);
      const taxable2 = Math.max(0, baseOrdinaryTaxableIncome - deduction2);
      const ordinary2 = calculateTaxes(taxable2, currentStatus, taxBracketInflationFactor, inputs.tcjaSunsetEnabled, mfsSplitFor(baseOrdinaryTaxableIncome));
      const capGains2 = calculateCapitalGainsTaxes(taxable2, taxableDividends, currentStatus, taxBracketInflationFactor, deduction2, Math.max(0, deduction2 - baseOrdinaryTaxableIncome), niiOtherForYear, mfsSplitFor(baseOrdinaryTaxableIncome));
      const choice2 = deductionChoice(magiForBase);
      const amtAllowed2 = choice2.itemized ? Math.max(0, choice2.amount - itemizedFor(magiForBase).salt) : 0;
      const amt2 = Math.max(0, calculateAMT(Math.max(0, baseOrdinaryTaxableIncome - amtAllowed2), currentStatus, taxBracketInflationFactor, effectiveMfsSplitPct(inputs)) - ordinary2);
      const state2 = calculateStateTaxes(
        totalIncomeForState, pension, ssIncome, residence.stateTaxState,
        residence.stateTaxSocialSecurityTaxable, residence.stateTaxPensionTaxable,
        currentStatus, ownerAge, age2, residence.stateTaxFlatRate, militaryPension,
        { stateExempt: stateExemptPension, private1: privatePension1, private2: privatePension2, military1: military1Pension, military2: military2Pension },
        residence.yonkersResident, { ...stateExtrasForYear, federalAGI: totalIncomeForState, federalDeduction: deduction2 }
      );
      const federalShift = (ordinary2 + capGains2 + amt2) - (ordinaryFedTaxes + baseCapGainsTaxes + amtTax);
      const stateShift = state2 - baseStateIncomeTaxes;
      amtTax = amt2;
      baseFedTaxes += federalShift;
      baseStateTaxes += stateShift;
      baseTaxes += federalShift + stateShift;
    }

    let lifestyleDeficit = 0;
    // Savings already cut up front (E13) count toward the year's shortfall
    // in savings exactly as an in-year cut does.
    let savingsDeficit = preCutSavings;
    const cutThisPass = { preTax: 0, roth: 0, taxable: 0 };

    // We calculate operating cash needed (excluding milestoneOutflowGeneral since that's a one-off life event)
    // concentratedStockVestedIn: vest value held as employer shares is cash
    // the household never receives -- same effect on the year's cash
    // picture as an expense (see the vest-routing block above).
    let operatingCashNeeded = (expensesExcludingTaxes - milestoneOutflowGeneral) + baseTaxes - fixedInflows - rmdCashPortion - salary + totalContributions + concentratedStockVestedInTotal;

    if (!isRetired && operatingCashNeeded > 0) {
      let deficitToClear = operatingCashNeeded;
      
      const reduceSavings = () => {
        // Taxable First always
        if (taxableContribution > 0) {
          const red = Math.min(taxableContribution, deficitToClear, Math.max(0, taxable));
          taxableContribution -= red;
          taxable -= red; // Undo previous addition
          taxableBasis = Math.max(0, taxableBasis - red); // matches the taxableBasis += taxableContribution above
          deficitToClear -= red;
          savingsDeficit += red;
          cutThisPass.taxable += red;
        }
        // Then Roth/PreTax
        // Each cut is also capped at what is still in the account: a
        // deferral already converted or paid out this year cannot be taken
        // back out (E13). The next pass moves the cut ahead of all that.
        if (deficitToClear > 0 && rothContribution > 0) {
          // The whole wanted cut is logged, even the part the cap refused,
          // so the next pass cuts it up front.
          const wanted = Math.min(rothContribution, deficitToClear);
          const red = Math.min(wanted, Math.max(0, roth));
          cutThisPass.roth += wanted;
          rothContribution -= red;
          roth -= red;
          rothLayers.contrib = Math.max(0, rothLayers.contrib - red); // undo the layer credit above
          deficitToClear -= red;
          savingsDeficit += red;
        }
        if (deficitToClear > 0 && preTaxContribution > 0) {
          const wanted = Math.min(preTaxContribution, deficitToClear);
          const red = Math.min(wanted, Math.max(0, preTax));
          cutThisPass.preTax += wanted;
          preTaxContribution -= red;
          preTax -= red;
          deficitToClear -= red;
          savingsDeficit += red;
        }
      };

      const reduceLifestyle = () => {
        if (deficitToClear > 0) {
          // This block only runs pre-retirement, so it's always
          // currentSpendingCost being trimmed here, never lifestyleCost (the
          // retirement target) -- lifestyleCost stays untouched so
          // fiTargetExpenses/fiNumber/coastFireNumber below remain correct
          // regardless of what happens to current spending.
          const red = Math.min(currentSpendingCost, deficitToClear);
          currentSpendingCost -= red;
          expensesExcludingTaxes -= red;
          deficitToClear -= red;
          lifestyleDeficit += red;
        }
      };

      const strategy = inputs.deficitReductionStrategy || 'reduceTaxableFirst';
      
      if (strategy === 'reduceTaxableFirst') {
        reduceSavings();
        reduceLifestyle();
      } else if (strategy === 'reduceLifestyleFirst') {
        // Taxable is still first
        if (taxableContribution > 0) {
          const red = Math.min(taxableContribution, deficitToClear, Math.max(0, taxable));
          taxableContribution -= red;
          taxable -= red; // Undo previous addition
          taxableBasis = Math.max(0, taxableBasis - red); // matches the taxableBasis += taxableContribution above
          deficitToClear -= red;
          savingsDeficit += red;
          cutThisPass.taxable += red;
        }
        reduceLifestyle();
        reduceSavings();
      } else if (strategy === 'reduceLifestyleAbsoluteFirst') {
        reduceLifestyle();
        reduceSavings();
      }
      // Only a cut that changes the match or the tax needs another pass; a
      // Taxable-only cut is exact as it stands. Carried along with them so
      // the next pass keeps the strategy's order.
      if (cutLog && (cutThisPass.preTax > 0.005 || cutThisPass.roth > 0.005)) cutLog.set(year, cutThisPass);
    }

    // Re-evaluate cash needed now that we've potentially slashed expenses and contributions.
    // Note: a pre-retirement cash deficit only slashes preTax/roth/taxable
    // contributions above (reduceSavings()), never hsaContribution — HSA
    // dollars are modeled as protected/prioritized savings, consistent with
    // how real households tend to treat HSA funding relative to a fully
    // discretionary taxable brokerage contribution.
    const adjustedTotalContributions = preTaxContribution + rothContribution + taxableContribution + hsaContribution + backdoorRothContribution + nqdcDeferral1 + nqdcDeferral2;
    let cashNeeded = expensesExcludingTaxes + baseTaxes - fixedInflows - rmdCashPortion - salary + adjustedTotalContributions + concentratedStockVestedInTotal;

    // Dividends taken as cash (changelog 231). They arrive whether or not
    // anyone acts, so they meet the year's need BEFORE the cash reserve is
    // touched and before anything is sold -- which is the whole point of
    // taking them: a dollar of dividend is a dollar not sold.
    //
    // 'asNeeded' never takes more than the year needs, so it cannot create
    // a surplus; 'cash' can, and that surplus falls through to the same
    // path as any other unspent money, back into Taxable as fresh basis.
    let dividendCash = 0;
    if (isRetired && inputs.dividendPayoutMode !== 'reinvest') {
      dividendCash = inputs.dividendPayoutMode === 'cash'
        ? taxableDividendsFromYield
        : Math.max(0, Math.min(taxableDividendsFromYield, cashNeeded));
      cashNeeded -= dividendCash;
      // The money leaves the account HERE, at the point it is taken, for
      // the same reason the year's other cash movements happen here: it
      // has to be gone before the withdrawal solver decides what else to
      // sell, and any part of it left unspent comes back through the same
      // surplus path as any other unspent money, a few lines below. Taking
      // it out after the year's growth instead would let a dividend that
      // was never spent earn the year's return twice -- once inside the
      // bucket and once again on the way back in.
      taxable = Math.max(0, taxable - dividendCash);
    }

    // E25 (2026-09-30 review): this year's concentrated-stock sale proceeds
    // are cash the household has this year, so they meet this year's need
    // before the reserve is touched or anything else is sold. Only the part
    // spent is taken here; the rest still settles into Taxable after growth
    // (phase B below), so it is never compounded twice.
    const csProceedsTotal = csYear[0].netProceeds + csYear[1].netProceeds;
    const csProceedsSpent = Math.min(csProceedsTotal, Math.max(0, cashNeeded));
    cashNeeded -= csProceedsSpent;
    const csProceedsKeptShare = csProceedsTotal > 0 ? 1 - csProceedsSpent / csProceedsTotal : 1;

    // Cash Floor / Emergency Reserve -- only active in retirement (the
    // reserve exists to protect withdrawals from a down market, which isn't
    // a concern while still earning salary) and only when there's an actual
    // cash need this year to adjust. Grows the reserve at its own
    // (non-market) yield every year regardless, then either draws from it
    // first in a down-market year (shielding Taxable/Pre-Tax/Roth from
    // being sold at a loss) or tops it back off out of this year's
    // withdrawal once it's below target and the market isn't down.
    let cashReserveDraw = 0;
    let cashReserveReplenish = 0;
    let cashReservePreFund = 0;
    // Changelog 240: unspent money that fell through to Taxable this year --
    // a use of the year's money like any contribution, published so the
    // ledger's "Saved" column does not have to infer it.
    let surplusReinvested = 0;
    // Published for the readiness "paycheck" card (changelog 217) so no
    // surface has to rebuild the reserve's own target basis and drift from
    // it. Readouts only -- nothing below reads them back.
    let cashReserveTarget = 0;
    let cashReserveMonthlySpend = 0;
    if (inputs.cashFloorEnabled) {
      cashReserveBalance *= (1 + (inputs.cashFloorReturnRate || 0) / 100);
      // Same target basis whether working or retired: months of that year's
      // projected lifestyle+healthcare+LTC+IRMAA spend. goGoBump and
      // healthcareBridge are already $0 pre-retirement, so this figure
      // reads as "what retirement spending would cost in this year's
      // dollars" the whole way through -- meaning a pre-fund target set now
      // already lines up with the real target once isRetired flips true,
      // with no re-target jump at the transition.
      const targetMonthlySpend = (lifestyleCost + goGoBump + healthcareBridge + ltcCost + irmaaCost) / 12;
      const reserveTarget = Math.max(0, inputs.cashFloorTargetMonths || 0) * targetMonthlySpend;
      cashReserveMonthlySpend = targetMonthlySpend;
      cashReserveTarget = reserveTarget;
      if (isRetired && cashNeeded > 0) {
        if (lastYearReturnRate !== null && lastYearReturnRate < 0) {
          // After a down year: spend the reserve first, reducing what has to come
          // out of the market-invested accounts below.
          cashReserveDraw = Math.min(cashReserveBalance, cashNeeded);
          cashReserveBalance -= cashReserveDraw;
          cashNeeded -= cashReserveDraw;
        } else if (cashReserveBalance < reserveTarget) {
          // Up/flat year and under target: top the reserve back off,
          // funded by drawing that much extra this year -- a retiree
          // rebuilding their cash bucket after a recovery, same
          // discretionary decision as any other withdrawal-strategy choice
          // already modeled here.
          cashReserveReplenish = reserveTarget - cashReserveBalance;
          cashReserveBalance += cashReserveReplenish;
          cashNeeded += cashReserveReplenish;
        }
      } else if (!isRetired && inputs.cashFloorPreFundEnabled && cashNeeded < 0 && cashReserveBalance < reserveTarget) {
        // Working years, opted in: instead of letting this year's entire
        // leftover cash flow (income minus taxes, living expenses, and
        // planned contributions -- computed above as the negative of
        // cashNeeded) spill into Taxable Brokerage, route up to that much
        // of it into the reserve first, capped at what's left to reach
        // target. Whatever surplus remains (if the reserve hits target
        // before the surplus is used up) still falls through to Taxable
        // below, unchanged from the default behavior.
        const availableSurplus = -cashNeeded;
        cashReservePreFund = Math.min(availableSurplus, reserveTarget - cashReserveBalance);
        cashReserveBalance += cashReservePreFund;
        cashNeeded += cashReservePreFund;
      }
    }

    let drawPreTax = actualMilestonePreTax;
    let drawRoth = actualMilestoneRoth;
    let drawTaxable = actualMilestoneTaxable;
    let extraTax = 0;
    // The federal/state decomposition of extraTax (changelog 182). Tracked
    // alongside rather than derived afterwards, because extraTax collects
    // from three places with different characters: the withdrawal solver's
    // marginal tax (genuinely both federal and state, split by the solver),
    // and two ACA items that are purely federal.
    let extraTaxFederal = 0;
    let extraTaxState = 0;
    // The foreign layer's share of the draw's tax, net of credit (changelog
    // 196), and the solver's pricing of that draw.
    let extraTaxForeign = 0;
    let foreignSolved = null;
    let shortfall = 0;
    // Ordering-rule split of this year's discretionary Roth draw (for the
    // ledger and for the solver's tax pricing). Milestone Roth outflows
    // above have already consumed their layers.
    let rothDrawSplitThisYear = { contrib: 0, convFree: 0, convPenalized: 0, earnings: 0, taxableEarnings: 0, penalized: 0 };
    let lossUsedOnDraw = 0;
    const rothSplitFor = (amt) => splitRothDraw(amt, rothLayers, roth, year, ownerAge);

    if (cashNeeded > 0) {
      const solveResult = solveWithdrawals(
        preTax, roth, taxable, cashNeeded, baseOrdinaryTaxableIncome,
        deductionFor, currentStatus, taxBracketInflationFactor,
        inputs.withdrawalStrategy, residence.stateTaxState,
        residence.stateTaxSocialSecurityTaxable, residence.stateTaxPensionTaxable,
        pension, ssIncome, taxableDividends, inputs, ownerAge, age2, militaryPension,
        taxableBasisRatioForYear,
        { stateExempt: stateExemptPension, private1: privatePension1, private2: privatePension2, military1: military1Pension, military2: military2Pension },
        stateExtrasForYear,
        rothSplitFor,
        lossCarryforward,
        1 - preTaxBasisRatioForYear,
        // Let the solver re-test Social Security taxability against the draw
        // it is sizing (see the ssResettle block in getTax). provisionalOther
        // is this year's settled non-SS provisional income INCLUDING any Roth
        // conversion, which has already been priced in above; baseTaxableSS is
        // the matching taxableSS, so the solver adds only the delta its own
        // draw causes and never double-counts the conversion.
        { taxableSSFor, provisionalOther: provisionalOtherIncome + convertAmountTaxable, baseTaxableSS: taxableSS },
        abroad ? (d) => priceForeignYear(foreignCtx, d) : null,
        harvestedOrdinaryOffset
      );

      // Consume the carryforward the solver netted against this draw's gains.
      const solvedRealizedGains = Math.max(0, solveResult.dTaxable) * (1 - taxableBasisRatioForYear);
      lossUsedOnDraw = Math.min(lossCarryforward, solvedRealizedGains);
      lossCarryforward -= lossUsedOnDraw;
      // Mirror the solver's reclaim (changelog 404): loss that had been set
      // against ordinary income goes against the draw's gains instead, as
      // the solver priced it. The carryforward itself is unchanged -- that
      // loss had already left it.
      const reclaimed = Math.min(harvestedOrdinaryOffset, Math.max(0, solvedRealizedGains - lossUsedOnDraw));
      if (reclaimed > 0) {
        harvestedOrdinaryOffset -= reclaimed;
        lossUsedOnDraw += reclaimed;
        baseOrdinaryTaxableIncome += reclaimed;
      }

      drawPreTax += solveResult.dPreTax;
      drawRoth += solveResult.dRoth;
      drawTaxable += solveResult.dTaxable;
      extraTax = solveResult.taxIncrease;
      // Sums back to taxIncrease exactly; a test asserts it.
      extraTaxFederal += solveResult.taxIncreaseFederal || 0;
      extraTaxState += solveResult.taxIncreaseState || 0;
      extraTaxForeign += solveResult.taxIncreaseForeign || 0;
      foreignSolved = solveResult.foreignParts ? { final: solveResult.foreignParts, base: solveResult.foreignBaseParts } : null;
      shortfall = solveResult.shortfall;

      rothDrawSplitThisYear = rothSplitFor(solveResult.dRoth);
      consumeRothLayers(solveResult.dRoth, rothLayers);
      preTax = Math.max(0, preTax - solveResult.dPreTax);
      preTaxBasis = Math.max(0, preTaxBasis - solveResult.dPreTax * preTaxBasisRatioForYear);
      roth = Math.max(0, roth - solveResult.dRoth);
      taxable = Math.max(0, taxable - solveResult.dTaxable);
      taxableBasis = Math.max(0, taxableBasis - solveResult.dTaxable * taxableBasisRatioForYear);
    } else {
      const surplus = -cashNeeded;
      surplusReinvested = surplus;
      taxable += surplus;
      // Unspent surplus reinvested into Taxable is new principal, same as
      // any other contribution -- 100% basis.
      taxableBasis += surplus;
    }

    // ---- Tax charged after the solver (changelog 405) -------------------
    // Three things are paid for after solveWithdrawals has run and cannot
    // be grossed up by it: the tax on the ACA boost conversion, the ACA
    // subsidy clawback, and the IRMAA true-up. The draws that fund them
    // are themselves income -- a Pre-Tax dollar is taxable, a Taxable
    // dollar realizes gain, a Roth dollar may be earnings or a young
    // conversion -- so they are priced here, stacked on the settled year,
    // and the tax on that tax is funded the same way, pass after pass until
    // what is left is under half a dollar (each pass shrinks it by the
    // marginal rate, so a handful suffice; three left a few dollars that
    // the Readiness headline then showed as "other"). Roth draws keep the layer accounting the solver's
    // draw gets (rothDrawSplitThisYear), so a pre-59 1/2 draw of earnings
    // is taxed and penalized like any other.
    const taxableSSPreSolver = taxableSS;
    // The year's income as it stands now, from the draws taken so far.
    const settledIncomeNow = () => {
      const preTaxOrdinary = Math.max(0, drawPreTax - actualMilestonePreTax) * (1 - preTaxBasisRatioForYear);
      const gainsNet = Math.max(0, Math.max(0, drawTaxable - actualMilestoneTaxable) * (1 - taxableBasisRatioForYear) - lossUsedOnDraw);
      const rothEarnings = rothDrawSplitThisYear.taxableEarnings || 0;
      const ss = taxableSSFor(provisionalOtherIncome + convertAmountTaxable + preTaxOrdinary + rothEarnings + gainsNet);
      return {
        ordinary: baseOrdinaryTaxableIncome - taxableSSPreSolver + ss + preTaxOrdinary + rothEarnings,
        capGains: taxableDividends + gainsNet,
        preTaxOrdinary, gainsNet,
      };
    };
    // Federal and state tax on a year with this ordinary income and these
    // gains, stacked the way the solver stacks them.
    const priceSettledYear = ({ ordinary, capGains, preTaxOrdinary, gainsNet }, conversionTaxableForState = convertAmountTaxable) => {
      const ded = deductionFor(ordinary + capGains);
      const ordinaryTaxable = Math.max(0, ordinary - ded);
      const federal = calculateTaxes(ordinaryTaxable, currentStatus, taxBracketInflationFactor, inputs.tcjaSunsetEnabled, mfsSplitFor(ordinary))
        + calculateCapitalGainsTaxes(ordinaryTaxable, capGains, currentStatus, taxBracketInflationFactor, ded, Math.max(0, ded - ordinary), niiOtherForYear, mfsSplitFor(ordinary));
      const incomeForState = ordinary + capGains;
      const state = calculateStateTaxes(
        incomeForState, pension, ssIncome, residence.stateTaxState,
        residence.stateTaxSocialSecurityTaxable, residence.stateTaxPensionTaxable,
        currentStatus, ownerAge, age2, residence.stateTaxFlatRate, militaryPension,
        { stateExempt: stateExemptPension, private1: privatePension1, private2: privatePension2, military1: military1Pension, military2: military2Pension },
        residence.yonkersResident, {
          ...stateExtrasForYear,
          federalAGI: incomeForState,
          federalDeduction: ded,
          retirementDistributions: (stateExtrasForYear.retirementDistributions || 0) + Math.max(0, preTaxOrdinary),
          rothConversionTaxable: conversionTaxableForState,
          longTermGains: (stateExtrasForYear.longTermGains || 0) + gainsNet,
        }
      );
      return { federal, state };
    };
    // Draws `amount` in `order` (bucket names), charges the tax those draws
    // cause to extraTax/extraTaxFederal/extraTaxState, funds that tax too,
    // and adds anything the accounts cannot cover to the shortfall.
    const fundAfterSolver = (amount, order) => {
      let remaining = Math.max(0, amount || 0);
      for (let pass = 0; pass < 12 && remaining > 0.5; pass++) {
        const before = settledIncomeNow();
        const taxBefore = priceSettledYear(before);
        let toFund = remaining;
        let preTaxTaken = 0;
        let rothPenalized = 0;
        for (const bucket of order) {
          if (toFund <= 0) break;
          if (bucket === 'taxable') {
            const take = Math.min(taxable, toFund);
            if (take > 0) {
              taxable -= take;
              taxableBasis = Math.max(0, taxableBasis - take * taxableBasisRatioForYear);
              drawTaxable += take;
              toFund -= take;
              // Any loss carryforward left nets this gain too.
              const gain = take * (1 - taxableBasisRatioForYear);
              const used = Math.min(lossCarryforward, gain);
              lossCarryforward -= used;
              lossUsedOnDraw += used;
            }
          } else if (bucket === 'preTax') {
            const take = Math.min(preTax, toFund);
            if (take > 0) {
              preTax -= take;
              preTaxBasis = Math.max(0, preTaxBasis - take * preTaxBasisRatioForYear);
              drawPreTax += take;
              preTaxTaken += take;
              toFund -= take;
            }
          } else {
            const take = Math.min(roth, toFund);
            if (take > 0) {
              const split = rothSplitFor(take);
              roth -= take;
              consumeRothLayers(take, rothLayers);
              drawRoth += take;
              for (const k of Object.keys(split)) rothDrawSplitThisYear[k] = (rothDrawSplitThisYear[k] || 0) + split[k];
              rothPenalized += split.penalized || 0;
              toFund -= take;
            }
          }
        }
        const drawn = remaining - toFund;
        if (toFund > 0) shortfall += toFund;
        if (drawn <= 0.005) break;
        const after = settledIncomeNow();
        const taxAfter = priceSettledYear(after);
        // The 10% federal penalty and any state additional tax on a
        // pre-59 1/2 Pre-Tax or penalized Roth draw, as the solver charges.
        const earlyDistribution = ownerAge < 59.5 ? preTaxTaken * (1 - preTaxBasisRatioForYear) + rothPenalized : 0;
        const federal = Math.max(0, taxAfter.federal - taxBefore.federal) + earlyDistribution * 0.10;
        const state = Math.max(0, taxAfter.state - taxBefore.state) + (earlyDistribution > 0 ? stateEarlyDistributionTax(residence.stateTaxState, earlyDistribution, ownerAge) : 0);
        extraTax += federal + state;
        extraTaxFederal += federal;
        extraTaxState += state;
        remaining = federal + state;
      }
    };

    // Changelog 423: trim the max-bracket conversion to the income the
    // solver's own draws added. The fill was sized before the withdrawal
    // solver ran, against the income known then; a plan that then funds
    // its spending from Pre-Tax (Pre-Tax First, Pro-Rata, or an exhausted
    // Taxable account) stacks that draw on top of a conversion that had
    // already filled the bracket, and the year overshoots the target by
    // the whole draw -- the household converted dollars it then had to
    // take out again at the next bracket's rate. The remedy a planner
    // applies is to convert less: here the surplus is unconverted (Pre-Tax
    // back up, Roth back down, this year's conversion layer and the
    // Form 8606 basis reversed), the tax it no longer owes is repriced on
    // the settled year and returned to the Pre-Tax account that funded it,
    // and the loop repeats until the year's ordinary taxable income sits
    // on the ceiling to the dollar. Only ever a trim: a conversion the ACA
    // cliff or IRMAA cap had already held below the bracket is never
    // enlarged, because re-conversion is limited to what this loop took
    // off. A fill that the draws did not push over the line is untouched.
    let conversionTrimmedForDraw = 0;
    if (maxBracketFill && convertAmount > 0 && cashNeeded > 0) {
      const taxableShare = 1 - preTaxBasisRatioForYear;
      const ordinaryTaxableNow = () => {
        const now = settledIncomeNow();
        return maxBracketFill.taxableIncomeFor(now.ordinary, now.capGains);
      };
      let unconverted = 0;
      for (let pass = 0; pass < 24; pass++) {
        const over = ordinaryTaxableNow() - maxBracketFill.ceiling;
        if (Math.abs(over) < 0.5) break;
        // Positive: unconvert. Negative: re-convert, but never beyond what
        // this loop itself took off.
        const step = over > 0
          ? Math.min(convertAmount, over / taxableShare)
          : -Math.min(unconverted, -over / taxableShare);
        if (Math.abs(step) < 0.005) break;
        const stepTaxable = step * taxableShare;
        const before = priceSettledYear(settledIncomeNow(), convertAmountTaxable);
        convertAmount -= step;
        preTax += step;
        roth = Math.max(0, roth - step);
        preTaxBasis = Math.max(0, preTaxBasis + (step - stepTaxable));
        convertAmountTaxable -= stepTaxable;
        baseOrdinaryTaxableIncome -= stepTaxable;
        unconverted += step;
        const layer = rothLayers.conversions.find((l) => l.year === year);
        if (layer) {
          layer.taxable = Math.max(0, layer.taxable - stepTaxable);
          layer.nontaxable = Math.max(0, layer.nontaxable - (step - stepTaxable));
          if (layer.taxable + layer.nontaxable <= 0.005) rothLayers.conversions.splice(rothLayers.conversions.indexOf(layer), 1);
        }
        let after = priceSettledYear(settledIncomeNow(), convertAmountTaxable);
        if (after.federal + after.state < before.federal + before.state - 0.005) {
          // Tax the year no longer owes: the solver's Pre-Tax draw had
          // grossed it up, so it goes back where it came from (as surplus
          // into Taxable before 59 1/2, when the draw carried a penalty the
          // solver has already charged). Returning it lowers the draw, and
          // a lower draw is less income, so the year owes less again; the
          // inner loop returns that too, until the saving is spent, and
          // only then is the pass priced. Until changelog 435 the pass was
          // priced before the draw came back, so the tax the smaller draw
          // saved was never taken off the year, and the next pass -- now
          // under the ceiling -- re-converted and charged that tax a second
          // time: the year sat on the ceiling to the dollar and paid 40%
          // more federal tax than the ceiling owes.
          let returned = 0;
          for (let k = 0; k < 8; k++) {
            const cash = (before.federal + before.state) - (after.federal + after.state) - returned;
            if (cash <= 0.005) break;
            const back = ownerAge >= 59.5 ? Math.min(cash, Math.max(0, drawPreTax - actualMilestonePreTax)) : 0;
            if (back > 0) {
              preTax += back;
              drawPreTax -= back;
              preTaxBasis += back * preTaxBasisRatioForYear;
            }
            if (cash - back > 0.005) {
              taxable += cash - back;
              taxableBasis += cash - back;
            }
            returned += cash;
            if (back <= 0.005) break;
            after = priceSettledYear(settledIncomeNow(), convertAmountTaxable);
          }
        }
        const dFederal = after.federal - before.federal;
        const dState = after.state - before.state;
        extraTax += dFederal + dState;
        extraTaxFederal += dFederal;
        extraTaxState += dState;
        conversionTaxCost = Math.max(0, conversionTaxCost + dFederal + dState);
        if (dFederal + dState > 0.005) {
          // Re-conversion owes tax: funded from Pre-Tax, as the draw was.
          fundAfterSolver(dFederal + dState, ['preTax', 'taxable', 'roth']);
        }
      }
      conversionTrimmedForDraw = Math.max(0, unconverted);
    }

    // ACA Subsidy Protection / Medicaid non-expansion "coverage gap". In the
    // nine states with a coverage gap (ACA_NON_EXPANSION_STATES),
    // adults below 100% of the Federal Poverty Level qualify for neither
    // the state's non-expanded Medicaid nor ACA marketplace subsidies
    // (which require >=100% FPL) -- leaving no affordable coverage option.
    // Early retirees with low taxable income before Medicare eligibility
    // (65) are exactly the population who can land in this gap.
    //
    // Evaluated here, after the withdrawal solver, against the household's
    // actual ACA MAGI for the year: ordinary income INCLUDING this year's
    // discretionary Pre-Tax draw, plus dividends, realized gains from the
    // Taxable draw, and the untaxed portion of Social Security (ACA MAGI
    // counts all of it). If that still lands below the (inflation-indexed)
    // FPL floor and the user enabled ACA Subsidy Protection, force an
    // additional Roth conversion -- same preTax->roth mechanism and
    // pro-rata basis treatment as convertAmount above -- sized to just
    // clear the floor. Its tax is priced marginally on top of the solved
    // year (fed ordinary + cap-gains stacking + state; no early-withdrawal
    // penalty, conversions are exempt) and paid from Taxable, then Roth,
    // then Pre-Tax, since the solver has already run and can't gross it
    // up. Tax-exempt interest isn't modeled, so MAGI here is AGI + the
    // non-taxable SS slice.
    // Settle the year's ACA MAGI for every marketplace year (the 400% cliff
    // applies in every state); the non-expansion coverage-gap branch below
    // additionally needs the 100% floor.
    if (onMarketplace) {
      const householdSize = currentStatus === 'MFJ' ? 2 : 1;
      // Read from the settled draws, so the boost below (a forced
      // conversion, plus whatever paying its tax draws from Pre-Tax or
      // Taxable) can re-settle the figure after it runs (changelog 436).
      const settleAcaMagi = () => {
        const discretionaryPreTaxDraw = (drawPreTax - actualMilestonePreTax) * (1 - preTaxBasisRatioForYear);
        const discretionaryTaxableDraw = drawTaxable - actualMilestoneTaxable;
        const realizedGainsThisYear = Math.max(0, Math.max(0, discretionaryTaxableDraw) * (1 - taxableBasisRatioForYear) - lossUsedOnDraw);
        const ordinaryIncomeForAca = baseOrdinaryTaxableIncome + Math.max(0, discretionaryPreTaxDraw);
        return ordinaryIncomeForAca + taxableDividends + realizedGainsThisYear + Math.max(0, ssIncome - taxableSS);
      };
      acaMagi = settleAcaMagi();
      acaCliffBreached = acaMagi > acaCliffThreshold + 0.005;
      if (ACA_NON_EXPANSION_STATES.has(residence.stateOfResidence)) {
        const fplFloor = getFederalPovertyLevel(householdSize, year, inputs.taxBracketInflationRate);
        const gapAmount = fplFloor - acaMagi;
        if (gapAmount > 0) {
          if (inputs.acaSubsidyProtectionEnabled && preTax > 0) {
            acaSubsidyBoost = Math.min(preTax, gapAmount);
            preTax = Math.max(0, preTax - acaSubsidyBoost);
            roth += acaSubsidyBoost;
            convertAmount += acaSubsidyBoost;
            const acaSubsidyBoostTaxable = acaSubsidyBoost * (1 - preTaxBasisRatioForYear);
            preTaxBasis = Math.max(0, preTaxBasis - (acaSubsidyBoost - acaSubsidyBoostTaxable));
            rothLayers.conversions.push({ year, taxable: acaSubsidyBoostTaxable, nontaxable: acaSubsidyBoost - acaSubsidyBoostTaxable });
            convertAmountTaxable += acaSubsidyBoostTaxable;
            baseOrdinaryTaxableIncome += acaSubsidyBoostTaxable;

            // Marginal tax on the boost, stacked on the solved year, federal
            // and state kept apart (changelog 405; the state part used to be
            // reported as federal).
            const withBoost = settledIncomeNow();
            const withoutBoost = { ...withBoost, ordinary: withBoost.ordinary - acaSubsidyBoostTaxable };
            const priorConversionTaxable = convertAmountTaxable - acaSubsidyBoostTaxable;
            const boostAfter = priceSettledYear(withBoost, convertAmountTaxable);
            const boostBefore = priceSettledYear(withoutBoost, priorConversionTaxable);
            const acaBoostTaxFederal = Math.max(0, boostAfter.federal - boostBefore.federal);
            const acaBoostTaxState = Math.max(0, boostAfter.state - boostBefore.state);
            const acaBoostTax = acaBoostTaxFederal + acaBoostTaxState;
            extraTax += acaBoostTax;
            extraTaxFederal += acaBoostTaxFederal;
            extraTaxState += acaBoostTaxState;
            conversionTaxCost += acaBoostTax;

            // Pay that tax: Taxable first, then Roth, then Pre-Tax -- and the
            // tax the paying itself causes.
            fundAfterSolver(acaBoostTax, ['taxable', 'roth', 'preTax']);

            // The boost is income: the conversion was added to the ordinary
            // base above and paying its tax may have drawn more. Re-settle
            // the MAGI the credit and next year's estimate read. Until
            // changelog 436 it stayed at the pre-boost figure, under the
            // poverty line, so the credit the boost was made to earn was
            // priced at $0 and the next year's estimate inherited the gap.
            acaMagi = settleAcaMagi();
            acaCliffBreached = acaMagi > acaCliffThreshold + 0.005;

            // Not enough remaining pre-tax balance to fully close the gap.
            if (acaSubsidyBoost < gapAmount - 0.005) inAcaCoverageGap = true;
          } else {
            inAcaCoverageGap = true;
          }
        }
      }

      // The credit applied provisionally above was only ever an estimate of
      // eligibility. A year that ended over the cliff (or stuck in the
      // coverage gap) gets none of it: repay the whole amount as tax,
      // funded the same way as the ACA boost tax -- Taxable, then Roth,
      // then Pre-Tax, then shortfall. This is the mechanism that makes a
      // cliff-crossing conversion cost what it really costs, so the Roth
      // Ladder Optimizer can see it.
      if (acaCreditFormula) {
        // Changelog 415: the credit the settled year actually earns. Over
        // the cliff or below the floor that is nothing; in between it is
        // the benchmark less the applicable percentage of the settled
        // MAGI, which the solver's draws and realized gains have usually
        // raised. The difference from the estimate is settled on the
        // return: a shortfall repaid as tax (funded like the boost tax), an
        // excess refunded into the taxable account.
        const fplForCredit = getFederalPovertyLevel(householdSize, year, inputs.taxBracketInflationRate);
        acaCreditSettled = (acaCliffBreached || inAcaCoverageGap || acaPremiumPaid <= 0)
          ? 0
          : acaPremiumTaxCredit({ benchmark: acaBenchmarkPremium, magi: acaMagi, fpl: fplForCredit, premiumPaid: acaPremiumPaid }).credit;
        const difference = acaSubsidyApplied - acaCreditSettled;
        if (difference > 0.005) {
          acaSubsidyClawback = difference;
          extraTax += acaSubsidyClawback;
          extraTaxFederal += acaSubsidyClawback;
          fundAfterSolver(acaSubsidyClawback, ['taxable', 'roth', 'preTax']);
        } else if (difference < -0.005) {
          acaSubsidyRefund = -difference;
          taxable += acaSubsidyRefund;
          // Refund cash is basis, like any other deposit (changelog 436).
          taxableBasis += acaSubsidyRefund;
        }
      } else if (acaSubsidyApplied > 0 && (acaCliffBreached || inAcaCoverageGap)) {
        acaSubsidyClawback = acaSubsidyApplied;
        extraTax += acaSubsidyClawback;
        // Repaying the advance premium tax credit on Form 8962 -- federal.
        extraTaxFederal += acaSubsidyClawback;
        fundAfterSolver(acaSubsidyClawback, ['taxable', 'roth', 'preTax']);
      }
      prevAcaMagi = acaMagi;
    } else {
      prevAcaMagi = null;
    }

    // Settle the year's IRMAA MAGI now that every income item exists
    // (changelog 123, audit Q-4c): the solver's discretionary Pre-Tax draw
    // and any Pre-Tax used to fund ACA tax, taxable Roth earnings, dividends
    // and the realized gains on Taxable draws all sit in AGI. This is the
    // figure Medicare will read two years from now, so it -- not the
    // pre-solver estimate -- goes into the lookback history. A year that
    // was priced off the estimate (no history yet, or an SSA-44 appeal) is
    // re-priced here and the difference charged as extra premium, funded
    // Taxable -> Roth -> Pre-Tax -> shortfall like the ACA clawback above.
    // Settle Social Security taxability against the draw the solver actually
    // took, the same way IRMAA MAGI is settled just below. The solver already
    // PRICED this correctly (see ssResettle in getTax), so the year's tax is
    // right either way; this makes the REPORTED taxableSS, ordinary taxable
    // income, marginal bracket and IRMAA MAGI agree with the tax charged
    // instead of showing the pre-solver estimate. Before this, a plan could
    // display "$0 of your benefits are taxable" in the ledger while the
    // engine charged tax on $20,000 of them.
    // Run once here and again after the IRMAA true-up below has drawn
    // (changelog 405), so the reported figures and the MAGI the lookback
    // will read two years on include every draw the year made.
    let solvedPreTaxOrdinary = 0;
    let solvedRealizedGainsNet = 0;
    let taxableSSSettleDelta = 0;
    let irmaaMagiFinal = 0;
    const settleIncome = () => {
      const now = settledIncomeNow();
      solvedPreTaxOrdinary = now.preTaxOrdinary;
      solvedRealizedGainsNet = now.gainsNet;
      const taxableSSFinal = taxableSSFor(
        provisionalOtherIncome + convertAmountTaxable
        + solvedPreTaxOrdinary
        + (rothDrawSplitThisYear.taxableEarnings || 0)
        + solvedRealizedGainsNet
      );
      taxableSSSettleDelta = taxableSSFinal - taxableSSPreSolver;
      taxableSS = taxableSSFinal;
      irmaaMagiFinal = baseOrdinaryTaxableIncome + taxableSSSettleDelta
        + solvedPreTaxOrdinary
        + (rothDrawSplitThisYear.taxableEarnings || 0)
        + taxableDividends
        + solvedRealizedGainsNet;
    };
    settleIncome();
    irmaaMagiHistory.push({ magi: irmaaMagiFinal, status: currentStatus });
    if (irmaaBasisSource !== 'lookback' && medicareMembers > 0) {
      const settled = priceIrmaa(irmaaMagiFinal, currentStatus);
      const lb = lookbackRow ? priceIrmaa(lookbackRow.magi, lookbackRow.status) : null;
      if (irmaaBasisSource === 'appeal' && lb && settled.partB + settled.partD >= lb.partB + lb.partD) {
        // The appeal only ever substitutes a LOWER figure; if the settled
        // year is no cheaper than the lookback, the lookback stands.
        irmaaTrueUp = (lb.partB + lb.partD) - (irmaaPriced.partB + irmaaPriced.partD);
        irmaaBasisMagi = lookbackRow.magi;
        irmaaBasisSource = 'lookback';
        partBCost = lb.partB;
        partDCost = lb.partD;
      } else {
        irmaaTrueUp = (settled.partB + settled.partD) - (irmaaPriced.partB + irmaaPriced.partD);
        irmaaBasisMagi = irmaaMagiFinal;
        partBCost = settled.partB;
        partDCost = settled.partD;
      }
      if (irmaaTrueUp > 0.005) {
        // A premium is ordinary spending, so it follows the plan's own
        // withdrawal order (unlike the ACA clawback, which is a tax). The
        // draws are priced for tax like any other (changelog 405).
        const order = inputs.withdrawalStrategy === 'PreTaxFirst' ? ['preTax', 'taxable', 'roth']
          : inputs.withdrawalStrategy === 'RothFirst' ? ['roth', 'taxable', 'preTax']
          : ['taxable', 'preTax', 'roth'];
        fundAfterSolver(irmaaTrueUp, order);
        expensesExcludingTaxes += irmaaTrueUp;
        // The draws just taken are income: settle again so the reported
        // figures and the MAGI the lookback reads two years on carry them.
        // The premium itself is not re-tiered on them (one pass).
        settleIncome();
        irmaaMagiHistory[irmaaMagiHistory.length - 1] = { magi: irmaaMagiFinal, status: currentStatus };
      } else if (irmaaTrueUp < -0.005) {
        // Estimate overshot (rare: a lower settled tier). Refund to Taxable.
        taxable -= irmaaTrueUp;
        taxableBasis -= irmaaTrueUp;
        expensesExcludingTaxes += irmaaTrueUp;
      } else {
        irmaaTrueUp = 0;
      }
    }

    // E15 (2026-09-30 review): the cash reserve and a shortfall. A top-up
    // the accounts could not pay for was never money: the unfunded part of
    // this year's replenishment is the first thing a shortfall cancels. And
    // the reserve is spent before a shortfall is declared, down year or not
    // -- it exists to be spent before the plan runs out.
    if (shortfall > 0.005 && cashReserveReplenish > 0) {
      const unfunded = Math.min(cashReserveReplenish, shortfall);
      cashReserveReplenish -= unfunded;
      cashReserveBalance -= unfunded;
      shortfall -= unfunded;
    }
    if (shortfall > 0.005 && cashReserveBalance > 0) {
      const lastResort = Math.min(cashReserveBalance, shortfall);
      cashReserveDraw += lastResort;
      cashReserveBalance -= lastResort;
      shortfall -= lastResort;
    }

    // A28 (2026-09-30 review): the HSA as the very last source. The solver
    // above draws only Pre-Tax, Roth and Taxable, and the HSA pays only
    // qualified medical costs, so a plan could run short while a large HSA
    // sat untouched. When a shortfall is left after every other account and
    // the cash reserve, the HSA pays it as a non-medical distribution:
    // ordinary income (IRC 223(f)(2)), plus the 20% additional tax before
    // the owner is 65 (223(f)(4)). The draw is grossed up for the tax it
    // creates, priced on top of the settled year the way the ACA boost tax
    // is -- Social Security taxability re-settled against it, capital gains
    // stacked above it. California does not recognize the HSA and already
    // taxed contributions and earnings each year (the hsaAddback), so the
    // distribution is not California income again and carries no California
    // additional tax; every other state, New Jersey included (the model has
    // no New Jersey addback), taxes it as ordinary income. It is not a
    // retirement-plan distribution, so no state pension/IRA exclusion
    // applies. Foreign tax on it is not modeled. Zero in any year without a
    // shortfall, so no balanced plan changes.
    let hsaGeneralDraw = 0;
    let hsaGeneralDrawTax = 0;
    let hsaGeneralDrawPenalty = 0;
    let hsaGeneralOrdinary = 0;
    if (shortfall > 0.005 && hsa > 0.005) {
      const hsaIsCa = residence.stateTaxState === 'ca';
      const settledProvisional = provisionalOtherIncome + convertAmountTaxable + solvedPreTaxOrdinary
        + (rothDrawSplitThisYear.taxableEarnings || 0) + solvedRealizedGainsNet;
      const settledOrdinary = baseOrdinaryTaxableIncome + taxableSSSettleDelta + solvedPreTaxOrdinary
        + (rothDrawSplitThisYear.taxableEarnings || 0);
      const settledCapGains = taxableDividends + solvedRealizedGainsNet;
      const hsaYearTax = (h) => {
        const ssAdj = h > 0 ? taxableSSFor(settledProvisional + h) - taxableSS : 0;
        const ordinaryInc = settledOrdinary + ssAdj + h;
        const deduction = deductionFor(ordinaryInc + settledCapGains);
        const ordinaryTaxable = Math.max(0, ordinaryInc - deduction);
        const federal = calculateTaxes(ordinaryTaxable, currentStatus, taxBracketInflationFactor, inputs.tcjaSunsetEnabled, mfsSplitFor(ordinaryInc))
          + calculateCapitalGainsTaxes(ordinaryTaxable, settledCapGains, currentStatus, taxBracketInflationFactor, deduction, Math.max(0, deduction - ordinaryInc), niiOtherForYear, mfsSplitFor(ordinaryInc));
        const penalty = ownerAge < 65 ? h * 0.20 : 0;
        const incomeForState = ordinaryInc + settledCapGains;
        const state = calculateStateTaxes(
          incomeForState - (hsaIsCa ? h : 0), pension, ssIncome, residence.stateTaxState,
          residence.stateTaxSocialSecurityTaxable, residence.stateTaxPensionTaxable,
          currentStatus, ownerAge, age2, residence.stateTaxFlatRate, militaryPension,
          { stateExempt: stateExemptPension, private1: privatePension1, private2: privatePension2, military1: military1Pension, military2: military2Pension },
          residence.yonkersResident, {
            ...stateExtrasForYear,
            federalAGI: incomeForState,
            federalDeduction: deduction,
            federalTaxableSS: taxableSS + ssAdj,
            retirementDistributions: (stateExtrasForYear.retirementDistributions || 0) + solvedPreTaxOrdinary + (rothDrawSplitThisYear.taxableEarnings || 0),
            rothConversionTaxable: convertAmountTaxable,
            longTermGains: (stateExtrasForYear.longTermGains || 0) + solvedRealizedGainsNet,
          }
        );
        return { federal: federal + penalty, penalty, state, ssAdj };
      };
      const at0 = hsaYearTax(0);
      const taxOn = (h) => {
        const p = hsaYearTax(h);
        return { ...p, federal: p.federal - at0.federal, state: p.state - at0.state, total: (p.federal - at0.federal) + (p.state - at0.state) };
      };
      let draw = hsa;
      let priced = taxOn(hsa);
      if (hsa - priced.total >= shortfall) {
        // Smallest draw whose after-tax cash covers the shortfall.
        let low = 0;
        let high = hsa;
        for (let iter = 0; iter < 40; iter++) {
          const mid = (low + high) / 2;
          if (mid - taxOn(mid).total >= shortfall) high = mid; else low = mid;
        }
        draw = high;
        priced = taxOn(high);
      }
      const net = Math.max(0, draw - priced.total);
      hsaGeneralDraw = draw;
      hsaGeneralDrawTax = priced.total;
      hsaGeneralDrawPenalty = priced.penalty;
      hsaGeneralOrdinary = draw + priced.ssAdj;
      hsa = Math.max(0, hsa - draw);
      extraTax += priced.total;
      extraTaxFederal += priced.federal;
      extraTaxState += priced.state;
      shortfall = Math.max(0, shortfall - net);
      // The reported figures follow the draw: taxable benefits, and the
      // MAGI Medicare reads two years from now.
      taxableSS += priced.ssAdj;
      irmaaMagiFinal += hsaGeneralOrdinary;
      irmaaMagiHistory[irmaaMagiHistory.length - 1].magi = irmaaMagiFinal;
    }

    // The year's foreign layer as settled (changelog 196): the base priced
    // before any draw plus whatever the solver's chosen draw added. These are
    // the ledger's figures, and they reconcile exactly --
    // federalTax + stateTax + ficaTax + foreignTax - foreignTaxCredit
    // === totalTaxesPaid.
    let foreignRow = null;
    if (abroad) {
      const plus = (k, sub) => {
        const b = sub ? foreignBase[k][sub] : foreignBase[k];
        if (!foreignSolved) return b;
        return b + (sub ? foreignSolved.final[k][sub] - foreignSolved.base[k][sub] : foreignSolved.final[k] - foreignSolved.base[k]);
      };
      foreignRow = {
        localTax: plus('localTax'),
        rothTax: plus('rothTax'),
        contributions: plus('contributions'),
        wealthTax: plus('wealthTax'),
        regimeActive: foreignBase.regimeActive,
        gross: plus('gross'),
        creditTotal: plus('creditTotal'),
        creditable: { general: plus('creditable', 'general'), passive: plus('creditable', 'passive') },
        credit: { general: plus('credit', 'general'), passive: plus('credit', 'passive') },
      };
      ftcPools = settleFtcCarryforward(ftcPools, year, foreignRow);
    }

    const totalTaxesPaid = baseTaxes + extraTax;
    const totalExpenses = expensesExcludingTaxes + totalTaxesPaid;
    const totalDiscretionaryDraw = drawPreTax + drawRoth + drawTaxable;
    
    // Growth calculation. Investment fees (changelog 447) come off after
    // the year's return, on the four invested accounts: growth is
    // (1 + r)(1 - f). returnRate stays the before-fees market return --
    // guardrails, tax-loss harvesting and the ledger's growthRate read the
    // market, not the household's costs.
    const feeFraction = totalFeeFraction(inputs);
    const keepAfterFees = 1 - feeFraction;
    const grossOf = (b) => b * (1 + returnRate / 100);
    const feeOn = (b) => Math.max(0, grossOf(b)) * feeFraction;
    const feesPaidThisYear = feeOn(preTax) + feeOn(roth) + feeOn(taxable) + feeOn(hsa);
    const feeShare = feeFraction > 0
      ? ((Number(inputs.advisorFeePct) || 0) / 100) / feeFraction
      : 0;
    const advisorFeesPaidThisYear = feesPaidThisYear * Math.min(1, feeShare);
    const fundExpensesPaidThisYear = feesPaidThisYear - advisorFeesPaidThisYear;
    feesPaidCumulative += feesPaidThisYear;
    preTax = grossOf(preTax) * keepAfterFees;
    roth = grossOf(roth) * keepAfterFees;
    taxable = grossOf(taxable) * keepAfterFees;
    // Reinvested dividends are NEW BASIS (changelog 230). They were taxed
    // as income the year they arrived, so taxing them again as capital
    // gain when the shares are eventually sold charges the same dollar
    // twice -- the identical trap the milestone-inflow code calls out
    // ("taxing it again as a capital gain later would double-tax it").
    // Dividends never got the same treatment, and in a plan drawing hard
    // on the taxable bucket the error reached 17% of lifetime tax.
    //
    // Credited HERE, immediately after growth, because that is the moment
    // the reinvested dividend is actually in the account: the yield is
    // computed on the year's opening balance, but the money only lands
    // with the return that carries it. Clamped to the balance because an
    // account emptied during the year cannot carry basis -- the plan's
    // standing invariant is 0 <= basis <= balance.
    // Only the REINVESTED part is new basis -- a dividend paid out in cash
    // buys nothing, so it changes basis not at all (changelog 231).
    // A harvested loss was sold and rebought at the declined value: the
    // basis comes down by the loss realized (changelog 429), before the
    // clamp -- an account under water carries basis above its balance
    // until the sale, and the clamp would otherwise take that first.
    taxableBasis = Math.min(taxable, Math.max(0, taxableBasis + Math.max(0, taxableDividendsFromYield - dividendCash) - taxLossHarvestedThisYear));
    hsa = grossOf(hsa) * keepAfterFees;

    // Concentrated stock, phase B: the sale itself happened before the tax
    // engine (see phase A above). What is left is settlement -- the
    // proceeds land in Taxable AFTER Taxable's own growth so they are not
    // double-compounded in the year they move across, and become fresh
    // 100% basis going forward, since the gain has just been realized and
    // taxed. Entirely inert (all $0) when concentratedStockEnabled is
    // false, so this cannot change any existing plan's numbers.
    csConfigs.forEach((cfg, i) => {
      if (!cfg.enabled) return;
      const state = csState[i];
      taxable += csYear[i].netProceeds * csProceedsKeptShare;
      taxableBasis += csYear[i].netProceeds * csProceedsKeptShare;
      // This year's held vests join the position AFTER diversification --
      // someone deliberately holding new shares wouldn't sell a slice of
      // them in the same breath -- and after growth, so they don't collect
      // a full year's return having arrived mid-year. Full basis: at vest,
      // basis equals market value.
      if (csVestedIn[i] > 0) {
        state.balance += csVestedIn[i];
        state.basisDollars += csVestedIn[i];
      }
    });
    const concentratedStockBalance = csState[0].balance;
    const concentratedStockDiversified = csYear[0].diversified;
    const csGainTotal = csYear[0].realizedGain + csYear[1].realizedGain;
    const csGainTaxShare = (i) => (inputs.concentratedStockFlatTaxEnabled
      ? csYear[i].diversificationTax
      : (csGainTotal > 0 ? concentratedStockGainTax * (csYear[i].realizedGain / csGainTotal) : 0));
    const concentratedStockDiversificationTax = csGainTaxShare(0);
    const concentratedStockNetProceeds = csYear[0].netProceeds;
    const concentratedStock2Balance = csState[1].balance;
    const concentratedStock2Diversified = csYear[1].diversified;
    const concentratedStock2DiversificationTax = csGainTaxShare(1);
    const concentratedStock2NetProceeds = csYear[1].netProceeds;
    // % of (portfolio + BOTH concentrated positions) held in each single
    // stock -- the risk metric the UI warns on against the shared
    // concentratedStockConcentrationTargetPct. Both positions share one
    // denominator: each stock's risk is judged against the household's
    // whole net worth, and net worth includes the other position too.
    const concentratedStockTotalWithPosition = preTax + roth + taxable + hsa + concentratedStockBalance + concentratedStock2Balance;
    const concentratedStockConcentrationPct = concentratedStockTotalWithPosition > 0
      ? (concentratedStockBalance / concentratedStockTotalWithPosition) * 100
      : 0;
    const concentratedStock2ConcentrationPct = concentratedStockTotalWithPosition > 0
      ? (concentratedStock2Balance / concentratedStockTotalWithPosition) * 100
      : 0;

    const totalPortfolioEnding = preTax + roth + taxable + hsa;
    const netChange = (preTax + roth + taxable + hsa) - (prevYearEnding(years) ?? (inputs.preTaxInit + inputs.rothInit + inputs.taxableInit + inputs.hsaInit));

    // Calculate FI and CoastFIRE Crossover
    const fiTargetExpenses = lifestyleCost + goGoBump + healthcareBridge + ltcCost + irmaaCost;
    const swrPct = inputs.safeWithdrawalRate > 0 ? inputs.safeWithdrawalRate : 4.0;
    const fiNumber = fiTargetExpenses / (swrPct / 100);
    const isFICrossover = totalPortfolioEnding >= fiNumber;
    
    let coastFireNumber = fiNumber;
    if (!isRetired) {
      const yearsToRetire = Math.max(0, inputs.retireAge1 - age1);
      const stockAlloc = inputs.stockAllocationPre !== undefined ? inputs.stockAllocationPre : 80;
      // After investment fees (changelog 447), as the projection grows it.
      const nominalReturn = netReturnPct(((stockAlloc / 100) * (inputs.stockReturnRate || 8)) + (((100 - stockAlloc) / 100) * (inputs.bondReturnRate || 4)), inputs);
      const realGrowth = (nominalReturn - (inputs.inflationRate || 3)) / 100;
      if (realGrowth > 0) {
        coastFireNumber = fiNumber / Math.pow(1 + realGrowth, yearsToRetire);
      }
    }
    const isCoastFireCrossover = !isRetired && (totalPortfolioEnding >= coastFireNumber);

    // The year's final ordinary income and MAGI, for the ledger's taxable-
    // income / bracket / deduction readouts. baseOrdinaryTaxableIncome
    // already carries the milestone Pre-Tax draw, so only the solver's
    // discretionary draw is added (the old `+ drawPreTax` double-counted
    // milestone withdrawals). The deduction shown is what this income
    // actually got: basic + age-65 add-on + whatever OBBBA senior bonus
    // survived the phase-out at this MAGI.
    const finalOrdinaryIncome = baseOrdinaryTaxableIncome + taxableSSSettleDelta + Math.max(0, drawPreTax - actualMilestonePreTax) * (1 - preTaxBasisRatioForYear) + rothDrawSplitThisYear.taxableEarnings + hsaGeneralOrdinary;
    // Realized gains net of the loss carryforward used on the draw, as the
    // IRMAA MAGI above already has them (changelog 404; the gross figure
    // overstated MAGI for the senior-bonus phase-out shown on the ledger).
    const finalMagi = finalOrdinaryIncome + taxableDividends + solvedRealizedGainsNet;
    const finalDeduction = deductionFor(finalMagi);
    // Changelog 417: which deduction the settled year took, and its parts.
    const finalChoice = deductionChoice(finalMagi);
    const finalItemized = itemizing ? itemizedFor(finalMagi) : { total: 0, salt: 0, mortgage: 0, charitable: 0, medical: 0 };
    const seniorBonusDeductionThisYear = finalDeduction - finalChoice.amount;

    lastYearReturnRate = returnRate;
    years.push({
      year,
      isFICrossover,
      isCoastFireCrossover,
      age1: spouse1Alive ? age1 : null,
      age2: spouse2Alive ? age2 : null,
      spouse1Alive,
      spouse2Alive,
      householdStatus: currentStatus,
      isRetired,
      isRetired1: isSpouse1Retired,
      ssOwn1,
      // Withdrawal-rate guardrails (changelog 216). Null in every year the
      // rule did not run, so a surface can tell "off" from "held steady".
      wrGuardrailRate,
      wrGuardrailAction,
      wrGuardrailMultiplier: inputs.withdrawalGuardrailsEnabled ? wrGuardrailMultiplier : null,
      // The rate the plan's own path had that year (changelog 335), which
      // the band is drawn around. Replaces the old retirement-year anchor.
      wrGuardrailPlannedRate,
      // Realized price level (changelog 335): equals inflFactor until a
      // year's inflation departs from the plan's. Today's-dollar displays
      // divide by this.
      priceIndex,
      // Where the household lived this year (changelog 195). Display
      // surfaces read these instead of the plan-wide inputs, which are
      // only the starting state once a move is planned.
      residenceState: residence.stateOfResidence,
      // Changelog 360: the cost-basis change at the first death (positive for
      // a step-up), and the share of taxable money it covered.
      firstDeathBasisChange,
      firstDeathBasisResetShare: year === firstDeathBasisResetYear ? firstDeathBasisResetShareApplied : null,
      stateTaxJurisdiction: residence.stateTaxState,
      // Years abroad (changelog 196). residenceState above is then the US
      // state that still claims the household, or null once ties are cut.
      residenceCountry: abroad ? residence.countryName : null,
      // Changelog 203: in a move year that starts after January, the month
      // the move took effect (the year is shared by months).
      moveMonth: moveShare < 1 ? residence.fromMonth : null,
      foreignTax: foreignRow ? foreignRow.gross : 0,
      foreignTaxCredit: foreignRow ? foreignRow.creditTotal : 0,
      // The credit and the room, split by basket (changelog 230). Readouts
      // only -- nothing reads them back. Published because the §904 rule
      // that passive tax can never shelter general-basket income is
      // invisible in the totals, so neither a user nor a test could tell a
      // year that used passive carryforward from one that did not.
      foreignTaxCreditGeneral: foreignRow ? foreignRow.credit.general : 0,
      foreignTaxCreditPassive: foreignRow ? foreignRow.credit.passive : 0,
      foreignTaxCreditableGeneral: foreignRow ? foreignRow.creditable.general : 0,
      foreignTaxCreditablePassive: foreignRow ? foreignRow.creditable.passive : 0,
      foreignLocalTax: foreignRow ? foreignRow.localTax : 0,
      foreignRothTax: foreignRow ? foreignRow.rothTax : 0,
      foreignContributions: foreignRow ? foreignRow.contributions : 0,
      // Changelog 199: a yearly tax on balances (never credited), and the
      // special regime in force this year, if any -- its end is a step in
      // the ledger, not a slope.
      foreignWealthTax: foreignRow ? foreignRow.wealthTax : 0,
      foreignRegime: foreignRow && foreignRow.regimeActive ? residence.foreign.regime.label : null,
      // Foreign tax the credit can never reach: tax on Social Security, US
      // rent and the Roth, local contributions, and anything not re-sourced
      // by a treaty. (Creditable tax the limit blocked this year is carried
      // forward instead -- foreignTaxCarryforward.)
      uncreditableForeignTax: foreignRow ? foreignRow.gross - foreignRow.creditable.general - foreignRow.creditable.passive : 0,
      foreignTaxCarryforward: abroad || ftcPools.general.length + ftcPools.passive.length > 0
        ? [...ftcPools.general, ...ftcPools.passive].reduce((t, v) => t + v.amount, 0)
        : 0,
      // And the same pool split by basket (changelog 230), for the same
      // reason as the credit split above: the total moving says nothing
      // about WHICH pool moved, and the §904 rule is entirely about that.
      foreignTaxCarryforwardGeneral: ftcPools.general.reduce((t, v) => t + v.amount, 0),
      foreignTaxCarryforwardPassive: ftcPools.passive.reduce((t, v) => t + v.amount, 0),
      extraTaxForeign,
      foreignHealthcare,
      medicarePenalty,
      medicarePartBDropped: partBDroppedAbroad,
      salary,
      rsuIncome1,
      rsuIncome2,
      concentratedStockBalance,
      concentratedStockDiversified,
      concentratedStockDiversificationTax,
      concentratedStockNetProceeds,
      // E25: the part of this year's net sale proceeds (both positions)
      // spent on this year's bills; the rest settles into Taxable.
      concentratedStockProceedsSpent: csProceedsSpent,
      concentratedStockConcentrationPct,
      concentratedStockVestedIn: csVestedIn[0],
      concentratedStock2Balance,
      concentratedStock2Diversified,
      concentratedStock2DiversificationTax,
      concentratedStock2NetProceeds,
      concentratedStock2ConcentrationPct,
      concentratedStock2VestedIn: csVestedIn[1],
      cashReserveBalance,
      // The reserve's own target and the monthly spend it is months OF,
      // both zero when the reserve is off (changelog 217).
      cashReserveTarget,
      cashReserveMonthlySpend,
      cashReserveMonthsCovered: cashReserveMonthlySpend > 0 ? cashReserveBalance / cashReserveMonthlySpend : 0,
      cashReserveDraw,
      cashReserveReplenish,
      cashReservePreFund,
      nqdcBalance1,
      nqdcBalance2,
      nqdcDeferral1,
      nqdcDeferral2,
      nqdcDistribution1,
      nqdcDistribution2,
      fixedInflows,
      ssIncome,
      // Changelog 255: see the ssIfBoth block in the SS section.
      ssIfBoth: ssIfBothPaid,
      ssIfOnly1: ssIfOnly1Paid,
      ssIfOnly2: ssIfOnly2Paid,
      // Retirement Earnings Test (42 U.S.C. 403). `ssEarningsTestWithheld`
      // is the benefit held back THIS year because of wages; the months it
      // represents are credited back at FRA, which is what
      // ssEarningsTestCreditMonths1/2 track. ssIncome above is already net
      // of the withholding.
      ssEarningsTestWithheld,
      ssEarningsTestInFraYear,
      ssEarningsTestCreditMonths1: ssEarningsTestMonths1,
      ssEarningsTestCreditMonths2: ssEarningsTestMonths2,
      pension,
      rentalAnnuity,
      // Pre-retirement, reflects actual modeled current spending
      // (currentSpendingCost) rather than the retirement target
      // (lifestyleCost), so dashboards/charts showing "spending" match what
      // was actually drawn against each year.
      lifestyleExpenses: (isRetired ? lifestyleCost : currentSpendingCost) + goGoBump,
      // Rung 1 of the Retirement Spending module (changelog 134): the
      // derivation behind auto-mode current spending, so Plan Settings can
      // show the figure AND how it was reached rather than a bare number.
      // null in retired years -- see the currentSpendingDerived comment.
      currentSpending: isRetired ? null : {
        mode: inputs.currentSpendingMode === 'custom' ? 'custom' : 'auto',
        // What the household had coming in.
        income: salary + fixedInflows,
        salary,
        otherIncome: fixedInflows,
        // What provably did not get spent.
        taxes: baseTaxes,
        // Planned savings, matching the residual's arithmetic (E13).
        contributions: totalContributions + preCutSavings,
        // Non-cash and modeling adjustments, grouped because neither is a
        // dollar the household could have spent: vested shares retained in
        // the concentrated position were never take-home cash, and the
        // harvesting adjustment stops a tax saving from reading as extra
        // spending. Usually zero.
        nonCashAdjustments: harvestTaxSavings + concentratedStockVestedInTotal,
        // Before the deficit-reduction block could trim it, and after.
        derived: currentSpendingDerived,
        // The part of `derived` that goes to mortgage and other debt
        // payments (auto mode), and what is left for everything else.
        debtPayments: currentSpendingDebtShare,
        applied: currentSpendingCost,
        trimmedByDeficit: Math.max(0, (currentSpendingDerived || 0) - currentSpendingDebtShare - currentSpendingCost),
      },
      healthcareBridge,
      ltcCost,
      irmaaCost: irmaaCost + irmaaTrueUp,
      partBCost,
      partDCost,
      irmaaTrueUp,
      irmaaThresholdFactor,
      // Which year's MAGI set this year's IRMAA tier (changelog 121):
      // the return filed two years earlier ('lookback'), this year's own
      // MAGI because no earlier projection year exists ('current'), or
      // this year's MAGI via a Form SSA-44 appeal ('appeal'). irmaaMagi is
      // the settled AGI-based figure (changelog 123) that year N+2 reads.
      irmaaMagi: irmaaMagiFinal,
      irmaaBasisMagi,
      irmaaBasisSource,
      irmaaLookbackMagi: lookbackRow ? lookbackRow.magi : null,
      ssColaFactor,
      medicalInflFactor,
      ltcInflFactor,
      partBInflFactor,
      statutoryInflFactor,
      partDInflFactor,
      totalExpenses,
      // A QCD beyond the RMD is a further distribution from Pre-Tax
      // (changelog 418): it is inside the draw figures like the RMD it
      // rides on, so the ledger's Pre-Tax column reconciles. Until
      // changelog 440 it left the account without appearing here, a gap of
      // the whole QCD in the year's reconciliation. The Readiness paycheck
      // names it as the charity's, never the household's.
      drawdown: totalDiscretionaryDraw + rmdAmount + qcdBeyondRmd,
      drawPreTax: drawPreTax + rmdAmount + qcdBeyondRmd,
      drawRoth,
      drawTaxable,
      extraTax,
      lifestyleDeficit,
      savingsDeficit,
      preTaxStart: prevYearEndingField(years, 'preTaxEnd') ?? inputs.preTaxInit,
      rothStart: prevYearEndingField(years, 'rothEnd') ?? inputs.rothInit,
      taxableStart: prevYearEndingField(years, 'taxableEnd') ?? inputs.taxableInit,
      hsaStart: prevYearEndingField(years, 'hsaEnd') ?? inputs.hsaInit,
      preTaxEnd: preTax,
      rothEnd: roth,
      taxableEnd: taxable,
      hsaEnd: hsa,
      hsaContribution,
      hsaMedicalDraw,
      // A28: the HSA paying a shortfall no other account could (a
      // non-medical distribution), and the income tax plus any 20%
      // additional tax it cost -- already inside extraTax/totalTaxesPaid.
      // Not part of drawdown, which stays Pre-Tax + Roth + Taxable.
      hsaGeneralDraw,
      hsaGeneralDrawTax,
      hsaGeneralDrawPenalty,
      totalPortfolioEnding,
      totalTaxesPaid,
      // The decomposition of baseTaxes, published so no UI has to rebuild one
      // (changelog 176). READ THE NAMES LITERALLY. These are the taxes on the
      // year's income BEFORE the withdrawal solver sizes the discretionary
      // draw. The marginal tax on that draw lands in `extraTax`, and in a
      // year funded from a taxable account that is usually the LARGER number:
      // a single filer drawing $487k against a 20%-basis account shows
      // baseFederalTax of $7,365 and extraTax of $69,835.
      //
      // These three are PRE-WITHDRAWAL figures and their names say so. The
      // marginal tax on the discretionary draw lands in extraTax, and in a
      // year funded from a taxable account that is usually the larger part.
      //
      // Changelog 176 warned here that extraTax was a single blended number
      // and that no complete federal-only figure existed. Changelog 182 fixed
      // that at the source by splitting the solver's getTax, so the row now
      // also carries `federalTax` and `stateTax` as COMPLETE figures below.
      // `baseFederalTax + extraTax` is still not federal tax -- use
      // `federalTax`, which is baseFederalTax + extraTaxFederal.
      baseFederalTax: baseFedTaxes,
      baseStateTax: baseStateTaxes,
      ficaTax: ficaTaxes,
      // The COMPLETE federal and state figures (changelog 182). Until the
      // withdrawal solver's getTax was split, `extraTax` was one blended
      // number and no complete federal-only figure existed on this row --
      // see the warning above, which this supersedes. It is now safe to
      // read `federalTax` as the year's federal income tax, and
      // federalTax + stateTax + ficaTax === totalTaxesPaid exactly.
      extraTaxFederal,
      extraTaxState,
      federalTax: baseFedTaxes + extraTaxFederal,
      stateTax: baseStateTaxes + extraTaxState,
      discretionaryDrawPreTax: drawPreTax,
      rmdAmount,
      qcdAmount,
      rmdTaxableAmount,
      // Changelog 416: the divisor the RMD used and whether it came from the
      // joint-life table (a sole-beneficiary spouse more than 10 years younger).
      rmdDivisor,
      rmdJointLifeTable,
      // Changelog 417: 'itemized' or 'standard', the itemized total the year
      // could claim (whichever it took) and its four lines, and the
      // non-itemizer charitable deduction a standard-deduction year added.
      deductionUsed: finalChoice.itemized ? 'itemized' : 'standard',
      itemizedDeduction: finalItemized.total,
      itemizedSalt: finalItemized.salt,
      itemizedMortgageInterest: finalItemized.mortgage,
      itemizedCharitable: finalItemized.charitable,
      itemizedMedical: finalItemized.medical,
      nonItemizerCharitable: finalChoice.itemized ? 0 : nonItemizerCharitable,
      amtTax,
      nuaOrdinaryIncome,
      mortgageBalance,
      mortgagePaymentThisYear,
      otherDebtBalance,
      otherDebtPaymentThisYear,
      homeValue,
      reverseMortgageBalance,
      reverseMortgagePayoutThisYear,
      // A26: forward mortgage retired by the reverse mortgage this year.
      reverseMortgageForwardPayoff,
      homeEquity,
      otherEstateAssetsValue,
      lifeInsuranceCashValue,
      lifeInsuranceLoanBalance,
      lifeInsuranceNetCashValue,
      lifeInsuranceNetDeathBenefit,
      lifeInsuranceNetDeathBenefit1,
      lifeInsuranceNetDeathBenefit2,
      // First-death payout invested into the survivor's Taxable this year
      // (audit F-1); 0 in every other year.
      lifeInsurancePayoutToSurvivor,
      taxLossHarvestedThisYear,
      harvestedGainsOffset,
      harvestedOrdinaryOffset,
      lossCarryforward,
      lossUsedOnDraw,
      backdoorRothContribution,
      preTaxBasis,
      taxableBasis,
      // Roth ordering-rule bookkeeping (changelog 103): remaining basis
      // after this year's flows, and how the discretionary Roth draw split.
      rothBasis: rothLayersBasis(rothLayers),
      rothDrawFromBasis: rothDrawSplitThisYear.contrib + rothDrawSplitThisYear.convFree + rothDrawSplitThisYear.convPenalized,
      rothDrawEarningsTaxed: rothDrawSplitThisYear.taxableEarnings,
      rothDrawPenalized: rothDrawSplitThisYear.penalized,
      convertAmountTaxable,
      convertAmount,
      conversionTaxCost,
      conversionTrimmedForDraw,
      taxableSS,
      // Net realized capital gains on this year's Taxable draw, after the
      // harvested-loss carryforward. Exposed because it is a component of
      // both IRMAA MAGI and the Social Security provisional-income test
      // (changelog 132) and there was previously no way to verify either
      // from the ledger row.
      realizedGains: solvedRealizedGainsNet,
      stdDeduction: finalDeduction,
      seniorBonusDeduction: seniorBonusDeductionThisYear,
      seniorCount,
      acaSubsidyBoost,
      inAcaCoverageGap,
      // ACA 400% cliff (changelog 119). acaMagi/acaCliffThreshold are 0 in
      // non-marketplace years; acaSubsidyApplied is the credit netted out
      // of healthcareBridge above (before any clawback), acaSubsidyClawback
      // what a cliff-crossing year repaid, acaCliffCappedConversion how
      // much conversion the protection toggle held back.
      acaMagi,
      acaCliffThreshold,
      acaCliffBreached,
      acaSubsidyApplied,
      acaSubsidyClawback,
      // Changelog 415: the computed credit's parts. acaBenchmarkPremium is
      // the household's benchmark this year (0 in manual mode or off the
      // marketplace); acaApplicablePct the income share it was estimated
      // with (null when ineligible); acaCreditSettled the credit the
      // settled year earned; acaSubsidyRefund the excess returned at filing.
      acaBenchmarkPremium,
      acaApplicablePct,
      acaCreditSettled,
      acaSubsidyRefund,
      acaCliffCappedConversion,
      // IRMAA tier cap (changelog 250): conversion held back this year so
      // the MAGI priced two years on stays under the chosen tier, and the
      // ceiling used (0 when the cap did not apply this year).
      irmaaCappedConversion,
      irmaaCapCeiling,
      ordinaryTaxableIncome: Math.max(0, finalOrdinaryIncome - finalDeduction),
      taxBracketInflationFactor,
      // The bracket the household's next ordinary dollar lands in. On MFS
      // that dollar splits across two returns, and the larger return sets
      // the rate, so its share of the household's taxable income is what
      // is read against the MFS schedule (changelog 403).
      marginalBracket: getMarginalTaxRate(
        mfsReturnDeductions
          ? Math.max(0, finalOrdinaryIncome * mfsLargerShare(inputs, currentStatus) - mfsLargerReturnDeduction(mfsSplitForYear, mfsReturnDeductions))
          : Math.max(0, finalOrdinaryIncome - finalDeduction) * mfsLargerShare(inputs, currentStatus),
        currentStatus, taxBracketInflationFactor, inputs.tcjaSunsetEnabled),
      shortfall,
      netChange,
      growthRate: returnRate,
      // Investment fees this year (changelog 447), nominal dollars, and the
      // running total. growthRate above is before fees.
      feeRatePct: feeFraction * 100,
      feesPaid: feesPaidThisYear,
      fundExpensesPaid: fundExpensesPaidThisYear,
      advisorFeesPaid: advisorFeesPaidThisYear,
      feesPaidCumulative,
      lifestyleMultiplier: currentLifestyleMultiplier,
      housingMultiplier: currentHousingMultiplier,
      // Read back as prevMedicalMultiplier next year, the same way the other
      // two slices compound (changelog 138).
      medicalMultiplier: currentMedicalMultiplier,
      // The budget's split across the three inflation rates this year, so the
      // ledger UI can show what it is doing and tests can assert on it.
      lifestyleShape,
      // Guaranteed-income floor (changelog 139). "Guaranteed" is deliberately
      // narrow: Social Security, pensions and a purchased annuity -- income
      // that arrives whatever the portfolio does. Rental income is NOT in it
      // (a tenant can leave), and neither is a reverse-mortgage payout, which
      // is borrowing rather than income.
      //
      // essentialSpending is the SETTLED lifestyle cost for the year times
      // the essential share, so it already carries inflation, the phase
      // curve, any guardrail cut and the survivor drop. null when no ledger
      // marks anything essential -- there is then nothing to say, and the UI
      // must not invent a floor of zero.
      guaranteedIncome: ssIncome + pensionInflowThisYear + annuityPayout,
      essentialSpending: essentialShareThisYear === null ? null : lifestyleCost * essentialShareThisYear,
      essentialShare: essentialShareThisYear,
      floorGap: essentialShareThisYear === null
        ? null
        : Math.max(0, (lifestyleCost * essentialShareThisYear) - (ssIncome + pensionInflowThisYear + annuityPayout)),
      floorCovered: essentialShareThisYear === null
        ? null
        : (ssIncome + pensionInflowThisYear + annuityPayout) >= (lifestyleCost * essentialShareThisYear),
      lifestylePhase: phaseName,
      phaseMultiplier: phaseMultiplier,
      // Planned savings, as before E13: cuts (up front or in-year) are in
      // savingsDeficit, which surfaces subtract from this.
      totalContributions: totalContributions + preCutSavings,
      // The taxable bucket's assumed dividend income this year (before any
      // harvested-loss offset) -- taxed, counted in MAGI, and reinvested.
      taxableDividends: taxableDividendsFromYield,
      // The part of those dividends taken as cash rather than reinvested
      // (changelog 231). Zero in every year the mode is 'reinvest', and in
      // every pre-retirement year whatever the mode.
      dividendCash,
      // Changelog 208: the part of taxableDividends taxed as ordinary income.
      ordinaryDividends,
      // Changelog 414: the share of the yield taxed at qualified rates this
      // year (0-1), and where it came from.
      qualifiedDividendShare,
      qualifiedDividendShareSource: inputs.taxableDividendYieldSource === 'holdings' ? 'holdings' : (followsAllocation ? 'allocation' : 'manual'),
      preTaxContribution1,
      rothContribution1,
      preTaxContribution2,
      rothContribution2,
      irmaaAppealSavings,
      employerMatchAmount,
      milestoneOutflow,
      milestoneOutflowExternal,
      // Changelog 240 readouts for the ledger's "Where the money goes" view.
      // Nothing reads them back into the projection. General is the part of
      // milestoneOutflow inside expensesExcludingTaxes; the rest was paid
      // straight from the account the event named.
      milestoneOutflowGeneral,
      milestoneOutflowNames,
      // Changelog 241: whether each spouse's Medicare premiums were held off
      // this year by a current employer's plan.
      medicareDeferred1,
      medicareDeferred2,
      giftsThisYear: giftThisYear.gifted,
      surplusReinvested,
      milestoneInflow: (inputs.milestones || [])
        .filter(m => m.type === 'inflow' && age1 >= m.startAge && age1 <= m.endAge)
        .reduce((sum, m) => sum + m.amount * milestoneInflFactor(m), 0),
      inflFactor,
      annuityPayout,
    });
  }

  let peakPortfolioWorth = 0;
  let endingBalance = 0;
  let totalTaxesPaidSum = 0;
  let totalIRMAAPaidSum = 0;
  let totalRMDsForcedSum = 0;
  let isSuccessful = true;

  years.forEach(row => {
    if (row.totalPortfolioEnding > peakPortfolioWorth) peakPortfolioWorth = row.totalPortfolioEnding;
    if (row.shortfall > 0.01) isSuccessful = false;
    totalTaxesPaidSum += row.totalTaxesPaid;
    totalIRMAAPaidSum += row.irmaaCost;
    
    // The row's rmdAmount is the legally required distribution the loop
    // actually computed (pre-QCD), honouring the owner's SECURE 2.0 start
    // age and surviving-spouse ownership. Re-deriving it here from the
    // Uniform Lifetime divisor alone counted phantom RMDs at 73-74 for
    // filers whose start age is 75.
    totalRMDsForcedSum += row.rmdAmount || 0;
  });

  if (years.length > 0) {
    endingBalance = years[years.length - 1].totalPortfolioEnding;
  } else {
    // No year ran: nothing lasted, so this is not a success (E28).
    isSuccessful = false;
  }

  // "Keep at least" (changelog 448): the first retired year that ends below
  // the floor, in today's dollars. meetsFloor is the success test Monte
  // Carlo, the historical starts and the safe-spending search use: the
  // money lasted AND never dipped below the floor. With no floor it is
  // isSuccessful exactly.
  const floor = Math.max(0, Number(inputs.portfolioFloorReal) || 0);
  let floorBreachYear = null;
  if (floor > 0) {
    for (let i = 0; i < years.length; i += 1) {
      const row = years[i];
      if (!row.isRetired) continue;
      const real = ((row.totalPortfolioEnding || 0) + (row.cashReserveBalance || 0)) / (yearEndFactor(years, i) || 1);
      if (real < floor - 0.5) { floorBreachYear = row.year; break; }
    }
  }
  const meetsFloor = isSuccessful && floorBreachYear === null;

  return {
    years,
    peakPortfolioWorth,
    endingBalance,
    totalTaxesPaid: totalTaxesPaidSum,
    totalIRMAAPaid: totalIRMAAPaidSum,
    totalRMDsForced: totalRMDsForcedSum,
    isSuccessful,
    floorBreachYear,
    meetsFloor,
    householdRetirementYear,
    // E28: inputs the plan could not run as entered, each
    // { key, value, reason, usedValue }. Empty for a well-formed plan.
    invalidInputs: inputs.invalidInputs ? [...inputs.invalidInputs] : [],
    // Plan-level notices a surface can show (A24, A27), each
    // { code, message }. Nothing in the projection reads them back.
    warnings: planWarnings,
  };
}

function prevYearEnding(years) {
  if (years.length === 0) return null;
  return years[years.length - 1].totalPortfolioEnding;
}

function prevYearEndingField(years, field) {
  if (years.length === 0) return null;
  return years[years.length - 1][field];
}

function getMarginalTaxRate(taxableIncome, status, inflationFactor = 1, useTcjaSunset = false) {
  if (taxableIncome <= 0) return 0;
  const brackets = useTcjaSunset
    ? bracketsFor(status, true)
    : bracketsFor(status);
  for (let i = 0; i < brackets.length; i++) {
    const limit = brackets[i].limit === Infinity ? Infinity : brackets[i].limit * inflationFactor;
    if (taxableIncome <= limit) {
      return brackets[i].rate;
    }
  }
  return useTcjaSunset ? 0.396 : 0.37;
}

// Internal helper: run projection on already-sanitized inputs (skips sanitizeInputs overhead)
function _runProjectionPreSanitized(inputs, monteCarloReturnOverride = null, monteCarloInflationOverride = null) {
  // Temporarily bypass the public sanitize wrapper
  return runProjection(inputs, monteCarloReturnOverride, monteCarloInflationOverride);
}

// Monte Carlo Simulator (1000 trials)
//
// Changelog 247 -- the return model:
//   * Reproducible. Draws come from mulberry32 seeded with
//     inputs.monteCarloSeed, so the same plan and seed give the same
//     lifetimes, the same success probability and the same percentile
//     curves every run. Before this, 1,000 unseeded trials moved the
//     headline by a point or two on every click with nothing changed.
//   * Lognormal, not normal. Each year's gross return is m * exp(s * z)
//     with (m, s) from lognormalReturnParams, so the MEDIAN trial compounds
//     at the stated return -- the same rate the main projection uses --
//     and no draw can fall below -100% (the old floor was covering a
//     sampling artifact of the unbounded normal). The old normal draw with
//     the stated rate as its MEAN had a median compound growth of roughly
//     g - sigma^2/2 (7% and 15% gave ~5.9%), so every Monte Carlo result
//     was structurally more pessimistic than the plan it was testing.
//   * Optional inflation uncertainty (mcInflationEnabled): a second draw
//     per year, correlated with the return draw, feeds runProjection's
//     inflation override. Off by default, and off it is bit-identical to a
//     projection with no inflation override at all.
//
// Changelog 248 -- longevity, and per-trial seeding:
//   * Each trial has its OWN generator, seeded from (plan seed, trial
//     index), and the age-at-death draws come from a separate stream
//     again. So trial t's market path is the same whether longevity
//     sampling is on or off, and whether the trial runs to 85 or 101 --
//     which is what lets a test prove the sampled deaths reached the
//     projection (ON vs OFF differ ONLY through the deaths), and what makes
//     one trial reproducible on its own. Results for a given seed differ
//     from changelog 247's by construction.
//   * Optional longevity uncertainty (mcLongevityEnabled): each trial
//     draws an age at death per person from the SSA period life table
//     (utils/mortality.js) and runs the plan to THAT age instead of the
//     planned Life Expectancy. The percentile curves keep the planned
//     horizon as their x-axis; a year after a trial's last person has
//     died contributes nothing to that year's percentile, so the curves
//     read as "conditional on someone still being alive". Success counts
//     the whole trial, however long it ran.
export function runMonteCarlo(rawInputs = DEFAULT_INPUTS) {
  const inputs = sanitizeInputs(rawInputs);
  const trialsCount = 1000;
  const longevitySampled = !!inputs.mcLongevityEnabled;
  const ltcSampled = !!inputs.mcLtcEnabled;
  let trialsWithLtc = 0;
  // Per-trial seeds: a multiplicative hash of (seed, t), distinct for every
  // t below 2^32 and cheap. The life stream XORs a constant so it never
  // coincides with the market stream of any trial.
  const trialSeed = (t) => (Math.imul(inputs.monteCarloSeed, 0x9E3779B1) ^ Math.imul(t + 1, 0x85EBCA77)) >>> 0;
  let rng = mulberry32(trialSeed(0));
  const bootstrap = inputs.mcReturnModel === 'bootstrap';
  const bootstrapCenterOnPlan = inputs.mcBootstrapCenter !== 'history';
  const bootstrapBlock = Math.max(1, Math.round(Number(inputs.mcBootstrapBlockYears) || 5));
  // Under the bootstrap every sampled year carries its own inflation, so
  // inflation is always sampled there, whatever the lognormal toggle says.
  const inflationSampled = bootstrap || !!inputs.mcInflationEnabled;
  const inflationSd = Math.max(0, Number(inputs.mcInflationVolatility) || 0);
  const rho = inputs.mcInflationReturnCorrelation;
  const rhoOrth = Math.sqrt(Math.max(0, 1 - rho * rho));
  const startYear = inputs.planYear;
  
  const age1Init = startYear - inputs.birthYear1;
  const age2Init = inputs.spouse2Enabled ? (startYear - inputs.birthYear2) : age1Init;
  const lifeExpectancy1 = inputs.lifeExpectancy1;
  const lifeExpectancy2 = inputs.spouse2Enabled ? inputs.lifeExpectancy2 : 0;
  const maxYearIndex = Math.max(
    lifeExpectancy1 - age1Init, 
    inputs.spouse2Enabled ? (lifeExpectancy2 - age2Init) : 0
  );
  const horizonYear = startYear + maxYearIndex;
  const totalYears = horizonYear - startYear + 1;

  // E13: a working year's savings cuts, settled once on the plan itself and
  // handed to every trial as its starting point.
  const planDeferralCuts = runProjection(inputs).deferralCuts || null;
  let successfulTrials = 0;
  let trialsBeyondHorizon = 0;
  const trialEndBalances = [];
  const yearWiseBalances = Array.from({ length: totalYears }, () => []);
  const guardrailOn = !!(inputs.spendingGuardrails || inputs.withdrawalGuardrailsEnabled);
  const trialCosts = [];

  // Standard normal via Box-Muller on the seeded uniform. One normal per
  // call (the sine twin is discarded) so the draw sequence is simple to
  // reason about in tests: draw k of a trial is always the same uniform
  // pair for a given seed.
  function randomNormal() {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  for (let t = 0; t < trialsCount; t++) {
    rng = mulberry32(trialSeed(t));
    const trialReturns = {};
    const trialInflation = inflationSampled ? {} : null;
    // Bootstrap (changelog 267): this trial's sequence of historical rows,
    // drawn before the year loop so a block spans years the way it did.
    const bootstrapRows = bootstrap ? bootstrapPath(totalYears + 60, bootstrapBlock, rng) : null;

    // This trial's own horizon: the planned Life Expectancy ages, or, with
    // longevity sampling on, one age at death per person from the life
    // table. The life draws never touch `rng`, so the market path below is
    // identical either way.
    let trialLe1 = lifeExpectancy1;
    let trialLe2 = lifeExpectancy2;
    if (longevitySampled) {
      const lifeRng = mulberry32(trialSeed(t) ^ 0x2545F491);
      trialLe1 = sampleDeathAge(inputs.sex1, age1Init, lifeRng());
      const u2 = lifeRng();
      if (inputs.spouse2Enabled) trialLe2 = sampleDeathAge(inputs.sex2, age2Init, u2);
    }
    const trialHorizonYear = startYear + Math.max(trialLe1 - age1Init, inputs.spouse2Enabled ? (trialLe2 - age2Init) : 0);
    if (trialHorizonYear > horizonYear) trialsBeyondHorizon++;

    // Changelog 422: the loop no longer works out the phase (who is alive,
    // who is retired, the glide) -- the engine does that when it prices
    // each year's draw, so the Survivor Stress Test and every other rule
    // apply to a trial exactly as to the plan.
    for (let year = startYear; year <= trialHorizonYear; year++) {
      if (bootstrap) {
        // One real year at the plan's own mix, with its own inflation.
        // Changelog 422: the engine applies the row at its own phase's
        // mix and recenters on its own base return; the trial passes the
        // row. Inflation is the row's own either way.
        const row = HISTORICAL_RETURNS[bootstrapRows[year - startYear]];
        trialReturns[year] = { bootstrapRow: bootstrapRows[year - startYear], recenter: bootstrapCenterOnPlan };
        trialInflation[year] = bootstrapCenterOnPlan
          ? inputs.inflationRate + (row[3] - historicalMeanInflation())
          : row[3];
        continue;
      }

      // Lognormal draw whose median is the stated compound return (see the
      // function header). A stated return at or below -100% has no positive
      // median; that year is a wipeout, which is the worst a year can do.
      const zReturn = randomNormal();
      // Changelog 422: the draw alone; the engine prices it in the phase it
      // is actually in (see the override block in runProjectionCore).
      trialReturns[year] = { z: zReturn };

      if (inflationSampled) {
        // Correlated second draw (one Cholesky step): rho of the return's
        // own normal plus the orthogonal remainder. The inflation draw is
        // taken every sampled year even when inflationSd is 0, so turning
        // the volatility down to zero does not re-sequence the returns.
        const zInflation = rho * zReturn + rhoOrth * randomNormal();
        trialInflation[year] = inputs.inflationRate + inflationSd * zInflation;
      }
    }

    let trialInputs = longevitySampled
      ? { ...inputs, lifeExpectancy1: trialLe1, lifeExpectancy2: inputs.spouse2Enabled ? trialLe2 : inputs.lifeExpectancy2 }
      : inputs;
    // Long-term care as a risk (changelog 266): its own stream, so neither
    // the market path nor the life draws move when it is switched on.
    if (ltcSampled) {
      const ltcRng = mulberry32(trialSeed(t) ^ 0x7F4A7C15);
      const e1 = sampleLtcEpisode(inputs.sex1, trialLe1, ltcRng(), ltcRng(), ltcRng());
      const u2 = [ltcRng(), ltcRng(), ltcRng()];
      const e2 = inputs.spouse2Enabled ? sampleLtcEpisode(inputs.sex2, trialLe2, ...u2) : null;
      trialInputs = {
        ...trialInputs,
        ltcActive1: !!e1, ltcStartAge1: e1 ? e1.startAge : inputs.ltcStartAge1, ltcDurationYears1: e1 ? e1.years : inputs.ltcDurationYears1, ltcEndsInDeath1: false,
        ltcActive2: !!e2, ltcStartAge2: e2 ? e2.startAge : inputs.ltcStartAge2, ltcDurationYears2: e2 ? e2.years : inputs.ltcDurationYears2, ltcEndsInDeath2: false,
      };
      if (e1 || e2) trialsWithLtc++;
    }
    const result = runProjection(trialInputs, trialReturns, trialInflation, planDeferralCuts);
    
    // Changelog 448: a trial lasts only if it also keeps the "keep at
    // least" floor (meetsFloor is isSuccessful when there is none).
    if (result.meetsFloor) {
      successfulTrials++;
    }
    // Changelog 335: with a guardrail on, the success rate is partly bought
    // with spending cuts. Price them against the same trial with the rules
    // off, so the percentage never travels without its cost.
    if (guardrailOn) {
      const ref = runProjection({ ...trialInputs, spendingGuardrails: false, withdrawalGuardrailsEnabled: false }, trialReturns, trialInflation, planDeferralCuts);
      const cost = spendingCost(result, ref);
      if (cost) trialCosts.push(cost);
    }
    trialEndBalances.push(result.endingBalance);

    result.years.forEach((yr, idx) => {
      if (idx < totalYears) {
        yearWiseBalances[idx].push(yr.totalPortfolioEnding);
      }
    });
  }

  trialEndBalances.sort((a, b) => a - b);
  const successProbability = (successfulTrials / trialsCount) * 100;
  const averageEndingBalance = trialEndBalances.reduce((sum, val) => sum + val, 0) / trialsCount;

  const p10Idx = Math.floor(trialsCount * 0.10);
  const p50Idx = Math.floor(trialsCount * 0.50);
  const p90Idx = Math.floor(trialsCount * 0.90);

  const endingP10 = trialEndBalances[p10Idx];
  const endingP50 = trialEndBalances[p50Idx];
  const endingP90 = trialEndBalances[p90Idx];

  const growthCurves = [];
  for (let idx = 0; idx < totalYears; idx++) {
    const yearBal = yearWiseBalances[idx] || [];
    yearBal.sort((a, b) => a - b);
    const year = startYear + idx;
    
    const at = (q) => yearBal[Math.floor(yearBal.length * q)] || 0;
    // p25/p75 (changelog 450) for the Monte Carlo CSV; the chart draws
    // p10-p90 around the median.
    growthCurves.push({
      year,
      p10: Math.round(at(0.10)),
      p25: Math.round(at(0.25)),
      p50: Math.round(at(0.50)),
      p75: Math.round(at(0.75)),
      p90: Math.round(at(0.90)),
      // Share of trials with money left at the end of this year (changelog 450).
      fundedPct: yearBal.length ? (yearBal.filter((b) => b > 0.5).length / yearBal.length) * 100 : 0,
    });
  }

  const sortedBy = (f) => trialCosts.map(f).sort((a, b) => a - b);
  const spendingCostSummary = guardrailOn && trialCosts.length > 0 ? {
    // Share of trials in which a rule cut spending at all.
    trialsWithCutPct: (trialCosts.filter((c) => c.deepestCut > 0.001).length / trialCosts.length) * 100,
    medianDeepestCut: sortedBy((c) => c.deepestCut)[Math.floor(trialCosts.length / 2)],
    // One trial in ten cut at least this deep.
    p90DeepestCut: sortedBy((c) => c.deepestCut)[Math.floor(trialCosts.length * 0.9)],
    medianLifetimeShare: sortedBy((c) => c.lifetimeShare)[Math.floor(trialCosts.length / 2)],
  } : null;
  return {
    // Null unless a guardrail is on (changelog 335).
    spendingCost: spendingCostSummary,
    successProbability,
    averageEndingBalance,
    endingP10,
    endingP50,
    endingP90,
    growthCurves,
    // Changelog 247: what produced these figures, for the panel to say.
    seed: inputs.monteCarloSeed,
    trials: trialsCount,
    returnModel: bootstrap ? 'bootstrap' : 'lognormal',
    bootstrapBlockYears: bootstrap ? bootstrapBlock : null,
    bootstrapCenter: bootstrap ? (bootstrapCenterOnPlan ? 'plan' : 'history') : null,
    historyRange: bootstrap ? `${HISTORY_FIRST_YEAR}\u2013${HISTORY_LAST_YEAR}` : null,
    inflationSampled,
    longevitySampled,
    ltcSampled,
    ltcTrialsPct: ltcSampled ? (trialsWithLtc / trialsCount) * 100 : 0,
    // Share of trials in which someone outlived the planned horizon --
    // the longevity risk a fixed Life Expectancy hides. 0 when not sampled.
    beyondHorizonPct: (trialsBeyondHorizon / trialsCount) * 100,
  };
}

// Optimization Module
//
// Changelog 428: what the optimizers rank. A plan's ending balance adds a
// Pre-Tax dollar to a Roth dollar as if they were worth the same, so any
// strategy that leaves tax unpaid -- no conversions, Pre-Tax last -- won on
// that figure, and a conversion that paid 22% today to spare the heirs 32%
// later lost. The figure every optimizer ranks on is now the legacy after
// every tax: the Estate Legacy Planner's net to heirs for the projection's
// final year (calculateHeirEstateTax, the same call the Tax & Estate tab
// makes), which prices the inherited Pre-Tax balance at the heirs' own
// rates over their ten-year draw, the Roth and stepped-up assets at nothing,
// and the estate taxes. The ending balance is still reported beside it.
export function legacyAfterTaxes(inputs, proj) {
  const years = proj?.years || [];
  if (years.length === 0) return 0;
  const last = years[years.length - 1];
  const estate = calculateHeirEstateTax(
    inputs,
    last.preTaxEnd || 0, last.rothEnd || 0, last.taxableEnd || 0,
    last.lifeInsuranceNetDeathBenefit1 || 0, last.lifeInsuranceNetDeathBenefit2 || 0,
    false, last.hsaEnd || 0,
    {
      nqdc: (last.nqdcBalance1 || 0) + (last.nqdcBalance2 || 0),
      cashReserve: last.cashReserveBalance || 0,
      concentratedStock: (last.concentratedStockBalance || 0) + (last.concentratedStock2Balance || 0),
      homeEquity: last.homeEquity || 0,
      otherAssets: last.otherEstateAssetsValue || 0,
    }
  );
  if (!Number.isFinite(estate?.netInherited)) return 0;
  // The Legacy Planner draws the inherited Pre-Tax balance down over the
  // heirs' ten years and nets its growth over those years; the Roth and
  // the taxable account are taken at their value at death. For ranking,
  // the Pre-Tax balance is taken at death too, less the heirs' tax at the
  // effective rate the ten-year draw priced -- otherwise the ten years of
  // post-death growth would favor whatever left the most in Pre-Tax.
  //
  // Changelog 438: the Pre-Tax balance priced here is the HEIRS' share --
  // what is left after a charitable bequest funded from Pre-Tax -- not the
  // whole ending balance, which until 438 handed the charity's share back
  // to the heirs and made a bequest raise the ranking key. And the heirs'
  // state income tax on the ten-year draw is part of the rate: the state
  // part of netInherited was priced on the grown pool, so stripping only
  // the federal part left the state's growth share deducted against the
  // ungrown balance (a California heir's key sat ~$175k low on a $1.9M
  // IRA). The year-one HSA and NQDC lumps share the state figure; their
  // part is apportioned off by size.
  const withdrawn = Math.max(0, Number(estate.totalPreTaxWithdrawn) || 0);
  const federalHeirTax = Math.max(0, Number(estate.totalHeirTax) || 0);
  const stateHeirTax = Math.max(0, Number(estate.totalHeirStateIncomeTax) || 0);
  const composition = estate.composition || {};
  const lumps = Math.max(0, Number(composition.hsa) || 0) + Math.max(0, Number(composition.nqdc) || 0);
  const stateOnDraw = withdrawn + lumps > 0 ? stateHeirTax * (withdrawn / (withdrawn + lumps)) : 0;
  const heirTax = federalHeirTax + stateOnDraw;
  const preTaxAtDeath = Math.max(0, Number.isFinite(composition.preTaxAtDeath) ? composition.preTaxAtDeath : (last.preTaxEnd || 0));
  const effectiveRate = withdrawn > 0 ? Math.min(1, heirTax / withdrawn) : 0;
  return estate.netInherited - Math.max(0, withdrawn - heirTax) + preTaxAtDeath * (1 - effectiveRate);
}
// The ranking key: a plan that runs short ranks below any that lasts,
// whatever its heirs would have kept.
const rankKey = (r) => (r.isSuccessful ? 1 : 0) * 1e15 + (r.afterTaxLegacy ?? r.endingBalance ?? 0);

// Builds the Tax Optimizer Hub's dynamic card (changelog 110) from the
// already-computed Roth Ladder grid: the single best
// {target bracket} x {withdrawal order} combination by ending balance.
// Returns null when the grid is empty or its winner is already one of the
// Hub's nine fixed cards (the 3x3 matrix below: 22%/24% conversions at
// TaxableFirst/PreTaxFirst/ProRata; the no-conversion column can't win
// here because every grid cell converts), so the Hub never shows a
// duplicate. Costs one extra projection in runOptimizer rather than
// re-running the 28-cell grid.
export function gridBestExtraStrategy(rothBracketHeatmapData) {
  if (!Array.isArray(rothBracketHeatmapData) || rothBracketHeatmapData.length === 0) return null;
  const best = rothBracketHeatmapData.reduce((b, c) => (!b || rankKey(c) > rankKey(b) ? c : b), null);
  if (!best) return null;
  if (['TaxableFirst', 'PreTaxFirst', 'ProRata'].includes(best.withdrawalStrategy) && [0.22, 0.24].includes(best.bracket)) return null;
  const orderLabels = { TaxableFirst: 'Taxable First', PreTaxFirst: 'Pre-Tax First', RothFirst: 'Roth First', ProRata: 'Pro-Rata' };
  const pct = Math.round(best.bracket * 100);
  return {
    id: 'grid_best',
    name: `Full-Grid Best: ${pct}% Bracket + ${orderLabels[best.withdrawalStrategy] || best.withdrawalStrategy}`,
    description: `Best of all ${rothBracketHeatmapData.length} combinations in the Roth Ladder Optimizer's full grid.`,
    config: { withdrawalStrategy: best.withdrawalStrategy, rothConversionStrategy: 'maxBracket', rothConversionBracket: best.bracket, rothConversionDurationYears: 0 },
  };
}

export function runOptimizer(rawInputs = DEFAULT_INPUTS, extraStrategies = []) {
  // Sanitize once; each strategy merges on top of the clean base
  const inputs = sanitizeInputs(rawInputs);
  // A full 3x3 matrix (changelog 112): the three withdrawal orders, each
  // with no conversions, 22%-bracket conversions, and 24%-bracket
  // conversions -- so the Hub shows how the order and the conversion
  // interact, not just each in isolation. The 12%-bracket card was
  // retired with the matrix; the Roth Ladder grid still tests it (and
  // 10/32/35/37%), and gridBestExtraStrategy surfaces any of those when
  // one wins, displacing the worst card so the Hub always shows exactly
  // nine (see the clip below the sort). Ids roth_conv_22/roth_conv_24
  // keep their pre-matrix meaning (Taxable First order).
  const strategies = [
    {
      id: 'taxable_first',
      name: 'Taxable First',
      description: 'Spend Taxable first, then Pre-Tax, then Roth. No conversions.',
      config: { withdrawalStrategy: 'TaxableFirst', rothConversionStrategy: 'none' }
    },
    {
      id: 'roth_conv_22',
      name: 'Taxable First + 22% Conversions',
      description: 'Spend Taxable first. Convert Pre-Tax to Roth up to the top of the 22% bracket.',
      config: { withdrawalStrategy: 'TaxableFirst', rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.22 }
    },
    {
      id: 'roth_conv_24',
      name: 'Taxable First + 24% Conversions',
      description: 'Spend Taxable first. Convert Pre-Tax to Roth up to the top of the 24% bracket.',
      config: { withdrawalStrategy: 'TaxableFirst', rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.24 }
    },
    {
      id: 'pretax_first',
      name: 'Pre-Tax First',
      description: 'Spend Pre-Tax first, then Taxable, then Roth. No conversions.',
      config: { withdrawalStrategy: 'PreTaxFirst', rothConversionStrategy: 'none' }
    },
    {
      id: 'roth_conv_22_pretax',
      name: 'Pre-Tax First + 22% Conversions',
      description: 'Spend Pre-Tax first. Convert Pre-Tax to Roth up to the top of the 22% bracket.',
      config: { withdrawalStrategy: 'PreTaxFirst', rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.22 }
    },
    {
      id: 'roth_conv_24_pretax',
      name: 'Pre-Tax First + 24% Conversions',
      description: 'Spend Pre-Tax first. Convert Pre-Tax to Roth up to the top of the 24% bracket.',
      config: { withdrawalStrategy: 'PreTaxFirst', rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.24 }
    },
    {
      id: 'pro_rata',
      name: 'Pro-Rata',
      description: 'Withdraw proportionally from all accounts. No conversions.',
      config: { withdrawalStrategy: 'ProRata', rothConversionStrategy: 'none' }
    },
    {
      id: 'roth_conv_22_prorata',
      name: 'Pro-Rata + 22% Conversions',
      description: 'Withdraw proportionally. Convert Pre-Tax to Roth up to the top of the 22% bracket.',
      config: { withdrawalStrategy: 'ProRata', rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.22 }
    },
    {
      id: 'roth_conv_24_prorata',
      name: 'Pro-Rata + 24% Conversions',
      description: 'Withdraw proportionally. Convert Pre-Tax to Roth up to the top of the 24% bracket.',
      config: { withdrawalStrategy: 'ProRata', rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.24 }
    }
  ];
  // Optional dynamic additions (e.g. gridBestExtraStrategy above). Null
  // entries are dropped so callers can pass the helper's result directly.
  for (const extra of extraStrategies) {
    if (extra && extra.config) strategies.push(extra);
  }

  // Use pre-sanitized inputs for each strategy to avoid redundant sanitize calls
  const results = strategies.map(strat => {
    const mergedInputs = { ...inputs, ...strat.config };
    const res = _runProjectionPreSanitized(mergedInputs);
    // Survivor-Phase Taxes: the slice of totalTaxes paid during years where
    // one spouse has already passed (householdStatus flips from MFJ to
    // Single -- see the currentStatus logic in the main simulation loop,
    // driven purely by each spouse's Life Expectancy input). Broken out
    // separately here because it's otherwise invisible: totalTaxes blends
    // married and widow(er) years into one number, so two strategies with
    // similar lifetime totals can differ a lot in how much of that burden
    // lands on the surviving spouse alone at Single-filer brackets -- which
    // is exactly the risk Roth-conversion-heavy strategies are meant to
    // reduce (shrinking the pre-tax balance, and therefore future RMDs,
    // before a lone survivor is stuck paying tax on them at worse rates).
    // Only meaningful for two-spouse households; single-filer plans never
    // have a "survivor phase" to isolate.
    const survivorPhaseTaxes = inputs.spouse2Enabled
      ? res.years.reduce((sum, y) => sum + (y.householdStatus === 'Single' ? y.totalTaxesPaid : 0), 0)
      : 0;
    return {
      id: strat.id,
      name: strat.name,
      description: strat.description,
      endingBalance: res.endingBalance,
      afterTaxLegacy: legacyAfterTaxes(mergedInputs, res),
      totalTaxes: res.totalTaxesPaid,
      totalIRMAA: res.totalIRMAAPaid,
      totalRMDs: res.totalRMDsForced,
      survivorPhaseTaxes,
      isSuccessful: res.isSuccessful,
      config: strat.config,
    };
  });

  results.sort((a, b) => rankKey(b) - rankKey(a));

  // Keep the Hub a full 3x3 (changelog 113): when a dynamic extra (the
  // Full-Grid Best card) pushes the count past nine, drop the worst
  // performer(s) so exactly nine cards render. The grid-best card itself
  // can be the one clipped -- that just means the grid's winner loses to
  // every fixed card, so there's nothing better to surface. Ranking labels
  // are assigned after the clip so the last *visible* card reads "Worst".
  if (results.length > 9) results.splice(9);

  results.forEach((res, index) => {
    if (!res.isSuccessful) {
      res.ranking = 'Shortfall';
    } else if (index === 0) {
      res.ranking = 'Best';
    } else if (index === 1) {
      res.ranking = 'Great';
    } else if (index === results.length - 1 || (!results[index + 1]?.isSuccessful && res.isSuccessful)) {
      res.ranking = 'Worst';
    } else {
      res.ranking = 'Moderate';
    }
  });

  return results;
}

// Pre-Tax vs. Roth Contribution Split Optimizer: unlike getContributionAdvisory
// above (which only reports usage/room against IRS limits, with no opinion on
// tax treatment), this actually tests different Pre-Tax/Roth SPLITS of each
// working spouse's contribution and reports which split leaves the largest
// ending balance -- the same "run several deterministic projection variants
// off one baseline, then rank them" shape as runOptimizer above. Each
// spouse's TOTAL contribution (preTax + Roth) is held fixed across every
// split tested -- this optimizes the TAX TREATMENT of savings already
// planned, not how much is saved.
//
// `realDollars` re-prices every figure this returns into TODAY's dollars, to
// match the app-wide Real/Nominal toggle (App.jsx's useRealDollars, which
// defaults ON). Without it this section reported raw future dollars while
// every other balance on screen -- including the sticky Plan Status chip
// reading the same projection -- reported today's dollars, so a plan whose
// chip said $2.4M had an optimizer saying $5.6M directly above it. The two
// were never in disagreement about the plan; they were quoting different
// currencies with no label. Same treatment computeOptimizerResultsReal
// already applies to runOptimizer's output.
export function getContributionSplitOptimizer(rawInputs = DEFAULT_INPUTS, { realDollars = false } = {}) {
  const inputs = sanitizeInputs(rawInputs);

  const total1 = Math.max(0, (inputs.preTaxContribution1 || 0) + (inputs.rothContribution1 || 0));
  const total2 = inputs.spouse2Enabled ? Math.max(0, (inputs.preTaxContribution2 || 0) + (inputs.rothContribution2 || 0)) : 0;

  // Auto-Max Contribution locks that spouse's Pre-Tax dollar amount to the
  // year's IRS limit regardless of what's passed in -- there's no "split"
  // left to optimize for a spouse in that mode (see the autoMaxContribution1
  // handling in runProjection). Rather than silently produce a misleading
  // result, this reports why it doesn't apply.
  const autoMaxSpouse1 = !!(inputs.autoMaxContribution1 && inputs.autoMaxContribution1 !== 'off');
  const autoMaxSpouse2 = !!(inputs.spouse2Enabled && inputs.autoMaxContribution2 && inputs.autoMaxContribution2 !== 'off');

  // Which spouses actually have a free (non-auto-max, non-zero) split to
  // search -- the ONLY thing that determines whether this optimizer has
  // anything useful to say.
  const searchSpouse1 = total1 > 0 && !autoMaxSpouse1;
  const searchSpouse2 = total2 > 0 && !autoMaxSpouse2;

  if (!searchSpouse1 && !searchSpouse2) {
    return {
      applicable: false,
      reason: (total1 <= 0 && total2 <= 0)
        ? 'No Pre-Tax or Roth contribution is currently configured.'
        : 'Auto-Max Contribution is on for every contributing spouse, which fixes Pre-Tax to the IRS limit — there\'s no split left to optimize.',
      results: [], current: null, best: null,
    };
  }

  // A coarse-but-informative 5-point grid per spouse -- cheap enough (up to
  // 25 combinations for a two-income household) to run synchronously, and
  // fine enough to reveal whether the plan clearly favors one end over a mix.
  const ROTH_PCTS = [0, 25, 50, 75, 100];

  // An ending balance is a single figure at the plan's LAST year, so it
  // discounts by that year's inflation factor. Total taxes are a sum across
  // every year, each paid in its own year's dollars, so they have to be
  // discounted year by year and re-summed -- dividing the nominal total by
  // the final factor would understate them badly, since most of the tax is
  // paid decades before the end. computeOptimizerResultsReal makes the same
  // distinction; this is that logic applied to one projection result.
  const priceResult = (res, usedInputs) => {
    const afterTax = legacyAfterTaxes(usedInputs, res);
    if (!realDollars || !res.years || res.years.length === 0) {
      return { endingBalance: res.endingBalance, afterTaxLegacy: afterTax, totalTaxes: res.totalTaxesPaid };
    }
    const finalFactor = finalBalanceFactor(res.years);
    let discountedTaxes = 0;
    for (const y of res.years) discountedTaxes += (y.totalTaxesPaid || 0) / (y.inflFactor || 1);
    return { endingBalance: res.endingBalance / finalFactor, afterTaxLegacy: afterTax / finalFactor, totalTaxes: discountedTaxes };
  };

  const runSplit = (pct1, pct2) => {
    const roth1 = searchSpouse1 ? total1 * (pct1 / 100) : (inputs.rothContribution1 || 0);
    const preTax1 = searchSpouse1 ? (total1 - roth1) : (inputs.preTaxContribution1 || 0);
    const roth2 = searchSpouse2 ? total2 * (pct2 / 100) : (inputs.rothContribution2 || 0);
    const preTax2 = searchSpouse2 ? (total2 - roth2) : (inputs.preTaxContribution2 || 0);
    const splitInputs = {
      ...inputs,
      preTaxContribution1: preTax1,
      rothContribution1: roth1,
      preTaxContribution2: preTax2,
      rothContribution2: roth2,
    };
    const res = _runProjectionPreSanitized(splitInputs);
    const priced = priceResult(res, splitInputs);
    return {
      pct1: searchSpouse1 ? pct1 : null,
      pct2: searchSpouse2 ? pct2 : null,
      preTax1, roth1, preTax2, roth2,
      endingBalance: priced.endingBalance,
      afterTaxLegacy: priced.afterTaxLegacy,
      totalTaxes: priced.totalTaxes,
      isSuccessful: res.isSuccessful,
    };
  };

  const results = [];
  const pcts1 = searchSpouse1 ? ROTH_PCTS : [null];
  const pcts2 = searchSpouse2 ? ROTH_PCTS : [null];
  for (const p1 of pcts1) {
    for (const p2 of pcts2) {
      results.push(runSplit(p1 ?? 0, p2 ?? 0));
    }
  }

  // Today's actual mix, for an apples-to-apples "current vs. best"
  // comparison -- runs the EXACT configured dollar amounts directly (not
  // reconstructed from a rounded %), so "current" always matches Settings
  // precisely rather than an approximation.
  const currentRes = _runProjectionPreSanitized(inputs);
  const currentPriced = priceResult(currentRes, inputs);
  const current = {
    pct1: total1 > 0 ? Math.round(((inputs.rothContribution1 || 0) / total1) * 100) : null,
    pct2: total2 > 0 ? Math.round(((inputs.rothContribution2 || 0) / total2) * 100) : null,
    preTax1: inputs.preTaxContribution1 || 0,
    roth1: inputs.rothContribution1 || 0,
    preTax2: inputs.preTaxContribution2 || 0,
    roth2: inputs.rothContribution2 || 0,
    endingBalance: currentPriced.endingBalance,
    afterTaxLegacy: currentPriced.afterTaxLegacy,
    totalTaxes: currentPriced.totalTaxes,
    isSuccessful: currentRes.isSuccessful,
  };

  // Best = largest legacy after every tax (changelog 428; the ending
  // balance counted a Pre-Tax dollar as a Roth dollar, which favored Pre-Tax
  // savings whatever the heirs would keep) among splits that don't
  // introduce a shortfall; if every split fails, fall back to the least-bad
  // one so there's still a recommendation rather than nothing.
  const successful = results.filter(r => r.isSuccessful);
  const pool = successful.length > 0 ? successful : results;
  const best = pool.reduce((a, b) => (b.afterTaxLegacy > a.afterTaxLegacy ? b : a));

  return {
    applicable: true,
    // Echoed back so the UI can label the figures it renders rather than
    // assuming -- an unlabelled dollar amount is exactly how this went wrong.
    realDollars,
    total1, total2,
    searchSpouse1, searchSpouse2,
    results,
    current,
    best,
    improvement: best.afterTaxLegacy - current.afterTaxLegacy,
  };
}

// Minimum Required Rate of Return solver: answers "what flat annual
// investment return would my plan need, at minimum, to not run out of
// money?" -- the mirror image of Monte Carlo (which asks "how likely am I
// to succeed at my ASSUMED return") and of the FI/CoastFIRE crossover (which
// asks about savings, not investment performance). Binary-searches a single
// flat rate applied to BOTH preRetireReturn and postRetireReturn, with
// rebalancing, the equity glide path, and any Historical Stress Test
// disabled for the search itself -- those are all mechanisms for varying
// the return rate over time or by allocation, which would make "the"
// required return ambiguous. The result is a clean, single number to
// compare against your actual assumed return.
export function getMinimumRequiredReturn(rawInputs = DEFAULT_INPUTS) {
  const inputs = sanitizeInputs(rawInputs);

  // What the plan is ACTUALLY assumed to earn pre-retirement today, for
  // comparison against the solved minimum -- accounts for the
  // stock/bond-blend mode (rebalancingEnabled) as well as the simple flat
  // preRetireReturn mode, so the comparison is meaningful either way.
  const currentAssumedReturn = inputs.rebalancingEnabled
    ? ((inputs.stockAllocationPre * inputs.stockReturnRate) + ((100 - inputs.stockAllocationPre) * inputs.bondReturnRate)) / 100
    : inputs.preRetireReturn;

  // Runs the projection at a single flat rate, isolated from the plan's own
  // allocation/glide-path/stress-test settings so the search question stays
  // exactly "what flat return is required" rather than "what return
  // multiplier on my current glide path is required."
  const testAtFlatRate = (rate) => _runProjectionPreSanitized({
    ...inputs,
    preRetireReturn: rate,
    postRetireReturn: rate,
    rebalancingEnabled: false,
    equityGlidePathEnabled: false,
    glideAllocationEnabled: false,
    stressType: 'none',
  });

  // Search bounds. -10% covers "even losing money every year" for plans
  // funded almost entirely by savings/income; 30% is comfortably above any
  // real long-run diversified-portfolio assumption, so failing at 30% means
  // no realistic rate of return alone fixes this plan (it needs a spending
  // cut, later retirement, or more savings instead).
  const LOWER_BOUND = -10;
  const UPPER_BOUND = 30;

  // Whether the plan succeeds under its OWN actual settings today
  // (allocation/glide-path/stress-test included) -- distinct from the
  // isolated flat-rate search used to find the minimum below.
  const currentPlanSucceeds = _runProjectionPreSanitized(inputs).isSuccessful;

  const succeedsAtLower = testAtFlatRate(LOWER_BOUND).isSuccessful;
  const succeedsAtUpper = testAtFlatRate(UPPER_BOUND).isSuccessful;

  // Plan already succeeds even losing money every year -- no meaningful
  // "minimum" to report beyond "less than our floor."
  if (succeedsAtLower) {
    return {
      requiredReturn: LOWER_BOUND,
      feasible: true,
      belowSearchFloor: true,
      currentAssumedReturn,
      currentPlanSucceeds,
    };
  }

  // Plan fails even at a very optimistic 30%/yr -- investment return isn't
  // the lever that can save this plan.
  if (!succeedsAtUpper) {
    return {
      requiredReturn: null,
      feasible: false,
      belowSearchFloor: false,
      currentAssumedReturn,
      currentPlanSucceeds,
    };
  }

  // Bisection: isSuccessful is assumed monotonic non-decreasing in the flat
  // rate (more growth generically helps, since withdrawal need is driven by
  // spending/tax inputs the search holds fixed) -- 40 iterations gets well
  // past 0.0001-percentage-point precision, far tighter than needed for a
  // number rounded to 0.1% in the UI.
  let low = LOWER_BOUND;
  let high = UPPER_BOUND;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (testAtFlatRate(mid).isSuccessful) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return {
    requiredReturn: high,
    feasible: true,
    belowSearchFloor: false,
    currentAssumedReturn,
    currentPlanSucceeds,
  };
}

// Sensitivity / Tornado Analysis: a one-at-a-time (OAT) sensitivity test.
// For each of a handful of core planning assumptions, reruns the
// projection twice -- once nudged unfavorably, once nudged favorably --
// holding every other input at its current value, and measures how much
// the ending balance moves relative to the baseline. Results are sorted
// by impact magnitude (largest swing first), which is exactly what a
// "tornado chart" visualizes: the assumption a plan is most sensitive to
// sits at the top, with the widest bar. This deliberately reuses the
// same sanitize-once/_runProjectionPreSanitized pattern as runOptimizer
// above, since it's the same "run several deterministic projection
// variants off one baseline" shape.
export function runSensitivityAnalysis(rawInputs = DEFAULT_INPUTS) {
  const inputs = sanitizeInputs(rawInputs);
  const baseline = _runProjectionPreSanitized(inputs);
  const baseEnding = baseline.endingBalance;

  const variables = [
    {
      key: 'investmentReturn',
      label: 'Investment Returns',
      unitLabel: '±1.5 percentage points',
      lowLabel: 'Returns −1.5pp',
      highLabel: 'Returns +1.5pp',
      delta: 1.5,
      // Applies to whichever return-rate fields are actually active for
      // this plan (the simple pre/post-retirement pair, or the stock/
      // bond blend used when Dynamic Asset Allocation is enabled) --
      // adjusting all four is harmless, since only the active pair is
      // ever read by runProjection.
      apply: (delta) => ({
        ...inputs,
        preRetireReturn: inputs.preRetireReturn + delta,
        postRetireReturn: inputs.postRetireReturn + delta,
        stockReturnRate: inputs.stockReturnRate + delta,
        bondReturnRate: inputs.bondReturnRate + delta,
      }),
    },
    {
      key: 'inflation',
      label: 'Inflation Rate',
      unitLabel: '±1.0 percentage point',
      lowLabel: 'Inflation −1.0pp',
      highLabel: 'Inflation +1.0pp',
      delta: 1.0,
      apply: (delta) => ({ ...inputs, inflationRate: inputs.inflationRate + delta }),
    },
    {
      key: 'longevity',
      // Only Spouse 1's age moves, so the label names them the way the rest
      // of the app does: the plan's name, or "Your" when there is none.
      label: inputs.spouse1Name
        ? `${inputs.spouse1Name}${String(inputs.spouse1Name).endsWith('s') ? "'" : "'s"} Life Expectancy`
        : 'Your Life Expectancy',
      unitLabel: '±5 years',
      lowLabel: 'Live 5 yrs less',
      highLabel: 'Live 5 yrs more',
      delta: 5,
      apply: (delta) => ({ ...inputs, lifeExpectancy1: Math.max(inputs.retireAge1 + 1, inputs.lifeExpectancy1 + delta) }),
    },
    {
      key: 'spending',
      label: 'Annual Lifestyle Spending',
      unitLabel: '±10%',
      lowLabel: 'Spend 10% less',
      highLabel: 'Spend 10% more',
      delta: 10,
      apply: (deltaPct) => ({ ...inputs, lifestyleExpense: Math.max(0, inputs.lifestyleExpense * (1 + deltaPct / 100)) }),
    },
  ];

  const results = variables.map(v => {
    const lowProj = _runProjectionPreSanitized(v.apply(-v.delta));
    const highProj = _runProjectionPreSanitized(v.apply(v.delta));
    const lowDelta = lowProj.endingBalance - baseEnding;
    const highDelta = highProj.endingBalance - baseEnding;
    return {
      key: v.key,
      label: v.label,
      unitLabel: v.unitLabel,
      low: { endingBalance: lowProj.endingBalance, delta: lowDelta, isSuccessful: lowProj.isSuccessful, scenarioLabel: v.lowLabel },
      high: { endingBalance: highProj.endingBalance, delta: highDelta, isSuccessful: highProj.isSuccessful, scenarioLabel: v.highLabel },
      impact: Math.max(Math.abs(lowDelta), Math.abs(highDelta)),
    };
  });

  results.sort((a, b) => b.impact - a.impact);

  return {
    baseline: { endingBalance: baseEnding, isSuccessful: baseline.isSuccessful },
    results,
  };
}

// Re-prices runSensitivityAnalysis's baseline/low/high ending balances into
// today's dollars when the real-dollars toggle is on. Each variant is
// deflated by its OWN final year's inflation factor (not the baseline's)
// since the longevity variable changes the plan horizon length, which
// changes how many years of inflation compound into the final factor.
export function computeSensitivityAnalysisReal(rawInputs) {
  const inputs = sanitizeInputs(rawInputs);
  const raw = runSensitivityAnalysis(inputs);

  const deflate = (variantInputs) => {
    const proj = _runProjectionPreSanitized(variantInputs);
    const lastYearFactor = finalBalanceFactor(proj.years);
    return { endingBalance: proj.endingBalance / lastYearFactor, isSuccessful: proj.isSuccessful };
  };

  const baselineReal = deflate(inputs);

  const variables = [
    {
      key: 'investmentReturn',
      delta: 1.5,
      apply: (delta) => ({
        ...inputs,
        preRetireReturn: inputs.preRetireReturn + delta,
        postRetireReturn: inputs.postRetireReturn + delta,
        stockReturnRate: inputs.stockReturnRate + delta,
        bondReturnRate: inputs.bondReturnRate + delta,
      }),
    },
    {
      key: 'inflation',
      delta: 1.0,
      apply: (delta) => ({ ...inputs, inflationRate: inputs.inflationRate + delta }),
    },
    {
      key: 'longevity',
      delta: 5,
      apply: (delta) => ({ ...inputs, lifeExpectancy1: Math.max(inputs.retireAge1 + 1, inputs.lifeExpectancy1 + delta) }),
    },
    {
      key: 'spending',
      delta: 10,
      apply: (deltaPct) => ({ ...inputs, lifestyleExpense: Math.max(0, inputs.lifestyleExpense * (1 + deltaPct / 100)) }),
    },
  ];

  const results = raw.results.map(res => {
    const v = variables.find(x => x.key === res.key);
    const lowReal = deflate(v.apply(-v.delta));
    const highReal = deflate(v.apply(v.delta));
    const lowDelta = lowReal.endingBalance - baselineReal.endingBalance;
    const highDelta = highReal.endingBalance - baselineReal.endingBalance;
    return {
      key: res.key,
      label: res.label,
      unitLabel: res.unitLabel,
      low: { endingBalance: lowReal.endingBalance, delta: lowDelta, isSuccessful: lowReal.isSuccessful, scenarioLabel: res.low.scenarioLabel },
      high: { endingBalance: highReal.endingBalance, delta: highDelta, isSuccessful: highReal.isSuccessful, scenarioLabel: res.high.scenarioLabel },
      impact: Math.max(Math.abs(lowDelta), Math.abs(highDelta)),
    };
  });

  results.sort((a, b) => b.impact - a.impact);

  return {
    baseline: baselineReal,
    results,
  };
}

// Spouse 2's retirement age in the calendar year Spouse 1 reaches
// spouse1RetireAge -- both stop working the same year -- never below Spouse
// 2's own age today. The age finder, its today's-dollars twin and the
// Readiness what-if all share it (E16): each used to floor Spouse 2 at
// Spouse 1's age (or at 50), which kept a younger Spouse 2 working for
// years after Spouse 1 retired.
export function spouse2RetireAgeMatching(inputs, spouse1RetireAge) {
  const currentAge2 = inputs.planYear - inputs.birthYear2;
  return Math.max(currentAge2, spouse1RetireAge - (inputs.birthYear2 - inputs.birthYear1));
}

// Find the earliest funded retirement age
// Focuses on a 14-year window: 5 years before chosen retirement age to 8 years after
export function findOptimalRetirementAge(rawInputs = DEFAULT_INPUTS) {
  const inputs = sanitizeInputs(rawInputs);
  const startYear = inputs.planYear;
  const currentAge1 = startYear - inputs.birthYear1;
  // Start 5 years before the user's current target retire age, but never before today's age
  const windowStart = Math.max(currentAge1 + 1, inputs.retireAge1 - 5);
  const windowEnd = Math.min(windowStart + 13, 80);

  const ages = [];
  let earliestFundedAge = null;

  for (let age = windowStart; age <= windowEnd; age++) {
    const testInputs = {
      ...inputs,
      retireAge1: age,
      retireAge2: inputs.spouse2Enabled ? spouse2RetireAgeMatching(inputs, age) : age,
    };
    // Use pre-sanitized inputs
    const result = _runProjectionPreSanitized(testInputs);

    ages.push({
      age,
      endingBalance: result.endingBalance,
      isSuccessful: result.isSuccessful,
    });

    if (result.isSuccessful && earliestFundedAge === null) {
      earliestFundedAge = age;
    }
  }

  return {
    simulations: ages,
    earliestFundedAge,
  };
}

// Die with Zero Strategy Optimizer (maximizes lifestyle spend to end at $0 balance)
// Returns the optimal spending level AND the final projection so callers don't need to re-run it.
export const DIE_WITH_ZERO_CEILING = 5000000;

// The largest lifestyle spend the plan survives to its horizon.
//
// Contract (E17, 2026-09-30 review). `reason` says what the number means:
//   'ok'            -- dieWithZeroSpending is the answer.
//   'above-ceiling' -- even DIE_WITH_ZERO_CEILING a year works; the figure
//                      returned is that ceiling, a lower bound, not an answer.
//   'none-works'    -- not even $0 of lifestyle spending lasts;
//                      dieWithZeroSpending and additionalAnnualSpend are null.
//   'no-rows'       -- the plan has no retired years (never retires, or no
//                      rows at all), so lifestyle spending cannot move the
//                      outcome; both figures are null.
// It used to return the plan's own lifestyleExpense for 'none-works' and the
// ceiling for the other two, each indistinguishable from a real answer.
// finalProjection is always a projection the charts can draw: the solved
// spend, the ceiling, or the plan as it stands.
export function findDieWithZeroSpending(rawInputs = DEFAULT_INPUTS) {
  const inputs = sanitizeInputs(rawInputs);
  const ceiling = DIE_WITH_ZERO_CEILING;

  const asIs = _runProjectionPreSanitized(inputs);
  if (!asIs.years.some((y) => y.isRetired)) {
    return { dieWithZeroSpending: null, additionalAnnualSpend: null, reason: 'no-rows', ceiling, finalProjection: asIs };
  }

  const atCeiling = _runProjectionPreSanitized({ ...inputs, lifestyleExpense: ceiling });
  if (atCeiling.isSuccessful) {
    return {
      dieWithZeroSpending: ceiling,
      additionalAnnualSpend: Math.max(0, ceiling - inputs.lifestyleExpense),
      reason: 'above-ceiling',
      ceiling,
      finalProjection: atCeiling,
    };
  }

  let low = 0;
  let high = ceiling;
  let bestSpending = null;
  let finalProjection = null;

  for (let iter = 0; iter < 40; iter++) {
    const mid = (low + high) / 2;
    const testInputs = { ...inputs, lifestyleExpense: mid };
    const result = _runProjectionPreSanitized(testInputs);

    // We check if it is successful and does not run out early
    if (result.isSuccessful && result.endingBalance >= 0) {
      bestSpending = mid;
      finalProjection = result;
      low = mid;
    } else {
      high = mid;
    }
  }

  if (bestSpending === null) {
    // Every probe failed; $0 is the last word on whether anything works.
    const atZero = _runProjectionPreSanitized({ ...inputs, lifestyleExpense: 0 });
    if (atZero.isSuccessful && atZero.endingBalance >= 0) {
      bestSpending = 0;
      finalProjection = atZero;
    } else {
      return { dieWithZeroSpending: null, additionalAnnualSpend: null, reason: 'none-works', ceiling, finalProjection: asIs };
    }
  }

  return {
    dieWithZeroSpending: bestSpending,
    additionalAnnualSpend: Math.max(0, bestSpending - inputs.lifestyleExpense),
    reason: 'ok',
    ceiling,
    finalProjection,
  };
}

// Survival-weighted lifetime Social Security (changelog 255).
//
// The plan pays benefits to a fixed Life Expectancy, so "total lifetime SS"
// on the claiming grid is really "total if everyone lives to exactly the
// planned age" -- and that single horizon decides the winner. Delay looks
// better the longer the horizon, so a plan to 90 flatters 70 and a plan to
// 82 flatters 62, and neither is the odds. This weights each year's
// household benefit by the SSA table's probability of each alive-state
// (both / only spouse 1 / only spouse 2), from each person's current age
// and stated sex, over a projection run to the table's last age so nothing
// is truncated at the planned horizon. Deaths are treated as independent.
// Nominal dollars, like totalSS beside it; earnings-test withholding
// applied as in the plan.
export function expectedLifetimeSS(inputs, proj) {
  const years = (proj && proj.years) || [];
  if (!years.length) return 0;
  const startYear = years[0].year;
  const age1Init = startYear - inputs.birthYear1;
  const age2Init = inputs.spouse2Enabled ? (startYear - inputs.birthYear2) : null;
  const p1 = survivalCurve(inputs.sex1, age1Init);
  const p2 = inputs.spouse2Enabled ? survivalCurve(inputs.sex2, age2Init) : null;
  let expected = 0;
  years.forEach((row, k) => {
    const a = k < p1.length ? p1[k] : 0;
    const b = p2 ? (k < p2.length ? p2[k] : 0) : 0;
    expected += a * b * (row.ssIfBoth || 0)
      + a * (1 - b) * (row.ssIfOnly1 || 0)
      + (1 - a) * b * (row.ssIfOnly2 || 0);
  });
  return expected;
}

// Die with Zero at the odds, not at one age (changelog 255).
//
// findDieWithZeroSpending spends down to $0 at the planned Life
// Expectancy. That is one horizon; the SSA table gives the odds of each.
// This re-solves the spend-to-zero level at three horizons -- the year by
// which half of households like this one have no one left, one in four
// still do, and one in ten still do -- so the number reads "spend this if
// you plan to last as long as one household in four". For a couple the
// horizon is the year the chance that AT LEAST ONE is alive falls below
// the level (independence assumed); both Life Expectancies are set to
// that year, which loses the survivor phase but is the right ceiling for
// "how long must the money last". 120 projections; runs in the heavy
// worker, never on the main thread.
export const DWZ_LONGEVITY_LEVELS = [
  { id: 'half', prob: 0.5, label: 'half of households like yours' },
  { id: 'oneInFour', prob: 0.25, label: 'one household in four' },
  { id: 'oneInTen', prob: 0.10, label: 'one household in ten' },
];

export function dieWithZeroByLongevity(rawInputs = DEFAULT_INPUTS) {
  const inputs = sanitizeInputs(rawInputs);
  const startYear = inputs.planYear;
  const age1Init = startYear - inputs.birthYear1;
  const age2Init = inputs.spouse2Enabled ? (startYear - inputs.birthYear2) : null;
  const p1 = survivalCurve(inputs.sex1, age1Init);
  const p2 = inputs.spouse2Enabled ? survivalCurve(inputs.sex2, age2Init) : null;
  const anyAlive = (k) => {
    const a = k < p1.length ? p1[k] : 0;
    const b = p2 ? (k < p2.length ? p2[k] : 0) : 0;
    return 1 - (1 - a) * (1 - b);
  };
  const planned = findDieWithZeroSpending(inputs);
  const levels = DWZ_LONGEVITY_LEVELS.map((level) => {
    // Last year in which the chance anyone is alive is still >= prob.
    let k = 0;
    while (anyAlive(k + 1) >= level.prob) k++;
    // Never shorter than the plan's own first retired year is reachable;
    // the engine also insists Life Expectancy be at least the current age.
    const le1 = Math.max(age1Init, age1Init + k);
    const le2 = inputs.spouse2Enabled ? Math.max(age2Init, age2Init + k) : inputs.lifeExpectancy2;
    const res = findDieWithZeroSpending({ ...inputs, lifeExpectancy1: le1, lifeExpectancy2: le2 });
    return {
      ...level,
      endYear: startYear + k,
      age1: le1,
      age2: inputs.spouse2Enabled ? le2 : null,
      spending: res.dieWithZeroSpending,
      reason: res.reason,
    };
  });
  return {
    planned: { spending: planned.dieWithZeroSpending, reason: planned.reason, endYear: startYear + Math.max(inputs.lifeExpectancy1 - age1Init, inputs.spouse2Enabled ? inputs.lifeExpectancy2 - age2Init : 0) },
    levels,
  };
}

// Social Security Claiming Strategy Heatmap Generator
// Runs projections for all combinations of claiming ages 62 to 70
export function getSSClaimingHeatmap(rawInputs = DEFAULT_INPUTS) {
  const inputs = sanitizeInputs(rawInputs);
  const results = [];
  const startAge = 62;
  const endAge = 70;
  // For expectedSS: the same cell run to the life table's last age, so the
  // survival weighting sees every year anyone could still be collecting.
  const toTableEnd = { lifeExpectancy1: LIFE_TABLE_MAX_AGE, lifeExpectancy2: inputs.spouse2Enabled ? LIFE_TABLE_MAX_AGE : inputs.lifeExpectancy2 };

  for (let age1 = startAge; age1 <= endAge; age1++) {
    for (let age2 = startAge; age2 <= endAge; age2++) {
      // If Spouse 2 is disabled, we only need to test Spouse 1 claiming ages
      if (!inputs.spouse2Enabled && age2 !== 62) {
        continue;
      }

      const testInputs = {
        ...inputs,
        claimingAge1: age1,
        claimingAge2: inputs.spouse2Enabled ? age2 : 62 // spouse 2 claim age ignored if spouse 2 is disabled
      };

      const proj = _runProjectionPreSanitized(testInputs);

      // Sum lifetime Social Security benefits received across all years
      let totalSS = 0;
      for (const y of proj.years) {
        totalSS += y.ssIncome || 0;
      }
      const expectedSS = expectedLifetimeSS(testInputs, _runProjectionPreSanitized({ ...testInputs, ...toTableEnd }));

      results.push({
        claimingAge1: age1,
        claimingAge2: inputs.spouse2Enabled ? age2 : null,
        totalSS,
        // Changelog 255: survival-weighted, see expectedLifetimeSS.
        expectedSS,
        endingBalance: proj.endingBalance,
        isSuccessful: proj.isSuccessful
      });
    }
  }

  return results;
}

// Standard federal marginal bracket ceilings tested by both Roth Conversion
// Ladder heatmaps below -- the same set runOptimizer's 3 hardcoded
// "roth_conv_12/22/24" cards sample from, extended to every bracket a
// maxBracket conversion target actually makes sense at (10% through the top
// 37% rate covers the realistic range; nobody targets 0% since that
// converts nothing).
const ROTH_LADDER_BRACKETS = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
const ROTH_LADDER_WITHDRAWAL_STRATEGIES = ['TaxableFirst', 'PreTaxFirst', 'RothFirst', 'ProRata'];

// Shared per-cell metric extraction for both Roth Conversion Ladder heatmaps
// below -- same fields runOptimizer's strategy cards surface (see the
// survivorPhaseTaxes comment there for why it's broken out separately),
// so the heatmap and the Lifetime Tax Strategy Optimizer describe the same
// plan with the same vocabulary.
// realDollars (changelog 111): when true, every dollar metric is deflated
// into today's dollars with the same per-year recipe
// computeOptimizerResultsReal uses -- taxes/IRMAA discounted year by year,
// the ending balance by the final year's factor. Before this the two Roth
// ladder grids were nominal-only, so with the Real/Nominal toggle on
// Today's Dollars (the default) the Roth Ladder Optimizer quoted future
// dollars while the Tax Optimizer Hub and the Action Plan quoted today's
// -- the same mixed-currency bug changelog 86 fixed inside the Hub,
// recreated between surfaces.
function extractRothLadderCellMetrics(inputs, proj, realDollars = false) {
  if (!realDollars) {
    const survivorPhaseTaxes = inputs.spouse2Enabled
      ? proj.years.reduce((sum, y) => sum + (y.householdStatus === 'Single' ? y.totalTaxesPaid : 0), 0)
      : 0;
    return {
      endingBalance: proj.endingBalance,
      afterTaxLegacy: legacyAfterTaxes(inputs, proj),
      isSuccessful: proj.isSuccessful,
      totalTaxesPaid: proj.totalTaxesPaid,
      totalIRMAAPaid: proj.totalIRMAAPaid,
      survivorPhaseTaxes,
    };
  }
  let discountedTaxes = 0;
  let discountedIRMAA = 0;
  let discountedSurvivorTaxes = 0;
  proj.years.forEach((y) => {
    const factor = y.inflFactor || 1;
    discountedTaxes += y.totalTaxesPaid / factor;
    discountedIRMAA += (y.irmaaCost || 0) / factor;
    if (inputs.spouse2Enabled && y.householdStatus === 'Single') discountedSurvivorTaxes += y.totalTaxesPaid / factor;
  });
  const lastYearFactor = finalBalanceFactor(proj.years);
  return {
    endingBalance: proj.endingBalance / lastYearFactor,
    afterTaxLegacy: legacyAfterTaxes(inputs, proj) / lastYearFactor,
    isSuccessful: proj.isSuccessful,
    totalTaxesPaid: discountedTaxes,
    totalIRMAAPaid: discountedIRMAA,
    survivorPhaseTaxes: discountedSurvivorTaxes,
  };
}

// Roth Conversion Ladder Optimizer, mode 1: "how aggressively should I
// convert, and in what order should I draw down accounts while doing it."
// Same combinatorial-solver shape as getSSClaimingHeatmap above -- a full
// grid of every {target bracket} x {withdrawal order} combination, each run
// through a real projection, rather than the 3 fixed bracket/withdrawal
// pairings runOptimizer's cards hardcode today. Every cell uses the dynamic
// "maxBracket" conversion strategy (fill up to the target bracket ceiling
// each year for as long as Pre-Tax funds remain), not a bounded ladder --
// see getRothLadderScheduleHeatmap below for the fixed-schedule version.
export function getRothBracketWithdrawalHeatmap(rawInputs = DEFAULT_INPUTS, realDollars = false) {
  const inputs = sanitizeInputs(rawInputs);
  const results = [];

  for (const bracket of ROTH_LADDER_BRACKETS) {
    for (const withdrawalStrategy of ROTH_LADDER_WITHDRAWAL_STRATEGIES) {
      const testInputs = {
        ...inputs,
        rothConversionStrategy: 'maxBracket',
        rothConversionBracket: bracket,
        rothConversionDurationYears: 0,
        withdrawalStrategy,
      };
      const proj = _runProjectionPreSanitized(testInputs);
      results.push({
        bracket,
        withdrawalStrategy,
        ...extractRothLadderCellMetrics(inputs, proj, realDollars),
      });
    }
  }

  return results;
}

// Roth Conversion Ladder Optimizer, mode 2: a literal fixed-dollar,
// fixed-duration ladder ("convert $X/yr for N years") rather than a dynamic
// bracket target -- the classic early-retirement Roth ladder shape (e.g.
// "convert steadily during the gap years before Social Security/RMDs
// start"). Annual amounts are expressed as a percentage of the household's
// current Pre-Tax balance rather than fixed dollar figures, so the grid
// scales sensibly whether preTaxInit is $50k or $5M, the same way
// rothConversionBracket already scales with income automatically. Duration
// options span the realistic range of a bridge/ladder window: shorter than
// 3 years rarely matters, longer than 20 approaches "unbounded" anyway.
const ROTH_LADDER_SCHEDULE_PCTS = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40];
const ROTH_LADDER_SCHEDULE_DURATIONS = [3, 5, 7, 10, 15, 20];

export function getRothLadderScheduleHeatmap(rawInputs = DEFAULT_INPUTS, realDollars = false) {
  const inputs = sanitizeInputs(rawInputs);
  const results = [];
  const basePreTax = Math.max(0, inputs.preTaxInit || 0);

  for (const pct of ROTH_LADDER_SCHEDULE_PCTS) {
    const annualAmount = Math.round(basePreTax * pct);
    for (const durationYears of ROTH_LADDER_SCHEDULE_DURATIONS) {
      const testInputs = {
        ...inputs,
        rothConversionStrategy: 'fixed',
        rothConversionAmount: annualAmount,
        rothConversionDurationYears: durationYears,
      };
      const proj = _runProjectionPreSanitized(testInputs);
      results.push({
        pct,
        annualAmount,
        durationYears,
        ...extractRothLadderCellMetrics(inputs, proj, realDollars),
      });
    }
  }

  return results;
}

// The three functions below back the "heavy" App.jsx charts (stress test
// comparison, strategy optimizer, retirement-age finder) — each runs many
// full projections (5, one-per-strategy, one-per-candidate-age respectively)
// per call. Exported here as the single source of truth so both
// heavyComputeWorker.js (the normal path, off the main thread) and App.jsx's
// synchronous fallback (used if the Worker fails to start) call the exact
// same logic instead of two copies that could drift apart.

// Runs the plan under each historical stress scenario for the comparison
// chart on the Risk tab.
export function computeStressComparisonData(rawInputs, useRealDollars) {
  const inputs = sanitizeInputs(rawInputs);
  const types = ['none', '1929', '1966', '1973', '2000', '2008'];
  // Changelog 336: a replayed real start joins the comparison as its own line.
  if (inputs.stressType === 'history') types.push('history');
  const runs = types.map(t => {
    const testInputs = { ...inputs, stressType: t };
    return { type: t, proj: _runProjectionPreSanitized(testInputs) };
  });

  // Years loop length is bounded by life expectancy / current age, not by
  // stressType (stressType only changes the return sequence within each
  // year), so any run's years.length is equivalent to the others' here.
  const baseline = runs.find(r => r.type === 'none') || runs[0];
  const yearsCount = baseline ? baseline.proj.years.length : 0;
  const startYear = inputs.planYear;
  const data = [];

  for (let i = 0; i < yearsCount; i++) {
    const item = { year: startYear + i };
    runs.forEach(r => {
      const factor = useRealDollars ? yearEndFactor(r.proj.years, i) : 1;
      item[r.type] = Math.round((r.proj.years[i]?.totalPortfolioEnding || 0) / factor);
    });
    data.push(item);
  }
  return data;
}

// Guardrails vs. Fixed-Withdrawal comparison: the same combinatorial-solver
// pattern as getSSClaimingHeatmap/getRothBracketWithdrawalHeatmap, applied to
// spendingGuardrails. spendingGuardrails only changes anything in years that
// see a negative return (it freezes/cuts spending after a down year -- see
// the "Expenses (lifestyle with inflation guardrails)" block above), so
// comparing it on vs. off under DEFAULT_INPUTS' smooth, ever-positive return
// assumption would show two identical columns. The existing historical
// stress scenarios (1929/1966/1973/2000/2008, already used by the Risk
// tab's stress tester) are the natural rows to grid against instead --
// they're the only return sequences in this app with real down years, which
// is exactly the situation guardrails exists to soften.
const GUARDRAILS_STRESS_SCENARIOS = ['none', '1929', '1966', '1973', '2000', '2008'];

function extractGuardrailsCellMetrics(proj) {
  const yearBalances = proj.years.map(y => y.totalPortfolioEnding);
  return {
    endingBalance: proj.endingBalance,
    isSuccessful: proj.isSuccessful,
    totalTaxesPaid: proj.totalTaxesPaid,
    // The lowest single-year portfolio value across the whole plan --
    // guardrails' whole point is to shrink this dip after a crash, not
    // necessarily to raise the final ending balance (which a big enough
    // spending freeze plus market recovery usually does anyway).
    worstYearBalance: yearBalances.length > 0 ? Math.min(...yearBalances) : 0,
  };
}

export function getGuardrailsComparisonHeatmap(rawInputs = DEFAULT_INPUTS) {
  const inputs = sanitizeInputs(rawInputs);
  const results = [];
  for (const stressType of GUARDRAILS_STRESS_SCENARIOS) {
    const on = _runProjectionPreSanitized({ ...inputs, stressType, spendingGuardrails: true });
    const off = _runProjectionPreSanitized({ ...inputs, stressType, spendingGuardrails: false });
    // Changelog 335: what guardrails cost in SPENDING, against the same
    // scenario with them off. Balances alone make any rule that cuts
    // spending look like a free win.
    const cost = spendingCost(on, off);
    const costFields = (c) => ({
      deepestCut: c ? c.deepestCut : 0,
      cutYears: c ? c.cutYears : 0,
      lifetimeShare: c ? c.lifetimeShare : 1,
    });
    results.push({ stressType, guardrailsOn: true, ...extractGuardrailsCellMetrics(on), ...costFields(cost) });
    results.push({ stressType, guardrailsOn: false, ...extractGuardrailsCellMetrics(off), ...costFields(null) });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Every historical start (changelog 335, SPENDING_RULES_SPEC.md phase 2).
//
// The named stress scenarios answer "what if a crash like X hit when I
// retired?": 3-4 real years, then the plan's own assumptions. This answers
// the other question: "what did every real retirement since 1928 look
// like?" One run per start year that has a full retirement's worth of
// history behind it, with that start's actual returns (at the plan's
// stock/bond mix) and actual inflation from the household's retirement year
// to the end of the plan. Raw history, not re-centered (the owner, 2026-09-29):
// the point is what really happened.
//
// Each spending rule is run over the same starts, and its cost is measured
// against fixed spending in the SAME start, so the comparison isolates the
// rule from the market.
export const HISTORICAL_START_RULES = [
  { key: 'fixed', patch: { spendingGuardrails: false, withdrawalGuardrailsEnabled: false } },
  { key: 'crash', patch: { spendingGuardrails: true, withdrawalGuardrailsEnabled: false } },
  { key: 'wr', patch: { spendingGuardrails: false, withdrawalGuardrailsEnabled: true } },
  { key: 'both', patch: { spendingGuardrails: true, withdrawalGuardrailsEnabled: true } },
];

// The start years with a full retirement's worth of history behind them.
export function historicalStartYears(horizonYears, firstYear = HISTORY_FIRST_YEAR) {
  const years = [];
  for (let start = firstYear; start + horizonYears - 1 <= HISTORY_LAST_YEAR; start += 1) years.push(start);
  return years;
}

const median = (xs) => {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export function runHistoricalStarts(rawInputs = DEFAULT_INPUTS) {
  const inputs = sanitizeInputs({ ...rawInputs, stressType: 'none' });
  const base = _runProjectionPreSanitized(inputs);
  const firstRetired = base.years.find((y) => y.isRetired);
  if (!firstRetired) return null;
  const retirementYear = firstRetired.year;
  const horizonYears = base.years[base.years.length - 1].year - retirementYear + 1;
  // Changelog 336: each start is the 'history' stress scenario at that
  // year, so the Risk tab can replay any row of this table and show
  // exactly the run the row describes.
  const paths = historicalStartYears(horizonYears, historyFirstYear(inputs)).map((start) => ({
    start,
    patch: { stressType: 'history', stressStartMode: 'retirement', stressHistoryStartYear: start },
  }));
  const inPlan = inputs.spendingGuardrails && inputs.withdrawalGuardrailsEnabled ? 'both'
    : inputs.spendingGuardrails ? 'crash'
      : inputs.withdrawalGuardrailsEnabled ? 'wr' : 'fixed';
  // 'both' only when the plan uses both -- otherwise it is a combination
  // nobody asked about.
  const rules = HISTORICAL_START_RULES.filter((r) => r.key !== 'both' || inPlan === 'both');

  const runsOutYear = (proj) => {
    const row = proj.years.find((y) => (y.shortfall || 0) > 0.01);
    return row ? row.year : null;
  };
  const starts = paths.map(({ start }) => ({ start }));
  const summaries = [];
  const fixedRuns = [];
  for (const rule of rules) {
    const lifetime = [];
    const cutYearsList = [];
    let lasted = 0;
    let deepest = { cut: 0, start: null };
    let worst = null;
    let essentialsKnown = false;
    let essentialsTouchedStarts = 0;
    paths.forEach((path, i) => {
      const proj = _runProjectionPreSanitized({ ...inputs, ...rule.patch, ...path.patch });
      if (rule.key === 'fixed') fixedRuns[i] = proj;
      const out = runsOutYear(proj);
      // Changelog 448: lasting means keeping the "keep at least" floor too.
      const ok = !!proj.meetsFloor;
      const breach = proj.floorBreachYear ?? null;
      if (ok) lasted += 1;
      const realEnd = (Number(proj.endingBalance) || 0) / finalBalanceFactor(proj.years);
      // The worst start: the earliest run-out (or dip below the floor),
      // else the smallest real balance left.
      const failYear = out !== null && breach !== null ? Math.min(out, breach) : (out ?? breach);
      const rank = failYear !== null ? failYear - 1e9 : realEnd;
      if (worst === null || rank < worst.rank) worst = { rank, start: path.start, runsOutYear: out, floorBreachYear: breach };
      const entry = { ok, runsOutYear: out, floorBreachYear: breach, realEnd };
      if (rule.key !== 'fixed') {
        const cost = spendingCost(proj, fixedRuns[i]);
        if (cost) {
          lifetime.push(cost.lifetimeShare);
          cutYearsList.push(cost.cutYears);
          if (cost.deepestCut > deepest.cut) deepest = { cut: cost.deepestCut, start: path.start };
          if (cost.essentialsTouched !== null) {
            essentialsKnown = true;
            if (cost.essentialsTouched) essentialsTouchedStarts += 1;
          }
          entry.deepestCut = cost.deepestCut;
          entry.lifetimeShare = cost.lifetimeShare;
          entry.cutYears = cost.cutYears;
        }
      }
      starts[i][rule.key] = entry;
    });
    summaries.push({
      key: rule.key,
      inPlan: rule.key === inPlan,
      lasted,
      count: paths.length,
      worstStart: worst ? worst.start : null,
      worstRunsOutYear: worst ? worst.runsOutYear : null,
      worstFloorBreachYear: worst ? worst.floorBreachYear : null,
      medianLifetimeShare: rule.key === 'fixed' ? 1 : median(lifetime),
      deepestCut: rule.key === 'fixed' ? 0 : deepest.cut,
      deepestCutStart: rule.key === 'fixed' ? null : deepest.start,
      medianCutYears: rule.key === 'fixed' ? 0 : median(cutYearsList),
      essentialsTouchedStarts: rule.key === 'fixed' || !essentialsKnown ? null : essentialsTouchedStarts,
    });
  }
  return {
    retirementYear,
    horizonYears,
    firstStart: paths.length ? paths[0].start : null,
    lastStart: paths.length ? paths[paths.length - 1].start : null,
    count: paths.length,
    inPlan,
    // Changelog 448: the "keep at least" floor these counts respect, in
    // today's dollars (0 = none).
    floor: Math.max(0, Number(inputs.portfolioFloorReal) || 0),
    rules: summaries,
    starts,
  };
}

// The most the plan could spend and still last through every real
// retirement since 1928 -- the plan's own SAFEMAX (Bengen's term for the
// highest starting withdrawal that survived the worst historical start),
// worked out after tax, with the plan's own income, accounts, mix, horizon
// and spending rule (changelog 358).
//
// Lifestyle spending (today's dollars) is searched by bisection; at each
// probe the plan runs through the same starts as runHistoricalStarts. Three
// bars: every start, 95% of them and 90% of them. Survival is treated as
// monotone in spending (more spending never rescues a start); a probe stops
// as soon as more starts have failed than the bar allows, and the starts
// that failed before are tried first, which is where failures cluster.
//
// Returns null when the plan never retires or no start fits the horizon.
// Each bar: { share, need, status: 'ok' | 'none' | 'aboveCeiling', amount,
// limitingStart, spendingRate }. `amount` is lifestyle spending in today's
// dollars; `spendingRate` is that spending as a share of the invested
// portfolio (Pre-Tax, Roth, Taxable, HSA) at the start of the first retired
// year. Not Bengen's withdrawal rate: Social Security and other income pay
// part of it, and the first year's actual draw also carries conversions,
// the cash reserve and taxes, which made it a misleading figure to show.
// `limitingStart` is the start that fails first just above `amount`.
export const SAFEMAX_SHARES = [1, 0.95, 0.9];
const SAFEMAX_FLOOR = 1000;

export function findHistoricalSafeMax(rawInputs = DEFAULT_INPUTS, { shares = SAFEMAX_SHARES } = {}) {
  const inputs = sanitizeInputs({ ...rawInputs, stressType: 'none' });
  const base = _runProjectionPreSanitized(inputs);
  const firstRetired = base.years.find((y) => y.isRetired);
  if (!firstRetired) return null;
  const horizonYears = base.years[base.years.length - 1].year - firstRetired.year + 1;
  const startYears = historicalStartYears(horizonYears, historyFirstYear(inputs));
  if (startYears.length === 0) return null;
  const inPlan = inputs.spendingGuardrails && inputs.withdrawalGuardrailsEnabled ? 'both'
    : inputs.spendingGuardrails ? 'crash'
      : inputs.withdrawalGuardrailsEnabled ? 'wr' : 'fixed';
  const rulePatch = HISTORICAL_START_RULES.find((r) => r.key === inPlan).patch;
  const count = startYears.length;
  const planned = Math.max(0, Number(inputs.lifestyleExpense) || 0);

  // Starts that have failed at some probe, hardest first.
  const failedOrder = [];
  const markFailed = (start) => { if (!failedOrder.includes(start)) failedOrder.push(start); };
  const orderedStarts = () => [...failedOrder, ...startYears.filter((s) => !failedOrder.includes(s))];
  const runStart = (spend, start) => _runProjectionPreSanitized({
    ...inputs, ...rulePatch, lifestyleExpense: spend,
    stressType: 'history', stressStartMode: 'retirement', stressHistoryStartYear: start,
  });
  // True when at least `need` starts last at `spend`.
  const passes = (spend, need) => {
    const allowed = count - need;
    let failures = 0;
    for (const start of orderedStarts()) {
      if (!runStart(spend, start).meetsFloor) {
        markFailed(start);
        failures += 1;
        if (failures > allowed) return false;
      }
    }
    return true;
  };
  // The start that runs out earliest at `spend` (the binding one just above
  // the answer).
  const limitingAt = (spend) => {
    let worst = null;
    for (const start of orderedStarts()) {
      const proj = runStart(spend, start);
      if (proj.meetsFloor) continue;
      const row = proj.years.find((y) => (y.shortfall || 0) > 0.01);
      const out = Math.min(row ? row.year : Infinity, proj.floorBreachYear ?? Infinity);
      if (worst === null || out < worst.out) worst = { start, out };
    }
    return worst ? worst.start : null;
  };
  // Planned spending as a share of the portfolio on the day you retire,
  // both in that year's dollars.
  const spendingRateAt = (spend) => {
    const row = base.years.find((y) => y.isRetired);
    const portfolio = (row.preTaxStart || 0) + (row.rothStart || 0) + (row.taxableStart || 0) + (row.hsaStart || 0);
    return portfolio > 0 ? (spend * (row.inflFactor || 1)) / portfolio : null;
  };
  const step = (x) => Math.max(100, Math.round(x * 0.0025 / 100) * 100);

  const bars = shares.map((share) => {
    const need = Math.ceil(share * count - 1e-9);
    // Bracket: a passing low and a failing high.
    let lo = null;
    let hi = null;
    let probe = Math.max(planned, SAFEMAX_FLOOR * 10);
    if (passes(probe, need)) {
      lo = probe;
      while (hi === null) {
        const next = Math.min(DIE_WITH_ZERO_CEILING, lo * 1.5);
        if (next <= lo) break;
        if (passes(next, need)) lo = next; else hi = next;
      }
      if (hi === null) return { share, need, status: 'aboveCeiling', amount: null, limitingStart: null, spendingRate: null };
    } else {
      hi = probe;
      while (lo === null) {
        const next = hi / 1.5;
        if (next < SAFEMAX_FLOOR) break;
        if (passes(next, need)) lo = next; else hi = next;
      }
      if (lo === null) {
        if (!passes(0, need)) return { share, need, status: 'none', amount: null, limitingStart: null, spendingRate: null };
        lo = 0;
      }
    }
    while (hi - lo > step(lo)) {
      const mid = (lo + hi) / 2;
      if (passes(mid, need)) lo = mid; else hi = mid;
    }
    const amount = Math.floor(lo / 100) * 100;
    return {
      share, need, status: 'ok', amount,
      limitingStart: limitingAt(hi),
      spendingRate: spendingRateAt(amount),
    };
  });

  return {
    rule: inPlan,
    count,
    firstStart: startYears[0],
    lastStart: startYears[startYears.length - 1],
    planned,
    floor: Math.max(0, Number(inputs.portfolioFloorReal) || 0),
    bars,
  };
}

// ---------------------------------------------------------------------------
// What fees cost you (changelog 447). The plan as set beside one other fee
// setting: with no advisor fee, a 1% advisor fee (what doing it yourself
// saves); with one, the same plan without it. Fund expenses stay as set in
// both. Dollars are today's: each year's fee over that year-end's price
// level, the ending balance over the last year's.
export const FEE_COMPARE_ADVISOR_PCT = 1;

export function feeComparisonVariant(inputs) {
  const advisor = Number(inputs?.advisorFeePct) || 0;
  return advisor > 0
    ? { kind: 'withoutAdvisor', advisorFeePct: 0 }
    : { kind: 'withAdvisor', advisorFeePct: FEE_COMPARE_ADVISOR_PCT };
}

function feeRunSummary(proj, inputs) {
  const years = proj.years || [];
  let fees = 0;
  let fund = 0;
  let advisor = 0;
  years.forEach((y, i) => {
    const f = yearEndFactor(years, i) || 1;
    fees += (y.feesPaid || 0) / f;
    fund += (y.fundExpensesPaid || 0) / f;
    advisor += (y.advisorFeesPaid || 0) / f;
  });
  const out = years.find((y) => (y.shortfall || 0) > 0.01);
  return {
    fundExpenseRatioPct: Number(inputs.fundExpenseRatioPct) || 0,
    advisorFeePct: Number(inputs.advisorFeePct) || 0,
    lifetimeFees: fees,
    lifetimeFundExpenses: fund,
    lifetimeAdvisorFees: advisor,
    endingBalance: (Number(proj.endingBalance) || 0) / finalBalanceFactor(years),
    runsOutYear: out ? out.year : null,
    isSuccessful: !!proj.isSuccessful,
  };
}

// How many historical starts the plan lasts through under its own
// spending rule -- runHistoricalStarts' headline count, without the other
// rules' runs.
export function historicalLastedCount(rawInputs) {
  const inputs = sanitizeInputs({ ...rawInputs, stressType: 'none' });
  const base = _runProjectionPreSanitized(inputs);
  const firstRetired = base.years.find((y) => y.isRetired);
  if (!firstRetired) return null;
  const horizonYears = base.years[base.years.length - 1].year - firstRetired.year + 1;
  const startYears = historicalStartYears(horizonYears, historyFirstYear(inputs));
  if (startYears.length === 0) return null;
  let lasted = 0;
  for (const start of startYears) {
    const proj = _runProjectionPreSanitized({
      ...inputs, stressType: 'history', stressStartMode: 'retirement', stressHistoryStartYear: start,
    });
    if (proj.meetsFloor) lasted += 1;
  }
  return { lasted, count: startYears.length, firstStart: startYears[0] };
}

// The deterministic part is cheap (two projections); `historical: true`
// adds each side's historical count and every-start SAFEMAX, a few hundred
// projections, so the worker runs it as its own step.
export function computeFeeComparison(rawInputs = DEFAULT_INPUTS, { historical = false } = {}) {
  const mineInputs = sanitizeInputs(rawInputs);
  const variant = feeComparisonVariant(mineInputs);
  const otherInputs = sanitizeInputs({ ...rawInputs, advisorFeePct: variant.advisorFeePct });
  const mine = feeRunSummary(_runProjectionPreSanitized(mineInputs), mineInputs);
  const other = feeRunSummary(_runProjectionPreSanitized(otherInputs), otherInputs);
  if (historical) {
    for (const [side, inp] of [[mine, mineInputs], [other, otherInputs]]) {
      side.historical = historicalLastedCount(inp);
      const sm = findHistoricalSafeMax(inp, { shares: [1] });
      side.safeMax = sm && sm.bars[0] && sm.bars[0].status === 'ok' ? sm.bars[0].amount : null;
    }
  }
  return { kind: variant.kind, mine, other };
}

// Re-prices runOptimizer's strategy list into today's dollars when the
// real-dollars toggle is on (runOptimizer itself always returns nominal
// figures).
export function computeOptimizerResultsReal(rawInputs, extraStrategies = []) {
  const inputs = sanitizeInputs(rawInputs);
  const rawResults = runOptimizer(inputs, extraStrategies);

  return rawResults.map(strat => {
    const mergedInputs = { ...inputs, ...strat.config };
    const proj = _runProjectionPreSanitized(mergedInputs);

    let discountedTaxes = 0;
    let discountedIRMAA = 0;
    let discountedRMDs = 0;
    // survivorPhaseTaxes from runOptimizer is a nominal sum; the Roth ladder
    // grids and Inspector discount it year by year, so the Hub does too.
    let discountedSurvivorTaxes = 0;
    proj.years.forEach(y => {
      const factor = y.inflFactor || 1;
      discountedTaxes += y.totalTaxesPaid / factor;
      discountedIRMAA += (y.irmaaCost || 0) / factor;
      discountedRMDs += (y.rmdAmount || 0) / factor;
      if (inputs.spouse2Enabled && y.householdStatus === 'Single') discountedSurvivorTaxes += y.totalTaxesPaid / factor;
    });

    const lastYearFactor = finalBalanceFactor(proj.years);

    return {
      ...strat,
      endingBalance: strat.endingBalance / lastYearFactor,
      afterTaxLegacy: (strat.afterTaxLegacy || 0) / lastYearFactor,
      totalTaxes: discountedTaxes,
      totalIRMAA: discountedIRMAA,
      totalRMDs: discountedRMDs,
      survivorPhaseTaxes: discountedSurvivorTaxes,
    };
  });
}

// Re-prices findOptimalRetirementAge's candidate-age list into today's
// dollars when the real-dollars toggle is on.
export function computeAgeFinderResultsReal(rawInputs) {
  const inputs = sanitizeInputs(rawInputs);
  const rawResults = findOptimalRetirementAge(inputs);

  return {
    ...rawResults,
    simulations: rawResults.simulations.map(sim => {
      const testInputs = {
        ...inputs,
        retireAge1: sim.age,
        retireAge2: inputs.spouse2Enabled ? spouse2RetireAgeMatching(inputs, sim.age) : sim.age,
      };
      const proj = _runProjectionPreSanitized(testInputs);
      const lastYearFactor = finalBalanceFactor(proj.years);
      return {
        ...sim,
        endingBalance: sim.endingBalance / lastYearFactor,
      };
    })
  };
}

// Helper progressive tax calculation for a single heir's filing status —
// shared by calculateHeirEstateTax's per-heir loop below.
// inflationFactor (audit Q-13, changelog 127): the heirs inherit a NOMINAL
// balance from the end of a plan that may be thirty years long, so pricing
// it against unindexed 2026 brackets invents tax that will not exist. The
// factor indexes the brackets -- and, at the call sites, the heir's own
// stated income, which the user enters in today's dollars -- so both sides
// of the stack sit in the same money as the inheritance.
function getHeirBracketTax(taxableIncome, status, inflationFactor = 1) {
  const brackets = bracketsFor(status);
  let tax = 0;
  let prevLimit = 0;
  for (const raw of brackets) {
    const b = { limit: raw.limit === Infinity ? Infinity : raw.limit * inflationFactor, rate: raw.rate };
    if (taxableIncome > prevLimit) {
      const capacity = b.limit - prevLimit;
      const filled = Math.min(capacity, taxableIncome - prevLimit);
      tax += filled * b.rate;
      prevLimit = b.limit;
    } else {
      break;
    }
  }
  return tax;
}

// The heir's held-but-not-yet-withdrawn balance stays invested during the
// 10-year window, so it should keep growing at this household's own
// post-retirement return assumption (the account is inherited at the end of
// the plan, which is inherently deep in the retirement/decumulation phase) --
// re-derives the same blended rate the main projection uses for retirement
// years, rather than introducing a separate heir-specific assumption.
// Money already distributed to the heir is deliberately NOT grown further:
// once it leaves the inherited account it's the heir's own money, and this
// app has no visibility into what they do with it (reinvest, spend, pay off
// debt) -- assuming a specific return on it would imply a certainty the tool
// doesn't have.
// After investment fees (changelog 447): an heir's inherited account pays
// fees too, and the plan's own accounts grow net of them.
function getEffectivePostRetireReturn(inputs) {
  if (inputs.rebalancingEnabled) {
    const stockAlloc = inputs.stockAllocationPost;
    const bondAlloc = 100 - stockAlloc;
    return netReturnPct((stockAlloc * inputs.stockReturnRate + bondAlloc * inputs.bondReturnRate) / 100, inputs);
  }
  return netReturnPct(inputs.postRetireReturn, inputs);
}

// Single Life Table, Reg. s.1.401(a)(9)-9(b) (2022 tables; ecfr.gov,
// fetched 2026-09-02). Used for a beneficiary's annual RMDs in years 1-9
// of the 10-year window when the owner died on or after the required
// beginning date (audit Q-21, changelog 125).
export const SINGLE_LIFE_TABLE = {
  0: 84.6, 1: 83.7, 2: 82.8, 3: 81.8, 4: 80.8, 5: 79.8, 6: 78.8, 7: 77.9, 8: 76.9, 9: 75.9,
  10: 74.9, 11: 73.9, 12: 72.9, 13: 71.9, 14: 70.9, 15: 69.9, 16: 69.0, 17: 68.0, 18: 67.0, 19: 66.0,
  20: 65.0, 21: 64.1, 22: 63.1, 23: 62.1, 24: 61.1, 25: 60.2, 26: 59.2, 27: 58.2, 28: 57.3, 29: 56.3,
  30: 55.3, 31: 54.4, 32: 53.4, 33: 52.5, 34: 51.5, 35: 50.5, 36: 49.6, 37: 48.6, 38: 47.7, 39: 46.7,
  40: 45.7, 41: 44.8, 42: 43.8, 43: 42.9, 44: 41.9, 45: 41.0, 46: 40.0, 47: 39.0, 48: 38.1, 49: 37.1,
  50: 36.2, 51: 35.3, 52: 34.3, 53: 33.4, 54: 32.5, 55: 31.6, 56: 30.6, 57: 29.8, 58: 28.9, 59: 28.0,
  60: 27.1, 61: 26.2, 62: 25.4, 63: 24.5, 64: 23.7, 65: 22.9, 66: 22.0, 67: 21.2, 68: 20.4, 69: 19.6,
  70: 18.8, 71: 18.0, 72: 17.2, 73: 16.4, 74: 15.6, 75: 14.8, 76: 14.1, 77: 13.3, 78: 12.6, 79: 11.9,
  80: 11.2, 81: 10.5, 82: 9.9, 83: 9.3, 84: 8.7, 85: 8.1, 86: 7.6, 87: 7.1, 88: 6.6, 89: 6.1,
  90: 5.7, 91: 5.3, 92: 4.9, 93: 4.6, 94: 4.3, 95: 4.0, 96: 3.7, 97: 3.4, 98: 3.2, 99: 3.0,
  100: 2.8, 101: 2.6, 102: 2.5, 103: 2.3, 104: 2.2, 105: 2.1, 106: 2.1, 107: 2.1, 108: 2.0, 109: 2.0,
  110: 2.0, 111: 2.0, 112: 2.0, 113: 1.9, 114: 1.9, 115: 1.8, 116: 1.8, 117: 1.6, 118: 1.4, 119: 1.1, 120: 1.0,
};
export function singleLifeExpectancy(age) {
  const a = Math.max(0, Math.min(120, Math.round(age)));
  return SINGLE_LIFE_TABLE[a];
}

// The heir's age in the year after the last spouse's death, and whether that
// decedent had reached their required beginning date. Both come from the
// plan itself: the projection ends in the later life-expectancy year, and
// the RMD age is 73 (born before 1960) or 75. An heir with no age entered
// is assumed 30 years younger than the first spouse.
export function heirInheritanceContext(inputs, heir) {
  const planYear = Number(inputs.planYear) || TAX_YEAR;
  const age1Now = planYear - (Number(inputs.birthYear1) || (planYear - 45));
  const years1 = Math.max(0, (Number(inputs.lifeExpectancy1) || 90) - age1Now);
  let yearsUntilDeath = years1;
  let decedentBirthYear = Number(inputs.birthYear1) || (planYear - 45);
  let decedentDeathAge = Number(inputs.lifeExpectancy1) || 90;
  if (inputs.spouse2Enabled) {
    const age2Now = planYear - (Number(inputs.birthYear2) || (planYear - 45));
    const years2 = Math.max(0, (Number(inputs.lifeExpectancy2) || 90) - age2Now);
    if (years2 > years1) {
      yearsUntilDeath = years2;
      decedentBirthYear = Number(inputs.birthYear2) || (planYear - 45);
      decedentDeathAge = Number(inputs.lifeExpectancy2) || 90;
    }
  }
  const heirAgeNow = Number.isFinite(Number(heir?.age)) && Number(heir.age) > 0 ? Number(heir.age) : Math.max(0, age1Now - 30);
  const rmdAge = rmdStartAge(decedentBirthYear);
  return {
    heirAgeYearAfterDeath: Math.round(heirAgeNow + yearsUntilDeath + 1),
    // The required beginning date is April 1 of the year AFTER the owner
    // reaches RMD age, so a death in the RMD-age year itself is before it.
    decedentPastRbd: decedentDeathAge > rmdAge,
    decedentDeathAge,
    yearsUntilDeath,
  };
}

// Colorado military retirement subtraction, C.R.S. s 39-22-104(4)(y) (audit
// Q-14b, changelog 125; tax.colorado.gov "Income Tax Topics: Social
// Security, Pensions, and Annuities", fetched 2026-09-02): a retiree UNDER
// 55 may subtract military retirement benefits up to $15,000 (tax years
// 2022-2028). From 55 there is no separate military subtraction -- the
// pension simply falls inside the ordinary $20,000/$24,000 cap. The engine
// cannot tell which spouse's pension is military, so one $15,000 slot is
// allowed per spouse on the return who is under 55.
export function coloradoMilitarySubtraction(militaryPension, age1, age2, status, calendarYear = TAX_YEAR) {
  if (!(militaryPension > 0)) return 0;
  if (calendarYear < 2022 || calendarYear > 2028) return 0;
  let slots = 0;
  if (age1 < 55) slots += 1;
  if (status === 'MFJ' && age2 < 55) slots += 1;
  return Math.min(militaryPension, 15000 * slots);
}

// Runs the rmd_10 / flat_10 / lump_sum_start / lump_sum_end withdrawal
// schedule for one heir's share of the inherited pre-tax balance against their own
// baseline income and filing status, returning the same shape each heir
// contributes to the aggregate result. growthRate is the annual % the
// un-withdrawn remainder earns while it's still sitting in the inherited
// account (see getEffectivePostRetireReturn above).
// yearOneLumps: the inherited HSA and NQDC an heir receives as year-one
// income. A year-one draw from the inherited IRA lands on the same return,
// ABOVE those lumps, so its tax is priced from where they leave the heir,
// not from the heir's own income (changelog 402). Later years carry no
// lumps and are priced as before.
function runHeirWithdrawalSchedule(heirPreTax, heirIncome, status, strategy, growthRate, ctx = null, inflationFactor = 1, yearOneLumps = 0) {
  const baselineTax = getHeirBracketTax(heirIncome, status, inflationFactor);
  const lumps = Math.max(0, Number(yearOneLumps) || 0);
  // The income a year's draw sits on, and the tax already owed on it.
  const baseFor = (year) => (year === 1 && lumps > 0 ? heirIncome + lumps : heirIncome);
  const baseTaxFor = (year) => (year === 1 && lumps > 0 ? getHeirBracketTax(heirIncome + lumps, status, inflationFactor) : baselineTax);
  let totalHeirTax = 0;
  let totalWithdrawn = 0;
  const annualWithdrawals = [];
  const g = 1 + (growthRate || 0) / 100;

  if (strategy === 'rmd_10') {
    // Reg. s.1.401(a)(9)-5(d)(1)(ii), (d)(3)(iii) and (e): when the owner
    // died on or after the RBD, years 1-9 carry a required distribution of
    // balance / applicable denominator, where the denominator is the
    // greater of the beneficiary's single-life expectancy (age in the year
    // after death, reduced by one each year) and the decedent's remaining
    // single-life expectancy (age at death, reduced by one each year);
    // whatever remains comes out in year 10. Before the RBD nothing is
    // required until year 10, which is lump_sum_end.
    const pastRbd = ctx ? ctx.decedentPastRbd : true;
    const heirLe0 = ctx ? singleLifeExpectancy(ctx.heirAgeYearAfterDeath) : singleLifeExpectancy(55);
    const decedentLe0 = ctx ? singleLifeExpectancy(ctx.decedentDeathAge) : 0;
    let balance = heirPreTax;
    for (let i = 1; i <= 10; i++) {
      balance *= g;
      let withdrawal;
      if (i === 10) {
        withdrawal = balance;
      } else if (!pastRbd) {
        withdrawal = 0;
      } else {
        // The decedent's figure starts from the Single Life Table at their
        // age in the year of death and is reduced by one for each later
        // year, so year 1 (the year after death) already uses LE - 1. The
        // beneficiary's starts at their age in the year after death, not
        // reduced in year 1.
        const denom = Math.max(heirLe0 - (i - 1), decedentLe0 - i, 1);
        withdrawal = Math.min(balance, balance / denom);
      }
      balance -= withdrawal;
      totalWithdrawn += withdrawal;
      const yearTaxableIncome = baseFor(i) + withdrawal;
      const combinedTax = getHeirBracketTax(yearTaxableIncome, status, inflationFactor);
      const taxDrag = combinedTax - baseTaxFor(i);
      totalHeirTax += taxDrag;
      annualWithdrawals.push({ year: i, withdrawal, combinedIncome: yearTaxableIncome, taxPaid: combinedTax, taxDrag });
    }
  } else if (strategy === 'flat_10') {
    // Recalculated annually as balance / years remaining (the same
    // declining-balance approach an RMD uses) rather than a single fixed
    // heirPreTax/10 amount every year -- that way the grown balance is
    // still fully distributed by year 10 instead of leaving a leftover
    // surplus the 10-year rule doesn't actually require to come out.
    let balance = heirPreTax;
    for (let i = 1; i <= 10; i++) {
      balance *= g;
      const yearsRemaining = 10 - i + 1;
      const withdrawal = balance / yearsRemaining;
      balance -= withdrawal;
      totalWithdrawn += withdrawal;
      const yearTaxableIncome = baseFor(i) + withdrawal;
      const combinedTax = getHeirBracketTax(yearTaxableIncome, status, inflationFactor);
      const taxDrag = combinedTax - baseTaxFor(i);
      totalHeirTax += taxDrag;
      annualWithdrawals.push({ year: i, withdrawal, combinedIncome: yearTaxableIncome, taxPaid: combinedTax, taxDrag });
    }
  } else if (strategy === 'lump_sum_start') {
    // Withdrawn immediately -- there's no holding period, so no growth
    // applies here regardless of growthRate.
    const yearTaxableIncome = baseFor(1) + heirPreTax;
    const combinedTax = getHeirBracketTax(yearTaxableIncome, status, inflationFactor);
    const taxDrag = combinedTax - baseTaxFor(1);
    totalHeirTax = taxDrag;
    totalWithdrawn = heirPreTax;
    annualWithdrawals.push({ year: 1, withdrawal: heirPreTax, combinedIncome: yearTaxableIncome, taxPaid: combinedTax, taxDrag });
    for (let i = 2; i <= 10; i++) {
      annualWithdrawals.push({ year: i, withdrawal: 0, combinedIncome: heirIncome, taxPaid: baselineTax, taxDrag: 0 });
    }
  } else {
    // lump_sum_end: compounds for the full 10-year window, then the entire
    // grown balance is withdrawn as a single distribution in year 10.
    let balance = heirPreTax;
    for (let i = 1; i <= 9; i++) {
      balance *= g;
      annualWithdrawals.push({ year: i, withdrawal: 0, combinedIncome: heirIncome, taxPaid: baselineTax, taxDrag: 0 });
    }
    balance *= g;
    const yearTaxableIncome = heirIncome + balance;
    const combinedTax = getHeirBracketTax(yearTaxableIncome, status, inflationFactor);
    const taxDrag = combinedTax - baselineTax;
    totalHeirTax = taxDrag;
    totalWithdrawn = balance;
    annualWithdrawals.push({ year: 10, withdrawal: balance, combinedIncome: yearTaxableIncome, taxPaid: combinedTax, taxDrag });
  }

  return { totalHeirTax, annualWithdrawals, totalWithdrawn };
}

// State estate & inheritance tax table — 12 states + DC levy an estate tax
// (paid by the estate itself, based on the total estate value) and 5 states
// levy an inheritance tax (paid by each beneficiary, based on their own
// bequest); Maryland levies both. Verified for 2026 against each
// jurisdiction's own revenue department / statute (see src/config/sources.js
// and TAX_UPDATE_PROCESS.md section 9), NOT against a secondary summary —
// an earlier version of this table came from a single aggregated source and
// had 6 of the 13 estate exemptions wrong.
//
// INDEXED vs FIXED — this matters for the annual update pass:
//   Indexed annually (must be refreshed every January):
//     CT (statutorily tracks the federal basic exclusion amount),
//     ME, NY, RI, DC — each indexed by its own state CPI formula.
//   Fixed in statute (only change by legislation): HI, IL, MD, MA, MN,
//     OR, VT, WA, and all inheritance-tax exemptions.
//
// The ESTATE side is deliberately a simplified two-tier model (0% up to the
// exemption, a single top marginal rate on everything above it) rather than
// each state's full progressive bracket structure — a reasonable
// simplification for retirement planning, since an estate large enough to be
// taxable at all is almost always into the top bracket.
//
// The INHERITANCE side is NOT simplified that way and does not live in this
// table — see STATE_INHERITANCE_SCHEDULES below. Inheritance tax depends
// entirely on who receives the money, and collapsing that into one
// exemption/rate pair produced the worst kind of wrong answer: it reported a
// large bill for a child who in fact owes nothing, while giving no warning at
// all to the niece or friend who owes a great deal.
// New York additionally has a "cliff" rule (NY Tax Law Sec. 952: an estate
// above 105% of the exemption loses the exemption ENTIRELY and is taxed on
// the full amount, which at the 2026 exemption means the cliff edge sits at
// $7,717,500) that this simplification doesn't capture — see KNOWN_ISSUES.md.
// --- Graduated estate-tax schedules (audit Q-18(a), changelog 127) --------
//
// Until changelog 127 every estate-tax state was modeled as "top marginal
// rate on the excess over the exemption". That is right for the states
// whose statute really is a single rate (CT, HI, ME, VT, WA, DC), and
// wrong -- always in the taxpayer's disfavour -- for the five that publish
// a graduated schedule. An Oregon estate $200,000 over the $1,000,000
// threshold owes 10% of that, not 16%.
//
// Three shapes are needed, and all five states fit one of them. (Washington
// joined them in changelog 349 with its own table, shape 4.)

// 1. The pre-2001 federal credit for state death taxes (IRC s 2011 as in
//    effect before EGTRRA phased it out). MA, RI, IL and MD all still
//    compute their tax from this frozen table. It is keyed on the
//    "adjusted taxable estate", which is the taxable estate less $60,000.
//    Verified 2026-09-02 against Table B in the Massachusetts DOR's
//    "Massachusetts Estate Tax Guide".
export const FEDERAL_2011_CREDIT_TABLE = [
  { over: 40000, upTo: 90000, base: 0, rate: 0.008 },
  { over: 90000, upTo: 140000, base: 400, rate: 0.016 },
  { over: 140000, upTo: 240000, base: 1200, rate: 0.024 },
  { over: 240000, upTo: 440000, base: 3600, rate: 0.032 },
  { over: 440000, upTo: 640000, base: 10000, rate: 0.040 },
  { over: 640000, upTo: 840000, base: 18000, rate: 0.048 },
  { over: 840000, upTo: 1040000, base: 27600, rate: 0.056 },
  { over: 1040000, upTo: 1540000, base: 38800, rate: 0.064 },
  { over: 1540000, upTo: 2040000, base: 70800, rate: 0.072 },
  { over: 2040000, upTo: 2540000, base: 106800, rate: 0.080 },
  { over: 2540000, upTo: 3040000, base: 146800, rate: 0.088 },
  { over: 3040000, upTo: 3540000, base: 190800, rate: 0.096 },
  { over: 3540000, upTo: 4040000, base: 238800, rate: 0.104 },
  { over: 4040000, upTo: 5040000, base: 290800, rate: 0.112 },
  { over: 5040000, upTo: 6040000, base: 402800, rate: 0.120 },
  { over: 6040000, upTo: 7040000, base: 522800, rate: 0.128 },
  { over: 7040000, upTo: 8040000, base: 650800, rate: 0.136 },
  { over: 8040000, upTo: 9040000, base: 786800, rate: 0.144 },
  { over: 9040000, upTo: 10040000, base: 930800, rate: 0.152 },
  { over: 10040000, upTo: Infinity, base: 1082800, rate: 0.160 },
];

// The $60,000 the s 2011 table subtracts from the taxable estate to get the
// "adjusted taxable estate" it is keyed on.
export const ADJUSTED_TAXABLE_ESTATE_OFFSET = 60000;

// The s 2011 credit on a taxable estate. Pass the TAXABLE estate; the
// $60,000 adjustment is applied here so no caller has to remember it.
export function federal2011StateDeathTaxCredit(taxableEstate) {
  const ate = Math.max(0, (taxableEstate || 0) - ADJUSTED_TAXABLE_ESTATE_OFFSET);
  if (ate <= FEDERAL_2011_CREDIT_TABLE[0].over) return 0;
  for (const row of FEDERAL_2011_CREDIT_TABLE) {
    if (ate <= row.upTo) return row.base + (ate - row.over) * row.rate;
  }
  return 0;
}

// 2. New York's own schedule -- Tax Law s 952(b), applied to the whole New
//    York taxable estate (no $60,000 adjustment). Verified 2026-09-02
//    against the section text on nysenate.gov.
export const NY_ESTATE_SCHEDULE = [
  { over: 0, upTo: 500000, base: 0, rate: 0.0306 },
  { over: 500000, upTo: 1000000, base: 15300, rate: 0.050 },
  { over: 1000000, upTo: 1500000, base: 40300, rate: 0.055 },
  { over: 1500000, upTo: 2100000, base: 67800, rate: 0.065 },
  { over: 2100000, upTo: 2600000, base: 106800, rate: 0.080 },
  { over: 2600000, upTo: 3100000, base: 146800, rate: 0.088 },
  { over: 3100000, upTo: 3600000, base: 190800, rate: 0.096 },
  { over: 3600000, upTo: 4100000, base: 238800, rate: 0.104 },
  { over: 4100000, upTo: 5100000, base: 290800, rate: 0.112 },
  { over: 5100000, upTo: 6100000, base: 402800, rate: 0.120 },
  { over: 6100000, upTo: 7100000, base: 522800, rate: 0.128 },
  { over: 7100000, upTo: 8100000, base: 650800, rate: 0.136 },
  { over: 8100000, upTo: 9100000, base: 786800, rate: 0.144 },
  { over: 9100000, upTo: 10100000, base: 930800, rate: 0.152 },
  { over: 10100000, upTo: Infinity, base: 1082800, rate: 0.160 },
];

// 3. Minnesota's Form M706 table, applied to the taxable estate AFTER the
//    $3,000,000 exclusion is subtracted (M706 line 9), and Oregon's
//    Form OR-706 Part 6 table, applied to the whole taxable estate (its
//    first row already starts at $1,000,000 with a zero base). Both
//    verified 2026-09-02 against the departments' own form instructions.
export const MN_ESTATE_SCHEDULE = [
  { over: 0, upTo: 7100000, base: 0, rate: 0.130 },
  { over: 7100000, upTo: 8100000, base: 923000, rate: 0.136 },
  { over: 8100000, upTo: 9100000, base: 1059000, rate: 0.144 },
  { over: 9100000, upTo: 10100000, base: 1203000, rate: 0.152 },
  { over: 10100000, upTo: Infinity, base: 1355000, rate: 0.160 },
];

export const OR_ESTATE_SCHEDULE = [
  { over: 1000000, upTo: 1500000, base: 0, rate: 0.1000 },
  { over: 1500000, upTo: 2500000, base: 50000, rate: 0.1025 },
  { over: 2500000, upTo: 3500000, base: 152500, rate: 0.1050 },
  { over: 3500000, upTo: 4500000, base: 257500, rate: 0.1100 },
  { over: 4500000, upTo: 5500000, base: 367500, rate: 0.1150 },
  { over: 5500000, upTo: 6500000, base: 482500, rate: 0.1200 },
  { over: 6500000, upTo: 7500000, base: 602500, rate: 0.1300 },
  { over: 7500000, upTo: 8500000, base: 732500, rate: 0.1400 },
  { over: 8500000, upTo: 9500000, base: 872500, rate: 0.1500 },
  { over: 9500000, upTo: Infinity, base: 1022500, rate: 0.1600 },
];

// 4. Washington's Table W -- RCW 83.100.040(2)(a), the table for deaths
//    on or after July 1, 2026 (ESB 6347, c 2026, restored the pre-2025
//    10%-20% table after ESSB 5813's temporary 10%-35% one, which ran
//    July 1, 2025 - June 30, 2026). Keyed on the "Washington taxable
//    estate", which the department defines as the amount "after all
//    allowable deductions, including the applicable exclusion amount", so
//    it runs on the excess over the $3,000,000 exclusion. Verified
//    2026-09-30 against dor.wa.gov "Estate tax tables" (changelog 349;
//    it used to be priced at the 20% top rate on the whole excess).
export const WA_ESTATE_SCHEDULE = [
  { over: 0, upTo: 1000000, base: 0, rate: 0.100 },
  { over: 1000000, upTo: 2000000, base: 100000, rate: 0.140 },
  { over: 2000000, upTo: 3000000, base: 240000, rate: 0.150 },
  { over: 3000000, upTo: 4000000, base: 390000, rate: 0.160 },
  { over: 4000000, upTo: 6000000, base: 550000, rate: 0.180 },
  { over: 6000000, upTo: 7000000, base: 910000, rate: 0.190 },
  { over: 7000000, upTo: 9000000, base: 1100000, rate: 0.195 },
  { over: 9000000, upTo: Infinity, base: 1490000, rate: 0.200 },
];

// Walks any of the schedules above. Below the first row's floor there is
// no tax at all, which is what makes Oregon's $1,000,000 and the s 2011
// table's $40,000 behave correctly without a special case.
export function applyEstateSchedule(schedule, amount) {
  const x = Math.max(0, amount || 0);
  if (x <= schedule[0].over) return 0;
  for (const row of schedule) {
    if (x <= row.upTo) return row.base + (x - row.over) * row.rate;
  }
  return 0;
}

// New York's cliff -- Tax Law s 952(c). The exclusion is delivered as a
// CREDIT, not a deduction: an estate at or under the basic exclusion amount
// gets a credit equal to the whole tax, an estate between 100% and 105% of
// it gets a linearly shrinking credit, and an estate over 105% gets nothing
// at all and pays the s 952(b) schedule on every dollar. At the 2026
// exclusion the cliff edge sits at $7,717,500, where the bill jumps from
// roughly $0 to roughly $626,000. Verified 2026-09-02 against s 952 on
// nysenate.gov: "no credit shall be allowed to the estate of any decedent
// whose New York taxable estate exceeds one hundred five percent of the
// basic exclusion amount".
export function newYorkEstateTax(taxableEstate, basicExclusionAmount) {
  const te = Math.max(0, taxableEstate || 0);
  const bea = Math.max(0, basicExclusionAmount || 0);
  const grossTax = applyEstateSchedule(NY_ESTATE_SCHEDULE, te);
  if (te <= bea) return 0;
  if (te > bea * 1.05) return grossTax;
  // s 952(c): the credit is the tax on the BEA scaled down by how far into
  // the 5% band the estate sits.
  const fraction = (te - bea) / (0.05 * bea);
  const credit = applyEstateSchedule(NY_ESTATE_SCHEDULE, bea) * (1 - fraction);
  return Math.max(0, grossTax - credit);
}

export const STATE_ESTATE_INHERITANCE_TAX_TABLE = {
  // giftAddBack: CT includes all Connecticut taxable gifts made since 2005
  // in the taxable estate (CGS 12-391(c)); MN adds back taxable gifts made
  // within three years of death (Minn. Stat. 291.016 subd. 2(3)).
  // portability: HI (Form M-6 instructions, DSUE election) and MD
  // (Tax-General 7-309(b), deaths on/after 1/1/2019) let a surviving
  // spouse claim the first spouse's unused state exclusion; MN's 2025
  // portability bill (SF 30) was not enacted and WA expressly does not
  // recognize portability, so neither carries the flag.
  CT: { estateExemption: 15000000, estateTopRate: 0.12, giftAddBack: 'all', indexed: true },
  HI: { estateExemption: 5490000, estateTopRate: 0.20, portability: true },
  // IL's $4,000,000 is "a taxable threshold and not a credit against tax"
  // (Illinois AG estate tax fact sheet): cross it and the s 2011 table
  // applies to the whole estate, not merely the excess.
  IL: { estateExemption: 4000000, estateTopRate: 0.16, estateMethod: 'threshold2011' },
  KY: { hasInheritanceTax: true, lifeInsuranceExemptFromInheritance: true },
  ME: { estateExemption: 7160000, estateTopRate: 0.12, indexed: true },
  // MD computes the s 2011 credit and caps the unified credit at the amount
  // corresponding to a $5,000,000 exclusion ($391,600); the inheritance tax
  // paid to the Register of Wills is then subtracted from it.
  MD: {
    estateExemption: 5000000, estateTopRate: 0.16, estateMethod: 'credit2011',
    hasInheritanceTax: true, portability: true,
    inheritanceCreditsAgainstEstate: true, lifeInsuranceExemptFromInheritance: true,
  },
  // MA: the s 2011 table less a flat $99,600 credit (MGL c.65C s.2A as
  // amended 2023) -- which is exactly the table's own value at the
  // $2,000,000 filing threshold, so the two are one rule, not two.
  MA: { estateExemption: 2000000, estateTopRate: 0.16, estateMethod: 'credit2011' },
  MN: { estateExemption: 3000000, estateTopRate: 0.16, giftAddBack: 'threeYear', estateMethod: 'scheduleOnExcess', estateSchedule: MN_ESTATE_SCHEDULE },
  NE: { hasInheritanceTax: true, lifeInsuranceExemptFromInheritance: true },
  NJ: { hasInheritanceTax: true, lifeInsuranceExemptFromInheritance: true },
  // NY's exclusion is a CREDIT that phases out between 100% and 105% of the
  // basic exclusion amount and disappears above it (Tax Law s 952(c)).
  NY: { estateExemption: 7350000, estateTopRate: 0.16, estateMethod: 'ny', indexed: true },
  // OR's schedule is keyed on the whole taxable estate and its first row
  // already starts at $1,000,000, so no exemption is subtracted first.
  OR: { estateExemption: 1000000, estateTopRate: 0.16, estateMethod: 'scheduleOnWhole', estateSchedule: OR_ESTATE_SCHEDULE },
  PA: { hasInheritanceTax: true, lifeInsuranceExemptFromInheritance: true },
  RI: { estateExemption: 1838056, estateTopRate: 0.16, estateMethod: 'credit2011', indexed: true },
  // 32 V.S.A. s 7442a really is a single rate: "$5,000,000.00 or more --
  // 16 percent of the excess over $5,000,000.00". No schedule needed.
  VT: { estateExemption: 5000000, estateTopRate: 0.16 },
  // WA's 35% top rate (ESSB 5813) ran July 2025 - June 2026 only; ESB
  // 6347 restored the 10%-20% table and a $3,000,000 exclusion for deaths
  // from July 1, 2026. The department notes the $3,000,000 "is not set to
  // increase going forward due to an expired CPI in the statute", so it is
  // not indexed. Changelog 349: priced through the graduated table on the
  // excess, not at the 20% top rate.
  WA: { estateExemption: 3000000, estateTopRate: 0.20, estateMethod: 'scheduleOnExcess', estateSchedule: WA_ESTATE_SCHEDULE },
  DC: { estateExemption: 4988400, estateTopRate: 0.16, indexed: true },
};

// --- Inheritance tax, by beneficiary class -------------------------------
//
// Five states levy an inheritance tax: KY, MD, NE, NJ, PA. Unlike an estate
// tax (levied once on the estate, before anything is distributed), this is
// levied on each beneficiary individually, and the rate depends on how the
// beneficiary was related to the decedent. The spread is not marginal — in
// Pennsylvania a child pays 4.5% and a friend pays 15%; in New Jersey a child
// pays nothing and a niece pays 15-16%.
//
// Every figure below was verified against the state's own statute or revenue
// department, quoted in the per-state comments. See TAX_UPDATE_PROCESS.md
// section 9 for the update procedure.

// The relationship options offered per heir. Deliberately short: these are
// the distinctions that actually change the tax in at least one of the five
// states, not a full transcription of every class every statute defines.
export const HEIR_RELATIONSHIPS = [
  { value: 'spouse', label: 'Spouse or partner', help: 'Including a civil union or registered domestic partner. Exempt in all five states.' },
  { value: 'child', label: 'Child, grandchild, or other descendant', help: 'Stepchildren count as children in all five states.' },
  { value: 'parent', label: 'Parent or grandparent', help: 'Taxed the same as a descendant everywhere that levies this tax.' },
  { value: 'sibling', label: 'Brother or sister', help: 'The class that varies most: exempt in KY and MD, 1% in NE, 11-16% in NJ, 12% in PA.' },
  { value: 'inLaw', label: 'Son- or daughter-in-law', help: 'A child\'s spouse. Treated as close family in MD and NE, as a distant relative in KY and PA.' },
  { value: 'niece', label: 'Niece or nephew', help: 'Kentucky moved nieces and nephews into its exempt class for 2026 deaths; the other four still tax them.' },
  { value: 'other', label: 'Anyone else', help: 'Cousin, aunt, uncle, friend, unmarried partner, or any unrelated person. The highest rate in every state.' },
];

export const DEFAULT_HEIR_RELATIONSHIP = 'child';

const RELATIONSHIP_VALUES = HEIR_RELATIONSHIPS.map((r) => r.value);

export function normalizeHeirRelationship(value) {
  return RELATIONSHIP_VALUES.includes(value) ? value : DEFAULT_HEIR_RELATIONSHIP;
}

// A class's schedule. `brackets` are cumulative bands measured on the GROSS
// bequest (not on the amount net of an exemption), with any exemption written
// as a leading 0% band — which is how these statutes are actually drafted and
// is what reproduces each state's own published cumulative tax figures
// exactly.
//
// A de minimis threshold is a separate thing entirely: a CLIFF, where a small
// bequest escapes tax but one dollar more makes the WHOLE bequest taxable
// from the first dollar. Two states have one and they draw the boundary on
// opposite sides of it, which is why there are two differently-named keys
// rather than one shared number with a flag:
//   `exemptAtOrBelow` — Maryland, "does not exceed $1,000", so $1,000 is free
//                       and $1,000.01 is fully taxable.
//   `exemptBelow`     — New Jersey, "if less than $500: no tax; if $500 or
//                       more: no exemption", so $500 itself is fully taxable.
// An empty `brackets` array means the class is fully exempt.
const EXEMPT_CLASS = { brackets: [] };

export const STATE_INHERITANCE_SCHEDULES = {
  // KENTUCKY — KRS 140.070 (rates) and KRS 140.080 (exemptions).
  // 2026 Ky. Acts ch. 198 sec. 40 (effective April 27, 2026, applying to
  // deaths on or after January 1, 2026) moved "nephew, niece, or a nephew or
  // niece of the half blood" INTO Class A, which is fully exempt. Kentucky's
  // own DOR forms and guide still predate this change; the statute governs.
  // Class B is now only in-laws, aunts/uncles, and great-grandchildren.
  // Cross-check: these bands reproduce the DOR's published cumulative figures
  // exactly — Class B "$22,960 + 16% over $200,000", Class C "$6,270 + 16%
  // over $60,000".
  KY: {
    classes: {
      A: EXEMPT_CLASS,
      B: {
        brackets: [
          { limit: 1000, rate: 0 }, { limit: 10000, rate: 0.04 }, { limit: 20000, rate: 0.05 },
          { limit: 30000, rate: 0.06 }, { limit: 45000, rate: 0.08 }, { limit: 60000, rate: 0.10 },
          { limit: 100000, rate: 0.12 }, { limit: 200000, rate: 0.14 }, { limit: Infinity, rate: 0.16 },
        ],
      },
      C: {
        brackets: [
          { limit: 500, rate: 0 }, { limit: 10000, rate: 0.06 }, { limit: 20000, rate: 0.08 },
          { limit: 30000, rate: 0.10 }, { limit: 45000, rate: 0.12 }, { limit: 60000, rate: 0.14 },
          { limit: Infinity, rate: 0.16 },
        ],
      },
    },
    byRelationship: {
      spouse: 'A', child: 'A', parent: 'A', sibling: 'A', niece: 'A',
      inLaw: 'B',
      other: 'C',
    },
  },

  // MARYLAND — Md. Tax-Gen. sec. 7-204: "The inheritance tax rate is 10% of
  // the clear value of the property that passes from a decedent." Flat, no
  // brackets. sec. 7-203(b)(2) exempts grandparent, parent, spouse, child or
  // lineal descendant of a child, spouse of a child or descendant, surviving
  // spouse of a deceased child, and brother or sister; (b)(1)(ii)-(iii)
  // define "child" to include a stepchild and "parent" a stepparent. A
  // registered domestic partner is exempt for deaths on or after Oct 1, 2023.
  // sec. 7-203(g) is a per-BENEFICIARY cliff, not an exemption: the tax "does
  // not apply ... to any 1 person if the total value of the property does not
  // exceed $1,000" — at $1,001 the whole amount is taxable.
  // Maryland is the only jurisdiction that levies both taxes.
  MD: {
    classes: {
      exempt: EXEMPT_CLASS,
      taxed: { exemptAtOrBelow: 1000, brackets: [{ limit: Infinity, rate: 0.10 }] },
    },
    byRelationship: {
      spouse: 'exempt', child: 'exempt', parent: 'exempt', sibling: 'exempt', inLaw: 'exempt',
      niece: 'taxed', other: 'taxed',
    },
  },

  // NEBRASKA — flat rates above a per-beneficiary exemption, post-LB 310
  // (the phase-in completed for deaths on or after January 1, 2023; the
  // statutes still print the pre-2023 figures alongside for historical
  // deaths, which is an easy transcription trap).
  //   sec. 77-2004 immediate relatives: 1% over $100,000. Includes parents,
  //     grandparents, siblings, children and any lineal descendant, adopted
  //     children, a person the decedent stood in loco parentis to for 10+
  //     years, AND "the spouse or surviving spouse of any of" them — which is
  //     what puts a son- or daughter-in-law in this class rather than a
  //     distant one. Spouses are exempt outright.
  //   sec. 77-2005 remote relatives: 11% over $40,000 — uncle, aunt, niece,
  //     nephew by blood or adoption, and their descendants.
  //   sec. 77-2006 all others: 15% over $25,000.
  // Also fully exempt regardless of class: any beneficiary under 22.
  NE: {
    classes: {
      exempt: EXEMPT_CLASS,
      immediate: { brackets: [{ limit: 100000, rate: 0 }, { limit: Infinity, rate: 0.01 }] },
      remote: { brackets: [{ limit: 40000, rate: 0 }, { limit: Infinity, rate: 0.11 }] },
      other: { brackets: [{ limit: 25000, rate: 0 }, { limit: Infinity, rate: 0.15 }] },
    },
    byRelationship: {
      spouse: 'exempt',
      child: 'immediate', parent: 'immediate', sibling: 'immediate', inLaw: 'immediate',
      niece: 'remote',
      other: 'other',
    },
  },

  // NEW JERSEY — N.J.S.A. 54:34-2. Class B was abolished effective July 1,
  // 1963 and does not exist; the Division of Taxation's own instructions say
  // so. New Jersey's estate tax is separately repealed for deaths on or after
  // January 1, 2018, so this is the only death tax it levies.
  //   Class A (exempt): spouse, civil union or domestic partner, parent,
  //     grandparent, child including adopted and step, grandchild.
  //   Class C: sibling, spouse of a child, surviving spouse of a deceased
  //     child. First $25,000 exempt, then 11% to $1,100,000, 13% to
  //     $1,400,000, 14% to $1,700,000, 16% above.
  //   Class D: everyone else. 15% to $700,000, 16% above, with a $500 cliff
  //     ("If less than $500: no tax — If $500 or more: no exemption").
  // The 11% band running all the way to $1.1M is why this state cannot be
  // modeled with a top rate: a $500,000 bequest to a sibling is taxed at
  // 11%, not 16%.
  NJ: {
    classes: {
      A: EXEMPT_CLASS,
      C: {
        brackets: [
          { limit: 25000, rate: 0 }, { limit: 1100000, rate: 0.11 },
          { limit: 1400000, rate: 0.13 }, { limit: 1700000, rate: 0.14 },
          { limit: Infinity, rate: 0.16 },
        ],
      },
      D: {
        exemptBelow: 500,
        brackets: [{ limit: 700000, rate: 0.15 }, { limit: Infinity, rate: 0.16 }],
      },
    },
    byRelationship: {
      spouse: 'A', child: 'A', parent: 'A',
      sibling: 'C', inLaw: 'C',
      niece: 'D', other: 'D',
    },
  },

  // PENNSYLVANIA — 72 P.S. sec. 9116, as stated on REV-584 and the REV-1500
  // computation lines: "0 percent on transfers to a surviving spouse, to a
  // parent from a child aged 21 or younger, and to or for the use of a child
  // aged 21 or younger from a parent" ... "4.5 percent on transfers to direct
  // descendants and lineal heirs; 12 percent on transfers to siblings; and 15
  // percent on transfers to other heirs." Flat rates, no brackets, and no
  // per-beneficiary dollar exemption of any kind. Lineal heirs run in both
  // directions — grandparents and parents as well as descendants.
  // Not modeled: the 0% rate for a parent inheriting from a child aged 21 or
  // under, which requires the decedent's age rather than the heir's.
  PA: {
    classes: {
      exempt: EXEMPT_CLASS,
      lineal: { brackets: [{ limit: Infinity, rate: 0.045 }] },
      sibling: { brackets: [{ limit: Infinity, rate: 0.12 }] },
      collateral: { brackets: [{ limit: Infinity, rate: 0.15 }] },
    },
    byRelationship: {
      spouse: 'exempt',
      child: 'lineal', parent: 'lineal',
      sibling: 'sibling',
      inLaw: 'collateral', niece: 'collateral', other: 'collateral',
    },
  },
};

// Documented simplifications, so they are not mistaken for bugs:
//  - "Anyone else" absorbs aunts, uncles and cousins. Kentucky and Nebraska
//    both put aunts/uncles a tier BELOW unrelated persons (KY Class B, NE
//    remote at 11%/$40,000), so this over-states the tax for that specific
//    relative. It is deliberate: in a retirement planner the decedent is
//    usually older than their aunt or uncle, and a shorter list of options
//    the user reads is worth more than a seventh they scroll past.
//  - Charitable bequests are handled by the charitable-bequest feature and
//    are exempt in all five states, so no "charity" relationship is offered
//    here. New Jersey's charitable exemption is reciprocity-limited for
//    out-of-state institutions; that is out of scope.
//  - Nebraska exempts any beneficiary under 22 outright, and Pennsylvania
//    charges 0% to a parent inheriting from a child aged 21 or under. Neither
//    is modeled — the app has no heir age, and adding one for two edge cases
//    in one state each is not worth the input burden.
//  - Beneficiary-class definitions are matched to the closest option offered;
//    where a state draws a line this list does not (a step-grandchild in NJ,
//    a foster child in KY), the app applies the nearer class.

// Applies a class's cumulative bands to a gross bequest.
export function inheritanceTaxForSchedule(schedule, grossBequest) {
  const amount = Math.max(0, grossBequest || 0);
  if (!schedule || !schedule.brackets || schedule.brackets.length === 0 || amount <= 0) return 0;
  // The de minimis is a cliff, not an exemption: below the line nothing is
  // due; above it the entire bequest is taxed from the first dollar. The two
  // states that have one disagree about which side the line itself falls on.
  if (schedule.exemptAtOrBelow !== undefined && amount <= schedule.exemptAtOrBelow) return 0;
  if (schedule.exemptBelow !== undefined && amount < schedule.exemptBelow) return 0;
  let tax = 0;
  let prevLimit = 0;
  for (const band of schedule.brackets) {
    if (amount <= prevLimit) break;
    const taxableInBand = Math.min(amount, band.limit) - prevLimit;
    tax += taxableInBand * band.rate;
    prevLimit = band.limit;
  }
  return tax;
}

// The inheritance tax one beneficiary owes on their own bequest.
export function calculateInheritanceTax(stateCode, grossBequest, relationship) {
  const state = STATE_INHERITANCE_SCHEDULES[stateCode];
  if (!state) return 0;
  const classKey = state.byRelationship[normalizeHeirRelationship(relationship)];
  return inheritanceTaxForSchedule(state.classes[classKey], grossBequest);
}

// The top marginal rate this state charges a beneficiary of this class --
// used for explanatory copy, not for computing anyone's bill.
export function inheritanceTopRateFor(stateCode, relationship) {
  const state = STATE_INHERITANCE_SCHEDULES[stateCode];
  if (!state) return 0;
  const schedule = state.classes[state.byRelationship[normalizeHeirRelationship(relationship)]];
  if (!schedule || !schedule.brackets.length) return 0;
  return schedule.brackets[schedule.brackets.length - 1].rate;
}

// grossEstate is the full ending portfolio (all heirs combined); heirShare
// is this heir's normalized 0-1 split of it. Estate tax is computed once
// against the whole estate (since it's levied before distribution) and then
// allocated to this heir proportionally; inheritance tax is computed
// against this heir's own bequest, since it's levied on what each
// beneficiary actually receives and at a rate set by who they are.
// opts (2026-08-30 second audit, F-2/F-3):
//   married             true for an MFJ plan. In the states whose table
//                       entry carries `portability: true` (HI and MD --
//                       both allow a deceased-spousal-unused-exclusion
//                       election; MN's 2025 portability bill was NOT
//                       enacted, and WA expressly rejects portability),
//                       the exemption doubles, mirroring the federal
//                       "portability assumed" treatment at the second
//                       death. Everywhere else marriage changes nothing.
//   lifetimeTaxableGifts  all lifetime taxable gifts -- added to the
//                       estate-tax base where the table says
//                       `giftAddBack: 'all'` (CT: gifts since 2005 are in
//                       the Connecticut taxable estate, CGS 12-391).
//   recentTaxableGifts  taxable gifts made within three years of death --
//                       added where `giftAddBack: 'threeYear'` (MN,
//                       Minn. Stat. 291.016 subd. 2).
//   lifeInsuranceInEstate  how much of grossEstate is life-insurance
//                       proceeds. The five inheritance-tax states all
//                       exempt insurance on the decedent's life paid to a
//                       named beneficiary -- which is what every heir in
//                       this model is -- so it comes out of the
//                       INHERITANCE base while staying in the ESTATE base
//                       (audit Q-18(c), changelog 127).
//   totalInheritanceTax  the inheritance tax owed by ALL beneficiaries
//                       together. Maryland subtracts it from the estate's
//                       gross estate-tax liability, so the offset has to
//                       be computed once for the whole estate rather than
//                       per heir (audit Q-18(b)).
//
// The estate-tax half is computed for the WHOLE estate and then multiplied
// by heirShare, because that is how the tax is actually levied: once, on
// the estate, before anything is distributed. Doing it that way rather than
// per-heir is what makes a graduated schedule come out right -- splitting
// the estate five ways first would put each slice in a much lower bracket.
export function stateGrossEstateTax(stateCode, grossEstate, opts = {}) {
  const table = STATE_ESTATE_INHERITANCE_TAX_TABLE[stateCode];
  if (!table || table.estateExemption === undefined || grossEstate <= 0) return 0;
  // Audit Q-13 (changelog 127): only the exemptions the statute actually
  // indexes move with the plan's tax-bracket inflation rate. CT tracks the
  // federal basic exclusion, and ME, NY, RI and DC each index by their own
  // CPI formula; HI, IL, MA, MD, MN, OR, VT and WA are fixed dollar figures
  // that only change by legislation, so indexing them would invent relief
  // nobody has been granted. The rate schedules themselves -- the s 2011
  // credit table, NY s 952(b), MN's and OR's tables -- are frozen in
  // statute and are never indexed.
  const indexFactor = table.indexed ? Math.max(1, opts.inflationFactor || 1) : 1;
  const exemption = table.estateExemption * indexFactor * (table.portability && opts.married ? 2 : 1);
  let base = grossEstate;
  if (table.giftAddBack === 'all') base += Math.max(0, opts.lifetimeTaxableGifts || 0);
  else if (table.giftAddBack === 'threeYear') base += Math.max(0, opts.recentTaxableGifts || 0);

  switch (table.estateMethod) {
    case 'ny':
      return newYorkEstateTax(base, exemption);
    case 'credit2011': {
      // The s 2011 table less this state's own applicable credit, which is
      // that same table evaluated at the state's exclusion amount. MA
      // publishes it as $99,600, RI as $87,940 and MD as $391,600; all
      // three fall out of this one line, which is the cross-check that the
      // table was transcribed correctly.
      const credit = federal2011StateDeathTaxCredit(exemption);
      return Math.max(0, federal2011StateDeathTaxCredit(base) - credit);
    }
    case 'threshold2011':
      // A threshold, not a deduction: at or below it nothing is due, above
      // it the table applies to the whole estate.
      return base > exemption ? federal2011StateDeathTaxCredit(base) : 0;
    case 'scheduleOnExcess':
      return applyEstateSchedule(table.estateSchedule, Math.max(0, base - exemption));
    case 'scheduleOnWhole':
      return applyEstateSchedule(table.estateSchedule, base);
    default:
      // Single-rate states (CT, HI, ME, VT, DC): priced at one rate on the
      // excess (VT's statute really is one rate; KNOWN_ISSUES lists the
      // others whose tables are simplified this way).
      return Math.max(0, base - exemption) * table.estateTopRate;
  }
}

export function calculateStateEstateInheritanceTax(stateCode, grossEstate, heirShare, relationship = DEFAULT_HEIR_RELATIONSHIP, opts = {}) {
  const table = STATE_ESTATE_INHERITANCE_TAX_TABLE[stateCode];
  if (!table || grossEstate <= 0 || heirShare <= 0) return 0;
  let tax = 0;
  if (table.estateExemption !== undefined) {
    let grossEstateTax = stateGrossEstateTax(stateCode, grossEstate, opts);
    // Maryland: "The inheritance tax paid to the Register of Wills is
    // subtracted from the gross Maryland estate tax liability and the
    // difference is the Maryland estate tax due" -- Comptroller of
    // Maryland, Tax Tip 42. Summing the two taxed the same dollars twice.
    if (table.inheritanceCreditsAgainstEstate) {
      // calculateHeirEstateTax supplies the real total across every heir.
      // A direct caller that doesn't is taken to mean "this relationship
      // describes the whole estate", which is exactly right for the
      // single-heir case and a sane reading of a partial share.
      const inheritancePaid = opts.totalInheritanceTax !== undefined
        ? Math.max(0, opts.totalInheritanceTax)
        : stateInheritanceTaxForHeir(stateCode, grossEstate, 1, relationship, opts);
      grossEstateTax = Math.max(0, grossEstateTax - inheritancePaid);
    }
    tax += grossEstateTax * heirShare;
  }
  if (table.hasInheritanceTax) {
    tax += stateInheritanceTaxForHeir(stateCode, grossEstate, heirShare, relationship, opts);
  }
  return tax;
}

// One heir's inheritance tax, with the life-insurance exclusion applied.
// Exported so calculateHeirEstateTax can total it across every heir before
// applying Maryland's credit.
export function stateInheritanceTaxForHeir(stateCode, grossEstate, heirShare, relationship = DEFAULT_HEIR_RELATIONSHIP, opts = {}) {
  const table = STATE_ESTATE_INHERITANCE_TAX_TABLE[stateCode];
  if (!table || !table.hasInheritanceTax || grossEstate <= 0 || heirShare <= 0) return 0;
  const exemptInsurance = table.lifeInsuranceExemptFromInheritance
    ? Math.max(0, Math.min(grossEstate, opts.lifeInsuranceInEstate || 0))
    : 0;
  const bequest = Math.max(0, grossEstate - exemptInsurance) * heirShare;
  return calculateInheritanceTax(stateCode, bequest, relationship);
}

// Federal Estate Tax -- 2026, per the One Big Beautiful Bill Act (signed
// July 2025), which made the federal estate/gift tax exemption permanent
// and raised it to $15,000,000 per person, indexed for inflation going
// forward. Amounts above the exemption are taxed at a flat 40%: a real
// graduated schedule exists below that, but with an exemption this large
// almost every actually-taxable federal estate already lands in the top
// bracket, so a flat rate is a reasonable simplification here (matching
// how this app already treats capital gains as always long-term, etc).
// --- Lifetime gifting --------------------------------------------------
//
// Source: irs.gov "Frequently asked questions on gift taxes" and the 2026
// inflation-adjustment release. See src/config/sources.js.
export const ANNUAL_GIFT_EXCLUSION_2026 = 19000;

// What this year's gifting plan gives away, and how much of it is
// "taxable" in the technical sense -- meaning it consumes lifetime
// exemption, not that any tax is due now. Almost no one who uses this
// feature will ever owe gift tax; the point of separating the two figures
// is that the excess quietly shrinks the shelter over the estate decades
// later, which is invisible unless something tracks it.
//
// Expects already-sanitized inputs (runProjection and calculateHeirEstateTax
// both sanitize before calling).
export function giftingForAge(inputs, age) {
  const none = { gifted: 0, excluded: 0, taxable: 0 };
  if (!inputs.giftingEnabled) return none;

  const start = inputs.giftingStartAge;
  const years = Math.max(0, inputs.giftingYears);
  if (years <= 0 || age < start || age >= start + years) return none;

  const recipients = Math.max(0, inputs.giftingRecipients);
  if (recipients <= 0) return none;

  // Both the gift and the exclusion are grown at the same rate, so a plan
  // set to "give exactly the exclusion" stays exactly at it for the whole
  // window rather than drifting over the line and inventing taxable gifts.
  // Simplification worth knowing: the real exclusion steps in $1,000
  // increments at irregular intervals rather than growing smoothly.
  const elapsed = age - start;
  const growth = inputs.giftingGrowWithInflation
    ? Math.pow(1 + (inputs.inflationRate || 0) / 100, elapsed)
    : 1;

  const perRecipient = Math.max(0, inputs.giftingPerRecipient) * growth;
  const splitting = inputs.giftingSplitWithSpouse && inputs.spouse2Enabled;
  const exclusionPerRecipient = ANNUAL_GIFT_EXCLUSION_2026 * growth * (splitting ? 2 : 1);

  const gifted = perRecipient * recipients;
  const excluded = Math.min(perRecipient, exclusionPerRecipient) * recipients;
  return { gifted, excluded, taxable: gifted - excluded };
}

// Lifetime totals for the whole gifting window. Closed-form from the
// inputs rather than accumulated during the projection, because gifting is
// a decision the user made, not an outcome of market returns -- so the
// estate calculation can ask for it directly without depending on a
// particular projection run.
export function computeGiftingTotals(rawInputs) {
  const inputs = sanitizeInputs(rawInputs);
  let gifted = 0;
  let excluded = 0;
  let taxable = 0;
  if (inputs.giftingEnabled) {
    const start = inputs.giftingStartAge;
    for (let age = start; age < start + Math.max(0, inputs.giftingYears); age++) {
      const y = giftingForAge(inputs, age);
      gifted += y.gifted;
      excluded += y.excluded;
      taxable += y.taxable;
    }
  }
  return { totalGifted: gifted, totalExcluded: excluded, totalTaxableGifts: taxable };
}

// Generation-skipping transfer tax. Applies when property passes to
// someone two or more generations below you -- typically a grandchild --
// and it is charged ON TOP of estate tax on the same money, not instead of
// it. A grandchild's share can therefore be hit twice.
//
// Source: Rev. Proc. 2025-32 section 4.14 for the exemption, and the Form
// 706-GS(T) instructions for the rate.
export const GST_EXEMPTION_2026 = 15000000; // IRC 2631(c); same figure as the estate exclusion
export const GST_RATE = 0.40;               // flat, equal to the top estate rate

// CRITICAL asymmetry, and the reason this can't reuse the estate
// exemption's doubling: the estate exclusion can be doubled for a married
// couple through portability (a surviving spouse claims the deceased
// spouse's unused amount). The GST exemption CANNOT. The Form 706-GS(T)
// instructions say so outright -- a valid DSUE/portability election "does
// not apply to or impact GST tax exemption."
//
// Assuming symmetry here would have silently sheltered $30,000,000 of
// generation-skipping transfers for a married couple instead of
// $15,000,000, understating the tax by up to $6,000,000.
export const GST_EXEMPTION_IS_PORTABLE = false;

export const FEDERAL_ESTATE_EXEMPTION_2026 = 15000000; // per person
export const FEDERAL_ESTATE_TOP_RATE = 0.40;

// filingStatus is the DECEDENT'S (household's) filing status, not the
// heir's own -- MFJ doubles the exemption, assuming full portability of
// the first-to-die spouse's unused exclusion (DSUE) onto the survivor's
// estate. Portability isn't automatic; it requires filing IRS Form 706
// within the deadline after the first death, but has become standard
// estate-planning practice, so it's assumed here by default. Like the
// state estate/inheritance model above, this is computed once against the
// whole estate and allocated to this heir proportionally by heirShare.
// Simplification: unlike real law (IRC Sec. 2058), this does NOT deduct
// state estate tax paid from the federal taxable estate -- that only
// matters for the rare household large enough to owe both at once.
// `lifetimeTaxableGifts` is the estate-and-gift tax's defining feature and
// the thing people are most often surprised by: it is ONE unified
// exemption covering both. Gifts above the annual exclusion don't get
// taxed when made -- they reduce what's left to shelter the estate at
// death. Defaulted to 0 so every existing caller (and every saved plan
// with no gifting configured) behaves exactly as before.
// stateDeathTaxes (2026-08-30 second audit, F-4): IRC 2058 allows the
// federal taxable estate a deduction for estate/inheritance taxes actually
// paid to a state on property included in the gross estate. Pass the
// household's total state death taxes; 0 keeps the old behavior.
// inflationFactor (audit Q-13, changelog 127): IRC s 2010(c)(3)(B) indexes
// the basic exclusion amount for every year after 2026, so a plan that ends
// in 2056 must not measure a nominal 2056 estate against the 2026 figure.
// The 40% rate is not indexed and does not move.
// A married couple is married whichever way it files: portability does not
// depend on filing status, so MFS doubles the exemption exactly as MFJ does
// (calculateHeirEstateTax passes MFJ for any married household).
// dsueInflationFactor: the first-to-die spouse's unused exclusion (DSUE) is
// fixed in dollars at the FIRST death and is not indexed after it
// (s 2010(c)(4)), so it is carried only to the year of that death, while
// the survivor's own exclusion is indexed to the plan end. null (the
// default) indexes both to the plan end, the behavior before this existed.
export function calculateFederalEstateTax(grossEstate, filingStatus, heirShare, lifetimeTaxableGifts = 0, stateDeathTaxes = 0, inflationFactor = 1, dsueInflationFactor = null) {
  if (grossEstate <= 0 || heirShare <= 0) return 0;
  const married = filingStatus === 'MFJ' || filingStatus === 'MFS';
  const ownFactor = Math.max(1, inflationFactor || 1);
  const dsueFactor = dsueInflationFactor === null || dsueInflationFactor === undefined
    ? ownFactor
    : Math.max(1, Math.min(ownFactor, dsueInflationFactor || 1));
  const fullExemption = FEDERAL_ESTATE_EXEMPTION_2026 * (ownFactor + (married ? dsueFactor : 0));
  const exemption = Math.max(0, fullExemption - Math.max(0, lifetimeTaxableGifts));
  const taxableEstate = Math.max(0, grossEstate - Math.max(0, stateDeathTaxes || 0) - exemption);
  return taxableEstate * FEDERAL_ESTATE_TOP_RATE * heirShare;
}

// Heir Estate Tax Model (IRS 10-Year Rule vs. step-up in basis)
// Calculates the tax drag on inherited traditional pre-tax, roth, and
// taxable brokerage portfolios, split across one or more heirs. Each heir
// has their own filing status and baseline outside income (so their share
// of the inherited pre-tax IRA/401k stacks on top of income that's already
// theirs, at their own marginal rate) and a splitPct of the total ending
// portfolio. splitPct values are normalized to sum to 100 so the user
// doesn't have to keep them exactly balanced while editing.
// Which accounts a charitable bequest is drawn from, and why it matters.
//
// A charity and an heir are taxed completely differently on the same
// dollar, so WHICH account funds a bequest changes the after-tax result
// even when the headline amount is identical:
//
//   Pre-Tax (IRA/401k)  charity pays NOTHING. An heir pays their own
//                       marginal rate on every dollar as they empty the
//                       account under the SECURE Act 10-Year Rule.
//   Taxable brokerage   charity pays nothing; an heir gets a stepped-up
//                       basis, so their tax is near zero too. Roughly a
//                       wash either way.
//   Roth                nobody pays tax, ever, either way. Giving it to
//                       charity spends a tax-free wrapper on a recipient
//                       that did not need one.
//
// So the tax-efficient order is Pre-Tax first and Roth last. $100,000 of
// IRA to charity plus $100,000 of Roth to a child is strictly better than
// the reverse, for identical generosity.
//
// 'proportional' is kept as the default because it is what this app did
// before this option existed, and changing the default would silently move
// every saved plan's numbers.
export const CHARITABLE_SOURCE_ORDERS = {
  // Drain order across the fundable buckets.
  //
  // The ordering follows what a dollar is worth to an HEIR, because that is
  // what giving it away instead costs them. Pre-tax money is the cheapest
  // thing to leave a charity: the charity pays no income tax on an
  // inherited IRA while an heir pays their own marginal rate under the
  // 10-Year Rule. Taxable brokerage, the cash reserve and a concentrated
  // stock position all reach heirs with a s 1014 basis step-up, so they are
  // equivalent to each other and are drained together. A Roth is last in
  // every order: an heir inherits it entirely tax-free, so it is the most
  // expensive dollar to redirect.
  //
  // cash/stock joined these lists in changelog 181, when they became
  // fundable at all. A bequest large enough to exhaust preTax and taxable
  // now reaches them before touching the Roth, which is the intended fix
  // rather than an accident of ordering.
  proportional: null,
  pretax: ['preTax', 'taxable', 'cash', 'stock', 'roth'],
  taxable: ['taxable', 'cash', 'stock', 'preTax', 'roth'],
};

// Splits a bequest across the three buckets according to a drain order.
// Returns how much of EACH bucket the charity takes. Exported for tests --
// this is pure arithmetic and worth pinning down separately from the much
// larger estate calculation that consumes it.
export function splitCharitableBequest(amount, buckets, order) {
  // Generic over whatever buckets it is handed (changelog 181). It used to
  // hardcode preTax/roth/taxable, which is what kept the cash reserve and a
  // concentrated stock position out of a bequest even after changelog 133
  // put both into the gross estate. The OUTPUT mirrors the INPUT keys, so a
  // caller passing three buckets still gets three back.
  const keys = Object.keys(buckets || {});
  const out = {};
  for (const k of keys) out[k] = 0;

  const total = keys.reduce((sum, k) => sum + Math.max(0, buckets[k] || 0), 0);
  if (amount <= 0 || total <= 0) return out;
  const capped = Math.min(amount, total);

  // No order given -> proportional, the historical behavior.
  if (!order) {
    const fraction = capped / total;
    for (const k of keys) out[k] = Math.max(0, buckets[k] || 0) * fraction;
    return out;
  }

  let remaining = capped;
  for (const key of order) {
    if (remaining <= 0) break;
    // An order may name a bucket a given caller does not have; skipping
    // rather than reading undefined keeps one order list usable by both.
    if (!(key in buckets)) continue;
    const take = Math.min(remaining, Math.max(0, buckets[key] || 0));
    out[key] = take;
    remaining -= take;
  }
  return out;
}

// endingHsa (changelog 119): an HSA is the one account with no
// beneficiary-friendly exit. A spouse inherits it as their own HSA (so the
// first death in a couple passes it along intact -- which is why it only
// shows up here, at the estate's final settlement), but any other heir
// owes ordinary income tax on the ENTIRE balance in the year of death: no
// 10-year stretch, no step-up, no Roth treatment (IRC 223(f)(8)(B)).
// Before this it was left out of the estate entirely (KNOWN_ISSUES Q-13),
// understating heir tax for any household that actually funds one.
// otherEstateAssets carries the balances that are part of the gross estate
// under IRC s 2033 ("all property, real or personal, tangible or
// intangible") but are not one of the four retirement buckets: unpaid
// non-qualified deferred comp, the cash reserve, a concentrated stock
// position, and home equity. They were silently excluded until changelog
// 133, so a plan dying with a $19M founder position paid estate tax on
// none of it. Defaults to {} so every existing caller is unchanged.
// Deflate a calculateHeirEstateTax result into today's dollars for DISPLAY
// (changelog 145). The estate TAX must be computed on nominal (future)
// balances -- the exemptions and brackets inside calculateHeirEstateTax are
// indexed up to the plan's final year, and the tax the heirs actually pay is
// a nominal-law computation at the year of death. Feeding it deflated
// balances (which App.jsx did whenever "Today's Dollars" was on -- the
// default) compared real balances against future exemptions and silently
// understated, often ZEROED, the estate tax: a plan that genuinely crossed
// New York's ~$18M line read $0. So the tax is now always computed nominal,
// and this function converts the whole result to today's dollars afterwards
// for display, by the SAME final-year inflation factor App.jsx deflates the
// Ending Balance by -- so Gross Inherited Wealth and Ending Balance finally
// sit in the same dollars.
//
// `factor` is that final-year inflation factor (>= 1). factor === 1 (nominal
// display) returns the result unchanged. Only dollar-valued fields are
// divided; rates, percentages, shares, ages, flags, ids and labels are left
// exactly as they are -- the same discipline the projection's DOLLAR_FIELDS
// list uses, and for the same reason (blanket-dividing every number would
// corrupt effectiveEstateTaxRate, splitPct and heirAgeYearAfterDeath).
const ESTATE_TOP_DOLLAR_FIELDS = [
  'grossInherited', 'netInherited', 'totalHeirTax', 'totalHsaHeirTax',
  'totalNqdcHeirTax', 'nqdcInherited', 'steppedUpAssetsInherited', 'hsaInherited',
  'totalStateEstateTax', 'totalFederalEstateTax', 'totalGenerationSkippingTax',
  'charitableBequest', 'totalPreTaxWithdrawn', 'totalLifeInsuranceProceeds',
  'lifeInsuranceEstateInclusion', 'preTaxEstateTax', 'rothEstateTax', 'taxableEstateTax',
  'totalForeignEstateTax', 'totalHeirStateIncomeTax',
];
const ESTATE_PERHEIR_DOLLAR_FIELDS = [
  'grossInherited', 'netInherited', 'totalHeirTax', 'hsaInherited', 'hsaHeirTax',
  'nqdcInherited', 'nqdcHeirTax', 'steppedUpAssetsInherited', 'rothInherited',
  'taxableInherited', 'stateEstateTax', 'federalEstateTax', 'gstTax',
  'preTaxWithdrawn', 'lifeInsuranceInherited', 'income', 'foreignEstateTax', 'stateIncomeTax',
];
const ESTATE_WITHDRAWAL_DOLLAR_FIELDS = ['withdrawal', 'combinedIncome', 'taxPaid', 'taxDrag'];
const ESTATE_CSC_DOLLAR_FIELDS = [
  'proportionalNetInherited', 'netGainVsProportional', 'proportionalHeirTax', 'heirTaxSaved',
];

function deflateFields(obj, fields, factor) {
  const out = { ...obj };
  for (const k of fields) {
    if (typeof out[k] === 'number') out[k] = out[k] / factor;
  }
  return out;
}

export function deflateEstateResultForDisplay(result, factor) {
  if (!result || !(factor > 0) || factor === 1) return result;
  const deflateWithdrawals = (arr) =>
    Array.isArray(arr) ? arr.map((w) => deflateFields(w, ESTATE_WITHDRAWAL_DOLLAR_FIELDS, factor)) : arr;

  const out = deflateFields(result, ESTATE_TOP_DOLLAR_FIELDS, factor);

  if (result.composition && typeof result.composition === 'object') {
    const c = { ...result.composition };
    for (const k of Object.keys(c)) {
      if (typeof c[k] === 'number') c[k] = c[k] / factor;
    }
    out.composition = c;
  }
  if (Array.isArray(result.perHeir)) {
    out.perHeir = result.perHeir.map((h) => {
      const dh = deflateFields(h, ESTATE_PERHEIR_DOLLAR_FIELDS, factor);
      dh.annualWithdrawals = deflateWithdrawals(h.annualWithdrawals);
      return dh;
    });
  }
  out.annualWithdrawals = deflateWithdrawals(result.annualWithdrawals);
  if (result.charitableSourceComparison) {
    out.charitableSourceComparison = deflateFields(result.charitableSourceComparison, ESTATE_CSC_DOLLAR_FIELDS, factor);
  }
  return out;
}

// State income tax on what an heir draws from the inherited pre-tax
// account (changelog 263). Estate and inheritance tax follow the decedent;
// the income tax on the 10-year drawdown follows the HEIR, at the heir's
// own state -- an heir in New Mexico pays New Mexico on every withdrawal,
// one in Texas pays nothing. Each heir carries `state` (a code; blank =
// the estate's own state) and, for the states the engine prices by a
// flat rate, `stateTaxFlatRate` (default 5). The year-one lumps (HSA,
// NQDC) stack on the same return.
//
// Incomes are in plan-end dollars while the state schedules are current,
// so each year's figure is priced in today's dollars and carried forward
// by the same factor -- the same indexing the federal side applies to its
// brackets, which keeps the heir's marginal position fixed.
export function heirStateIncomeTax(heir, fallbackStateCode, heirIncome, status, annualWithdrawals, heirHsa, heirNqdc, heirAge, inflationFactor = 1, calendarYear = TAX_YEAR) {
  const code = (heir && typeof heir.state === 'string' && heir.state) ? heir.state.toUpperCase() : (fallbackStateCode || '');
  if (!code) return { stateIncomeTax: 0, stateCode: null };
  const jurisdiction = stateTaxJurisdictionFor(code);
  if (jurisdiction === 'none') return { stateIncomeTax: 0, stateCode: code };
  const flat = Number(heir && heir.stateTaxFlatRate);
  const flatRate = Number.isFinite(flat) && flat >= 0 ? flat : 5.0;
  const f = inflationFactor > 0 ? inflationFactor : 1;
  const age = Number.isFinite(Number(heirAge)) && Number(heirAge) > 0 ? Number(heirAge) : 55;
  const tax = (ordinary, distributions) => calculateStateTaxes(
    ordinary / f, 0, 0, jurisdiction, false, false, status, age, age, flatRate, 0, null, false,
    { calendarYear, retirementDistributions: distributions / f, stateCode: code, federalAGI: ordinary / f },
  ) * f;
  const baseline = tax(heirIncome, 0);
  const lumps = Math.max(0, Number(heirHsa) || 0) + Math.max(0, Number(heirNqdc) || 0);
  let total = 0;
  if (lumps > 0) total += Math.max(0, tax(heirIncome + lumps, lumps) - baseline);
  (annualWithdrawals || []).forEach((w) => {
    const draw = Math.max(0, Number(w.withdrawal) || 0);
    if (draw <= 0) return;
    // A year-one draw stacks above the year-one lumps on the same return,
    // as the federal schedule prices it (changelog 402).
    const onLumps = Number(w.year) === 1 && lumps > 0;
    total += onLumps
      ? Math.max(0, tax(heirIncome + lumps + draw, lumps + draw) - tax(heirIncome + lumps, lumps))
      : Math.max(0, tax(heirIncome + draw, draw) - baseline);
  });
  return { stateIncomeTax: total, stateCode: code };
}

export function calculateHeirEstateTax(rawInputs, endingPreTax, endingRoth, endingTaxable, lifeInsuranceNetDeathBenefit1 = 0, lifeInsuranceNetDeathBenefit2 = 0, _skipSourceComparison = false, endingHsa = 0, otherEstateAssets = {}) {
  const inputs = sanitizeInputs(rawInputs);

  // Gifts already made reduce the estate twice over, in opposite
  // directions: the money is gone from the balances that reach here (the
  // projection spent it), and anything above the annual exclusion has also
  // eaten into the exemption that shelters what's left. Only the second
  // effect needs carrying across -- the first is already in the balances.
  const { totalTaxableGifts: lifetimeTaxableGifts } = computeGiftingTotals(inputs);

  const strategy = inputs.heirDistributionStrategy || 'flat_10';
  const rawHeirs = Array.isArray(inputs.heirs) && inputs.heirs.length > 0
    ? inputs.heirs
    : [{ id: 1, name: 'Heir 1', filingStatus: inputs.heirFilingStatus || 'Single', income: inputs.heirIncome !== undefined ? inputs.heirIncome : 100000, splitPct: 100, relationship: DEFAULT_HEIR_RELATIONSHIP }];

  const maxPreTax = Math.max(0, endingPreTax);
  const maxRoth = Math.max(0, endingRoth);
  const maxTaxable = Math.max(0, endingTaxable);
  const maxHsa = Math.max(0, endingHsa || 0);
  // s 2033 assets outside the four buckets (changelog 133).
  // - Concentrated stock: publicly traded shares owned at death, at FMV.
  // - Cash reserve: cash is property.
  // - Home equity: the residence enters the gross estate at FMV and any
  //   mortgage against it is a s 2053 debt of the estate, so the NET figure
  //   is what is actually taxed -- which is what homeEquity already is.
  // - NQDC: an unpaid deferred-comp balance is a right to receive future
  //   income, included under s 2033 AND income in respect of a decedent, so
  //   the heir owes ordinary income tax on it as well (handled per-heir
  //   below, the same way the inherited HSA is).
  const maxNqdc = Math.max(0, otherEstateAssets.nqdc || 0);
  const maxCashReserve = Math.max(0, otherEstateAssets.cashReserve || 0);
  const maxConcentratedStock = Math.max(0, otherEstateAssets.concentratedStock || 0);
  const maxHomeEquity = Math.max(0, otherEstateAssets.homeEquity || 0);
  // - Other estate assets (changelog 144): real estate beyond the home,
  //   business interests, valuables. s 2033 property, stepped up at death.
  const maxOtherAssets = Math.max(0, otherEstateAssets.otherAssets || 0);
  const otherEstateTotal = maxNqdc + maxCashReserve + maxConcentratedStock + maxHomeEquity + maxOtherAssets;

  // Life insurance proceeds always pass to heirs, income-tax-free (IRC
  // Sec. 101(a)) -- but only count toward the taxable gross estate (and
  // therefore state estate tax) when that spouse's policy is self/
  // spouse-owned. A policy owned by an ILIT or other third party
  // (lifeInsuranceOwnership1/2 === 'trust') pays out entirely outside the
  // taxable estate. Each spouse's policy is evaluated against its OWN
  // enabled/ownership settings -- one spouse's policy can be self-owned
  // (counted) while the other's sits in an ILIT (excluded).
  const lifeInsuranceProceeds1 = Math.max(0, lifeInsuranceNetDeathBenefit1 || 0);
  const lifeInsuranceProceeds2 = Math.max(0, lifeInsuranceNetDeathBenefit2 || 0);
  const lifeInsuranceProceeds = lifeInsuranceProceeds1 + lifeInsuranceProceeds2;
  const lifeInsuranceEstateInclusion1 = inputs.lifeInsuranceEnabled1 && inputs.lifeInsuranceOwnership1 !== 'trust'
    ? lifeInsuranceProceeds1
    : 0;
  const lifeInsuranceEstateInclusion2 = inputs.lifeInsuranceEnabled2 && inputs.lifeInsuranceOwnership2 !== 'trust'
    ? lifeInsuranceProceeds2
    : 0;
  const lifeInsuranceEstateInclusion = lifeInsuranceEstateInclusion1 + lifeInsuranceEstateInclusion2;

  // 'equal' split (changelog 259): a zero total is the existing 1/n path
  // at every share site below, so equal mode simply takes it.
  const splitTotal = inputs.heirSplitMode === 'equal'
    ? 0
    : rawHeirs.reduce((sum, h) => sum + Math.max(0, h.splitPct || 0), 0);
  // The HSA is part of the gross estate like any other account; a
  // charitable bequest never comes out of it (the source-order model covers
  // the three drainable buckets), so it passes to heirs whole.
  const grossEstateBeforeCharity = maxPreTax + maxRoth + maxTaxable + maxHsa + lifeInsuranceEstateInclusion + otherEstateTotal;

  // Charitable bequest. The estate tax deduction for it is UNLIMITED --
  // the one lever here with no ceiling. Gifts are capped by the annual
  // exclusion and the lifetime exemption; the marital deduction only
  // defers tax to the second death. A charitable bequest removes the money
  // from the taxable estate outright.
  //
  // Modeled as coming proportionally off every account, which is the
  // simple case. Real planning usually does better by directing the
  // bequest at PRE-TAX money specifically: a charity pays no income tax on
  // an inherited IRA, while an heir pays their own marginal rate on it
  // under the 10-Year Rule. Leaving $100,000 of IRA to charity and
  // $100,000 of Roth to a child beats the reverse, sometimes by a lot.
  // That asset-targeting isn't modeled -- see the Guide.
  // Capped at the assets a bequest can actually be paid from (the three
  // drainable buckets) rather than the insurance-inclusive gross estate
  // (2026-08-30 second audit, F-6): life-insurance proceeds pass to the
  // policy's beneficiaries and cannot also fund the charity, so without
  // this cap a plan could deduct a bequest that no asset ever satisfied
  // while heirs still received the insurance in full.
  // What a bequest can actually be paid FROM. Cash and a concentrated stock
  // position joined this in changelog 181: changelog 133 put both into the
  // gross estate, but this cap was never widened to match, so a plan whose
  // wealth sits mostly in a founder position could not direct a bequest at
  // it and a large bequest was silently capped below what the estate could
  // pay.
  //
  // Home equity, NQDC, the HSA and life insurance are deliberately still
  // OUT, and for different reasons. A house is not liquid at death and an
  // executor selling it to fund a bequest is a different plan from the one
  // modeled here. An unpaid NQDC balance is a contractual claim paid on
  // the employer's schedule, not an asset the estate can direct. The HSA
  // passes to its named beneficiary and life insurance to the policy's --
  // neither is the executor's to give away, which is exactly the F-6 finding
  // this cap was created for in the first place.
  const charityFundable = maxPreTax + maxRoth + maxTaxable + maxCashReserve + maxConcentratedStock;
  const charitableBequest = inputs.charitableBequestEnabled
    ? Math.max(0, Math.min(
        charityFundable,
        inputs.charitableBequestMode === 'amount'
          ? Math.max(0, inputs.charitableBequestAmount || 0)
          : grossEstateBeforeCharity * (Math.max(0, Math.min(100, inputs.charitableBequestPct || 0)) / 100)
      ))
    : 0;

  // The charity's slice leaves before anything is split among heirs, and
  // before the estate is taxed. Both effects are real and they compound:
  // heirs get less, but the estate tax on what remains is lower too.
  //
  // WHICH accounts fund it is a separate decision from how much, and it
  // changes the after-tax result on its own -- see CHARITABLE_SOURCE_ORDERS
  // above. Rather than one blended heirFraction, the bequest is now taken
  // out of specific buckets and the heirs inherit whatever is left of each.
  const charitySourceOrder = CHARITABLE_SOURCE_ORDERS[inputs.charitableBequestSource] || null;
  const charityTakes = splitCharitableBequest(
    charitableBequest,
    {
      preTax: maxPreTax,
      roth: maxRoth,
      taxable: maxTaxable,
      cash: maxCashReserve,
      stock: maxConcentratedStock,
    },
    charitySourceOrder,
  );
  const heirsPreTaxPool = Math.max(0, maxPreTax - charityTakes.preTax);
  const heirsRothPool = Math.max(0, maxRoth - charityTakes.roth);
  const heirsTaxablePool = Math.max(0, maxTaxable - charityTakes.taxable);
  const heirsCashPool = Math.max(0, maxCashReserve - (charityTakes.cash || 0));
  const heirsStockPool = Math.max(0, maxConcentratedStock - (charityTakes.stock || 0));

  // Life insurance included in the estate is not one of the three drainable
  // buckets, so a bequest never comes out of it. It stays with the heirs
  // and is reduced proportionally only in the sense that it is already
  // inside grossEstateBeforeCharity for estate-tax purposes.
  const totalGrossEstate = grossEstateBeforeCharity - charitableBequest;
  // The estate is valued at the end of the plan, so it is taxed by the
  // state the household lives in THEN -- not the one it lives in today
  // (changelog 195). With no residency timeline the two are the same.
  const finalResidence = residenceForYear(inputs, planHorizonYear(inputs));
  // Abroad at the end (changelog 196): the US state that still claims the
  // household keeps its estate tax (null once ties are cut), and the
  // foreign inheritance tax is the user's own blended estimate -- a share
  // of the gross estate, added on top of US estate tax with no credit
  // between them (IRC s 2014 and the estate treaties can credit foreign
  // death taxes; not modeled, and the app says so).
  const stateCode = finalResidence.stateOfResidence;
  const estateAbroad = finalResidence.kind === 'foreign';
  // Changelog 200: a per-heir (or whole-estate) schedule replaces the flat
  // estimate when the country has one. Local currency at the final year's
  // exchange rate; thresholds not indexed.
  const inheritance = estateAbroad ? finalResidence.foreign.inheritance : null;
  const horizonYearForEstate = planHorizonYear(inputs);
  const yearsThereAtDeath = estateAbroad ? horizonYearForEstate - finalResidence.fromYear + 1 : 0;
  const regimeAtDeath = estateAbroad && finalResidence.foreign.regime && yearsThereAtDeath <= finalResidence.foreign.regime.years
    ? finalResidence.foreign.regime : null;
  const inheritanceApplies = !!inheritance && yearsThereAtDeath >= inheritance.worldwideAfterYears
    && !(regimeAtDeath && regimeAtDeath.exemptsInheritance);
  const estateFx = estateAbroad
    ? finalResidence.foreign.fxRate * Math.pow(1 + finalResidence.foreign.fxDriftPct / 100, horizonYearForEstate - inputs.planYear)
    : 1;
  const foreignEstateRate = estateAbroad && !inheritance && finalResidence.foreign.estateRate !== null
    ? finalResidence.foreign.estateRate / 100
    : 0;
  // One schedule on the whole estate, shared by each heir's share.
  const estateBasisForeignTax = inheritanceApplies && inheritance.basis === 'estate'
    ? progressiveTax(Math.max(0, totalGrossEstate * estateFx - inheritance.estate.allowance), inheritance.estate.brackets) / estateFx
    : 0;
  const foreignInheritanceTaxFor = (share, relationship) => {
    if (!inheritanceApplies) return 0;
    if (inheritance.basis === 'estate') return estateBasisForeignTax * share;
    const cls = inheritanceClassFor(inheritance, relationship);
    if (!cls) return 0;
    const local = totalGrossEstate * share * estateFx;
    return inheritanceClassTax(cls, local) / estateFx;
  };
  const growthRate = getEffectivePostRetireReturn(inputs);

  // Generation-skipping transfer tax, computed before the per-heir map so
  // the single $15,000,000 exemption can be shared across skip persons
  // proportionally rather than each one claiming it in full.
  //
  // Deliberately NOT doubled for a married couple. The estate exclusion can
  // be doubled through portability; the GST exemption cannot (Form
  // 706-GS(T) instructions). Reusing the estate doubling here would shelter
  // twice what the law allows.
  // Audit Q-13 (changelog 127): the estate is valued at plan end in NOMINAL
  // dollars, often thirty years out, so every threshold it is measured
  // against has to be carried to the same year or the model invents tax.
  // The factor is the plan's own Tax Bracket Inflation Rate compounded over
  // the plan's length -- the identical figure the income-tax side uses for
  // the federal brackets each year. Turning estateIndexingEnabled off
  // restores the old behavior of measuring a 2056 estate against 2026
  // thresholds, which is worth being able to see rather than argue about.
  const estateVintageYears = (Number(inputs.planYear) || TAX_YEAR) - TAX_YEAR;
  const estateInflationFactor = (() => {
    if (inputs.estateIndexingEnabled === false) return 1;
    const age1Start = inputs.planYear - inputs.birthYear1;
    const age2Start = inputs.planYear - inputs.birthYear2;
    const years = Math.max(
      0,
      Math.max(
        inputs.lifeExpectancy1 - age1Start,
        inputs.spouse2Enabled ? inputs.lifeExpectancy2 - age2Start : 0,
      ),
    );
    // Changelog 419: the exemption is the TAX_YEAR's figure, so the years
    // of indexing run from that vintage, not from the plan's first year.
    return Math.pow(1 + (inputs.taxBracketInflationRate || 0) / 100, Math.max(0, years + estateVintageYears));
  })();
  // Married for estate purposes whether the couple files jointly or
  // separately -- portability does not depend on filing status.
  const estateMarried = inputs.filingStatus === 'MFJ' || inputs.filingStatus === 'MFS';
  const estateFilingStatus = estateMarried ? 'MFJ' : inputs.filingStatus;
  // The first death's year, for the DSUE (see calculateFederalEstateTax):
  // the earlier of the two spouses' last years on the same life-expectancy
  // axis the plan-end factor uses.
  const dsueInflationFactor = (() => {
    if (inputs.estateIndexingEnabled === false || !estateMarried) return 1;
    if (!inputs.spouse2Enabled) return estateInflationFactor; // no second life modeled
    const age1Start = inputs.planYear - inputs.birthYear1;
    const age2Start = inputs.planYear - inputs.birthYear2;
    const years = Math.max(0, Math.min(inputs.lifeExpectancy1 - age1Start, inputs.lifeExpectancy2 - age2Start));
    return Math.pow(1 + (inputs.taxBracketInflationRate || 0) / 100, Math.max(0, years + estateVintageYears));
  })();

  const skipShareOfEstate = rawHeirs.reduce((sum, h) => {
    if (!h.isSkipPerson) return sum;
    const share = splitTotal > 0 ? Math.max(0, h.splitPct || 0) / splitTotal : 1 / rawHeirs.length;
    return sum + share;
  }, 0);
  const skipEstateValue = totalGrossEstate * skipShareOfEstate;
  // IRC s 2631(c) sets the GST exemption equal to the estate basic
  // exclusion amount, so it is indexed on exactly the same schedule.
  const gstExemptionAvailable = GST_EXEMPTION_2026 * estateInflationFactor;
  const gstTaxableTotal = Math.max(0, skipEstateValue - gstExemptionAvailable);
  const totalGstTax = gstTaxableTotal * GST_RATE;

  // State death taxes (2026-08-30 second audit, F-2/F-3/F-4).
  //   married feeds HI/MD portability; the gift figures feed CT's
  //   full add-back and MN's three-year add-back. "Within three years of
  //   death" is measured against the plan's final year on Spouse 1's age
  //   axis (the projection ends at the last survivor's life expectancy).
  const stateOpts = (() => {
    const age1Init = inputs.planYear - inputs.birthYear1;
    const age2Init = inputs.planYear - inputs.birthYear2;
    const planYears = Math.max(
      (inputs.lifeExpectancy1 - age1Init),
      inputs.spouse2Enabled ? (inputs.lifeExpectancy2 - age2Init) : 0
    );
    const endAge1 = age1Init + Math.max(0, planYears);
    let recentTaxableGifts = 0;
    if (inputs.giftingEnabled) {
      for (let a = endAge1 - 2; a <= endAge1; a++) {
        recentTaxableGifts += giftingForAge(inputs, a).taxable;
      }
    }
    return {
      married: estateMarried, lifetimeTaxableGifts, recentTaxableGifts,
      inflationFactor: estateInflationFactor,
      // How much of totalGrossEstate is life-insurance money. The five
      // inheritance-tax states exempt insurance paid to a named
      // beneficiary, which is what every heir here is (audit Q-18(c)).
      // Only the share actually inside the estate counts -- an ILIT-owned
      // policy never entered totalGrossEstate in the first place.
      lifeInsuranceInEstate: lifeInsuranceEstateInclusion,
    };
  })();
  const shareOf = (h) => (splitTotal > 0 ? Math.max(0, h.splitPct || 0) / splitTotal : 1 / rawHeirs.length);
  // Inheritance tax is per beneficiary, but Maryland credits the total of
  // it against the estate's own estate-tax bill, so it has to be summed
  // across every heir before either figure is final (audit Q-18(b)).
  const totalInheritanceTax = rawHeirs.reduce((sum, h) => sum + stateInheritanceTaxForHeir(
    stateCode, totalGrossEstate, shareOf(h), normalizeHeirRelationship(h.relationship), stateOpts,
  ), 0);
  stateOpts.totalInheritanceTax = totalInheritanceTax;
  // Total state death taxes across all heirs, computed up front so the
  // federal calculation can take the IRC 2058 deduction for them.
  const totalStateDeathTaxes = rawHeirs.reduce((sum, h) => sum
    + calculateStateEstateInheritanceTax(stateCode, totalGrossEstate, shareOf(h), normalizeHeirRelationship(h.relationship), stateOpts), 0);

  const perHeir = rawHeirs.map(h => {
    const normalizedShare = splitTotal > 0 ? Math.max(0, h.splitPct || 0) / splitTotal : 1 / rawHeirs.length;
    const status = h.filingStatus || 'Single';
    // The heir's own income is entered in today's dollars but is stacked
    // under an inheritance in plan-end dollars, so it is carried forward at
    // the same rate as the brackets (audit Q-13). Both sides move together,
    // which leaves a heir's marginal position unchanged and stops the
    // inheritance alone being pushed up the schedule by inflation.
    const heirIncome = (h.income !== undefined ? h.income : 100000) * estateInflationFactor;
    // Each heir takes their share of whatever the charity left behind, per
    // bucket. With a proportional bequest this is identical to the old
    // blended-fraction arithmetic; with a targeted one the mix genuinely
    // shifts -- which is the entire point, since a Roth dollar and a
    // pre-tax dollar are worth different amounts to an heir.
    const heirPreTax = heirsPreTaxPool * normalizedShare;
    const heirRoth = heirsRothPool * normalizedShare;
    const heirTaxable = heirsTaxablePool * normalizedShare;
    // Whole inherited HSA share is ordinary income to a non-spouse heir in
    // year one, stacked on their own income at their own filing status.
    const heirHsa = maxHsa * normalizedShare;
    const hsaHeirTax = heirHsa > 0
      ? Math.max(0, getHeirBracketTax(heirIncome + heirHsa, status, estateInflationFactor) - getHeirBracketTax(heirIncome, status, estateInflationFactor))
      : 0;
    // s 2033 assets outside the buckets (changelog 133). Cash, the stock
    // position and home equity pass with a s 1014 basis step-up, so they
    // carry estate tax but no heir income tax. An unpaid NQDC balance is
    // income in respect of a decedent (s 691) -- expressly DENIED a step-up
    // by s 1014(c) -- so the heir owes ordinary income tax on it, stacked on
    // their own income exactly like the inherited HSA above. Modeled as
    // year-one income, which is the common lump-sum-at-death payout; a plan
    // whose NQDC election spreads payments would spread the tax and pay
    // slightly less.
    const heirNqdc = maxNqdc * normalizedShare;
    // Cash and the stock position are net of anything the charity took
    // (changelog 181); home equity and other property were never fundable,
    // so they pass whole.
    const heirSteppedUpAssets = (heirsCashPool + heirsStockPool + maxHomeEquity + maxOtherAssets) * normalizedShare;
    // Stacked ABOVE the HSA so the two IRD items don't each price
    // themselves from the bottom bracket and understate the pair.
    const nqdcHeirTax = heirNqdc > 0
      ? Math.max(0, getHeirBracketTax(heirIncome + heirHsa + heirNqdc, status, estateInflationFactor) - getHeirBracketTax(heirIncome + heirHsa, status, estateInflationFactor))
      : 0;

    // Real-world detail: with multiple heirs, the SECURE Act 10-Year Rule
    // applies separately to each heir's own inherited IRA (the original
    // account is split into a new one per beneficiary), so each heir
    // independently chooses how to draw it down within the 10 years -- they
    // aren't forced to match each other or the household's own plan-default
    // strategy. h.distributionStrategy lets a heir override the plan-wide
    // default (`strategy`, from the selector above) individually; leaving it
    // unset just falls back to that default, so existing single-strategy
    // plans behave exactly as before.
    const heirStrategyChosen = h.distributionStrategy || strategy;
    const inheritanceCtx = heirInheritanceContext(inputs, h);
    // A year-10 lump sum is not available once the owner was past the
    // required beginning date -- annual RMDs are mandatory in years 1-9
    // (audit Q-21). Swap it for the RMD schedule and say so in the result.
    const heirStrategy = (heirStrategyChosen === 'lump_sum_end' && inheritanceCtx.decedentPastRbd) ? 'rmd_10' : heirStrategyChosen;
    const { totalHeirTax, annualWithdrawals, totalWithdrawn } = runHeirWithdrawalSchedule(heirPreTax, heirIncome, status, heirStrategy, growthRate, inheritanceCtx, estateInflationFactor, heirHsa + heirNqdc);
    // The heir's own state's income tax on the same withdrawals (changelog
    // 263) -- keyed to where the HEIR lives, unlike every death tax below.
    const { stateIncomeTax: heirStateTax, stateCode: heirStateCode } = heirStateIncomeTax(
      h, stateCode, heirIncome, status, annualWithdrawals, heirHsa, heirNqdc,
      inheritanceCtx.heirAgeYearAfterDeath, estateInflationFactor,
    );
    // A plan saved before the relationship field existed has no value here;
    // normalizeHeirRelationship falls back to 'child', which is both the most
    // common case and the same close-relative assumption the old single-pair
    // table was documented as making — so an existing plan's estate figures
    // move only where the old pairing was actually wrong.
    const relationship = normalizeHeirRelationship(h.relationship);
    const stateEstateTax = calculateStateEstateInheritanceTax(stateCode, totalGrossEstate, normalizedShare, relationship, stateOpts);
    // Federal taxable estate is reduced by the state death taxes paid
    // (IRC 2058) before the exemption applies -- see calculateFederalEstateTax.
    const federalEstateTax = calculateFederalEstateTax(totalGrossEstate, estateFilingStatus, normalizedShare, lifetimeTaxableGifts, totalStateDeathTaxes, estateInflationFactor, estateMarried ? dsueInflationFactor : null);
    // Life insurance proceeds split proportionally like the other assets --
    // always reach the heir tax-free at the federal level regardless of
    // ownership; stateEstateTax/federalEstateTax above already reflect
    // whether this share was counted in the taxable base.
    const heirLifeInsurance = lifeInsuranceProceeds * normalizedShare;

    // grossInherited/netInherited use totalWithdrawn (what actually comes
    // out of the pre-tax account, including growth accrued while it was
    // held) rather than the original heirPreTax snapshot -- for flat_10 and
    // lump_sum_end this is now larger than heirPreTax; for lump_sum_start
    // (no holding period) the two are identical.
    // A skip person's share of the GST bill, in proportion to their share
    // of all skip-person inheritance. This lands ON TOP of the estate tax
    // already charged on the same money -- a grandchild can be taxed
    // twice on one inheritance, which is the entire point of the regime
    // (it exists to stop a generation being skipped to avoid one round of
    // estate tax).
    const gstTax = h.isSkipPerson && skipShareOfEstate > 0
      ? totalGstTax * (normalizedShare / skipShareOfEstate)
      : 0;

    const grossInherited = totalWithdrawn + heirRoth + heirTaxable + heirHsa + heirLifeInsurance + heirNqdc + heirSteppedUpAssets;
    const foreignEstateTax = inheritance
      ? foreignInheritanceTaxFor(normalizedShare, normalizeHeirRelationship(h.relationship))
      : foreignEstateRate > 0 ? totalGrossEstate * foreignEstateRate * normalizedShare : 0;
    const netInherited = Math.max(0, totalWithdrawn - totalHeirTax) + heirRoth + heirTaxable + Math.max(0, heirHsa - hsaHeirTax) + heirLifeInsurance + Math.max(0, heirNqdc - nqdcHeirTax) + heirSteppedUpAssets - stateEstateTax - federalEstateTax - gstTax - foreignEstateTax - heirStateTax;
    const combinedTaxDrag = totalHeirTax + hsaHeirTax + nqdcHeirTax + stateEstateTax + federalEstateTax + gstTax + foreignEstateTax + heirStateTax;
    const effectiveEstateTaxRate = grossInherited > 0 ? (combinedTaxDrag / grossInherited) * 100 : 0;

    return {
      id: h.id,
      name: h.name || 'Heir',
      filingStatus: status,
      income: heirIncome,
      splitPct: normalizedShare * 100,
      grossInherited,
      netInherited,
      totalHeirTax,
      stateIncomeTax: heirStateTax,
      stateIncomeTaxState: heirStateCode,
      hsaInherited: heirHsa,
      hsaHeirTax,
      nqdcInherited: heirNqdc,
      nqdcHeirTax,
      steppedUpAssetsInherited: heirSteppedUpAssets,
      rothInherited: heirRoth,
      taxableInherited: heirTaxable,
      stateEstateTax,
      federalEstateTax,
      gstTax,
      foreignEstateTax,
      isSkipPerson: Boolean(h.isSkipPerson),
      relationship,
      effectiveEstateTaxRate,
      annualWithdrawals,
      preTaxWithdrawn: totalWithdrawn,
      lifeInsuranceInherited: heirLifeInsurance,
      distributionStrategy: heirStrategy,
      distributionStrategyChosen: heirStrategyChosen,
      strategyOverridden: heirStrategy !== heirStrategyChosen,
      heirAgeYearAfterDeath: inheritanceCtx.heirAgeYearAfterDeath,
      decedentPastRbd: inheritanceCtx.decedentPastRbd,
    };
  });

  const grossInherited = perHeir.reduce((sum, h) => sum + h.grossInherited, 0);
  const netInherited = perHeir.reduce((sum, h) => sum + h.netInherited, 0);
  const totalStateEstateTax = perHeir.reduce((sum, h) => sum + h.stateEstateTax, 0);
  const totalForeignEstateTax = perHeir.reduce((sum, h) => sum + h.foreignEstateTax, 0);
  // Federal estate tax (OBBBA 2026 $15M/person exemption, flat 40% simplified
  // rate -- see calculateFederalEstateTax) totaled the same way as state
  // estate tax above.
  const totalFederalEstateTax = perHeir.reduce((sum, h) => sum + h.federalEstateTax, 0);
  const totalHeirTax = perHeir.reduce((sum, h) => sum + h.totalHeirTax, 0);
  const totalHeirStateIncomeTax = perHeir.reduce((sum, h) => sum + h.stateIncomeTax, 0);
  const totalHsaHeirTax = perHeir.reduce((sum, h) => sum + h.hsaHeirTax, 0);
  const totalNqdcHeirTax = perHeir.reduce((sum, h) => sum + h.nqdcHeirTax, 0);
  const nqdcInherited = perHeir.reduce((sum, h) => sum + h.nqdcInherited, 0);
  const steppedUpAssetsInherited = perHeir.reduce((sum, h) => sum + h.steppedUpAssetsInherited, 0);
  // Every line that adds up to grossInherited, across all heirs, so the UI
  // can show WHY it differs from the dashboard's Ending Balance (which is
  // only the four portfolio buckets, before the inherited-IRA stretch
  // growth). Shares sum to 1, so the stepped-up pieces are simply the
  // estate-level figures; the bucket pieces are summed per heir because
  // a charitable bequest may have come out of them first.
  const totalShare = perHeir.reduce((sum, h) => sum + h.splitPct / 100, 0);
  const composition = {
    preTaxWithdrawn: perHeir.reduce((sum, h) => sum + h.preTaxWithdrawn, 0),
    preTaxAtDeath: heirsPreTaxPool * totalShare,
    roth: perHeir.reduce((sum, h) => sum + h.rothInherited, 0),
    taxable: perHeir.reduce((sum, h) => sum + h.taxableInherited, 0),
    hsa: maxHsa * totalShare,
    lifeInsurance: lifeInsuranceProceeds * totalShare,
    nqdc: maxNqdc * totalShare,
    cashReserve: maxCashReserve * totalShare,
    concentratedStock: maxConcentratedStock * totalShare,
    homeEquity: maxHomeEquity * totalShare,
    otherAssets: maxOtherAssets * totalShare,
  };
  const totalGenerationSkippingTax = perHeir.reduce((sum, h) => sum + h.gstTax, 0);
  // The pre-tax bucket's total across all heirs after holding-period growth
  // -- App.jsx's estate chart needs this specifically (not the raw ending
  // pre-tax balance) so its "Gross" bar for the Pre-Tax IRA row stays
  // consistent with totalHeirTax, which is now computed against the grown
  // withdrawal amounts rather than the original snapshot.
  const totalPreTaxWithdrawn = perHeir.reduce((sum, h) => sum + h.preTaxWithdrawn, 0);
  // effectiveEstateTaxRate includes state AND federal estate/inheritance tax
  // alongside the federal income-tax drag on inherited pre-tax IRAs, since
  // all three reduce what heirs actually keep — totalHeirTax itself stays
  // federal-INCOME-tax-only for backward compatibility with call sites that
  // specifically want the IRS 10-Year Rule income-tax figure.
  // The same drag the per-heir rate counts: every tax between the gross
  // estate and what the heirs keep, GST and the heirs' own state income
  // tax included (the two were left out until changelog 402, so the
  // household rate read lower than any heir's).
  const effectiveEstateTaxRate = grossInherited > 0 ? ((totalHeirTax + totalHsaHeirTax + totalNqdcHeirTax + totalStateEstateTax + totalFederalEstateTax + totalForeignEstateTax + totalGenerationSkippingTax + totalHeirStateIncomeTax) / grossInherited) * 100 : 0;

  // What the targeting is actually worth, in dollars.
  //
  // Recomputes the whole estate once more as if the bequest had come out
  // proportionally, and reports the difference in what heirs keep. Without
  // this the feature is unfalsifiable to the user -- they pick an option
  // from a dropdown and a number moves, with no way to know whether the
  // choice helped or by how much.
  //
  // Runs at most one extra pass: the recursive call is flagged so it never
  // recurses again, and it is skipped entirely when there is no bequest or
  // the order already IS proportional.
  let charitableSourceComparison = null;
  if (!_skipSourceComparison && charitySourceOrder && charitableBequest > 0) {
    const proportional = calculateHeirEstateTax(
      { ...rawInputs, charitableBequestSource: 'proportional' },
      endingPreTax, endingRoth, endingTaxable,
      lifeInsuranceNetDeathBenefit1, lifeInsuranceNetDeathBenefit2,
      true,
      maxHsa,
      otherEstateAssets,
    );
    charitableSourceComparison = {
      proportionalNetInherited: proportional.netInherited,
      // Positive means the chosen targeting beats spreading it evenly.
      netGainVsProportional: netInherited - proportional.netInherited,
      proportionalHeirTax: proportional.totalHeirTax,
      heirTaxSaved: proportional.totalHeirTax - totalHeirTax,
    };
  }

  return {
    // The state whose estate/inheritance tax was applied. Display surfaces
    // read this rather than inputs.stateOfResidence, which is only the
    // starting state once a move is planned.
    estateStateCode: stateCode,
    // Abroad at the end of the plan (changelog 196).
    estateCountry: estateAbroad ? finalResidence.countryName : null,
    foreignEstateRatePct: estateAbroad && !inheritance ? finalResidence.foreign.estateRate : null,
    // Changelog 200: 'schedule' (the country's per-heir or estate rules),
    // 'rate' (the user's flat estimate) or null; and, for a schedule that
    // does not reach the worldwide estate yet, the years it needs.
    foreignEstateMethod: estateAbroad ? (inheritance ? 'schedule' : (finalResidence.foreign.estateRate !== null ? 'rate' : null)) : null,
    foreignEstateNotYet: inheritance && !inheritanceApplies ? { afterYears: inheritance.worldwideAfterYears, yearsThere: yearsThereAtDeath } : null,
    totalForeignEstateTax,
    grossInherited,
    netInherited,
    totalHeirTax,
    totalHeirStateIncomeTax,
    totalHsaHeirTax,
    totalNqdcHeirTax,
    nqdcInherited,
    steppedUpAssetsInherited,
    composition,
    hsaInherited: maxHsa,
    totalStateEstateTax,
    totalFederalEstateTax,
    totalGenerationSkippingTax,
    charitableBequest,
    charitableBequestSource: inputs.charitableBequestSource || 'proportional',
    charitableSourceComparison,
    effectiveEstateTaxRate,
    totalPreTaxWithdrawn,
    // Kept for backward compatibility with call sites (and the print view)
    // that display a single schedule table — this is the first heir's
    // schedule, which is also the only heir's schedule in the common
    // single-heir case.
    annualWithdrawals: perHeir[0] ? perHeir[0].annualWithdrawals : [],
    perHeir,
    preTaxEstateTax: totalHeirTax,
    rothEstateTax: 0,
    taxableEstateTax: 0,
    totalLifeInsuranceProceeds: lifeInsuranceProceeds,
    lifeInsuranceEstateInclusion,
  };
}



// Target Portfolio "What-If" Solver
// Finds the required starting portfolio to survive a custom retirement scenario.
export function findTargetPortfolioSize(rawInputs, targetRetireAge1, targetRetireAge2, targetLifestyleExpense, fundTargetMethod = 'taxable') {
  const inputs = sanitizeInputs(rawInputs);
  
  // Weights based on current balances
  const currentTotal = inputs.preTaxInit + inputs.rothInit + inputs.taxableInit;
  let wPreTax = 0, wRoth = 0, wTaxable = 1;
  if (currentTotal > 0) {
    wPreTax = inputs.preTaxInit / currentTotal;
    wRoth = inputs.rothInit / currentTotal;
    wTaxable = inputs.taxableInit / currentTotal;
  } else {
    // If starting from 0, assume an equal 1/3 split for proportional
    wPreTax = 1/3; wRoth = 1/3; wTaxable = 1/3;
  }

  const overrides = {
    ...inputs,
    retireAge1: targetRetireAge1,
    retireAge2: inputs.spouse2Enabled ? targetRetireAge2 : inputs.retireAge2,
    lifestyleExpense: targetLifestyleExpense
  };

  let low = 0;
  let high = 20000000; // 20 million
  let bestPortfolio = null;
  let finalProjection = null;

  for (let iter = 0; iter < 40; iter++) {
    const mid = (low + high) / 2;
    
    let testInputs;
    if (fundTargetMethod === 'taxable') {
       testInputs = {
          ...overrides,
          taxableInit: mid
       };
    } else {
       testInputs = {
          ...overrides,
          preTaxInit: mid * wPreTax,
          rothInit: mid * wRoth,
          taxableInit: mid * wTaxable
       };
    }

    const result = _runProjectionPreSanitized(testInputs);
    
    // Success means ending balance >= 0
    if (result.isSuccessful && result.endingBalance >= 0) {
      if (fundTargetMethod === 'taxable') {
        bestPortfolio = {
          total: inputs.preTaxInit + inputs.rothInit + mid,
          preTax: inputs.preTaxInit,
          roth: inputs.rothInit,
          taxable: mid
        };
      } else {
        bestPortfolio = {
          total: mid,
          preTax: mid * wPreTax,
          roth: mid * wRoth,
          taxable: mid * wTaxable
        };
      }
      finalProjection = result;
      high = mid; // Try to find a smaller successful portfolio
    } else {
      low = mid;
    }
  }

  if (!bestPortfolio) {
     const mid = high;
     if (fundTargetMethod === 'taxable') {
        bestPortfolio = {
          total: inputs.preTaxInit + inputs.rothInit + mid,
          preTax: inputs.preTaxInit,
          roth: inputs.rothInit,
          taxable: mid
        };
        finalProjection = _runProjectionPreSanitized({...overrides, taxableInit: mid});
     } else {
        bestPortfolio = {
          total: mid,
          preTax: mid * wPreTax,
          roth: mid * wRoth,
          taxable: mid * wTaxable
        };
        finalProjection = _runProjectionPreSanitized({...overrides, preTaxInit: mid*wPreTax, rothInit: mid*wRoth, taxableInit: mid*wTaxable});
     }
  }

  // A31 (2026-09-30 review): when no balance up to the $20M search ceiling
  // lasts, the portfolio above is that ceiling and its projection fails.
  // `found` says which; `ceiling` is the limit. A surface must not present
  // a not-found ceiling as the answer.
  const found = !!(finalProjection && finalProjection.isSuccessful);
  return {
    targetPortfolio: bestPortfolio,
    projection: finalProjection,
    found,
    reason: found ? 'ok' : 'above-ceiling',
    ceiling: 20000000,
  };
}
