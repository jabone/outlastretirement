// EstateHeirsSection -- the heir editor (Beneficiary Settings), extracted
// verbatim from TaxEstateTab.jsx's left config panel (changelog 258,
// 2026-09-24) so the Interview's Estate step can ask it directly instead
// of pointing at Tax & Estate. Tax & Estate still mounts it beside the
// Transfer Metrics; the selected heir is lifted there so the per-heir
// schedule table follows the click. No behavior change.
import React, { useState } from 'react';
import { Users } from 'lucide-react';
import { useSimulation } from '../../../context/useSimulation';
import { HEIR_RELATIONSHIPS, STATE_INHERITANCE_SCHEDULES, inheritanceTopRateFor, DEFAULT_HEIR_RELATIONSHIP, stateTaxJurisdictionFor } from '../../../calculator';
import { US_STATES, US_STATE_NAME } from '../../../config/usStates';
import { HEIR_STRATEGY_LABELS } from '../../../config/heirStrategyLabels';
import { equalShare } from '../../../utils/heirSplit';
import SwitchRow from '../../SwitchRow';
import NumberInput from '../../NumberInput';

export default function EstateHeirsSection({ selectedHeirId: controlledSelectedId, onSelectHeir }) {
  const { inputs, updateInput, heirTaxResults, formatCurrency } = useSimulation();
  // The state the estate is measured in comes from the result (a planned
  // move changes it; abroad at the end is a deliberate null -- changelog
  // 196); the plan-wide input is only the fallback when there is no result.
  const estateState = heirTaxResults && 'estateStateCode' in heirTaxResults
    ? heirTaxResults.estateStateCode
    : inputs.stateOfResidence;
  // Multi-heir estate splitting: inputs.heirs is an array of
  // { id, name, filingStatus, income, splitPct }. selectedHeirId controls
  // which heir's 10-year withdrawal schedule the bottom table shows (the
  // aggregate metrics panel above it always sums across all heirs).
  const heirs = Array.isArray(inputs.heirs) && inputs.heirs.length > 0
    ? inputs.heirs
    : [{ id: 1, name: 'Heir 1', filingStatus: 'Single', income: 100000, splitPct: 100 }];
  // Selection is the caller's when it wants it (Tax & Estate ties it to the
  // per-heir schedule table below); otherwise it is local.
  const [localSelectedId, setLocalSelectedId] = useState(heirs[0].id);
  const selectedHeirId = controlledSelectedId !== undefined ? controlledSelectedId : localSelectedId;
  const setSelectedHeirId = (id) => { setLocalSelectedId(id); if (onSelectHeir) onSelectHeir(id); };
  const heirSplitTotal = heirs.reduce((sum, h) => sum + Math.max(0, h.splitPct || 0), 0);
  const equalSplit = inputs.heirSplitMode !== 'custom';
  const equalShareLabel = equalShare(heirs.length);
  // Short labels for the plan-wide default strategy, reused in each heir's
  // "Plan Default (...)" dropdown option so it's clear what that option
  // actually means without repeating the full descriptions from below.
  const strategyLabels = HEIR_STRATEGY_LABELS;


  const updateHeirField = (id, field, value) => {
    const next = heirs.map(h => h.id === id ? { ...h, [field]: value } : h);
    updateInput('heirs', next);
  };
  const addHeir = () => {
    const nextId = Math.max(0, ...heirs.map(h => h.id)) + 1;
    // New heir gets a 0% split by default so it doesn't silently steal
    // allocation from existing heirs — the user dials in the split.
    const next = [...heirs, { id: nextId, name: `Heir ${nextId}`, filingStatus: 'Single', income: 100000, splitPct: 0, isSkipPerson: false, relationship: DEFAULT_HEIR_RELATIONSHIP }];
    updateInput('heirs', next);
    setSelectedHeirId(nextId);
  };
  const removeHeir = (id) => {
    if (heirs.length <= 1) return; // always keep at least one heir
    const next = heirs.filter(h => h.id !== id);
    updateInput('heirs', next);
    if (selectedHeirId === id) setSelectedHeirId(next[0].id);
  };
  return (
    <>
    <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Users size={16} style={{ color: 'var(--accent-text)' }} />
      <span>Beneficiary Settings</span>
    </h3>

    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Audit Q-13. The estate is valued at
          plan end in nominal dollars, so the thresholds it is
          measured against have to be carried to the same year.
          On by default; the toggle exists so the unindexed
          comparison stays available. */}
      <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'var(--bg-secondary)' }}>
        <SwitchRow id="toggle-estateIndexingEnabled" labelStyle={{ fontWeight: 600 }} checked={inputs.estateIndexingEnabled !== false} onChange={(on) => updateInput('estateIndexingEnabled', on)}>
          Index estate thresholds for inflation
        </SwitchRow>
        <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
          Your estate is valued in the dollars of your plan&rsquo;s final year, so the exemptions it is
          measured against are carried forward to that year at your Tax Bracket Inflation Rate &mdash; the
          federal and GST exemptions, the state exemptions that are genuinely indexed, and your heirs&rsquo;
          own brackets. State exemptions fixed in statute, like Illinois&rsquo; $4,000,000, deliberately
          stay put. Turn this off to measure a future estate against today&rsquo;s thresholds instead.
        </p>
      </div>
      {/* Charitable bequest. Sits above the heir list because
          it comes off the top: the charity's slice leaves
          before anything is divided, and before the estate is
          taxed. */}
      <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'var(--bg-secondary)' }}>
        <SwitchRow id="toggle-charitableBequestEnabled" labelStyle={{ fontWeight: 600 }} checked={Boolean(inputs.charitableBequestEnabled)} onChange={(on) => updateInput('charitableBequestEnabled', on)}>
          Leave part of the estate to charity
        </SwitchRow>
        <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
          The estate tax deduction for a charitable bequest is <strong>unlimited</strong> &mdash; the only
          lever here without a ceiling. Gifts are capped, and the marital deduction only defers.
        </p>

        {inputs.charitableBequestEnabled && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
              <div>
                <label htmlFor="field-charitableBequestMode" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>How to give</label>
                <select
                  id="field-charitableBequestMode"
                  value={inputs.charitableBequestMode || 'percent'}
                  onChange={(e) => updateInput('charitableBequestMode', e.target.value)}
                  className="form-input"
                  style={{ width: '100%', fontSize: 'var(--fs-xs)' }}
                >
                  <option value="percent">A percentage of the estate</option>
                  <option value="amount">A fixed dollar amount</option>
                </select>
              </div>
              <div>
                {inputs.charitableBequestMode === 'amount' ? (
                  <>
                    <label htmlFor="field-charitableBequestAmount" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Amount ($)</label>
                    <NumberInput
                      id="field-charitableBequestAmount" min="0" step="10000"
                      value={inputs.charitableBequestAmount}
                      onChange={(e) => updateInput('charitableBequestAmount', Math.max(0, e.target.value === '' ? 0 : parseFloat(e.target.value)))}
                      className="form-input" style={{ width: '100%', fontSize: 'var(--fs-xs)' }}
                    />
                  </>
                ) : (
                  <>
                    <label htmlFor="field-charitableBequestPct" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Percent of estate (%)</label>
                    <NumberInput
                      id="field-charitableBequestPct" min="0" max="100" step="1"
                      value={inputs.charitableBequestPct}
                      onChange={(e) => updateInput('charitableBequestPct', Math.max(0, Math.min(100, e.target.value === '' ? 0 : parseFloat(e.target.value))))}
                      className="form-input" style={{ width: '100%', fontSize: 'var(--fs-xs)' }}
                    />
                  </>
                )}
              </div>
            </div>
            {/* Asset location. Separate decision from "how much",
                and it changes the after-tax result on its own:
                a charity pays no income tax on an inherited IRA,
                while an heir pays their marginal rate on every
                dollar of it under the 10-Year Rule. */}
            <div style={{ marginTop: '10px' }}>
              <label htmlFor="field-charitableBequestSource" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Which accounts fund it
              </label>
              <select
                id="field-charitableBequestSource"
                value={inputs.charitableBequestSource || 'proportional'}
                onChange={(e) => updateInput('charitableBequestSource', e.target.value)}
                className="form-input"
                style={{ width: '100%', fontSize: 'var(--fs-xs)' }}
              >
                <option value="proportional">A little from everything (proportional)</option>
                <option value="pretax">Pre-tax first, then taxable, cash and stock &mdash; Roth last</option>
                <option value="taxable">Taxable, cash and stock first &mdash; Roth last</option>
              </select>
              <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
                A charity owes <strong>no income tax</strong> on an inherited IRA. Your heirs owe their own
                marginal rate on every dollar of one. So funding a bequest from <strong>pre-tax</strong> money
                and leaving Roth to your heirs beats the reverse &mdash; same generosity, better outcome.
                A bequest can also be funded from your <strong>cash reserve</strong> and a
                <strong> concentrated stock position</strong>; both reach heirs with a stepped-up basis, so they sit
                alongside the taxable account in these orders. Your home, deferred comp, HSA and life insurance
                are never used &mdash; a house is not liquid at death, and the others pass to their own named
                beneficiaries rather than being the executor&rsquo;s to give.
              </p>
            </div>

            {/* What the choice is actually worth. Without this the
                dropdown is unfalsifiable: a number moves and the
                user has no way to know whether it helped. */}
            {heirTaxResults?.charitableSourceComparison && (() => {
              const cmp = heirTaxResults.charitableSourceComparison;
              const saved = cmp.heirTaxSaved;
              // Rounds to nothing at display precision. Common and
              // not a bug -- if the heirs owe no income tax to begin
              // with, there is nothing for asset location to save.
              // Saying "Saves $0" reads like a broken feature, so
              // explain the reason instead.
              const negligible = Math.abs(saved) < 1;
              const tone = negligible
                ? { fg: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.03)', bd: 'var(--card-border)' }
                : saved > 0
                  ? { fg: 'var(--success)', bg: 'rgba(34,197,94,0.08)', bd: 'rgba(34,197,94,0.2)' }
                  : { fg: 'var(--danger)', bg: 'rgba(248,113,113,0.08)', bd: 'rgba(248,113,113,0.2)' };
              return (
                <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: tone.bg, border: `1px solid ${tone.bd}` }}>
                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: tone.fg }}>
                    {negligible
                      ? 'No difference for this plan'
                      : `${saved > 0 ? 'Saves' : 'Costs an extra'} ${formatCurrency(Math.abs(saved))} in heir income tax`}
                  </div>
                  <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
                    {negligible ? (
                      <>
                        Your heirs owe little or no income tax on this estate as it stands, so there is nothing for
                        asset location to save. It starts to matter once there is enough pre-tax money that emptying
                        it under the 10-Year Rule pushes an heir into higher brackets.
                      </>
                    ) : (
                      <>
                        Compared with spreading the same bequest proportionally across every account. This is the
                        figure asset location actually moves. Net inherited changes by{' '}
                        {formatCurrency(Math.abs(cmp.netGainVsProportional))}, but read that one with care: this
                        model grows an inherited IRA over the 10-year withdrawal window while treating Roth,
                        Taxable, cash and a stock position as paid out at once, so it credits pre-tax with growth
                        the others don&rsquo;t get and understates the gain from giving pre-tax away.
                      </>
                    )}
                  </p>
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Heirs list — name, filing status, income, and % split of the ending portfolio */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ marginBottom: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', fontWeight: '500' }}>
            Heirs
          </label>
          {equalSplit ? (
            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', fontWeight: '600' }}>
              {heirs.length === 1 ? 'One heir: the whole estate' : `Equal shares: ${equalShareLabel} each`}
            </span>
          ) : (
            <span style={{ fontSize: 'var(--fs-2xs)', color: heirSplitTotal === 100 ? 'var(--text-muted)' : 'var(--danger)', fontWeight: '600' }}>
              Split total: {heirSplitTotal.toFixed(0)}%{heirSplitTotal !== 100 ? ' (auto-normalized to 100%)' : ''}
            </span>
          )}
        </div>
        {/* Changelog 259: equal is the default so three children never
            read as 33 + 33 + 33 = 99 with 1% adrift; custom exposes the
            per-heir Split % fields. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <label htmlFor="toggle-heirSplitMode" style={{ marginBottom: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', fontWeight: '500', cursor: 'pointer' }}>
            Split the estate equally among heirs
          </label>
          <span className="custom-switch">
            <input
              id="toggle-heirSplitMode"
              type="checkbox"
              checked={equalSplit}
              onChange={(e) => updateInput('heirSplitMode', e.target.checked ? 'equal' : 'custom')}
            />
            <span className="slider-round"></span>
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {heirs.map(h => (
            <div
              key={h.id}
              onClick={() => setSelectedHeirId(h.id)}
              style={{
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid ' + (selectedHeirId === h.id ? 'var(--accent-primary)' : 'var(--card-border)'),
                backgroundColor: selectedHeirId === h.id ? 'rgba(78,130,195,0.10)' : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  aria-label="Heir name"
                  value={h.name}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateHeirField(h.id, 'name', e.target.value)}
                  className="form-input"
                  style={{ flex: 1, fontWeight: '600' }}
                />
                {heirs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeHeir(h.id); }}
                    className="btn-outline"
                    style={{ padding: '4px 8px', minWidth: 'auto', fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <label htmlFor={`heir-filing-${h.id}`} style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Filing Status</label>
                  <select
                    id={`heir-filing-${h.id}`}
                    value={h.filingStatus || 'Single'}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateHeirField(h.id, 'filingStatus', e.target.value)}
                    className="form-input"
                    style={{ width: '100%', fontSize: 'var(--fs-xs)' }}
                  >
                    <option value="Single">Single</option>
                    <option value="MFJ">MFJ</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={`heir-income-${h.id}`} style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Income</label>
                  <NumberInput
                    id={`heir-income-${h.id}`}
                    min="0"
                    step="5000"
                    value={h.income}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateHeirField(h.id, 'income', Math.max(0, e.target.value === '' ? 0 : parseFloat(e.target.value)))}
                    className="form-input"
                    style={{ width: '100%', fontSize: 'var(--fs-xs)' }}
                  />
                </div>
                <div>
                  <label htmlFor={`heir-split-${h.id}`} style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{equalSplit ? 'Share' : 'Split %'}</label>
                  {equalSplit ? (
                    <div id={`heir-split-${h.id}`} className="form-input" style={{ width: '100%', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }} aria-readonly="true">
                      {equalShareLabel}
                    </div>
                  ) : (
                    <NumberInput
                      id={`heir-split-${h.id}`}
                      min="0"
                      max="100"
                      step="5"
                      value={h.splitPct}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateHeirField(h.id, 'splitPct', Math.max(0, e.target.value === '' ? 0 : parseFloat(e.target.value)))}
                      className="form-input"
                      style={{ width: '100%', fontSize: 'var(--fs-xs)' }}
                    />
                  )}
                </div>
                <div>
                  <label htmlFor={`heir-age-${h.id}`} style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Age today</label>
                  <NumberInput
                    id={`heir-age-${h.id}`}
                    min="0"
                    max="110"
                    step="1"
                    placeholder="30 yrs younger"
                    value={h.age === undefined || h.age === null ? '' : h.age}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateHeirField(h.id, 'age', e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="form-input"
                    style={{ width: '100%', fontSize: 'var(--fs-xs)' }}
                  />
                </div>
              </div>
              {/* Relationship. This is not cosmetic: in the five
                  states that levy an inheritance tax it decides
                  which beneficiary class the heir falls into, and
                  the spread is enormous — in Pennsylvania a child
                  pays 4.5% and a friend pays 15%; in New Jersey a
                  child pays nothing and a niece pays 15-16%. It
                  is shown for every plan (not just those five
                  states) so that a user who later moves, or who
                  is comparing states, does not have to go back
                  and re-answer it. */}
              {/* Where the heir lives: the income tax on the
                  10-year IRA drawdown is the heir's own state's, unlike the
                  estate and inheritance tax, which follow the estate. */}
              {(() => {
                const heirState = (h.state || '').toUpperCase();
                const effective = heirState || (estateState || '').toUpperCase();
                const jurisdiction = effective ? stateTaxJurisdictionFor(effective) : 'none';
                const note = !effective ? null
                  : jurisdiction === 'none' ? `${US_STATE_NAME[effective] || effective} has no income tax, so the inherited IRA withdrawals owe none there.`
                  : jurisdiction === 'flat_5' ? `${US_STATE_NAME[effective] || effective} income tax is priced at a flat rate on the inherited IRA withdrawals; set the rate to the bracket the heir will be in.`
                  : `${US_STATE_NAME[effective] || effective} income tax on the inherited IRA withdrawals uses the state's own schedule.`;
                return (
                  <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: jurisdiction === 'flat_5' ? '2fr 1fr' : '1fr', gap: '8px' }}>
                    <div>
                      <label htmlFor={`heir-state-${h.id}`} style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        State the heir lives in
                      </label>
                      <select
                        id={`heir-state-${h.id}`}
                        value={heirState}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateHeirField(h.id, 'state', e.target.value)}
                        className="form-input"
                        style={{ width: '100%', fontSize: 'var(--fs-xs)' }}
                      >
                        <option value="">Same as the estate{estateState ? ` (${US_STATE_NAME[estateState] || estateState})` : ''}</option>
                        {US_STATES.map(([code, name]) => (
                          <option key={code} value={code}>{name}</option>
                        ))}
                      </select>
                    </div>
                    {jurisdiction === 'flat_5' && (
                      <div>
                        <label htmlFor={`heir-state-rate-${h.id}`} style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>State rate (%)</label>
                        <NumberInput
                          id={`heir-state-rate-${h.id}`}
                          min="0"
                          max="20"
                          step="0.1"
                          value={h.stateTaxFlatRate !== undefined && h.stateTaxFlatRate !== '' ? h.stateTaxFlatRate : 5}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateHeirField(h.id, 'stateTaxFlatRate', e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)))}
                          className="form-input"
                          style={{ width: '100%', fontSize: 'var(--fs-xs)' }}
                        />
                      </div>
                    )}
                    {note && (
                      <div style={{ gridColumn: '1 / -1', fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', lineHeight: 1.4 }}>{note}</div>
                    )}
                  </div>
                );
              })()}
              <div style={{ marginTop: '8px' }}>
                <label htmlFor={`heir-rel-${h.id}`} style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Relationship to you
                </label>
                <select
                  id={`heir-rel-${h.id}`}
                  value={h.relationship || DEFAULT_HEIR_RELATIONSHIP}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateHeirField(h.id, 'relationship', e.target.value)}
                  className="form-input"
                  style={{ width: '100%', fontSize: 'var(--fs-xs)' }}
                >
                  {HEIR_RELATIONSHIPS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                {(() => {
                  const stateCode = estateState;
                  if (!STATE_INHERITANCE_SCHEDULES[stateCode]) return null;
                  const rel = h.relationship || DEFAULT_HEIR_RELATIONSHIP;
                  const topRate = inheritanceTopRateFor(stateCode, rel);
                  const label = (HEIR_RELATIONSHIPS.find((r) => r.value === rel) || {}).label || '';
                  return (
                    <div style={{ marginTop: '6px', fontSize: 'var(--fs-2xs)', color: topRate > 0 ? 'var(--warning)' : 'var(--text-muted)', lineHeight: 1.5 }}>
                      {topRate > 0
                        ? <>{stateCode} charges an inheritance tax of up to <strong>{(topRate * 100).toFixed(topRate * 100 % 1 === 0 ? 0 : 1)}%</strong> on a bequest to a {label.toLowerCase()}, paid by them rather than by your estate.</>
                        : <>{stateCode} levies an inheritance tax, but a {label.toLowerCase()} is <strong>exempt</strong> from it.</>}
                    </div>
                  );
                })()}
              </div>
              {/* Generation-skipping. A checkbox rather than a
                  generation dropdown because the tax only cares
                  about one boundary: two or more generations
                  below you. A child is not a skip person; a
                  grandchild is. */}
              <SwitchRow id={`heir-skip-${h.id}`} size="xs" style={{ marginTop: '8px' }} labelStyle={{ color: 'var(--text-muted)' }} stopPropagation checked={Boolean(h.isSkipPerson)} onChange={(on) => updateHeirField(h.id, 'isSkipPerson', on)}>
                Grandchild or younger (generation-skipping)
              </SwitchRow>
              {h.isSkipPerson && (
                <div style={{ marginTop: '6px', fontSize: 'var(--fs-2xs)', color: 'var(--warning)', lineHeight: 1.5 }}>
                  Their share may be taxed <strong>twice</strong> &mdash; estate tax, then generation-skipping
                  transfer tax at 40% on anything above a $15M exemption that, unlike the estate exemption,
                  <strong> cannot be doubled for a married couple</strong>.
                </div>
              )}

              <div style={{ marginTop: '8px' }}>
                <label htmlFor={`heir-strategy-${h.id}`} style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Withdrawal Strategy
                </label>
                <select
                  id={`heir-strategy-${h.id}`}
                  value={h.distributionStrategy || 'default'}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateHeirField(h.id, 'distributionStrategy', e.target.value === 'default' ? undefined : e.target.value)}
                  className="form-input"
                  style={{ width: '100%', fontSize: 'var(--fs-xs)' }}
                >
                  <option value="default">Plan Default ({strategyLabels[inputs.heirDistributionStrategy] || 'Annual RMDs + Yr 10'})</option>
                  <option value="rmd_10">Annual RMDs, balance in Year 10 (the rule)</option>
                  <option value="flat_10">Flat 10-Year Withdrawals</option>
                  <option value="lump_sum_start">Lump Sum (Year 1)</option>
                  <option value="lump_sum_end">Lump Sum (Year 10)</option>
                </select>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addHeir} className="btn-outline" style={{ marginTop: '10px', width: '100%', padding: '8px', fontSize: 'var(--fs-sm)' }}>
          + Add Heir
        </button>
      </div>

      {/* Heir Distribution Strategy */}
      <div>
        <label style={{ display: 'block', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '500' }}>
          Plan Default: Inherited IRA Withdrawal Strategy
        </label>
        <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: 0, marginBottom: '8px', lineHeight: '1.4' }}>
          With multiple heirs, the 10-Year Rule splits the account into a separate inherited IRA per heir — each one can legally choose their own withdrawal pattern, independent of the others. This is the default applied to every heir below; override it per-heir in that heir's own "Withdrawal Strategy" dropdown if you expect them to act differently.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            className={`clickable-card ${inputs.heirDistributionStrategy === 'rmd_10' ? 'active' : ''}`}
            onClick={() => updateInput('heirDistributionStrategy', 'rmd_10')}
            style={{
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid ' + (inputs.heirDistributionStrategy === 'rmd_10' ? 'var(--accent-primary)' : 'var(--card-border)'),
              backgroundColor: inputs.heirDistributionStrategy === 'rmd_10' ? 'rgba(78,130,195,0.10)' : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ fontWeight: '600', fontSize: 'var(--fs-body)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Annual RMDs, balance in Year 10</span>
              {inputs.heirDistributionStrategy === 'rmd_10' && <span style={{ color: 'var(--accent-text)', fontSize: 'var(--fs-xs)' }}>Active</span>}
            </div>
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.4' }}>
              What the 2024 final regulations actually require when the owner was past their RMD age at death: the heir takes a required minimum each year in years 1&ndash;9 (balance &divide; their single-life expectancy, using their age the year after your death and shrinking by one each year) and empties the account in year 10. The minimums are small, so most of the balance still lands in year 10. If the owner died before their RMD age nothing is required until year 10.
            </p>
          </div>

          <div 
            className={`clickable-card ${inputs.heirDistributionStrategy === 'flat_10' ? 'active' : ''}`}
            onClick={() => updateInput('heirDistributionStrategy', 'flat_10')}
            style={{ 
              padding: '10px', 
              borderRadius: '8px', 
              border: '1px solid ' + (inputs.heirDistributionStrategy === 'flat_10' ? 'var(--accent-primary)' : 'var(--card-border)'),
              backgroundColor: inputs.heirDistributionStrategy === 'flat_10' ? 'rgba(78,130,195,0.10)' : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ fontWeight: '600', fontSize: 'var(--fs-body)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Flat 10-Year Withdrawals</span>
              {inputs.heirDistributionStrategy === 'flat_10' && <span style={{ color: 'var(--accent-text)', fontSize: 'var(--fs-xs)' }}>Active</span>}
            </div>
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.4' }}>
              Draws the account down evenly over 10 years (recalculated each year as balance ÷ years remaining, so growth on what's still held is fully distributed by year 10). Best for smoothing tax bracket bumps.
            </p>
          </div>

          <div 
            className={`clickable-card ${inputs.heirDistributionStrategy === 'lump_sum_start' ? 'active' : ''}`}
            onClick={() => updateInput('heirDistributionStrategy', 'lump_sum_start')}
            style={{ 
              padding: '10px', 
              borderRadius: '8px', 
              border: '1px solid ' + (inputs.heirDistributionStrategy === 'lump_sum_start' ? 'var(--accent-primary)' : 'var(--card-border)'),
              backgroundColor: inputs.heirDistributionStrategy === 'lump_sum_start' ? 'rgba(78,130,195,0.10)' : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ fontWeight: '600', fontSize: 'var(--fs-body)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Lump Sum (Year 1)</span>
              {inputs.heirDistributionStrategy === 'lump_sum_start' && <span style={{ color: 'var(--accent-text)', fontSize: 'var(--fs-xs)' }}>Active</span>}
            </div>
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.4' }}>
              Withdraws 100% of pre-tax assets immediately in Year 1. Generates severe bracket blowup.
            </p>
          </div>

          <div 
            className={`clickable-card ${inputs.heirDistributionStrategy === 'lump_sum_end' ? 'active' : ''}`}
            onClick={() => updateInput('heirDistributionStrategy', 'lump_sum_end')}
            style={{ 
              padding: '10px', 
              borderRadius: '8px', 
              border: '1px solid ' + (inputs.heirDistributionStrategy === 'lump_sum_end' ? 'var(--accent-primary)' : 'var(--card-border)'),
              backgroundColor: inputs.heirDistributionStrategy === 'lump_sum_end' ? 'rgba(78,130,195,0.10)' : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ fontWeight: '600', fontSize: 'var(--fs-body)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Lump Sum (Year 10)</span>
              {inputs.heirDistributionStrategy === 'lump_sum_end' && <span style={{ color: 'var(--accent-text)', fontSize: 'var(--fs-xs)' }}>Active</span>}
            </div>
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.4' }}>
              Defers distribution to Year 10, growing the whole balance at your retirement return rate the entire time. Ends up larger than the original inherited amount, but that bigger balance lands as one lump sum, which triggers a much bigger terminal tax drag. <strong>Only permitted if the owner died before their RMD age</strong> &mdash; otherwise annual minimums are mandatory and the plan uses the Annual RMDs schedule instead (the heir card says so).
            </p>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
