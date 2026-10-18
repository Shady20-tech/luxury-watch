import type { CatalogueProduct } from '@/lib/catalogue/types';

/**
 * Product detail view models.
 *
 * As with the catalogue and the homepage, these types are the contract between
 * the database and the components rather than the row types from
 * `database.types.ts`. A component must be renderable from a fixture in a test
 * without a database, and it must not know about `cost_cents`, `sort_order` or
 * `is_featured`.
 *
 * `src/lib/product/assemble.ts` is the only place that turns rows into these
 * shapes.
 */

/** One gallery image, with the metadata a layout needs to reserve its space. */
export type ProductImage = {
  id: string;
  /** Resolved URL, or `null` when neither source could be resolved. */
  url: string | null;
  /** Never empty: the schema requires alt text, and the assembly falls back to the title. */
  alt: string;
  /** Intrinsic dimensions when the row records them, so the layout can reserve space. */
  width: number | null;
  height: number | null;
};

/** One row of the specification table. */
export type SpecRow = {
  label: string;
  value: string;
};

/**
 * A product as its detail page renders it.
 *
 * The two honesty-critical fields are `price` and `availability`:
 *
 *  - `price` is `null` when the piece is priced on request, which is the norm
 *    for this catalogue. The page then renders "Request pricing & availability"
 *    and the JSON-LD emits no `offers` node at all.
 *  - `availability` distinguishes "available" from "reserved". It is never
 *    guessed from a missing value.
 */
export type ProductDetail = {
  id: string;
  slug: string;
  href: string;
  title: string;
  sku: string;
  brandName: string | null;
  brandSlug: string | null;
  modelName: string | null;
  modelSlug: string | null;
  reference: string | null;
  year: number | null;
  condition: 'new' | 'unworn' | 'pre_owned' | 'vintage' | null;
  conditionLabel: string | null;
  caseSize: string | null;
  caseMaterial: string | null;
  movement: string | null;
  dialColor: string | null;
  bracelet: string | null;
  bezel: string | null;
  waterResistance: string | null;
  gender: string | null;
  boxAndPapers: boolean | null;
  /** Long description from the database, or `null`. Never invented prose. */
  description: string | null;
  shortDescription: string | null;
  /** Formatted price, or `null` when priced on request. */
  price: string | null;
  /** Minor units and currency, for the JSON-LD offer. `null` when priced on request. */
  priceMinor: number | null;
  currency: string;
  priceOnRequest: boolean;
  availability: 'available' | 'reserved';
  /** The specification table, merged from the columns and `product_specs`. */
  specs: SpecRow[];
  images: ProductImage[];
  /** Admin-editable SEO fields, already resolved for display. */
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  /** Real publication and update timestamps, for `<lastmod>` and `dateModified`. */
  publishedAt: string | null;
  updatedAt: string;
  /** Collections this product belongs to, for internal links. */
  collections: { title: string; slug: string }[];
};

/** The three states a product page can be in. */
export type ProductDetailResult =
  | { status: 'ok'; product: ProductDetail; related: CatalogueProduct[] }
  /** No such slug, or the slug exists but is not published. Both are a 404. */
  | { status: 'not_found' }
  /**
   * Supabase is unconfigured or unreachable. Distinct from `not_found`: the page
   * must not tell a visitor a watch does not exist when the real problem is that
   * the database could not be reached.
   */
  | { status: 'unavailable' };
