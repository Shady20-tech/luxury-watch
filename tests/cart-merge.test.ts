import { describe, expect, it } from 'vitest';

import { clampQuantity, mergeCartLines, mergeIds } from '@/lib/cart/merge';

/**
 * Merge semantics.
 *
 * The brief asks for move-to-cart and sign-in merge to work "without duplicating
 * or silently dropping items", and that is a claim about these pure functions.
 * They are tested exhaustively here because they are the part of the merge that
 * is easy to get subtly wrong, and because a bug would only surface with a real
 * signed-in account holding a real cart — the hardest state to reproduce.
 *
 * Every case below is a "nothing lost, nothing duplicated" assertion.
 */

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

describe('mergeIds', () => {
  it('appends the incoming ids that are not already present', () => {
    expect(mergeIds([A], [B, C])).toEqual([A, B, C]);
  });

  it('does not duplicate an id present in both lists', () => {
    expect(mergeIds([A, B], [B, C])).toEqual([A, B, C]);
  });

  it('compares case-insensitively, as Postgres does for a UUID', () => {
    expect(mergeIds([A], [A.toUpperCase()])).toEqual([A]);
  });

  it('keeps the existing order and drops nothing', () => {
    const existing = [B, A];
    const incoming = [C, A, B];

    expect(mergeIds(existing, incoming)).toEqual([B, A, C]);
  });

  it('handles an empty side without losing the other', () => {
    expect(mergeIds([], [A, B])).toEqual([A, B]);
    expect(mergeIds([A, B], [])).toEqual([A, B]);
    expect(mergeIds([], [])).toEqual([]);
  });
});

describe('clampQuantity', () => {
  it('floors a value below one to one', () => {
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(-5)).toBe(1);
  });

  it('caps at the schema maximum', () => {
    expect(clampQuantity(500)).toBe(99);
    expect(clampQuantity(500, 5)).toBe(5);
  });

  it('truncates a fractional value', () => {
    expect(clampQuantity(2.9)).toBe(2);
  });

  it('treats a non-finite value as one rather than propagating it', () => {
    // `Infinity` is not a quantity; falling back to one can only under-offer,
    // and the database would clamp it again anyway.
    expect(clampQuantity(Number.NaN)).toBe(1);
    expect(clampQuantity(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('mergeCartLines', () => {
  it('carries a line present in only one cart across unchanged', () => {
    const merged = mergeCartLines([{ productId: A, quantity: 1 }], [{ productId: B, quantity: 2 }]);

    expect(merged).toEqual([
      { productId: A, quantity: 1 },
      { productId: B, quantity: 2 },
    ]);
  });

  it('keeps the larger quantity when a product is in both carts', () => {
    const merged = mergeCartLines([{ productId: A, quantity: 1 }], [{ productId: A, quantity: 3 }]);

    // Taking either side alone would drop items the customer added on the other
    // side of the sign-in boundary.
    expect(merged).toEqual([{ productId: A, quantity: 3 }]);
  });

  it('keeps the account quantity when it is the larger one', () => {
    const merged = mergeCartLines([{ productId: A, quantity: 4 }], [{ productId: A, quantity: 2 }]);

    expect(merged).toEqual([{ productId: A, quantity: 4 }]);
  });

  it('produces one line per product, so a merge cannot duplicate', () => {
    const merged = mergeCartLines(
      [{ productId: A, quantity: 1 }],
      [{ productId: A.toUpperCase(), quantity: 1 }],
    );

    expect(merged).toHaveLength(1);
  });

  it('caps a merged quantity at the schema maximum', () => {
    const merged = mergeCartLines(
      [{ productId: A, quantity: 99 }],
      [{ productId: A, quantity: 99 }],
    );

    expect(merged[0]?.quantity).toBe(99);
  });

  it('is a no-op when the guest cart is empty', () => {
    const account = [{ productId: A, quantity: 1 }];

    expect(mergeCartLines(account, [])).toEqual(account);
  });

  it('keeps the account order for products in both carts', () => {
    const merged = mergeCartLines(
      [
        { productId: A, quantity: 1 },
        { productId: B, quantity: 1 },
      ],
      [{ productId: B, quantity: 2 }],
    );

    expect(merged.map((line) => line.productId)).toEqual([A, B]);
  });
});
