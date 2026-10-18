import 'server-only';

import { cache } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { resolveImageUrl } from '@/lib/media';
import { toCatalogueProducts } from '@/lib/catalogue/assemble';
import type { CatalogueProduct } from '@/lib/catalogue/types';
import { toProductDetail } from '@/lib/product/assemble';
import type { ProductDetailResult } from '@/lib/product/types';
import {
  fetchProductAvailability,
  fetchProductCollections,
  fetchProductImages,
  fetchProductSpecs,
  fetchPublishedProductBySlug,
  fetchSimilarProducts,
} from '@/server/repositories/product-repository';

/** How many related watches the rail requests. Bounded again in the database. */
const RELATED_LIMIT = 8;

/**
 * Load a product page's data, degrading honestly.
 *
 * The three states the rest of the site already distinguishes:
 *
 *  1. **Configured and reachable, slug found** → the product renders.
 *  2. **Configured and reachable, slug not found** → `not_found`, which the
 *     route turns into a 404. A draft, an archived product and an invented slug
 *     are all this same state, so the page cannot be used to discover that a
 *     draft exists.
 *  3. **Not configured, or the query failed** → `unavailable`. This is
 *     deliberately *not* a 404: telling a visitor a watch does not exist when the
 *     database was merely unreachable would be a false statement about the
 *     catalogue, and it would also invite a crawler to drop the URL.
 *
 * The product's own sub-queries (images, specs, collections, availability) run in
 * parallel, and the related rail starts in the same batch once the id is known.
 */
async function loadProduct(slug: string): Promise<ProductDetailResult> {
  if (!isSupabaseConfigured()) {
    return { status: 'unavailable' };
  }

  try {
    const row = await fetchPublishedProductBySlug(slug);

    if (!row) {
      return { status: 'not_found' };
    }

    const [images, specs, collections, available, relatedRows] = await Promise.all([
      fetchProductImages(row.id),
      fetchProductSpecs(row.id),
      fetchProductCollections(row.id),
      fetchProductAvailability(row.id),
      fetchSimilarProducts(row.id, RELATED_LIMIT),
    ]);

    const product = toProductDetail({
      row,
      images,
      specs,
      collections,
      available,
      resolveImage: resolveImageUrl,
    });

    const related: CatalogueProduct[] = toCatalogueProducts(
      relatedRows,
      new Date().toISOString(),
      resolveImageUrl,
    );

    return { status: 'ok', product, related };
  } catch (error) {
    logger.warn('product.load_failed', {
      // The message only. A Supabase error can carry the query and row data.
      message: error instanceof Error ? error.message : 'unknown error',
      slug,
    });

    return { status: 'unavailable' };
  }
}

/**
 * `cache()` so the page and its `generateMetadata` share one set of queries per
 * request instead of repeating five round trips. The key is the slug, which is
 * the identity of the request.
 */
export const getProductBySlug = cache(loadProduct);

/** The product only, for callers that do not need the related rail. */
export async function getProductDetail(slug: string): Promise<ProductDetailResult> {
  return getProductBySlug(slug);
}

/** Whether a product page exists for a slug, for `generateStaticParams` and tests. */
export async function productExists(slug: string): Promise<boolean> {
  const result = await getProductBySlug(slug);
  return result.status === 'ok';
}
