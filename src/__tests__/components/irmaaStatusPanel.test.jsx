// @vitest-environment jsdom
//
// CFE-IRMAA-01 / changelog 174 -- the "Medicare IRMAA Status" panel on
// Tax & Estate.
//
// THE BUG THIS LOCKS DOWN. The panel used to compute its tier from
// `yearData.magi`, which App.jsx set to `totalOrdinaryGross`: an
// ordinary-income stack for the CURRENT year that also included the
// standard deduction. The engine has priced IRMAA off the MAGI from the
// return filed two years earlier since changelog 121, and the Year by Year
// ledger has charged it that way all along. So the panel could announce a
// surcharge tier in a year the ledger billed the base premium, and the two
// surfaces disagreed with no way for a user to tell which was right.
//
// The fixtures below are built so the two readings give DIFFERENT ANSWERS:
// a retiree whose income has fallen has a low current MAGI and a high
// lookback MAGI, and vice versa for one whose income has just risen. A test
// where both readings agree would pass against the bug.
//
// Mutation-tested per DEVELOPMENT.md, 2026-09-13: pointing the panel back at
// `yearData.magi` fails both directional cases below.
import { describe, it, expect, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import TaxEstateTab from '../../components/tabs/TaxEstateTab';
import { renderWithSimulation } from '../testUtils';

const TIERS = {
  irmaaTier1: 109000, irmaaTier2: 137000, irmaaTier3: 171000,
  irmaaTier4: 205000, irmaaTier5: 500000,
};

function row(overrides) {
  return {
    year: 2030, age1: 67, age2: null, isRetired: true,
    householdStatus: 'Single',
    totalOrdinaryGross: 60000,
    ordinaryTaxableIncome: 45000,
    stdDeduction: 15000,
    ...TIERS,
    ...overrides,
  };
}

function renderWith(yearRow) {
  return renderWithSimulation(<TaxEstateTab />, {
    taxVisualizerData: [yearRow],
    heirTaxResults: {
      grossInherited: 0, totalHeirTax: 0, netInherited: 0,
      totalStateEstateTax: 0, totalFederalEstateTax: 0,
      totalLifeInsuranceProceeds: 0, lifeInsuranceEstateInclusion: 0,
      perHeir: [], annualWithdrawals: [],
    },
  });
}

afterEach(cleanup);

describe('IRMAA Status prices off the year Medicare actually reads', () => {
  it('a retiree whose income has fallen is still shown the surcharge the lookback charges', () => {
    // Retired this year on $40,000; two years ago they earned $250,000.
    // Reading the current year says "no surcharge"; the plan bills tier 4.
    renderWith(row({
      magi: 40000,
      irmaaBasisMagi: 250000,
      irmaaBasisSource: 'lookback',
      irmaaLookbackMagi: 250000,
    }));

    expect(screen.getByText('Tier 4 Surcharge')).toBeInTheDocument();
    expect(screen.queryByText('No surcharge (Base Premium)')).not.toBeInTheDocument();
    // And it names the year the figure came from, so the number is not a
    // mystery sitting next to a year it does not belong to.
    expect(screen.getByText(/2028 MAGI/)).toBeInTheDocument();
  });

  it('a retiree whose income has just risen is not yet charged for it', () => {
    // The mirror image, so neither case can pass by accident: a big
    // conversion this year, a quiet year two years ago.
    renderWith(row({
      magi: 250000,
      irmaaBasisMagi: 40000,
      irmaaBasisSource: 'lookback',
      irmaaLookbackMagi: 40000,
    }));

    expect(screen.getByText('No surcharge (Base Premium)')).toBeInTheDocument();
    expect(screen.queryByText('Tier 4 Surcharge')).not.toBeInTheDocument();
  });

  it('shows this year\'s own MAGI as the figure that sets a premium two years out', () => {
    renderWith(row({
      magi: 250000,
      irmaaBasisMagi: 40000,
      irmaaBasisSource: 'lookback',
      irmaaLookbackMagi: 40000,
    }));
    // 2030's own income sets the 2032 premium -- the sentence that makes a
    // conversion's real cost visible before it is charged.
    expect(screen.getByText(/\$250,000\) sets the 2032 premium/)).toBeInTheDocument();
  });

  it('says when the plan has no earlier year to look back to', () => {
    renderWith(row({
      magi: 150000,
      irmaaBasisMagi: 150000,
      irmaaBasisSource: 'current',
      irmaaLookbackMagi: null,
    }));
    expect(screen.getByText(/no earlier year in the plan to look back to yet/)).toBeInTheDocument();
    expect(screen.getByText('Tier 2 Surcharge')).toBeInTheDocument();
  });

  it('names a modeled Form SSA-44 appeal as the reason the current year is used', () => {
    renderWith(row({
      magi: 40000,
      irmaaBasisMagi: 40000,
      irmaaBasisSource: 'appeal',
      irmaaLookbackMagi: 250000,
    }));
    expect(screen.getByText(/Form SSA-44 appeal replaced the 2028 figure/)).toBeInTheDocument();
    expect(screen.getByText('No surcharge (Base Premium)')).toBeInTheDocument();
  });

  it('falls back to the year\'s own MAGI for a scenario saved before these fields existed', () => {
    // Rows restored from an older saved Scenario carry no irmaaBasisMagi.
    // Falling back to the year's own figure is what the engine does for a
    // year with no history anyway -- what must NOT happen is reading zero
    // and announcing a base premium to someone at $250,000.
    renderWith(row({ magi: 250000 }));
    expect(screen.getByText('Tier 4 Surcharge')).toBeInTheDocument();
  });
});

describe('IRMAA Status states the education without overclaiming', () => {
  it('states the two-year lookback and the CMS/SSA source', () => {
    renderWith(row({ magi: 40000, irmaaBasisMagi: 40000, irmaaBasisSource: 'lookback' }));
    expect(screen.getByText(/two-year lookback/)).toBeInTheDocument();
    expect(screen.getByText(/2026 premiums generally follow 2024 income \(CMS \/ SSA\)/)).toBeInTheDocument();
  });

  it('defines MAGI as AGI plus tax-exempt interest, and admits muni interest is not modeled', () => {
    renderWith(row({ magi: 40000, irmaaBasisMagi: 40000, irmaaBasisSource: 'lookback' }));
    expect(screen.getByText(/MAGI here is adjusted gross income plus tax-exempt interest/)).toBeInTheDocument();
    expect(screen.getByText(/tax-exempt interest is\s+not modeled in this plan/)).toBeInTheDocument();
  });

  it('points at the ledger for the dollar premium rather than printing a surcharge table', () => {
    renderWith(row({ magi: 300000, irmaaBasisMagi: 300000, irmaaBasisSource: 'lookback' }));
    expect(screen.getByText(/Year by Year ledger/)).toBeInTheDocument();
    // No CMS premium figure is reprinted anywhere in the panel. $202.90 is
    // the 2026 standard Part B premium; if a future edit starts quoting the
    // surcharge table here, this is the guard that objects.
    expect(screen.queryByText(/\$202\.90|\$284\.10|\$649\.20/)).not.toBeInTheDocument();
  });

  it('is not shown before anyone is old enough for it to matter', () => {
    // 63 is the first year whose income can reach a Medicare premium.
    renderWith(row({ age1: 55, magi: 300000, irmaaBasisMagi: 300000, irmaaBasisSource: 'lookback' }));
    expect(screen.queryByText(/two-year lookback/)).not.toBeInTheDocument();
  });
});
