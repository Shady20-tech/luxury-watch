/**
 * The offline settlement and delivery choices a customer picks from.
 *
 * -----------------------------------------------------------------------------
 * WHAT THIS IS NOT
 * -----------------------------------------------------------------------------
 *
 * `PaymentMethod` is an *offline* option: the customer is told how to transfer
 * funds or pay on collection, and an administrator settles it outside the site.
 * There is no gateway, no card field and no redirect here, and the CI guard
 * `scripts/check-no-payment-providers.mjs` enforces that. The word "payment" is
 * used because that is what the schema calls the table; nothing in this module
 * processes a payment.
 *
 * The options are administrator-configured rows, read live. A code the customer
 * submits is re-checked against these rows inside `submit_order_request`, so
 * disabling an option takes effect on the next submission rather than on the
 * next page load.
 */

export type PaymentMethod = {
  code: string;
  label: string;
  /** Shown under the label, e.g. the bank details to transfer to. */
  description: string | null;
  instructions: string | null;
};

export type DeliveryOption = {
  code: string;
  label: string;
  description: string | null;
  feeCents: number;
  /** Formatted fee, e.g. `$50.00`. */
  fee: string;
};

export type CheckoutOptions = {
  paymentMethods: PaymentMethod[];
  deliveryOptions: DeliveryOption[];
  /** True when the business has configured at least one way to settle. */
  canSettle: boolean;
  /** True when at least one delivery option exists, so delivery can be offered. */
  canDeliver: boolean;
  /**
   * The location a customer collects from, or `null` when the store has not
   * configured one. Pickup is still offered when this is null — the request is a
   * conversation, and the confirmation tells the customer the exact location.
   */
  pickupLocation: string | null;
  source: 'database' | 'fallback' | 'unavailable';
};

export function emptyCheckoutOptions(
  source: CheckoutOptions['source'] = 'unavailable',
): CheckoutOptions {
  return {
    paymentMethods: [],
    deliveryOptions: [],
    canSettle: false,
    canDeliver: false,
    pickupLocation: null,
    source,
  };
}

/** Format minor units for display. The one place the checkout formats money. */
export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
