/**
 * Turn wishlist rows into view models.
 *
 * Pure: no Supabase client, no environment, no I/O. Image URL resolution is
 * injected, as elsewhere.
 *
 * The catalogue card mapping is reused rather than reimplemented, so a product
 * in the wishlist is described by exactly the same code as the same product in
 * the grid. A second mapping is a second thing that can drift, and the two
 * disagreeing about a price is the failure this avoids by construction.
 */

import { toCatalogueProducts, type CatalogueSearchRow } from '@/lib/catalogue/assemble';
import type { CatalogueProduct } from '@/lib/catalogue/types';
import { emptyWishlistView, type UnavailableWishlistItem, type WishlistView } from './types';

/** A `catalogue_by_ids` row: a `catalogue_search` row without the count. */
export type WishlistProductRow = Omit<CatalogueSearchRow, 'total_count'>;

export type AssembleWishlistInput = {
  /** The ids that were saved, in display order. */
  savedIds: string[];
  /** The published rows returned for those ids; may be fewer than `savedIds`. */
  rows: WishlistProductRow[];
  /** Injected because it reads the environment. */
  resolveImage: (storagePath: string | null, externalUrl: string | null) => string | null;
  /** The current time, for the "new arrival" badge. */
  now: string;
  source?: WishlistView['source'];
};

/**
 * Build the wishlist view.
 *
 * Any saved id with no published row is carried into `unavailable`. That is the
 * set the customer must be told about: a product that has been unpublished,
 * archived or deleted since it was saved. Dropping it silently is the behaviour
 * the brief rules out.
 *
 * `savedProductIds` keeps the full saved set, including the unavailable ones, so
 * a toggle on any product page reflects what the customer actually saved rather
 * than only what is currently displayable.
 */
export function toWishlistView(input: AssembleWishlistInput): WishlistView {
  const { savedIds, rows, resolveImage, now } = input;

  const products: CatalogueProduct[] = toCatalogueProducts(
    rows.map((row) => ({ ...row, total_count: rows.length })),
    now,
    resolveImage,
  );

  const displayable = new Set(products.map((product) => product.id));
  const unavailable: UnavailableWishlistItem[] = savedIds
    .filter((id) => !displayable.has(id))
    .map((id) => ({ productId: id }));

  return {
    products,
    unavailable,
    savedProductIds: savedIds,
    count: savedIds.length,
    isEmpty: savedIds.length === 0,
    source: input.source ?? 'database',
  };
}

export { emptyWishlistView };
