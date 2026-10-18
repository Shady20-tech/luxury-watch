'use client';

import { ShoppingBag } from 'lucide-react';
import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { announceCountsChanged } from '@/lib/cart/events';
import { IDLE_MUTATION } from '@/lib/cart/validation';
import { readGuestWishlist, removeFromGuestWishlist } from '@/lib/wishlist/guest';
import { moveToCartFromWishlist } from '@/server/actions/cart-actions';

/**
 * Move a saved piece into the cart.
 *
 * -----------------------------------------------------------------------------
 * ONE ACTION, SO NOTHING IS LOST AND NOTHING IS DUPLICATED
 * -----------------------------------------------------------------------------
 *
 * `moveToCartFromWishlist` writes the cart **first** and removes the wishlist
 * row only once that succeeded, so a failure leaves the piece saved rather than
 * dropping it. Adding a product already in the cart is an upsert against
 * `(cart_id, product_id)`, so a piece already there is updated, not duplicated.
 *
 * -----------------------------------------------------------------------------
 * A GUEST'S LIST IS IN THE BROWSER
 * -----------------------------------------------------------------------------
 *
 * For a signed-in visitor the server removes the row as part of the same action.
 * For a guest the list is in `localStorage`, which the server cannot touch, so
 * the island removes the id locally — but only after the action reports success,
 * which is the same "cart first, then the list" ordering the server uses. A
 * failed move leaves the guest's list intact.
 *
 * The action itself is harmless for a guest: it puts the piece in the guest cart
 * (identified by the httpOnly cookie) and skips the wishlist write, because
 * there is no account row to remove.
 */
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" loading={pending} className="self-start">
      <ShoppingBag aria-hidden="true" className="mr-2 h-4 w-4" />
      {pending ? 'Moving…' : label}
    </Button>
  );
}

export function MoveToCartButton({
  productId,
  productTitle,
  signedIn,
  className,
}: {
  productId: string;
  productTitle?: string;
  /** True when the visitor has an account, so the list is in the database. */
  signedIn: boolean;
  className?: string;
}) {
  const [state, formAction] = useActionState(moveToCartFromWishlist, IDLE_MUTATION);

  useEffect(() => {
    if (state.status !== 'success') return;

    // The server has already removed the account's row. A guest's copy is still
    // in the browser, so it is cleared here — after the successful write, never
    // before.
    if (!signedIn) removeFromGuestWishlist(productId, readGuestWishlist());

    announceCountsChanged();
  }, [state.status, signedIn, productId]);

  return (
    <div className={className}>
      <form action={formAction}>
        <input type="hidden" name="productId" value={productId} />
        <Submit label="Move to cart" />
      </form>

      {state.status === 'success' ? (
        <p role="status" className="text-success-600 mt-1 text-xs font-medium">
          {state.message ?? 'Moved to your cart.'}
          {productTitle ? <span className="sr-only"> {productTitle}</span> : null}
        </p>
      ) : null}

      {state.status === 'error' && state.message ? (
        <p role="alert" className="text-danger-600 mt-1 text-xs font-medium">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
