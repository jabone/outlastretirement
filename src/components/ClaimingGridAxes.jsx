// The two-spouse Social Security claiming grid's axis names. The rows are
// Spouse 1's claiming ages and carry the green row-header color; the
// columns are Spouse 2's and carry the gold column-header color. Each name
// takes its own axis's color everywhere it labels that axis -- the corner
// cell and the sentence above the grid -- so the reader can match a name
// to its row or column at a glance.
//
// The corner cell (96px) used to put both names on one centered line,
// which cut off the start of any pair longer than about a dozen letters.
// It now stacks them, one per line, each pointing at its axis; a name too
// long for the line ends in an ellipsis, with the whole name in its hover
// title and in the sentence above the grid.
import React from 'react';

const ROW_AXIS_COLOR = 'var(--accent-text)';
const COLUMN_AXIS_COLOR = 'var(--series-2-text)';

const lineStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '3px',
  minWidth: 0,
};

const nameStyle = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export function ClaimingGridCorner({ rowName, columnName }) {
  return (
    <div
      data-testid="claiming-grid-corner"
      aria-label={`Rows: ${rowName}'s claiming age. Columns: ${columnName}'s claiming age.`}
      role="note"
      style={{
        fontSize: 'var(--fs-xs)',
        fontWeight: '700',
        lineHeight: 1.25,
        textAlign: 'right',
        paddingRight: '12px',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '2px',
      }}
    >
      <span style={{ ...lineStyle, color: COLUMN_AXIS_COLOR }} title={`Columns: ${columnName}`}>
        <span style={nameStyle}>{columnName}</span>
        <span aria-hidden="true" style={{ flex: 'none' }}>&rarr;</span>
      </span>
      <span style={{ ...lineStyle, color: ROW_AXIS_COLOR }} title={`Rows: ${rowName}`}>
        <span style={nameStyle}>{rowName}</span>
        <span aria-hidden="true" style={{ flex: 'none' }}>&darr;</span>
      </span>
    </div>
  );
}

export function AxisName({ axis, children }) {
  return (
    <strong style={{ color: axis === 'row' ? ROW_AXIS_COLOR : COLUMN_AXIS_COLOR }}>
      {children}
    </strong>
  );
}
