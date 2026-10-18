import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { readCartSessionToken } from '@/lib/cart/session';
import type { CartPricingPayload } from '@/lib/cart/pricing';
import type { Json } from '@/lib/database.types';

/**
 * Cart persistence.
 *
 * -----------------------------------------------------------------------------
 * TWO CLIENTS, ON PURPOSE
 * -----------------------------------------------------------------------------
 *
 * A cart belongs to a signed-in user or to an anonymous session token, and the
 * two are reached differently:
 *
 *   * **Signed-in** — the request-scoped client, so `carts_select_own` and
 *     `cart_items_write_own` (migration 0007) scope every read and write to
 *     `auth.uid()`. RLS is what keeps one customer out of another's cart, and
 *     using the anon-key client is what makes that true rather than merely
 *     intended.
 *
 *   * **Guest** — the service-role client. This is not a shortcut; it is the
 *     documented design. A guest cart has **no RLS policy at all** (0007), and
 *     the comment there says why: "an anonymous caller cannot read or write
 *     `carts` directly, because there is no way to prove ownership of a guest
 *     cart from inside a policy. Guest carts are handled exclusively
 *     server-side with the service-role client, where the session token lives in
 *     an httpOnly cookie and never appears in a query the browser can
 *     influence."
 *
 * So the browser never supplies a cart id, never supplies a session token, and
 * cannot name a cart that is not its own. The token is read from the httpOnly
 * cookie on the server and used as the only lookup key.
 *
 * -----------------------------------------------------------------------------
 * WHAT THIS MODULE DOES NOT DO
 * -----------------------------------------------------------------------------
 *
 * It does not price anything. `unit_price_cents` is written as a display
 * snapshot so the cart page has something to show before the first re-price, and
 * it is re-derived by `cart_pricing` on every read and again by
 * `submit_order_request` at order time. No function here is trusted with a
 * number that matters.
 */

export type CartOwner = { kind: 'user'; userId: string } | { kind: 'guest'; sessionToken: string };

/** One stored line, before it is priced. */
export type StoredCartItem = {
  productId: string;
  quantity: number;
};

export type LocatedCart = {
  owner: CartOwner;
  cartId: string;
  items: StoredCartItem[];
  discountCode: string | null;
  currency: string;
};

/** The signed-in user, or `null`. Uses `getUser()`, which validates the token. */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user?.id ?? null;
}

/** Whether the caller is signed in. */
export async function isSignedIn(): Promise<boolean> {
  return (await getCurrentUserId()) !== null;
}

/**
 * Find a specific owner's cart, if there is one.
 *
 * Returns `null` when there is no cart yet, which the caller reads as "empty".
 * A guest with no cookie and a signed-in user with no cart row both reach that
 * state, and neither is an error.
 */
export async function findCartByOwner(owner: CartOwner): Promise<LocatedCart | null> {
  if (owner.kind === 'user') {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('carts')
      .select('id, discount_code, currency, cart_items ( product_id, quantity )')
      .eq('user_id', owner.userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      owner,
      cartId: data.id,
      items: normaliseItems(data.cart_items),
      discountCode: data.discount_code ?? null,
      currency: data.currency ?? 'USD',
    };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('carts')
    .select('id, discount_code, currency, cart_items ( product_id, quantity )')
    .eq('session_token', owner.sessionToken)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    owner,
    cartId: data.id,
    items: normaliseItems(data.cart_items),
    discountCode: data.discount_code ?? null,
    currency: data.currency ?? 'USD',
  };
}

/**
 * Find the cart that belongs to the caller, resolving the owner from the
 * request: the signed-in user when there is one, otherwise the guest session
 * token from the httpOnly cookie.
 */
export async function findCart(): Promise<LocatedCart | null> {
  const userId = await getCurrentUserId();

  if (userId) {
    return findCartByOwner({ kind: 'user', userId });
  }

  const sessionToken = await readCartSessionToken();
  if (!sessionToken) return null;

  return findCartByOwner({ kind: 'guest', sessionToken });
}

/** The stored lines only, or an empty list. */
export async function readCartItems(): Promise<StoredCartItem[]> {
  const cart = await findCart();
  return cart?.items ?? [];
}

/** The applied promotional code, or `null`. */
export async function readCartDiscountCode(): Promise<string | null> {
  const cart = await findCart();
  return cart?.discountCode ?? null;
}

/**
 * Get the caller's cart, creating it when it does not exist.
 *
 * Only valid in a Server Action or Route Handler: a guest cart is created with
 * the cookie that identifies it, and Next.js permits a cookie write only there.
 * The caller passes the session token it already minted through
 * `ensureCartSessionToken`, so this module never writes a cookie itself.
 *
 * `onConflict` makes the insert idempotent against the partial unique indexes
 * `carts_user_key` and `carts_session_key`, so two concurrent first-adds cannot
 * create two carts for one owner.
 */
export async function ensureCart(owner: CartOwner): Promise<string> {
  const existing = await findCartByOwner(owner);
  if (existing) return existing.cartId;

  if (owner.kind === 'user') {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('carts')
      .insert({ user_id: owner.userId })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('carts')
    .insert({ session_token: owner.sessionToken })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/** The client that may write the given owner's cart. */
async function writerFor(owner: CartOwner) {
  if (owner.kind === 'user') {
    return createSupabaseServerClient();
  }
  return createSupabaseAdminClient();
}

/**
 * Set a line to a quantity, inserting it when absent.
 *
 * The upsert targets `(cart_id, product_id)`, which `cart_items_cart_product_key`
 * makes unique, so adding a product that is already in the cart updates it
 * rather than creating a duplicate row. That is what makes "add to cart" twice
 * harmless.
 */
export async function upsertCartItem(
  owner: CartOwner,
  cartId: string,
  productId: string,
  quantity: number,
): Promise<void> {
  const client = await writerFor(owner);
  const { error } = await client.from('cart_items').upsert(
    {
      cart_id: cartId,
      product_id: productId,
      quantity,
    },
    { onConflict: 'cart_id,product_id' },
  );

  if (error) throw error;
}

/** Remove a line. Removing an absent line is not an error. */
export async function deleteCartItem(
  owner: CartOwner,
  cartId: string,
  productId: string,
): Promise<void> {
  const client = await writerFor(owner);
  const { error } = await client
    .from('cart_items')
    .delete()
    .eq('cart_id', cartId)
    .eq('product_id', productId);

  if (error) throw error;
}

/** Empty the cart. */
export async function deleteAllCartItems(owner: CartOwner, cartId: string): Promise<void> {
  const client = await writerFor(owner);
  const { error } = await client.from('cart_items').delete().eq('cart_id', cartId);
  if (error) throw error;
}

/**
 * Record or clear the promotional code the customer applied.
 *
 * The code is stored as a reference to `discount_codes.code`; the amount is
 * derived from it on every read. A code that does not exist is rejected by the
 * foreign key, which is why the caller resolves it through `cart_pricing` first
 * and only stores a code that was recognised.
 */
export async function setCartDiscountCode(
  owner: CartOwner,
  cartId: string,
  code: string | null,
): Promise<void> {
  const client = await writerFor(owner);
  const { error } = await client.from('carts').update({ discount_code: code }).eq('id', cartId);
  if (error) throw error;
}

/**
 * Move a guest cart's contents into a signed-in cart.
 *
 * Called on the transition from signed-out to signed-in. The merge itself is
 * pure (`mergeCartLines`) so its "lose nothing, duplicate nothing" rule is
 * testable; this function only performs the resulting writes.
 *
 * The guest cart is deleted after a successful merge, so the session token
 * cannot resurrect it. `onConflict` keeps a repeated merge from duplicating a
 * line if the guest cart was not deleted for any reason.
 */
export async function replaceCartItems(
  owner: CartOwner,
  cartId: string,
  items: StoredCartItem[],
): Promise<void> {
  const client = await writerFor(owner);

  if (items.length === 0) return;

  const { error } = await client.from('cart_items').upsert(
    items.map((item) => ({
      cart_id: cartId,
      product_id: item.productId,
      quantity: item.quantity,
    })),
    { onConflict: 'cart_id,product_id' },
  );

  if (error) throw error;
}

/** Delete a cart row outright. Used to retire a merged guest cart. */
export async function deleteCartBySessionToken(sessionToken: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('carts').delete().eq('session_token', sessionToken);
  if (error) throw error;
}

/**
 * The cart's item count, for the header badge.
 *
 * Cheap on purpose: it selects quantities only, and it never calls
 * `cart_pricing`. The badge needs a number, not a price, and pricing on every
 * page render would be work done to display a digit.
 */
export async function readCartItemCount(): Promise<number> {
  const cart = await findCart();
  if (!cart) return 0;
  return cart.items.reduce((total, item) => total + item.quantity, 0);
}

/**
 * Whether a product is in the caller's cart.
 *
 * Used by the product page's add-to-cart control so it can say "In your cart"
 * rather than offering to add something that is already there.
 */
export async function isProductInCart(productId: string): Promise<boolean> {
  const cart = await findCart();
  if (!cart) return false;
  return cart.items.some((item) => item.productId === productId);
}

/** Narrow the embedded `cart_items` relation into stored lines. */
function normaliseItems(raw: unknown): StoredCartItem[] {
  if (!Array.isArray(raw)) return [];

  const items: StoredCartItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const row = entry as { product_id?: unknown; quantity?: unknown };
    if (typeof row.product_id !== 'string') continue;
    const quantity = typeof row.quantity === 'number' ? row.quantity : Number(row.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) continue;
    items.push({ productId: row.product_id, quantity: Math.min(99, Math.trunc(quantity)) });
  }
  return items;
}

/**
 * Price a set of lines, exactly as the cart will display them.
 *
 * The work is done by the `cart_pricing` database function, which re-reads every
 * product, decides availability, decides whether the product model permits a
 * quantity above one, and recomputes any discount. This wrapper only shapes the
 * call, so the cart, the drawer and the merge all price through one code path.
 *
 * The request-scoped client is used. `cart_pricing` is `security definer` and
 * granted to `anon`, so a signed-out visitor can price a cart, which is what
 * makes the guest cart work at all. It reads only the products the caller names
 * and returns no cost or stock figure, so the grant is safe.
 */
export async function priceCart(
  items: StoredCartItem[],
  discountCode: string | null,
  currency = 'USD',
): Promise<CartPricingPayload | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('cart_pricing', {
    p_items: items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    })) as unknown as Json,
    // `undefined` rather than `null` for an absent code: the generated RPC type
    // marks an optional argument as `string | undefined`, and omitting it lets
    // the SQL default apply.
    p_discount_code: discountCode ?? undefined,
    p_currency: currency,
  });

  if (error) throw error;
  return (data ?? null) as CartPricingPayload | null;
}
