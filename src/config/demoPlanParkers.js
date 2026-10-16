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
//
// The lessons load this household with /app/?demo=parkers (demoDeepLink.js).
import { DEFAULT_INPUTS, INPUTS_SCHEMA_VERSION, TAX_YEAR } from '../calculator';
import { FULL_BACKUP_VERSION } from '../utils/fullBackup';

export function buildParkersInputs() {
  return {
    ...DEFAULT_INPUTS,
    planYear: TAX_YEAR,

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
  };
}
