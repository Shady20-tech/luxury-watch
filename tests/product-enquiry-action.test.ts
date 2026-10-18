import { describe, expect, it } from 'vitest';

import { enquirySchema, safeDatabaseMessage } from '@/lib/product/enquiry';

/**
 * Enquiry validation and error mapping.
 *
 * `safeDatabaseMessage` is the only thing standing between a raw Postgres error
 * and the page. A database error can carry a constraint name, a column list or a
 * fragment of the row it rejected, so the rule is an allowlist, not a denylist:
 * an unrecognised message becomes a generic failure. These tests pin that
 * direction, because a denylist would pass the happy path and quietly leak
 * everything else.
 */

const validEnquiry = {
  productSlug: 'test-watch',
  name: 'A Customer',
  email: 'customer@example.com',
  phone: '555 0100',
  message: 'Is this watch still available?',
  company: '',
};

describe('enquirySchema', () => {
  it('accepts a well-formed enquiry', () => {
    expect(enquirySchema.safeParse(validEnquiry).success).toBe(true);
  });

  it('treats an absent phone number as optional', () => {
    const { phone: _phone, ...withoutPhone } = validEnquiry;
    expect(enquirySchema.safeParse(withoutPhone).success).toBe(true);
  });

  it.each([
    ['a blank name', { name: '   ' }],
    ['a malformed email', { email: 'not-an-email' }],
    ['a blank message', { message: '  ' }],
    ['an over-long message', { message: 'x'.repeat(8001) }],
  ])('rejects %s', (_label, override) => {
    expect(enquirySchema.safeParse({ ...validEnquiry, ...override }).success).toBe(false);
  });

  it('trims surrounding whitespace before storing', () => {
    const parsed = enquirySchema.parse({ ...validEnquiry, name: '  A Customer  ' });
    expect(parsed.name).toBe('A Customer');
  });
});

describe('safeDatabaseMessage', () => {
  it('passes through the known rate-limit message', () => {
    // The allowlist matches the exact sentence the SQL function raises, so the
    // fixture must be that sentence rather than a paraphrase of it.
    expect(
      safeDatabaseMessage(
        new Error(
          'Too many enquiries have been submitted from this address. Please try again later.',
        ),
      ),
    ).toContain('Too many enquiries');
  });

  it('passes through the unknown-product message', () => {
    expect(safeDatabaseMessage(new Error('Unknown product'))).toBe('Unknown product');
  });

  it('hides an unrecognised database error', () => {
    expect(
      safeDatabaseMessage(
        new Error('duplicate key value violates unique constraint "product_questions_email_key"'),
      ),
    ).toBeNull();
  });

  it('hides a message that merely contains a column name', () => {
    expect(
      safeDatabaseMessage(new Error('null value in column "cost_cents" violates not-null')),
    ).toBeNull();
  });

  it('handles a non-Error throw without leaking it', () => {
    expect(safeDatabaseMessage('some raw string')).toBeNull();
    expect(safeDatabaseMessage(undefined)).toBeNull();
  });
});
