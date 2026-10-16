import React from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import HoverTooltip from './HoverTooltip';

// The one maximize control (changelog 288): an icon-only outline button
// that sits at the top-right of its panel with nothing to its right. It
// reads and writes maximizedComponent itself; pass `target` (the key
// App.jsx / the panel checks) and, where the panel toggles in place rather
// than opening App.jsx's modal, `current` so the icon flips to Minimize.
// Placement is the caller's job (last child of the header row); this file
// makes every instance look and behave the same.
export default function MaximizeButton({ target, current, setMaximizedComponent, label = 'Maximize', style }) {
  const isMax = current === target;
  const text = isMax ? 'Close zoom' : label;
  return (
    <HoverTooltip text={text}>
      <button
        type="button"
        onClick={() => setMaximizedComponent(isMax ? null : target)}
        className="btn-outline chart-maximize-btn"
        aria-label={text}
        data-testid={`maximize-${target}`}
        style={{ padding: '6px', minWidth: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...style }}
      >
        {isMax ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
    </HoverTooltip>
  );
}
