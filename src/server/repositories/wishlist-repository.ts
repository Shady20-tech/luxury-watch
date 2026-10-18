import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { WishlistProductRow } from '@/lib/wishlist/assemble';

/**
 * Wishlist persistence.
 *
 * The database is the source of truth for a signed-in wishlist. Every function
 * here requires an authenticated caller and uses the request-scoped client, so
 * `wishlists_select_own` and `wishlist_items_*_own` (migration 0007) scope every
 * read and write to `auth.uid()`. There is no service-role path: a wishlist has
 * no guest equivalent in the database, so there is nothing that needs to bypass
 * RLS.
 *
 * The guest wishlist is a browser list of ids (`lib/wishlist/guest.ts`) that is
 * merged into these tables once, on sign-in. After that the browser copy is
 * discarded and never consulted again.
 *
 * -----------------------------------------------------------------------------
 * DUPLICATES
 * -----------------------------------------------------------------------------
 *
 * `wishlist_items_unique` — a unique constraint on `(wishlist_id, product_id)` —
 * is what makes a duplicate impossible, not the application. The upsert below
 * targets that constraint with `ignoreDuplicates: true`, so a double-tap, a
 * replayed request or a merge of an id that is already saved all resolve to the
 * same single row.
 */

/** The caller's default wishlist id, creating the list on first use. */
export async function ensureWishlistId(userId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: selectError } = await supabase
    .from('wishlists')
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing.id;

  // `onConflict` against `wishlists_one_default_per_user_idx` makes two
  // concurrent first-saves resolve to one list rather than two.
  const { data: created, error: insertError } = await supabase
    .from('wishlists')
    .insert({ user_id: userId, is_default: true })
    .select('id')
    .single();

  if (insertError) {
    // A concurrent request won the race. Re-read rather than failing.
    const { data: raced, error: racedError } = await supabase
      .from('wishlists')
      .select('id')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle();
    if (racedError) throw racedError;
    if (raced) return raced.id;
    throw insertError;
  }

  return created.id;
}

/** The caller's saved product ids, most recently saved first. */
export async function readWishlistProductIds(userId: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('wishlist_items')
    .select('product_id, created_at, wishlists!inner ( user_id )')
    .eq('wishlists.user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => row.product_id);
}

/** How many products the caller has saved, for the header badge. */
export async function readWishlistCount(userId: string): Promise<number> {
  const ids = await readWishlistProductIds(userId);
  return ids.length;
}

/**
 * Add a product to the wishlist.
 *
 * Idempotent: `ignoreDuplicates` against `wishlist_items_unique` means saving a
 * product that is already saved changes nothing and is not an error. That is the
 * behaviour a toggle needs, and it is enforced by the constraint rather than by
 * a read-then-write, which would race.
 */
export async function addWishlistItem(userId: string, productId: string): Promise<void> {
  const wishlistId = await ensureWishlistId(userId);
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('wishlist_items')
    .upsert(
      { wishlist_id: wishlistId, product_id: productId },
      { onConflict: 'wishlist_id,product_id', ignoreDuplicates: true },
    );

  if (error) throw error;
}

/** Remove a product from the wishlist. Removing an absent product is a no-op. */
export async function removeWishlistItem(userId: string, productId: string): Promise<void> {
  const wishlistId = await ensureWishlistId(userId);
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('wishlist_items')
    .delete()
    .eq('wishlist_id', wishlistId)
    .eq('product_id', productId);

  if (error) throw error;
}

/**
 * Add several products at once, ignoring any already saved.
 *
 * Used by the guest-to-account merge. Bounded by the caller's schema, and
 * deduplicated by the constraint, so a merge cannot create a duplicate row and
 * cannot fail merely because one id was already present.
 */
export async function addWishlistItems(userId: string, productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;

  const wishlistId = await ensureWishlistId(userId);
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from('wishlist_items').upsert(
    productIds.map((productId) => ({ wishlist_id: wishlistId, product_id: productId })),
    { onConflict: 'wishlist_id,product_id', ignoreDuplicates: true },
  );

  if (error) throw error;
}

/** Whether the caller has saved a product. */
export async function isProductSaved(userId: string, productId: string): Promise<boolean> {
  const ids = await readWishlistProductIds(userId);
  return ids.includes(productId);
}

/**
 * The published product rows for a set of saved ids.
 *
 * Delegates to `catalogue_by_ids`, which re-applies the publication and
 * active-taxonomy gates across its `security definer` boundary, so a saved id
 * that names a draft, an archived product or a product under an inactive brand
 * returns no row. The wishlist then reports it as unavailable rather than
 * showing it, which is what keeps a draft from leaking through a saved id.
 *
 * The row shape matches `catalogue_search` minus `total_count`, so the wishlist
 * reuses the catalogue card mapping unchanged.
 */
export async function fetchWishlistProducts(productIds: string[]): Promise<WishlistProductRow[]> {
  if (productIds.length === 0) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('catalogue_by_ids', {
    p_product_ids: productIds,
  });

  if (error) throw error;
  return (data ?? []) as unknown as WishlistProductRow[];
}
