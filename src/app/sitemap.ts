import type { MetadataRoute } from 'next';

import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { buildSitemapEntry, type SitemapEntry } from '@/lib/seo/sitemap';
import {
  fetchBrandSitemapRows,
  fetchCollectionSitemapRows,
  fetchModelSitemapRows,
} from '@/server/repositories/sitemap-repository';

/**
 * XML sitemap.
 *
 * Only routes that genuinely exist are listed, and only rows a visitor can
 * actually reach. Product entries arrive with the database-driven sitemap in
 * Phase 12; brands and collections are listed here because Phase 5 built their
 * pages.
 *
 * -----------------------------------------------------------------------------
 * THE SAME RULE THE PAGES USE
 * -----------------------------------------------------------------------------
 *
 * A page is listed if and only if it is indexable:
 *
 *   * The shop, each brand page, each collection page and each model page —
 *     clean, stable URLs with unique copy — are listed. These are the pages
 *     `isIndexableListing` calls indexable and whose canonical is themselves.
 *   * Filtered, sorted and searched permutations are **not** listed. They are
 *     `noindex, follow` and canonicalised onto the clean listing, so listing one
 *     would advertise a URL that asks not to be indexed — a sitemap that
 *     contradicts the page it points at.
 *   * `/collections/all` is not listed: it redirects to `/shop`, and a sitemap
 *     should carry the destination, not the redirect.
 *   * A brand, collection or model with **no published pieces** is not listed.
 *     Its page is real and has an honest empty state, but it is thin content that
 *     cannot rank, and its own metadata marks it `noindex`. Listing it would be
 *     the same contradiction as listing a filtered permutation. Both sides read
 *     the same published-count aggregate, so the page and the sitemap reach this
 *     decision from the same number.
 *
 * The rows are read without a session, so this stays static and a crawler's
 * repeated fetch does not become a repeated database query.
 *
 * -----------------------------------------------------------------------------
 * LAST-MODIFIED HONESTY
 * -----------------------------------------------------------------------------
 *
 * Brand and collection entries carry the row's real `updated_at`. The shop and
 * the two index pages have no single row to read, so they carry no `lastmod` at
 * all rather than a build timestamp pretending to be a change.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: SitemapEntry[] = [
    buildSitemapEntry({ path: '/', changeFrequency: 'weekly', priority: 1 }),
    buildSitemapEntry({ path: '/shop', changeFrequency: 'daily', priority: 0.9 }),
    buildSitemapEntry({ path: '/brands', changeFrequency: 'weekly', priority: 0.7 }),
    buildSitemapEntry({ path: '/collections', changeFrequency: 'weekly', priority: 0.7 }),
  ];

  if (!isSupabaseConfigured()) {
    // The documented A1 state. The static routes are still real, so they are
    // still listed; the database-driven ones simply do not exist yet.
    return entries;
  }

  try {
    const [brands, collections, models] = await Promise.all([
      fetchBrandSitemapRows(),
      fetchCollectionSitemapRows(),
      fetchModelSitemapRows(),
    ]);

    for (const brand of brands) {
      if (brand.product_count <= 0) continue;
      entries.push(
        buildSitemapEntry({
          path: `/brands/${brand.slug}`,
          lastModified: brand.updated_at,
          changeFrequency: 'weekly',
          priority: 0.6,
        }),
      );
    }

    for (const collection of collections) {
      if (collection.product_count <= 0) continue;
      entries.push(
        buildSitemapEntry({
          path: `/collections/${collection.slug}`,
          lastModified: collection.updated_at,
          changeFrequency: 'weekly',
          priority: 0.6,
        }),
      );
    }

    for (const model of models) {
      if (model.product_count <= 0) continue;
      const [brandSlug, modelSlug] = model.scopeSlug.split('/');
      entries.push(
        buildSitemapEntry({
          path: `/brands/${brandSlug}/models/${modelSlug}`,
          lastModified: model.updated_at,
          changeFrequency: 'weekly',
          priority: 0.5,
        }),
      );
    }
  } catch (error) {
    // A sitemap that throws is a 500 for every crawler. The static routes are
    // still correct, so they are served and the failure is logged.
    logger.warn('sitemap.taxonomy_unavailable', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }

  return entries;
}
