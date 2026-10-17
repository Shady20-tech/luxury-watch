import type { Metadata } from 'next';
import Link from 'next/link';

import { HeroCarousel } from '@/components/homepage/hero-carousel';
import {
  BrandShowcase,
  CopyBlock,
  EditorialSplit,
  ProductRailSection,
  TestimonialList,
  TrustRow,
} from '@/components/homepage/sections';
import { JsonLd } from '@/components/seo/json-ld';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { getPublicEnv } from '@/lib/env';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbSchema, itemListSchema, jsonLdGraph, websiteSchema } from '@/lib/seo/schema';
import { getHomepage } from '@/server/services/homepage-service';

export const metadata: Metadata = buildMetadata({
  title: `${getPublicEnv().siteName} — Luxury Watches`,
  description:
    'An independent luxury watch retailer. Browse the catalogue, request pricing and availability, and arrange payment directly with the boutique — this site never takes payment or card details.',
  path: '/',
});

/**
 * Home page.
 *
 * The composition follows the reference site's section order — hero, brand
 * showcase, curated selection, brand story, new arrivals, sell/trade and
 * sourcing calls to action, trust row, testimonials, newsletter, final CTA —
 * rebuilt with our own layout, typography and copy.
 *
 * -----------------------------------------------------------------------------
 * WHAT DRIVES THE PAGE
 * -----------------------------------------------------------------------------
 *
 * Every section comes from a `homepage_sections` row and every product comes
 * from a published catalogue row. Nothing on this page is hardcoded: if a row is
 * missing the section is absent, which is how the owner switches one off.
 *
 * Two honesty rules are enforced by the data layer and visible here:
 *
 *  - **No fabricated products.** Product rails are backed by real collections,
 *    and a rail whose collection has no published watches says so instead of
 *    showing placeholders. `source: 'fallback'` means the database was not
 *    reachable, and the page says that too rather than passing off an empty
 *    shell as content.
 *  - **No fabricated reviews.** The testimonials section renders only when real
 *    `testimonials` rows exist; the seed deliberately contains none.
 *
 * Payment is described as it actually is: arranged offline with the boutique.
 */
export default async function HomePage() {
  const home = await getHomepage();

  const structuredDataFooter = (
    <JsonLd nodes={[breadcrumbSchema([{ name: 'Home', path: '/' }]), websiteSchema()]} />
  );

  // When the database is not reachable there is genuinely nothing to compose, so
  // the page states that instead of rendering a shell that looks like a store.
  if (home.source === 'fallback') {
    return (
      <>
        <section className="container-page py-20 lg:py-28">
          <EmptyState
            title="The storefront content is not connected yet"
            description="The homepage is built from the database, and this deployment cannot reach it. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the Vercel dashboard, apply the migrations, then reload this page. Nothing here is hardcoded, so there is no placeholder catalogue to show in the meantime."
            action={
              <Button asChild variant="secondary">
                <Link href="/contact">Contact the boutique</Link>
              </Button>
            }
          />
        </section>
        {structuredDataFooter}
      </>
    );
  }

  const hasAnything =
    home.hero.length > 0 ||
    home.brandShowcase !== null ||
    home.featured !== null ||
    home.newArrivals !== null ||
    home.brandStory !== null ||
    home.trust.length > 0 ||
    home.finalCta !== null;

  if (!hasAnything) {
    return (
      <>
        <section className="container-page py-20 lg:py-28">
          <EmptyState
            title="No homepage content has been published"
            description="The database is connected, but no active rows exist in homepage_sections. Add them in the admin and this page will compose itself from them."
            action={
              <Button asChild variant="secondary">
                <Link href="/contact">Contact the boutique</Link>
              </Button>
            }
          />
        </section>
        {structuredDataFooter}
      </>
    );
  }

  // Structured data describes what is genuinely on the page: the site, the
  // breadcrumb, and an ItemList of the featured pieces. No `offers` node is
  // emitted anywhere, because no product has a published price.
  const featuredProducts = home.featured?.products ?? [];
  const structuredData = jsonLdGraph([
    breadcrumbSchema([{ name: 'Home', path: '/' }]),
    websiteSchema(),
    featuredProducts.length > 0
      ? itemListSchema({
          name: home.featured?.title ?? 'Featured watches',
          items: featuredProducts.map((product) => ({ name: product.title, path: product.href })),
        })
      : null,
  ]);

  return (
    <>
      {home.hero.length > 0 ? <HeroCarousel slides={home.hero} /> : null}

      {home.brandShowcase || home.brands.length > 0 ? (
        <section className="border-line-200 border-b">
          <div className="container-page py-16 lg:py-20">
            {home.brandShowcase ? (
              <CopyBlock section={home.brandShowcase} headingAs="h2" />
            ) : (
              <h2 className="text-3xl sm:text-4xl">The houses we handle</h2>
            )}

            {home.brands.length > 0 ? (
              <div className="mt-10">
                <BrandShowcase brands={home.brands} />
              </div>
            ) : (
              <p className="border-line-200 text-foreground-muted mt-10 rounded-md border border-dashed px-6 py-10 text-center text-sm">
                No brands are published yet.
              </p>
            )}
          </div>
        </section>
      ) : null}

      {home.featured ? (
        <section className="border-line-200 border-b">
          <div className="container-page py-16 lg:py-20">
            <ProductRailSection rail={home.featured} />
          </div>
        </section>
      ) : null}

      {home.brandStory ? (
        <section className="border-line-200 border-b">
          <div className="container-page py-16 lg:py-20">
            <EditorialSplit section={home.brandStory} />
          </div>
        </section>
      ) : null}

      {home.newArrivals ? (
        <section className="border-line-200 border-b">
          <div className="container-page py-16 lg:py-20">
            <ProductRailSection rail={home.newArrivals} />
          </div>
        </section>
      ) : null}

      {home.sellTradeCta || home.sourcingCta ? (
        <section className="border-line-200 border-b">
          <div className="container-page grid gap-12 py-16 lg:grid-cols-2 lg:py-20">
            {home.sellTradeCta ? <CopyBlock section={home.sellTradeCta} /> : null}
            {home.sourcingCta ? <CopyBlock section={home.sourcingCta} /> : null}
          </div>
        </section>
      ) : null}

      {home.trust.length > 0 ? (
        <section className="border-line-200 bg-surface-50 border-b">
          <div className="container-page py-16 lg:py-20">
            <TrustRow items={home.trust} />
          </div>
        </section>
      ) : null}

      {/* Rendered only when real testimonials exist. The heading is inside this
          guard, so an empty list never leaves an orphaned heading behind. */}
      {home.testimonials.length > 0 ? (
        <section className="border-line-200 border-b">
          <div className="container-page py-16 lg:py-20">
            {home.testimonialsSection ? (
              <div className="mb-10">
                <CopyBlock section={home.testimonialsSection} />
              </div>
            ) : null}
            <TestimonialList testimonials={home.testimonials} />
          </div>
        </section>
      ) : null}

      {home.newsletter ? (
        <section className="border-line-200 bg-surface-50 border-b">
          <div className="container-page py-16 lg:py-20">
            <div className="mx-auto max-w-2xl">
              <CopyBlock section={home.newsletter} align="center" />
            </div>
          </div>
        </section>
      ) : null}

      {home.finalCta ? (
        <section className="border-line-200 border-b">
          <div className="container-page py-16 lg:py-20">
            <div className="mx-auto max-w-2xl">
              <CopyBlock section={home.finalCta} align="center" />
            </div>
          </div>
        </section>
      ) : null}

      <JsonLd nodes={structuredData['@graph']} />
    </>
  );
}
