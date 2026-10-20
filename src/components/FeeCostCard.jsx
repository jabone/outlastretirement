// What fees cost you (changelog 447). The plan as set beside one other fee
// setting, from computeFeeComparison (run in the heavy-compute worker):
//   - no advisor fee (the app's audience invests for itself): the same plan
//     with a 1% advisor fee added -- what doing it yourself is worth;
//   - an advisor fee: the same plan without it.
// Fund expenses stay as set on both sides. Free: fees change every figure
// in the plan, so what they cost cannot sit behind Premium.
//
// Facts only. The card states the household's own numbers and leaves the
// judgment to them; it does not say an advisor is or is not worth paying.
import React from 'react';
import { Loader2, Receipt } from 'lucide-react';
import { feeCardLabels, feePct as pct } from '../utils/feeCardLabels';

const money = (n) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString('en-US')}` : '—');

const cell = { padding: '8px 10px', borderBottom: '1px solid var(--card-border)', textAlign: 'right', whiteSpace: 'nowrap' };
const rowHead = { ...cell, textAlign: 'left', whiteSpace: 'normal', color: 'var(--text-secondary)', fontWeight: 500 };
const linkButton = { background: 'none', border: 'none', padding: 0, color: 'var(--accent-text)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' };

function lastedText(h) {
  return h ? `${h.lasted} of ${h.count}` : '—';
}

export default function FeeCostCard({ data, loading, onChangeFees = null }) {
  const head = (
    <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
      <Receipt size={18} style={{ color: 'var(--accent-text)' }} />
      <span>What fees cost you</span>
    </h3>
  );
  if (!data) {
    return (
      <div className="glass-panel" style={{ padding: '24px' }} data-testid="fee-cost">
        {head}
        <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {loading ? <><Loader2 className="animate-spin" size={14} /> Working out what fees cost your plan&hellip;</> : 'Not available for this plan.'}
        </p>
      </div>
    );
  }
  const labels = feeCardLabels(data);
  const { mine, other } = data;
  const withAdvisor = data.kind === 'withAdvisor';
  // The advisor side always pays more; show the gap as a positive number
  // on the side that costs more.
  const diff = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) : null);
  const rows = [
    {
      label: 'Fees paid over the plan',
      mine: money(mine.lifetimeFees),
      other: money(other.lifetimeFees),
      gap: money(diff(mine.lifetimeFees, other.lifetimeFees)),
    },
    {
      label: 'Left at the end of the plan',
      mine: mine.runsOutYear ? `Runs out in ${mine.runsOutYear}` : money(mine.endingBalance),
      other: other.runsOutYear ? `Runs out in ${other.runsOutYear}` : money(other.endingBalance),
      gap: mine.runsOutYear || other.runsOutYear ? '' : money(diff(mine.endingBalance, other.endingBalance)),
    },
  ];
  if (mine.historical || other.historical) {
    rows.push({
      label: mine.historical ? `Historical starts lasted (since ${mine.historical.firstStart})` : 'Historical starts lasted',
      mine: lastedText(mine.historical),
      other: lastedText(other.historical),
      gap: mine.historical && other.historical ? `${Math.abs(mine.historical.lasted - other.historical.lasted)}` : '',
    });
  }
  if (Number.isFinite(mine.safeMax) || Number.isFinite(other.safeMax)) {
    rows.push({
      label: 'Most you could spend a year and last through every start',
      mine: money(mine.safeMax),
      other: money(other.safeMax),
      gap: money(diff(mine.safeMax, other.safeMax)),
    });
  }
  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }} data-testid="fee-cost">
      {head}
      <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', margin: 0 }}>{labels.lede}</p>
      <div className="scroll-region" tabIndex={0} role="region" aria-label="What fees cost you, compared" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
          <thead>
            <tr>
              <td style={rowHead} />
              <th scope="col" style={{ ...cell, fontWeight: 600 }}>Your plan</th>
              <th scope="col" style={{ ...cell, fontWeight: 600 }}>{labels.otherHeading}</th>
              <th scope="col" style={{ ...cell, fontWeight: 600 }}>Difference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" style={rowHead}>{r.label}</th>
                <td style={cell}>{r.mine}</td>
                <td style={cell}>{r.other}</td>
                <td style={{ ...cell, fontWeight: 600 }}>{r.gap}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', margin: 0 }}>
        Today&rsquo;s dollars. Fees come off your Pre-Tax, Roth, Taxable and HSA balances each year, after that
        year&rsquo;s return, and they compound: every dollar paid is a dollar that no longer grows.
        {withAdvisor ? ' The advisor fee here is an illustration; your plan does not include one.' : ''}
        {' '}Fund expenses ({pct(mine.fundExpenseRatioPct)}) are the same on both sides.
        {onChangeFees && <>{' '}<button type="button" style={linkButton} onClick={onChangeFees}>Change your fees</button></>}
      </p>
    </div>
  );
}
