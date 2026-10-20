import { z } from 'zod';

/**
 * Order-request validation and error mapping.
 *
 * -----------------------------------------------------------------------------
 * DISPLAY INPUT ONLY
 * -----------------------------------------------------------------------------
 *
 * Nothing here is a price. The schema validates who the customer is and how they
 * want to receive the piece — never what it costs. The items are sent as product
 * ids and quantities, and `submit_order_request` re-derives every amount from the
 * `products` table. A discount is sent as a *code*; the amount is computed in
 * Postgres. There is no field in this module through which a browser could name
 * a price, a subtotal or a discount value, which is what makes the "server does
 * not trust browser-submitted prices" criterion true by construction rather than
 * by review.
 *
 * -----------------------------------------------------------------------------
 * WHY THE SCHEMA IS NOT IN THE ACTION
 * -----------------------------------------------------------------------------
 *
 * A `'use server'` module may only export async functions, so the schema, the
 * state type and the error allowlist cannot live in the action and still be
 * unit-tested. They are pure logic with no database access, so they belong in
 * `lib` — the action is then a thin boundary that validates, calls the
 * repository and maps the result.
 */

const NAME_MAX = 200;
const EMAIL_MAX = 320;
const PHONE_MAX = 40;
const NOTE_MAX = 2000;
const ADDRESS_MAX = 300;

/** The offline payment-method codes the schema will accept, shape only. */
const CODE_PATTERN = /^[a-z0-9_]{3,60}$/;

/**
 * A product id, validated by shape before it reaches a cast. A malformed value
 * would otherwise raise inside the database's `::uuid` and surface as a 500.
 */
const uuidSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);

const deliveryAddressSchema = z.object({
  line1: z.string().trim().min(1, 'Please enter the first line of the address.').max(ADDRESS_MAX),
  line2: z.string().trim().max(ADDRESS_MAX).optional(),
  city: z.string().trim().min(1, 'Please enter the town or city.').max(ADDRESS_MAX),
  region: z.string().trim().max(ADDRESS_MAX).optional(),
  postalCode: z.string().trim().max(40).optional(),
  countryCode: z
    .string()
    .trim()
    .length(2, 'Please choose a country.')
    .regex(/^[A-Za-z]{2}$/, 'Please choose a country.'),
});

export type DeliveryAddress = z.infer<typeof deliveryAddressSchema>;

/**
 * The order-request form.
 *
 * `items` arrives as a JSON string because a form encodes it as one hidden
 * field; a server action cannot receive a nested object through `FormData`. It
 * is parsed and validated into `{ productId, quantity }[]`.
 *
 * `termsAccepted` must be the literal string `'on'`, which is what a checked
 * checkbox submits. A request that does not carry it is refused — and the
 * database refuses it too, so the rule does not depend on this layer.
 */
export const orderRequestSchema = z
  .object({
    items: z
      .string()
      .min(2, 'Your cart is empty.')
      .transform((value, ctx) => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          ctx.addIssue({ code: 'custom', message: 'Your cart could not be read. Please reload.' });
          return z.NEVER;
        }
      })
      .pipe(
        z
          .array(
            z.object({
              productId: uuidSchema,
              quantity: z.number().int().min(1).max(99),
            }),
          )
          .min(1, 'Your cart is empty.'),
      ),

    customerName: z
      .string()
      .trim()
      .min(1, 'Please enter your name.')
      .max(NAME_MAX, 'That name is too long.'),
    customerEmail: z
      .string()
      .trim()
      .min(3, 'Please enter your email address.')
      .max(EMAIL_MAX, 'That email address is too long.')
      .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
        message: 'Please enter a valid email address, for example name@example.com.',
      }),
    customerPhone: z.string().trim().max(PHONE_MAX, 'That phone number is too long.').optional(),

    fulfilmentType: z.enum(['delivery', 'pickup'], {
      message: 'Please choose how you would like to receive the piece.',
    }),

    paymentMethodCode: z
      .string()
      .trim()
      .regex(CODE_PATTERN, 'Please choose how you would like to settle payment.'),

    deliveryOptionCode: z.string().trim().regex(CODE_PATTERN).optional(),

    deliveryLine1: z.string().trim().max(ADDRESS_MAX).optional(),
    deliveryLine2: z.string().trim().max(ADDRESS_MAX).optional(),
    deliveryCity: z.string().trim().max(ADDRESS_MAX).optional(),
    deliveryRegion: z.string().trim().max(ADDRESS_MAX).optional(),
    deliveryPostalCode: z.string().trim().max(40).optional(),
    deliveryCountryCode: z.string().trim().max(2).optional(),

    customerNote: z.string().trim().max(NOTE_MAX, 'That note is too long.').optional(),

    /** The promotional code, if any. The amount it produces is never sent. */
    discountCode: z.string().trim().max(32).optional(),

    /** From the hidden field the form was rendered with. */
    idempotencyKey: z.string().trim().min(8).max(200),

    /** A checked checkbox posts `'on'`; anything else is not consent. */
    termsAccepted: z.literal('on', {
      message: 'Please accept the terms and privacy notice to continue.',
    }),

    /** Honeypot. A real visitor never fills this; it is hidden from assistive tech. */
    company: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    // A delivery request must carry a usable address. The address is flattened
    // across fields because a form posts strings, and it is assembled into the
    // object the database function expects only when delivery was chosen.
    if (value.fulfilmentType !== 'delivery') return;

    const parsed = deliveryAddressSchema.safeParse({
      line1: value.deliveryLine1,
      line2: value.deliveryLine2,
      city: value.deliveryCity,
      region: value.deliveryRegion,
      postalCode: value.deliveryPostalCode,
      countryCode: value.deliveryCountryCode?.toUpperCase(),
    });

    if (parsed.success) return;

    const mapping = {
      line1: 'deliveryLine1',
      city: 'deliveryCity',
      countryCode: 'deliveryCountryCode',
      line2: 'deliveryLine2',
      region: 'deliveryRegion',
      postalCode: 'deliveryPostalCode',
    } as const;

    for (const issue of parsed.error.issues) {
      const field = mapping[String(issue.path[0]) as keyof typeof mapping];
      if (field) ctx.addIssue({ code: 'custom', path: [field], message: issue.message });
    }
  });

export type OrderRequestInput = z.infer<typeof orderRequestSchema>;

export type OrderRequestField =
  | 'items'
  | 'customerName'
  | 'customerEmail'
  | 'customerPhone'
  | 'fulfilmentType'
  | 'paymentMethodCode'
  | 'deliveryOptionCode'
  | 'deliveryLine1'
  | 'deliveryCity'
  | 'deliveryCountryCode'
  | 'customerNote'
  | 'discountCode'
  | 'termsAccepted';

const ORDER_REQUEST_FIELDS: ReadonlySet<string> = new Set([
  'items',
  'customerName',
  'customerEmail',
  'customerPhone',
  'fulfilmentType',
  'paymentMethodCode',
  'deliveryOptionCode',
  'deliveryLine1',
  'deliveryLine2',
  'deliveryCity',
  'deliveryRegion',
  'deliveryPostalCode',
  'deliveryCountryCode',
  'customerNote',
  'discountCode',
  'termsAccepted',
]);

/** What the customer is told after a successful submission. */
export type OrderRequestReceipt = {
  reference: string;
  /**
   * The guest access token, returned exactly once. A signed-in customer receives
   * `null`: RLS scopes their rows, so they need no second credential.
   */
  accessToken: string | null;
};

export type OrderRequestState =
  | { status: 'idle' }
  | {
      status: 'error';
      message: string;
      fieldErrors?: Partial<Record<OrderRequestField, string>>;
    }
  | { status: 'success'; receipt: OrderRequestReceipt };

/**
 * Extract per-field messages from a failed parse, ignorable fields included.
 *
 * Kept here rather than in the action so the mapping from a zod issue path to a
 * form field can be asserted without rendering a form.
 */
export function fieldErrorsFrom(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Partial<Record<OrderRequestField, string>> {
  const fieldErrors: Partial<Record<OrderRequestField, string>> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? '');
    if (ORDER_REQUEST_FIELDS.has(field) && !fieldErrors[field as OrderRequestField]) {
      fieldErrors[field as OrderRequestField] = issue.message;
    }
  }
  return fieldErrors;
}

/**
 * Database messages that are safe and useful to show a customer.
 *
 * An allowlist, not a denylist. A raw Postgres error can carry a constraint name
 * or a fragment of the rejected row, so anything not named here becomes a
 * generic failure.
 */
const SAFE_DATABASE_MESSAGES = [
  'Too many order requests have been submitted. Please try again later.',
  'Too many order requests have been submitted from this address. Please try again later.',
  'The terms and privacy notice must be acknowledged before submitting.',
  'A delivery address is required for delivery.',
  'An order request must contain at least one item',
  'An order request may contain at most 50 items',
];

/**
 * Fragments that mean a line can no longer be ordered — a product went
 * unpublished between the cart being rendered and the request being submitted,
 * or the last unit was taken by someone else. Matched by fragment because the
 * product id is interpolated into the message.
 *
 * These are the exact wordings raised by `submit_order_request` and
 * `reserve_inventory`; if either changes, this must change with it.
 */
const STOCK_FRAGMENTS = [
  'is not available',
  'Insufficient available stock',
  'No inventory record exists for product',
];

export function safeDatabaseMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  return SAFE_DATABASE_MESSAGES.find((safe) => message.includes(safe)) ?? null;
}

/**
 * Whether an error means the cart changed under the customer.
 *
 * The UI answers this differently from a generic failure: it re-reads the cart
 * and tells the customer what moved, rather than inviting them to retry an order
 * that will keep failing for the same reason.
 */
export function isStockConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return STOCK_FRAGMENTS.some((fragment) => message.includes(fragment));
}

/**
 * Reduce a parsed form to the arguments the database function takes.
 *
 * Kept as a pure function so the shape it produces — in particular that no price
 * or amount appears in it — can be asserted in a unit test. This is the function
 * that would have to change for the server to start trusting a browser figure,
 * and a test that fails when it does is the point.
 */
export function toSubmission(value: OrderRequestInput) {
  const isDelivery = value.fulfilmentType === 'delivery';

  return {
    items: value.items,
    customerName: value.customerName,
    customerEmail: value.customerEmail,
    customerPhone: value.customerPhone && value.customerPhone !== '' ? value.customerPhone : null,
    fulfilmentType: value.fulfilmentType,
    paymentMethodCode: value.paymentMethodCode,
    deliveryOptionCode: isDelivery ? (value.deliveryOptionCode ?? null) : null,
    deliveryAddress: isDelivery
      ? {
          line1: value.deliveryLine1,
          line2: value.deliveryLine2 || undefined,
          city: value.deliveryCity,
          region: value.deliveryRegion || undefined,
          postal_code: value.deliveryPostalCode || undefined,
          country_code: value.deliveryCountryCode?.toUpperCase(),
        }
      : null,
    customerNote: value.customerNote && value.customerNote !== '' ? value.customerNote : null,
    discountCode: value.discountCode && value.discountCode !== '' ? value.discountCode : null,
    idempotencyKey: value.idempotencyKey,
    termsAcknowledged: true,
  } as const;
}
