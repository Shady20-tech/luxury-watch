/**
 * Cart view models.
 *
 * As with the catalogue and the product page, these types are the contract
 * between the database and the components, not the row types from
 * `database.types.ts`. A component must render from a fixture in a test without
 * a database, and it must not know about `cart_id`, `session_token` or
 * `unit_price_cents` as a *stored* value.
 *
 * `src/lib/cart/pricing.ts` is the only place that turns the `cart_pricing`
 * payload into these shapes.
 *
 * -----------------------------------------------------------------------------
 * DISPLAY DATA, NOT TRUTH
 * -----------------------------------------------------------------------------
 *
 * Every monetary value here is display data. It comes from the database's
 * `cart_pricing` function on each read, and it is recomputed again when an order
 * request is submitted. Nothing in this module is trusted for order creation,
 * and no code path may send one of these numbers back to the server as an
 * amount.
 */

/** The kind of a promotional code, mirroring the `discount_kind` enum. */
export type DiscountKind = 'percentage' | 'fixed_amount' | 'free_delivery';

/**
 * Why a line may not be bought as it stands.
 *
 * `ok` means published and with at least one unreserved unit. `unpublished`
 * covers a product that has been drafted or archived since it was added, which
 * is a state the customer must be told about rather than have silently dropped.
 */
export type CartLineStatus = 'ok' | 'unpublished';

/** One line of the cart, as the cart and the drawer render it. */
export type CartLine = {
  productId: string;
  slug: string;
  href: string;
  title: string;
  sku: string;
  brandName: string | null;
  brandSlug: string | null;
  /** Resolved image URL, or `null` for the drawn thumbnail. */
  imageUrl: string | null;
  imageAlt: string;
  /**
   * The attributes the drawn thumbnail is built from, used only when
   * `imageUrl` is `null`. Both are presentation data: neither is read to
   * compute a price, and a wrong value here changes a picture, not an amount.
   */
  dialColor: string | null;
  caseMaterial: string | null;
  priceOnRequest: boolean;
  /** Formatted unit price, or `null` when the piece is priced on request. */
  unitPrice: string | null;
  unitPriceCents: number | null;
  /** The quantity the cart will hold. */
  quantity: number;
  /**
   * True when the product model permits only one. A unique watch has a single
   * unreserved unit, so a stepper offering two would be offering something that
   * does not exist.
   */
  quantityLocked: boolean;
  /**
   * True when a larger quantity was requested and reduced to what is possible.
   * The UI says so rather than silently changing the number.
   */
  quantityAdjusted: boolean;
  /** Formatted line total, or `null` when the piece is priced on request. */
  lineTotal: string | null;
  lineTotalCents: number;
  /** At least one unreserved unit of a published product. */
  isAvailable: boolean;
  status: CartLineStatus;
  /** Published and available: the line can proceed to an order request. */
  purchasable: boolean;
};

/** An applied or rejected promotional code, with the reason it was rejected. */
export type CartDiscount = {
  code: string;
  label: string;
  kind: DiscountKind;
  applied: boolean;
  amountCents: number;
  /** Formatted amount. A free-delivery code is `$0.00` here by design. */
  amount: string;
  /** A sentence for the customer when `applied` is false, otherwise `null`. */
  reason: string | null;
};

/**
 * The whole cart as a screen renders it.
 *
 * `source` distinguishes "the database answered and the cart is empty" from
 * "the database could not be reached", which is the same distinction the
 * catalogue makes and for the same reason: only the first is a genuine empty
 * cart.
 */
export type CartView = {
  currency: string;
  lines: CartLine[];
  lineCount: number;
  /** Total units across the lines that can be bought. */
  itemCount: number;
  subtotalCents: number;
  subtotal: string;
  discountCents: number;
  discount: string;
  totalCents: number;
  total: string;
  /** True when at least one line is unpublished or out of stock. */
  hasUnavailable: boolean;
  /** True when at least one line is priced on request. */
  hasPriceOnRequest: boolean;
  /** A free-delivery code is applied; the delivery fee is waived at order time. */
  freeDelivery: boolean;
  discountCode: CartDiscount | null;
  /** True when there is nothing to show. */
  isEmpty: boolean;
  source: 'database' | 'unavailable';
};

/**
 * An empty cart.
 *
 * `source` is `unavailable` rather than `database` on purpose: a cart that could
 * not be read must not be presented as an empty cart, because that would tell a
 * customer their items are gone.
 */
export function emptyCartView(source: CartView['source'] = 'unavailable'): CartView {
  return {
    currency: 'USD',
    lines: [],
    lineCount: 0,
    itemCount: 0,
    subtotalCents: 0,
    subtotal: '',
    discountCents: 0,
    discount: '',
    totalCents: 0,
    total: '',
    hasUnavailable: false,
    hasPriceOnRequest: false,
    freeDelivery: false,
    discountCode: null,
    isEmpty: true,
    source,
  };
}
