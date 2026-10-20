// Changelog 240: the Year by Year ledger's "Where the money goes" view.
// These run the real engine and hold the view to it -- above all, that the
// columns add back to the engine's own totalExpenses, to the dollar, so the
// breakdown can never drift from the total the rest of the app shows.
import { describe, it, expect } from 'vitest';
import { ROW_FIELD_CLASS } from '../utils/displayDollars';
import { runProjection, DEFAULT_INPUTS } from '../calculator';
import { whereMoneyGoes, moneyGoesYear, buildMoneyGoesCsv, MONEY_GOES_CSV_HEADERS } from '../utils/whereMoneyGoes';

const plan = (over) => {
  for (const k of Object.keys(over)) {
    if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  }
  // Changelog 414 made the brokerage yield's bond share ordinary income;
  // this file is about where money goes, so the yield stays all-qualified.
  return { ...DEFAULT_INPUTS, taxableQualifiedDividendFollowsAllocation: false, fundExpenseRatioPct: 0, ...over };
};
const START = DEFAULT_INPUTS.planYear;
const worker = {
  birthYear1: START - 55, retireAge1: 62, lifeExpectancy1: 90, claimingAge1: 67,
  salary1: 160000, ss1: 40000, preTaxInit: 900000, taxableInit: 400000, rothInit: 150000, hsaInit: 30000,
  lifestyleExpense: 100000, stateOfResidence: 'TX', stateTaxState: 'none',
};
const roof = {
  id: 'roof', name: 'Roof', type: 'outflow', amount: 45000, isRecurring: false,
  startAge: 64, endAge: 64, targetAccount: 'auto', fundedExternally: false,
};
const boat = { ...roof, id: 'boat', name: 'Boat', amount: 30000, startAge: 66, endAge: 66, targetAccount: 'taxable' };
const shed = { ...roof, id: 'shed', name: 'Shed', amount: 20000, startAge: 66, endAge: 66, fundedExternally: true };
const ledger = {
  lifestyleExpenseInputMode: 'categories',
  spendingBlueprint: {
    lines: [
      { id: 'a', categoryId: 'housing', label: 'home', amount: 40000 },
      { id: 'b', categoryId: 'personal', label: 'travel', amount: 60000 },
    ],
    essentialCategoryIds: ['housing'],
    unlinkedFields: [],
  },
};

const SHAPES = {
  worker: plan(worker),
  debtAndGifts: plan({
    ...worker, mortgageBalance: 200000, mortgagePayment: 24000,
    giftingEnabled: true, giftingStartAge: 60, giftingYears: 5,
  }),
  lifeEvents: plan({ ...worker, milestones: [roof, boat, shed] }),
  hsaAndLtc: plan({ ...worker, hsaContribution: 8000, ltcActive1: true, ltcStartAge1: 70 }),
  // The default household has a working-years surplus to redirect (the
  // same set-up calculator.test.js uses for Build Up Gradually).
  reserve: plan({
    spouse2Enabled: false, retireAge1: 65, birthYear1: START - 36,
    cashFloorEnabled: true, cashFloorInit: 0, cashFloorTargetMonths: 24, cashFloorReturnRate: 0, cashFloorPreFundEnabled: true,
  }),
  ledger: plan({ ...worker, ...ledger }),
};

describe('where the money goes: the columns add back to the engine', () => {
  it('reconciles every year of every plan shape to totalExpenses, to the dollar', () => {
    let checked = 0;
    for (const [name, inputs] of Object.entries(SHAPES)) {
      const proj = runProjection(inputs);
      for (const row of proj.years) {
        const r = moneyGoesYear(row);
        const expected = row.totalExpenses + (row.hsaMedicalDraw || 0)
          + ((row.milestoneOutflow || 0) - (row.milestoneOutflowGeneral || 0));
        expect(r.total - r.saved, `${name} ${row.year}`).toBeCloseTo(expected, 4);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('starts now and runs every year of the plan, working years included', () => {
    const proj = runProjection(SHAPES.worker);
    const { rows } = whereMoneyGoes(proj);
    expect(rows[0].year).toBe(START);
    expect(rows).toHaveLength(proj.years.length);
    expect(rows[0].isRetired).toBe(false);
  });

  it('counts payroll tax in Income tax while working', () => {
    const proj = runProjection(SHAPES.worker);
    const r = moneyGoesYear(proj.years[0]);
    expect(r.incomeTax).toBe(proj.years[0].totalTaxesPaid);
    // Texas has no income tax; FICA on $160k alone is over $12k.
    expect(r.incomeTax).toBeGreaterThan(12000);
  });
});

describe('what each column holds', () => {
  it('names each life event in its year, and leaves out one funded from outside the plan', () => {
    const proj = runProjection(SHAPES.lifeEvents);
    const { rows, columns } = whereMoneyGoes(proj);
    expect(columns.lifeEvents).toBe(true);
    const y64 = rows.find((r) => r.age1 === 64);
    expect(y64.lifeEventNames).toEqual(['Roof']);
    const y66 = rows.find((r) => r.age1 === 66);
    // The boat is paid straight from Taxable and is still money spent; the
    // shed was set aside outside the plan and is not.
    expect(y66.lifeEventNames).toEqual(['Boat']);
    expect(y66.lifeEvents).toBeGreaterThan(0);
    expect(rows.filter((r) => r.lifeEventNames.length > 0)).toHaveLength(2);
  });

  it('shows debt and gifts only for a plan that has them', () => {
    const plain = whereMoneyGoes(runProjection(SHAPES.worker)).columns;
    expect(plain.debt).toBe(false);
    expect(plain.gifts).toBe(false);
    const both = whereMoneyGoes(runProjection(SHAPES.debtAndGifts));
    expect(both.columns.debt).toBe(true);
    expect(both.columns.gifts).toBe(true);
    expect(both.rows[0].debt).toBeCloseTo(runProjection(SHAPES.debtAndGifts).years[0].mortgagePaymentThisYear, 6);
  });

  it('saves while working and, as a rule, not once retired', () => {
    const proj = runProjection(SHAPES.worker);
    const { rows } = whereMoneyGoes(proj);
    const first = rows[0];
    expect(first.saved).toBeGreaterThan(0);
    expect(first.savedParts.contributed).toBeCloseTo(proj.years[0].totalContributions - proj.years[0].savingsDeficit, 6);
    // The employer match never passes through the paycheck, so it is not in Saved.
    expect(proj.years[0].employerMatchAmount).toBeGreaterThan(0);
    expect(first.saved).toBeCloseTo(first.savedParts.contributed + first.savedParts.reserve + first.savedParts.reinvested, 6);
    const retired = rows.filter((r) => r.isRetired);
    expect(retired.every((r) => r.savedParts.contributed === 0)).toBe(true);
  });

  it('counts money routed into the cash reserve while working as saved', () => {
    const proj = runProjection(SHAPES.reserve);
    const pre = proj.years.find((y) => (y.cashReservePreFund || 0) > 0);
    expect(pre).toBeTruthy();
    expect(moneyGoesYear(pre).savedParts.reserve).toBe(pre.cashReservePreFund);
  });

  it('counts unspent money reinvested in Taxable as saved', () => {
    const proj = runProjection(plan({ spouse2Enabled: false, retireAge1: 65, birthYear1: START - 36 }));
    const spare = proj.years.find((y) => (y.surplusReinvested || 0) > 0);
    expect(spare).toBeTruthy();
    expect(moneyGoesYear(spare).savedParts.reinvested).toBe(spare.surplusReinvested);
  });

  it('accounts for the whole working-year paycheck: nothing left unexplained', () => {
    // Before retirement the lifestyle figure is the residual of pay, so the
    // year's uses add up to its income plus anything the portfolio paid.
    const proj = runProjection(SHAPES.worker);
    let checked = 0;
    for (const y of proj.years.filter((row) => !row.isRetired)) {
      const r = moneyGoesYear(y);
      const inflow = (y.salary || 0) + (y.fixedInflows || 0) + (y.drawdown || 0);
      expect(r.total, String(y.year)).toBeCloseTo(inflow, -1);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('health', () => {
  it('counts care the HSA paid for as health spending, and names what dominates', () => {
    const proj = runProjection(SHAPES.hsaAndLtc);
    const ltcYear = proj.years.find((y) => (y.ltcCost || 0) > 0);
    expect(ltcYear).toBeTruthy();
    const r = moneyGoesYear(ltcYear);
    expect(r.healthParts.ltc).toBe(ltcYear.ltcCost);
    expect(r.healthMainLabel).toBe('long-term care');
    const hsaYear = proj.years.find((y) => (y.hsaMedicalDraw || 0) > 0);
    expect(hsaYear).toBeTruthy();
    // totalExpenses nets the HSA-paid part out; the view keeps the full cost.
    const h = moneyGoesYear(hsaYear);
    expect(h.health).toBeCloseTo(hsaYear.healthcareBridge + hsaYear.irmaaCost + (hsaYear.medicarePenalty || 0) + hsaYear.ltcCost + (hsaYear.foreignHealthcare || 0), 6);
    expect(h.fromHsa).toBe(hsaYear.hsaMedicalDraw);
  });
});

describe('essentials and flexible', () => {
  it('splits retired years when the ledger marks essentials and the caller may show it', () => {
    const proj = runProjection(SHAPES.ledger);
    const view = whereMoneyGoes(proj, { split: true });
    expect(view.columns.split).toBe(true);
    let checked = 0;
    for (const r of view.rows.filter((x) => x.isRetired)) {
      const src = proj.years.find((y) => y.year === r.year);
      expect(r.essentials).toBeCloseTo(Math.min(src.essentialSpending, src.lifestyleExpenses), 6);
      expect(r.essentials + r.flexible).toBeCloseTo(r.lifestyle, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    // Working years stay one Lifestyle figure: their spending is the residual of pay.
    expect(view.rows.filter((x) => !x.isRetired).every((x) => x.essentials === null)).toBe(true);
  });

  it('does not split without permission, but says a split is available', () => {
    const view = whereMoneyGoes(runProjection(SHAPES.ledger), { split: false });
    expect(view.columns.split).toBe(false);
    expect(view.splitAvailable).toBe(true);
    expect(view.rows.every((r) => r.essentials === null)).toBe(true);
  });

  it('never invents a split for a plan with no essentials marked', () => {
    const view = whereMoneyGoes(runProjection(SHAPES.worker), { split: true });
    expect(view.columns.split).toBe(false);
    expect(view.splitAvailable).toBe(false);
  });
});

describe('the export', () => {
  it('writes one line per year with the view’s own columns', () => {
    const proj = runProjection(SHAPES.lifeEvents);
    const csv = buildMoneyGoesCsv(proj).split('\n');
    expect(csv[0]).toBe(MONEY_GOES_CSV_HEADERS.join(','));
    expect(csv).toHaveLength(proj.years.length + 1);
    expect(csv.some((l) => l.includes('"Roof"'))).toBe(true);
  });
});

// The view reads the app's projection, which is converted to today's
// dollars field by field (utils/displayDollars.js). A field the conversion
// does not treat as money prints future-year dollars beside today's -- the
// drift found twice on 2026-09-24 (the work-longer first-year draw, and the
// spending floor trio).

describe('every dollar the view shows is converted to today’s dollars with the rest', () => {
  const READS = [
    'lifestyleExpenses', 'essentialSpending', 'healthcareBridge', 'irmaaCost', 'medicarePenalty', 'ltcCost',
    'foreignHealthcare', 'mortgagePaymentThisYear', 'otherDebtPaymentThisYear', 'milestoneOutflow',
    'milestoneOutflowGeneral', 'giftsThisYear', 'totalTaxesPaid', 'totalContributions', 'savingsDeficit',
    'cashReservePreFund', 'surplusReinvested', 'hsaMedicalDraw', 'totalExpenses',
    // The spending floor readout on Plan Settings, fixed in the same change.
    'guaranteedIncome', 'floorGap',
  ];
  it('lists each field the view reads', () => {
    const missing = READS.filter((k) => ROW_FIELD_CLASS[k] !== 'year');
    expect(missing).toEqual([]);
  });
});
