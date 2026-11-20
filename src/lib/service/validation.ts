import { z } from 'zod';

/**
 * Validation for the five customer service forms.
 *
 * -----------------------------------------------------------------------------
 * THIS IS NOT THE SECURITY BOUNDARY
 * -----------------------------------------------------------------------------
 *
 * Every rule here is repeated inside Postgres. `submit_sell_trade_request` and
 * its siblings call `assert_submission_shape`, check the same bounds and enforce
 * the same rate limit, so a caller who posts straight to the action — or to the
 * RPC — does not skip any of it. This layer exists to return a useful per-field
 * message before a round trip, and to keep the two in step it copies the SQL
 * bounds exactly. When a bound changes in `0015`, change it here too.
 *
 * -----------------------------------------------------------------------------
 * WHY THE SHARED PIECES ARE HERE AND NOT PER-FLOW
 * -----------------------------------------------------------------------------
 *
 * Name, email, phone and the honeypot are identical across all five forms. The
 * database enforces one shape for all of them through `assert_submission_shape`,
 * so defining the email rule five times would be five chances to let them drift.
 */

/** The bounds `assert_submission_shape` enforces. */
const NAME_MAX = 200;
const EMAIL_MAX = 320;
const MESSAGE_MAX = 8000;
const PHONE_MAX = 40;

/**
 * A deliberately loose email check.
 *
 * The database uses the same shape: at least one character, an `@`, and a dot
 * with something after it in the domain. Anything stricter starts rejecting
 * addresses that are valid and deliverable, and the only authority on whether an
 * address works is sending to it.
 */
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const name = z
  .string()
  .trim()
  .min(1, 'Please enter your name.')
  .max(NAME_MAX, 'That name is too long.');

const email = z
  .string()
  .trim()
  .min(3, 'Please enter your email address.')
  .max(EMAIL_MAX, 'That email address is too long.')
  .refine((value) => emailPattern.test(value), {
    message: 'Please enter a valid email address, for example name@example.com.',
  });

const phone = z
  .string()
  .trim()
  .max(PHONE_MAX, 'That phone number is too long.')
  .optional()
  .or(z.literal('').transform(() => undefined));

/**
 * Honeypot. A real visitor never fills this; it is hidden from assistive tech and
 * never focusable, so only an automated submission populates it. Not rejected by
 * the schema — the action checks it and returns a success-shaped response, so a
 * bot gets no signal that it was detected.
 */
const company = z.string().optional();

/**
 * An optional field that may arrive as an empty string.
 *
 * A browser submits every field in the form, including the empty ones, so `''`
 * must become `undefined` rather than being validated as a value. An empty
 * optional field is the normal case, not an error.
 */
function optionalText(max: number, message: string) {
  return z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value && value !== '' ? value : undefined));
}

/** A year a real watch could have been made. Matches the SQL 1800–2200 check. */
const optionalYear = z
  .union([z.literal(''), z.coerce.number().int().min(1800).max(2200)])
  .optional()
  .transform((value) => (value === '' || value === undefined ? undefined : Math.trunc(value)));

/** Money in minor units, or undefined. Never negative or fractional. */
const optionalMoney = z
  .union([z.literal(''), z.coerce.number().int().min(0).max(100_000_000_00)])
  .optional()
  .transform((value) => (value === '' || value === undefined ? undefined : Math.trunc(value)));

export const sellTradeSchema = z.object({
  name,
  email,
  phone,
  brandName: optionalText(120, 'That brand name is too long.'),
  modelName: optionalText(120, 'That model name is too long.'),
  referenceNumber: optionalText(80, 'That reference is too long.'),
  productionYear: optionalYear,
  conditionNotes: optionalText(500, 'Please shorten the condition notes.'),
  hasBox: z.coerce.boolean().default(false),
  hasPapers: z.coerce.boolean().default(false),
  askingPriceCents: optionalMoney,
  transactionType: z.enum(['sell', 'trade'], { message: 'Choose sell or trade.' }),
  material: optionalText(120, 'That material is too long.'),
  movement: optionalText(120, 'That movement is too long.'),
  tradeInTarget: optionalText(200, 'That description of the piece you want is too long.'),
  description: z
    .string()
    .trim()
    .min(1, 'Please tell us about the watch.')
    .max(MESSAGE_MAX, 'That description is too long. Please shorten it.'),
  company,
});

export const sourcingSchema = z.object({
  name,
  email,
  phone,
  brandName: optionalText(120, 'That brand name is too long.'),
  modelName: optionalText(120, 'That model name is too long.'),
  referenceNumber: optionalText(80, 'That reference is too long.'),
  dialColor: optionalText(60, 'That dial colour is too long.'),
  braceletType: optionalText(60, 'That bracelet type is too long.'),
  minYear: optionalYear,
  maxYear: optionalYear,
  maxBudgetCents: optionalMoney,
  conditionPreference: optionalText(200, 'That condition preference is too long.'),
  requiresBox: z.coerce.boolean().default(false),
  requiresPapers: z.coerce.boolean().default(false),
  material: optionalText(120, 'That material is too long.'),
  notes: z
    .string()
    .trim()
    .min(1, 'Please tell us what you are looking for.')
    .max(MESSAGE_MAX, 'That message is too long. Please shorten it.'),
  company,
});

export const repairSchema = z.object({
  name,
  email,
  phone,
  brandName: optionalText(120, 'That brand name is too long.'),
  modelName: optionalText(120, 'That model name is too long.'),
  referenceNumber: optionalText(80, 'That reference is too long.'),
  serviceType: optionalText(120, 'That service type is too long.'),
  issueSummary: optionalText(500, 'Please shorten the summary.'),
  budgetCents: optionalMoney,
  isInsured: z.coerce.boolean().default(false),
  preferredContact: z
    .enum(['email', 'phone', 'either'])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  description: z
    .string()
    .trim()
    .min(1, 'Please describe what the watch needs.')
    .max(MESSAGE_MAX, 'That description is too long. Please shorten it.'),
  company,
});

export const contactSchema = z.object({
  name,
  email,
  phone,
  subject: optionalText(200, 'That subject is too long.'),
  message: z
    .string()
    .trim()
    .min(1, 'Please enter your message.')
    .max(MESSAGE_MAX, 'That message is too long. Please shorten it.'),
  company,
});

export const offerSchema = z.object({
  productSlug: z.string().trim().min(1).max(200),
  name,
  email,
  phone,
  amount: z.coerce
    .number({ message: 'Please enter an offer amount.' })
    .positive('Please enter an offer amount greater than zero.')
    .max(100_000_000_00, 'That amount is too large.'),
  message: optionalText(MESSAGE_MAX, 'That message is too long. Please shorten it.'),
  company,
});

export const appointmentSchema = z.object({
  name,
  email,
  phone,
  purpose: z
    .enum(['showroom_visit', 'consultation', 'sell_trade', 'sourcing', 'repair'])
    .default('showroom_visit'),
  slotStart: z
    .string()
    .trim()
    .min(1, 'Please choose a time.')
    .refine((value) => !Number.isNaN(Date.parse(value)), 'That time could not be read.'),
  customerNote: optionalText(MESSAGE_MAX, 'That note is too long. Please shorten it.'),
  company,
});

export type ServiceForm =
  | 'sell_trade'
  | 'sourcing'
  | 'repair'
  | 'contact'
  | 'product_offer'
  | 'appointment';

/**
 * Database messages that are safe and useful to show a visitor.
 *
 * An allowlist, not a denylist: a raw Postgres error can carry a constraint name
 * or a fragment of the rejected row, so anything not named here becomes a generic
 * failure. These are the messages `assert_submission_shape`, `service_form_guard`
 * and the submission functions raise deliberately.
 */
const SAFE_DATABASE_MESSAGES = [
  'Too many submissions have been received. Please try again later.',
  'Too many submissions have been received from this address. Please try again later.',
  'A valid email address is required',
  'A name between 1 and 200 characters is required',
  'A message between 1 and 8000 characters is required',
  'A production year between 1800 and 2200 is required',
  'An asking price cannot be negative',
  'The transaction type must be sell or trade',
  'An offer amount greater than zero is required',
  'Unknown product',
  'A preferred time is required',
  'The requested time is in the past',
  'That time is not available. Please choose one of the offered slots.',
  'That time has just been taken. Please choose another.',
];

export function safeDatabaseMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  return SAFE_DATABASE_MESSAGES.find((safe) => message.includes(safe)) ?? null;
}

/**
 * Map a `ZodError` onto per-field messages, first issue per field wins.
 *
 * `allowed` keeps the output to the fields the form actually renders, so a
 * schema-internal path cannot produce a message with nowhere to appear.
 */
export function fieldErrors<T extends string>(
  error: z.ZodError,
  allowed: readonly T[],
): Partial<Record<T, string>> {
  const result: Partial<Record<T, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (
      typeof key === 'string' &&
      (allowed as readonly string[]).includes(key) &&
      !result[key as T]
    ) {
      result[key as T] = issue.message;
    }
  }
  return result;
}

/**
 * The outcome every service form action returns.
 *
 * `success` carries only the reference. The submitted name, email, phone and
 * message are never echoed back and never logged: a submission is personal data,
 * and a log line is a copy of it in a system the visitor did not agree to.
 */
export type ServiceFormState<T extends string = string> =
  | { status: 'idle' }
  | { status: 'error'; message: string; fieldErrors?: Partial<Record<T, string>> }
  | { status: 'success'; reference: string };

export const IDLE_SERVICE_STATE: ServiceFormState = { status: 'idle' };

/** True when the honeypot was filled, which only an automated submission does. */
export function looksAutomated(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}
