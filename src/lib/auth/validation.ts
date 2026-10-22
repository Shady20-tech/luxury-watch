/**
 * Validation and result types for the authentication server actions.
 *
 * Kept out of the `'use server'` modules deliberately, exactly as the cart and
 * wishlist validation is: a `'use server'` module may only export async
 * functions, so schemas and state types cannot live there and still be unit
 * tested. This module is pure — no database access, no Supabase client — so it
 * can be imported by a test without a server.
 *
 * -----------------------------------------------------------------------------
 * WHY THE MESSAGES HERE ARE DELIBERATELY VAGUE
 * -----------------------------------------------------------------------------
 *
 * An authentication form is an oracle. If it answers "no account with that
 * email" differently from "wrong password", anyone can feed it a list of
 * addresses and learn which ones have accounts — and for a business selling
 * high-value watches, the customer list is itself worth having.
 *
 * So the login and password-reset paths return the same message for every
 * failure, and the field-level errors below are reserved for things the
 * *submitter* controls (a malformed address, a short password). Nothing here
 * distinguishes "unknown account" from "wrong credentials".
 */

import { z } from 'zod';

/**
 * An optional, trimmed string.
 *
 * `.or(z.literal(''))` looks like the obvious way to allow an empty value and is
 * wrong: the empty string is not trimmed before the branch is chosen, so `'  '`
 * fails both branches and a form that submits whitespace is rejected. A single
 * transform handles both cases and folds `''` to `undefined`, so an optional
 * column is written as null rather than as an empty string.
 */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

/**
 * An email address.
 *
 * Lowercased on the way in so `Alice@example.com` and `alice@example.com` are
 * one account. Supabase lowercases the address it stores, so normalising here
 * keeps a lookup from missing on case alone.
 *
 * The 254-character cap is the RFC 5321 maximum for a forward path.
 *
 * `z.email()` is used rather than the deprecated `z.string().email()`, which in
 * Zod 4 ignores the custom message and reports its own "Invalid email address"
 * instead. The normalisation is applied first so the value validated and the
 * value stored are the same string.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'That email address is too long.')
  .pipe(z.email({ message: 'Enter a valid email address.' }));

/**
 * A password.
 *
 * Twelve characters minimum, not eight. There is no composition rule — no
 * "must contain a symbol" — because composition rules push people towards
 * `Password1!` and away from the passphrase that is actually stronger. Length is
 * the one property that reliably helps.
 *
 * The 72-byte cap is not arbitrary: bcrypt, which is what Supabase Auth uses,
 * silently truncates at 72 bytes. Accepting a longer password would mean two
 * different passwords authenticate the same account. The cap is stated to the
 * user rather than applied silently.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(72, 'Use 72 characters or fewer.');

/**
 * A display name.
 *
 * Optional throughout: a customer may register with only an email, and the
 * account area must not require a name to be usable.
 */
const optionalName = optionalText(120, 'Use 120 characters or fewer.');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: optionalName,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

/**
 * A password reset.
 *
 * `confirmPassword` is checked against `password` rather than validated
 * independently. The refinement is on the object so the mismatch is reported
 * against the field the user can fix.
 */
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Re-enter your new password.'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Those passwords do not match.',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Re-enter your new password.'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Those passwords do not match.',
    path: ['confirmPassword'],
  });

/**
 * A postal address.
 *
 * `countryCode` is uppercased because the database constraint
 * `addresses_country_code_format` requires two uppercase letters; normalising
 * here means a lowercase entry is accepted rather than rejected by a constraint.
 */
export const addressSchema = z.object({
  label: optionalText(60, 'Use 60 characters or fewer.'),
  recipientName: z
    .string()
    .trim()
    .min(1, 'Enter the recipient name.')
    .max(200, 'Use 200 characters or fewer.'),
  phone: optionalText(40, 'Use 40 characters or fewer.'),
  line1: z.string().trim().min(1, 'Enter the first line of the address.').max(300),
  line2: optionalText(300, 'Use 300 characters or fewer.'),
  city: z.string().trim().min(1, 'Enter a city.').max(120),
  region: optionalText(120, 'Use 120 characters or fewer.'),
  postalCode: optionalText(20, 'Use 20 characters or fewer.'),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a two-letter country code, for example GB.'),
  isDefault: z.coerce.boolean().optional().default(false),
});

export const profileSchema = z.object({
  fullName: optionalName,
  phone: optionalText(40, 'Use 40 characters or fewer.'),
  marketingOptIn: z.coerce.boolean().optional().default(false),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;

/**
 * The state a form action returns to `useActionState`.
 *
 * `fieldErrors` is keyed by form field name so a form can render each message
 * beside the input that caused it. `message` is the form-level summary — the one
 * line a screen reader announces.
 */
export type AuthFormState = {
  status: 'idle' | 'error' | 'success';
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const IDLE_AUTH_STATE: AuthFormState = { status: 'idle' };

/**
 * Convert a Zod failure into the `fieldErrors` map.
 *
 * Takes the issue list rather than the error object, matching
 * `lib/orders/order-request.ts`, so a caller that has already destructured
 * `parsed.error` does not have to pass the whole thing.
 *
 * Only the first issue per field is kept: a field with three complaints is worse
 * to use than a field with one, and the second two are usually the same problem
 * restated.
 */
export function authFieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || 'form';
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
}
