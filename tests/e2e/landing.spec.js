import { test, expect } from '@playwright/test';

// The marketing landing page at the site root (changelog 170). It is a
// static document with no build step of its own, which is exactly why it
// needs an E2E test: nothing else in the suite would notice if a CTA
// stopped resolving or the page started loading something off-origin.
//
// The demo CTA is only checked as far as the app's front door here. What
// happens after -- the payload, the snapshot, the landing tab -- is
// covered by demoDeepLink.test.js and demoMode.test.js without paying for
// five Monte Carlo runs in a browser.

test.describe('landing page', () => {
  test('serves the marketing page at the root, not the app', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('does the money outlast you');
    // The app's shell must not be here. A bad Vite input config would
    // silently serve the SPA at both paths and this is what would catch it.
    await expect(page.locator('#root')).toHaveCount(0);
  });

  test('wears the brand: the lockup renders, and it is an image not type', async ({ page }) => {
    await page.goto('/');
    const mark = page.locator('header .brand img');
    await expect(mark).toHaveAttribute('alt', 'OutlastRetirement');
    // Rendered, not merely present. A broken src still matches a selector;
    // a mark that failed to load reports naturalWidth 0.
    expect(await mark.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
    // The brand ground, straight off the tokens.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe('rgb(15, 39, 68)');
  });

  test('requests nothing from another origin', async ({ page }) => {
    const offsite = [];
    page.on('request', (r) => {
      const host = new URL(r.url()).hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') offsite.push(r.url());
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(offsite).toEqual([]);
  });

  // Clicked, not just inspected. The href assertions above would still pass
  // if '/app/' resolved to nothing -- which is exactly the bug this covers:
  // a bare '/app' in the dev server falls back to the landing page, so the
  // button silently reloads this same page.
  test('clicking Open the app actually leaves the landing page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Open the app' }).first().click();
    await expect(page.locator('#root')).toHaveCount(1);
    await expect(page).toHaveURL(/\/app\//);
  });

  test('the primary CTA reaches the app', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('link', { name: 'Try the Demo Plan' }).first();
    await expect(cta).toHaveAttribute('href', '/app/?demo=1');
    const secondary = page.getByRole('link', { name: 'Open the app' }).first();
    await expect(secondary).toHaveAttribute('href', '/app/');
  });

  test('does not scroll sideways on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto('/');
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
