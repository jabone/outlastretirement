// ContribAdvisorSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_contribAdvisor block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { AlertTriangle, BookOpen } from 'lucide-react';
import { useSimulation } from '../../../context/useSimulation';
import { getPossessive } from '../getPossessive';
import Tooltip from '../../Tooltip';
import { getContributionAdvisory } from '../../../calculator';

export default function ContribAdvisorSection() {
  const { inputs, updateInput } = useSimulation();
  return (
    <>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  Pre-Tax vs. Roth Contribution Advisor
                </h3>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '16px' }}>
                  A checklist of where you stand against the current-year rules for Pre-Tax vs. Roth savings — not a recommendation of which is "better" for you. That depends on comparing your tax bracket now to your expected bracket in retirement, which this app's fuller projection is what can actually answer.
                </p>
                {(() => {
                  const advisory = getContributionAdvisory(inputs);
                  const spouses = [
                    { num: 1, name: inputs.spouse1Name || 'Primary', data: advisory.spouse1 },
                    ...(advisory.spouse2 ? [{ num: 2, name: inputs.spouse2Name || 'Spouse', data: advisory.spouse2 }] : []),
                  ];

                  return (
                    <>
                      {spouses.map(({ num, name, data }) => (
                        <div key={num} style={{ marginBottom: '16px', padding: '14px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '600', marginBottom: '8px' }}>
                            {getPossessive(name)} 401(k)-style Contributions (age {data.age})
                          </div>

                          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                            Elective deferral (Pre-Tax + Roth): ${data.totalDeferral.toLocaleString(undefined, { maximumFractionDigits: 0 })} of ${data.deferralLimit.toLocaleString()} 2026 limit
                            {data.catchupLimit > 0 && ` (includes a $${data.catchupLimit.toLocaleString()} age 50+ catch-up)`}.
                          </div>

                          {data.mandatoryRothCatchup && (
                            <div style={{ fontSize: 'var(--fs-xs)', color: data.catchupMisallocatedToTraditional > 0 ? 'var(--danger)' : 'var(--text-secondary)', marginBottom: '6px', lineHeight: '1.5', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                              {data.catchupMisallocatedToTraditional > 0
                                ? <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
                                : <BookOpen size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />}
                              {/* One text run, so the follow-on sentence wraps with it
                                  instead of leaving a lone ". Your current split..."
                                  line under the help mark. */}
                              <span>
                                <Tooltip text="SECURE 2.0: at 50+, with prior-year wages over $150,000 from this employer, catch-up contributions must be Roth. This year's salary stands in for prior-year wages." more="catch-up">
                                  Because of your age and income, any catch-up contribution must be Roth (SECURE 2.0).
                                </Tooltip>
                                {data.catchupMisallocatedToTraditional > 0
                                  ? ` About $${data.catchupMisallocatedToTraditional.toLocaleString(undefined, { maximumFractionDigits: 0 })} of your Traditional contribution looks like catch-up money that should be Roth instead.`
                                  : ' Your current split already satisfies this.'}
                              </span>
                            </div>
                          )}

                          {data.catchupLimit > 0 && data.catchupRemaining > 0 && (
                            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                              ${data.catchupRemaining.toLocaleString(undefined, { maximumFractionDigits: 0 })} of catch-up room still unused this year{data.mandatoryRothCatchup ? ' (would need to be Roth)' : ''}.
                            </div>
                          )}

                          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                            Employer match this year: ${data.employerMatch.toLocaleString(undefined, { maximumFractionDigits: 0 })} (always Traditional/pre-tax unless your plan specifically offers a Roth match election).
                          </div>

                          {data.annualAdditionsBreached && (
                            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--warning)', marginBottom: '10px', lineHeight: '1.5' }}>
                              <AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> <Tooltip text="IRC 415(c) caps your deferral plus all employer contributions plus after-tax dollars at $72,000 (2026), catch-up aside. A warning only; the projection uses your numbers." more="415(c)">
                                Deferral + employer match (${data.annualAdditionsUsed.toLocaleString(undefined, { maximumFractionDigits: 0 })}) exceeds the $72,000 overall §415(c) annual-additions limit
                              </Tooltip>
                              {' '}— a real plan would cap contributions before this point; check the match formula entered above.
                            </div>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <label htmlFor={`toggle-afterTaxAllowed${num}`} style={{ fontSize: 'var(--fs-xs)', flex: 1, cursor: 'pointer' }}>
                              <Tooltip text="After-tax (non-Roth) contributions above the deferral limit that can be converted to Roth: the Mega Backdoor Roth. Uncommon; check your plan's Summary Plan Description." more="Mega Backdoor">
                                My plan allows after-tax (Mega Backdoor Roth) contributions
                              </Tooltip>
                            </label>
                            <span className="custom-switch">
                              <input id={`toggle-afterTaxAllowed${num}`} type="checkbox" checked={data.afterTaxAllowed} onChange={(e) => updateInput(num === 1 ? 'afterTaxContributionsAllowed1' : 'afterTaxContributionsAllowed2', e.target.checked)} />
                              <span className="slider-round"></span>
                            </span>
                          </div>
                          <div style={{ fontSize: 'var(--fs-xs)', color: data.afterTaxAllowed ? 'var(--success)' : 'var(--text-muted)' }}>
                            {data.afterTaxAllowed
                              ? `Up to $${data.megaBackdoorRoom.toLocaleString(undefined, { maximumFractionDigits: 0 })} in Mega Backdoor Roth room this year (the gap between the $72,000 overall IRS limit and your deferral + employer match).`
                              : `If your plan supports it, there'd be up to $${data.megaBackdoorRoom.toLocaleString(undefined, { maximumFractionDigits: 0 })} in Mega Backdoor Roth room this year — toggle on once you've confirmed it with your plan.`}
                          </div>
                        </div>
                      ))}

                      <div style={{ padding: '14px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '600', marginBottom: '8px' }}>
                          <Tooltip text="Estimated using your Salary input(s) as a stand-in for MAGI — your actual Modified Adjusted Gross Income may differ once other income, deductions, and pre-tax contributions are factored in.">
                            Roth IRA Eligibility (approximate)
                          </Tooltip>
                        </div>
                        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                          {advisory.rothIra.eligibility === 'full' && `Full direct Roth IRA contributions are available — your estimated income is below the ${advisory.rothIra.isMFJ ? 'MFJ' : 'Single'} phase-out floor of $${advisory.rothIra.phaseFloor.toLocaleString()}.`}
                          {advisory.rothIra.eligibility === 'partial' && `You're inside the ${advisory.rothIra.isMFJ ? 'MFJ' : 'Single'} phase-out range ($${advisory.rothIra.phaseFloor.toLocaleString()}-$${advisory.rothIra.phaseCeiling.toLocaleString()}) — only a reduced direct Roth IRA contribution is allowed. A backdoor Roth IRA (non-deductible Traditional IRA contribution, then converted) covers the rest, though it's subject to the pro-rata rule if you hold other pre-tax IRA balances.`}
                          {advisory.rothIra.eligibility === 'none' && `Direct Roth IRA contributions aren't available — your estimated income is above the ${advisory.rothIra.isMFJ ? 'MFJ' : 'Single'} phase-out ceiling of $${advisory.rothIra.phaseCeiling.toLocaleString()}. A backdoor Roth IRA is the usual workaround (subject to the pro-rata rule if you hold other pre-tax IRA balances); a Mega Backdoor Roth through your 401(k) above has no income limit at all.`}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
    </>
  );
}
