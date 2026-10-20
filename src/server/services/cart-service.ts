import 'server-only';

import { cache } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { resolveImageUrl } from '@/lib/media';
import { toCartView } from '@/lib/cart/pricing';
import { emptyCartView, type CartView } from '@/lib/cart/types';
import { mergeCartLines, type MergeableLine } from '@/lib/cart/merge';
import {
  deleteAllCartItems,
  deleteCartBySessionToken,
  ensureCart,
  findCart,
  findCartByOwner,
  priceCart,
  readCartItemCount,
  replaceCartItems,
  type CartOwner,
  type StoredCartItem,
} from '@/server/repositories/cart-repository';

/**
 * Build the cart view, degrading honestly.
 *
 * The same three states the catalogue and the chrome handle:
 *
 *  1. **Configured and reachable** → the cart is priced from the database.
 *  2. **Not configured** → an empty cart whose `source` is `'unavailable'`.
 *     Expected during local development, so it is not logged as an error.
 *  3. **Configured but the query fails** → the same unavailable cart, the error
 *     logged with the message only, and the request still renders.
 *
 * The `source` distinction matters here more than anywhere else on the site: a
 * customer shown an empty cart when the database was merely unreachable would
 * believe their items had been lost. The UI says "we could not load your cart"
 * for the unavailable case and "your cart is empty" only for the real one.
 *
 * -----------------------------------------------------------------------------
 * PRICE ON EVERY READ
 * -----------------------------------------------------------------------------
 *
 * The cart is re-priced on every read, not stored and re-used. A price captured
 * when an item was added is a price from an unknown moment, and showing it would
 * be showing the customer a figure the business may no longer honour. The
 * `unit_price_cents` column is kept as a display snapshot for the add response,
 * and this function does not read it.
 */
async function loadCart(): Promise<CartView> {
  if (!isSupabaseConfigured()) {
    return emptyCartView('unavailable');
  }

  try {
    const cart = await findCart();

    // No cart row yet is a genuine empty cart, not an unavailable one.
    if (!cart) {
      return emptyCartView('database');
    }

    const payload = await priceCart(cart.items, cart.discountCode, cart.currency);
    return toCartView(payload, resolveImageUrl);
  } catch (error) {
    logger.warn('cart.load_failed', {
      // The message only. A Supabase error can carry the query and row data.
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return emptyCartView('unavailable');
  }
}

/** `cache()` so the page, the drawer and the header badge share one set of queries. */
export const getCart = cache(loadCart);

/**
 * The header badge count.
 *
 * Wrapped in `cache()` too, and it deliberately does not price the cart: a badge
 * needs a number, and pricing on every page render to display a digit would be
 * work done for nothing.
 */
export const getCartCount = cache(async (): Promise<number> => {
  if (!isSupabaseConfigured()) return 0;
  try {
    return await readCartItemCount();
  } catch (error) {
    logger.warn('cart.count_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return 0;
  }
});

/** Whether a product is in the caller's cart, for the add-to-cart control. */
export async function productIsInCart(productId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const cart = await findCart();
    return cart?.items.some((item) => item.productId === productId) ?? false;
  } catch {
    return false;
  }
}

/**
 * Whether the product model permits a quantity above one.
 *
 * A unique watch has a single unreserved unit, so the product page must not
 * offer a quantity selector for it. The decision is made by asking
 * `cart_pricing` — the same function that will clamp the quantity when the piece
 * is added — rather than by reading the inventory count in the application.
 *
 * That is deliberate. The rule "fewer than two unreserved units means one only"
 * then lives in exactly one place, so the selector cannot disagree with what the
 * cart does, and the application never sees a stock number it could leak. A
 * failure is treated as "one only", which is the safe direction: it can only
 * under-offer, never over-offer.
 */
export async function productAllowsQuantity(productId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const payload = await priceCart([{ productId, quantity: 2 }], null);
    const lines = payload && Array.isArray(payload.lines) ? payload.lines : [];
    const first = lines[0] as { quantity_locked?: unknown } | undefined;
    return first?.quantity_locked === false;
  } catch {
    return false;
  }
}

/**
 * Merge a guest cart into the signed-in cart.
 *
 * Called on the transition from signed-out to signed-in. The semantics live in
 * the pure `mergeCartLines`: a product in both carts keeps the larger quantity,
 * and a product in one cart is carried across unchanged, so nothing is lost and
 * nothing is duplicated.
 *
 * The guest cart is deleted only after the merged lines are written, so a
 * failure part-way through leaves the guest cart intact to retry rather than
 * losing the customer's items.
 */
export async function mergeGuestCartIntoAccount(
  userId: string,
  guestSessionToken: string,
): Promise<{ merged: boolean }> {
  const userOwner: CartOwner = { kind: 'user', userId };
  const guestOwner: CartOwner = { kind: 'guest', sessionToken: guestSessionToken };

  const guestCart = await findCartByOwner(guestOwner);
  if (!guestCart || guestCart.items.length === 0) return { merged: false };

  const userCart = await findCartByOwner(userOwner);
  const userCartId = userCart?.cartId ?? (await ensureCart(userOwner));

  const accountLines: MergeableLine[] = (userCart?.items ?? []).map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
  }));
  const guestLines: MergeableLine[] = guestCart.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
  }));

  const merged: StoredCartItem[] = mergeCartLines(accountLines, guestLines);

  await replaceCartItems(userOwner, userCartId, merged);
  await deleteCartBySessionToken(guestSessionToken);

  return { merged: true };
}

/**
 * Empty the caller's cart after an order request has been accepted.
 *
 * -----------------------------------------------------------------------------
 * WHY THE CART IS EMPTIED RATHER THAN KEPT
 * -----------------------------------------------------------------------------
 *
 * The stock has been reserved for this request, so leaving the same pieces in
 * the cart would invite a second request that would race the reservation the
 * first one created. The cart is emptied only *after* the request is committed,
 * and only by the caller's own cart — the owner is resolved from the request, so
 * this can never empty someone else's.
 *
 * A guest cart is emptied in place rather than deleted, so the httpOnly session
 * cookie keeps pointing at a valid empty cart. Deleting it would let a
 * subsequent add mint a different cart and orphan the cookie.
 *
 * This does not clear the applied discount code; the code is a property of the
 * cart and its redemption is already accounted against the request. A cart with
 * no items prices to nothing regardless of the code.
 */
export async function clearCartAfterOrder(): Promise<void> {
  const cart = await findCart();
  if (!cart) return;
  await deleteAllCartItems(cart.owner, cart.cartId);
}
