// StateTaxesSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_stateTaxes block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { BookOpen } from 'lucide-react';
import { useSimulation } from '../../../context/useSimulation';
import NumberInput from '../../NumberInput';
import { hasStateRules, stateRulesYear, stateRulesName, stateRulesRate, stateRulesSummary } from '../../../utils/stateRulesSummary';
import { STATE_TAX_RULE_SOURCES } from '../../../config/stateTaxRuleSources';

export default function StateTaxesSection() {
  const { inputs, updateInput } = useSimulation();
  // Changelog 361: the 35 states and DC without a model of their own are
  // priced from their own rules, read from State of Residence.
  const ownState = hasStateRules(inputs.stateOfResidence) ? inputs.stateOfResidence.toUpperCase() : null;
  return (
    <>
                <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '24px 0 16px 0', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>State Income Taxes</span>
                  {inputs.stateTaxUnlinked && (
                    <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 'normal', color: 'var(--text-secondary)' }}>
                      Note: Unlinked from State of Residence
                    </span>
                  )}
                </h3>


                <div className="form-group">
                  <label htmlFor="field-stateTaxState">State Income Tax Jurisdiction</label>
                  <select id="field-stateTaxState" className="form-input form-input-select" value={inputs.stateTaxState} onChange={(e) => updateInput('stateTaxState', e.target.value)}>
                    <option value="none">Tax-Free State (0% e.g. TX/FL/NV)</option>
                    <option value="state_rules" disabled={!ownState}>
                      {ownState ? `${stateRulesName(ownState)} (${stateRulesRate(ownState)}, its own rules)` : 'Your state’s own rules (set State of Residence first)'}
                    </option>
                    <option value="flat_5">Other State (flat rate you set)</option>
                    <option value="ca">California (Progressive to 13.3%, SS tax-free)</option>
                    <option value="ny">New York (Progressive to 10.9%, SS tax-free, Pension Excl.)</option>
                    <option value="il">Illinois (Flat 4.95%, SS & Pension fully tax-free)</option>
                    <option value="co">Colorado (Flat 4.4%, SS tax-free, Partial Pension Excl.)</option>
                    <option value="pa">Pennsylvania (Flat 3.07%, SS & Pension fully tax-free)</option>
                    <option value="va">Virginia (2%–5.75%, SS tax-free, Age Deduction 65+)</option>
                    <option value="wa">Washington (7% capital gains tax; 9.9% on income over $1M from 2028)</option>
                  </select>
                </div>

                {/* A Washington household still on the no-income-tax choice
                    (the only one before the Washington option existed) is
                    pointed at it; nothing changes until they pick it. */}
                {inputs.stateTaxState === 'none' && inputs.stateOfResidence === 'WA' && (
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--accent-text)', padding: '6px 0', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <BookOpen size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>Washington taxes long-term capital gains, and from 2028 income over $1 million. Choose Washington to include both.</span>
                  </div>
                )}

                {/* Yonkers is a surcharge on the New York state figure and
                    NYC has its own bracket schedule on top of it, so both
                    only make sense once New York is the jurisdiction. Nobody
                    resides in both at once, so they are one select (changelog
                    279) that sets the two engine flags. */}
                {inputs.stateTaxState === 'ny' && (
                  <div className="form-group" style={{ marginTop: '12px' }}>
                    <label htmlFor="field-nyLocality" style={{ fontSize: 'var(--fs-sm)' }}>Local income tax</label>
                    <select
                      id="field-nyLocality"
                      className="form-input"
                      value={inputs.nycResident ? 'nyc' : inputs.yonkersResident ? 'yonkers' : 'none'}
                      onChange={(e) => {
                        // One choice, two engine flags: the city and Yonkers
                        // are exclusive, so the select sets both.
                        updateInput('nycResident', e.target.value === 'nyc');
                        updateInput('yonkersResident', e.target.value === 'yonkers');
                      }}
                    >
                      <option value="none">None (elsewhere in New York State)</option>
                      <option value="nyc">New York City resident (adds the city&rsquo;s own income tax, up to 3.876%)</option>
                      <option value="yonkers">Yonkers resident (adds a 16.75% surcharge on NY state tax)</option>
                    </select>
                    <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
                      New York City levies its own resident income tax with its own bracket schedule
                      (Social Security stays exempt and the state&rsquo;s pension exclusions carry over);
                      Yonkers instead charges a percentage of what you owe New York State. They
                      can&rsquo;t both apply.
                    </p>
                  </div>
                )}

                {inputs.stateTaxState === 'state_rules' && ownState && (
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '12px 0', lineHeight: 1.5 }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', color: 'var(--accent-text)' }}>
                      <BookOpen size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: '3px' }} />
                      <span>{stateRulesName(ownState)}&rsquo;s own rules are applied, with its {stateRulesYear(ownState)} figures:</span>
                    </div>
                    <ul style={{ margin: '6px 0 0 20px', padding: 0 }}>
                      {stateRulesSummary(ownState).map((line) => <li key={line}>{line}</li>)}
                    </ul>
                    <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                      A close model, not a return: credits, itemized deductions and some smaller exclusions are left out,
                      and an exclusion a state gives each spouse separately is shared between you. Choose
                      &ldquo;Other State&rdquo; to use a flat rate of your own instead.
                      {' '}Sources: {(STATE_TAX_RULE_SOURCES[ownState] || []).map((src, i) => (
                        <React.Fragment key={src.url}>
                          {i > 0 && '; '}
                          <a href={src.url} target="_blank" rel="noopener noreferrer">{src.label}</a>
                        </React.Fragment>
                      ))}.
                    </p>
                  </div>
                )}

                {inputs.stateTaxState === 'flat_5' && (
                  <div className="form-group" style={{ marginTop: '12px' }}>
                    <label htmlFor="field-stateTaxFlatRate">Flat State Tax Rate (%)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <NumberInput id="field-stateTaxFlatRate" 
                        step="0.01" 
                        min="0"
                        max="100"
                        className="form-input" 
                        value={inputs.stateTaxFlatRate !== undefined ? inputs.stateTaxFlatRate : 5.0} 
                        onChange={(e) => {
                          const val = (e.target.value === '' ? '' : parseFloat(e.target.value));
                          updateInput('stateTaxFlatRate', isNaN(val) ? '' : val);
                        }} 
                      />
                      <span style={{ fontSize: '14px', fontWeight: '500' }}>%</span>
                    </div>
                  </div>
                )}

                {inputs.stateTaxState !== 'none' && !['state_rules', 'ca', 'ny', 'il', 'co', 'pa', 'va', 'wa'].includes(inputs.stateTaxState) && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '12px 0' }}>
                      <label htmlFor="toggle-stateTaxSSTaxable" style={{ fontSize: '14px', cursor: 'pointer' }}>Tax Social Security at State level</label>
                      <span className="custom-switch">
                        <input id="toggle-stateTaxSSTaxable" type="checkbox" checked={inputs.stateTaxSocialSecurityTaxable} onChange={(e) => updateInput('stateTaxSocialSecurityTaxable', e.target.checked)} />
                        <span className="slider-round"></span>
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '12px 0' }}>
                      <label htmlFor="toggle-stateTaxPensionTaxable" style={{ fontSize: '14px', cursor: 'pointer' }}>Tax Pension income at State level</label>
                      <span className="custom-switch">
                        <input id="toggle-stateTaxPensionTaxable" type="checkbox" checked={inputs.stateTaxPensionTaxable} onChange={(e) => updateInput('stateTaxPensionTaxable', e.target.checked)} />
                        <span className="slider-round"></span>
                      </span>
                    </div>
                  </>
                )}
                {['ca', 'ny', 'il', 'co', 'pa', 'va', 'wa'].includes(inputs.stateTaxState) && (
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--accent-text)', padding: '6px 0', marginBottom: '12px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <BookOpen size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>This state&rsquo;s own rules for Social Security and pension income are applied automatically.</span>
                  </div>
                )}

    </>
  );
}
