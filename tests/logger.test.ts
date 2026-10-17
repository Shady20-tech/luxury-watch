import { describe, expect, it } from 'vitest';

import { redact } from '@/lib/logger';

/**
 * Redaction is a security control, so it is tested against the exact key names
 * this project uses rather than only synthetic examples.
 */
describe('redact', () => {
  it('redacts the Supabase service-role key by its configured name', () => {
    const result = redact({ SUPABASE_SERVICE_ROLE_KEY: 'super-secret-value' }) as Record<
      string,
      unknown
    >;
    expect(result.SUPABASE_SERVICE_ROLE_KEY).toBe('[redacted]');
  });

  it('redacts camelCase and snake_case secret keys alike', () => {
    const result = redact({
      supabaseServiceRoleKey: 'a',
      supabase_service_role_key: 'b',
      RESEND_API_KEY: 'c',
      resendApiKey: 'd',
      revalidationSecret: 'e',
      REVALIDATION_SECRET: 'f',
    }) as Record<string, unknown>;

    for (const value of Object.values(result)) {
      expect(value).toBe('[redacted]');
    }
  });

  it('redacts anything containing a payment credential field name', () => {
    const result = redact({
      cardNumber: '4111111111111111',
      cvv: '123',
      password: 'hunter2',
      authorization: 'Bearer token',
      cookie: 'session=abc',
    }) as Record<string, unknown>;

    for (const value of Object.values(result)) {
      expect(value).toBe('[redacted]');
    }
  });

  it('keeps ordinary values that are not sensitive', () => {
    const result = redact({ slug: 'rolex-submariner', quantity: 2, inStock: true }) as Record<
      string,
      unknown
    >;
    expect(result).toEqual({ slug: 'rolex-submariner', quantity: 2, inStock: true });
  });

  it('redacts sensitive keys nested inside objects and arrays', () => {
    const result = redact({
      cart: { items: [{ sku: 'X1', token: 'leak-me' }] },
      headers: { Authorization: 'leak-me-too' },
    });

    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('leak-me');
    expect(serialised).toContain('X1');
  });

  it('reduces an Error to its name and message without a stack trace', () => {
    const result = redact(new Error('database connection refused')) as Record<string, unknown>;
    expect(result).toEqual({ name: 'Error', message: 'database connection refused' });
    expect(JSON.stringify(result)).not.toContain('at ');
  });

  it('truncates deeply nested structures rather than recursing without limit', () => {
    let deep: unknown = 'leaf';
    for (let i = 0; i < 20; i += 1) deep = { nested: deep };
    expect(JSON.stringify(redact(deep))).toContain('truncated');
  });

  it('caps array length so one large payload cannot flood a log line', () => {
    const result = redact({ items: Array.from({ length: 500 }, (_, i) => i) }) as {
      items: unknown[];
    };
    expect(result.items).toHaveLength(50);
  });

  it('passes null and undefined through unchanged', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });
});
