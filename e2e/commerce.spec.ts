import { expect, test, type Page } from '@playwright/test';

import { dismissAgeGate, goto, watchConsole } from './helpers';

/**
 * A unique address per run.
 *
 * `submit_order_request` caps submissions per email address at five an hour
 * (migration 0013) — a real protection, not something to route around. A fixed
 * address would make this spec pass five times and then fail forever, with a
 * failure that looks like a checkout bug. The cap itself is exercised in
 * `supabase/tests/40_order_and_inventory.sql`, where it can be asserted directly.
 */
const uniqueEmail = `qa-tester-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

/** Wait until the header reports a non-empty cart. */
async function waitForCartCount(page: Page, count = 1): Promise<void> {
  await expect(
    page.getByRole('link', { name: new RegExp(`Cart, ${count} item`, 'i') }),
  ).toBeVisible({
    timeout: 20_000,
  });
}

/** Add the first purchasable card on /shop to the cart, waiting for it to land. */
async function addFirstProduct(page: Page): Promise<void> {
  await goto(page, '/shop');
  await page.getByRole('button', { name: /^Add$/ }).first().click();
  await waitForCartCount(page);
}

/**
 * Scenario 4 — a guest adds a piece to the cart and submits an order request.
 *
 * The assertion that matters most here is the negative one: the confirmation
 * must say a *request* was received and that no payment was taken. A green
 * order-placed test that also implies payment is the single worst regression
 * this storefront can ship, so it is checked explicitly rather than trusted.
 */
test.describe('guest cart and order request', () => {
  test.beforeEach(async ({ page }) => {
    await dismissAgeGate(page);
  });

  test('a guest can add a piece to the cart', async ({ page }) => {
    await goto(page, '/shop');

    const addButton = page.getByRole('button', { name: /^Add$/ }).first();
    await expect(addButton).toBeVisible();
    await addButton.click();

    // The cart is server-side and cookie-backed, so the header count is the
    // proof the action persisted rather than a local state flip.
    await waitForCartCount(page);

    await goto(page, '/cart');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
  });

  test('order request is saved as pending review and never as paid', async ({ page }) => {
    const problems = watchConsole(page);

    await addFirstProduct(page);

    const checkoutResponse = await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
    expect(checkoutResponse!.status()).toBeLessThan(400);

    // If the cart did not carry through, /checkout shows its empty state. That
    // is a real failure of the flow, not something to skip past.
    await expect(page.getByLabel('Your name')).toBeVisible({ timeout: 15_000 });

    // Scoped to the order form: the footer newsletter also has an
    // "Email address" label, so an unscoped query is ambiguous.
    const form = page.locator('form').filter({ has: page.locator('#checkout-name') });
    await form.getByLabel('Your name').fill('QA Tester');
    await form.getByLabel('Email address').fill(uniqueEmail);
    await form.getByLabel('Phone number (optional)').fill('+441234567890');

    // Collecting in person avoids depending on a delivery option being enabled
    // in this environment's settings.
    const pickup = page.getByLabel('Collect in person');
    if (await pickup.count()) {
      await pickup.check();
    } else {
      await page.getByLabel('Delivery').check();
      for (const [label, value] of [
        ['Address line 1', '1 Test Street'],
        ['Town or city', 'London'],
        ['Country code', 'GB'],
      ] as const) {
        const field = page.getByLabel(label, { exact: false });
        if (await field.count()) await field.fill(value);
      }
    }

    // Choose the first available manual payment method.
    const paymentSelect = page.locator('#checkout-payment');
    if (await paymentSelect.count()) {
      const usable: string[] = [];
      for (const option of await paymentSelect.locator('option').all()) {
        const value = await option.getAttribute('value');
        if (value) usable.push(value);
      }
      if (usable.length) await paymentSelect.selectOption(usable[0]!);
    }

    const terms = page.locator('#checkout-terms');
    if (await terms.count()) await terms.check();

    await page.getByRole('button', { name: /send order request/i }).click();

    // The confirmation is the only place the store may speak about money, and
    // it must describe a request, not a payment.
    await expect(
      page.getByText(/your order request has been received/i),
      'order confirmation not shown — the request may have been rejected',
    ).toBeVisible({ timeout: 30_000 });

    const raw = await page.locator('body').innerText();
    // A reference the customer can quote is shown (e.g. LW-26-100037). Read it
    // from the raw text: the copy checks below lowercase the body.
    expect(raw).toMatch(/LW-\d{2}-\d{4,}/);

    const body = raw.toLowerCase();
    expect(body).toContain('review');
    // The confirmation states the negative explicitly; a bare absence of the
    // word "paid" would not prove the claim was made honestly.
    expect(body).toContain('no payment has been taken');
    expect(body).not.toMatch(/\bpayment (was )?(taken|received|successful)\b/);
    expect(body).not.toMatch(/\bpaid\b/);
    expect(body).not.toMatch(/\bthank you for your (payment|purchase)\b/);

    expect(problems, `console errors:\n${problems.join('\n')}`).toEqual([]);
  });

  test('the checkout page never presents a card form', async ({ page }) => {
    // With an empty cart /checkout shows its empty state, which does not carry
    // the payment notice — so fill the cart first to reach the real form.
    await addFirstProduct(page);

    await goto(page, '/checkout');
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).toContain('no payment is taken');
    // A card field would be a policy violation, not just a bug.
    expect(await page.locator('input[autocomplete="cc-number"]').count()).toBe(0);
    expect(await page.locator('input[name*="card" i]').count()).toBe(0);
  });
});
