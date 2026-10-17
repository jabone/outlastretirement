// Background for a heatmap cell whose shade grows with its value (ratio 0..1).
// The top of the scale comes from the theme's --heat-span so the figure
// printed on the cell keeps a 4.5:1 contrast ratio (WCAG 1.4.3): the dark
// theme stops at 45% so white text stays readable; the light theme, whose
// navy text passes at any shade, keeps the full 80%.
export function heatCellBg(rgb, ratio) {
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 1;
  return `rgb(${rgb.replace(/,\s*/g, ' ')} / calc(0.08 + ${r.toFixed(3)} * var(--heat-span, 0.72)))`;
}
