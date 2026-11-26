import { z } from 'zod';

import { parsePageBlocks } from '@/lib/content/types';

/**
 * Validation for every content-management form.
 *
 * -----------------------------------------------------------------------------
 * ABSENT IS NOT EMPTY
 * -----------------------------------------------------------------------------
 *
 * The lesson from `admin-validation.ts` applies here unchanged and is the reason
 * every optional field below is built from `optionalText` rather than
 * `z.string()`. A browser does not submit an unchecked checkbox at all, and a
 * blank text input read through `Object.fromEntries(formData)` is *absent* from
 * the object rather than present-and-empty. A `z.string()` field rejects that
 * absence, so the form would fail on a field the editor never touched — which is
 * exactly the defect that made every product save fail in Phase 10.
 *
 * `optionalText` therefore accepts `undefined`, `null` and the empty string, and
 * normalises all three to `undefined`.
 *
 * -----------------------------------------------------------------------------
 * WHY THE PAGE BODY IS A JSON STRING
 * -----------------------------------------------------------------------------
 *
 * `pages.content` is a `jsonb` array of typed blocks, and the renderer drops any
 * block it does not recognise. The editor writes blocks as JSON in a textarea
 * rather than through a block builder, so this schema parses the text, narrows it
 * with the same `parsePageBlocks` the public renderer uses, and rejects a body
 * that would render as nothing. Validating with the renderer's own parser is what
 * keeps the two from drifting: a body the editor accepts is a body the page can
 * display.
 */

/**
 * Accept absent, null or blank as `undefined`; trim what is left.
 *
 * The `.optional()` is **outermost and outside the `.transform()`**, and that
 * ordering is the whole point. In Zod 4 a `.pipe(...optional())` or an
 * `optional()` applied before a transform does not make the *key* omittable: the
 * object still requires the key to be present, so an absent field fails with
 * "expected nonoptional, received undefined". That is precisely how every
 * product save broke in Phase 10, and it is silent until a form is submitted with
 * a field left blank. `tests/admin-content-validation.test.ts` parses objects with
 * the optional keys absent for this reason.
 */
function optionalText(max: number, label: string) {
  return z
    .union([z.string(), z.undefined(), z.null()])
    .transform((value, ctx) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      if (trimmed === '') return undefined;
      if (trimmed.length > max) {
        ctx.addIssue({ code: 'custom', message: `${label} is too long` });
        return z.NEVER;
      }
      return trimmed;
    })
    .optional();
}

/** Accept absent/blank as `undefined`; otherwise a whole number in range. */
function optionalInt(min: number, max: number, label: string) {
  return z
    .union([z.string(), z.number(), z.undefined(), z.null()])
    .transform((value, ctx) => {
      if (value === undefined || value === null || value === '') return undefined;
      const n = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        ctx.addIssue({ code: 'custom', message: `${label} must be a whole number` });
        return z.NEVER;
      }
      if (n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: `${label} must be between ${min} and ${max}` });
        return z.NEVER;
      }
      return n;
    })
    .optional();
}

/**
 * A checkbox. Present-and-true is true; absent is false.
 *
 * `z.coerce.boolean()` is deliberately not used: `Boolean('false')` is `true`, so
 * a value posted as the string "false" would be stored as on. An explicit set is
 * the only safe reading. `.optional()` comes before the transform here because
 * the transform's output is never optional — it is always a boolean.
 */
function checkbox() {
  return z
    .union([
      z.literal('on'),
      z.literal('true'),
      z.literal('1'),
      z.boolean(),
      z.undefined(),
      z.null(),
    ])
    .optional()
    .transform((value) => value === 'on' || value === 'true' || value === '1' || value === true);
}

/**
 * A text field that must be a destination a link can safely point at.
 *
 * Optional, so absent is `undefined`; but a present value must be an internal
 * path or an https URL. `javascript:` and `data:` are rejected by construction
 * rather than by a denylist, which is the only version that does not miss one.
 */
function destination(label: string) {
  return z
    .union([z.string(), z.undefined(), z.null()])
    .transform((value, ctx) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      if (trimmed === '') return undefined;
      if (trimmed.length > 500) {
        ctx.addIssue({ code: 'custom', message: `${label} is too long` });
        return z.NEVER;
      }
      if (!trimmed.startsWith('/') && !/^https:\/\/[^\s]+$/.test(trimmed)) {
        ctx.addIssue({
          code: 'custom',
          message: `${label} must start with / or be an https:// URL`,
        });
        return z.NEVER;
      }
      return trimmed;
    })
    .optional();
}

/** A destination that is required, for a navigation item. */
function requiredDestination(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(500, `${label} is too long`)
    .refine(
      (value) => value.startsWith('/') || /^https:\/\/[^\s]+$/.test(value),
      `${label} must start with / or be an https:// URL`,
    );
}

/** A slug the public routes can serve: lowercase words joined by hyphens. */
const slug = z
  .string()
  .trim()
  .min(2, 'A slug is required')
  .max(120, 'That slug is too long')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens');

export const FAQ_CATEGORIES = [
  'purchasing',
  'authenticity',
  'returns',
  'shipping',
  'warranty',
  'payment',
  'selling',
  'trading',
  'sourcing',
  'repairs',
  'accounts',
] as const;

export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

export const faqFormSchema = z.object({
  id: z.string().uuid().optional(),
  question: z
    .string()
    .trim()
    .min(5, 'A question is required')
    .max(300, 'That question is too long'),
  answer: z.string().trim().min(5, 'An answer is required').max(8000, 'That answer is too long'),
  category: z
    .union([z.enum(FAQ_CATEGORIES), z.literal(''), z.undefined(), z.null()])
    .optional()
    .transform((value) => (value === '' || value === undefined || value === null ? null : value)),
  sortOrder: optionalInt(0, 10000, 'Sort order'),
  isPublished: checkbox(),
});

export type FaqFormValues = z.infer<typeof faqFormSchema>;

export const testimonialFormSchema = z.object({
  id: z.string().uuid().optional(),
  /**
   * The quote is supplied by a real customer. Nothing in the admin generates one,
   * and there is no seed fixture, because a fabricated review is a false claim
   * about a person who does not exist.
   */
  quote: z.string().trim().min(10, 'A quote is required').max(2000, 'That quote is too long'),
  author: z.string().trim().min(2, 'An author is required').max(120, 'That name is too long'),
  location: optionalText(120, 'Location'),
  rating: optionalInt(1, 5, 'Rating'),
  sortOrder: optionalInt(0, 10000, 'Sort order'),
  isPublished: checkbox(),
});

export type TestimonialFormValues = z.infer<typeof testimonialFormSchema>;

export const PAGE_STATUSES = ['draft', 'published', 'archived'] as const;

/**
 * The page body, parsed with the renderer's own block parser.
 *
 * A JSON array is required. An empty array is accepted only for a draft, because
 * a published page with no blocks is a blank page at a real URL — see the
 * `superRefine` below, which has the status in scope.
 */
const pageBodySchema = z
  .union([z.string(), z.undefined(), z.null()])
  .transform((value, ctx) => {
    const text = (value ?? '').trim();
    if (text === '') return [] as unknown[];
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        ctx.addIssue({ code: 'custom', message: 'The body must be a JSON array of blocks' });
        return z.NEVER;
      }
      // Narrow with the same parser the public page uses. A block the renderer
      // would silently drop is a block the editor has written for nothing, so a
      // body that narrows to fewer blocks than it was given is rejected with the
      // count rather than saved and quietly ignored.
      const rendered = parsePageBlocks(parsed);
      if (rendered.length !== parsed.length) {
        ctx.addIssue({
          code: 'custom',
          message: `${parsed.length - rendered.length} block(s) are not a recognised type and would not be displayed. Allowed: heading, paragraph, list, callout, figure, faq.`,
        });
        return z.NEVER;
      }
      return rendered;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'The body is not valid JSON' });
      return z.NEVER;
    }
  })
  .optional();

export const pageFormSchema = z
  .object({
    id: z.string().uuid().optional(),
    slug,
    title: z.string().trim().min(2, 'A title is required').max(200, 'That title is too long'),
    excerpt: optionalText(500, 'Excerpt'),
    heroImageUrl: optionalText(500, 'Hero image URL'),
    body: pageBodySchema.transform((blocks) => blocks ?? []),
    status: z.enum(PAGE_STATUSES),
    seoTitle: optionalText(70, 'SEO title'),
    seoDescription: optionalText(200, 'SEO description'),
  })
  .superRefine((values, ctx) => {
    if (values.status === 'published' && values.body.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['body'],
        message: 'A published page needs at least one block of content',
      });
    }
  });

export type PageFormValues = z.infer<typeof pageFormSchema>;

export const HOMEPAGE_SECTION_KEYS = [
  'hero_1',
  'hero_2',
  'hero_3',
  'brand_showcase',
  'featured_collection',
  'brand_story',
  'new_arrivals',
  'browse_brands',
  'sell_trade_cta',
  'sourcing_cta',
  'trust_1',
  'trust_2',
  'trust_3',
  'trust_4',
  'testimonials',
  'newsletter',
  'social',
  'final_cta',
] as const;

export type HomepageSectionKey = (typeof HOMEPAGE_SECTION_KEYS)[number];

export const homepageSectionFormSchema = z.object({
  id: z.string().uuid(),
  title: optionalText(200, 'Title'),
  subtitle: optionalText(300, 'Subtitle'),
  body: optionalText(4000, 'Body'),
  ctaLabel: optionalText(80, 'Call-to-action label'),
  ctaHref: destination('Call-to-action link'),
  imageUrl: optionalText(500, 'Image URL'),
  isActive: checkbox(),
  sortOrder: optionalInt(0, 10000, 'Sort order'),
});

export type HomepageSectionFormValues = z.infer<typeof homepageSectionFormSchema>;

export const NAVIGATION_LOCATIONS = ['header', 'footer', 'topbar'] as const;

export const navigationItemFormSchema = z.object({
  id: z.string().uuid().optional(),
  location: z.enum(NAVIGATION_LOCATIONS),
  label: z.string().trim().min(1, 'A label is required').max(80, 'That label is too long'),
  href: requiredDestination('Link'),
  groupLabel: optionalText(80, 'Group label'),
  sortOrder: optionalInt(0, 10000, 'Sort order'),
  isActive: checkbox(),
});

export type NavigationItemFormValues = z.infer<typeof navigationItemFormSchema>;

export const announcementFormSchema = z.object({
  id: z.string().uuid().optional(),
  message: z.string().trim().min(3, 'A message is required').max(300, 'That message is too long'),
  linkLabel: optionalText(80, 'Link label'),
  linkUrl: destination('Link'),
  isActive: checkbox(),
  sortOrder: optionalInt(0, 10000, 'Sort order'),
  startsAt: optionalText(40, 'Start'),
  endsAt: optionalText(40, 'End'),
});

export type AnnouncementFormValues = z.infer<typeof announcementFormSchema>;

/** A datetime-local string, or nothing. Kept separate so the error is specific. */
export function parseOptionalDate(value: string | undefined, label: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} is not a valid date`);
  }
  return date;
}

export const siteSettingsFormSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, 'A business name is required')
    .max(120, 'That name is too long'),
  tagline: optionalText(200, 'Tagline'),
  logoUrl: optionalText(500, 'Logo URL'),
  contactEmail: z
    .union([z.string(), z.undefined(), z.null()])
    .transform((value, ctx) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      if (trimmed === '') return undefined;
      if (trimmed.length > 254) {
        ctx.addIssue({ code: 'custom', message: 'That email is too long' });
        return z.NEVER;
      }
      // Deliberately loose: a full RFC 5322 parser rejects addresses that work.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid email address' });
        return z.NEVER;
      }
      return trimmed;
    })
    .optional(),
  contactPhone: optionalText(40, 'Phone'),
  whatsappUrl: optionalText(500, 'WhatsApp URL'),
  addressLine1: optionalText(200, 'Address'),
  addressLine2: optionalText(200, 'Address'),
  addressCity: optionalText(120, 'City'),
  addressRegion: optionalText(120, 'Region'),
  addressPostalCode: optionalText(30, 'Postal code'),
  addressCountry: optionalText(120, 'Country'),
  socialInstagram: optionalText(500, 'Instagram'),
  socialFacebook: optionalText(500, 'Facebook'),
  socialX: optionalText(500, 'X'),
  socialYoutube: optionalText(500, 'YouTube'),
  ageGateEnabled: checkbox(),
  ageGateMinimumAge: optionalInt(18, 21, 'Minimum age'),
  orderConfirmationNote: optionalText(2000, 'Order confirmation note'),
});

export type SiteSettingsFormValues = z.infer<typeof siteSettingsFormSchema>;

const optionalEmail = (label: string) =>
  z
    .union([z.string(), z.undefined(), z.null()])
    .transform((value, ctx) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      if (trimmed === '') return undefined;
      if (trimmed.length > 254) {
        ctx.addIssue({ code: 'custom', message: `${label} is too long` });
        return z.NEVER;
      }
      // Deliberately loose: a strict RFC 5322 parser rejects addresses that work.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid email address' });
        return z.NEVER;
      }
      return trimmed;
    })
    .optional();

/**
 * The administrator-editable mail identity.
 *
 * No `from` address: that is an environment variable tied to a domain verified
 * with Resend. Accepting one here would let an administrator send mail from a
 * domain the store does not own, which is a phishing primitive rather than a
 * setting. `fromName` is only ever a display name beside the real address, and
 * `replyTo` only redirects replies to a mailbox.
 */
export const emailSettingsFormSchema = z.object({
  fromName: optionalText(120, 'Display name'),
  replyTo: optionalEmail('Reply-to address'),
});

export type EmailSettingsFormValues = z.infer<typeof emailSettingsFormSchema>;

export const paymentMethodFormSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1, 'A label is required').max(120, 'That label is too long'),
  description: optionalText(500, 'Description'),
  instructions: optionalText(2000, 'Instructions'),
  isEnabled: checkbox(),
  sortOrder: optionalInt(0, 10000, 'Sort order'),
});

export type PaymentMethodFormValues = z.infer<typeof paymentMethodFormSchema>;

export const deliveryOptionFormSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1, 'A label is required').max(120, 'That label is too long'),
  description: optionalText(500, 'Description'),
  // Whole currency units in the form; stored as cents. Negative is meaningless
  // for a delivery fee and is rejected rather than clamped.
  feeMajor: z
    .union([z.string(), z.number(), z.undefined(), z.null()])
    .transform((value) => {
      if (value === undefined || value === null || value === '') return 0;
      const n = typeof value === 'number' ? value : Number(String(value).trim());
      return Number.isFinite(n) ? n : NaN;
    })
    .pipe(z.number().min(0, 'A fee cannot be negative').max(1_000_000, 'That fee is too large')),
  isEnabled: checkbox(),
  sortOrder: optionalInt(0, 10000, 'Sort order'),
});

export type DeliveryOptionFormValues = z.infer<typeof deliveryOptionFormSchema>;

export const MEDIA_CATEGORIES = ['product', 'editorial', 'brand'] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

export const mediaMetadataSchema = z.object({
  id: z.string().uuid(),
  title: optionalText(200, 'Title'),
  altText: optionalText(300, 'Alt text'),
  caption: optionalText(500, 'Caption'),
  category: z.enum(MEDIA_CATEGORIES),
});

export type MediaMetadataValues = z.infer<typeof mediaMetadataSchema>;

/** The largest image the library accepts, in bytes. Matches the bucket limit. */
export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

/** The image types the library accepts. Mirrors `media_mime_image_only`. */
export const ALLOWED_MEDIA_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
] as const;

export type MediaValidationResult = { ok: true } | { ok: false; message: string };

/**
 * Whether an upload may be stored.
 *
 * Checked on the server, not only in the browser: a `file` input's `accept`
 * attribute is a hint, and a determined caller posts whatever they like. SVG is
 * rejected by name here as well as by the bucket, because it is the one image
 * format that can execute script in the storefront's origin.
 */
export function validateMediaUpload(file: {
  type: string;
  size: number;
  name: string;
}): MediaValidationResult {
  if (!ALLOWED_MEDIA_MIME.includes(file.type as (typeof ALLOWED_MEDIA_MIME)[number])) {
    if (file.type === 'image/svg+xml') {
      return {
        ok: false,
        message: 'SVG files are not accepted. Upload a JPEG, PNG, WebP or AVIF image instead.',
      };
    }
    return { ok: false, message: 'Only JPEG, PNG, WebP, AVIF and GIF images can be uploaded.' };
  }
  if (file.size <= 0) {
    return { ok: false, message: 'That file is empty.' };
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return {
      ok: false,
      message: `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB; resize it first.`,
    };
  }
  return { ok: true };
}

/**
 * A safe storage object name.
 *
 * The name comes from the browser, so it is never trusted as a path. Anything
 * that is not a lowercase alphanumeric, a dot or a single hyphen is replaced, and
 * the extension is taken from the MIME type rather than the file name — a file
 * called `photo.svg` with a declared type of `image/png` is stored as `.png`.
 */
export function safeObjectName(originalName: string, mimeType: string): string {
  const base = originalName
    .replace(/\.[^.]*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const extension = MIME_EXTENSION[mimeType] ?? 'bin';
  const stamp = Date.now().toString(36);
  return `${base || 'image'}-${stamp}.${extension}`;
}

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};
