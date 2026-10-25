'use server';

import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  appointmentSchema,
  contactSchema,
  fieldErrors,
  looksAutomated,
  offerSchema,
  repairSchema,
  safeDatabaseMessage,
  sellTradeSchema,
  sourcingSchema,
  type ServiceFormState,
} from '@/lib/service/validation';
import type { ServiceEmailData } from '@/lib/email/service';
import { notifyServiceRequestSubmitted } from '@/server/services/service-notification-service';
import {
  requestAppointment,
  submitContactMessage,
  submitProductOffer,
  submitRepairRequest,
  submitSellTradeRequest,
  submitSourcingRequest,
} from '@/server/repositories/service-repository';

/**
 * The five customer service forms.
 *
 * -----------------------------------------------------------------------------
 * WHY SERVER ACTIONS RATHER THAN ROUTE HANDLERS
 * -----------------------------------------------------------------------------
 *
 * Each form must work without JavaScript (a real `<form>` posting to a server
 * action gives that) and must not expose an unauthenticated write endpoint a
 * script can call in a loop. The database function is the second half of that:
 * it validates the shape, refuses an unknown product and enforces the rate limit
 * inside Postgres, so calling the action directly does not avoid any of it.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS NEVER ECHOED BACK OR LOGGED
 * -----------------------------------------------------------------------------
 *
 * On success the action returns only the reference. The submitted name, email,
 * phone and message are not returned and not logged: a submission is personal
 * data, and a log line is a copy of it in a system the visitor never agreed to.
 * Only the reference and a coarse outcome are logged.
 *
 * -----------------------------------------------------------------------------
 * THE HONEYPOT RETURNS A SUCCESS-SHAPED RESPONSE
 *
 * A submission with the hidden `company` field filled was not made by a person.
 * It is rejected without a database write, but the response is shaped like a
 * success so the bot gets no signal that it was detected — a distinct error would
 * tell an operator to tune the bot until it passes.
 */

const UNAVAILABLE: ServiceFormState = {
  status: 'error',
  message: 'This form is temporarily unavailable. Please try again shortly.',
};

const GENERIC_FAILURE: ServiceFormState = {
  status: 'error',
  message: 'We could not send your request just now. Please try again in a moment.',
};

/**
 * Turn a thrown database error into something safe to show.
 *
 * A message the database raises deliberately is shown as-is; anything else — a
 * constraint name, a fragment of the rejected row — becomes a generic failure.
 * `safeDatabaseMessage` is an allowlist for exactly that reason.
 */
function databaseFailure(scope: string, error: unknown): ServiceFormState {
  const safe = safeDatabaseMessage(error);
  if (safe) {
    logger.warn(`service_form.rejected`, { scope, reason: safe });
    return { status: 'error', message: safe };
  }
  logger.error(`service_form.failed`, {
    scope,
    message: error instanceof Error ? error.message : 'unknown error',
  });
  return GENERIC_FAILURE;
}

/** The fake reference a honeypot submission receives. Shaped like a real one. */
function honeypotReference(): string {
  return 'LW-RE-' + Date.now().toString(36).toUpperCase().slice(-6);
}

export async function submitSellTradeAction(
  _previous: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  if (looksAutomated(formData.get('company'))) {
    return { status: 'success', reference: honeypotReference() };
  }

  const parsed = sellTradeSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? undefined,
    brandName: formData.get('brandName') ?? undefined,
    modelName: formData.get('modelName') ?? undefined,
    referenceNumber: formData.get('referenceNumber') ?? undefined,
    productionYear: formData.get('productionYear') ?? undefined,
    conditionNotes: formData.get('conditionNotes') ?? undefined,
    hasBox: formData.get('hasBox') ?? false,
    hasPapers: formData.get('hasPapers') ?? false,
    askingPriceCents: formData.get('askingPriceCents') ?? undefined,
    transactionType: formData.get('transactionType'),
    description: formData.get('description'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields and try again.',
      fieldErrors: fieldErrors(parsed.error, [
        'name',
        'email',
        'phone',
        'brandName',
        'modelName',
        'referenceNumber',
        'productionYear',
        'conditionNotes',
        'askingPriceCents',
        'transactionType',
        'description',
      ] as const),
    };
  }

  if (!isSupabaseConfigured()) return UNAVAILABLE;

  const input = parsed.data;

  try {
    const reference = await submitSellTradeRequest(input);
    logger.info('service_form.received', { scope: 'sell_trade', reference });

    const email: ServiceEmailData = {
      kind: 'sell_trade',
      reference,
      customerName: input.name,
      customerEmail: input.email,
      customerPhone: input.phone ?? null,
      label: 'sell or trade request',
      details: [
        { label: 'Brand', value: input.brandName ?? '' },
        { label: 'Model', value: input.modelName ?? '' },
        { label: 'Reference', value: input.referenceNumber ?? '' },
        { label: 'Year', value: input.productionYear ? String(input.productionYear) : '' },
        { label: 'Condition', value: input.conditionNotes ?? '' },
        { label: 'Box', value: input.hasBox ? 'Yes' : 'No' },
        { label: 'Papers', value: input.hasPapers ? 'Yes' : 'No' },
        {
          label: 'Asking price',
          value: input.askingPriceCents
            ? `${(input.askingPriceCents / 100).toFixed(2)}`
            : 'Not stated',
        },
        { label: 'Transaction', value: input.transactionType },
      ],
      message: input.description,
    };

    await notifyServiceRequestSubmitted(email);
    return { status: 'success', reference };
  } catch (error) {
    return databaseFailure('sell_trade', error);
  }
}

export async function submitSourcingAction(
  _previous: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  if (looksAutomated(formData.get('company'))) {
    return { status: 'success', reference: honeypotReference() };
  }

  const parsed = sourcingSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? undefined,
    brandName: formData.get('brandName') ?? undefined,
    modelName: formData.get('modelName') ?? undefined,
    referenceNumber: formData.get('referenceNumber') ?? undefined,
    dialColor: formData.get('dialColor') ?? undefined,
    braceletType: formData.get('braceletType') ?? undefined,
    minYear: formData.get('minYear') ?? undefined,
    maxYear: formData.get('maxYear') ?? undefined,
    maxBudgetCents: formData.get('maxBudgetCents') ?? undefined,
    notes: formData.get('notes'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields and try again.',
      fieldErrors: fieldErrors(parsed.error, [
        'name',
        'email',
        'phone',
        'brandName',
        'modelName',
        'referenceNumber',
        'dialColor',
        'braceletType',
        'minYear',
        'maxYear',
        'maxBudgetCents',
        'notes',
      ] as const),
    };
  }

  if (!isSupabaseConfigured()) return UNAVAILABLE;

  const input = parsed.data;

  try {
    const reference = await submitSourcingRequest(input);
    logger.info('service_form.received', { scope: 'sourcing', reference });

    const email: ServiceEmailData = {
      kind: 'sourcing',
      reference,
      customerName: input.name,
      customerEmail: input.email,
      customerPhone: input.phone ?? null,
      label: 'watch sourcing request',
      details: [
        { label: 'Brand', value: input.brandName ?? '' },
        { label: 'Model', value: input.modelName ?? '' },
        { label: 'Reference', value: input.referenceNumber ?? '' },
        { label: 'Dial', value: input.dialColor ?? '' },
        { label: 'Bracelet', value: input.braceletType ?? '' },
        {
          label: 'Year range',
          value:
            input.minYear || input.maxYear
              ? `${input.minYear ?? 'any'}–${input.maxYear ?? 'any'}`
              : '',
        },
        {
          label: 'Budget',
          value: input.maxBudgetCents ? `${(input.maxBudgetCents / 100).toFixed(2)}` : 'Not stated',
        },
      ],
      message: input.notes,
    };

    await notifyServiceRequestSubmitted(email);
    return { status: 'success', reference };
  } catch (error) {
    return databaseFailure('sourcing', error);
  }
}

export async function submitRepairAction(
  _previous: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  if (looksAutomated(formData.get('company'))) {
    return { status: 'success', reference: honeypotReference() };
  }

  const parsed = repairSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? undefined,
    brandName: formData.get('brandName') ?? undefined,
    modelName: formData.get('modelName') ?? undefined,
    referenceNumber: formData.get('referenceNumber') ?? undefined,
    serviceType: formData.get('serviceType') ?? undefined,
    issueSummary: formData.get('issueSummary') ?? undefined,
    isInsured: formData.get('isInsured') ?? false,
    preferredContact: formData.get('preferredContact') ?? undefined,
    description: formData.get('description'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields and try again.',
      fieldErrors: fieldErrors(parsed.error, [
        'name',
        'email',
        'phone',
        'brandName',
        'modelName',
        'referenceNumber',
        'serviceType',
        'issueSummary',
        'preferredContact',
        'description',
      ] as const),
    };
  }

  if (!isSupabaseConfigured()) return UNAVAILABLE;

  const input = parsed.data;

  try {
    const reference = await submitRepairRequest(input);
    logger.info('service_form.received', { scope: 'repair', reference });

    const email: ServiceEmailData = {
      kind: 'repair',
      reference,
      customerName: input.name,
      customerEmail: input.email,
      customerPhone: input.phone ?? null,
      label: 'repair or restoration request',
      details: [
        { label: 'Brand', value: input.brandName ?? '' },
        { label: 'Model', value: input.modelName ?? '' },
        { label: 'Reference', value: input.referenceNumber ?? '' },
        { label: 'Service', value: input.serviceType ?? '' },
        { label: 'Summary', value: input.issueSummary ?? '' },
        { label: 'Insured', value: input.isInsured ? 'Yes' : 'No' },
        { label: 'Preferred contact', value: input.preferredContact ?? '' },
      ],
      message: input.description,
    };

    await notifyServiceRequestSubmitted(email);
    return { status: 'success', reference };
  } catch (error) {
    return databaseFailure('repair', error);
  }
}

export async function submitContactAction(
  _previous: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  if (looksAutomated(formData.get('company'))) {
    return { status: 'success', reference: honeypotReference() };
  }

  const parsed = contactSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? undefined,
    subject: formData.get('subject') ?? undefined,
    message: formData.get('message'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields and try again.',
      fieldErrors: fieldErrors(parsed.error, [
        'name',
        'email',
        'phone',
        'subject',
        'message',
      ] as const),
    };
  }

  if (!isSupabaseConfigured()) return UNAVAILABLE;

  const input = parsed.data;

  try {
    const reference = await submitContactMessage(input);
    logger.info('service_form.received', { scope: 'contact', reference });

    await notifyServiceRequestSubmitted({
      kind: 'contact',
      reference,
      customerName: input.name,
      customerEmail: input.email,
      customerPhone: input.phone ?? null,
      label: 'message',
      details: [{ label: 'Subject', value: input.subject ?? '' }],
      message: input.message,
    });

    return { status: 'success', reference };
  } catch (error) {
    return databaseFailure('contact', error);
  }
}

export async function submitOfferAction(
  _previous: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  if (looksAutomated(formData.get('company'))) {
    return { status: 'success', reference: honeypotReference() };
  }

  const parsed = offerSchema.safeParse({
    productSlug: formData.get('productSlug'),
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? undefined,
    amount: formData.get('amount'),
    message: formData.get('message') ?? undefined,
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields and try again.',
      fieldErrors: fieldErrors(parsed.error, [
        'name',
        'email',
        'phone',
        'amount',
        'message',
      ] as const),
    };
  }

  if (!isSupabaseConfigured()) return UNAVAILABLE;

  const input = parsed.data;
  // The browser sends a major-unit amount; the database stores minor units. The
  // conversion happens here and nowhere else, and the value is re-validated
  // inside `submit_product_offer`, so a tampered figure is a shape error there.
  const amountCents = Math.round(input.amount * 100);

  try {
    const reference = await submitProductOffer({
      productSlug: input.productSlug,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      amountCents,
      message: input.message ?? null,
    });

    logger.info('service_form.received', { scope: 'product_offer', reference });

    await notifyServiceRequestSubmitted({
      kind: 'product_offer',
      reference,
      customerName: input.name,
      customerEmail: input.email,
      customerPhone: input.phone ?? null,
      label: 'offer',
      details: [
        { label: 'Product', value: input.productSlug },
        { label: 'Offer', value: amountCents ? `${(amountCents / 100).toFixed(2)}` : '' },
      ],
      message: input.message ?? null,
    });

    return { status: 'success', reference };
  } catch (error) {
    return databaseFailure('product_offer', error);
  }
}

export async function requestAppointmentAction(
  _previous: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  if (looksAutomated(formData.get('company'))) {
    return { status: 'success', reference: honeypotReference() };
  }

  const parsed = appointmentSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? undefined,
    purpose: formData.get('purpose') ?? 'showroom_visit',
    slotStart: formData.get('slotStart'),
    customerNote: formData.get('customerNote') ?? undefined,
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please check the highlighted fields and try again.',
      fieldErrors: fieldErrors(parsed.error, [
        'name',
        'email',
        'phone',
        'purpose',
        'slotStart',
        'customerNote',
      ] as const),
    };
  }

  if (!isSupabaseConfigured()) return UNAVAILABLE;

  const input = parsed.data;

  try {
    const reference = await requestAppointment({
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      purpose: input.purpose,
      slotStart: input.slotStart,
      customerNote: input.customerNote ?? null,
    });

    logger.info('service_form.received', { scope: 'appointment', reference });

    await notifyServiceRequestSubmitted({
      kind: 'appointment',
      reference,
      customerName: input.name,
      customerEmail: input.email,
      customerPhone: input.phone ?? null,
      label: 'appointment request',
      details: [
        { label: 'Purpose', value: input.purpose.replace(/_/g, ' ') },
        { label: 'Requested time', value: new Date(input.slotStart).toUTCString() },
      ],
      message: input.customerNote ?? null,
    });

    return { status: 'success', reference };
  } catch (error) {
    return databaseFailure('appointment', error);
  }
}
