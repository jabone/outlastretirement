// Sizes and sources for the brand marks (see components/BrandMark.jsx).
const SRC = {
  full: { dark: '/brand/outlast-full-dark', light: '/brand/outlast-full-light', w: 870, h: 202, smallW: 413 },
  short: { dark: '/brand/or-short-dark', light: '/brand/or-short-light', w: 674, h: 332, smallW: 195 },
};

// Each mark comes in two sizes: the supplied file, and a copy 96 px tall
// (the -h96 files, made from the supplied ones). On screen the lockup is
// 28-34 CSS px tall, so even a 3x phone screen needs at most ~100 device
// px; PageSpeed flagged the 870 px original as 14 KB more than it needed.
// srcset lets the browser pick: the small copy on screen, the original
// where it is actually drawn large (print, very dense screens).
// width/height are set so the space is reserved before the image arrives
// (no layout shift).
export function brandMarkProps(variant, theme, height) {
  const m = SRC[variant] || SRC.full;
  const h = height || (variant === 'short' ? 32 : 28);
  const w = Math.round((h * m.w) / m.h);
  const base = m[theme];
  return {
    src: `${base}-h96.png`,
    srcSet: `${base}-h96.png ${m.smallW}w, ${base}.png ${m.w}w`,
    sizes: `${w}px`,
    width: w,
    height: h,
  };
}

