// Sidebar navigation for the browser tests. Six entries always show; the
// rest sit behind "Explore more" (src/config/navItems.js), which stays
// closed on a fresh visit. Clicking a folded entry by label alone waits
// 30 s for an element that is not rendered, so open the fold first when the
// entry is not visible.
export async function clickNav(page, label) {
  // On a phone the sidebar is a drawer behind "Open navigation menu".
  const opener = page.getByRole('button', { name: 'Open navigation menu' });
  if (await opener.isVisible().catch(() => false)) await opener.click();
  const nav = page.getByRole('navigation');
  const item = nav.getByText(label, { exact: true });
  if (!(await item.isVisible().catch(() => false))) {
    const toggle = nav.getByTestId('nav-more-toggle');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
  await item.click();
}

// "Plan" opens whichever view was used last; a fresh browser gets the
// Advanced view (Plan Settings, #/settings).
export async function openPlanSettings(page) {
  await clickNav(page, 'Plan');
  const advanced = page.getByRole('group', { name: 'Plan view' }).getByRole('button', { name: 'Advanced' });
  if ((await advanced.getAttribute('aria-pressed')) !== 'true') await advanced.click();
}

// The Guided view (the Full Interview, #/interview).
export async function openPlanInterview(page) {
  await clickNav(page, 'Plan');
  const guided = page.getByRole('group', { name: 'Plan view' }).getByRole('button', { name: 'Guided' });
  if ((await guided.getAttribute('aria-pressed')) !== 'true') await guided.click();
}
