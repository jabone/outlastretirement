// Which Plan Settings options the Full Interview never asks about, and
// where to find them.
//
// WHY THIS IS DATA AND NOT PROSE
// -----------------------------------------------------------------------
// The Interview and Plan Settings write the same `inputs` object, but the
// Interview deliberately asks a subset -- it's a guided first pass, not an
// exhaustive form. That's a reasonable design, with one bad consequence:
// someone can complete the entire Interview, see "Review", and never learn
// that this app models a Survivor Stress Test, NUA employer-stock
// distributions, a pension lump-sum election, or category-specific
// inflation rates at all.
//
// The repo already had a hand-written answer to this
// (INTERVIEW_SETTINGS_PARITY.md, 2026-08-11) and it went stale within
// weeks -- it predates several shipped features, and it claims gaps that
// have since been closed. Prose describing code drifts from code. So this
// file is the machine-checkable version: `inputCoverage.test.js` re-derives
// the real gap from InterviewTab.jsx / SettingsTab.jsx / DEFAULT_INPUTS on
// every test run and fails if this file disagrees. Add a field to the
// Interview and forget to update this, and the test tells you.
//
// Consumed by InterviewTab (per-section "what this didn't ask" pointers,
// plus the consolidated list on Review) and by InputReference (the
// "Where do I find this?" table).

// Plan Settings' sub-tab ids -> their visible labels. Mirrors the eight
// life domains SettingsTab.jsx renders (IA Phase 3).
export const SETTINGS_DOMAINS = {
  household: 'Household',
  income: 'Income',
  savings: 'Savings',
  balances: 'Balances & Debt',
  spending: 'Spending',
  taxes: 'Taxes & Roth',
  assumptions: 'Assumptions & Risk',
  // Added 2026-08-20 with lifetime gifting, the first entry in this map to
  // live on the Life Events section. The key matches the settingsSubTab id
  // ('milestones') so the Interview's jump-to-section button lands there.
  milestones: 'Life Events',
};

// Internal link-state, not user-facing options. These are set by clicking
// a Link/Unlink control in Detailed Holdings or Plan Settings, never typed
// in, so "the Interview doesn't ask about them" is correct and irrelevant.
// Listed explicitly so the test can account for every key in the gap
// rather than silently ignoring a real omission.
export const LINK_STATE_KEYS = [
  // Not a link key, but the same idea: plumbing rather than a planning
  // option. Its own DEFAULT_INPUTS comment says it is "purely a data-entry
  // convenience ... nothing downstream needs to know or care which mode a
  // given plan was entered in" -- calculator.js only ever reads the annual
  // lifestyleExpense total.
  //
  // The Interview DOES offer it (MonthlySpendingField's monthly toggle), but
  // it builds the key as `${k}InputMode` from a variable, so the extractor
  // above cannot see a literal to match. Listing it here rather than as a
  // known gap keeps the file honest: claiming the Interview never asks it
  // would be false.
  'lifestyleExpenseInputMode',
  'initialBalancesSource',
  'taxableBasisSource',
  'taxableDividendYieldSource',
  'stockAllocationSource',
  'cashFloorSource',
  'concentratedStockSource',
  'concentratedStockHoldingId',
  'concentratedStock2Source',
  'concentratedStock2HoldingId',
];

// Every genuinely user-facing option Plan Settings offers and the Full
// Interview does not ask about.
//
// 2026-09-02: eight groups left this list when the Interview started
// asking them (employer match formula, Auto-Max / Contribute the Max,
// current pre-retirement spending, taxable cost basis, cash-reserve
// pre-funding, government pension, pension lump sum, and the state-tax
// detail behind the jurisdiction). Everything still here was weighed and
// left out on purpose -- stress tests and advanced assumptions, not a
// first pass.
//
//   domain            which Plan Settings sub-tab it lives on
//   interviewSection  the Interview section it's most related to, so the
//                     pointer appears at the moment the user is already
//                     thinking about that topic (null = show on Review only)
//   keys              the DEFAULT_INPUTS keys, with a trailing spouse index
//                     (1/2) stripped -- SettingsTab writes several of these
//                     as template literals like `nqdcEnabled${n}`
export const NOT_ASKED_IN_INTERVIEW = [
  {
    id: 'mfsIncomeSplit',
    title: 'How a separate-filing couple splits its income between the two returns',
    blurb: 'Married filing separately means two returns. This is the share of the household\u2019s taxable income that lands on the first of them \u2014 50% for a couple with similar incomes, 100% for a genuine one-earner household.',
    domain: 'household',
    interviewSection: 'household',
    keys: ['mfsIncomeSplitPct'],
  },
  {
    id: 'spendingBlueprint',
    title: 'Breaking your retirement spending down by category',
    blurb: 'Instead of one Annual Lifestyle Spending figure you can enter seven categories \u2014 housing, food, transport, health, insurance, personal, other \u2014 plus a separate line for health coverage before 65, and tick which of them you could not cut. The categories add up to the same annual figure, so nothing downstream changes. Free, and it lives on Plan Settings \u2192 Spending: it is an alternative way to enter a number the Interview already asks for, not an extra question, so adding it to the Interview would lengthen the walkthrough without asking anything new.',
    domain: 'spending',
    interviewSection: 'spending',
    keys: ['spendingBlueprint'],
  },
  {
    id: 'floorAwareGuardrails',
    title: 'Whether a post-crash spending cut can reach your essentials',
    blurb: 'The spending guardrail normally takes a flat 10% off the whole budget after a crash at the start of retirement, which assumes the mortgage and the groceries are as cuttable as the holidays. Turn this on and the cut comes only out of discretionary spending and stops at the essentials you ticked in the category ledger \u2014 a deeper cut than 10% if you have plenty of discretionary, a shallower one if you have not. Part of Premium, and it needs the category ledger and the spending guardrail; it lives on Plan Settings \u2192 Spending.',
    domain: 'spending',
    interviewSection: 'spending',
    keys: ['floorAwareGuardrailsEnabled', 'discretionaryCutPct'],
  },
  {
    id: 'spendingBridge',
    title: 'The bridge from what you spend now to your retirement target',
    blurb: 'Your Annual Lifestyle Spending is not everything you will spend in retirement \u2014 it is everything the plan does not already add on its own line. The bridge starts from what you have left to spend today and walks it down: out come your debt payments and the health costs the plan models separately, out come the costs that stop when work does, and in goes whatever rises in retirement. Part of Premium, and it lives on Plan Settings \u2192 Spending rather than here, because the Interview is the free walkthrough.',
    domain: 'spending',
    interviewSection: 'spending',
    keys: ['spendingBridge'],
  },
  {
    id: 'taxableAccountOwner',
    title: 'How your taxable account is held, for the new cost basis at the first death',
    blurb: 'When the first spouse dies, what they owned in the taxable account takes its market value as its new cost basis, so the survivor\u2019s later sales show less gain. Jointly held, half is reset; in one name, all or none; in a community-property state, all of it.',
    domain: 'spending',
    interviewSection: 'spending',
    keys: ['taxableAccountOwner'],
  },
  {
    id: 'hsaBridgePremiumSplit',
    title: 'How much of the pre-Medicare healthcare bridge your HSA may pay',
    blurb: 'IRS Publication 969 does not let an HSA pay health-insurance premiums before Medicare, so only the out-of-pocket share of the bridge is drawn from it. Set that split here, or mark the premiums qualified for the cases Pub. 969 does allow (COBRA, or coverage while drawing unemployment).',
    domain: 'spending',
    interviewSection: 'healthcare',
    keys: ['healthcareBridgePremiumPct', 'hsaPreMedicarePremiumsQualified'],
  },
  {
    id: 'survivorStress',
    title: 'Survivor Stress Test',
    blurb: 'What happens to the plan if one spouse dies early — surviving income, the switch to single filing, and how much spending actually drops.',
    domain: 'household',
    interviewSection: 'household',
    keys: ['survivorStressEnabled', 'survivorStressSpouse', 'survivorStressAge', 'survivorExpenseDropPct'],
  },
  {
    id: 'rsuRefresh',
    title: 'Assumed future RSU grants, and a refresh interruption',
    blurb: 'The Interview takes grants you already have. This adds an assumption that new grants keep arriving each year (with their own growth rate), plus a stress test for a year they don’t.',
    domain: 'income',
    interviewSection: 'equity',
    keys: ['rsuRefreshEnabled', 'rsuRefreshAnnualValue', 'rsuRefreshVestingYears', 'rsuRefreshSchedule',
           'rsuRefreshCustomSchedule', 'rsuRefreshGrowthRate', 'rsuRefreshGapEnabled', 'rsuRefreshGapSpouse',
           'rsuRefreshGapStartYear', 'rsuRefreshGapDurationYears'],
  },
  {
    id: 'concentratedStockAdvanced',
    title: 'Concentrated stock: tax on diversifying, and the risk threshold',
    blurb: 'The assumed tax rate applied when you sell some of a concentrated position down, and the % of net worth at which the app starts flagging it as a risk.',
    domain: 'income',
    interviewSection: 'equity',
    keys: ['concentratedStockDiversifyTaxRate', 'concentratedStockConcentrationTargetPct'],
  },
  {
    id: 'concentratedStockVestRouting',
    title: 'Concentrated stock: holding new vests as shares',
    blurb: 'Models keeping new RSU/GSU shares as they vest (the big-tech sell-to-cover mechanic) instead of assuming every vest is sold for cash — the held value accumulates in your concentrated position rather than your diversified accounts.',
    domain: 'income',
    interviewSection: 'equity',
    keys: ['concentratedStockVestRoutingEnabled', 'concentratedStockVestCoverPct', 'concentratedStockVestHoldPct', 'concentratedStockVestSpouse'],
  },
  {
    id: 'concentratedStockSecondPosition',
    title: 'A second concentrated stock position',
    blurb: 'For a household where each spouse holds a different employer\'s stock (one\'s GOOG, the other\'s META): a second, fully independent position with its own value, growth, diversification plan, and vest routing.',
    domain: 'income',
    interviewSection: 'equity',
    keys: ['concentratedStock2Enabled', 'concentratedStock2Label', 'concentratedStock2Init', 'concentratedStock2CostBasisPct', 'concentratedStock2GrowthRate', 'concentratedStock2DiversifyPct', 'concentratedStock2DiversifyTaxRate', 'concentratedStock2VestRoutingEnabled', 'concentratedStock2VestCoverPct', 'concentratedStock2VestHoldPct', 'concentratedStock2VestSpouse'],
  },
  {
    id: 'lifeInsuranceAdvanced',
    title: 'Life insurance: premiums, increasing benefit, policy loans',
    blurb: 'Annual premium, whether the death benefit grows with cash value ("Option B") or stays level, and any outstanding loan against the policy.',
    domain: 'balances',
    interviewSection: 'debt',
    keys: ['lifeInsuranceAnnualPremium', 'lifeInsuranceIncreasingBenefit', 'lifeInsuranceLoanBalance', 'lifeInsuranceLoanRate'],
  },
  {
    id: 'reverseMortgageTerms',
    title: 'Reverse mortgage loan terms',
    blurb: 'The interest rate the loan balance compounds at, and what fraction of the home’s value you can actually borrow.',
    domain: 'balances',
    interviewSection: 'debt',
    keys: ['reverseMortgageRate', 'reverseMortgagePrincipalLimitPct'],
  },
  {
    id: 'nua',
    title: 'NUA (Net Unrealized Appreciation) employer stock',
    blurb: 'A one-time in-kind distribution of employer stock out of a 401(k) at retirement, taxed at capital-gains rates on the appreciation instead of ordinary income.',
    domain: 'taxes',
    interviewSection: 'roth',
    keys: ['nuaEnabled', 'nuaCostBasis', 'nuaCurrentValue', 'nuaDistributionAge'],
  },
  {
    id: 'granularInflation',
    title: 'Category-specific inflation rates',
    blurb: 'The Interview asks for one blended rate. Healthcare, long-term care, housing, Social Security COLA, and Medicare Part B/D have historically all moved at different speeds — set each separately here.',
    domain: 'assumptions',
    interviewSection: 'risk',
    keys: ['ssCOLA', 'medicalInflationRate', 'ltcInflationRate', 'housingInflationRate', 'housingExpensePct',
           'medicarePartBInflationRate', 'medicarePartDInflationRate', 'taxBracketInflationRate'],
  },
  {
    id: 'safeWithdrawalRate',
    title: 'Safe Withdrawal Rate',
    blurb: 'The withdrawal rate behind the FI / CoastFIRE crossover target. 4% (the "25x expenses" rule) unless you change it.',
    domain: 'assumptions',
    interviewSection: 'risk',
    keys: ['safeWithdrawalRate'],
  },
  {
    id: 'dynamicAllocation',
    title: 'Dynamic Asset Allocation and glide path',
    blurb: 'Derive your return from a real stock/bond mix that shifts more conservative as you age, instead of the single flat return the Interview asks for.',
    domain: 'assumptions',
    interviewSection: 'risk',
    keys: ['rebalancingEnabled', 'stockAllocationPre', 'stockAllocationPost', 'stockReturnRate',
           'bondReturnRate', 'glideAllocationEnabled', 'glideAllocationRate', 'glideAllocationFloor'],
  },
  {
    id: 'returnGlide',
    title: 'Getting more conservative each year in retirement',
    blurb: 'Reduce your retired return a little each year instead of holding it flat for life, down to a floor you set. This is the version for plans using the flat return the Interview asks about; the Dynamic Asset Allocation entry above does the same thing by shifting a stock/bond mix instead.',
    domain: 'assumptions',
    interviewSection: 'risk',
    keys: ['equityGlidePathEnabled', 'equityGlidePathRate', 'equityGlidePathFloor'],
  },
  {
    id: 'marketVolatility',
    title: 'Market volatility and inflation uncertainty',
    blurb: 'How much returns swing year to year, and (off by default) whether each Monte Carlo trial also draws its own inflation, correlated with the market. Affects only the Monte Carlo success probability, which volatility dominates — not the main projection. The Interview leaves these on their defaults.',
    domain: 'assumptions',
    interviewSection: 'risk',
    keys: ['volatilityPre', 'volatilityPost', 'mcInflationEnabled', 'mcInflationVolatility', 'mcInflationReturnCorrelation', 'mcLongevityEnabled', 'mcLtcEnabled', 'mcReturnModel', 'mcBootstrapBlockYears', 'mcBootstrapCenter'],
  },
  {
    id: 'rothIrmaaCap',
    title: 'Holding Roth conversions under an IRMAA tier',
    blurb: 'A cap on whichever conversion strategy is active: in any year whose income will price someone\u2019s Medicare premiums two years later, the conversion stops at the IRMAA tier you choose (minus the buffer). Lives under the conversion strategy on Plan Settings \u2192 Taxes & Roth. The Interview asks about the strategy and the ACA cliff; this second ceiling is a refinement most people reach for after seeing the Medicare column.',
    domain: 'taxes',
    interviewSection: 'roth',
    keys: ['rothConversionIrmaaCapEnabled', 'rothConversionIrmaaTier'],
  },
  {
    id: 'sexForLifeTable',
    title: 'Sex, for the life-table odds',
    blurb: 'Female, Male or Not stated, per person. Read only by the Social Security life-table odds shown next to Life Expectancy and on Retirement Readiness, and by the Monte Carlo\u2019s longevity option. Nothing in the tax or benefit engine uses it, which is why the Interview does not ask; Not stated blends the two curves.',
    domain: 'household',
    interviewSection: 'household',
    keys: ['sex1', 'sex2'],
  },
  {
    id: 'residencyTimeline',
    title: 'Moving to another state, or abroad, later in the plan',
    blurb: 'A list of planned moves, each a year and a US state or (with Premium) another country. From that year the plan is taxed where you live — abroad, on top of the US tax a citizen keeps paying — and your estate is taxed by where you live at the end of the plan. Lives on Plan Settings \u2192 Life Events. The Interview asks where you live now; a future move is a what-if most people come to later, so it is not one more question on the first pass.',
    domain: 'milestones',
    // Changelog 212: on the Life Events section, where moves live in Plan
    // Settings -- not on Household, where it was easy to miss.
    interviewSection: 'milestones',
    keys: ['residencyTimeline'],
  },
  {
    id: 'lifetimeGifting',
    title: 'Lifetime gifting',
    blurb: 'Give money away while you are alive: how many people, how much each, starting when, and for how long. Modeled as a real cash outflow, and anything above the annual exclusion reduces the exemption sheltering your estate later.',
    domain: 'milestones',
    interviewSection: 'estate',
    keys: ['giftingEnabled', 'giftingRecipients', 'giftingPerRecipient', 'giftingSplitWithSpouse',
           'giftingStartAge', 'giftingYears', 'giftingGrowWithInflation'],
  },
  {
    id: 'mfsLivedApart',
    title: 'Filing separately: did you live with your spouse?',
    blurb: 'Only relevant if your filing status is Married Filing Separately, where it decides three different rules at once — whether Social Security benefits get any exempt amount at all, how fast Roth eligibility phases out, and which Medicare surcharge schedule applies.',
    domain: 'household',
    interviewSection: 'household',
    keys: ['mfsLivedWithSpouse'],
  },
  {
    id: 'ssDepletionDetail',
    title: 'Social Security depletion: year and cut size',
    blurb: 'The Interview offers the toggle using the SSA’s own projection. These let you model a different depletion year or a different benefit cut.',
    domain: 'assumptions',
    interviewSection: 'risk',
    keys: ['ssDepletionYear', 'ssCutPercent'],
  },
  {
    id: 'taxableDividendYield',
    title: 'The dividend yield the tax engine assumes on your taxable brokerage',
    blurb: 'Dividends and fund distributions in a taxable account are taxed every year and count toward the income Medicare (IRMAA) and the ACA look at, even when reinvested. This is the yield the plan assumes on the Taxable Brokerage balance — 2% unless you change it, or link it to the real blended yield of your Detailed Holdings — and how much of it is taxed at qualified-dividend rates rather than as ordinary income.',
    domain: 'balances',
    interviewSection: 'balances',
    keys: ['taxableDividendYield', 'taxableQualifiedDividendPct'],
  },
  {
    id: 'dividendPayoutMode',
    title: 'What your dividends do once you retire',
    blurb: 'Reinvesting dividends and then selling shares to live on is the same trade twice: the sale realizes gains the dividend could have covered. This decides whether they keep buying shares in retirement (the default, and what the plan has always assumed), fund the year\u2019s spending first, or all land as cash. It changes nothing about the tax on the dividend itself, or the income Medicare and the ACA look at \u2014 only how much has to be sold.',
    domain: 'balances',
    interviewSection: 'balances',
    keys: ['dividendPayoutMode'],
  },
  {
    id: 'irmaaAppeal',
    title: 'Medicare IRMAA appeal after retiring (Form SSA-44)',
    blurb: 'Medicare prices each year’s surcharge off the tax return from two years earlier, so the first Medicare years of a high earner are charged on salary. This assumes you file the appeal that lets Social Security use this year’s lower income instead.',
    domain: 'taxes',
    interviewSection: 'roth',
    keys: ['irmaaLifeChangeAppealEnabled'],
  },
  {
    id: 'medicareEmployerCoverage',
    title: 'Delaying Medicare while on an employer plan',
    blurb: 'Someone who turns 65 while covered through their own or their spouse\u2019s current job can delay Part B and Part D with no penalty, if the employer has 20 or more employees. Set it and the plan charges no Medicare premium for them until that job ends.',
    domain: 'spending',
    interviewSection: 'healthcare',
    keys: ['medicareEmployerCoverage1', 'medicareEmployerCoverage2'],
  },
  {
    id: 'irmaaPriorMagi',
    title: 'Income on your last two tax returns (Medicare)',
    blurb: 'Medicare prices each year off the return filed two years earlier, so your plan\u2019s first two Medicare years are set by returns filed before the plan begins. Enter them and those years are priced the way Medicare will price them; leave them blank and the plan falls back to each year\u2019s own retired income, which usually understates the premium.',
    domain: 'taxes',
    interviewSection: 'roth',
    keys: ['irmaaTwoYearsPriorMagi', 'irmaaPriorYearMagi'],
  },
  {
    id: 'irmaaDeclaredEvent',
    title: 'A Form SSA-44 life-changing event',
    blurb: 'Social Security recognizes eight life-changing events that let you ask for your Medicare premium to be set from this year\u2019s income instead of a two-year-old return. The plan can work out two of them by itself; name any of the other six here and it will price that year and the two after it the way a successful appeal would.',
    domain: 'taxes',
    interviewSection: 'roth',
    keys: ['irmaaLifeChangeEventYear', 'irmaaLifeChangeEventType'],
  },
];

// Entries relevant to one Interview section, for its inline pointer.
export function notAskedForSection(sectionId) {
  return NOT_ASKED_IN_INTERVIEW.filter((e) => e.interviewSection === sectionId);
}

// Everything, grouped by Plan Settings domain, for the Review step and the
// Input Dictionary's "Where do I find this?" table.
export function notAskedByDomain() {
  const out = [];
  for (const [domain, label] of Object.entries(SETTINGS_DOMAINS)) {
    const items = NOT_ASKED_IN_INTERVIEW.filter((e) => e.domain === domain);
    if (items.length) out.push({ domain, label, items });
  }
  return out;
}
