import { FIELD_INDEX } from '../config/fieldIndex';
import { DEFAULT_INPUTS } from '../calculator';

// The data behind the planner-packet "Every plan setting" page
// (PlanDetailsSheet.jsx, which describes what is listed and why).

const ORDER = ['household', 'income', 'savings', 'balances', 'spending', 'taxes', 'assumptions', 'milestones', 'estate'];
// Stored as a fraction, shown on the form as a percent.
const FRACTION_AS_PERCENT = new Set(['goGoMultiplier', 'slowGoMultiplier', 'noGoMultiplier', 'taxableCapitalGainsRatio']);
// Names are handled by "Leave out names"; ledger lines have their own page.
const SKIP_KEYS = new Set(['spouse1Name', 'spouse2Name', 'spendingBlueprint']);
// What a planner needs even when it happens to equal the app's default.
const ALWAYS_PRINT = /^(stateOfResidence|filingStatus|stateTaxState|(birthYear|retireAge|lifeExpectancy|claimingAge|sex|ss|salary|preTaxContribution|rothContribution|employerMatch)[12]|preTaxInit|rothInit|taxableInit|hsaInit|cashFloorInit|taxableContribution|hsaContribution|lifestyleExpense|healthcareBridgeCost|inflationRate|preRetireReturn|postRetireReturn|stockReturnRate|bondReturnRate|withdrawalStrategy|rothConversionStrategy|mortgageBalance|mortgagePayment|otherDebtBalance)$/;
export const alwaysPrinted = (key) => ALWAYS_PRINT.test(key);
// Labels with a live value stripped out of them read oddly on paper.
const cleanLabel = (label) => label.replace(/\s+\)/g, ')').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();

export const humanize = (v) => String(v)
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/^./, (c) => c.toUpperCase());

export function formatSetting(entry, value, formatCurrency) {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (entry.options && entry.options[String(value)] !== undefined) return entry.options[String(value)];
  if (typeof value === 'number') {
    if (FRACTION_AS_PERCENT.has(entry.key)) return `${Math.round(value * 1000) / 10}%`;
    // A tax bracket stored as a rate (0.22) prints as 22%.
    if (/Bracket$/.test(entry.key) && value > 0 && value < 1) return `${Math.round(value * 1000) / 10}%`;
    if (/\(\$|\$\/|\$\)|\(\$\/yr/.test(entry.label)) return formatCurrency(value);
    if (/%/.test(entry.label)) return `${value}%`;
    // Years and ages read as 1980 and 67, not 1,980.
    return Math.abs(value) >= 10000 ? value.toLocaleString('en-US') : String(value);
  }
  if (typeof value === 'string') {
    if (/^[A-Za-z]+[A-Z][A-Za-z]*$/.test(value)) return humanize(value);
    return /^[a-z]/.test(value) ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  }
  return null;
}

const isEmpty = (v) => v === undefined || v === null || v === '' || v === false || v === 0 || (typeof v === 'number' && !Number.isFinite(v)) || typeof v === 'object';

export function planDetailsModel(inputs, { formatCurrency = (v) => `$${Math.round(v).toLocaleString('en-US')}`, fields = FIELD_INDEX } = {}) {
  const spouse2 = Boolean(inputs?.spouse2Enabled);
  // A section whose leading switch is off contributes nothing: its other
  // fields keep their defaults, which describe a feature the plan does not use.
  const groups = new Map();
  for (const e of fields) {
    const g = `${e.section}|${(e.folds || []).map((f) => f.id).join('/')}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e);
  }
  // A switch whose stored name differs from its field id (toggle-x -> xEnabled).
  const keyOf = (e) => ((e.key in (inputs || {})) ? e.key : ((`${e.key}Enabled` in (inputs || {})) ? `${e.key}Enabled` : null));
  // An "enable" switch (the first control of its section, or one stored as
  // ...Enabled) hides the fields after it, up to the next switch, when off.
  // A plain option switch (on/off with nothing under it) gates nothing.
  const bySubTab = new Map();
  for (const list of groups.values()) {
    let hidden = false;
    list.forEach((e, i) => {
      const key = keyOf(e);
      if (e.id.startsWith('toggle-')) {
        const gates = i === 0 || (key && /Enabled$/.test(key));
        if (gates) hidden = !(key && inputs[key]);
        else if (hidden) return;
      } else if (hidden) return;
      if (!key || SKIP_KEYS.has(key)) return;
      // Settings of a feature chosen by a dropdown rather than a switch.
      if (/^rothConversion(?!Strategy$)/.test(key) && (inputs.rothConversionStrategy || 'none') === 'none') return;
      if (!spouse2 && /\(Spouse 2\)$/.test(e.label)) return;
      const v = inputs[key];
      if (isEmpty(v)) return;
      if (!alwaysPrinted(key) && key in DEFAULT_INPUTS && DEFAULT_INPUTS[key] === v) return;
      const shown = formatSetting({ ...e, key }, v, formatCurrency);
      if (shown === null) return;
      const k = e.subTab;
      if (!bySubTab.has(k)) bySubTab.set(k, { id: k, label: e.tab === 'settings' ? e.subTabLabel : `${e.tabLabel}: ${e.subTabLabel}`, rows: [] });
      if (!bySubTab.get(k).rows.some((r) => r.label === e.label)) bySubTab.get(k).rows.push({ key, label: cleanLabel(e.label), value: shown });
    });
  }
  return ORDER.filter((k) => bySubTab.has(k)).map((k) => bySubTab.get(k))
    .concat([...bySubTab.keys()].filter((k) => !ORDER.includes(k)).map((k) => bySubTab.get(k)));
}
