// The textbook test: a plain portfolio-and-spending replay with no taxes,
// benefits or fees, the way FI Calc and the 4% rule research run it.
import { describe, it, expect } from 'vitest';
import { runTextbookTest, textbookStartYears } from '../utils/textbookTest';

const classic = { balance: 1000000, spending: 40000, years: 30, firstYear: 1928, stockShare: 60, glideEnabled: false };

describe('runTextbookTest', () => {
  it('tests every start with a full horizon in the record', () => {
    const r = runTextbookTest(classic);
    expect(r.count).toBe(textbookStartYears(30, 1928).length);
    expect(r.firstStart).toBe(1928);
    expect(r.lasted + r.failed.length).toBe(r.count);
    expect(r.rate).toBeCloseTo(0.04, 9);
  });

  it('a 60/40 portfolio at 4% for 30 years lasts in almost every start since 1928 (the 4% rule)', () => {
    const r = runTextbookTest(classic);
    expect(r.lasted / r.count).toBeGreaterThan(0.9);
    // About 3.8% with 10-year Treasuries as the bonds and withdrawals at the
    // start of each year (the independent check in the DIY-planner review
    // found $35,253 plus Medicare, about $38,200, for the same plan).
    expect(r.safeMaxRate).toBeGreaterThan(0.035);
    expect(r.safeMaxRate).toBeLessThan(0.05);
  });

  it('the SAFEMAX lasts in every start, and $100 more does not', () => {
    const r = runTextbookTest(classic);
    expect(runTextbookTest({ ...classic, spending: r.safeMax }).lasted).toBe(r.count);
    expect(runTextbookTest({ ...classic, spending: r.safeMax + 100 }).lasted).toBeLessThan(r.count);
  });

  it('spending more lasts in fewer starts; spending nothing lasts in all', () => {
    expect(runTextbookTest({ ...classic, spending: 60000 }).lasted).toBeLessThan(runTextbookTest(classic).lasted);
    expect(runTextbookTest({ ...classic, spending: 0 }).lasted).toBe(runTextbookTest(classic).count);
  });

  it('reaches back to 1871 when asked', () => {
    const r = runTextbookTest({ ...classic, firstYear: 1871 });
    expect(r.firstStart).toBe(1871);
    expect(r.count).toBe(textbookStartYears(30, 1871).length);
  });

  it('first-year spending is taken before the return, and grows by the previous year\'s inflation', () => {
    // One year, all bonds: what is left is (balance - spending) x (1 + bond return).
    const one = runTextbookTest({ balance: 1000, spending: 1000.01, years: 1, firstYear: 1928, stockShare: 0 });
    expect(one.lasted).toBe(0);
    expect(runTextbookTest({ balance: 1000, spending: 1000, years: 1, firstYear: 1928, stockShare: 0 }).lasted).toBe(one.count);
  });
});
