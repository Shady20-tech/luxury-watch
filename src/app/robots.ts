import type { MetadataRoute } from 'next';

import { absoluteUrl, getPublicEnv } from '@/lib/env';
import { PRIVATE_DISALLOW_PATHS } from '@/lib/seo/private-routes';

/**
 * `robots.txt`.
 *
 * The rules mirror the intent of the reference site's `robots.txt` — keep
 * private and transactional surfaces out of the index — but they are written
 * against our own route structure.
 *
 * A note on generative AI: Google's guidance is explicit that no special file
 * or markup is needed for AI Overviews or AI Mode, and that `llms.txt` is
 * ignored by Google Search. We therefore do not ship one. See
 * `docs/SEO.md` for the reasoning and the source.
 *
 * -----------------------------------------------------------------------------
 * WHY THERE IS NO QUERY-STRING RULE HERE
 * -----------------------------------------------------------------------------
 *
 * An earlier version disallowed `/*?*sort=`, `/*?*filter=` and `/*?*page=` on
 * the theory that faceted navigation is a crawl trap. That was wrong twice
 * over. A disallowed URL is never fetched, so the crawler never reads its
 * `noindex` or its canonical — the very signals that consolidate a facet
 * permutation onto the clean listing. Blocking the crawl therefore does not
 * suppress the URL, it only stops the page from saying where it belongs.
 *
 * It also contradicted this site's own rules: `?page=2` is deliberately
 * indexable with a self-referential canonical, so disallowing it here hid the
 * deeper pages from crawlers while the page metadata invited them in.
 *
 * Facet, sort and search control is therefore page-level only — `noindex,
 * follow` plus a canonical on the clean listing — which is what Google's
 * faceted-navigation guidance recommends. See `docs/SEO.md`.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getPublicEnv().siteUrl;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Private and transactional. The shared list covers the customer and
          // staff surfaces; the auth pages are added here because they are not
          // per-visitor but are still not useful in an index.
          ...PRIVATE_DISALLOW_PATHS,
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          // Search results pages
          '/search',
        ],
      },
      {
        // Google's AdsBot ignores robots.txt unless addressed directly, so the
        // public catalogue is repeated explicitly for it.
        userAgent: 'AdsBot-Google',
        allow: ['/products/', '/collections/', '/brands/', '/pages/', '/'],
        disallow: [...PRIVATE_DISALLOW_PATHS],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: siteUrl,
  };
}
