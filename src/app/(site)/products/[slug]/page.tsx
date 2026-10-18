import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/product/breadcrumbs';
import { EnquiryForm } from '@/components/product/enquiry-form';
import { PriceBlock } from '@/components/product/price-block';
import { ProductGallery } from '@/components/product/product-gallery';
import { PurchaseActions } from '@/components/product/purchase-actions';
import { SpecTable } from '@/components/product/spec-table';
import { CatalogueGrid } from '@/components/catalogue/catalogue-card';
import { JsonLd } from '@/components/seo/json-ld';
import { ErrorState } from '@/components/ui/states';
import { SectionHeading } from '@/components/ui/section';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbSchema, productSchema } from '@/lib/seo/schema';
import { productBreadcrumbs } from '@/lib/product/assemble';
import { getProductBySlug } from '@/server/services/product-service';
import { productAllowsQuantity } from '@/server/services/cart-service';
import { getViewerState } from '@/server/services/viewer-service';

/**
 * Product detail page.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS ROUTE IS EXPLICITLY DYNAMIC
 * -----------------------------------------------------------------------------
 *
 * The page must render per request against the live row. Prerendering every
 * published product at build time would freeze the catalogue into the
 * deployment: a price, a photograph or a `lastmod` timestamp would be as old as
 * the last deploy, and the sitemap's freshness claim would be false. Stock and
 * price change constantly.
 *
 * `export const dynamic = 'force-dynamic'` states that, and it is load-bearing
 * rather than decorative. The data layer reads through `createSupabaseServerClient`,
 * which is cookie-aware because it is shared with the session-bearing routes. A
 * cookie read makes the route dynamic, so without this export Next.js tries to
 * statically generate the page and fails at request time in a production build
 * with "Page changed from static to dynamic at runtime", returning a 500. The
 * failure does not appear in `next dev`, which is why it is called out here.
 *
 * `generateStaticParams` is retained because the phase requires it and because it
 * is the single extension point if the caching strategy changes — see below.
 *
 * -----------------------------------------------------------------------------
 * WHY `generateStaticParams` RETURNS AN EMPTY LIST
 * -----------------------------------------------------------------------------
 *
 * It returns `[]` deliberately, and the shape matters more than the values.
 * Listing the published slugs would prerender them, which is the freezing problem
 * above; and it would make `next build` require a live database, which it must
 * not, because the build runs on Vercel before any Supabase secret is necessarily
 * present. Returning `[]` keeps the build database-free. If the project later
 * adopts ISR, this is the one place to list slugs and add a `revalidate` window.
 *
 * -----------------------------------------------------------------------------
 * THE THREE STATES
 * -----------------------------------------------------------------------------
 *
 *  - `ok`          → the product renders from the database.
 *  - `not_found`   → `notFound()`. An unpublished, archived or invented slug all
 *                    reach here, so the page cannot be used to discover that a
 *                    draft exists.
 *  - `unavailable` → the database could not be reached. This renders a real page
 *                    with a 200 and a clear message, *not* a 404: telling a
 *                    visitor a watch does not exist when the problem is an
 *                    outage would be false, and it would invite a crawler to
 *                    drop a URL that is perfectly valid.
 *
 * -----------------------------------------------------------------------------
 * SEO
 * -----------------------------------------------------------------------------
 *
 * Metadata comes from the admin-editable `seo_title` / `seo_description` columns
 * when set, falling back to a composed title and the real short description.
 * Nothing is invented to fill a field: if there is no description in the
 * database, the fallback is built from the factual attributes the row does have.
 *
 * The `Product` JSON-LD emits `offers` only when a genuine price exists. For a
 * price-on-request piece the node still describes the product accurately and
 * simply makes no price claim — which is what keeps the structured data
 * consistent with the page.
 */
export const dynamic = 'force-dynamic';

export function generateStaticParams(): { slug: string }[] {
  // See the note above: prerendering would freeze prices, stock and `lastmod`.
  return [];
}

/**
 * A factual description composed from real attributes.
 *
 * Used only when neither the admin's SEO description nor the stored short
 * description exists. Every clause is a field that is actually set, so the
 * sentence cannot overstate what the catalogue records.
 */
function buildFallbackDescription(input: {
  title: string;
  brand: string | null;
  condition: string | null;
  year: number | null;
  caseSize: string | null;
  movement: string | null;
  priceOnRequest: boolean;
}): string {
  const parts: string[] = [];

  parts.push(
    [input.brand, input.title].filter(Boolean).join(' ') +
      (input.condition ? `, offered ${input.condition.toLowerCase()}` : ''),
  );

  const attributes = [
    input.year ? `circa ${input.year}` : null,
    input.caseSize ? `${input.caseSize} case` : null,
    input.movement ? `${input.movement} movement` : null,
  ].filter(Boolean);

  if (attributes.length) parts.push(attributes.join(', '));

  parts.push(
    input.priceOnRequest
      ? 'Price and availability on request.'
      : 'Pricing and availability shown on this page.',
  );

  return parts.join('. ').replace(/\.\./g, '.');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getProductBySlug(slug);

  if (result.status === 'not_found') {
    return buildMetadata({
      title: 'Watch not found',
      path: `/products/${slug}`,
      robots: { index: false, follow: true },
    });
  }

  if (result.status === 'unavailable') {
    // A 200 with `noindex`: the URL is valid, but this response carries no
    // content worth indexing, and indexing an outage page would be worse than
    // not indexing it at all.
    return buildMetadata({
      title: 'Catalogue temporarily unavailable',
      path: `/products/${slug}`,
      robots: { index: false, follow: true },
    });
  }

  const { product } = result;
  const brand = product.brandName;

  const title =
    product.seoTitle ??
    [brand, product.title].filter(Boolean).join(' ') +
      (product.reference ? ` ${product.reference}` : '');

  const description =
    product.seoDescription ??
    product.shortDescription ??
    buildFallbackDescription({
      title: product.title,
      brand,
      condition: product.conditionLabel,
      year: product.year,
      caseSize: product.caseSize,
      movement: product.movement,
      priceOnRequest: product.priceOnRequest,
    });

  const images = product.ogImageUrl
    ? [{ url: product.ogImageUrl, alt: product.images[0]?.alt ?? product.title }]
    : product.images
        .filter((image) => image.url !== null)
        .slice(0, 4)
        .map((image) => ({
          url: image.url as string,
          alt: image.alt,
          ...(image.width ? { width: image.width } : {}),
          ...(image.height ? { height: image.height } : {}),
        }));

  return buildMetadata({
    title,
    description,
    path: product.href,
    type: 'product',
    // The canonical is the product's own path, so a URL that reached this page
    // through a filter or a tracking parameter still points at one address.
    robots: { index: true, follow: true },
    ...(images.length ? { images } : {}),
    ...(product.publishedAt ? { publishedTime: product.publishedAt } : {}),
    modifiedTime: product.updatedAt,
  });
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getProductBySlug(slug);

  if (result.status === 'not_found') notFound();

  if (result.status === 'unavailable') {
    return (
      <main id="main-content" className="container-page py-16 lg:py-24">
        <ErrorState
          title="The catalogue is temporarily unavailable"
          description="We could not reach the catalogue just now, so this watch cannot be shown. This is a problem at our end, not a missing page — please try again shortly."
        />
      </main>
    );
  }

  const { product, related } = result;
  const breadcrumbs = productBreadcrumbs(product);

  // The purchase controls need three facts that belong to the visitor rather
  // than the product: whether they are signed in, whether this piece is already
  // saved, and whether the product model permits a quantity above one. They are
  // resolved here, in parallel, so the controls render in their correct state
  // rather than flickering after hydration. `productAllowsQuantity` asks
  // `cart_pricing`, so the selector agrees with what the cart will actually do.
  const [viewer, allowsQuantity] = await Promise.all([
    getViewerState(),
    productAllowsQuantity(product.id),
  ]);

  return (
    <main id="main-content" className="container-page py-8 lg:py-12">
      <Breadcrumbs entries={breadcrumbs} className="mb-6" />

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        <ProductGallery images={product.images} title={product.title} />

        <div className="flex flex-col gap-6">
          <header>
            {product.brandName ? <p className="eyebrow">{product.brandName}</p> : null}
            <h1 className="mt-2 text-3xl sm:text-4xl">{product.title}</h1>
            {product.modelName ? (
              <p className="text-foreground-muted mt-1 text-sm">{product.modelName}</p>
            ) : null}
          </header>

          <PriceBlock product={product} />

          {product.shortDescription ? (
            <p className="text-foreground-muted text-base leading-relaxed">
              {product.shortDescription}
            </p>
          ) : null}

          <PurchaseActions
            product={product}
            signedIn={viewer.signedIn}
            initiallySaved={viewer.savedProductIds.includes(product.id)}
            allowQuantity={allowsQuantity}
          />

          {/* The enquiry anchor is the real call to action for this phase, so it
              is a prominent link rather than a disabled button. */}
          <a
            href="#enquire"
            className="text-accent-text self-start text-sm font-semibold underline underline-offset-4"
          >
            Ask a question about this watch
          </a>
        </div>
      </div>

      <div className="mt-14 grid gap-12 lg:grid-cols-2 lg:gap-16">
        <section aria-labelledby="description-heading">
          <h2 id="description-heading" className="text-xl">
            About this piece
          </h2>
          {product.description ? (
            // The description is stored as plain text. It is rendered in a
            // `whitespace-pre-line` block rather than as HTML, so a value in the
            // database can never inject markup.
            <div className="text-foreground-muted mt-4 text-base leading-relaxed whitespace-pre-line">
              {product.description}
            </div>
          ) : (
            <p className="text-foreground-muted mt-4 text-base leading-relaxed">
              A full description for this piece has not been published yet. The specification below
              is taken from our records — ask us for anything further.
            </p>
          )}

          {product.collections.length > 0 ? (
            <p className="text-foreground-muted mt-6 text-sm">
              Part of{' '}
              {product.collections.map((collection, index) => (
                <span key={collection.slug}>
                  {index > 0 ? ', ' : ''}
                  <a
                    href={`/collections/${collection.slug}`}
                    className="text-accent-text underline underline-offset-4"
                  >
                    {collection.title}
                  </a>
                </span>
              ))}
              .
            </p>
          ) : null}
        </section>

        <section aria-labelledby="specification-heading">
          <h2 id="specification-heading" className="text-xl">
            Specification
          </h2>
          <SpecTable specs={product.specs} className="mt-4" />
        </section>
      </div>

      <section id="enquire" aria-labelledby="enquire-heading" className="mt-16 scroll-mt-24">
        <SectionHeading
          eyebrow="Enquire"
          title="Ask a question"
          description="Send us a message about this piece and we will confirm price, condition and availability. Payment is arranged directly with the boutique — nothing is charged on this website."
        />
        <div className="mt-8 max-w-2xl">
          <EnquiryForm productSlug={product.slug} productTitle={product.title} />
        </div>
      </section>

      {related.length > 0 ? (
        <section aria-labelledby="related-heading" className="mt-16">
          <SectionHeading
            eyebrow="You may also like"
            title="Related timepieces"
            description="Selected from our catalogue because they share a model, a maker or a specification with this piece."
          />
          <CatalogueGrid products={related} className="mt-8" />
        </section>
      ) : null}

      <JsonLd
        nodes={[
          productSchema({
            name: product.title,
            path: product.href,
            description: product.description ?? product.shortDescription,
            sku: product.sku,
            brandName: product.brandName,
            category: product.modelName ?? product.brandName,
            images: product.images
              .map((image) => image.url)
              .filter((url): url is string => url !== null),
            condition: product.condition,
            updatedAt: product.updatedAt,
            // `offers` is emitted only when a genuine price exists. A
            // price-on-request piece makes no price claim at all.
            price:
              product.priceMinor !== null
                ? { amountMinor: product.priceMinor, currency: product.currency }
                : null,
            availability: product.availability === 'available' ? 'InStock' : 'OutOfStock',
          }),
          breadcrumbSchema(breadcrumbs),
        ]}
      />
    </main>
  );
}
