// Spreadsheet-formula neutralization for every CSV the app writes. Lives in
// the host because the year-ledger export needs it with no Premium module
// loaded; the holdings CSV export re-exports it from here.
//
// CSV injection (A29): a spreadsheet runs a cell that starts with = + - @
// (or a tab / carriage return) as a formula, so a holding named
// "=HYPERLINK(...)" would execute when the export is opened. Such text cells
// get a leading apostrophe, which spreadsheets treat as "this is text".
// Numbers -- including a negative number, and a numeric string like "-12.5"
// -- are left alone so they stay numbers.
const FORMULA_START = /^[=+\-@\t\r]/;
const NUMERIC_TEXT = /^[-+]?(\d[\d,]*(\.\d*)?|\.\d+)(e[-+]?\d+)?%?$/i;
export function neutralizeFormula(value) {
  if (typeof value !== 'string') return value;
  if (!FORMULA_START.test(value) || NUMERIC_TEXT.test(value.trim())) return value;
  return `'${value}`;
}
