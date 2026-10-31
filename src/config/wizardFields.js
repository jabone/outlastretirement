// The Quick Setup Wizard's field list (changelog 257). Each step of the
// wizard in App.jsx renders one of the Plan's own sections inside
// <GuidedSection only={...}>, which hides every control whose key is not
// named here -- spouse-agnostic, as GUIDED_CORE_KEYS is, so `birthYear`
// covers birthYear1 and birthYear2. The wizard owns no fields of its own;
// this is the one place that says what a two-minute first pass asks for.
export const WIZARD_FIELDS = Object.freeze({
  // The state is asked up front (changelog 467): choosing it sets the state
  // tax jurisdiction, so a plan built here is taxed by its own state.
  household: ['spouse1Name', 'birthYear', 'retireAge', 'stateOfResidence', 'spouse2Enabled', 'spouse2Name'],
  salaries: ['salary'],
  income: ['ss', 'militaryPension', 'pension'],
  balances: ['preTaxInit', 'rothInit', 'taxableInit'],
  spending: ['lifestyleExpense'],
  savings: ['preTaxContribution', 'rothContribution', 'taxableContribution'],
});

export const WIZARD_KEYS = Object.freeze([...new Set(Object.values(WIZARD_FIELDS).flat())]);
