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
  listingSeo,
  modelScopeSlug,
  PAGE_SIZES,
  parseCatalogueParams,
  SORT_OPTIONS,
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

  /**
   * Every facet value the database can store must survive a round trip.
   *
   * The catalogue builds filter links from stored values and then parses them
   * back on the next request. When the allowlist and the stored values disagree,
   * the link is emitted but the parameter is dropped, so clicking "Men's" showed
   * the *unfiltered* catalogue — 12 results for a filter promising 5 — and the
   * page looked like a working filter for everything. Nothing failed: the
   * validator is supposed to drop an unparseable value.
   *
   * The fixtures below are the shapes the schema actually holds: `gender` is
   * free text (`Men's`), and `condition` is an enum whose values use underscores
   * (`pre_owned`). Both were rejected. A new column with a new character class
   * must be added here, which is the point — the test is the coupling.
   */
  it('accepts every stored facet value shape, so its own links survive', () => {
    const stored = [
      "Men's",
      'Men’s',
      'Ladies',
      'pre_owned',
      'unworn',
      'Stainless Steel',
      '18-carat sand gold',
      'Blue/White Quartz TPT',
      'Titanium and Carbon TPT',
      'Pink gold, diamond-set', // a comma is intentionally still rejected below
    ];

    for (const value of stored.filter((entry) => !entry.includes(','))) {
      const parsed = parseCatalogueParams({ gender: value });
      expect(parsed.facets.gender, `${value} must parse`).toEqual([value]);
    }

    // A comma still splits, because comma-joined lists are a documented input.
    expect(parseCatalogueParams({ gender: 'a,b' }).facets.gender).toEqual(['a', 'b']);
  });

  it('still rejects a value that could not be a database facet value', () => {
    // Injection-shaped input must be dropped, not escaped into the query.
    expect(parseCatalogueParams({ gender: "Men's);drop table products;--" }).facets.gender).toEqual(
      [],
    );
    expect(parseCatalogueParams({ gender: '<script>' }).facets.gender).toEqual([]);
    expect(parseCatalogueParams({ gender: "'" }).facets.gender).toEqual([]);
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

  it('nests a model under its brand, because the slug alone is not unique', () => {
    // Four models in the seed share the slug `other`, one per brand, so a bare
    // `/models/other` would resolve to four different models. The composite
    // scope slug carries both halves and the URL mirrors it.
    expect(
      catalogueBasePath({ scope: 'model', scopeSlug: modelScopeSlug('rolex', 'milgauss') }),
    ).toBe('/brands/rolex/models/milgauss');
  });

  it('falls back to the brand index for a model scope with no composite slug', () => {
    expect(catalogueBasePath({ scope: 'model', scopeSlug: null })).toBe('/brands');
    expect(catalogueBasePath({ scope: 'model', scopeSlug: 'rolex' })).toBe('/brands');
  });
});

describe('modelScopeSlug', () => {
  it('joins the brand and the model', () => {
    expect(modelScopeSlug('patek-philippe', 'cubitus')).toBe('patek-philippe/cubitus');
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

describe('listingSeo', () => {
  it('indexes a clean listing at its own address', () => {
    expect(listingSeo(parseCatalogueParams({}), 12)).toEqual({
      path: '/shop',
      index: true,
    });
  });

  it('keeps a real deeper page indexable and self-canonical', () => {
    expect(listingSeo(parseCatalogueParams({ page: '2' }), 30)).toEqual({
      path: '/shop?page=2',
      index: true,
    });
  });

  it('does not index a page past the end, and canonicalises onto page one', () => {
    // A soft 404. `?page=999` on a one-page listing answers 200 with an honest
    // empty state, but it must not be indexed and must not compete with the
    // real listing — left as it was, it was `index, follow` and self-canonical,
    // so an invented page number became its own indexable address.
    expect(listingSeo(parseCatalogueParams({ page: '999' }), 12)).toEqual({
      path: '/shop',
      index: false,
    });
  });

  it('does not treat page one of an empty catalogue as out of range', () => {
    // `total === 0` is an empty state, not a soft 404: page 1 does exist.
    expect(listingSeo(parseCatalogueParams({}), 0)).toEqual({ path: '/shop', index: true });
  });

  it('does not index a soft-404 page of a filtered listing either', () => {
    const params = parseCatalogueParams({ condition: 'unworn', page: '5' });
    expect(listingSeo(params, 3)).toEqual({ path: '/shop', index: false });
  });

  it('lets the scope withdraw indexing for thin content', () => {
    expect(listingSeo(parseCatalogueParams({}), 0, false).index).toBe(false);
    expect(listingSeo(parseCatalogueParams({}), 4, false).index).toBe(false);
  });

  it('agrees with isIndexableListing and canonicalListingPath for real pages', () => {
    // One policy, asked two ways: the helper is a wrapper, not a second opinion.
    for (const raw of [{}, { page: '2' }, { sort: 'price_asc' }, { brand: 'rolex' }, { q: 'x' }]) {
      const params = parseCatalogueParams(raw);
      const seo = listingSeo(params, 100);
      expect(seo.index).toBe(isIndexableListing(params));
      expect(seo.path).toBe(canonicalListingPath(params));
    }
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

  it('treats page size as presentation, not as a filter, and drops it from the canonical', () => {
    // A visitor may show 12, 24 or 48 per page. The products are the same set,
    // so the listing stays indexable — but three page sizes must not become
    // three canonical addresses competing for them.
    expect(isIndexableListing(parseCatalogueParams({ pageSize: '48' }))).toBe(true);
    expect(canonicalListingPath(parseCatalogueParams({ pageSize: '48' }))).toBe('/shop');
  });

  it('canonicalises a page size onto the page with the same first row', () => {
    // Page size is presentation, so it must not survive into the canonical — but
    // the *page* must, or two different result sets claim one address. The
    // canonical is therefore the page number in the default 24-per-page series
    // that starts at the same row.
    //
    // This was a real defect: the canonical kept the page number and reset the
    // page size, so `?pageSize=48&page=2` (rows 49–96) and `?pageSize=24&page=2`
    // (rows 25–48) both canonicalised to `/shop?page=2`. Google was told one
    // address, and the page at that address showed a different set of watches.
    expect(canonicalListingPath(parseCatalogueParams({ pageSize: '48', page: '1' }))).toBe('/shop');
    expect(canonicalListingPath(parseCatalogueParams({ pageSize: '48', page: '2' }))).toBe(
      '/shop?page=3',
    );
    expect(canonicalListingPath(parseCatalogueParams({ pageSize: '12', page: '3' }))).toBe(
      '/shop?page=2',
    );
    expect(canonicalListingPath(parseCatalogueParams({ pageSize: '24', page: '2' }))).toBe(
      '/shop?page=2',
    );
    // A page size that does not divide evenly must still land on the page that
    // contains its first row, never past the end.
    expect(canonicalListingPath(parseCatalogueParams({ pageSize: '48', page: '3' }))).toBe(
      '/shop?page=5',
    );
  });

  it('keeps every generated link on an explicit base path', () => {
    // `/search` queries with scope `all` but is its own listing. Before
    // `basePath` existed, a facet link, a sort submission, a page link and the
    // canonical all resolved to `/shop`, so filtering a search silently left the
    // page and the search canonical contradicted its own metadata.
    const params = parseCatalogueParams({ q: 'rolex', page: '2' }, 'all', null, '/search');

    expect(catalogueBasePath(params)).toBe('/search');
    expect(buildCatalogueHref(params, { facets: { brand: ['rolex'] }, page: 1 })).toBe(
      '/search?q=rolex&brand=rolex',
    );
    expect(buildCatalogueHref(params, { page: 3 })).toBe('/search?q=rolex&page=3');
    expect(canonicalListingPath(params)).toBe('/search');
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

  /**
   * A row that would yield nothing must not be a link.
   *
   * `pointer-events-none` on an anchor hides it from the mouse only: the row
   * stays in the tab order and `Enter` still navigates, so a keyboard user
   * landed on an empty grid the pointer user could not reach. The check is that
   * the disabled branch returns a `span` before the `Link` is reached, which is
   * the shape that cannot regress into a class-only guard.
   */
  it('renders a disabled row as a span, not a link with a pointer-events class', () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/pointer-events-none/);
    expect(code).toMatch(/if \(disabled\) \{\s*return \(\s*<span aria-disabled="true"/);
  });

  /**
   * A filter that can only ever empty the grid must not be offered.
   *
   * Every seed product is priced on request, so the numeric price bound had no
   * product it could match. `PriceModeFilter` already hid itself when nothing
   * was priced; the range control next to it did not.
   */
  it('hides the numeric price range when nothing is priced', () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).toMatch(/facets\.priceRange\.pricedCount > 0 \? \(/);
  });
});

/**
 * Every sort the UI offers must survive parsing.
 *
 * Raised by the Phase 5 acceptance audit: the E2E test that claimed to cover
 * sorting asked for `sort=price-asc` — hyphenated, not a value in the enum. The
 * parser rejected it, fell back to `featured`, and the assertion compared the
 * default ordering with itself. Rejecting an unknown value is correct; the gap
 * was that no test proved a *known* one was kept, so a rename applied to
 * `SORT_OPTIONS` alone would have gone unnoticed by both suites.
 */
describe('sort parsing', () => {
  it('keeps every value the UI offers', () => {
    for (const option of SORT_OPTIONS) {
      expect(parseCatalogueParams({ sort: option.value }).sort).toBe(option.value);
    }
  });

  it('rejects the hyphenated spelling the old E2E test used', () => {
    expect(parseCatalogueParams({ sort: 'price-asc' }).sort).toBe('featured');
  });

  it('treats a sort as an ordering, not a narrowing', () => {
    const sorted = parseCatalogueParams({ sort: 'title_desc' });
    expect(isIndexableListing(sorted)).toBe(true);
    // The canonical drops the sort, so the permutation cannot compete with the
    // clean listing for the same products.
    expect(canonicalListingPath(sorted)).toBe(catalogueBasePath(sorted));
  });
});
