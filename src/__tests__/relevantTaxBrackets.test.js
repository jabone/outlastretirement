// utils/relevantTaxBrackets.js
//
// The defect this guards against is a scale failure, not a styling one: the
// 37% bracket line inflates to roughly $1.75M by 2058, and Recharts scales
// the Y axis to whatever is rendered. Drawing all seven lines by default
// meant a plan topping out at $200k had its entire income stack compressed
// into the bottom fifth of the chart. So the rule these tests pin down is
// "show what the plan can reach, plus one above" -- and, just as important,
// that it never shows nothing.
import { describe, it, expect } from 'vitest';
import { relevantBrackets, allBracketsOn, sameBrackets, BRACKET_KEYS } from '../utils/relevantTaxBrackets';

// Nominal 2026-ish MFJ thresholds. Exact values don't matter here; the
// ordering and the comparison do.
const row = (totalOrdinaryGross) => ({
  totalOrdinaryGross,
  limit10: 24000, limit12: 97000, limit22: 207000,
  limit24: 395000, limit32: 502000, limit35: 753000, limit37: 1000000,
});
const onKeys = (m) => BRACKET_KEYS.filter(k => m[k]);

describe('relevantBrackets', () => {
  // $150k sits in the 22% band: above the 12% line, below the 22% line. The
  // 22% line is therefore the ceiling it is pressing against, and drawing
  // 24% on top would only inflate the axis.
  it('draws the ceiling of the band you are in, and nothing above it', () => {
    expect(onKeys(relevantBrackets([row(150000)]))).toEqual(['limit10', 'limit12', 'limit22']);
    expect(onKeys(relevantBrackets([row(300000)]))).toEqual(['limit10', 'limit12', 'limit22', 'limit24']);
    expect(onKeys(relevantBrackets([row(450000)]))).toEqual(['limit10', 'limit12', 'limit22', 'limit24', 'limit32']);
  });

  it('never shows fewer than three, even for a tiny plan', () => {
    expect(onKeys(relevantBrackets([row(1000)]))).toEqual(['limit10', 'limit12', 'limit22']);
    expect(onKeys(relevantBrackets([row(0)]))).toHaveLength(3);
  });

  it('shows everything for a plan that reaches the top bracket', () => {
    expect(onKeys(relevantBrackets([row(2000000)]))).toEqual(BRACKET_KEYS);
  });

  it('never enables a bracket without also enabling every one below it', () => {
    let withAnOff = 0;
    for (const income of [0, 5e4, 1.5e5, 3e5, 6e5, 9e5, 5e6]) {
      const flags = BRACKET_KEYS.map(k => relevantBrackets([row(income)])[k]);
      const firstOff = flags.indexOf(false);
      const tail = firstOff === -1 ? [] : flags.slice(firstOff);
      if (firstOff !== -1) withAnOff++;
      expect(tail.every(v => v === false), `income ${income}`).toBe(true);
    }
    // The low incomes do switch brackets off, so the check above had
    // something to check.
    expect(withAnOff).toBeGreaterThan(0);
  });

  // A single Roth-conversion spike is exactly the case where the user needs
  // to see the bracket they hit, and it must not vanish when they scrub to
  // a quiet year.
  it('uses the highest year across the whole projection, not the last one', () => {
    const spiky = [row(50000), row(300000), row(50000)];
    expect(onKeys(relevantBrackets(spiky))).toEqual(onKeys(relevantBrackets([row(300000)])));
  });

  it('falls back to all-on when there is no projection yet', () => {
    for (const empty of [[], null, undefined, 'nonsense']) {
      expect(relevantBrackets(empty)).toEqual(allBracketsOn());
    }
  });

  it('ignores rows with unusable numbers rather than throwing', () => {
    const rows = [row(150000), { totalOrdinaryGross: NaN }, { totalOrdinaryGross: 900000, limit10: null }, {}];
    expect(() => relevantBrackets(rows)).not.toThrow();
    // The NaN/broken rows must not promote the result past what row(150000) earns.
    expect(onKeys(relevantBrackets(rows))).toEqual(['limit10', 'limit12', 'limit22']);
  });

  it('respects each year own inflated thresholds rather than one fixed set', () => {
    // Same income, but a far-future year whose thresholds have inflated past
    // it, should register as reaching a LOWER bracket.
    const early = { ...row(300000) };
    const late = { totalOrdinaryGross: 300000, limit10: 48000, limit12: 194000, limit22: 414000, limit24: 790000, limit32: 1004000, limit35: 1506000, limit37: 2000000 };
    expect(onKeys(relevantBrackets([early])).length).toBeGreaterThan(onKeys(relevantBrackets([late])).length);
  });
});

describe('sameBrackets', () => {
  it('is true for identical maps and false when any key differs', () => {
    expect(sameBrackets(allBracketsOn(), allBracketsOn())).toBe(true);
    expect(sameBrackets(allBracketsOn(), relevantBrackets([row(50000)]))).toBe(false);
  });

  it('treats missing keys as off rather than throwing', () => {
    expect(sameBrackets({}, {})).toBe(true);
    expect(sameBrackets(null, allBracketsOn())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// IRMAA tiers
// ---------------------------------------------------------------------------
import { relevantIrmaaTiers, sameIrmaaTiers, sameFlags, allIrmaaOn, IRMAA_KEYS, readBracketPref, writeBracketPref, clearBracketPref } from '../utils/relevantTaxBrackets';

const irow = (magi, age1) => ({
  magi, age1,
  irmaaTier1: 109000, irmaaTier2: 137000, irmaaTier3: 171000, irmaaTier4: 205000,
});
const irmaaOn = (m) => IRMAA_KEYS.filter(k => m[k]);

describe('relevantIrmaaTiers', () => {
  it('shows tier 1 alone when income never reaches a surcharge', () => {
    // Still worth one line: "how much room before this starts costing me" is
    // the question people enable the toggle to answer.
    expect(irmaaOn(relevantIrmaaTiers([irow(80000, 70)]))).toEqual(['irmaaTier1']);
  });

  it('shows through the tier above the one you land in', () => {
    expect(irmaaOn(relevantIrmaaTiers([irow(150000, 70)]))).toEqual(['irmaaTier1', 'irmaaTier2', 'irmaaTier3']);
    expect(irmaaOn(relevantIrmaaTiers([irow(300000, 70)]))).toEqual(IRMAA_KEYS);
  });

  // The wrinkle that makes IRMAA different from tax brackets: a big salary
  // at 45 can never produce a Medicare surcharge, so it must not drag in
  // tiers the retiree will never face.
  it('ignores income from years too early to affect a Medicare premium', () => {
    const plan = [irow(400000, 45), irow(400000, 55), irow(80000, 70)];
    expect(irmaaOn(relevantIrmaaTiers(plan))).toEqual(['irmaaTier1']);
  });

  // IRMAA uses a two-year lookback, so age 63 is the first year that counts.
  it('counts income from age 63 onward, not just 65', () => {
    expect(irmaaOn(relevantIrmaaTiers([irow(300000, 63)]))).toEqual(IRMAA_KEYS);
    expect(irmaaOn(relevantIrmaaTiers([irow(300000, 62), irow(80000, 70)]))).toEqual(['irmaaTier1']);
  });

  it('considers either spouse reaching the lookback age', () => {
    const plan = [{ ...irow(300000, 50), age2: 70 }];
    expect(irmaaOn(relevantIrmaaTiers(plan))).toEqual(IRMAA_KEYS);
  });

  it('falls back to the whole projection when nobody reaches 63 in it', () => {
    expect(irmaaOn(relevantIrmaaTiers([irow(300000, 45)]))).toEqual(IRMAA_KEYS);
  });

  it('falls back to all-on with no data, and never throws on junk', () => {
    expect(relevantIrmaaTiers([])).toEqual(allIrmaaOn());
    expect(relevantIrmaaTiers(null)).toEqual(allIrmaaOn());
    expect(() => relevantIrmaaTiers([{}, { magi: NaN }, { magi: 5, age1: 'x' }])).not.toThrow();
  });
});

describe('line preference persistence', () => {
  function makeStorage(initial = {}) {
    const map = { ...initial };
    return {
      getItem: (k) => (k in map ? map[k] : null),
      setItem: (k, v) => { map[k] = String(v); },
      removeItem: (k) => { delete map[k]; },
    };
  }

  it('round-trips and returns null when nothing is saved', () => {
    const s = makeStorage();
    expect(readBracketPref(s)).toBeNull();
    writeBracketPref({ limit10: true, limit12: false }, { irmaaTier1: true });
    writeBracketPref({ limit10: true, limit12: false }, { irmaaTier1: true }, s);
    expect(readBracketPref(s).brackets.limit12).toBe(false);
  });

  // A saved preference from an older version that predates a key must not
  // leave that key undefined -- the checkbox row maps over the object.
  it('fills in keys a saved preference does not mention', () => {
    const s = makeStorage();
    writeBracketPref({ limit10: false }, {}, s);
    const read = readBracketPref(s);
    for (const k of ['limit10', 'limit12', 'limit22', 'limit24', 'limit32', 'limit35', 'limit37']) {
      expect(read.brackets[k], k).toBeTypeOf('boolean');
    }
    expect(read.brackets.limit10).toBe(false);
    expect(read.brackets.limit37).toBe(true);
  });

  it('treats corrupt storage as no preference rather than throwing', () => {
    for (const bad of ['not json', '[]', 'null', '{"nope":1}']) {
      expect(readBracketPref(makeStorage({ 'cfe_bracket_lines_v1': bad }))).toBeNull();
    }
  });

  it('clearing removes it, so auto-derivation resumes', () => {
    const s = makeStorage();
    writeBracketPref({ limit10: false }, {}, s);
    expect(readBracketPref(s)).not.toBeNull();
    clearBracketPref(s);
    expect(readBracketPref(s)).toBeNull();
  });

  it('survives storage that throws', () => {
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(readBracketPref(broken)).toBeNull();
    expect(writeBracketPref({}, {}, broken)).toBe(false);
    expect(clearBracketPref(broken)).toBe(false);
  });
});

// Regression: sameBrackets once had BRACKET_KEYS hardcoded, so comparing two
// IRMAA maps passed vacuously (none of the bracket keys exist on them) and
// reported "identical" for every pair. The effect that syncs IRMAA state
// therefore never fired, and all four tiers rendered no matter what the plan
// looked like. Silent, and only visible in a browser.
describe('flag comparison helpers use the right key list', () => {
  it('distinguishes IRMAA maps that actually differ', () => {
    const a = { irmaaTier1: true, irmaaTier2: true, irmaaTier3: false, irmaaTier4: false };
    const b = { irmaaTier1: true, irmaaTier2: false, irmaaTier3: false, irmaaTier4: false };
    expect(sameIrmaaTiers(a, a)).toBe(true);
    expect(sameIrmaaTiers(a, b)).toBe(false);
    // The bug: the bracket comparator sees no keys it knows and says "same".
    expect(sameBrackets(a, b)).toBe(true);
  });

  it('sameFlags requires an explicit key list', () => {
    const a = { x: true }, b = { x: false };
    expect(sameFlags(a, b, ['x'])).toBe(false);
    expect(sameFlags(a, b, undefined)).toBe(false);
  });
});
