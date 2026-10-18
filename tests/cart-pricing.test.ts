import { describe, expect, it } from 'vitest';

import {
  cartBadgeCount,
  isQuantityPermitted,
  quantityOptions,
  toCartView,
  type CartPricingPayload,
} from '@/lib/cart/pricing';

/**
 * Cart pricing mapper.
 *
 * `toCartView` is a mapper, not a calculation: it renames and formats what
 * `cart_pricing` returned and decides nothing. That is the property these tests
 * pin. A malformed or absent field must fall to the safe direction — an
 * unreadable price becomes "priced on request", an unreadable availability
 * becomes "not available", a payload that is not an object becomes the
 * *unavailable* empty cart rather than an empty one the customer believes is
 * real.
 *
 * The distinction between "empty" and "unavailable" is asserted directly,
 * because collapsing it would tell a customer their cart had been lost.
 */

/** A `cart_pricing` payload for one available, priced line. */
function payload(overrides: Partial<CartPricingPayload> = {}): CartPricingPayload {
  return {
    currency: 'USD',
    lines: [
      {
        product_id: '11111111-1111-1111-1111-111111111111',
        slug: 'test-watch',
        title: 'Test Watch',
        sku: 'LW-1',
        brand_name: 'Test Brand',
        brand_slug: 'test-brand',
        image_storage_path: null,
        image_external_url: null,
        image_alt: 'A test watch',
        price_on_request: false,
        unit_price_cents: 1250000,
        quantity: 1,
        quantity_locked: true,
        quantity_adjusted: false,
        line_total_cents: 1250000,
        is_available: true,
        product_status: 'ok',
      },
    ],
    line_count: 1,
    item_count: 1,
    subtotal_cents: 1250000,
    discount_cents: 0,
    total_cents: 1250000,
    has_unavailable: false,
    has_price_on_request: false,
    free_delivery: false,
    discount: null,
    ...overrides,
  };
}

const resolveImage = () => null;

describe('toCartView', () => {
  it('formats the totals from the payload rather than recomputing them', () => {
    const view = toCartView(payload(), resolveImage);

    expect(view.subtotal).toBe('$12,500');
    expect(view.total).toBe('$12,500');
    expect(view.subtotalCents).toBe(1250000);
    expect(view.itemCount).toBe(1);
    expect(view.source).toBe('database');
    expect(view.isEmpty).toBe(false);
  });

  it('maps a line to a view model with a resolved href', () => {
    const view = toCartView(payload(), resolveImage);
    const line = view.lines[0];

    expect(line?.productId).toBe('11111111-1111-1111-1111-111111111111');
    expect(line?.href).toBe('/products/test-watch');
    expect(line?.unitPrice).toBe('$12,500');
    expect(line?.quantityLocked).toBe(true);
    expect(line?.purchasable).toBe(true);
  });

  it('reports a price-on-request line with no price at all', () => {
    const view = toCartView(
      payload({
        lines: [
          {
            ...(payload().lines as Record<string, unknown>[])[0],
            price_on_request: true,
            unit_price_cents: null,
            line_total_cents: 0,
          },
        ],
        has_price_on_request: true,
        subtotal_cents: 0,
        total_cents: 0,
      }),
      resolveImage,
    );

    // A zero would be a fabricated price. `null` is the only honest value.
    expect(view.lines[0]?.unitPrice).toBeNull();
    expect(view.lines[0]?.lineTotal).toBeNull();
    expect(view.lines[0]?.unitPriceCents).toBeNull();
    expect(view.hasPriceOnRequest).toBe(true);
  });

  it('marks an unpublished line as not purchasable without dropping it', () => {
    const view = toCartView(
      payload({
        lines: [
          {
            ...(payload().lines as Record<string, unknown>[])[0],
            product_status: 'unpublished',
            is_available: false,
          },
        ],
        has_unavailable: true,
      }),
      resolveImage,
    );

    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]?.status).toBe('unpublished');
    expect(view.lines[0]?.purchasable).toBe(false);
    expect(view.hasUnavailable).toBe(true);
  });

  it('marks an out-of-stock line as not purchasable but still present', () => {
    const view = toCartView(
      payload({
        lines: [{ ...(payload().lines as Record<string, unknown>[])[0], is_available: false }],
        has_unavailable: true,
      }),
      resolveImage,
    );

    expect(view.lines[0]?.isAvailable).toBe(false);
    expect(view.lines[0]?.purchasable).toBe(false);
  });

  it('returns the unavailable cart for a payload that is not an object', () => {
    // A failed RPC must never render as a genuine empty cart.
    expect(toCartView(null, resolveImage).source).toBe('unavailable');
    expect(toCartView(undefined, resolveImage).source).toBe('unavailable');
  });

  it('reports an empty but answered cart as a database-sourced empty cart', () => {
    const view = toCartView(payload({ lines: [], line_count: 0, item_count: 0 }), resolveImage);

    expect(view.isEmpty).toBe(true);
    // The distinction the UI depends on: this is a real empty cart.
    expect(view.source).toBe('database');
  });

  it('carries an applied discount through with its amount', () => {
    const view = toCartView(
      payload({
        discount_cents: 125000,
        total_cents: 1125000,
        discount: {
          code: 'WELCOME',
          label: '10% off',
          kind: 'percentage',
          applied: true,
          amount_cents: 125000,
        },
      }),
      resolveImage,
    );

    expect(view.discountCode?.code).toBe('WELCOME');
    expect(view.discountCode?.applied).toBe(true);
    expect(view.discountCents).toBe(125000);
    expect(view.total).toBe('$11,250');
  });

  it('carries a rejected discount through with its reason', () => {
    const view = toCartView(
      payload({
        discount: {
          code: 'EXPIRED',
          label: 'Expired',
          kind: 'percentage',
          applied: false,
          amount_cents: 0,
          reason: 'This code has expired.',
        },
      }),
      resolveImage,
    );

    expect(view.discountCode?.applied).toBe(false);
    expect(view.discountCode?.reason).toBe('This code has expired.');
    // Nothing was taken off, so the total is unchanged.
    expect(view.discountCents).toBe(0);
  });

  it('drops a malformed line rather than rendering a nameless row', () => {
    const view = toCartView(payload({ lines: [{ quantity: 1 }, null, 'nonsense'] }), resolveImage);

    expect(view.lines).toEqual([]);
  });

  it('coerces a bigint returned as a string, as PostgREST does', () => {
    const view = toCartView(
      payload({ subtotal_cents: '1250000', total_cents: '1250000' }),
      resolveImage,
    );

    expect(view.subtotalCents).toBe(1250000);
    expect(view.total).toBe('$12,500');
  });
});

describe('quantityOptions', () => {
  it('offers exactly one for a locked line', () => {
    expect(quantityOptions({ quantityLocked: true })).toEqual([1]);
  });

  it('offers the schema range for an unlocked line', () => {
    const options = quantityOptions({ quantityLocked: false });

    expect(options[0]).toBe(1);
    expect(options.at(-1)).toBe(99);
    expect(options).toHaveLength(99);
  });
});

describe('isQuantityPermitted', () => {
  it('rejects zero, a negative and a fraction', () => {
    expect(isQuantityPermitted({ quantityLocked: false }, 0)).toBe(false);
    expect(isQuantityPermitted({ quantityLocked: false }, -1)).toBe(false);
    expect(isQuantityPermitted({ quantityLocked: false }, 1.5)).toBe(false);
  });

  it('rejects more than one for a locked line', () => {
    expect(isQuantityPermitted({ quantityLocked: true }, 1)).toBe(true);
    expect(isQuantityPermitted({ quantityLocked: true }, 2)).toBe(false);
  });

  it('allows up to the schema maximum for an unlocked line', () => {
    expect(isQuantityPermitted({ quantityLocked: false }, 99)).toBe(true);
    expect(isQuantityPermitted({ quantityLocked: false }, 100)).toBe(false);
  });
});

describe('cartBadgeCount', () => {
  it('never returns a negative or fractional count', () => {
    expect(cartBadgeCount({ itemCount: 0 })).toBe(0);
    expect(cartBadgeCount({ itemCount: -3 })).toBe(0);
    expect(cartBadgeCount({ itemCount: 2.7 })).toBe(2);
  });
});
