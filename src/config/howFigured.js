// Help -> "How the numbers are figured": one plain-language entry per tax or
// benefit rule the projection models, each linked to the official page that
// sets the rule (by id, from src/config/sources.js -- never a second copy of
// a URL).
//
// Rules for anything added here (howFigured.test.js enforces the first four):
//
// 1. Every entry names at least one source id, and every id exists.
// 2. Every dollar figure comes from the engine's own constants through
//    src/utils/copyFigures.js. A figure the engine keeps inline is written
//    literally and pinned to the engine literal in howFigured.test.js, so
//    the yearly tax update cannot change one without the other.
// 3. Plain present tense, written for a retiree: no code names, no statute
//    section numbers (a form or publication name is fine), no release notes.
// 4. `simplifies` says what the app leaves out, where it leaves something out
//    (TAX_RULES_SPEC.md section 7 and KNOWN_ISSUES.md list them).
// 5. `id` is the card's anchor: "How is this figured?" links elsewhere in the
//    app open the section scrolled to it, so renaming one breaks those links
//    (howFiguredLinks.test.jsx checks every link names a real id).
//
// TAX_UPDATE_PROCESS.md, "Year-end source review", says how this list and
// the sources behind it are re-checked every December.
import { STATE_TAX_RULES } from './stateTaxRules';
import {
  usd, usdCents, TAX_YEAR, ACA_CLIFF_COUPLE, ACA_CLIFF_SINGLE, TOP_RATE_START_SINGLE, TEN_PCT_TOP_MFJ,
  DEDUCTION_MFJ, DEDUCTION_SINGLE, ADDITIONAL_DEDUCTION_AGED_MARRIED_2026, ADDITIONAL_DEDUCTION_AGED_SINGLE_2026,
  SENIOR_BONUS_DEDUCTION, SENIOR_BONUS_FIRST_YEAR, SENIOR_BONUS_LAST_YEAR, SENIOR_BONUS_PHASEOUT_SINGLE,
  SENIOR_BONUS_PHASEOUT_MFJ, SENIOR_BONUS_GONE_MFJ,
  AMT_EXEMPTION_MFJ_2026, AMT_EXEMPTION_SINGLE_2026,
  SS_EARNINGS_TEST_EXEMPT_UNDER_FRA, SS_EARNINGS_TEST_EXEMPT_FRA_YEAR,
  ELECTIVE_DEFERRAL_LIMIT_2026, CATCHUP_50_2026, CATCHUP_60_63_2026, IRA_LIMIT_2026, IRA_CATCHUP_50_2026,
  MANDATORY_ROTH_CATCHUP_WAGE_THRESHOLD_2026, HSA_LIMIT_SELF_2026, HSA_LIMIT_FAMILY_2026, HSA_CATCHUP_55_2026,
  QCD_LIMIT_2026, RMD_START_AGE_BEFORE_1960, RMD_START_AGE_FROM_1960, RMD_DIVISOR_AT_START,
  IRMAA_STANDARD_PREMIUM, PART_D_BASE_PREMIUM, IRMAA_FIRST_TIER_SINGLE, IRMAA_FIRST_TIER_MFJ,
  IRMAA_TOP_TIER_SINGLE, IRMAA_TOP_TIER_MFJ, IRMAA_TOP_PREMIUM, FPL_ONE_PERSON,
  FEDERAL_ESTATE_EXEMPTION_2026, GST_EXEMPTION_2026, ANNUAL_GIFT_EXCLUSION_2026, stateEstateExemption,
  CA_STD_DEDUCTION_SINGLE, CA_STD_DEDUCTION_MFJ, CA_MILITARY_EXCLUSION_CAP, CA_BHS_TAX_THRESHOLD,
  NY_STD_DEDUCTION_SINGLE, NY_STD_DEDUCTION_MFJ, NY_RECAPTURE_AGI_FLOOR,
  IL_EXEMPTION_ALLOWANCE, IL_EXEMPTION_AGE_65, IL_EXEMPTION_AGI_LIMIT_SINGLE, IL_EXEMPTION_AGI_LIMIT_MFJ,
  VA_STD_DEDUCTION_SINGLE, VA_STD_DEDUCTION_MFJ, VA_AGE_DEDUCTION, VA_MILITARY_SUBTRACTION_CAP,
  WA_CAPITAL_GAINS_STD_DEDUCTION, WA_CAPITAL_GAINS_ADDITIONAL_THRESHOLD, WA_INCOME_TAX_STD_DEDUCTION,
  ROTH_IRA_PHASEOUT_MFJ, ROTH_IRA_PHASEOUT_SINGLE,
  SS_DEPLETION_YEAR_DEFAULT, SS_CUT_PERCENT_DEFAULT,
} from '../utils/copyFigures';

// Group headings, in the order the section shows them.
export const HOW_FIGURED_GROUPS = [
  'Federal income tax',
  'Social Security',
  'Medicare and health coverage',
  'Retirement accounts',
  'Estate and inheritance',
  'States',
  'Planning assumptions',
];

export const HOW_FIGURED_RULES = [
  // --- Federal income tax ---------------------------------------------
  {
    id: 'federal-brackets',
    title: 'Federal income tax brackets',
    group: 'Federal income tax',
    summary: `Ordinary income (wages, pensions, the taxable part of Social Security, IRA and 401(k) withdrawals, and Roth conversions) is taxed in seven brackets from 10% to 37%, after the standard deduction. On a joint return the 10% bracket covers the first ${usd(TEN_PCT_TOP_MFJ)} of taxable income, and a single filer reaches 37% above ${usd(TOP_RATE_START_SINGLE)}. In later years every bracket grows by the Tax Bracket Inflation Rate you set.`,
    figuresYear: TAX_YEAR,
    simplifies: 'Brackets grow at your inflation rate in a smooth line rather than by the IRS index and its rounding, and there is no head of household or qualifying surviving spouse status.',
    sources: ['tax-tables'],
  },
  {
    id: 'standard-deduction',
    title: 'Standard deduction and the extra amount at 65',
    group: 'Federal income tax',
    summary: `The app takes the standard deduction every year: ${usd(DEDUCTION_MFJ)} on a joint return and ${usd(DEDUCTION_SINGLE)} for a single or separate filer. Each person 65 or older adds ${usd(ADDITIONAL_DEDUCTION_AGED_MARRIED_2026)} on a married return or ${usd(ADDITIONAL_DEDUCTION_AGED_SINGLE_2026)} on a single one. Both amounts grow each year with your Tax Bracket Inflation Rate.`,
    figuresYear: TAX_YEAR,
    simplifies: 'Itemized deductions (mortgage interest, state and local taxes, gifts to charity, medical costs) and the extra amount for blindness are not modeled. A surviving spouse files as single from the year of the death, where the law allows a joint return for that year.',
    sources: ['tax-tables'],
  },
  {
    id: 'senior-deduction',
    title: `The extra deduction for people 65 and older (${SENIOR_BONUS_FIRST_YEAR}-${SENIOR_BONUS_LAST_YEAR})`,
    group: 'Federal income tax',
    summary: `For tax years ${SENIOR_BONUS_FIRST_YEAR} through ${SENIOR_BONUS_LAST_YEAR}, each person 65 or older gets an extra ${usd(SENIOR_BONUS_DEDUCTION)} deduction on top of the standard deduction. Each person's amount shrinks by 6 cents for every dollar of income above ${usd(SENIOR_BONUS_PHASEOUT_SINGLE)} on a single return or ${usd(SENIOR_BONUS_PHASEOUT_MFJ)} on a joint one, so a couple's is gone at ${usd(SENIOR_BONUS_GONE_MFJ)}. A married couple filing separately cannot claim it. Because withdrawals and conversions change the income it depends on, the app works the deduction out together with each year's withdrawals.`,
    figuresYear: `${SENIOR_BONUS_FIRST_YEAR}-${SENIOR_BONUS_LAST_YEAR} (set in law, not adjusted for inflation)`,
    sourceNote: 'The IRS has published this law only as a newsroom release so far; the form instructions follow at filing time.',
    sources: ['senior-deduction'],
  },
  {
    id: 'capital-gains',
    title: 'Capital gains and qualified dividends',
    group: 'Federal income tax',
    summary: 'Long-term gains and qualified dividends sit on top of your other taxable income and are taxed at 0%, 15% or 20%. On a joint return the 0% rate covers taxable income up to $98,900 ($49,450 single). Gains come from selling taxable-account investments to pay for spending, and dividends from the yearly yield on that account. Only the qualified share of that yield gets these rates: the rest, such as interest and bond-fund payouts, is taxed as ordinary income. You set the share under Plan → Spending → Withdrawals (Qualified share of that yield, 100% unless you change it), or Detailed Holdings sets it from each holding.',
    figuresYear: TAX_YEAR,
    simplifies: 'Every gain is treated as long-term; short-term gains are not modeled. The split between qualified and ordinary dividends is one percentage for the whole taxable account, applied every year.',
    sources: ['tax-tables'],
  },
  {
    id: 'niit',
    title: 'The 3.8% tax on investment income',
    group: 'Federal income tax',
    summary: 'A 3.8% tax applies to investment income (dividends, gains, net rent and income from an annuity bought with taxable money) to the extent your income is above $250,000 on a joint return, $200,000 single or $125,000 filing separately. These thresholds are set in law and do not rise with inflation.',
    figuresYear: 'Set in law, not adjusted for inflation',
    sources: ['niit'],
  },
  {
    id: 'amt',
    title: 'Alternative minimum tax',
    group: 'Federal income tax',
    summary: `The app also works out the alternative minimum tax and adds any amount by which it exceeds regular tax. The exemption is ${usd(AMT_EXEMPTION_MFJ_2026)} on a joint return and ${usd(AMT_EXEMPTION_SINGLE_2026)} single, and it phases out at high incomes. Because the app models no itemized deductions or stock options, the minimum tax rarely applies in a projection.`,
    figuresYear: TAX_YEAR,
    simplifies: 'The standard deduction is the only item added back for the minimum tax.',
    sources: ['tax-tables'],
  },
  {
    id: 'married-filing-separately',
    title: 'Married filing separately: two returns',
    group: 'Federal income tax',
    summary: 'When you choose married filing separately, the app prepares two returns. The household\'s income is divided between them by the split you set (half each by default), and each return has its own standard deduction, brackets, state tax and Medicare income test. Separate filers who lived together have no base amount before Social Security becomes taxable, cannot take the senior deduction, and get no ACA premium tax credit.',
    figuresYear: TAX_YEAR,
    simplifies: 'One ratio divides all income; the app does not assign each account or paycheck to the spouse who owns it, and community-property rules are not modeled.',
    sources: ['tax-tables', 'ss-taxation', 'senior-deduction', 'premium-tax-credit'],
  },
  {
    id: 'payroll-taxes',
    title: 'Payroll taxes while you work',
    group: 'Federal income tax',
    summary: 'While you work, the app charges the employee share of payroll tax: 6.2% for Social Security on wages up to $184,500 and 1.45% for Medicare on all wages. An extra 0.9% Medicare tax applies to wages above $250,000 for a couple ($200,000 single). The Social Security wage limit grows each year.',
    figuresYear: TAX_YEAR,
    simplifies: 'The wage limit grows at your general inflation rate, standing in for the national average wage index that actually sets it.',
    sources: ['ss-wage-base'],
  },

  // --- Social Security ------------------------------------------------
  {
    id: 'ss-taxation',
    title: 'How much of your Social Security is taxed',
    group: 'Social Security',
    summary: 'Up to 85% of Social Security can be taxable. The app follows the IRS worksheet: it adds half your benefits to your other income for the year, including that year\'s withdrawals and Roth conversions, and compares the total with $32,000 and $44,000 on a joint return ($25,000 and $34,000 single). Below the first line none of the benefit is taxed, between the lines up to half, and above the second up to 85%. These lines are set in law and do not rise with inflation.',
    figuresYear: 'Set in law, not adjusted for inflation',
    sources: ['ss-taxation'],
  },
  {
    id: 'ss-claiming',
    title: 'Claiming age: early and delayed benefits',
    group: 'Social Security',
    summary: 'You enter each benefit at full retirement age, which is 67 for anyone born in 1960 or later and between 66 and 67 for births from 1943 to 1959. Claiming earlier reduces the benefit for life (to 70% at 62 when full retirement age is 67), and waiting past full retirement age adds 8% a year until 70. Benefits then rise each year by the cost-of-living rate you set.',
    figuresYear: 'Set in law',
    sources: ['ss-claiming', 'ss-delayed-credits'],
  },
  {
    id: 'ss-spousal',
    title: 'Spousal benefit',
    group: 'Social Security',
    summary: 'With the spousal benefit switched on, a spouse whose own full benefit is less than half of the other\'s receives the difference as a top-up. It starts no earlier than 62 and no earlier than the other spouse\'s claim, and it is reduced when it starts before full retirement age (at 62 it is 65% of the full top-up). It earns no credits for waiting past full retirement age.',
    figuresYear: 'Set in law',
    simplifies: 'Benefits on a former spouse\'s record and the one-year marriage test are not modeled, and the earnings test does not reduce the top-up.',
    sources: ['ss-spousal'],
  },
  {
    id: 'ss-survivor',
    title: 'Survivor benefit',
    group: 'Social Security',
    summary: 'When a spouse dies, the survivor keeps the larger of their own benefit and a survivor benefit on the deceased spouse\'s record. That benefit is based on what the deceased was receiving, or on their full benefit with any credits earned for waiting if they had not yet claimed, and is 71.5% of it when started at 60, rising to 100% at the survivor\'s full retirement age. If the deceased claimed early, the survivor benefit is capped at the larger of their reduced benefit and 82.5% of their full one.',
    figuresYear: 'Set in law',
    simplifies: 'The survivor is assumed to start the survivor benefit in the first year they can rather than delay it, and survivors born 1957 to 1961 use the retirement full-retirement-age table.',
    sources: ['ss-survivor'],
  },
  {
    id: 'ss-earnings-test',
    title: 'Working while collecting: the earnings test',
    group: 'Social Security',
    summary: `If you claim before full retirement age and still earn wages, Social Security holds back one dollar of benefits for every two dollars you earn above ${usd(SS_EARNINGS_TEST_EXEMPT_UNDER_FRA)}. In the year you reach full retirement age the limit is ${usd(SS_EARNINGS_TEST_EXEMPT_FRA_YEAR)}, and one dollar is held back for every three. At full retirement age the benefit is recalculated to credit the months held back, and the app raises your benefit to match. Only wages and self-employment income count; pensions, withdrawals and investment income do not.`,
    figuresYear: TAX_YEAR,
    simplifies: 'The app counts whole years, so in the year you reach full retirement age it tests the whole year\'s earnings rather than only the months before that birthday; the first-year monthly test is not modeled.',
    sources: ['ss-earnings-test'],
  },

  // --- Medicare and health coverage ------------------------------------
  {
    id: 'irmaa',
    title: 'Medicare premiums and the income surcharge (IRMAA)',
    group: 'Medicare and health coverage',
    summary: `From 65, the app charges each person the Medicare Part B premium (${usdCents(IRMAA_STANDARD_PREMIUM)} a month) and a Part D premium at the national base amount (${usdCents(PART_D_BASE_PREMIUM)} a month). Higher incomes pay a surcharge on both, in five steps: the first above ${usd(IRMAA_FIRST_TIER_SINGLE)} single or ${usd(IRMAA_FIRST_TIER_MFJ)} joint, the top one at ${usd(IRMAA_TOP_TIER_SINGLE)} or ${usd(IRMAA_TOP_TIER_MFJ)}, where Part B is ${usdCents(IRMAA_TOP_PREMIUM)} a month. Premiums grow by the Medicare inflation rates you set and the income steps by your Tax Bracket Inflation Rate, except the top step, which the law holds fixed through 2027.`,
    figuresYear: TAX_YEAR,
    simplifies: 'Tax-exempt interest, which counts in Medicare\'s income test, is not modeled, and Part D is priced at the national base premium rather than your plan\'s price.',
    sources: ['medicare-irmaa-2026', 'part-d-base-premium', 'medicare'],
  },
  {
    id: 'irmaa-lookback',
    title: 'The two-year lookback and Form SSA-44',
    group: 'Medicare and health coverage',
    summary: 'Medicare sets each year\'s surcharge from the tax return filed two years earlier, so the app prices each year from its income two years before. In the first two years it uses the earlier returns you enter, or that year\'s own income if you leave them blank. After a spouse stops working or dies, an optional setting models Form SSA-44, which asks Social Security to use current income instead; the app then charges whichever premium is lower.',
    figuresYear: TAX_YEAR,
    simplifies: 'Only a spouse stopping work or dying is detected as a life-changing event; you can declare the others yourself.',
    sources: ['irmaa-lookback'],
  },
  {
    id: 'aca-cliff',
    title: 'ACA premium tax credit and the 400% line',
    group: 'Medicare and health coverage',
    summary: `Before Medicare, a retired household with marketplace coverage gets a premium tax credit only if its income is between 100% and 400% of the federal poverty line. The app flags any year over the 400% line (${usd(ACA_CLIFF_COUPLE)} for a couple, ${usd(ACA_CLIFF_SINGLE)} single) and, if you entered an expected credit, charges it back as tax that year. In a state that has not expanded Medicaid it also flags years below the poverty line (${usd(FPL_ONE_PERSON)} for one person), where there is neither Medicaid nor a credit.`,
    figuresYear: TAX_YEAR,
    simplifies: 'The credit\'s amount is your own estimate rather than worked out from benchmark premiums, and the poverty line is the current year\'s rather than the prior year\'s the law uses.',
    sources: ['premium-tax-credit', 'fpl'],
  },
  {
    id: 'hsa',
    title: 'Health savings account',
    group: 'Medicare and health coverage',
    summary: `HSA contributions of up to ${usd(HSA_LIMIT_SELF_2026)} (self-only) or ${usd(HSA_LIMIT_FAMILY_2026)} (family), plus ${usd(HSA_CATCHUP_55_2026)} from 55, reduce taxable income. The app pays qualified medical costs from the HSA tax-free before any other account: Medicare premiums, long-term care, and the out-of-pocket share of costs before Medicare, but not ordinary health insurance premiums before 65 unless you mark them as continuation or unemployment coverage. Only if every other account and the cash reserve run out does the HSA pay other spending, taxed as income plus a 20% additional tax before 65. What is left at the end of the plan passes to heirs, who pay income tax on it the year they inherit.`,
    figuresYear: TAX_YEAR,
    simplifies: 'The split between premiums and out-of-pocket costs before Medicare is a planning figure you set (70% premiums by default), and contributions do not stop automatically at Medicare enrollment.',
    sources: ['hsa-limits', 'hsa-qualified-expenses'],
  },

  // --- Retirement accounts --------------------------------------------
  {
    id: 'rmd',
    title: 'Required minimum distributions',
    group: 'Retirement accounts',
    summary: `Required minimum distributions start at ${RMD_START_AGE_BEFORE_1960}, or ${RMD_START_AGE_FROM_1960} for anyone born in 1960 or later. Each year's minimum is the Pre-Tax balance divided by the Uniform Lifetime Table factor for the owner's age, ${RMD_DIVISOR_AT_START} at ${RMD_START_AGE_BEFORE_1960} and smaller every year after. When the first spouse dies, the survivor treats the account as their own, and the minimums follow the survivor's age and start age.`,
    figuresYear: 'Set in law and regulation',
    simplifies: 'The household\'s Pre-Tax accounts are one pool owned by the first spouse while alive; there is no separate table for a spouse more than ten years younger, no delay of the first minimum to April 1, and no still-working exception.',
    sources: ['rmd', 'inherited-ira-rmd-regs', 'inherited-ira'],
  },
  {
    id: 'early-withdrawal',
    title: 'Withdrawals before 59½',
    group: 'Retirement accounts',
    summary: 'A Pre-Tax withdrawal before 59½ carries a 10% additional tax on its taxable part, and California adds 2.5%. Roth conversions carry no penalty. The app assumes none of the IRS exceptions, such as leaving an employer at 55 or a series of equal yearly payments, so a plan that draws early shows the penalty.',
    figuresYear: 'Set in law',
    simplifies: 'Ages are whole calendar-year ages, so 59½ is reached in the year you turn 60, and it is measured on the first spouse\'s age.',
    sources: ['early-distributions', 'ca-early-distribution'],
  },
  {
    id: 'roth-conversions',
    title: 'Roth conversions',
    group: 'Retirement accounts',
    summary: 'You can convert a fixed amount each year or fill up to the top of a bracket you choose. A conversion is taxable income the year it is made, and it also counts in the Social Security test, the senior deduction and the Medicare surcharge two years later. If your Pre-Tax money includes after-tax contributions, only the pre-tax share of each converted dollar is taxed, as on Form 8606.',
    figuresYear: 'Set in law',
    simplifies: 'The after-tax share is measured across the whole Pre-Tax pool, 401(k) money included, where the law looks at IRAs only.',
    sources: ['ira-phaseouts', 'inherited-ira'],
  },
  {
    id: 'roth-five-year',
    title: 'Roth withdrawals and the five-year rules',
    group: 'Retirement accounts',
    summary: 'Before 59½, a Roth withdrawal comes first from contributions (no tax, no penalty), then from conversions oldest first, then from earnings. The taxable part of a conversion withdrawn within five tax years, counted from January 1 of the conversion year, carries the 10% penalty but no income tax; earnings withdrawn early are taxed and penalized. From 59½ the app treats Roth withdrawals as tax-free.',
    figuresYear: 'Set in law',
    simplifies: 'The separate five-year rule for the Roth account itself is assumed to be met by 59½.',
    sources: ['roth-conversion-recapture', 'inherited-ira'],
  },
  {
    id: 'contribution-limits',
    title: 'Contribution limits and catch-ups',
    group: 'Retirement accounts',
    summary: `Workplace plans such as a 401(k) allow ${usd(ELECTIVE_DEFERRAL_LIMIT_2026)} of your own contributions, plus ${usd(CATCHUP_50_2026)} from 50, or ${usd(CATCHUP_60_63_2026)} instead at ages 60 through 63. IRAs allow ${usd(IRA_LIMIT_2026)}, plus ${usd(IRA_CATCHUP_50_2026)} from 50. Someone whose wages are over ${usd(MANDATORY_ROTH_CATCHUP_WAGE_THRESHOLD_2026)} must make catch-up contributions as Roth. Direct Roth IRA contributions phase out between ${usd(ROTH_IRA_PHASEOUT_MFJ[0])} and ${usd(ROTH_IRA_PHASEOUT_MFJ[1])} of income on a joint return (${usd(ROTH_IRA_PHASEOUT_SINGLE[0])} to ${usd(ROTH_IRA_PHASEOUT_SINGLE[1])} single). The app uses these limits for its warnings and for Auto-Max; it does not cap what you enter.`,
    figuresYear: TAX_YEAR,
    simplifies: 'The Roth catch-up test uses the same year\'s wages rather than the prior year\'s wages from that employer, and later years\' limits grow at your Tax Bracket Inflation Rate.',
    sourceNote: 'The 2026 figures are from the IRS notice; the IRA rules behind them are from the 2025 edition of Publication 590-A, the latest the IRS has published.',
    sources: ['contribution-limits', 'ira-phaseouts'],
  },
  {
    id: 'qcd',
    title: 'Giving from an IRA: qualified charitable distributions',
    group: 'Retirement accounts',
    summary: `Once required distributions begin, you can send part of each year's minimum from Pre-Tax straight to charity. That part counts toward the minimum but stays out of taxable income, the Social Security test and the Medicare income test. The app caps it at the minimum and at ${usd(QCD_LIMIT_2026)} a year, a limit that rises with inflation.`,
    figuresYear: TAX_YEAR,
    simplifies: 'There is one cap for the household rather than one per spouse; gifts from 70½ before minimums begin, and the one-time gift to a split-interest trust, are not modeled.',
    sources: ['contribution-limits'],
  },
  {
    id: 'inherited-ira',
    title: 'What heirs pay on an inherited IRA',
    group: 'Retirement accounts',
    summary: 'An heir other than a spouse must empty an inherited IRA by the end of the tenth year after the death. If the owner had already reached their required-distribution age, the heir must also take a yearly minimum in years one to nine, based on the heir\'s life expectancy; the app uses that schedule by default and taxes each withdrawal at the heir\'s own brackets and other income. Inherited Roth money is tax-free, and a taxable account passes with its cost basis stepped up.',
    figuresYear: 'Set in law and regulation',
    simplifies: 'Heirs who may stretch withdrawals over their lifetime (a minor child, a disabled or chronically ill heir, or one close in age) are not singled out, and there is no deduction for estate tax paid on the same dollars.',
    sources: ['inherited-ira', 'inherited-ira-rmd-regs'],
  },

  // --- Estate and inheritance -----------------------------------------
  {
    id: 'federal-estate',
    title: 'Federal estate tax and portability',
    group: 'Estate and inheritance',
    summary: `The estate is valued once, at the end of the plan: your accounts, home equity, other property and life insurance you own. Federal estate tax is 40% of what exceeds the exemption, ${usd(FEDERAL_ESTATE_EXEMPTION_2026)} per person, grown each year by your Tax Bracket Inflation Rate unless you turn that off. A married couple gets two exemptions, on the assumption that the first spouse's estate elects portability; lifetime gifts above the annual exclusion use up part of it, and state estate tax paid is deducted first.`,
    figuresYear: TAX_YEAR,
    simplifies: 'Only the second death is modeled; trusts, marital-deduction planning, probate costs and debts are not, and an annuity you bought is left out of the estate.',
    sources: ['estate-tax', 'estate-portability'],
  },
  {
    id: 'gift-tax',
    title: 'Lifetime gifts',
    group: 'Estate and inheritance',
    summary: `You can give ${usd(ANNUAL_GIFT_EXCLUSION_2026)} a year to each person (twice that when a couple splits gifts) without using any of your estate exemption; the amount grows with inflation. Gifts above it reduce the exemption left at death.`,
    figuresYear: TAX_YEAR,
    simplifies: 'Paying tuition or medical bills directly, and front-loading five years of 529 gifts, are not modeled.',
    sources: ['gift-tax'],
  },
  {
    id: 'gst',
    title: 'Generation-skipping transfer tax',
    group: 'Estate and inheritance',
    summary: `A share left to a grandchild, or anyone else two generations down, above the ${usd(GST_EXEMPTION_2026)} generation-skipping exemption is taxed at 40% on top of estate tax. Unlike the estate exemption, it is not doubled for a married couple, because it cannot pass between spouses.`,
    figuresYear: TAX_YEAR,
    simplifies: 'There is no exception for a grandchild whose own parent has already died.',
    sources: ['gst'],
  },
  {
    id: 'state-estate',
    title: 'State estate taxes',
    group: 'Estate and inheritance',
    summary: `A dozen states and the District of Columbia charge their own estate tax, based on where you live at the end of the plan. Each state's own shape applies: its own graduated table in Minnesota, Oregon and Washington (above ${usd(stateEstateExemption('WA'))}), the old federal credit table in Massachusetts (from ${usd(stateEstateExemption('MA'))}), Rhode Island, Maryland and Illinois, and in New York a cliff, where an estate more than 5% above the exemption (${usd(stateEstateExemption('NY'))}) loses it entirely. Maryland subtracts inheritance tax paid from its estate tax.`,
    figuresYear: TAX_YEAR,
    simplifies: 'Hawaii, Maine and the District of Columbia are priced at their top rate above the exemption rather than through their graduated tables.',
    sources: ['ny-estate-cliff', 'ma-estate-tax', 'mn-estate-tax', 'or-estate-tax', 'ri-estate-tax', 'il-estate-threshold', 'md-estate-inheritance', 'vt-estate-tax', 'wa-estate-tax', 'wa-estate-exclusion'],
  },
  {
    id: 'state-inheritance',
    title: 'State inheritance taxes',
    group: 'Estate and inheritance',
    summary: 'Kentucky, Maryland, Nebraska, New Jersey and Pennsylvania tax what each heir receives, at a rate set by the heir\'s relationship to you. Spouses are exempt everywhere; in Pennsylvania a child pays 4.5%, a sibling 12% and others 15%, while Kentucky, Maryland and New Jersey exempt children entirely. Life insurance paid to a named beneficiary is left out in all five.',
    figuresYear: TAX_YEAR,
    sources: ['pa-tax-rates', 'ky-inheritance-classes', 'md-estate-inheritance', 'pa-inheritance-life-insurance', 'nj-inheritance-life-insurance', 'ky-inheritance-life-insurance', 'ne-inheritance-life-insurance'],
  },

  {
    id: 'foreign-tax-credit',
    title: 'Living abroad: the US foreign tax credit',
    group: 'Federal income tax',
    summary: 'A US citizen abroad still owes US tax on everything, so a move abroad adds the country\'s tax on top. The foreign tax credit gives some of it back, the way Form 1116 limits it: in two separate baskets, general (pensions, IRA withdrawals and wages) and passive (dividends and capital gains), each capped at the US tax on that basket\'s foreign-source income, so foreign tax on investments can never reduce US tax on a pension, or the other way round. US Social Security, US pensions, IRA money and US dividends are US-source income, which earns no credit at all unless the country\'s tax treaty re-sources it; the move\'s treaty setting says whether it does. Credit left unused in a year carries forward ten years within its own basket. Tax on a Roth, social contributions and a wealth tax never earn a credit.',
    figuresYear: TAX_YEAR,
    simplifies: 'The one-year carryback, the separate country-by-country lines of the form, the election that skips Form 1116 for a small credit, and the foreign earned income exclusion (wages earned abroad take the credit instead) are not modeled.',
    sources: ['ftc-pub-514', 'ftc-form-1116'],
  },

  // --- States -----------------------------------------------------------
  {
    id: 'state-none-or-flat',
    title: 'States with no income tax, and the flat-rate option',
    group: 'States',
    summary: 'Alaska, Florida, Nevada, New Hampshire, South Dakota, Tennessee, Texas and Wyoming do not tax wages or retirement income, so the app charges no state income tax there. Washington is not on this list: it taxes capital gains, and from 2028 large incomes, so Washington residents choose Washington, which has its own rules below. Instead of any state\'s own rules you can choose Other State, one flat rate you enter (5% by default), with your choice of whether it taxes Social Security and pensions.',
    figuresYear: TAX_YEAR,
    simplifies: 'The flat rate has no brackets, deductions or credits.',
    sources: ['tn-hall-tax', 'wa-income-tax'],
  },
  {
    id: 'state-own-rules',
    title: 'Every other state, by its own rules',
    group: 'States',
    summary: `The other ${Object.keys(STATE_TAX_RULES).length - 1} states and the District of Columbia are each priced from a table of their own 2026 rules: their brackets or flat rate, standard deduction and personal exemptions, whether they tax Social Security (some only above an income line), and their retirement exclusion — how much of a pension or IRA withdrawal each person may leave out, from what age, and where it shrinks with income. Georgia, for example, leaves out up to ${usd(STATE_TAX_RULES.GA.retirementExclusion.tiers[1].amount)} a person from 65, including interest and dividends; New Jersey leaves out up to ${usd(STATE_TAX_RULES.NJ.retirementExclusion.tiers[0].amountMfj)} for a couple from 62 but nothing once income passes ${usd(STATE_TAX_RULES.NJ.retirementExclusion.agiPhase[2].agiUpTo.mfj)}; Iowa and Mississippi leave out all of it. Government and military pensions are exempt where the state exempts them, Massachusetts adds its ${STATE_TAX_RULES.MA.surtax.rate * 100}% surtax on income over about $${(STATE_TAX_RULES.MA.surtax.over / 1e6).toFixed(1)} million, and Maryland and Indiana include a typical county income tax.`,
    figuresYear: 'Tax year 2026',
    simplifies: 'Credits, itemized deductions and smaller exclusions are left out; an exclusion a state gives each spouse separately is shared between them; Social Security that a state phases in gradually is taxed in full above the line; the 2026 figures are carried forward unchanged except where the state indexes them; and county taxes use a typical rate, not your county\'s.',
    sources: ['ga-retirement-exclusion', 'nj-pension-exclusion', 'mi-retirement-benefits'],
  },
  {
    id: 'state-ca',
    title: 'California',
    group: 'States',
    summary: `California taxes income in nine brackets from 1% to 12.3% after a ${usd(CA_STD_DEDUCTION_SINGLE)} standard deduction (${usd(CA_STD_DEDUCTION_MFJ)} joint), plus 1% on income over ${usd(CA_BHS_TAX_THRESHOLD)}. Social Security is exempt; pensions, IRA withdrawals and conversions are taxed in full, except up to ${usd(CA_MILITARY_EXCLUSION_CAP)} of military retirement pay for moderate incomes. California does not recognize HSAs, so contributions and growth are taxed each year, and early retirement withdrawals carry an extra 2.5%.`,
    figuresYear: 'Tax year 2025, the latest California has published',
    simplifies: 'The 2025 brackets and deduction are used for every later year without inflation adjustment, and itemized deductions are not modeled.',
    sources: ['ca-tax-rates', 'ca-standard-deduction', 'ca-military-exclusion', 'ca-early-distribution'],
  },
  {
    id: 'state-ny',
    title: 'New York, New York City and Yonkers',
    group: 'States',
    summary: `New York taxes income in its own brackets after a ${usd(NY_STD_DEDUCTION_SINGLE)} standard deduction (${usd(NY_STD_DEDUCTION_MFJ)} joint), and the brackets step down as the law schedules: in 2027 the five lowest rates each fall by a tenth of a point, the first from 3.9% to 3.8%, and in 2033 the top rate returns to 8.82%. Above ${usd(NY_RECAPTURE_AGI_FLOOR)} of New York income, the benefit of the lower brackets is gradually taken back. Social Security and government pensions are exempt, and from 59½ each person can exclude up to $20,000 of private pensions, IRA withdrawals and Roth conversions. New York City and Yonkers residents pay the local tax too, when you select it.`,
    figuresYear: TAX_YEAR,
    simplifies: 'The $20,000 exclusion is pooled between spouses who are both 59½ or older, and New York City\'s household and school tax credits are not modeled.',
    sources: ['ny-rate-schedule', 'ny-standard-deduction', 'ny-retired-persons', 'ny-roth-conversion-exclusion'],
  },
  {
    id: 'state-il',
    title: 'Illinois',
    group: 'States',
    summary: `Illinois taxes income at a flat 4.95% after an exemption of ${usd(IL_EXEMPTION_ALLOWANCE)} per person, plus ${usd(IL_EXEMPTION_AGE_65)} for each person 65 or older; the exemption disappears above ${usd(IL_EXEMPTION_AGI_LIMIT_SINGLE)} of federal income (${usd(IL_EXEMPTION_AGI_LIMIT_MFJ)} joint). Social Security, pensions, IRA and 401(k) withdrawals and Roth conversions are all exempt, at any age.`,
    figuresYear: TAX_YEAR,
    sources: ['il-income-tax-rate', 'il-exemption-2026', 'il-exemption-allowance', 'il-retirement-income'],
  },
  {
    id: 'state-co',
    title: 'Colorado',
    group: 'States',
    summary: 'Colorado taxes federal taxable income at a flat 4.4%. From 65 all Social Security is subtracted, and from 55 to 64 it is subtracted in full when income is under the state\'s limit. Pensions, IRA withdrawals and conversions from 59½, and Social Security, share one subtraction of $20,000 per person from 55 ($24,000 from 65), and military retirees under 55 can subtract up to $15,000.',
    figuresYear: TAX_YEAR,
    simplifies: 'One-year rate cuts that Colorado makes when it collects a surplus are not projected, and a joint return\'s Social Security is split evenly between spouses.',
    sources: ['co-retirement-income'],
  },
  {
    id: 'state-pa',
    title: 'Pennsylvania',
    group: 'States',
    summary: 'Pennsylvania taxes income at a flat 3.07%, with no standard deduction or exemption. Social Security and pensions are exempt, as are IRA and 401(k) withdrawals from 59½, and a Roth conversion is not taxed at any age. Your own 401(k) contributions while working are taxed as wages, because Pennsylvania does not exclude them.',
    figuresYear: TAX_YEAR,
    simplifies: 'An early withdrawal is taxed in full, where Pennsylvania taxes only the part above your own contributions.',
    sources: ['pa-tax-rates', 'pa-retirement-income', 'pa-401k-compensation'],
  },
  {
    id: 'state-va',
    title: 'Virginia',
    group: 'States',
    summary: `Virginia taxes income in brackets from 2% to 5.75% after a ${usd(VA_STD_DEDUCTION_SINGLE)} standard deduction (${usd(VA_STD_DEDUCTION_MFJ)} joint) and personal exemptions. Social Security is exempt. From 65 each person gets a ${usd(VA_AGE_DEDUCTION)} age deduction, reduced dollar for dollar as income other than Social Security passes $50,000 single or $75,000 married, and up to ${usd(VA_MILITARY_SUBTRACTION_CAP)} of military retirement pay per person is subtracted.`,
    figuresYear: TAX_YEAR,
    sources: ['va-income-tax'],
  },
  {
    id: 'state-wa',
    title: 'Washington',
    group: 'States',
    summary: `Washington taxes long-term capital gains at 7% above a standard deduction of ${usd(WA_CAPITAL_GAINS_STD_DEDUCTION)} that grows with inflation, plus 2.9% more on the part over ${usd(WA_CAPITAL_GAINS_ADDITIONAL_THRESHOLD)}; a married couple shares one deduction. Dividends, and gains inside 401(k)s and IRAs, are not taxed. From 2028 Washington also taxes income over ${usd(WA_INCOME_TAX_STD_DEDUCTION)} at 9.9%, one deduction per household, counting wages, pensions, IRA withdrawals and Social Security, and counting capital gains only above their own deduction. The capital gains tax is credited against the income tax, so a household pays whichever of the two is larger. Choose Washington as your state income tax jurisdiction to include both; the no-income-tax choice leaves them out.`,
    figuresYear: 'The 2025 capital gains deduction, the latest Washington has published',
    simplifies: `Every realized gain is treated as long-term, and the charitable deductions are not modeled. The income tax's ${usd(WA_INCOME_TAX_STD_DEDUCTION)} deduction stays fixed through 2029 and then rises by one year of inflation every second year, as the law is written.`,
    sources: ['wa-capital-gains-tax', 'wa-capital-gains-tiered', 'wa-capital-gains-deduction', 'wa-income-tax', 'wa-income-tax-law'],
  },

  {
    id: 'basis-first-death',
    title: 'Cost basis when the first spouse dies',
    group: 'Estate and inheritance',
    summary: 'When the first spouse in a couple dies, what they owned in the taxable account takes a new cost basis equal to its market value that year, so the survivor\'s later sales show less gain. Held jointly, half is reset; in one spouse\'s name, all of it if that spouse dies first and none if the other does. In a community-property state all of it is reset. Concentrated stock positions follow the same rule; Pre-Tax accounts never get a new basis. At the second death heirs get a full reset.',
    figuresYear: 'Set in law, not adjusted for inflation',
    simplifies: 'Death is taken to fall at the start of its year. The plan never holds the taxable account below its cost basis, so the law\'s step-down for a loss does not arise. Community property follows the state you live in that year, so property brought from a common-law state, California\'s quasi-community property and opt-in community-property trusts are not modeled; years abroad use the jointly-held rule.',
    sources: ['basis-at-death'],
  },

  // --- Planning assumptions -------------------------------------------
  {
    id: 'ss-trust-fund',
    title: 'Social Security trust fund stress test',
    group: 'Planning assumptions',
    summary: `An optional stress test cuts every Social Security benefit from a chosen year onward, to show what happens if the trust fund runs out before Congress acts. Its defaults, a ${SS_CUT_PERCENT_DEFAULT}% cut from ${SS_DEPLETION_YEAR_DEFAULT}, come from the Trustees' latest projection that the retirement trust fund is depleted in ${SS_DEPLETION_YEAR_DEFAULT} and that income then pays ${100 - SS_CUT_PERCENT_DEFAULT}% of scheduled benefits. It is off unless you turn it on.`,
    figuresYear: '2026 Trustees Report',
    sources: ['ssa-trustees-2026'],
  },
];

export const howFiguredRule = (id) => HOW_FIGURED_RULES.find((r) => r.id === id) || null;
