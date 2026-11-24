import { PackageOpen, SearchX } from 'lucide-react';
import Link from 'next/link';

import { CatalogueGrid } from '@/components/catalogue/catalogue-card';
import { ActiveFilterChips, CatalogueFilters } from '@/components/catalogue/catalogue-filters';
import { ListingToolbar } from '@/components/catalogue/listing-toolbar';
import { MobileFilterDrawer } from '@/components/catalogue/mobile-filter-drawer';
import { Pagination } from '@/components/catalogue/pagination';
import { EmptyState } from '@/components/ui/states';
import { buildCatalogueHref, countActiveFilterGroups } from '@/lib/catalogue/params';
import type { CatalogueListing } from '@/lib/catalogue/types';

/**
 * The catalogue listing body, shared by `/shop`, brand and collection routes.
 *
 * The same markup renders every listing; only the `scope` in the params differs.
 * Sharing it means a fix to the grid, the filters or the pagination applies
 * everywhere at once, and the three routes cannot drift apart.
 *
 * Three states are distinguished, because collapsing them would mislead:
 *
 *  - **Unavailable** — Supabase is not configured or did not answer. The page
 *    says so and does not offer "try removing a filter", because the filters
 *    are not what is wrong.
 *  - **Empty from filters** — the database answered, nothing matched, and a
 *    filter or search term is active. The visitor is told which, and offered a
 *    way to clear.
 *  - **Genuinely empty** — the database answered and the catalogue has no
 *    published products at all. Telling a visitor to relax filters they never
 *    set would be nonsense, so this state says something different.
 */
export function CatalogueListingView({
  listing,
  /** Rendered above the toolbar, for a scope's own heading. */
  header,
  /** Whether the visitor is signed in, passed down to each card's save toggle. */
  signedIn = false,
  /** The pieces the visitor has already saved. */
  savedProductIds = [],
  /**
   * The brand or collection this listing is scoped to, when it is scoped.
   *
   * Used only to name the scope in an empty state. "No watches are listed yet"
   * on a brand page reads as a broken catalogue; "we hold no Richard Mille
   * pieces at the moment" is the true statement.
   */
  scopeName,
}: {
  listing: CatalogueListing;
  header?: React.ReactNode;
  signedIn?: boolean;
  savedProductIds?: string[];
  scopeName?: string;
}) {
  const { params, products, facets, page, pageCount } = listing;
  const activeGroups = countActiveFilterGroups(params);

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        {/* The sidebar is sticky on a wide screen: a visitor scrolling a long
            grid should not have to scroll back up to change a filter. */}
        <aside className="hidden w-64 shrink-0 lg:block" aria-label="Catalogue filters">
          <div className="sticky top-24">
            <CatalogueFilters params={params} facets={facets} />
          </div>
        </aside>

        <div className="min-w-0 flex-1 flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4">
            <MobileFilterDrawer activeCount={activeGroups}>
              <CatalogueFilters params={params} facets={facets} />
            </MobileFilterDrawer>
            <div className="ml-auto min-w-0 flex-1">
              <ListingToolbar listing={listing} />
            </div>
          </div>

          <ActiveFilterChips params={params} facets={facets} />

          {products.length > 0 ? (
            <>
              <CatalogueGrid
                products={products}
                signedIn={signedIn}
                savedProductIds={savedProductIds}
                label={scopeName ? `${scopeName} watches` : 'Watches'}
              />
              <div className="pt-2">
                <Pagination params={params} page={page} pageCount={pageCount} />
              </div>
            </>
          ) : (
            <ListingEmptyState
              listing={listing}
              activeGroups={activeGroups}
              scopeName={scopeName}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The empty state, chosen by *why* the listing is empty.
 *
 * This is the one place in the catalogue where a wrong message is actively
 * harmful: "no results, try removing filters" on a database outage sends the
 * visitor to fiddle with filters that were never the problem.
 */
function ListingEmptyState({
  listing,
  activeGroups,
  scopeName,
}: {
  listing: CatalogueListing;
  activeGroups: number;
  scopeName?: string;
}) {
  const { params, source, total, pageCount: pages } = listing;

  if (source === 'unavailable') {
    return (
      <EmptyState
        icon={PackageOpen}
        title="The catalogue is not available right now"
        description="We could not reach the product catalogue. This is a problem at our end, not with your search. Please try again shortly, or contact us and we will help directly."
      />
    );
  }

  // A page number past the end of a non-empty result set. The catalogue has
  // pieces, the filters match some of them, and the visitor asked for page 9 of
  // 1. Telling them "no watches are listed yet" is the wrong story and sends
  // them looking for a bug in the shop.
  if (total > 0 && params.page > pages) {
    return (
      <EmptyState
        icon={SearchX}
        title="There is nothing on this page"
        description={`These results run to ${pages === 1 ? 'a single page' : `${pages} pages`}, and page ${params.page} is past the end. The filters are unchanged — go back to the first page to see the results.`}
        action={
          <Link
            href={buildCatalogueHref(params, { page: 1 })}
            className="border-line-300 bg-surface-0 hover:border-ink-900 inline-flex h-10 items-center rounded-sm border px-4 text-sm font-medium"
          >
            Go to page 1
          </Link>
        }
      />
    );
  }

  // A scoped listing with nothing in it is a different statement from an empty
  // catalogue: the business does carry this brand, it simply holds none of it
  // today. Naming the scope is the difference between "we have nothing to sell"
  // and "we have none of these right now".
  if (total === 0 && activeGroups === 0 && params.query === '' && scopeName) {
    return (
      <EmptyState
        icon={PackageOpen}
        title={`No ${scopeName} pieces in stock`}
        description={`We hold no ${scopeName} pieces at the moment. Our stock changes often — contact us and we will let you know when one arrives, or source a specific reference for you.`}
      />
    );
  }

  if (total === 0 && activeGroups === 0 && params.query === '') {
    return (
      <EmptyState
        icon={PackageOpen}
        title="No watches are listed yet"
        description="The catalogue is connected but has no published pieces at the moment. Please check back, or contact us and we will source what you are looking for."
      />
    );
  }

  return (
    <EmptyState
      icon={SearchX}
      title="No watches match these filters"
      description={
        params.query !== ''
          ? `Nothing matches “${params.query}” with the current filters. Try a broader term or remove a filter.`
          : 'Nothing matches the current combination of filters. Removing one usually helps.'
      }
    />
  );
}
