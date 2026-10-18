import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CatalogueSearchRow } from '@/lib/catalogue/assemble';
import type {
  ProductCollectionRow,
  ProductImageRow,
  ProductRow,
  ProductSpecRow,
} from '@/lib/product/assemble';

/**
 * Read-only product detail queries.
 *
 * The request-scoped client is used, not the service-role client. RLS restricts
 * `products` to published rows, so an unpublished slug returns no row and the
 * route 404s without the application having to filter. Migration 0011 also
 * revokes the column grants on `cost_cents` and `compare_at_cents`, so the
 * column list below is the *only* readable set — a query naming a cost column
 * is rejected by the database rather than silently returning nulls.
 *
 * -----------------------------------------------------------------------------
 * WHY THE COLUMN LIST IS WRITTEN OUT RATHER THAN `select('*')`
 * -----------------------------------------------------------------------------
 *
 * `select('*')` on `products` is now a permission error for these roles, and
 * that is intentional: it means a future sensitive column cannot leak through a
 * careless query. Writing the list out is what makes that guarantee useful — the
 * query states exactly which fields the page consumes.
 */

/**
 * The public product columns.
 *
 * Kept as one constant so the detail query and the related-products query cannot
 * drift into reading different fields.
 */
const PRODUCT_COLUMNS = [
  'id',
  'sku',
  'slug',
  'title',
  'short_description',
  'description',
  'price_cents',
  'currency',
  'price_on_request',
  'condition',
  'production_year',
  'reference_number',
  'case_size_mm',
  'case_material',
  'movement',
  'dial_color',
  'bracelet_material',
  'bezel',
  'water_resistance_m',
  'gender',
  'box_and_papers',
  'seo_title',
  'seo_description',
  'og_image_url',
  'published_at',
  'updated_at',
  'brands ( name, slug )',
  'models ( name, slug )',
].join(', ');

/** One raw row from `PRODUCT_COLUMNS`, before the join is flattened. */
type RawProductRow = Omit<ProductRow, 'brand_name' | 'brand_slug' | 'model_name' | 'model_slug'> & {
  brands: { name: string; slug: string } | null;
  models: { name: string; slug: string } | null;
};

/** Flatten the embedded brand and model onto the row. */
function flattenProductRow(raw: RawProductRow): ProductRow {
  const { brands, models, ...rest } = raw;
  return {
    ...rest,
    brand_name: brands?.name ?? null,
    brand_slug: brands?.slug ?? null,
    model_name: models?.name ?? null,
    model_slug: models?.slug ?? null,
  };
}

/**
 * A published product by slug, or `null`.
 *
 * A draft or archived slug returns no row because RLS filters it, which is the
 * same behaviour as an unknown slug. That is deliberate: the route must not be
 * able to tell a visitor that a draft exists.
 */
export async function fetchPublishedProductBySlug(slug: string): Promise<ProductRow | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return flattenProductRow(data as unknown as RawProductRow);
}

/** A product's images, in gallery order. */
export async function fetchProductImages(productId: string): Promise<ProductImageRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('product_images')
    .select('id, storage_path, external_url, alt_text, width, height, is_primary, sort_order')
    .eq('product_id', productId)
    .order('is_primary', { ascending: false })
    .order('sort_order')
    .order('id');

  if (error) throw error;
  return (data ?? []) as ProductImageRow[];
}

/** A product's specification rows. */
export async function fetchProductSpecs(productId: string): Promise<ProductSpecRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('product_specs')
    .select('label, value, sort_order')
    .eq('product_id', productId)
    .order('sort_order');

  if (error) throw error;
  return (data ?? []) as ProductSpecRow[];
}

/** The active collections a product belongs to, for internal links. */
export async function fetchProductCollections(productId: string): Promise<ProductCollectionRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('collection_products')
    .select('collections ( title, slug )')
    .eq('product_id', productId);

  if (error) throw error;

  return (data ?? [])
    .map((link) => link.collections as unknown as ProductCollectionRow | null)
    .filter((collection): collection is ProductCollectionRow => collection !== null);
}

/**
 * Whether a product is available.
 *
 * The set-valued function is used even for one product so the availability rule
 * lives in exactly one place. A product with no inventory row returns no row,
 * which is read as reserved rather than unknown — the schema creates the row
 * when stock is received, so its absence means no stock has been recorded.
 */
export async function fetchProductAvailability(productId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('product_availability', {
    p_product_ids: [productId],
  });

  if (error) throw error;
  return data?.[0]?.is_available === true;
}

/**
 * Related published products for a product, ranked by the database.
 *
 * The rows are shaped exactly like `catalogue_search` rows — `catalogue_similar`
 * returns the same columns, plus `match_reason` — so the service can map them
 * with the same `toCatalogueProduct` used by the grid. That is deliberate: a
 * related card and a grid card must not be able to describe the same watch
 * differently, and reusing one mapping is what guarantees it.
 *
 * `total_count` is not returned by `catalogue_similar`; it is filled with the
 * row count here so the shared row type is satisfied. Nothing reads it for a
 * related rail.
 */
export async function fetchSimilarProducts(
  productId: string,
  limit = 8,
): Promise<CatalogueSearchRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('catalogue_similar', {
    p_product_id: productId,
    p_limit: limit,
  });

  if (error) throw error;

  const rows = (data ?? []) as unknown as (Omit<CatalogueSearchRow, 'total_count'> & {
    match_reason: string | null;
  })[];

  return rows.map((row) => ({ ...row, total_count: rows.length }));
}

/**
 * Submit a product enquiry.
 *
 * Delegates to the `submit_product_question` database function, which validates,
 * refuses an unpublished product and enforces the rate limit. The function is
 * the boundary that holds; the action's own validation exists to give the
 * visitor a useful message before the round trip.
 *
 * The reference is returned so the visitor can quote it in a reply.
 */
export async function submitProductQuestion(input: {
  productSlug: string;
  name: string;
  email: string;
  message: string;
  phone?: string | null;
}): Promise<string> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('submit_product_question', {
    p_product_slug: input.productSlug,
    p_name: input.name,
    p_email: input.email,
    p_message: input.message,
    // `undefined` rather than `null`: the generated RPC types mark an optional
    // argument as `string | undefined`, and omitting it lets the SQL default apply.
    p_phone: input.phone ?? undefined,
  });

  if (error) throw error;
  return String(data);
}
