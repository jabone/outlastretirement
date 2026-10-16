// @vitest-environment jsdom
//
// PremiumTab.jsx -- the Premium explainer, added 2026-08-20.
//
// The bug class these guard against is not layout. It is the page quietly
// becoming dishonest: a Buy button appearing before a billing flow exists,
// a price showing up before one is set, an aspirational feature sliding
// into a list that is supposed to describe shipped software only, or the
// page selling Premium to somebody who already paid for it. Each of those
// is a copy edit away at any time, and none of them would break a render.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PremiumTab from '../../components/tabs/PremiumTab';
import {
  PREMIUM_FEATURES, PREMIUM_AREAS, PREMIUM_FACTS, PREMIUM_NAME,
  CONTACT_EMAIL, REQUEST_SUBJECT, buildRequestMailto,
} from '../../config/premiumOffering';
import { renderWithSimulation } from '../testUtils';

afterEach(() => { vi.restoreAllMocks(); });

describe('PremiumTab -- free user', () => {
  it('renders every feature group and its bullets from the shared config', () => {
    renderWithSimulation(<PremiumTab />);
    for (const f of PREMIUM_FEATURES) {
      expect(screen.getByText(f.title)).toBeTruthy();
      for (const p of f.points) expect(screen.getByText(p)).toBeTruthy();
    }
  });

  it('names every plan field that linking takes over, per area', () => {
    // Per area since 2026-09-06: the two areas link different fields, and
    // attributing one area's to both would be a small lie on the page most
    // likely to be checked against reality.
    renderWithSimulation(<PremiumTab />);
    // An area that links nothing (Relocation & Residency adds years abroad;
    // it takes over no field) gets no heading rather than an empty one.
    const linking = PREMIUM_AREAS.filter((area) => area.linkedFields.length > 0);
    expect(linking.length).toBeGreaterThan(1);
    for (const area of linking) {
      expect(screen.getByText(`From ${area.name}`)).toBeTruthy();
      for (const f of area.linkedFields) expect(screen.getByText(f)).toBeTruthy();
    }
    for (const area of PREMIUM_AREAS.filter((a) => a.linkedFields.length === 0)) {
      expect(screen.queryByText(`From ${area.name}`)).toBeNull();
    }
  });

  it('labels each feature group with the area it belongs to', () => {
    // The grid mixes both areas, so a group with no label leaves a reader
    // guessing which half of the product it is part of.
    renderWithSimulation(<PremiumTab />);
    for (const area of PREMIUM_AREAS) {
      expect(screen.getAllByText(area.name).length).toBeGreaterThan(0);
    }
  });

  it('describes Premium as one product, not as one of its halves', () => {
    // Regression guard for the naming bug fixed 2026-09-06: PREMIUM_NAME
    // used to be 'Detailed Holdings', so a Retirement Spending subscriber
    // was told a feature they may not use was what they had bought.
    expect(PREMIUM_NAME).toBe('Premium');
    expect(PREMIUM_AREAS.map((a) => a.name)).toContain('Detailed Holdings');
    expect(PREMIUM_AREAS.map((a) => a.name)).toContain('Retirement Spending');
    // Every area must say where its CTA lands.
    for (const area of PREMIUM_AREAS) expect(area.tab).toBeTruthy();
  });

  it('only claims features that exist, in every area', () => {
    // The file's hard rule. A structural check, not a content one: every
    // group needs a title, a blurb and at least one point, so an
    // aspirational stub cannot slip in half-written.
    for (const f of PREMIUM_FEATURES) {
      expect(f.title).toBeTruthy();
      expect(f.blurb).toBeTruthy();
      expect(f.points.length).toBeGreaterThan(0);
      expect(f.areaName).toBeTruthy();
    }
  });

  it('answers every question in PREMIUM_FACTS', () => {
    renderWithSimulation(<PremiumTab />);
    for (const f of PREMIUM_FACTS) expect(screen.getByText(f.q)).toBeTruthy();
  });

  // The CTA is a mailto and nothing else. If someone later swaps this for
  // a form post, this test should fail loudly -- a form needs a server,
  // and the no-backend architecture is a deliberate product position
  // (PRODUCT_STRATEGY.md Goal 2), not an accident of being early.
  it('the only call to action is a mailto to the real contact address', () => {
    const { container } = renderWithSimulation(<PremiumTab />);
    // The one other link is the public Free and Premium comparison (a static
    // page on this site, changelog 312) -- information, not a way to buy.
    const all = [...container.querySelectorAll('a[href]')];
    expect(all.filter((a) => !a.getAttribute('href').startsWith('mailto:')).map((a) => a.getAttribute('href'))).toEqual(['/premium']);
    const links = all.filter((a) => a.getAttribute('href').startsWith('mailto:'));
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(a.getAttribute('href').startsWith('mailto:')).toBe(true);
    expect(links.every(a => a.getAttribute('href').includes(CONTACT_EMAIL))).toBe(true);
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });

  it('the mailto carries a pre-filled subject and body', () => {
    const href = buildRequestMailto();
    const url = new URL(href);
    expect(url.protocol).toBe('mailto:');
    const params = new URLSearchParams(url.search);
    expect(params.get('subject')).toBe(REQUEST_SUBJECT);
    expect(params.get('body')).toContain('Premium');
  });

  // The whole reason the old Plan Settings button was inert. There is no
  // billing flow; anything that reads as a checkout would be a lie.
  it('shows no price and no purchase affordance', () => {
    const { container } = renderWithSimulation(<PremiumTab />);

    // No dollar figure anywhere. This is the prose check, and it is the
    // only one that can be a bare text scan -- a price is always a number.
    expect(container.textContent).not.toMatch(/\$\d/);

    // Everything else has to look at controls, not words. The page says
    // "There is no checkout here" and "no subscription, and nothing to
    // cancel" on purpose, so scanning body text for "checkout" or
    // "subscribe" would fail on the very sentences that make the page
    // honest. What actually matters is that nothing here is *clickable*
    // in a way that implies a transaction.
    const controls = [...container.querySelectorAll('button, a[href], [role="button"]')];
    expect(controls.length).toBeGreaterThan(0);
    for (const el of controls) {
      expect(
        el.textContent,
        `"${el.textContent.trim()}" reads like a purchase control, but no billing flow exists`,
      ).not.toMatch(/\b(buy|purchase|checkout|subscribe|upgrade now|start .*trial|add to cart|pay)\b/i);
    }
  });

  it('states plainly that access is invite-only', () => {
    const { container } = renderWithSimulation(<PremiumTab />);
    expect(container.textContent).toMatch(/invite-only/i);
  });

  // Guards the exact drift that made this work necessary: the old copy
  // called shipped software "in development ... Not available to purchase
  // yet". Everything listed here must be something that runs today.
  it('promises nothing as future or unreleased', () => {
    const { container } = renderWithSimulation(<PremiumTab />);
    // Note "roadmap" is deliberately absent from this pattern: the
    // Retirement Roadmap is the shipped name of a real feature on the
    // Retirement Income sub-tab, not a promise about the future.
    expect(container.textContent).not.toMatch(/coming soon|in development|waitlist|under construction|not yet (built|available|released)/i);
  });
});

describe('PremiumTab -- existing subscriber', () => {
  it('does not advertise to someone who already has it, and offers the real tab instead', async () => {
    const setActiveTab = vi.fn();
    const { container } = renderWithSimulation(<PremiumTab />, { setActiveTab }, { isPremium: true, tier: 'premium' });

    expect(container.textContent).toMatch(/Premium is active/i);
    expect(container.textContent).not.toMatch(/invite-only/i);
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();

    // One CTA per area, each naming where it lands -- these are navigation
    // buttons, so they take the AREA name rather than the product name.
    for (const area of PREMIUM_AREAS) {
      expect(screen.getByRole('button', { name: new RegExp(`Open ${area.name}`, 'i') })).toBeTruthy();
    }
    await userEvent.click(screen.getByRole('button', { name: /Open Detailed Holdings/i }));
    expect(setActiveTab).toHaveBeenCalledWith('portfolio');
    await userEvent.click(screen.getByRole('button', { name: /Open Retirement Spending/i }));
    expect(setActiveTab).toHaveBeenCalledWith('settings');
  });
});
