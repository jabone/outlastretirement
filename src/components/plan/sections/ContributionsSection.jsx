// ContributionsSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_contributions block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useSimulation } from '../../../context/useSimulation';
import { getPossessive } from '../getPossessive';
import CommaNumberInput from '../../CommaNumberInput';
import Tooltip from '../../Tooltip';
import { getElectiveDeferralLimit, getHSAContributionLimit, getIRAContributionLimit, getMaxContributionSplit } from '../../../calculator';
import NumberInput from '../../NumberInput';

export default function ContributionsSection() {
  const { inputs, updateInput } = useSimulation();
  return (
    <>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  Annual Savings Contribution Limits (Working years)
                </h3>
                {(() => {
                  // Each spouse now has their own Pre-Tax/Roth fields
                  // (preTaxContribution1/2, rothContribution1/2) instead of
                  // one shared amount silently applied to both -- two working
                  // spouses very often save different dollar amounts to their
                  // own 401(k)s. Auto-Max disables just that spouse's own
                  // field (matching the Employer Match section's pattern)
                  // and shows the actual current-year $ figure it's computing
                  // instead of the manual amount, rather than a vague "this
                  // is locked" note with no number attached.
                  const currentYear = inputs.planYear;
                  const noteStyle = { fontSize: 'var(--fs-xs)', opacity: 0.75, display: 'block', marginTop: '4px', lineHeight: '1.5' };
                  // 'max' mode splits the deferral via the same exported
                  // engine helper the projection uses, so the numbers shown
                  // here are exactly what gets projected (current-year
                  // dollars; RSU vests are approximated out of the wage
                  // test here, matching the Contribution Advisor).
                  const maxSplitFor = (birthYear, salary) => getMaxContributionSplit(currentYear - (Number(birthYear) || 1980), Math.max(0, salary || 0));
                  const autoMaxLimit = (mode, birthYear) => {
                    if (mode === 'off' || !mode) return null;
                    const age = currentYear - (Number(birthYear) || 1980);
                    return mode === '401k' || mode === 'max' ? getElectiveDeferralLimit(age) : getIRAContributionLimit(age);
                  };
                  const autoMaxNote = (mode, birthYear, salary) => {
                    if (mode === 'max') {
                      const split = maxSplitFor(birthYear, salary);
                      return (
                        <span style={noteStyle}>
                          Contribute the Max is computing ${split.preTax.toLocaleString()}/yr Pre-Tax here ({currentYear} limit{split.mandatoryRothCatchup ? `; the $${split.roth.toLocaleString()} age-based catch-up goes to Roth below because SECURE 2.0 requires it at this income` : ', including this person’s age-based catch-up'}), plus a Backdoor Roth IRA and the household HSA maximum — see the notes on those fields. Everything grows with inflation and this person’s age in future years.
                        </span>
                      );
                    }
                    if (mode === '401k') {
                      // Same split the engine uses in this mode: above the
                      // SECURE 2.0 wage threshold the age-50+ catch-up goes
                      // in as Roth, on top of the Roth amount below.
                      const split = maxSplitFor(birthYear, salary);
                      return (
                        <span style={noteStyle} data-testid="automax-401k-note">
                          Auto-Max is currently computing ${split.preTax.toLocaleString()}/yr Pre-Tax ({currentYear} limit) instead of the amount above
                          {split.mandatoryRothCatchup
                            ? `; the $${split.roth.toLocaleString()} age-based catch-up is added to the Roth amount below because SECURE 2.0 requires it as Roth at this income.`
                            : '.'}
                          {' '}This grows with inflation and this person&rsquo;s own age-based catch-up eligibility in future years.
                        </span>
                      );
                    }
                    const limit = autoMaxLimit(mode, birthYear);
                    if (limit === null) return null;
                    return (
                      <span style={noteStyle}>
                        Auto-Max is currently computing ${limit.toLocaleString()}/yr ({currentYear} limit) instead of the amount above. This grows with inflation and this person's own age-based catch-up eligibility in future years.
                      </span>
                    );
                  };
                  const maxRothNote = (mode, birthYear, salary) => {
                    if (mode === '401k') {
                      const split = maxSplitFor(birthYear, salary);
                      if (!split.mandatoryRothCatchup) return null;
                      return (
                        <span style={noteStyle}>
                          {`Auto-Max adds this person’s $${split.roth.toLocaleString()} catch-up to the amount above as Roth (SECURE 2.0 mandatory Roth catch-up at this income).`}
                        </span>
                      );
                    }
                    if (mode !== 'max') return null;
                    const split = maxSplitFor(birthYear, salary);
                    return (
                      <span style={noteStyle}>
                        {split.roth > 0
                          ? `Contribute the Max is directing this person’s $${split.roth.toLocaleString()} catch-up here as Roth (SECURE 2.0 mandatory Roth catch-up at this income) instead of the amount above.`
                          : 'Contribute the Max is computing $0/yr Roth 401(k) here — the whole deferral fits in Pre-Tax at this age/income. The Roth IRA piece rides separately as a backdoor contribution (see Roth Conversions → Backdoor Roth).'}
                      </span>
                    );
                  };
                  return (
                    <>
                      <div className="form-group">
                        <label htmlFor="field-preTaxContribution1">Pre-Tax Savings{inputs.spouse2Enabled ? ` (${inputs.spouse1Name || 'Primary'})` : ''} ($/yr)</label>
                        <CommaNumberInput id="field-preTaxContribution1" value={inputs.preTaxContribution1} onChange={(val) => updateInput('preTaxContribution1', val)} disabled={inputs.autoMaxContribution1 !== 'off'} />
                        {autoMaxNote(inputs.autoMaxContribution1, inputs.birthYear1, inputs.salary1)}
                      </div>
                      <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <label htmlFor="field-autoMaxContribution1" style={{ fontSize: '14px', flex: 1 }}>
                          <Tooltip text="Sets this spouse's Pre-Tax saving to the IRS limit for the chosen account type each year, catch-ups included, growing with inflation. Contribute the Max adds a backdoor Roth IRA and the HSA maximum." more="Auto-Max">
                            Auto-Max Contribution{inputs.spouse2Enabled ? ` (${inputs.spouse1Name || 'Primary'})` : ''}
                          </Tooltip>
                        </label>
                        <select id="field-autoMaxContribution1" className="form-input form-input-select" style={{ flex: 1 }} value={inputs.autoMaxContribution1 || 'off'} onChange={(e) => updateInput('autoMaxContribution1', e.target.value)}>
                          <option value="off">Off (use $/yr above)</option>
                          <option value="401k">Max to 401(k)/403(b)/Gov Plan Limit</option>
                          <option value="ira">Max to Traditional/Roth IRA Limit</option>
                          <option value="max">Contribute the Max (401k + IRA + HSA)</option>
                        </select>
                      </div>
                      {inputs.spouse2Enabled && (
                        <>
                          <div className="form-group" style={{ borderLeft: '2.5px solid var(--series-3)', paddingLeft: '12px', marginTop: '16px' }}>
                            <label htmlFor="field-preTaxContribution2">Pre-Tax Savings ({inputs.spouse2Name || 'Spouse'}) ($/yr)</label>
                            <CommaNumberInput id="field-preTaxContribution2" value={inputs.preTaxContribution2} onChange={(val) => updateInput('preTaxContribution2', val)} disabled={inputs.autoMaxContribution2 !== 'off'} />
                            {autoMaxNote(inputs.autoMaxContribution2, inputs.birthYear2, inputs.salary2)}
                          </div>
                          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <label htmlFor="field-autoMaxContribution2" style={{ fontSize: '14px', flex: 1 }}>Auto-Max Contribution ({inputs.spouse2Name || 'Spouse'})</label>
                            <select id="field-autoMaxContribution2" className="form-input form-input-select" style={{ flex: 1 }} value={inputs.autoMaxContribution2 || 'off'} onChange={(e) => updateInput('autoMaxContribution2', e.target.value)}>
                              <option value="off">Off (use $/yr above)</option>
                              <option value="401k">Max to 401(k)/403(b)/Gov Plan Limit</option>
                              <option value="ira">Max to Traditional/Roth IRA Limit</option>
                              <option value="max">Contribute the Max (401k + IRA + HSA)</option>
                            </select>
                          </div>
                        </>
                      )}
                      <div className="form-group" style={{ marginTop: '16px' }}>
                        <label htmlFor="field-rothContribution1">Roth Savings{inputs.spouse2Enabled ? ` (${inputs.spouse1Name || 'Primary'})` : ''} ($/yr)</label>
                        <CommaNumberInput id="field-rothContribution1" value={inputs.rothContribution1} onChange={(val) => updateInput('rothContribution1', val)} disabled={inputs.autoMaxContribution1 === 'max'} />
                        {maxRothNote(inputs.autoMaxContribution1, inputs.birthYear1, inputs.salary1)}
                      </div>
                      {inputs.spouse2Enabled && (
                        <div className="form-group" style={{ borderLeft: '2.5px solid var(--series-3)', paddingLeft: '12px' }}>
                          <label htmlFor="field-rothContribution2">Roth Savings ({inputs.spouse2Name || 'Spouse'}) ($/yr)</label>
                          <CommaNumberInput id="field-rothContribution2" value={inputs.rothContribution2} onChange={(val) => updateInput('rothContribution2', val)} disabled={inputs.autoMaxContribution2 === 'max'} />
                          {maxRothNote(inputs.autoMaxContribution2, inputs.birthYear2, inputs.salary2)}
                        </div>
                      )}
                    </>
                  );
                })()}

                <div className="form-group" style={{ borderLeft: '2.5px solid var(--series-3)', paddingLeft: '12px', marginTop: '16px' }}>
                  <label htmlFor="field-employerMatchMode1" style={{ fontWeight: '500' }}>
                    <Tooltip text="Flat $ Amount is a dollar figure inflated forward. Percent-Based Formula models your employer's actual match rule so it scales with your contributions and the IRS limit each year." more="Employer Match Type">
                      Employer Match Type{inputs.spouse2Enabled ? ` (${inputs.spouse1Name || 'Primary'})` : ''}
                    </Tooltip>
                  </label>
                  <select id="field-employerMatchMode1" className="form-input form-input-select" value={inputs.employerMatchMode1 || 'flat'} onChange={(e) => updateInput('employerMatchMode1', e.target.value)}>
                    <option value="flat">Flat $ Amount</option>
                    <option value="percent">Percent-Based Formula</option>
                  </select>
                  {inputs.employerMatchMode1 !== 'percent' ? (
                    <>
                      <label htmlFor="field-employerMatch1" style={{ fontSize: 'var(--fs-xs)', marginTop: '10px', display: 'block' }}>Employer Match ($/yr)</label>
                      <CommaNumberInput id="field-employerMatch1" value={inputs.employerMatch1} onChange={(val) => updateInput('employerMatch1', val)} />
                    </>
                  ) : (
                    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
                        <div>
                          <label htmlFor="field-employerMatchRateA1" style={{ fontSize: 'var(--fs-xs)' }}>Tier A: Match Rate (%)</label>
                          <NumberInput id="field-employerMatchRateA1" step="5" min="0" max="200" className="form-input" value={inputs.employerMatchRateA1} onChange={(e) => updateInput('employerMatchRateA1', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                        </div>
                        <div>
                          <label htmlFor="field-employerMatchCapAPct1" style={{ fontSize: 'var(--fs-xs)' }}>Tier A Cap (% of IRS deferral limit)</label>
                          <NumberInput id="field-employerMatchCapAPct1" step="5" min="0" max="100" className="form-input" value={inputs.employerMatchCapAPct1} onChange={(e) => updateInput('employerMatchCapAPct1', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <label htmlFor="toggle-employerMatchTierBEnabled1" style={{ fontSize: '14px', cursor: 'pointer' }}>Add a Second Tier</label>
                        <span className="custom-switch">
                          <input id="toggle-employerMatchTierBEnabled1" type="checkbox" checked={inputs.employerMatchTierBEnabled1} onChange={(e) => updateInput('employerMatchTierBEnabled1', e.target.checked)} />
                          <span className="slider-round"></span>
                        </span>
                      </div>
                      {inputs.employerMatchTierBEnabled1 && (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
                            <div>
                              <label htmlFor="field-employerMatchRateB1" style={{ fontSize: 'var(--fs-xs)' }}>Tier B: Match Rate (%)</label>
                              <NumberInput id="field-employerMatchRateB1" step="5" min="0" max="200" className="form-input" value={inputs.employerMatchRateB1} onChange={(e) => updateInput('employerMatchRateB1', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                            </div>
                            <div>
                              <label htmlFor="field-employerMatchCapB1" style={{ fontSize: 'var(--fs-xs)' }}>Tier B Cap ($, flat)</label>
                              <CommaNumberInput id="field-employerMatchCapB1" value={inputs.employerMatchCapB1} onChange={(val) => updateInput('employerMatchCapB1', val)} />
                            </div>
                          </div>
                          <div>
                            <label htmlFor="field-employerMatchCombine1" style={{ fontSize: 'var(--fs-xs)' }}>Combine Tiers As</label>
                            <select id="field-employerMatchCombine1" className="form-input form-input-select" value={inputs.employerMatchCombine1 || 'greaterOf'} onChange={(e) => updateInput('employerMatchCombine1', e.target.value)}>
                              <option value="greaterOf">Greater Of (whichever tier pays more)</option>
                              <option value="sumOfTiers">Sum Of Tiers (add both together)</option>
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {inputs.spouse2Enabled && (
                  <div className="form-group" style={{ borderLeft: '2.5px solid var(--series-3)', paddingLeft: '12px', marginTop: '16px' }}>
                    <label htmlFor="field-employerMatchMode2" style={{ fontWeight: '500' }}>Employer Match Type ({inputs.spouse2Name || 'Spouse'})</label>
                    <select id="field-employerMatchMode2" className="form-input form-input-select" value={inputs.employerMatchMode2 || 'flat'} onChange={(e) => updateInput('employerMatchMode2', e.target.value)}>
                      <option value="flat">Flat $ Amount</option>
                      <option value="percent">Percent-Based Formula</option>
                    </select>
                    {inputs.employerMatchMode2 !== 'percent' ? (
                      <>
                        <label htmlFor="field-employerMatch2" style={{ fontSize: 'var(--fs-xs)', marginTop: '10px', display: 'block' }}>Employer Match ($/yr)</label>
                        <CommaNumberInput id="field-employerMatch2" value={inputs.employerMatch2} onChange={(val) => updateInput('employerMatch2', val)} />
                      </>
                    ) : (
                      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
                          <div>
                            <label htmlFor="field-employerMatchRateA2" style={{ fontSize: 'var(--fs-xs)' }}>Tier A: Match Rate (%)</label>
                            <NumberInput id="field-employerMatchRateA2" step="5" min="0" max="200" className="form-input" value={inputs.employerMatchRateA2} onChange={(e) => updateInput('employerMatchRateA2', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                          </div>
                          <div>
                            <label htmlFor="field-employerMatchCapAPct2" style={{ fontSize: 'var(--fs-xs)' }}>Tier A Cap (% of IRS deferral limit)</label>
                            <NumberInput id="field-employerMatchCapAPct2" step="5" min="0" max="100" className="form-input" value={inputs.employerMatchCapAPct2} onChange={(e) => updateInput('employerMatchCapAPct2', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <label htmlFor="toggle-employerMatchTierBEnabled2" style={{ fontSize: '14px', cursor: 'pointer' }}>Add a Second Tier</label>
                          <span className="custom-switch">
                            <input id="toggle-employerMatchTierBEnabled2" type="checkbox" checked={inputs.employerMatchTierBEnabled2} onChange={(e) => updateInput('employerMatchTierBEnabled2', e.target.checked)} />
                            <span className="slider-round"></span>
                          </span>
                        </div>
                        {inputs.employerMatchTierBEnabled2 && (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px' }}>
                              <div>
                                <label htmlFor="field-employerMatchRateB2" style={{ fontSize: 'var(--fs-xs)' }}>Tier B: Match Rate (%)</label>
                                <NumberInput id="field-employerMatchRateB2" step="5" min="0" max="200" className="form-input" value={inputs.employerMatchRateB2} onChange={(e) => updateInput('employerMatchRateB2', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                              </div>
                              <div>
                                <label htmlFor="field-employerMatchCapB2" style={{ fontSize: 'var(--fs-xs)' }}>Tier B Cap ($, flat)</label>
                                <CommaNumberInput id="field-employerMatchCapB2" value={inputs.employerMatchCapB2} onChange={(val) => updateInput('employerMatchCapB2', val)} />
                              </div>
                            </div>
                            <div>
                              <label htmlFor="field-employerMatchCombine2" style={{ fontSize: 'var(--fs-xs)' }}>Combine Tiers As</label>
                              <select id="field-employerMatchCombine2" className="form-input form-input-select" value={inputs.employerMatchCombine2 || 'greaterOf'} onChange={(e) => updateInput('employerMatchCombine2', e.target.value)}>
                                <option value="greaterOf">Greater Of (whichever tier pays more)</option>
                                <option value="sumOfTiers">Sum Of Tiers (add both together)</option>
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="form-group" style={{ marginTop: '16px' }}>
                  <label htmlFor="field-hsaContribution">HSA Savings ($/yr, combined employer + employee)</label>
                  {(() => {
                    // Contribute-the-Max HSA override note: mirrors the
                    // engine's rule exactly -- any working 'max'-mode spouse
                    // under 65 maxes the single household HSA field; the
                    // 55+ catch-up keys off the oldest qualifying spouse.
                    const currentYear = inputs.planYear;
                    const qualifyingAges = [];
                    const age1Now = currentYear - (Number(inputs.birthYear1) || 1980);
                    const age2Now = currentYear - (Number(inputs.birthYear2) || 1982);
                    if (inputs.autoMaxContribution1 === 'max' && age1Now < inputs.retireAge1 && age1Now < 65) qualifyingAges.push(age1Now);
                    if (inputs.spouse2Enabled && inputs.autoMaxContribution2 === 'max' && age2Now < inputs.retireAge2 && age2Now < 65) qualifyingAges.push(age2Now);
                    const hsaMaxed = qualifyingAges.length > 0;
                    const hsaMaxAmount = hsaMaxed ? getHSAContributionLimit(Math.max(...qualifyingAges), !!inputs.hsaFamilyCoverage) : 0;
                    return (
                      <>
                        <CommaNumberInput id="field-hsaContribution" value={inputs.hsaContribution} onChange={(val) => updateInput('hsaContribution', val)} disabled={hsaMaxed} />
                        {hsaMaxed && (
                          <span style={{ fontSize: 'var(--fs-xs)', opacity: 0.75, display: 'block', marginTop: '4px', lineHeight: '1.5' }}>
                            Contribute the Max is setting the household HSA to ${hsaMaxAmount.toLocaleString()}/yr ({currentYear} {inputs.hsaFamilyCoverage ? 'family' : 'self-only'} limit{Math.max(...qualifyingAges) >= 55 ? ' incl. the age 55+ catch-up' : ''}) instead of the amount above, while a maxing spouse is working and under 65 (Medicare ends HSA eligibility). It grows with inflation in future years.
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0 16px' }}>
                  <label htmlFor="toggle-hsaFamilyCoverage" style={{ fontSize: '14px', cursor: 'pointer' }}>HDHP Coverage Tier is Family (vs. Self-Only)</label>
                  <span className="custom-switch">
                    <input id="toggle-hsaFamilyCoverage" type="checkbox" checked={inputs.hsaFamilyCoverage} onChange={(e) => updateInput('hsaFamilyCoverage', e.target.checked)} />
                    <span className="slider-round"></span>
                  </span>
                </div>
                {(() => {
                  if (!inputs.hsaContribution) return null;
                  // A 'max'-mode spouse overrides the manual HSA amount, so
                  // an over-limit warning about the ignored figure would
                  // only confuse.
                  if (inputs.autoMaxContribution1 === 'max' || (inputs.spouse2Enabled && inputs.autoMaxContribution2 === 'max')) return null;
                  const currentYear = inputs.planYear;
                  const age1Now = currentYear - (Number(inputs.birthYear1) || 1980);
                  const hsaLimit = getHSAContributionLimit(age1Now, inputs.hsaFamilyCoverage);
                  const hsaOver = (Number(inputs.hsaContribution) || 0) - hsaLimit;
                  if (hsaOver <= 0) return null;
                  return (
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', margin: '-8px 0 16px', lineHeight: '1.6' }}>
                      <AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> HSA Savings (${(Number(inputs.hsaContribution) || 0).toLocaleString()}/yr) exceeds the 2026 IRS HSA contribution limit of ${hsaLimit.toLocaleString()} ({inputs.hsaFamilyCoverage ? 'family' : 'self-only'} coverage{age1Now >= 55 ? ', including the age 55+ catch-up' : ''}) by ${hsaOver.toLocaleString()}.
                    </div>
                  );
                })()}
                {(() => {
                  // Pre-Tax + Roth Savings share one combined IRS elective-
                  // deferral cap, checked against each spouse's OWN
                  // contributions and OWN age-based limit now that each
                  // spouse has their own preTaxContribution1/2 and
                  // rothContribution1/2 fields.
                  const currentYear = inputs.planYear;
                  const combined1 = (Number(inputs.preTaxContribution1) || 0) + (Number(inputs.rothContribution1) || 0);
                  const age1Now = currentYear - (Number(inputs.birthYear1) || 1980);
                  const limit1 = getElectiveDeferralLimit(age1Now);
                  // 'max' mode overrides BOTH of that spouse's manual fields
                  // with an exactly-at-the-limit split, so warning about the
                  // ignored manual figures would only confuse.
                  const over1 = inputs.autoMaxContribution1 === 'max' ? 0 : combined1 - limit1;

                  let over2 = null, limit2 = null, combined2 = null, age2Now = null;
                  if (inputs.spouse2Enabled) {
                    combined2 = (Number(inputs.preTaxContribution2) || 0) + (Number(inputs.rothContribution2) || 0);
                    age2Now = currentYear - (Number(inputs.birthYear2) || 1982);
                    limit2 = getElectiveDeferralLimit(age2Now);
                    over2 = inputs.autoMaxContribution2 === 'max' ? 0 : combined2 - limit2;
                  }

                  const warnings = [];
                  if (over1 > 0) {
                    warnings.push(`${getPossessive(inputs.spouse1Name || 'Primary')} combined Pre-Tax + Roth savings ($${combined1.toLocaleString()}/yr) exceeds the 2026 IRS elective deferral limit of $${limit1.toLocaleString()} for age ${age1Now} by $${over1.toLocaleString()}.`);
                  }
                  if (over2 !== null && over2 > 0) {
                    warnings.push(`${getPossessive(inputs.spouse2Name || 'Spouse')} combined Pre-Tax + Roth savings ($${combined2.toLocaleString()}/yr) exceeds the 2026 IRS elective deferral limit of $${limit2.toLocaleString()} for age ${age2Now} by $${over2.toLocaleString()}.`);
                  }

                  if (warnings.length === 0) return null;
                  return (
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', margin: '-8px 0 16px', lineHeight: '1.6' }}>
                      {warnings.map((w, i) => <div key={i}><AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> {w}</div>)}
                      <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                        This is the 401(k)/403(b)/457-style limit (the most generous account type available); a Traditional or Roth IRA limit for 2026 is much lower, ${getIRAContributionLimit(50).toLocaleString()} max even with the 50+ catch-up.
                      </div>
                    </div>
                  );
                })()}
                <div className="form-group">
                  <label htmlFor="field-taxableContribution">Taxable Brokerage Savings ($/yr)</label>
                  <CommaNumberInput id="field-taxableContribution" value={inputs.taxableContribution} onChange={(val) => updateInput('taxableContribution', val === '' ? '' : Math.round(val))} />
                </div>

                <div className="section-subtitle" style={{ marginTop: '24px' }}>
                  Pre-Retirement Deficit Strategy
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  If your living expenses, taxes, and savings exceed your salary, how should the engine balance your budget to avoid drawing down your portfolio?
                </div>
                <div className="form-group">
                  <label htmlFor="field-deficitReductionStrategy">If Working-Years Income Falls Short</label>
                  <select id="field-deficitReductionStrategy" className="form-input form-input-select" value={inputs.deficitReductionStrategy || 'reduceTaxableFirst'} onChange={(e) => updateInput('deficitReductionStrategy', e.target.value)}>
                    <option value="reduceTaxableFirst">Reduce All Savings First, Then Lifestyle</option>
                    <option value="reduceLifestyleFirst">Reduce Taxable Savings, Then Lifestyle, Then Pre-Tax/Roth</option>
                    <option value="reduceLifestyleAbsoluteFirst">Reduce Lifestyle First, Then All Savings</option>
                  </select>
                </div>
              </div>
    </>
  );
}
