import { describe, expect, it } from 'vitest';

import {
  announcementFormSchema,
  faqFormSchema,
  mediaMetadataSchema,
  navigationItemFormSchema,
  pageFormSchema,
  paymentMethodFormSchema,
  safeObjectName,
  siteSettingsFormSchema,
  testimonialFormSchema,
  validateMediaUpload,
} from '@/lib/admin/content-validation';

/**
 * The shape a browser actually sends.
 *
 * Every test below parses an object with the optional keys *absent*, because
 * `Object.fromEntries(new FormData(form))` omits an unchecked checkbox and any
 * blank input. That is the shape that broke the product form in Phase 10 and it
 * is the shape a CMS form sends a hundred times over.
 */
const FAQ_MINIMAL = { question: 'Do you ship worldwide?', answer: 'Yes, fully insured.' };

describe('content forms accept absent optional fields', () => {
  /**
   * The Zod 4 trap, pinned directly.
   *
   * `.pipe(x.optional())` and `.optional()` placed before a `.transform()` do not
   * make an object key omittable in Zod 4 — the key is still required and the
   * parse fails with "expected nonoptional, received undefined". Every optional
   * helper here therefore puts `.optional()` outermost. This assertion covers the
   * shape of the contract so a future helper written the old way fails here
   * rather than in a form nobody has submitted yet.
   */
  it('every optional field tolerates the key being absent entirely', () => {
    const parsed = faqFormSchema.safeParse(FAQ_MINIMAL);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).not.toHaveProperty('sortOrder');
  });

  it('accepts a FAQ with only the required fields', () => {
    const parsed = faqFormSchema.safeParse(FAQ_MINIMAL);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.isPublished).toBe(false);
      expect(parsed.data.category).toBeNull();
      expect(parsed.data.sortOrder).toBeUndefined();
    }
  });

  it('treats an absent checkbox as false and a present one as true', () => {
    const off = faqFormSchema.safeParse(FAQ_MINIMAL);
    const on = faqFormSchema.safeParse({ ...FAQ_MINIMAL, isPublished: 'on' });
    expect(off.success && off.data.isPublished).toBe(false);
    expect(on.success && on.data.isPublished).toBe(true);
  });

  it('does not treat the string "false" as true', () => {
    // The defect `z.coerce.boolean()` would introduce: Boolean('false') is true.
    const parsed = faqFormSchema.safeParse({ ...FAQ_MINIMAL, isPublished: 'false' });
    expect(parsed.success && parsed.data.isPublished).toBe(false);
  });

  it('accepts a testimonial with no location or rating', () => {
    const parsed = testimonialFormSchema.safeParse({
      quote: 'The watch arrived exactly as described and well packed.',
      author: 'A Customer',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.location).toBeUndefined();
      expect(parsed.data.rating).toBeUndefined();
    }
  });

  it('accepts a navigation item with no group label', () => {
    const parsed = navigationItemFormSchema.safeParse({
      location: 'footer',
      label: 'Shipping',
      href: '/pages/shipping',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.groupLabel).toBeUndefined();
  });

  it('accepts an announcement with no link or window', () => {
    const parsed = announcementFormSchema.safeParse({ message: 'Closed for the holidays' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.linkUrl).toBeUndefined();
      expect(parsed.data.startsAt).toBeUndefined();
    }
  });

  it('accepts a payment method with no instructions', () => {
    const parsed = paymentMethodFormSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      label: 'Bank transfer',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.instructions).toBeUndefined();
  });

  it('accepts site settings with every optional detail absent', () => {
    const parsed = siteSettingsFormSchema.safeParse({ businessName: 'Luxury Watch' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.contactEmail).toBeUndefined();
      expect(parsed.data.addressCity).toBeUndefined();
    }
  });
});

describe('content forms reject what they should', () => {
  it('rejects a javascript: destination', () => {
    const parsed = navigationItemFormSchema.safeParse({
      location: 'header',
      label: 'Click me',
      href: 'javascript:alert(1)',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts an internal path and an https URL as destinations', () => {
    expect(
      navigationItemFormSchema.safeParse({ location: 'header', label: 'Shop', href: '/shop' })
        .success,
    ).toBe(true);
    expect(
      navigationItemFormSchema.safeParse({
        location: 'header',
        label: 'Elsewhere',
        href: 'https://example.com/x',
      }).success,
    ).toBe(true);
  });

  it('rejects a rating outside 1–5', () => {
    expect(
      testimonialFormSchema.safeParse({
        quote: 'A long enough quote to pass.',
        author: 'Someone',
        rating: '9',
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid email in site settings', () => {
    expect(
      siteSettingsFormSchema.safeParse({ businessName: 'Shop', contactEmail: 'not-an-email' })
        .success,
    ).toBe(false);
  });
});

describe('page body validation uses the renderer parser', () => {
  const base = {
    slug: 'shipping',
    title: 'Shipping',
    status: 'draft' as const,
  };

  it('accepts a draft with no body', () => {
    expect(pageFormSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a published page with no body', () => {
    const parsed = pageFormSchema.safeParse({ ...base, status: 'published' });
    expect(parsed.success).toBe(false);
  });

  it('accepts a body of known blocks', () => {
    const body = JSON.stringify([
      { type: 'heading', text: 'Shipping', level: 2 },
      { type: 'paragraph', text: 'We ship worldwide.' },
    ]);
    const parsed = pageFormSchema.safeParse({ ...base, status: 'published', body });
    expect(parsed.success).toBe(true);
  });

  it('rejects a body containing an unknown block type', () => {
    // The renderer would silently drop this, so the page would lose a section
    // the editor believes they wrote. Rejecting at save time is honest.
    const body = JSON.stringify([{ type: 'video', src: 'x' }]);
    const parsed = pageFormSchema.safeParse({ ...base, body });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => /not a recognised type/.test(i.message))).toBe(true);
    }
  });

  it('rejects a body that is not JSON', () => {
    expect(pageFormSchema.safeParse({ ...base, body: 'not json' }).success).toBe(false);
  });
});

describe('media upload validation', () => {
  const ok = { type: 'image/jpeg', size: 1024, name: 'photo.jpg' };

  it('accepts a normal image', () => {
    expect(validateMediaUpload(ok)).toEqual({ ok: true });
  });

  it('rejects an SVG by name, with a specific message', () => {
    const result = validateMediaUpload({ type: 'image/svg+xml', size: 512, name: 'x.svg' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/SVG/);
  });

  it('rejects a PDF', () => {
    expect(validateMediaUpload({ type: 'application/pdf', size: 1024, name: 'x.pdf' }).ok).toBe(
      false,
    );
  });

  it('rejects an empty file', () => {
    expect(validateMediaUpload({ ...ok, size: 0 }).ok).toBe(false);
  });

  it('rejects an image larger than the bucket limit', () => {
    const result = validateMediaUpload({ ...ok, size: 9 * 1024 * 1024 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/8 MB/);
  });
});

describe('safeObjectName', () => {
  it('strips anything that could act as a path', () => {
    const name = safeObjectName('../../etc/passwd', 'image/jpeg');
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
    expect(name.endsWith('.jpg')).toBe(true);
  });

  it('takes the extension from the MIME type, not the file name', () => {
    // A file called .svg declared as image/png must not be stored as .svg.
    const name = safeObjectName('payload.svg', 'image/png');
    expect(name.endsWith('.png')).toBe(true);
    expect(name).not.toContain('svg');
  });
});

describe('media metadata', () => {
  it('accepts an image with no alt text (the form flags it, the schema allows it)', () => {
    const parsed = mediaMetadataSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      category: 'product',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown category', () => {
    expect(
      mediaMetadataSchema.safeParse({
        id: '11111111-1111-4111-8111-111111111111',
        category: 'document',
      }).success,
    ).toBe(false);
  });
});
