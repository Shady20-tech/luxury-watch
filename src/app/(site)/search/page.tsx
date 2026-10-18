import type { Metadata } from 'next';

import { CatalogueListingView } from '@/components/catalogue/catalogue-listing-view';
import { SearchForm } from '@/components/catalogue/search-form';
import { SectionHeading } from '@/components/ui/section';
import { parseCatalogueParams, type RawSearchParams } from '@/lib/catalogue/params';
import { buildMetadata } from '@/lib/seo/metadata';
import { getListing } from '@/server/services/catalogue-service';

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
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  const params = parseCatalogueParams(await searchParams);

  return buildMetadata({
    title: params.query !== '' ? `Search: ${params.query}` : 'Search',
    description:
      'Search our catalogue by brand, model, reference number or keyword, then filter the results.',
    path: '/search',
    robots: { index: false, follow: true },
  });
}

export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = parseCatalogueParams(await searchParams);
  const listing = await getListing(params);

  return (
    <div className="container-page py-10 sm:py-14">
      <CatalogueListingView
        listing={listing}
        header={
          <div className="flex flex-col gap-6">
            <SectionHeading
              as="h1"
              eyebrow="Search"
              title={params.query !== '' ? `Results for “${params.query}”` : 'Search the catalogue'}
              description="Search by brand, model, reference number or keyword. Every result is a real, published piece."
            />
            <SearchForm params={params} defaultQuery={params.query} />
          </div>
        }
      />
    </div>
  );
}
