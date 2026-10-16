// Changelog 361: the 35 states and DC priced from their own rules
// (TAX_RULES_SPEC Rule 4.9). Hand-worked cases for each kind of rule the
// table carries, plus checks that every record is well formed.
import { describe, it, expect } from 'vitest';
import { calculateStateTaxes, stateRulesTax, stateTaxJurisdictionFor, DEFAULT_INPUTS, runProjection } from '../calculator';
import { STATE_TAX_RULES } from '../config/stateTaxRules';
import { STATE_TAX_RULE_SOURCES } from '../config/stateTaxRuleSources';
import { stateRulesSummary, stateRulesRate } from '../utils/stateRulesSummary';
import { US_STATES } from '../config/usStates';

// A retired couple, both 67: $30,000 pension, $47,500 of IRA withdrawals,
// $50,000 of Social Security of which $42,500 is federally taxable.
const COUPLE = { pension: 30000, ss: 50000, ssTaxable: 42500, ira: 47500 };
const tax = (code, o = {}) => {
  const c = { ...COUPLE, ...o };
  const agi = o.agi ?? (c.pension + c.ira + c.ssTaxable + (c.other || 0) + (c.wages || 0));
  return calculateStateTaxes(agi, c.pension, c.ss, 'state_rules', false, true, o.status || 'MFJ', o.age1 ?? 67, o.age2 ?? 67, 5, o.military || 0,
    o.pensionDetail || null, false, {
      stateCode: code, federalAGI: agi, federalTaxableSS: c.ssTaxable, retirementDistributions: c.ira,
      earnedIncome: c.wages || 0, federalDeduction: o.fd ?? 35000, longTermGains: o.gains || 0, inflationFactor: o.f ?? 1,
    });
};

describe('the state rules table', () => {
  it('covers every state with an income tax and no model of its own, and DC -- 36 in all', () => {
    const modeled = new Set(['CA', 'NY', 'IL', 'CO', 'PA', 'VA', 'WA']);
    const noTax = new Set(['TX', 'FL', 'NV', 'SD', 'WY', 'AK', 'NH', 'TN']);
    const expected = US_STATES.map(([c]) => c).filter((c) => !modeled.has(c) && !noTax.has(c));
    expect(Object.keys(STATE_TAX_RULES).sort()).toEqual(expected.sort());
    expect(expected.length).toBe(36);
    for (const c of expected) expect(stateTaxJurisdictionFor(c), c).toBe('state_rules');
  });

  it('every record is well formed and cited', () => {
    for (const [code, r] of Object.entries(STATE_TAX_RULES)) {
      for (const st of ['single', 'mfj']) {
        const b = r.brackets[st];
        expect(b.length, code).toBeGreaterThan(0);
        expect(b[b.length - 1].limit, `${code} top bracket`).toBeNull();
        b.forEach((x, i) => {
          expect(x.rate >= 0 && x.rate < 0.15, `${code} rate`).toBe(true);
          if (i > 0 && x.limit !== null) expect(x.limit, `${code} limits rise`).toBeGreaterThan(b[i - 1].limit);
        });
      }
      expect(['agi', 'federalTaxable']).toContain(r.base);
      expect(r.taxYear).toBe(2026);
      expect(STATE_TAX_RULE_SOURCES[code].length, `${code} sources`).toBeGreaterThan(0);
      expect(stateRulesSummary(code).length, code).toBeGreaterThan(1);
    }
  });
});

describe('stateRulesTax, worked by hand', () => {
  it('Georgia: $65,000 a person from 65 covers pensions and IRA money, so this couple owes nothing', () => {
    expect(tax('GA')).toBe(0);
    // At 63 the exclusion is $35,000 each: $77,500 - $70,000 = $7,500, less
    // the $30,000 standard deduction, still nothing.
    expect(tax('GA', { age1: 63, age2: 63 })).toBe(0);
    // Under 62 no exclusion: ($77,500 - $30,000) x 4.99%.
    expect(tax('GA', { age1: 60, age2: 60 })).toBeCloseTo(47500 * 0.0499, 6);
  });

  it('Georgia counts interest and dividends in the exclusion, but not wages', () => {
    // $40,000 of wages and $60,000 of dividends at 65: dividends excluded.
    const t = tax('GA', { pension: 0, ira: 0, ssTaxable: 0, ss: 0, wages: 40000, other: 60000 });
    expect(t).toBeCloseTo((40000 - 30000 - 2 * 1300) * 0.0499, 6);
  });

  it('New Jersey: the full exclusion up to $100,000 of income without Social Security, then a share, then nothing', () => {
    expect(tax('NJ')).toBe(0); // $77,500 of NJ income, all excluded
    // $120,000 of pension + IRA (no SS): 50% of it excluded for a couple.
    const mid = tax('NJ', { pension: 60000, ira: 60000, ss: 0, ssTaxable: 0 });
    const ti = 120000 - 60000 - 2 * 1000 - 2 * 1000; // exemptions + 65+ exemptions
    expect(mid).toBeCloseTo(20000 * 0.014 + 30000 * 0.0175 + 6000 * 0.0245, 4);
    expect(ti).toBe(56000);
    // $160,000: nothing excluded.
    const high = tax('NJ', { pension: 80000, ira: 80000, ss: 0, ssTaxable: 0 });
    expect(high).toBeCloseTo(20000 * 0.014 + 30000 * 0.0175 + 20000 * 0.0245 + 10000 * 0.035 + 70000 * 0.05525 + 6000 * 0.0637, 4);
  });

  it('Massachusetts: 5% after exemptions, and the 4% surtax above its line', () => {
    expect(tax('MA')).toBeCloseTo((77500 - 2 * 4400 - 2 * 700) * 0.05, 6);
    const big = tax('MA', { ira: 2000000 });
    const ti = 2030000 - 10200;
    expect(big).toBeCloseTo(ti * 0.05 + (ti - 1107750) * 0.04, 4);
  });

  it('Maine: the pension deduction is reduced by each person\'s Social Security', () => {
    // Cap $49,824 - $25,000 SS = $24,824 each, $49,648 for the couple.
    const base = 77500 - 49648 - 31400 - 2 * 5300 - 2 * 1650;
    expect(base).toBeLessThan(0);
    expect(tax('ME')).toBe(0);
    // With no Social Security the full cap applies.
    const meTaxable = 160000 - 2 * 49824 - 31400 - 10600 - 3300;
    expect(tax('ME', { ss: 0, ssTaxable: 0, pension: 80000, ira: 80000 })).toBeCloseTo(
      Math.min(meTaxable, 54850) * 0.058 + Math.max(0, meTaxable - 54850) * 0.0675, 4);
  });

  it('Maryland: the pension exclusion skips IRAs, and the county tax is included', () => {
    const r = STATE_TAX_RULES.MD;
    expect(r.retirementExclusion.covers.ira).toBe(false);
    expect(r.localRate).toBeGreaterThan(0.02);
    const withCounty = tax('MD');
    const noCounty = stateRulesTax({ ...r, localRate: 0 }, {
      income: 120000, pension: 30000, ss: 50000, status: 'MFJ', age1: 67, age2: 67, militaryPension: 0, pensionDetail: null,
      federalAGI: 120000, ssInIncome: 42500, federalDeduction: 35000, retirementDistributions: 47500, earnedIncome: 0, longTermGains: 0, inflationFactor: 1,
    });
    expect(withCounty - noCounty).toBeCloseTo(r.localRate * (47500 - 6850 - 2 * 3200 - 2 * 1000), 4);
  });

  it('Missouri leaves capital gains out', () => {
    const without = tax('MO', { other: 50000 });
    const asGains = tax('MO', { other: 50000, gains: 50000 });
    expect(asGains).toBeLessThan(without);
  });

  it('Iowa and Mississippi exclude all retirement income; North Carolina excludes none', () => {
    expect(tax('IA')).toBe(0);
    expect(tax('MS')).toBe(0);
    expect(tax('NC')).toBeCloseTo((77500 - 25500) * 0.0399, 6);
  });

  it('Connecticut and Minnesota tax Social Security only above their income lines', () => {
    const low = { pension: 20000, ira: 20000, ss: 40000, ssTaxable: 10000 };
    const high = { pension: 80000, ira: 80000, ss: 40000, ssTaxable: 34000 };
    for (const code of ['CT', 'MN']) {
      const line = STATE_TAX_RULES[code].socialSecurity.exemptIfAgiBelow.mfj;
      expect(50000 < line && 194000 > line, code).toBe(true);
      // Below the line the taxable SS is not in the base: removing it changes nothing.
      expect(tax(code, low)).toBeCloseTo(tax(code, { ...low, ssTaxable: 0, agi: 40000 }), 6);
      // Above it, it is.
      expect(tax(code, high)).toBeGreaterThan(tax(code, { ...high, ssTaxable: 0, agi: 160000 }));
    }
  });

  it('military and government pensions are exempt where the state says so', () => {
    const detail = { stateExempt: 30000, private1: 0, private2: 0, military1: 0, military2: 0 };
    // Kansas exempts government pensions; North Carolina does not.
    expect(tax('KS', { pensionDetail: detail })).toBeLessThan(tax('KS'));
    expect(tax('NC', { pensionDetail: detail })).toBeCloseTo(tax('NC'), 6);
  });

  it('indexed figures grow with the year\'s bracket factor; the rest stay put', () => {
    // Georgia indexes nothing: doubling every income doubles the tax under 62.
    const g1 = tax('GA', { age1: 60, age2: 60 });
    const g2 = tax('GA', { age1: 60, age2: 60, pension: 60000, ira: 95000, ssTaxable: 85000, ss: 100000, f: 2 });
    expect(g2).toBeGreaterThan(2 * g1);
    // Minnesota indexes brackets and deductions: double everything, double the tax.
    const m1 = tax('MN', { age1: 60, age2: 60 });
    const m2 = tax('MN', { age1: 60, age2: 60, pension: 60000, ira: 95000, ssTaxable: 85000, ss: 100000, fd: 70000, f: 2 });
    expect(m2).toBeCloseTo(2 * m1, 4);
  });

  it('Connecticut taxes at most 25% of Social Security above its line, and steps its pension subtraction down', () => {
    // $160,000 AGI with $40,000 of benefits ($34,000 federally taxable):
    // only $10,000 (25%) is taxed; pensions and IRA money above $150,000 lose the subtraction.
    const t = tax('CT', { pension: 63000, ira: 63000, ss: 40000, ssTaxable: 34000 });
    const ti = 126000 + 10000;
    expect(t).toBeCloseTo(20000 * 0.02 + 80000 * 0.045 + (ti - 100000) * 0.055, 4);
    // At $107,000 joint, 70% of the pension and IRA money is subtracted.
    const mid = tax('CT', { pension: 50000, ira: 57000, ss: 0, ssTaxable: 0 });
    expect(mid).toBeCloseTo(20000 * 0.02 + (107000 * 0.3 - 20000) * 0.045, 4);
  });

  it('Michigan counts IRA money only from 59 1/2', () => {
    expect(tax('MI', { age1: 58, age2: 58, pension: 0, ss: 0, ssTaxable: 0, ira: 60000 })).toBeCloseTo((60000 - 2 * 5900) * 0.0425, 6);
    expect(tax('MI', { age1: 60, age2: 58, pension: 0, ss: 0, ssTaxable: 0, ira: 60000 })).toBe(0);
  });

  it('Arizona takes the federal deduction without the federal 65+ add-on, plus its own $2,100', () => {
    const at65 = tax('AZ', { fd: 32200 + 2 * 1650 });
    expect(at65).toBeCloseTo((77500 - 32200 - 2 * 2100) * 0.025, 6);
  });

  it('Nebraska uses its own 65+ amounts', () => {
    const r = STATE_TAX_RULES.NE;
    expect(r.extraDeduction65).toEqual({ single: 2050, mfj: 1700 });
    const one = tax('NE', { status: 'Single', age1: 67, pension: 30000, ira: 20000, ss: 0, ssTaxable: 0 });
    expect(one).toBeCloseTo(4130 * 0.0246 + (24760 - 4130) * 0.0351 + (50000 - 8850 - 2050 - 24760) * 0.0455 - 176, 4);
  });

  it('Arkansas joins its upper table without a jump', () => {
    const ar = (agi) => tax('AR', { pension: 0, ss: 0, ssTaxable: 0, ira: agi, age1: 50, age2: 50 });
    // Plus the standard deduction and the $6,000-a-person retirement exclusion.
    const at = (ti) => ar(ti + 4940 + 12000);
    // Above $97,601 of net income: 2% on $4,700, 3.7% above (tax = 3.7% x income - $80), less the $29 credits.
    expect(at(120000)).toBeCloseTo(0.037 * 120000 - 80 - 58, 1);
    expect(at(94700 + 1) - at(94700)).toBeLessThan(1);
  });

  it('a residence naming no state with a record falls back to the flat rate', () => {
    const t = calculateStateTaxes(100000, 0, 0, 'state_rules', false, true, 'MFJ', 67, 67, 5, 0, null, false, { stateCode: null, federalAGI: 100000 });
    expect(t).toBeCloseTo(5000, 6);
  });
});

describe('the summary the plan shows', () => {
  it('reads the record', () => {
    expect(stateRulesRate('GA')).toBe('Flat 4.99%');
    expect(stateRulesRate('UT')).toBe('Flat 4.45%');
    expect(stateRulesRate('NJ')).toBe('1.4%–10.75%');
    const ga = stateRulesSummary('GA').join(' ');
    expect(ga).toMatch(/up to \$65,000 a person excluded from 65 \(\$35,000 from 62\)/);
    expect(ga).toMatch(/investment income/);
    expect(stateRulesSummary('MA').join(' ')).toMatch(/Plus 4% on income over \$1,107,750/);
    expect(stateRulesSummary('XX')).toEqual([]);
  });
});

describe('in the projection', () => {
  it('a retired Georgia couple pays less state tax under Georgia\'s rules than at a flat 5%', () => {
    const base = { ...DEFAULT_INPUTS, stateOfResidence: 'GA' };
    const sum = (inputs) => runProjection(inputs).years.reduce((a, y) => a + (y.stateTax || 0), 0);
    const rules = sum({ ...base, stateTaxState: 'state_rules' });
    const flat = sum({ ...base, stateTaxState: 'flat_5', stateTaxFlatRate: 5 });
    expect(rules).toBeGreaterThan(0);
    expect(rules).toBeLessThan(flat);
  }, 30000);
});
