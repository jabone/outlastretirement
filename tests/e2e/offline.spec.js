import { test, expect } from '@playwright/test';
import { clickNav, openPlanSettings } from './navHelpers.js';

// The offline promise, end to end against the production build: one online
// visit installs the service worker and its precache; after that the app
// loads, and its lazily loaded tabs open, with the network off. The
// marketing pages are deliberately NOT served by the worker (review
// 2026-09-30, S10: an installed user was reading the Terms as they were at
// install time).
test.describe('offline', () => {
  test('after one visit, /app/ reloads and its lazy tabs open with the network off', async ({ page, context }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      localStorage.setItem('retire_plan_disclaimer_accepted', 'true');
      localStorage.setItem('retire_plan_onboarding_completed', 'true');
    });
    await page.goto('/app/');
    await expect(page.getByText('Portfolio Projection Horizon')).toBeVisible();
    // Registration happens after the load event; ready resolves once the
    // worker is active, i.e. once every precache entry is stored.
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('Portfolio Projection Horizon')).toBeVisible();

    await openPlanSettings(page);
    await expect(page.getByRole('button', { name: 'Household', exact: true })).toBeVisible();
    await clickNav(page, 'Year by Year');
    await expect(page.getByText('Lifestyle Exp').first()).toBeVisible();
    await clickNav(page, 'Help');
    await expect(page.getByRole('heading', { name: 'Help', level: 1 })).toBeVisible();
    await clickNav(page, 'Risk & Stress');
    await expect(page.getByText('Select Stress Scenario Model')).toBeVisible();
    await context.setOffline(false);
  });

  test('the Terms page comes from the network, never from the app’s cache', async ({ page, context }) => {
    await page.goto('/app/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    const res = await page.goto('/terms.html');
    expect(res.ok()).toBe(true);
    expect(res.fromServiceWorker()).toBe(false);
    await context.setOffline(true);
    const offline = await page.goto('/terms.html').catch((e) => e);
    // Offline, the page is simply unavailable rather than a stale copy.
    expect(offline instanceof Error).toBe(true);
    await context.setOffline(false);
  });
});
