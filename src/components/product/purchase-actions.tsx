import Link from 'next/link';

import { AddToCartButton } from '@/components/cart/add-to-cart-button';
import { WishlistToggle } from '@/components/product/wishlist-toggle';
import type { ProductDetail } from '@/lib/product/types';
import { cn } from '@/lib/utils';

/**
 * Purchase controls.
 *
 * Two real controls: add to cart and save to wishlist. Both are backed by the
 * database for a signed-in visitor and by the browser for a guest, and both work
 * without JavaScript.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * -----------------------------------------------------------------------------
 *
 * No price is passed to either control. The add-to-cart form carries a product id
 * and a quantity, and the server re-derives everything else, so there is no
 * client-supplied amount for a tampered request to carry. The wishlist control
 * carries a product id and nothing more.
 *
 * -----------------------------------------------------------------------------
 * THE PHASE BOUNDARY
 * -----------------------------------------------------------------------------
 *
 * Submitting an order request is the next phase, so the path from a cart to a
 * request is not yet built. Rather than a button that leads nowhere, the copy
 * below states plainly what exists now — set pieces aside, save them, send an
 * enquiry — and what does not. That is the same choice the product page made
 * before this phase, and it is what keeps the page honest while the workflow is
 * incomplete.
 */
export function PurchaseActions({
  product,
  signedIn,
  initiallySaved,
  allowQuantity = false,
  className,
}: {
  product: Pick<ProductDetail, 'id' | 'title' | 'availability'>;
  signedIn: boolean;
  initiallySaved: boolean;
  /** True only when the product model permits more than one. */
  allowQuantity?: boolean;
  className?: string;
}) {
  const available = product.availability === 'available';

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {available ? (
          <AddToCartButton
            productId={product.id}
            productTitle={product.title}
            allowQuantity={allowQuantity}
          />
        ) : (
          // A reserved piece cannot be added to a cart. Saying so, and pointing at
          // the enquiry form, is more useful than a disabled button with no
          // explanation.
          <p className="border-line-300 bg-surface-100 text-foreground-muted rounded-sm border px-4 py-3 text-sm">
            This piece is currently reserved by someone else. It cannot be added to a cart.{' '}
            <a href="#enquire" className="text-accent-text underline underline-offset-4">
              Ask us about it
            </a>
            .
          </p>
        )}

        <WishlistToggle
          productId={product.id}
          signedIn={signedIn}
          initiallySaved={initiallySaved}
        />
      </div>

      <p className="text-ink-500 text-xs">
        Pieces in your cart are not reserved. Submitting an order request is the next step to be
        built; until then,{' '}
        <a href="#enquire" className="text-accent-text underline underline-offset-4">
          send an enquiry
        </a>{' '}
        and we will hold a piece for you. No payment is taken on this site.
      </p>

      <p className="text-ink-500 text-xs">
        <Link href="/cart" className="text-accent-text underline underline-offset-4">
          Go to your cart
        </Link>
      </p>
    </div>
  );
}
