import type { MetadataRoute } from 'next';

import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { buildSitemapEntry, type SitemapEntry } from '@/lib/seo/sitemap';
import {
  fetchBrandSitemapRows,
  fetchCollectionSitemapRows,
  fetchModelSitemapRows,
  fetchPageSitemapRows,
  fetchProductSitemapRows,
} from '@/server/repositories/sitemap-repository';

/**
 * XML sitemap.
 *
 * Only routes that genuinely exist are listed, and only rows a visitor can
 * actually reach. Products, brands, collections and models all come from the
 * database; a static route is listed only when it has no row to read.
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
 *   * Every published product is listed with its own `updated_at`. A product
 *     route is never filtered, so it has no permutation to consolidate and its
 *     canonical is itself.
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
 * Product, brand, collection and model entries carry the row's real
 * `updated_at`. The shop and the two index pages have no single row to read, so
 * they carry no `lastmod` at all rather than a build timestamp pretending to be
 * a change.
 */
export const revalidate = 3600;

/**
 * The informational routes that exist as their own static segments.
 *
 * These are listed explicitly rather than read from `pages`, because several of
 * them (`/contact`, `/appointments`, `/services/*`) have no `pages` row at all —
 * they are routes with their own copy — and listing only what the table holds
 * would omit them. Each is `index` by default and has a self-canonical; none is
 * `noindex`, which was checked against a production build rather than assumed.
 *
 * `/design-system` is deliberately absent: it carries `noindex, nofollow`.
 */
const STATIC_INFORMATIONAL_PATHS = [
  '/pages/about',
  '/pages/faq',
  '/pages/privacy',
  '/pages/terms',
  '/pages/shipping',
  '/pages/warranty',
  '/contact',
  '/appointments',
  '/services/sourcing',
  '/services/sell-trade',
  '/services/repair-restoration',
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: SitemapEntry[] = [
    buildSitemapEntry({ path: '/', changeFrequency: 'weekly', priority: 1 }),
    buildSitemapEntry({ path: '/shop', changeFrequency: 'daily', priority: 0.9 }),
    buildSitemapEntry({ path: '/brands', changeFrequency: 'weekly', priority: 0.7 }),
    buildSitemapEntry({ path: '/collections', changeFrequency: 'weekly', priority: 0.7 }),
  ];

  for (const path of STATIC_INFORMATIONAL_PATHS) {
    entries.push(buildSitemapEntry({ path, changeFrequency: 'monthly', priority: 0.5 }));
  }

  if (!isSupabaseConfigured()) {
    // The documented A1 state. The static routes are still real, so they are
    // still listed; the database-driven ones simply do not exist yet.
    return entries;
  }

  try {
    const [products, brands, collections, models, pages] = await Promise.all([
      fetchProductSitemapRows(),
      fetchBrandSitemapRows(),
      fetchCollectionSitemapRows(),
      fetchModelSitemapRows(),
      fetchPageSitemapRows(),
    ]);

    // Only pages the static routes above do not already cover. A published
    // `about` row renders at `/pages/about`, which is listed once; re-listing it
    // from the table would emit a duplicate `<url>` for the same canonical.
    const staticPaths = new Set<string>(STATIC_INFORMATIONAL_PATHS);
    for (const page of pages) {
      const path = `/pages/${page.slug}`;
      if (staticPaths.has(path)) continue;
      entries.push(
        buildSitemapEntry({
          path,
          lastModified: page.updated_at,
          changeFrequency: 'monthly',
          priority: 0.5,
        }),
      );
    }

    for (const product of products) {
      entries.push(
        buildSitemapEntry({
          path: `/products/${product.slug}`,
          lastModified: product.updated_at,
          changeFrequency: 'weekly',
          priority: 0.7,
        }),
      );
    }

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
