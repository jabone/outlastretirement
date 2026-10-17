// @vitest-environment jsdom
// The host side of PREMIUM_MODULE_CONTRACT.md: PremiumMount's states, the
// registry's checks on a module instance, and contract-version matching.
// Uses the registry's test seam to install stub module loaders, so none
// of this depends on a module server.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import PremiumMount from '../../../premium/PremiumMount.jsx';
import { __setModuleLoader, __resetModuleCache } from '../../../premium/registry.js';
import { CONTRACT_VERSION, MOUNT_POINTS, AREAS, areaForMount, isCompatibleContract } from '../../../premium/contract.js';
import { renderWithSimulation } from '../../testUtils.jsx';

// The demo delivery key is null in the repo until one is minted; the demo
// tests below need one present (its value is never read by a stub loader),
// and one test sets it back to null.
const demoKey = { value: 'demo.delivery.key' };
vi.mock('../../../config/demoDeliveryKey', () => ({
  get DEMO_DELIVERY_KEY() { return demoKey.value; },
  DEMO_AREAS: ['holdings'],
}));

const stub = (overrides = {}) => () => ({
  area: 'holdings',
  contractVersion: CONTRACT_VERSION,
  version: 'test',
  mounts: { portfolioTab: ({ host }) => <div>stub tab for {host.entitlement.licensedTo || 'someone'}</div> },
  ...overrides,
});

describe('contract constants', () => {
  it('every mount point names a known area', () => {
    for (const area of Object.values(MOUNT_POINTS)) expect(AREAS).toContain(area);
    expect(areaForMount('portfolioTab')).toBe('holdings');
    expect(() => areaForMount('nope')).toThrow(/Unknown Premium mount point/);
  });

  it('accepts same-major, not-newer-minor; rejects everything else', () => {
    const [major, minor] = CONTRACT_VERSION.split('.').map(Number);
    expect(isCompatibleContract(CONTRACT_VERSION)).toBe(true);
    expect(isCompatibleContract(`${major}.${minor + 1}`)).toBe(false);
    expect(isCompatibleContract(`${major + 1}.0`)).toBe(false);
    expect(isCompatibleContract(undefined)).toBe(false);
    expect(isCompatibleContract('garbage')).toBe(false);
  });
});

describe('PremiumMount', () => {
  beforeEach(() => { __resetModuleCache(); __setModuleLoader('holdings', stub()); });

  it('renders the locked element and loads nothing without an entitlement', async () => {
    renderWithSimulation(<PremiumMount id="portfolioTab" locked={<div>locked card</div>} />, {}, { isPremium: false, portfolioPreview: false });
    expect(screen.getByText('locked card')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/stub tab/)).toBeNull();
  });

  it('loads the module and renders its component with host when premium', async () => {
    renderWithSimulation(<PremiumMount id="portfolioTab" fallback={<div>loading</div>} />, {}, { isPremium: true });
    expect(screen.getByText('loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/stub tab for/)).toBeInTheDocument());
  });

  it('mounts in preview mode too (read-only demo), per the entitlement contract', async () => {
    renderWithSimulation(<PremiumMount id="portfolioTab" />, {}, { isPremium: false, portfolioPreview: true });
    await waitFor(() => expect(screen.getByText(/stub tab for/)).toBeInTheDocument());
  });

  // Demo Mode without a key is preview for every mount, but only Detailed
  // Holdings is part of the demo: the other areas must show their locked
  // cards, not try to load and then report a rejected key to someone who
  // never had one.
  it('in preview, a mount outside the demo areas shows locked and loads nothing', async () => {
    __setModuleLoader('readiness', () => { throw new Error('must not be called'); });
    renderWithSimulation(<PremiumMount id="readinessDetail" locked={<div>locked card</div>} />, {}, { isPremium: false, portfolioPreview: true });
    expect(screen.getByText('locked card')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/could not be loaded/)).toBeNull();
  });

  it('in preview with no demo delivery key minted, even the holdings mount shows locked and loads nothing', async () => {
    demoKey.value = null;
    try {
      __setModuleLoader('holdings', () => { throw new Error('must not be called'); });
      renderWithSimulation(<PremiumMount id="portfolioTab" locked={<div>locked card</div>} />, {}, { isPremium: false, portfolioPreview: true });
      expect(screen.getByText('locked card')).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByText(/Premium key was not accepted/)).toBeNull();
    } finally {
      demoKey.value = 'demo.delivery.key';
    }
  });

  it('shows the locked element when the module leaves this mount unfilled', async () => {
    __setModuleLoader('holdings', stub({ mounts: {} }));
    renderWithSimulation(<PremiumMount id="portfolioTab" locked={<div>locked card</div>} fallback={<div>loading</div>} />, {}, { isPremium: true });
    await waitFor(() => expect(screen.getByText('locked card')).toBeInTheDocument());
  });

  it('never leaves a blank tab: a load failure renders a card', async () => {
    __setModuleLoader('holdings', () => Promise.reject(new Error('network')));
    renderWithSimulation(<PremiumMount id="portfolioTab" />, {}, { isPremium: true });
    await waitFor(() => expect(screen.getByText(/could not be loaded/)).toBeInTheDocument());
    expect(screen.getByText(/Check your connection/)).toBeInTheDocument();
  });

  it('a contract mismatch asks for a reload rather than failing silently', async () => {
    __setModuleLoader('holdings', stub({ contractVersion: '99.0' }));
    renderWithSimulation(<PremiumMount id="portfolioTab" />, {}, { isPremium: true });
    await waitFor(() => expect(screen.getByText(/newer version of the app/)).toBeInTheDocument());
  });

  it('rejects a module that reports the wrong area', async () => {
    __setModuleLoader('holdings', stub({ area: 'spending' }));
    renderWithSimulation(<PremiumMount id="portfolioTab" />, {}, { isPremium: true });
    await waitFor(() => expect(screen.getByText(/could not be loaded/)).toBeInTheDocument());
  });
});
