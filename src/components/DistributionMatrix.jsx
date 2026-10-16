import React, { useState } from 'react';

// The Distributions sub-tab's header grid: one row per KIND of
// distribution, with the forward estimate and what was actually received in
// separate columns.
//
// It replaced a row of KPI cards where every figure was the same
// dividends-only estimate sliced two ways, under headings ("Avg. Monthly
// Cash Flow") that named cash the user never sees, since everything is
// reinvested. Two rules came out of that and both are load-bearing here:
//
//   1. An estimate and an actual never share a cell. They answer different
//      questions and blending them is what made the old row misleading.
//   2. Return of capital is shown but never counted as income -- it is
//      money you received that reduces your cost basis rather than being
//      taxed. Hence two totals, not one.
//
// Presentational only: computeDistributionMatrix (portfolioHoldings.js)
// owns every number and the rule for which row a record lands in.
// Rows whose whole purpose is to be emptied: the money is real, the label
// is missing. Opening one lists the holdings behind it so the user works
// down a list instead of hunting the setting holding by holding.
// Each says what would sort the row. Only "Kind not stated" means a
// Distribution Character is missing; the other two can hold holdings whose
// character IS set (changelog 205), so they must not tell the user to do
// what they already did.
const UNSTATED_ROWS = {
  unspecified: 'set each holding\u2019s Distribution Character to sort this',
  mixed: 'you marked these Mixed \u2014 the fund\u2019s year-end 1099-DIV gives the split',
  capitalGainDistribution: 'term not stated \u2014 set Distribution Character to Long-Term Capital Gain if that is all the fund pays',
};

export default function DistributionMatrix({ matrix, dripSplit, formatCurrency, formatPct, onEditHolding }) {
  const [openRow, setOpenRow] = useState(null);
  const { rows, totals, marketValue, thisYear, lastFullYear } = matrix;
  const yieldPct = (amount) => (marketValue > 0 ? formatPct((amount / marketValue) * 100) : '--');
  const cell = { padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' };
  const head = { ...cell, fontWeight: 600, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' };
  const cashAnnual = dripSplit ? dripSplit.cash : 0;
  const reinvestedAnnual = dripSplit ? dripSplit.drip : 0;

  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', padding: '16px 0' }}>
        Nothing to show yet &mdash; set a holding&rsquo;s Ann. Dividend/Share, or log a distribution, and it appears here.
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      <div className="scroll-region" tabIndex={0} role="region" aria-label="Distributions by type" style={{ overflowX: 'auto' }}>
        <table aria-label="Distributions by type" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)', minWidth: '860px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
              <th style={{ ...head, textAlign: 'left' }}>Distribution type</th>
              <th style={head}>Est. annual</th>
              <th style={head}>Est. monthly</th>
              <th style={head}>Received {thisYear}</th>
              {/* Between the two calendar columns on purpose: it is the one
                  that is always a COMPLETE cycle, where "this year" is
                  partial for eleven months out of twelve and "last year"
                  goes stale as this one fills up. */}
              <th style={head}>Last 12 mo</th>
              <th style={head}>Received {lastFullYear}</th>
              <th style={head}>Yield {lastFullYear}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <React.Fragment key={row.id}>
              <tr style={{ borderBottom: openRow === row.id ? 'none' : '1px solid var(--card-border)' }}>
                <td style={{ padding: '8px 10px' }}>
                  {onEditHolding && row.holdings.length > 0 ? (
                    <button
                      type="button"
                      aria-expanded={openRow === row.id}
                      onClick={() => setOpenRow(openRow === row.id ? null : row.id)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left' }}
                      title={`Show the ${row.holdings.length} holding${row.holdings.length === 1 ? '' : 's'} behind this row`}
                    >
                      <span aria-hidden="true" style={{ color: 'var(--text-muted)', marginRight: '6px' }}>{openRow === row.id ? '\u25be' : '\u25b8'}</span>
                      {row.label}
                    </button>
                  ) : row.label}
                  {!row.isIncome && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', marginLeft: '8px' }}>
                      not income &mdash; reduces cost basis
                    </span>
                  )}
                  {UNSTATED_ROWS[row.id] && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', marginLeft: '8px' }}>
                      {UNSTATED_ROWS[row.id]}
                    </span>
                  )}
                </td>
                <td style={cell}>{row.estimated > 0 ? `${formatCurrency(row.estimated)}/yr` : '--'}</td>
                <td style={{ ...cell, color: 'var(--text-secondary)' }}>{row.estimated > 0 ? `${formatCurrency(row.estimated / 12)}/mo` : '--'}</td>
                <td style={cell}>{row.thisYear > 0 ? formatCurrency(row.thisYear) : '--'}</td>
                <td style={cell}>{row.trailing12 > 0 ? formatCurrency(row.trailing12) : '--'}</td>
                <td style={cell}>{row.lastFullYear > 0 ? formatCurrency(row.lastFullYear) : '--'}</td>
                <td style={{ ...cell, color: 'var(--text-secondary)' }}>{row.lastFullYear > 0 ? yieldPct(row.lastFullYear) : '--'}</td>
              </tr>
              {openRow === row.id && (
                <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                  <td colSpan={7} style={{ padding: '0 10px 10px 26px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {row.holdings.map((h) => (
                        <button
                          key={h.holdingId}
                          type="button"
                          className="btn-outline"
                          style={{ padding: '3px 10px', fontSize: 'var(--fs-xs)', width: 'auto' }}
                          onClick={() => onEditHolding(h.holdingId)}
                          title={`Edit ${h.symbol}'s dividend settings, including Distribution Character`}
                        >
                          {h.symbol}{' '}
                          <strong>{formatCurrency(h.estimated > 0 ? h.estimated : (h.lastFullYear || h.thisYear))}</strong>
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
            <tr style={{ borderTop: '2px solid var(--card-border)', fontWeight: 700 }}>
              <td style={{ padding: '8px 10px' }}>Taxable income</td>
              <td style={cell}>{`${formatCurrency(totals.estimatedIncome)}/yr`}</td>
              <td style={{ ...cell, color: 'var(--text-secondary)' }}>{`${formatCurrency(totals.estimatedIncome / 12)}/mo`}</td>
              <td style={cell}>{formatCurrency(totals.thisYearIncome)}</td>
              <td style={cell}>{formatCurrency(totals.trailing12Income)}</td>
              <td style={cell}>{formatCurrency(totals.lastFullYearIncome)}</td>
              <td style={{ ...cell, color: 'var(--text-secondary)' }}>{totals.lastFullYearIncome > 0 ? yieldPct(totals.lastFullYearIncome) : '--'}</td>
            </tr>
            {totals.estimated !== totals.estimatedIncome || totals.lastFullYear !== totals.lastFullYearIncome || totals.thisYear !== totals.thisYearIncome || totals.trailing12 !== totals.trailing12Income ? (
              <tr style={{ fontWeight: 700 }}>
                <td style={{ padding: '8px 10px' }}>
                  Total received
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 'var(--fs-xs)', marginLeft: '8px' }}>
                    income + return of capital
                  </span>
                </td>
                <td style={cell}>{`${formatCurrency(totals.estimated)}/yr`}</td>
                <td style={{ ...cell, color: 'var(--text-secondary)' }}>{`${formatCurrency(totals.estimated / 12)}/mo`}</td>
                <td style={cell}>{formatCurrency(totals.thisYear)}</td>
                <td style={cell}>{formatCurrency(totals.trailing12)}</td>
                <td style={cell}>{formatCurrency(totals.lastFullYear)}</td>
                <td style={{ ...cell, color: 'var(--text-secondary)' }}>{totals.lastFullYear > 0 ? yieldPct(totals.lastFullYear) : '--'}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Where it goes today, and what it would be worth if it stopped
          being reinvested. The destination is a setting, not a property of
          the income: a portfolio reinvesting everything today is exactly
          the one whose distributions become spending money in retirement,
          so reporting a bare "$0 to cash" would answer the wrong question. */}
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '10px', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>Where it goes today:</strong>{' '}
        {reinvestedAnnual > 0 && cashAnnual > 0
          ? `${formatCurrency(reinvestedAnnual)}/yr reinvested, ${formatCurrency(cashAnnual)}/yr paid out as cash.`
          : cashAnnual > 0
            ? `all of it paid out as cash, ${formatCurrency(cashAnnual)}/yr.`
            : `all of it reinvested, so none of it reaches you as cash yet.`}
        {' '}Turn DRIP off on a holding and its distributions become spendable instead &mdash; which is what happens in
        retirement. The <strong>Retirement Income</strong> sub-tab shows how much of your actual retirement spending this
        income would cover, year by year.
        {' '}Est. columns are the forward view from each holding&rsquo;s Ann. Dividend/Share, so they carry only dividends;
        the Received columns are what really arrived, of every kind.
      </div>
    </div>
  );
}
