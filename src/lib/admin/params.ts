/**
 * Query parameters for the admin lists.
 *
 * The same discipline the catalogue uses applies here, for the same reasons: the
 * query string is attacker-controlled, and every value that reaches a repository
 * must be a known type within a bound. An unparseable value is dropped, not
 * forwarded. Unknown keys are ignored.
 *
 * These are internal screens, so the stakes are lower than on the storefront —
 * but "lower" is not "none". An unbounded `pageSize` would let one request ask
 * for the whole table, and an unvalidated `status` would reach a database filter
 * as a value the column's type does not accept, producing a 500 instead of an
 * empty list.
 */

import { z } from 'zod';

export const ADMIN_PAGE_SIZES = [25, 50, 100] as const;
export const ADMIN_DEFAULT_PAGE_SIZE = 25;

/** An integer with a bound, defaulting when absent or unparseable. */
function boundedInt(min: number, max: number, fallback: number) {
  return z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return fallback;
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
    });
}

const pageSize = z
  .string()
  .optional()
  .transform((value) => {
    const parsed = Number(value);
    return (ADMIN_PAGE_SIZES as readonly number[]).includes(parsed)
      ? parsed
      : ADMIN_DEFAULT_PAGE_SIZE;
  });

export const productListParamsSchema = z.object({
  status: z
    .enum(['all', 'draft', 'published', 'archived'])
    .optional()
    .catch('all')
    .transform((value) => value ?? 'all'),
  q: z
    .string()
    .trim()
    .max(120, 'Search terms are limited to 120 characters')
    .optional()
    .catch(undefined)
    .transform((value) => (value ? value : undefined)),
  brand: z.string().uuid().optional().catch(undefined),
  stock: z.enum(['low']).optional().catch(undefined),
  page: boundedInt(1, 10_000, 1),
  pageSize: pageSize,
});

export type ProductListParams = z.infer<typeof productListParamsSchema>;

export const inventoryListParamsSchema = z.object({
  q: z
    .string()
    .trim()
    .max(120, 'Search terms are limited to 120 characters')
    .optional()
    .catch(undefined)
    .transform((value) => (value ? value : undefined)),
  filter: z.enum(['low']).optional().catch(undefined),
  page: boundedInt(1, 10_000, 1),
  pageSize: pageSize,
});

export type InventoryListParams = z.infer<typeof inventoryListParamsSchema>;

export const orderListParamsSchema = z.object({
  status: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((s) => s.trim())
            .filter((s) =>
              [
                'submitted',
                'under_review',
                'confirmed',
                'awaiting_payment',
                'paid_offline',
                'fulfilled',
                'cancelled',
                'rejected',
              ].includes(s),
            )
        : [],
    ),
  q: z
    .string()
    .trim()
    .max(120, 'Search terms are limited to 120 characters')
    .optional()
    .catch(undefined)
    .transform((value) => (value ? value : undefined)),
  page: boundedInt(1, 10_000, 1),
  pageSize: pageSize,
});

export type OrderListParams = z.infer<typeof orderListParamsSchema>;

/** Parse a `searchParams` record without ever throwing. */
export function parseProductParams(
  searchParams: Record<string, string | string[] | undefined>,
): ProductListParams {
  return productListParamsSchema.parse(flatten(searchParams));
}

export function parseInventoryParams(
  searchParams: Record<string, string | string[] | undefined>,
): InventoryListParams {
  return inventoryListParamsSchema.parse(flatten(searchParams));
}

export function parseOrderParams(
  searchParams: Record<string, string | string[] | undefined>,
): OrderListParams {
  return orderListParamsSchema.parse(flatten(searchParams));
}

/** A repeated key is attacker-controlled; take the first value only. */
function flatten(
  searchParams: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') out[key] = value;
    else if (Array.isArray(value) && typeof value[0] === 'string') out[key] = value[0];
  }
  return out;
}

/** Render the current product filters back into a URL, omitting defaults. */
export function buildProductHref(
  params: ProductListParams,
  overrides: Partial<ProductListParams> = {},
): string {
  const merged = { ...params, ...overrides };
  const search = new URLSearchParams();
  if (merged.status && merged.status !== 'all') search.set('status', merged.status);
  if (merged.q) search.set('q', merged.q);
  if (merged.brand) search.set('brand', merged.brand);
  if (merged.stock) search.set('stock', merged.stock);
  if (merged.page > 1) search.set('page', String(merged.page));
  if (merged.pageSize !== ADMIN_DEFAULT_PAGE_SIZE) search.set('pageSize', String(merged.pageSize));
  const qs = search.toString();
  return qs ? `/admin/products?${qs}` : '/admin/products';
}

export function buildInventoryHref(
  params: InventoryListParams,
  overrides: Partial<InventoryListParams> = {},
): string {
  const merged = { ...params, ...overrides };
  const search = new URLSearchParams();
  if (merged.q) search.set('q', merged.q);
  if (merged.filter) search.set('filter', merged.filter);
  if (merged.page > 1) search.set('page', String(merged.page));
  if (merged.pageSize !== ADMIN_DEFAULT_PAGE_SIZE) search.set('pageSize', String(merged.pageSize));
  const qs = search.toString();
  return qs ? `/admin/inventory?${qs}` : '/admin/inventory';
}

export function buildOrderHref(
  params: OrderListParams,
  overrides: Partial<OrderListParams> = {},
): string {
  const merged = { ...params, ...overrides };
  const search = new URLSearchParams();
  if (merged.status.length > 0) search.set('status', merged.status.join(','));
  if (merged.q) search.set('q', merged.q);
  if (merged.page > 1) search.set('page', String(merged.page));
  if (merged.pageSize !== ADMIN_DEFAULT_PAGE_SIZE) search.set('pageSize', String(merged.pageSize));
  const qs = search.toString();
  return qs ? `/admin/orders?${qs}` : '/admin/orders';
}
