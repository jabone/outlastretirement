// utils/taxVisualizerData.js: the Tax & Estate bracket chart.
//
// Two defects this pins. The income stack was rebuilt in the UI from the
// inputs and stood above a standard-deduction block, so it disagreed with
// the engine's own ordinary income in every year of the demo (by up to a
// whole deduction). And under Today's Dollars the bars were converted while
// the bracket and IRMAA lines were not, so a bar and the line it was
// measured against were in different dollars.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, IRMAA_THRESHOLDS_SINGLE, IRMAA_THRESHOLDS_MFJ } from '../calculator';
import { relevantIrmaaTiers } from '../utils/relevantTaxBrackets';
import { buildDemoInputs } from '../config/demoPlan';
import { deflateProjectionForDisplay, yearFactor } from '../utils/displayDollars';
import { buildTaxVisualizerData } from '../utils/taxVisualizerData';
import { TAX_INCOME_SERIES } from '../config/taxIncomeSeries';

const raw = runProjection(buildDemoInputs());
const today = buildTaxVisualizerData(deflateProjectionForDisplay(raw, true).years, true);
const future = buildTaxVisualizerData(raw.years, false);

describe('the income stack is the engine’s ordinary income', () => {
  it('the layers add up to the engine’s gross ordinary income in every year', () => {
    let off = 0;
    raw.years.forEach((y, i) => {
      const row = future[i];
      const stack = TAX_INCOME_SERIES.reduce((t, s) => t + (row[s.key] || 0), 0);
      expect(stack).toBeCloseTo(row.totalOrdinaryGross, 4);
      if (y.ordinaryTaxableIncome > 0 && Math.abs(row.totalOrdinaryGross - (y.ordinaryTaxableIncome + y.stdDeduction)) > 1) off += 1;
    });
    expect(off).toBe(0);
    expect(raw.years.filter((y) => y.ordinaryTaxableIncome > 0).length).toBeGreaterThan(30);
  });

  it('splits stock vesting and deferred-comp payouts out of wages', () => {
    const vest = future.filter((r) => r.stockVesting > 0).length;
    const nqdc = future.filter((r) => r.deferredComp > 0).length;
    expect(vest).toBeGreaterThan(0);
    expect(nqdc).toBeGreaterThan(0);
  });
});

describe('lines and bars share one basis', () => {
  it('bracket lines convert with the bars under Today’s Dollars', () => {
    let checked = 0;
    raw.years.forEach((y, i) => {
      const f = yearFactor(y);
      // The bracket width above the deduction, converted the same way.
      expect(today[i].limit22 - today[i].stdDeduction).toBeCloseTo((future[i].limit22 - future[i].stdDeduction) / f, 4);
      expect(today[i].irmaaTier1).toBeCloseTo(future[i].irmaaTier1 / f, 4);
      expect(today[i].totalOrdinaryGross).toBeCloseTo(future[i].totalOrdinaryGross / f, 4);
      checked += 1;
    });
    expect(checked).toBe(raw.years.length);
    expect(yearFactor(raw.years[raw.years.length - 1])).toBeGreaterThan(1.5);
  });
});

// A married-filing-separately plan draws the MFS IRMAA schedule, per return
// (the MFJ/Single tables were used before). Living together is the
// compressed two-tier schedule: tiers 1-3 do not exist (null, not drawn).
describe('IRMAA lines for a separate return', () => {
  const START = DEFAULT_INPUTS.planYear;
  const mfs = (together) => ({
    ...DEFAULT_INPUTS, filingStatus: 'MFS', mfsLivedWithSpouse: together, spouse2Enabled: true,
    birthYear1: START - 66, birthYear2: START - 66, retireAge1: 60, retireAge2: 60, salary1: 0, salary2: 0,
  });
  it('living together: 109,000 per return at tier 4, tiers 1-3 absent, labeled per return', () => {
    const rows = buildTaxVisualizerData(runProjection(mfs(true)).years, false, { mfsLivedWithSpouse: true });
    const first = rows[0];
    expect(first.irmaaPerReturn).toBe(true);
    expect(first.irmaaTier1).toBeNull();
    expect(first.irmaaTier3).toBeNull();
    expect(first.irmaaTier4).toBe(109000);
    expect(first.irmaaTier5).toBe(391000);
    expect(relevantIrmaaTiers(rows).irmaaTier4).toBe(true);
  });
  it('living apart: the single schedule, per return', () => {
    const first = buildTaxVisualizerData(runProjection(mfs(false)).years, false, { mfsLivedWithSpouse: false })[0];
    expect(first.irmaaPerReturn).toBe(true);
    expect(first.irmaaTier1).toBe(IRMAA_THRESHOLDS_SINGLE[0]);
  });
  it('a joint return keeps the joint schedule, not per return', () => {
    expect(future[0].irmaaTier1).toBe(IRMAA_THRESHOLDS_MFJ[0]);
    expect(future[0].irmaaPerReturn).toBe(false);
  });
});
