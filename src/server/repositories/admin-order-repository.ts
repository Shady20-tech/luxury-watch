import 'server-only';

import { logger } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { AdminOrderStatus } from '@/lib/admin/validation';

/**
 * Administrative reads for order requests.
 *
 * -----------------------------------------------------------------------------
 * WHY THE SERVICE-ROLE CLIENT
 * -----------------------------------------------------------------------------
 *
 * `order_requests.admin_note` and `settled_offline_by` are staff-only columns,
 * withheld from `authenticated` by column grants (0014). The detail screen has to
 * show who settled an order, so it reads through the service-role client.
 *
 * `admin_note` is shown to staff and never to the customer. It is deliberately
 * separate from `customer_note`, which the customer writes.
 *
 * Every caller has passed `requirePermission('orders.read')`; see
 * `admin-authorization.ts`.
 */

export type AdminOrderListRow = {
  id: string;
  reference: string;
  customerName: string;
  customerEmail: string;
  status: AdminOrderStatus;
  totalCents: number;
  currency: string;
  fulfilmentType: string;
  createdAt: string;
  itemCount: number;
};

export type AdminOrderFilters = {
  statuses: string[];
  query?: string;
  page: number;
  pageSize: number;
};

export type AdminOrderListResult = {
  rows: AdminOrderListRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_,()]/g, (ch) => `\\${ch}`);
}

export async function listOrders(filters: AdminOrderFilters): Promise<AdminOrderListResult> {
  const supabase = createSupabaseAdminClient();
  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;

  let query = supabase
    .from('order_requests')
    .select(
      'id, reference, customer_name, customer_email, status, total_cents, currency, fulfilment_type, created_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.statuses.length > 0) {
    query = query.in('status', filters.statuses as AdminOrderStatus[]);
  }

  if (filters.query) {
    const term = escapeLike(filters.query.trim());
    if (term.length > 0) {
      query = query.or(
        `reference.ilike.%${term}%,customer_name.ilike.%${term}%,customer_email.ilike.%${term}%`,
      );
    }
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error('admin.orders_list_failed', { message: error.message });
    return { rows: [], total: 0, page: filters.page, pageSize: filters.pageSize, pageCount: 0 };
  }

  const ids = (data ?? []).map((row) => row.id);

  // Item counts for this page only, so the cost is proportional to the page.
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from('order_request_items')
      .select('order_request_id')
      .in('order_request_id', ids);

    if (itemsError) {
      logger.error('admin.order_item_counts_failed', { message: itemsError.message });
    } else {
      for (const item of items ?? []) {
        counts.set(item.order_request_id, (counts.get(item.order_request_id) ?? 0) + 1);
      }
    }
  }

  const total = count ?? 0;
  return {
    rows: (data ?? []).map((row) => ({
      id: row.id,
      reference: row.reference,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      status: row.status as AdminOrderStatus,
      totalCents: Number(row.total_cents),
      currency: row.currency,
      fulfilmentType: row.fulfilment_type,
      createdAt: row.created_at,
      itemCount: counts.get(row.id) ?? 0,
    })),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    pageCount: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}

export type AdminOrderItem = {
  id: string;
  productTitle: string;
  sku: string;
  slug: string | null;
  imageUrl: string | null;
  unitPriceCents: number | null;
  quantity: number;
  lineTotalCents: number;
};

export type AdminOrderEvent = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  actorLabel: string | null;
  createdAt: string;
};

export type AdminOrderDetail = {
  id: string;
  /** The customer's auth user id, or null for a guest request. */
  userId: string | null;
  reference: string;
  status: AdminOrderStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerNote: string | null;
  adminNote: string | null;
  fulfilmentType: string;
  deliveryAddress: Record<string, unknown> | null;
  pickupLocation: string | null;
  paymentMethodCode: string | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  discountCode: string | null;
  settledOfflineAt: string | null;
  settledOfflineBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: AdminOrderItem[];
  events: AdminOrderEvent[];
};

export async function getOrder(id: string): Promise<AdminOrderDetail | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from('order_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    logger.error('admin.order_read_failed', { message: error.message });
    return null;
  }
  if (!data) return null;

  const [itemsResult, eventsResult] = await Promise.all([
    supabase
      .from('order_request_items')
      .select(
        'id, product_title_snapshot, sku_snapshot, slug_snapshot, image_url_snapshot, unit_price_cents, quantity, line_total_cents',
      )
      .eq('order_request_id', id),
    supabase
      .from('order_request_events')
      .select('id, from_status, to_status, note, actor_label, created_at')
      .eq('order_request_id', id)
      .order('created_at', { ascending: true }),
  ]);

  if (itemsResult.error) {
    logger.error('admin.order_items_failed', { message: itemsResult.error.message });
  }
  if (eventsResult.error) {
    logger.error('admin.order_events_failed', { message: eventsResult.error.message });
  }

  return {
    id: data.id,
    userId: data.user_id,
    reference: data.reference,
    status: data.status as AdminOrderStatus,
    customerName: data.customer_name,
    customerEmail: data.customer_email,
    customerPhone: data.customer_phone,
    customerNote: data.customer_note,
    adminNote: data.admin_note,
    fulfilmentType: data.fulfilment_type,
    deliveryAddress: (data.delivery_address as Record<string, unknown> | null) ?? null,
    pickupLocation: data.pickup_location,
    paymentMethodCode: data.payment_method_code,
    subtotalCents: Number(data.subtotal_cents),
    deliveryFeeCents: Number(data.delivery_fee_cents),
    discountCents: Number(data.discount_cents),
    totalCents: Number(data.total_cents),
    currency: data.currency,
    discountCode: data.discount_code,
    settledOfflineAt: data.settled_offline_at,
    settledOfflineBy: data.settled_offline_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    items: (itemsResult.data ?? []).map((item) => ({
      id: item.id,
      productTitle: item.product_title_snapshot,
      sku: item.sku_snapshot,
      slug: item.slug_snapshot,
      imageUrl: item.image_url_snapshot,
      unitPriceCents: item.unit_price_cents === null ? null : Number(item.unit_price_cents),
      quantity: item.quantity,
      lineTotalCents: Number(item.line_total_cents),
    })),
    events: (eventsResult.data ?? []).map((event) => ({
      id: event.id,
      fromStatus: event.from_status,
      toStatus: event.to_status,
      note: event.note,
      actorLabel: event.actor_label,
      createdAt: event.created_at,
    })),
  };
}

/** Counts by status, for the filter bar. One query, not one per status. */
export async function fetchOrderStatusCounts(): Promise<Record<string, number>> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from('order_requests').select('status');

  if (error) {
    logger.error('admin.order_status_counts_failed', { message: error.message });
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}
