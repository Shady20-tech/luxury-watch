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
import { fetchActiveBrandSummary } from '@/server/repositories/catalogue-repository';
import { getListing } from '@/server/services/catalogue-service';

/**
 * A brand's listing.
 *
 * The brand is resolved first, and an unknown or inactive slug is a real `404`
 * — a brand page for a brand we do not carry must not answer `200`. Only then is
 * the listing loaded, scoped to this brand, so the sidebar facets describe the
 * brand's stock rather than the whole catalogue.
 *
 * Indexing follows the same rule as `/shop`: the unfiltered brand page is
 * indexable, and any filtered permutation is `noindex, follow` with the clean
 * brand page as its canonical.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const brand = await fetchActiveBrandSummary(slug).catch(() => null);

  if (!brand) {
    return buildMetadata({
      title: 'Brand not found',
      path: `/brands/${slug}`,
      robots: { index: false, follow: true },
    });
  }

  const listingParams = parseCatalogueParams(await searchParams, 'brand', slug);

  return buildMetadata({
    title: `${brand.name} watches`,
    description:
      brand.description ??
      `Watches by ${brand.name}. Browse the pieces we currently hold, and request pricing and availability on any of them.`,
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
  const brand = await fetchActiveBrandSummary(slug).catch(() => null);

  if (!brand) notFound();

  const listing = await getListing(parseCatalogueParams(await searchParams, 'brand', slug));

  return (
    <div className="container-page py-10 sm:py-14">
      <CatalogueListingView
        listing={listing}
        header={
          <SectionHeading
            as="h1"
            eyebrow="Brand"
            title={brand.name}
            description={
              brand.description ??
              `Every ${brand.name} piece we currently hold. Prices are shown where published; otherwise request pricing and availability.`
            }
          />
        }
      />
    </div>
  );
}
