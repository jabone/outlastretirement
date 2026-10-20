// The demo household: Sam & Riley Carter.
//
// One ENTIRELY FICTIONAL family, engineered so that every feature in the
// app has something real-looking to show: RSUs with sell-to-cover routing
// into a concentrated employer-stock position, a government pension AND a
// private one (New York taxes them differently -- that contrast is the
// point), an HSA, NQDC, and New York residency, chosen because NY
// exercises the deepest state-tax modeling in the app (benefit
// recapture, scheduled 2027/2033 rate eras, the NYC/Yonkers toggles).
// Detailed Holdings with multi-lot cost basis, dividend history, a
// realized liquidation, and a manual-pricing private fund. Saved
// scenarios for the Scenarios tab. Estate checklist ticks with dates.
// Heirs including a generation-skipping grandchild and a charitable
// bequest.
//
// EVERY NUMBER AND NAME IN THIS FILE IS INVENTED. Per the 2026-08-16
// data-leak remediation (see the repo's privacy history): no real
// person's balances, tickers-held, employers, or family members may ever
// be used as demo data, and nothing here may be derived from a real
// plan. The employer "Nimbus Analytics" and its ticker "NIMB" are
// fictional; the real tickers used in holdings (AAPL, SPY, SCHD, VTI,
// BND, FXAIX) carry invented share counts and lots.
//
// The demo doubles as the recording fixture for the video walkthrough
// series, which lives in the cashflowengine-business repo
// (marketing_and_outreach/VIDEO_SERIES/ -- moved there 2026-08-23 so
// marketing collaborators never need source access): every script's
// click path assumes exactly this data, so treat changes here as
// script-breaking -- regenerate outlastretirement_demo.json (repo root,
// `npx vite-node scripts/generateDemoBackup.mjs`), refresh the copy in
// that repo's VIDEO_SERIES folder, and re-check the scripts' CALLOUT
// numbers in the same sitting.
//
// This module only DESCRIBES the data. Loading/exiting it safely --
// snapshotting the user's real plan first -- lives in utils/demoMode.js.
import { DEFAULT_INPUTS, INPUTS_SCHEMA_VERSION, TAX_YEAR } from '../calculator';
import { FULL_BACKUP_VERSION } from '../utils/fullBackup';

// ---------------------------------------------------------------------------
// Plan inputs. Spread over DEFAULT_INPUTS so the payload always carries a
// complete, current-schema set -- a new input added later simply keeps its
// default for the Carters until a human decides the demo should exercise it.
// ---------------------------------------------------------------------------
export function buildDemoInputs() {
  return {
    ...DEFAULT_INPUTS,
    // A fictional 2026 household whose story (and the Learn lessons'
    // pictures) is fixed: the plan's own COLA assumption every year, not
    // SSA's announced figures (changelog 410).
    ssColaAnnounced: false,
    // Likewise pinned: the brokerage yield stays 100% qualified, as the
    // demo's story was written (changelog 414 made the split-following
    // share the default for new plans).
    taxableQualifiedDividendFollowsAllocation: false,
    // And ACA Cliff Protection stays as it was when the story was written
    // (changelog 443 turned it on for new plans).
    acaCliffProtectionEnabled: false,
    // And no investment fees, as the story was written (changelog 447
    // charges 0.10% fund expenses by default). Re-tune before the lessons'
    // pictures are next re-recorded.
    fundExpenseRatioPct: 0,
    advisorFeePct: 0,
    // And the pre-65 health cost stays as typed, with no computed credit
    // (changelog 415 computes one for new plans).
    acaCreditSource: 'manual',
    // And the standard deduction every year (changelog 417 itemizes when
    // it helps).
    itemizeDeductions: 'never',
    planYear: TAX_YEAR,

    // -- Who they are ------------------------------------------------------
    spouse1Name: 'Sam',
    spouse2Name: 'Riley',
    spouse2Enabled: true,
    filingStatus: 'MFJ',
    birthYear1: TAX_YEAR - 55,   // Sam, 55 -- principal engineer, Nimbus Analytics (fictional)
    birthYear2: TAX_YEAR - 58,   // Riley, 58 -- just-retired public school teacher
    retireAge1: 60,
    retireAge2: 58,
    lifeExpectancy1: 92,
    lifeExpectancy2: 94,

    // -- Income ------------------------------------------------------------
    salary1: 245000,
    salary2: 0,
    ss1: 42000,                  // at FRA; claimed at 67
    ss2: 24000,
    claimingAge1: 67,
    claimingAge2: 67,
    // Riley: New York State teacher's pension -- government, so NY exempts
    // it IN FULL (no cap, no age test). Starts at 60 with a modest COLA.
    pension2: 52000,
    pensionStartAge2: 60,
    governmentPension2: true,
    pension2COLA: 1.5,
    pension2SurvivorBenefit: 50,
    // Sam: a small frozen private pension from a 1990s employer -- NY only
    // excludes $20,000 of this from 59 1/2, so the two pensions together
    // demonstrate exactly why the government/private distinction matters.
    pension1: 15000,
    pensionStartAge1: 65,
    governmentPension1: false,
    pension1COLA: 0,

    // -- Equity comp -------------------------------------------------------
    rsuGrants: [
      { id: 1, spouse: 1, label: '2025 retention grant', grantYear: TAX_YEAR - 1, totalValue: 220000, vestingYears: 4, schedule: 'equal' },
      { id: 2, spouse: 1, label: '2026 refresh', grantYear: TAX_YEAR, totalValue: 90000, vestingYears: 4, schedule: 'equal' },
    ],
    rsuRefreshEnabled1: true,
    rsuRefreshAnnualValue1: 80000,
    rsuRefreshVestingYears1: 4,
    // Concentrated employer stock, fed by vest routing: Nimbus sells 35%
    // of each vest to cover taxes, Sam holds 60% of the rest.
    concentratedStockEnabled: true,
    concentratedStockLabel: 'NIMB (employer)',
    concentratedStockInit: 175000,
    concentratedStockCostBasisPct: 40,
    concentratedStockGrowthRate: 8,
    concentratedStockDiversifyPct: 10,
    concentratedStockDiversifyTaxRate: 20,
    concentratedStockConcentrationTargetPct: 10,
    concentratedStockVestRoutingEnabled: true,
    concentratedStockVestCoverPct: 35,
    concentratedStockVestHoldPct: 60,
    concentratedStockVestSpouse: 1,

    // -- Balances ----------------------------------------------------------
    preTaxInit: 890000,
    rothInit: 215000,
    taxableInit: 342000,
    hsaInit: 48500,
    hsaContribution: 8750,
    hsaFamilyCoverage: true,
    nqdcEnabled1: true,
    nqdcInit1: 60000,
    nqdcDeferralAmount1: 15000,
    nqdcDistributionStartAge1: 61,
    nqdcDistributionYears1: 5,
    cashFloorEnabled: true,
    cashFloorInit: 30000,
    cashFloorTargetMonths: 18,
    cashFloorPreFundEnabled: true,

    // -- Contributions -----------------------------------------------------
    preTaxContribution1: 24000,
    rothContribution1: 8000,
    taxableContribution: 12000,
    backdoorRothEnabled: true,
    backdoorRothAnnualAmount: 7000,

    // -- Spending ----------------------------------------------------------
    lifestyleExpense: 96000,

    // -- Taxes -------------------------------------------------------------
    // BOTH state fields, deliberately: stateOfResidence drives the
    // Demographics dropdown, ACA expansion status, and the estate/
    // inheritance tax table; stateTaxState drives income tax. New York's
    // estate tax matters for episode 4. The exclusion is indexed to the
    // plan's final year and lands near $18.3M; the Carters' own estate --
    // portfolio plus the home and other property added in changelog 144 --
    // reaches roughly $13.3M, still clear of it. Episode 4 gets its
    // estate-tax material from the two inheritance scenarios in
    // DEMO_SCENARIO_DEFS, which walk the estate across that line; see the
    // comment there. The UI soft-links them on edit,
    // but data written directly must set both or the demo shows a Texan
    // paying New York income tax (caught by the owner from a screenshot,
    // 2026-08-23).
    stateOfResidence: 'NY',
    stateTaxState: 'ny',
    nycResident: false,          // toggled live in video 2 to show the delta
    yonkersResident: false,
    rothConversionStrategy: 'maxBracket',
    rothConversionBracket: 0.22,
    rothConversionDelayUntilRetire: true,

    // -- Life events -------------------------------------------------------
    milestones: [
      { id: 1, name: 'Kitchen remodel', type: 'outflow', amount: 45000, startAge: 57, endAge: 57, targetAccount: 'taxable' },
      { id: 2, name: "Daughter's wedding", type: 'outflow', amount: 30000, startAge: 60, endAge: 60, targetAccount: 'taxable' },
      { id: 3, name: 'Inheritance (Riley’s mother)', type: 'inflow', amount: 150000, startAge: 63, endAge: 63, targetAccount: 'taxable' },
    ],

    // -- Home & other property (changelog 144) -----------------------------
    // The Carters own their home outright and hold some non-portfolio
    // property (a share of a family lake cabin and collectibles). Neither
    // is ever spent by the plan, but both are in the gross estate: a
    // $900k home appreciating to roughly $1.9M by the plan's final year,
    // plus $250k of other assets. This is what walks the estate up toward
    // New York's line and gives the two cliff scenarios below their base.
    homeOwned: true,
    homeValueInit: 900000,
    homeAppreciationRate: 2.0,
    otherEstateAssetsInit: 250000,
    otherEstateAssetsGrowthRate: 1.0,

    // -- Estate ------------------------------------------------------------
    heirSplitMode: 'custom', // 60 / 30 / 10 below is the point of the demo
    heirs: [
      { id: 1, name: 'Maya', filingStatus: 'MFJ', income: 120000, splitPct: 60, isSkipPerson: false, relationship: 'child' },
      { id: 2, name: 'Ben', filingStatus: 'Single', income: 85000, splitPct: 30, isSkipPerson: false, relationship: 'child' },
      { id: 3, name: 'Leo (grandson)', filingStatus: 'Single', income: 0, splitPct: 10, isSkipPerson: true, relationship: 'grandchild' },
    ],
    charitableBequestEnabled: true,
    charitableBequestMode: 'percent',
    charitableBequestPct: 5,
    charitableBequestSource: 'preTax',
  };
}

// ---------------------------------------------------------------------------
// Detailed Holdings (Premium). Shapes must match createHolding's fields --
// intentionally written out in full rather than via createHolding so the
// payload is deterministic (no Date-based ids) and diff-able in git.
// ---------------------------------------------------------------------------
export function buildDemoHoldings() {
  return [
    {
      id: 'demo-aapl', taxTreatment: 'taxable', account: 'Brokerage', institution: 'Fidelity (demo)',
      symbol: 'AAPL', name: 'Apple Inc.', securityType: 'stock', assetClass: null,
      shares: 180, avgBuyPrice: 148.2, currentPrice: 232.5, dayChangeDollar: null, dayChangePct: null,
      manualPricing: false, annualDividendPerShare: 1.0, dividendFrequency: 'quarterly',
      researchUrl: '', distributionCharacter: 'qualified', purchaseDate: null,
      lots: [
        { id: 'demo-aapl-l1', date: '2019-03-14', shares: 80, pricePerShare: 98.5 },
        { id: 'demo-aapl-l2', date: '2021-08-02', shares: 60, pricePerShare: 172.4 },
        { id: 'demo-aapl-l3', date: '2024-01-19', shares: 40, pricePerShare: 211.1 },
      ],
      targetAllocationPct: 10, dripEnabled: true, distributionEvents: [], priceSnapshots: [],
    },
    {
      id: 'demo-spy', taxTreatment: 'taxable', account: 'Brokerage', institution: 'Fidelity (demo)',
      symbol: 'SPY', name: 'SPDR S&P 500 ETF', securityType: 'etf', assetClass: 'stock',
      shares: 210, avgBuyPrice: 415.3, currentPrice: 587.2, dayChangeDollar: null, dayChangePct: null,
      manualPricing: false, annualDividendPerShare: 6.7, dividendFrequency: 'quarterly',
      researchUrl: '', distributionCharacter: 'qualified', purchaseDate: null,
      lots: [], targetAllocationPct: 30, dripEnabled: true, distributionEvents: [], priceSnapshots: [],
    },
    {
      id: 'demo-schd', taxTreatment: 'taxable', account: 'Brokerage', institution: 'Fidelity (demo)',
      symbol: 'SCHD', name: 'Schwab US Dividend Equity ETF', securityType: 'etf', assetClass: 'stock',
      shares: 640, avgBuyPrice: 71.4, currentPrice: 84.9, dayChangeDollar: null, dayChangePct: null,
      manualPricing: false, annualDividendPerShare: 2.8, dividendFrequency: 'quarterly',
      researchUrl: '', distributionCharacter: 'qualified', purchaseDate: null,
      lots: [],
      targetAllocationPct: 15, dripEnabled: true,
      distributionEvents: [
        { id: 'demo-schd-d1', date: '2026-03-25', type: 'dividend', ratePerShare: 0.65, grossAmount: 403.00, destination: 'reinvested', sharesAdded: 4.85, navPrice: 83.1, notes: 'Q1 distribution (demo)' },
        { id: 'demo-schd-d2', date: '2026-06-25', type: 'dividend', ratePerShare: 0.71, grossAmount: 448.72, destination: 'reinvested', sharesAdded: 5.31, navPrice: 84.5, notes: 'Q2 distribution (demo)' },
      ],
      priceSnapshots: [],
    },
    {
      id: 'demo-vti', taxTreatment: 'roth', account: 'Roth IRA', institution: 'Vanguard (demo)',
      symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', securityType: 'etf', assetClass: 'stock',
      shares: 520, avgBuyPrice: 205.7, currentPrice: 293.4, dayChangeDollar: null, dayChangePct: null,
      manualPricing: false, annualDividendPerShare: 3.5, dividendFrequency: 'quarterly',
      researchUrl: '', distributionCharacter: 'qualified', purchaseDate: null,
      lots: [], targetAllocationPct: 20, dripEnabled: true, distributionEvents: [], priceSnapshots: [],
    },
    {
      id: 'demo-fxaix', taxTreatment: 'preTax', account: '401(k)', institution: 'Nimbus 401(k) (demo)',
      symbol: 'FXAIX', name: 'Fidelity 500 Index Fund', securityType: 'mutualFund', assetClass: 'stock',
      shares: 3120, avgBuyPrice: 142.6, currentPrice: 208.3, dayChangeDollar: null, dayChangePct: null,
      manualPricing: false, annualDividendPerShare: 2.9, dividendFrequency: 'quarterly',
      researchUrl: '', distributionCharacter: 'ordinary', purchaseDate: null,
      lots: [], targetAllocationPct: 15, dripEnabled: true, distributionEvents: [], priceSnapshots: [],
    },
    {
      id: 'demo-bnd', taxTreatment: 'preTax', account: '401(k)', institution: 'Nimbus 401(k) (demo)',
      symbol: 'BND', name: 'Vanguard Total Bond Market ETF', securityType: 'etf', assetClass: 'bond',
      shares: 1450, avgBuyPrice: 76.8, currentPrice: 73.6, dayChangeDollar: null, dayChangePct: null,
      manualPricing: false, annualDividendPerShare: 2.6, dividendFrequency: 'monthly',
      researchUrl: '', distributionCharacter: 'ordinary', purchaseDate: null,
      lots: [], targetAllocationPct: 8, dripEnabled: true, distributionEvents: [], priceSnapshots: [],
    },
    {
      id: 'demo-nimb', taxTreatment: 'taxable', account: 'Equity awards', institution: 'Nimbus Analytics (demo)',
      symbol: 'NIMB', name: 'Nimbus Analytics (employer, fictional)', securityType: 'stock', assetClass: 'stock',
      shares: 2100, avgBuyPrice: 33.3, currentPrice: 83.3, dayChangeDollar: null, dayChangePct: null,
      // Fictional ticker -- can never resolve via any live source, which is
      // exactly what the manualPricing flag exists for. Doubles as the demo
      // of that feature.
      manualPricing: true, annualDividendPerShare: 0, dividendFrequency: 'unspecified',
      researchUrl: '', distributionCharacter: 'unspecified', purchaseDate: null,
      lots: [], targetAllocationPct: null, dripEnabled: false, distributionEvents: [], priceSnapshots: [],
    },
    {
      id: 'demo-mmf', taxTreatment: 'taxable', account: 'Cash reserve', institution: 'Fidelity (demo)',
      symbol: 'SPAXX', name: 'Government Money Market', securityType: 'mutualFund', assetClass: 'cash',
      shares: 30000, avgBuyPrice: 1, currentPrice: 1, dayChangeDollar: null, dayChangePct: null,
      manualPricing: true, annualDividendPerShare: 0.04, dividendFrequency: 'monthly',
      researchUrl: '', distributionCharacter: 'ordinary', purchaseDate: null,
      lots: [], targetAllocationPct: 2, dripEnabled: true, distributionEvents: [], priceSnapshots: [],
    },
  ];
}

// One realized sale, so the Liquidations audit trail has history to show.
export function buildDemoLiquidations() {
  return [
    {
      id: 'demo-liq-1',
      holdingId: 'demo-nimb',
      symbol: 'NIMB',
      account: 'Equity awards',
      taxTreatment: 'taxable',
      saleDate: '2026-02-11',
      purchaseDate: '2022-05-16',
      notes: 'Diversification sale after the February vest (demo)',
      sharesSold: 400,
      salePricePerShare: 78.4,
      proceeds: 31360,
      costBasis: 13320,
      realizedGainDollars: 18040,
      realizedGainPct: 135.44,
      termClassification: 'long',
      lotsSold: [],
      isFullLiquidation: false,
    },
  ];
}

// A few estate-checklist ticks with believable dates, so that tab isn't a
// wall of empty checkboxes on camera.
export function buildDemoEstateChecklist() {
  return {
    'ben-primary': { done: true, completedAt: '2026-01-12' },
    'ben-contingent': { done: true, completedAt: '2026-01-12' },
    'doc-will': { done: true, completedAt: '2024-06-03' },
  };
}

// ---------------------------------------------------------------------------
// The full Backup-Everything-shaped payload. Deliberately carries NO
// premiumJwt (a demo must never mint an entitlement), NO pricingSource
// (never clobber the user's own Sheet connection -- applyFullBackupToStorage
// skips an absent one), NO interviewProgress, and NO dataFreshness (the
// user's own reminder clocks are none of the demo's business; demoMode.js
// snapshots and restores them anyway).
//
// savedScenarios are built WITHOUT metrics here; demoMode.js fills metrics
// in at load time by running the real projection, so the Scenarios tab
// shows accurate numbers without this file hardcoding results that would
// silently go stale every time the engine improves.
// ---------------------------------------------------------------------------
// Replaces the amount of milestone 3, the inheritance from Riley's mother.
// The two estate scenarios below differ ONLY in this number, which is what
// makes the pair a clean demonstration of a cliff.
const withInheritance = (inputs, amount) => ({
  ...inputs,
  milestones: inputs.milestones.map((m) => (m.id === 3 ? { ...m, amount } : m)),
});

export const DEMO_SCENARIO_DEFS = [
  {
    name: 'Demo: Sam retires at 58 instead',
    mutate: (inputs) => ({ ...inputs, retireAge1: 58 }),
  },
  {
    // Also the estate episode's "10-Year Rule" scenario: without the
    // conversions the Carters die with a large Pre-Tax balance, so their
    // heirs inherit a real income-tax bill (roughly $0.9M) instead of the
    // base plan's zero. The base plan converts the whole Pre-Tax bucket
    // away by Sam's late sixties, which is a fine outcome to show but
    // leaves the Estate Legacy Planner with nothing to demonstrate.
    name: 'Demo: No Roth conversions',
    mutate: (inputs) => ({ ...inputs, rothConversionStrategy: 'none' }),
  },
  {
    name: 'Demo: Move to a no-tax state at 60',
    mutate: (inputs) => ({ ...inputs, stateTaxState: 'none' }),
  },
  // --- New York's estate tax cliff (changelog 128) ----------------------
  //
  // These two exist to give the estate episode something the base plan can
  // no longer show. New York's exclusion is a CREDIT that phases out
  // between 100% and 105% of the basic exclusion amount and disappears
  // above it (Tax Law s 952(c), modeled since changelog 127), and the
  // exclusion is indexed forward to the plan's final year (changelog 127,
  // audit Q-13) -- which carries it to roughly $18.3M and leaves the
  // Carters' own ~$13.3M estate (portfolio plus home and other property)
  // clear of it, until a large inheritance walks them across the line.
  //
  // A larger inheritance from Riley's mother is the least contrived way to
  // walk them up to the line, because the plan already has that event.
  // Re-tuned in changelog 144: once the home and other property joined the
  // gross estate, the old $2.0M/$2.2M pair both sat well OVER the line, so
  // the "just under" scenario was no longer under anything. These two
  // straddle the cliff with the current engine and asset set:
  //
  //   $1.30M inherited -> gross $18.13M, NY tax $0,        heirs net $18.13M
  //   $1.45M inherited -> gross $18.77M, NY tax ~$1.23M,   heirs net $17.54M
  //
  // So $150,000 MORE inherited leaves the children roughly $594,000 LESS --
  // the whole point of a cliff, and very hard to believe until you watch it
  // happen. (Figures are illustrative; demoMode.js recomputes the real
  // metrics at load time, so they track the engine rather than this
  // comment.)
  {
    name: 'Demo: A $1.3M inheritance (just under NY’s estate line)',
    mutate: (inputs) => withInheritance(inputs, 1300000),
  },
  {
    name: 'Demo: A $1.45M inheritance (just over NY’s cliff)',
    mutate: (inputs) => withInheritance(inputs, 1450000),
  },
  // --- The Social Security earnings test (changelog 178) ----------------
  //
  // A PAIR, for the same reason the two inheritance scenarios above are a
  // pair: the effect only shows up as the difference between two runs that
  // differ by exactly one lever.
  //
  // The test withholds $1 of benefit for every $2 earned over an exempt
  // amount ($24,480 in 2026, indexed) for anyone claiming before FRA, and
  // recredits the withheld months at FRA. Showing it needs BOTH an early
  // claim and real wages, and the Carters' base plan has neither -- Sam
  // claims at 67 and stops working at 60. (The $37k-$47k of `salary` the
  // base plan does show at 61-65 is NQDC distribution, which is not wages
  // for this test. See the ficaWages1 comment in calculator.js.)
  //
  // So a single "claims at 62 and consults" scenario would move two levers
  // at once, and the consulting income swamps the test: that run ends
  // $980,770 AHEAD of the base plan, which reads as "claiming early wins"
  // when the truth is "working in retirement wins, and claiming early cost
  // you some of it". The pair separates them:
  //
  //   consults to 67, claims at 67  -> ending $12.28M  (+$1.28M vs base)
  //   consults to 67, claims at 62  -> ending $11.98M  (+$0.98M vs base)
  //
  // Those are NOMINAL, straight off the engine. The app shows today's
  // dollars by default, where the same pair reads $4.93M and $4.80M against
  // a $4.41M base -- see changelog 187, which fixed the Scenarios tab for
  // showing the nominal figures in a view that was otherwise converted.
  //
  // The ~$302k between them is the early claim plus the test ($121k
  // converted): $110,967
  // withheld across ages 62-66, and $198,490 less Social Security over the
  // plan even after the FRA recredit. The Year Ledger shows the withholding
  // on its own line in the second scenario and nothing in the first, which
  // is the cleanest view of the feature the demo can offer.
  //
  // (Figures illustrative; demoMode.js recomputes real metrics at load.)
  {
    name: 'Demo: Sam consults to 67',
    mutate: (inputs) => ({
      ...inputs,
      partTimeIncome1: 60000,
      partTimeIncomeEndAge1: 67,
    }),
  },
  {
    name: 'Demo: Sam consults to 67, but claims at 62',
    mutate: (inputs) => ({
      ...inputs,
      partTimeIncome1: 60000,
      partTimeIncomeEndAge1: 67,
      claimingAge1: 62,
    }),
  },
  // --- Plans that fail, and the one change that rescues each ------------
  //
  // Outside review, 2026-09-28: every demo scenario succeeded, so the demo
  // never showed the app's most important skill -- telling you a plan does
  // not work and what fixes it. Two PAIRS, each differing by one lever from
  // its failing half, and each failing a different way, so the pair also
  // teaches the verdict (utils/planVerdict.js):
  //
  //   $180k a year                  -> Runs short (even average returns;
  //                                    ~2060), ~40% of markets last
  //   $180k, Sam works to 64        -> lasts on average, ~87%: Mostly on track
  //
  //   $170k a year                  -> lasts on average but ~57% of
  //                                    markets: At risk
  //   $170k, spending guardrails    -> ~98%: On track. The average-returns
  //                                    path is unchanged (guardrails only act
  //                                    after a down year); the market risk
  //                                    is what moves.
  //
  // Figures from the engine on 2026-09-30 (seeded 1,000-trial run, as stored
  // in outlastretirement_demo.json); demoMode.js recomputes at load
  // and demoRescuePairs.test.js pins the verdict of each.
  {
    name: 'Demo: Spends $180,000 a year (runs short)',
    mutate: (inputs) => ({ ...inputs, lifestyleExpense: 180000 }),
  },
  {
    name: 'Demo: $180,000 a year, and Sam works to 64',
    mutate: (inputs) => ({ ...inputs, lifestyleExpense: 180000, retireAge1: 64 }),
  },
  {
    name: 'Demo: Spends $170,000 a year (at risk in weak markets)',
    mutate: (inputs) => ({ ...inputs, lifestyleExpense: 170000 }),
  },
  {
    name: 'Demo: $170,000 a year, with spending guardrails (they act only after down years)',
    mutate: (inputs) => ({ ...inputs, lifestyleExpense: 170000, spendingGuardrails: true }),
  },
];

export function buildDemoBackupPayload() {
  return {
    version: FULL_BACKUP_VERSION,
    schemaVersion: INPUTS_SCHEMA_VERSION,
    timestamp: null, // stamped by demoMode.js at load time
    isDemoPlan: true,
    activeInputs: buildDemoInputs(),
    savedScenarios: [], // filled by demoMode.js (see comment above)
    portfolioHoldings: buildDemoHoldings(),
    liquidations: buildDemoLiquidations(),
    estateChecklist: buildDemoEstateChecklist(),
  };
}
