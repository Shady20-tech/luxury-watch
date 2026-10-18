'use server';

import { revalidatePath } from 'next/cache';

import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { mergeWishlistSchema, wishlistItemSchema, type MutationState } from '@/lib/cart/validation';
import { getCurrentUserId } from '@/server/repositories/cart-repository';
import { addWishlistItem, removeWishlistItem } from '@/server/repositories/wishlist-repository';
import { getWishlistCount, mergeGuestWishlist } from '@/server/services/wishlist-service';

/**
 * Wishlist server actions.
 *
 * Every action here requires a signed-in user. A guest's wishlist is a browser
 * list of ids (`lib/wishlist/guest.ts`) that the client island manages without
 * the server, so there is nothing for these actions to do for a guest — and a
 * guest cannot reach them, because the repository uses the request-scoped client
 * and RLS scopes every write to `auth.uid()`.
 *
 * -----------------------------------------------------------------------------
 * THE DATABASE IS THE SOURCE OF TRUTH AFTER SIGN-IN
 * -----------------------------------------------------------------------------
 *
 * `mergeGuestWishlistAction` copies the browser's ids into the account once. After
 * that the browser copy is cleared and never consulted again: the toggle reads
 * its state from the database, and the wishlist page renders from the database.
 * A signed-in visitor therefore sees exactly what is saved, regardless of what
 * the browser still holds.
 */

export async function addToWishlist(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = wishlistItemSchema.safeParse({ productId: formData.get('productId') });

  if (!parsed.success) {
    return { status: 'error', message: 'That request could not be read. Please try again.' };
  }

  if (!isSupabaseConfigured()) {
    return { status: 'error', message: 'Saving is temporarily unavailable.' };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    // The client island saves to the browser list instead and never calls this.
    return { status: 'error', message: 'Please sign in to save pieces to your account.' };
  }

  try {
    await addWishlistItem(userId, parsed.data.productId);
    revalidatePath('/wishlist');

    return {
      status: 'success',
      message: 'Saved to your wishlist.',
      wishlistCount: await getWishlistCount(userId),
    };
  } catch (error) {
    return wishlistFailure('wishlist.add_failed', error, 'We could not save that just now.');
  }
}

export async function removeFromWishlist(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = wishlistItemSchema.safeParse({ productId: formData.get('productId') });

  if (!parsed.success) {
    return { status: 'error', message: 'That request could not be read.' };
  }

  if (!isSupabaseConfigured()) {
    return { status: 'error', message: 'Saving is temporarily unavailable.' };
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return { status: 'error', message: 'Please sign in to manage your saved pieces.' };
  }

  try {
    await removeWishlistItem(userId, parsed.data.productId);
    revalidatePath('/wishlist');

    return {
      status: 'success',
      message: 'Removed from your wishlist.',
      wishlistCount: await getWishlistCount(userId),
    };
  } catch (error) {
    return wishlistFailure('wishlist.remove_failed', error, 'We could not remove that just now.');
  }
}

/**
 * Merge the guest wishlist into the account.
 *
 * Called once by the client island on the transition from signed-out to
 * signed-in, with the ids it read from `localStorage`. The ids are untrusted
 * input: the schema validates their shape and bounds the count, and the
 * `wishlist_items_unique` constraint makes a duplicate impossible. An id that
 * names nothing produces no row and cannot create a product.
 *
 * The response carries the number now saved, which is what the island uses to
 * decide whether to clear the browser copy. The island clears it only on a
 * successful merge, so a failure retries on the next sign-in rather than losing
 * the customer's list.
 */
export async function mergeGuestWishlistAction(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  if (!isSupabaseConfigured()) return { status: 'idle' };

  const userId = await getCurrentUserId();
  if (!userId) return { status: 'idle' };

  // The ids arrive as a JSON array in one field, because a server action's
  // `FormData` has no native array type and the island already holds a list.
  let raw: unknown = [];
  const field = formData.get('productIds');
  if (typeof field === 'string' && field !== '') {
    try {
      raw = JSON.parse(field);
    } catch {
      raw = [];
    }
  }

  const parsed = mergeWishlistSchema.safeParse({ productIds: raw });
  if (!parsed.success) {
    return { status: 'error', message: 'Your saved pieces could not be moved across.' };
  }

  try {
    const { saved } = await mergeGuestWishlist(userId, parsed.data.productIds);
    revalidatePath('/wishlist');
    return { status: 'success', wishlistCount: saved };
  } catch (error) {
    return wishlistFailure(
      'wishlist.merge_failed',
      error,
      'We could not move your saved pieces across just now.',
    );
  }
}

function wishlistFailure(logKey: string, error: unknown, fallback: string): MutationState {
  logger.error(logKey, { message: error instanceof Error ? error.message : 'unknown error' });
  return { status: 'error', message: fallback };
}
