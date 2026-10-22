'use server';

import { logger } from '@/lib/logger';
import { isSupabaseConfigured } from '@/lib/env';
import {
  fieldErrorsFrom,
  isStockConflict,
  orderRequestSchema,
  safeDatabaseMessage,
  toSubmission,
  type OrderRequestState,
} from '@/lib/orders/order-request';
import { submitOrderRequest } from '@/server/repositories/order-repository';
import { clearCartAfterOrder } from '@/server/services/cart-service';
import { notifyOrderRequestSubmitted } from '@/server/services/email-service';

/**
 * The order-request submission.
 *
 * -----------------------------------------------------------------------------
 * THIS IS NOT A PAYMENT
 * -----------------------------------------------------------------------------
 *
 * The action records what the customer wants. It takes no card details and no
 * gateway token, and it returns no payment result. The customer is told their
 * request has been received and that an administrator will be in touch to settle
 * payment offline. There is no status on the request that the customer can move
 * to "paid"; `paid_offline` is reachable only by an administrator, and only after
 * verifying payment outside the website.
 *
 * -----------------------------------------------------------------------------
 * WHAT THE BROWSER MAY AND MAY NOT SEND
 * -----------------------------------------------------------------------------
 *
 * It sends product ids, quantities, who the customer is, how they want to
 * receive the piece, how they intend to settle, and a discount *code*. It never
 * sends a price, a subtotal, a delivery fee or a discount amount, and this
 * action has no field to accept one. `submit_order_request` recomputes every
 * figure from the `products` table. That is the whole of the "server does not
 * trust browser-submitted prices or stock" guarantee: there is nothing to trust
 * or distrust, because no figure is accepted.
 *
 * -----------------------------------------------------------------------------
 * WHY A SERVER ACTION
 * -----------------------------------------------------------------------------
 *
 * The form works without JavaScript and there is no unauthenticated write
 * endpoint a script can call in a loop: the database function validates,
 * re-checks availability, reserves stock atomically and enforces the rate limit
 * inside Postgres. Calling the action directly avoids none of that.
 */

export async function submitOrderRequestAction(
  _previous: OrderRequestState,
  formData: FormData,
): Promise<OrderRequestState> {
  const parsed = orderRequestSchema.safeParse({
    items: formData.get('items'),
    customerName: formData.get('customerName'),
    customerEmail: formData.get('customerEmail'),
    customerPhone: formData.get('customerPhone') ?? undefined,
    fulfilmentType: formData.get('fulfilmentType'),
    paymentMethodCode: formData.get('paymentMethodCode'),
    deliveryOptionCode: formData.get('deliveryOptionCode') ?? undefined,
    deliveryLine1: formData.get('deliveryLine1') ?? undefined,
    deliveryLine2: formData.get('deliveryLine2') ?? undefined,
    deliveryCity: formData.get('deliveryCity') ?? undefined,
    deliveryRegion: formData.get('deliveryRegion') ?? undefined,
    deliveryPostalCode: formData.get('deliveryPostalCode') ?? undefined,
    deliveryCountryCode: formData.get('deliveryCountryCode') ?? undefined,
    customerNote: formData.get('customerNote') ?? undefined,
    discountCode: formData.get('discountCode') ?? undefined,
    idempotencyKey: formData.get('idempotencyKey'),
    termsAccepted: formData.get('termsAccepted') ?? undefined,
    company: formData.get('company') ?? undefined,
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields and try again.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const data = parsed.data;

  // A filled honeypot means a bot. It is answered exactly like a success so the
  // bot does not learn it was detected, but nothing is written and no reference
  // is issued. A token the bot could store is deliberately not returned.
  if (data.company && data.company.trim() !== '') {
    logger.warn('order_request.honeypot');
    return { status: 'success', receipt: { reference: '', accessToken: null } };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: 'error',
      message:
        'Order requests are temporarily unavailable. Please try again shortly, or contact us another way.',
    };
  }

  const submission = toSubmission(data);

  try {
    const result = await submitOrderRequest({
      ...submission,
      userAgent: null,
    });

    // Best-effort: the request is already placed, so a failure to clear the cart
    // must not turn a success into an error. It is logged and swallowed. The
    // cart is cleared only after the request is committed, so a customer never
    // loses their cart to a submission that failed.
    try {
      await clearCartAfterOrder();
    } catch (error) {
      logger.warn('order_request.cart_clear_failed', {
        message: error instanceof Error ? error.message : 'unknown error',
      });
    }

    // Also after the commit, and also best-effort. `notifyOrderRequestSubmitted`
    // swallows its own failures, so a mail outage cannot turn a placed order
    // into an error page. It is awaited so the work is attributed to this
    // request rather than racing the response.
    await notifyOrderRequestSubmitted(result);

    return { status: 'success', receipt: result };
  } catch (error) {
    const safe = safeDatabaseMessage(error);

    if (safe) {
      logger.warn('order_request.rejected', { reason: safe });
      return { status: 'error', message: safe };
    }

    // A line that can no longer be bought is not a generic failure. The customer
    // is told the basket changed, and the page re-reads the cart so they can see
    // what moved rather than retrying an order that will keep failing.
    if (isStockConflict(error)) {
      logger.warn('order_request.stock_conflict');
      return {
        status: 'error',
        message:
          'One of the pieces in your cart is no longer available, or its availability has changed. Please review your cart and try again.',
      };
    }

    logger.error('order_request.failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });

    return {
      status: 'error',
      message: 'We could not submit your order request just now. Please try again in a moment.',
    };
  }
}
