import { describe, expect, it } from 'vitest';

import { availableTransitions, isTerminalStatus } from '@/lib/admin/order-lifecycle';
import {
  adminFieldErrors,
  orderTransitionSchema,
  productFormSchema,
  stockAdjustmentSchema,
} from '@/lib/admin/validation';

/**
 * The admin form rules, as opposed to the database rules.
 *
 * `60_admin_operations.sql` and `61_admin_write_paths.sql` prove the database
 * refuses a bad change. This file proves the *form* refuses it first, so the
 * administrator sees a sentence about the field rather than a constraint name or
 * a raw SQLSTATE. The two layers are deliberately redundant; a rule that exists
 * only in the form can be bypassed by posting directly to the action, and a rule
 * that exists only in the database produces a poor error message.
 */

/** A product form payload that is valid except for whatever a test changes. */
function validProduct(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    title: 'Submariner Date',
    slug: 'submariner-date',
    sku: 'SKU-1',
    status: 'draft',
    priceCents: '1200000',
    priceOnRequest: '',
    isFeatured: '',
    boxAndPapers: 'unknown',
    ...overrides,
  };
}

describe('productFormSchema', () => {
  /**
   * A payload with only the fields a browser definitely submits. Every optional
   * input left blank is *absent* here, not empty, because that is what
   * `Object.fromEntries(new FormData(...))` produces and what a browser sends
   * for an unchecked checkbox. This is the shape that broke: the first version of
   * the schema used `z.string()` and `z.coerce.boolean()` for optional fields,
   * both of which reject `undefined`, so no product could be saved at all.
   */
  it('accepts a payload with every optional field absent', () => {
    const parsed = productFormSchema.safeParse({
      title: 'Submariner Date',
      slug: 'submariner-date',
      sku: 'SKU-1',
      status: 'draft',
      priceCents: '1200000',
      boxAndPapers: 'unknown',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.priceOnRequest).toBe(false);
      expect(parsed.data.isFeatured).toBe(false);
      expect(parsed.data.brandId).toBeUndefined();
      expect(parsed.data.productionYear).toBeUndefined();
    }
  });

  it('treats an absent checkbox as false and a present one as true', () => {
    const base = {
      title: 'Submariner Date',
      slug: 'submariner-date',
      sku: 'SKU-1',
      status: 'draft',
      priceCents: '1200000',
      boxAndPapers: 'unknown',
    };

    const absent = productFormSchema.safeParse(base);
    expect(absent.success && absent.data.isFeatured).toBe(false);

    const present = productFormSchema.safeParse({ ...base, isFeatured: 'on' });
    expect(present.success && present.data.isFeatured).toBe(true);
  });

  it('accepts a priced product', () => {
    const parsed = productFormSchema.safeParse(validProduct());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.priceCents).toBe(1_200_000);
  });

  it('treats an empty numeric field as absent, not as zero', () => {
    const parsed = productFormSchema.safeParse(
      validProduct({ priceCents: '1200000', productionYear: '' }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.productionYear).toBeUndefined();
  });

  it('rejects a price of zero', () => {
    const parsed = productFormSchema.safeParse(validProduct({ priceCents: '0' }));
    expect(parsed.success).toBe(false);
  });

  it('rejects a non-integer price', () => {
    const parsed = productFormSchema.safeParse(validProduct({ priceCents: '1200000.5' }));
    expect(parsed.success).toBe(false);
  });

  it('rejects exponent notation in a numeric field', () => {
    // `Number('1e9')` is a perfectly good number, which is exactly why the
    // schema checks the *string* before converting it.
    const parsed = productFormSchema.safeParse(validProduct({ priceCents: '1e9' }));
    expect(parsed.success).toBe(false);
  });

  it('requires a price when the item is not sold by enquiry', () => {
    const parsed = productFormSchema.safeParse(validProduct({ priceCents: '' }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(adminFieldErrors(parsed.error.issues).priceCents).toMatch(/sold by enquiry/);
    }
  });

  it('accepts an enquiry-only product with no price', () => {
    const parsed = productFormSchema.safeParse(
      validProduct({ priceCents: '', priceOnRequest: 'on' }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.priceOnRequest).toBe(true);
  });

  it('refuses a price on an enquiry-only product', () => {
    // The two would disagree on the storefront, so the form refuses the
    // combination rather than letting a template pick one.
    const parsed = productFormSchema.safeParse(
      validProduct({ priceCents: '1200000', priceOnRequest: 'on' }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(adminFieldErrors(parsed.error.issues).priceCents).toMatch(/Clear the price/);
    }
  });

  it('requires a compare-at price to be higher than the price', () => {
    const parsed = productFormSchema.safeParse(
      validProduct({ priceCents: '1200000', compareAtCents: '1000000' }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(adminFieldErrors(parsed.error.issues).compareAtCents).toMatch(/higher/);
    }
  });

  it('rejects an uppercase or underscored slug', () => {
    for (const slug of ['Submariner', 'sub_mariner', 'sub--mariner', '-leading']) {
      expect(productFormSchema.safeParse(validProduct({ slug })).success, slug).toBe(false);
    }
  });

  it('accepts a lowercase hyphenated slug', () => {
    expect(
      productFormSchema.safeParse(validProduct({ slug: 'submariner-date-41mm' })).success,
    ).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(productFormSchema.safeParse(validProduct({ status: 'live' })).success).toBe(false);
  });

  it('rejects an unknown condition', () => {
    expect(productFormSchema.safeParse(validProduct({ condition: 'mint' })).success).toBe(false);
  });

  it('accepts a blank condition as "not recorded"', () => {
    const parsed = productFormSchema.safeParse(validProduct({ condition: '' }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.condition).toBeUndefined();
  });

  it('rejects a social image URL that is not http(s)', () => {
    expect(
      productFormSchema.safeParse(validProduct({ ogImageUrl: 'javascript:alert(1)' })).success,
    ).toBe(false);
  });

  it('rejects a production year outside a plausible range', () => {
    expect(productFormSchema.safeParse(validProduct({ productionYear: '1200' })).success).toBe(
      false,
    );
  });
});

describe('stockAdjustmentSchema', () => {
  const base = {
    productId: '00000000-0000-4000-8000-000000000001',
    note: 'Stock count correction',
  };

  it('accepts a positive and a negative delta', () => {
    expect(stockAdjustmentSchema.safeParse({ ...base, delta: '3' }).success).toBe(true);
    expect(stockAdjustmentSchema.safeParse({ ...base, delta: '-2' }).success).toBe(true);
  });

  it('refuses a zero adjustment', () => {
    const parsed = stockAdjustmentSchema.safeParse({ ...base, delta: '0' });
    expect(parsed.success).toBe(false);
  });

  it('refuses a non-integer delta', () => {
    expect(stockAdjustmentSchema.safeParse({ ...base, delta: '1.5' }).success).toBe(false);
  });

  it('refuses an adjustment larger than the bound', () => {
    expect(stockAdjustmentSchema.safeParse({ ...base, delta: '999999' }).success).toBe(false);
  });

  it('requires a reason', () => {
    const parsed = stockAdjustmentSchema.safeParse({ ...base, delta: '1', note: 'x' });
    expect(parsed.success).toBe(false);
  });
});

describe('orderTransitionSchema', () => {
  it('accepts a known status', () => {
    const parsed = orderTransitionSchema.safeParse({
      orderId: '00000000-0000-4000-8000-000000000001',
      toStatus: 'confirmed',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const parsed = orderTransitionSchema.safeParse({
      orderId: '00000000-0000-4000-8000-000000000001',
      toStatus: 'shipped',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a malformed order id', () => {
    const parsed = orderTransitionSchema.safeParse({
      orderId: 'not-a-uuid',
      toStatus: 'confirmed',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('availableTransitions', () => {
  it('offers no way out of a terminal state', () => {
    for (const status of ['fulfilled', 'cancelled', 'rejected'] as const) {
      expect(isTerminalStatus(status)).toBe(true);
      expect(availableTransitions(status, true)).toEqual([]);
    }
  });

  it('hides settlement from a caller without orders.settle', () => {
    const withoutSettle = availableTransitions('confirmed', false);
    expect(withoutSettle.some((t) => t.to === 'paid_offline')).toBe(false);

    const withSettle = availableTransitions('confirmed', true);
    expect(withSettle.some((t) => t.to === 'paid_offline')).toBe(true);
  });

  it('offers only fulfilment from paid_offline', () => {
    const transitions = availableTransitions('paid_offline', true);
    expect(transitions.map((t) => t.to)).toEqual(['fulfilled']);
  });

  it('never offers a transition to the current status', () => {
    for (const status of [
      'submitted',
      'under_review',
      'confirmed',
      'awaiting_payment',
      'paid_offline',
    ] as const) {
      expect(
        availableTransitions(status, true).some((t) => t.to === status),
        status,
      ).toBe(false);
    }
  });
});

describe('adminFieldErrors', () => {
  it('keeps only the first complaint about a field', () => {
    const errors = adminFieldErrors([
      { path: ['title'], message: 'first' },
      { path: ['title'], message: 'second' },
      { path: ['slug'], message: 'slug issue' },
    ]);
    expect(errors).toEqual({ title: 'first', slug: 'slug issue' });
  });
});
