import Link from 'next/link';

import { Badge } from '@/components/ui/badge';

/**
 * What `/search` shows before anything has been typed.
 *
 * -----------------------------------------------------------------------------
 * WHY NOT THE WHOLE CATALOGUE
 * -----------------------------------------------------------------------------
 *
 * An empty search used to render the entire listing — the same grid, in the same
 * order, as `/shop`. That is a duplicate of the shop under a second URL, which
 * is bad for a crawler and worse for a visitor: they arrive at a search box and
 * are shown 23 pieces they did not ask for, with no indication that typing is
 * the point.
 *
 * Instead the page offers the three things a search can be started from, each
 * read from the database: brands, collections and model families, all with
 * their real published counts. Nothing here is a "popular search" in the
 * analytics sense — this catalogue has no order history to rank searches by, and
 * inventing a ranking would be a claim the data cannot support. It is an honest
 * index of what is searchable.
 *
 * Every entry is a real link into a filtered listing, so the panel is crawlable
 * and useful with JavaScript off.
 */
export type SearchLandingBrand = {
  name: string;
  slug: string;
  productCount: number;
  models: { name: string; slug: string }[];
};

export type SearchLandingCollection = {
  title: string;
  slug: string;
  productCount: number;
};

export function SearchLanding({
  brands,
  collections,
}: {
  brands: SearchLandingBrand[];
  collections: SearchLandingCollection[];
}) {
  // A brand or collection with nothing published is still a real destination —
  // its page has an honest empty state — but it is not a useful search hint, so
  // it is left out of the panel rather than offered as a dead end.
  const searchableBrands = brands.filter((brand) => brand.productCount > 0);
  const searchableCollections = collections.filter((collection) => collection.productCount > 0);

  const hasAnything = searchableBrands.length > 0 || searchableCollections.length > 0;

  if (!hasAnything) {
    return (
      <p className="text-foreground-muted text-sm">
        Type a brand, model, reference number or keyword to search the catalogue, or{' '}
        <Link href="/shop" className="text-accent-text underline underline-offset-4">
          browse every piece
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {searchableCollections.length > 0 ? (
        <section aria-labelledby="search-collections">
          <h2
            id="search-collections"
            className="text-ink-500 text-xs font-semibold tracking-[0.14em] uppercase"
          >
            Collections
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {searchableCollections.map((collection) => (
              <li key={collection.slug}>
                <Link
                  href={`/collections/${collection.slug}`}
                  className="border-line-200 bg-surface-0 hover:border-ink-300 focus-visible:outline-gold-700 flex items-center justify-between gap-4 rounded-md border px-4 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span className="text-foreground text-sm font-medium">{collection.title}</span>
                  <Badge variant="neutral">
                    {collection.productCount === 1
                      ? '1 watch'
                      : `${collection.productCount} watches`}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {searchableBrands.length > 0 ? (
        <section aria-labelledby="search-brands">
          <h2
            id="search-brands"
            className="text-ink-500 text-xs font-semibold tracking-[0.14em] uppercase"
          >
            Brands and models
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {searchableBrands.map((brand) => (
              <li key={brand.slug} className="border-line-200 rounded-md border p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-base">
                    <Link
                      href={`/brands/${brand.slug}`}
                      className="focus-visible:outline-gold-700 focus-visible:outline-2 focus-visible:outline-offset-4"
                    >
                      {brand.name}
                    </Link>
                  </h3>
                  <span className="text-ink-500 shrink-0 text-xs tabular-nums">
                    {brand.productCount === 1 ? '1 watch' : `${brand.productCount} watches`}
                  </span>
                </div>

                {brand.models.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
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
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
