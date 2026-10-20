import { AlertTriangle } from 'lucide-react';

import type { CartView } from '@/lib/cart/types';
import type { CheckoutOptions } from '@/lib/orders/checkout-options';
import { ORDER_COPY } from '@/lib/orders/copy';

/**
 * The order summary beside the form.
 *
 * -----------------------------------------------------------------------------
 * DISPLAY DATA, STATED AS SUCH
 * -----------------------------------------------------------------------------
 *
 * Every figure here comes from `cart_pricing` and is re-derived again when the
 * request is submitted. It is shown so the customer can see what they are asking
 * for; it is not submitted, and the order path never reads it. The component
 * says the figures are "confirmed when we review your request", which is the
 * honest description of display data.
 *
 * -----------------------------------------------------------------------------
 * NO RESERVATION IS CLAIMED BY THE CART
 * -----------------------------------------------------------------------------
 *
 * The copy does not say a piece is "reserved" or "held" merely because it is in
 * the cart. It is held only once the request is submitted: `submit_order_request`
 * calls `reserve_inventory` in the same transaction. The summary says the pieces
 * are set aside in the cart, which is what is true at this point, and the form
 * tells the customer that sending the request is what holds them.
 *
 * This is a Server Component: it renders numbers and words and needs no
 * interactivity, so none of it ships to the browser as JavaScript.
 */
export function OrderSummary({
  cart,
  options,
  currency,
  confirmationNote,
  signedIn,
}: {
  cart: CartView;
  options: CheckoutOptions;
  currency: string;
  confirmationNote: string | null;
  signedIn: boolean;
}) {
  return (
    <aside
      aria-labelledby="order-summary-heading"
      className="border-line-200 bg-surface-50 sticky top-24 rounded-md border p-5"
    >
      <h2 id="order-summary-heading" className="text-lg">
        Your order request
      </h2>

      <ul className="divide-line-200 border-line-200 mt-4 divide-y border-t">
        {cart.lines.map((line) => (
          <li key={line.productId} className="flex items-baseline justify-between gap-4 py-3">
            <span className="min-w-0">
              <span className="text-foreground block truncate text-sm font-medium">
                {line.title}
              </span>
              <span className="text-ink-500 block text-xs">
                {line.quantity} × {line.unitPrice ?? 'price on request'}
              </span>
            </span>
            <span className="shrink-0 text-sm font-medium">
              {line.purchasable ? (
                line.lineTotal
              ) : (
                <span className="text-ink-500 font-normal">Not included</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <dl aria-live="polite" className="mt-4 flex flex-col gap-2 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-foreground-muted">Subtotal</dt>
          <dd className="font-medium">{cart.subtotal}</dd>
        </div>

        {cart.discountCents > 0 ? (
          <div className="text-success-600 flex items-baseline justify-between gap-4">
            <dt>Discount{cart.discountCode ? ` (${cart.discountCode.code})` : ''}</dt>
            <dd className="font-medium">−{cart.discount}</dd>
          </div>
        ) : null}

        <div className="border-line-200 mt-2 flex items-baseline justify-between gap-4 border-t pt-3">
          <dt className="font-semibold">Estimated total</dt>
          <dd className="text-lg font-semibold">{cart.total}</dd>
        </div>
      </dl>

      <p className="text-ink-500 mt-3 text-xs">
        The delivery fee for a delivery request is added when the request is submitted, and every
        figure is confirmed from the catalogue when we review it. Prices here are shown for your
        reference and are not what is charged.
      </p>

      {cart.hasPriceOnRequest ? (
        <p className="text-foreground-muted mt-3 text-xs">
          One or more pieces are priced on request. Their price is not included in the estimated
          total and will be confirmed with you.
        </p>
      ) : null}

      {cart.hasUnavailable ? (
        <p className="text-foreground-muted mt-3 flex items-start gap-2 text-xs">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            One or more pieces are unavailable and are not included. Remove them from your cart
            before submitting, or contact us to ask about them.
          </span>
        </p>
      ) : null}

      {!options.canSettle ? (
        <p className="text-foreground-muted mt-3 flex items-start gap-2 text-xs">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            No settlement method is configured at the moment, so we cannot take an order request
            online. Please contact us directly.
          </span>
        </p>
      ) : null}

      <div className="border-line-200 mt-5 border-t pt-5">
        <h3 className="text-sm font-semibold">What happens next</h3>
        <ol className="text-foreground-muted mt-2 flex flex-col gap-1.5 text-xs">
          <li>1. You send this request — nothing is charged, and the pieces are held for you.</li>
          <li>2. A member of the team confirms availability and contacts you.</li>
          <li>
            3. Payment is arranged directly. If the request is declined, the pieces are released
            again.
          </li>
        </ol>

        {confirmationNote ? <p className="text-ink-500 mt-3 text-xs">{confirmationNote}</p> : null}

        <p className="text-ink-500 mt-3 text-xs">
          {signedIn
            ? 'This request will be linked to your account, so you can see it in your history.'
            : 'You will be given a reference and a private link so you can check on this request without an account.'}
        </p>

        <p className="sr-only">{ORDER_COPY.noPaymentNotice}</p>
        <p className="text-ink-500 mt-3 text-xs">{currency} prices.</p>
      </div>
    </aside>
  );
}
