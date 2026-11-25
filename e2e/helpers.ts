import { expect, type Page } from '@playwright/test';

/**
 * Shared helpers for the end-to-end suite.
 *
 * Two of these exist because the storefront makes them mandatory rather than
 * convenient:
 *
 *  - `dismissAgeGate` — the gate blocks every page until answered, so a spec
 *    that skips it is auditing the modal, not the page.
 *  - `watchConsole` — a console error is a defect the suite is meant to catch,
 *    and Playwright does not fail on one by itself.
 */

export const AGE_GATE_KEY = 'lw:age-verified';

/** Answer the age gate so the page under test is the page, not the overlay. */
export async function dismissAgeGate(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, 'yes');
    } catch {
      // Storage can be blocked; the gate then appears interactively instead.
    }
  }, AGE_GATE_KEY);
}

/**
 * Collect console errors and page errors for the lifetime of the page.
 *
 * Returns the array so a spec can assert on it at the end. The caller filters:
 * a 404 for a missing favicon is not a defect.
 */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

/** Navigate to a path and assert it did not error. */
export async function goto(page: Page, path: string): Promise<void> {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(response, `no response for ${path}`).not.toBeNull();
  expect(response!.status(), `unexpected status for ${path}`).toBeLessThan(400);
}

/**
 * Sign in through the real form.
 *
 * The credentials default to the account `scripts/seed-preview-admin.sh`
 * creates, which the local preview's auth stub verifies against
 * `auth.users.encrypted_password` — the same bcrypt comparison GoTrue performs,
 * so this is the real sign-in path rather than a bypass.
 */
export async function signIn(
  page: Page,
  email = process.env.LW_ADMIN_EMAIL ?? 'admin@preview.test',
  password = process.env.LW_ADMIN_PASSWORD ?? 'preview-admin-password',
): Promise<void> {
  await dismissAgeGate(page);
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}
