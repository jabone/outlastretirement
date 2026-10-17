// DemographicsSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_demographics block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useSimulation } from '../../../context/useSimulation';
import { getPossessive } from '../getPossessive';
import { SEX_OPTIONS, horizonOdds } from '../../../utils/mortality';
import { TAX_YEAR, getFullRetirementAge, getSSMultiplier } from '../../../calculator';
import NumberInput from '../../NumberInput';
import SwitchRow from '../../SwitchRow';

export default function DemographicsSection() {
  const { inputs, updateInput } = useSimulation();
  // Age this plan year: a life expectancy at or below it leaves nothing to
  // project, so the field refuses it.
  const ageNow = (birthYear) => Math.max(0, (Number(inputs.planYear) || TAX_YEAR) - (Number(birthYear) || 0));
  return (
    <>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  Demographics
                </h3>
                
                <div className="form-group">
                  <label htmlFor="field-stateOfResidence">State of Residence</label>
                  <select id="field-stateOfResidence" className="form-input" value={inputs.stateOfResidence || 'TX'} onChange={(e) => updateInput('stateOfResidence', e.target.value)}>
                    <option value="AL">Alabama</option>
                    <option value="AK">Alaska</option>
                    <option value="AZ">Arizona</option>
                    <option value="AR">Arkansas</option>
                    <option value="CA">California</option>
                    <option value="CO">Colorado</option>
                    <option value="CT">Connecticut</option>
                    <option value="DE">Delaware</option>
                    <option value="DC">District of Columbia</option>
                    <option value="FL">Florida</option>
                    <option value="GA">Georgia</option>
                    <option value="HI">Hawaii</option>
                    <option value="ID">Idaho</option>
                    <option value="IL">Illinois</option>
                    <option value="IN">Indiana</option>
                    <option value="IA">Iowa</option>
                    <option value="KS">Kansas</option>
                    <option value="KY">Kentucky</option>
                    <option value="LA">Louisiana</option>
                    <option value="ME">Maine</option>
                    <option value="MD">Maryland</option>
                    <option value="MA">Massachusetts</option>
                    <option value="MI">Michigan</option>
                    <option value="MN">Minnesota</option>
                    <option value="MS">Mississippi</option>
                    <option value="MO">Missouri</option>
                    <option value="MT">Montana</option>
                    <option value="NE">Nebraska</option>
                    <option value="NV">Nevada</option>
                    <option value="NH">New Hampshire</option>
                    <option value="NJ">New Jersey</option>
                    <option value="NM">New Mexico</option>
                    <option value="NY">New York</option>
                    <option value="NC">North Carolina</option>
                    <option value="ND">North Dakota</option>
                    <option value="OH">Ohio</option>
                    <option value="OK">Oklahoma</option>
                    <option value="OR">Oregon</option>
                    <option value="PA">Pennsylvania</option>
                    <option value="RI">Rhode Island</option>
                    <option value="SC">South Carolina</option>
                    <option value="SD">South Dakota</option>
                    <option value="TN">Tennessee</option>
                    <option value="TX">Texas</option>
                    <option value="UT">Utah</option>
                    <option value="VT">Vermont</option>
                    <option value="VA">Virginia</option>
                    <option value="WA">Washington</option>
                    <option value="WV">West Virginia</option>
                    <option value="WI">Wisconsin</option>
                    <option value="WY">Wyoming</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="field-spouse1Name">Your Name</label>
                  <input id="field-spouse1Name" type="text" className="form-input" placeholder="Primary" aria-describedby="field-spouse1Name-help" value={inputs.spouse1Name || ''} onChange={(e) => updateInput('spouse1Name', e.target.value)} />
                  <span id="field-spouse1Name-help" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    Optional. It only labels your screens and printouts and stays on this device; left blank, the plan says Primary.
                  </span>
                </div>
                <div className="form-group">
                  <label htmlFor="field-birthYear1">{getPossessive(inputs.spouse1Name || 'Primary')} Birth Year</label>
                  <NumberInput id="field-birthYear1" min="1926" max="2008" className="form-input" value={inputs.birthYear1} onChange={(e) => updateInput('birthYear1', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                </div>
                <div className="form-group">
                  <label htmlFor="field-retireAge1">{getPossessive(inputs.spouse1Name || 'Primary')} Retirement Age</label>
                  <NumberInput id="field-retireAge1" min="40" max="90" className="form-input" value={inputs.retireAge1} onChange={(e) => updateInput('retireAge1', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                </div>
<div className="form-group">
                  <label htmlFor="field-sex1">{getPossessive(inputs.spouse1Name || 'Primary')} Sex</label>
                  <select id="field-sex1" className="form-input" value={inputs.sex1 || 'unstated'} onChange={(e) => updateInput('sex1', e.target.value)}>
                    {SEX_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    Only used for the life-table odds below and the Monte Carlo&rsquo;s longevity option. Not stated blends the two curves.
                  </span>
                </div>
                <div className="form-group">
                  <label htmlFor="field-lifeExpectancy1">{getPossessive(inputs.spouse1Name || 'Primary')} Life Expectancy</label>
                  <NumberInput id="field-lifeExpectancy1" kind="age" min={ageNow(inputs.birthYear1) + 1} max="120" message={`Enter an age above ${ageNow(inputs.birthYear1)} (the age this year) and no more than 120.`} className="form-input" value={inputs.lifeExpectancy1} onChange={(e) => updateInput('lifeExpectancy1', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                  {Number(inputs.lifeExpectancy1) > 0 && Number(inputs.lifeExpectancy1) <= ageNow(inputs.birthYear1) && (
                    <span id="field-lifeExpectancy1-cross" className="field-error" role="alert">
                      Life expectancy has to be above the age this year ({ageNow(inputs.birthYear1)}), or there is nothing to project. Raise it or correct the birth year.
                    </span>
                  )}
                  {inputs.lifeExpectancy1 !== '' && inputs.retireAge1 !== '' && inputs.lifeExpectancy1 < inputs.retireAge1 && (
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', display: 'block', marginTop: '4px' }}>
                      <AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> Life expectancy is younger than retirement age — this plan would model zero years in retirement.
                    </span>
                  )}
                  {(() => {
                    const odds = horizonOdds({ sex: inputs.sex1, currentAge: (Number(inputs.planYear) || TAX_YEAR) - (Number(inputs.birthYear1) || 0), planToAge: inputs.lifeExpectancy1 });
                    if (!(odds.currentAge > 0) || !(odds.planToAge > odds.currentAge)) return null;
                    return (
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        SSA table odds for a {inputs.sex1 === 'male' ? 'man' : inputs.sex1 === 'female' ? 'woman' : 'person'} of {odds.currentAge}: <strong>{Math.round(odds.reachPlanTo * 100)}%</strong> reach {odds.planToAge};
                        half reach {odds.median}, one in four reach {odds.oneInFour}, one in ten reach {odds.oneInTen}. Healthier and wealthier than average runs a few years better.
                      </span>
                    );
                  })()}
                </div>
                <div className="form-group">
                  <label htmlFor="field-claimingAge1">{getPossessive(inputs.spouse1Name || 'Primary')} SS Claiming Age (62-70)</label>
                  <NumberInput id="field-claimingAge1" min="62" max="70" className="form-input" value={inputs.claimingAge1} onChange={(e) => updateInput('claimingAge1', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    Benefit multiplier: {(getSSMultiplier(inputs.claimingAge1, getFullRetirementAge(inputs.birthYear1))*100).toFixed(0)}% of FRA baseline. Check estimates on <a href="https://www.ssa.gov" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)', textDecoration: 'underline' }}>ssa.gov</a>.
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '20px 0 10px 0' }}>
                  <label htmlFor="toggle-spouse2Enabled" style={{ fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Planning with a spouse or partner?</label>
                  <span className="custom-switch">
                    <input id="toggle-spouse2Enabled" type="checkbox" checked={inputs.spouse2Enabled} onChange={(e) => {
                      // Keep filing status coherent the way the Interview and
                      // the setup wizard do: a lone filer can't be MFJ/MFS,
                      // and a new spouse defaults to joint (MFS stays MFS).
                      updateInput('spouse2Enabled', e.target.checked);
                      if (!e.target.checked) updateInput('filingStatus', 'Single');
                      else if (inputs.filingStatus === 'Single') updateInput('filingStatus', 'MFJ');
                    }} />
                    <span className="slider-round"></span>
                  </span>
                </div>

                {inputs.spouse2Enabled && (
                  <div style={{ borderLeft: '3px solid var(--accent-primary)', paddingLeft: '16px', marginTop: '10px' }}>
                    <div className="form-group">
                      <label htmlFor="field-spouse2Name">Spouse's Name</label>
                      <input id="field-spouse2Name" type="text" className="form-input" placeholder="Spouse" value={inputs.spouse2Name || ''} onChange={(e) => updateInput('spouse2Name', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-birthYear2">{getPossessive(inputs.spouse2Name || 'Spouse')} Birth Year</label>
                      <NumberInput id="field-birthYear2" min="1926" max="2008" className="form-input" value={inputs.birthYear2} onChange={(e) => updateInput('birthYear2', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-retireAge2">{getPossessive(inputs.spouse2Name || 'Spouse')} Retirement Age</label>
                      <NumberInput id="field-retireAge2" min="40" max="90" className="form-input" value={inputs.retireAge2} onChange={(e) => updateInput('retireAge2', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                    </div>
    <div className="form-group">
                  <label htmlFor="field-sex2">{getPossessive(inputs.spouse2Name || 'Spouse')} Sex</label>
                  <select id="field-sex2" className="form-input" value={inputs.sex2 || 'unstated'} onChange={(e) => updateInput('sex2', e.target.value)}>
                    {SEX_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    Only used for the life-table odds below and the Monte Carlo&rsquo;s longevity option. Not stated blends the two curves.
                  </span>
                </div>
                <div className="form-group">
                      <label htmlFor="field-lifeExpectancy2">{getPossessive(inputs.spouse2Name || 'Spouse')} Life Expectancy</label>
                      <NumberInput id="field-lifeExpectancy2" kind="age" min={ageNow(inputs.birthYear2) + 1} max="120" message={`Enter an age above ${ageNow(inputs.birthYear2)} (the age this year) and no more than 120.`} className="form-input" value={inputs.lifeExpectancy2} onChange={(e) => updateInput('lifeExpectancy2', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                      {Number(inputs.lifeExpectancy2) > 0 && Number(inputs.lifeExpectancy2) <= ageNow(inputs.birthYear2) && (
                        <span id="field-lifeExpectancy2-cross" className="field-error" role="alert">
                          Life expectancy has to be above the age this year ({ageNow(inputs.birthYear2)}), or there is nothing to project. Raise it or correct the birth year.
                        </span>
                      )}
                      {inputs.lifeExpectancy2 !== '' && inputs.retireAge2 !== '' && inputs.lifeExpectancy2 < inputs.retireAge2 && (
                        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', display: 'block', marginTop: '4px' }}>
                          <AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> Life expectancy is younger than retirement age — this plan would model zero years in retirement.
                        </span>
                      )}
                      {(() => {
                    const odds = horizonOdds({ sex: inputs.sex2, currentAge: (Number(inputs.planYear) || TAX_YEAR) - (Number(inputs.birthYear2) || 0), planToAge: inputs.lifeExpectancy2 });
                    if (!(odds.currentAge > 0) || !(odds.planToAge > odds.currentAge)) return null;
                    return (
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        SSA table odds for a {inputs.sex2 === 'male' ? 'man' : inputs.sex2 === 'female' ? 'woman' : 'person'} of {odds.currentAge}: <strong>{Math.round(odds.reachPlanTo * 100)}%</strong> reach {odds.planToAge};
                        half reach {odds.median}, one in four reach {odds.oneInFour}, one in ten reach {odds.oneInTen}. Healthier and wealthier than average runs a few years better.
                      </span>
                    );
                  })()}
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-claimingAge2">{getPossessive(inputs.spouse2Name || 'Spouse')} SS Claiming Age (62-70)</label>
                      <NumberInput id="field-claimingAge2" min="62" max="70" className="form-input" value={inputs.claimingAge2} onChange={(e) => updateInput('claimingAge2', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        Benefit multiplier: {(getSSMultiplier(inputs.claimingAge2, getFullRetirementAge(inputs.birthYear2))*100).toFixed(0)}% of FRA baseline. Check estimates on <a href="https://www.ssa.gov" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)', textDecoration: 'underline' }}>ssa.gov</a>.
                      </span>
                    </div>
                  </div>
                )}

                {inputs.spouse2Enabled && (
                  <div style={{ marginTop: '24px', padding: '16px', borderRadius: '10px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--card-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <h4 id="toggle-survivorStressEnabled-label" style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--accent-text)' }}><AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> Survivor Stress Test</h4>
                      <label className="custom-switch">
                        <input type="checkbox" checked={inputs.survivorStressEnabled || false} onChange={(e) => updateInput('survivorStressEnabled', e.target.checked)} aria-labelledby="toggle-survivorStressEnabled-label" />
                        <span className="slider-round"></span>
                      </label>
                    </div>
                    <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>
                      Models the "Widow's Penalty": standard deduction halves, tax brackets shift to Single, SS drops to the single highest check, and household expenses drop.
                    </p>
                    
                    {inputs.survivorStressEnabled && (
                      <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: '12px' }}>
                        <div className="form-group">
                          <label htmlFor="field-survivorStressSpouse">Who passes away prematurely?</label>
                          <select id="field-survivorStressSpouse" 
                            className="form-input" 
                            value={inputs.survivorStressSpouse || 1} 
                            onChange={(e) => updateInput('survivorStressSpouse', (e.target.value === '' ? '' : parseInt(e.target.value)))}
                          >
                            <option value={1}>{inputs.spouse1Name || 'Primary'}</option>
                            <option value={2}>{inputs.spouse2Name || 'Spouse'}</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-survivorStressAge">Age they pass away</label>
                          <NumberInput id="field-survivorStressAge"
                            min="30"
                            max="110"
                            className="form-input"
                            value={inputs.survivorStressAge || 75}
                            onChange={(e) => updateInput('survivorStressAge', (e.target.value === '' ? '' : parseInt(e.target.value)))}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-survivorExpenseDropPct">Household Expense Reduction (%)</label>
                          <NumberInput id="field-survivorExpenseDropPct"
                            min="0"
                            max="100"
                            className="form-input"
                            value={inputs.survivorExpenseDropPct !== undefined ? inputs.survivorExpenseDropPct : 20}
                            onChange={(e) => updateInput('survivorExpenseDropPct', (e.target.value === '' ? '' : parseInt(e.target.value)))}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}


                {/* Filing Status. Moved here from "Granular Inflation
                    Assumptions" on 2026-08-20, where IA_REVIEW.md had
                    flagged it as misfiled and the Phase 3 regroup missed
                    it. It is a household fact — who is on the return --
                    not an inflation assumption, and it belongs next to the
                    spouse toggle that drives it. */}
                
                <div className="form-group">
                  <label htmlFor="field-filingStatus">Filing Status</label>
                  <select id="field-filingStatus" className="form-input form-input-select" value={inputs.filingStatus} onChange={(e) => updateInput('filingStatus', e.target.value)}>
                    <option value="MFJ">Married Filing Jointly (MFJ)</option>
                    <option value="MFS">Married Filing Separately (MFS)</option>
                    <option value="Single">Single filer / Widowed</option>
                  </select>
                  {inputs.filingStatus === 'MFS' && (
                    <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                      Usually the more expensive choice. It exists for specific reasons &mdash; large medical bills on
                      the lower earner, income-driven student loan repayment, or keeping tax liability separate.
                    </span>
                  )}
                </div>

                {/* One question, and it changes three different rules --
                    which is why it gets its own control rather than being
                    folded into the status. Living apart for the entire year
                    is treated as Single for Social Security's base amount,
                    the Roth phase-out and the IRMAA schedule; living
                    together at any point triggers the punitive versions of
                    all three. */}
                {inputs.filingStatus === 'MFS' && (
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <SwitchRow id="toggle-mfsLivedWithSpouse" checked={inputs.mfsLivedWithSpouse} onChange={(v) => updateInput('mfsLivedWithSpouse', v)}>Lived with your spouse at any point during the year</SwitchRow>
                    {/* Audit Q-1 (changelog 127): two returns, not one. Only
                        meaningful when the plan actually has two spouses --
                        with one person there is only one return to file. */}
                    {inputs.spouse2Enabled && (
                      <div className="form-group" style={{ marginTop: '10px' }}>
                        <label htmlFor="field-mfsIncomeSplitPct">Separate-Return Income Split (% on the first return)</label>
                        <NumberInput
                          id="field-mfsIncomeSplitPct" min="0" max="100" className="form-input"
                          value={inputs.mfsIncomeSplitPct !== undefined ? inputs.mfsIncomeSplitPct : 50}
                          onChange={(e) => updateInput('mfsIncomeSplitPct', (e.target.value === '' ? '' : parseFloat(e.target.value)))}
                        />
                        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                          Filing separately means two returns. 50 splits the household&rsquo;s taxable income evenly
                          between them &mdash; the usual planning assumption. Move it to 100 for a genuine one-earner
                          couple, where everything lands on a single return.
                        </p>
                      </div>
                    )}
                    {inputs.mfsLivedWithSpouse ? (
                      <div style={{
                        marginTop: '10px', padding: '10px 12px', borderRadius: '6px',
                        border: '1px solid rgba(234,179,8,0.25)', backgroundColor: 'rgba(234,179,8,0.06)',
                        fontSize: 'var(--fs-xs)', lineHeight: 1.6, color: 'var(--text-secondary)',
                      }}>
                        <strong style={{ color: 'var(--warning)' }}>This is the expensive combination.</strong> Filing separately
                        while living together means <strong>Social Security benefits have a $0 exempt amount</strong> &mdash;
                        they start being taxed against your first dollar of other income, where every other status gets
                        $25,000 or $32,000 first. Roth IRA contributions also phase out between $0 and $10,000 of income,
                        so in practice they&rsquo;re unavailable, and Medicare&rsquo;s surcharge jumps straight to its
                        second-highest tier above $109,000 instead of stepping up gradually.
                      </div>
                    ) : (
                      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                        Living apart for the whole year is treated as a single filer for Social Security taxation, the
                        Roth phase-out and Medicare surcharges &mdash; the harshest MFS rules don&rsquo;t apply.
                      </span>
                    )}
                  </div>
                )}
    </>
  );
}
