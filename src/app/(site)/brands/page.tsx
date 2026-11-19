import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHero } from '@/components/layout/page-hero';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { buildMetadata } from '@/lib/seo/metadata';
import { fetchBrandDirectory } from '@/server/repositories/catalogue-repository';

/**
 * The brand index.
 *
 * This page existed as a placeholder from Phase 3 while the navigation already
 * linked to it from the header, the footer and the not-found page. Phase 5 built
 * the brand *listing* (`/brands/[slug]`) but left the index a placeholder, so the
 * one address every brand link points at was a page that said it was not built
 * yet. That is a broken storefront, not a pending feature.
 *
 * -----------------------------------------------------------------------------
 * WHAT IT SHOWS, AND WHERE EACH VALUE COMES FROM
 * -----------------------------------------------------------------------------
 *
 * One tile per active brand, carrying:
 *
 *   * the brand name, from `brands`;
 *   * the count of published pieces, from the `published_product_counts`
 *     aggregate — the same function the homepage brand showcase reads, so the
 *     two cannot disagree;
 *   * the model families, from `models`, each linking to that brand's listing
 *     narrowed to the model.
 *
 * A brand with no published pieces is still listed. Hiding it would mean the
 * index and the navigation disagree about which brands exist, and the brand page
 * itself has an honest empty state for exactly this case.
 *
 * -----------------------------------------------------------------------------
 * THE THREE DEGRADATION STATES
 * -----------------------------------------------------------------------------
 *
 * The same three the rest of the storefront uses: database, empty-with-database,
 * and unconfigured. The unconfigured state is not dressed up as "no brands" —
 * that would tell a visitor the business carries nothing, when the fault is that
 * the catalogue is not connected.
 */
export const metadata: Metadata = buildMetadata({
  title: 'Watch brands',
  description:
    'The houses we carry, and the model families within each. Browse every brand in our catalogue and the pieces we currently hold.',
  path: '/brands',
});

type DirectoryState =
  | { status: 'ok'; brands: Awaited<ReturnType<typeof fetchBrandDirectory>> }
  | { status: 'unavailable' };

async function loadDirectory(): Promise<DirectoryState> {
  if (!isSupabaseConfigured()) return { status: 'unavailable' };

  try {
    return { status: 'ok', brands: await fetchBrandDirectory() };
  } catch (error) {
    // A database outage must not take the page down. Log the message only: a
    // Supabase error can carry the query and row data.
    logger.warn('brands.index_load_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return { status: 'unavailable' };
  }
}

export default async function BrandsIndexPage() {
  const state = await loadDirectory();

  return (
    <>
      <PageHero
        eyebrow="Shop"
        title="Brands"
        intro="The houses we carry, and the model families within each. Every piece is sourced and inspected by us."
      />

      <div className="container-page py-10 sm:py-14">
        {state.status === 'unavailable' ? (
          <ErrorState
            title="The brand list is not available right now"
            description="We could not reach the catalogue. This is a problem at our end, not with your visit. Please try again shortly, or contact us and we will help directly."
          />
        ) : state.brands.length === 0 ? (
          <EmptyState
            title="No brands are listed yet"
            description="The catalogue is connected but has no active brands at the moment. Please check back, or contact us and we will source what you are looking for."
          />
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {state.brands.map((brand) => (
              <li key={brand.id}>
                <article className="border-line-200 bg-surface-0 hover:border-ink-300 flex h-full flex-col rounded-md border p-6 transition-[border-color,box-shadow] duration-200 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="font-display text-xl">
                      <Link
                        href={`/brands/${brand.slug}`}
                        className="focus-visible:outline-gold-700 focus-visible:outline-2 focus-visible:outline-offset-4"
                      >
                        {brand.name}
                      </Link>
                    </h2>
                    <Badge variant="neutral">
                      {brand.productCount === 1 ? '1 watch' : `${brand.productCount} watches`}
                    </Badge>
                  </div>

                  {/* Founding year and country are facts the row holds; when
                      neither is set the line is omitted rather than padded. */}
                  {brand.foundedYear || brand.country ? (
                    <p className="text-ink-500 mt-2 text-xs">
                      {[brand.country, brand.foundedYear ? `est. ${brand.foundedYear}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}

                  {brand.description ? (
                    <p className="text-foreground-muted mt-3 line-clamp-3 text-sm">
                      {brand.description}
                    </p>
                  ) : null}

                  {brand.models.length > 0 ? (
                    <div className="mt-5">
                      <h3 className="text-ink-500 text-xs font-semibold tracking-[0.14em] uppercase">
                        Model families
                      </h3>
                      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
                        {brand.models.map((model) => (
                          <li key={model.slug}>
                            <Link
                              href={`/brands/${brand.slug}?model=${encodeURIComponent(model.slug)}`}
                              className="text-foreground-muted hover:text-accent-text focus-visible:outline-gold-700 text-sm underline-offset-4 hover:underline focus-visible:outline-2"
                            >
                              {model.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="mt-auto pt-6">
                    <Link
                      href={`/brands/${brand.slug}`}
                      className="text-accent-text focus-visible:outline-gold-700 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2"
                    >
                      Browse {brand.name}
                    </Link>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
