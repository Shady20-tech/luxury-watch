import type { Metadata } from 'next';
import Link from 'next/link';

import { HeroCarousel } from '@/components/homepage/hero-carousel';
import { CommunityPanel, PromoBanner, SocialPanel } from '@/components/homepage/dark-sections';
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
 * The composition follows the reference site's section order — dark hero, trust
 * row, brand story, curated selection, brand showcase, new arrivals, a dark
 * promotional banner, the community panel, the social panel, and a final CTA —
 * rebuilt with our own layout, typography and copy.
 *
 * The reference alternates full-bleed near-black panels with off-white ones, and
 * that alternation is most of its visual character, so the order below
 * deliberately interleaves the two grounds rather than grouping the dark
 * sections together.
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
      {/* 6.5s between advances, which is the reference's own cadence. Autoplay
          is opt-in on this component and stops at the last slide rather than
          looping, so the visitor is never caught by a slide that jumps back. */}
      {home.hero.length > 0 ? <HeroCarousel slides={home.hero} autoPlaySeconds={6.5} /> : null}

      {/* The trust row sits on the light ground directly beneath the dark hero,
          which is where the reference puts it. It is the first thing after the
          hero because it answers "why here" before the catalogue asks "what
          have you got". */}
      {home.trust.length > 0 ? (
        <section className="bg-surface-0">
          <div className="container-page py-14 lg:py-16">
            <TrustRow items={home.trust} />
          </div>
        </section>
      ) : null}

      {home.brandStory ? (
        <section className="border-line-200 bg-surface-50 border-y">
          <div className="container-page py-16 lg:py-20">
            <EditorialSplit section={home.brandStory} />
          </div>
        </section>
      ) : null}

      {home.featured ? (
        <section className="border-line-200 bg-surface-0 border-b">
          <div className="container-page py-16 lg:py-20">
            <ProductRailSection rail={home.featured} backdropImageUrl={home.featured.imageUrl} />
          </div>
        </section>
      ) : null}

      {home.brandShowcase || home.brands.length > 0 ? (
        <section className="border-line-200 bg-surface-0 border-b">
          <div className="container-page py-16 lg:py-20">
            {home.brandShowcase ? (
              <CopyBlock section={home.brandShowcase} headingAs="h2" align="center" />
            ) : (
              <h2 className="text-ink-950 text-center text-3xl sm:text-4xl">
                The houses we handle
              </h2>
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

      {home.newArrivals ? (
        <section className="border-line-200 bg-surface-0 border-b">
          <div className="container-page py-16 lg:py-20">
            <ProductRailSection
              rail={home.newArrivals}
              backdropImageUrl={home.newArrivals.imageUrl}
            />
          </div>
        </section>
      ) : null}

      {/* The dark promotional banner. The reference pairs the sell/trade and
          sourcing calls to action into one promotional strip; they are rendered
          here as one banner when either exists, because two stacked banners of
          the same shape read as an accident. */}
      {home.sellTradeCta ? (
        <PromoBanner section={home.sellTradeCta} />
      ) : home.sourcingCta ? (
        <PromoBanner section={home.sourcingCta} />
      ) : null}

      {/* The community panel, on its own dark ground so it reads as a distinct
          invitation rather than a second half of the banner above. */}
      {home.newsletter ? <CommunityPanel section={home.newsletter} /> : null}

      {/* Rendered only when real testimonials exist. The heading is inside this
          guard, so an empty list never leaves an orphaned heading behind. */}
      {home.testimonials.length > 0 ? (
        <section className="border-line-200 bg-surface-0 border-b">
          <div className="container-page py-16 lg:py-20">
            {home.testimonialsSection ? (
              <div className="mb-10">
                <CopyBlock section={home.testimonialsSection} align="center" />
              </div>
            ) : null}
            <TestimonialList testimonials={home.testimonials} />
          </div>
        </section>
      ) : null}

      {/* The social panel needs both a section row and a real social link from
          the identity, so it cannot render an empty grid. */}
      {home.social ? <SocialPanel section={home.social} socials={home.socials} /> : null}

      {home.finalCta ? (
        <section className="border-line-200 bg-surface-0 border-b">
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
