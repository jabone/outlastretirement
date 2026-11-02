// "What does this mean?" -- the plain-words glossary (first-time user
// review, round C, 2026-11-01).
//
// The Input Dictionary explains every field and card, in the app's own
// terms. This is the layer under it: the retirement words themselves, for
// someone who has never needed them. Each entry is two or three sentences
// a beginner can read without looking anything else up, and, where the
// app has a setting or card for it, where to find that. A term marked on
// screen with <Term id="..."> opens its entry here.
//
// Rules for an entry: plain words first, the jargon second; say what it
// does to the person's money, not how the law is written; no figures that
// expire, unless the entry names the year; no advice.

export const GLOSSARY = [
  {
    id: 'pretax',
    term: 'Pre-Tax (traditional 401(k) and IRA)',
    aliases: ['Pre-Tax', 'traditional', '401(k)', 'IRA', '403(b)', 'TSP'],
    plain: 'Money you saved before income tax was taken out, in a traditional 401(k), 403(b), TSP or IRA. It grows untaxed, and every dollar you take out later is taxed as income.',
    where: 'Plan → Balances & Debt.',
  },
  {
    id: 'roth',
    term: 'Roth',
    aliases: ['Roth IRA', 'Roth 401(k)'],
    plain: 'Money you saved after paying income tax on it, in a Roth IRA or Roth 401(k). It grows untaxed and, once the rules are met, comes out tax-free.',
    where: 'Plan → Balances & Debt.',
  },
  {
    id: 'taxable',
    term: 'Taxable (brokerage and savings)',
    aliases: ['Taxable', 'brokerage'],
    plain: 'An ordinary investment or savings account with no special tax treatment. You pay tax each year on interest and dividends, and on any gain when you sell.',
    where: 'Plan → Balances & Debt.',
  },
  {
    id: 'savings-today',
    term: 'Savings today (nest egg)',
    aliases: ['nest egg', 'Initial Nest Egg', 'Savings today'],
    plain: 'Everything you have put away for retirement right now: your Pre-Tax, Roth and Taxable accounts added together. It leaves out your home and other things you own.',
  },
  {
    id: 'average-returns',
    term: 'Average returns',
    aliases: ['average return', 'steady returns'],
    plain: 'The plan grows your savings by the same percentage every year, the rate you set. Real markets never do that: some years are up a lot and some are down. It is a useful middle line, not a forecast.',
    where: 'Plan → Assumptions & Risk.',
  },
  {
    id: 'simulated-markets',
    term: 'Simulated markets (Monte Carlo)',
    aliases: ['Monte Carlo', 'simulated markets', 'trials', 'success rate'],
    plain: 'The app replays your plan 1,000 times, each with a different made-up run of good and bad years. The share of those runs in which the money lasts is the number behind Will It Last?',
    where: 'Risk & Stress → Monte Carlo Probability.',
  },
  {
    id: 'likely-range',
    term: 'Likely range (8 of 10 market paths)',
    aliases: ['Likely range', 'P10', 'P90', 'percentile'],
    plain: 'Out of the 1,000 simulated markets, the middle eight in ten ended between these two amounts. One in ten did worse and one in ten did better. It shows the spread, not the odds of success.',
  },
  {
    id: 'todays-dollars',
    term: 'Today’s dollars',
    aliases: ['real dollars', 'inflation-adjusted', 'future dollars'],
    plain: 'A figure decades from now, shrunk back to what it would buy today. Without it, a future figure is in that year’s dollars, which look bigger because prices rise.',
    where: 'The Today’s Dollars switch in Preferences.',
  },
  {
    id: 'inflation',
    term: 'Inflation',
    aliases: ['prices rise', 'cost of living'],
    plain: 'Prices rising over time, so the same dollar buys less. The plan raises your spending each year by the inflation rate you set.',
    where: 'Plan → Assumptions & Risk.',
  },
  {
    id: 'shortfall',
    term: 'Runs short (shortfall)',
    aliases: ['shortfall', 'runs out', 'Runs short'],
    plain: 'A year when your savings and income cannot cover the spending you planned. The plan does not borrow; it records the gap.',
  },
  {
    id: 'sequence-risk',
    term: 'Bad stretch of markets (sequence of returns)',
    aliases: ['sequence of returns', 'sequence risk', 'bear market', 'crash'],
    plain: 'A fall in the market just before or soon after you retire hurts more than the same fall years later, because you are selling investments to live on while prices are low. It is why a plan can last with average returns yet fall short in some simulated markets.',
    where: 'Risk & Stress.',
  },
  {
    id: 'guardrails',
    term: 'Spending guardrails',
    aliases: ['guardrails', 'Spending Guardrails'],
    plain: 'A rule that spends a little less after bad market years, by skipping that year’s inflation raise or trimming 10% after an early crash, and goes back to normal once savings recover. It often helps money last, at the cost of tighter years.',
    where: 'Risk & Stress → Historical Stress Tests.',
  },
  {
    id: 'withdrawal-order',
    term: 'Withdrawal order',
    aliases: ['withdrawal strategy', 'drawdown'],
    plain: 'Which account the plan takes money from first each year: Taxable, Pre-Tax or Roth. The order changes how much tax you pay over your life and how much is left for your heirs.',
    where: 'Plan → Spending, under Withdrawals & Taxable Account.',
  },
  {
    id: 'roth-conversion',
    term: 'Roth conversion',
    aliases: ['Roth conversions', 'conversion ladder', 'Roth ladder'],
    plain: 'Moving money from a Pre-Tax account into a Roth on purpose. You pay income tax on the amount moved that year, and in return it comes out tax-free later. People often do it in low-income years between retiring and Social Security.',
    where: 'Plan → Taxes & Roth.',
  },
  {
    id: 'bracket',
    term: 'Tax bracket',
    aliases: ['bracket', 'marginal rate', 'tier'],
    plain: 'Income tax is charged in layers: the first slice of income at a low rate, the next slice higher, and so on. Your bracket is the rate on your last dollar, not on all of it.',
    where: 'Tax & Estate → Brackets.',
  },
  {
    id: 'claiming-age',
    term: 'Social Security claiming age',
    aliases: ['claiming age', 'claim at 70', 'start Social Security'],
    plain: 'The age you start your Social Security checks, any time from 62 to 70. Starting earlier gives smaller checks for longer; waiting gives bigger checks, for life.',
    where: 'Plan → Income.',
  },
  {
    id: 'fra',
    term: 'Full retirement age (FRA)',
    aliases: ['FRA', 'full retirement age'],
    plain: 'The age Social Security pays your full benefit: 67 for anyone born in 1960 or later. Claiming before it shrinks the check; waiting past it, up to 70, grows it.',
  },
  {
    id: 'rmd',
    term: 'Required minimum distribution (RMD)',
    aliases: ['RMD', 'RMDs', 'required minimum distribution'],
    plain: 'From your early-to-mid 70s, the law makes you take at least a set share of your Pre-Tax accounts out each year, and pay income tax on it, whether you need the money or not. Roth accounts have no such rule while you are alive.',
  },
  {
    id: 'irmaa',
    term: 'Medicare surcharge (IRMAA)',
    aliases: ['IRMAA', 'Medicare surcharge'],
    plain: 'An extra charge on your Medicare premiums when your income two years earlier was above a set line. Large withdrawals or Roth conversions can trigger it.',
  },
  {
    id: 'aca',
    term: 'Marketplace health cover (ACA)',
    aliases: ['ACA', 'marketplace', 'premium credit', 'Affordable Care Act'],
    plain: 'Health insurance bought on the government marketplace before Medicare starts at 65. The price you pay depends on your income, so how much you withdraw can change it.',
    where: 'Plan → Spending, under Special Expenses.',
  },
  {
    id: 'employer-match',
    term: 'Employer match',
    aliases: ['match', '401(k) match'],
    plain: 'Money your employer adds to your 401(k) when you save, often a set share of what you put in, up to a share of your pay. If you do not save enough to get all of it, you leave it on the table.',
    where: 'Plan → Savings.',
  },
  {
    id: 'filing-status',
    term: 'Filing status (MFJ, Single)',
    aliases: ['MFJ', 'married filing jointly', 'Single', 'MFS', 'filing status'],
    plain: 'How you file your tax return. MFJ means married, filing together on one return, which most couples do. It sets the size of your brackets and standard deduction.',
    where: 'Plan → Household.',
  },
  {
    id: 'life-expectancy',
    term: 'Life expectancy (how long the plan runs)',
    aliases: ['life expectancy', 'plan horizon', 'end of the plan'],
    plain: 'The age the plan runs to. It is not a prediction: many people plan to 90 or 95 so the money is still there if they live a long time.',
    where: 'Plan → Household.',
  },
  {
    id: 'ending-balance',
    term: 'Ending balance',
    aliases: ['Ending Balance', 'what is left'],
    plain: 'What the plan has left in savings in its last year, with average returns. Above zero means the money lasted; it is also roughly what your heirs would receive before tax.',
  },
];

export const glossaryEntry = (id) => GLOSSARY.find((g) => g.id === id) || null;
