/**
 * Turn the `cart_pricing` payload into cart view models.
 *
 * Pure: no Supabase client, no environment, no I/O. Image URL resolution is
 * injected as a function, exactly as `lib/catalogue/assemble.ts` and
 * `lib/product/assemble.ts` do, because `resolveImageUrl` reads the
 * environment. That keeps this module testable against fixtures, including the
 * states a seeded database reaches only by accident — a price-on-request line,
 * a line whose product has been unpublished, a line whose quantity was clamped
 * because the piece is unique.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS A MAPPER AND NOT A CALCULATION
 * -----------------------------------------------------------------------------
 *
 * Nothing here decides a price, a quantity or a discount. Those decisions are
 * made once, in `cart_pricing` in the database, and this module only renames and
 * formats the result. That is deliberate: a second implementation of the
 * arithmetic in TypeScript is a second thing to keep in step with the order
 * path, and the whole point of doing it in Postgres is that there is one.
 *
 * If a value is missing or malformed, the mapper falls back to the safe
 * direction — an unreadable price becomes "priced on request", an unreadable
 * availability becomes "not available" — rather than inventing a number.
 */

import { formatPrice } from '@/lib/homepage/assemble';
import {
  emptyCartView,
  type CartDiscount,
  type CartLine,
  type CartLineStatus,
  type CartView,
  type DiscountKind,
} from './types';

/** The raw jsonb payload `cart_pricing` returns. Everything is `unknown`. */
export type CartPricingPayload = {
  currency?: unknown;
  lines?: unknown;
  line_count?: unknown;
  item_count?: unknown;
  subtotal_cents?: unknown;
  discount_cents?: unknown;
  total_cents?: unknown;
  has_unavailable?: unknown;
  has_price_on_request?: unknown;
  free_delivery?: unknown;
  discount?: unknown;
};

/** Postgres `bigint` arrives as a string through PostgREST. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toText(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function toBool(value: unknown): boolean {
  return value === true;
}

/**
 * Format a minor-unit amount as currency.
 *
 * Whole units, like the rest of the site: watch prices are not quoted to the
 * cent. A `null` currency falls back to USD so a malformed payload still
 * renders something readable rather than throwing.
 */
export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function toLineStatus(value: unknown): CartLineStatus {
  return value === 'unpublished' ? 'unpublished' : 'ok';
}

function toDiscountKind(value: unknown): DiscountKind {
  switch (value) {
    case 'fixed_amount':
    case 'free_delivery':
      return value;
    default:
      return 'percentage';
  }
}

/** Map one raw line. */
function toCartLine(
  raw: unknown,
  currency: string,
  resolveImage: (storagePath: string | null, externalUrl: string | null) => string | null,
): CartLine | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const productId = toText(row.product_id);
  const slug = toText(row.slug);
  if (!productId || !slug) return null;

  const title = toText(row.title) ?? 'This piece';
  const priceOnRequest = toBool(row.price_on_request);
  const unitPriceCents = priceOnRequest ? null : toNumber(row.unit_price_cents);
  const lineTotalCents = toNumber(row.line_total_cents) ?? 0;
  const quantity = Math.max(1, toNumber(row.quantity) ?? 1);
  const status = toLineStatus(row.product_status);
  const isAvailable = toBool(row.is_available);

  return {
    productId,
    slug,
    href: `/products/${slug}`,
    title,
    sku: toText(row.sku) ?? '',
    brandName: toText(row.brand_name),
    brandSlug: toText(row.brand_slug),
    imageUrl: resolveImage(toText(row.image_storage_path), toText(row.image_external_url)),
    imageAlt: toText(row.image_alt) ?? title,
    dialColor: toText(row.dial_color),
    caseMaterial: toText(row.case_material),
    priceOnRequest,
    // `formatPrice` returns `null` for a price-on-request line, so the visible
    // price and the numeric value come from one decision and cannot disagree.
    unitPrice: formatPrice(unitPriceCents, currency, priceOnRequest),
    unitPriceCents,
    quantity,
    quantityLocked: toBool(row.quantity_locked),
    quantityAdjusted: toBool(row.quantity_adjusted),
    lineTotal: priceOnRequest ? null : formatMoney(lineTotalCents, currency),
    lineTotalCents,
    isAvailable,
    status,
    purchasable: status === 'ok' && isAvailable,
  };
}

function toCartDiscount(raw: unknown, currency: string): CartDiscount | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const code = toText(row.code);
  if (!code) return null;

  const amountCents = toNumber(row.amount_cents) ?? 0;

  return {
    code,
    label: toText(row.label) ?? code,
    kind: toDiscountKind(row.kind),
    applied: toBool(row.applied),
    amountCents,
    amount: formatMoney(amountCents, currency),
    reason: toText(row.reason),
  };
}

/**
 * Map the `cart_pricing` payload to a `CartView`.
 *
 * A payload that is not an object at all yields the unavailable empty cart, so a
 * failed RPC never renders as an empty cart the customer believes is real.
 */
export function toCartView(
  payload: CartPricingPayload | null | undefined,
  resolveImage: (storagePath: string | null, externalUrl: string | null) => string | null,
): CartView {
  if (!payload || typeof payload !== 'object') {
    return emptyCartView('unavailable');
  }

  const currency = toText(payload.currency) ?? 'USD';

  const lines = (Array.isArray(payload.lines) ? payload.lines : [])
    .map((raw) => toCartLine(raw, currency, resolveImage))
    .filter((line): line is CartLine => line !== null);

  const subtotalCents = toNumber(payload.subtotal_cents) ?? 0;
  const discountCents = toNumber(payload.discount_cents) ?? 0;
  const totalCents = toNumber(payload.total_cents) ?? Math.max(subtotalCents - discountCents, 0);

  return {
    currency,
    lines,
    lineCount: toNumber(payload.line_count) ?? lines.length,
    itemCount: toNumber(payload.item_count) ?? 0,
    subtotalCents,
    subtotal: formatMoney(subtotalCents, currency),
    discountCents,
    discount: formatMoney(discountCents, currency),
    totalCents,
    total: formatMoney(totalCents, currency),
    hasUnavailable: toBool(payload.has_unavailable),
    hasPriceOnRequest: toBool(payload.has_price_on_request),
    freeDelivery: toBool(payload.free_delivery),
    discountCode: toCartDiscount(payload.discount, currency),
    isEmpty: lines.length === 0,
    source: 'database',
  };
}

/** The largest quantity the stepper may offer for a line. */
export const MAX_LINE_QUANTITY = 99;

/**
 * The quantities a line's stepper offers.
 *
 * A locked line offers exactly one, because the product model permits no more:
 * a unique watch has a single unreserved unit, and a control offering two would
 * be offering something that does not exist. Anything else offers the range the
 * schema allows; the real stock is checked when the order request is submitted,
 * where a shortage is reported rather than silently accepted.
 */
export function quantityOptions(line: Pick<CartLine, 'quantityLocked'>): number[] {
  if (line.quantityLocked) return [1];
  return Array.from({ length: MAX_LINE_QUANTITY }, (_, index) => index + 1);
}

/**
 * Whether a requested quantity is permitted for a line, before it reaches the
 * server.
 *
 * This is a UI guard, not the boundary. `cart_items_quantity_positive` (a check
 * constraint), the `cart_pricing` clamp and the order path are what actually
 * hold; this exists so the stepper cannot send a value the database will
 * reject.
 */
export function isQuantityPermitted(
  line: Pick<CartLine, 'quantityLocked'>,
  quantity: number,
): boolean {
  if (!Number.isInteger(quantity)) return false;
  if (quantity < 1) return false;
  if (line.quantityLocked) return quantity === 1;
  return quantity <= MAX_LINE_QUANTITY;
}

/** The number of items the header badge shows: total units in the cart. */
export function cartBadgeCount(view: Pick<CartView, 'itemCount'>): number {
  return Math.max(0, Math.trunc(view.itemCount));
}
