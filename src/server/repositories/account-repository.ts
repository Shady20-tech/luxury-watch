import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Reads for the customer's own account area.
 *
 * -----------------------------------------------------------------------------
 * EVERY QUERY HERE IS SCOPED TWICE
 * -----------------------------------------------------------------------------
 *
 * Each function filters on `user_id = userId` *and* runs on the request-scoped,
 * anon-key client, so RLS applies as well. The explicit filter is not redundant:
 * RLS decides which rows the role may see, and a policy mistake would then
 * silently return another customer's rows rather than nothing. The filter makes
 * the intent legible and the failure mode empty instead of wrong.
 *
 * The `userId` always comes from the session (`getAuthUser`), never from a form
 * or a URL segment. No function here accepts a customer-supplied identity.
 *
 * -----------------------------------------------------------------------------
 * THE COLUMN LISTS ARE EXPLICIT, AND THAT IS LOAD-BEARING
 * -----------------------------------------------------------------------------
 *
 * Migration 0014 revoked the table-level `select` grant on these tables and
 * re-granted only the customer-facing columns, so the sensitive ones
 * (`admin_note`, `access_token_hash`, `ip_hash`, `user_agent`,
 * `idempotency_key`, `settled_offline_by`, `actor_id`, `actor_label`,
 * `staff_note`, `assigned_to`) are hard-denied. A `select('*')` would therefore
 * fail with a permission error rather than quietly returning them.
 *
 * Naming the columns keeps that guarantee visible: a reviewer can see that the
 * admin note is absent, rather than having to trust that `*` excluded it. If a
 * column is added to the public surface, it must be added to the grant list in
 * 0014 and named here.
 */

export type AccountOrderSummary = {
  id: string;
  reference: string;
  status: string;
  fulfilmentType: string;
  totalCents: number;
  currency: string;
  itemCount: number;
  createdAt: string;
};

export type AccountOrderItem = {
  id: string;
  title: string;
  slug: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number | null;
  lineTotalCents: number;
};

export type AccountOrderEvent = {
  id: string;
  toStatus: string;
  note: string | null;
  createdAt: string;
};

export type AccountOrderDetail = {
  id: string;
  reference: string;
  status: string;
  fulfilmentType: string;
  /** Null for an order submitted before a method was chosen, or if it was cleared. */
  paymentMethodCode: string | null;
  customerNote: string | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  discountCode: string | null;
  settledOfflineAt: string | null;
  createdAt: string;
  items: AccountOrderItem[];
  events: AccountOrderEvent[];
};

/** The customer's order requests, newest first. */
export async function fetchAccountOrders(userId: string): Promise<AccountOrderSummary[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('order_requests')
    .select('id, reference, status, fulfilment_type, total_cents, currency, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // One grouped count rather than a query per order. The item counts come back
  // as rows the customer is allowed to read, so RLS applies to them too.
  const ids = data.map((row) => row.id);
  const { data: itemRows, error: itemError } = await supabase
    .from('order_request_items')
    .select('order_request_id, quantity')
    .in('order_request_id', ids);

  if (itemError) throw itemError;

  const counts = new Map<string, number>();
  for (const item of itemRows ?? []) {
    counts.set(item.order_request_id, (counts.get(item.order_request_id) ?? 0) + item.quantity);
  }

  return data.map((row) => ({
    id: row.id,
    reference: row.reference,
    status: row.status,
    fulfilmentType: row.fulfilment_type,
    totalCents: row.total_cents,
    currency: row.currency,
    itemCount: counts.get(row.id) ?? 0,
    createdAt: row.created_at,
  }));
}

/**
 * One order request in full, or `null` when it is not the caller's.
 *
 * The `user_id` filter means an id belonging to another customer matches nothing,
 * so the caller renders "not found" rather than "forbidden" — which is the right
 * answer, because confirming that someone else's reference exists is itself a
 * small leak.
 */
export async function fetchAccountOrder(
  userId: string,
  orderId: string,
): Promise<AccountOrderDetail | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('order_requests')
    .select(
      'id, reference, status, fulfilment_type, payment_method_code, customer_note, subtotal_cents, delivery_fee_cents, discount_cents, total_cents, currency, discount_code, settled_offline_at, created_at',
    )
    .eq('id', orderId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const [items, events] = await Promise.all([fetchOrderItems(data.id), fetchOrderEvents(data.id)]);

  return {
    id: data.id,
    reference: data.reference,
    status: data.status,
    fulfilmentType: data.fulfilment_type,
    paymentMethodCode: data.payment_method_code ?? null,
    customerNote: data.customer_note ?? null,
    subtotalCents: data.subtotal_cents,
    deliveryFeeCents: data.delivery_fee_cents,
    discountCents: data.discount_cents,
    totalCents: data.total_cents,
    currency: data.currency,
    discountCode: data.discount_code ?? null,
    settledOfflineAt: data.settled_offline_at ?? null,
    createdAt: data.created_at,
    items,
    events,
  };
}

async function fetchOrderItems(orderId: string): Promise<AccountOrderItem[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('order_request_items')
    .select(
      'id, product_title_snapshot, slug_snapshot, image_url_snapshot, quantity, unit_price_cents, line_total_cents',
    )
    .eq('order_request_id', orderId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.product_title_snapshot,
    slug: row.slug_snapshot ?? null,
    imageUrl: row.image_url_snapshot ?? null,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    lineTotalCents: row.line_total_cents,
  }));
}

/**
 * The status timeline.
 *
 * `actor_id` and `actor_label` are not selected: migration 0014 withholds them,
 * so the staff member who moved the order stays internal. The customer sees what
 * changed, when, and the customer-facing note.
 */
async function fetchOrderEvents(orderId: string): Promise<AccountOrderEvent[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('order_request_events')
    .select('id, to_status, note, created_at')
    .eq('order_request_id', orderId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    toStatus: row.to_status,
    note: row.note ?? null,
    createdAt: row.created_at,
  }));
}

export type AccountCounts = {
  orders: number;
  wishlist: number;
  addresses: number;
};

/**
 * The counts shown on the account overview.
 *
 * `head: true` asks Postgres for the count without the rows, so a customer with
 * fifty orders does not transfer fifty rows to render a number. Each query is
 * scoped to the owner and runs under RLS.
 */
export async function fetchAccountCounts(userId: string): Promise<AccountCounts> {
  const supabase = await createSupabaseServerClient();

  const [orders, wishlist, addresses] = await Promise.all([
    supabase
      .from('order_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    // `wishlist_items` has no `user_id`: it belongs to a `wishlists` row, and the
    // owner is one join away. The inner join is what scopes it.
    supabase
      .from('wishlist_items')
      .select('id, wishlists!inner ( user_id )', { count: 'exact', head: true })
      .eq('wishlists.user_id', userId),
    supabase.from('addresses').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  // A count that fails is reported as zero rather than breaking the overview.
  // The overview is a summary; the linked pages carry the authoritative lists
  // and report their own errors.
  return {
    orders: orders.count ?? 0,
    wishlist: wishlist.count ?? 0,
    addresses: addresses.count ?? 0,
  };
}
