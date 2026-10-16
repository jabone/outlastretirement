import { FIELD_INDEX } from '../config/fieldIndex';
import { NAV_PRIMARY, NAV_MORE } from '../config/navItems';

// The search behind "Find a setting" (FindSetting.jsx).

export const MAX_RESULTS = 8;

const PAGES = [...NAV_PRIMARY, ...NAV_MORE]
  .filter((e) => !e.premiumLocked && !e.premium)
  .map((e) => ({ page: true, id: `page-${e.id}`, label: e.label, key: e.id, tab: e.id, subTabLabel: 'Page' }));

const norm = (s) => String(s || '').toLowerCase();
const haystack = (e) => norm([e.label, e.key, e.subTabLabel, ...(e.folds || []).map((f) => f.title)].join(' '));

export function searchIndex(query, { fields = FIELD_INDEX, pages = PAGES, limit = MAX_RESULTS } = {}) {
  const q = norm(query).trim();
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored = [];
  for (const e of [...fields, ...pages]) {
    const hay = haystack(e);
    if (!words.every((w) => hay.includes(w))) continue;
    const label = norm(e.label);
    let score = label.startsWith(q) ? 30 : label.includes(q) ? 20 : words.every((w) => label.includes(w)) ? 10 : 1;
    if (e.page) score += 2;
    scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.e.label.localeCompare(b.e.label));
  return scored.slice(0, limit).map((s) => s.e);
}

export const placeOf = (e) => {
  if (e.page) return 'Page';
  const fold = e.folds?.length ? e.folds[e.folds.length - 1].title : null;
  return fold ? `${e.subTabLabel} › ${fold}` : e.subTabLabel;
};
