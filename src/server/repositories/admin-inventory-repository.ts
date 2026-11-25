import 'server-only';

import { logger } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Inventory reads for the admin area.
 *
 * Writes do not live here. A stock adjustment is `admin_adjust_stock`, a
 * database function that enforces `inventory.write` against `auth.uid()` and
 * writes the ledger row in the same transaction. Calling it through the RPC is
 * the only supported path, so this module is deliberately read-only — there is no
 * `update inventory set quantity = ...` anywhere in the application, because that
 * would change stock without a ledger entry and make the history a lie.
 */

export type InventoryRow = {
  productId: string;
  quantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  location: string | null;
  updatedAt: string;
  /** `quantity - reserved_quantity`: what can actually be sold right now. */
  available: number;
  isLowStock: boolean;
  product: {
    title: string;
    slug: string;
    referenceNumber: string | null;
    status: string;
    brandName: string | null;
  };
};

export type InventoryFilters = {
  query?: string;
  lowStockOnly?: boolean;
  page: number;
  pageSize: number;
};

export type InventoryResult = {
  rows: InventoryRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_,()]/g, (ch) => `\\${ch}`);
}

export async function listInventory(filters: InventoryFilters): Promise<InventoryResult> {
  const supabase = createSupabaseAdminClient();
  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;

  let query = supabase
    .from('inventory')
    .select(
      `product_id, quantity, reserved_quantity, low_stock_threshold, location, updated_at,
       products!inner ( title, slug, reference_number, status, brands ( name ) )`,
      { count: 'exact' },
    )
    .order('quantity', { ascending: true })
    .range(from, to);

  // A two-column comparison cannot be expressed as a PostgREST filter, so the
  // qualifying rows are resolved from `inventory_stock_state`, which evaluates
  // it in SQL. Doing it after pagination would return a short page whose size
  // does not match the total.
  if (filters.lowStockOnly) {
    const { data: lowStockRows, error: lowStockError } = await supabase
      .from('inventory_stock_state')
      .select('product_id')
      .eq('is_low_stock', true);

    if (lowStockError) {
      logger.error('admin.inventory_low_stock_failed', { message: lowStockError.message });
      return { rows: [], total: 0, page: filters.page, pageSize: filters.pageSize, pageCount: 0 };
    }

    const ids = (lowStockRows ?? []).map((row) => row.product_id);
    if (ids.length === 0) {
      return { rows: [], total: 0, page: filters.page, pageSize: filters.pageSize, pageCount: 0 };
    }
    query = query.in('product_id', ids);
  }

  if (filters.query) {
    const term = escapeLike(filters.query.trim());
    if (term.length > 0) {
      // `!inner` above means the referenced product must match, so filtering on
      // the embedded resource narrows the parent rows as intended.
      query = query.or(`title.ilike.%${term}%,reference_number.ilike.%${term}%`, {
        referencedTable: 'products',
      });
    }
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error('admin.inventory_list_failed', { message: error.message });
    return { rows: [], total: 0, page: filters.page, pageSize: filters.pageSize, pageCount: 0 };
  }

  const rows: InventoryRow[] = (data ?? []).map((row) => {
    const product = row.products as unknown as {
      title: string;
      slug: string;
      reference_number: string | null;
      status: string;
      brands: { name: string } | null;
    } | null;

    const available = row.quantity - row.reserved_quantity;

    return {
      productId: row.product_id,
      quantity: row.quantity,
      reservedQuantity: row.reserved_quantity,
      lowStockThreshold: row.low_stock_threshold,
      location: row.location,
      updatedAt: row.updated_at,
      available,
      isLowStock: row.quantity <= row.low_stock_threshold,
      product: {
        title: product?.title ?? 'Unknown product',
        slug: product?.slug ?? '',
        referenceNumber: product?.reference_number ?? null,
        status: product?.status ?? 'draft',
        brandName: product?.brands?.name ?? null,
      },
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

export type InventoryLedgerRow = {
  id: string;
  kind: string;
  quantityDelta: number;
  reason: string | null;
  createdAt: string;
  actorEmail: string | null;
};

/** The stock ledger for one product, newest first. */
export async function fetchInventoryLedger(
  productId: string,
  limit = 25,
): Promise<InventoryLedgerRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('inventory_transactions')
    .select('id, kind, quantity_delta, note, created_at, actor_id')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) {
    logger.error('admin.inventory_ledger_failed', { message: error.message });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    quantityDelta: row.quantity_delta,
    reason: row.note,
    createdAt: row.created_at,
    actorEmail: null,
  }));
}
