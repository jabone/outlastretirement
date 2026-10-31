// SocialSecuritySection -- the Social Security benefit fields on Plan ->
// Income, under their own heading. They used to open the "Annuities,
// Rentals & Pensions" fold, where nobody looking for Social Security would
// think to look (and the Setup Wizard's income step showed them under that
// heading too). Claiming ages stay on Household, beside birth years.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import { CollapsibleHeader } from '../sectionShared';
import { getPossessive } from '../getPossessive';
import { useFoldState } from '../foldState';
import Tooltip from '../../Tooltip';
import SwitchRow from '../../SwitchRow';
import NumberInput from '../../NumberInput';

export default function SocialSecuritySection({ forceOpen = false }) {
  const { inputs, updateInput } = useSimulation();
  const [open, toggle] = useFoldState('socialSecurity', () => true, forceOpen);
  return (
    <>
                <CollapsibleHeader title="Social Security" isOpen={open} onToggle={toggle} />
                {open && (
                <>
                <div className="form-group">
                  <label htmlFor="field-ss1">{getPossessive(inputs.spouse1Name || 'Primary')} Social Security at Full Retirement Age ($/yr)</label>
                  <NumberInput id="field-ss1" commas min="0" className="form-input" value={inputs.ss1} onChange={(e) => updateInput('ss1', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    From your statement at ssa.gov, in today&rsquo;s dollars. The statement assumes you keep earning
                    until you claim; if you stop work years before that, the benefit will be lower. The statement&rsquo;s
                    &ldquo;if you stop working now&rdquo; line, or the ssa.gov calculator with your retirement age, is the
                    figure to use.
                  </span>
                  {inputs.spouse2Enabled && (
                    <SwitchRow id="toggle-ssSpousalEnabled1" size="sm" style={{ marginTop: '6px' }} checked={inputs.ssSpousalEnabled1 || false} onChange={(on) => updateInput('ssSpousalEnabled1', on)}>
                      Use the <Tooltip text="Tops a lower earner up to half of the other spouse's full-retirement-age benefit, once that spouse has filed. Changes nothing if this spouse's own benefit is already at least half." more="spousal benefit">spousal benefit</Tooltip> if higher
                    </SwitchRow>
                  )}
                </div>
                {inputs.spouse2Enabled && (
                  <div className="form-group">
                    <label htmlFor="field-ss2">{getPossessive(inputs.spouse2Name || 'Spouse')} Social Security at Full Retirement Age ($/yr)</label>
                    <NumberInput id="field-ss2" commas min="0" className="form-input" value={inputs.ss2} onChange={(e) => updateInput('ss2', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
                    <SwitchRow id="toggle-ssSpousalEnabled2" size="sm" style={{ marginTop: '6px' }} checked={inputs.ssSpousalEnabled2 || false} onChange={(on) => updateInput('ssSpousalEnabled2', on)}>
                      Use the spousal benefit if higher
                    </SwitchRow>
                  </div>
                )}
                </>
                )}
    </>
  );
}
