import 'server-only';

import { cache } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { PageContent } from '@/lib/content/types';
import { fetchFaqs, fetchPageBySlug, type Faq } from '@/server/repositories/content-repository';

/**
 * The CMS content read, degrading honestly.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS LAYER EXISTS
 * -----------------------------------------------------------------------------
 *
 * The repository throws on a failed query, which is right: a repository that
 * swallowed errors would make "no rows" and "the database did not answer"
 * indistinguishable to every caller. But the pages must not inherit that throw.
 * A page linked from the footer — the about page, the policies, the FAQ — would
 * then return a 500 whenever the database is unreachable, which is worse than
 * saying so.
 *
 * So the three states the rest of the application already distinguishes are
 * distinguished here too:
 *
 *   1. **Configured and reachable, row present** → `ok`.
 *   2. **Configured and reachable, no published row** → `missing`. RLS restricts
 *      `pages` to `published`, so a draft and a slug that was never written are
 *      the same answer, and the route decides between a 404 and a placeholder.
 *   3. **Not configured, or the query failed** → `unavailable`. The page renders
 *      an explanation instead of the content. This is the state during local
 *      development without a database, so it is not logged as an error.
 *
 * `unavailable` is deliberately distinct from `missing`: telling a visitor the
 * page does not exist when the truth is that we could not reach the database
 * would be a lie, and a crawler would record it as one.
 */

export type PageResult =
  | { status: 'ok'; page: PageContent }
  | { status: 'missing' }
  | { status: 'unavailable' };

async function loadPage(slug: string): Promise<PageResult> {
  if (!isSupabaseConfigured()) return { status: 'unavailable' };

  try {
    const page = await fetchPageBySlug(slug);
    return page ? { status: 'ok', page } : { status: 'missing' };
  } catch (error) {
    logger.warn('content.page_load_failed', {
      // The message only. A Supabase error can carry the query and row data.
      message: error instanceof Error ? error.message : 'unknown error',
      slug,
    });
    return { status: 'unavailable' };
  }
}

export type FaqResult = { status: 'ok'; faqs: Faq[] } | { status: 'unavailable' };

async function loadFaqs(): Promise<FaqResult> {
  if (!isSupabaseConfigured()) return { status: 'unavailable' };

  try {
    return { status: 'ok', faqs: await fetchFaqs() };
  } catch (error) {
    logger.warn('content.faq_load_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return { status: 'unavailable' };
  }
}

/** One page by slug, degrading rather than throwing. Cached per request. */
export const getPageBySlug = cache(loadPage);

/** The published FAQs, degrading rather than throwing. Cached per request. */
export const getFaqs = cache(loadFaqs);
