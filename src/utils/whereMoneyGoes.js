// The Year by Year ledger's second view, "Where the money goes" (changelog
// 240, the owner 2026-09-24). Every year from now, split into what the year's
// money was used for.
//
// It is a USES-OF-CASH view, not an income statement. the owner asked whether
// savings is an expense ("wouldn't a t-chart show additions to savings as
// an expense?"): in double entry it is not -- a contribution moves cash into
// an investment account and net worth does not change -- but on a
// cash-flow view it IS a use of the year's money, which is what this table
// shows. Hence a "Saved" column, labeled as saving, never as an expense.
//
// THE RECONCILIATION THAT KEEPS IT HONEST. Every column is a row field the
// engine publishes -- nothing is re-derived here (the house rule after
// changelogs 174/176/184/185). And the columns add back to the engine's own
// total, to the dollar:
//
//   total - saved = totalExpenses + hsaMedicalDraw
//                   + (milestoneOutflow - milestoneOutflowGeneral)
//
// because totalExpenses (a) nets out medical costs the HSA paid, which are
// still costs, and (b) excludes a life event paid straight from the account
// it named, which is still money spent. whereMoneyGoes.test.js holds that
// identity across plan shapes.
//
// Property tax is NOT in "Income tax". It sits in the Housing category of
// the lifestyle budget, so it lands in Essentials or Flexible.

const n = (row, key) => Number(row && row[key]) || 0;

// What each year's Health figure is mostly made of, for the line under it.
const HEALTH_PARTS = [
  { key: 'bridge', label: 'own cover before Medicare' },
  { key: 'medicare', label: 'Medicare' },
  { key: 'ltc', label: 'long-term care' },
  { key: 'abroad', label: 'cover abroad' },
];

export function moneyGoesYear(row, { split = false } = {}) {
  const lifestyle = n(row, 'lifestyleExpenses');
  // Essentials only exist for a retired year with a ledger that marks some
  // categories essential (essentialSpending is null otherwise), and only
  // when the caller may show the split. The early-retirement travel extra
  // rides inside lifestyleExpenses, so it lands in Flexible -- which is
  // what it is.
  const canSplit = split && !!row.isRetired && row.essentialSpending !== null && row.essentialSpending !== undefined;
  const essentials = canSplit ? Math.min(lifestyle, Math.max(0, n(row, 'essentialSpending'))) : null;

  const healthParts = {
    bridge: n(row, 'healthcareBridge'),
    medicare: n(row, 'irmaaCost') + n(row, 'medicarePenalty') + n(row, 'medicareSupplement'),
    ltc: n(row, 'ltcCost'),
    abroad: n(row, 'foreignHealthcare'),
  };
  const health = healthParts.bridge + healthParts.medicare + healthParts.ltc + healthParts.abroad;
  const mainHealth = HEALTH_PARTS.map((p) => ({ ...p, amount: healthParts[p.key] }))
    .sort((a, b) => b.amount - a.amount)[0];

  const debt = n(row, 'mortgagePaymentThisYear') + n(row, 'otherDebtPaymentThisYear');
  const lifeEvents = n(row, 'milestoneOutflow');
  const gifts = n(row, 'giftsThisYear');
  const incomeTax = n(row, 'totalTaxesPaid');

  // Saved: the contributions actually made (the planned ones less any the
  // engine cut to balance a short year), anything routed into the cash
  // reserve while working, and unspent money reinvested in Taxable.
  const contributed = Math.max(0, n(row, 'totalContributions') - n(row, 'savingsDeficit'));
  const savedParts = {
    contributed,
    reserve: n(row, 'cashReservePreFund'),
    reinvested: n(row, 'surplusReinvested'),
  };
  const saved = savedParts.contributed + savedParts.reserve + savedParts.reinvested;

  return {
    year: row.year,
    age1: row.age1 ?? null,
    age2: row.age2 ?? null,
    isRetired: !!row.isRetired,
    lifestyle,
    essentials,
    flexible: essentials === null ? null : lifestyle - essentials,
    health,
    healthParts,
    healthMainLabel: health > 0 && mainHealth.amount > 0 ? mainHealth.label : null,
    fromHsa: n(row, 'hsaMedicalDraw'),
    // Changelog 241: whose Medicare a current employer's plan held off.
    medicareDelayed: [row.medicareDeferred1 ? 1 : null, row.medicareDeferred2 ? 2 : null].filter(Boolean),
    debt,
    lifeEvents,
    lifeEventNames: Array.isArray(row.milestoneOutflowNames) ? row.milestoneOutflowNames : [],
    gifts,
    incomeTax,
    saved,
    savedParts,
    total: lifestyle + health + debt + lifeEvents + gifts + incomeTax + saved,
  };
}

// Which optional columns this plan needs: a column that is zero in every
// year is left out, the way the balances view hides Debt Bal with no debt.
export function whereMoneyGoes(projection, { split = false } = {}) {
  const years = (projection && projection.years) || [];
  const rows = years.map((row) => moneyGoesYear(row, { split }));
  const any = (key) => rows.some((r) => r[key] > 0);
  return {
    rows,
    columns: {
      split: rows.some((r) => r.essentials !== null),
      debt: any('debt'),
      lifeEvents: any('lifeEvents'),
      gifts: any('gifts'),
      saved: any('saved'),
    },
    // Would a split exist if the caller could show it? Lets the free view
    // say what Premium adds instead of staying silent about it.
    splitAvailable: years.some((row) => row.isRetired && row.essentialSpending !== null && row.essentialSpending !== undefined),
  };
}

export const MONEY_GOES_CSV_HEADERS = [
  'Year', 'Age 1', 'Age 2', 'Lifestyle', 'Essentials', 'Flexible', 'Health', 'Of which paid from HSA',
  'Debt', 'Life Events', 'Life Event Names', 'Gifts', 'Income Tax', 'Saved', 'Total Out',
];

const round = (v) => (v === null || v === undefined ? '' : Math.round(v));
const quote = (s) => `"${String(s).replace(/"/g, '""')}"`;

export function buildMoneyGoesCsv(projection, { split = false } = {}) {
  const { rows } = whereMoneyGoes(projection, { split });
  const lines = [MONEY_GOES_CSV_HEADERS.join(',')];
  for (const r of rows) {
    lines.push([
      r.year, r.age1 ?? '', r.age2 ?? '', round(r.lifestyle), round(r.essentials), round(r.flexible),
      round(r.health), round(r.fromHsa), round(r.debt), round(r.lifeEvents), quote(r.lifeEventNames.join('; ')),
      round(r.gifts), round(r.incomeTax), round(r.saved), round(r.total),
    ].join(','));
  }
  return lines.join('\n');
}
