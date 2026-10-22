// The teaching household: Ray & Angie Parker.
//
// A second, deliberately ORDINARY fictional household, used by the Learn
// lessons (the education strategy of 2026-10-05). The Carters
// (config/demoPlan.js) exist to exercise every feature: stock grants, two
// pensions, New York's estate line. A beginner does not see themselves in a
// $245,000 salary. The Parkers are a late-start couple on ordinary wages
// with one account type, a mortgage and no pension, so lesson 1 has nothing
// to explain before it can ask "will the money last?".
//
// EVERY NAME AND NUMBER IN THIS FILE IS INVENTED, under the same rule as the
// Carters: nothing here is, or is derived from, a real person's plan.
//
// The story the numbers are tuned to tell (demoPlanParkers.test.js pins it,
// so a tax-year or engine change that moves it fails a test and the lessons
// that quote it get re-checked in the same sitting):
//   - As planned, both stop working the year Ray turns 65 and the savings
//     run out when Ray is 82.
//   - Each of three changes buys years by itself: work two more years, spend
//     $500 a month less in retirement, save $500 a month more now.
//   - All three together and the plan lasts on average and in about four of
//     five simulated markets ("Mostly on track").
//   - Waiting longer for Social Security on top of that reaches "On track".
//   - Stopping at 62 instead runs out when Ray is 67.
//   - Lesson 7: Ray's plan (keep spending, both work two more years) and
//     Angie's (stop on time, $750 a month less), each also saving $500 a
//     month more, both last on average.
//
// The lessons load this household with /app/?demo=parkers (demoDeepLink.js).
import { DEFAULT_INPUTS, INPUTS_SCHEMA_VERSION, TAX_YEAR } from '../calculator';
import { FULL_BACKUP_VERSION } from '../utils/fullBackup';

export function buildParkersInputs() {
  return {
    ...DEFAULT_INPUTS,
    planYear: TAX_YEAR,
    // A fictional 2026 household whose story (and the Learn lessons'
    // pictures) is fixed: the plan's own COLA assumption every year, not
    // SSA's announced figures (changelog 410).
    ssColaAnnounced: false,
    // Likewise pinned: the brokerage yield stays 100% qualified, as the
    // lessons' pictures were drawn (changelog 414).
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
    // And the standard deduction every year (changelog 417).
    itemizeDeductions: 'never',

    // -- Who they are ------------------------------------------------------
    spouse1Name: 'Ray',
    spouse2Name: 'Angie',
    spouse2Enabled: true,
    filingStatus: 'MFJ',
    birthYear1: TAX_YEAR - 54,   // Ray, 54 -- warehouse supervisor
    birthYear2: TAX_YEAR - 52,   // Angie, 52 -- school front office
    retireAge1: 65,
    retireAge2: 63,              // the same year Ray stops
    lifeExpectancy1: 92,
    lifeExpectancy2: 94,

    // -- Income ------------------------------------------------------------
    salary1: 62000,
    salary2: 38000,
    ss1: 25000,                  // at full retirement age
    ss2: 17000,
    claimingAge1: 65,            // each claims when the paycheck stops
    claimingAge2: 63,

    // -- Balances: two 401(k)s and a savings account ------------------------
    preTaxInit: 150000,
    rothInit: 0,
    taxableInit: 9000,
    hsaInit: 0,

    // -- Contributions: about 6% and 4% of pay. Ray's employer matches half
    // of what he puts in (the default match rule for spouse 1).
    preTaxContribution1: 3700,
    preTaxContribution2: 1500,
    rothContribution1: 0,
    rothContribution2: 0,
    taxableContribution: 0,

    // -- Spending ----------------------------------------------------------
    // Today's spending is left on Auto: what is left of two paychecks after
    // tax and savings, with the mortgage paid out of it. In retirement they
    // plan on $46,000 a year in today's dollars, plus the mortgage until it
    // is paid off and health insurance until Medicare.
    lifestyleExpense: 46000,

    // -- Home --------------------------------------------------------------
    // Eleven years left on the mortgage: the last payment falls about when
    // Ray stops working.
    homeOwned: true,
    homeValueInit: 260000,
    mortgageBalance: 95000,
    mortgageRate: 4.5,
    mortgagePayment: 10970,

    // -- Taxes: a state with no income tax keeps tax out of the first path.
    stateOfResidence: 'TX',
    stateTaxState: 'none',
  };
}

// Saved scenarios. Each differs from the plan by exactly the change in its
// name, so a lesson can open one beside the plan and read the difference.
const WORK_TWO_MORE = { retireAge1: 67, retireAge2: 65, claimingAge1: 67, claimingAge2: 65 };
const SPEND_LESS = 6000;  // $500 a month, in retirement
const SAVE_MORE = 6000;   // $500 a month, into Ray's 401(k), from now
const TRIM_TRAVEL = 9000; // $750 a month, in retirement (Angie's plan)

export const PARKERS_SCENARIO_DEFS = [
  {
    name: 'Demo: Work two more years',
    mutate: (i) => ({ ...i, ...WORK_TWO_MORE }),
  },
  {
    name: 'Demo: Spend $500 a month less in retirement',
    mutate: (i) => ({ ...i, lifestyleExpense: i.lifestyleExpense - SPEND_LESS }),
  },
  {
    name: 'Demo: Save $500 a month more',
    mutate: (i) => ({ ...i, preTaxContribution1: i.preTaxContribution1 + SAVE_MORE }),
  },
  {
    name: 'Demo: All three changes together',
    mutate: (i) => ({
      ...i, ...WORK_TWO_MORE,
      lifestyleExpense: i.lifestyleExpense - SPEND_LESS,
      preTaxContribution1: i.preTaxContribution1 + SAVE_MORE,
    }),
  },
  {
    // The bridge into the next path ("When should I claim Social
    // Security?"): the same three changes, with the claims delayed.
    name: 'Demo: All three, and wait longer for Social Security',
    mutate: (i) => ({
      ...i, ...WORK_TWO_MORE, claimingAge1: 70, claimingAge2: 67,
      lifestyleExpense: i.lifestyleExpense - SPEND_LESS,
      preTaxContribution1: i.preTaxContribution1 + SAVE_MORE,
    }),
  },
  {
    name: 'Demo: Stop working at 62 instead',
    mutate: (i) => ({ ...i, retireAge1: 62, retireAge2: 60, claimingAge1: 62, claimingAge2: 62 }),
  },
  // Two plans built from the Parkers' own answers to lesson 7's three
  // questions (Learn, "What do you want your retirement to do?") and the
  // "Your three answers" notes (changelogs 453-454). The answers and levers
  // are the lesson's slides 4 and 5. Each also saves the extra $500 a month
  // from lesson 6, so the two match year for year until Ray turns 65 and
  // then drift apart; without it, neither lasts on average.
  {
    // Ray: keep today's lifestyle, pay for it with two more years of work.
    name: "Demo: Ray's plan: keep spending, work to 67",
    mutate: (i) => ({
      ...i, ...WORK_TWO_MORE,
      preTaxContribution1: i.preTaxContribution1 + SAVE_MORE,
    }),
    answers: {
      maximize: 'Keep spending what we spend now',
      protect: 'Running out in our 80s',
      giveUp: 'Work two more years',
    },
  },
  {
    // Angie: protect the house, pay for it with less travel.
    name: "Demo: Angie's plan: protect the house, trim travel",
    mutate: (i) => ({
      ...i,
      lifestyleExpense: i.lifestyleExpense - TRIM_TRAVEL,
      preTaxContribution1: i.preTaxContribution1 + SAVE_MORE,
    }),
    answers: {
      maximize: 'Leave the house to the kids',
      protect: 'A care bill wiping us out',
      giveUp: 'Trim travel, not the house',
    },
  },
];

export function buildParkersBackupPayload() {
  return {
    version: FULL_BACKUP_VERSION,
    schemaVersion: INPUTS_SCHEMA_VERSION,
    timestamp: null, // stamped at load time, as for the Carters
    isDemoPlan: true,
    activeInputs: buildParkersInputs(),
    savedScenarios: [], // filled by demoPayload.js
    portfolioHoldings: [],
    liquidations: [],
    estateChecklist: {},
    // The current plan's three answers start blank (a visitor's own never
    // show through); the two lesson 7 plan scenarios carry theirs.
    planAnswers: {},
  };
}
