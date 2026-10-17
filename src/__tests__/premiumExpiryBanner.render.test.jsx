// @vitest-environment jsdom
//
// The Premium expiry banner has to be somewhere a person will actually see
// it, WITHOUT covering the numbers they opened the app for.
//
// Two failures, both shipped:
//
//   changelog 183 -- built the banner with no positioning and mounted it
//   after </main>, alongside the modals. Every piece of its logic was right
//   (the seven-day window, the dismissal keyed to the expiry instant, the
//   seconds-to-milliseconds conversion) and premiumExpiry.test.js covered
//   all of it and passed. But it rendered in normal flow BELOW the entire
//   page, so it sat under every tab's content for five weeks. Nobody saw
//   it once. It was found only when a real key was pasted in and the
//   obvious question got asked: where is the banner supposed to be?
//
//   changelog 188 -- pinned it position:fixed to the top of the viewport.
//   Now visible, and covering the Annual Lifestyle and Ending Balance
//   cards. An invisible notice traded for one that hides the figures.
//
// What both have in common is that the banner floated instead of taking up
// space. It now sits in flow above the KPI grid, the slot MigrationNotice
// already uses for exactly this reason. So these tests assert placement,
// not merely that the component decides to render -- the question the
// original tests never asked.
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { screen } from '@testing-library/react';
import { renderWithSimulation } from './testUtils';
import PremiumExpiryBanner from '../components/PremiumExpiryBanner';
import { PREMIUM_EXPIRY_DISMISS_KEY } from '../utils/premiumExpiry';

const inDays = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
const renderWithExpiry = (expiresAt) =>
  renderWithSimulation(<PremiumExpiryBanner />, {}, { premiumJwtExpiresAt: expiresAt });

describe('PremiumExpiryBanner placement', () => {
  beforeEach(() => localStorage.removeItem(PREMIUM_EXPIRY_DISMISS_KEY));

  it('renders nothing when the key is comfortably in date', () => {
    const { container } = renderWithExpiry(inDays(60));
    expect(container).toBeEmptyDOMElement();
  });

  it('does not float over the page', () => {
    // The changelog 188 regression. Fixed or absolute positioning here
    // means the banner sits on top of the KPI cards rather than above
    // them. Taking up space is the whole point.
    renderWithExpiry(inDays(3));
    const el = screen.getByRole('status');
    expect(['fixed', 'absolute', 'sticky']).not.toContain(el.style.position);
    expect(el.style.zIndex).toBe('');
  });

  it('still says how long is left, and where to write', () => {
    renderWithExpiry(inDays(3));
    expect(screen.getByRole('status').textContent).toMatch(/3 days from now/);
    expect(screen.getByRole('link').getAttribute('href')).toMatch(/^mailto:/);
  });

  it('reads as past tense once the key has expired', () => {
    renderWithExpiry(inDays(-2));
    expect(screen.getByRole('status').textContent).toMatch(/ended on/);
  });
});

describe('PremiumExpiryBanner is mounted where it will be seen', () => {
  // The changelog 183 regression was a MOUNT-SITE bug, not a style bug:
  // the component was fine, it was just hung below </main>. That can only
  // be caught by looking at where App.jsx puts it, so this reads the
  // source rather than the DOM (same approach as fontsSelfHosted.test.js).
  const app = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '..', 'App.jsx'), 'utf8'
  );
  const mount = app.indexOf('<PremiumExpiryBanner />');
  const mainClose = app.indexOf('</main>');
  // The grid's className is a template since changelog 294 (it collapses
  // on a phone); find it by its id.
  const kpiGrid = app.indexOf('id="kpi-grid"');

  it('is mounted inside <main>, not after it', () => {
    expect(mount).toBeGreaterThan(-1);
    expect(mainClose).toBeGreaterThan(-1);
    expect(mount).toBeLessThan(mainClose);
  });

  it('is mounted above the KPI grid', () => {
    expect(kpiGrid).toBeGreaterThan(-1);
    expect(mount).toBeLessThan(kpiGrid);
  });

  it('is still gated so it cannot stack on the legal disclaimer', () => {
    const line = app.slice(app.lastIndexOf('\n', mount), mount);
    expect(line).toContain('!showDisclaimer');
  });
});
