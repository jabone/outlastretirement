import { describe, it, expect } from 'vitest';
import { runProjection, legacyAfterTaxes } from '../calculator';
import { buildParkersInputs } from '../config/demoPlanParkers';
import { buildDemoInputs } from '../config/demoPlan';
import { thingsToLookAt, yearSpan, about, withdrawalOrderCheck, bracketRoomCheck, claimingCheck, WITHDRAWAL_ORDER_LABEL, WITHDRAWAL_ORDER_OPTION } from '../utils/thingsToLookAt';
import { sanitizeForProjection } from '../utils/oneLeverCompare';
import { finalBalanceFactor } from '../utils/displayDollars';
import { ROUTES } from '../utils/tabRouting';
import { FIELD_INDEX } from '../config/fieldIndex';

const run = (inputs) => {
  const clean = sanitizeForProjection(inputs);
  const projection = runProjection(clean);
  return { inputs: clean, projection, items: thingsToLookAt(clean, projection, { runProjection }) };
};
const ids = (items) => items.map((i) => i.id);
const cartersNoConversions = () => ({ ...buildDemoInputs(), rothConversionStrategy: 'none' });

// A row with the fields the checks read, in a year with no inflation yet.
const row = (o) => ({ year: 2030, isRetired: true, priceIndex: 1, preTaxStart: 0, marginalBracket: 0.12, householdStatus: 'MFJ', ...o });

describe('worth a closer look: the plan runs short', () => {
  it('names the shortfall first, links to the three changes, and holds back tax ideas', () => {
    const { projection, items } = run(buildParkersInputs());
    expect(projection.isSuccessful).toBe(false);
    expect(items[0].id).toBe('shortfall');
    const r = projection.years.find((y) => y.shortfall > 0 || y.lifestyleDeficit > 0);
    expect(items[0].title).toBe(`The money runs short in ${r.year}`);
    expect(items[0].text).toContain(`(Ray is ${r.age1})`);
    expect(items[0].action.scrollTo).toBe('three-changes');
    expect(ids(items)).not.toContain('bracketRoom');
  });

  it('names the survivor when the first person has died by then', () => {
    const p = { isSuccessful: false, years: [row({ year: 2060, shortfall: 1, age1: 90, age2: 88, spouse1Alive: false, spouse2Alive: true })] };
    expect(thingsToLookAt({ spouse2Name: 'Angie' }, p)[0].text).toContain('(Angie is 88)');
  });
});

describe('worth a closer look: Medicare surcharge lines', () => {
  it('reads the two-year lookback at the earlier return\'s status, and names the conversion that set it', () => {
    const { projection, items } = run(buildDemoInputs());
    const over = items.find((i) => i.id === 'irmaaOver');
    expect(over).toBeTruthy();
    expect(over.figure.basisYear).toBe(over.figure.year - 2);
    expect(over.figure.over).toBeGreaterThan(0);
    expect(over.figure.over).toBeLessThanOrEqual(10000);
    const basis = projection.years.find((y) => y.year === over.figure.basisYear);
    expect(basis.convertAmount).toBeGreaterThan(0);
    expect(over.text).toContain('a smaller Roth conversion');
    expect(over.action.field).toBe('toggle-rothConversionIrmaaCap');
  });

  const lookback = (current, basis) => ({ isSuccessful: true, years: [row({ year: 2030, ...basis }), row({ year: 2031 }), row({ year: 2032, irmaaCost: 5000, irmaaBasisSource: 'lookback', irmaaThresholdFactor: 1, ...current })] });
  it('prices a survivor year on the joint return it looks back to', () => {
    // $150,000 is over the Single line but well under the joint one.
    const p = lookback({ irmaaBasisMagi: 150000, householdStatus: 'Single' }, { householdStatus: 'MFJ' });
    expect(thingsToLookAt({}, p)).toEqual([]);
    const single = lookback({ irmaaBasisMagi: 112000, householdStatus: 'Single' }, { householdStatus: 'Single' });
    expect(ids(thingsToLookAt({}, single))).toEqual(['irmaaOver']);
  });

  it('leaves out years priced on the current year, and separate returns', () => {
    expect(thingsToLookAt({}, lookback({ irmaaBasisMagi: 220000, irmaaBasisSource: 'current' }, {}))).toEqual([]);
    expect(thingsToLookAt({}, lookback({ irmaaBasisMagi: 100000 }, { householdStatus: 'MFS' }))).toEqual([]);
    expect(ids(thingsToLookAt({}, lookback({ irmaaBasisMagi: 220000 }, {})))).toEqual(['irmaaOver']);
    expect(ids(thingsToLookAt({}, lookback({ irmaaBasisMagi: 214000 }, {})))).toEqual(['irmaaUnder']);
  });
});

describe('worth a closer look: the marketplace credit line', () => {
  const p = (o) => ({ isSuccessful: true, years: [row({ acaCliffThreshold: 100000, ...o })] });
  it('flags income just over, by conversions, and just under', () => {
    const over = thingsToLookAt({}, p({ acaMagi: 104000, acaCliffBreached: true }));
    expect(ids(over)).toEqual(['acaOver']);
    expect(over[0].text).toContain('about $4,000 over');
    const conv = thingsToLookAt({}, p({ acaMagi: 180000, acaCliffBreached: true, convertAmount: 90000 }));
    expect(conv[0].text).toContain('Roth conversions push income over that line in 2030');
    expect(conv[0].action.field).toBe('toggle-acaCliffProtection');
    const under = thingsToLookAt({}, p({ acaMagi: 97000 }));
    expect(ids(under)).toEqual(['acaUnder']);
    expect(under[0].text).toContain('about $3,000 below');
    expect(thingsToLookAt({}, p({ acaMagi: 80000 }))).toEqual([]);
  });
  it('says nothing when the plan\'s health cost is entered already net of any credit', () => {
    expect(thingsToLookAt({ acaCreditSource: 'manual' }, p({ acaMagi: 104000, acaCliffBreached: true }))).toEqual([]);
  });
});

describe('worth a closer look: room in the 12% bracket', () => {
  it('sizes the room with the engine\'s own fill, and its tax, outside marketplace years', () => {
    const inputs = sanitizeForProjection(cartersNoConversions());
    const base = runProjection(inputs);
    const item = bracketRoomCheck(inputs, base, runProjection);
    expect(item).toBeTruthy();
    const altInputs = sanitizeForProjection({ ...inputs, rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.12, rothConversionDurationYears: 0, rothConversionDelayUntilRetire: true });
    const alt = runProjection(altInputs);
    const by = (p, y) => p.years.find((r) => r.year === y);
    let moved = 0;
    let taxed = 0;
    const amounts = item.figure.years.map((y) => {
      const b = by(base, y);
      const a = by(alt, y);
      expect(b.acaCliffThreshold || 0).toBe(0);
      moved += a.convertAmount - b.convertAmount;
      taxed += a.federalTax + a.stateTax - b.federalTax - b.stateTax;
      return (a.convertAmount - b.convertAmount) / b.priceIndex;
    });
    expect(item.figure.low).toBe(Math.round(Math.min(...amounts)));
    expect(item.figure.high).toBe(Math.round(Math.max(...amounts)));
    expect(item.figure.rate).toBe(Math.round((taxed / moved) * 100));
    const legacy = (p, i) => legacyAfterTaxes(i, p) / finalBalanceFactor(p.years);
    expect(item.figure.legacyDiff).toBe(Math.round(legacy(alt, altInputs) - legacy(base, inputs)));
    if (item.figure.rate > 13) expect(item.text).toContain('more than 12%');
    expect(item.text).toContain(`about ${item.figure.rate}%`);
  });
});

describe('worth a closer look: withdrawal order', () => {
  // A stand-in engine: each order returns its own made-up projection.
  const proj = (o) => ({ isSuccessful: o.ok !== false, years: [row({ year: 2030, totalTaxesPaid: o.tax, irmaaCost: o.prem || 0, convertAmount: 0, shortfall: o.short2030 ? 1 : 0 }), row({ year: 2031, totalTaxesPaid: 0, shortfall: o.short2031 ? 1 : 0 }), row({ year: 2032, totalTaxesPaid: 0, preTaxEnd: 0, rothEnd: 0, taxableEnd: o.end || 100000, shortfall: o.short2032 ? 1 : 0 })] });
  const stub = (table) => (i) => proj(table[i.withdrawalStrategy]);
  it('names the order that saves the most, and says how much in taxes and premiums', () => {
    const table = { TaxableFirst: { tax: 400000, prem: 50000 }, PreTaxFirst: { tax: 370000, prem: 52000 }, RothFirst: { tax: 380000, prem: 50000 }, ProRata: { tax: 395000, prem: 50000 } };
    const item = withdrawalOrderCheck({ withdrawalStrategy: 'TaxableFirst' }, proj(table.TaxableFirst), stub(table));
    expect(item.figure.order).toBe('PreTaxFirst');
    expect(item.figure.taxSave).toBe(30000);
    expect(item.figure.premSave).toBe(-2000);
    expect(item.text).toContain('about $30,000 less in income taxes and about $2,000 more in Medicare premiums');
    expect(item.action.label).toContain(WITHDRAWAL_ORDER_OPTION.PreTaxFirst);
  });
  it('stays quiet under 2% of lifetime costs or when it leaves less after tax', () => {
    const small = { TaxableFirst: { tax: 1000000 }, PreTaxFirst: { tax: 985000 }, RothFirst: { tax: 1000000 }, ProRata: { tax: 1000000 } };
    expect(withdrawalOrderCheck({}, proj(small.TaxableFirst), stub(small))).toBe(null);
    const less = { TaxableFirst: { tax: 400000 }, PreTaxFirst: { tax: 300000, end: 50000 }, RothFirst: { tax: 400000 }, ProRata: { tax: 400000 } };
    expect(withdrawalOrderCheck({}, proj(less.TaxableFirst), stub(less))).toBe(null);
  });
  it('on a plan that runs short, names an order that lasts at least two years longer', () => {
    const table = { TaxableFirst: { tax: 0, ok: false, short2030: true }, PreTaxFirst: { tax: 0, ok: false, short2032: true }, RothFirst: { tax: 0, ok: false, short2031: true }, ProRata: { tax: 0, ok: false, short2030: true } };
    const item = withdrawalOrderCheck({}, proj(table.TaxableFirst), stub(table));
    expect(item.title).toBe(`Withdrawing ${WITHDRAWAL_ORDER_LABEL.PreTaxFirst} lasts longer`);
    expect(item.text).toContain('last until 2032 instead of 2030');
  });
  it('a real order it names on a real plan matches the engine', () => {
    for (const i0 of [buildDemoInputs(), cartersNoConversions(), { ...buildDemoInputs(), withdrawalStrategy: 'RothFirst' }]) {
      const inputs = sanitizeForProjection(i0);
      const base = runProjection(inputs);
      const item = withdrawalOrderCheck(inputs, base, runProjection);
      if (!item) continue;
      const alt = runProjection({ ...inputs, withdrawalStrategy: item.figure.order });
      const cost = (p) => p.years.reduce((s, r) => s + (r.totalTaxesPaid + r.irmaaCost) / r.priceIndex, 0);
      expect(Math.round(cost(base) - cost(alt))).toBe(item.figure.saving);
    }
  });
});

describe('worth a closer look: Social Security claiming age', () => {
  it('names a later age that ends with more, with the trade-offs', () => {
    const inputs = sanitizeForProjection({ ...buildDemoInputs(), claimingAge1: 62 });
    const item = claimingCheck(inputs, runProjection(inputs), runProjection);
    expect(item.figure.age).toBe(70);
    expect(item.figure.gain).toBeGreaterThan(25000);
    expect(item.text).toContain('surviving spouse');
    expect(item.text).toContain('hard to undo');
  });
  it('says nothing once checks have started', () => {
    const i = buildDemoInputs();
    const inputs = sanitizeForProjection({ ...i, birthYear1: i.planYear - 72, claimingAge1: 62 });
    expect(claimingCheck(inputs, runProjection(inputs), runProjection)).toBe(null);
  });
});

describe('worth a closer look: gifts to charity', () => {
  const p = { isSuccessful: true, years: [row({ year: 2040, age1: 70, preTaxStart: 300000 }), row({ year: 2041, age1: 71, preTaxStart: 290000 }), row({ year: 2043, age1: 73, preTaxStart: 270000, rmdAmount: 9000 })] };
  it('names the year the owner turns 71, only when the plan gives and has no QCD set', () => {
    expect(thingsToLookAt({}, p)).toEqual([]);
    const item = thingsToLookAt({ charitableGivingAnnual: 5000, spouse1Name: 'Sam' }, p)[0];
    expect(item.id).toBe('qcd');
    expect(item.title).toContain('from 2041');
    expect(item.text).toContain('$5,000 a year');
    expect(item.text).toContain('the year Sam turns 71');
    expect(item.text).toContain('from 2043');
    expect(thingsToLookAt({ charitableGivingAnnual: 5000, qcdAnnualAmount: 5000 }, p)).toEqual([]);
  });
});

describe('worth a closer look: every plan', () => {
  const plans = () => [buildParkersInputs(), buildDemoInputs(), cartersNoConversions(), { ...buildDemoInputs(), claimingAge1: 62 }, { ...buildParkersInputs(), retireAge1: 60, retireAge2: 58, acaCreditSource: 'formula' }];
  it('every link goes to a page and field that exist', () => {
    for (const p of plans()) {
      for (const item of run(p).items) {
        if (!item.action || item.action.scrollTo) continue;
        const route = ROUTES[item.action.tab];
        expect(route, item.action.tab).toBeTruthy();
        if (item.action.subTab) expect(route.subTabs).toContain(item.action.subTab);
        if (item.action.field) {
          const entry = FIELD_INDEX.find((f) => f.id === item.action.field);
          expect(entry, item.action.field).toBeTruthy();
          expect(entry.tab).toBe(item.action.tab);
          expect(entry.subTab).toBe(item.action.subTab);
        }
      }
    }
  });
  it('says it in plain words: no commands, today\'s dollars named with every amount', () => {
    for (const p of plans()) {
      for (const item of run(p).items) {
        expect(item.text).not.toMatch(/\byou should\b|\bwe recommend\b|\bconsider\b/i);
        if (/\$\d/.test(item.text.replace(/\$111,000 in 2026/, ''))) expect(item.text).toContain("today's dollars");
      }
    }
  });
});

describe('helpers', () => {
  it('joins years into spans and rounds amounts', () => {
    expect(yearSpan([2030, 2031, 2032, 2035, 2037, 2038])).toBe('2030–2032, 2035 and 2037–2038');
    expect(about(4084)).toBe('about $4,000');
    expect(about(-2600)).toBe('about $3,000');
    expect(about(400)).toBe('less than $1,000');
  });
});
