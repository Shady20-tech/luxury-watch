import type { MetadataRoute } from 'next';

import { buildSitemapEntry } from '@/lib/seo/sitemap';

/**
 * XML sitemap.
 *
 * Only routes that genuinely exist are listed. Product, brand and collection
 * entries are added in Phase 12, sourced from the database, each with its real
 * `updated_at` as `<lastmod>`. No entry is emitted for a route that is not
 * implemented, because a sitemap that advertises 404s wastes crawl budget and
 * misrepresents the site. Filtered permutations of a listing are deliberately
 * absent: they are `noindex` and canonicalised onto the clean listing.
 *
 * `<lastmod>` is a crawl hint. It cannot force a recrawl, and it must never be
 * set to the current time to look fresh — that is both dishonest and ignored.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    buildSitemapEntry({
      path: '/',
      changeFrequency: 'weekly',
      priority: 1,
    }),
    // The catalogue listing is real and indexable as of the catalogue phase.
    // Its `<lastmod>` comes from `buildSitemapEntry`, which uses the build time
    // only because a listing has no single row to read; per-product timestamps
    // arrive with the database-driven sitemap in Phase 12.
    buildSitemapEntry({
      path: '/shop',
      changeFrequency: 'daily',
      priority: 0.9,
    }),
  ];
}
