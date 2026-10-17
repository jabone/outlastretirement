// @vitest-environment jsdom
//
// Changelog 214: the Retirement Readiness tab's two cards. The engine side
// is covered in retirementReadiness.test.js; this pins the paywall shape
// (the question and your own headline figure are always free, the detail
// is not) and that the tab never contradicts the projection it was given.
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { screen, cleanup, fireEvent, within } from '@testing-library/react';
import ReadinessTab from '../../components/tabs/ReadinessTab';
import { renderWithSimulation } from '../testUtils';
import { installReadinessModule, settled, premiumIt } from '../premiumTestHelpers.jsx';
import { DEFAULT_INPUTS, runProjection } from '../../calculator';

afterEach(cleanup);

const START = DEFAULT_INPUTS.planYear;
const retiree = {
  ...DEFAULT_INPUTS,
  birthYear1: START - 64, retireAge1: 65, lifeExpectancy1: 92, claimingAge1: 70,
  salary1: 120000, ss1: 42000, preTaxInit: 1300000, taxableInit: 700000, rothInit: 250000,
  lifestyleExpense: 95000, stateOfResidence: 'TX', stateTaxState: 'none',
};
beforeAll(installReadinessModule);
// Premium renders are awaited: the detail comes from the readiness module
// through PremiumMount, which mounts it a tick after the tab.
const show = (isPremium, inputs = retiree) => {
  const r = renderWithSimulation(
    <ReadinessTab />,
    { inputs, projection: runProjection(inputs), setActiveTab: vi.fn() },
    { isPremium }
  );
  return isPremium ? settled(r) : r;
};

describe('Retirement Readiness — what is free', () => {
  it('asks both questions and answers each with one figure from the plan', () => {
    show(false);
    expect(screen.getByText(/Where does your first 5 years of money come from, and how does it reach you/)).toBeTruthy();
    expect(screen.getByText(/What would working longer actually buy you/)).toBeTruthy();
    expect(screen.getByText(/If the market fell 20% right after you retire/)).toBeTruthy();
    // Changelog 239: the paycheck question is part of the first-five-years card now.
    expect(screen.queryByText(/What replaces your paycheck/)).toBeNull();
    expect(screen.getByText(/If you walked away today/)).toBeTruthy();
    expect(screen.getByText(/Are your biggest expenses landing/)).toBeTruthy();
    // The first retired year, named, with its largest source.
    // The first retired year is named, with its largest source, in one
    // sentence built from several elements -- so match on the card's text.
    const cards = document.querySelectorAll('section');
    expect(cards).toHaveLength(5);
    // Changelog 229: the owner's order -- could I stop now, what would waiting
    // buy, where does the money come from, how does it arrive, what if the
    // market falls, and what lands at the worst time.
    expect(cards[2].textContent).toMatch(new RegExp(`In ${START + 1} your plan pays out`));
    expect(cards[2].textContent).toMatch(/mostly from/);
    expect(cards[1].textContent).toMatch(new RegExp(`retiring in ${START + 4} instead`));
    expect(cards[0].textContent).toMatch(/If you walked away today/);
    expect(cards[3].textContent).toMatch(/If the market fell/);
    expect(cards[4].textContent).toMatch(/biggest expenses landing/);
  });

  it('locks the detail, and offers the way to it', () => {
    const setActiveTab = vi.fn();
    renderWithSimulation(<ReadinessTab />, { inputs: retiree, projection: runProjection(retiree), setActiveTab }, { isPremium: false });
    const buttons = screen.getAllByRole('button', { name: /Part of Premium/ });
    expect(buttons).toHaveLength(4);
    fireEvent.click(buttons[0]);
    expect(setActiveTab).toHaveBeenCalledWith('premium');
    // No year-by-year table and no length choices for a free reader.
    expect(screen.queryByText('Paid out, a month')).toBeNull();
    expect(screen.queryByRole('button', { name: '5 more years' })).toBeNull();
  });
});

describe('Retirement Readiness — Premium', () => {
  premiumIt('readiness')('shows the five years, their sources and why each looks that way', async () => {
    await show(true);
    expect(screen.getByText('Paid out, a month')).toBeTruthy();
    for (let i = 1; i <= 5; i += 1) {
      expect(screen.getAllByText(String(START + i)).length).toBeGreaterThan(0);
    }
    expect(screen.queryAllByRole('button', { name: /Part of Premium/ })).toHaveLength(0);
  });

  premiumIt('readiness')('explains a conversion year in that year’s own words', async () => {
    await show(true, { ...retiree, rothConversionStrategy: 'fixed', rothConversionAmount: 60000 });
    expect(screen.getAllByText(/Converting to Roth this year/).length).toBeGreaterThan(0);
  });

  premiumIt('readiness')('compares one, two, three or five more years, and names the price', async () => {
    await show(true);
    for (const label of ['1 more year', '2 more years', '3 more years', '5 more years']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: '3 more years' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/3 years of\s+retirement, and they are the early ones/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '5 more years' }));
    expect(screen.getByRole('button', { name: '5 more years' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/Working 5 more/)).toBeTruthy();
    expect(screen.getByText(/5 years of\s+retirement/)).toBeTruthy();
  });

  premiumIt('readiness')('says out loud what it does not model', async () => {
    await show(true);
    expect(screen.getByText(/does not rise here for the extra/)).toBeTruthy();
    expect(screen.getByText(/keeps your life expectancy where you set it/)).toBeTruthy();
  });
});

describe('Retirement Readiness — a plan with no retired year', () => {
  premiumIt('readiness')('says so instead of rendering an empty table', async () => {
    const never = { ...retiree, retireAge1: 95, lifeExpectancy1: 90 };
    await settled(renderWithSimulation(<ReadinessTab />, { inputs: never, projection: runProjection(never), setActiveTab: vi.fn() }, { isPremium: true }));
    // Changelog 239: one card now, and it says so in both of its terms.
    expect(screen.getAllByText(/no retired year inside its horizon/)).toHaveLength(1);
    expect(screen.getByText(/no paycheck to replace/)).toBeTruthy();
    expect(screen.queryByText('Paid out, a month')).toBeNull();
  });
});

// Changelog 216: question 2.
describe('Retirement Readiness — the 20% fall (Q2)', () => {
  const thin = { ...retiree, lifestyleExpense: 150000 };

  it('answers yes or no for free, with the plan’s own consequence', () => {
    show(false);
    const card = document.querySelectorAll('section')[3];
    expect(card.textContent).toMatch(/Yes — on your plan’s own assumptions/);
    expect(card.textContent).toMatch(/of what you\s+would otherwise leave behind/);
    // The free reader gets the answer, never the break point.
    expect(screen.queryByText(/break point is a first-year fall/)).toBeNull();
  });

  it('says plainly when the answer is no', () => {
    show(false, thin);
    expect(screen.getByText(/Not without changing something/)).toBeTruthy();
    expect(document.querySelectorAll('section')[3].textContent).toMatch(/the portfolio runs out\s+in \d{4}/);
  });

  premiumIt('readiness')('gives Premium the break point and the three scenarios side by side', async () => {
    await show(true);
    expect(screen.getByText(/break point is a first-year fall/)).toBeTruthy();
    expect(screen.getByText('Crash, spending unchanged')).toBeTruthy();
    expect(screen.getByText('Crash, guardrails on')).toBeTruthy();
    expect(screen.getByText('Money runs out in')).toBeTruthy();
  });

  premiumIt('readiness')('tells a reader whose plan has the guardrail off that the last column is a what-if', async () => {
    await show(true);
    expect(screen.getByText(/withdrawal-rate guardrails off, so the last column is a what-if/)).toBeTruthy();
    cleanup();
    await show(true, { ...retiree, withdrawalGuardrailsEnabled: true });
    expect(screen.getByText(/already has withdrawal-rate guardrails on/)).toBeTruthy();
  });
});

// Changelog 217: question 3.
describe('Retirement Readiness — the paycheck (Q3)', () => {
  const reserve = { ...retiree, cashFloorEnabled: true, cashFloorInit: 150000 };

  it('gives a monthly figure and the one transfer for free', () => {
    show(false, reserve);
    const card = document.querySelectorAll('section')[2];
    expect(card.textContent).toMatch(/pays out \$[\d,]+ for\s+the year, about \$[\d,]+ a month/);
    expect(card.textContent).toMatch(/one transfer of/);
    expect(card.textContent).toMatch(/a\s+quarter to set aside/);
    expect(card.textContent).toMatch(/months on its own/);
    expect(screen.queryByText('Moved from the portfolio')).toBeNull();
  });

  it('tells a plan with no reserve what that means, rather than leaving a gap', () => {
    show(false);
    expect(screen.getByText(/no cash reserve, so every transfer is a sale/)).toBeTruthy();
  });

  premiumIt('readiness')('gives Premium the year-by-year paycheck, with the two columns kept apart', async () => {
    await show(true, reserve);
    // Changelog 229: every heading says its unit, because three of these
    // are monthly, quarterly and annual and the row invites the wrong
    // comparison without it.
    expect(screen.getByText('Moved from the portfolio, for the year')).toBeTruthy();
    expect(screen.getByText('Paid out, a month')).toBeTruthy();
    expect(screen.getByText('Arrives on its own, a month')).toBeTruthy();
    expect(screen.getByText('Tax, a quarter')).toBeTruthy();
    expect(screen.getByText(/is what you sell/)).toBeTruthy();
  });

  premiumIt('readiness')('gives each year\u2019s notes something to refer to', async () => {
    await show(true, reserve);
    // The note used to say "the transfer" with a figure in brackets, and
    // nothing on screen was called a transfer. The year now carries both
    // numbers, and the note names the column.
    const headings = screen.getAllByText(/moved,/);
    expect(headings.length).toBeGreaterThan(0);
    expect(headings[0].textContent).toMatch(/a month paid out/);
    const notes = screen.getAllByText(/went into the cash reserve rather than to you/);
    expect(notes.length).toBeGreaterThan(0);
    // The figure leads the sentence rather than trailing it in brackets.
    expect(notes[0].textContent).toMatch(/^\$[\d,]+ of what was moved/);
  });
});

// Changelog 218: question 1.
describe('Retirement Readiness — walking away today (Q1)', () => {
  const tooMuch = { ...retiree, lifestyleExpense: 220000 };

  it('answers yes with the headroom, for free', () => {
    show(false);
    const card = document.querySelectorAll('section')[0];
    expect(card.textContent).toMatch(/Yes\./);
    expect(card.textContent).toMatch(/reaches the end of its horizon/);
    expect(screen.queryByText('The most it supports, a year, spending the portfolio to zero')).toBeNull();
  });

  it('answers no with the year it runs out and the size of the gap', () => {
    show(false, tooMuch);
    const card = document.querySelectorAll('section')[0];
    expect(card.textContent).toMatch(/Not on/);
    expect(card.textContent).toMatch(/the portfolio runs out\s+in \d{4}/);
    expect(card.textContent).toMatch(/below your budget/);
  });

  premiumIt('readiness')('gives Premium the comparison, the tax and the floor', async () => {
    await show(true, { ...retiree, lifestyleExpenseInputMode: 'categories', spendingBlueprint: {
      lines: [
        { id: 'a', categoryId: 'housing', label: 'home', amount: 40000 },
        { id: 'b', categoryId: 'personal', label: 'travel', amount: 55000 },
      ],
      essentialCategoryIds: ['housing'],
      unlinkedFields: [],
    } });
    expect(screen.getByText('The most it supports, a year, spending the portfolio to zero')).toBeTruthy();
    expect(screen.getByText('Tax in the first year, on top of the spending')).toBeTruthy();
    expect(screen.getByText('The part you said you could not cut')).toBeTruthy();
    expect(screen.getByText(/treat it as the ceiling rather than the/)).toBeTruthy();
  });

  premiumIt('readiness')('asks for a ledger rather than inventing a floor when there is none', async () => {
    await show(true);
    expect(screen.queryByText('The part you said you could not cut')).toBeNull();
    expect(screen.getByText(/tick what you could not cut/)).toBeTruthy();
  });

  // Changelog 236: when the answer is no, what would make it a yes.
  // Changelog 237: easiest lever first, each figure in a unit you can judge.
  premiumIt('readiness')('gives Premium what would make a no into a yes', async () => {
    await show(true, tooMuch);
    const box = screen.getByTestId('walk-away-to-yes');
    const text = box.textContent;
    expect(text).toMatch(/closes the \$[\d,]+ a year gap/);
    expect(text).toMatch(/Spend \$[\d,]+ less a year/);
    expect(text).toMatch(/Keep working full time/);
    expect(text).toMatch(/A one-time sum, added todayThe \$[\d,]+ a year gap, paid up front\$[\d,]+/);
    const earnings = new RegExp('Earnings for the first (\\d) years, a year(About \\d+% of what you earn now|More than you earn now)?\\$[\\d,]+', 'g');
    expect([...text.matchAll(earnings)].map((m) => Number(m[1]))).toEqual([2, 3, 5]);
    // Spending less comes first, the lump sum after working longer.
    expect(text.indexOf('Spend ')).toBeLessThan(text.indexOf('Keep working'));
    expect(text.indexOf('Keep working')).toBeLessThan(text.indexOf('A one-time sum'));
    // The old label that read like a job ad is gone.
    expect(text).not.toMatch(/Part-time work for the first/);
  });

  premiumIt('readiness')('keeps the essentials out of the verdict, in their own section that does not say short', async () => {
    await show(true, { ...tooMuch, lifestyleExpenseInputMode: 'categories', spendingBlueprint: {
      lines: [
        { id: 'a', categoryId: 'housing', label: 'home', amount: 90000 },
        { id: 'b', categoryId: 'personal', label: 'travel', amount: 130000 },
      ],
      essentialCategoryIds: ['housing'],
      unlinkedFields: [],
    } });
    const exposure = screen.getByTestId('walk-away-exposure');
    expect(within(exposure).getByText('The part you said you could not cut')).toBeTruthy();
    expect(exposure.textContent).toMatch(/separate question from whether the money lasts/);
    expect(exposure.textContent).not.toMatch(/short/i);
    // And the verdict table above no longer carries the floor rows.
    const card = document.querySelectorAll('section')[0];
    const firstTable = card.querySelector('table');
    expect(firstTable.textContent).not.toMatch(/could not cut/);
    expect(firstTable.textContent).toMatch(/Short by, every year/);
  });

  premiumIt('readiness')('says nothing about it when the answer is yes, or to a free reader', async () => {
    await show(true);
    expect(screen.queryByTestId('walk-away-to-yes')).toBeNull();
    cleanup();
    show(false, tooMuch);
    expect(screen.queryByTestId('walk-away-to-yes')).toBeNull();
  });
});

// Changelog 238: the working-longer card gains a fixed "Leave now" column.
describe('Retirement Readiness — working longer, with leaving now beside it (Q6)', () => {
  const tooMuch = { ...retiree, lifestyleExpense: 220000 };

  premiumIt('readiness')('puts leave now, your plan and working longer side by side, with no Difference column', async () => {
    await show(true, tooMuch);
    const table = screen.getByTestId('work-longer-table');
    const heads = [...table.querySelectorAll('th')].map((th) => th.textContent);
    expect(heads).toEqual(['', 'Leave now', 'Your plan', 'Working 3 more']);
    expect(table.textContent).toMatch(/Lasts to the end of the plan/);
    expect(table.textContent).toMatch(/1 year sooner/);
    expect(table.textContent).toMatch(/3 years later/);
  });

  premiumIt('readiness')('shows a plan that runs out as the year it runs out, and its tax only through then', async () => {
    await show(true, tooMuch);
    const table = screen.getByTestId('work-longer-table');
    const balance = [...table.querySelectorAll('tr')].find((tr) => tr.textContent.startsWith('Ending portfolio balance'));
    const cells = balance.querySelectorAll('td');
    expect(cells[1].textContent).toMatch(/^Runs out \d{4}/);
    expect(cells[1].textContent).not.toMatch(/\$0/);
    const taxes = [...table.querySelectorAll('tr')].find((tr) => tr.textContent.startsWith('Lifetime taxes paid'));
    expect(taxes.querySelectorAll('td')[1].textContent).toMatch(/through \d{4}/);
    expect(screen.getByText(/What would make leaving now work is on the first card/)).toBeTruthy();
  });

  premiumIt('readiness')('keeps leave now fixed when the years change', async () => {
    await show(true, tooMuch);
    const leaveNowCol = () => [...screen.getByTestId('work-longer-table').querySelectorAll('tr')].map((tr) => tr.children[1].textContent);
    const before = leaveNowCol();
    fireEvent.click(screen.getByRole('button', { name: '5 more years' }));
    expect(screen.getByText('Working 5 more')).toBeTruthy();
    expect(leaveNowCol()).toEqual(before);
  });

  premiumIt('readiness')('drops the column when the plan already retires you this year', async () => {
    await show(true, { ...retiree, retireAge1: 64 });
    const heads = [...screen.getByTestId('work-longer-table').querySelectorAll('th')].map((th) => th.textContent);
    expect(heads).toEqual(['', 'Your plan', 'Working 3 more']);
  });
});

// Changelog 219: question 4.
describe('Retirement Readiness — big expenses at bad times (Q4)', () => {
  const roof = {
    id: 'roof', name: 'Roof', type: 'outflow', amount: 250000, isRecurring: false,
    startAge: 67, endAge: 67, targetAccount: 'auto', fundedExternally: false,
  };
  const withRoof = { ...retiree, milestones: [roof] };

  it('says plainly when nothing is flagged, and locks nothing', () => {
    show(false);
    const card = document.querySelectorAll('section')[4];
    expect(card.textContent).toMatch(/Nothing flagged/);
    // Free readers see three locked details on this plan, not four: there
    // is nothing behind the paywall when there is nothing to examine.
    expect(within(card).queryByRole('button', { name: /Part of Premium/ })).toBeNull();
  });

  it('names the biggest one, its year and its share of the portfolio, for free', () => {
    show(false, withRoof);
    const card = document.querySelectorAll('section')[4];
    expect(card.textContent).toMatch(/One life event lands/);
    expect(card.textContent).toMatch(/Roof/);
    expect(card.textContent).toMatch(/% of the portfolio that year/);
    // Changelog 220: the same size said in a unit you can judge.
    expect(card.textContent).toMatch(/of your normal withdrawals in one go/);
    expect(card.textContent).toMatch(/first five years, where a sale hurts most/);
    expect(screen.queryByText(/2 years later, same fall/)).toBeNull();
  });

  premiumIt('readiness')('gives Premium the timing table and says the plan was not touched', async () => {
    await show(true, withRoof);
    expect(screen.getByText('Where it sits, normal market')).toBeTruthy();
    expect(screen.getByText('Where it sits, 20% fall at retirement')).toBeTruthy();
    expect(screen.getByText('5 years later, same fall')).toBeTruthy();
    expect(screen.getByText(/nothing here has changed it/)).toBeTruthy();
    // And it refuses to tell the user what to do.
    expect(screen.getByText(/a roof is not always deferrable/)).toBeTruthy();
  });

  premiumIt('readiness')('lets Premium switch which expense is examined', async () => {
    const second = { ...roof, id: 'kitchen', name: 'Kitchen', amount: 300000, startAge: 70, endAge: 70 };
    await show(true, { ...retiree, milestones: [roof, second] });
    const pill = screen.getByRole('button', { name: /^Roof \(/ });
    expect(screen.getByRole('button', { name: /^Kitchen \(/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pill);
    expect(pill.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Retirement Readiness — the Monte Carlo beside the answer (changelog 269)', () => {
  const mc = { successProbability: 83.4, trials: 1000, seed: 1, returnModel: 'bootstrap', longevitySampled: true, ltcSampled: false, endingP10: 1, endingP50: 2, endingP90: 3 };
  it('quotes a fresh run on the crash card, naming the model and what else was drawn', () => {
    const setActiveTab = vi.fn();
    renderWithSimulation(
      <ReadinessTab />,
      { inputs: retiree, projection: runProjection(retiree), setActiveTab, monteCarlo: mc, mcRange: { status: 'fresh', successProbability: 83.4, trials: 1000, p10: 1, p50: 2, p90: 3, seed: 1 } },
      { isPremium: false },
    );
    expect(screen.getByText('83% of 1,000 trials')).toBeInTheDocument();
    expect(screen.getByText(/blocks of real years with lifespans drawn too/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'The Monte Carlo' }));
    expect(setActiveTab).toHaveBeenCalledWith('risk');
  });

  it('says nothing when the run is stale or absent', () => {
    renderWithSimulation(
      <ReadinessTab />,
      { inputs: retiree, projection: runProjection(retiree), setActiveTab: vi.fn(), monteCarlo: mc, mcRange: { status: 'stale', seed: 1 } },
      { isPremium: false },
    );
    expect(screen.queryByText(/of 1,000 trials/)).toBeNull();
    cleanup();
    renderWithSimulation(
      <ReadinessTab />,
      { inputs: retiree, projection: runProjection(retiree), setActiveTab: vi.fn(), monteCarlo: null, mcRange: { status: 'none' } },
      { isPremium: false },
    );
    expect(screen.queryByText(/trials/)).toBeNull();
  });
});

// U12: the headline's parts add up to its total, and what arrives plus the
// transfer, less the reserve top-up, is that total.
describe('Retirement Readiness — the first-years headline adds up', () => {
  it('on a plan with a reserve and a conversion', () => {
    show(false, { ...retiree, cashFloorEnabled: true, cashFloorInit: 150000, rothConversionStrategy: 'fixed', rothConversionAmount: 60000 });
    const text = screen.getByTestId('first-years-headline').textContent.replace(/\s+/g, ' ');
    const d = (s) => Number(s.replace(/[$,]/g, ''));
    const m = text.match(/pays out (\$[\d,]+) for the year, about \$[\d,]+ a month: (.*?)\. /);
    expect(m, text).not.toBeNull();
    const parts = [...m[2].matchAll(/\$[\d,]+/g)].map((x) => d(x[0]));
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.reduce((t, v) => t + v, 0)).toBe(d(m[1]));
    const arrives = text.match(/(\$[\d,]+) of it arrives on its own/);
    const transfer = text.match(/one transfer of (\$[\d,]+)/);
    const reserve = text.match(/(\$[\d,]+) of that tops up the cash reserve/);
    expect(transfer).not.toBeNull();
    expect(reserve).not.toBeNull();
    expect((arrives ? d(arrives[1]) : 0) + d(transfer[1]) - d(reserve[1])).toBe(d(m[1]));
    expect(text).toMatch(/in tax/);
  });
});
