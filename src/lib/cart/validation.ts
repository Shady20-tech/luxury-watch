/**
 * Validation and result types for the cart and wishlist server actions.
 *
 * Kept out of the `'use server'` modules deliberately. A `'use server'` module
 * may only export async functions, so the schemas, the state types and the
 * error allowlist cannot live there and still be unit-tested. They are pure
 * logic with no database access, so they belong in `lib` on their own merits;
 * the action is then a thin boundary that validates, calls the repository and
 * maps the result.
 *
 * The validation here is not the security boundary. `cart_pricing` re-derives
 * every number and the database constraints re-check every quantity, so calling
 * an action directly does not avoid any of it. This layer exists to reject
 * nonsense before a round trip and to return a useful message.
 */

import { z } from 'zod';

/**
 * A product id.
 *
 * The shape is checked rather than the existence: an id that is not a UUID
 * cannot name a product, and passing it to Postgres would raise inside a cast
 * and turn a bad request into a 500. The database still decides whether the id
 * names a real, published product.
 */
const productId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F-]{36}$/, 'That product reference is invalid.');

/**
 * A quantity.
 *
 * The bounds match `cart_items_quantity_positive` (`1..99`). A value outside
 * them is rejected here so the customer sees a message instead of a constraint
 * violation; the constraint is still what makes the state impossible.
 */
const quantity = z.coerce
  .number()
  .int('Quantity must be a whole number.')
  .min(1, 'Quantity must be at least 1.')
  .max(99, 'Quantity must be 99 or fewer.');

/** A promotional code as the customer typed it. Normalised in the database. */
const discountCode = z
  .string()
  .trim()
  .max(32, 'That promotional code is too long.')
  .regex(
    /^[A-Za-z0-9_-]*$/,
    'A promotional code contains only letters, numbers, hyphens and underscores.',
  );

export const addToCartSchema = z.object({
  productId,
  quantity: quantity.default(1),
});

export const updateCartQuantitySchema = z.object({
  productId,
  quantity,
});

export const removeFromCartSchema = z.object({
  productId,
});

export const applyDiscountSchema = z.object({
  // An empty string clears the code, which is a real action, not an error.
  code: discountCode.default(''),
});

export const wishlistItemSchema = z.object({
  productId,
});

export const mergeWishlistSchema = z.object({
  /**
   * The guest wishlist's product ids, as read from `localStorage`.
   *
   * Bounded so a hostile payload cannot ask the server to consider an unbounded
   * list. The database's unique constraint on `(wishlist_id, product_id)` is
   * what actually prevents duplicates; this only bounds the request.
   */
  productIds: z.array(productId).max(200).default([]),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartQuantityInput = z.infer<typeof updateCartQuantitySchema>;
export type RemoveFromCartInput = z.infer<typeof removeFromCartSchema>;
export type ApplyDiscountInput = z.infer<typeof applyDiscountSchema>;
export type MergeWishlistInput = z.infer<typeof mergeWishlistSchema>;

/**
 * The result of a cart or wishlist mutation, as the UI consumes it.
 *
 * Every mutation returns the same shape so the client can update the badge and
 * show a message without knowing which action ran. `message` is a sentence safe
 * to display; a raw database error never reaches it.
 */
export type MutationState = {
  status: 'idle' | 'success' | 'error';
  /** A sentence for the customer. Never a database message. */
  message?: string;
  /** The number of items now in the cart, for the header badge. */
  cartCount?: number;
  /** The number of products now saved, for the header badge. */
  wishlistCount?: number;
  /**
   * True when the requested quantity was reduced because the product model
   * permits no more (a unique watch). The UI states this rather than silently
   * changing the number.
   */
  quantityAdjusted?: boolean;
};

export const IDLE_MUTATION: MutationState = { status: 'idle' };

/**
 * Database messages that are safe and useful to show a customer.
 *
 * An allowlist, not a denylist. A raw Postgres error can carry a constraint
 * name, a column list or a fragment of the rejected row, so anything not named
 * here becomes a generic failure. A denylist would pass the happy path and leak
 * every message nobody thought to add to it. This mirrors the enquiry module's
 * `safeDatabaseMessage`.
 */
const SAFE_DATABASE_MESSAGES = [
  'A cart may contain at most 100 lines',
  'Quantity must be',
  'That product is not available',
];

export function safeCartDatabaseMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  return SAFE_DATABASE_MESSAGES.find((safe) => message.includes(safe)) ?? null;
}
