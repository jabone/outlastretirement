import React, { useState } from 'react';
import { useSimulation } from '../context/useSimulation';
import { X, Zap, Clock } from 'lucide-react';
import HoverTooltip from './HoverTooltip';
import { recordPortfolioUpdate } from '../utils/dataFreshness';
import { planVerdict, verdictColor } from '../utils/planVerdict';
import NumberInput from './NumberInput';
import ModalShell from './ModalShell';

const LAST_UPDATE_KEY = 'retire_plan_last_quick_update';

function formatLastUpdated(iso) {
  if (!iso) return "You haven't used Quick Update yet";
  try {
    const d = new Date(iso);
    return `Last updated ${d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
  } catch {
    return '';
  }
}

// Hoisted to module scope (outside QuickUpdate) so its function identity is
// stable across renders. Defining a component inside another component's
// body -- as this used to be -- creates a brand-new function every render;
// React then treats each render's version as a different component type and
// unmounts/remounts the underlying <input> DOM node instead of just updating
// it. Since typing a digit triggers updateInput -> a re-render of
// QuickUpdate, that remount was happening on every single keystroke, which
// is what dropped focus after each character. Taking value/onChange as
// props instead of closing over inputs/handleNumberChange from the parent
// scope keeps this decoupled now that it's no longer nested.
// KNOWN_ISSUES.md issue #2 fix: this component is instantiated many times
// per render (one per stat), so its label/input pairing needs a fresh,
// collision-free id per instance -- useId() rather than a fixed string,
// same reasoning as InterviewTab.jsx's Field/ToggleRow.
const Field = ({ label, value, onChange, min = 0, max, money = false }) => {
  const fieldId = React.useId();
  return (
    <div className="form-group" style={{ marginBottom: 0, minWidth: 0 }}>
      <label htmlFor={fieldId}>{label}</label>
      <NumberInput id={fieldId}
        commas={money}
        min={min}
        max={max}
        className="form-input"
        style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
        value={value ?? ''}
        onChange={onChange}
      />
    </div>
  );
};

// Quick Update: a lightweight panel exposing only the numbers people actually
// revisit often (account balances, salary, retirement age, Social Security
// claiming age, and optionally SS benefit estimates) so a routine "update my
// numbers" doesn't require navigating the full Plan Settings / Tax & Estate /
// Optimizers pages.
const QuickUpdate = ({ onClose }) => {
  const { inputs, updateInput, kpis, verdict: sharedVerdict } = useSimulation();
  const verdict = sharedVerdict || planVerdict({ isSuccessful: kpis?.isSuccessful });
  const [showSS, setShowSS] = useState(false);
  const lastUpdated = typeof window !== 'undefined' ? localStorage.getItem(LAST_UPDATE_KEY) : null;

  const handleNumberChange = (key) => (e) => {
    const raw = e.target.value;
    const val = raw === '' ? '' : parseFloat(raw);
    updateInput(key, raw === '' ? '' : (isNaN(val) ? 0 : val));
  };

  const handleDone = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAST_UPDATE_KEY, new Date().toISOString());
    }
    // A Quick Update session IS the balance-only user's version of
    // reconciling with a statement, so it satisfies the portfolio-
    // freshness reminder too (dataFreshness.js). Only "Done" counts --
    // closing with X updated nothing.
    recordPortfolioUpdate();
    onClose();
  };

  // Rendered via createPortal to document.body -- see DividendLedgerModal.jsx's
  // comment for why: a .glass-panel ancestor's backdrop-filter otherwise
  // turns this modal's position:fixed into being relative to that (possibly
  // very tall, scrolled-down) panel instead of the real viewport.
  return (
    <ModalShell onClose={onClose} labelledBy="quick-update-title" zIndex={1300} style={{ maxWidth: '520px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 id="quick-update-title" style={{ fontSize: '19px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
              <Zap size={18} style={{ color: 'var(--accent-text)' }} />
              Quick Update
            </h3>
            <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', margin: '6px 0 0', lineHeight: '1.4' }}>
              Just the numbers that actually change day to day. Everything else in your plan stays exactly as it is.
            </p>
          </div>
          <HoverTooltip text="Close">
            <button
              onClick={onClose}
              aria-label="Close"
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, flexShrink: 0 }}
            >
              <X size={20} />
            </button>
          </HoverTooltip>
        </div>

        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', margin: '10px 0 22px' }}>
          <Clock size={12} />
          <span>{formatLastUpdated(lastUpdated)}</span>
        </div>

        <h4 style={{ fontSize: 'var(--fs-sm)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: '0 0 12px', fontWeight: '700' }}>
          Account Balances
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '14px', marginBottom: '22px' }}>
          <Field label="Pre-Tax (401k/IRA)" value={inputs.preTaxInit} onChange={handleNumberChange('preTaxInit')} money />
          <Field label="Roth" value={inputs.rothInit} onChange={handleNumberChange('rothInit')} money />
          <Field label="Taxable Brokerage" value={inputs.taxableInit} onChange={handleNumberChange('taxableInit')} money />
        </div>

        <h4 style={{ fontSize: 'var(--fs-sm)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: '0 0 12px', fontWeight: '700' }}>
          Income
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: inputs.spouse2Enabled ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: '14px', alignItems: 'end' }}>
          <Field label={`${inputs.spouse1Name || 'Your'} Salary ($/yr)`} value={inputs.salary1} onChange={handleNumberChange('salary1')} money />
          {inputs.spouse2Enabled && (
            <Field label={`${inputs.spouse2Name || 'Spouse'} Salary ($/yr)`} value={inputs.salary2} onChange={handleNumberChange('salary2')} money />
          )}
        </div>

        <h4 style={{ fontSize: 'var(--fs-sm)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: '22px 0 12px', fontWeight: '700' }}>
          Retirement Timeline
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: inputs.spouse2Enabled ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: '14px', alignItems: 'end' }}>
          <Field
            label={`${inputs.spouse1Name || 'Your'} Retirement Age`}
            value={inputs.retireAge1}
            onChange={handleNumberChange('retireAge1')}
            min={40} max={90}
          />
          {inputs.spouse2Enabled && (
            <Field
              label={`${inputs.spouse2Name || 'Spouse'} Retirement Age`}
              value={inputs.retireAge2}
              onChange={handleNumberChange('retireAge2')}
              min={40} max={90}
            />
          )}
          <Field
            label={`${inputs.spouse1Name || 'Your'} SS Claiming Age`}
            value={inputs.claimingAge1}
            onChange={handleNumberChange('claimingAge1')}
            min={62} max={70}
          />
          {inputs.spouse2Enabled && (
            <Field
              label={`${inputs.spouse2Name || 'Spouse'} SS Claiming Age`}
              value={inputs.claimingAge2}
              onChange={handleNumberChange('claimingAge2')}
              min={62} max={70}
            />
          )}
        </div>

        <button
          onClick={() => setShowSS(!showSS)}
          className="btn-outline"
          style={{ width: '100%', padding: '10px 16px', fontSize: 'var(--fs-body)', minHeight: 'auto', marginTop: '16px' }}
        >
          {showSS ? 'Hide Social Security benefit estimates' : 'Also update Social Security benefit estimates'}
        </button>

        {showSS && (
          <div style={{ display: 'grid', gridTemplateColumns: inputs.spouse2Enabled ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: '14px', marginTop: '16px' }}>
            <Field label={`${inputs.spouse1Name || 'Your'} SS at FRA ($/yr)`} value={inputs.ss1} onChange={handleNumberChange('ss1')} money />
            {inputs.spouse2Enabled && (
              <Field label={`${inputs.spouse2Name || 'Spouse'} SS at FRA ($/yr)`} value={inputs.ss2} onChange={handleNumberChange('ss2')} money />
            )}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            margin: '22px 0',
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--card-border)',
          }}
        >
          <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>Updated plan status</span>
          <strong style={{ color: verdictColor(verdict.tone) }}>
            {verdict.label}
          </strong>
        </div>

        <button className="btn-primary" style={{ width: '100%' }} onClick={handleDone}>
          Done
        </button>
    </ModalShell>
  );
};

export default QuickUpdate;
