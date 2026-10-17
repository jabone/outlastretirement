import { test, expect } from '@playwright/test';
import { clickNav, openPlanSettings, openPlanInterview } from './navHelpers.js';

// Shared by every test.describe block below -- navigates to the app fresh
// and clicks through the three first-load modals (legal disclaimer, the
// onboarding choice screen, and the What's New popup) so each test starts
// from a known, unobstructed state.
//
// Onboarding's skip button text changed when first-entry switched from
// jumping straight into the old step wizard to a CHOICE screen (Quick Setup
// vs. Full Interview vs. skip) -- it now reads "Skip -- I'll set this up
// myself" rather than the old wizard's "Skip Wizard (Use Defaults)".
// Matching broadly on /Skip/i covers whichever one is actually visible
// (only one ever is) without hardcoding either exact label, so this helper
// doesn't silently break again the next time either wording changes.
async function dismissOnboardingModals(page) {
  // '/app/' and not '/': the site root is the marketing landing page as
  // of changelog 170. The app is one level down.
  await page.goto('/app/');

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

  // Three independent fixed-timeout waits (the previous version of this
  // helper) raced against modals that render asynchronously and in
  // variable order/timing -- a modal appearing just after its own check
  // gave up looking for it was left open and silently swallowed by the
  // try/catch, blocking every click for the rest of the test with no
  // visible error until a much later, unrelated assertion timed out
  // instead. Polling for *any* visible .modal-overlay and dismissing
  // whichever known button is currently showing, looping until none
  // remain, removes that race entirely.
  // The What's New popup now loads on demand, so it can open a moment after
  // the first-load modals are gone: give it a short window to appear and
  // dismiss it too, instead of leaving it over the page.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 5; i++) {
      if (!(await overlay.first().isVisible().catch(() => false))) break;
  
      let dismissed = false;
      for (const name of dismissButtonNames) {
        // Scoped to the overlay itself, not page-wide: a page-wide
        // getByRole('button', { name: /Skip/i }) also matches the sidebar's
        // "Full Interview" nav item, whose aria-label description text
        // ("...skips anything that doesn't apply to you") satisfies the same
        // regex. That mismatch cost a full 30s timeout retrying a click on a
        // nav item hidden behind the overlay -- a real element, just the
        // wrong one. Restricting the search to the overlay's own descendants
        // rules that out structurally instead of by tightening the regex.
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

  // Deterministic exit condition: fail here, with a clear cause, if
  // anything is still blocking the page -- not several steps later as a
  // confusing "click timed out" on an unrelated element.
  await expect(overlay).toBeHidden();
}

// Every sidebar nav click below is scoped to page.getByRole('navigation')
// rather than a bare page.getByText(label, { exact: true }). App.jsx also
// renders a print-only report (hidden via CSS outside @media print, but
// still present in the DOM) that repeats several section titles verbatim --
// e.g. an <h3>Risk Analysis</h3> -- which collides with the identical nav
// label and throws a strict-mode "resolved to 2 elements" error. Scoping to
// the <nav> landmark sidesteps that regardless of what the print report
// contains next.
test.describe('OutlastRetirement app', () => {

  test.beforeEach(async ({ page }) => {
    await dismissOnboardingModals(page);
  });

  test('should load the dashboard and render charts', async ({ page }) => {
    // Navigate to Dashboard if not already there
    await clickNav(page, 'Dashboard');

    // Verify the projection horizon chart container is visible
    await expect(page.getByText('Portfolio Projection Horizon')).toBeVisible();

    // The plan verdict card -- the Dashboard's own content, not a nav label.
    await expect(page.getByText('Will It Last?', { exact: true })).toBeVisible();
  });

  test('should allow changing inputs in the Settings tab', async ({ page }) => {
    await openPlanSettings(page);

    // Targets the salary field by its own label rather than
    // input[type=number].first(). It used to be the latter, which was
    // correct when "Basic Parameters" was the default section and salary
    // sat near the top of it. After the 2026-08-19 regroup the default
    // section is Household, whose first number input is Primary's Birth
    // Year -- so this test was quietly setting a birth year to 150000,
    // producing a nonsense projection and an empty Dashboard. It failed on
    // the LAST assertion, several steps from the actual mistake.
    // exact: true -- without it this also matches the Plan Settings nav
    // item, whose aria-label mentions "income".
    await page.getByRole('button', { name: 'Income', exact: true }).click();
    const salaryInput = page.getByLabel(/Primary.*Salary/i).first();
    await salaryInput.fill('150000');

    // Navigate back to dashboard to ensure it didn't crash
    await clickNav(page, 'Dashboard');
    await expect(page.getByText('Portfolio Projection Horizon')).toBeVisible();
  });

  test('should render the Year by Year tab correctly', async ({ page }) => {
    // Was 'Ledger & Tools', then 'Ledger & Scenarios', now two separate
    // tabs -- the year table lives under 'Year by Year' as of 2026-08-19.
    await clickNav(page, 'Year by Year');

    // Check for standard table headers
    await expect(page.getByText('Year', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Salary', { exact: true }).first()).toBeVisible();
  });

  test('should run the Roth Optimizer in the Strategy tab', async ({ page }) => {
    // Navigate to Strategy
    await clickNav(page, 'Optimizers');

    // Look for Roth ladder or optimizer buttons
    // The commit was "Add Roth Ladder Optimizer", we'll check if it renders
    await expect(page.getByText(/Roth Ladder/i).first()).toBeVisible();
  });

  test('should render the Tax & Estate tab', async ({ page }) => {
    await clickNav(page, 'Tax & Estate');

    // Header unique to this tab's own content (not shared with the nav
    // label or any other tab), so this actually proves the tab's content
    // rendered rather than just that navigation didn't throw.
    await expect(page.getByText('Interactive Tax Bracket & Filing Visualizer')).toBeVisible();
  });

  // The tabs below (Full Interview, Risk & Stress, Help, and Plan
  // Settings' Initial Balances/Milestones/Plan Year
  // sub-tabs) had no E2E coverage at all before this -- each assertion
  // targets a heading/label unique to that tab's own content, not shared
  // with its nav label, so a broken render branch (add a sub-tab, forget to
  // wire it up -- the exact class of bug this project has hit before) would
  // actually fail these rather than silently passing on the nav item alone.
  test('should render the Full Interview tab', async ({ page }) => {
    await openPlanInterview(page);
    await expect(page.getByRole('heading', { name: 'Full Guided Interview' })).toBeVisible();
  });

  test('should render the Risk & Stress tab', async ({ page }) => {
    await clickNav(page, 'Risk & Stress');
    // Asserts on a heading inside the panel, not 'Historical Stress
    // Tests' -- that string is the sub-tab BUTTON's own label, so it would
    // pass even if the panel below it rendered nothing.
    await expect(page.getByText('Select Stress Scenario Model')).toBeVisible();
  });

  // The User Guide and Input Dictionary were merged into one 'Help' tab
  // with sub-tabs on 2026-08-19, so these are now one nav click plus a
  // sub-tab click rather than two separate destinations.
  test('should render the Help tab and both of its reference sub-tabs', async ({ page }) => {
    await clickNav(page, 'Help');
    // The <h1> reads "Help" since the merge; it read "User Guide" when the
    // Guide was its own destination.
    await expect(page.getByRole('heading', { name: 'Help', level: 1 })).toBeVisible();

    // Scoped to .sub-tab-button: the Guide's own table of contents also
    // has an "Input Dictionary" button.
    await page.locator('.sub-tab-button', { hasText: /^Input Dictionary$/ }).click();
    // The <h1> reads "Input Dictionary" since the Help merge; it read
    // "Input & Widget Reference Guide" when this was its own tab.
    await expect(page.getByRole('heading', { name: 'Input Dictionary', level: 1 })).toBeVisible();
  });

  // Walks all nine sections rather than the four this used to check. The
  // old version named "Basic Parameters", "Initial Balances" and
  // "Milestones & Rules" -- section names that stopped existing in the
  // 2026-08-19 regroup, so every assertion here had been failing since.
  // Each expectation targets a heading INSIDE the section, never the
  // section's own button label, so a section that's in the nav but renders
  // nothing still fails.
  const SETTINGS_SECTIONS = [
    ['Household', 'Demographics'],
    ['Income', 'Pre-Retirement W-2 Salaries'],
    ['Savings', 'Annual Savings Contribution Limits (Working years)'],
    ['Balances & Debt', 'Initial Account Balances'],
    ['Spending', 'Retirement Spending Target'],
    ['Taxes & Roth', 'State Income Taxes'],
    ['Assumptions & Risk', 'Return Assumptions'],
    ['Life Events', 'Create New Milestone'],
    ['Plan Year & Review', "What Advancing Does (and Doesn't Do)"],
  ];

  test('should render every Plan Settings section, including Plan Year', async ({ page }) => {
    await openPlanSettings(page);

    for (const [section, heading] of SETTINGS_SECTIONS) {
      await page.getByRole('button', { name: section, exact: true }).click();
      await expect(page.getByText(heading, { exact: true }).first(), `${section} did not render`).toBeVisible();
    }

    await expect(page.getByText("This plan thinks it's")).toBeVisible();
    await expect(page.getByRole('button', { name: /Advance Plan Year to \d+/ })).toBeVisible();
  });

});

test.describe('Plan Year / Advance Year flow', () => {
  test.beforeEach(async ({ page }) => {
    await dismissOnboardingModals(page);
    await openPlanSettings(page);
    await page.getByRole('button', { name: 'Plan Year' }).click();
  });

  // This is the one flow in the whole app that had ZERO test coverage of
  // any kind -- unit, component, or E2E -- before this. It walks the full
  // real confirm -> prompt -> save -> advance -> alert sequence through
  // actual in-app dialogs (AppDialog.jsx; this app deliberately does NOT
  // use native window.confirm/prompt/alert, so Playwright's page.on('dialog')
  // API doesn't apply here -- these are real DOM modals, clicked like any
  // other button).
  test('advancing the plan year walks the full confirm/backup/advance/alert sequence and actually increments planYear', async ({ page }) => {
    test.setTimeout(120_000);
    const advanceButton = page.getByRole('button', { name: /Advance Plan Year to \d+/ });
    const initialLabel = await advanceButton.textContent();
    const targetYear = parseInt(initialLabel.match(/\d+/)[0], 10);

    await advanceButton.click();

    // Step 1: warning/confirm dialog.
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText(`Advance Plan Year to ${targetYear}?`);
    await confirmDialog.getByRole('button', { name: 'Continue' }).click();

    // Step 2: rollback-backup prompt, pre-filled with a suggested name --
    // accept the default rather than typing a new one, exercising
    // handleSaveScenario's tagged-backup path end to end.
    const promptDialog = page.getByRole('dialog');
    await expect(promptDialog).toBeVisible();
    await expect(promptDialog).toContainText('Save a Rollback Backup');
    await promptDialog.getByRole('button', { name: 'Save & Continue' }).click();

    // Step 3: success alert.
    const alertDialog = page.getByRole('dialog');
    await expect(alertDialog).toBeVisible();
    await expect(alertDialog).toContainText('Plan Year Advanced');
    await alertDialog.getByRole('button', { name: 'OK' }).click();

    // The plan year actually moved forward by exactly one -- the button's
    // own label now targets one year further out than before.
    await expect(page.getByRole('button', { name: `Advance Plan Year to ${targetYear + 1}` })).toBeVisible();

    // And the backup landed in the Scenario Profile Manager, tagged so it's
    // distinguishable from a scenario the user saved on purpose.
    // Scenario management split out of the old combined tab on 2026-08-19
    // and is now its own destination -- no sub-tab click needed.
    await clickNav(page, 'Scenarios');
    // Saving a scenario runs its own simulations first (the save button reads
    // "Saving..." meanwhile), so the row can take longer than the default
    // five seconds on a slow machine (about 20 s on a loaded 2-core box).
    await expect(page.getByText('Year Advance Backup')).toBeVisible({ timeout: 60_000 });
  });

  test('cancelling the initial warning dialog leaves the plan year unchanged', async ({ page }) => {
    const advanceButton = page.getByRole('button', { name: /Advance Plan Year to \d+/ });
    const initialLabel = await advanceButton.textContent();

    await advanceButton.click();
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(confirmDialog).toBeHidden();
    await expect(page.getByRole('button', { name: /Advance Plan Year to \d+/ })).toHaveText(initialLabel);
  });

  test('skipping the backup (cancelling the prompt) still advances the plan year', async ({ page }) => {
    const advanceButton = page.getByRole('button', { name: /Advance Plan Year to \d+/ });
    const initialLabel = await advanceButton.textContent();
    const targetYear = parseInt(initialLabel.match(/\d+/)[0], 10);

    await advanceButton.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();

    const promptDialog = page.getByRole('dialog');
    await expect(promptDialog).toBeVisible();
    await promptDialog.getByRole('button', { name: 'Cancel' }).click();

    const alertDialog = page.getByRole('dialog');
    await expect(alertDialog).toBeVisible();
    await expect(alertDialog).toContainText('Plan Year Advanced');
    await alertDialog.getByRole('button', { name: 'OK' }).click();

    await expect(page.getByRole('button', { name: `Advance Plan Year to ${targetYear + 1}` })).toBeVisible();
  });
});
