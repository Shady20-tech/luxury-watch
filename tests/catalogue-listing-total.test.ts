import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as envModule from '@/lib/env';

import { parseCatalogueParams } from '@/lib/catalogue/params';

/**
 * The listing service's handling of the total, and of a page past the end.
 *
 * This exists because of a real defect: `catalogue_search` returns the total on
 * every row it returns, and the service took it from `rows[0]`. On a page past
 * the end there are no rows, so the total collapsed to zero — and the page then
 * told the visitor "No watches are listed yet" about a catalogue of 23 pieces,
 * and the toolbar printed "Showing 25–23 of 23". Both messages were false, and
 * both were plausible enough to survive a manual read.
 *
 * The invariant is narrow and worth pinning: **the total describes the filtered
 * set, not the page.** Only the repository boundary is stubbed, so the rest of
 * the service — the facet mapping, the page arithmetic, the empty-listing shape
 * — runs for real.
 */

vi.mock('server-only', () => ({}));

const fetchCataloguePage = vi.fn();
const fetchCatalogueFacets = vi.fn();

vi.mock('@/server/repositories/catalogue-repository', () => ({
  fetchCataloguePage: (...args: unknown[]) => fetchCataloguePage(...args),
  fetchCatalogueFacets: (...args: unknown[]) => fetchCatalogueFacets(...args),
}));

vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof envModule>();
  return { ...actual, isSupabaseConfigured: () => true };
});

const { getListing } = await import('@/server/services/catalogue-service');

/** A facet payload whose total is the true size of the filtered set. */
function facetsWithTotal(total: number) {
  return {
    values: {
      brand: [],
      collection: [],
      model: [],
      condition: [],
      caseMaterial: [],
      dialColor: [],
      movement: [],
      bracelet: [],
      gender: [],
    },
    availability: [],
    boxAndPapers: [],
    priceRange: { min: null, max: null, pricedCount: 0 },
    yearRange: { min: null, max: null },
    caseSizeRange: { min: null, max: null },
    total,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    slug: 'example-piece',
    title: 'Example piece',
    brand_name: 'Example',
    brand_slug: 'example',
    model_name: null,
    model_slug: null,
    reference_number: 'REF-1',
    production_year: 2025,
    condition: 'new',
    case_size_mm: 40,
    case_material: 'Steel',
    movement: 'Automatic',
    dial_color: 'Black',
    bracelet_material: 'Steel',
    gender: 'Men',
    box_and_papers: true,
    price_cents: null,
    currency: 'USD',
    price_on_request: true,
    published_at: '2026-01-01T00:00:00.000Z',
    is_featured: false,
    image_storage_path: null,
    image_external_url: null,
    image_alt: null,
    is_available: true,
    total_count: 23,
    ...overrides,
  };
}

beforeEach(() => {
  fetchCataloguePage.mockReset();
  fetchCatalogueFacets.mockReset();
});

describe('getListing total and page arithmetic', () => {
  it('reports the filtered total from the page rows when they are present', async () => {
    fetchCataloguePage.mockResolvedValue({ rows: [row()], total: 23 });
    fetchCatalogueFacets.mockResolvedValue(facetsWithTotal(23));

    const listing = await getListing(parseCatalogueParams({}));

    expect(listing.total).toBe(23);
    expect(listing.pageCount).toBe(1);
    expect(listing.products).toHaveLength(1);
  });

  it('keeps the real total on a page past the end, where there are no rows', async () => {
    // The defect: no rows means no total on the rows, and the total was read
    // from them. The facet payload still counts the whole filtered set.
    fetchCataloguePage.mockResolvedValue({ rows: [], total: 0 });
    fetchCatalogueFacets.mockResolvedValue(facetsWithTotal(23));

    const listing = await getListing(parseCatalogueParams({ page: '2' }));

    expect(listing.total).toBe(23);
    expect(listing.page).toBe(2);
    expect(listing.pageCount).toBe(1);
    expect(listing.products).toEqual([]);
  });

  it('computes the page count from the filtered total, not the page length', async () => {
    fetchCataloguePage.mockResolvedValue({ rows: [row()], total: 50 });
    fetchCatalogueFacets.mockResolvedValue(facetsWithTotal(50));

    const listing = await getListing(parseCatalogueParams({ pageSize: '24' }));

    expect(listing.pageCount).toBe(3);
    expect(listing.hasNextPage).toBe(true);
  });

  it('marks the last page as having no next page', async () => {
    fetchCataloguePage.mockResolvedValue({ rows: [row()], total: 50 });
    fetchCatalogueFacets.mockResolvedValue(facetsWithTotal(50));

    const listing = await getListing(parseCatalogueParams({ pageSize: '24', page: '3' }));

    expect(listing.hasNextPage).toBe(false);
    expect(listing.hasPreviousPage).toBe(true);
  });

  it('still reports zero honestly when the filtered set really is empty', async () => {
    fetchCataloguePage.mockResolvedValue({ rows: [], total: 0 });
    fetchCatalogueFacets.mockResolvedValue(facetsWithTotal(0));

    const listing = await getListing(parseCatalogueParams({ brand: 'nothing' }));

    expect(listing.total).toBe(0);
    // `pageCount` never drops below one for a database answer, so pagination
    // renders nothing rather than a range of zero pages.
    expect(listing.pageCount).toBe(1);
    expect(listing.source).toBe('database');
  });
});
