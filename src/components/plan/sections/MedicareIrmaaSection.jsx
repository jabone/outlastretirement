// MedicareIrmaaSection -- the Medicare premium (IRMAA) settings, moved out
// of the Roth Conversion Optimization fold (changelog 260, 2026-09-24).
// They lived inside that collapsible, which is closed unless a Roth
// strategy or an ACA guard is on -- so a plan with no conversions could not
// find "Assume a Form SSA-44 IRMAA appeal" where the Action Plan sent it.
// Now its own always-visible block on Plan -> Taxes & Roth, and on the
// Guided Plan's Roth & Medicare step. Content moved verbatim.
import React from 'react';
import { useSimulation } from '../../../context/useSimulation';
import Tooltip from '../../Tooltip';
import NumberInput from '../../NumberInput';

export default function MedicareIrmaaSection() {
  const { inputs, updateInput } = useSimulation();
  return (
    <>
                <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '24px 0 16px 0', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  Medicare Premiums (IRMAA)
                </h3>
                {/* Changelog 369: the term spelled out where it is first used. */}
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '-8px 0 12px' }}>
                  IRMAA is Medicare&rsquo;s income-related surcharge on Part B and Part D premiums, set from the tax return you filed two years earlier.
                </p>
    {/* Medicare's side of the income test (changelog 121): IRMAA
        is set from the return filed two years earlier, so the
        first Medicare years of a high earner are priced off
        salary. Form SSA-44 lets a retiree substitute the
        current year's estimate after a life-changing event. */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '15px 0' }}>
      <label htmlFor="toggle-irmaaLifeChangeAppeal" style={{ fontSize: '14px', cursor: 'pointer' }}>
        <Tooltip text="Medicare prices IRMAA off the return from two years earlier. After a life-changing event, Form SSA-44 asks for this year's income instead. On, the plan charges the lower premium, as a filed appeal would." more="SSA-44">
          <strong>Assume a Form SSA-44 IRMAA appeal after retiring:</strong> <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>(use this year's income when it gives a lower Medicare premium)</span>
        </Tooltip>
      </label>
      <span className="custom-switch">
        <input id="toggle-irmaaLifeChangeAppeal" type="checkbox" checked={!!inputs.irmaaLifeChangeAppealEnabled} onChange={(e) => updateInput('irmaaLifeChangeAppealEnabled', e.target.checked)} />
        <span className="slider-round"></span>
      </span>
    </div>

    {/* Changelog 243: the Medicare-delay setting used to sit here;
        a pointer stays for anyone who remembers it this way. */}
    <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
      Still covered by an employer plan at 65? <strong>Medicare while still on an employer plan</strong> is under
      Spending &rarr; Special Expenses, below Healthcare Bridge Cost.
    </p>

    {/* A declared SSA-44 event (changelog 180). The engine can
        detect two of the eight; the other six are life events
        it has no concept of, so the only honest way to reach
        them is to let the user say what happened and when. */}
    <div style={{ margin: '15px 0', padding: '14px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'var(--bg-secondary)' }}>
      <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '600', marginBottom: '6px' }}>
        <Tooltip text="Form SSA-44 lists eight life-changing events. The plan detects two (you stop work, a spouse dies); name any other here and that year and the two after are priced as a successful appeal." more="life-changing event">
          A Form SSA-44 life-changing event <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)' }}>(optional &mdash; only if the plan cannot see it)</span>
        </Tooltip>
      </div>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: '2 1 240px', marginBottom: 0 }}>
          <label htmlFor="field-irmaaLifeChangeEventType" style={{ fontSize: 'var(--fs-sm)' }}>What happened</label>
          <select id="field-irmaaLifeChangeEventType" className="form-input"
            value={inputs.irmaaLifeChangeEventType || ''}
            onChange={(e) => updateInput('irmaaLifeChangeEventType', e.target.value)}>
            <option value="">Nothing to declare &mdash; let the plan work it out</option>
            <option value="marriage">Marriage</option>
            <option value="divorce">Divorce or annulment</option>
            <option value="deathOfSpouse">Death of a spouse</option>
            <option value="workStoppage">You or your spouse stopped working</option>
            <option value="workReduction">You or your spouse reduced your hours</option>
            <option value="lossOfIncomeProperty">Loss of income-producing property</option>
            <option value="lossOfPension">Loss of pension income</option>
            <option value="employerSettlement">Employer settlement payment</option>
          </select>
        </div>
        <div className="form-group" style={{ flex: '1 1 140px', marginBottom: 0 }}>
          <label htmlFor="field-irmaaLifeChangeEventYear" style={{ fontSize: 'var(--fs-sm)' }}>Year it happened</label>
          <NumberInput id="field-irmaaLifeChangeEventYear" step="1" min="0" max={new Date().getFullYear()} className="form-input" placeholder="e.g. 2025"
            value={inputs.irmaaLifeChangeEventYear || ''}
            onChange={(e) => updateInput('irmaaLifeChangeEventYear', (e.target.value === '' ? 0 : parseInt(e.target.value, 10)))} />
        </div>
      </div>
      <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.5' }}>
        The year may be before your plan starts. Social Security can use your current income for the event year and the two years after it, and only ever where that gives the lower premium &mdash; naming an event can never raise what you pay here. Filing the form is still something you do yourself.
      </div>
    </div>

    {/* The two returns filed BEFORE the plan starts (changelog
        179). Without them the lookback has no history for the
        plan's first two years and falls back to each year's own
        MAGI — which for someone whose plan begins at 63-65 is
        exactly backwards, since the returns Medicare is really
        reading are the working-income ones from before the plan
        began. Shown only once someone is close enough to
        Medicare for them to change a premium. */}
    {(() => {
      const planYear = Number(inputs.planYear) || new Date().getFullYear();
      const age1AtStart = planYear - (Number(inputs.birthYear1) || planYear);
      const age2AtStart = inputs.spouse2Enabled ? planYear - (Number(inputs.birthYear2) || planYear) : -Infinity;
      // 63 is the first age whose income can reach a Medicare
      // premium under the two-year lookback.
      if (Math.max(age1AtStart, age2AtStart) < 63) return null;
      return (
        <div style={{ margin: '15px 0', padding: '14px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '600', marginBottom: '6px' }}>
            <Tooltip text="The plan's first two years are priced off tax returns from before it begins, which it cannot see. Enter that income here; an empty box means unknown and keeps the fallback." more="last two tax returns">
              Income on your last two tax returns <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)' }}>(optional &mdash; sets your first two Medicare years)</span>
            </Tooltip>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
              <label htmlFor="field-irmaaTwoYearsPriorMagi" style={{ fontSize: 'var(--fs-sm)' }}>{planYear - 2} income (MAGI, $)</label>
              <NumberInput id="field-irmaaTwoYearsPriorMagi" step="1000" min="0" className="form-input" placeholder="Leave blank if unknown"
                value={inputs.irmaaTwoYearsPriorMagi || ''} onChange={(e) => updateInput('irmaaTwoYearsPriorMagi', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
            </div>
            <div className="form-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
              <label htmlFor="field-irmaaPriorYearMagi" style={{ fontSize: 'var(--fs-sm)' }}>{planYear - 1} income (MAGI, $)</label>
              <NumberInput id="field-irmaaPriorYearMagi" step="1000" min="0" className="form-input" placeholder="Leave blank if unknown"
                value={inputs.irmaaPriorYearMagi || ''} onChange={(e) => updateInput('irmaaPriorYearMagi', (e.target.value === '' ? '' : parseFloat(e.target.value)))} />
            </div>
          </div>
          {/* `|| ''` so a 0 renders as the placeholder rather than
              a literal "0". The engine reads 0 as "not provided",
              and a box showing 0 reads as "no income" — the exact
              confusion the unknown/zero distinction exists to
              prevent. Spotted on the deployed app, changelog 185. */}
          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.5' }}>
            Adjusted gross income plus any tax-exempt interest, from the return as filed. If you were still working, these are usually your salary years &mdash; which is what makes the first Medicare years expensive.
          </div>
        </div>
      );
    })()}
    </>
  );
}
