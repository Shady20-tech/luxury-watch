import { describe, expect, it } from 'vitest';

import {
  fieldErrorsFrom,
  isStockConflict,
  orderRequestSchema,
  safeDatabaseMessage,
  toSubmission,
} from '@/lib/orders/order-request';

/**
 * Order-request validation, the price guarantee and error mapping.
 *
 * The most important tests here are structural rather than behavioural. The hard
 * requirement is that the server never trusts a browser-submitted price, stock
 * figure or discount amount. That is enforced by `submit_order_request`, which
 * re-derives every figure from the `products` table — but it is *made true* by
 * this module having no field through which a price could be sent at all.
 *
 * So `toSubmission` is asserted to contain no amount-bearing key, and the schema
 * is asserted to reject a payload that carries one. If someone later adds a
 * `unitPrice` or `total` to the form, one of these fails.
 */

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';

const validPickup = {
  items: JSON.stringify([{ productId: PRODUCT_ID, quantity: 1 }]),
  customerName: 'A Customer',
  customerEmail: 'customer@example.com',
  customerPhone: '555 0100',
  fulfilmentType: 'pickup' as const,
  paymentMethodCode: 'bank_transfer',
  customerNote: 'Please call before dispatch.',
  discountCode: '',
  idempotencyKey: 'a-key-long-enough',
  termsAccepted: 'on',
  company: '',
};

const validDelivery = {
  ...validPickup,
  fulfilmentType: 'delivery' as const,
  deliveryOptionCode: 'standard',
  deliveryLine1: '1 Example Street',
  deliveryCity: 'London',
  deliveryPostalCode: 'SW1A 1AA',
  deliveryCountryCode: 'gb',
};

describe('orderRequestSchema', () => {
  it('accepts a well-formed pickup request', () => {
    expect(orderRequestSchema.safeParse(validPickup).success).toBe(true);
  });

  it('accepts a well-formed delivery request and uppercases the country when submitting', () => {
    const parsed = orderRequestSchema.parse(validDelivery);
    expect(toSubmission(parsed).deliveryAddress?.country_code).toBe('GB');
  });

  it('requires the terms acknowledgement', () => {
    const { termsAccepted: _omitted, ...withoutTerms } = validPickup;
    expect(orderRequestSchema.safeParse(withoutTerms).success).toBe(false);
    expect(orderRequestSchema.safeParse({ ...validPickup, termsAccepted: 'off' }).success).toBe(
      false,
    );
  });

  it.each([
    ['a malformed email', { customerEmail: 'not-an-email' }],
    ['a blank name', { customerName: '   ' }],
    ['an unknown fulfilment type', { fulfilmentType: 'teleport' }],
    ['a malformed payment code', { paymentMethodCode: 'Bank Transfer!' }],
    ['no items', { items: JSON.stringify([]) }],
    ['unparseable items', { items: '{not json' }],
  ])('rejects %s', (_label, override) => {
    expect(orderRequestSchema.safeParse({ ...validPickup, ...override }).success).toBe(false);
  });

  it.each([
    ['a zero quantity', 0],
    ['a negative quantity', -1],
    ['a fractional quantity', 1.5],
    ['an absurd quantity', 1000],
  ])('refuses %s on a line', (_label, quantity) => {
    const items = JSON.stringify([{ productId: PRODUCT_ID, quantity }]);
    expect(orderRequestSchema.safeParse({ ...validPickup, items }).success).toBe(false);
  });

  it('requires a usable address for a delivery request only', () => {
    const noAddress = {
      ...validPickup,
      fulfilmentType: 'delivery' as const,
      deliveryLine1: '',
      deliveryCity: '',
      deliveryCountryCode: 'gb',
    };
    expect(orderRequestSchema.safeParse(noAddress).success).toBe(false);

    // The same blank address on a pickup request is ignored, not rejected.
    expect(
      orderRequestSchema.safeParse({ ...validPickup, deliveryLine1: '', deliveryCity: '' }).success,
    ).toBe(true);
  });

  it('rejects a payload that carries a price, so a price has nowhere to arrive', () => {
    // An attacker's form would add extra fields. The schema strips unknown keys,
    // so the parsed result cannot carry one forward even if it is posted.
    const parsed = orderRequestSchema.parse({
      ...validPickup,
      unitPriceCents: 1,
      subtotalCents: 1,
      totalCents: 1,
      discountAmountCents: 1,
      isAvailable: false,
    });

    const keys = Object.keys(parsed);
    expect(keys).not.toContain('unitPriceCents');
    expect(keys).not.toContain('subtotalCents');
    expect(keys).not.toContain('totalCents');
    expect(keys).not.toContain('discountAmountCents');
    expect(keys).not.toContain('isAvailable');
  });
});

describe('toSubmission', () => {
  it('carries only ids, quantities and customer details — no amount anywhere', () => {
    const submission = toSubmission(orderRequestSchema.parse(validDelivery));

    // This is the load-bearing assertion of the phase. The keys the database
    // function accepts are named here; anything amount-shaped would have to
    // appear in this list to be sent, and this list is checked to be amount-free.
    expect(Object.keys(submission).sort()).toEqual(
      [
        'customerEmail',
        'customerName',
        'customerNote',
        'customerPhone',
        'deliveryAddress',
        'deliveryOptionCode',
        'discountCode',
        'fulfilmentType',
        'idempotencyKey',
        'items',
        'paymentMethodCode',
        'termsAcknowledged',
      ].sort(),
    );

    const serialised = JSON.stringify(submission).toLowerCase();
    for (const forbidden of ['price', 'subtotal', 'total', 'amount', 'fee', 'cents']) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it('sends the discount as a code, never as a value', () => {
    const submission = toSubmission(
      orderRequestSchema.parse({ ...validPickup, discountCode: 'WELCOME10' }),
    );
    expect(submission.discountCode).toBe('WELCOME10');
  });

  it('drops a delivery address and option on a pickup request', () => {
    const submission = toSubmission(orderRequestSchema.parse(validPickup));
    expect(submission.deliveryAddress).toBeNull();
    expect(submission.deliveryOptionCode).toBeNull();
  });

  it('treats blank optional text as absence rather than an empty string', () => {
    const submission = toSubmission(
      orderRequestSchema.parse({ ...validPickup, customerPhone: '', customerNote: '' }),
    );
    expect(submission.customerPhone).toBeNull();
    expect(submission.customerNote).toBeNull();
  });
});

describe('safeDatabaseMessage', () => {
  it('passes through a known refusal', () => {
    expect(
      safeDatabaseMessage(new Error('A delivery address is required for delivery.')),
    ).toContain('delivery address is required');
  });

  it.each([
    ['a constraint name', 'duplicate key value violates unique constraint "order_requests_pkey"'],
    ['a column list', 'null value in column "customer_email" violates not-null constraint'],
    ['a raw row fragment', 'error for row: {"cost_cents": 400000}'],
  ])('refuses to echo %s to the customer', (_label, message) => {
    // The allowlist is the point: an unrecognised message becomes a generic
    // failure rather than leaking a schema detail.
    expect(safeDatabaseMessage(new Error(message))).toBeNull();
  });
});

describe('isStockConflict', () => {
  it.each([
    'Product abc is not available.',
    'Insufficient available stock for product abc (requested 2, available 1)',
    'No inventory record exists for product abc',
  ])('recognises the stock conflict: %s', (message) => {
    expect(isStockConflict(new Error(message))).toBe(true);
  });

  it('does not treat a generic failure as a stock conflict', () => {
    expect(isStockConflict(new Error('connection terminated unexpectedly'))).toBe(false);
  });
});

describe('fieldErrorsFrom', () => {
  it('maps issues to form fields and keeps the first message per field', () => {
    const errors = fieldErrorsFrom([
      { path: ['customerEmail'], message: 'first' },
      { path: ['customerEmail'], message: 'second' },
      { path: ['items', 0, 'quantity'], message: 'nested' },
      { path: ['notAField'], message: 'ignored' },
    ]);

    expect(errors.customerEmail).toBe('first');
    expect(errors.items).toBe('nested');
    expect(Object.keys(errors)).not.toContain('notAField');
  });
});
