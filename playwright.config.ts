import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end suite for the storefront.
 *
 * These tests drive a *running production build against the real local
 * database* — `npm run preview` brings up Postgres + PostgREST + the auth stub +
 * `next start`. That is deliberate: a `next start` alone renders the empty
 * catalogue (AGENTS.md, "A preview needs PostgREST"), so a suite pointed at one
 * would pass while proving nothing about real rows.
 *
 * The suite does not start the server itself. Starting it takes ~60 s and
 * involves a rebuild; doing that per spec would dominate the runtime, and two
 * servers for this repo at once produce meaningless results (AGENTS.md). Run
 * `npm run preview` first, then `npm run test:e2e`.
 *
 * `LW_BASE_URL` overrides the target, so the suite can be pointed at a deployed
 * preview without editing this file.
 */
const baseURL = process.env.LW_BASE_URL ?? 'http://127.0.0.1:12000';

// Reuse a system Chromium where one is installed, the same way
// `scripts/a11y-audit.mjs` does. Without this the suite demands Playwright's own
// downloaded browser, so it cannot run in an environment that has Chromium but
// no `npx playwright install`.
const executablePath = process.env.CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  // Serial by default: several specs mutate the same database (publishing a
  // product, placing an order), so parallel workers would race each other.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // A narrow viewport is where the layout has historically broken (the
      // 320 px header overflow in Phase 3, the mobile-only heading-order skip in
      // Phase 17). Running the browse spec here keeps that covered.
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
