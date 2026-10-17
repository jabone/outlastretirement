import { readResidencyTimeline, planWideResidence, residenceForYear, planHorizonYear } from '../calculator';
import { US_STATE_NAME } from '../config/usStates';
import { catalogById, vintageLabel, isPresetStale } from '../config/jurisdictionCatalog';

// The text of the years-abroad notice (see ForeignYearsNotice.jsx for the
// rules it keeps). Kept apart from the component so tests and other code
// can read the lines without importing a component module.
//
// The country summaries themselves are Premium (the relocation module), so
// this reads only what the open app has: the public catalog (label,
// vintage) and the notes the module snapshotted onto the move when it was
// added (readForeignTerms().presetNotes). A plan with a move abroad shows
// the same notice with or without a key.

const ALWAYS = 'As a US citizen you owe US tax wherever you live. Moving abroad does not end it, and some of it — including the 3.8% tax on investment income — cannot be reduced by tax you pay abroad.';

const listCountries = (moves) => {
  const parts = moves.map((m) => `${m.countryName} (from ${m.fromYear})`);
  return parts.length <= 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
};

export function foreignYearsNoticeLines(inputs, now = new Date()) {
  const planWide = planWideResidence(inputs);
  const moves = readResidencyTimeline(inputs.residencyTimeline, planWide);
  const abroad = moves.filter((m) => m.kind === 'foreign');
  if (abroad.length === 0) return null;

  const first = abroad[0];
  const lead = abroad.length === 1
    ? `From ${first.fromYear} this plan treats you as a resident of ${first.countryName}`
    : `This plan treats you as a resident of ${listCountries(abroad)}`;
  const countries = [...new Set(abroad.map((m) => m.countryName))];
  const adviserFor = countries.length === 1 ? countries[0] : 'those countries';

  // The summary each move came from, if any.
  const presetOf = (m) => (m.foreign.presetId ? catalogById(m.foreign.presetId) : null);
  const allPreset = abroad.every((m) => presetOf(m) && !m.foreign.presetEdited);

  const horizon = planHorizonYear(inputs);
  const conditional = [];
  for (const m of abroad) {
    const p = presetOf(m);
    if (p && m.foreign.presetEdited) {
      conditional.push({ id: `edited-${m.id}`, text: `You changed some of our ${p.label} figures. The plan uses yours, and we have not checked them.` });
    }
    if (p && isPresetStale(p, now)) {
      conditional.push({ id: `stale-${m.id}`, text: `Our ${p.label} summary was last checked ${vintageLabel(p.vintage)}, more than 18 months ago. Its figures may be out of date.` });
    }
    // Our own Roth line only while the move keeps our Roth answer (the
    // module snapshots it only then).
    const ours = p && m.foreign.presetNotes ? m.foreign.presetNotes.rothLine : null;
    if (ours) conditional.push({ id: `roth-${m.id}`, text: ours });
    else if (m.foreign.roth === 'respect') {
      conditional.push({ id: `roth-${m.id}`, text: `You told this plan ${m.countryName} does not tax your Roth. Many countries do, and for most there is no settled answer. If yours does, this plan understates your tax.` });
    }
    // A regime's end is a step change in the ledger; say when it comes
    // (changelog 199) -- unless the plan moves on or ends first.
    const r = m.foreign.regime;
    if (r) {
      const lastYear = m.fromYear + r.years - 1;
      const next = moves.find((x) => x.fromYear > m.fromYear);
      if (lastYear < horizon && !(next && next.fromYear <= lastYear + 1)) {
        conditional.push({ id: `regime-${m.id}`, text: `Your ${r.label} in ${m.countryName} ends after ${lastYear}. From ${lastYear + 1} the plan taxes you under ${m.countryName}’s ordinary rules instead.` });
      }
    }
    if (p && m.foreign.presetNotes) {
      m.foreign.presetNotes.warnings.forEach((text, i) => conditional.push({ id: `assume-${m.id}-${i}`, text }));
    }
  }
  const claims = [...new Map(abroad
    .filter((m) => m.stateOfResidence && m.stateTaxState !== 'none' && m.stateTaxState !== 'TX_FL')
    .map((m) => [m.stateOfResidence, m])).values()];
  for (const m of claims) {
    const name = US_STATE_NAME[m.stateOfResidence] || m.stateOfResidence;
    conditional.push({ id: `claim-${m.stateOfResidence}`, text: `${name} can keep taxing a former resident who has not clearly cut ties, and it gives no credit for foreign tax. This plan keeps charging ${name} tax until you tell it you have cut ties.` });
  }
  const last = residenceForYear(inputs, planHorizonYear(inputs));
  // Our line only while the move keeps our summary's estate rules, which
  // the module decided when the move was added.
  const lastNotes = last.kind === 'foreign' && last.foreign.presetId ? last.foreign.presetNotes : null;
  const keepsOurEstate = !!(lastNotes && lastNotes.estateKept && lastNotes.estateNote);
  if (keepsOurEstate) {
    conditional.push({ id: 'estate-preset', text: lastNotes.estateNote });
  } else if (last.kind === 'foreign' && last.foreign.inheritance) {
    conditional.push({ id: 'estate-own-schedule', text: `Foreign inheritance tax uses your figures for ${last.countryName}, heir by heir. It is added on top of US estate tax; the two are not credited against each other, so this may overstate the total.` });
  } else if (last.kind === 'foreign') {
    conditional.push(last.foreign.estateRate === null
      ? { id: 'estate-none', text: 'Foreign inheritance or estate tax is not included. Many countries charge one, and it can be large. You can add your own estimate under Life Events › Where you live.' }
      : { id: 'estate-est', text: `Foreign inheritance tax uses your estimate of ${last.foreign.estateRate}% of the estate. It is added on top of US estate tax; the two are not credited against each other, so this may overstate the total.` });
  }

  if (allPreset) {
    const checked = [...new Set(abroad.map((m) => vintageLabel(presetOf(m).vintage)))].join(' and ');
    return {
      title: 'Years abroad are estimates.',
      body: `${lead}, using our summary of ${countries.length === 1 ? 'its' : 'their'} rules, last checked ${checked}. It has not been reviewed by a cross-border tax professional, and foreign tax law, tax treaties and special regimes can change without notice. Before you act on these numbers, check them with an adviser who handles both US and ${adviserFor} tax.`,
      always: ALWAYS,
      conditional,
    };
  }
  return {
    title: 'Years abroad use your own figures.',
    body: `${lead} and taxes you using the rates and rules you entered. We have not checked them. The app works out the US side itself — US tax on your worldwide income, and the credit for tax you pay abroad — but the foreign side is only as good as what you put in. Before you act on these numbers, check them with an adviser who handles both US and ${adviserFor} tax.`,
    always: ALWAYS,
    conditional,
  };
}
