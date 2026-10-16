import React from 'react';
import { Landmark } from 'lucide-react';

// The plain-language companion to the Social Security Claiming Heatmap
// (changelog 286): the plan re-run with one spouse claiming at 62, 65, 67
// and 70, the plan's own age marked, "can you afford to wait", and the
// break-even age. It lived on Detailed Holdings -> Retirement Income, where
// it duplicated the heatmap's question with none of the heatmap beside it;
// it now sits under the grid on Optimizers. `ssClaiming` is
// compareSsClaimingAges() from utils/retirementFunding.js.
export default function SsClaimingSummary({ ssClaiming, inputs, formatCurrency, dollarBasisLabel }) {
  if (!ssClaiming) return null;
  return (
    <div className="glass-panel" data-testid="ss-claiming-summary" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <Landmark size={18} color="var(--accent-primary)" />
        <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>When to Claim Social Security, in plain words</h3>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{`your plan re-run with you claiming at each age${inputs.spouse2Enabled ? ` (spouse stays at ${inputs.claimingAge2})` : ''}, in ${dollarBasisLabel}`}</span>
      </div>

      {ssClaiming.rows.length > 0 && (() => {
        const cur = ssClaiming.rows.find((r) => r.isCurrent);
        const at70 = ssClaiming.rows.find((r) => r.age === 70);
        const at62 = ssClaiming.rows.find((r) => r.age === 62);
        const fmtDelta = (v) => `${v >= 0 ? '+' : '-'}${formatCurrency(Math.abs(v))}`;
        const lifeExp = Number(inputs.lifeExpectancy1) || null;
        return (
          <>
            <div className="scroll-region" tabIndex={0} role="region" aria-label="Social Security by claiming age" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--card-border)' }}>
                    <th style={{ padding: '8px' }}>Claim at</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Monthly Benefit</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Bridge Years</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Portfolio Draws Before Benefits</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Lifetime Benefits</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Ending Balance</th>
                    <th style={{ padding: '8px' }}>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {ssClaiming.rows.map((r) => (
                    <tr key={r.age} style={{ borderBottom: '1px solid var(--card-border)', background: r.isCurrent ? 'rgba(42, 127, 122, 0.08)' : undefined }}>
                      <td style={{ padding: '8px', fontWeight: 600 }}>
                        {r.age}{r.age === 62 ? ' (earliest)' : r.age === 70 ? ' (latest)' : r.age === 67 ? ' (full)' : ''}
                        {r.isCurrent && <span style={{ marginLeft: '8px', fontSize: 'var(--fs-2xs)', color: 'var(--accent-text)', fontWeight: 600 }}>YOUR PLAN</span>}
                        {r.isBestEnding && !r.isCurrent && <span style={{ marginLeft: '8px', fontSize: 'var(--fs-2xs)', color: 'var(--success)', fontWeight: 600 }}>HIGHEST ENDING</span>}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(r.monthlyBenefit)}/mo{r.firstBenefitYear ? <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}> in {r.firstBenefitYear}</span> : null}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{r.bridgeYears}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        {formatCurrency(r.bridgeWithdrawals)}
                        {!r.isCurrent && cur ? <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}> ({fmtDelta(r.extraBridgeVsCurrent)} vs plan)</span> : null}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(r.lifetimeSs)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: r.isBestEnding ? 700 : 400 }}>
                        {formatCurrency(r.endingBalance)}
                        {!r.isCurrent && cur ? <span style={{ color: r.endingVsCurrent >= 0 ? 'var(--success)' : 'var(--error)', fontSize: 'var(--fs-xs)' }}> ({fmtDelta(r.endingVsCurrent)})</span> : null}
                      </td>
                      <td style={{ padding: '8px', color: r.isSuccessful ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>{r.isSuccessful ? 'Fully Funded' : 'Shortfall Risk'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '12px', lineHeight: '1.5' }}>
              {at70 && (
                <div>
                  <strong>Can you afford to wait until 70?</strong>{' '}
                  {at70.isSuccessful
                    ? `Yes — the plan stays Fully Funded. Waiting costs ${formatCurrency(Math.max(0, at70.extraBridgeVsCurrent))} more in portfolio withdrawals over ${at70.bridgeYears} bridge year${at70.bridgeYears === 1 ? '' : 's'} than your current choice, and buys ${formatCurrency(at70.monthlyBenefit)}/mo for life instead of ${formatCurrency(cur ? cur.monthlyBenefit : 0)}/mo; the plan ends ${at70.endingVsCurrent >= 0 ? `${formatCurrency(at70.endingVsCurrent)} higher` : `${formatCurrency(-at70.endingVsCurrent)} lower`}.`
                    : `Not without a change — with benefits delayed to 70 the plan shows Shortfall Risk: the ${at70.bridgeYears} bridge year${at70.bridgeYears === 1 ? '' : 's'} would take ${formatCurrency(Math.max(0, at70.extraBridgeVsCurrent))} more from the portfolio than your current choice, and it doesn't recover.`}
                </div>
              )}
              {ssClaiming.breakEven && at62 && (
                <div style={{ marginTop: '6px' }}>
                  <strong>Break-even:</strong> claiming at 70 has paid out more in total than claiming at 62 from about age {ssClaiming.breakEven}
                  {lifeExp ? ` — your plan runs to ${lifeExp}, ${lifeExp > ssClaiming.breakEven ? `${lifeExp - ssClaiming.breakEven} years past it` : 'short of it'}.` : '.'}
                </div>
              )}
            </div>

            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginTop: '14px' }}>
              <div className="glass-panel-hover" style={{ padding: '14px', borderRadius: '10px' }}>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reasons to delay</div>
                <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: '1.5', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <li>Each year past full retirement age adds 8% for life, with cost-of-living increases on the larger amount — the cheapest inflation-protected lifetime income available.</li>
                  {inputs.spouse2Enabled && <li>For a couple, the higher earner's benefit becomes the survivor's benefit: delaying it protects whoever lives longer.</li>}
                  <li>Living past the break-even age{ssClaiming.breakEven ? ` (${ssClaiming.breakEven})` : ''} is where delaying pays; a plan that runs to {lifeExp || 90} is betting on that.</li>
                  {inputs.rothConversionStrategy && inputs.rothConversionStrategy !== 'none'
                    ? <li>Your plan does Roth conversions: the bridge years with no benefits are low-income years, which makes those conversions cheaper.</li>
                    : <li>The bridge years are low-income years — room for Roth conversions or realizing gains at low rates, if you ever want to.</li>}
                </ul>
              </div>
              <div className="glass-panel-hover" style={{ padding: '14px', borderRadius: '10px' }}>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reasons to claim earlier</div>
                <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: '1.5', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <li>The bridge is funded by selling shares{at70 && at70.extraBridgeVsCurrent > 0 ? ` (${formatCurrency(at70.extraBridgeVsCurrent)} more by waiting to 70)` : ''} — selling into a bad market early in retirement is the risk that hurts most.</li>
                  <li>Health or family history that makes the break-even age unlikely — benefits stop at death; the bridge money spent does not come back.</li>
                  {inputs.spouse2Enabled && <li>The lower earner in a couple can claim early while the higher earner delays — income now, survivor protection later.</li>}
                  {(Number(inputs.retireAge1) || 0) > 62 && <li>Claiming before you stop working (you retire at {inputs.retireAge1}) and before full retirement age triggers the earnings test: benefits are withheld above the earnings limit (credited back later, but not spendable now) — which is why the early rows above can look worse than expected.</li>}
                  {inputs.ssDepletionEnabled && <li>Your plan models a trust-fund cut in {inputs.ssDepletionYear}: benefits already in payment take the same percentage cut, so this is not by itself a reason to claim early.</li>}
                </ul>
              </div>
            </div>
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '10px' }}>
              Every row is your full plan re-run with only your claiming age changed (taxes, survivor rules, COLA and any trust-fund cut included). The heatmap above runs every combination for both spouses. Change the claiming age itself on Plan, Income. Not advice — which age is right depends on health and preferences the plan can&apos;t know.
            </div>
          </>
        );
      })()}
      {ssClaiming.rows.length === 0 && (
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>Set a retirement age on Plan Settings to compare claiming ages.</div>
      )}
        </div>
  );
}
