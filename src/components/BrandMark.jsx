// The OutlastRetirement lockup, wherever the UI names the product.
//
// The brand forbids redrawing those letterforms in live type, so this is the
// supplied PNG rather than styled text -- it replaced a gradient-filled
// <span> in the sidebar, the collapsed rail, and the mobile top bar.
//
// Two images rather than one with a swapped src: the app's theme is a CSS
// attribute on the document, and reading it in JS would mean subscribing to
// theme changes here and re-rendering three components to keep up. CSS in
// index.css shows whichever matches the current theme. Both files are tiny
// (9-18KB, palette-quantised) and both are precached, so the second one
// costs a download that has already happened.
//
// Paths are absolute into /brand/, the same copy the marketing page uses --
// deliberately one set of files, not a second copy under src/assets.
import { BRAND_NAME } from '../config/branding';
import { brandMarkProps } from '../utils/brandMarkProps';

// `height` is a number of CSS pixels. The brand's minimums are 28 for the
// full lockup and 32 for the short mark; going under them is a brand
// violation, not a layout choice, so they are the defaults.
export default function BrandMark({ variant = 'full', height, className = '', style = {} }) {
  const h = height || (variant === 'short' ? 32 : 28);
  const common = { alt: BRAND_NAME, style: { height: h, width: 'auto', ...style } };
  return (
    <>
      <img {...common} {...brandMarkProps(variant, 'dark', h)} className={`brand-mark brand-mark--dark ${className}`} />
      <img {...common} {...brandMarkProps(variant, 'light', h)} className={`brand-mark brand-mark--light ${className}`} />
    </>
  );
}
