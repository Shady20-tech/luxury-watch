/**
 * Wishlist view models.
 *
 * A signed-in wishlist lives in the database (`wishlists` / `wishlist_items`)
 * and is the source of truth after sign-in. A guest wishlist lives in the
 * browser and holds product ids only; see `lib/wishlist/guest.ts` for what it
 * may and may not contain.
 *
 * `src/lib/wishlist/assemble.ts` is the only place that turns rows into these
 * shapes, and it reuses the catalogue's card mapping so a saved product cannot
 * be described differently from the same product in the grid.
 */

import type { CatalogueProduct } from '@/lib/catalogue/types';

/**
 * A saved product that can no longer be shown.
 *
 * A saved id can name a product that has since been unpublished, archived or
 * deleted. The brief asks for those to be handled "gracefully", and the honest
 * handling is to keep the row visible, say what happened and offer a way to
 * remove it — not to silently drop it, which would look like the site had lost
 * something the customer chose.
 *
 * Only the id is carried, because that is all that is knowable: the product row
 * is not readable through the public API once it is unpublished, so there is no
 * title to show. The UI says exactly that rather than inventing one.
 */
export type UnavailableWishlistItem = {
  productId: string;
};

/**
 * A wishlist as its page renders it.
 *
 * `source` distinguishes "the database answered and the list is empty" from
 * "the database could not be reached", the same distinction the catalogue and
 * the cart make.
 */
export type WishlistView = {
  /** Saved products that are still published and displayable. */
  products: CatalogueProduct[];
  /** Saved ids that can no longer be shown, each with a removal control. */
  unavailable: UnavailableWishlistItem[];
  /** Every saved id, in display order, for the "saved" state of a toggle. */
  savedProductIds: string[];
  count: number;
  isEmpty: boolean;
  source: 'database' | 'local' | 'unavailable';
};

export function emptyWishlistView(source: WishlistView['source'] = 'unavailable'): WishlistView {
  return {
    products: [],
    unavailable: [],
    savedProductIds: [],
    count: 0,
    isEmpty: true,
    source,
  };
}
