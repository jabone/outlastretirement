// RsuSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_rsu block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React, { useState } from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { CollapsibleHeader } from '../sectionShared';
import { useFoldState } from '../foldState';
import { Coins, Plus, Trash2, AlertTriangle } from 'lucide-react';
import Tooltip from '../../Tooltip';
import NumberInput from '../../NumberInput';

export default function RsuSection({ forceOpen = false }) {
  const { inputs, updateInput, formatCurrency } = useSimulation();
  const [showRSU, toggleShowRSU] = useFoldState('rsu', () => (
    (inputs.rsuGrants && inputs.rsuGrants.length > 0) || inputs.rsuRefreshEnabled1 || inputs.rsuRefreshEnabled2
  ), forceOpen);
  const [newGrantSpouse, setNewGrantSpouse] = useState(1);
  const [newGrantLabel, setNewGrantLabel] = useState('');
  const [newGrantYear, setNewGrantYear] = useState(new Date().getFullYear());
  // Entry mode: 'dollars' keeps the original fixed-total-value grant;
  // 'units' stores a unit count instead, valued at units × that spouse's
  // rsuSharePrice1/2 on every projection run (see calculator.js's
  // rsuGrants comment) so one price edit reprices every unit grant.
  const [newGrantEntryMode, setNewGrantEntryMode] = useState('dollars');
  const [newGrantValue, setNewGrantValue] = useState(100000);
  const [newGrantUnits, setNewGrantUnits] = useState(1000);
  const [newGrantVestingYears, setNewGrantVestingYears] = useState(4);
  const [newGrantSchedule, setNewGrantSchedule] = useState('equal');
  const [newGrantCustomScheduleText, setNewGrantCustomScheduleText] = useState('10,20,30,40');

  const handleAddGrant = () => {
    if ((newGrantEntryMode === 'units' ? !newGrantUnits : !newGrantValue) || newGrantVestingYears < 1) return;
    const customSchedule = newGrantCustomScheduleText.split(',').map(s => parseFloat(s.trim()) || 0);
    updateInput('rsuGrants', [...(inputs.rsuGrants || []), {
      id: Date.now().toString(),
      spouse: newGrantSpouse,
      label: newGrantLabel || `Grant ${newGrantYear}`,
      grantYear: newGrantYear,
      totalValue: newGrantEntryMode === 'units' ? undefined : newGrantValue,
      units: newGrantEntryMode === 'units' ? newGrantUnits : undefined,
      vestingYears: newGrantVestingYears,
      schedule: newGrantSchedule,
      customSchedule: newGrantSchedule === 'custom' ? customSchedule : undefined,
    }]);
    setNewGrantLabel('');
  };

  // Display helper shared by the grant list rows: a unit grant's current
  // worth from that spouse's share price (0 when no price is entered --
  // the row then carries its own warning).
  const grantUnits = (g) => Math.max(0, Number(g.units) || 0);
  const grantSharePrice = (g) => Math.max(0, (Number(g.spouse) === 2 ? inputs.rsuSharePrice2 : inputs.rsuSharePrice1) || 0);

  const handleDeleteGrant = (id) => {
    updateInput('rsuGrants', (inputs.rsuGrants || []).filter(g => g.id !== id));
  };
  return (
    <>
                <CollapsibleHeader
                  title="Equity Compensation (RSU/GSU)"
                  icon={<Coins size={16} style={{ color: 'var(--accent-text)' }} />}
                  isOpen={showRSU}
                  onToggle={toggleShowRSU}
                />
                {showRSU && (
                  <div>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '16px' }}>
                      Stock grants vest on their own multi-year schedule (commonly 4 years), and it's normal to hold several overlapping grants at once. Enter grants you already have below; use the separate "Assumed Future Grants" section further down for a forward-looking refresh assumption. Vesting income is added on top of salary above, and stops once that spouse reaches their Retirement Age, same as salary.
                    </p>

                    <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', marginBottom: '16px' }}>
                      <div style={{ fontWeight: '600', fontSize: 'var(--fs-body)', marginBottom: '12px' }}>Existing Grants</div>
                      {(!inputs.rsuGrants || inputs.rsuGrants.length === 0) ? (
                        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginBottom: '12px' }}>No grants entered yet.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                          {inputs.rsuGrants.map(g => (
                            <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
                              <div style={{ fontSize: 'var(--fs-sm)' }}>
                                <strong>{g.label || `Grant ${g.grantYear}`}</strong> — {(Number(g.spouse) === 2 ? (inputs.spouse2Name || 'Spouse') : (inputs.spouse1Name || 'Primary'))}, granted {g.grantYear}, {grantUnits(g) > 0
                                  ? `${grantUnits(g).toLocaleString()} units × ${formatCurrency(grantSharePrice(g))} = ${formatCurrency(grantUnits(g) * grantSharePrice(g))}`
                                  : formatCurrency(g.totalValue)} over {g.vestingYears}yr{g.vestingYears === 1 ? '' : 's'} ({g.schedule === 'custom' ? `custom ${(g.customSchedule || []).join('/')}` : 'equal'})
                                {grantUnits(g) > 0 && grantSharePrice(g) <= 0 && (
                                  <span style={{ display: 'block', color: 'var(--warning)', fontSize: 'var(--fs-xs)', marginTop: '2px' }}>
                                    <AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> No share price entered for this spouse below — this grant currently vests $0.
                                  </span>
                                )}
                              </div>
                              <button className="btn-outline" aria-label="Delete grant" style={{ padding: '4px 8px', flexShrink: 0 }} onClick={() => handleDeleteGrant(g.id)}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', alignItems: 'end' }}>
                        {inputs.spouse2Enabled && (
                          <div className="form-group">
                            <label htmlFor="field-newGrantSpouse">Spouse</label>
                            <select id="field-newGrantSpouse" className="form-input" value={newGrantSpouse} onChange={(e) => setNewGrantSpouse(parseInt(e.target.value))}>
                              <option value={1}>{inputs.spouse1Name || 'Primary'}</option>
                              <option value={2}>{inputs.spouse2Name || 'Spouse'}</option>
                            </select>
                          </div>
                        )}
                        <div className="form-group">
                          <label htmlFor="field-newGrantLabel">Label</label>
                          <input id="field-newGrantLabel" type="text" className="form-input" placeholder="e.g. Google 2026" value={newGrantLabel} onChange={(e) => setNewGrantLabel(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-newGrantYear">Grant Year</label>
                          <NumberInput id="field-newGrantYear" min={new Date().getFullYear() - 15} max={new Date().getFullYear() + 30} className="form-input" value={newGrantYear} onChange={(e) => setNewGrantYear(parseInt(e.target.value) || new Date().getFullYear())} />
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-newGrantEntryMode">
                            <Tooltip text="Total Value is a fixed dollar figure. Units is the count from the grant letter, valued at this spouse's Current Share Price, so one price change reprices every unit grant." more="Enter Grant As">
                              Enter Grant As
                            </Tooltip>
                          </label>
                          <select id="field-newGrantEntryMode" className="form-input form-input-select" value={newGrantEntryMode} onChange={(e) => setNewGrantEntryMode(e.target.value)}>
                            <option value="dollars">Total Value ($)</option>
                            <option value="units">Units (RSU/GSU count)</option>
                          </select>
                        </div>
                        {newGrantEntryMode === 'units' ? (
                          <div className="form-group">
                            <label htmlFor="field-newGrantUnits">Units Granted</label>
                            <NumberInput id="field-newGrantUnits" min="0" step="50" className="form-input" value={newGrantUnits} onChange={(e) => setNewGrantUnits(parseFloat(e.target.value) || 0)} />
                          </div>
                        ) : (
                          <div className="form-group">
                            <label htmlFor="field-newGrantValue">Total Value ($)</label>
                            <NumberInput id="field-newGrantValue" min="0" step="5000" className="form-input" value={newGrantValue} onChange={(e) => setNewGrantValue(parseFloat(e.target.value) || 0)} />
                          </div>
                        )}
                        <div className="form-group">
                          <label htmlFor="field-newGrantVestingYears">Vesting Years</label>
                          <NumberInput id="field-newGrantVestingYears" min="1" max="10" className="form-input" value={newGrantVestingYears} onChange={(e) => setNewGrantVestingYears(parseInt(e.target.value) || 4)} />
                        </div>
                        <div className="form-group">
                          <label htmlFor="field-newGrantSchedule">Schedule</label>
                          <select id="field-newGrantSchedule" className="form-input" value={newGrantSchedule} onChange={(e) => setNewGrantSchedule(e.target.value)}>
                            <option value="equal">Equal each year</option>
                            <option value="custom">Custom (back-loaded, etc.)</option>
                          </select>
                        </div>
                        {newGrantSchedule === 'custom' && (
                          <div className="form-group">
                            <label htmlFor="field-newGrantCustomScheduleText">% per year (comma-separated)</label>
                            <input id="field-newGrantCustomScheduleText" type="text" className="form-input" placeholder="10,20,30,40" value={newGrantCustomScheduleText} onChange={(e) => setNewGrantCustomScheduleText(e.target.value)} />
                          </div>
                        )}
                      </div>
                      <button className="btn-primary" style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleAddGrant}>
                        <Plus size={16} /> Add Grant
                      </button>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '16px' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label htmlFor="field-rsuSharePrice1">
                            <Tooltip text="The price every unit grant for this spouse is valued at, unvested tranches included. Update it when the stock moves; the model assumes no growth on unvested units." more="Current Share Price">
                              Current Share Price{inputs.spouse2Enabled ? ` (${inputs.spouse1Name || 'Primary'})` : ''} ($)
                            </Tooltip>
                          </label>
                          <NumberInput id="field-rsuSharePrice1" min="0" step="0.01" className="form-input" value={inputs.rsuSharePrice1} onChange={(e) => updateInput('rsuSharePrice1', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0)))} />
                        </div>
                        {inputs.spouse2Enabled && (
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label htmlFor="field-rsuSharePrice2">Current Share Price ({inputs.spouse2Name || 'Spouse'}) ($)</label>
                            <NumberInput id="field-rsuSharePrice2" min="0" step="0.01" className="form-input" value={inputs.rsuSharePrice2} onChange={(e) => updateInput('rsuSharePrice2', (e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0)))} />
                          </div>
                        )}
                      </div>
                      {(inputs.rsuGrants || []).some(g => (Number(g.units) || 0) > 0 && !((Number(g.spouse) === 2 ? inputs.rsuSharePrice2 : inputs.rsuSharePrice1) > 0)) && (
                        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--warning)', marginTop: '8px', lineHeight: '1.5' }}>
                          <AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> At least one grant is entered in units but its spouse has no Current Share Price — those grants contribute $0 of vesting income until a price is entered.
                        </div>
                      )}
                    </div>

                    {[1, 2].filter(n => n === 1 || inputs.spouse2Enabled).map(n => (
                      <div key={n} style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                          <label htmlFor={`toggle-rsuRefreshEnabled${n}`} style={{ fontSize: 'var(--fs-body)', fontWeight: '600', cursor: 'pointer' }}>
                            Assumed Future Grants — {n === 1 ? (inputs.spouse1Name || 'Primary') : (inputs.spouse2Name || 'Spouse')}
                          </label>
                          <span className="custom-switch">
                            <input
                              id={`toggle-rsuRefreshEnabled${n}`}
                              type="checkbox"
                              checked={!!inputs[`rsuRefreshEnabled${n}`]}
                              onChange={(e) => updateInput(`rsuRefreshEnabled${n}`, e.target.checked)}
                            />
                            <span className="slider-round"></span>
                          </span>
                        </div>
                        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '-4px', marginBottom: '12px' }}>
                          Assumes a new grant of this size is issued every year this spouse is still working, on top of the explicit grants above. This is an assumption about the future, not a known fact — use the Refresh Interruption toggle below to stress-test what happens if a future grant doesn't materialize.
                        </p>
                        {inputs[`rsuRefreshEnabled${n}`] && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                            <div className="form-group">
                              <label htmlFor={`field-rsuRefreshAnnualValue${n}`}>Assumed Annual Grant ($, today's $)</label>
                              <NumberInput id={`field-rsuRefreshAnnualValue${n}`} min="0" step="5000" className="form-input" value={inputs[`rsuRefreshAnnualValue${n}`] || 0} onChange={(e) => updateInput(`rsuRefreshAnnualValue${n}`, parseFloat(e.target.value) || 0)} />
                            </div>
                            <div className="form-group">
                              <label htmlFor={`field-rsuRefreshVestingYears${n}`}>Vesting Years</label>
                              <NumberInput id={`field-rsuRefreshVestingYears${n}`} min="1" max="10" className="form-input" value={inputs[`rsuRefreshVestingYears${n}`] || 4} onChange={(e) => updateInput(`rsuRefreshVestingYears${n}`, parseInt(e.target.value) || 4)} />
                            </div>
                            <div className="form-group">
                              <Tooltip text="How much bigger each successive year's assumed new grant is than the last — reflects typical promotions/comp growth, separate from general inflation.">
                                <label htmlFor={`field-rsuRefreshGrowthRate${n}`}>Grant Growth Rate (%/yr)</label>
                              </Tooltip>
                              <NumberInput id={`field-rsuRefreshGrowthRate${n}`} min="-50" max="50" step="0.5" className="form-input" value={inputs[`rsuRefreshGrowthRate${n}`] !== undefined ? inputs[`rsuRefreshGrowthRate${n}`] : 5.0} onChange={(e) => updateInput(`rsuRefreshGrowthRate${n}`, parseFloat(e.target.value) || 0)} />
                            </div>
                            <div className="form-group">
                              <label htmlFor={`field-rsuRefreshSchedule${n}`}>Schedule</label>
                              <select id={`field-rsuRefreshSchedule${n}`} className="form-input" value={inputs[`rsuRefreshSchedule${n}`] || 'equal'} onChange={(e) => updateInput(`rsuRefreshSchedule${n}`, e.target.value)}>
                                <option value="equal">Equal each year</option>
                                <option value="custom">Custom (back-loaded, etc.)</option>
                              </select>
                            </div>
                            {inputs[`rsuRefreshSchedule${n}`] === 'custom' && (
                              <div className="form-group">
                                <label htmlFor={`field-rsuRefreshCustomSchedule${n}`}>% per year (comma-separated)</label>
                                <input id={`field-rsuRefreshCustomSchedule${n}`}
                                  type="text"
                                  className="form-input"
                                  value={(inputs[`rsuRefreshCustomSchedule${n}`] || []).join(',')}
                                  onChange={(e) => updateInput(`rsuRefreshCustomSchedule${n}`, e.target.value.split(',').map(s => parseFloat(s.trim()) || 0))}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}

                    <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                        <label htmlFor="toggle-rsuRefreshGapEnabled" style={{ fontSize: 'var(--fs-body)', fontWeight: '600', cursor: 'pointer' }}>Refresh Interruption (Stress Test)</label>
                        <span className="custom-switch">
                          <input
                            id="toggle-rsuRefreshGapEnabled"
                            type="checkbox"
                            checked={!!inputs.rsuRefreshGapEnabled}
                            onChange={(e) => updateInput('rsuRefreshGapEnabled', e.target.checked)}
                          />
                          <span className="slider-round"></span>
                        </span>
                      </div>
                      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '-4px', marginBottom: '12px' }}>
                        Models a layoff, a down cycle, or simply not receiving a refresh grant for a stretch of years. Zeroes out only the assumed future grants above during this window — grants already issued (including ones issued before this window starts) keep vesting on their own schedule untouched.
                      </p>
                      {inputs.rsuRefreshGapEnabled && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                          <div className="form-group">
                            <label htmlFor="field-rsuRefreshGapSpouse">Applies To</label>
                            <select id="field-rsuRefreshGapSpouse" className="form-input" value={inputs.rsuRefreshGapSpouse || '1'} onChange={(e) => updateInput('rsuRefreshGapSpouse', e.target.value)}>
                              <option value="1">{inputs.spouse1Name || 'Primary'}</option>
                              {inputs.spouse2Enabled && <option value="2">{inputs.spouse2Name || 'Spouse'}</option>}
                              {inputs.spouse2Enabled && <option value="both">Both</option>}
                            </select>
                          </div>
                          <div className="form-group">
                            <label htmlFor="field-rsuRefreshGapStartYear">Start Year</label>
                            <NumberInput id="field-rsuRefreshGapStartYear" min={new Date().getFullYear()} max={new Date().getFullYear() + 40} className="form-input" value={inputs.rsuRefreshGapStartYear || 2028} onChange={(e) => updateInput('rsuRefreshGapStartYear', parseInt(e.target.value) || 2028)} />
                          </div>
                          <div className="form-group">
                            <label htmlFor="field-rsuRefreshGapDurationYears">Duration (years)</label>
                            <NumberInput id="field-rsuRefreshGapDurationYears" min="1" max="20" className="form-input" value={inputs.rsuRefreshGapDurationYears || 4} onChange={(e) => updateInput('rsuRefreshGapDurationYears', parseInt(e.target.value) || 4)} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

    </>
  );
}
