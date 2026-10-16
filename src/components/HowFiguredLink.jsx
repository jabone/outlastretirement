import React, { useContext } from 'react';
import SimulationContext from '../context/SimulationContext';

// A small text link beside a tax figure that opens Help -> How the numbers
// are figured, scrolled to one rule card. `rule` is an id from
// src/config/howFigured.js; howFiguredLinks.test.jsx checks every use names
// a real one. A real <button>, so Enter and Space work and it sits in the
// tab order. The accessible name is "How is this figured? <topic>"; when the
// visible words are not the default, `topic` must contain them (WCAG label in
// name).
//
// Renders nothing outside the app's provider (a bare test render), rather
// than a link that cannot go anywhere.
export default function HowFiguredLink({ rule, topic, children = 'How is this figured?', style }) {
  const sim = useContext(SimulationContext);
  const open = sim && sim.openHowFigured;
  if (!open) return null;
  return (
    <button
      type="button"
      data-how-figured-link={rule}
      aria-label={topic ? `How is this figured? ${topic}` : undefined}
      onClick={(e) => { e.stopPropagation(); open(rule); }}
      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 'var(--fs-xs)', color: 'var(--accent-text)', textDecoration: 'underline', cursor: 'pointer', ...style }}
    >
      {children}
    </button>
  );
}
