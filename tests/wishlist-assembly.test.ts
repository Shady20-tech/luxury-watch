import { describe, expect, it } from 'vitest';

import { toWishlistView, type WishlistProductRow } from '@/lib/wishlist/assemble';
import { emptyWishlistView } from '@/lib/wishlist/types';

/**
 * Wishlist assembly.
 *
 * The load-bearing rule is what happens to a saved id whose product is no longer
 * published. The brief asks for deleted and unpublished products to be handled
 * gracefully, and the honest handling is to keep the entry visible, say it is no
 * longer listed and offer removal — not to drop it, which would look like the
 * site had lost something the customer chose.
 *
 * `toWishlistView` is pure, so these cases can be driven without a database:
 * the row set is supplied, and the saved ids are supplied independently, which
 * is exactly the mismatch that occurs when a product is unpublished.
 */

const SAVED = '11111111-1111-1111-1111-111111111111';
const GONE = '22222222-2222-2222-2222-222222222222';

function row(id: string, slug: string): WishlistProductRow {
  return {
    id,
    slug,
    title: `Watch ${slug}`,
    brand_name: 'Test Brand',
    brand_slug: 'test-brand',
    model_name: null,
    model_slug: null,
    price_cents: 1250000,
    currency: 'USD',
    price_on_request: false,
    condition: null,
    reference_number: 'REF-1',
    production_year: 2020,
    case_size_mm: 40,
    case_material: null,
    movement: null,
    dial_color: null,
    bracelet_material: null,
    gender: null,
    box_and_papers: null,
    is_available: true,
    published_at: '2026-01-01T00:00:00.000Z',
    is_featured: false,
    image_storage_path: null,
    image_external_url: null,
    image_alt: null,
  };
}

const resolveImage = () => null;
const NOW = '2026-06-01T00:00:00.000Z';

describe('toWishlistView', () => {
  it('maps a published saved product to a catalogue card', () => {
    const view = toWishlistView({
      savedIds: [SAVED],
      rows: [row(SAVED, 'saved-watch')],
      resolveImage,
      now: NOW,
    });

    expect(view.products).toHaveLength(1);
    expect(view.products[0]?.href).toBe('/products/saved-watch');
    expect(view.products[0]?.price).toBe('$12,500');
    expect(view.unavailable).toEqual([]);
    expect(view.isEmpty).toBe(false);
    expect(view.source).toBe('database');
  });

  it('reports a saved id with no published row as unavailable rather than dropping it', () => {
    const view = toWishlistView({
      savedIds: [SAVED, GONE],
      rows: [row(SAVED, 'saved-watch')],
      resolveImage,
      now: NOW,
    });

    expect(view.products).toHaveLength(1);
    expect(view.unavailable).toEqual([{ productId: GONE }]);
    // The count reflects everything saved, not only what can be displayed.
    expect(view.count).toBe(2);
    expect(view.savedProductIds).toEqual([SAVED, GONE]);
  });

  it('reports every saved id as unavailable when the product was deleted', () => {
    const view = toWishlistView({
      savedIds: [GONE],
      rows: [],
      resolveImage,
      now: NOW,
    });

    expect(view.products).toEqual([]);
    expect(view.unavailable).toEqual([{ productId: GONE }]);
    expect(view.isEmpty).toBe(false);
  });

  it('keeps the unavailable ids in the order they were saved', () => {
    const third = '33333333-3333-3333-3333-333333333333';
    const view = toWishlistView({
      savedIds: [GONE, third],
      rows: [],
      resolveImage,
      now: NOW,
    });

    expect(view.unavailable.map((item) => item.productId)).toEqual([GONE, third]);
  });

  it('reports an empty saved list as an empty, database-sourced wishlist', () => {
    const view = toWishlistView({ savedIds: [], rows: [], resolveImage, now: NOW });

    expect(view.isEmpty).toBe(true);
    expect(view.source).toBe('database');
  });
});

describe('emptyWishlistView', () => {
  it('defaults to the unavailable source, so a failed read is not an empty list', () => {
    expect(emptyWishlistView().source).toBe('unavailable');
    expect(emptyWishlistView().isEmpty).toBe(true);
  });

  it('carries the given source when one is supplied', () => {
    expect(emptyWishlistView('database').source).toBe('database');
  });
});
