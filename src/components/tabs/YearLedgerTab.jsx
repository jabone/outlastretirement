// The year-by-year projection table: every year's starting balance,
// contributions, withdrawals, growth, taxes and ending balance, plus a CSV
// export of the same.
//
// Split out of LedgerTab.jsx on 2026-08-19 (see IA_REVIEW.md). That tab was
// one nav item doing two unrelated jobs -- this raw data table, and saving
// and comparing scenarios -- under the deliberately vague name "Tools".
// They share no state and no purpose; the only thing they had in common
// was being hard to categorize. Now they're two destinations that each say
// what they are.
import React, { useMemo, useState } from 'react';
import { useSimulation } from '../../context/useSimulation';
import CashFlowExplorer from '../CashFlowExplorer';
import { useEntitlement } from '../../context/useEntitlement';
import { whereMoneyGoes, buildMoneyGoesCsv, moneyGoesYear } from '../../utils/whereMoneyGoes';
import { Download, AlertTriangle } from 'lucide-react';
import Tooltip from '../Tooltip';
import HowFiguredLink from '../HowFiguredLink';
import { ACA_NON_EXPANSION_STATES } from '../../calculator';
import { buildYearLedgerCsv } from '../../utils/yearLedgerCsv';
import ForeignYearsNotice from '../ForeignYearsNoticeLoader';

// Changelog 203: a move after January shares its year; the ledger says from when.
const MOVE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Changelog 240: the ledger's second view. See utils/whereMoneyGoes.js for
// what each column holds and the reconciliation that keeps it honest.
// Changelog 367: on a phone the Balances & draws table shows one group of
// columns at a time beside the pinned Year column, so every column is
// reachable without panning across forty. The choice is this browser's.
const LEDGER_PRESETS = [
  { id: 'sum', label: 'Summary' },
  { id: 'inc', label: 'Income & spending' },
  { id: 'tax', label: 'Taxes' },
  { id: 'acc', label: 'Accounts' },
];
const LEDGER_PRESET_KEY = 'retire_plan_ledger_preset';
function readLedgerPreset() {
  try {
    const v = localStorage.getItem(LEDGER_PRESET_KEY);
    return LEDGER_PRESETS.some((p) => p.id === v) ? v : 'sum';
  } catch { return 'sum'; }
}

const LEDGER_VIEWS = [
  { id: 'balances', label: 'Balances & draws' },
  { id: 'uses', label: 'Where the money goes' },
  // The cash-flow explorer, from the Dashboard (changelog 284): one year's
  // money as a flow picture, which is a ledger row drawn rather than tabled.
  { id: 'cashflow', label: 'Cash flow' },
];

// Which "How is this figured?" card explains the plan's state income tax.
const STATE_RULE = { state_rules: 'state-own-rules', ca: 'state-ca', ny: 'state-ny', il: 'state-il', co: 'state-co', pa: 'state-pa', va: 'state-va', wa: 'state-wa' };

const YearLedgerTab = () => {
  const { inputs, formatCurrency, projection, setActiveTab, yearledgerSubTab, setYearledgerSubTab, setMaximizedComponent, mcRange, setRiskSubTab } = useSimulation();
  const { isPremium } = useEntitlement();
  // The view is shared state (App.jsx) so the address bar can name it
  // (#/yearledger/cashflow) and it survives leaving the tab.
  const [localView, setLocalView] = useState('balances');
  const view = yearledgerSubTab ?? localView;
  const setView = setYearledgerSubTab ?? setLocalView;
  const [preset, setPresetState] = useState(readLedgerPreset);
  const setPreset = (id) => {
    setPresetState(id);
    try { localStorage.setItem(LEDGER_PRESET_KEY, id); } catch { /* per-browser convenience only */ }
  };
  // Essentials / Flexible is Premium (the spending categories that create it
  // are); every other column is free, like the balances view.
  const uses = useMemo(() => whereMoneyGoes(projection, { split: isPremium }), [projection, isPremium]);

  const hasDebt = (inputs.mortgageBalance > 0 && inputs.mortgagePayment > 0) || (inputs.otherDebtBalance > 0 && inputs.otherDebtPayment > 0);
  // Same reasoning as hasDebt above -- only show the harvested-loss
  // carryforward column when Tax-Loss Harvesting is actually turned on.
  const hasTLH = !!inputs.taxLossHarvestingEnabled;
  // Same reasoning again -- only show the after-tax basis column when
  // Backdoor Roth contributions are enabled or there's a starting basis.
  const hasBasis = !!inputs.backdoorRothEnabled || (inputs.preTaxBasisInit || 0) > 0;
  // Roth conversion columns. Gated on the PROJECTION, not
  // on rothConversionStrategy: ACA Subsidy Protection forces conversions to
  // lift income to the FPL floor even when the strategy is 'none', and a
  // plan that converts should show its conversions however they arose.
  const hasConversions = (projection?.years || []).some(y => (y.convertAmount || 0) > 0);
  // Same reasoning again -- only show the home equity column when a
  // Reverse Mortgage is actually configured.
  const hasReverseMortgage = !!inputs.reverseMortgageEnabled;
  // Same reasoning again -- only show the Concentrated Stock column(s) when
  // that tracking is actually turned on in Settings. Each enabled position
  // gets its own column, headed by its label (e.g. GOOG / META) when one
  // is set so a two-position household can tell them apart.
  const hasConcentratedStock = !!inputs.concentratedStockEnabled;
  const hasConcentratedStock2 = hasConcentratedStock && !!inputs.concentratedStock2Enabled;
  // Same reasoning again -- only show the Cash Reserve column when the
  // Cash Floor / Emergency Reserve rule is actually turned on.
  const hasCashFloor = !!inputs.cashFloorEnabled;
  // Same reasoning again -- only show the NQDC column when at least one
  // spouse has a Non-Qualified Deferred Compensation plan turned on.
  const hasNQDC = !!inputs.nqdcEnabled1 || !!inputs.nqdcEnabled2;
  // Same reasoning again -- only show the ACA / FPL column when the
  // engine's coverage-gap check (calculator.js, ACA Subsidy Protection;
  // only possible in a Medicaid non-expansion state, pre-65, retired)
  // actually touched at least one year: either a year landed in the gap,
  // or Protection forced a conversion to keep it out. The Dashboard's "ACA
  // Medicaid Coverage Gap Detected" card only says the gap happens "in
  // some years"; this column is where you see WHICH years, and how much
  // forced Roth conversion closed each one.
  // Judged per row: once a move is planned (residency timeline, changelog
  // 195) the household can live in a non-expansion state for only part of
  // the plan, so the plan-wide stateOfResidence is just the starting state.
  // A State column only once the plan actually changes state (residency
  // timeline, changelog 195) -- one state all the way down says nothing.
  const hasMoves = new Set((projection?.years || []).map(y => y.residenceCountry || y.residenceState).filter(Boolean)).size > 1;
  // Foreign tax columns only once a year abroad is actually taxed there
  //. Taxes Paid already includes it, less the US credit.
  const hasForeignTax = (projection?.years || []).some(y => (y.foreignTax || 0) > 0);
  const hasAcaCheck = (projection?.years || []).some(y =>
    ACA_NON_EXPANSION_STATES.has(y.residenceState ?? inputs.stateOfResidence)
    && (y.inAcaCoverageGap || y.acaSubsidyBoost > 0));

  const downloadCSV = () => {
    if (!projection || !projection.years) return;
    // Column mapping lives in utils/yearLedgerCsv.js (pure, unit-tested).
    // `projection` here is already Real- or Nominal-dollar adjusted by
    // App.jsx, so the export matches whatever the table is showing.
    // The export follows the view on screen.
    const body = view === 'uses' ? buildMoneyGoesCsv(projection, { split: isPremium }) : buildYearLedgerCsv(projection);
    const csvContent = "data:text/csv;charset=utf-8," + body;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${view === 'uses' ? 'where_the_money_goes' : 'retirement_projection'}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
            <ForeignYearsNotice inputs={inputs} />
            <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '600' }}>Yearly Ledger</h2>
                <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>Detailed year-by-year income, expenses, taxes, draws, and portfolio ending balances.</p>
                {/* Changelog 364: these rows are one path, and say so. */}
                <p data-testid="ledger-one-path" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  {inputs.stressType && inputs.stressType !== 'none'
                    ? 'One path: your plan in the crash test you chose.'
                    : 'One path: your plan with average returns every year.'}
                  {' '}
                  {mcRange && mcRange.status === 'fresh' && (!inputs.stressType || inputs.stressType === 'none')
                    ? <>In 8 of 10 simulated markets the final balance lands between {formatCurrency(mcRange.p10)} and {formatCurrency(mcRange.p90)}.</>
                    : (
                      <button type="button" onClick={() => { setActiveTab('risk'); if (setRiskSubTab) setRiskSubTab('montecarlo'); }}
                        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-text)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>
                        See the range in good and bad markets
                      </button>
                    )}
                </p>
              </div>
              <button 
                onClick={downloadCSV}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 'var(--fs-body)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <Download size={14} />
                Export Yearly Ledger (CSV)
              </button>
            </div>

            <div className="month-filter-row" role="group" aria-label="Ledger view" style={{ marginBottom: '16px' }}>
              {LEDGER_VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`month-filter-pill ${view === v.id ? 'active' : ''}`}
                  aria-pressed={view === v.id}
                  onClick={() => setView(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {view === 'cashflow' && (
              <CashFlowExplorer projection={projection} inputs={inputs} formatCurrency={formatCurrency} setMaximizedComponent={setMaximizedComponent} />
            )}
            {view === 'uses' && (
              <MoneyGoesTable
                uses={uses}
                inputs={inputs}
                formatCurrency={formatCurrency}
                isPremium={isPremium}
                onOpenPremium={setActiveTab ? () => setActiveTab('premium') : null}
              />
            )}
            {view === 'balances' && (<>
            <p data-testid="uses-legend" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: 0 }}>
              <span aria-hidden="true" className="col-uses" style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', verticalAlign: 'middle', marginRight: '6px', backgroundColor: 'color-mix(in srgb, var(--accent-primary) 25%, transparent)' }} />
              Shaded columns &mdash; Lifestyle Exp, Health and Income Tax &mdash; show the same figures as{' '}
              <button type="button" className="btn-outline" style={{ padding: '1px 8px', fontSize: 'var(--fs-xs)' }} onClick={() => setView('uses')}>Where the money goes</button>
              , which also splits out life events, debt, gifts and what you saved.
            </p>
            <p data-testid="how-figured-links" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 14px' }}>
              <span>How is this figured?</span>
              <HowFiguredLink rule="federal-brackets" topic="federal income tax" style={{ fontSize: 'var(--fs-sm)' }}>Federal income tax</HowFiguredLink>
              <HowFiguredLink rule={STATE_RULE[inputs.stateTaxState] || 'state-none-or-flat'} topic="state income tax" style={{ fontSize: 'var(--fs-sm)' }}>State income tax</HowFiguredLink>
              <HowFiguredLink rule="ss-taxation" topic="tax on Social Security" style={{ fontSize: 'var(--fs-sm)' }}>Social Security</HowFiguredLink>
              <HowFiguredLink rule="irmaa" topic="Medicare and IRMAA" style={{ fontSize: 'var(--fs-sm)' }}>Medicare and IRMAA</HowFiguredLink>
              <HowFiguredLink rule="rmd" topic="RMD, the required minimum distribution" style={{ fontSize: 'var(--fs-sm)' }}>RMD</HowFiguredLink>
            </p>
            {projection?.years?.some(y => y.lifestyleDeficit > 0 || y.savingsDeficit > 0) && (
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <AlertTriangle size={20} color="var(--error)" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text-primary)' }}>
                  <strong>Budget Warning:</strong> In one or more working years, your expenses, taxes, and savings exceeded your salary. The engine automatically reduced your savings and/or lifestyle targets to prevent premature portfolio drawdown (as configured in Settings).
                </div>
              </div>
            )}

            <div className="month-filter-row ledger-presets" role="group" aria-label="Columns to show" style={{ marginBottom: '10px' }}>
              {LEDGER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`month-filter-pill ${preset === p.id ? 'active' : ''}`}
                  aria-pressed={preset === p.id}
                  onClick={() => setPreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="table-wrapper">
              <table className={`custom-table year-ledger-table preset-${preset}`}>
                <thead>
                  <tr>
                    <th className="ledger-year">Year</th>
                    <th className="lg">Ages ({inputs.spouse1Name || 'H'}{inputs.spouse2Enabled ? `/${inputs.spouse2Name || 'S'}` : ''})</th>
                    <th className="lg g-tax">Filing</th>
                    {hasMoves && <th className="lg g-inc"><Tooltip position="bottom" text="The state you live in this year, from Life Events → Where you live. The year's state income tax, and the ACA coverage-gap check, are priced as this state.">State</Tooltip></th>}
                    <th className="lg g-sum g-inc"><Tooltip position="bottom" text="Salary and part-time pay. RSU/GSU vesting and deferred-comp payouts are in their own columns, not in this one.">Salary</Tooltip></th>
                    <th className="lg g-inc"><Tooltip position="bottom" text="Vesting value from RSU/GSU stock grants (explicit grants plus any assumed future refresh grants entered in Settings). Taxed as pay; not included in Salary.">RSU/GSU</Tooltip></th>
                    {hasConcentratedStock && <th className="lg g-acc"><Tooltip position="bottom" text="Year-end value of the concentrated stock position and its share of net worth. Amounts diversified this year have already moved to Taxable; a + is this year's routed vests." more="Concentrated Stock">{inputs.concentratedStockLabel ? `Conc. ${inputs.concentratedStockLabel}` : 'Concentrated Stock'}</Tooltip></th>}
                    {hasConcentratedStock2 && <th className="lg g-acc"><Tooltip position="bottom" text="Year-end value of the second tracked Concentrated Stock Position (typically the other spouse's employer stock). Same mechanics as the first: diversified amounts already moved into Taxable, routed-in vests shown as a +.">{inputs.concentratedStock2Label ? `Conc. ${inputs.concentratedStock2Label}` : 'Concentrated Stock 2'}</Tooltip></th>}
                    {hasCashFloor && <th className="lg g-acc"><Tooltip position="bottom" text="Year-end cash reserve. Spent first in a down-market retirement year (a draw), refilled in an up year, and built from leftover cash flow while working when that option is on (a +)." more="Cash Reserve">Cash Reserve</Tooltip></th>}
                    {hasNQDC && <th className="lg g-acc"><Tooltip position="bottom" text="Both spouses' deferred compensation balance, an unsecured account separate from your other buckets. A payout this year shows beside the balance; it is not included in Salary." more="NQDC">NQDC Balance</Tooltip></th>}
                    <th className="lg g-inc">SS + Pens</th>
                    <th className="lg g-sum g-inc col-uses">Lifestyle Exp</th>
                    <th className="lg g-inc col-uses"><Tooltip position="bottom" text="Everything health costs this year: cover before Medicare, Medicare premiums with IRMAA, long-term care and cover abroad, including care the HSA paid. The largest part is named under the figure." more="Health, Income Tax, shading">Health</Tooltip></th>
                    {hasAcaCheck && <th className="lg g-tax"><Tooltip position="bottom" text="For pre-65 retirement years in a non-expansion state: GAP means income fell below the poverty level, qualifying for neither Medicaid nor a subsidy. A + is the conversion made to lift income to the floor." more="ACA / FPL">ACA / FPL</Tooltip></th>}
                    <th className="lg g-sum g-tax col-uses"><Tooltip position="bottom" text="Federal and state income tax, and payroll tax while working — the same figure as Income tax in Where the money goes. Property tax is not here: it is part of Housing in your lifestyle budget.">Income Tax</Tooltip></th>
                    {hasForeignTax && <th className="lg g-tax"><Tooltip position="bottom" text="Tax you pay the country you live in this year — income tax, any tax on your Roth, and any health or social contribution. Already inside Income Tax.">Foreign Tax</Tooltip></th>}
                    {hasForeignTax && <th className="lg g-tax"><Tooltip position="bottom" text="The US foreign tax credit: how much of the foreign tax reduces your US tax this year, already netted from Income Tax. Social Security, Roth and the 3.8% investment tax earn none." more="US Credit">US Credit</Tooltip></th>}
                    <th className="lg g-tax">Bracket</th>
                    <th className="lg g-sum g-inc"><Tooltip position="bottom" text="Lifestyle, health, debt, gifts, income tax and life events paid from the general pool. An event paid straight from a named account is in Total Draw instead." more="Total Exp">Total Exp</Tooltip></th>
                    {hasDebt && <th className="lg g-acc"><Tooltip position="bottom" text="Combined remaining mortgage + other debt principal balance, amortizing down each year until paid off.">Debt Bal</Tooltip></th>}
                    {hasTLH && <th className="lg g-tax"><Tooltip position="bottom" text="Realized capital losses harvested in down years, not yet used up offsetting gains or the $3,000/year ordinary-income cap. Carries forward until fully spent.">Loss C/F</Tooltip></th>}
                    {hasBasis && <th className="lg g-tax"><Tooltip position="bottom" text="After-tax basis left in your Pre-Tax bucket, from backdoor Roth contributions or a basis you entered. Conversions return it tax-free pro rata, shrinking it." more="Basis Left">Basis Left</Tooltip></th>}
                    {hasReverseMortgage && <th className="lg g-acc"><Tooltip position="bottom" text="Home value minus the reverse mortgage balance. The home appreciates at your assumption; the loan compounds once it originates." more="Home Equity">Home Equity</Tooltip></th>}
                    <th className="lg g-tax"><Tooltip position="bottom" text="The required minimum distribution forced out of Pre-Tax this year (from age 73-75). Already inside Draw PreTax, not on top of it." more="RMD">RMD</Tooltip></th>
                    {hasConversions && <th className="lg g-tax"><Tooltip position="bottom" text="Moved from Pre-Tax into Roth this year. The full amount lands in Roth, nothing withheld for tax, and it is not a withdrawal, so not part of Total Draw." more="Roth Conv">Roth Conv</Tooltip></th>}
                    {hasConversions && <th className="lg g-tax"><Tooltip position="bottom" text="How much of this year's conversion is taxable income. Less than the amount converted when the Pre-Tax bucket holds after-tax basis; otherwise the same." more="Taxable Part">Taxable Part</Tooltip></th>}
                    {hasConversions && <th className="lg g-tax"><Tooltip position="bottom" text="The extra federal and state tax this year's conversion caused, Social Security effects included. Already inside Income Tax, and paid from whatever your withdrawal strategy draws." more="Conv Tax">Conv Tax</Tooltip></th>}
                    <th className="lg g-acc">Draw PreTax</th>
                    <th className="lg g-acc">Draw Roth</th>
                    <th className="lg g-acc">Draw Taxable</th>
                    <th className="lg g-sum g-acc">Total Draw</th>
                    <th className="lg g-acc">PreTax Bal</th>
                    <th className="lg g-acc">Roth Bal</th>
                    <th className="lg g-acc">Taxable Bal</th>
                    <th className="lg g-sum g-acc">Ending Portfolio</th>
                    <th className="lg g-acc">Growth Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.years.map((row) => {
                    // Changelog 241: the columns this view shares with Where
                    // the money goes read the same figures from the same place.
                    const uses = moneyGoesYear(row);
                    const rowIsRetired = row.isRetired;
                    const hasShortfall = row.shortfall > 1;
                    const hasPositiveReturn = row.growthRate > 0;
                    // Form SSA-44. Only shown when the engine can see the appeal
                    // is worth money this year and the plan has not already
                    // assumed it -- a badge on a year where filing saves
                    // nothing would be pure noise. The Action Plan carries the
                    // how-to; this is the "look here" marker.
                    const showSsa44 = (row.irmaaAppealSavings || 0) > 0 && !inputs.irmaaLifeChangeAppealEnabled;
                    const ssa44Badge = (
                      <span
                        style={{ marginLeft: '6px', color: 'var(--warning)', fontWeight: 700, fontSize: 'var(--fs-2xs)', border: '1px solid rgba(245,158,11,0.5)', borderRadius: '4px', padding: '1px 4px', cursor: 'help', whiteSpace: 'nowrap' }}
                        title={`You stopped work recently, so Form SSA-44 could ask Social Security to price this year off your current income instead of the return from two years ago. Worth about ${formatCurrency(row.irmaaAppealSavings)} this year. See "At Retirement" in your Action Plan for how to file, or turn on "Assume a Form SSA-44 IRMAA appeal" (Plan → Taxes & Roth → Medicare Premiums (IRMAA)) to model it.`}
                      >
                        SSA-44
                      </span>
                    );
                    
                    let bgStyle = {};
                    if (hasShortfall) {
                      bgStyle = { backgroundColor: 'rgba(239,68,68,0.08)' };
                    } else if (!rowIsRetired) {
                      bgStyle = { backgroundColor: 'rgba(255,255,255,0.01)' };
                    }

                    const hasBudgetWarning = row.lifestyleDeficit > 0 || row.savingsDeficit > 0;
                    // Year is in the ACA coverage gap (below 100% FPL, no
                    // subsidy) -- either Protection is off, or it ran out of
                    // pre-tax balance to convert. Mirrors Dashboard's card.
                    const hasAcaGap = !!row.inAcaCoverageGap;
                    const hasAcaCliff = !!row.acaCliffBreached;
                    const acaBoost = row.acaSubsidyBoost || 0;

                    return (
                      <tr key={row.year} style={bgStyle} className={hasShortfall ? 'ledger-shortfall' : undefined}>
                        <td className="ledger-year" style={{ fontWeight: '600', whiteSpace: 'nowrap' }}>
                          {row.year}
                          {/* On a phone the Ages column is folded in here (changelog 367). */}
                          <span className="ledger-year-ages">
                            {row.age1 !== null ? row.age1 : '†'}{inputs.spouse2Enabled ? `/${row.age2 !== null ? row.age2 : '†'}` : ''}
                          </span>
                          {hasBudgetWarning && (
                            <AlertTriangle
                              size={13}
                              color="var(--error)"
                              style={{ marginLeft: '5px', verticalAlign: 'text-top', cursor: 'help' }}
                              title="Budget Warning: this year's expenses, taxes, and savings exceeded your salary. The engine automatically reduced your savings and/or lifestyle targets to prevent premature portfolio drawdown (as configured in Settings)."
                            />
                          )}
                          {hasAcaGap && (
                            <AlertTriangle
                              size={13}
                              color="var(--warning)"
                              style={{ marginLeft: '5px', verticalAlign: 'text-top', cursor: 'help' }}
                              title={`ACA Coverage Gap: this year's taxable income falls below 100% of the Federal Poverty Level while retired before Medicare in a non-expansion state (${row.residenceState ?? inputs.stateOfResidence}), so no ACA premium subsidy would be available. ${inputs.acaSubsidyProtectionEnabled ? 'ACA Subsidy Protection is on but the Pre-Tax balance was too small to fully close the gap.' : 'Enable ACA Subsidy Protection (Plan → Taxes & Roth → Roth Conversion Optimization) to force a Roth conversion that clears the floor.'}`}
                            />
                          )}
                          {hasAcaCliff && (
                            <AlertTriangle
                              size={13}
                              color="var(--error)"
                              style={{ marginLeft: '5px', verticalAlign: 'text-top', cursor: 'help' }}
                              title={`ACA Subsidy Cliff: this year's ACA MAGI (${formatCurrency(row.acaMagi)}) is over 400% of the Federal Poverty Level (${formatCurrency(row.acaCliffThreshold)}) while retired before Medicare, so the entire marketplace premium tax credit is forfeited for the year${row.acaSubsidyClawback > 0 ? ` — ${formatCurrency(row.acaSubsidyClawback)} repaid as tax` : ''}. ${inputs.acaCliffProtectionEnabled ? 'ACA Cliff Protection is on, so this came from withdrawals the plan needed for spending, not from a voluntary conversion.' : 'Enable ACA Cliff Protection (Plan → Taxes & Roth → Roth Conversion Optimization) to cap Roth conversions under the line.'}`}
                            />
                          )}
                        </td>
                        <td className="lg">
                          {row.age1 !== null ? row.age1 : '†'}
                          {inputs.spouse2Enabled ? ` / ${row.age2 !== null ? row.age2 : '†'}` : ''}
                        </td>
                        <td className="lg g-tax">{row.householdStatus}</td>
                        {hasMoves && <td className="lg g-inc">{row.residenceCountry || row.residenceState}{row.moveMonth ? ` (from ${MOVE_MONTHS[row.moveMonth - 1]})` : ''}{row.foreignRegime ? ` · ${row.foreignRegime}` : ''}</td>}
                        {(() => {
                          // The engine's salary carries RSU vesting and NQDC
                          // payouts too; this column is the pay alone.
                          const pay = Math.max(0, (row.salary || 0) - (row.rsuIncome1 || 0) - (row.rsuIncome2 || 0) - (row.nqdcDistribution1 || 0) - (row.nqdcDistribution2 || 0));
                          return <td className="lg g-sum g-inc">{pay > 0.5 ? formatCurrency(pay) : '—'}</td>;
                        })()}
                        <td className="lg g-inc">{((row.rsuIncome1 || 0) + (row.rsuIncome2 || 0)) > 0 ? formatCurrency(row.rsuIncome1 + row.rsuIncome2) : '—'}</td>
                        {hasConcentratedStock && (
                          <td className="lg g-acc">
                            {formatCurrency(row.concentratedStockBalance || 0)}
                            {(row.concentratedStockVestedIn || 0) > 0 && (
                              <span style={{ color: 'var(--success)', marginLeft: '4px' }} title="New vests routed into this position this year (vest routing is on in Settings)">
                                (+{formatCurrency(row.concentratedStockVestedIn)})
                              </span>
                            )}
                            {(row.concentratedStockConcentrationPct || 0) >= (inputs.concentratedStockConcentrationTargetPct !== undefined ? inputs.concentratedStockConcentrationTargetPct : 10) && (
                              <span style={{ color: 'var(--danger)', marginLeft: '4px' }} title="Above your configured concentration risk threshold">
                                ({(row.concentratedStockConcentrationPct || 0).toFixed(0)}%)
                              </span>
                            )}
                          </td>
                        )}
                        {hasConcentratedStock2 && (
                          <td className="lg g-acc">
                            {formatCurrency(row.concentratedStock2Balance || 0)}
                            {(row.concentratedStock2VestedIn || 0) > 0 && (
                              <span style={{ color: 'var(--success)', marginLeft: '4px' }} title="New vests routed into this position this year (vest routing is on in Settings)">
                                (+{formatCurrency(row.concentratedStock2VestedIn)})
                              </span>
                            )}
                            {(row.concentratedStock2ConcentrationPct || 0) >= (inputs.concentratedStockConcentrationTargetPct !== undefined ? inputs.concentratedStockConcentrationTargetPct : 10) && (
                              <span style={{ color: 'var(--danger)', marginLeft: '4px' }} title="Above your configured concentration risk threshold">
                                ({(row.concentratedStock2ConcentrationPct || 0).toFixed(0)}%)
                              </span>
                            )}
                          </td>
                        )}
                        {hasCashFloor && (
                          <td className="lg g-acc">
                            {formatCurrency(row.cashReserveBalance || 0)}
                            {(row.cashReserveDraw || 0) > 0 && (
                              <span style={{ color: 'var(--danger)', marginLeft: '4px' }} title="Drawn down this year to shield investments during a down market">
                                (-{formatCurrency(row.cashReserveDraw)})
                              </span>
                            )}
                            {(row.cashReserveReplenish || 0) > 0 && (
                              <span style={{ color: 'var(--success)', marginLeft: '4px' }} title="Topped back off this year">
                                (+{formatCurrency(row.cashReserveReplenish)})
                              </span>
                            )}
                            {(row.cashReservePreFund || 0) > 0 && (
                              <span style={{ color: 'var(--success)', marginLeft: '4px' }} title="Built up this year from leftover working-years cash flow, instead of Taxable Brokerage">
                                (+{formatCurrency(row.cashReservePreFund)})
                              </span>
                            )}
                          </td>
                        )}
                        {hasNQDC && (
                          <td className="lg g-acc">
                            {formatCurrency((row.nqdcBalance1 || 0) + (row.nqdcBalance2 || 0))}
                            {((row.nqdcDistribution1 || 0) + (row.nqdcDistribution2 || 0)) > 0 && (
                              <span style={{ color: 'var(--success)', marginLeft: '4px' }} title="Paid out this year">
                                (-{formatCurrency((row.nqdcDistribution1 || 0) + (row.nqdcDistribution2 || 0))})
                              </span>
                            )}
                          </td>
                        )}
                        <td className="lg g-inc">
                          {formatCurrency(row.fixedInflows)}
                          {/* Retirement Earnings Test. The
                              figure to the left is already NET of this; the
                              note says how much was held back and why, the
                              same way the Med / IRMAA cell explains its
                              basis rather than adding another column to a
                              table that is already dense. */}
                          {(row.ssEarningsTestWithheld || 0) > 0 && (
                            <span
                              style={{ fontSize: 'var(--fs-2xs)', color: 'var(--danger)', display: 'block', marginTop: '2px', cursor: 'help' }}
                              title={`Social Security withheld ${formatCurrency(row.ssEarningsTestWithheld)} of benefit this year because you are claiming before full retirement age while still earning${row.ssEarningsTestInFraYear ? ', at the $1-per-$3 rate that applies in the year you reach full retirement age' : ' ($1 withheld per $2 of earnings above the annual exempt amount)'}. The figure above is already net of it. These months are not lost: at full retirement age your benefit is recalculated to credit them back, permanently raising it from then on. Only wages and self-employment count \u2014 pensions, investment income and IRA withdrawals never trigger this.`}
                            >
                              &minus;{formatCurrency(row.ssEarningsTestWithheld)} earnings test
                            </span>
                          )}
                        </td>
                        <td className="lg g-sum g-inc col-uses">
                          <span>{formatCurrency(row.lifestyleExpenses)}</span>
                          {inputs.lifestyleThreePhaseEnabled && row.isRetired && row.lifestylePhase && (
                            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', display: 'block', marginTop: '2px', fontStyle: 'italic' }}>
                              ({row.lifestylePhase})
                            </span>
                          )}
                        </td>
                        <td className="lg g-inc col-uses">
                          {uses.health > 0 ? formatCurrency(uses.health) : '\u2014'}
                          {/* The Medicare part keeps its IRMAA pricing
                              tooltip (changelog 121) as a line of its own,
                              with the SSA-44 marker (130) at its end. */}
                          {row.irmaaCost > 0 ? (
                            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                            <span
                              style={{ cursor: 'help', borderBottom: row.irmaaBasisSource === 'appeal' ? '1px dotted var(--accent-primary)' : 'none' }}
                              title={row.irmaaBasisSource === 'lookback'
                                ? `Priced off the MAGI from two years earlier (${formatCurrency(row.irmaaBasisMagi)}), the return Medicare actually uses. This year's own MAGI is ${formatCurrency(row.irmaaMagi)}.`
                                : row.irmaaBasisSource === 'appeal'
                                  ? `Form SSA-44 appeal: after a life-changing event this year's own MAGI (${formatCurrency(row.irmaaMagi)}) replaced the two-years-earlier figure (${formatCurrency(row.irmaaLookbackMagi)}) because it gave the lower premium.${row.irmaaTrueUp > 0 ? ` Includes ${formatCurrency(row.irmaaTrueUp)} charged once the year's withdrawals were known.` : ''}`
                                  : `Priced off this year's own MAGI (${formatCurrency(row.irmaaMagi)}): the plan has no earlier year to look back to yet.${row.irmaaTrueUp > 0 ? ` Includes ${formatCurrency(row.irmaaTrueUp)} charged once the year's withdrawals were known.` : ''}`}
                            >
                              Medicare {formatCurrency(row.irmaaCost)}
                            </span>
                            {/* The SSA-44 marker sits on the Medicare
                                line it is about, not on a line of its own. */}
                            {showSsa44 && ssa44Badge}
                            </span>
                          ) : null}
                          {uses.healthMainLabel && uses.healthMainLabel !== 'Medicare' && (
                            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>{uses.healthMainLabel}</span>
                          )}
                          {uses.medicareDelayed.length > 0 && (
                            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                              Medicare delayed: {uses.medicareDelayed.map((w) => (w === 1 ? (inputs.spouse1Name || 'Primary') : (inputs.spouse2Name || 'Spouse'))).join(' & ')} on an employer plan
                            </span>
                          )}
                          {showSsa44 && !(row.irmaaCost > 0) && ssa44Badge}
                        </td>
                        {hasAcaCheck && (
                          <td className="lg g-tax" style={{ whiteSpace: 'nowrap' }}>
                            {hasAcaGap ? (
                              <span
                                style={{ color: 'var(--warning)', fontWeight: 700, fontSize: 'var(--fs-xs)', border: '1px solid rgba(245,158,11,0.5)', borderRadius: '4px', padding: '1px 5px', cursor: 'help' }}
                                title={inputs.acaSubsidyProtectionEnabled ? 'Below the FPL floor: ACA Subsidy Protection is on but the Pre-Tax balance was too small to fully close the gap this year.' : 'Below the FPL floor: no ACA subsidy this year. Enable ACA Subsidy Protection (Plan → Taxes & Roth → Roth Conversion Optimization) to fix.'}
                              >
                                GAP{acaBoost > 0 ? ` +${formatCurrency(acaBoost)}` : ''}
                              </span>
                            ) : acaBoost > 0 ? (
                              <span style={{ color: 'var(--success)' }} title="Forced Roth conversion made by ACA Subsidy Protection to lift taxable income to the 100% FPL floor and keep subsidy eligibility. Included in this year's Income Tax.">
                                +{formatCurrency(acaBoost)}
                              </span>
                            ) : '—'}
                          </td>
                        )}
                        <td className="lg g-sum g-tax cell-yellow col-uses">{formatCurrency(row.totalTaxesPaid)}</td>
                        {hasForeignTax && <td className="lg g-tax">{row.foreignTax > 0 ? formatCurrency(row.foreignTax) : '\u2014'}</td>}
                        {hasForeignTax && <td className="lg g-tax">{row.foreignTaxCredit > 0 ? formatCurrency(row.foreignTaxCredit) : '\u2014'}</td>}
                        <td className="lg g-tax">{(row.marginalBracket * 100).toFixed(0)}%</td>
                        <td className="lg g-sum g-inc">
                          {formatCurrency(row.totalExpenses)}
                          {uses.lifeEvents > 0 && (
                            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                              incl. {uses.lifeEventNames.join(', ')} {formatCurrency(uses.lifeEvents)}
                              {/* One short line, like every other note in
                                  the ledger; the sentence wrapped to eight
                                  lines in this column and stretched the row.
                                  The full account is the tooltip. */}
                              {uses.lifeEvents - (row.milestoneOutflowGeneral || 0) > 0.5 && (
                                <>
                                  {' '}
                                  <span
                                    style={{ cursor: 'help', borderBottom: '1px dotted currentColor' }}
                                    title={`${formatCurrency(uses.lifeEvents - (row.milestoneOutflowGeneral || 0))} of it was paid from its own account, so it is in Total Draw instead.`}
                                  >
                                    (own account)
                                  </span>
                                </>
                              )}
                            </span>
                          )}
                        </td>
                        {hasDebt && <td className="lg g-acc">{formatCurrency((row.mortgageBalance || 0) + (row.otherDebtBalance || 0))}</td>}
                        {hasTLH && <td className="lg g-tax">{row.lossCarryforward > 0 ? formatCurrency(row.lossCarryforward) : '—'}</td>}
                        {hasBasis && <td className="lg g-tax">{row.preTaxBasis > 0 ? formatCurrency(row.preTaxBasis) : '—'}</td>}
                        {hasReverseMortgage && <td className="lg g-acc">{row.homeValue > 0 ? formatCurrency(row.homeEquity) : '—'}</td>}
                        <td className="lg g-tax">{row.rmdAmount > 0 ? formatCurrency(row.rmdAmount) : '—'}</td>
                        {hasConversions && <td className="lg g-tax">{row.convertAmount > 0 ? formatCurrency(row.convertAmount) : '—'}</td>}
                        {hasConversions && <td className="lg g-tax">{row.convertAmount > 0 ? formatCurrency(row.convertAmountTaxable) : '—'}</td>}
                        {hasConversions && <td className="lg g-tax">{row.conversionTaxCost > 0 ? formatCurrency(row.conversionTaxCost) : '—'}</td>}
                        <td className="lg g-acc">{row.drawPreTax > 0 ? formatCurrency(row.drawPreTax) : '—'}</td>
                        <td className="lg g-acc">{row.drawRoth > 0 ? formatCurrency(row.drawRoth) : '—'}</td>
                        <td className="lg g-acc">{row.drawTaxable > 0 ? formatCurrency(row.drawTaxable) : '—'}</td>
                        <td className="lg g-sum g-acc" style={{ fontWeight: '500' }}>
                          {formatCurrency(row.drawdown)}
                          {row.hsaGeneralDraw > 0.5 && (
                            <span
                              style={{ fontSize: 'var(--fs-2xs)', color: 'var(--warning)', fontWeight: 400, display: 'block', marginTop: '2px', cursor: 'help' }}
                              title={`Every other account was empty, so the HSA paid ${formatCurrency(row.hsaGeneralDraw)} toward this year's spending. Money not spent on medical care is taxed as income${row.hsaGeneralDrawPenalty > 0 ? ', plus a 20% additional tax before 65' : ''}: ${formatCurrency(row.hsaGeneralDrawTax)}, already in Income Tax.`}
                            >
                              plus HSA for general spending {formatCurrency(row.hsaGeneralDraw)}
                            </span>
                          )}
                        </td>
                        <td className="lg g-acc">{formatCurrency(row.preTaxEnd)}</td>
                        <td className="lg g-acc">{formatCurrency(row.rothEnd)}</td>
                        <td className="lg g-acc">{formatCurrency(row.taxableEnd)}</td>
                        <td className="lg g-sum g-acc" style={{ 
                          fontWeight: '600', 
                          color: hasShortfall ? 'var(--danger)' : 'inherit'
                        }}>
                          {hasShortfall ? `Shortfall: ${formatCurrency(row.shortfall)}` : formatCurrency(row.totalPortfolioEnding)}
                        </td>
                        <td className="lg g-acc" style={{ color: hasPositiveReturn ? 'var(--success)' : 'var(--text-muted)' }}>
                          {row.growthRate}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>)}
            </div>
    </>
  );
};

const sub = { fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 400 };

function MoneyGoesTable({ uses, inputs, formatCurrency, isPremium, onOpenPremium }) {
  const { rows, columns, splitAvailable } = uses;
  const money = (v) => (v > 0 ? formatCurrency(v) : '—');
  return (
    <>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: 0 }}>
        Each year&rsquo;s money, by what it was used for. Before you retire, the columns add up to your pay; after, to
        what your income and withdrawals had to cover. Saving is shown as its own column: it is not an expense, but it
        is where part of the year&rsquo;s money went.
        {!isPremium && splitAvailable && (
          <>
            {' '}Your spending marks what you could not cut; Premium splits Lifestyle into Essentials and Flexible.
            {onOpenPremium && (
              <>
                {' '}
                <button type="button" className="btn-outline" style={{ padding: '2px 8px', fontSize: 'var(--fs-xs)' }} onClick={onOpenPremium}>
                  See Premium
                </button>
              </>
            )}
          </>
        )}
      </p>
      <div className="table-wrapper">
        <table className="custom-table" data-testid="money-goes-table">
          <thead>
            <tr>
              <th>Year</th>
              <th className="hide-mobile">Ages ({inputs.spouse1Name || 'H'}{inputs.spouse2Enabled ? `/${inputs.spouse2Name || 'S'}` : ''})</th>
              {columns.split ? (
                <>
                  <th><Tooltip position="bottom" text="The part of your lifestyle budget you marked as could-not-cut in your spending categories. Before retirement, and in any year without that split, Essentials and Flexible share one Lifestyle figure.">Essentials</Tooltip></th>
                  <th><Tooltip position="bottom" text="The rest of the lifestyle budget, including any early-retirement travel extra.">Flexible</Tooltip></th>
                </>
              ) : (
                <th><Tooltip position="bottom" text="Your lifestyle budget, including property tax, home insurance and utilities (the Housing category). Before retirement this is what is left of your pay after tax and savings.">Lifestyle</Tooltip></th>
              )}
              <th><Tooltip position="bottom" text="Your own health cover before Medicare, Medicare premiums with IRMAA, long-term care, and cover abroad. Includes what your HSA paid.">Health</Tooltip></th>
              {columns.debt && <th className="hide-mobile"><Tooltip position="bottom" text="Mortgage and other loan payments. Kept apart from Essentials: the mortgage payment is not part of your spending categories.">Debt</Tooltip></th>}
              {columns.lifeEvents && <th><Tooltip position="bottom" text="Life events that cost money this year, named. An event you funded from outside the plan is not included.">Life events</Tooltip></th>}
              {columns.gifts && <th className="hide-mobile">Gifts</th>}
              <th><Tooltip position="bottom" text="Federal and state income tax, and payroll tax while working. Property tax is not here: it is part of Housing in your lifestyle budget.">Income tax</Tooltip></th>
              {columns.saved && <th><Tooltip position="bottom" text="Your own contributions (not the employer match), money put into the cash reserve while working, and unspent money reinvested. Not an expense, but where part of the year's money went." more="Saved">Saved</Tooltip></th>}
              <th>Total out</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year} style={!r.isRetired ? { color: 'var(--text-secondary)' } : undefined}>
                <td style={{ verticalAlign: 'top' }}>{r.year}</td>
                <td className="hide-mobile" style={{ verticalAlign: 'top' }}>{r.age1 ?? '—'}{inputs.spouse2Enabled ? ` / ${r.age2 ?? '—'}` : ''}</td>
                {columns.split ? (
                  r.essentials === null ? (
                    <td colSpan={2} style={{ verticalAlign: 'top', textAlign: 'center' }}>
                      {money(r.lifestyle)}
                      <div style={sub}>lifestyle</div>
                    </td>
                  ) : (
                    <>
                      <td style={{ verticalAlign: 'top' }}>{money(r.essentials)}</td>
                      <td style={{ verticalAlign: 'top' }}>{money(r.flexible)}</td>
                    </>
                  )
                ) : (
                  <td style={{ verticalAlign: 'top' }}>{money(r.lifestyle)}</td>
                )}
                <td style={{ verticalAlign: 'top' }}>
                  {money(r.health)}
                  {r.healthMainLabel && <div style={sub}>{r.healthMainLabel}</div>}
                  {r.medicareDelayed.length > 0 && (
                    <div style={sub}>
                      Medicare delayed: {r.medicareDelayed.map((w) => (w === 1 ? (inputs.spouse1Name || 'Primary') : (inputs.spouse2Name || 'Spouse'))).join(' & ')} on an employer plan
                    </div>
                  )}
                </td>
                {columns.debt && <td className="hide-mobile" style={{ verticalAlign: 'top' }}>{money(r.debt)}</td>}
                {columns.lifeEvents && (
                  <td style={{ verticalAlign: 'top' }}>
                    {r.lifeEvents > 0 ? <strong>{formatCurrency(r.lifeEvents)}</strong> : '—'}
                    {r.lifeEventNames.length > 0 && <div style={sub}>{r.lifeEventNames.join(', ')}</div>}
                  </td>
                )}
                {columns.gifts && <td className="hide-mobile" style={{ verticalAlign: 'top' }}>{money(r.gifts)}</td>}
                <td style={{ verticalAlign: 'top' }}>{money(r.incomeTax)}</td>
                {columns.saved && (
                  <td style={{ verticalAlign: 'top' }}>
                    {money(r.saved)}
                    {r.isRetired && r.savedParts.reinvested > 0 && <div style={sub}>left over, reinvested</div>}
                  </td>
                )}
                <td style={{ verticalAlign: 'top', fontWeight: 600 }}>{formatCurrency(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default YearLedgerTab;
