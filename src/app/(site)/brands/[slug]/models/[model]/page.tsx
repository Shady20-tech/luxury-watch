import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CatalogueListingView } from '@/components/catalogue/catalogue-listing-view';
import { PageHero } from '@/components/layout/page-hero';
import {
  canonicalListingPath,
  isIndexableListing,
  modelScopeSlug,
  parseCatalogueParams,
  type RawSearchParams,
} from '@/lib/catalogue/params';
import { buildMetadata } from '@/lib/seo/metadata';
import { fetchActiveModelSummary } from '@/server/repositories/catalogue-repository';
import { getListing } from '@/server/services/catalogue-service';
import { getViewerState } from '@/server/services/viewer-service';

/**
 * A model family's listing — the third level of brand → collection → model →
 * product.
 *
 * -----------------------------------------------------------------------------
 * WHY THE ROUTE IS NESTED UNDER THE BRAND
 * -----------------------------------------------------------------------------
 *
 * `models` is unique on `(brand_id, slug)`, not on `slug` alone. The seed holds
 * four distinct models whose slug is `other`, one per brand, so `/models/other`
 * would resolve four different models to one address. Nesting the model under
 * its brand gives the URL exactly the database's unique key, and makes it
 * impossible for a model page to show another brand's stock.
 *
 * Indexing follows the same rule as the brand and collection routes: the clean
 * model page is indexable, a filtered permutation of it is `noindex, follow` and
 * canonicalises onto the clean page, and a model with nothing published is thin
 * content and marked `noindex`. The sitemap applies the same count rule, so the
 * page and the sitemap cannot disagree.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; model: string }>;
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  const { slug: brandSlug, model: modelSlug } = await params;
  const model = await fetchActiveModelSummary(brandSlug, modelSlug).catch(() => null);

  if (!model) {
    return buildMetadata({
      title: 'Model not found',
      path: `/brands/${brandSlug}/models/${modelSlug}`,
      robots: { index: false, follow: true },
    });
  }

  const listingParams = parseCatalogueParams(
    await searchParams,
    'model',
    modelScopeSlug(model.brandSlug, modelSlug),
  );

  return buildMetadata({
    title: `${model.brandName} ${model.name}`,
    description:
      model.description ??
      `${model.brandName} ${model.name} pieces we currently hold. Browse the range, and request pricing and availability on any watch.`,
    path: canonicalListingPath(listingParams),
    robots: {
      index: isIndexableListing(listingParams) && model.productCount > 0,
      follow: true,
    },
  });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; model: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { slug: brandSlug, model: modelSlug } = await params;
  const model = await fetchActiveModelSummary(brandSlug, modelSlug).catch(() => null);

  if (!model) notFound();

  const [listing, viewer] = await Promise.all([
    getListing(
      parseCatalogueParams(await searchParams, 'model', modelScopeSlug(model.brandSlug, modelSlug)),
    ),
    getViewerState(),
  ]);

  return (
    <>
      <PageHero
        eyebrow={model.brandName}
        title={model.name}
        intro={
          model.description ??
          `Every ${model.brandName} ${model.name} we currently hold. Prices are shown where published; otherwise request pricing and availability.`
        }
      />

      <div className="container-page py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="pb-6 text-sm">
          <Link href="/brands" className="text-ink-500 hover:text-foreground hover:underline">
            Brands
          </Link>
          <span aria-hidden="true" className="px-2">
            /
          </span>
          <Link
            href={`/brands/${model.brandSlug}`}
            className="text-ink-500 hover:text-foreground hover:underline"
          >
            {model.brandName}
          </Link>
          <span aria-hidden="true" className="px-2">
            /
          </span>
          <span aria-current="page">{model.name}</span>
        </nav>

        <CatalogueListingView
          listing={listing}
          signedIn={viewer.signedIn}
          savedProductIds={viewer.savedProductIds}
          scopeName={`${model.brandName} ${model.name}`}
        />
      </div>
    </>
  );
}
