// A series whose color is a paint-server reference (`url(#…)`) gets its
// stroke instead, then a neutral swatch.
export function swatchColor(entry) {
  const candidates = [entry?.color, entry?.fill, entry?.stroke, entry?.payload?.fill];
  const usable = candidates.find((c) => typeof c === 'string' && c && !c.startsWith('url('));
  return usable || 'var(--text-muted)';
}
