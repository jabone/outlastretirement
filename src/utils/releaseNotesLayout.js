// What the public release notes page shows, worked out from
// src/config/releaseNotes.js: the newest `n` weeks in full, then a summary
// per quarter for everything older. Shared by scripts/generatePublicPages.mjs
// and releaseNotes.test.js, so the page and the test apply one rule.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parse = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const isoOf = (date) => date.toISOString().slice(0, 10);
export const addDays = (iso, days) => {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoOf(d);
};
export const shortDate = (iso) => {
  const d = parse(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
export const longDate = (iso) => `${shortDate(iso)}, ${parse(iso).getUTCFullYear()}`;
export const isMonday = (iso) => parse(iso).getUTCDay() === 1;
export const quarterOf = (iso) => {
  const d = parse(iso);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
};

export function layoutReleaseNotes(weeks, quarters, n) {
  const sorted = [...weeks].sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1));
  const shown = sorted.slice(0, n);
  const rolled = sorted.slice(n);
  if (rolled.length) {
    const w = rolled[0];
    throw new Error(`Week of ${w.weekOf} is older than the newest ${n} weeks: fold it into its quarter's summary in RELEASE_QUARTERS (move its ids, extend "through") and delete the week.`);
  }
  const oldestShown = shown.length ? shown[shown.length - 1].weekOf : null;
  const qs = [...quarters].sort((a, b) => (a.from < b.from ? 1 : -1)).map((q) => {
    if (oldestShown && q.through >= oldestShown) {
      throw new Error(`${q.quarter} summary runs through ${q.through}, into the week of ${oldestShown}, which is still shown in full.`);
    }
    const year = Number(q.quarter.slice(0, 4));
    const qEnd = isoOf(new Date(Date.UTC(year, Number(q.quarter.slice(-1)) * 3, 0)));
    return { ...q, complete: q.through >= qEnd, range: `${shortDate(q.from)} – ${shortDate(q.through)}` };
  });
  // The newest summary must meet the oldest week shown, or the days between
  // are on neither.
  if (oldestShown && qs.length && addDays(qs[0].through, 1) !== oldestShown) {
    throw new Error(`${qs[0].quarter} summary ends ${qs[0].through} but the oldest week shown starts ${oldestShown}.`);
  }
  return { shown, quarters: qs };
}
