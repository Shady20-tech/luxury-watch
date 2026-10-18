/**
 * Catalogue query parameters: parsing, validation, URL building and the
 * canonicalisation policy.
 *
 * This module is the single source of truth for what a catalogue URL may
 * contain. Every route that browses the catalogue reads its state through
 * `parseCatalogueParams`, so an unknown or hostile value cannot reach the
 * database and cannot change the meaning of a page.
 *
 * -----------------------------------------------------------------------------
 * WHY VALIDATION IS SERVER-SIDE AND STRICT
 * -----------------------------------------------------------------------------
 *
 * The query string is attacker-controlled. Anything unvalidated here ends up as
 * a parameter to a database function, in a canonical URL, or in a cache key.
 * The rules therefore are:
 *
 *   * Unknown keys are ignored rather than forwarded.
 *   * Every value is coerced to a known type with a bound.
 *   * An unparseable value is dropped, never passed through.
 *   * Repeated values are deduplicated and capped, so one URL cannot ask for
 *     thousands of filter values.
 *
 * -----------------------------------------------------------------------------
 * WHY CANONICALISATION IS SEPARATE FROM PARSING
 * -----------------------------------------------------------------------------
 *
 * Several different URLs can mean the same listing: `?sort=featured` and no
 * sort parameter are the same page, and `?brand=rolex&brand=rolex` is the same
 * as `?brand=rolex`. If each were rendered with its own canonical tag, a
 * crawler would see several URLs for one page and split its budget across them.
 * So parsing produces the *effective* state, and `buildCatalogueHref` renders
 * that state back into one address, omitting every default.
 */

import { z } from 'zod';

/** Page sizes a visitor may request. The database clamps to 60 as a backstop. */
export const PAGE_SIZES = [12, 24, 48] as const;
export const DEFAULT_PAGE_SIZE = 24;

/**
 * Sort options.
 *
 * `featured` is the default and is the only ordering an editor controls
 * directly (`is_featured` then `sort_order`). There is deliberately no
 * "best selling" option: no real order history backs such a claim, and
 * inventing one would be dishonest. The database function says the same thing.
 */
export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'relevance', label: 'Most relevant' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'title_asc', label: 'Name: A to Z' },
  { value: 'title_desc', label: 'Name: Z to A' },
  { value: 'reference_asc', label: 'Reference: A to Z' },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]['value'];

const SORT_VALUES = SORT_OPTIONS.map((option) => option.value) as [SortValue, ...SortValue[]];

/** Condition values, matching the `product_condition` enum. */
export const CONDITION_VALUES = ['new', 'unworn', 'pre_owned', 'vintage'] as const;
export type ConditionValue = (typeof CONDITION_VALUES)[number];

export const CONDITION_LABELS: Record<ConditionValue, string> = {
  new: 'New',
  unworn: 'Unworn',
  pre_owned: 'Pre-owned',
  vintage: 'Vintage',
};

/** How the price filter treats price-on-request pieces. */
export const PRICE_MODES = ['any', 'priced', 'on_request'] as const;
export type PriceMode = (typeof PRICE_MODES)[number];

/** How the availability filter narrows the catalogue. */
export const AVAILABILITY_MODES = ['any', 'available', 'reserved'] as const;
export type AvailabilityMode = (typeof AVAILABILITY_MODES)[number];

export const AVAILABILITY_LABELS: Record<AvailabilityMode, string> = {
  any: 'Any availability',
  available: 'Available now',
  reserved: 'Reserved',
};

export const PRICE_MODE_LABELS: Record<PriceMode, string> = {
  any: 'Any price',
  priced: 'Priced',
  on_request: 'Price on request',
};

/**
 * Facet dimensions that accept a list of values.
 *
 * `key` is the URL parameter name; `field` is the argument name on the database
 * functions. Keeping both in one table means a new facet is added in one place
 * and cannot drift between the URL, the query and the chip list.
 */
export const FACET_KEYS = [
  { key: 'brand', field: 'p_brands', label: 'Brand' },
  { key: 'collection', field: 'p_collections', label: 'Collection' },
  { key: 'model', field: 'p_models', label: 'Model' },
  { key: 'condition', field: 'p_conditions', label: 'Condition' },
  { key: 'caseMaterial', field: 'p_case_materials', label: 'Case material' },
  { key: 'dialColor', field: 'p_dial_colors', label: 'Dial colour' },
  { key: 'movement', field: 'p_movements', label: 'Movement' },
  { key: 'bracelet', field: 'p_bracelets', label: 'Bracelet / strap' },
  { key: 'gender', field: 'p_genders', label: 'Gender' },
] as const;

export type FacetKey = (typeof FACET_KEYS)[number]['key'];
export type FacetField = (typeof FACET_KEYS)[number]['field'];

/**
 * The maximum number of values accepted per facet.
 *
 * A URL with more values than this is truncated rather than rejected: the page
 * renders the first N filters honestly instead of showing an error to a visitor
 * who pasted a long link. The bound matters because each value becomes a term
 * in the database query.
 */
const MAX_FACET_VALUES = 24;

/** Longest accepted search term. A longer one is truncated, not rejected. */
const MAX_QUERY_LENGTH = 120;

/**
 * The effective, validated state of a catalogue listing.
 *
 * `scope` and `scopeSlug` come from the route, not the query string: a brand
 * page is a brand page because of its path, and letting `?scope=` override it
 * would let one page serve two different listings under one canonical URL.
 */
export type CatalogueParams = {
  scope: 'all' | 'collection' | 'brand';
  scopeSlug: string | null;
  query: string;
  facets: Record<FacetKey, string[]>;
  priceMode: PriceMode;
  /** Price bounds in minor units (cents), matching the database column. */
  priceMin: number | null;
  priceMax: number | null;
  yearMin: number | null;
  yearMax: number | null;
  caseMin: number | null;
  caseMax: number | null;
  boxAndPapers: boolean | null;
  /** 'any' | 'available' | 'reserved'. */
  availability: AvailabilityMode;
  sort: SortValue;
  page: number;
  pageSize: number;
};

/** A raw, untrusted query-string map, as Next.js provides it. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Coerce one or many raw values into a trimmed, non-empty string list. */
function toStringList(value: string | string[] | undefined): string[] {
  const list = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return list.map((entry) => entry.trim()).filter((entry) => entry !== '');
}

/**
 * A facet value: a human-readable token.
 *
 * The pattern is anchored and negated, so a value cannot contain a control
 * character or a quote. A comma is excluded on purpose: facet lists are joined
 * with a comma in the URL, so a value containing one would split into two.
 */
const facetValueSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} .&/+()-]*$/u, 'unsupported characters');

/**
 * Parse a facet list.
 *
 * Values may arrive repeated (`?brand=rolex&brand=patek`) or comma-joined
 * (`?brand=rolex,patek`). Both are accepted so a hand-written URL and the
 * URL this module emits are interchangeable.
 */
function parseFacetList(raw: string | string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const part of toStringList(raw)) {
    for (const candidate of part.split(',')) {
      if (seen.size >= MAX_FACET_VALUES) return [...seen];
      const parsed = facetValueSchema.safeParse(candidate.trim());
      // An unparseable value is dropped rather than raising. Silently ignoring
      // one bad filter is better than failing a page the visitor was sent.
      if (parsed.success) seen.add(parsed.data);
    }
  }
  return [...seen];
}

/**
 * A bounded integer, or `null`.
 *
 * `min`/`max` clamp rather than reject, so an out-of-range value still produces
 * a usable page instead of an error.
 */
function parseBoundedInt(
  raw: string | string[] | undefined,
  min: number,
  max: number,
): number | null {
  const value = toStringList(raw)[0];
  if (value === undefined) return null;
  // Accept only a plain integer. `parseInt` would turn "12abc" into 12, which
  // would let a malformed value silently change a filter.
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(parsed, min), max);
}

/** Parse a boolean flag. Accepts only the two spellings this module emits. */
function parseBoolean(raw: string | string[] | undefined): boolean | null {
  const value = toStringList(raw)[0];
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

/** Parse the search term, collapsed and truncated. */
export function parseQuery(raw: string | string[] | undefined): string {
  const value = toStringList(raw)[0] ?? '';
  // Collapse whitespace so "  rolex   milgauss " and "rolex milgauss" are one
  // search, which keeps the canonical URL and the cache key stable.
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
}

/**
 * A page number, one-based because that is what a visitor expects in a URL.
 * The upper bound is not a limit on results; it stops a URL like
 * `?page=99999999999` from producing an absurd offset. A page past the end
 * renders the empty state.
 */
function parsePage(raw: string | string[] | undefined): number {
  const value = toStringList(raw)[0];
  if (value === undefined || !/^\d+$/.test(value)) return 1;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 10_000) : 1;
}

function parsePageSize(raw: string | string[] | undefined): number {
  const value = toStringList(raw)[0];
  const parsed = value === undefined ? Number.NaN : Number.parseInt(value, 10);
  return (PAGE_SIZES as readonly number[]).includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
}

function parseSort(raw: string | string[] | undefined): SortValue {
  const parsed = z.enum(SORT_VALUES).safeParse(toStringList(raw)[0]);
  return parsed.success ? parsed.data : 'featured';
}

function parseAvailability(raw: string | string[] | undefined): AvailabilityMode {
  const parsed = z.enum(AVAILABILITY_MODES).safeParse(toStringList(raw)[0]);
  return parsed.success ? parsed.data : 'any';
}

function parsePriceMode(raw: string | string[] | undefined): PriceMode {
  const parsed = z.enum(PRICE_MODES).safeParse(toStringList(raw)[0]);
  return parsed.success ? parsed.data : 'any';
}

/** Convert a whole-unit price from the URL into minor units. */
function toMinorUnits(value: number | null): number | null {
  return value === null ? null : value * 100;
}

/** Every facet key mapped to an empty list. */
function emptyFacets(): Record<FacetKey, string[]> {
  const facets = {} as Record<FacetKey, string[]>;
  for (const facet of FACET_KEYS) facets[facet.key] = [];
  return facets;
}

/**
 * Parse the query string into effective listing state.
 *
 * `scope` and `scopeSlug` are passed by the caller because they come from the
 * route. Everything else comes from `searchParams`.
 */
export function parseCatalogueParams(
  searchParams: RawSearchParams,
  scope: CatalogueParams['scope'] = 'all',
  scopeSlug: string | null = null,
): CatalogueParams {
  const facets = Object.fromEntries(
    FACET_KEYS.map((facet) => [facet.key, parseFacetList(searchParams[facet.key])]),
  ) as Record<FacetKey, string[]>;

  return {
    scope,
    scopeSlug,
    query: parseQuery(searchParams.q),
    facets,
    priceMode: parsePriceMode(searchParams.priceMode),
    // Prices are typed in whole units and stored in minor units, so the
    // conversion happens once, here.
    priceMin: toMinorUnits(parseBoundedInt(searchParams.priceMin, 0, 100_000_000)),
    priceMax: toMinorUnits(parseBoundedInt(searchParams.priceMax, 0, 100_000_000)),
    yearMin: parseBoundedInt(searchParams.yearMin, 1800, 2200),
    yearMax: parseBoundedInt(searchParams.yearMax, 1800, 2200),
    caseMin: parseBoundedInt(searchParams.caseMin, 1, 200),
    caseMax: parseBoundedInt(searchParams.caseMax, 1, 200),
    boxAndPapers: parseBoolean(searchParams.boxAndPapers),
    availability: parseAvailability(searchParams.availability),
    sort: parseSort(searchParams.sort),
    page: parsePage(searchParams.page),
    pageSize: parsePageSize(searchParams.pageSize),
  };
}

/** True when any filter or search term narrows the result set. */
export function hasActiveFilters(params: CatalogueParams): boolean {
  return (
    params.query !== '' ||
    Object.values(params.facets).some((values) => values.length > 0) ||
    params.priceMode !== 'any' ||
    params.priceMin !== null ||
    params.priceMax !== null ||
    params.yearMin !== null ||
    params.yearMax !== null ||
    params.caseMin !== null ||
    params.caseMax !== null ||
    params.boxAndPapers !== null ||
    params.availability !== 'any'
  );
}

/**
 * The number of active filter *groups*, shown as a badge on the mobile filter
 * button. A group counts once however many values it holds, because that is
 * what the visitor experiences.
 */
export function countActiveFilterGroups(params: CatalogueParams): number {
  let count = Object.values(params.facets).filter((values) => values.length > 0).length;
  if (params.priceMode !== 'any') count += 1;
  if (params.priceMin !== null || params.priceMax !== null) count += 1;
  if (params.yearMin !== null || params.yearMax !== null) count += 1;
  if (params.caseMin !== null || params.caseMax !== null) count += 1;
  if (params.boxAndPapers !== null) count += 1;
  if (params.availability !== 'any') count += 1;
  return count;
}

/**
 * The path a listing lives at, independent of its filters.
 *
 * Used for the canonical URL and for "clear all filters", so clearing returns
 * the visitor to the same listing rather than to the whole catalogue.
 *
 * `/collections/all` is deliberately absent: it permanently redirects to
 * `/shop`, so `/shop` is the one address for "everything".
 */
export function catalogueBasePath(params: Pick<CatalogueParams, 'scope' | 'scopeSlug'>): string {
  switch (params.scope) {
    case 'collection':
      return params.scopeSlug ? `/collections/${params.scopeSlug}` : '/collections';
    case 'brand':
      return params.scopeSlug ? `/brands/${params.scopeSlug}` : '/brands';
    default:
      return '/shop';
  }
}

/**
 * Render effective state back into a URL.
 *
 * Defaults are omitted, which is what makes the output canonical: there is
 * exactly one URL for "the featured page of the Rolex listing" whether the
 * visitor arrived with `?sort=featured`, `?page=1`, or nothing at all.
 *
 * `overrides` lets a caller change one dimension — a facet chip, a sort option,
 * a page link — without restating the rest. Passing `null` clears a bound;
 * passing an empty array clears a facet.
 */
export function buildCatalogueHref(
  params: CatalogueParams,
  overrides: {
    facets?: Partial<Record<FacetKey, string[]>>;
    sort?: SortValue;
    page?: number;
    pageSize?: number;
    query?: string;
    priceMode?: PriceMode;
    priceMin?: number | null;
    priceMax?: number | null;
    yearMin?: number | null;
    yearMax?: number | null;
    caseMin?: number | null;
    caseMax?: number | null;
    boxAndPapers?: boolean | null;
    availability?: AvailabilityMode;
  } = {},
): string {
  const facets = { ...params.facets, ...overrides.facets };
  const sort = overrides.sort ?? params.sort;
  const page = overrides.page ?? params.page;
  const pageSize = overrides.pageSize ?? params.pageSize;
  const query = overrides.query ?? params.query;
  const priceMode = overrides.priceMode ?? params.priceMode;
  const availability = overrides.availability ?? params.availability;
  // `??` cannot be used for the nullable bounds: `null` is a meaningful
  // override (clear the bound) and `??` would treat it as absent and keep the
  // previous value. The explicit undefined check distinguishes the two.
  const pick = <T>(value: T | null | undefined, fallback: T | null): T | null =>
    value === undefined ? fallback : value;
  const priceMin = pick(overrides.priceMin, params.priceMin);
  const priceMax = pick(overrides.priceMax, params.priceMax);
  const yearMin = pick(overrides.yearMin, params.yearMin);
  const yearMax = pick(overrides.yearMax, params.yearMax);
  const caseMin = pick(overrides.caseMin, params.caseMin);
  const caseMax = pick(overrides.caseMax, params.caseMax);
  const boxAndPapers = pick(overrides.boxAndPapers, params.boxAndPapers);

  const search = new URLSearchParams();

  if (query !== '') search.set('q', query);
  for (const facet of FACET_KEYS) {
    const values = facets[facet.key];
    if (values.length > 0) search.set(facet.key, values.join(','));
  }
  if (priceMode !== 'any') search.set('priceMode', priceMode);
  if (priceMin !== null) search.set('priceMin', String(Math.round(priceMin / 100)));
  if (priceMax !== null) search.set('priceMax', String(Math.round(priceMax / 100)));
  if (yearMin !== null) search.set('yearMin', String(yearMin));
  if (yearMax !== null) search.set('yearMax', String(yearMax));
  if (caseMin !== null) search.set('caseMin', String(caseMin));
  if (caseMax !== null) search.set('caseMax', String(caseMax));
  if (boxAndPapers !== null) search.set('boxAndPapers', String(boxAndPapers));
  if (availability !== 'any') search.set('availability', availability);
  if (sort !== 'featured') search.set('sort', sort);
  if (page > 1) search.set('page', String(page));
  if (pageSize !== DEFAULT_PAGE_SIZE) search.set('pageSize', String(pageSize));

  const queryString = search.toString();
  const path = catalogueBasePath(params);
  return queryString ? `${path}?${queryString}` : path;
}

/**
 * Whether this listing should be indexed.
 *
 * The strategy, applied consistently with the sitemap:
 *
 *   * A clean listing — the shop, a collection, a brand — is indexable. These
 *     have a stable identity and unique copy.
 *   * A listing with filters or a search term is not indexable. Filter
 *     permutations multiply combinatorially, and a crawler given
 *     `?brand=rolex&dialColor=Blue` will generate every combination. Its
 *     canonical points at the clean listing so equity consolidates there.
 *   * The search page itself is never indexable: it is a query, not a page.
 *   * Pagination is a genuine series of pages, so it is indexable and its
 *     canonical points at itself. Pointing page 2 at page 1 would hide the
 *     deeper products from crawlers entirely.
 *
 * Sort is not treated as a filter: `?sort=price_asc` is the same set of
 * products in a different order, so the page stays indexable and its canonical
 * drops the sort. That is narrower than the reference site, which relies on
 * `robots.txt` patterns alone and leaves filtered URLs crawlable.
 */
export function isIndexableListing(params: CatalogueParams): boolean {
  if (params.scope === 'all' && params.query !== '') return false;
  return !hasActiveFilters(params);
}

/**
 * The canonical path for a listing.
 *
 * For a clean listing this is the listing plus its page number, so deeper pages
 * stay crawlable. For a filtered or searched listing it is the bare clean
 * listing, which consolidates every permutation onto one address.
 */
export function canonicalListingPath(params: CatalogueParams): string {
  if (!isIndexableListing(params)) return catalogueBasePath(params);

  // Rebuild from scratch rather than from the live params, so no filter, sort
  // or page-size detail can leak into the canonical by accident. `sort` in
  // particular must be reset explicitly: it is not a filter, so the listing
  // stays indexable, but the canonical has to point at the default ordering or
  // `?sort=price_asc` becomes its own canonical address and competes with the
  // clean listing for the same products.
  return buildCatalogueHref(
    {
      ...params,
      facets: emptyFacets(),
      query: '',
      sort: 'featured',
      pageSize: DEFAULT_PAGE_SIZE,
      priceMode: 'any',
      priceMin: null,
      priceMax: null,
      yearMin: null,
      yearMax: null,
      caseMin: null,
      caseMax: null,
      boxAndPapers: null,
      availability: 'any',
    },
    { page: params.page },
  );
}

/**
 * The current state as form fields, for the range filters.
 *
 * Those filters are plain `GET` forms so they submit without JavaScript. A form
 * submission replaces the whole query string, so every parameter the form does
 * not itself carry has to be repeated as a hidden input or it would be dropped
 * — checking a brand and then submitting a price range would silently lose the
 * brand. `exclude` names the fields the form supplies itself, so they are not
 * duplicated.
 */
export function catalogueHiddenInputs(
  params: CatalogueParams,
  exclude: readonly string[] = [],
): { name: string; value: string }[] {
  const href = buildCatalogueHref(params);
  const [, queryString = ''] = href.split('?');
  const excluded = new Set(exclude);

  return [...new URLSearchParams(queryString).entries()]
    .filter(([name]) => !excluded.has(name))
    .map(([name, value]) => ({ name, value }));
}
