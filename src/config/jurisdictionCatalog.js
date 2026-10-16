// The public catalog of our country summaries: which countries, what we
// call them, when each summary was last checked and how confident we are
// in it. This is everything the open app needs to label a move abroad that
// is already in a plan and to warn when its summary has aged -- the
// years-abroad notice (foreignYearsNoticeLines.js) and the move list on
// Life Events read it. The summaries themselves (the tax terms, the opt-in
// assumptions, the sources and notes) are part of Premium and live in the
// relocation module; a test there keeps this list in step with them.
//
// Same wave order as the module's JURISDICTION_PRESETS.
export const JURISDICTION_CATALOG = Object.freeze([
  { id: 'MX', label: 'Mexico', vintage: '2026-09', confidence: 'medium' },
  { id: 'PT', label: 'Portugal', vintage: '2026-09', confidence: 'medium' },
  { id: 'PA', label: 'Panama', vintage: '2026-09', confidence: 'high' },
  { id: 'CR', label: 'Costa Rica', vintage: '2026-09', confidence: 'high' },
  { id: 'IT', label: 'Italy', vintage: '2026-09', confidence: 'medium' },
  { id: 'ES', label: 'Spain', vintage: '2026-09', confidence: 'medium' },
  { id: 'FR', label: 'France', vintage: '2026-09', confidence: 'medium' },
  { id: 'TH', label: 'Thailand', vintage: '2026-09', confidence: 'medium' },
  { id: 'PH', label: 'Philippines', vintage: '2026-09', confidence: 'high' },
  { id: 'BZ', label: 'Belize', vintage: '2026-09', confidence: 'high' },
  { id: 'UY', label: 'Uruguay', vintage: '2026-09', confidence: 'medium' },
  { id: 'DE', label: 'Germany', vintage: '2026-09', confidence: 'medium' },
  { id: 'IE', label: 'Ireland', vintage: '2026-09', confidence: 'medium' },
  { id: 'GR', label: 'Greece', vintage: '2026-09', confidence: 'medium' },
  { id: 'MY', label: 'Malaysia', vintage: '2026-09', confidence: 'medium' },
  { id: 'GB', label: 'United Kingdom', vintage: '2026-09', confidence: 'medium' },
  { id: 'AU', label: 'Australia', vintage: '2026-09', confidence: 'low' },
  { id: 'CO', label: 'Colombia', vintage: '2026-10', confidence: 'medium' },
]);

export const catalogById = (id) => JURISDICTION_CATALOG.find((p) => p.id === id) || null;

export const PRESET_STALE_MONTHS = 18;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

export function vintageLabel(vintage) {
  const [y, m] = String(vintage).split('-').map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : String(vintage);
}

export function presetAgeMonths(vintage, now = new Date()) {
  const [y, m] = String(vintage).split('-').map(Number);
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
}

// Takes a summary or a catalog entry: anything with a vintage.
export const isPresetStale = (preset, now = new Date()) => presetAgeMonths(preset.vintage, now) > PRESET_STALE_MONTHS;

export const CONFIDENCE_LABEL = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  unknown: 'No answer found',
};
