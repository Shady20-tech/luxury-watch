/**
 * Catalogue view models.
 *
 * As with the homepage, these types are the contract between the database and
 * the components, not the row types from `database.types.ts`. A component must
 * be renderable from a fixture in a test without a database, and it must not
 * know about `sort_order`, `cost_cents` or `is_featured`.
 *
 * `src/lib/catalogue/assemble.ts` is the only place that turns rows into these
 * shapes.
 */

import type { CatalogueParams, FacetKey, SortValue } from './params';

/**
 * A product as a catalogue card renders it.
 *
 * Two fields exist here that the homepage card does not carry — `reference`,
 * `year`, `boxAndPapers` — because a catalogue card is the place a visitor
 * compares pieces, and those are the attributes they compare.
 *
 * `price` is `null` when the piece is priced on request, which is the norm for
 * this catalogue. The card must render "Request pricing & availability" in that
 * case rather than a number.
 */
export type CatalogueProduct = {
  id: string;
  slug: string;
  href: string;
  title: string;
  brandName: string | null;
  brandSlug: string | null;
  modelName: string | null;
  modelSlug: string | null;
  /** Short factual description, or a composed spec line when none is set. */
  summary: string | null;
  imageUrl: string | null;
  imageAlt: string;
  /** Formatted price, or `null` when priced on request. */
  price: string | null;
  condition: 'new' | 'unworn' | 'pre_owned' | 'vintage' | null;
  reference: string | null;
  year: number | null;
  caseSize: string | null;
  caseMaterial: string | null;
  movement: string | null;
  dialColor: string | null;
  /** `null` when the catalogue does not record it, `true`/`false` otherwise. */
  boxAndPapers: boolean | null;
  /** From the availability function. `false` renders a "Reserved" badge. */
  available: boolean;
  /** True when published recently enough to carry a "New" badge. */
  isNew: boolean;
};

/** One selectable value in a facet, with the count it would yield. */
export type FacetOption = {
  value: string;
  label: string;
  count: number;
};

/** The real bounds of the filtered set, so a control is never invented. */
export type FacetRange = {
  min: number | null;
  max: number | null;
};

export type FacetSet = {
  /** Every dimension keyed by its URL name. */
  values: Record<FacetKey, FacetOption[]>;
  availability: FacetOption[];
  boxAndPapers: FacetOption[];
  priceRange: FacetRange & { pricedCount: number };
  yearRange: FacetRange;
  caseSizeRange: FacetRange;
  /** Total products matching the filters, before pagination. */
  total: number;
};

/** A page of catalogue results plus everything needed to render the chrome. */
export type CatalogueListing = {
  products: CatalogueProduct[];
  facets: FacetSet;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** True when there is a next or previous page to link to. */
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  /** The validated state that produced this listing. */
  params: CatalogueParams;
  /**
   * True when the listing came from the database. False means Supabase is
   * unconfigured or unreachable, which the page states plainly rather than
   * presenting an empty catalogue as "no results".
   */
  source: 'database' | 'unavailable';
};

/** The sort options a listing offers, in display order. */
export type CatalogueSort = { value: SortValue; label: string };

/**
 * An empty facet set.
 *
 * Used when the database is unavailable. Every dimension is empty rather than
 * pre-populated with plausible-looking options, because a filter list is a
 * claim about what the catalogue contains.
 */
export function emptyFacets(): FacetSet {
  const values: Record<FacetKey, FacetOption[]> = {
    brand: [],
    collection: [],
    model: [],
    condition: [],
    caseMaterial: [],
    dialColor: [],
    movement: [],
    bracelet: [],
    gender: [],
  };

  return {
    values,
    availability: [],
    boxAndPapers: [],
    priceRange: { min: null, max: null, pricedCount: 0 },
    yearRange: { min: null, max: null },
    caseSizeRange: { min: null, max: null },
    total: 0,
  };
}

/**
 * An empty listing.
 *
 * The `source` is `unavailable`, not `database`: a database that answered with
 * nothing and a database that never answered are different situations, and only
 * one of them means "no products match".
 */
export function emptyListing(params: CatalogueParams): CatalogueListing {
  return {
    products: [],
    facets: emptyFacets(),
    total: 0,
    page: params.page,
    pageSize: params.pageSize,
    pageCount: 0,
    hasNextPage: false,
    hasPreviousPage: false,
    params,
    source: 'unavailable',
  };
}
