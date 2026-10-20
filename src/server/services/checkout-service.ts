import 'server-only';

import { randomUUID } from 'node:crypto';
import { cache } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getCart } from '@/server/services/cart-service';
import { getViewerState } from '@/server/services/viewer-service';
import {
  emptyCheckoutOptions,
  formatMoney,
  type CheckoutOptions,
} from '@/lib/orders/checkout-options';
import type { CartView } from '@/lib/cart/types';
import { fetchCheckoutConfiguration } from '@/server/repositories/checkout-repository';

/**
 * Assemble everything the checkout screen needs, degrading honestly.
 *
 * -----------------------------------------------------------------------------
 * WHY THE OPTIONS AND THE CART ARE ONE VIEW
 * -----------------------------------------------------------------------------
 *
 * The checkout shows the options beside the cart summary. Loading them
 * separately would let the two disagree — a payment method rendered next to a
 * cart that has since emptied — so they are read together and the page renders
 * one object.
 *
 * -----------------------------------------------------------------------------
 * THE CART HERE IS DISPLAY DATA
 * -----------------------------------------------------------------------------
 *
 * `cart` is the same priced view the cart page renders, and it is display data
 * exactly as it is there. The order path recomputes every figure from the
 * `products` table. Nothing on this screen is submitted as an amount.
 *
 * -----------------------------------------------------------------------------
 * THE IDEMPOTENCY KEY
 * -----------------------------------------------------------------------------
 *
 * Minted once per checkout render and carried in a hidden field. It is not a
 * price, a cart id or a discount — it is an opaque marker that lets a resubmit
 * of the same form be recognised and answered with the original request rather
 * than reserving the stock twice.
 */

export type CheckoutView = {
  cart: CartView;
  options: CheckoutOptions;
  currency: string;
  confirmationNote: string | null;
  idempotencyKey: string;
  /** True when the customer is signed in; the confirmation copy differs. */
  signedIn: boolean;
};

export function newIdempotencyKey(): string {
  return randomUUID();
}

async function loadCheckout(): Promise<CheckoutView> {
  const cart = await getCart();

  // The key is minted whether or not the database answered: the form still
  // renders, and a submission against an unavailable catalogue is refused by
  // validation long before a key matters.
  const idempotencyKey = newIdempotencyKey();

  if (!isSupabaseConfigured()) {
    return {
      cart,
      options: emptyCheckoutOptions('unavailable'),
      currency: cart.currency,
      confirmationNote: null,
      idempotencyKey,
      signedIn: false,
    };
  }

  try {
    const [configuration, viewer] = await Promise.all([
      fetchCheckoutConfiguration(),
      getViewerState(),
    ]);

    const currency = configuration.currency || cart.currency;
    const options: CheckoutOptions = {
      paymentMethods: configuration.paymentMethods.map((method) => ({
        code: method.code,
        label: method.label,
        description: method.description,
        instructions: method.instructions,
      })),
      deliveryOptions: configuration.deliveryOptions.map((option) => ({
        code: option.code,
        label: option.label,
        description: option.description,
        feeCents: option.fee_cents,
        fee: formatMoney(option.fee_cents, currency),
      })),
      canSettle: configuration.paymentMethods.length > 0,
      canDeliver: configuration.deliveryOptions.length > 0,
      pickupLocation: configuration.pickupLocation,
      source: 'database',
    };

    return {
      cart,
      options,
      currency,
      confirmationNote: configuration.confirmationNote,
      idempotencyKey,
      signedIn: viewer.signedIn,
    };
  } catch (error) {
    // Logged without any customer content — there is none on this path — and the
    // page still renders, telling the customer the checkout could not be loaded
    // rather than pretending the cart is empty.
    logger.error('checkout.configuration_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });

    return {
      cart,
      options: emptyCheckoutOptions('unavailable'),
      currency: cart.currency,
      confirmationNote: null,
      idempotencyKey,
      signedIn: false,
    };
  }
}

/**
 * Per-request memoised checkout view.
 *
 * `cache()` keeps a single render from reading the configuration and the cart
 * twice, and keeps the idempotency key stable within the request — which is what
 * makes it idempotent for a resubmission of the form that was rendered.
 */
export const getCheckout = cache(loadCheckout);
