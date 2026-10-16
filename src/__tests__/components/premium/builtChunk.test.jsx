// @vitest-environment jsdom
// Round trip across the two repos: the chunk the Premium repo's build
// produced (checked in as a fixture, regenerated with `npm run build` there)
// executes against this host's real hostLib and registers a factory whose
// PortfolioTab renders with the real host API. If a host refactor removes
// something the chunk imports, this is the test that says so, before a
// user does.
import React from 'react';
import { describe, it, expect, beforeAll } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { isCompatibleContract } from '../../../premium/contract.js';
import { renderWithSimulation } from '../../testUtils.jsx';
import { withHost } from '../../../premium/withHost.jsx';
import { ROUTES } from '../../../utils/tabRouting.js';
import { loadBuiltHoldingsFactory, loadBuiltFactory, hasBuiltChunk } from '../../premiumTestHelpers.jsx';
import { __setModuleLoader } from '../../../premium/registry.js';

let factory;
beforeAll(async () => { if (hasBuiltChunk('holdings')) factory = await loadBuiltHoldingsFactory(); });

describe.skipIf(!hasBuiltChunk('holdings'))('the built holdings chunk', () => {
  it('registers a factory that satisfies the contract', () => {
    expect(typeof factory).toBe('function');
    const inst = factory();
    expect(inst.area).toBe('holdings');
    expect(isCompatibleContract(inst.contractVersion)).toBe(true);
    expect(Object.keys(inst.mounts).sort()).toEqual(['initialBalancesCta', 'portfolioTab', 'preferencesPricing']);
  });

  it("renders PortfolioTab through the host's real API", async () => {
    const { mounts } = factory();
    const Tab = withHost(mounts.portfolioTab);
    renderWithSimulation(<Tab />, {}, { isPremium: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Distributions' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Liquidations' })).toBeInTheDocument();
  });

  it("exposes exactly the sub-tabs the host's ROUTES declares, in order", () => {
    const { mounts } = factory();
    const Tab = withHost(mounts.portfolioTab);
    renderWithSimulation(<Tab />, {}, { isPremium: true });
    const labels = ['Holdings', 'Distributions', 'Retirement Income', 'Analytics', 'Rebalance', 'Liquidations'];
    for (const l of labels) expect(screen.getByRole('button', { name: l })).toBeInTheDocument();
    expect(ROUTES.portfolio.subTabs).toHaveLength(labels.length);
  });
});

describe.skipIf(!hasBuiltChunk('spending'))('the built spending chunk', () => {
  it('registers a factory that fills the three spending mounts at a compatible contract', async () => {
    const factory = await loadBuiltFactory('spending');
    const inst = factory();
    expect(inst.area).toBe('spending');
    expect(isCompatibleContract(inst.contractVersion)).toBe(true);
    expect(Object.keys(inst.mounts).sort()).toEqual(['spendingBridge', 'spendingFloor', 'spendingImport']);
  });

  it("renders the bridge through the host's real API", async () => {
    const factory = await loadBuiltFactory('spending');
    const Bridge = withHost(factory().mounts.spendingBridge);
    renderWithSimulation(<Bridge residual={60000} />, {}, { isPremium: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /Use this as my Annual Lifestyle Spending|Applied/ })).toBeInTheDocument());
  });
});

describe.skipIf(!hasBuiltChunk('readiness'))('the built readiness chunk', () => {
  it('registers a factory that fills the two readiness mounts at a compatible contract', async () => {
    const factory = await loadBuiltFactory('readiness');
    const inst = factory();
    expect(inst.area).toBe('readiness');
    expect(isCompatibleContract(inst.contractVersion)).toBe(true);
    expect(Object.keys(inst.mounts).sort()).toEqual(['historicalStarts', 'readinessDetail']);
  });
});

describe.skipIf(!hasBuiltChunk('relocation'))('the built relocation chunk', () => {
  it('registers a factory that fills the two relocation mounts at a compatible contract', async () => {
    const factory = await loadBuiltFactory('relocation');
    const inst = factory();
    expect(inst.area).toBe('relocation');
    expect(isCompatibleContract(inst.contractVersion)).toBe(true);
    expect(Object.keys(inst.mounts).sort()).toEqual(['relocationCompare', 'residencyTimeline']);
  });

  it("the move-abroad form renders through the host's real panel, listing our countries", async () => {
    const factory = await loadBuiltFactory('relocation');
    __setModuleLoader('relocation', () => factory());
    const { default: ResidencyTimelinePanel } = await import('../../../components/ResidencyTimelinePanel.jsx');
    const { DEFAULT_INPUTS, planHorizonYear } = await import('../../../calculator');
    const { fireEvent } = await import('@testing-library/react');
    renderWithSimulation(<ResidencyTimelinePanel inputs={DEFAULT_INPUTS} onChange={() => {}} horizonYear={planHorizonYear(DEFAULT_INPUTS)} />, {}, { isPremium: true });
    fireEvent.click(screen.getByLabelText('Another country'));
    await waitFor(() => expect(screen.getByLabelText('Country')).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Portugal' })).toBeInTheDocument();
  });
});
