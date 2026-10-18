'use server';

import { revalidatePath } from 'next/cache';

import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { clearCartSessionToken, ensureCartSessionToken } from '@/lib/cart/session';
import {
  addToCartSchema,
  applyDiscountSchema,
  removeFromCartSchema,
  safeCartDatabaseMessage,
  updateCartQuantitySchema,
  wishlistItemSchema,
  type MutationState,
} from '@/lib/cart/validation';
import {
  deleteAllCartItems,
  deleteCartItem,
  ensureCart,
  findCart,
  findCartByOwner,
  getCurrentUserId,
  priceCart,
  setCartDiscountCode,
  upsertCartItem,
  type CartOwner,
} from '@/server/repositories/cart-repository';
import { removeWishlistItem } from '@/server/repositories/wishlist-repository';
import { mergeGuestCartIntoAccount } from '@/server/services/cart-service';
import { getWishlistCount } from '@/server/services/wishlist-service';

/**
 * Cart server actions.
 *
 * -----------------------------------------------------------------------------
 * WHY SERVER ACTIONS
 * -----------------------------------------------------------------------------
 *
 * Every mutation must be usable without JavaScript, and none of them may be a
 * public write endpoint a script can call in a loop with a client-chosen price.
 * A server action gives the first (progressive enhancement through a real
 * `<form>`), and the design below gives the second:
 *
 *   * The action accepts a **product id and a quantity**. It never accepts a
 *     price, a subtotal or a discount amount. There is no field to tamper with.
 *   * Every number the customer sees is re-derived by `cart_pricing` after the
 *     write, and the response carries the recomputed cart, not the request.
 *   * The quantity is re-clamped by the database, so a request for two of a
 *     unique watch becomes one and the response says so.
 *
 * -----------------------------------------------------------------------------
 * THE CART IS NOT A RESERVATION
 * -----------------------------------------------------------------------------
 *
 * Adding to a cart does not touch `inventory`, `inventory_reservations` or
 * `inventory_transactions`. Nothing here decrements stock. The copy in the UI
 * says the piece is set aside "in your cart", never "reserved", because only an
 * administrator's confirmation reserves it.
 */

/** The owner of the current request's cart, minting a guest token when needed. */
async function resolveOwner(): Promise<CartOwner> {
  const userId = await getCurrentUserId();
  if (userId) return { kind: 'user', userId };

  // A write is happening, so it is legal (and correct) to mint the cookie here.
  const sessionToken = await ensureCartSessionToken();
  return { kind: 'guest', sessionToken };
}

/** The current item count, for the header badge, after a mutation. */
async function currentCount(): Promise<number> {
  const cart = await findCart();
  if (!cart) return 0;
  return cart.items.reduce((total, item) => total + item.quantity, 0);
}

/**
 * The quantity the database will actually store for a line.
 *
 * `cart_pricing` decides this, so the action asks it rather than duplicating the
 * "a unique piece permits one" rule. A single product is priced through the same
 * function the cart page uses, so the two cannot disagree.
 */
async function permittedQuantity(productId: string, quantity: number): Promise<number> {
  const payload = await priceCart([{ productId, quantity }], null);
  const lines = payload && Array.isArray(payload.lines) ? payload.lines : [];
  const first = lines[0] as { quantity?: unknown } | undefined;
  const resolved = typeof first?.quantity === 'number' ? first.quantity : quantity;
  return Math.max(1, Math.min(99, Math.trunc(resolved)));
}

/** Refresh the cart surfaces after a change. */
function revalidateCartSurfaces(): void {
  // The cart page and the drawer read the same source; both are refreshed so a
  // back-navigation cannot show a stale cart.
  revalidatePath('/cart');
}

export async function addToCart(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = addToCartSchema.safeParse({
    productId: formData.get('productId'),
    quantity: formData.get('quantity') ?? 1,
  });

  if (!parsed.success) {
    return { status: 'error', message: 'That request could not be read. Please try again.' };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: 'error',
      message: 'The cart is temporarily unavailable. Please try again shortly.',
    };
  }

  const { productId } = parsed.data;

  try {
    const owner = await resolveOwner();
    const quantity = await permittedQuantity(productId, parsed.data.quantity);

    // Confirm the product is real and published before creating a cart for it,
    // so an invented id cannot leave an empty cart behind.
    const payload = await priceCart([{ productId, quantity }], null);
    const lines = payload && Array.isArray(payload.lines) ? payload.lines : [];
    if (lines.length === 0) {
      return { status: 'error', message: 'That piece is no longer available.' };
    }

    const cartId = await ensureCart(owner);
    await upsertCartItem(owner, cartId, productId, quantity);

    revalidateCartSurfaces();

    const adjusted = quantity !== parsed.data.quantity;
    return {
      status: 'success',
      message: adjusted
        ? 'This is a unique piece, so one has been added to your cart.'
        : 'Added to your cart.',
      cartCount: await currentCount(),
      quantityAdjusted: adjusted,
    };
  } catch (error) {
    return cartFailure('cart.add_failed', error, 'We could not add that to your cart just now.');
  }
}

export async function updateCartQuantity(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = updateCartQuantitySchema.safeParse({
    productId: formData.get('productId'),
    quantity: formData.get('quantity'),
  });

  if (!parsed.success) {
    return { status: 'error', message: 'That quantity is not valid.' };
  }

  if (!isSupabaseConfigured()) {
    return { status: 'error', message: 'The cart is temporarily unavailable.' };
  }

  const { productId } = parsed.data;

  try {
    const owner = await resolveOwner();
    const cart = await findCartByOwner(owner);
    if (!cart) {
      return { status: 'error', message: 'Your cart could not be found.' };
    }

    const quantity = await permittedQuantity(productId, parsed.data.quantity);
    await upsertCartItem(owner, cart.cartId, productId, quantity);

    revalidateCartSurfaces();

    const adjusted = quantity !== parsed.data.quantity;
    return {
      status: 'success',
      message: adjusted ? 'This is a unique piece, so the quantity is one.' : undefined,
      cartCount: await currentCount(),
      quantityAdjusted: adjusted,
    };
  } catch (error) {
    return cartFailure('cart.update_failed', error, 'We could not update your cart just now.');
  }
}

export async function removeFromCart(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = removeFromCartSchema.safeParse({ productId: formData.get('productId') });

  if (!parsed.success) {
    return { status: 'error', message: 'That request could not be read.' };
  }

  if (!isSupabaseConfigured()) {
    return { status: 'error', message: 'The cart is temporarily unavailable.' };
  }

  try {
    const owner = await resolveOwner();
    const cart = await findCartByOwner(owner);
    if (!cart) return { status: 'success', message: 'Removed from your cart.', cartCount: 0 };

    await deleteCartItem(owner, cart.cartId, parsed.data.productId);
    revalidateCartSurfaces();

    return {
      status: 'success',
      message: 'Removed from your cart.',
      cartCount: await currentCount(),
    };
  } catch (error) {
    return cartFailure('cart.remove_failed', error, 'We could not remove that just now.');
  }
}

/** Empty the cart. Offered on the cart page for a customer starting over. */
export async function clearCart(
  _previous: MutationState,
  _formData: FormData,
): Promise<MutationState> {
  if (!isSupabaseConfigured()) {
    return { status: 'error', message: 'The cart is temporarily unavailable.' };
  }

  try {
    const owner = await resolveOwner();
    const cart = await findCartByOwner(owner);
    if (cart) await deleteAllCartItems(owner, cart.cartId);

    revalidateCartSurfaces();
    return { status: 'success', message: 'Your cart is now empty.', cartCount: 0 };
  } catch (error) {
    return cartFailure('cart.clear_failed', error, 'We could not empty your cart just now.');
  }
}

/**
 * Apply or clear a promotional code.
 *
 * The customer supplies the code and nothing else. Eligibility and the amount
 * are decided by `cart_pricing`; the action stores the code only when the
 * database recognised it, so a mistyped code is never persisted. A rejected code
 * is reported with the database's own reason rather than a generic message.
 */
export async function applyDiscountCode(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = applyDiscountSchema.safeParse({ code: formData.get('code') ?? '' });

  if (!parsed.success) {
    return { status: 'error', message: 'That promotional code is not valid.' };
  }

  if (!isSupabaseConfigured()) {
    return { status: 'error', message: 'The cart is temporarily unavailable.' };
  }

  const code = parsed.data.code.trim().toUpperCase();

  try {
    const owner = await resolveOwner();
    const cart = await findCartByOwner(owner);

    if (!cart || cart.items.length === 0) {
      return { status: 'error', message: 'Add a piece to your cart before applying a code.' };
    }

    if (code === '') {
      await setCartDiscountCode(owner, cart.cartId, null);
      revalidateCartSurfaces();
      return {
        status: 'success',
        message: 'Promotional code removed.',
        cartCount: await currentCount(),
      };
    }

    const payload = await priceCart(cart.items, code, cart.currency);
    const discount = (payload?.discount ?? null) as { applied?: unknown; reason?: unknown } | null;

    if (!discount || discount.applied !== true) {
      const reason =
        typeof discount?.reason === 'string' && discount.reason !== ''
          ? discount.reason
          : 'That promotional code could not be applied.';
      return { status: 'error', message: reason };
    }

    // Only a recognised code is stored; the amount is never stored.
    await setCartDiscountCode(owner, cart.cartId, code);
    revalidateCartSurfaces();

    return {
      status: 'success',
      message: 'Promotional code applied.',
      cartCount: await currentCount(),
    };
  } catch (error) {
    return cartFailure('cart.discount_failed', error, 'We could not apply that code just now.');
  }
}

/**
 * Move a saved piece from the wishlist into the cart.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS ONE ACTION AND NOT TWO
 * -----------------------------------------------------------------------------
 *
 * The brief asks for move-to-cart "without duplicating or silently dropping
 * items". Doing it as two independent calls from the browser — remove from the
 * wishlist, then add to the cart — has exactly two failure modes, and both are
 * the ones the brief names: if the add fails after the remove succeeded, the
 * piece is dropped from the list and is not in the cart; if the remove fails
 * after the add succeeded, the piece is in both and the customer sees it twice.
 *
 * So the two writes happen in one action, in the order that loses nothing: the
 * cart write happens **first**, and the wishlist row is removed only once the
 * cart write has succeeded. A failure therefore leaves the piece saved, which is
 * recoverable, rather than losing it, which is not.
 *
 * -----------------------------------------------------------------------------
 * DUPLICATION
 * -----------------------------------------------------------------------------
 *
 * Adding a product that is already in the cart is an upsert against
 * `(cart_id, product_id)`, so it updates the existing line rather than creating
 * a second one. The quantity is the one the product model permits, resolved
 * through `cart_pricing` exactly as `addToCart` does — a unique watch moves as
 * one, and the message says so rather than silently changing the number.
 */
export async function moveToCartFromWishlist(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = wishlistItemSchema.safeParse({ productId: formData.get('productId') });

  if (!parsed.success) {
    return { status: 'error', message: 'That request could not be read. Please try again.' };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: 'error',
      message: 'The cart is temporarily unavailable. Please try again shortly.',
    };
  }

  const { productId } = parsed.data;

  try {
    const owner = await resolveOwner();
    const quantity = await permittedQuantity(productId, 1);

    // Confirm the product is real and published before writing anything, so an
    // invented id cannot leave an empty cart behind or empty a wishlist row.
    const payload = await priceCart([{ productId, quantity }], null);
    const lines = payload && Array.isArray(payload.lines) ? payload.lines : [];
    if (lines.length === 0) {
      return { status: 'error', message: 'That piece is no longer available.' };
    }

    const cartId = await ensureCart(owner);
    await upsertCartItem(owner, cartId, productId, quantity);

    // Only now. The cart holds the piece, so removing it from the list cannot
    // lose it. For a guest the wishlist is in `localStorage`, which this action
    // cannot touch; the client island clears it once this returns successfully.
    if (owner.kind === 'user') {
      await removeWishlistItem(owner.userId, productId);
      revalidatePath('/wishlist');
    }

    revalidateCartSurfaces();

    return {
      status: 'success',
      message: 'Moved to your cart.',
      cartCount: await currentCount(),
      wishlistCount: owner.kind === 'user' ? await getWishlistCount(owner.userId) : undefined,
    };
  } catch (error) {
    return cartFailure('cart.move_failed', error, 'We could not move that to your cart just now.');
  }
}

/**
 * Merge the guest cart into the account after sign-in.
 *
 * Called by the sign-in flow once a session exists. The guest session token is
 * read from the cookie, the merge runs, and the token is cleared only on
 * success, so a failure leaves the guest cart intact to retry.
 */
export async function mergeGuestCart(): Promise<MutationState> {
  if (!isSupabaseConfigured()) return { status: 'idle' };

  const userId = await getCurrentUserId();
  if (!userId) return { status: 'idle' };

  const { readCartSessionToken } = await import('@/lib/cart/session');
  const sessionToken = await readCartSessionToken();
  if (!sessionToken) return { status: 'idle' };

  try {
    const { merged } = await mergeGuestCartIntoAccount(userId, sessionToken);
    if (merged) await clearCartSessionToken();

    revalidateCartSurfaces();
    return { status: 'success', cartCount: await currentCount() };
  } catch (error) {
    // The guest cart is deliberately left in place so the next sign-in retries.
    logger.warn('cart.merge_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return { status: 'error', message: 'We could not move your saved cart across just now.' };
  }
}

/**
 * Map a thrown error to a state the customer may see.
 *
 * An allowlist, matching the enquiry action: a recognised database message is
 * shown, and everything else becomes a generic sentence and is logged without
 * the payload.
 */
function cartFailure(logKey: string, error: unknown, fallback: string): MutationState {
  const safe = safeCartDatabaseMessage(error);
  if (safe) {
    logger.warn(logKey, { reason: safe });
    return { status: 'error', message: safe };
  }

  logger.error(logKey, { message: error instanceof Error ? error.message : 'unknown error' });
  return { status: 'error', message: fallback };
}
