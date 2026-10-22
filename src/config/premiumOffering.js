// What Premium actually is, in one place.
//
// Three surfaces describe Premium to a free user: the Premium tab
// (PremiumTab.jsx), the upsell card on Plan Settings > Initial Balances
// (SettingsTab.jsx), and the Help guide (GuideTab.jsx). Before this file
// they each carried their own hand-written blurb, and they had already
// drifted -- Plan Settings said "in development ... Not available to
// purchase yet" while the tab it points at is fully built and shipping.
// Same reasoning as disclaimer.js: one source, several consumers.
//
// The hard rule for PREMIUM_FEATURES: every entry names something that
// works in the shipped build today. Nothing aspirational, nothing from
// DRIVE_SYNC_DESIGN.md, nothing "coming soon". A feature list is the one
// piece of copy a prospective user will check against reality the moment
// they get access, and the cost of being caught overselling is far higher
// than the benefit of a longer list.

// Premium is ONE thing that grows, not a set of products to choose between
// (see RETIREMENT_SPENDING_SPEC.md section 10.6). That decision has a naming
// consequence this file got wrong until 2026-09-06: PREMIUM_NAME was
// 'Detailed Holdings', which was the whole of Premium when holdings was the
// only paid area and named half of it the moment Retirement Spending
// shipped. A spending subscriber was being told "Detailed Holdings is
// unlocked".
//
// So: PREMIUM_NAME is the PRODUCT. Each entry in PREMIUM_AREAS has its own
// name, which is what a user navigates to. A heading or an "it is unlocked"
// line wants the product; a button that goes somewhere wants the area,
// because it has to say where it lands.
export const PREMIUM_NAME = 'Premium';

export const PREMIUM_TAGLINE =
  'Four things the free planner does not do: track the actual positions you own, work out what you really spend, show the working behind each Readiness answer, and plan a retirement abroad — then plan from all of it.';

// Contact address for access requests, and the single source of truth for it.
// Changed with the OutlastRetirement rename (2026-09-12). Everywhere in the
// app that shows it now reads THIS -- GuideTab and the welcome announcement
// used to hardcode their own copies, which is how three spellings of the old
// address ended up in the tree at once.
export const CONTACT_EMAIL = 'support@outlastretirement.com';

// General questions and feedback (Help -> Contact Us, the site footer).
// Premium access, keys and Live Pricing setup go to CONTACT_EMAIL above.
export const FEEDBACK_EMAIL = 'hello@outlastretirement.com';

// One entry per capability area. `tab` is where its CTA lands.
//
// The hard rule at the top of this file applies to every `points` line here:
// it must name something that works in the shipped build today. Every area
// below does -- holdings since 2026-08, Retirement Spending as of changelog
// 140. Nothing aspirational, nothing "coming soon".
export const PREMIUM_AREAS = [
  {
    id: 'holdings',
    name: 'Detailed Holdings',
    tab: 'portfolio',
    tagline:
      'Track the actual positions you own — ticker, shares, cost basis, lots — instead of one lump sum per account type.',
    // The part that is genuinely hard to explain in a feature bullet: these
    // four fields in the free planner stop being hand-entered and start
    // tracking the real holdings, automatically.
    linkedFields: [
      'Initial Account Balances',
      'Known Cost Basis (Taxable)',
      'Stock Allocation (Working)',
      'Concentrated Stock Position',
    ],
    features: [
      {
        id: 'holdings',
        title: 'Holdings',
        blurb:
          'Every position you hold, with the detail a real statement has: institution, account, tax treatment, share count, cost basis, and individual purchase lots.',
        points: [
          'Per-holding cost basis and purchase lots, not one blended number',
          'Portfolio composition by account, tax treatment, and asset type',
          'Import from a brokerage statement or a plain CSV, and export back out',
          'Reconcile with your statements: each account’s activity by month, quarter or year, to print and check',
        ],
      },
      {
        id: 'dividends',
        title: 'Distributions',
        blurb:
          'What your portfolio actually paid you — every kind of distribution, month by month — instead of a yield assumed against a balance.',
        points: [
          'Actual payments received, side by side with the forward estimate, never blended into one figure',
          'Every kind counted: dividends, capital gain distributions, interest, and return of capital kept out of income',
          'A rolling timeline — twelve months of real history, six months ahead — with the payments behind any month',
          'Per-holding DRIP controls, and reinvested payments counted as the income they are',
        ],
      },
      {
        id: 'retirement',
        title: 'Retirement Income & Glide Path',
        blurb:
          'How much of your retirement spending your portfolio income would cover — built, if you want, on what it really paid you rather than on an assumption.',
        points: [
          'Coverage year by year against your own plan projection, not a generic rule of thumb',
          'Choose the income basis: the forward dividend estimate, or the last twelve months you actually received',
          'Retirement Glide Path simulation with year-by-year milestones',
          'A Step 1 / 2 / 3 roadmap that names the holdings each step involves',
          'Non-portfolio income stack — pensions, annuities, rentals — alongside it',
        ],
      },
      {
        id: 'rebalance',
        title: 'Rebalance & Analytics',
        blurb:
          'Set a target weight on each holding and see the buys and sells that would bring it back.',
        points: [
          'Per-holding target allocation, with drift and the trades that would close it',
          'Concentration analysis on your largest positions',
          'Historical decisions audit — what you changed, and when',
        ],
      },
      {
        id: 'liquidations',
        title: 'Liquidations Audit Trail',
        blurb:
          'A durable record of what you sold, when, from which lots, and how it was classified.',
        points: [
          'Closed positions with realized gain and short- vs. long-term treatment',
          'Lot-level detail on each sale',
          'Notes on why, so next year you still know',
        ],
      },
    ],
  },
  {
    id: 'spending',
    name: 'Retirement Spending',
    tab: 'settings',
    tagline:
      'Work out what you actually spend, turn it into a retirement figure you can defend, and see whether your guaranteed income covers the part you cannot cut.',
    // Its equivalents of holdings' linked fields: two settings the category
    // ledger takes over while it is in use, because a ledger states the same
    // facts they do and leaving both live double-counts them.
    linkedFields: [
      'Housing Share of Spending',
      'Healthcare Bridge Cost',
    ],
    // Ordered by recurring value, not by build order (spec section 10.2): the
    // bridge is a wizard used once, the floor re-answers itself every time
    // the plan changes.
    features: [
      {
        id: 'floor',
        title: 'Income Floor',
        blurb:
          'Whether the income you are guaranteed covers the spending you cannot avoid.',
        points: [
          'Does Social Security, plus pensions and annuities, cover your essential spending',
          'The first year it does, and the widest gap before that',
          'Guardrails that trim discretionary spending toward the floor instead of cutting everything uniformly',
        ],
      },
      {
        id: 'bridge',
        title: 'Retirement Spending Bridge',
        blurb:
          'From what you spend today to a retirement number you can defend line by line.',
        points: [
          'A guided walk from your current spending to your Annual Lifestyle figure',
          'Takes out what stops at retirement, and what the plan already models on its own lines',
          'Names every excluded cost and where in the app it lives instead',
        ],
      },
      {
        id: 'import',
        title: 'Statement Import',
        blurb:
          'Your spending categories, filled in from the statements you already have.',
        points: [
          'Bank and card CSVs sorted into your categories, with every row shown before anything is written',
          'Transfers and card payments flagged, so a card is not counted twice',
          'Re-importing replaces what it added before and leaves your own entries alone',
        ],
      },
    ],
  },
  {
    id: 'readiness',
    name: 'Readiness in Full',
    tab: 'readiness',
    tagline:
      'Every Retirement Readiness question is answered free. Premium adds the working behind each answer: the comparisons, the year-by-year detail and the breaking points.',
    // The paywall on Readiness is the DETAIL, never the question or the
    // headline answer (ReadinessTab.jsx LockedDetail). These points are the
    // five LockedDetail cards, in the order the tab shows them; a test pins
    // the count so a new lock cannot ship unlisted.
    linkedFields: [],
    features: [
      {
        id: 'readinessDetail',
        title: 'Readiness Detail',
        blurb:
          'The free tab tells you whether the plan holds. This shows why, and by how much.',
        points: [
          'Walking away today: your budget against the most a standing-start retirement supports, the first year\u2019s tax, and whether guaranteed income covers what you cannot cut',
          'Working longer: ending balance, lifetime taxes and your first withdrawal for one, two, three or five more years, side by side',
          'The first five years: every source, which account it comes from, what to move, the tax to hold back each quarter and how long the reserve lasts',
          'A market fall at retirement: the exact drop your plan breaks at, and no crash vs. crash vs. crash with guardrails',
          'Big expenses: what each one does where it sits, in a normal market and a 20% fall, and what moving it two, three or five years would do',
        ],
      },
      {
        // Changelog 335. Lives on Risk & Stress; Readiness links to it from
        // the market-fall question. The survival count and the cost of a
        // guardrail the user has switched on stay free.
        id: 'historicalStarts',
        title: 'Every Retirement Since 1928',
        blurb:
          'The free tab says how many real retirements since 1928 your plan lasted in. This compares every way of spending through them.',
        points: [
          'Fixed spending, each guardrail, percent of portfolio and the 95% rule side by side over the same starts: how often each lasts, its deepest cut, and what it spends over a lifetime',
          'The most you could spend and still last in 95% or 90% of starts, beside the free figure for every start',
          'The same starts with 40% to 80% in stocks once retired: how often each lasts and what it typically leaves',
          'Every start year, one row each, with whether the money lasts and how deep any cut went, opened in Year by Year or saved as a spreadsheet',
        ],
      },
    ],
  },
  {
    id: 'relocation',
    name: 'Relocation & Residency',
    tab: 'settings',
    tagline:
      'Plan a move abroad in the year you mean to make it, and see what the second tax system costs on top of the US one you keep paying.',
    // Moving between US states is free (Life Events > Where you live);
    // this area is everything past the border. It takes over no plan field
    // -- it adds years abroad alongside the ones you already have.
    linkedFields: [],
    features: [
      {
        id: 'abroad',
        title: 'Years Abroad',
        blurb:
          'Our country summaries or your own figures, priced on top of the US tax a citizen owes wherever they live.',
        points: [
          'Local income tax as one effective rate or a full bracket table in local currency',
          'The US foreign tax credit, limited the way the law limits it, with unused credit carried forward',
          'Your choice of how the country treats your Roth: respected, taxed like a brokerage account, or taxed at a rate you set',
          'Health coverage abroad, Medicare Part B kept or dropped, and the lifetime penalty if you drop it and come back',
          'The state you leave keeps taxing you until you say you have cut ties',
          'Foreign inheritance tax on each heir’s share, by their relationship to you',
          'Country summaries for eighteen countries — Mexico, Portugal, Panama, Costa Rica, Colombia, Italy, Spain, France, Germany, Ireland, Greece, the United Kingdom, Thailand, Malaysia, the Philippines, Australia, Belize and Uruguay — that fill in the rules for you, dated and sourced. They are our own research and have not been reviewed by a cross-border tax professional',
          'A move in any month, and what living there costs compared with now',
          'Special tax regimes for new residents, such as Italy’s 7%, and the year they end',
          'Staying vs moving: what your heirs receive with and without the move, and where the difference comes from',
        ],
      },
    ],
  },
];

// Flat view of every feature group, each tagged with the area it belongs to.
// PremiumTab renders this as one grid and PremiumTab.test.jsx iterates it
// generically, so a group added to any area above is rendered and covered
// without either file changing.
export const PREMIUM_FEATURES = PREMIUM_AREAS.flatMap((area) =>
  area.features.map((f) => ({ ...f, area: area.id, areaName: area.name })),
);

// Stated plainly on the page. These are the questions someone evaluating
// this will actually have, and answering them badly (or not at all) is
// what makes a pricing page feel evasive.
export const PREMIUM_FACTS = [
  {
    q: 'How do I get it?',
    a: 'Premium is invite-only while we are in beta, and you are invited. There is no checkout, no subscription, and nothing to cancel — email us and we send an access key to paste in.',
  },
  {
    q: 'What does it cost?',
    a: 'Nothing today. There is no payment flow built, and no price set. If that ever changes it will be said plainly here first. An access key lasts 30 days and is renewed by email; a key normally runs its full 30 days, though the Terms of Use keep the right to end access.',
  },
  {
    q: 'Do I have to pick one, or choose between them?',
    a: 'Neither. Premium is one thing, and everything in it comes together — there is no cheaper tier that leaves half of it out, and nothing to upgrade to later. When something new is added, it is added to what you already have.',
  },
  {
    q: 'Does my data leave my browser?',
    a: 'No. The whole app computes locally and stores your plan in your own browser. There is no account and no server holding your figures. The access key is verified in your browser too — activating it sends nothing anywhere.',
  },
  {
    q: 'What about live prices?',
    a: 'Optional, and it runs through a free Google Sheet that you own. The only thing that ever leaves is a bare ticker symbol like "AAPL" — never share counts, account names, or dollar amounts. The Sheet\u2019s script then looks the symbol up with Google Finance and Yahoo Finance from Google\u2019s servers; those services see the symbol, not you. You can skip it and type prices in by hand.',
  },
  {
    q: 'Is it tied to one computer?',
    a: 'The key is stored per browser, so a second computer needs the key pasted in there too. Backup Everything / Restore Backup in Preferences \u2192 Your Data carries it across along with your plan.',
  },
];

// Pre-filled request. Kept short on purpose: a long template reads as a
// form to fill out, and the useful signal is just "who, and roughly what
// are you tracking".
export const REQUEST_SUBJECT = 'OutlastRetirement Premium access request';

export const REQUEST_BODY = [
  'Hi — I would like access to Premium.',
  '',
  'A bit about my situation (what I am tracking, or what I am trying to work out):',
  '',
  '',
  'Thanks!',
].join('\n');

export function buildRequestMailto(email = CONTACT_EMAIL) {
  return `mailto:${email}?subject=${encodeURIComponent(REQUEST_SUBJECT)}&body=${encodeURIComponent(REQUEST_BODY)}`;
}
