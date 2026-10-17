import React from 'react';
import { swatchColor } from './chartSwatchColor';

// The one hover card every chart uses (changelog 275).
//
// Recharts' stock tooltip tints each row's TEXT in the series' color, which
// is unreadable in one theme or the other and says nothing about which
// series a plain-white row belongs to. This card keeps the text in ink and
// carries the series identity as a color swatch beside the name -- the
// same convention the legends and the Retirement Funding tooltip already
// use. Recharts clones this element with active/payload/label; the
// `formatter` and `labelFormatter` props keep Recharts' own signatures so
// the charts' existing formatters drop straight in.
//
//   formatter(value, name, entry) -> [valueText, nameText] | valueText
//   labelFormatter(label, payload) -> headline text
//
// The swatch color comes from swatchColor (chartSwatchColor.js).

export default function ChartTooltip({ active, payload, label, formatter, labelFormatter, hideLabel = false, footer }) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload
    .filter((entry) => entry && entry.value !== undefined && entry.value !== null && !entry.hide)
    .map((entry, i) => {
      const raw = formatter ? formatter(entry.value, entry.name, entry, i, payload) : entry.value;
      const [valueText, nameText] = Array.isArray(raw) ? raw : [raw, entry.name];
      return { key: `${entry.dataKey ?? entry.name ?? i}-${i}`, color: swatchColor(entry), name: nameText ?? entry.name, value: valueText };
    });
  if (rows.length === 0) return null;
  const headline = hideLabel ? null : (labelFormatter ? labelFormatter(label, payload) : label);
  const cell = { padding: '2px 0', whiteSpace: 'nowrap' };
  return (
    <div className="chart-tooltip" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '10px 12px', fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.18)' }}>
      {headline !== null && headline !== undefined && headline !== '' && (
        <div style={{ fontWeight: 600, marginBottom: '6px' }}>{headline}</div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={cell}>
                <span aria-hidden="true" style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', backgroundColor: r.color, border: '1px solid var(--card-border)', marginRight: '6px', verticalAlign: '-1px' }} />
                {r.name}
              </td>
              <td style={{ ...cell, textAlign: 'right', paddingLeft: '14px', fontWeight: 600 }}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {footer && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '6px' }}>{footer}</div>}
    </div>
  );
}
