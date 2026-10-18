'use client';

import { X } from 'lucide-react';
import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { announceCountsChanged } from '@/lib/cart/events';
import { IDLE_MUTATION } from '@/lib/cart/validation';
import { removeFromWishlist } from '@/server/actions/wishlist-actions';

/**
 * Remove a piece from the signed-in wishlist.
 *
 * A real `<form>` bound to the server action, so it works without JavaScript.
 * The action revalidates `/wishlist`, so the grid updates from the database
 * rather than from a client-side guess about what was removed.
 */
function Submit({ productTitle }: { productTitle?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" loading={pending} className="self-start">
      <X aria-hidden="true" className="mr-2 h-4 w-4" />
      {/* The visible word is "Remove"; the product name is added inside the
          button so a screen reader knows which piece this removes. It is `sr-only`
          rather than an `aria-label`, because an `aria-label` would replace the
          name and could drop the visible word (WCAG 2.5.3). */}
      Remove
      {productTitle ? <span className="sr-only"> {productTitle} from your wishlist</span> : null}
    </Button>
  );
}

export function WishlistRemoveButton({
  productId,
  productTitle,
}: {
  productId: string;
  productTitle?: string;
}) {
  const [state, formAction] = useActionState(removeFromWishlist, IDLE_MUTATION);

  useEffect(() => {
    if (state.status === 'success') announceCountsChanged();
  }, [state.status]);

  return (
    <div className="flex flex-col gap-1">
      <form action={formAction}>
        <input type="hidden" name="productId" value={productId} />
        <Submit productTitle={productTitle} />
      </form>
      {state.status === 'error' && state.message ? (
        <p role="alert" className="text-danger-600 text-xs font-medium">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
