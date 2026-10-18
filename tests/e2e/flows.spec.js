import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { clickNav, openPlanSettings } from './navHelpers.js';

// The four flows where a regression loses someone's plan or their
// purchase: first-visit onboarding, Backup Everything and Restore, the
// Premium key field, and leaving the demo with your own plan intact. Each
// runs in a fresh browser context against the production build.

// A distinctive figure that no default or demo plan carries, so a value
// seen after a reload can only have come from the step that typed it.
const MARKER_SPENDING = 123456;

async function acceptDisclaimer(page) {
  const overlay = page.locator('.modal-overlay');
  const accept = overlay.getByRole('button', { name: /I understand and accept/i });
  if (await accept.first().isVisible().catch(() => false)) await accept.first().click();
}

// Clicks through every first-load modal (disclaimer, onboarding choice,
// What's New) -- the same loop app.spec.js uses.
async function dismissAllModals(page) {
  const overlay = page.locator('.modal-overlay');
  const names = [/I understand and accept/i, /^Skip/, /^Got it/i, /Close|Dismiss/i];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 5; i++) {
      if (!(await overlay.first().isVisible().catch(() => false))) break;
      let dismissed = false;
      for (const name of names) {
        const button = overlay.first().getByRole('button', { name });
        if (await button.first().isVisible().catch(() => false)) { await button.first().click(); dismissed = true; break; }
      }
      if (!dismissed) break;
      await overlay.first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
    if (pass === 0) await overlay.first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  }
  await expect(overlay).toBeHidden();
}

async function openFresh(page) {
  await page.goto('/app/');
  await dismissAllModals(page);
}

// Types the marker into Retirement Spending under Plan Settings and waits
// for it to land in storage.
async function setMarkerSpending(page) {
  await openPlanSettings(page);
  // exact: the Plan nav item's description also mentions spending.
  await page.getByRole('button', { name: 'Spending', exact: true }).click();
  const header = page.getByRole('button', { name: /Retirement Spending Target/i });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  const field = page.locator('#field-lifestyleExpense');
  await field.scrollIntoViewIfNeeded();
  // The comma-formatting input keeps its text on fill(); replace it.
  await field.click();
  await field.press('ControlOrMeta+a');
  await field.pressSequentially(String(MARKER_SPENDING));
  await field.blur();
  await expect.poll(() => page.evaluate(() => {
    try { const raw = JSON.parse(localStorage.getItem('retire_plan_inputs') || '{}'); return (raw.inputs || raw).lifestyleExpense; } catch { return null; }
  })).toBe(MARKER_SPENDING);
}

const storedSpending = (page) => page.evaluate(() => {
  try { const raw = JSON.parse(localStorage.getItem('retire_plan_inputs') || '{}'); return (raw.inputs || raw).lifestyleExpense; } catch { return null; }
});

// The app's own dialog (AppDialog.jsx): one role=dialog at a time.
const dialog = (page) => page.getByRole('dialog');

test.describe('first visit', () => {
  test('the Quick Setup wizard runs to "Generate My Plan!" and what was typed is the plan', async ({ page }) => {
    await page.goto('/app/');
    await acceptDisclaimer(page);
    const overlay = page.locator('.modal-overlay').first();
    await overlay.getByRole('button', { name: /Quick Setup Wizard/i }).click();

    // Step 1 is Household: the birth year is the first field.
    const birthYear = page.locator('#field-birthYear1');
    await expect(birthYear).toBeVisible();
    await birthYear.fill('1970');
    await birthYear.blur();

    for (let step = 1; step < 6; step++) {
      await overlay.getByRole('button', { name: /Next Step/i }).click();
    }
    await overlay.getByRole('button', { name: /Generate My Plan/i }).click();
    await expect(overlay).toBeHidden({ timeout: 10_000 });
    // What's New may open once the wizard is gone.
    await dismissAllModals(page);

    expect(await page.evaluate(() => localStorage.getItem('retire_plan_onboarding_completed'))).toBe('true');
    expect(await page.evaluate(() => { const raw = JSON.parse(localStorage.getItem('retire_plan_inputs') || '{}'); return (raw.inputs || raw).birthYear1; })).toBe(1970);

    // A reload does not re-open onboarding, and the dashboard renders.
    await page.reload();
    await dismissAllModals(page);
    await expect(page.locator('.modal-overlay')).toBeHidden();
    await expect(page.getByRole('navigation')).toBeVisible();
  });
});

test.describe('Backup Everything and Restore', () => {
  test('a plan survives a wiped browser through the backup file', async ({ page }, testInfo) => {
    await openFresh(page);
    await setMarkerSpending(page);

    await clickNav(page, 'Preferences');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('main').getByRole('button', { name: /^Backup Everything/i }).click();
    const download = await downloadPromise;
    const file = testInfo.outputPath('backup.json');
    await download.saveAs(file);
    await expect(dialog(page)).toContainText(/Backup Saved/i);
    await dialog(page).getByRole('button', { name: /^OK$/ }).click();

    // The file is the plan: it carries the marker, in plain JSON.
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    expect(parsed.activeInputs?.lifestyleExpense).toBe(MARKER_SPENDING);

    // Wipe the browser, as "Clear browsing data" would.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await dismissAllModals(page);
    expect(await storedSpending(page)).not.toBe(MARKER_SPENDING);

    await clickNav(page, 'Preferences');
    await page.getByRole('main').locator('input[type="file"]').first().setInputFiles(file);
    await expect(dialog(page)).toContainText(/replace everything currently in this browser/i);
    await Promise.all([
      page.waitForLoadState('load'),
      dialog(page).getByRole('button', { name: /Restore & Reload/i }).click(),
    ]);
    await expect.poll(() => storedSpending(page), { timeout: 15_000 }).toBe(MARKER_SPENDING);
  });
});

test.describe('Premium Access Key', () => {
  test('a forged key is refused and shown as invalid; clearing the field removes it', async ({ page }) => {
    await openFresh(page);
    await clickNav(page, 'Preferences');

    const status = page.getByText(/^(Not set|Invalid or expired|Active until)/).first();
    await expect(status).toHaveText(/Not set/);

    // A JWT whose payload says premium: true but whose signature is not
    // ours. The payload is base64, not encrypted: this is exactly what a
    // hand-crafted "key" looks like, and it must unlock nothing.
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ premium: true, exp: Math.floor(Date.now() / 1000) + 86400 * 30 })).toString('base64url');
    const forged = `${header}.${payload}.${'A'.repeat(342)}`;

    await page.getByRole('button', { name: /^Premium Access Key/ }).click();
    const input = dialog(page).locator('input[type="text"]');
    await input.fill(forged);
    await dialog(page).getByRole('button', { name: /^(Confirm|OK|Save)$/ }).click();
    await expect(status).toHaveText(/Invalid or expired/, { timeout: 10_000 });
    expect(await page.evaluate(() => localStorage.getItem('cfe_premium_jwt'))).toBe(forged);
    // No Premium part unlocked: the Premium tab shows the locked card, not
    // a loaded module.
    await clickNav(page, 'Premium');
    await expect(page.getByRole('main')).toContainText(/Premium/);
    await expect(page.getByRole('main')).not.toContainText(/Add Holding|Import Statement/i);

    await clickNav(page, 'Preferences');
    await page.getByRole('button', { name: /^Premium Access Key/ }).click();
    await dialog(page).locator('input[type="text"]').fill('');
    await dialog(page).getByRole('button', { name: /^(Confirm|OK|Save)$/ }).click();
    await expect(status).toHaveText(/Not set/);
    expect(await page.evaluate(() => localStorage.getItem('cfe_premium_jwt'))).toBeNull();
  });
});

test.describe('the demo', () => {
  test('Exit Demo puts your own plan back exactly', async ({ page }) => {
    test.setTimeout(180_000);
    await openFresh(page);
    await setMarkerSpending(page);

    // A demo link over an existing plan asks first.
    await page.goto('/app/?demo=1');
    await page.getByRole('button', { name: 'Open the Demo' }).click();
    // Entering simulates every demo scenario, then reloads into the demo.
    const banner = page.getByRole('status').filter({ hasText: /Exit Demo/i });
    await expect(banner).toBeVisible({ timeout: 150_000 });
    await dismissAllModals(page);
    expect(await storedSpending(page)).not.toBe(MARKER_SPENDING);

    await Promise.all([
      page.waitForLoadState('load'),
      banner.getByRole('button', { name: /Exit Demo/i }).click(),
    ]);
    await expect(banner).toBeHidden({ timeout: 30_000 });
    await expect.poll(() => storedSpending(page), { timeout: 30_000 }).toBe(MARKER_SPENDING);
  });
});
