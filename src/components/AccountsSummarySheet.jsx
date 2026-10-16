import React from 'react';
import { accountsSummaryModel, holdingLabel, groupSmallHoldings } from './accountsSummaryModel';

// Account summary for the planner packet (changelog 299). What you own and
// owe, by tax type, and -- with Detailed Holdings -- what is held in each,
// combined by fund or stock. It deliberately carries no account names,
// institutions, account numbers or lot details: enough for a reviewer to
// see the whole picture without copying anyone's statements.

const pct = (v) => `${Math.round(v * 10) / 10}%`;

export default function AccountsSummarySheet({ inputs, holdings, formatCurrency }) {
  const m = accountsSummaryModel(inputs, holdings);
  const fc = (v) => formatCurrency(Math.round(v));
  return (
    <div className="packet-page" data-testid="accounts-summary-sheet">
      <h1>Account summary</h1>
      <p className="review-lede">
        What the plan starts from, by tax type, as entered in the plan{m.buckets.length ? ' and in Detailed Holdings' : ''}.
        Account names, firms, account numbers and purchase lots are left out on purpose.
      </p>

      <section className="review-category">
        <h2>Invested and saved <span>{fc(m.investable)}</span></h2>
        <table className="packet-table packet-kv">
          <tbody>
            {m.own.map((r) => (
              <tr key={r.label}>
                <td>{r.label}{r.note ? <span className="packet-muted"> &mdash; {r.note}</span> : null}</td>
                <td className="num">{fc(r.value)}</td>
                <td className="num packet-muted">{m.investable > 0 ? pct((r.value / m.investable) * 100) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {(m.other.length > 0 || m.owe.length > 0) && (
        <section className="review-category">
          <h2>Other assets and debts <span>Net worth {fc(m.netWorth)}</span></h2>
          <table className="packet-table packet-kv">
            <tbody>
              {m.other.map((r) => (<tr key={r.label}><td>{r.label}</td><td className="num">{fc(r.value)}</td></tr>))}
              {m.owe.map((r) => (<tr key={r.label}><td>{r.label}{r.note ? <span className="packet-muted"> &mdash; {r.note}</span> : null}</td><td className="num">&minus;{fc(r.value)}</td></tr>))}
            </tbody>
          </table>
        </section>
      )}

      {m.assetMix.length > 0 && (
        <section className="review-category">
          <h2>How the holdings are invested <span>{fc(m.holdingsTotal)}</span></h2>
          <table className="packet-table packet-kv">
            <tbody>{m.assetMix.map((c) => (<tr key={c.label}><td>{c.label}</td><td className="num">{fc(c.value)}</td><td className="num packet-muted">{pct(c.pct)}</td></tr>))}</tbody>
          </table>
        </section>
      )}

      {m.buckets.map((b) => (
        <section key={b.id} className="review-category packet-group">
          <h2>{b.label} <span>{fc(b.total)}</span></h2>
          {b.differs && (
            <p className="review-note">The holdings below add up to {fc(b.total)}; the plan&rsquo;s projection uses {fc(b.planBalance)}, the balance entered on Plan, Balances &amp; Debt.</p>
          )}
          <table className="packet-table">
            <thead>
              <tr><th>Holding</th><th>Kind</th><th className="num">Value</th><th className="num">Share</th>{b.showGain && <th className="num">Gain over cost</th>}</tr>
            </thead>
            <tbody>
              {(() => {
                const { rows, other } = groupSmallHoldings(b.rows);
                const gainCell = (g) => (g === null ? '' : `${g < 0 ? '−' : ''}${fc(Math.abs(g))}`);
                return (
                  <>
                    {rows.map((r) => {
                      const l = holdingLabel(r.symbol, r.name);
                      return (
                        <tr key={`${r.symbol}-${r.name}`}>
                          <td>{l.ticker ? <strong>{l.ticker}</strong> : null}{l.ticker && l.name ? ' ' : ''}{l.name}</td>
                          <td>{r.className}</td>
                          <td className="num">{fc(r.value)}</td>
                          <td className="num">{pct(r.pct)}</td>
                          {b.showGain && <td className="num">{gainCell(r.gain)}</td>}
                        </tr>
                      );
                    })}
                    {other && (
                      <tr>
                        <td className="packet-muted">{other.count} smaller holdings, each under 1%</td>
                        <td />
                        <td className="num">{fc(other.value)}</td>
                        <td className="num">{pct(other.pct)}</td>
                        {b.showGain && <td className="num">{gainCell(other.gain)}</td>}
                      </tr>
                    )}
                  </>
                );
              })()}
            </tbody>
          </table>
        </section>
      ))}
      {m.buckets.length === 0 && (
        <p className="review-note">No Detailed Holdings in this plan, so the balances above are the whole account picture.</p>
      )}
    </div>
  );
}
