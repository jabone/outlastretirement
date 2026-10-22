// The loading half touches localStorage (demoMode.js), so jsdom.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { runProjection, runMonteCarlo, sanitizeInputs, DEFAULT_INPUTS } from '../calculator';
import { firstShortfallRow, verdictBand } from '../utils/planVerdict';
import { buildParkersInputs, buildParkersBackupPayload, PARKERS_SCENARIO_DEFS } from '../config/demoPlanParkers';
import { buildQuickDemoPayload } from '../utils/demoPayload';
import { parseDemoDeepLink } from '../utils/demoDeepLink';
import { DEMO_MODE_KEY, demoHousehold } from '../utils/demoMode';
import { canonicalDemoHousehold } from '../utils/demoHouseholds';

// The Parkers are the Learn lessons' household, and the lessons quote these
// outcomes. When a tax-year or engine change moves one, this fails ON
// PURPOSE: re-tune config/demoPlanParkers.js or update the lessons that
// state the figure, in the same change.
const plan = buildParkersInputs();
const scenario = (name) => PARKERS_SCENARIO_DEFS.find((d) => d.name === name).mutate(plan);
const runsOut = (inputs) => {
  const proj = runProjection(inputs);
  const row = firstShortfallRow(proj.years);
  return { lasts: proj.isSuccessful, rayAge: row ? row.age1 : null, angieAge: row ? row.age2 : null };
};

describe('the Parkers: the story the lessons tell', () => {
  it('is a complete, valid plan', () => {
    const proj = runProjection(plan);
    expect(proj.invalidInputs || []).toEqual([]);
    for (const key of Object.keys(DEFAULT_INPUTS)) expect(plan, key).toHaveProperty(key);
    expect(sanitizeInputs(plan).spouse1Name).toBe('Ray');
  });

  it('as planned, the savings run out when Ray is 82', () => {
    expect(runsOut(plan)).toMatchObject({ lasts: false, rayAge: 82 });
  });

  it('keeps contributing while the mortgage is being paid', () => {
    const first = runProjection(plan).years[0];
    expect(first.savingsDeficit).toBeCloseTo(0, 6);
    expect(first.preTaxContribution1 + first.preTaxContribution2).toBeCloseTo(5200, 6);
    expect(first.employerMatchAmount).toBeCloseTo(1850, 6);
    expect(first.currentSpending.debtPayments).toBeCloseTo(10970, 6);
  });

  it('each change by itself buys years but does not finish the job', () => {
    expect(runsOut(scenario('Demo: Spend $500 a month less in retirement'))).toMatchObject({ lasts: false, rayAge: 89 });
    expect(runsOut(scenario('Demo: Save $500 a month more'))).toMatchObject({ lasts: false, rayAge: 89 });
    // Ray's own plan ends at 92; the shortfall arrives in Angie's last years.
    expect(runsOut(scenario('Demo: Work two more years'))).toMatchObject({ lasts: false, angieAge: 91 });
  });

  it('all three together last on average, and read "Mostly on track"', () => {
    const inputs = scenario('Demo: All three changes together');
    expect(runsOut(inputs).lasts).toBe(true);
    expect(verdictBand(runMonteCarlo(inputs).successProbability)).toBe('caution');
  });

  it('waiting longer for Social Security on top reads "On track"', () => {
    const inputs = scenario('Demo: All three, and wait longer for Social Security');
    expect(runsOut(inputs).lasts).toBe(true);
    expect(verdictBand(runMonteCarlo(inputs).successProbability)).toBe('good');
  });

  it('stopping at 62 instead runs out when Ray is 67', () => {
    expect(runsOut(scenario('Demo: Stop working at 62 instead'))).toMatchObject({ lasts: false, rayAge: 67 });
  });

  it("Ray's and Angie's priorities both last, at about the same odds, by different roads", () => {
    const ray = scenario("Demo: Ray's priorities: stop at 65, spend less");
    const angie = scenario("Demo: Angie's priorities: work two more years, keep spending");
    expect(runsOut(ray).lasts).toBe(true);
    expect(runsOut(angie).lasts).toBe(true);
    const r = runMonteCarlo(ray).successProbability;
    const a = runMonteCarlo(angie).successProbability;
    expect(Math.abs(r - a)).toBeLessThan(5);
    // Year for year the same until Ray stops working, then apart.
    const pr = runProjection(ray).years;
    const pa = runProjection(angie).years;
    const stop = pr.findIndex((y) => y.isRetired);
    expect(stop).toBeGreaterThan(5);
    for (let n = 0; n < stop; n += 1) expect(pr[n].totalPortfolioEnding).toBeCloseTo(pa[n].totalPortfolioEnding, 2);
    expect(pr[stop + 2].totalPortfolioEnding).not.toBeCloseTo(pa[stop + 2].totalPortfolioEnding, 0);
  });

  it('the two priorities scenarios carry their answers; the others carry none', () => {
    const withAnswers = PARKERS_SCENARIO_DEFS.filter((d) => d.answers).map((d) => d.name);
    expect(withAnswers).toEqual([
      "Demo: Ray's priorities: stop at 65, spend less",
      "Demo: Angie's priorities: work two more years, keep spending",
    ]);
    for (const d of PARKERS_SCENARIO_DEFS.filter((x) => x.answers)) {
      expect(Object.keys(d.answers)).toEqual(['maximize', 'protect', 'giveUp']);
      for (const v of Object.values(d.answers)) expect(v.length).toBeLessThanOrEqual(140);
    }
    const payload = buildQuickDemoPayload('parkers');
    expect(payload.planAnswers).toEqual({});
    expect(payload.savedScenarios.filter((s) => s.answers).length).toBe(2);
  });

  it('every scenario differs from the plan only by what its name says', () => {
    const allowed = new Set(['retireAge1', 'retireAge2', 'claimingAge1', 'claimingAge2', 'lifestyleExpense', 'preTaxContribution1']);
    for (const def of PARKERS_SCENARIO_DEFS) {
      const changed = Object.keys(plan).filter((k) => JSON.stringify(def.mutate(plan)[k]) !== JSON.stringify(plan[k]));
      expect(changed.length, def.name).toBeGreaterThan(0);
      for (const k of changed) expect(allowed.has(k), `${def.name} changes ${k}`).toBe(true);
    }
  });
});

describe('loading the Parkers', () => {
  beforeEach(() => localStorage.clear());

  it('the payload carries the Parkers and their scenarios, and no holdings', () => {
    const payload = buildQuickDemoPayload('parkers');
    expect(payload.isDemoPlan).toBe(true);
    expect(payload.activeInputs.spouse1Name).toBe('Ray');
    expect(payload.savedScenarios.map((s) => s.name)).toEqual(PARKERS_SCENARIO_DEFS.map((d) => d.name));
    expect(payload.savedScenarios.every((s) => s.tag === 'demo')).toBe(true);
    expect(payload.portfolioHoldings).toEqual([]);
    expect(buildParkersBackupPayload().savedScenarios).toEqual([]);
  });

  it('the default household is still the Carters', () => {
    expect(buildQuickDemoPayload().activeInputs.spouse1Name).toBe('Sam');
    expect(buildQuickDemoPayload('nobody').activeInputs.spouse1Name).toBe('Sam');
    expect(canonicalDemoHousehold(' Parkers ')).toBe('parkers');
    expect(canonicalDemoHousehold(undefined)).toBe('carters');
  });

  it('?demo=parkers asks for the Parkers; a plain demo link is unchanged', () => {
    expect(parseDemoDeepLink('?demo=parkers')).toEqual({ landOnTab: 'dashboard', household: 'parkers' });
    expect(parseDemoDeepLink('?demo=Parkers&tab=scenarios')).toEqual({ landOnTab: 'scenarios', household: 'parkers' });
    expect(parseDemoDeepLink('?demo=carters')).toEqual({ landOnTab: 'dashboard' });
    expect(parseDemoDeepLink('?demo=1')).toEqual({ landOnTab: 'dashboard' });
    expect(parseDemoDeepLink('?demo=somebody')).toBeNull();
  });

  it('the banner can tell which household is loaded', () => {
    expect(demoHousehold()).toBeNull();
    localStorage.setItem(DEMO_MODE_KEY, JSON.stringify({ active: true, household: 'parkers' }));
    expect(demoHousehold().names).toBe('Ray & Angie Parker');
    // A record from before the Parkers existed has no household.
    localStorage.setItem(DEMO_MODE_KEY, JSON.stringify({ active: true }));
    expect(demoHousehold().names).toBe('Sam & Riley Carter');
  });
});
