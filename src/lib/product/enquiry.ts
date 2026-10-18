import { z } from 'zod';

/**
 * Product enquiry validation and error mapping.
 *
 * Kept out of the server action deliberately. A `'use server'` module may only
 * export async functions, so the schema, the state type and the error allowlist
 * cannot live there and still be unit-tested. They are pure logic with no
 * database access, so they belong in `lib` on their own merits — the action is
 * then a thin boundary that validates, calls the repository and maps the result.
 *
 * The validation here is not the security boundary. `submit_product_question`
 * re-validates, refuses an unpublished product and enforces the rate limit inside
 * Postgres, so calling the action directly does not avoid any of it. This layer
 * exists to return a useful per-field message before a round trip.
 */

/** Longest accepted values. These match the bounds enforced in SQL. */
const NAME_MAX = 200;
const EMAIL_MAX = 320;
const MESSAGE_MAX = 8000;
const PHONE_MAX = 40;

export const enquirySchema = z.object({
  productSlug: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1, 'Please enter your name.').max(NAME_MAX, 'That name is too long.'),
  email: z
    .string()
    .trim()
    .min(3, 'Please enter your email address.')
    .max(EMAIL_MAX, 'That email address is too long.')
    .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
      message: 'Please enter a valid email address, for example name@example.com.',
    }),
  phone: z.string().trim().max(PHONE_MAX, 'That phone number is too long.').optional(),
  message: z
    .string()
    .trim()
    .min(1, 'Please enter your question.')
    .max(MESSAGE_MAX, 'That message is too long. Please shorten it.'),
  /** Honeypot. A real visitor never fills this; it is hidden from assistive tech. */
  company: z.string().optional(),
});

export type EnquiryField = 'name' | 'email' | 'phone' | 'message';

export type EnquiryState =
  | { status: 'idle' }
  | { status: 'error'; message: string; fieldErrors?: Partial<Record<EnquiryField, string>> }
  | { status: 'success'; reference: string | null };

/**
 * Database messages that are safe and useful to show a visitor.
 *
 * An allowlist, not a denylist. A raw Postgres error can carry a constraint
 * name, a column list or a fragment of the rejected row, so anything not named
 * here becomes a generic failure. A denylist would pass the happy path and leak
 * every message nobody thought to add to it.
 */
const SAFE_DATABASE_MESSAGES = [
  'Too many enquiries have been submitted. Please try again later.',
  'Too many enquiries have been submitted from this address. Please try again later.',
  'Unknown product',
];

export function safeDatabaseMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  return SAFE_DATABASE_MESSAGES.find((safe) => message.includes(safe)) ?? null;
}
