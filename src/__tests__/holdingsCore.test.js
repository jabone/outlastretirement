// holdingsCore.js is the startup slice of the Detailed Holdings model
// (review 2026-09-30, H3). portfolioHoldings.js re-exports it, so both
// import paths must hand out the very same functions and constants.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as core from '../utils/holdingsCore';
import * as holdings from '../utils/portfolioHoldings';

describe('holdingsCore', () => {
  it('everything it exports is the same object through portfolioHoldings', () => {
    const shared = Object.keys(core).filter((k) => k in holdings);
    expect(shared.length).toBeGreaterThan(30);
    for (const k of shared) expect(holdings[k], k).toBe(core[k]);
  });
  it('carries what the app computes from holdings at startup', () => {
    for (const k of ['computeBucketTotals', 'computeTaxableCostBasis', 'computeTaxableDistributionYield', 'computeCashReserveFromHoldings', 'computeConcentratedStockLinkValues', 'canSyncFromHoldings', 'unlinkedBalanceGap', 'sanitizeImportedHoldings', 'sanitizeImportedLiquidations']) {
      expect(typeof core[k], k).toBe('function');
    }
  });
  it('never imports portfolioHoldings (that would pull it back onto the startup path)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../utils/holdingsCore.js'), 'utf8');
    expect(src).not.toMatch(/from '\.\/portfolioHoldings/);
  });
});
