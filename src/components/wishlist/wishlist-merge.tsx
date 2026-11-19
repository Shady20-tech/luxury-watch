'use client';

import { useEffect, useRef } from 'react';

import { announceCountsChanged } from '@/lib/cart/events';
import { clearGuestWishlist, readGuestWishlist } from '@/lib/wishlist/guest';
import { mergeGuestWishlistAction } from '@/server/actions/wishlist-actions';
import { IDLE_MUTATION } from '@/lib/cart/validation';

/**
 * Move a guest wishlist into the account, once.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS RUNS ON THE WISHLIST PAGE, NOT IN THE SIGN-IN ACTION
 * -----------------------------------------------------------------------------
 *
 * The brief asks for a guest list to be "merged with the account after login"
 * and for the database to be "the source of truth after sign-in". The moment a
 * signed-in visitor opens their wishlist is the first point at which both are
 * true at once: they have an account, and the browser may still hold a list.
 *
 * The guest *cart* is merged inside `signInAction` (`server/actions/
 * auth-actions.ts`), because its identity is an httpOnly cookie the server can
 * read and clear in the same request. The wishlist cannot be: it lives in
 * `localStorage`, which only the browser can read, so the server action has no
 * way to see it or to clear it afterwards. That asymmetry — not the absence of a
 * sign-in flow — is why this merge is a client island rather than a line in the
 * sign-in action.
 *
 * The merge is idempotent: the browser list is cleared on success, so a second
 * visit does nothing. If a visitor signs in and never visits `/wishlist`, their
 * saved pieces stay in the browser and are merged the first time they do — they
 * are not lost, and nothing is shown as saved that is not.
 *
 * -----------------------------------------------------------------------------
 * NOTHING IS LOST ON FAILURE
 * -----------------------------------------------------------------------------
 *
 * The browser list is cleared **only** after the server confirms the merge. A
 * failed merge leaves it in place, so the next visit retries rather than losing
 * the customer's saved pieces. That is the one ordering that matters here.
 *
 * This component renders nothing.
 */
export function WishlistMerge() {
  // A ref, not state: the merge must run once per mount, and re-running it on a
  // re-render would be a second round trip for no benefit.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;

    const ids = readGuestWishlist();
    if (ids.length === 0) return;

    started.current = true;

    const formData = new FormData();
    formData.set('productIds', JSON.stringify(ids));

    void mergeGuestWishlistAction(IDLE_MUTATION, formData)
      .then((state) => {
        if (state.status === 'success') {
          clearGuestWishlist();
          announceCountsChanged();
          // The server rendered this page before the merge completed, so the
          // grid is one request out of date. A refresh shows the merged list.
          window.location.reload();
        }
      })
      .catch(() => {
        // The browser list is untouched, so the merge retries next visit.
      });
  }, []);

  return null;
}
