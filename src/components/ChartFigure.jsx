import React from 'react';

// A chart plus its one- or two-sentence summary (utils/chartSummaries.js).
// The summary is the figure's caption: shown to everyone, printed with the
// page, and read by a screen reader as the chart's name (WCAG 1.1.1).
//
// label: for a chart whose legend already spells out every figure on
// screen (Mix at a Glance), the summary is given as the figure's name only,
// not repeated as a caption.
export default function ChartFigure({ summary, children, testId, label }) {
  if (label) {
    return (
      <figure className="chart-figure" data-testid={testId} aria-label={label}>
        {children}
      </figure>
    );
  }
  return (
    <figure className="chart-figure" data-testid={testId}>
      {children}
      {summary ? <figcaption className="chart-summary">{summary}</figcaption> : null}
    </figure>
  );
}
