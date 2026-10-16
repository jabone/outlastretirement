// Which tax-bracket reference lines are worth drawing for THIS plan.
//
// The problem this solves is a scale problem, not a clutter one. The Tax
// Brackets Visualizer draws a dashed line per federal bracket, and Recharts
// auto-scales the Y axis to fit everything rendered. Turning all seven on by
// default meant the 37% line -- which inflates to roughly $1.75M by 2058 --
// set the axis ceiling for every plan, including plans whose income never
// exceeds $200k. The user's actual income stack got squashed into the
// bottom fifth of the chart so that four lines they will never touch could
// be shown in the empty space above it.
//
// Reference lines are only useful if you might cross them. So the default
// now follows the plan: every line below your income, plus the ceiling of
// the band you are actually sitting in.
//
// That last part is the whole rule, and it is easy to get wrong by being
// generous. Crossing the 12% line means you are IN the 22% band, and the
// 22% line is already drawn above you -- it IS your headroom. Adding the
// 24% line on top of that buys nothing you cannot already see, and it costs
// real resolution: bracket thresholds inflate, so on a 45-year projection
// one unnecessary line can double the Y axis and halve the height of the
// data you came to look at. That is the original bug in miniature.
//
// This is only the DEFAULT. All seven checkboxes stay available, and the
// moment the user touches one, the auto-derivation stops (see App.jsx) so
// it never fights a deliberate choice.

export const BRACKET_KEYS = ['limit10', 'limit12', 'limit22', 'limit24', 'limit32', 'limit35', 'limit37'];

// Never show fewer than the bottom three. A plan whose income sits entirely
// inside the 10% bracket would otherwise render a single line with nothing
// to read it against, which is less informative than a little context.
const MIN_VISIBLE = 3;

export function allBracketsOn() {
  return Object.fromEntries(BRACKET_KEYS.map(k => [k, true]));
}

// rows: taxVisualizerData -- each has totalOrdinaryGross and limit10..limit37,
// all inflation-adjusted for that year, so the comparison is like-for-like
// rather than against a single year's nominal thresholds.
export function relevantBrackets(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return allBracketsOn();

  // Highest bracket line crossed in ANY year. Deliberately the max across
  // the whole projection rather than the current year: a plan that spikes
  // once on a Roth conversion should show the bracket that spike reaches,
  // and it should not flicker as you scrub through years.
  let highestCrossed = -1;
  for (const row of rows) {
    const income = Number(row?.totalOrdinaryGross);
    if (!Number.isFinite(income)) continue;
    for (let i = 0; i < BRACKET_KEYS.length; i++) {
      const limit = Number(row?.[BRACKET_KEYS[i]]);
      if (Number.isFinite(limit) && income > limit && i > highestCrossed) highestCrossed = i;
    }
  }

  // Crossing line i means sitting in the band above it, whose ceiling is
  // line i+1. Show through there and stop.
  const through = Math.max(MIN_VISIBLE - 1, Math.min(BRACKET_KEYS.length - 1, highestCrossed + 1));

  return Object.fromEntries(BRACKET_KEYS.map((k, i) => [k, i <= through]));
}

// Two flag maps are equal when the same keys are on. Used by App.jsx to
// avoid a setState (and re-render) on every projection recompute when the
// relevant set has not actually changed.
//
// The key list is a REQUIRED argument for a reason. This started life as a
// bracket-only helper with BRACKET_KEYS hardcoded, and when IRMAA reuse came
// along it silently reported every pair of IRMAA maps as identical -- none
// of the bracket keys exist on an IRMAA map, so `every` passed vacuously,
// the state never updated, and all four tiers rendered regardless of
// relevance. It failed closed and silently, which is the worst way to fail.
export function sameFlags(a, b, keys) {
  if (!a || !b || !Array.isArray(keys)) return false;
  return keys.every(k => Boolean(a[k]) === Boolean(b[k]));
}

export function sameBrackets(a, b) {
  return sameFlags(a, b, BRACKET_KEYS);
}

export function sameIrmaaTiers(a, b) {
  return sameFlags(a, b, IRMAA_KEYS);
}

// ---------------------------------------------------------------------------
// Medicare IRMAA cliffs -- same problem, one extra wrinkle.
// ---------------------------------------------------------------------------

// The chart draws four IRMAA tier lines behind a single checkbox. They have
// the same axis-blowing property as the bracket lines: tier 4 inflates well
// past $1M over a long projection, so switching the toggle on for a modest
// plan re-creates the squashing this module exists to prevent.
export const IRMAA_KEYS = ['irmaaTier1', 'irmaaTier2', 'irmaaTier3', 'irmaaTier4'];

// The wrinkle: IRMAA only applies once you are on Medicare, and it is based
// on your MAGI from TWO YEARS EARLIER. So a plan with a high-earning final
// few working years should not have tier 3 and 4 drawn on account of income
// from age 45 -- that income never touches a Medicare premium. Only years
// from age 63 onward can influence an IRMAA bill, and 63 rather than 65 is
// precisely because of that two-year lookback.
const IRMAA_LOOKBACK_START_AGE = 63;

function irmaaRelevantRows(rows) {
  const eligible = rows.filter(r => {
    const a1 = Number(r?.age1);
    const a2 = Number(r?.age2);
    return (Number.isFinite(a1) && a1 >= IRMAA_LOOKBACK_START_AGE)
      || (Number.isFinite(a2) && a2 >= IRMAA_LOOKBACK_START_AGE);
  });
  // A projection that ends before anyone turns 63 has no IRMAA exposure at
  // all. Fall back to the whole set rather than showing nothing, since the
  // user asked to see the cliffs.
  return eligible.length > 0 ? eligible : rows;
}

export function allIrmaaOn() {
  return Object.fromEntries(IRMAA_KEYS.map(k => [k, true]));
}

export function relevantIrmaaTiers(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return allIrmaaOn();

  const considered = irmaaRelevantRows(rows);
  let highestCrossed = -1;
  for (const row of considered) {
    // MAGI, not totalOrdinaryGross -- IRMAA is assessed on modified AGI, and
    // the two differ (the chart's `magi` is the app's approximation of it).
    const magi = Number(row?.magi);
    if (!Number.isFinite(magi)) continue;
    for (let i = 0; i < IRMAA_KEYS.length; i++) {
      // null is a tier this year's schedule does not have (a separate
      // return living together), not a $0 threshold.
      const raw = row?.[IRMAA_KEYS[i]];
      const threshold = raw === null || raw === undefined ? NaN : Number(raw);
      if (Number.isFinite(threshold) && magi > threshold && i > highestCrossed) highestCrossed = i;
    }
  }

  // Below tier 1 means no surcharge at all. Show tier 1 alone so the toggle
  // still answers "how much room do I have before this starts costing me",
  // which is the actual question someone enables it to ask.
  // A separate return living together has no tiers 1-3 (null), so its
  // first line is tier 4.
  const firstLine = IRMAA_KEYS.findIndex((k) => considered.some((r) => r?.[k] !== null && r?.[k] !== undefined && Number.isFinite(Number(r[k]))));
  const through = Math.min(IRMAA_KEYS.length - 1, Math.max(0, firstLine, highestCrossed + 1));
  return Object.fromEntries(IRMAA_KEYS.map((k, i) => [k, i <= through]));
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
//
// Which reference lines you want drawn is a display preference, so it lives
// in its own localStorage key rather than in `inputs` -- the same split
// PreferencesTab uses, and the reason none of this belongs in a saved
// Scenario. It is deliberately NOT included in Backup Everything: fullBackup
// excludes cosmetic preferences on the grounds that restoring them is as
// likely to fight a setting you have since changed as to help you.
export const BRACKET_PREF_KEY = 'cfe_bracket_lines_v1';

export function readBracketPref(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(BRACKET_PREF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.brackets) return null;
    return {
      brackets: { ...allBracketsOn(), ...parsed.brackets },
      irmaa: { ...allIrmaaOn(), ...(parsed.irmaa || {}) },
    };
  } catch {
    return null;
  }
}

export function writeBracketPref(brackets, irmaa, storage = globalThis.localStorage) {
  try {
    storage?.setItem(BRACKET_PREF_KEY, JSON.stringify({ brackets, irmaa }));
    return true;
  } catch {
    return false;
  }
}

export function clearBracketPref(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(BRACKET_PREF_KEY);
    return true;
  } catch {
    return false;
  }
}
