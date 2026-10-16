import { describe, it, expect } from 'vitest';
import { findTargetPortfolioSize } from '../calculator';

describe('Regression Tests: Target Portfolio Size', () => {
  it('should find the required starting portfolio to survive retirement', () => {
    const inputs = {
      currentAge1: 60,
      retireAge1: 65,
      lifeExpectancy1: 90,
      spouse2Enabled: false,
      preTaxInit: 100000,
      rothInit: 50000,
      taxableInit: 50000,
      lifestyleExpense: 100000,
      inflationRate: 0.03,
      growthRate: 0.06,
      socialSecurityEnabled: false, // simplified scenario
      otherIncomeEnabled: false,
      pensionEnabled: false,
      annuityEnabled: false,
      realEstateEnabled: false,
      businessIncomeEnabled: false,
    };

    // Fund target method: 'taxable'
    const resultTaxable = findTargetPortfolioSize(inputs, 65, 65, 100000, 'taxable');
    expect(resultTaxable).toBeDefined();
    expect(resultTaxable.targetPortfolio).toBeDefined();
    expect(resultTaxable.targetPortfolio.preTax).toBe(100000); // Fixed
    expect(resultTaxable.targetPortfolio.roth).toBe(50000); // Fixed
    expect(resultTaxable.targetPortfolio.taxable).toBeGreaterThan(50000); // Adjusted to find success
    expect(resultTaxable.projection.isSuccessful).toBe(true);
    expect(resultTaxable.projection.endingBalance).toBeGreaterThanOrEqual(0);

    // Fund target method: 'proportional'
    const resultProportional = findTargetPortfolioSize(inputs, 65, 65, 100000, 'proportional');
    expect(resultProportional).toBeDefined();
    expect(resultProportional.targetPortfolio).toBeDefined();
    
    // Total portfolio should be greater than initial balances to support $100k/year for 25 years w/ 3% inflation and 6% growth
    expect(resultProportional.targetPortfolio.total).toBeGreaterThan(1000000);
    expect(resultProportional.projection.isSuccessful).toBe(true);
    expect(resultProportional.projection.endingBalance).toBeGreaterThanOrEqual(0);
  });
});
