import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CatalogueListingView } from '@/components/catalogue/catalogue-listing-view';
import { PageHero } from '@/components/layout/page-hero';
import { resolveSitePhotograph } from '@/lib/images/site-photography';
import { listingSeo, parseCatalogueParams, type RawSearchParams } from '@/lib/catalogue/params';
import { buildMetadata } from '@/lib/seo/metadata';
import { fetchActiveCollectionSummary } from '@/server/repositories/catalogue-repository';
import { getListing } from '@/server/services/catalogue-service';
import { getViewerState } from '@/server/services/viewer-service';

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
  const listing = await getListing(listingParams);
  const seo = listingSeo(listingParams, listing.total, collection.productCount > 0);

  // The same photograph the page's hero renders, so the card a visitor sees when
  // somebody shares the link is the image they land on. Only a registered
  // photograph is used: an unregistered path has no credit or dimensions, and an
  // OG image we cannot attribute is worse than none.
  const hero = resolveSitePhotograph(collection.heroImageUrl);

  return buildMetadata({
    title: collection.title,
    description:
      collection.description ??
      `${collection.title} — a curated selection from our catalogue. Request pricing and availability on any piece.`,
    path: seo.path,
    images: hero
      ? [{ url: hero.src, alt: hero.alt, width: hero.width, height: hero.height }]
      : undefined,
    // A filtered permutation duplicates the clean collection page; an empty
    // collection is thin content; a page past the end of the results is a soft
    // 404. All three are `noindex`, and the sitemap uses the same published
    // count to leave the empty ones out.
    robots: { index: seo.index, follow: true },
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

  const [listing, viewer] = await Promise.all([
    getListing(parseCatalogueParams(await searchParams, 'collection', slug)),
    getViewerState(),
  ]);

  return (
    <>
      <PageHero
        eyebrow="Collection"
        title={collection.title}
        intro={collection.description}
        photograph={resolveSitePhotograph(collection.heroImageUrl) ?? undefined}
        eyebrowTone="burgundy"
      />

      <div className="container-page py-10 sm:py-14">
        <CatalogueListingView
          listing={listing}
          signedIn={viewer.signedIn}
          savedProductIds={viewer.savedProductIds}
          scopeName={collection.title}
        />
      </div>
    </>
  );
}
