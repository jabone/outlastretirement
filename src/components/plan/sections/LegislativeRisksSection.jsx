// LegislativeRisksSection -- one section of the Plan form. Extracted verbatim from
// SettingsTab.jsx's S_legislativeRisks block in IA Phase 3 step 1 (2026-09-24);
// section-local state came with it. No behavior change.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { CollapsibleHeader } from '../sectionShared';
import { useFoldState } from '../foldState';
import Tooltip from '../../Tooltip';
import NumberInput from '../../NumberInput';

export default function LegislativeRisksSection({ forceOpen = false }) {
  const { inputs, updateInput } = useSimulation();
  const [showLegislativeRisks, toggleShowLegislativeRisks] = useFoldState('legislativeRisks', () => (
    inputs.ssDepletionEnabled || inputs.tcjaSunsetEnabled || inputs.irmaaFreezeEnabled
  ), forceOpen);
  return (
    <>
                <CollapsibleHeader title="Legislative & Policy Risks" isOpen={showLegislativeRisks} onToggle={toggleShowLegislativeRisks} />
                {showLegislativeRisks && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label htmlFor="toggle-ssDepletionEnabled" style={{ fontSize: '14px', flex: 1, cursor: 'pointer' }}>
                      <Tooltip text="Models the Trustees' projection that the OASI trust fund runs dry in 2032 and benefits fall to about 78% of the scheduled amount if Congress does nothing. Off, benefits are paid in full." more="Trust Fund">
                        Simulate SS Trust Fund Depletion
                      </Tooltip>
                    </label>
                    <span className="custom-switch">
                      <input id="toggle-ssDepletionEnabled" type="checkbox" checked={inputs.ssDepletionEnabled} onChange={(e) => updateInput('ssDepletionEnabled', e.target.checked)} />
                      <span className="slider-round"></span>
                    </span>
                  </div>
                  {inputs.ssDepletionEnabled && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px', paddingLeft: '12px', borderLeft: '2px solid var(--warning)' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label htmlFor="field-ssDepletionYear" style={{ fontSize: 'var(--fs-sm)' }}>Depletion Year</label>
                        <NumberInput id="field-ssDepletionYear" min="2026" max="2100" className="form-input" value={inputs.ssDepletionYear !== undefined ? inputs.ssDepletionYear : 2032} onChange={(e) => updateInput('ssDepletionYear', parseInt(e.target.value))} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label htmlFor="field-ssCutPercent" style={{ fontSize: 'var(--fs-sm)' }}>Benefit Cut (%)</label>
                        <NumberInput id="field-ssCutPercent" step="0.1" min="0" max="100" className="form-input" value={inputs.ssCutPercent !== undefined ? inputs.ssCutPercent : 22.0} onChange={(e) => updateInput('ssCutPercent', parseFloat(e.target.value))} />
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label htmlFor="toggle-tcjaSunsetEnabled" style={{ fontSize: '14px', flex: 1, cursor: 'pointer' }}>
                      <Tooltip text="A stress test, not current law: assumes a future Congress lets the now-permanent TCJA rates lapse, reverting to the pre-2018 brackets and roughly halving the standard deduction." more="TCJA">
                        Assume TCJA Rates Are Later Repealed (Reverts to Pre-2018 Brackets)
                      </Tooltip>
                    </label>
                    <span className="custom-switch">
                      <input id="toggle-tcjaSunsetEnabled" type="checkbox" checked={inputs.tcjaSunsetEnabled} onChange={(e) => updateInput('tcjaSunsetEnabled', e.target.checked)} />
                      <span className="slider-round"></span>
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label htmlFor="toggle-irmaaFreezeEnabled" style={{ fontSize: '14px', flex: 1, cursor: 'pointer' }}>
                      <Tooltip text="Models Congress freezing the IRMAA income thresholds at today's dollars instead of indexing them, so nominal income growth pushes more retirees into a surcharge tier each year." more="Freeze Medicare IRMAA">
                        Freeze Medicare IRMAA Brackets
                      </Tooltip>
                    </label>
                    <span className="custom-switch">
                      <input id="toggle-irmaaFreezeEnabled" type="checkbox" checked={inputs.irmaaFreezeEnabled} onChange={(e) => updateInput('irmaaFreezeEnabled', e.target.checked)} />
                      <span className="slider-round"></span>
                    </span>
                  </div>
                </div>
                )}

    </>
  );
}
