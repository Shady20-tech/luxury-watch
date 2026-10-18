import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildCatalogueHref,
  canonicalListingPath,
  catalogueBasePath,
  catalogueHiddenInputs,
  countActiveFilterGroups,
  hasActiveFilters,
  isIndexableListing,
  PAGE_SIZES,
  parseCatalogueParams,
} from '@/lib/catalogue/params';

/**
 * The catalogue query layer is the single source of truth for what a catalogue
 * URL means, so it is tested directly rather than only through a rendered page.
 *
 * The `isIndexableListing` cases matter most. The first implementation derived
 * the indexing decision by comparing the canonical path to the listing base
 * path, which is true for a clean listing *and* for a filtered one — filtering
 * keeps the base path. Every facet permutation was therefore indexable. A
 * rendered-HTML assertion caught it; these tests stop it coming back, because
 * the invariant is "does this listing narrow the result set", not "does its URL
 * look like the base path".
 */

describe('parseCatalogueParams', () => {
  it('applies the documented defaults to an empty query string', () => {
    const params = parseCatalogueParams({});

    expect(params.scope).toBe('all');
    expect(params.scopeSlug).toBeNull();
    expect(params.query).toBe('');
    expect(params.sort).toBe('featured');
    expect(params.page).toBe(1);
    expect(params.pageSize).toBe(24);
    expect(params.priceMode).toBe('any');
    expect(params.availability).toBe('any');
    expect(params.boxAndPapers).toBeNull();
    expect(params.priceMin).toBeNull();
    expect(params.priceMax).toBeNull();
  });

  it('drops an unknown sort rather than forwarding it to the database', () => {
    expect(parseCatalogueParams({ sort: 'best_selling' }).sort).toBe('featured');
    expect(parseCatalogueParams({ sort: 'price_asc' }).sort).toBe('price_asc');
  });

  it('rejects an unparseable page and page size instead of coercing them', () => {
    expect(parseCatalogueParams({ page: '0' }).page).toBe(1);
    expect(parseCatalogueParams({ page: '-4' }).page).toBe(1);
    expect(parseCatalogueParams({ page: 'abc' }).page).toBe(1);
    expect(parseCatalogueParams({ page: '3' }).page).toBe(3);

    expect(parseCatalogueParams({ pageSize: '1000' }).pageSize).toBe(24);
    expect(parseCatalogueParams({ pageSize: 'abc' }).pageSize).toBe(24);
    for (const size of PAGE_SIZES) {
      expect(parseCatalogueParams({ pageSize: String(size) }).pageSize).toBe(size);
    }
  });

  it('converts whole-unit prices to minor units exactly once', () => {
    const params = parseCatalogueParams({ priceMin: '1000', priceMax: '2500' });
    expect(params.priceMin).toBe(100_000);
    expect(params.priceMax).toBe(250_000);
  });

  it('drops a negative price and clamps an absurd one to the documented bound', () => {
    // A negative value is not a valid price, so it is dropped entirely. A very
    // large value is clamped rather than dropped: the bound is a guard against
    // an out-of-range filter, not a rejection of the visitor's intent.
    expect(parseCatalogueParams({ priceMin: '-5' }).priceMin).toBeNull();
    expect(parseCatalogueParams({ priceMin: '999999999999' }).priceMin).toBe(100_000_000_00);
  });

  it('clamps an out-of-range year or case size to its bound', () => {
    expect(parseCatalogueParams({ yearMin: '1500' }).yearMin).toBe(1800);
    expect(parseCatalogueParams({ yearMin: '9999' }).yearMin).toBe(2200);
    expect(parseCatalogueParams({ caseMin: '0' }).caseMin).toBe(1);
    expect(parseCatalogueParams({ caseMin: '500' }).caseMin).toBe(200);
  });

  it('deduplicates a repeated facet and ignores an empty value', () => {
    const params = parseCatalogueParams({ brand: ['rolex', 'rolex', '', 'omega'] });
    expect(params.facets.brand).toEqual(['rolex', 'omega']);
  });

  it('ignores an unknown facet key entirely', () => {
    const params = parseCatalogueParams({ nonsense: 'value', brand: 'rolex' });
    expect(Object.keys(params.facets)).not.toContain('nonsense');
    expect(params.facets.brand).toEqual(['rolex']);
  });

  it('caps how many values one facet may carry', () => {
    const many = Array.from({ length: 500 }, (_, i) => `brand-${i}`);
    const params = parseCatalogueParams({ brand: many });
    expect(params.facets.brand.length).toBeLessThan(many.length);
    expect(params.facets.brand.length).toBeGreaterThan(0);
  });

  it('truncates an overlong search term', () => {
    const params = parseCatalogueParams({ q: 'x'.repeat(5000) });
    expect(params.query.length).toBeLessThanOrEqual(120);
  });

  it('accepts only the documented availability modes', () => {
    expect(parseCatalogueParams({ availability: 'reserved' }).availability).toBe('reserved');
    expect(parseCatalogueParams({ availability: 'available' }).availability).toBe('available');
    expect(parseCatalogueParams({ availability: 'sold' }).availability).toBe('any');
  });
});

describe('catalogueBasePath', () => {
  it('is the shop for an all-scope listing', () => {
    expect(catalogueBasePath({ scope: 'all', scopeSlug: null })).toBe('/shop');
  });

  it('is the scoped route for a brand or collection', () => {
    expect(catalogueBasePath({ scope: 'brand', scopeSlug: 'rolex' })).toBe('/brands/rolex');
    expect(catalogueBasePath({ scope: 'collection', scopeSlug: 'featured' })).toBe(
      '/collections/featured',
    );
  });
});

describe('isIndexableListing', () => {
  it('indexes a clean listing', () => {
    expect(isIndexableListing(parseCatalogueParams({}))).toBe(true);
  });

  it('does not index a filtered listing', () => {
    expect(isIndexableListing(parseCatalogueParams({ brand: 'rolex' }))).toBe(false);
    expect(isIndexableListing(parseCatalogueParams({ availability: 'reserved' }))).toBe(false);
    expect(isIndexableListing(parseCatalogueParams({ priceMin: '1000' }))).toBe(false);
    expect(isIndexableListing(parseCatalogueParams({ boxAndPapers: 'true' }))).toBe(false);
  });

  it('does not index a search', () => {
    expect(isIndexableListing(parseCatalogueParams({ q: 'rolex' }))).toBe(false);
  });

  it('does not index a filtered brand listing', () => {
    const params = parseCatalogueParams({ brand: 'rolex' }, 'brand', 'rolex');
    expect(isIndexableListing(params)).toBe(false);
  });

  it('indexes a clean brand listing', () => {
    const params = parseCatalogueParams({}, 'brand', 'rolex');
    expect(isIndexableListing(params)).toBe(true);
  });

  it('treats sort as ordering, not as a filter', () => {
    // The same products in a different order is not a different page, so a
    // sorted listing stays indexable and its canonical drops the sort.
    expect(isIndexableListing(parseCatalogueParams({ sort: 'price_asc' }))).toBe(true);
  });

  it('indexes deeper pages, because pagination is a genuine series', () => {
    expect(isIndexableListing(parseCatalogueParams({ page: '3' }))).toBe(true);
  });
});

describe('canonicalListingPath', () => {
  it('is the bare listing for a clean listing', () => {
    expect(canonicalListingPath(parseCatalogueParams({}))).toBe('/shop');
  });

  it('keeps a deep page canonical to itself, so deeper products stay crawlable', () => {
    expect(canonicalListingPath(parseCatalogueParams({ page: '2' }))).toBe('/shop?page=2');
  });

  it('consolidates a filtered listing onto the clean listing', () => {
    // This is the case the original implementation got wrong: the canonical
    // must not carry the filter, but it must also not be indistinguishable
    // from the clean listing's decision.
    expect(canonicalListingPath(parseCatalogueParams({ brand: 'rolex' }))).toBe('/shop');
    expect(canonicalListingPath(parseCatalogueParams({ q: 'rolex' }))).toBe('/shop');
  });

  it('drops the sort from the canonical', () => {
    expect(canonicalListingPath(parseCatalogueParams({ sort: 'price_asc' }))).toBe('/shop');
  });

  it('consolidates a filtered brand listing onto the clean brand listing', () => {
    const params = parseCatalogueParams({ brand: 'rolex', condition: 'new' }, 'brand', 'rolex');
    expect(canonicalListingPath(params)).toBe('/brands/rolex');
  });
});

describe('buildCatalogueHref', () => {
  it('omits every default, so one logical page has one address', () => {
    expect(buildCatalogueHref(parseCatalogueParams({}))).toBe('/shop');
    expect(buildCatalogueHref(parseCatalogueParams({ sort: 'featured', pageSize: '24' }))).toBe(
      '/shop',
    );
  });

  it('round-trips a filter through the URL', () => {
    const href = buildCatalogueHref(parseCatalogueParams({ brand: 'rolex', condition: 'new' }));
    const reparsed = parseCatalogueParams(
      Object.fromEntries(new URLSearchParams(href.split('?')[1] ?? '')),
    );

    expect(reparsed.facets.brand).toEqual(['rolex']);
    expect(reparsed.facets.condition).toEqual(['new']);
  });
});

describe('hasActiveFilters and countActiveFilterGroups', () => {
  it('is false for a clean listing', () => {
    expect(hasActiveFilters(parseCatalogueParams({}))).toBe(false);
    expect(countActiveFilterGroups(parseCatalogueParams({}))).toBe(0);
  });

  it('counts a search term as an active filter', () => {
    expect(hasActiveFilters(parseCatalogueParams({ q: 'rolex' }))).toBe(true);
  });

  it('counts facet groups, not individual values', () => {
    const params = parseCatalogueParams({ brand: 'rolex,omega', condition: 'new' });
    expect(countActiveFilterGroups(params)).toBe(2);
  });
});

describe('catalogueHiddenInputs', () => {
  it('carries the active filters so a form cannot silently drop them', () => {
    const params = parseCatalogueParams({ brand: 'rolex', condition: 'new' });
    const hidden = catalogueHiddenInputs(params, ['page']);

    const names = hidden.map((input) => input.name);
    expect(names).toContain('brand');
    expect(names).toContain('condition');
    expect(names).not.toContain('page');
  });
});

describe('the filter markup', () => {
  /**
   * A source-level guard for the attribute that broke CI.
   *
   * Every filter row is an `<a>` that navigates, and `aria-pressed` is not
   * permitted on a link — axe reports `aria-allowed-attr`, which failed the
   * browser audit on `/collections/all` at desktop width, where the filter panel
   * is expanded rather than folded into a drawer. The selected state belongs in
   * `aria-current`, which is the attribute that means "current item in a set of
   * links".
   *
   * jsdom does not run the rule, because `aria-allowed-attr` is not among the
   * ones axe evaluates without layout — the same gap that hid the Phase 3 and
   * Phase 4 defects. So the invariant is asserted against the source, which
   * cannot be skipped for lack of a layout engine.
   */
  const source = readFileSync(
    fileURLToPath(new URL('../src/components/catalogue/catalogue-filters.tsx', import.meta.url)),
    'utf8',
  );

  it('never puts aria-pressed on a link', () => {
    // Strip comments: the doc comment above the fix names the old attribute in
    // order to explain why it was wrong, and that is prose, not code.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/aria-pressed/);
  });

  it('marks the selected row with aria-current', () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).toMatch(/aria-current=/);
  });
});
