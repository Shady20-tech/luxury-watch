import 'server-only';

import { cache } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { assembleHomepage } from '@/lib/homepage/assemble';
import { emptyHomepage, type HomepageContent } from '@/lib/homepage/types';
import { logger } from '@/lib/logger';
import {
  fetchBrandsWithCounts,
  fetchHomepageSections,
  fetchModelNames,
  fetchRailProducts,
  fetchTestimonials,
} from '@/server/repositories/homepage-repository';

/**
 * Build the homepage content, degrading honestly.
 *
 * The same three states the chrome handles, with the same reasoning:
 *
 *  1. **Configured and reachable** → content comes from the database and
 *     `source` is `'database'`.
 *  2. **Not configured** (issue A1) → an empty composition is returned with
 *     `source: 'fallback'` and the page explains that the content layer is not
 *     connected. This is expected, so it is not logged as an error.
 *  3. **Configured but the query fails** → the empty composition is returned,
 *     the error is logged at `warn` with the message only, and the request still
 *     renders. A content outage must not take down the whole site.
 *
 * Unlike the chrome there is no code-side fixture of editorial copy. A header
 * with no links is unusable, so it needs one; a homepage whose marketing copy
 * lives in two places would drift from what the admin edits. When there is no
 * content, the page says so.
 *
 * Wrapped in `cache()` so the layout, the page and any metadata share one set
 * of queries per request rather than repeating them.
 */
async function loadHomepage(): Promise<HomepageContent> {
  if (!isSupabaseConfigured()) {
    return emptyHomepage('fallback');
  }

  try {
    const sections = await fetchHomepageSections();

    // Nothing to compose: return early rather than issuing five queries that
    // can only return empty rails.
    if (sections.length === 0) {
      return emptyHomepage('database');
    }

    const [railProducts, brandsAndCounts, models, testimonials] = await Promise.all([
      fetchRailProducts(sections),
      fetchBrandsWithCounts(),
      fetchModelNames(),
      fetchTestimonials(),
    ]);

    return assembleHomepage({
      sections,
      productsBySection: railProducts,
      brands: brandsAndCounts.brands,
      models,
      publishedCountByBrand: brandsAndCounts.publishedCountByBrand,
      testimonials,
      // Captured once so every product on the page is judged against the same
      // instant; otherwise two cards could disagree at the window boundary.
      now: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn('homepage.load_failed', {
      // The message only; a Supabase error can carry the query and row data.
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return emptyHomepage('fallback');
  }
}

export const getHomepage = cache(loadHomepage);
