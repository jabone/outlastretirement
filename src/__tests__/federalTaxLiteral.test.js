// Literal-value federal tax checks against the 2026 schedule (Rev. Proc.
// 2025-32, as TAX_RULES_SPEC Rule 2.1 tabulates it). Every other tax test
// compares the engine with itself; these pin the arithmetic to figures
// worked by hand, so a bracket edit that keeps the engine self-consistent
// but wrong still fails.
import { describe, it, expect } from 'vitest';
import { calculateTaxes, calculateCapitalGainsTaxes } from '../calculator';

describe('2026 federal income tax, worked by hand', () => {
  it('MFJ, $150,000 of ordinary taxable income', () => {
    // 10% to 24,800 = 2,480; 12% to 100,800 = 9,120; 22% on 49,200 = 10,824.
    expect(calculateTaxes(150000, 'MFJ')).toBeCloseTo(22424, 2);
  });
  it('Single, $100,000', () => {
    // 10% to 12,400 = 1,240; 12% to 50,400 = 4,560; 22% on 49,600 = 10,912.
    expect(calculateTaxes(100000, 'Single')).toBeCloseTo(16712, 2);
  });
  it('Single, $500,000 reaches the 35% bracket', () => {
    // ... 22% to 105,700 = 12,166; 24% to 201,775 = 23,058; 32% to 256,225
    // = 17,424; 35% on 243,775 = 85,321.25.
    expect(calculateTaxes(500000, 'Single')).toBeCloseTo(1240 + 4560 + 12166 + 23058 + 17424 + 85321.25, 2);
  });
  it('MFJ, $1,000,000 reaches the 37% bracket', () => {
    // 2,480 + 9,120 + 24,332 (22% on 110,600) + 46,116 (24% on 192,150)
    // + 34,848 (32% on 108,900) + 89,687.50 (35% on 256,250) + 85,581
    // (37% on 231,300).
    expect(calculateTaxes(1000000, 'MFJ')).toBeCloseTo(2480 + 9120 + 24332 + 46116 + 34848 + 89687.5 + 85581, 2);
  });
  it('the brackets index by the factor given', () => {
    expect(calculateTaxes(150000 * 1.1, 'MFJ', 1.1)).toBeCloseTo(22424 * 1.1, 2);
  });
  it('MFJ long-term gains straddling the 0% band', () => {
    // 2026 MFJ 0% band to $98,900 of taxable income. $60,000 ordinary
    // taxable + $60,000 of gains: 38,900 at 0%, 21,100 at 15% = 3,165.
    expect(calculateCapitalGainsTaxes(60000, 60000, 'MFJ')).toBeCloseTo(3165, 2);
  });
});
