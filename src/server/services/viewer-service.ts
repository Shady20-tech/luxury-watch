import 'server-only';

import { cache } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getCurrentUserId } from '@/server/repositories/cart-repository';
import { readWishlistProductIds } from '@/server/repositories/wishlist-repository';

/**
 * Facts about the current visitor that several surfaces need.
 *
 * The product page, the wishlist page and the cart all need to know whether the
 * visitor is signed in and what they have saved. Resolving that once per request
 * — through `cache()` — keeps a single product page from issuing the same
 * wishlist query two or three times, and keeps the answer consistent within the
 * request.
 *
 * It is deliberately a small read-only service rather than something folded into
 * the cart or the wishlist service. Both of those need it, and neither owns it.
 *
 * `savedProductIds` is the raw id list, not the assembled products. Callers that
 * need a card grid use `getWishlist`; callers that need to know whether one
 * product is saved (a toggle's initial state) use this, and avoid fetching a
 * whole grid to answer a yes/no question.
 */
export type ViewerState = {
  signedIn: boolean;
  userId: string | null;
  savedProductIds: string[];
};

async function loadViewerState(): Promise<ViewerState> {
  if (!isSupabaseConfigured()) {
    return { signedIn: false, userId: null, savedProductIds: [] };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { signedIn: false, userId: null, savedProductIds: [] };
  }

  try {
    const savedProductIds = await readWishlistProductIds(userId);
    return { signedIn: true, userId, savedProductIds };
  } catch (error) {
    // The visitor is signed in, but the wishlist could not be read. Reporting
    // "signed in with nothing saved" would make a saved piece look unsaved, so
    // the failure is logged and the empty list is returned — the toggle then
    // offers to save, which is recoverable, rather than claiming the piece is
    // already saved when it may not be.
    logger.warn('viewer.wishlist_unavailable', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return { signedIn: true, userId, savedProductIds: [] };
  }
}

export const getViewerState = cache(loadViewerState);

/** Whether the visitor is signed in. Cheaper than the full state when that is all that is needed. */
export async function viewerIsSignedIn(): Promise<boolean> {
  return (await getViewerState()).signedIn;
}

/** Whether the visitor has saved a product. */
export async function viewerHasSaved(productId: string): Promise<boolean> {
  const state = await getViewerState();
  return state.savedProductIds.includes(productId);
}
