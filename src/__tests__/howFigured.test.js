// Help -> How the numbers are figured: the data half (src/config/howFigured.js
// and the sources it links to). The rendering half is
// components/HowFigured.test.jsx.
//
// What is enforced, and why:
// - every rule cites at least one source, and every cited id exists, so no
//   card can show a rule without the page that sets it;
// - every source is https on an official government domain, with a check
//   date that is real and not in the future, and no URL appears twice;
// - every dollar figure in the text either comes from the engine's exported
//   constants (the template literals) or is written out and pinned below to
//   the literal the engine computes with, so the December tax update cannot
//   move one without the other.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOW_FIGURED_RULES, HOW_FIGURED_GROUPS, howFiguredRule } from '../config/howFigured';
import { SOURCES } from '../config/sources';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(SRC, f), 'utf8');
const engine = read('calculator.js');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const howSource = stripComments(read('config/howFigured.js'));
const TODAY = new Date().toISOString().slice(0, 10);
const byId = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

// Federal agencies that set the rules the app models, and the Federal
// Register / Congress where they publish them.
const FEDERAL = ['irs.gov', 'ssa.gov', 'cms.gov', 'medicare.gov', 'ecfr.gov', 'federalregister.gov', 'congress.gov', 'healthcare.gov'];
// State legislatures and revenue departments: a .gov or .us host (Minnesota's
// department of revenue lives at revenue.state.mn.us).
const isStateHost = (host) => host.endsWith('.gov') || /\.state\.[a-z]{2}\.us$/.test(host);
// Deliberate exceptions, each with its reason. None today: the one HHS page
// that used to be here (the ASPE poverty-guidelines topic page) refuses
// automated checks and was replaced by the Federal Register notice.
const EXCEPTIONS = {};

describe('how the numbers are figured: rules', () => {
  it('covers the rules the owner asked for, in known groups, with unique ids', () => {
    const ids = HOW_FIGURED_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const want of [
      'federal-brackets', 'standard-deduction', 'senior-deduction', 'capital-gains', 'niit', 'amt',
      'ss-taxation', 'ss-claiming', 'ss-spousal', 'ss-survivor', 'ss-earnings-test', 'rmd', 'early-withdrawal',
      'roth-conversions', 'roth-five-year', 'contribution-limits', 'hsa', 'qcd', 'irmaa', 'irmaa-lookback',
      'aca-cliff', 'married-filing-separately', 'inherited-ira', 'federal-estate', 'gift-tax', 'gst',
      'state-estate', 'state-inheritance', 'state-none-or-flat', 'state-ca', 'state-ny', 'state-il',
      'state-co', 'state-pa', 'state-va', 'state-wa', 'ss-trust-fund',
    ]) expect(ids, want).toContain(want);
    for (const r of HOW_FIGURED_RULES) {
      expect(HOW_FIGURED_GROUPS, r.id).toContain(r.group);
      expect(r.title.length, r.id).toBeGreaterThan(3);
      expect(String(r.figuresYear).length, `${r.id} needs "Figures from"`).toBeGreaterThan(3);
    }
    for (const g of HOW_FIGURED_GROUPS) expect(HOW_FIGURED_RULES.some((r) => r.group === g), g).toBe(true);
    expect(howFiguredRule('rmd').title).toMatch(/minimum distributions/i);
    expect(howFiguredRule('nope')).toBeNull();
  });

  it('every rule has at least one source, and every source id exists', () => {
    const missing = [];
    for (const r of HOW_FIGURED_RULES) {
      expect(r.sources.length, `${r.id} has no source`).toBeGreaterThan(0);
      for (const id of r.sources) if (!byId[id]) missing.push(`${r.id} -> ${id}`);
    }
    expect(missing).toEqual([]);
  });

  it('summaries are two to five plain sentences, with no code names, statute sections or release notes', () => {
    for (const r of HOW_FIGURED_RULES) {
      const text = `${r.title} ${r.summary} ${r.simplifies || ''} ${r.sourceNote || ''}`;
      const sentences = r.summary.split(/(?<=[.!?])\s+(?=[A-Z])/).length;
      expect(sentences, `${r.id}: ${sentences} sentences`).toBeGreaterThanOrEqual(2);
      expect(sentences, `${r.id}: ${sentences} sentences`).toBeLessThanOrEqual(5);
      expect(text, r.id).not.toMatch(/§|\bIRC\b|\bsection \d|\bU\.S\.C\b|changelog|\b[a-z]+[A-Z][A-Za-z]+\b|\b[A-Z]{2,}_[A-Z_]+\b|\bengine\b/);
      expect(text, `${r.id} reads as advice`).not.toMatch(/\byou should\b|\bwe recommend\b/i);
      expect(text, `${r.id} left a template hole`).not.toMatch(/undefined|NaN|\$\{/);
    }
  });
});

describe('how the numbers are figured: sources', () => {
  const cited = [...new Set(HOW_FIGURED_RULES.flatMap((r) => r.sources))].map((id) => byId[id]);

  it('every source URL is https on an official government domain', () => {
    const bad = [];
    for (const src of SOURCES) {
      const { protocol, host } = new URL(src.url);
      const ok = protocol === 'https:' && (
        FEDERAL.some((d) => host === d || host.endsWith(`.${d}`)) || isStateHost(host) || EXCEPTIONS[src.id]
      );
      if (!ok) bad.push(`${src.id}: ${src.url}`);
    }
    expect(bad).toEqual([]);
  });

  it('no URL is listed twice', () => {
    const urls = SOURCES.map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('every source has a real check date that is not in the future', () => {
    const bad = SOURCES
      .filter((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s.verified || '') || s.verified > TODAY || Number.isNaN(Date.parse(s.verified)))
      .map((s) => `${s.id}: ${s.verified}`);
    expect(bad).toEqual([]);
    expect(cited.length).toBeGreaterThan(30);
  });

  it('every "expect" phrase the link check looks for is a non-empty string', () => {
    for (const s of SOURCES.filter((x) => x.expect)) {
      expect(Array.isArray(s.expect), s.id).toBe(true);
      for (const e of s.expect) expect(typeof e === 'string' && e.trim().length > 0, s.id).toBe(true);
    }
    expect(SOURCES.filter((x) => x.expect).length).toBeGreaterThan(40);
  });
});

describe('how the numbers are figured: dollar figures', () => {
  // Written-out figures in howFigured.js, each pinned to the literal the
  // engine computes with. A figure typed into the text without an entry here
  // fails the census below.
  const PINS = {
    '$98,900': [/\(status === 'MFJ' \? 98900 : 49450\)/],
    '$49,450': [/\(status === 'MFJ' \? 98900 : 49450\)/],
    '$250,000': [/const niitThresh = status === 'MFJ' \? 250000 : status === 'MFS' \? 125000 : 200000;/, /const addMedThreshold = filingStatus === 'MFJ' \? 250000 : 200000;/],
    '$200,000': [/const niitThresh = status === 'MFJ' \? 250000 : status === 'MFS' \? 125000 : 200000;/, /const addMedThreshold = filingStatus === 'MFJ' \? 250000 : 200000;/],
    '$125,000': [/const niitThresh = status === 'MFJ' \? 250000 : status === 'MFS' \? 125000 : 200000;/],
    '$184,500': [/2026: \{ cola: 2\.5, wageBase: 184500,/],
    '$32,000': [/\(currentStatus === 'MFJ'\) \? 32000 : 25000;/],
    '$25,000': [/\(currentStatus === 'MFJ'\) \? 32000 : 25000;/],
    '$44,000': [/\(currentStatus === 'MFJ'\) \? 44000 : 34000;/],
    '$34,000': [/\(currentStatus === 'MFJ'\) \? 44000 : 34000;/],
    // New York's $20,000 pension and IRA exclusion, and Colorado's caps.
    '$20,000': [/Math\.min\(20000, p1\)/, /const cap = a >= 65 \? 24000 : a >= 55 \? 20000 : 0;/],
    '$24,000': [/const cap = a >= 65 \? 24000 : a >= 55 \? 20000 : 0;/],
    '$15,000': [/return Math\.min\(militaryPension, 15000 \* slots\);/],
    // Virginia's age-deduction phase-out thresholds.
    '$50,000': [/const VA_AGE_DEDUCTION_THRESHOLD = \{ single: 50000, married: 75000 \};/],
    '$75,000': [/const VA_AGE_DEDUCTION_THRESHOLD = \{ single: 50000, married: 75000 \};/],
  };
  // Flat state rates quoted as words in the text, pinned the same way.
  const RATE_PINS = [
    ['a flat 4.95%', /return ilTaxable \* 0\.0495;/],
    ['a flat 4.4%', /return stateTaxableIncome \* 0\.044;/],
    ['a flat 3.07%', /return stateTaxableIncome \* 0\.0307;/],
    ['6 cents for every dollar', /export const SENIOR_BONUS_PHASEOUT_RATE = 0\.06;/],
    ['holds fixed through 2027', /export const IRMAA_TOP_TIER_FREEZE_THROUGH_YEAR = 2027;/],
    // Washington (capital gains tax, and the income tax from 2028).
    ['long-term capital gains at 7%', /export const WA_CAPITAL_GAINS_RATE = 0\.07;/],
    ['plus 2.9% more', /export const WA_CAPITAL_GAINS_ADDITIONAL_RATE = 0\.029;/],
    ['at 9.9%', /export const WA_INCOME_TAX_RATE = 0\.099;/],
    ['From 2028', /export const WA_INCOME_TAX_FIRST_YEAR = 2028;/],
    ['fixed through 2029', /export const WA_INCOME_TAX_FIRST_INDEXED_YEAR = 2030;/],
    // New York's 2027 step and the 2033 top rate.
    ['from 3.9% to 3.8%', /\{ limit: 8500, rate: 0\.039 \}[\s\S]*\{ limit: 8500, rate: 0\.038 \}/],
    ['returns to 8.82%', /\{ limit: Infinity, rate: 0\.0882 \}/],
  ];

  it('every written-out dollar figure is pinned to the engine', () => {
    const written = [...new Set([...howSource.matchAll(/\$\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0]))];
    const unpinned = written.filter((f) => !PINS[f]);
    expect(unpinned, 'type these through copyFigures.js, or pin them here').toEqual([]);
    for (const f of written) {
      for (const literal of PINS[f]) expect(engine, `${f} is no longer ${literal}`).toMatch(literal);
    }
    // And the pins are not stale: each still appears in the text.
    for (const f of Object.keys(PINS)) expect(written, f).toContain(f);
  });

  it('quoted rates match the engine', () => {
    const all = HOW_FIGURED_RULES.map((r) => `${r.summary} ${r.simplifies || ''}`).join(' ');
    for (const [phrase, literal] of RATE_PINS) {
      expect(all, phrase).toContain(phrase);
      expect(engine, phrase).toMatch(literal);
    }
  });

  it('figures drawn from constants render as dollars', () => {
    const all = HOW_FIGURED_RULES.map((r) => r.summary).join(' ');
    // Spot checks that the template literals resolved to the engine values.
    expect(all).toContain('$32,200');
    expect(all).toContain('$24,500');
    expect(all).toContain('$202.90');
    expect(all).toContain('$15,000,000');
    expect(howFiguredRule('rmd').summary).toMatch(/start at 73, or 75 for anyone born in 1960/);
  });
});
