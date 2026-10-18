import type { Metadata } from 'next';

import { CatalogueListingView } from '@/components/catalogue/catalogue-listing-view';
import { SectionHeading } from '@/components/ui/section';
import {
  canonicalListingPath,
  isIndexableListing,
  parseCatalogueParams,
  type RawSearchParams,
} from '@/lib/catalogue/params';
import { buildMetadata } from '@/lib/seo/metadata';
import { getListing } from '@/server/services/catalogue-service';

/**
 * The shop listing — the canonical "everything" address.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS THE CANONICAL ADDRESS AND `/collections/all` IS NOT
 * -----------------------------------------------------------------------------
 *
 * The reference site links "all products" from several places, and the natural
 * Next.js shape would be `/collections/all`. That address is kept as a permanent
 * redirect to `/shop` (see `next.config.ts`) so old links and the navigation
 * still work, but every canonical tag, sitemap entry and internal link points
 * here. One listing, one address: two live URLs for the same grid would split
 * the ranking signal and give a crawler duplicate content.
 *
 * -----------------------------------------------------------------------------
 * INDEXING
 * -----------------------------------------------------------------------------
 *
 * A clean listing is indexable. A filtered, searched or sorted listing is
 * `noindex, follow`, because a page whose content is defined by query
 * parameters is a thin duplicate of the clean listing. The decision comes from
 * `isIndexableListing`, the single source of truth for it.
 *
 * This route reads `searchParams`, which opts it into dynamic rendering. That is
 * correct: the page's whole purpose is to reflect the query string, and
 * prerendering one variant would serve it to every other.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  const params = parseCatalogueParams(await searchParams);

  return buildMetadata({
    title: params.query !== '' ? `Search: ${params.query}` : 'The Collection',
    description:
      'Browse every timepiece in our catalogue. Filter by brand, model, condition, case size and price, or request pricing and availability on any piece.',
    // The canonical is the clean listing, so every filtered permutation points
    // a crawler at one address instead of competing with itself.
    path: canonicalListingPath(params),
    // A clean listing is indexable; any filter, search term or sort makes this
    // page a parameter-defined duplicate of it, so it is not. This must use
    // `isIndexableListing` rather than comparing the canonical path to `/shop`:
    // filtering keeps the base path, so that comparison would be true either way.
    robots: { index: isIndexableListing(params), follow: true },
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
          <SectionHeading
            as="h1"
            eyebrow="Shop"
            title={params.query !== '' ? `Search results for “${params.query}”` : 'The Collection'}
            description="Every piece is sourced and inspected by us. Prices are shown where a figure is published; otherwise request pricing and availability and we will respond directly."
          />
        }
      />
    </div>
  );
}
