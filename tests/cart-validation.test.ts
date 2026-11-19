import { describe, expect, it } from 'vitest';

import {
  addToCartSchema,
  applyDiscountSchema,
  mergeWishlistSchema,
  removeFromCartSchema,
  updateCartQuantitySchema,
  wishlistItemSchema,
} from '@/lib/cart/validation';

/**
 * The schemas that stand between a browser request and the server.
 *
 * -----------------------------------------------------------------------------
 * WHY THESE ARE WORTH TESTING SEPARATELY
 * -----------------------------------------------------------------------------
 *
 * Every cart and wishlist action parses its input through one of these before
 * touching the database, so they are the first line of the "do not trust the
 * client" rule. The database constraints are the guarantee — a quantity of zero
 * cannot be stored, a duplicate wishlist row cannot exist — but a request that
 * fails a constraint reaches the customer as a database error rather than a
 * sentence, and the action is written on the assumption that the schema already
 * rejected it.
 *
 * So these assert the rejection, not the acceptance: the acceptance paths are
 * covered by the SQL suites, which exercise the real constraints.
 *
 * `z.coerce.number()` is the part most worth pinning. It turns a string into a
 * number, which is what an HTML form sends, but it also means `''` becomes `0`
 * and `'abc'` becomes `NaN` — both of which must be rejected rather than stored
 * as a quantity. Those are the cases a hand-written validator usually misses.
 */

const PRODUCT_ID = 'e0000000-0000-4000-8000-000000000101';

describe('addToCartSchema', () => {
  it('accepts a product id and a default quantity of one', () => {
    const parsed = addToCartSchema.safeParse({ productId: PRODUCT_ID });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.quantity).toBe(1);
  });

  it('coerces the string a form actually sends', () => {
    const parsed = addToCartSchema.safeParse({ productId: PRODUCT_ID, quantity: '3' });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.quantity).toBe(3);
  });

  it.each([0, -1, -99])('rejects the non-positive quantity %i', (quantity) => {
    expect(addToCartSchema.safeParse({ productId: PRODUCT_ID, quantity }).success).toBe(false);
  });

  it('rejects a quantity above the schema maximum', () => {
    expect(addToCartSchema.safeParse({ productId: PRODUCT_ID, quantity: 100 }).success).toBe(false);
  });

  it('rejects a fractional quantity', () => {
    expect(addToCartSchema.safeParse({ productId: PRODUCT_ID, quantity: 1.5 }).success).toBe(false);
  });

  it('rejects an empty string, which coerces to zero', () => {
    // The classic coercion trap: `''` is not "no quantity", it is 0.
    expect(addToCartSchema.safeParse({ productId: PRODUCT_ID, quantity: '' }).success).toBe(false);
  });

  it('rejects a non-numeric quantity, which coerces to NaN', () => {
    expect(addToCartSchema.safeParse({ productId: PRODUCT_ID, quantity: 'lots' }).success).toBe(
      false,
    );
  });

  it('rejects a missing or malformed product id', () => {
    expect(addToCartSchema.safeParse({ quantity: 1 }).success).toBe(false);
    expect(addToCartSchema.safeParse({ productId: 'not-a-uuid' }).success).toBe(false);
    expect(addToCartSchema.safeParse({ productId: '' }).success).toBe(false);
  });
});

describe('updateCartQuantitySchema', () => {
  it('accepts a valid quantity', () => {
    expect(updateCartQuantitySchema.safeParse({ productId: PRODUCT_ID, quantity: 2 }).success).toBe(
      true,
    );
  });

  it.each([0, -1, 100])('rejects the out-of-range quantity %i', (quantity) => {
    expect(updateCartQuantitySchema.safeParse({ productId: PRODUCT_ID, quantity }).success).toBe(
      false,
    );
  });
});

describe('removeFromCartSchema', () => {
  it('accepts a product id alone', () => {
    expect(removeFromCartSchema.safeParse({ productId: PRODUCT_ID }).success).toBe(true);
  });

  it('rejects a malformed product id', () => {
    expect(removeFromCartSchema.safeParse({ productId: 'x' }).success).toBe(false);
  });
});

describe('applyDiscountSchema', () => {
  it('accepts an empty code, so the form can be submitted to clear one', () => {
    expect(applyDiscountSchema.safeParse({ code: '' }).success).toBe(true);
  });

  it('accepts a normal code', () => {
    expect(applyDiscountSchema.safeParse({ code: 'WELCOME10' }).success).toBe(true);
  });

  it('rejects a code longer than the column allows', () => {
    expect(applyDiscountSchema.safeParse({ code: 'A'.repeat(33) }).success).toBe(false);
  });

  it('trims surrounding whitespace rather than treating it as part of the code', () => {
    const parsed = applyDiscountSchema.safeParse({ code: '  WELCOME10  ' });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.code).toBe('WELCOME10');
  });

  it('carries no amount field, so a client cannot submit one', () => {
    // The schema's shape is the guard: there is nowhere for a price or a
    // discount amount to travel, whatever the request body contains.
    const parsed = applyDiscountSchema.safeParse({ code: 'WELCOME10', discount_cents: 999999 });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(Object.keys(parsed.data)).toEqual(['code']);
  });
});

describe('wishlistItemSchema', () => {
  it('accepts a product id', () => {
    expect(wishlistItemSchema.safeParse({ productId: PRODUCT_ID }).success).toBe(true);
  });

  it('rejects a malformed product id', () => {
    expect(wishlistItemSchema.safeParse({ productId: 'undefined' }).success).toBe(false);
  });
});

describe('mergeWishlistSchema', () => {
  it('accepts an empty list, so a guest with nothing saved can still sign in', () => {
    expect(mergeWishlistSchema.safeParse({ productIds: [] }).success).toBe(true);
  });

  it('does not deduplicate, because the database does and the request is bounded', () => {
    // Deliberate: the schema bounds the list and validates each id; the unique
    // constraint on `(wishlist_id, product_id)` is what makes a duplicate row
    // impossible. Postgres collapses a repeated row inside a single
    // `on conflict do nothing` insert, so a tampered list cannot create two
    // rows even though the array still holds two entries here. Asserting the
    // dedup here would test a guarantee this layer does not own — and would
    // pass whether or not the real guard existed.
    const parsed = mergeWishlistSchema.safeParse({
      productIds: [PRODUCT_ID, PRODUCT_ID, PRODUCT_ID],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.productIds).toHaveLength(3);
  });

  it('bounds the list, so a huge local list cannot become a huge request', () => {
    const many = Array.from(
      { length: 201 },
      (_, i) => `e0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );

    expect(mergeWishlistSchema.safeParse({ productIds: many }).success).toBe(false);
  });

  it('rejects a list containing a non-uuid entry', () => {
    expect(mergeWishlistSchema.safeParse({ productIds: [PRODUCT_ID, 'not-a-uuid'] }).success).toBe(
      false,
    );
  });
});
