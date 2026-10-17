import React, { useState } from 'react';
import { MapPin, Plus, Trash2, BookOpen, Globe } from 'lucide-react';
import {
  readResidencyTimeline, stateTaxJurisdictionFor, planWideResidence, residenceForYear,
} from '../calculator';
import { US_STATES, US_STATE_NAME } from '../config/usStates';
import { stateRulesName, stateRulesRate } from '../utils/stateRulesSummary';
import ForeignYearsNotice from './ForeignYearsNotice';
import { catalogById } from '../config/jurisdictionCatalog';
import PremiumMount from '../premium/PremiumMount';

// Plan Settings -> Life Events -> Where you live.
//
// Changelog 195 (rung 1, free): planned moves between US states.
// Changelog 196 (rung 2, Premium): moves abroad, using figures the user
// supplies for the country (Custom Country) -- RELOCATION_SPEC.md.
// Changelog 197 (rung 3): country summaries that prefill that same form.
// A summary is only a prefill: every field stays editable, and the entry
// remembers which summary it came from and whether the user changed it.
// The abroad form and the summaries are the relocation Premium module
// (mounts residencyTimeline and relocationCompare); this panel keeps the
// list, the shared fields and the move between US states, and labels an
// existing move abroad from the public catalog (config/jurisdictionCatalog).
//
// The panel owns no state beyond its add forms. It reads the timeline
// through readResidencyTimeline -- the same normalizer the engine uses --
// so the list shows exactly what the projection will price, and it writes
// through `onChange`, which Plan Settings wires to
// updateInput('residencyTimeline', ...).

const TAX_LABEL = {
  none: 'No state income tax',
  TX_FL: 'No state income tax',
  ca: 'California rules',
  ny: 'New York rules',
  il: 'Illinois rules',
  co: 'Colorado rules',
  pa: 'Pennsylvania rules',
  va: 'Virginia rules',
  wa: 'Washington rules',
};

const ROTH_SHORT = { respect: 'Roth respected', taxableAccount: 'Roth taxed like a brokerage account', rate: 'Roth withdrawals taxed', earnings: 'Roth earnings taxed' };

// A state priced from its own record (changelog 361) is named for itself.
const taxLabel = (jurisdiction, code) => (jurisdiction === 'state_rules' && stateRulesName(code)
  ? `${stateRulesName(code)} rules (${stateRulesRate(code)})`
  : TAX_LABEL[jurisdiction] || jurisdiction);

const domesticLabel = (m) => (m.stateTaxState === 'flat_5'
  ? `Flat ${m.stateTaxFlatRate}%${m.stateTaxSocialSecurityTaxable ? ', taxes Social Security' : ''}${m.stateTaxPensionTaxable ? '' : ', pensions exempt'}`
  : taxLabel(m.stateTaxState, m.stateOfResidence))
  + (m.nycResident ? ' + New York City' : '')
  + (m.yonkersResident ? ' + Yonkers' : '');

const foreignChips = (m) => {
  const f = m.foreign;
  const preset = f.presetId ? catalogById(f.presetId) : null;
  const chips = [];
  if (preset) chips.push(f.presetEdited ? `Our ${preset.label} summary, with your changes` : `Our ${preset.label} summary`);
  chips.push(
    f.taxMode === 'brackets' ? 'Local tax brackets' : `${f.ordinaryRate}% on retirement income`,
    f.investmentMode === 'ordinary' ? 'Investments on its income-tax scale' : `${f.investmentRate}% on investments`,
    f.roth === 'rate' ? `${ROTH_SHORT.rate} at ${f.rothRate}%` : ROTH_SHORT[f.roth],
  );
  if (f.contributionRate > 0) chips.push(`${f.contributionRate}% contribution`);
  if (f.regime) chips.push(`${f.regime.label} until ${m.fromYear + f.regime.years - 1}`);
  if (f.wealthTax) chips.push('Yearly tax on account balances');
  if (f.remittance) chips.push(f.remittance.share < 100 ? `Taxed on ${f.remittance.share}% of what you bring in` : 'Taxed on what you bring in');
  if (f.inheritance) chips.push('Inheritance tax per heir');
  if (f.treatyResourcing) chips.push('US credit for its tax');
  if (f.usExemptsSocialSecurity) chips.push('US does not tax Social Security');
  if (!f.medicarePartBRetained) chips.push('Medicare Part B dropped');
  if (m.stateDomicileSevered) chips.push('Ties to US state cut');
  else if (m.stateOfResidence && m.stateTaxState !== 'none') chips.push(`${US_STATE_NAME[m.stateOfResidence] || m.stateOfResidence} keeps its claim`);
  return chips;
};

// Stable key for removal: the normalizer's own id rule.
const idOf = (e) => (e && e.id != null ? String(e.id) : String(Math.trunc(Number(e?.fromYear))));

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export default function ResidencyTimelinePanel({ inputs, onChange, horizonYear, onOpenPremium }) {
  const planYear = inputs.planYear;
  const planWide = planWideResidence(inputs);
  const moves = readResidencyTimeline(inputs.residencyTimeline, planWide);
  const raw = Array.isArray(inputs.residencyTimeline) ? inputs.residencyTimeline : [];

  const [destination, setDestination] = useState('state'); // 'state' | 'abroad'
  const [year, setYear] = useState(planYear + 5);
  // Changelog 203: the month the move takes effect, and living costs there.
  const [month, setMonth] = useState(1);
  const [costOfLiving, setCostOfLiving] = useState(100);
  // Domestic form.
  const [state, setState] = useState('FL');
  const [flatRate, setFlatRate] = useState(5);
  const [taxesSS, setTaxesSS] = useState(false);
  const [taxesPension, setTaxesPension] = useState(true);
  const [nyCity, setNyCity] = useState('none'); // 'none' | 'nyc' | 'yonkers'

  // A state with its own rules can still be priced at a flat rate the
  // user sets instead (changelog 361).
  const [ownFlatRate, setOwnFlatRate] = useState(false);
  const autoJurisdiction = stateTaxJurisdictionFor(state);
  const jurisdiction = autoJurisdiction === 'state_rules' && ownFlatRate ? 'flat_5' : autoJurisdiction;
  const yearOk = Number.isFinite(year) && year >= planYear && year <= horizonYear;
  const clash = moves.some((m) => m.fromYear === year);
  const ageIn = (y) => y - inputs.birthYear1;
  // Where the household lives the year before this move -- the state whose
  // claim a move abroad would carry.
  const prior = yearOk ? residenceForYear(inputs, year - 1) : planWide;
  const priorState = prior.stateOfResidence;
  const priorName = priorState ? (US_STATE_NAME[priorState] || priorState) : null;
  const priorHasNoIncomeTax = prior.stateTaxState === 'none' || prior.stateTaxState === 'TX_FL';
  // A move home from abroad always takes effect from January (changelog
  // 203): the engine prices the foreign layer only for a move out.
  const returningHome = destination === 'state' && prior.kind === 'foreign';

  const commit = (entry) => onChange([...raw.filter((e) => Math.trunc(Number(e?.fromYear)) !== year), entry]);

  const addDomestic = () => {
    if (!yearOk) return;
    commit({
      id: Date.now().toString(),
      fromYear: year,
      fromMonth: returningHome ? 1 : month,
      costOfLivingPct: costOfLiving,
      kind: 'domestic',
      stateOfResidence: state,
      stateTaxState: jurisdiction,
      stateTaxFlatRate: jurisdiction === 'flat_5' ? flatRate : 5,
      stateTaxSocialSecurityTaxable: jurisdiction === 'flat_5' && taxesSS,
      stateTaxPensionTaxable: jurisdiction === 'flat_5' ? taxesPension : true,
      nycResident: jurisdiction === 'ny' && nyCity === 'nyc',
      yonkersResident: jurisdiction === 'ny' && nyCity === 'yonkers',
    });
  };


  const remove = (id) => onChange(raw.filter((e) => idOf(e) !== id));

  const chip = { fontSize: 'var(--fs-2xs)', padding: '3px 6px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' };
  const hint = { fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 };
  const check = (id, checked, set, label, help) => (
    <div>
      <label style={{ fontSize: 'var(--fs-sm)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
        <input id={id} type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} />
        {label}
      </label>
      {help && <div style={{ ...hint, marginLeft: '24px' }}>{help}</div>}
    </div>
  );

  return (
    <div className="glass-panel" style={{ padding: '20px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)', marginBottom: '30px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <MapPin size={18} style={{ color: 'var(--accent-text)' }} />
        <span>Where you live</span>
      </h3>
      <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
        Planning to move? Add the year and where you are going. Every year from then on is taxed where you live,
        and your estate is taxed by where you live at the end of the plan.
      </p>

      <ForeignYearsNotice inputs={inputs} />

      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        {/* The list */}
        <div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: '10px' }}>
            <strong>Starting in {planYear}:</strong> {US_STATE_NAME[inputs.stateOfResidence] || inputs.stateOfResidence}
            <span style={{ color: 'var(--text-muted)' }}> (your State of Residence and State Income Tax Jurisdiction settings)</span>
          </div>
          {moves.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--card-border)', borderRadius: '12px', fontSize: 'var(--fs-sm)' }}>
              No moves planned &mdash; the whole plan is taxed as your current state.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {moves.map((m) => {
                const abroad = m.kind === 'foreign';
                const label = abroad ? m.countryName : (US_STATE_NAME[m.stateOfResidence] || m.stateOfResidence);
                const where = abroad ? m.countryName : m.stateOfResidence;
                return (
                  <div key={m.id} className="glass-panel" style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                    <div>
                      <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', textTransform: 'uppercase', color: 'var(--accent-text)', letterSpacing: '0.05em' }}>
                        From {m.fromYear} &middot; age {ageIn(m.fromYear)}{abroad ? ' · abroad' : ''}
                      </span>
                      <div style={{ fontSize: '15px', fontWeight: '600', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {abroad && <Globe size={14} />}{label}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                        {(abroad ? foreignChips(m) : [domesticLabel(m)]).map((c) => <span key={c} style={chip}>{c}</span>)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-outline"
                      aria-label={`Remove the ${m.fromYear} move to ${where}`}
                      onClick={() => remove(m.id)}
                      style={{ padding: '6px 8px' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {moves.some((m) => m.kind === 'foreign') && (
            <PremiumMount id="relocationCompare" />
          )}
        </div>

        {/* The add forms */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="form-group">
            <label htmlFor="field-residencyMoveYear">Move in year</label>
            <input
              id="field-residencyMoveYear"
              type="number"
              className="form-input"
              min={planYear}
              max={horizonYear}
              value={Number.isFinite(year) ? year : ''}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
            />
            <div style={{ ...hint, color: yearOk ? 'var(--text-muted)' : 'var(--warning)' }}>
              {yearOk
                ? `You will be ${ageIn(year)}.${returningHome ? ' A move home from abroad takes effect on January 1.' : month > 1 ? ` That year is shared by months: January to ${MONTH_NAMES[month - 2]} where you live now, the rest in the new place.` : ' Takes effect on January 1.'}${clash ? ' Replaces the move already planned for that year.' : ''}`
                : `Pick a year from ${planYear} to ${horizonYear}.`}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="field-residencyMoveMonth">Month</label>
            <select id="field-residencyMoveMonth" className="form-input" value={returningHome ? 1 : month} disabled={returningHome} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
              {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="field-residencyCostOfLiving">Living costs there (% of your spending now)</label>
            <input id="field-residencyCostOfLiving" type="number" className="form-input" min={10} max={300} step={5}
              value={costOfLiving} onChange={(e) => setCostOfLiving(num(e.target.value) || 100)} />
            <div style={hint}>
              Your lifestyle spending from the move on, as a share of what you spend now. 100% leaves it unchanged.
            </div>
          </div>

          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', gap: '16px' }}>
            <legend style={{ fontSize: 'var(--fs-sm)', marginBottom: '6px' }}>Moving to</legend>
            <label style={{ fontSize: 'var(--fs-sm)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input type="radio" name="residencyDestination" checked={destination === 'state'} onChange={() => setDestination('state')} />
              Another US state
            </label>
            <label style={{ fontSize: 'var(--fs-sm)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input type="radio" name="residencyDestination" checked={destination === 'abroad'} onChange={() => setDestination('abroad')} />
              Another country
            </label>
          </fieldset>

          {destination === 'state' && (
            <>
              <div className="form-group">
                <label htmlFor="field-residencyMoveState">State</label>
                <select id="field-residencyMoveState" className="form-input" value={state} onChange={(e) => setState(e.target.value)}>
                  {US_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
                <div style={hint}>Taxed as: {jurisdiction === 'flat_5' ? 'a flat rate you set' : taxLabel(jurisdiction, state)}</div>
              </div>

              {autoJurisdiction === 'state_rules' && check('toggle-residencyMoveOwnFlatRate', ownFlatRate, setOwnFlatRate, 'Use a flat rate I set instead of this state’s rules')}

              {jurisdiction === 'flat_5' && (
                <>
                  <div className="form-group">
                    <label htmlFor="field-residencyMoveFlatRate">That state&rsquo;s income tax rate (%)</label>
                    <input
                      id="field-residencyMoveFlatRate"
                      type="number"
                      className="form-input"
                      min={0}
                      max={15}
                      step={0.1}
                      value={flatRate}
                      onChange={(e) => setFlatRate(Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                  </div>
                  {check('toggle-residencyMoveTaxesSS', taxesSS, setTaxesSS, 'It taxes Social Security')}
                  {check('toggle-residencyMoveTaxesPension', taxesPension, setTaxesPension, 'It taxes pensions')}
                </>
              )}

              {jurisdiction === 'ny' && (
                <div className="form-group">
                  <label htmlFor="field-residencyMoveNyCity">City</label>
                  <select id="field-residencyMoveNyCity" className="form-input" value={nyCity} onChange={(e) => setNyCity(e.target.value)}>
                    <option value="none">Elsewhere in New York</option>
                    <option value="nyc">New York City (adds the city&rsquo;s income tax)</option>
                    <option value="yonkers">Yonkers (adds the Yonkers surcharge)</option>
                  </select>
                </div>
              )}

              <button type="button" className="btn-primary" onClick={addDomestic} disabled={!yearOk} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Plus size={16} /> Add move
              </button>

              <div style={{ display: 'flex', gap: '8px', ...hint }}>
                <BookOpen size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  A move after January splits that year by months &mdash; close to what two part-year returns
                  would do, though each state has its own rules for it. Leaving a state does not always end its claim on you: California and New
                  York in particular can keep taxing a former resident who has not clearly broken ties.
                </span>
              </div>
            </>
          )}

          {destination === 'abroad' && (
            <PremiumMount
              id="residencyTimeline"
              year={year}
              yearOk={yearOk}
              month={month}
              costOfLiving={costOfLiving}
              setCostOfLiving={setCostOfLiving}
              priorName={priorName}
              priorState={priorState}
              priorHasNoIncomeTax={priorHasNoIncomeTax}
              commit={commit}
              locked={(
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 12px' }}>
                    A US citizen who retires abroad keeps paying US tax on everything, everywhere, and pays the new
                    country&rsquo;s tax on top &mdash; with a credit that covers some of it and not the rest. Planning that
                    year by year, alongside your Roth, Medicare and your estate, is part of Premium.
                  </p>
                  <button className="btn-outline" style={{ padding: '6px 12px', fontSize: 'var(--fs-xs)' }} onClick={() => onOpenPremium && onOpenPremium()}>
                    Part of Premium &mdash; see what it includes
                  </button>
                </div>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
