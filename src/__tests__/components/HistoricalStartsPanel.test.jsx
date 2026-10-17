// @vitest-environment jsdom
//
// Changelog 335: the every-start panel's free / Premium line. Free: the
// survival count and the cost of a guardrail the user has switched ON.
// Premium: every rule side by side and a row per start.
import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import HistoricalStartsPanel from '../../components/HistoricalStartsPanel';
import { renderWithSimulation } from '../testUtils.jsx';
import { installReadinessModule, settled, premiumIt } from '../premiumTestHelpers.jsx';

beforeAll(installReadinessModule);
// The paid part (every rule, the 95%/90% SAFEMAX table, every start) is the
// readiness module's `historicalStarts` mount, so the panel renders inside
// the host providers and a Premium render is awaited.
const render = (ui, premium) => {
  const r = renderWithSimulation(ui, {}, { isPremium: premium, portfolioPreview: false });
  return premium ? settled(r) : r;
};

const rule = (key, over = {}) => ({
  key, inPlan: false, lasted: 50, count: 66, worstStart: 1966, worstRunsOutYear: 2051,
  medianLifetimeShare: 1, deepestCut: 0, deepestCutStart: null, medianCutYears: 0, essentialsTouchedStarts: null, ...over,
});
const data = (inPlan) => ({
  retirementYear: 2031, horizonYears: 33, firstStart: 1928, lastStart: 1993, count: 66, inPlan,
  rules: [
    rule('fixed', { inPlan: inPlan === 'fixed' }),
    rule('crash', { inPlan: inPlan === 'crash', lasted: 62, deepestCut: 0.3, deepestCutStart: 1968, medianLifetimeShare: 0.97, medianCutYears: 4, essentialsTouchedStarts: 0 }),
    rule('wr', { inPlan: inPlan === 'wr', lasted: 59, deepestCut: 0.2, deepestCutStart: 1956, medianLifetimeShare: 1.09, medianCutYears: 8 }),
  ],
  starts: [{ start: 1928, fixed: { ok: true, runsOutYear: null }, crash: { ok: true, runsOutYear: null, deepestCut: 0.1 }, wr: { ok: false, runsOutYear: 2060, deepestCut: 0.2 } }],
});

describe('HistoricalStartsPanel', () => {
  it('free, fixed spending: the count and the hardest start, and the rest locked', () => {
    render(<HistoricalStartsPanel data={data('fixed')} onOpenPremium={() => {}} />, false);
    expect(screen.getByTestId('historical-headline').textContent).toMatch(/lasted in 50 of 66 real retirements/);
    expect(screen.getByTestId('historical-headline').textContent).toMatch(/1966, which runs out in 2051/);
    expect(screen.queryByTestId('historical-cost')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: /Part of Premium/ })).toBeTruthy();
  });

  it('free, guardrail on: the guardrail’s cost is NOT behind the paywall', () => {
    render(<HistoricalStartsPanel data={data('crash')} onOpenPremium={() => {}} />, false);
    expect(screen.getByTestId('historical-headline').textContent).toMatch(/62 of 66/);
    const cost = screen.getByTestId('historical-cost').textContent;
    expect(cost).toMatch(/30% below/);
    expect(cost).toMatch(/1968 start/);
    expect(cost).toMatch(/97%/);
    expect(cost).toMatch(/never touched/);
    expect(screen.queryByRole('table')).toBeNull();
  });

  premiumIt('readiness')('Premium: every rule side by side, the plan’s own rule marked', async () => {
    await render(<HistoricalStartsPanel data={data('wr')} onOpenPremium={() => {}} />, true);
    const rows = screen.getAllByRole('row');
    // Header + 3 rules in the first table, header + 1 start in the second.
    expect(rows.length).toBe(4 + 2);
    expect(screen.getByText(/Withdrawal-rate guardrails \(your plan\)/)).toBeTruthy();
    expect(screen.getByText('Runs out 2060, cut 20%')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Part of Premium/ })).toBeNull();
  });

  it('says so when the retirement is longer than the record', () => {
    render(<HistoricalStartsPanel data={{ ...data('fixed'), count: 0, starts: [], horizonYears: 110 }} onOpenPremium={() => {}} />, false);
    expect(screen.getByTestId('historical-starts').textContent).toMatch(/runs 110 years, longer than any stretch/);
  });

  premiumIt('readiness')('replays a start from the headline and from its row', async () => {
    const replays = [];
    await render(<HistoricalStartsPanel data={data('fixed')} onOpenPremium={() => {}} onReplay={(y) => replays.push(y)} />, true);
    fireEvent.click(screen.getByRole('button', { name: 'Replay it on the chart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replay 1928 on the chart' }));
    expect(replays).toEqual([1966, 1928]);
  });

  it('says so when the hardest start is already on the chart', () => {
    render(<HistoricalStartsPanel data={data('fixed')} onOpenPremium={() => {}} onReplay={() => {}} replayingStart={1966} />, false);
    expect(screen.queryByRole('button', { name: 'Replay it on the chart' })).toBeNull();
    expect(screen.getByTestId('historical-headline').textContent).toMatch(/on the chart above/);
  });
});

describe('HistoricalStartsPanel — the most you could spend (changelog 358)', () => {
  const safeMax = {
    rule: 'fixed', count: 66, firstStart: 1928, lastStart: 1993, planned: 96000,
    bars: [
      { share: 1, need: 66, status: 'ok', amount: 85000, limitingStart: 1966, spendingRate: 0.041 },
      { share: 0.95, need: 63, status: 'ok', amount: 91000, limitingStart: 1969, spendingRate: 0.044 },
      { share: 0.9, need: 60, status: 'ok', amount: 99000, limitingStart: 1937, spendingRate: 0.048 },
    ],
  };

  it('free: the every-start figure, the start that fails first and the gap to the plan', () => {
    render(<HistoricalStartsPanel data={{ ...data('fixed'), safeMax }} onOpenPremium={() => {}} />, false);
    const line = screen.getByTestId('historical-safemax').textContent;
    expect(line).toMatch(/\$85,000 a year/);
    expect(line).toMatch(/4\.1% of your portfolio/);
    expect(line).toMatch(/1966 start runs out first/);
    expect(line).toMatch(/Your plan spends \$96,000, \$11,000 more than that/);
    expect(screen.queryByTestId('historical-safemax-table')).toBeNull();
  });

  premiumIt('readiness')('Premium: the 95% and 90% figures too', async () => {
    await render(<HistoricalStartsPanel data={{ ...data('fixed'), safeMax }} onOpenPremium={() => {}} />, true);
    const table = screen.getByTestId('historical-safemax-table').textContent;
    expect(table).toMatch(/95% of starts \(63 of 66\)/);
    expect(table).toMatch(/\$99,000\/yr/);
  });

  it('says plainly when no spending lasts through every start', () => {
    const none = { ...safeMax, bars: [{ share: 1, need: 66, status: 'none', amount: null, limitingStart: null, spendingRate: null }] };
    render(<HistoricalStartsPanel data={{ ...data('fixed'), safeMax: none }} onOpenPremium={() => {}} />, false);
    expect(screen.getByTestId('historical-safemax').textContent).toMatch(/No level of lifestyle spending lasts/);
  });

  it('shows nothing while the search is still running', () => {
    render(<HistoricalStartsPanel data={data('fixed')} onOpenPremium={() => {}} />, false);
    expect(screen.queryByTestId('historical-safemax')).toBeNull();
  });
});
