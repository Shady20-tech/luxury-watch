import type { Metadata } from 'next';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';

import { PageHero } from '@/components/layout/page-hero';
import { SITE_PHOTOGRAPHY } from '@/lib/images/site-photography';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { buildMetadata } from '@/lib/seo/metadata';
import { fetchCollectionDirectory } from '@/server/repositories/catalogue-repository';

/**
 * The collections index.
 *
 * Collections are the editor-curated groupings (`featured`, `new-arrivals`,
 * `price-on-request`) plus any taxonomy collection the owner adds. They are the
 * third level of the browse hierarchy — brand → collection → model → product —
 * so the index is the page that makes that level discoverable without already
 * knowing a collection's slug.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS ROUTE HAS TO EXIST
 * -----------------------------------------------------------------------------
 *
 * `catalogueBasePath` in `lib/catalogue/params.ts` already renders `/collections`
 * as the base path for an unscoped collection listing, and "clear all filters"
 * navigates there. The route was missing, so that path 404'd. A canonical-URL
 * helper that emits a route which does not exist is the same class of defect as
 * the model links that pointed at `/collections/<model-slug>`.
 *
 * -----------------------------------------------------------------------------
 * THE COUNT
 * -----------------------------------------------------------------------------
 *
 * The badge counts *published* pieces in the collection, not `collection_products`
 * rows. A collection that holds a draft or archived piece would otherwise
 * advertise a number the listing cannot deliver, because the listing reads
 * through the publication gate.
 */
export const metadata: Metadata = buildMetadata({
  title: 'Collections',
  description:
    'Curated collections from our catalogue — featured pieces, new arrivals and watches priced on request. Browse each collection and request pricing and availability.',
  path: '/collections',
});

type DirectoryState =
  | { status: 'ok'; collections: Awaited<ReturnType<typeof fetchCollectionDirectory>> }
  | { status: 'unavailable' };

async function loadDirectory(): Promise<DirectoryState> {
  if (!isSupabaseConfigured()) return { status: 'unavailable' };

  try {
    return { status: 'ok', collections: await fetchCollectionDirectory() };
  } catch (error) {
    // Next throws to signal "this route is dynamic", and to implement
    // notFound()/redirect(). Handling those as a data failure would replace
    // the framework's control flow with an error state.
    unstable_rethrow(error);

    logger.warn('collections.index_load_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return { status: 'unavailable' };
  }
}

export default async function CollectionsIndexPage() {
  const state = await loadDirectory();

  return (
    <>
      <PageHero
        eyebrow="Shop"
        title="Collections"
        intro="Curated selections from the catalogue, put together by our specialists."
        photograph={SITE_PHOTOGRAPHY.rolexStellaDials}
        eyebrowTone="burgundy"
      />

      <div className="container-page py-10 sm:py-14">
        {state.status === 'unavailable' ? (
          <ErrorState
            title="The collection list is not available right now"
            description="We could not reach the catalogue. This is a problem at our end, not with your visit. Please try again shortly, or contact us and we will help directly."
          />
        ) : state.collections.length === 0 ? (
          <EmptyState
            title="No collections are published yet"
            description="The catalogue is connected but has no active collections at the moment. You can still browse every piece in the shop."
            action={
              <Link
                href="/shop"
                className="text-accent-text text-sm font-medium underline-offset-4 hover:underline"
              >
                Browse the shop
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {state.collections.map((collection) => (
              <li key={collection.id}>
                <article className="border-line-200 bg-surface-0 hover:border-ink-300 flex h-full flex-col rounded-md border p-6 transition-[border-color,box-shadow] duration-200 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="font-display text-xl">
                      <Link
                        href={`/collections/${collection.slug}`}
                        className="focus-visible:outline-gold-700 focus-visible:outline-2 focus-visible:outline-offset-4"
                      >
                        {collection.title}
                      </Link>
                    </h2>
                    <Badge variant="neutral">
                      {collection.productCount === 1
                        ? '1 watch'
                        : `${collection.productCount} watches`}
                    </Badge>
                  </div>

                  {collection.description ? (
                    <p className="text-foreground-muted mt-3 text-sm">{collection.description}</p>
                  ) : null}

                  <div className="mt-auto pt-6">
                    <Link
                      href={`/collections/${collection.slug}`}
                      className="text-accent-text focus-visible:outline-gold-700 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2"
                    >
                      View collection
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
