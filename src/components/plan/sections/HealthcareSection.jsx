// HealthcareSection -- the pre-Medicare healthcare bridge, employer-plan Medicare deferral, HSA premium rule, and long-term care.
// Split out of SpecialExpensesSection in IA Phase 3 step 2 (2026-09-24) so the
// guided Interview can mount it on its own step. JSX unchanged.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { getPossessive } from '../getPossessive';
import { ledgerBadgeFor } from '../ledgerBadgeFor';
import Tooltip from '../../Tooltip';
import NumberInput from '../../NumberInput';

export default function HealthcareSection() {
  const { inputs, updateInput } = useSimulation();
  const { ledgerOwns, ledgerBadge } = ledgerBadgeFor(inputs);
  return (
    <>
                <div className="form-group">
                  <label htmlFor="field-healthcareBridgeCost">Healthcare Bridge Cost ($/yr per person under 65){ledgerBadge('healthcareBridgeCost')}</label>
                  <NumberInput id="field-healthcareBridgeCost" min="0" className="form-input" disabled={ledgerOwns('healthcareBridgeCost')} value={inputs.healthcareBridgeCost} onChange={(e) => updateInput('healthcareBridgeCost', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                  {ledgerOwns('healthcareBridgeCost') && (
                    <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                      From your &ldquo;Health coverage before 65&rdquo; line. Unlink it on the ledger in Spending to type your own.
                    </span>
                  )}
                </div>

                {/* Changelog 467: what Medicare leaves to you. Part B and
                    Part D premiums are computed; this is the rest. */}
                <div className="form-group">
                  <label htmlFor="field-medicareSupplementCost">
                    <Tooltip text="Everything Medicare leaves to you after 65, per person per year in today's dollars: a Medigap or Advantage premium, dental, vision, hearing and out-of-pocket costs. Part B and Part D premiums are computed separately. Set 0 if your spending figure already includes these." more="Medicare supplement and out-of-pocket">
                      Medicare Supplement and Out-of-Pocket ($/yr per person on Medicare)
                    </Tooltip>
                  </label>
                  <NumberInput id="field-medicareSupplementCost" min="0" step="500" className="form-input" value={inputs.medicareSupplementCost} onChange={(e) => updateInput('medicareSupplementCost', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                    Part B and Part D premiums, with any surcharge, are added separately. Many retirees spend $4,000 to $6,000 a year on the rest.
                  </span>
                </div>

                {/* Delaying Medicare on a current employer's plan (changelog
                    241). Off by default: it is only safe with an employer of
                    20 or more employees, which the plan cannot know. Moved
                    here from Taxes & Roth in changelog 243 — it sat inside
                    the Roth Conversion section, collapsed, where nobody
                    looking for a Medicare setting would open it. It belongs
                    with the other health costs. */}
                <div data-testid="medicare-employer-coverage" style={{ margin: '15px 0', padding: '14px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'var(--bg-secondary)' }}>
                  <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '600', marginBottom: '6px' }}>
                    <Tooltip text="Someone covered by an employer plan through current work can delay Medicare without penalty. With this set, no Medicare premium or IRMAA is charged until that job ends." more="employer plan">
                      Medicare while still on an employer plan
                    </Tooltip>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {[1, 2].filter((who) => who === 1 || inputs.spouse2Enabled).map((who) => {
                      const name = (who === 1 ? inputs.spouse1Name : inputs.spouse2Name) || (who === 1 ? 'Primary' : 'Spouse');
                      const other = (who === 1 ? inputs.spouse2Name : inputs.spouse1Name) || (who === 1 ? 'Spouse' : 'Primary');
                      const key = `medicareEmployerCoverage${who}`;
                      return (
                        <div key={who} className="form-group" style={{ flex: '1 1 240px', marginBottom: 0 }}>
                          <label htmlFor={`field-${key}`} style={{ fontSize: 'var(--fs-sm)' }}>{name}</label>
                          <select id={`field-${key}`} className="form-input" value={inputs[key] || 'none'} onChange={(e) => updateInput(key, e.target.value)}>
                            <option value="none">Enroll at 65</option>
                            <option value="own">Delay: covered through {name === 'Primary' || name === 'Spouse' ? 'own' : `${getPossessive(name)} own`} job</option>
                            {inputs.spouse2Enabled && <option value="spouse">Delay: covered through {getPossessive(other)} job</option>}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  <span style={{ fontSize: 'var(--fs-xs)', opacity: 0.7, display: 'block', marginTop: '6px' }}>
                    Only with an employer of 20 or more employees: below that, Medicare pays first at 65 and delaying Part B
                    brings a lifetime penalty. Enrolling in any part of Medicare &mdash; including Part A, which claiming
                    Social Security starts automatically &mdash; ends contributions to an HSA. The first premiums after the job
                    ends are priced on income from two years earlier, which is what the Form SSA-44 appeal (Taxes &amp; Roth) is for.
                  </span>
                </div>

                {/* IRS Pub. 969: an HSA cannot pay health-insurance premiums
                    before 65 (COBRA and unemployment-period coverage aside),
                    so only the out-of-pocket share of the bridge is a
                    qualified expense. Splitting the bridge is what stops the
                    HSA silently paying the whole premium tax-free. */}
                <div className="form-group">
                  <label htmlFor="field-healthcareBridgePremiumPct">Share of Bridge That Is Insurance Premiums (%)</label>
                  <NumberInput id="field-healthcareBridgePremiumPct" min="0" max="100" className="form-input" value={inputs.healthcareBridgePremiumPct !== undefined ? inputs.healthcareBridgePremiumPct : 70} onChange={(e) => updateInput('healthcareBridgePremiumPct', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                    An HSA can&apos;t pay premiums before Medicare, so only the rest of the bridge is drawn tax-free from it.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0' }}>
                  <label htmlFor="toggle-hsaPreMedicarePremiumsQualified" style={{ fontSize: '14px', cursor: 'pointer' }}>Premiums qualify anyway (COBRA / on unemployment)</label>
                  <span className="custom-switch">
                    <input id="toggle-hsaPreMedicarePremiumsQualified" type="checkbox" checked={inputs.hsaPreMedicarePremiumsQualified || false} onChange={(e) => updateInput('hsaPreMedicarePremiumsQualified', e.target.checked)} />
                    <span className="slider-round"></span>
                  </span>
                </div>


                {/* LTC is fully independent per spouse -- one spouse may
                    never need it while the other needs a very different
                    kind or cost of care, so each gets their own Active
                    toggle, Cost, Start Age, Duration, and Ends-in-Death
                    setting rather than one shared set applied to both. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '15px 0' }}>
                  <label htmlFor="toggle-ltcActive1" style={{ fontSize: '14px', cursor: 'pointer' }}>{inputs.spouse2Enabled ? `${getPossessive(inputs.spouse1Name || 'Primary')} ` : ''}Plan for long-term care</label>
                  <span className="custom-switch">
                    <input id="toggle-ltcActive1" type="checkbox" checked={inputs.ltcActive1} onChange={(e) => updateInput('ltcActive1', e.target.checked)} />
                    <span className="slider-round"></span>
                  </span>
                </div>

                {inputs.ltcActive1 && (
                  <div style={{ borderLeft: '2.5px solid var(--accent-primary)', paddingLeft: '12px', marginBottom: '16px' }}>
                    <div className="form-group">
                      <label htmlFor="field-ltcCost1">
                        <Tooltip text="2025 national medians (CareScout Cost of Care Survey): assisted living $74,400 a year, a home aide 44 hours a week $80,100, a nursing home $115,000 to $130,000. Costs vary a lot by state." more="Long-Term Care Annual Cost">Long-Term Care Annual Cost ($)</Tooltip>
                      </label>
                      <NumberInput id="field-ltcCost1" min="0" className="form-input" value={inputs.ltcCost1} onChange={(e) => updateInput('ltcCost1', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="field-ltcStartAge1">Long-Term Care Start Age</label>
                      <NumberInput id="field-ltcStartAge1" min="40" max="110" className="form-input" value={inputs.ltcStartAge1} onChange={(e) => updateInput('ltcStartAge1', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
                      <label htmlFor="toggle-ltcEndsInDeath1" style={{ fontSize: '14px', cursor: 'pointer' }}>
                        <Tooltip text="Off: the cost runs for the Duration below, then stops (real episodes average 2-3 years). On: it runs from the Start Age to this person's last year." more="Care Lasts for Life">
                          Care Lasts for Life
                        </Tooltip>
                      </label>
                      <span className="custom-switch">
                        <input id="toggle-ltcEndsInDeath1" type="checkbox" checked={inputs.ltcEndsInDeath1 || false} onChange={(e) => updateInput('ltcEndsInDeath1', e.target.checked)} />
                        <span className="slider-round"></span>
                      </span>
                    </div>

                    {inputs.ltcEndsInDeath1 ? (
                      <div style={{ padding: '10px', marginBottom: '8px', borderRadius: '8px', backgroundColor: 'rgba(42, 127, 122, 0.05)', border: '1px solid rgba(42, 127, 122, 0.2)', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                        The long-term care cost will run every year from age {inputs.ltcStartAge1} through {inputs.spouse2Enabled ? `${inputs.spouse1Name || 'this person'}'s` : 'their'} own Life Expectancy age — modeling care that lasts the remainder of their life instead of a bounded episode.
                      </div>
                    ) : (
                      <div className="form-group">
                        <label htmlFor="field-ltcDurationYears1">Long-Term Care Duration (years)</label>
                        <NumberInput id="field-ltcDurationYears1" min="1" max="30" className="form-input" value={inputs.ltcDurationYears1 !== undefined ? inputs.ltcDurationYears1 : 3} onChange={(e) => updateInput('ltcDurationYears1', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                          How many years the long-term care cost applies for. Real episodes average 2-3 years — this is not the rest of the plan's life expectancy. Turn on "Care Lasts for Life" above if you want it to instead run through end of life.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {inputs.spouse2Enabled && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '15px 0' }}>
                      <label htmlFor="toggle-ltcActive2" style={{ fontSize: '14px', cursor: 'pointer' }}>{getPossessive(inputs.spouse2Name || 'Spouse')} Plan for long-term care</label>
                      <span className="custom-switch">
                        <input id="toggle-ltcActive2" type="checkbox" checked={inputs.ltcActive2} onChange={(e) => updateInput('ltcActive2', e.target.checked)} />
                        <span className="slider-round"></span>
                      </span>
                    </div>

                    {inputs.ltcActive2 && (
                      <div style={{ borderLeft: '2.5px solid var(--accent-secondary)', paddingLeft: '12px', marginBottom: '16px' }}>
                        <div className="form-group">
                          <label htmlFor="field-ltcCost2">
                        <Tooltip text="2025 national medians (CareScout Cost of Care Survey): assisted living $74,400 a year, a home aide 44 hours a week $80,100, a nursing home $115,000 to $130,000. Costs vary a lot by state." more="Long-Term Care Annual Cost">Long-Term Care Annual Cost ($)</Tooltip>
                      </label>
                          <NumberInput id="field-ltcCost2" min="0" className="form-input" value={inputs.ltcCost2} onChange={(e) => updateInput('ltcCost2', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-ltcStartAge2">Long-Term Care Start Age</label>
                          <NumberInput id="field-ltcStartAge2" min="40" max="110" className="form-input" value={inputs.ltcStartAge2} onChange={(e) => updateInput('ltcStartAge2', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
                          <label htmlFor="toggle-ltcEndsInDeath2" style={{ fontSize: '14px', cursor: 'pointer' }}>
                            <Tooltip text="Off: the cost runs for the Duration below, then stops (real episodes average 2-3 years). On: it runs from the Start Age to this person's last year." more="Care Lasts for Life">
                              Care Lasts for Life
                            </Tooltip>
                          </label>
                          <span className="custom-switch">
                            <input id="toggle-ltcEndsInDeath2" type="checkbox" checked={inputs.ltcEndsInDeath2 || false} onChange={(e) => updateInput('ltcEndsInDeath2', e.target.checked)} />
                            <span className="slider-round"></span>
                          </span>
                        </div>

                        {inputs.ltcEndsInDeath2 ? (
                          <div style={{ padding: '10px', marginBottom: '8px', borderRadius: '8px', backgroundColor: 'rgba(42, 127, 122, 0.05)', border: '1px solid rgba(42, 127, 122, 0.2)', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                            The long-term care cost will run every year from age {inputs.ltcStartAge2} through {inputs.spouse2Name || 'this person'}'s own Life Expectancy age — modeling care that lasts the remainder of their life instead of a bounded episode.
                          </div>
                        ) : (
                          <div className="form-group">
                            <label htmlFor="field-ltcDurationYears2">Long-Term Care Duration (years)</label>
                            <NumberInput id="field-ltcDurationYears2" min="1" max="30" className="form-input" value={inputs.ltcDurationYears2 !== undefined ? inputs.ltcDurationYears2 : 3} onChange={(e) => updateInput('ltcDurationYears2', (e.target.value === '' ? '' : parseInt(e.target.value)))} />
                            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                              How many years the long-term care cost applies for. Real episodes average 2-3 years — this is not the rest of the plan's life expectancy. Turn on "Care Lasts for Life" above if you want it to instead run through end of life.
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
    </>
  );
}
