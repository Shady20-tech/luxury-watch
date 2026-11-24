import type { Metadata } from 'next';

import { PageHero } from '@/components/layout/page-hero';
import { AppointmentForm } from '@/components/service/appointment-form';
import { ErrorState } from '@/components/ui/states';
import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { buildBookableSlots, type BookableSlot } from '@/lib/service/slots';
import { buildMetadata } from '@/lib/seo/metadata';
import { fetchAvailability } from '@/server/repositories/service-repository';

/**
 * The appointment request page.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS PAGE IS DYNAMIC
 * -----------------------------------------------------------------------------
 *
 * The bookable slots depend on the active availability windows, which staff can
 * change at any time, and the availability table is read through the
 * cookie-aware server client. The route is therefore dynamic and the export says
 * so, rather than letting Next.js infer "static" and fail at request time.
 *
 * -----------------------------------------------------------------------------
 * SLOTS ARE BUILT ON THE SERVER, FILTERED ON THE CLIENT
 * -----------------------------------------------------------------------------
 *
 * `buildBookableSlots` runs here so the first paint already has real times, and
 * the form filters by the chosen purpose without a round trip. When the business
 * has configured no availability, the list is empty and the form says so instead
 * of showing a picker with nothing in it.
 *
 * -----------------------------------------------------------------------------
 * "NO TIMES CONFIGURED" AND "WE COULD NOT CHECK" ARE DIFFERENT ANSWERS
 * -----------------------------------------------------------------------------
 *
 * An empty window list is a real answer: the business has published no hours, so
 * there is genuinely nothing to offer and the form's own note is correct. A
 * failed query is not an answer at all, and showing the same note would tell the
 * visitor the business has no appointments when in truth we could not ask. The
 * two are separated here so the page says which one happened.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Request an Appointment',
  description:
    'Request a time to visit the boutique or discuss a sale, trade, sourcing or repair. We will confirm the appointment with you.',
  path: '/appointments',
});

async function loadSlots(): Promise<
  { status: 'ok'; slots: BookableSlot[] } | { status: 'unavailable' }
> {
  if (!isSupabaseConfigured()) return { status: 'unavailable' };

  try {
    return { status: 'ok', slots: buildBookableSlots(await fetchAvailability()) };
  } catch (error) {
    logger.warn('appointments.availability_load_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return { status: 'unavailable' };
  }
}

export default async function Page() {
  const availability = await loadSlots();

  return (
    <div>
      <PageHero
        eyebrow="The Boutique"
        title="Request an appointment"
        intro="Choose a time that suits you and tell us what you would like to discuss. We will confirm the appointment with you before you travel."
      />

      <section
        className="container-page max-w-3xl py-10 lg:py-14"
        aria-labelledby="request-heading"
      >
        <h2 id="request-heading" className="text-xl font-semibold">
          Choose a time
        </h2>
        <p className="text-foreground-muted mt-2 text-sm">
          This is a request, not a confirmed appointment. A member of the team will check the slot
          and contact you to confirm.
        </p>
        <div className="mt-6">
          {availability.status === 'unavailable' ? (
            <ErrorState
              title="We cannot show appointment times just now"
              description="We could not check the boutique's availability. Please try again shortly, or send us a message through the contact page and we will arrange a time with you."
            />
          ) : (
            <AppointmentForm slots={availability.slots} />
          )}
        </div>
      </section>
    </div>
  );
}
