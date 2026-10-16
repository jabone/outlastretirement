import { test, expect } from '@playwright/test';
import { clickNav, openPlanSettings } from './navHelpers.js';

// URL routing, added 2026-08-19. These live in the E2E suite rather than
// alongside the jsdom component tests on purpose: the thing under test is
// the browser's own history stack -- pushState, popstate, the Back button,
// and a real reload -- and jsdom's implementation of those is close enough
// to fool a test while diverging from what Chrome actually does. Nothing
// here would be meaningful against a simulated history.
//
// The pure parse/format logic is unit-tested separately in
// src/__tests__/tabRouting.test.js, including a guard that re-derives the
// valid sub-tab ids from each component's source.

// Same three first-load modals as app.spec.js, but this file needs to
// navigate to a specific hash rather than '/', so it takes the URL as an
// argument instead of hardcoding the root.
async function openAt(page, hash) {
  // Every caller passes a root-relative hash ('/', '/#/settings'). The app
  // moved under /app in changelog 170, so the base goes on here rather than
  // in eleven call sites.
  await page.goto('/app' + hash);

  const overlay = page.locator('.modal-overlay');
  // /^Skip/ is anchored on purpose. An unanchored /Skip/i also matches the
  // onboarding screen's "Full Guided Interview" CARD, whose description
  // ends "...Skips anything that doesn't apply to you" -- so the helper
  // would pick the card, and every deep link in this file would get
  // overridden by the Interview's own setActiveTab('interview'). Anchoring
  // matches only the real "Skip -- I'll set this up myself" button (and the
  // legacy wizard's "Skip Wizard (Use Defaults)", which also starts with
  // the word).
  // 'Got it' is the What's New popup's own dismiss button (WhatsNewPopup.jsx).
  // It is not covered by /Close|Dismiss/ -- that popup's X carries no
  // accessible name -- so without it every test in this file hangs behind
  // the announcement banner the moment one is queued.
  const dismissButtonNames = [/I understand and accept/i, /^Skip/, /^Got it/i, /Close|Dismiss/i];
  // The What's New popup now loads on demand, so it can open a moment after
  // the first-load modals are gone: give it a short window to appear and
  // dismiss it too, instead of leaving it over the page.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 5; i++) {
      if (!(await overlay.first().isVisible().catch(() => false))) break;
      let dismissed = false;
      for (const name of dismissButtonNames) {
        const button = overlay.first().getByRole('button', { name });
        if (await button.first().isVisible().catch(() => false)) {
          await button.first().click();
          dismissed = true;
          break;
        }
      }
      if (!dismissed) break;
      await overlay.first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
    if (pass === 0) await overlay.first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  }
  await expect(overlay).toBeHidden();
}

test.describe('URL routing', () => {
  test('a bare visit lands on Dashboard and says so in the URL', async ({ page }) => {
    await openAt(page, '/');
    await expect(page.getByText('Portfolio Projection Horizon')).toBeVisible();
    // The router canonicalizes an empty hash rather than leaving the
    // address bar blank -- otherwise the first nav click would be the first
    // thing to ever write a hash, and Back would behave inconsistently.
    await expect(page).toHaveURL(/#\/dashboard$/);
  });

  test('clicking a nav item updates the URL', async ({ page }) => {
    await openAt(page, '/');
    await openPlanSettings(page);
    await expect(page).toHaveURL(/#\/settings$/);

    await clickNav(page, 'Risk & Stress');
    await expect(page).toHaveURL(/#\/risk$/);
  });

  test('a sub-tab click adds a second segment, and the default sub-tab omits it', async ({ page }) => {
    await openAt(page, '/#/settings');
    // Entering on the default section leaves the URL short.
    await expect(page).toHaveURL(/#\/settings$/);

    await page.getByRole('button', { name: 'Taxes & Roth' }).click();
    await expect(page).toHaveURL(/#\/settings\/taxes$/);
  });

  // The headline behavior: this is what "every reload returns to Dashboard"
  // used to mean, and it is the reason this work exists.
  test('reloading a deep link returns to the same section', async ({ page }) => {
    await openAt(page, '/#/settings/taxes');
    await expect(page.getByRole('button', { name: 'Taxes & Roth' })).toHaveClass(/active/);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Taxes & Roth' })).toHaveClass(/active/);
    await expect(page).toHaveURL(/#\/settings\/taxes$/);
  });

  test('Back walks through tabs instead of leaving the app', async ({ page }) => {
    await openAt(page, '/');
    await openPlanSettings(page);
    await expect(page).toHaveURL(/#\/settings$/);
    await clickNav(page, 'Scenarios');
    await expect(page).toHaveURL(/#\/scenarios$/);

    await page.goBack();
    await expect(page).toHaveURL(/#\/settings$/);
    // Not just the URL -- the rendered tab has to follow it back.
    await expect(page.getByRole('button', { name: 'Household' })).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/#\/scenarios$/);
  });

  test('Back from a sub-tab returns to the previous section, not the previous tab', async ({ page }) => {
    await openAt(page, '/#/settings');
    await page.getByRole('button', { name: 'Taxes & Roth' }).click();
    await expect(page).toHaveURL(/#\/settings\/taxes$/);

    await page.goBack();
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByRole('button', { name: 'Household' })).toHaveClass(/active/);
  });

  test('a renamed tab id still routes, and the address bar is rewritten to the current name', async ({ page }) => {
    // '#/ledger' predates the 2026-08-19 split. A bookmark saved then
    // should still work rather than silently landing on Dashboard.
    await openAt(page, '/#/ledger');
    await expect(page.getByText('Lifestyle Exp').first()).toBeVisible();
    await expect(page).toHaveURL(/#\/yearledger$/);
  });

  test('an unknown tab falls back to Dashboard rather than rendering a blank panel', async ({ page }) => {
    await openAt(page, '/#/nonsense');
    await expect(page.getByText('Portfolio Projection Horizon')).toBeVisible();
    await expect(page).toHaveURL(/#\/dashboard$/);
  });

  test('an unknown sub-tab keeps the tab and falls back to its first section', async ({ page }) => {
    // A truncated or mistyped section should still get you to the right
    // tab -- degrading to Dashboard here would be worse than useless.
    await openAt(page, '/#/settings/notarealsection');
    await expect(page.getByRole('button', { name: 'Household' })).toHaveClass(/active/);
    await expect(page).toHaveURL(/#\/settings$/);
  });

  test('a premium-only deep link falls back to Dashboard for a free visitor', async ({ page }) => {
    await openAt(page, '/#/portfolio/rebalance');
    await expect(page.getByText('Portfolio Projection Horizon')).toBeVisible();
    await expect(page).toHaveURL(/#\/dashboard$/);
  });

  test('sub-tab position survives leaving the tab and coming back', async ({ page }) => {
    // App.jsx keys the tab panel on activeTab, so the component fully
    // unmounts on navigation. This is the behavior that regressed for every
    // sub-tab before they were lifted to context.
    await openAt(page, '/#/settings');
    await page.getByRole('button', { name: 'Taxes & Roth' }).click();
    await expect(page).toHaveURL(/#\/settings\/taxes$/);

    await clickNav(page, 'Dashboard');
    await openPlanSettings(page);

    await expect(page.getByRole('button', { name: 'Taxes & Roth' })).toHaveClass(/active/);
    await expect(page).toHaveURL(/#\/settings\/taxes$/);
  });
});
