import type { MetadataRoute } from 'next';

import { absoluteUrl, getPublicEnv } from '@/lib/env';
import { PRIVATE_DISALLOW_PATHS } from '@/lib/seo/private-routes';

/**
 * `robots.txt`.
 *
 * The rules mirror the intent of the reference site's `robots.txt` — keep
 * private and transactional surfaces out of the index, and stop faceted
 * navigation from multiplying crawlable URLs — but they are written against our
 * own route structure.
 *
 * A note on generative AI: Google's guidance is explicit that no special file
 * or markup is needed for AI Overviews or AI Mode, and that `llms.txt` is
 * ignored by Google Search. We therefore do not ship one. See
 * `docs/SEO.md` for the reasoning and the source.
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
          // Faceted navigation and sort permutations are crawl traps. Query
          // strings cannot be matched reliably here, so those variants are
          // additionally marked `noindex` by the pages themselves.
          '/*?*sort=',
          '/*?*filter=',
          '/*?*page=',
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
