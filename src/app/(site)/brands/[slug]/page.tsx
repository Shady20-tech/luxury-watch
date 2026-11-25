import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CatalogueListingView } from '@/components/catalogue/catalogue-listing-view';
import { PageHero } from '@/components/layout/page-hero';
import { resolveSitePhotograph } from '@/lib/images/site-photography';
import { listingSeo, parseCatalogueParams, type RawSearchParams } from '@/lib/catalogue/params';
import { buildMetadata } from '@/lib/seo/metadata';
import { fetchActiveBrandSummary } from '@/server/repositories/catalogue-repository';
import { getListing } from '@/server/services/catalogue-service';
import { getViewerState } from '@/server/services/viewer-service';

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
  const listing = await getListing(listingParams);
  const seo = listingSeo(listingParams, listing.total, brand.productCount > 0);
  const hero = resolveSitePhotograph(brand.heroImageUrl);

  return buildMetadata({
    // An editor's override wins, because it is the copy they wrote for search
    // results; the computed title and the brand blurb are the fallback. Nothing
    // in the seed sets these, so today the defaults are what is served.
    title: brand.seoTitle ?? `${brand.name} watches`,
    description:
      brand.seoDescription ??
      brand.description ??
      `Watches by ${brand.name}. Browse the pieces we currently hold, and request pricing and availability on any of them.`,
    path: seo.path,
    // The hero this page renders, so a shared link previews the brand rather
    // than a generic card.
    images: hero
      ? [{ url: hero.src, alt: hero.alt, width: hero.width, height: hero.height }]
      : undefined,
    // Three conditions, all required. A filtered permutation is a duplicate of
    // the clean brand page and must not rank; a brand with nothing published is
    // thin content that says only "we hold none right now"; and a page past the
    // end of the results is a soft 404. The sitemap applies the same count rule,
    // so the page and the sitemap cannot disagree.
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
  const brand = await fetchActiveBrandSummary(slug).catch(() => null);

  if (!brand) notFound();

  const [listing, viewer] = await Promise.all([
    getListing(parseCatalogueParams(await searchParams, 'brand', slug)),
    getViewerState(),
  ]);

  return (
    <>
      <PageHero
        eyebrow="Brand"
        title={brand.name}
        photograph={resolveSitePhotograph(brand.heroImageUrl) ?? undefined}
        eyebrowTone="sapphire"
        intro={
          brand.description ??
          `Every ${brand.name} piece we currently hold. Prices are shown where published; otherwise request pricing and availability.`
        }
      />

      <div className="container-page py-10 sm:py-14">
        {/* The families this brand's stock actually belongs to. These are plain
            anchors in the served HTML — the header's mega-menu links the same
            models but mounts only on interaction, so without this list a model
            page would be indexable, in the sitemap, and reachable from nowhere. */}
        {brand.models.length > 0 ? (
          <nav aria-label={`${brand.name} models`} className="mb-8">
            <h2 className="text-ink-500 text-xs font-semibold tracking-[0.14em] uppercase">
              Models
            </h2>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {brand.models.map((model) => (
                <li key={model.slug}>
                  <Link
                    href={`/brands/${brand.slug}/models/${encodeURIComponent(model.slug)}`}
                    className="text-foreground-muted hover:text-accent-text focus-visible:outline-gold-700 text-sm underline-offset-4 hover:underline focus-visible:outline-2"
                  >
                    {model.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <CatalogueListingView
          listing={listing}
          signedIn={viewer.signedIn}
          savedProductIds={viewer.savedProductIds}
          scopeName={brand.name}
        />
      </div>
    </>
  );
}
