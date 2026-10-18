import 'server-only';

import { cache } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { resolveImageUrl } from '@/lib/media';
import { toWishlistView } from '@/lib/wishlist/assemble';
import { emptyWishlistView, type WishlistView } from '@/lib/wishlist/types';
import {
  addWishlistItems,
  fetchWishlistProducts,
  readWishlistProductIds,
} from '@/server/repositories/wishlist-repository';

/**
 * Build the signed-in wishlist view, degrading honestly.
 *
 * The wishlist is a database feature only for a signed-in visitor. A guest's
 * wishlist lives in the browser and is rendered by a Client Component that reads
 * it directly, because the server cannot see it. `loadWishlist` is therefore
 * called only when there is an authenticated user; `wishlistViewFor` returns the
 * local view otherwise.
 *
 * A saved id whose product is no longer published returns no row from
 * `catalogue_by_ids`, and `toWishlistView` reports it as unavailable rather than
 * dropping it. That is the "handle deleted/unpublished products gracefully"
 * requirement: the customer sees that the piece is no longer listed and can
 * remove it, instead of the entry vanishing with no explanation.
 */
async function loadWishlist(userId: string): Promise<WishlistView> {
  if (!isSupabaseConfigured()) {
    return emptyWishlistView('unavailable');
  }

  try {
    const savedIds = await readWishlistProductIds(userId);
    if (savedIds.length === 0) {
      return emptyWishlistView('database');
    }

    const rows = await fetchWishlistProducts(savedIds);

    return toWishlistView({
      savedIds,
      rows,
      resolveImage: resolveImageUrl,
      now: new Date().toISOString(),
      source: 'database',
    });
  } catch (error) {
    logger.warn('wishlist.load_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return emptyWishlistView('unavailable');
  }
}

export const getWishlist = cache(loadWishlist);

/**
 * The header badge count.
 *
 * Only the id list is read; the products are not fetched. A badge needs a
 * number, and loading a grid of cards to display a digit would be work done for
 * nothing.
 */
export async function getWishlistCount(userId: string | null): Promise<number> {
  if (!userId || !isSupabaseConfigured()) return 0;
  try {
    return (await readWishlistProductIds(userId)).length;
  } catch (error) {
    logger.warn('wishlist.count_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return 0;
  }
}

/** Whether a signed-in user has saved a product. */
export async function productIsSaved(userId: string, productId: string): Promise<boolean> {
  try {
    const ids = await readWishlistProductIds(userId);
    return ids.includes(productId);
  } catch {
    return false;
  }
}

/**
 * Merge a guest wishlist into the account.
 *
 * The guest ids come from the browser, so they are untrusted input: they are
 * validated by the action's schema, bounded, and only ever used as product ids
 * in an upsert against `wishlist_items_unique`. An id that names nothing simply
 * produces no row; it cannot create a product or change one.
 *
 * Returns the number of products now saved, so the caller can update the badge.
 * Idempotent: re-running with the same ids changes nothing.
 */
export async function mergeGuestWishlist(
  userId: string,
  productIds: string[],
): Promise<{ saved: number }> {
  if (productIds.length > 0) {
    await addWishlistItems(userId, productIds);
  }
  const saved = await getWishlistCount(userId);
  return { saved };
}
