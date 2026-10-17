// ReturnAssumptionsSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_returnAssumptions block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useSimulation } from '../../../context/useSimulation';
import { HISTORY_FIRST_YEAR, HISTORY_LAST_YEAR } from '../../../config/historicalReturns';
import { derivedVolatility, lognormalReturnParams } from '../../../calculator';
import NumberInput from '../../NumberInput';
import SwitchRow from '../../SwitchRow';

export default function ReturnAssumptionsSection() {
  const { inputs, updateInput } = useSimulation();
  return (
    <>
              {/* Flat Return Assumptions -- preRetireReturn /
                  postRetireReturn. Added 2026-08-19 (IA Phase 2, see
                  IA_REVIEW.md): these two drive every projected dollar in
                  the app, and until now the ONLY places to set them were
                  two sliders on the Dashboard and the Full Interview. The
                  "Currently Overridden" warning in the very next section
                  already told users these values existed and were in
                  charge — it just had nowhere to send them. Placed
                  directly above Dynamic Asset Allocation because the two
                  are alternatives: whichever is active determines the
                  return the projection actually uses. */}
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  Return Assumptions
                </h3>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '16px' }}>
                  The flat average annual return the projection uses, before and after retirement. These apply whenever
                  Dynamic Asset Allocation below is switched <strong>off</strong> &mdash; which is the default. The two
                  &ldquo;Investment Return&rdquo; sliders on the Dashboard are shortcuts to these same two fields.
                </p>
                {inputs.rebalancingEnabled && (
                  <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.2)', fontSize: '12.5px', color: 'var(--warning)', marginBottom: '12px', fontWeight: '500' }}>
                    <AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> Currently Overridden: Dynamic Asset Allocation (below) is enabled, so your return is being derived
                    from your stock/bond mix instead of these two figures. Turn it off to use these again.
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px', opacity: inputs.rebalancingEnabled ? 0.6 : 1 }}>
                  <div className="form-group">
                    <label htmlFor="field-preRetireReturn">Investment Return &mdash; Working (%)</label>
                    <NumberInput
                      id="field-preRetireReturn" min="-20" max="30"
                      step="0.1"
                      className="form-input"
                      value={inputs.preRetireReturn}
                      onChange={(e) => updateInput('preRetireReturn', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                    />
                    <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>Average annual growth while you&rsquo;re still contributing.</span>
                  </div>
                  <div className="form-group">
                    <label htmlFor="field-postRetireReturn">Investment Return &mdash; Retired (%)</label>
                    <NumberInput
                      id="field-postRetireReturn" min="-20" max="30"
                      step="0.1"
                      className="form-input"
                      value={inputs.postRetireReturn}
                      onChange={(e) => updateInput('postRetireReturn', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                    />
                    <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>Usually set lower than the working rate, reflecting a more conservative retired allocation.</span>
                  </div>
                </div>

                {/* equityGlidePath*. The calculator has supported this
                    since long before this UI existed — runProjection and
                    the Monte Carlo trial loop both read it, the required-
                    return solver correctly excludes it, and it changes
                    results substantially — but there was no control
                    anywhere in the app, so it could never be switched on.
                    A working feature nobody could reach.

                    It belongs HERE rather than in Dynamic Asset Allocation
                    below, because the two are alternatives, not partners:
                    the calculator reads this only on the else-branch, when
                    rebalancingEnabled is off. Glide Allocation (below)
                    does the same job by gliding the stock PERCENTAGE; this
                    one glides the RETURN RATE directly, which is the only
                    lever available when there's no stock/bond mix to
                    reduce.

                    Deliberately not called a "glide path" in the UI. Two
                    other things already carry that name (Glide Allocation
                    right below, and Detailed Holdings' Glide Path
                    simulator), and a third would make all three harder to
                    tell apart. The internal key keeps its original name --
                    renaming it would break every saved plan and backup
                    file that already carries these three keys. */}
                <div style={{ marginTop: '18px', borderTop: '1px solid var(--card-border)', paddingTop: '14px', opacity: inputs.rebalancingEnabled ? 0.6 : 1 }}>
                  <SwitchRow id="toggle-equityGlidePathEnabled" checked={inputs.equityGlidePathEnabled} onChange={(v) => updateInput('equityGlidePathEnabled', v)} disabled={inputs.rebalancingEnabled}>Get more conservative each year in retirement</SwitchRow>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '8px', marginBottom: '0' }}>
                    Instead of holding the retired return flat for life, reduce it a little each year you&rsquo;re
                    retired &mdash; the usual reason being a portfolio that shifts toward bonds and cash as you age.
                    It stops at the floor you set and stays there.
                  </p>
                  {inputs.rebalancingEnabled && (
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginTop: '8px', marginBottom: '0', fontStyle: 'italic' }}>
                      Unavailable while Dynamic Asset Allocation is on. Use <strong>Glide Allocation</strong> in that
                      section instead &mdash; it does the same thing by reducing your stock percentage, which is the
                      figure driving your return once that model is active.
                    </p>
                  )}
                  {inputs.equityGlidePathEnabled && !inputs.rebalancingEnabled && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px', marginTop: '12px' }}>
                        <div className="form-group">
                          <label htmlFor="field-equityGlidePathRate">Annual Return Reduction (%)</label>
                          <NumberInput
                            id="field-equityGlidePathRate"
                            step="0.05"
                            min="0"
                            max="5"
                            className="form-input"
                            value={inputs.equityGlidePathRate}
                            onChange={(e) => updateInput('equityGlidePathRate', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                          />
                          <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>Percentage points taken off the retired return for each year you&rsquo;ve been retired.</span>
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-equityGlidePathFloor">Return Floor (%)</label>
                          <NumberInput
                            id="field-equityGlidePathFloor"
                            step="0.1"
                            min="-5"
                            max="15"
                            className="form-input"
                            value={inputs.equityGlidePathFloor}
                            onChange={(e) => updateInput('equityGlidePathFloor', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                          />
                          <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>The return never drops below this, however long retirement lasts.</span>
                        </div>
                      </div>
                      {/* Spelled out because the interaction of three
                          numbers over time is genuinely hard to picture,
                          and getting it wrong is invisible — the plan just
                          quietly assumes a different return for decades. */}
                      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '10px', marginBottom: '0' }}>
                        Your first retired year uses <strong>{Number(inputs.postRetireReturn) || 0}%</strong>, dropping by{' '}
                        <strong>{Number(inputs.equityGlidePathRate) || 0}%</strong> each year after that
                        {(Number(inputs.equityGlidePathRate) || 0) > 0 && (Number(inputs.postRetireReturn) || 0) > (Number(inputs.equityGlidePathFloor) || 0) ? (
                          <> until it reaches the <strong>{Number(inputs.equityGlidePathFloor) || 0}%</strong> floor in retirement year{' '}
                            <strong>{Math.ceil(((Number(inputs.postRetireReturn) || 0) - (Number(inputs.equityGlidePathFloor) || 0)) / (Number(inputs.equityGlidePathRate) || 0)) + 1}</strong>, then holding there.</>
                        ) : (
                          <>. With these figures the floor is already at or above your retired return, so nothing changes &mdash; lower the floor or raise the reduction to see an effect.</>
                        )}
                      </p>
                    </>
                  )}
                </div>

                {/* volatilityPre / volatilityPost. Same story as the glide
                    control above — wired into the engine, never given a
                    control — but with one important difference: these are
                    ALWAYS active. The glide sat behind an Enabled flag
                    defaulting to false, so it did nothing until switched
                    on. These two have been shaping every Monte Carlo run
                    all along, at 15% and 8%, with no way to see or change
                    them.

                    That matters because they dominate the result. On a
                    representative plan, moving them from 8%/5% to 25%/18%
                    took the success probability from ~100% to ~62% — the
                    single largest lever on that number anywhere in the app,
                    and until now the only invisible one.

                    The retired default was 8% until changelog 247 — half
                    what the Dynamic Asset Allocation branch derived at the
                    same 60/40 mix (11.6%), so toggling that option shifted
                    the assumed retirement risk substantially. The default is
                    now the derived figure and plans still on 8% were moved
                    (migrateInputs). Same release: returns are drawn
                    lognormal around the stated COMPOUND rate, and each run
                    is reproducible for its seed (Risk & Stress → Monte
                    Carlo). */}
                <div style={{ marginTop: '18px', borderTop: '1px solid var(--card-border)', paddingTop: '14px', opacity: inputs.rebalancingEnabled ? 0.6 : 1 }}>
                  <h4 style={{ fontSize: 'var(--fs-body)', fontWeight: '600', margin: '0 0 6px' }}>Market Volatility</h4>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                    How much returns swing year to year, as a standard deviation. This is the single biggest influence
                    on your Monte Carlo success probability, and it affects nothing else: only the Monte Carlo
                    simulation reads these (Risk &amp; Stress &rarr; Monte Carlo Probability). Your main projection, the Dashboard,
                    and the year-by-year ledger all use the flat return figures above and never see them.
                  </p>
                  {inputs.rebalancingEnabled ? (
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: '0', fontStyle: 'italic' }}>
                      Set automatically while Dynamic Asset Allocation is on: volatility is derived from your
                      stock/bond mix instead &mdash; currently about <strong>{((inputs.stockAllocationPre * 16 + (100 - inputs.stockAllocationPre) * 5) / 100).toFixed(1)}%</strong> working
                      and <strong>{((inputs.stockAllocationPost * 16 + (100 - inputs.stockAllocationPost) * 5) / 100).toFixed(1)}%</strong> retired,
                      from an assumed 16% for stocks and 5% for bonds.
                    </p>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
                        <div className="form-group">
                          <label htmlFor="field-volatilityPre">Market Volatility &mdash; Working (%)</label>
                          <NumberInput
                            id="field-volatilityPre"
                            step="0.5"
                            min="0"
                            max="40"
                            className="form-input"
                            value={inputs.volatilityPre}
                            onChange={(e) => updateInput('volatilityPre', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                          />
                          <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>A stock-heavy portfolio has historically run around 15&ndash;18%.</span>
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-volatilityPost">Market Volatility &mdash; Retired (%)</label>
                          <NumberInput
                            id="field-volatilityPost"
                            step="0.5"
                            min="0"
                            max="40"
                            className="form-input"
                            value={inputs.volatilityPost}
                            onChange={(e) => updateInput('volatilityPost', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                          />
                          <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>Lower, for a more conservative retired mix. A 60/40 portfolio has historically run around 10&ndash;12%.</span>
                        </div>
                      </div>
                      {/* Worth saying out loud: lowering these makes the
                          headline number go up without the plan being any
                          safer. That's the one way this control can be
                          used to fool yourself. */}
                      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '10px', marginBottom: '0' }}>
                        Lower figures produce a higher success probability, but the plan isn&rsquo;t any safer &mdash;
                        you&rsquo;ve only assumed a calmer market. If you&rsquo;re unsure, leaving these alone or
                        nudging them <em>up</em> is the cautious direction.
                      </p>
                    </>
                  )}
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '12px', marginBottom: '0' }}>
                    The return figures above are <strong>compound</strong> (average-per-year) rates. The Monte Carlo draws
                    each year&rsquo;s return so that the <em>middle</em> trial grows at exactly that rate &mdash; the same
                    growth your main projection shows &mdash; while the swings above and below follow the volatility
                    here. The simple average of the trials is a little higher than the stated rate (about
                    {' '}<strong>{(lognormalReturnParams((Number(inputs.postRetireReturn) || 0) / 100, (inputs.rebalancingEnabled ? derivedVolatility(inputs.stockAllocationPost) : (Number(inputs.volatilityPost) || 0)) / 100).mean * 100).toFixed(1)}%</strong>
                    {' '}retired at these figures), which is how a compound rate and an arithmetic mean relate.
                  </p>
                </div>

                {/* Return model (changelog 267): the lognormal draw above, or
                    blocks of real years with their own inflation. */}
                <div style={{ marginTop: '18px', borderTop: '1px solid var(--card-border)', paddingTop: '14px' }}>
                  <h4 style={{ fontSize: 'var(--fs-body)', fontWeight: '600', margin: '0 0 6px' }}>Return Model (Monte Carlo)</h4>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                    <strong>Lognormal</strong> draws each year on its own from a bell curve with the volatility above: no
                    clustering, and inflation only if sampled below. <strong>Historical bootstrap</strong> builds each trial
                    from blocks of consecutive real years, {HISTORY_FIRST_YEAR}&ndash;{HISTORY_LAST_YEAR}, at your stock/bond mix &mdash; so bad years
                    come in runs, the left tail is as fat as it was, and a year like 1974 brings its 11% inflation with
                    it. Re-centered on your own return and inflation assumptions by default, so the model changes the
                    shape of the uncertainty, not your view of the future.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label htmlFor="field-mcReturnModel">Return model</label>
                      <select id="field-mcReturnModel" className="form-input form-input-select" value={inputs.mcReturnModel || 'lognormal'} onChange={(e) => updateInput('mcReturnModel', e.target.value)}>
                        <option value="lognormal">Lognormal (statistical)</option>
                        <option value="bootstrap">Historical bootstrap ({HISTORY_FIRST_YEAR}&ndash;{HISTORY_LAST_YEAR})</option>
                      </select>
                    </div>
                    {inputs.mcReturnModel === 'bootstrap' && (
                      <>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label htmlFor="field-mcBootstrapBlockYears">Block length (years)</label>
                          <NumberInput id="field-mcBootstrapBlockYears" min="1" max="20" step="1" className="form-input" value={inputs.mcBootstrapBlockYears ?? 5} onChange={(e) => updateInput('mcBootstrapBlockYears', e.target.value === '' ? '' : Math.max(1, Math.min(20, parseInt(e.target.value))))} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label htmlFor="field-mcBootstrapCenter">Level</label>
                          <select id="field-mcBootstrapCenter" className="form-input form-input-select" value={inputs.mcBootstrapCenter || 'plan'} onChange={(e) => updateInput('mcBootstrapCenter', e.target.value)}>
                            <option value="plan">Re-centered on my assumptions</option>
                            <option value="history">As history (raw returns and inflation)</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Inflation uncertainty in the Monte Carlo (changelog 247).
                    Off by default and bit-identical off. Applied in the
                    engine as a delta on each lifestyle slice's own rate --
                    see the monteCarloInflationOverride block in
                    runProjection. */}
                <div style={{ marginTop: '18px', borderTop: '1px solid var(--card-border)', paddingTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ maxWidth: '620px' }}>
                      <h4 style={{ fontSize: 'var(--fs-body)', fontWeight: '600', margin: '0 0 6px' }}>
                        <span id="label-mcInflationEnabled">Inflation Uncertainty (Monte Carlo)</span>
                      </h4>
                      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0 }}>
                        Off, every trial inflates at your Inflation Rate exactly. On, each trial year also draws its own
                        inflation around that rate &mdash; and draws it <em>with</em> the market, so a bad year for
                        returns tends to be a worse year for prices, as 1973&ndash;74 was. The difference from your
                        planned rate is added to lifestyle spending&rsquo;s general, Housing and Health slices; salary,
                        Life Events and Social Security COLA stay on their planned rates. Only the Monte Carlo reads this.
                      </p>
                    </div>
                    <label className="custom-switch">
                      <input
                        id="toggle-mcInflationEnabled"
                        type="checkbox"
                        checked={!!inputs.mcInflationEnabled}
                        onChange={(e) => updateInput('mcInflationEnabled', e.target.checked)}
                        aria-labelledby="label-mcInflationEnabled"
                      />
                      <span className="slider-round"></span>
                    </label>
                  </div>
                  {inputs.mcInflationEnabled && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px', marginTop: '12px', alignItems: 'start' }}>
                      <div className="form-group">
                        <label htmlFor="field-mcInflationVolatility">Inflation Volatility (%)</label>
                        <NumberInput
                          id="field-mcInflationVolatility"
                          step="0.1"
                          min="0"
                          max="10"
                          className="form-input"
                          value={inputs.mcInflationVolatility}
                          onChange={(e) => updateInput('mcInflationVolatility', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                        />
                        <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>Standard deviation of one year&rsquo;s inflation. US CPI since 1990 has run about 1.5%; since 1928, closer to 4%.</span>
                      </div>
                      <div className="form-group">
                        <label htmlFor="field-mcInflationReturnCorrelation">Return Correlation</label>
                        <NumberInput
                          id="field-mcInflationReturnCorrelation"
                          step="0.05"
                          min="-1"
                          max="1"
                          className="form-input"
                          value={inputs.mcInflationReturnCorrelation}
                          onChange={(e) => updateInput('mcInflationReturnCorrelation', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                        />
                        <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>Between a year&rsquo;s return and its inflation, &minus;1 to 1. Negative means bad markets and high inflation tend to arrive together; 0 draws them independently.</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Longevity uncertainty in the Monte Carlo (changelog 248).
                    Off by default. Each trial draws an age at death per
                    person from the SSA period life table and runs to it. */}
                <div style={{ marginTop: '18px', borderTop: '1px solid var(--card-border)', paddingTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ maxWidth: '620px' }}>
                      <h4 style={{ fontSize: 'var(--fs-body)', fontWeight: '600', margin: '0 0 6px' }}>
                        <span id="label-mcLongevityEnabled">Longevity Uncertainty (Monte Carlo)</span>
                      </h4>
                      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0 }}>
                        Off, every trial runs to the Life Expectancy ages on the Household page exactly. On, each trial
                        draws an age at death for each of you from the Social Security Administration&rsquo;s period life
                        table (using the Sex setting there), and that trial&rsquo;s plan ends when its last person dies
                        &mdash; sometimes years before your planned horizon, sometimes well past it. Success then means
                        the money outlasted you. The percentile chart keeps your planned horizon as its width; the
                        result card reports how many trials ran past it.
                      </p>
                    </div>
                    <label className="custom-switch">
                      <input
                        id="toggle-mcLongevityEnabled"
                        type="checkbox"
                        checked={!!inputs.mcLongevityEnabled}
                        onChange={(e) => updateInput('mcLongevityEnabled', e.target.checked)}
                        aria-labelledby="label-mcLongevityEnabled"
                      />
                      <span className="slider-round"></span>
                    </label>
                  </div>
                </div>

                {/* Long-term care as a risk (changelog 266). */}
                <div style={{ marginTop: '18px', borderTop: '1px solid var(--card-border)', paddingTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ maxWidth: '620px' }}>
                      <h4 style={{ fontSize: 'var(--fs-body)', fontWeight: '600', margin: '0 0 6px' }}>
                        <span id="label-mcLtcEnabled">Long-Term Care Uncertainty (Monte Carlo)</span>
                      </h4>
                      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0 }}>
                        Off, the trials charge long-term care exactly as Healthcare &amp; LTC says: a fixed episode, or none.
                        On, each trial draws for each of you whether a paid-care episode happens at all (about 56% of people
                        turning 65 &mdash; women more often than men), how long it lasts (three years on average, one in five
                        beyond five), and when, placed in the last years of that trial&rsquo;s life, at the annual cost on
                        Healthcare &amp; LTC. The fixed episode is replaced in the trials; the main projection is untouched.
                      </p>
                    </div>
                    <label className="custom-switch">
                      <input
                        id="toggle-mcLtcEnabled"
                        type="checkbox"
                        checked={!!inputs.mcLtcEnabled}
                        onChange={(e) => updateInput('mcLtcEnabled', e.target.checked)}
                        aria-labelledby="label-mcLtcEnabled"
                      />
                      <span className="slider-round"></span>
                    </label>
                  </div>
                </div>
              </div>
    </>
  );
}
