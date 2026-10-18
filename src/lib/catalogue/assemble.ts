/**
 * Turn raw database rows into catalogue view models.
 *
 * Everything here is pure: no Supabase client, no environment, no I/O. That is
 * what lets the whole mapping be tested against fixtures, including the cases
 * that are hard to reach in a seeded database — a product with no image, a
 * price-on-request piece, an unparseable availability row.
 *
 * The image URL is the one exception, and it is injected as a function rather
 * than imported, because `resolveImageUrl` reads the environment. Injecting it
 * keeps this module testable while leaving the production path unchanged.
 */

import {
  composeSummary,
  formatPrice,
  isNewArrival,
  type ProductRow,
} from '@/lib/homepage/assemble';
import type { CatalogueProduct, FacetOption, FacetRange, FacetSet } from '@/lib/catalogue/types';
import { emptyFacets } from '@/lib/catalogue/types';
import { FACET_KEYS, type FacetKey } from '@/lib/catalogue/params';

/**
 * A row from `catalogue_search`.
 *
 * The columns are exactly those the function returns. It deliberately omits
 * `cost_cents`, `compare_at_cents` and `sort_order`, so a component could not
 * accidentally display a margin even if it wanted to.
 */
export type CatalogueSearchRow = {
  id: string;
  slug: string;
  title: string;
  brand_name: string | null;
  brand_slug: string | null;
  model_name: string | null;
  model_slug: string | null;
  reference_number: string | null;
  production_year: number | null;
  condition: string | null;
  case_size_mm: number | string | null;
  case_material: string | null;
  movement: string | null;
  dial_color: string | null;
  bracelet_material: string | null;
  gender: string | null;
  box_and_papers: boolean | null;
  price_cents: number | string | null;
  currency: string | null;
  price_on_request: boolean | null;
  published_at: string | null;
  is_featured: boolean | null;
  image_storage_path: string | null;
  image_external_url: string | null;
  image_alt: string | null;
  is_available: boolean | null;
  total_count: number | string | null;
};

/** A single row from the `catalogue_facets` jsonb document. */
type RawFacetOption = { value?: unknown; label?: unknown; count?: unknown };

/** The raw jsonb payload `catalogue_facets` returns. */
export type CatalogueFacetsPayload = {
  total?: unknown;
  brand?: unknown;
  collection?: unknown;
  model?: unknown;
  condition?: unknown;
  caseMaterial?: unknown;
  dialColor?: unknown;
  movement?: unknown;
  bracelet?: unknown;
  gender?: unknown;
  boxAndPapers?: unknown;
  availability?: unknown;
  priceRange?: unknown;
  yearRange?: unknown;
  caseSizeRange?: unknown;
};

/** Postgres `numeric` and `bigint` arrive as strings through PostgREST. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** The condition enum, narrowed from the free-text column. */
function toCondition(value: string | null): CatalogueProduct['condition'] {
  switch (value) {
    case 'new':
    case 'unworn':
    case 'pre_owned':
    case 'vintage':
      return value;
    default:
      return null;
  }
}

/** Render a case size without a trailing ".00". */
function formatCaseSize(value: number | string | null): string | null {
  const parsed = toNumber(value);
  return parsed === null ? null : `${parsed} mm`;
}

/**
 * Build the summary line for a catalogue card.
 *
 * `short_description` wins when set. Otherwise the line is composed from the
 * attributes the catalogue genuinely holds. `composeSummary` is shared with the
 * homepage card rather than reimplemented, so the two cannot drift into
 * describing the same product differently.
 */
function catalogueSummary(row: Omit<CatalogueSearchRow, 'total_count'>): string | null {
  return composeSummary({
    id: row.id,
    slug: row.slug,
    title: row.title,
    short_description: null,
    price_cents: null,
    currency: row.currency ?? 'USD',
    price_on_request: true,
    condition: toCondition(row.condition),
    reference_number: row.reference_number,
    production_year: row.production_year,
    case_size_mm: toNumber(row.case_size_mm),
    movement: row.movement,
    dial_color: row.dial_color,
    published_at: row.published_at,
    brand_name: row.brand_name,
    image_url: null,
    image_alt: null,
    available: null,
  } satisfies ProductRow);
}

/**
 * Map one search row to a card.
 *
 * `resolveImage` is injected because resolving a storage path needs the
 * environment; the default is supplied by the repository.
 */
export function toCatalogueProduct(
  row: Omit<CatalogueSearchRow, 'total_count'>,
  now: string,
  resolveImage: (storagePath: string | null, externalUrl: string | null) => string | null,
): CatalogueProduct {
  const priceCents = toNumber(row.price_cents);

  return {
    id: row.id,
    slug: row.slug,
    href: `/products/${row.slug}`,
    title: row.title,
    brandName: row.brand_name,
    brandSlug: row.brand_slug,
    modelName: row.model_name,
    modelSlug: row.model_slug,
    summary: catalogueSummary(row),
    imageUrl: resolveImage(row.image_storage_path, row.image_external_url),
    // `alt_text` is `not null` in the schema, but a row is only as good as what
    // came back, so the product name is the fallback rather than an empty
    // attribute — an empty alt tells a screen-reader user nothing.
    imageAlt: row.image_alt?.trim() || row.title,
    price: formatPrice(priceCents, row.currency ?? 'USD', row.price_on_request === true),
    condition: toCondition(row.condition),
    reference: row.reference_number,
    year: row.production_year,
    caseSize: formatCaseSize(row.case_size_mm),
    caseMaterial: row.case_material,
    movement: row.movement,
    dialColor: row.dial_color,
    boxAndPapers: row.box_and_papers,
    // A `null` means the availability function returned no row, which only
    // happens for a product that is not published. Treating that as unavailable
    // is the safe direction.
    available: row.is_available === true,
    isNew: isNewArrival(row.published_at, now),
  };
}

/** Map a page of search rows. */
export function toCatalogueProducts(
  rows: Omit<CatalogueSearchRow, 'total_count'>[],
  now: string,
  resolveImage: (storagePath: string | null, externalUrl: string | null) => string | null,
): CatalogueProduct[] {
  return rows.map((row) => toCatalogueProduct(row, now, resolveImage));
}

/** The total match count reported by the first row of a search page. */
export function totalFromRows(rows: CatalogueSearchRow[]): number {
  const first = rows[0];
  if (!first) return 0;
  return toNumber(first.total_count) ?? 0;
}

/** Parse one facet option array out of the jsonb payload. */
function toOptions(raw: unknown): FacetOption[] {
  if (!Array.isArray(raw)) return [];

  const options: FacetOption[] = [];
  for (const entry of raw as RawFacetOption[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const value = entry.value;
    const label = entry.label;
    const count = toNumber(entry.count);
    // A facet with no value or no count is unusable. Dropping it is safer than
    // rendering a checkbox that filters on nothing.
    if (typeof value !== 'string' || value === '' || count === null) continue;
    options.push({
      value,
      // The label is what the visitor reads; the value is what the query uses.
      // They differ for conditions ("pre_owned" → "Pre-owned").
      label: typeof label === 'string' && label !== '' ? label : value,
      count,
    });
  }
  return options;
}

function toRange(raw: unknown): FacetRange {
  if (typeof raw !== 'object' || raw === null) return { min: null, max: null };
  const record = raw as Record<string, unknown>;
  return { min: toNumber(record.min), max: toNumber(record.max) };
}

/**
 * Map the `catalogue_facets` payload to a `FacetSet`.
 *
 * Every dimension is read through `toOptions`, so a malformed or missing
 * dimension yields an empty list rather than throwing. A filter sidebar that
 * cannot load one dimension should still render the others.
 */
export function toFacetSet(payload: CatalogueFacetsPayload | null): FacetSet {
  if (!payload || typeof payload !== 'object') {
    return emptyFacets();
  }

  const values = Object.fromEntries(
    FACET_KEYS.map((facet) => [facet.key, toOptions(payload[facet.key])]),
  ) as Record<FacetKey, FacetOption[]>;

  const priceRange = payload.priceRange as Record<string, unknown> | undefined;

  return {
    values,
    availability: toOptions(payload.availability),
    boxAndPapers: toOptions(payload.boxAndPapers),
    priceRange: {
      ...toRange(payload.priceRange),
      pricedCount: toNumber(priceRange?.pricedCount) ?? 0,
    },
    yearRange: toRange(payload.yearRange),
    caseSizeRange: toRange(payload.caseSizeRange),
    total: toNumber(payload.total) ?? 0,
  };
}

/** Total pages for a result count and page size. Always at least one. */
export function pageCount(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * The page window for pagination controls.
 *
 * A long result set must not render a hundred page links. This returns a small
 * window around the current page plus the first and last, which is what the
 * ellipsis in the UI stands for.
 */
export function paginationWindow(current: number, total: number, span = 2): (number | 'gap')[] {
  if (total <= 1) return [1];

  const pages = new Set<number>([1, total]);
  for (let page = current - span; page <= current + span; page += 1) {
    if (page >= 1 && page <= total) pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | 'gap')[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) result.push('gap');
    result.push(page);
    previous = page;
  }
  return result;
}
