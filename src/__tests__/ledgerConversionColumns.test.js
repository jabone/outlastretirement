// Roth conversion columns in the Year by Year ledger and the CSV
// (changelog 189).
//
// The engine has always published convertAmount, convertAmountTaxable and
// conversionTaxCost, and the charts have drawn the tax since well before
// this. The ledger -- the surface people open specifically to check the
// arithmetic -- showed none of them.
//
// These tests pin the three relationships the column tooltips assert, so
// the explanation on screen cannot drift away from what the engine does.
import { describe, it, expect } from 'vitest';
import { runProjection } from '../calculator';
import { buildDemoInputs } from '../config/demoPlan';
import { YEAR_LEDGER_CSV_HEADERS, buildYearLedgerCsvRows } from '../utils/yearLedgerCsv';

const demo = buildDemoInputs();
const projection = runProjection(demo);
const converting = projection.years.filter(y => y.convertAmount > 0);

describe('the engine publishes what the conversion columns render', () => {
  it('the demo household actually converts, so these tests are not vacuous', () => {
    // Guards the whole file: if the demo stopped converting, every
    // assertion below would pass over an empty array and prove nothing.
    expect(converting.length).toBeGreaterThan(5);
  });

  it('every conversion field is a real row field, not a typo', () => {
    // A misspelled key reads as undefined and compares as "equal" to
    // another undefined, which is how vacuous green tests happen here.
    const row = projection.years[10];
    for (const k of ['convertAmount', 'convertAmountTaxable', 'conversionTaxCost']) {
      expect(Object.prototype.hasOwnProperty.call(row, k)).toBe(true);
    }
  });
});

describe('the column tooltips tell the truth', () => {
  it('"Taxable Part" never exceeds the amount converted', () => {
    // The pro-rata rule can only make the taxable share SMALLER than the
    // conversion (basis comes across tax-free), never larger.
    for (const y of converting) {
      expect(y.convertAmountTaxable).toBeLessThanOrEqual(y.convertAmount + 1);
    }
  });

  it('after-tax basis makes the taxable part strictly smaller', () => {
    // The demo carries basis from Backdoor Roth contributions, so at least
    // one year must show a gap. Without this, the assertion above would be
    // satisfied by the two figures being identical in every year.
    const withBasis = converting.filter(y => y.convertAmountTaxable < y.convertAmount - 1);
    expect(withBasis.length).toBeGreaterThan(0);
  });

  it('"Conv Tax" is inside Taxes Paid, not on top of it', () => {
    for (const y of converting) {
      expect(y.conversionTaxCost).toBeLessThanOrEqual(y.totalTaxesPaid + 1);
    }
  });

  it('the full conversion lands in the Roth — nothing is withheld for tax', () => {
    // This is the claim the tooltip and the Guide both make, and the reason
    // the tax has to be funded from somewhere else.
    for (const y of converting) {
      const rothRise = y.rothEnd - y.rothStart + (y.drawRoth || 0);
      expect(rothRise).toBeGreaterThanOrEqual(y.convertAmount - 1);
    }
  });

  it('a plan that converts nothing produces no conversion figures', () => {
    // The columns are gated on the projection, so a non-converting plan
    // must genuinely have nothing to show.
    const none = runProjection({ ...demo, rothConversionStrategy: 'none' });
    expect(none.years.every(y => (y.convertAmount || 0) === 0)).toBe(true);
  });
});

describe('the withdrawal strategy is what funds the conversion tax', () => {
  it('drawing Pre-Tax first converts materially less than drawing Taxable first', () => {
    // The coupling the Guide and Input Dictionary now disclose. Nothing is
    // withheld from the conversion, so the tax rides on withdrawalStrategy
    // — and Pre-Tax draws also consume the bracket headroom a max-bracket
    // conversion was going to fill.
    const sum = (p) => p.years.reduce((t, y) => t + (y.convertAmount || 0), 0);
    const taxableFirst = sum(runProjection({ ...demo, withdrawalStrategy: 'TaxableFirst' }));
    const preTaxFirst = sum(runProjection({ ...demo, withdrawalStrategy: 'PreTaxFirst' }));
    expect(taxableFirst).toBeGreaterThan(0);
    expect(preTaxFirst).toBeLessThan(taxableFirst * 0.75);
  });
});

describe('the CSV carries the same three figures as the table', () => {
  it('has a header for each conversion column, and they line up with the cells', () => {
    const rows = buildYearLedgerCsvRows(projection);
    expect(rows[0].length).toBe(YEAR_LEDGER_CSV_HEADERS.length);

    const iAmt = YEAR_LEDGER_CSV_HEADERS.indexOf('Roth Conversion');
    const iTax = YEAR_LEDGER_CSV_HEADERS.indexOf('Roth Conversion Taxable');
    const iCost = YEAR_LEDGER_CSV_HEADERS.indexOf('Roth Conversion Tax');
    expect(iAmt).toBeGreaterThan(-1);
    expect(iTax).toBeGreaterThan(-1);
    expect(iCost).toBeGreaterThan(-1);

    // Values must match the projection row at the same index, which is what
    // catches a header added without its cell (or vice versa) shifting the
    // whole file by one column.
    const idx = projection.years.findIndex(y => y.convertAmount > 0);
    const y = projection.years[idx];
    expect(rows[idx][iAmt]).toBe(Math.round(y.convertAmount));
    expect(rows[idx][iTax]).toBe(Math.round(y.convertAmountTaxable));
    expect(rows[idx][iCost]).toBe(Math.round(y.conversionTaxCost));
  });
});

// The CSV's Salary column is pay alone, as on screen; stock vesting and
// deferred-comp payouts have their own columns (the engine's row `salary`
// carries all three).
describe('ledger CSV splits pay, stock vesting and deferred comp', () => {
  const proj = runProjection(buildDemoInputs());
  const rows = buildYearLedgerCsvRows(proj);
  const col = (name) => YEAR_LEDGER_CSV_HEADERS.indexOf(name);
  it('has the two columns after the older ones, HSA general spending last, 43 in all', () => {
    expect(YEAR_LEDGER_CSV_HEADERS).toHaveLength(43);
    expect(YEAR_LEDGER_CSV_HEADERS.slice(-4, -2)).toEqual(['Stock vesting', 'Deferred comp payout']);
    expect(YEAR_LEDGER_CSV_HEADERS.slice(-2)).toEqual(['HSA for general spending', 'HSA general spending tax']);
  });
  it('Salary + Stock vesting + Deferred comp payout = the engine\'s salary, and a payout year is not salary', () => {
    const payoutYears = proj.years.filter((y) => (y.nqdcDistribution1 || 0) + (y.nqdcDistribution2 || 0) > 0);
    expect(payoutYears.length).toBeGreaterThan(0);
    proj.years.forEach((y, i) => {
      const r = rows[i];
      expect(Math.abs(r[col('Salary')] + r[col('Stock vesting')] + r[col('Deferred comp payout')] - y.salary)).toBeLessThanOrEqual(2);
    });
    const i = proj.years.indexOf(payoutYears[payoutYears.length - 1]);
    expect(rows[i][col('Deferred comp payout')]).toBe(Math.round((proj.years[i].nqdcDistribution1 || 0) + (proj.years[i].nqdcDistribution2 || 0)));
    expect(rows[i][col('Salary')]).toBeLessThan(Math.round(proj.years[i].salary));
  });
});
