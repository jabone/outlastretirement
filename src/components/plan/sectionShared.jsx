// Shared building blocks of the Plan form, extracted verbatim from
// SettingsTab.jsx in IA Phase 3 step 1 (2026-09-24) so that the section
// components under ./sections and, in step 2, the guided Interview can use
// the same pieces. No behavior change.
import { MONTH_NAMES, paymentMonths, spendingCalendar } from '../../utils/spendingCalendar';
import MaximizeButton from '../MaximizeButton';
import { SPENDING_CADENCES, SPENDING_CATEGORIES, SPENDING_HEALTH_BRIDGE_ID, essentialShareOf, readSpendingBlueprint, spendingBlueprintDerived } from '../../calculator';
import { spendingCadence } from '../../utils/spendingCadence';
import React, { useState, useRef, useLayoutEffect } from 'react';
import { isGuidedCore, stripSpouseSuffix } from '../../config/guidedCore';
import NumberInput from '../NumberInput';
import PremiumMount from '../../premium/PremiumMount';

// Clickable section header used to collapse the less-frequently-touched
// parts of the settings pages. Defaults to collapsed for advanced sections
// so a routine visit isn't a wall of every possible input.
const CollapsibleHeader = ({ title, icon, isOpen, onToggle, style }) => (
  // A clickable heading is only half a control: it needs to be reachable
  // and operable from the keyboard too, and to say whether it is open
  // (changelog 223). Every section in this file uses this one component,
  // so they all get it at once.
  <h3
    role="button"
    tabIndex={0}
    aria-expanded={isOpen}
    onClick={onToggle}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
    }}
    style={{
      fontSize: '15px', fontWeight: '600', margin: '24px 0 16px 0',
      borderBottom: '1px solid var(--card-border)', paddingBottom: '8px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      cursor: 'pointer', userSelect: 'none', ...style,
    }}
  >
    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{icon}{title}</span>
    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
      ▾
    </span>
  </h3>
);

// Shared shell for every Plan Settings sub-tab panel. Replaces the two
// near-identical hand-rolled glass-panel + maximize-button blocks that
// previously wrapped "Basic Parameters" and "Initial Balances" -- with
// eight domain sub-tabs (IA Phase 3) that duplication would have been
// eight copies. `id` keys the maximize state so each panel zooms
// independently, exactly as the two originals did.
const SettingsPanel = ({ id, title, maximizedComponent, setMaximizedComponent, children }) => {
  const key = `settings-${id}`;
  const isMax = maximizedComponent === key;
  return (
    <div
      className={`glass-panel ${isMax ? 'maximized-modal' : ''}`}
      style={isMax ? {
        position: 'fixed', top: '20px', left: '20px', right: '20px', bottom: '20px', zIndex: 10000,
        overflowY: 'auto', padding: '30px', backgroundColor: 'rgba(15, 15, 25, 0.98)',
        border: '1px solid var(--accent-primary)', boxShadow: '0 0 50px rgba(0,0,0,0.8)',
      } : { padding: '24px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>{title}</h2>
        <MaximizeButton target={key} current={maximizedComponent} setMaximizedComponent={setMaximizedComponent} />
      </div>
      {children}
    </div>
  );
};

// Rung 1 of the Retirement Spending module (changelog 134).
//
// Auto mode has always computed what the household has left to spend --
// income, minus tax, minus what they saved -- on every pre-retirement year.
// It was never shown. A user in auto mode (the default) saw a paragraph
// describing the arithmetic and no number, which is a strange thing to do
// with the one figure that answers "how much do I actually need a month?".
//
// Shown WITH its derivation rather than as a bare total, for two reasons:
// a residual is only as trustworthy as the inputs behind it, and seeing the
// four lines is what lets someone spot that their contributions or tax
// figures are wrong. The caveats are on the page for the same reason -- a
// number this load-bearing should not have its limitations buried in Help.
const CurrentSpendingResidual = ({ breakdown, formatCurrency }) => {
  if (!breakdown) {
    return (
      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
        Auto: recalculated every pre-retirement year as (salary + pensions/other income) &minus; taxes &minus; savings contributions. This plan starts already retired, so there is no working year to derive it from.
      </div>
    );
  }

  const monthly = breakdown.derived / 12;
  const row = (label, value, sign) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '5px 0' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {sign}{formatCurrency(value)}
      </span>
    </div>
  );

  return (
    <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
      <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
        What you have left to spend today
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <span style={{ fontSize: '26px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {formatCurrency(breakdown.derived)}
        </span>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
          a year &mdash; about <strong>{formatCurrency(monthly)}</strong> a month
        </span>
      </div>

      <div style={{ fontSize: 'var(--fs-2xs)', borderTop: '1px solid var(--card-border)', paddingTop: '10px' }}>
        {row('Income (salary, pensions, other)', breakdown.income, '')}
        {row('Taxes', breakdown.taxes, '\u2212 ')}
        {row('Savings and contributions', breakdown.contributions, '\u2212 ')}
        {breakdown.nonCashAdjustments > 0.005 &&
          row('Vested shares kept, and harvesting adjustment', breakdown.nonCashAdjustments, '\u2212 ')}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '8px 0 0', marginTop: '4px', borderTop: '1px solid var(--card-border)', fontWeight: 700 }}>
          <span>What is left</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatCurrency(breakdown.derived)}</span>
        </div>
        {breakdown.debtPayments > 0.005 && (
          <>
            {row('Of that, mortgage and debt payments', breakdown.debtPayments, '')}
            {row('Left for everything else', Math.max(0, breakdown.derived - breakdown.debtPayments), '')}
          </>
        )}
      </div>

      {breakdown.trimmedByDeficit > 0.005 && (
        <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', lineHeight: '1.5', margin: '12px 0 0' }}>
          Note: the plan could not fund this in full and trimmed{' '}
          <strong>{formatCurrency(breakdown.trimmedByDeficit)}</strong> of it to balance the year. The figure above is what
          the income would have supported; the plan actually spends{' '}
          <strong>{formatCurrency(breakdown.applied + (breakdown.debtPayments || 0))}</strong>.
        </p>
      )}

      <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', lineHeight: '1.5', margin: '12px 0 0' }}>
        This is money in, minus money that provably was not spent &mdash; so it cannot miss a category the way a
        budget built up from categories can. Two things to know before you trust it. It is a <strong>residual</strong>,
        so every error in your salary, tax or contribution figures lands in it. And it <strong>absorbs
        one-off years</strong>: if this year included a new car or a new roof, it reads as ordinary spending. If either
        applies, turn on the toggle above and enter a figure you trust instead.
      </p>
    </div>
  );
};

// Rung 2 of the Retirement Spending module (changelog 135): the bridge from
// what you spend today to a defensible Annual Lifestyle Spending figure.
//
// The arithmetic lives in calculator.js (computeSpendingBridge) so this
// renders numbers rather than deriving them. What this file owns is the part
// that is actually hard to get right: making it obvious WHY the answer is
// smaller than people expect, and what the plan is modeling instead.
//
// Premium. A free user gets an explanation and their own starting figure --
// deliberately with nothing to fill in, so nobody does the work and then
// meets a paywall.
const SpendingBridgePanel = ({ formatCurrency, residual, setActiveTab }) => {
  const heading = (
    <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '24px 0 16px 0', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
      Turn that into a retirement target
    </h3>
  );

  const locked = (
    <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 12px' }}>
        What you spend today is not your retirement target. Some of it stops &mdash; commuting, work lunches, dues.
        Some of it the plan already counts on its own separate lines, and leaving those inside your target charges
        them <strong>twice</strong>, every year: your mortgage, health coverage before 65, Medicare and IRMAA after it,
        and long-term care.
      </p>
      {residual > 0 && (
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 12px' }}>
          The bridge starts from your <strong>{formatCurrency(residual)}</strong> above and walks it down to a figure
          you can defend line by line &mdash; then tells you where each excluded cost lives instead.
        </p>
      )}
      <button className="btn-outline" style={{ padding: '6px 12px', fontSize: 'var(--fs-xs)' }} onClick={() => setActiveTab('premium')}>
        Part of Premium &mdash; see what it includes
      </button>
    </div>
  );
  return (
    <>
      {heading}
      <PremiumMount id="spendingBridge" locked={locked} residual={residual} />
    </>
  );
};

// Rung 3 of the Retirement Spending module (changelog 137): the category
// ledger. FREE -- the essential/discretionary checkbox is here, but what
// READS it (the income floor, floor-aware guardrails) is the paid part and
// comes later, so the upsell can quote the user their own numbers.
//
// The engine is untouched by this. Exactly like the twelve monthly boxes,
// the ledger sums to `lifestyleExpense` at edit time and calculator.js only
// ever reads that annual total.
//
// It also OWNS two existing fields while active, because a category ledger
// states the same facts they do and leaving both live double-counts:
// housingExpensePct (a blend weight) and healthcareBridgeCost (which is
// ADDITIVE, per living spouse under 65, in exactly the pre-65 years the ACA
// cliff logic is most sensitive to). Unlink is not entitlement-gated and
// never destroys the ledger -- the initialBalancesSource safety property.
const SpendingLedgerPanel = ({ inputs, updateInput, formatCurrency, projection }) => {
  // Above the early return below, because a hook cannot live behind a
  // condition: the panel renders a short invitation when the ledger is off.
  const [hoverMonth, setHoverMonth] = useState(null);
  const blueprint = readSpendingBlueprint(inputs.spendingBlueprint);
  const derived = spendingBlueprintDerived(inputs.spendingBlueprint);
  const active = inputs.lifestyleExpenseInputMode === 'categories';

  // One write per edit: the ledger, then whatever it owns. calculator.js
  // never reads the ledger, so these derived values ARE the contract.
  const commit = (nextBlueprint) => {
    updateInput('spendingBlueprint', nextBlueprint);
    const d = spendingBlueprintDerived(nextBlueprint);
    if (!d) return;
    updateInput('lifestyleExpense', Math.round(d.lifestyleExpense));
    if (d.owns.housingExpensePct) updateInput('housingExpensePct', Math.round(d.housingExpensePct * 10) / 10);
    if (d.owns.healthcareBridgeCost) {
      updateInput('healthcareBridgeCost', Math.round(d.healthcareBridgeCost));
      // A typed bridge line is the household's own figure (changelog 469).
      updateInput('healthcareBridgeSource', 'manual');
      if (d.healthcareBridgePremiumPct !== undefined) {
        updateInput('healthcareBridgePremiumPct', Math.round(d.healthcareBridgePremiumPct));
      }
    }
  };

  const setLines = (lines) => commit({ ...blueprint, lines });

  const addLine = (categoryId) => setLines([
    ...blueprint.lines,
    { id: `l${Date.now()}${Math.random().toString(36).slice(2, 6)}`, categoryId, label: '', amount: 0, source: 'manual' },
  ]);

  const editLine = (id, patch) => setLines(blueprint.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id) => setLines(blueprint.lines.filter((l) => l.id !== id));

  const toggleEssential = (categoryId) => {
    const has = blueprint.essentialCategoryIds.includes(categoryId);
    commit({
      ...blueprint,
      essentialCategoryIds: has
        ? blueprint.essentialCategoryIds.filter((c) => c !== categoryId)
        : [...blueprint.essentialCategoryIds, categoryId],
    });
  };

  if (!active) {
    return (
      <div style={{ marginTop: '10px' }}>
        <button
          className="btn-outline"
          style={{ padding: '6px 12px', fontSize: 'var(--fs-xs)' }}
          onClick={() => {
            updateInput('lifestyleExpenseInputMode', 'categories');
            if (blueprint.lines.length === 0) {
              // Seed one line per category at zero so the ledger opens as a
              // form to fill in rather than an empty box with an Add button.
              setLines(SPENDING_CATEGORIES.map((c, i) => ({
                id: `seed-${c.id}-${i}`, categoryId: c.id, label: '', amount: 0, source: 'manual',
              })));
            }
          }}
        >
          Break it down by category instead
        </button>
        <span style={{ display: 'block', fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '6px' }}>
          Seven categories, and your existing figure stays put until you change it. Free.
        </span>
      </div>
    );
  }

  const linesFor = (categoryId) => blueprint.lines.filter((l) => l.categoryId === categoryId);

  // Cadence and the tax on top, both read rather than re-derived.
  const cadence = spendingCadence(inputs, projection);
  // When the year's bills actually fall due. Within-year only -- the plan
  // is annual and cannot see this.
  const calendar = spendingCalendar(inputs);

  // Two groups that wrap as units (changelog 222). What a line IS -- its
  // name and its yearly amount -- stays together on the first line, and
  // when it is paid follows on the second once the column is too narrow to
  // hold all five controls. Before this the five fought for one row and the
  // name lost, which is how a budget ends up full of lines called "Joh".
  // What the box means (changelog 224). A person enters what they PAY:
  // "$3,000, quarterly" is three thousand dollars four times a year, not
  // three thousand carved into four. So the input shows the per-payment
  // figure and the row says what that comes to in a year.
  //
  // Storage is unchanged -- the line still holds the ANNUAL total, which is
  // what every consumer of the ledger has always read and what keeps every
  // saved plan worth exactly what it was worth. The box is a view of it:
  // divide coming in, multiply going out, and round the stored figure to
  // the cent so a legacy $1,000-a-year line shown as $83.33 a month cannot
  // drift to $999.96 the moment anything is touched.
  const round2 = (v) => Math.round(v * 100) / 100;

  const lineRow = (l) => {
    const payments = paymentMonths(l.cadence, l.dueMonth).length;
    const perPayment = round2(l.amount / payments);
    return (
      <div key={l.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: '1 1 250px', minWidth: '220px' }}>
          <input
            aria-label={`Label for line ${l.id}`}
            className="form-input"
            style={{ flex: '1 1 140px', minWidth: '120px' }}
            placeholder="what it is (optional)"
            value={l.label}
            onChange={(e) => editLine(l.id, { label: e.target.value })}
          />
          {/* step="any": a per-payment figure can carry cents ($1,000 a
              year paid monthly is $83.33), and a step of 50 would make the
              field's own value invalid. */}
          <NumberInput
            aria-label={`Amount per payment for line ${l.id}`}
            className="form-input amount-input"
            style={{ flex: '0 0 120px', width: '120px' }}
            step="any"
            min="0"
            value={perPayment}
            onChange={(e) => {
              const v = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
              editLine(l.id, { amount: round2(v * payments) });
            }}
          />
        </div>
        {/* How often it is actually paid (changelog 221), and what that adds
            up to over the year — said on every line, monthly included,
            because "×12" is exactly the sum a reader would otherwise be
            doing in their head. */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: '1 1 230px', minWidth: '200px' }}>
          <select
            aria-label={`How often line ${l.id} is paid`}
            className="form-input"
            style={{ flex: '0 0 160px', width: '160px', paddingLeft: '12px' }}
            value={l.cadence}
            // Changing HOW you pay does not change WHAT the year costs: a
            // $7,000 tax bill moved to quarterly is four payments of
            // $1,750, not four of $7,000. The box updates to show the new
            // per-payment figure, which is also how the meaning of the box
            // teaches itself.
            onChange={(e) => editLine(l.id, { cadence: e.target.value })}
          >
            {SPENDING_CADENCES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          {l.cadence !== 'monthly' && (
            <select
              aria-label={`Month line ${l.id} is first due`}
              className="form-input"
              style={{ flex: '0 0 96px', width: '96px', paddingLeft: '12px' }}
              value={l.dueMonth}
              onChange={(e) => editLine(l.id, { dueMonth: Number(e.target.value) })}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>{name.slice(0, 3)}</option>
              ))}
            </select>
          )}
          {l.amount > 0 && (
            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              &times; {payments} = {formatCurrency(l.amount)}/yr
            </span>
          )}
          <button
            className="btn-outline"
            style={{ padding: '4px 8px', fontSize: 'var(--fs-2xs)', marginLeft: 'auto', flex: '0 0 auto' }}
            aria-label={`Remove line ${l.id}`}
            onClick={() => removeLine(l.id)}
          >
            Remove
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
          Tick <strong>essential</strong> on the categories you could not cut. Nothing reads it yet &mdash; it is what the
          income-floor readout will use.
        </span>
        <button
          className="btn-outline"
          style={{ padding: '4px 10px', fontSize: 'var(--fs-2xs)' }}
          onClick={() => updateInput('lifestyleExpenseInputMode', 'annual')}
        >
          Back to a single annual figure
        </button>
      </div>

      {SPENDING_CATEGORIES.map((cat) => (
        <div key={cat.id} style={{ padding: '10px 0', borderTop: '1px solid var(--card-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 'var(--fs-sm)' }}>{cat.label}</strong>
            <label style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                aria-label={`${cat.label} is essential`}
                checked={blueprint.essentialCategoryIds.includes(cat.id)}
                onChange={() => toggleEssential(cat.id)}
              />
              essential
            </label>
          </div>
          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: '2px 0 8px', lineHeight: 1.5 }}>{cat.hint}</div>
          {linesFor(cat.id).map(lineRow)}
          <button className="btn-outline" style={{ padding: '3px 8px', fontSize: 'var(--fs-2xs)' }} onClick={() => addLine(cat.id)}>
            + line
          </button>
        </div>
      ))}

      <div style={{ padding: '10px 0', borderTop: '1px solid var(--card-border)' }}>
        <strong style={{ fontSize: 'var(--fs-sm)' }}>Health coverage before 65</strong>
        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: '2px 0 8px', lineHeight: 1.5 }}>
          Kept apart from the seven above and <em>not</em> counted in your lifestyle total, because the plan adds it as
          its own line for each spouse under 65. Putting it in both places would charge it twice, in exactly the years
          the ACA subsidy cliff is most sensitive to.
        </div>
        {linesFor(SPENDING_HEALTH_BRIDGE_ID).map(lineRow)}
        <button className="btn-outline" style={{ padding: '3px 8px', fontSize: 'var(--fs-2xs)' }} onClick={() => addLine(SPENDING_HEALTH_BRIDGE_ID)}>
          + line
        </button>
      </div>

      {derived && (
        <div style={{ marginTop: '14px', padding: '14px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontWeight: 700 }}>
            <span>Annual Lifestyle Spending</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(derived.lifestyleExpense)}</span>
          </div>
          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>
            The sum of the seven categories. Switching back to a single annual figure keeps this ledger.
          </div>
          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.6 }}>
            Essential: <strong>{formatCurrency(derived.essentialTotal)}</strong>{' '}
            ({Math.round(derived.essentialShare * 100)}% of the total)
          </div>

          {/* What it costs, in the units people actually think in
              (changelog 218). Same money three ways — nothing here is a
              new assumption, and the plan projects the annual figure
              exactly as before. */}
          {cadence && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-2xs)', marginTop: '10px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '4px 0', fontWeight: 500 }} />
                  <th style={{ padding: '4px 0', textAlign: 'right', fontWeight: 500 }}>A year</th>
                  <th style={{ padding: '4px 0', textAlign: 'right', fontWeight: 500 }}>A month</th>
                  <th style={{ padding: '4px 0', textAlign: 'right', fontWeight: 500 }}>A day</th>
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                {[
                  { label: 'All of it', v: cadence.total },
                  { label: 'The part you could not cut', v: cadence.essential },
                  { label: 'The part that could flex', v: cadence.discretionary },
                ].filter((r) => r.v).map((r) => (
                  <tr key={r.label}>
                    <td style={{ padding: '4px 0' }}>{r.label}</td>
                    <td style={{ padding: '4px 0', textAlign: 'right' }}>{formatCurrency(r.v.annual)}</td>
                    <td style={{ padding: '4px 0', textAlign: 'right' }}>{formatCurrency(r.v.monthly)}</td>
                    <td style={{ padding: '4px 0', textAlign: 'right' }}>{formatCurrency(r.v.daily)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* When it falls due (changelog 221). One series, one hue, thin
              marks; only the heaviest and lightest months are labeled,
              because a number on all twelve is noise. The year's total is
              unchanged — this is the same money, arranged by month. */}
          {calendar && calendar.lumpy && (
            <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--card-border)' }}>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.6 }}>
                <strong>When it falls due.</strong> {calendar.peak.name} is your heaviest month
                at {formatCurrency(calendar.peak.amount)} &mdash; {calendar.peakRatio.toFixed(1)}&times; an even twelfth
                &mdash; and {calendar.lightest.name} your lightest at {formatCurrency(calendar.lightest.amount)}. The
                gap between them, {formatCurrency(calendar.swing)}, is what you have to carry.
              </div>
              {/* One color for every month (changelog 226). The heights
                  already say which is biggest, and the sentence above names
                  both ends with their figures — a second and third
                  encoding of the same fact only makes a reader ask what the
                  color means. The bar area is a fixed box the bars grow
                  inside, so nothing here moves when the page is set to
                  larger text. */}
              <div style={{ position: 'relative' }}>
                {/* The reading, floating over the month under the pointer
                    (changelog 228). It is the same figure the title
                    attribute carried, said immediately and legibly, and it
                    names the lines that fall due that month — which is the
                    part that explains the shape. Anchored to the column and
                    pinned inside the strip at both ends, so January and
                    December do not push it off the edge. */}
                {hoverMonth !== null && (() => {
                  const m = calendar.months[hoverMonth];
                  const left = ((hoverMonth + 0.5) / 12) * 100;
                  const edge = hoverMonth <= 1 ? 'left' : hoverMonth >= 10 ? 'right' : 'center';
                  return (
                    <div
                      role="status"
                      style={{
                        position: 'absolute',
                        bottom: '100%',
                        marginBottom: '6px',
                        left: edge === 'right' ? 'auto' : edge === 'left' ? '0' : `${left}%`,
                        right: edge === 'right' ? '0' : 'auto',
                        transform: edge === 'center' ? 'translateX(-50%)' : 'none',
                        zIndex: 5,
                        pointerEvents: 'none',
                        maxWidth: '100%',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--card-border)',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
                        fontSize: 'var(--fs-2xs)',
                        lineHeight: 1.5,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <strong style={{ color: 'var(--text-primary)' }}>{m.name}</strong>
                      {' '}&mdash; {formatCurrency(m.amount)}
                      {m.lines.length > 0 && (
                        <div style={{ color: 'var(--text-muted)' }}>
                          Due this month: {m.lines.map((x) => `${x.label || 'unnamed'} ${formatCurrency(x.amount)}`).join(' · ')}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div role="img" aria-label={`Monthly outgoings: ${calendar.months.map((m) => `${m.name} ${Math.round(m.amount)}`).join(', ')}`}
                  style={{ display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
                  {calendar.months.map((m, i) => {
                    const pctOfPeak = calendar.peak.amount > 0 ? Math.max(3, (m.amount / calendar.peak.amount) * 100) : 3;
                    const active = hoverMonth === i;
                    return (
                      // The whole column is the target, not the bar: a
                      // quiet February is four pixels tall and nobody can
                      // point at that.
                      <div
                        key={m.month}
                        tabIndex={0}
                        aria-label={`${m.name}: ${formatCurrency(m.amount)}`}
                        onMouseEnter={() => setHoverMonth(i)}
                        onMouseLeave={() => setHoverMonth((cur) => (cur === i ? null : cur))}
                        onFocus={() => setHoverMonth(i)}
                        onBlur={() => setHoverMonth((cur) => (cur === i ? null : cur))}
                        style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'default', outlineOffset: '2px' }}
                      >
                        <div style={{ height: '64px', width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                          <div style={{
                            width: '100%',
                            height: `${pctOfPeak}%`,
                            borderRadius: '4px 4px 0 0',
                            backgroundColor: 'var(--accent-text)',
                            // Not a second encoding: this follows the
                            // pointer, so it says "this one", not "this one
                            // is special".
                            filter: active ? 'brightness(1.15)' : 'none',
                          }} />
                        </div>
                        <span style={{ fontSize: 'var(--fs-2xs)', color: active ? 'var(--text-secondary)' : 'var(--text-muted)', lineHeight: 1.2 }}>
                          {m.name.slice(0, 1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.6 }}>
                A typical year, not a forecast: the same annual total, arranged by when each line is paid. Nothing the
                plan projects changes &mdash; it works in whole years and cannot see this.
              </div>
            </div>
          )}

          {cadence && cadence.grossNeeded !== null && (
            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', marginTop: '10px', lineHeight: 1.6 }}>
              And what you have to <em>fund</em> is more than what you spend: in {cadence.taxYear}, your first retired
              year, the plan pays <strong>{formatCurrency(cadence.taxes)}</strong> in tax on top, so this budget needs
              about <strong>{formatCurrency(cadence.grossNeeded)}</strong> to come from somewhere. Nothing withholds it
              for you any more.
            </div>
          )}

          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--card-border)', fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            While this ledger is on it also drives{' '}
            <strong>Housing share ({derived.housingExpensePct.toFixed(1)}%)</strong>
            {derived.owns.healthcareBridgeCost && <> and <strong>Healthcare Bridge Cost ({formatCurrency(derived.healthcareBridgeCost)})</strong></>}
            {' '}&mdash; both state the same facts your categories do, so leaving them separately editable would count
            them twice.
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              {['housingExpensePct', 'healthcareBridgeCost'].map((f) => (
                blueprint.unlinkedFields.includes(f) ? (
                  <button key={f} className="btn-outline" style={{ padding: '3px 8px', fontSize: 'var(--fs-2xs)' }}
                    onClick={() => commit({ ...blueprint, unlinkedFields: blueprint.unlinkedFields.filter((x) => x !== f) })}>
                    Let the ledger drive {f === 'housingExpensePct' ? 'housing share' : 'the bridge cost'} again
                  </button>
                ) : (
                  <button key={f} className="btn-outline" style={{ padding: '3px 8px', fontSize: 'var(--fs-2xs)' }}
                    onClick={() => commit({ ...blueprint, unlinkedFields: [...blueprint.unlinkedFields, f] })}>
                    Unlink {f === 'housingExpensePct' ? 'housing share' : 'bridge cost'}
                  </button>
                )
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Step 6 of the Retirement Spending module (changelog 139): the
// guaranteed-income floor. PAID -- and the offering leads with this rather
// than the bridge, because a wizard is used once and this re-answers itself
// every time the plan changes.
//
// The free card quotes the user their OWN essential share, computed from the
// free ledger, which is the whole reason the essential tick shipped free.
const IncomeFloorPanel = ({ inputs, setActiveTab }) => {
  const essentialShare = essentialShareOf(inputs);
  const heading = (
    <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '24px 0 16px 0', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
      Does your guaranteed income cover the essentials?
    </h3>
  );

  if (essentialShare === null) {
    return (
      <>
        {heading}
        <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Break your spending into categories above and tick the ones you could not cut, and this will tell you whether
          Social Security, your pensions and any annuity cover them &mdash; and from which year.
        </div>
      </>
    );
  }
  const locked = (
    <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 12px' }}>
        You have marked <strong>{Math.round(essentialShare * 100)}%</strong> of your retirement spending as
        essential. The part worth knowing is whether the income that arrives no matter what the market does &mdash;
        Social Security, pensions, an annuity &mdash; covers that much, in which years, and by how much it falls
        short.
      </p>
      <button className="btn-outline" style={{ padding: '6px 12px', fontSize: 'var(--fs-xs)' }} onClick={() => setActiveTab('premium')}>
        Part of Premium &mdash; see what it includes
      </button>
    </div>
  );
  return (
    <>
      {heading}
      <PremiumMount id="spendingFloor" locked={locked} />
    </>
  );
};

// GuidedSection -- the "guided density" wrapper the Interview puts around a
// Plan section (IA Phase 3 step 2, 2026-09-24). The section renders exactly
// as it does on Plan Settings; after each render this walks its .form-group
// blocks and hides any whose controls (id="field-…" / id="toggle-…") are all
// outside GUIDED_CORE_KEYS, then offers "More options (n)" to show them. A
// block with no id'd control at all (a panel, a table, a note) is left
// visible: hiding is opt-in by key, never by guess. Nested blocks fold
// independently, so a core parent with an advanced child hides just the
// child. Reading the DOM rather than annotating 5,000 lines of section JSX
// is the whole point: one source of truth for the fields, one list of what
// the first pass shows.
// `only` (changelog 257) is the setup wizard's density: a list of keys
// (spouse-agnostic, as in GUIDED_CORE_KEYS) and NOTHING else shows -- not
// the section heading, not its notes, not any block without one of those
// controls. The wizard names the five or six fields a first pass needs and
// the section supplies them, so the fields exist in one place. There is no
// "More options" in this mode; the wizard itself points at the Plan page.
const keyOf = (el) => el.id.replace(/^(field|toggle)-/, '');
const GuidedSection = ({ children, only = null }) => {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(0);
  const onlySet = only ? new Set(only) : null;
  const wanted = (k) => !!onlySet && (onlySet.has(k) || onlySet.has(stripSpouseSuffix(k)));
  // Runs after EVERY render on purpose (no deps): it measures the DOM the
  // section just rendered. It sets state only when the count changed, so it
  // settles after at most one extra render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let n = 0;
    if (onlySet) {
      const keep = (el) => [...el.querySelectorAll('[id^="field-"], [id^="toggle-"]')].some((c) => wanted(keyOf(c)));
      [...root.children].forEach((child) => {
        if (child.classList.contains('guided-more')) return;
        child.classList.toggle('guided-hidden', !keep(child));
      });
      root.querySelectorAll('.form-group').forEach((group) => {
        group.classList.toggle('guided-hidden', !keep(group));
      });
      // A control sharing a block with a wanted one (Roth basis beneath the
      // Roth balance) hides on its own, label and switch housing with it.
      root.querySelectorAll('[id^="field-"], [id^="toggle-"]').forEach((c) => {
        const off = !wanted(keyOf(c));
        c.classList.toggle('guided-hidden', off);
        const label = c.id ? root.querySelector(`label[for="${c.id}"]`) : null;
        if (label) label.classList.toggle('guided-hidden', off);
        const housing = c.closest('.custom-switch');
        if (housing) housing.classList.toggle('guided-hidden', off);
      });
      return;
    }
    root.querySelectorAll('.form-group').forEach((group) => {
      const ids = [...group.querySelectorAll('[id^="field-"], [id^="toggle-"]')].map(keyOf);
      const core = ids.length === 0 || ids.some((k) => isGuidedCore(k));
      const advanced = !core;
      if (advanced) n++;
      group.classList.toggle('guided-advanced', advanced);
      group.classList.toggle('guided-hidden', advanced && !open);
    });
    if (n !== hidden) setHidden(n);
  });
  return (
    <div ref={rootRef} className={`guided-section${open ? ' guided-open' : ''}${onlySet ? ' guided-only' : ''}`}>
      {children}
      {!onlySet && hidden > 0 && (
        <button
          type="button"
          className="btn-outline guided-more"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          style={{ marginTop: '14px', fontSize: 'var(--fs-sm)', padding: '6px 12px' }}
        >
          {open ? 'Fewer options' : `More options (${hidden})`}
        </button>
      )}
    </div>
  );
};

export { GuidedSection, CollapsibleHeader, SettingsPanel, CurrentSpendingResidual, SpendingBridgePanel, SpendingLedgerPanel, IncomeFloorPanel };
