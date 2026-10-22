import { describe, expect, it } from 'vitest';

import {
  addressSchema,
  authFieldErrors,
  changePasswordSchema,
  emailSchema,
  loginSchema,
  passwordSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
} from '@/lib/auth/validation';

/**
 * Authentication validation.
 *
 * These assert the properties the security of the account area depends on, not
 * merely that the schemas accept valid input. Three matter most:
 *
 *  1. An email is normalised, so one person cannot create two accounts that
 *     differ only in case — and a sign-in cannot miss on case alone.
 *  2. A password is capped at 72 bytes, because bcrypt truncates there and a
 *     longer password would mean two different strings authenticate the same
 *     account.
 *  3. Optional fields submitted as whitespace are accepted and folded to
 *     `undefined`, rather than being written to the database as `'   '`.
 */

describe('emailSchema', () => {
  it('lowercases and trims the address', () => {
    const result = emailSchema.parse('  Alice@Example.COM  ');
    expect(result).toBe('alice@example.com');
  });

  it('rejects an address without an @ or a domain', () => {
    expect(emailSchema.safeParse('alice').success).toBe(false);
    expect(emailSchema.safeParse('alice@').success).toBe(false);
    expect(emailSchema.safeParse('@example.com').success).toBe(false);
  });

  it('rejects an empty string with a message the customer can act on', () => {
    const result = emailSchema.safeParse('');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Enter a valid email address.');
  });

  it('rejects an address longer than the RFC 5321 maximum', () => {
    const long = `${'a'.repeat(250)}@example.com`;
    const result = emailSchema.safeParse(long);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('That email address is too long.');
  });
});

describe('passwordSchema', () => {
  it('requires twelve characters', () => {
    expect(passwordSchema.safeParse('12345678901').success).toBe(false);
    expect(passwordSchema.safeParse('123456789012').success).toBe(true);
  });

  it('rejects more than 72 characters, because bcrypt truncates there', () => {
    // Two passwords that share their first 72 characters must not both be
    // accepted: bcrypt would treat them as the same credential.
    const result = passwordSchema.safeParse('a'.repeat(73));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Use 72 characters or fewer.');
  });

  it('imposes no composition rule', () => {
    // A long passphrase with no symbol or digit is accepted. Composition rules
    // push people towards `Password1!` and away from the stronger phrase.
    expect(passwordSchema.safeParse('correct horse battery staple').success).toBe(true);
  });
});

describe('registerSchema', () => {
  const valid = { email: 'alice@example.com', password: 'correct horse battery' };

  it('accepts a registration with no name', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('folds an empty or whitespace-only name to undefined', () => {
    // The database column is nullable. Writing `''` or `'   '` would store a
    // name that renders as an empty gap in the account header.
    expect(registerSchema.parse({ ...valid, fullName: '' }).fullName).toBeUndefined();
    expect(registerSchema.parse({ ...valid, fullName: '   ' }).fullName).toBeUndefined();
  });

  it('trims a name that has surrounding whitespace', () => {
    expect(registerSchema.parse({ ...valid, fullName: '  Alice  ' }).fullName).toBe('Alice');
  });

  it('reports a bad email against the email field', () => {
    const result = registerSchema.safeParse({ ...valid, email: 'not-an-email' });
    const errors = authFieldErrors(result.error?.issues ?? []);
    expect(errors.email).toBe('Enter a valid email address.');
  });
});

describe('loginSchema', () => {
  it('requires a password but does not apply the registration length rule', () => {
    // A customer whose password predates the twelve-character rule must still be
    // able to sign in. Rejecting a short password here would lock them out with
    // no way to explain why.
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('reports a mismatch against the confirmation field', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'correct horse battery',
      confirmPassword: 'correct horse batteries',
    });
    expect(result.success).toBe(false);

    const errors = authFieldErrors(result.error?.issues ?? []);
    expect(errors.confirmPassword).toBe('Those passwords do not match.');
  });

  it('accepts a matching pair', () => {
    expect(
      resetPasswordSchema.safeParse({
        password: 'correct horse battery',
        confirmPassword: 'correct horse battery',
      }).success,
    ).toBe(true);
  });

  it('still enforces the length rule on the new password', () => {
    const result = resetPasswordSchema.safeParse({ password: 'short', confirmPassword: 'short' });
    expect(result.success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('requires the current password', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: '',
      password: 'correct horse battery',
      confirmPassword: 'correct horse battery',
    });
    expect(result.success).toBe(false);
    expect(authFieldErrors(result.error?.issues ?? []).currentPassword).toBe(
      'Enter your current password.',
    );
  });
});

describe('addressSchema', () => {
  const valid = {
    recipientName: 'Alice Smith',
    line1: '1 Watchmaker Lane',
    city: 'London',
    countryCode: 'GB',
  };

  it('accepts a minimal address', () => {
    expect(addressSchema.safeParse(valid).success).toBe(true);
  });

  it('uppercases the country code to satisfy the database constraint', () => {
    // `addresses_country_code_format` requires two uppercase letters. Rejecting
    // `gb` would be a confusing failure for something we can normalise.
    expect(addressSchema.parse({ ...valid, countryCode: 'gb' }).countryCode).toBe('GB');
  });

  it('rejects a country code that is not two letters', () => {
    expect(addressSchema.safeParse({ ...valid, countryCode: 'GBR' }).success).toBe(false);
    expect(addressSchema.safeParse({ ...valid, countryCode: '1B' }).success).toBe(false);
  });

  it('folds whitespace-only optional fields to undefined', () => {
    const parsed = addressSchema.parse({ ...valid, label: '   ', line2: '', region: '  ' });
    expect(parsed.label).toBeUndefined();
    expect(parsed.line2).toBeUndefined();
    expect(parsed.region).toBeUndefined();
  });

  it('requires the fields an address cannot do without', () => {
    for (const field of ['recipientName', 'line1', 'city'] as const) {
      const result = addressSchema.safeParse({ ...valid, [field]: '' });
      expect(result.success, `${field} should be required`).toBe(false);
    }
  });
});

describe('profileSchema', () => {
  it('coerces the marketing checkbox to a boolean', () => {
    // An unchecked checkbox is absent from FormData, and a checked one arrives as
    // the string 'on'. `z.coerce.boolean()` turns both into the right value.
    expect(profileSchema.parse({ marketingOptIn: 'on' }).marketingOptIn).toBe(true);
    expect(profileSchema.parse({}).marketingOptIn).toBe(false);
  });

  it('folds an empty phone number to undefined', () => {
    expect(profileSchema.parse({ phone: '' }).phone).toBeUndefined();
    expect(profileSchema.parse({ phone: '   ' }).phone).toBeUndefined();
  });
});

describe('authFieldErrors', () => {
  it('keeps only the first issue per field', () => {
    // A field with three complaints is worse to use than a field with one, and
    // the later issues are usually the same problem restated.
    const errors = authFieldErrors([
      { path: ['email'], message: 'first' },
      { path: ['email'], message: 'second' },
      { path: ['password'], message: 'third' },
    ]);

    expect(errors).toEqual({ email: 'first', password: 'third' });
  });

  it('keys a pathless issue as "form"', () => {
    // A refinement on the object rather than a field has an empty path. Without
    // a fallback key the message would be lost entirely.
    expect(authFieldErrors([{ path: [], message: 'Something is wrong' }])).toEqual({
      form: 'Something is wrong',
    });
  });
});
