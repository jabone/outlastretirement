// First-time user review, round D (changelog 476): Year by Year opens on a
// summary and flags only real budget gaps, strategy cards state a measure
// and ask before changing the plan, Readiness puts Premium last and links
// What Will You Do?, and the home page starts with the lessons.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isBudgetShortYear, BUDGET_WARNING_SHARE } from '../utils/budgetWarning';
import { strategyMeasure } from '../utils/strategyMeasure';

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const readRoot = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');

describe('the budget warning', () => {
  it('flags a working year only when the cut is a real share of its pay', () => {
    expect(isBudgetShortYear({ salary: 100000, savingsDeficit: 2000 })).toBe(false);
    expect(isBudgetShortYear({ salary: 100000, savingsDeficit: 2000, lifestyleDeficit: 1500 })).toBe(true);
    expect(isBudgetShortYear({ salary: 0, savingsDeficit: 400 })).toBe(false);
    expect(isBudgetShortYear({ salary: 100000 })).toBe(false);
    expect(BUDGET_WARNING_SHARE).toBe(0.03);
  });
  it('the banner says what happened in plain words', () => {
    const tab = read('components/tabs/YearLedgerTab.jsx');
    expect(tab).toMatch(/Pay does not cover the budget:/);
    expect(tab).toMatch(/so the plan saved less instead/);
    expect(tab).not.toMatch(/prevent premature portfolio drawdown/);
  });
});

describe('Year by Year', () => {
  it('opens on the Summary group on every screen, with Every column for the whole table', () => {
    const tab = read('components/tabs/YearLedgerTab.jsx');
    expect(tab).toMatch(/\{ id: 'all', label: 'Every column' \}/);
    expect(tab).toMatch(/>Spending<\/Tooltip>/);
    expect(tab).not.toMatch(/>Lifestyle Exp</);
    const css = read('index.css');
    expect(css).toMatch(/\.year-ledger-table:not\(\.preset-all\) \.lg \{ display: none; \}/);
    expect(css).not.toMatch(/\.ledger-presets \{ display: none; \}/);
  });
});

describe('strategy cards', () => {
  const fc = (v) => `$${v.toLocaleString('en-US')}`;
  it('state what each leaves the heirs against the top card, not a grade', () => {
    expect(strategyMeasure({ ranking: 'Best', afterTaxLegacy: 500000 }, 500000, fc)).toBe('Leaves heirs the most');
    expect(strategyMeasure({ ranking: 'Great', afterTaxLegacy: 497089 }, 500000, fc)).toBe('$2,911 less to heirs');
    expect(strategyMeasure({ ranking: 'Shortfall', afterTaxLegacy: 0 }, 500000, fc)).toBe('Runs short');
    const tab = read('components/tabs/StrategyTab.jsx');
    expect(tab).not.toMatch(/\{strat\.ranking\}/);
    expect(tab).toMatch(/confirmLabel: 'Change my plan'/);
  });
});

describe('Readiness', () => {
  it('links What Will You Do? and keeps the walk-away Premium note after the free answers', () => {
    const tab = read('components/tabs/ReadinessTab.jsx');
    expect(tab).toMatch(/data-testid="readiness-lifeplan-link"/);
    const solver = tab.indexOf('setWhatIfFundingMethod={setWhatIfFundingMethod}');
    const lockedAfter = tab.indexOf('{!isPremium && (', solver);
    expect(lockedAfter).toBeGreaterThan(solver);
  });
});

describe('the home page', () => {
  const home = readRoot('index.html');
  it('puts the lessons right after the opening, and the privacy section after the product', () => {
    const at = (id) => home.indexOf(`<section id="${id}"`);
    expect(at('learn')).toBeGreaterThan(at('hero'));
    expect(at('learn')).toBeLessThan(at('how'));
    expect(at('privacy')).toBeGreaterThan(at('premium'));
    expect(at('problem')).toBeGreaterThan(at('privacy'));
  });
  it('says who each starting button is for', () => {
    expect(home).toMatch(/href="\/app\/\?demo=1">New to this\? See a sample family first</);
    expect(home).toMatch(/href="\/app\/">Ready\? Start your own plan</);
  });
});
