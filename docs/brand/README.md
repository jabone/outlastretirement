# OutlastRetirement brand assets
<!-- The assets this describes live in public/brand/. This file lives in docs/ so it is not published with the site. -->

Locked 2026-09-11. `public/brand/outlastretirement.tokens.css` is the source of truth for
color and logo sizing and is copied here **verbatim** from the brand folder
— edit it there and re-copy rather than patching this file, or the two drift.

## The marks

| File | Use |
|---|---|
| `outlast-full-light.png` | Full lockup on cream — site header, docs, legal, OG fallback |
| `outlast-full-dark.png` | Full lockup on navy — same surfaces, dark theme |
| `or-short-light.png` | OR monogram on cream — favicon, app icon, compact nav |
| `or-short-dark.png` | OR monogram on navy — same, dark theme |

`alt` is **`OutlastRetirement`** for both marks. Never `OR` — that is the
alternate mark, not the product name.

## What was done to the supplied PNGs

They arrived as 1280x720 renders: the mark floating in a padded cream or navy
field, RGB with no alpha. Dropped into a header, that field paints a
rectangle of not-quite-matching background behind the mark.

Each was cropped to the mark and keyed to transparency — the field color
sampled from the corners, coverage taken as the per-channel difference from
it, and edge pixels un-premultiplied so they carry the mark's own color
rather than a blend with the field (otherwise every edge keeps a cream or
navy fringe that shows as a halo on any other ground). The renders carry
faint texture that keys to about alpha 0.008; anything under 0.05 is floored
to zero, or that haze rides along inside the crop box. Palette-quantised
afterwards: 96KB to 18KB with no visible change.

The originals are unmodified in the brand folder. If a mark needs regenerating
from a new render, that is the recipe.

## Rules that outlive this file

- One teal only: `#2A7F7A`. The rasters sample a hair off (~`#356D72` on the
  full path); the token wins.
- Paths and arrows never end on a downslope, and never in a round end-dot.
- Full mark: two strokes left of the stacked type, exactly one arrowhead, on
  the upper stroke.
- Short mark: the arrow cuts *through* the R, never sits beside it.
- Do not redraw the wordmark in live type. Use the PNGs.
- Do not stretch, outline, drop-shadow, or recolor the arrow on its own.
