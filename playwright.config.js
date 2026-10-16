import { defineConfig, devices } from '@playwright/test';

// The browser tests run against the PRODUCTION build (vite build + vite
// preview), not the dev server: the service worker, the /app/ base path,
// the lazy chunks and the precache only exist in a build, and those are
// what a release breaks. E2E_DEV=1 switches back to the dev server for a
// quick local loop.
//
// PW_CHROMIUM_PATH points Playwright at an already-installed Chromium when
// the one matching this Playwright version is not downloaded (sandboxes
// without network). Unset -- the normal case -- Playwright uses its own.
const useDev = !!process.env.E2E_DEV;
const chromiumPath = process.env.PW_CHROMIUM_PATH;
const port = Number(process.env.E2E_PORT) || 5176;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
  ],
  webServer: {
    command: useDev
      ? `npm run dev -- --port ${port} --strictPort`
      : `npm run build && npm run preview -- --port ${port} --strictPort`,
    url: `http://localhost:${port}/app/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
