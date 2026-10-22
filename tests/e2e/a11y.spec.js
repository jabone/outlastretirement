import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { clickNav, openPlanSettings } from './navHelpers.js';

// Automated accessibility scan (axe-core, WCAG 2.1 A and AA rules) of the
// public pages and the app's main screens, on the production build. It
// fails on any SERIOUS or CRITICAL violation; moderate and minor ones are
// printed so they can be fixed without blocking a release. Not a substitute
// for a screen-reader pass: axe finds roughly a third of real issues, the
// mechanical ones (names, contrast, landmarks, ARIA misuse).

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function scan(page, label) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const other = results.violations.filter((v) => !blocking.includes(v));
  const describe = (vs) => vs.map((v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n    ')}`).join('\n  ');
  if (other.length) console.log(`[a11y] ${label}: non-blocking\n  ${describe(other)}`);
  expect(blocking, `${label}: serious or critical accessibility violations\n  ${describe(blocking)}`).toEqual([]);
}

// The app with its first-visit dialogs already answered, so each scan sees
// the screen and not a modal.
async function openApp(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('retire_plan_disclaimer_accepted', 'true');
      localStorage.setItem('retire_plan_onboarding_completed', 'true');
      localStorage.setItem('retire_plan_whatsnew_last_seen_id', '999999');
    } catch { /* storage blocked: the scan still runs, behind whatever opens */ }
  });
  await page.goto('/app/');
  await expect(page.getByRole('navigation')).toBeVisible();
  // The What's New welcome can still open a moment after load; close it
  // the way a visitor would, so the scan sees the screen.
  const gotIt = page.getByRole('button', { name: /^Got it/i });
  try {
    await gotIt.waitFor({ state: 'visible', timeout: 4000 });
    await gotIt.click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
  } catch { /* it did not open */ }
}

test.describe('accessibility: public pages', () => {
  for (const path of ['/', '/privacy', '/terms', '/accessibility', '/verify', '/premium', '/learn', '/how-the-math-works', '/changelog']) {
    test(`${path} has no serious or critical violations`, async ({ page }) => {
      await page.goto(path);
      await scan(page, path);
    });
  }
});

test.describe('accessibility: the app', () => {
  test('Dashboard', async ({ page }) => {
    await openApp(page);
    await scan(page, 'Dashboard');
  });

  test('Plan settings (Assumptions & Risk)', async ({ page }) => {
    await openApp(page);
    await openPlanSettings(page);
    await page.getByRole('button', { name: 'Assumptions & Risk' }).first().click();
    await expect(page.getByTestId('investment-fees')).toBeVisible();
    await scan(page, 'Plan settings');
  });

  test('Year by Year', async ({ page }) => {
    await openApp(page);
    await clickNav(page, 'Year by Year');
    await scan(page, 'Year by Year');
  });

  test('Retirement Readiness', async ({ page }) => {
    await openApp(page);
    await clickNav(page, 'Retirement Readiness');
    await scan(page, 'Retirement Readiness');
  });

  test('Help', async ({ page }) => {
    await openApp(page);
    await clickNav(page, 'Help');
    await scan(page, 'Help');
  });
});
