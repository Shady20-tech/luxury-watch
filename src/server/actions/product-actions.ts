'use server';

import { logger } from '@/lib/logger';
import { isSupabaseConfigured } from '@/lib/env';
import {
  enquirySchema,
  safeDatabaseMessage,
  type EnquiryField,
  type EnquiryState,
} from '@/lib/product/enquiry';
import { submitProductQuestion } from '@/server/repositories/product-repository';

/**
 * The "ask a question" enquiry.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS A SERVER ACTION RATHER THAN A ROUTE HANDLER
 * -----------------------------------------------------------------------------
 *
 * The form must work without JavaScript and must not expose an unauthenticated
 * write endpoint that a script can call in a loop. A server action gives the
 * first (progressive enhancement through a real `<form>`), and the database
 * function `submit_product_question` gives the second: it validates, refuses an
 * unpublished product and enforces the rate limit inside Postgres, so calling
 * the action directly does not avoid any of it.
 *
 * The schema and the error allowlist live in `lib/product/enquiry.ts`. A
 * `'use server'` module may only export async functions, so they could not be
 * unit-tested from here, and they are pure logic with no database access.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS NEVER ECHOED BACK
 * -----------------------------------------------------------------------------
 *
 * On success the action returns only the reference. It does not return the
 * submitted name, email or message, and it does not log them: an enquiry is
 * personal data, and a log line is a copy of it in a system the visitor never
 * agreed to. Only the reference and a coarse outcome are logged.
 */

export async function submitEnquiry(
  _previous: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  const parsed = enquirySchema.safeParse({
    productSlug: formData.get('productSlug'),
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? undefined,
    message: formData.get('message'),
    company: formData.get('company') ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Partial<Record<EnquiryField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        (field === 'name' || field === 'email' || field === 'phone' || field === 'message') &&
        !fieldErrors[field]
      ) {
        fieldErrors[field] = issue.message;
      }
    }

    return {
      status: 'error',
      message: 'Please correct the highlighted fields and try again.',
      fieldErrors,
    };
  }

  const { productSlug, name, email, phone, message, company } = parsed.data;

  // A filled honeypot means a bot. It is answered exactly like a success so the
  // bot does not learn that it was detected and adjust, but nothing is written
  // and no reference is issued.
  if (company && company.trim() !== '') {
    logger.warn('product_enquiry.honeypot', { productSlug });
    return { status: 'success', reference: null };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: 'error',
      message:
        'Enquiries are temporarily unavailable. Please try again shortly, or contact us another way.',
    };
  }

  try {
    const reference = await submitProductQuestion({
      productSlug,
      name,
      email,
      message,
      phone: phone && phone.trim() !== '' ? phone : null,
    });

    logger.info('product_enquiry.received', { productSlug, reference });
    return { status: 'success', reference };
  } catch (error) {
    const safe = safeDatabaseMessage(error);

    if (safe) {
      logger.warn('product_enquiry.rejected', { productSlug, reason: safe });
      return { status: 'error', message: safe };
    }

    // Everything else is logged without the submitted content and reported as a
    // generic failure.
    logger.error('product_enquiry.failed', {
      productSlug,
      message: error instanceof Error ? error.message : 'unknown error',
    });

    return {
      status: 'error',
      message: 'We could not send your enquiry just now. Please try again in a moment.',
    };
  }
}
