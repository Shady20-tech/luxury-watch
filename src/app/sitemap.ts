import type { MetadataRoute } from 'next';

import { buildSitemapEntry } from '@/lib/seo/sitemap';

/**
 * XML sitemap.
 *
 * Phase 1 lists only routes that genuinely exist. Product, brand, collection
 * and page entries are added in Phase 12, sourced from the database, each with
 * its real `updated_at` as `<lastmod>`. No entry is emitted for a route that is
 * not implemented, because a sitemap that advertises 404s wastes crawl budget
 * and misrepresents the site.
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
  ];
}
