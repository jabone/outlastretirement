import React from 'react';
import { Globe } from 'lucide-react';
import { foreignYearsNoticeLines } from './foreignYearsNoticeLines';

// The extra disclaimer for years abroad (changelog 196; wording approved by
// John 2026-09-18, RELOCATION_SPEC.md section 8.1a).
//
// Rules it keeps:
//   - It shows on EVERY surface with a year abroad (Dashboard, Year by
//     Year, Tax & Estate, the printable report, and the Where you live
//     panel), not only where the move was entered.
//   - It cannot be dismissed. The risk is not "did you read it once" but
//     "are you looking at a number we cannot stand behind right now".
//   - It names the specific weakness, and its conditional lines escalate
//     when the plan leans on something uncertain.
//   - Domestic moves never show it.
//
// Every figure it states is read from the plan through the engine's own
// normalizer -- never re-derived here.
//
// Two banners (both approved, spec 8.1a): "Years abroad use your own
// figures" for Custom Country, and "Years abroad are estimates" when every
// move abroad uses one of our country summaries unchanged (changelog 197).
// A summary the user edited counts as their own figures -- we cannot
// vouch for numbers we did not choose.

export default function ForeignYearsNotice({ inputs, style }) {
  const n = foreignYearsNoticeLines(inputs);
  if (!n) return null;
  return (
    <div
      role="note"
      aria-label="About the years abroad in this plan"
      data-testid="foreign-years-notice"
      style={{
        display: 'flex', gap: '10px', padding: '12px 14px', marginBottom: '16px',
        borderRadius: '10px', border: '1px solid var(--warning)',
        background: 'rgba(245, 158, 11, 0.07)', fontSize: 'var(--fs-sm)', lineHeight: 1.55,
        ...style,
      }}
    >
      <Globe size={18} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />
      <div>
        <div><strong>{n.title}</strong> {n.body}</div>
        <div style={{ marginTop: '6px', color: 'var(--text-secondary)' }}>{n.always}</div>
        {n.conditional.length > 0 && (
          <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: 'var(--text-secondary)' }}>
            {n.conditional.map((c) => <li key={c.id}>{c.text}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
