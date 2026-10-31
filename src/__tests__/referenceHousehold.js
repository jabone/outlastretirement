// The engine's reference household: the app's default plan as it stood
// before What's New 467, when the defaults gained a Medicare supplement and
// out-of-pocket line ($4,500 a person) and a 6%-of-pay cap on the employer
// match, and the sample saver's contributions and spending moved so the
// plan still lasts. The many "this feature is inert for the default plan"
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
});

export const REFERENCE_ENDING_BALANCE = 36762.2363;
