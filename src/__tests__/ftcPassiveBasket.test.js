// Changelog 365: the passive basket's room now counts the dividends the US
// taxes at ordinary rates, not only preferential-rate dividends and gains.
import { describe, it, expect } from 'vitest';
import { priceForeignYear, readForeignTerms } from '../calculator';

const ctxOf = (f, over = {}) => ({
  f: readForeignTerms(f), inflFactor: 1, fxFactor: 1, wages: 0, pension: 0, iraBase: 0,
  rentalAnnuity: 0, ssGross: 0, dividends: 0, ordinaryDividends: 0, rothStart: 0, dividendYield: 0,
  cf: { general: 0, passive: 0 }, adults: 1, yearsSinceMove: 0, preTaxStart: 0, taxableStart: 0, ...over,
});
const draw = (over = {}) => ({
  preTaxOrdinary: 0, realizedGains: 0, rothDraw: 0, rothEarnings: 0,
  usRegularTax: 0, usOrdinaryIncome: 0, usCapGains: 0, usCapGainsTax: 0, usTaxableSS: 0, ...over,
});
const terms = { ordinaryRate: 30, investmentRate: 20, roth: 'respect', treatyResourcing: true };

describe('the passive basket', () => {
  it('ordinary-rate dividends make passive room under a re-sourcing treaty', () => {
    // $20,000 of non-qualified dividends: the US charges $2,000 on them,
    // the country 20% = $4,000. Up to the US $2,000 is creditable.
    const p = priceForeignYear(ctxOf(terms, { dividends: 20000, ordinaryDividends: 20000 }),
      draw({ usRegularTax: 2000, usOrdinaryIncome: 20000 }));
    expect(p.creditable.passive).toBeCloseTo(4000, 6);
    expect(p.credit.passive).toBeCloseTo(2000, 6);
  });

  it('without the treaty there is still no passive room (US-source dividends)', () => {
    const p = priceForeignYear(ctxOf({ ...terms, treatyResourcing: false }, { dividends: 20000, ordinaryDividends: 20000 }),
      draw({ usRegularTax: 2000, usOrdinaryIncome: 20000 }));
    expect(p.credit.passive).toBe(0);
  });

  it('passive tax still never shelters the general basket', () => {
    // A $50,000 pension and $20,000 of dividends: the passive credit is
    // capped at the dividends' share of US tax, whatever the pension owes.
    const p = priceForeignYear(ctxOf(terms, { pension: 50000, dividends: 20000, ordinaryDividends: 20000 }),
      draw({ usRegularTax: 7000, usOrdinaryIncome: 70000 }));
    expect(p.credit.passive).toBeLessThanOrEqual(7000 * (20000 / 70000) + 1e-6);
  });
});
