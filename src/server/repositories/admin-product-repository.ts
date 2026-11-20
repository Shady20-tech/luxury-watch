import 'server-only';

import { logger } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Administrative reads and writes for the product catalogue.
 *
 * -----------------------------------------------------------------------------
 * WRITES GO THROUGH THE DATABASE FUNCTIONS, NOT DIRECT UPDATES
 * -----------------------------------------------------------------------------
 *
 * Status changes go through `admin_set_product_status`, not an `update` on the
 * table. Three reasons:
 *
 *   1. The function enforces `catalog.write` *inside the database*, using
 *      `auth.uid()`. A direct update through the service-role client would carry
 *      no identity at all, so the permission check would have to be reimplemented
 *      here and could be forgotten at a call site.
 *   2. It stamps `published_at` on first publication. The
 *      `products_published_requires_timestamp` check makes a bare
 *      `status = 'published'` update fail, so a direct update is not even
 *      possible — the function is the supported path.
 *   3. It writes the audit row in the same transaction. An audit written by the
 *      caller could be skipped, and an audit written separately could succeed
 *      while the change failed.
 *
 * Field edits are a plain update because they are not status transitions and the
 * database has no function for them. They are still audited — `writeAudit` is
 * called by the action, and the action is the only caller.
 *
 * -----------------------------------------------------------------------------
 * WHY THE SERVICE-ROLE CLIENT
 * -----------------------------------------------------------------------------
 *
 * `products.cost_cents` is withheld from `authenticated` by a column grant
 * (0011). The editor must show it, so these reads use the service-role client.
 * Every caller has already passed `requirePermission`; see
 * `admin-authorization.ts` for why that is what makes this safe.
 */

export type ProductStatus = 'draft' | 'published' | 'archived';

export type AdminProductListRow = {
  id: string;
  slug: string;
  title: string;
  referenceNumber: string | null;
  brandName: string | null;
  status: ProductStatus;
  priceCents: number | null;
  priceOnRequest: boolean;
  currency: string;
  isFeatured: boolean;
  publishedAt: string | null;
  updatedAt: string;
  quantity: number | null;
  lowStockThreshold: number | null;
};

export type AdminProductListFilters = {
  status?: ProductStatus | 'all';
  query?: string;
  brandId?: string;
  /** Only products at or below their own low-stock threshold. */
  lowStockOnly?: boolean;
  page: number;
  pageSize: number;
};

/** A page of products plus the total matching the filters. */
export type AdminProductListResult = {
  rows: AdminProductListRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/**
 * PostgREST treats `%` and `_` in a `like` pattern as wildcards and `,` as a
 * column separator. A search term containing them must be escaped or it changes
 * the query rather than the match. The catalogue already has this rule; the admin
 * search follows it for the same reason.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_,()]/g, (ch) => `\\${ch}`);
}

export async function listProducts(
  filters: AdminProductListFilters,
): Promise<AdminProductListResult> {
  const supabase = createSupabaseAdminClient();

  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;

  let query = supabase
    .from('products')
    .select(
      `id, slug, title, reference_number, status, price_cents, price_on_request,
       currency, is_featured, published_at, updated_at, brand_id,
       brands ( name )`,
      { count: 'exact' },
    )
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  if (filters.brandId) {
    query = query.eq('brand_id', filters.brandId);
  }

  // Low stock is a comparison between two columns, which PostgREST cannot
  // express as a filter. Resolving the qualifying product ids first and then
  // filtering the products query keeps pagination correct: filtering after the
  // page was fetched would return a page that is short by an arbitrary amount,
  // and the total would disagree with the rows.
  if (filters.lowStockOnly) {
    const { data: lowStockRows, error: lowStockError } = await supabase
      .from('inventory')
      .select('product_id')
      .filter('quantity', 'lte', 'low_stock_threshold');

    if (lowStockError) {
      logger.error('admin.low_stock_filter_failed', { message: lowStockError.message });
      return { rows: [], total: 0, page: filters.page, pageSize: filters.pageSize, pageCount: 0 };
    }

    const lowStockIds = (lowStockRows ?? []).map((row) => row.product_id);
    if (lowStockIds.length === 0) {
      return { rows: [], total: 0, page: filters.page, pageSize: filters.pageSize, pageCount: 0 };
    }
    query = query.in('id', lowStockIds);
  }

  if (filters.query) {
    const term = escapeLike(filters.query.trim());
    if (term.length > 0) {
      query = query.or(
        `title.ilike.%${term}%,reference_number.ilike.%${term}%,slug.ilike.%${term}%`,
      );
    }
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error('admin.products_list_failed', { message: error.message });
    return { rows: [], total: 0, page: filters.page, pageSize: filters.pageSize, pageCount: 0 };
  }

  const ids = (data ?? []).map((row) => row.id);

  // Inventory is a separate table with one row per product. Fetching it for just
  // this page's ids keeps the cost proportional to the page, not the catalogue.
  const inventoryByProduct = new Map<string, { quantity: number; lowStockThreshold: number }>();
  if (ids.length > 0) {
    const { data: inventoryRows, error: inventoryError } = await supabase
      .from('inventory')
      .select('product_id, quantity, low_stock_threshold')
      .in('product_id', ids);

    if (inventoryError) {
      logger.error('admin.inventory_for_list_failed', { message: inventoryError.message });
    } else {
      for (const row of inventoryRows ?? []) {
        inventoryByProduct.set(row.product_id, {
          quantity: row.quantity,
          lowStockThreshold: row.low_stock_threshold,
        });
      }
    }
  }

  const rows: AdminProductListRow[] = (data ?? []).map((row) => {
    const inventory = inventoryByProduct.get(row.id);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      referenceNumber: row.reference_number,
      brandName: (row.brands as { name: string } | null)?.name ?? null,
      status: row.status as ProductStatus,
      priceCents: row.price_cents,
      priceOnRequest: row.price_on_request,
      currency: row.currency,
      isFeatured: row.is_featured,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
      quantity: inventory?.quantity ?? null,
      lowStockThreshold: inventory?.lowStockThreshold ?? null,
    };
  });

  const total = count ?? 0;
  return {
    rows,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    pageCount: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}

export type AdminProductDetail = {
  id: string;
  slug: string;
  sku: string;
  title: string;
  referenceNumber: string | null;
  shortDescription: string | null;
  description: string | null;
  brandId: string | null;
  modelId: string | null;
  status: ProductStatus;
  condition: string | null;
  priceCents: number | null;
  compareAtCents: number | null;
  costCents: number | null;
  priceOnRequest: boolean;
  currency: string;
  isFeatured: boolean;
  sortOrder: number;
  productionYear: number | null;
  caseSizeMm: number | null;
  caseMaterial: string | null;
  dialColor: string | null;
  braceletMaterial: string | null;
  movement: string | null;
  bezel: string | null;
  waterResistanceM: number | null;
  boxAndPapers: boolean | null;
  gender: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getProduct(id: string): Promise<AdminProductDetail | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();

  if (error) {
    logger.error('admin.product_read_failed', { message: error.message });
    return null;
  }
  if (!data) return null;

  return {
    id: data.id,
    slug: data.slug,
    sku: data.sku,
    title: data.title,
    referenceNumber: data.reference_number,
    shortDescription: data.short_description,
    description: data.description,
    brandId: data.brand_id,
    modelId: data.model_id,
    status: data.status as ProductStatus,
    condition: data.condition,
    priceCents: data.price_cents,
    compareAtCents: data.compare_at_cents,
    costCents: data.cost_cents,
    priceOnRequest: data.price_on_request,
    currency: data.currency,
    isFeatured: data.is_featured,
    sortOrder: data.sort_order,
    productionYear: data.production_year,
    caseSizeMm: data.case_size_mm,
    caseMaterial: data.case_material,
    dialColor: data.dial_color,
    braceletMaterial: data.bracelet_material,
    movement: data.movement,
    bezel: data.bezel,
    waterResistanceM: data.water_resistance_m,
    boxAndPapers: data.box_and_papers,
    gender: data.gender,
    seoTitle: data.seo_title,
    seoDescription: data.seo_description,
    ogImageUrl: data.og_image_url,
    publishedAt: data.published_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/** Brands and models, for the product editor's pickers. */
export async function listBrandsAndModels(): Promise<{
  brands: { id: string; name: string; slug: string }[];
  models: { id: string; name: string; slug: string; brandId: string }[];
}> {
  const supabase = createSupabaseAdminClient();

  const [brandsResult, modelsResult] = await Promise.all([
    supabase.from('brands').select('id, name, slug').order('name'),
    supabase.from('models').select('id, name, slug, brand_id').order('name'),
  ]);

  if (brandsResult.error) {
    logger.error('admin.brands_list_failed', { message: brandsResult.error.message });
  }
  if (modelsResult.error) {
    logger.error('admin.models_list_failed', { message: modelsResult.error.message });
  }

  return {
    brands: brandsResult.data ?? [],
    models: (modelsResult.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      brandId: m.brand_id,
    })),
  };
}
