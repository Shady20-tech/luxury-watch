import 'server-only';

import { cache } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { resolveImageUrl } from '@/lib/media';
import { toCatalogueProducts, pageCount } from '@/lib/catalogue/assemble';
import { emptyFacets, emptyListing, type CatalogueListing } from '@/lib/catalogue/types';
import type { CatalogueParams } from '@/lib/catalogue/params';
import {
  fetchCatalogueFacets,
  fetchCataloguePage,
} from '@/server/repositories/catalogue-repository';

/**
 * Build a catalogue listing, degrading honestly.
 *
 * The same three states the chrome and the homepage handle:
 *
 *  1. **Configured and reachable** → the listing comes from the database.
 *  2. **Not configured** → an empty listing whose `source` is `'unavailable'`.
 *     The page explains that the catalogue is not connected. This is expected
 *     during local development, so it is not logged as an error.
 *  3. **Configured but the query fails** → the same empty listing, the error is
 *     logged at `warn` with the message only, and the request still renders. A
 *     database outage must not take the page down with it.
 *
 * The distinction between "the database answered and found nothing" and "the
 * database did not answer" is the reason `source` exists. Only the first is a
 * genuine empty result, and only the first should tell a visitor to relax their
 * filters.
 *
 * -----------------------------------------------------------------------------
 * WHY THE PAGE AND THE FACETS ARE FETCHED IN PARALLEL
 * -----------------------------------------------------------------------------
 *
 * They are two independent RPC calls. Running them sequentially would add a
 * whole round trip to every catalogue page for no benefit. `Promise.all` is
 * safe here because a failure of either is handled by the same catch.
 */
async function loadListing(params: CatalogueParams): Promise<CatalogueListing> {
  if (!isSupabaseConfigured()) {
    return emptyListing(params);
  }

  try {
    const [{ rows, total }, facets] = await Promise.all([
      fetchCataloguePage(params),
      fetchCatalogueFacets(params),
    ]);

    const products = toCatalogueProducts(rows, new Date().toISOString(), resolveImageUrl);
    const pages = pageCount(total, params.pageSize);

    return {
      products,
      facets,
      total,
      page: params.page,
      pageSize: params.pageSize,
      pageCount: pages,
      hasNextPage: params.page < pages,
      hasPreviousPage: params.page > 1,
      params,
      source: 'database',
    };
  } catch (error) {
    logger.warn('catalogue.load_failed', {
      // The message only. A Supabase error can carry the query and row data.
      message: error instanceof Error ? error.message : 'unknown error',
      scope: params.scope,
      scopeSlug: params.scopeSlug,
    });

    return { ...emptyListing(params), facets: emptyFacets() };
  }
}

/**
 * Load a listing for the given validated params.
 *
 * Wrapped in `cache()` so a page, its metadata and its filter sidebar share one
 * set of queries per request rather than repeating them.
 *
 * React's `cache` keys on argument identity, and each call site parses its own
 * params object, so caching on the object would never hit. The key is therefore
 * the canonical URL of the listing, which is exactly the identity of the
 * request: two calls that would produce the same page share one set of queries.
 */
async function loadListingCached(
  cacheKey: string,
  params: CatalogueParams,
): Promise<CatalogueListing> {
  // `cacheKey` participates in the memoisation and is intentionally unused in
  // the body; `params` carries the data.
  void cacheKey;
  return loadListing(params);
}

export const getCatalogueListing = cache(loadListingCached);

/** Load a listing by its validated params. */
export function getListing(params: CatalogueParams): Promise<CatalogueListing> {
  return getCatalogueListing(catalogueCacheKey(params), params);
}

/**
 * The cache identity of a listing.
 *
 * Every field that can change the result set is included, so two requests that
 * differ only in a filter never share a cached page. Sort and page size are
 * included because they change the rows returned.
 */
function catalogueCacheKey(params: CatalogueParams): string {
  return JSON.stringify({
    scope: params.scope,
    scopeSlug: params.scopeSlug,
    query: params.query,
    facets: params.facets,
    priceMode: params.priceMode,
    priceMin: params.priceMin,
    priceMax: params.priceMax,
    yearMin: params.yearMin,
    yearMax: params.yearMax,
    caseMin: params.caseMin,
    caseMax: params.caseMax,
    boxAndPapers: params.boxAndPapers,
    availability: params.availability,
    sort: params.sort,
    page: params.page,
    pageSize: params.pageSize,
  });
}
