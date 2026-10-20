import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import type { Json } from '@/lib/database.types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { fetchCheckoutConfiguration } from '@/server/repositories/checkout-repository';

/**
 * Order-request submission.
 *
 * -----------------------------------------------------------------------------
 * THE ONE WRITE PATH
 * -----------------------------------------------------------------------------
 *
 * This is not a payment. Every order request goes through
 * `submit_order_request`, a `security definer` function that re-prices from the
 * `products` table, re-checks publication and availability, reserves stock
 * atomically and records the terms acknowledgement. This module does not compute
 * a price, a fee or a discount: it passes product ids, quantities and a
 * *discount code*, and the database decides every figure.
 *
 * That is what makes "the server does not trust browser-submitted prices or
 * stock" true rather than merely asserted. There is no code path here that could
 * forward a price even if a caller wanted it to, because no price is accepted.
 *
 * -----------------------------------------------------------------------------
 * THE GUEST ACCESS TOKEN
 * -----------------------------------------------------------------------------
 *
 * A guest needs to read their request back later, and there is no account to
 * scope it to. The function therefore stores an `access_token_hash`, and the
 * customer is given the raw token exactly once. The token is minted and hashed
 * *here*, in Node, so the raw value never reaches the database and never appears
 * in a query log. Only the hash is sent, as `p_access_token_hash`.
 *
 * The token is not an authentication credential. It grants access to this one
 * request and nothing else, and it is never consulted by any RLS policy.
 *
 * A signed-in customer is scoped by RLS, so no token is sent and the function
 * clears any that is; there is no second credential to lose.
 */

/** The access token's shape is fixed so it can be matched by the SQL check. */
const TOKEN_BYTES = 32;

export type OrderRequestSubmission = {
  items: { productId: string; quantity: number }[];
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  fulfilmentType: 'delivery' | 'pickup';
  paymentMethodCode: string;
  deliveryOptionCode: string | null;
  deliveryAddress: {
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    country_code?: string;
  } | null;
  customerNote: string | null;
  discountCode: string | null;
  idempotencyKey: string;
  termsAcknowledged: true;
  /** Recorded, hashed at the edge, never stored raw. */
  userAgent: string | null;
};

export type OrderRequestResult = {
  reference: string;
  /**
   * The raw guest token, returned once and never stored. `null` for a signed-in
   * customer, who is scoped by RLS and needs no token.
   */
  accessToken: string | null;
  isGuest: boolean;
};

/** A fresh guest token and the hash the database stores. */
export function mintAccessToken(): { token: string; hash: string } {
  // `node:crypto` rather than `extensions.gen_random_bytes`: the token must be
  // known to the application to be returned, so it is generated here.
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  return { token, hash: sha256Hex(token) };
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Whether the caller is signed in, without leaking which user it is. */
async function callerIsSignedIn(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  return Boolean(data.user);
}

/**
 * The store's collection address, as one line, or `null`.
 *
 * Read at submission time from the settings row. A failure here is not fatal: a
 * pickup request is still a valid request if the address cannot be resolved, and
 * the confirmation is where the exact location is given.
 */
async function loadPickupLocation(): Promise<string | null> {
  try {
    const configuration = await fetchCheckoutConfiguration();
    return configuration.pickupLocation;
  } catch {
    return null;
  }
}

export async function submitOrderRequest(
  input: OrderRequestSubmission,
): Promise<OrderRequestResult> {
  const supabase = await createSupabaseServerClient();
  const isGuest = !(await callerIsSignedIn(supabase));

  const token = isGuest ? mintAccessToken() : null;

  // A pickup location is a snapshot of where the store is *now*, taken from the
  // settings row rather than from the form. A browser-submitted location would
  // be a string the customer could choose, and the order history would then
  // record a collection point the business never offered.
  const pickupLocation = input.fulfilmentType === 'pickup' ? await loadPickupLocation() : null;

  const { data, error } = await supabase.rpc('submit_order_request', {
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    })) as unknown as Json,
    p_customer_name: input.customerName,
    p_customer_email: input.customerEmail,
    // The parameter has no SQL default, so it must be supplied. An empty string
    // is what the function treats as "no phone": it stores
    // `nullif(btrim(p_customer_phone), '')`.
    p_customer_phone: input.customerPhone ?? '',
    p_fulfilment_type: input.fulfilmentType,
    p_payment_method_code: input.paymentMethodCode,
    // `undefined` rather than `null` for the genuinely optional arguments: the
    // generated RPC type marks them `| undefined`, and omitting one lets the SQL
    // default apply. The generated type carries the order-request parameters
    // (migration 0013), which are newer than the last `gen types` run and were
    // added by hand.
    p_delivery_address: (input.deliveryAddress ?? undefined) as Json | undefined,
    p_customer_note: input.customerNote ?? undefined,
    p_delivery_option_code: input.deliveryOptionCode ?? undefined,
    p_pickup_location: pickupLocation ?? undefined,
    p_idempotency_key: input.idempotencyKey,
    p_terms_acknowledged: input.termsAcknowledged,
    p_user_agent: input.userAgent ?? undefined,
    p_discount_code: input.discountCode ?? undefined,
    p_access_token_hash: token?.hash ?? undefined,
  });

  if (error) {
    // Logged without the customer's name, address or note: a request is personal
    // data and a log line is a copy of it the customer never agreed to.
    logger.warn('order_request.rejected', { message: error.message, isGuest });
    throw error;
  }

  const row = data as { reference: string };

  logger.info('order_request.submitted', { reference: row.reference, isGuest });

  return {
    reference: row.reference,
    accessToken: token?.token ?? null,
    isGuest,
  };
}

/**
 * A guest's view of their own order request.
 *
 * The reference alone is not a credential — it is sequential and guessable — so
 * a matching access token is required as well, and the function returns `null`
 * for any mismatch rather than raising. That makes the endpoint useless as a
 * probe: a wrong token and a non-existent reference look the same.
 *
 * The raw token comes from the link the customer was given and is passed through
 * unchanged; hashing happens inside the function. It is never logged.
 */
export type GuestOrderItem = {
  title: string;
  sku: string | null;
  slug: string | null;
  imageUrl: string | null;
  unitPriceCents: number | null;
  quantity: number;
  lineTotalCents: number;
};

export type GuestOrderRequestView = {
  reference: string;
  status: string;
  customerName: string;
  customerEmail: string;
  fulfilmentType: string;
  pickupLocation: string | null;
  paymentMethodCode: string | null;
  customerNote: string | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  currency: string;
  createdAt: string;
  items: GuestOrderItem[];
};

/** The shape `read_order_request` actually returns: snake_case throughout. */
type RawGuestOrderRequest = {
  reference: string;
  status: string;
  customer_name: string;
  customer_email: string;
  fulfilment_type: string;
  pickup_location: string | null;
  payment_method_code: string | null;
  customer_note: string | null;
  subtotal_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  currency: string;
  created_at: string;
  items:
    | {
        title: string;
        sku: string | null;
        slug: string | null;
        image_url: string | null;
        unit_price_cents: number | null;
        quantity: number;
        line_total_cents: number;
      }[]
    | null;
};

export async function readGuestOrderRequest(
  reference: string,
  accessToken: string,
): Promise<GuestOrderRequestView | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('read_order_request', {
    p_reference: reference,
    p_access_token: accessToken,
  });

  if (error) {
    logger.warn('order_request.read_failed', { message: error.message });
    throw error;
  }

  const raw = data as RawGuestOrderRequest | null;
  if (!raw) return null;

  // Mapped by hand rather than cast: a cast would hide a rename in the SQL, and
  // this is the boundary where a column name would silently become `undefined`
  // on the page.
  return {
    reference: raw.reference,
    status: raw.status,
    customerName: raw.customer_name,
    customerEmail: raw.customer_email,
    fulfilmentType: raw.fulfilment_type,
    pickupLocation: raw.pickup_location,
    paymentMethodCode: raw.payment_method_code,
    customerNote: raw.customer_note,
    subtotalCents: raw.subtotal_cents,
    deliveryFeeCents: raw.delivery_fee_cents,
    totalCents: raw.total_cents,
    currency: raw.currency,
    createdAt: raw.created_at,
    items: (raw.items ?? []).map((item) => ({
      title: item.title,
      sku: item.sku,
      slug: item.slug,
      imageUrl: item.image_url,
      unitPriceCents: item.unit_price_cents,
      quantity: item.quantity,
      lineTotalCents: item.line_total_cents,
    })),
  };
}
