import { describe, expect, it } from 'vitest';

import {
  productBreadcrumbs,
  toProductDetail,
  type AssembleProductInput,
  type ProductRow,
} from '@/lib/product/assemble';
import type { ProductDetail } from '@/lib/product/types';

/**
 * Assembly rules for the product detail page.
 *
 * These are pure-function tests against fixtures, not mocks: `toProductDetail`
 * takes rows and returns a view model, with image resolution injected. The point
 * is to pin the decisions that carry an honesty or SEO obligation — the price
 * states, the availability state, the spec de-duplication, and the fact that a
 * product's `priceMinor` exists only when a real price does. Those are exactly
 * the rules a later refactor could quietly break.
 */

const baseRow: ProductRow = {
  id: '11111111-1111-1111-1111-111111111111',
  sku: 'LW-TEST-1',
  slug: 'test-watch',
  title: 'Test Watch',
  short_description: null,
  description: null,
  price_cents: null,
  currency: 'USD',
  price_on_request: true,
  condition: null,
  production_year: null,
  reference_number: null,
  case_size_mm: null,
  case_material: null,
  movement: null,
  dial_color: null,
  bracelet_material: null,
  bezel: null,
  water_resistance_m: null,
  gender: null,
  box_and_papers: null,
  seo_title: null,
  seo_description: null,
  og_image_url: null,
  published_at: null,
  updated_at: '2026-01-01T00:00:00.000Z',
  brand_name: null,
  brand_slug: null,
  model_name: null,
  model_slug: null,
};

function assemble(overrides: Partial<AssembleProductInput> = {}): ProductDetail {
  return toProductDetail({
    row: baseRow,
    images: [],
    specs: [],
    collections: [],
    available: true,
    resolveImage: () => null,
    ...overrides,
  });
}

describe('price states', () => {
  it('renders a real price and sets priceMinor so an offer can be emitted', () => {
    const product = assemble({
      row: { ...baseRow, price_cents: 1250000, price_on_request: false },
    });

    expect(product.price).toBe('$12,500');
    expect(product.priceMinor).toBe(1250000);
    expect(product.priceOnRequest).toBe(false);
  });

  it('never fabricates a price for a price-on-request product', () => {
    const product = assemble();

    expect(product.price).toBeNull();
    // The load-bearing assertion: no price means no minor-unit value, which is
    // what stops the JSON-LD from claiming an offer.
    expect(product.priceMinor).toBeNull();
    expect(product.priceOnRequest).toBe(true);
  });

  it('treats a null price as on-request even when the flag disagrees', () => {
    // The schema forbids this combination, but the card must not print "0.00"
    // if the invariant is ever violated.
    const product = assemble({
      row: { ...baseRow, price_cents: null, price_on_request: false },
    });

    expect(product.price).toBeNull();
    expect(product.priceMinor).toBeNull();
  });

  it('parses numeric columns that arrive as strings through PostgREST', () => {
    const product = assemble({
      row: {
        ...baseRow,
        price_cents: '1250000',
        price_on_request: false,
        case_size_mm: '41.00',
        water_resistance_m: 50,
      },
    });

    expect(product.price).toBe('$12,500');
    expect(product.priceMinor).toBe(1250000);
    // A numeric(5,2) column must not render "41.00 mm".
    expect(product.caseSize).toBe('41 mm');
    expect(product.waterResistance).toBe('50 m');
  });
});

describe('availability', () => {
  it('maps the availability function result to the two honest states', () => {
    expect(assemble({ available: true }).availability).toBe('available');
    expect(assemble({ available: false }).availability).toBe('reserved');
  });

  it('keeps price and availability independent', () => {
    // A priced watch can be reserved; a price-on-request watch can be available.
    const pricedReserved = assemble({
      row: { ...baseRow, price_cents: 500000, price_on_request: false },
      available: false,
    });

    expect(pricedReserved.price).toBe('$5,000');
    expect(pricedReserved.availability).toBe('reserved');
  });
});

describe('specification table', () => {
  it('omits a row rather than rendering a dash for an unrecorded value', () => {
    expect(assemble().specs).toEqual([]);
  });

  it('puts first-class columns before the long tail', () => {
    const product = assemble({
      row: { ...baseRow, reference_number: '26674ST', case_material: 'Stainless steel' },
      specs: [{ label: 'Calibre', value: '5134', sort_order: 1 }],
    });

    expect(product.specs.map((spec) => spec.label)).toEqual([
      'Reference',
      'Case material',
      'Calibre',
    ]);
  });

  it('does not duplicate a column with a differently-worded spec label', () => {
    const product = assemble({
      row: { ...baseRow, reference_number: '26674ST' },
      specs: [
        { label: 'Reference Number', value: '26674ST', sort_order: 1 },
        { label: 'reference:', value: '26674ST', sort_order: 2 },
        { label: 'Calibre', value: '5134', sort_order: 3 },
      ],
    });

    expect(product.specs.map((spec) => spec.label)).toEqual(['Reference', 'Calibre']);
  });

  it('states box and papers in both directions and omits it when unknown', () => {
    expect(assemble({ row: { ...baseRow, box_and_papers: true } }).specs).toContainEqual({
      label: 'Box & papers',
      value: 'Yes',
    });
    expect(assemble({ row: { ...baseRow, box_and_papers: false } }).specs).toContainEqual({
      label: 'Box & papers',
      value: 'No',
    });
    expect(
      assemble({ row: { ...baseRow, box_and_papers: null } }).specs.some(
        (spec) => spec.label === 'Box & papers',
      ),
    ).toBe(false);
  });

  it('drops a spec row with a blank value', () => {
    const product = assemble({
      specs: [
        { label: 'Calibre', value: '   ', sort_order: 1 },
        { label: 'Jewels', value: '38', sort_order: 2 },
      ],
    });

    expect(product.specs.map((spec) => spec.label)).toEqual(['Jewels']);
  });
});

describe('images', () => {
  it('orders primary first, then the editor order', () => {
    const product = assemble({
      images: [
        {
          id: 'b',
          storage_path: 'b.jpg',
          external_url: null,
          alt_text: 'Second',
          width: null,
          height: null,
          is_primary: false,
          sort_order: 1,
        },
        {
          id: 'a',
          storage_path: 'a.jpg',
          external_url: null,
          alt_text: 'Primary',
          width: null,
          height: null,
          is_primary: true,
          sort_order: 9,
        },
      ],
      resolveImage: (storagePath) => (storagePath ? `/media/${storagePath}` : null),
    });

    expect(product.images.map((image) => image.alt)).toEqual(['Primary', 'Second']);
    expect(product.images[0]?.url).toBe('/media/a.jpg');
  });

  it('falls back to the product title when alt text is blank', () => {
    const product = assemble({
      images: [
        {
          id: 'a',
          storage_path: 'a.jpg',
          external_url: null,
          alt_text: '   ',
          width: null,
          height: null,
          is_primary: true,
          sort_order: 0,
        },
      ],
      resolveImage: () => '/media/a.jpg',
    });

    expect(product.images[0]?.alt).toBe('Test Watch');
  });
});

describe('breadcrumbs', () => {
  it('builds the trail from the real brand rather than a fixed list', () => {
    const product = assemble({
      row: { ...baseRow, brand_name: 'Audemars Piguet', brand_slug: 'audemars-piguet' },
    });

    expect(productBreadcrumbs(product)).toEqual([
      { name: 'Home', path: '/' },
      { name: 'The Collection', path: '/shop' },
      { name: 'Audemars Piguet', path: '/brands/audemars-piguet' },
      { name: 'Test Watch', path: '/products/test-watch' },
    ]);
  });

  it('omits the brand crumb when the product has none', () => {
    const trail = productBreadcrumbs(assemble());

    expect(trail.map((entry) => entry.path)).toEqual(['/', '/shop', '/products/test-watch']);
  });
});

describe('text fields', () => {
  it('treats whitespace-only text as absent', () => {
    const product = assemble({
      row: { ...baseRow, description: '   \n  ', short_description: '  ' },
    });

    expect(product.description).toBeNull();
    expect(product.shortDescription).toBeNull();
  });

  it('drops a collection with no slug, which could not be linked', () => {
    const product = assemble({
      collections: [
        { title: 'Real', slug: 'real' },
        { title: 'Broken', slug: '' },
      ],
    });

    expect(product.collections).toEqual([{ title: 'Real', slug: 'real' }]);
  });
});
