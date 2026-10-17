import React from 'react';
import BrandMark from './BrandMark';
import { BRAND_DOMAIN } from '../config/branding';

// The printed page header (changelog 301): the lockup, the report title and
// the date, repeated at the top of every printed page. A table whose
// <thead> is display: table-header-group is the one construct browsers
// repeat on each page by themselves; a position: fixed header would sit on
// top of the content instead of above it.
// note: one short line under the date, e.g. which dollars the figures are in.
export function PrintHeader({ title = 'Retirement Plan Analysis Report', note = null }) {
  return (
    <div className="print-report-header">
      <div className="print-report-brand">
        {/* The light-theme lockup: paper is white whatever the screen theme. */}
        <a href={`https://${BRAND_DOMAIN}`} className="print-brand-link"><BrandMark variant="full" height={34} /></a>
        <h2>{title}</h2>
      </div>
      <span>Generated: {new Date().toLocaleDateString()}{note && <><br />{note}</>}</span>
    </div>
  );
}

// inline: the frame wraps a page that is also on screen (the Life Plan and
// the estate checklist). On screen the table and its cells are
// display: contents, so the page lays out exactly as it did without it, and
// the header row is hidden; on paper it becomes the table again and the
// header repeats on every page. role="presentation" keeps screen readers
// from announcing a one-cell layout table.
export default function PrintFrame({ children, title, note = null, inline = false }) {
  return (
    <table className={inline ? 'print-frame print-frame--inline' : 'print-frame'} role={inline ? 'presentation' : undefined}>
      <thead>
        <tr><td><PrintHeader title={title} note={note} /></td></tr>
      </thead>
      {/* Repeats at the foot of every page as empty space the size of the
          fixed disclaimer footer, so rows stop above it instead of running
          underneath (changelog 302). */}
      <tfoot>
        <tr><td><div className="print-frame-footer-space" aria-hidden="true" /></td></tr>
      </tfoot>
      <tbody>
        <tr><td>{children}</td></tr>
      </tbody>
    </table>
  );
}
