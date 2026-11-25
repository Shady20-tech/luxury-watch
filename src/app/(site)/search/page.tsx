import type { Metadata } from 'next';

import { CatalogueListingView } from '@/components/catalogue/catalogue-listing-view';
import { PageHero } from '@/components/layout/page-hero';
import { SITE_PHOTOGRAPHY } from '@/lib/images/site-photography';
import { SearchForm } from '@/components/catalogue/search-form';
import { SearchLanding } from '@/components/catalogue/search-landing';
import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  hasActiveFilters,
  parseCatalogueParams,
  type RawSearchParams,
} from '@/lib/catalogue/params';
import { buildMetadata } from '@/lib/seo/metadata';
import {
  fetchBrandDirectory,
  fetchCollectionDirectory,
} from '@/server/repositories/catalogue-repository';
import { getListing } from '@/server/services/catalogue-service';
import { getViewerState } from '@/server/services/viewer-service';

/**
 * Search.
 *
 * Search is the catalogue listing with a `q` term, not a separate result shape:
 * it reuses the same RPC, the same facets and the same cards, so a search result
 * looks and filters exactly like the rest of the catalogue. Building a second
 * result pipeline is how the two drift apart.
 *
 * `noindex` unconditionally. A search result page is the definition of thin
 * content, and letting thousands of query permutations into the index would
 * compete with the real listings. `follow` stays on so links from here are still
 * crawled.
 *
 * -----------------------------------------------------------------------------
 * THE EMPTY QUERY IS A LANDING PAGE, NOT THE SHOP
 * -----------------------------------------------------------------------------
 *
 * With no term and no filters, this page renders an index of what is searchable
 * — collections, brands and their model families, all with real counts — rather
 * than the whole catalogue. Rendering the full grid here made `/search` a second
 * `/shop`: the same rows in the same order under a different URL, and a visitor
 * who arrived at a search box was shown everything instead of being invited to
 * type.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  // `basePath` pins every link this listing generates — facets, sort, page
  // links and the canonical — to `/search`. The scope is `all`, so without it
  // they all pointed at `/shop` and filtering a search silently left the page.
  const params = parseCatalogueParams(await searchParams, 'all', null, '/search');

  return buildMetadata({
    title: params.query !== '' ? `Search: ${params.query}` : 'Search',
    description:
      'Search our catalogue by brand, model, reference number or keyword, then filter the results.',
    path: '/search',
    robots: { index: false, follow: true },
  });
}

/** The landing panel's data, degrading to an empty panel rather than an error. */
async function loadSearchLanding() {
  if (!isSupabaseConfigured()) return { brands: [], collections: [] };

  try {
    const [brands, collections] = await Promise.all([
      fetchBrandDirectory(),
      fetchCollectionDirectory(),
    ]);
    return { brands, collections };
  } catch (error) {
    logger.warn('search.landing_load_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return { brands: [], collections: [] };
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = parseCatalogueParams(await searchParams, 'all', null, '/search');
  const isBlankSearch = params.query === '' && !hasActiveFilters(params);

  const [viewer, landing] = await Promise.all([
    getViewerState(),
    isBlankSearch ? loadSearchLanding() : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHero
        eyebrow="Search"
        title={params.query !== '' ? `Results for “${params.query}”` : 'Search the catalogue'}
        intro="Search by brand, model, reference number or keyword. Every result is a real, published piece."
        photograph={SITE_PHOTOGRAPHY.omegaCalibre1861}
        eyebrowTone="emerald"
      />

      <div className="container-page py-10 sm:py-14">
        {/* The form stays on the light ground with the results, not in the dark
            band: it is a control the visitor acts on, not page furniture. */}
        <SearchForm params={params} defaultQuery={params.query} />
        <div className="mt-8">
          {landing ? (
            <SearchLanding brands={landing.brands} collections={landing.collections} />
          ) : (
            <CatalogueListingView
              listing={await getListing(params)}
              signedIn={viewer.signedIn}
              savedProductIds={viewer.savedProductIds}
            />
          )}
        </div>
      </div>
    </>
  );
}
