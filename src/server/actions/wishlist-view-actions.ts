'use server';

import { z } from 'zod';

import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { resolveImageUrl } from '@/lib/media';
import { toCatalogueProducts } from '@/lib/catalogue/assemble';
import type { CatalogueProduct } from '@/lib/catalogue/types';
import { fetchWishlistProducts } from '@/server/repositories/wishlist-repository';

/**
 * Resolve a guest's saved ids into product cards.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS EXISTS
 * -----------------------------------------------------------------------------
 *
 * A guest's wishlist is a list of ids in `localStorage`, which the server cannot
 * read. The wishlist page therefore renders a Client Component that reads the
 * ids, and this action turns them into displayable products. The alternative —
 * trusting a product's title, price and image from browser storage — would mean
 * showing a price that could be months old, which is exactly what the brief's
 * "safe minimal data" rule forbids.
 *
 * -----------------------------------------------------------------------------
 * WHY THE IDS ARE NOT TRUSTED
 * -----------------------------------------------------------------------------
 *
 * They come from the browser, so they are validated and bounded here, and then
 * passed to `catalogue_by_ids`, which re-applies the publication gate inside the
 * database. An id that names a draft, an archived product or nothing at all
 * produces no row, so this action cannot be used to discover unpublished
 * products or to read a product the caller is not entitled to see.
 *
 * The action returns only products, never an error detail: a failed lookup is an
 * empty list, and the caller renders the unavailable state.
 */
const idsSchema = z.object({
  productIds: z.array(z.string().uuid()).max(200),
});

export async function readWishlistProductsByIds(
  productIds: string[],
): Promise<{ products: CatalogueProduct[]; unavailableIds: string[] }> {
  const parsed = idsSchema.safeParse({ productIds });
  if (!parsed.success) return { products: [], unavailableIds: [] };

  if (!isSupabaseConfigured()) return { products: [], unavailableIds: [] };

  try {
    const rows = await fetchWishlistProducts(parsed.data.productIds);
    const products = toCatalogueProducts(rows, new Date().toISOString(), resolveImageUrl);
    const found = new Set(products.map((product) => product.id));

    return {
      products,
      // Anything saved but not returned is no longer displayable. Reported so
      // the guest can see that a piece they saved has gone, rather than having
      // it vanish from the list with no explanation.
      unavailableIds: parsed.data.productIds.filter((id) => !found.has(id)),
    };
  } catch (error) {
    logger.warn('wishlist.guest_products_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return { products: [], unavailableIds: [] };
  }
}
