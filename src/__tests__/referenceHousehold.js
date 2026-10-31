// The engine's reference household: the app's default plan as it stood
// before What's New 467, when the defaults gained a Medicare supplement and
// out-of-pocket line ($4,500 a person) and a 6%-of-pay cap on the employer
// match, and the sample saver's contributions and spending moved so the
// plan still lasts; and before 469, when five more defaults moved (below). The many "this feature is inert for the default plan"
// tests pin figures from the household as it was, so they test against
// this copy, which ends with $36,762.24.
import { DEFAULT_INPUTS } from '../calculator';

export const REFERENCE_INPUTS = Object.freeze({
  ...DEFAULT_INPUTS,
  employerMatchCapPayPct1: 0,
  employerMatchCapPayPct2: 0,
  medicareSupplementCost: 0,
  preTaxContribution1: 7000,
  rothContribution1: 2000,
  lifestyleExpense: 48000,
  // And before What's New 469: a typed pre-65 bridge, no spousal top-up,
  // a 2% COLA on pension 1, an annuity indexed from the first year.
  healthcareBridgeSource: 'manual',
  ssSpousalEnabled1: false,
  ssSpousalEnabled2: false,
  pension1COLA: 2.0,
  annuityIncomeIndexed: true,
  annuityIncomeStartAge: 0,
  // And before 470: the couple's budget held after one death in the plan.
  survivorExpenseDropInPlan: false,
});

export const REFERENCE_ENDING_BALANCE = 36762.2363;
