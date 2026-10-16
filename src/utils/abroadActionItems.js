// The Action Plan's "Moving Abroad" section (changelog 201,
// RELOCATION_SPEC.md section 8.2 surface 4): the things a move abroad
// needs DONE that no projection can do for you -- cutting ties with the
// old state, health cover, the Medicare Part B decision, finishing Roth
// conversions, claiming a regime, the US filings that follow you.
//
// Like the rest of actionPlan.js: no financial math of its own. Every
// dollar figure is a sum of ledger fields; every condition is a field of
// the move as the engine reads it.
import { readResidencyTimeline, planWideResidence } from '../calculator';
import { US_STATE_NAME } from '../config/usStates';

const STICKY_STATES = new Set(['CA', 'NY', 'NM', 'SC', 'VA']);
const NO_STATE_TAX = new Set(['none', 'TX_FL']);

const sumRows = (rows, key) => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);

// What to say about claiming a regime, by the summary option that set it.
const REGIME_HOW = {
  'it-7pct': 'Opt in on your first Italian tax return, and be living in a qualifying southern town from the start. It cannot be claimed in a later year.',
  'it-lump-sum': 'Apply on your first Italian tax return. The yearly amount is due whatever your income that year.',
  'th-ltr': 'Apply for the LTR visa before you rely on the exemption, and keep meeting its income test every year: it lapses in any year you do not.',
};

export function buildAbroadActionItems(inputs, projection, formatCurrency) {
  const fc = typeof formatCurrency === 'function'
    ? formatCurrency
    : (v) => `$${Math.round(v || 0).toLocaleString()}`;
  const planWide = planWideResidence(inputs);
  const moves = readResidencyTimeline(inputs.residencyTimeline, planWide);
  const abroad = moves.filter((m) => m.kind === 'foreign');
  if (abroad.length === 0) return [];
  const rows = (projection && projection.years) || [];
  const items = [];

  for (const m of abroad) {
    const Y = m.fromYear;
    const C = m.countryName;
    const f = m.foreign;
    const next = moves.find((x) => x.fromYear > Y);
    const endYear = next ? next.fromYear - 1 : Infinity;
    const there = rows.filter((r) => r.year >= Y && r.year <= endYear);
    const prior = moves.filter((x) => x.fromYear < Y).at(-1) || planWide;

    // 1. The state left behind.
    if (prior.kind !== 'foreign' && prior.stateOfResidence && !NO_STATE_TAX.has(prior.stateTaxState)) {
      const name = US_STATE_NAME[prior.stateOfResidence] || prior.stateOfResidence;
      if (m.stateDomicileSevered) {
        items.push({
          label: `Cut your ties with ${name} before ${Y}`,
          detail: `The plan stops charging ${name} tax from ${Y}. That only holds if you clearly leave: sell or rent out your home there, and move your driver’s license, voter registration, bank accounts and doctors. File your last ${name} resident return for the year you go.`,
        });
      } else {
        const claimed = sumRows(there, 'stateTax');
        items.push({
          label: `Decide whether to cut ties with ${name}`,
          detail: `${name} can keep taxing a former resident who has not clearly left, with no credit for tax paid in ${C}. The plan keeps charging it${claimed > 0 ? ` — ${fc(claimed)} over your years in ${C}` : ''}.${STICKY_STATES.has(prior.stateOfResidence) ? ` ${name} is one of the states most likely to hold on; a common route is to live in a state with no income tax, such as Texas or Florida, for six months or more before leaving the US.` : ''}`,
        });
      }
    }

    // 2. Health cover.
    if (f.healthcareCost > 0) {
      items.push({
        label: `Arrange health cover for ${C} before you apply to live there`,
        detail: `Most residence visas require private cover, and many insurers stop taking new customers in their 60s or 70s. The plan budgets ${fc(f.healthcareCost)} a year in today’s dollars.`,
      });
    }

    // 3. Medicare Part B.
    if (f.medicarePartBRetained) {
      items.push({
        label: `Keep paying Medicare Part B while you live in ${C}`,
        detail: 'Medicare covers almost nothing outside the US, but dropping Part B means a premium 10% higher for every year without it, for life, if you ever come back.',
      });
    } else {
      const penalty = sumRows(rows.filter((r) => r.year > endYear), 'medicarePenalty');
      items.push({
        label: `Medicare Part B: you plan to drop it from ${Y}`,
        detail: `If you come back you can re-enroll only from January 1 to March 31, and the premium is 10% higher for every full year you went without it — for life.${penalty > 0 ? ` Your plan returns in ${next.fromYear}; the penalty adds ${fc(penalty)} over the rest of the plan.` : ''}`,
      });
    }

    // 4. Roth conversions while living there.
    const converted = sumRows(there, 'convertAmount');
    if (converted > 0 && f.taxesRetirementIncome) {
      items.push({
        label: `Finish Roth conversions before ${Y}`,
        detail: `Your plan converts ${fc(converted)} while you live in ${C}. ${C} taxes a conversion as retirement income, on top of the US tax on it — and may tax later Roth withdrawals too. Converting before you move avoids the ${C} tax.`,
      });
    }

    // 5. A special regime.
    if (f.regime) {
      const last = Y + f.regime.years - 1;
      const how = (f.presetAssumptions || []).map((id) => REGIME_HOW[id]).find(Boolean)
        || 'Many regimes must be claimed in your first year there and cannot be claimed later — ask a local adviser how, and by when.';
      items.push({
        label: `Claim ${f.regime.label} in ${C} for ${Y}`,
        detail: `${how} It runs through ${last}; from ${last + 1} the plan uses ${C}’s ordinary rules.`,
      });
    }

    // 6. Taxed on what you bring in.
    if (f.remittance) {
      items.push({
        label: `Keep money that is not income separate from what you bring into ${C}`,
        detail: `${C} taxes foreign income when you bring it in. Savings${f.presetId === 'TH' ? ' from before 2024' : ''} and other money that is not income come in untaxed only if you can show where they came from — keep them in a separate account, with statements.`,
      });
    }

    // 7. A treaty position the plan relies on.
    if (f.treatyResourcing) {
      items.push({
        label: 'Ask your tax preparer about disclosing the treaty',
        detail: `The plan assumes the US–${C} treaty lets the US credit ${C}’s tax on your US pensions and investments. Your return may need to disclose that position on Form 8833; a required disclosure left out costs $1,000.`,
      });
    }
  }

  // Once for any move abroad.
  items.push({
    label: 'Report your foreign accounts to the US every year',
    detail: 'Once your accounts outside the US total more than $10,000 at any point in a year, file an FBAR (FinCEN 114, online, separately from your return). Living abroad, Form 8938 also applies above $200,000 at year-end or $300,000 at any time — $400,000 and $600,000 if married filing jointly.',
  });
  items.push({
    label: 'Keep investing through US funds, with a US broker that accepts residents abroad',
    detail: 'Almost every fund based outside the US counts to the IRS as a PFIC, taxed at the top rate with an interest charge. Local brokers — in Europe especially — often cannot sell you US funds, so keep a US account that will stay open once you live abroad.',
  });
  items.push({
    label: 'Give Social Security your new address',
    detail: 'Payments continue in most countries. Social Security sends a questionnaire from time to time to people living abroad; return it, or payments can stop.',
  });
  return items;
}
