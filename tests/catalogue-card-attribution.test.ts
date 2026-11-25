import { describe, expect, it } from 'vitest';

import { toCatalogueProduct } from '@/lib/catalogue/assemble';
import type { CatalogueSearchRow } from '@/lib/catalogue/assemble';

/**
 * Attribution on a catalogue card.
 *
 * CC BY 4.0 and CC BY-SA 4.0 — the licences the seed photography is under —
 * require the author and the licence to be named wherever the work is shown.
 * A listing card is a display, so `/shop`, every collection and brand page, the
 * model pages, `/search` and `/wishlist` all need the credit.
 *
 * The defect this guards against was exact: 0028 added `credit`, `licence` and
 * `licence_url` to `product_images` and the product detail gallery rendered
 * them, while `catalogue_search` and `catalogue_by_ids` kept returning only the
 * image path and alt text. Every photographed card on every listing therefore
 * showed a Commons photograph with no attribution, and nothing failed — the
 * columns existed and one surface used them.
 *
 * These cases pin the mapping rule rather than the SQL: the row carries the
 * credit, and the mapper decides whether the pair is complete enough to render.
 */

const NOW = '2026-01-01T00:00:00.000Z';

function row(overrides: Partial<CatalogueSearchRow> = {}): Omit<CatalogueSearchRow, 'total_count'> {
  const { total_count: _total, ...rest } = {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'rolex-milgauss-116400gv',
    title: 'Rolex Milgauss 116400GV',
    brand_name: 'Rolex',
    brand_slug: 'rolex',
    model_name: 'Milgauss',
    model_slug: 'milgauss',
    reference_number: '116400GV',
    production_year: 2024,
    condition: 'unworn',
    case_size_mm: 40,
    case_material: 'Stainless Steel',
    movement: 'Automatic',
    dial_color: 'Blue',
    bracelet_material: 'Stainless Steel',
    gender: "Men's",
    box_and_papers: true,
    price_cents: 950000,
    currency: 'USD',
    price_on_request: false,
    published_at: '2025-06-01T00:00:00.000Z',
    is_featured: false,
    image_storage_path: null,
    image_external_url: '/seed-images/rolex-milgauss-116400gv-blue-dial.webp',
    image_alt: 'Rolex Milgauss with a blue dial',
    image_credit: 'Carolyn Maria Adams',
    image_licence: 'CC BY-SA 4.0',
    image_licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    is_available: true,
    ...overrides,
  } as CatalogueSearchRow;
  return rest;
}

const resolveImage = (storagePath: string | null, externalUrl: string | null) =>
  storagePath ?? externalUrl;

describe('catalogue card image attribution', () => {
  it('carries the credit, licence and licence link when all are present', () => {
    const product = toCatalogueProduct(row(), NOW, resolveImage);

    expect(product.imageCredit).toEqual({
      credit: 'Carolyn Maria Adams',
      licence: 'CC BY-SA 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    });
  });

  it('keeps a credit whose licence has no link', () => {
    // The link is the courtesy; naming the licence is the requirement.
    const product = toCatalogueProduct(row({ image_licence_url: null }), NOW, resolveImage);

    expect(product.imageCredit).toEqual({
      credit: 'Carolyn Maria Adams',
      licence: 'CC BY-SA 4.0',
      licenceUrl: null,
    });
  });

  it('drops a licence with no author', () => {
    // A licence name alone does not tell a reader whose work it is, so the card
    // would print "Photo: (CC BY-SA 4.0)" — worse than printing nothing.
    const product = toCatalogueProduct(row({ image_credit: null }), NOW, resolveImage);

    expect(product.imageCredit).toBeNull();
  });

  it('drops an author with no licence', () => {
    // CC BY-SA requires the licence to be named, so half the attribution does
    // not satisfy it.
    const product = toCatalogueProduct(row({ image_licence: null }), NOW, resolveImage);

    expect(product.imageCredit).toBeNull();
  });

  it('treats blank strings as absent rather than rendering empty parentheses', () => {
    const product = toCatalogueProduct(
      row({ image_credit: '   ', image_licence: '  ' }),
      NOW,
      resolveImage,
    );

    expect(product.imageCredit).toBeNull();
  });

  it('trims stray whitespace from the stored values', () => {
    const product = toCatalogueProduct(
      row({ image_credit: ' Partynia\n', image_licence: ' CC BY 4.0 ' }),
      NOW,
      resolveImage,
    );

    expect(product.imageCredit?.credit).toBe('Partynia');
    expect(product.imageCredit?.licence).toBe('CC BY 4.0');
  });

  it('reports no credit for a piece with no photograph', () => {
    // The drawn illustration is ours, so there is nothing to attribute.
    const product = toCatalogueProduct(
      row({ image_external_url: null, image_credit: null, image_licence: null }),
      NOW,
      resolveImage,
    );

    expect(product.imageUrl).toBeNull();
    expect(product.imageCredit).toBeNull();
  });
});
