/**
 * Turn product detail rows into view models.
 *
 * Pure: no Supabase client, no environment, no I/O. Image URL resolution is
 * injected as a function, exactly as `lib/catalogue/assemble.ts` does, because
 * `resolveImageUrl` reads the environment. That keeps this module testable
 * against fixtures, including the states a seeded database reaches only by
 * accident — a product with no images, a price-on-request piece, a product with
 * no specs, a reserved watch.
 *
 * -----------------------------------------------------------------------------
 * THE SPECIFICATION TABLE
 * -----------------------------------------------------------------------------
 *
 * `product_specs` holds the long tail of attributes (calibre, jewels, clasp,
 * dial details) as label/value pairs, while the columns the catalogue filters on
 * (case size, movement, dial colour) are first-class. A product page needs both,
 * in one table, without the same fact appearing twice.
 *
 * The merge therefore starts from the columns, then appends `product_specs`
 * rows whose label is not already covered. The comparison is normalised — case,
 * punctuation and a trailing colon are ignored — so "Reference Number" in
 * `product_specs` does not duplicate the `reference_number` column, which is
 * exactly the duplication the seed data would otherwise produce.
 */

import { formatPrice } from '@/lib/homepage/assemble';
import { CONDITION_LABELS, type ConditionValue } from '@/lib/catalogue/params';
import type { ProductDetail, ProductImage, SpecRow } from './types';

/**
 * A `products` row as the detail page reads it.
 *
 * The column list is the public read surface established by migration 0011:
 * `cost_cents` and `compare_at_cents` are absent, and the column grant means a
 * query that asked for them would be rejected rather than silently returning
 * nulls.
 */
export type ProductRow = {
  id: string;
  sku: string;
  slug: string;
  title: string;
  short_description: string | null;
  description: string | null;
  price_cents: number | string | null;
  currency: string;
  price_on_request: boolean;
  condition: string | null;
  production_year: number | null;
  reference_number: string | null;
  case_size_mm: number | string | null;
  case_material: string | null;
  movement: string | null;
  dial_color: string | null;
  bracelet_material: string | null;
  bezel: string | null;
  water_resistance_m: number | null;
  gender: string | null;
  box_and_papers: boolean | null;
  seo_title: string | null;
  seo_description: string | null;
  og_image_url: string | null;
  published_at: string | null;
  updated_at: string;
  brand_name: string | null;
  brand_slug: string | null;
  model_name: string | null;
  model_slug: string | null;
};

/** A `product_images` row, ordered by the caller. */
export type ProductImageRow = {
  id: string;
  storage_path: string | null;
  external_url: string | null;
  alt_text: string;
  width: number | null;
  height: number | null;
  is_primary: boolean;
  sort_order: number;
};

/** A `product_specs` row. */
export type ProductSpecRow = {
  label: string;
  value: string;
  sort_order: number;
};

/** A collection the product belongs to. */
export type ProductCollectionRow = {
  title: string;
  slug: string;
};

export type AssembleProductInput = {
  row: ProductRow;
  images: ProductImageRow[];
  specs: ProductSpecRow[];
  collections: ProductCollectionRow[];
  /** From `is_product_available`. `false` renders the reserved state. */
  available: boolean;
  /** Injected because it reads the environment. */
  resolveImage: (storagePath: string | null, externalUrl: string | null) => string | null;
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
function toCondition(value: string | null): ConditionValue | null {
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

/** Render water resistance as a readable depth. */
function formatWaterResistance(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `${value} m`;
}

/**
 * Normalise a spec label for duplicate detection.
 *
 * Lower-cased, punctuation stripped, and a trailing "number"/"no" removed, so
 * "Reference Number", "Reference" and "reference:" all collapse to one key and
 * cannot duplicate the `reference_number` column.
 */
function normaliseLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+(number|no)$/, '')
    .trim();
}

/**
 * The specification table: first-class columns first, then the long tail.
 *
 * A row with no value is omitted entirely rather than rendered with a dash. A
 * dash reads as "we checked and it is unknown"; omitting the row says only that
 * the catalogue does not record it, which is the truth.
 */
function buildSpecs(row: ProductRow, specs: ProductSpecRow[]): SpecRow[] {
  const condition = toCondition(row.condition);
  const caseSize = formatCaseSize(row.case_size_mm);
  const waterResistance = formatWaterResistance(row.water_resistance_m);

  const fromColumns: (SpecRow | null)[] = [
    row.reference_number ? { label: 'Reference', value: row.reference_number } : null,
    row.production_year ? { label: 'Year', value: String(row.production_year) } : null,
    condition ? { label: 'Condition', value: CONDITION_LABELS[condition] } : null,
    caseSize ? { label: 'Case size', value: caseSize } : null,
    row.case_material ? { label: 'Case material', value: row.case_material } : null,
    row.bezel ? { label: 'Bezel', value: row.bezel } : null,
    row.movement ? { label: 'Movement', value: row.movement } : null,
    row.dial_color ? { label: 'Dial', value: row.dial_color } : null,
    row.bracelet_material ? { label: 'Bracelet / strap', value: row.bracelet_material } : null,
    waterResistance ? { label: 'Water resistance', value: waterResistance } : null,
    row.gender ? { label: 'Gender', value: row.gender } : null,
    // Box and papers is a buyer's key question, so it is stated explicitly in
    // both directions. `null` means the catalogue does not record it.
    row.box_and_papers === null
      ? null
      : { label: 'Box & papers', value: row.box_and_papers ? 'Yes' : 'No' },
  ];

  const seen = new Set<string>();
  const merged: SpecRow[] = [];

  for (const spec of fromColumns) {
    if (!spec) continue;
    const key = normaliseLabel(spec.label);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(spec);
  }

  // The long tail, in the editor's order, skipping any label already covered by
  // a column above.
  for (const spec of [...specs].sort((a, b) => a.sort_order - b.sort_order)) {
    const label = spec.label?.trim();
    const value = spec.value?.trim();
    if (!label || !value) continue;
    const key = normaliseLabel(label);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ label, value });
  }

  return merged;
}

/**
 * The gallery images.
 *
 * Primary first, then the editor's `sort_order`, then id — the same ordering the
 * catalogue's primary-image lateral uses, so the image on the card is the first
 * image in the gallery. `alt_text` is `not null` in the schema, but a row is
 * only as good as what came back, so the product title is the fallback: an empty
 * alt tells a screen-reader user nothing about the image.
 */
function buildImages(
  row: ProductRow,
  images: ProductImageRow[],
  resolveImage: AssembleProductInput['resolveImage'],
): ProductImage[] {
  return [...images]
    .sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((image) => ({
      id: image.id,
      url: resolveImage(image.storage_path, image.external_url),
      alt: image.alt_text?.trim() || row.title,
      width: toNumber(image.width),
      height: toNumber(image.height),
    }));
}

/**
 * Map one row set to a `ProductDetail`.
 *
 * The price and availability decisions are the load-bearing ones:
 *
 *  - `formatPrice` returns `null` for a price-on-request product, and
 *    `priceMinor` is set only when a genuine price exists, so the JSON-LD offer
 *    and the visible price come from one decision and cannot disagree.
 *  - `available` is a boolean from `is_product_available`. It is not inferred
 *    from a null, because a null there means "not published" rather than
 *    "reserved".
 */
export function toProductDetail(input: AssembleProductInput): ProductDetail {
  const { row, available } = input;
  const condition = toCondition(row.condition);
  const priceCents = toNumber(row.price_cents);
  const priceOnRequest = row.price_on_request === true;
  const formatted = formatPrice(priceCents, row.currency ?? 'USD', priceOnRequest);

  return {
    id: row.id,
    slug: row.slug,
    href: `/products/${row.slug}`,
    title: row.title,
    sku: row.sku,
    brandName: row.brand_name,
    brandSlug: row.brand_slug,
    modelName: row.model_name,
    modelSlug: row.model_slug,
    reference: row.reference_number,
    year: row.production_year,
    condition,
    conditionLabel: condition ? CONDITION_LABELS[condition] : null,
    caseSize: formatCaseSize(row.case_size_mm),
    caseMaterial: row.case_material,
    movement: row.movement,
    dialColor: row.dial_color,
    bracelet: row.bracelet_material,
    bezel: row.bezel,
    waterResistance: formatWaterResistance(row.water_resistance_m),
    gender: row.gender,
    boxAndPapers: row.box_and_papers,
    description: row.description?.trim() || null,
    shortDescription: row.short_description?.trim() || null,
    price: formatted,
    // The minor-unit value exists only when a real price does. This is what
    // keeps the JSON-LD from emitting an offer for a price-on-request piece.
    priceMinor: formatted === null ? null : priceCents,
    currency: row.currency ?? 'USD',
    priceOnRequest,
    availability: available ? 'available' : 'reserved',
    specs: buildSpecs(row, input.specs),
    images: buildImages(row, input.images, input.resolveImage),
    seoTitle: row.seo_title?.trim() || null,
    seoDescription: row.seo_description?.trim() || null,
    ogImageUrl: row.og_image_url?.trim() || null,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    collections: input.collections.filter((collection) => Boolean(collection.slug)),
  };
}

/**
 * The breadcrumb trail for a product page.
 *
 * Built from the real brand and model rather than a fixed list, so a product
 * without a brand gets a shorter trail instead of a link to a page that does not
 * exist. The final entry is the product itself, and `breadcrumbSchema` omits the
 * `item` on the last entry per the documented convention.
 */
export function productBreadcrumbs(product: ProductDetail): { name: string; path: string }[] {
  const trail: { name: string; path: string }[] = [
    { name: 'Home', path: '/' },
    { name: 'The Collection', path: '/shop' },
  ];

  if (product.brandName && product.brandSlug) {
    trail.push({ name: product.brandName, path: `/brands/${product.brandSlug}` });
  }

  trail.push({ name: product.title, path: product.href });
  return trail;
}
