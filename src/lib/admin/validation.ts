/**
 * Validation for the admin forms.
 *
 * The same rules the storefront uses apply here, plus the ones only an editor can
 * break. Validation lives in one module rather than in each action so a field's
 * rules cannot drift between the create and edit screens — the classic way a value
 * that was rejected on creation becomes accepted on edit.
 *
 * Every numeric field coerces and bounds. A form field arrives as a string, so
 * `priceCents` must reject `"12000000.5"` and `"1e9"` rather than trusting them,
 * and an empty string must mean "unset" rather than zero. A price of zero and an
 * absent price are different things: the first is a mistake, the second is a watch
 * sold by enquiry.
 */

import { z } from 'zod';

const PRODUCT_STATUSES = ['draft', 'published', 'archived'] as const;
const PRODUCT_CONDITIONS = ['new', 'unworn', 'pre_owned', 'vintage'] as const;

export type AdminFormState = {
  status: 'idle' | 'error' | 'success';
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const IDLE_ADMIN_STATE: AdminFormState = { status: 'idle' };

/** Keep the first issue per field: three complaints about one input is worse than one. */
export function adminFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '_');
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/**
 * A checkbox, where "absent" means unchecked.
 *
 * A browser does not submit an unchecked checkbox at all, so the key is missing
 * from the parsed form rather than present as `'false'`. `z.coerce.boolean()`
 * would reject that, and the save would fail on a field the administrator
 * actively chose to leave alone. The sentinel value a checkbox *does* submit is
 * `'on'`, so anything else — absent, empty, `'false'` — is false.
 */
const checkbox = z
  .preprocess((value) => value === 'on' || value === 'true' || value === true, z.boolean())
  .optional()
  .transform((value) => value ?? false);

/**
 * An optional integer that treats an empty string as absent, not as zero.
 *
 * The union with `undefined` is essential, not defensive: a form field the
 * browser does not submit — an unchecked checkbox, or any input left blank in a
 * form read with `Object.fromEntries` — arrives as *absent*, not as `''`. A plain
 * `z.string()` here rejects every product with a blank optional field, which is
 * most of them, and the failure surfaces as a validation error on a field the
 * administrator never touched.
 */
const optionalInt = (min: number, max: number, label: string) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null) return undefined;
      const trimmed = String(value).trim();
      return trimmed === '' ? undefined : trimmed;
    },
    z
      .string()
      .refine((value) => /^-?\d+$/.test(value), `${label} must be a whole number`)
      .transform(Number)
      .refine((value) => value >= min && value <= max, `${label} must be between ${min} and ${max}`)
      .optional(),
  );

/**
 * A price in minor units.
 *
 * `priceOnRequest` wins over a price: if a product is sold by enquiry it must not
 * also carry a number, because the storefront would show whichever the template
 * reached first and the two would disagree. That rule is enforced here rather than
 * in the template.
 */
const priceCents = optionalInt(0, 1_000_000_000, 'Price').refine(
  (value) => value === undefined || value > 0,
  'A price must be greater than zero',
);

export const productFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, 'A title is required')
      .max(160, 'Keep the title under 160 characters'),
    slug: z
      .string()
      .trim()
      .min(1, 'A slug is required')
      .max(160, 'Keep the slug under 160 characters')
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens'),
    sku: z.string().trim().min(1, 'A SKU is required').max(64, 'Keep the SKU under 64 characters'),
    referenceNumber: z.string().trim().max(80, 'Keep the reference under 80 characters').optional(),
    shortDescription: z
      .string()
      .trim()
      .max(400, 'Keep the summary under 400 characters')
      .optional(),
    description: z
      .string()
      .trim()
      .max(8000, 'Keep the description under 8000 characters')
      .optional(),
    brandId: z
      .string()
      .uuid('Choose a brand')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    modelId: z
      .string()
      .uuid('Choose a model')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    condition: z
      .enum(PRODUCT_CONDITIONS)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    status: z.enum(PRODUCT_STATUSES),
    priceCents,
    compareAtCents: optionalInt(0, 1_000_000_000, 'Compare-at price'),
    costCents: optionalInt(0, 1_000_000_000, 'Cost'),
    priceOnRequest: checkbox,
    isFeatured: checkbox,
    sortOrder: optionalInt(-100_000, 100_000, 'Sort order'),
    productionYear: optionalInt(1800, 2100, 'Production year'),
    caseSizeMm: optionalInt(1, 100, 'Case size'),
    caseMaterial: z.string().trim().max(80).optional(),
    dialColor: z.string().trim().max(80).optional(),
    braceletMaterial: z.string().trim().max(80).optional(),
    movement: z.string().trim().max(120).optional(),
    bezel: z.string().trim().max(80).optional(),
    waterResistanceM: optionalInt(0, 20_000, 'Water resistance'),
    boxAndPapers: z.enum(['yes', 'no', 'unknown']),
    gender: z.string().trim().max(40).optional(),
    seoTitle: z.string().trim().max(160, 'Keep the SEO title under 160 characters').optional(),
    seoDescription: z
      .string()
      .trim()
      .max(320, 'Keep the SEO description under 320 characters')
      .optional(),
    ogImageUrl: z
      .string()
      .trim()
      .max(500)
      .refine((value) => value === '' || /^https?:\/\//.test(value), 'Use a full http or https URL')
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.priceOnRequest && value.priceCents !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priceCents'],
        message: 'Clear the price when the item is sold by enquiry',
      });
    }
    if (!value.priceOnRequest && value.priceCents === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priceCents'],
        message: 'Enter a price, or mark the item as sold by enquiry',
      });
    }
    if (value.compareAtCents !== undefined && value.priceCents !== undefined) {
      if (value.compareAtCents <= value.priceCents) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['compareAtCents'],
          message: 'The compare-at price must be higher than the price',
        });
      }
    }
  });

export type ProductFormValues = z.infer<typeof productFormSchema>;

export const stockAdjustmentSchema = z.object({
  productId: z.string().uuid('Unknown product'),
  delta: z
    .string()
    .trim()
    .regex(/^-?\d+$/, 'Enter a whole number')
    .transform(Number)
    .refine((value) => value !== 0, 'Enter a non-zero change')
    .refine((value) => Math.abs(value) <= 10_000, 'A single adjustment is limited to 10,000 units'),
  note: z
    .string()
    .trim()
    .min(3, 'Say why the stock is changing')
    .max(400, 'Keep the note under 400 characters'),
});

export type StockAdjustmentValues = z.infer<typeof stockAdjustmentSchema>;

export const ORDER_STATUSES = [
  'submitted',
  'under_review',
  'confirmed',
  'awaiting_payment',
  'paid_offline',
  'fulfilled',
  'cancelled',
  'rejected',
] as const;

export type AdminOrderStatus = (typeof ORDER_STATUSES)[number];

export const orderTransitionSchema = z.object({
  orderId: z.string().uuid('Unknown order'),
  toStatus: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(2000, 'Keep the note under 2000 characters').optional(),
});

export type OrderTransitionValues = z.infer<typeof orderTransitionSchema>;
