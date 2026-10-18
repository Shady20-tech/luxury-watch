import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CatalogueListingView } from '@/components/catalogue/catalogue-listing-view';
import { SectionHeading } from '@/components/ui/section';
import {
  canonicalListingPath,
  isIndexableListing,
  parseCatalogueParams,
  type RawSearchParams,
} from '@/lib/catalogue/params';
import { buildMetadata } from '@/lib/seo/metadata';
import { fetchActiveCollectionSummary } from '@/server/repositories/catalogue-repository';
import { getListing } from '@/server/services/catalogue-service';

/**
 * A collection's listing.
 *
 * Same shape as the brand route: resolve the collection, `404` an unknown or
 * inactive slug, then load the listing scoped to it. Collections are editor-
 * curated groupings (featured, new arrivals, price-on-request), so their pages
 * are the ones worth indexing — the filtered permutations of them are not.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await fetchActiveCollectionSummary(slug).catch(() => null);

  if (!collection) {
    return buildMetadata({
      title: 'Collection not found',
      path: `/collections/${slug}`,
      robots: { index: false, follow: true },
    });
  }

  const listingParams = parseCatalogueParams(await searchParams, 'collection', slug);

  return buildMetadata({
    title: collection.title,
    description:
      collection.description ??
      `${collection.title} — a curated selection from our catalogue. Request pricing and availability on any piece.`,
    path: canonicalListingPath(listingParams),
    robots: { index: isIndexableListing(listingParams), follow: true },
  });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { slug } = await params;
  const collection = await fetchActiveCollectionSummary(slug).catch(() => null);

  if (!collection) notFound();

  const listing = await getListing(parseCatalogueParams(await searchParams, 'collection', slug));

  return (
    <div className="container-page py-10 sm:py-14">
      <CatalogueListingView
        listing={listing}
        header={
          <SectionHeading
            as="h1"
            eyebrow="Collection"
            title={collection.title}
            description={collection.description ?? undefined}
          />
        }
      />
    </div>
  );
}
