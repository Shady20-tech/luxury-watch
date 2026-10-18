'use server';

import { getCartCount } from '@/server/services/cart-service';
import { getWishlistCount } from '@/server/services/wishlist-service';
import { getCurrentUserId } from '@/server/repositories/cart-repository';

/**
 * Counts for the header badges.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS AN ACTION AND NOT A LAYOUT READ
 * -----------------------------------------------------------------------------
 *
 * `src/app/(site)/layout.tsx` sets `revalidate = 300` and is prerendered. The
 * header's counts must be current, and a count baked into a prerendered layout
 * would be up to five minutes stale — a customer would add a watch and watch the
 * badge not move.
 *
 * Reading the cart in the layout would fix that by reading a cookie, which makes
 * every public page dynamic and pays for six navigation queries plus a cart
 * query on every request. That is the trade the layout comment already refuses.
 *
 * So the counts are fetched by a small Client Component after mount. The page
 * stays prerendered, the badge is correct within one request, and a visitor with
 * JavaScript disabled simply sees no badge — which is honest, because without
 * JavaScript there is no cart to have.
 *
 * -----------------------------------------------------------------------------
 * `signedIn` IS RETURNED ON PURPOSE
 * -----------------------------------------------------------------------------
 *
 * A guest's wishlist lives in `localStorage`, which the server cannot see, so the
 * server can only report a wishlist count for a signed-in visitor. `signedIn`
 * lets the island decide: use the server's figure when signed in, and the
 * browser's own list when not.
 */
export type HeaderCounts = {
  cartCount: number;
  /** The database count. Meaningful only when `signedIn` is true. */
  wishlistCount: number;
  signedIn: boolean;
};

export async function readHeaderCounts(): Promise<HeaderCounts> {
  const userId = await getCurrentUserId();

  const [cartCount, wishlistCount] = await Promise.all([getCartCount(), getWishlistCount(userId)]);

  return { cartCount, wishlistCount, signedIn: userId !== null };
}
