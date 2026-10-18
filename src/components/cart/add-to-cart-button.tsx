'use client';

import { Check, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { announceCountsChanged } from '@/lib/cart/events';
import { IDLE_MUTATION } from '@/lib/cart/validation';
import { addToCart } from '@/server/actions/cart-actions';

/**
 * Add-to-cart control.
 *
 * A real `<form>` bound to a server action, so it works without JavaScript and
 * carries only a product id and a quantity. There is no price in the payload,
 * because the price is not the browser's to send: the action re-prices through
 * `cart_pricing` and the confirmation comes from the database's answer.
 *
 * -----------------------------------------------------------------------------
 * WHAT THE CONFIRMATION SAYS
 * -----------------------------------------------------------------------------
 *
 * "Added to your cart." Not "reserved", not "held for you". Being in a cart
 * holds nothing — the piece is only reserved when an order request is submitted
 * and an administrator confirms it. The message when a unique piece's quantity
 * is clamped says so explicitly, rather than silently changing the number the
 * customer asked for.
 *
 * -----------------------------------------------------------------------------
 * THE QUANTITY
 * -----------------------------------------------------------------------------
 *
 * A single watch is the norm for this catalogue, so the common case is one and
 * the control does not ask. Where a product model permits more, a quantity
 * selector is rendered; where it does not, the customer is told the piece is
 * unique and one is added. Either way the server re-checks, so the UI is a
 * courtesy and not the boundary.
 */
export function AddToCartButton({
  productId,
  productTitle,
  allowQuantity = false,
  className,
}: {
  productId: string;
  productTitle: string;
  /** True only when the product model permits more than one. */
  allowQuantity?: boolean;
  className?: string;
}) {
  const [state, formAction] = useActionState(addToCart, IDLE_MUTATION);

  useEffect(() => {
    if (state.status === 'success') announceCountsChanged();
  }, [state.status]);

  return (
    <div className={className}>
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="productId" value={productId} />
        {allowQuantity ? (
          <>
            <label htmlFor={`quantity-${productId}`} className="text-sm font-medium">
              Quantity
            </label>
            <select
              id={`quantity-${productId}`}
              name="quantity"
              defaultValue="1"
              className="border-line-300 bg-surface-0 focus-visible:border-gold-700 focus-visible:outline-gold-700 h-11 rounded-sm border px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1"
            >
              {Array.from({ length: 9 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </>
        ) : (
          <input type="hidden" name="quantity" value="1" />
        )}
        <AddSubmit />
      </form>

      {state.status === 'success' ? (
        <p
          role="status"
          className="text-success-600 mt-2 flex items-center gap-2 text-sm font-medium"
        >
          <Check aria-hidden="true" className="h-4 w-4 shrink-0" />
          {state.message ?? 'Added to your cart.'}{' '}
          <Link href="/cart" className="text-accent-text underline underline-offset-4">
            View cart
          </Link>
        </p>
      ) : null}

      {state.status === 'error' && state.message ? (
        <p role="alert" className="text-danger-600 mt-2 text-sm font-medium">
          {state.message}
        </p>
      ) : null}

      {!allowQuantity ? (
        <p className="text-ink-500 mt-2 text-xs">
          {productTitle} is a unique piece, so one is added.
        </p>
      ) : null}
    </div>
  );
}

function AddSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      <ShoppingBag aria-hidden="true" className="mr-2 h-4 w-4" />
      {pending ? 'Adding…' : 'Add to cart'}
    </Button>
  );
}
