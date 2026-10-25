import type { Metadata } from 'next';

import { PageHero } from '@/components/layout/page-hero';
import { RepairForm } from '@/components/service/repair-form';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * The repair and restoration service page.
 *
 * Static: the form is a client component and the action runs on submit. The page
 * says plainly that an estimate follows inspection and that no work starts
 * before the customer approves it, so the form is not read as a booking.
 */
export const metadata: Metadata = buildMetadata({
  title: 'Repair & Restoration',
  description:
    'Servicing, repair and restoration by our watchmakers. Send us the details and we will inspect the watch and send you an estimate.',
  path: '/services/repair-restoration',
});

const STEPS = [
  {
    title: 'Tell us what it needs',
    body: 'The symptoms, any service history, and how you would prefer to be contacted.',
  },
  {
    title: 'We inspect and estimate',
    body: 'A watchmaker examines the watch and sends you an estimate before any work begins.',
  },
  {
    title: 'You approve the work',
    body: 'Nothing is carried out until you accept the estimate. We keep you informed as the work progresses.',
  },
];

export default function Page() {
  return (
    <main id="main-content">
      <PageHero
        eyebrow="Services"
        title="Repair &amp; restoration"
        intro="Servicing, repair and restoration by our watchmakers. Send us the details and we will inspect the watch and send you an estimate before any work begins."
      />

      <div className="container-page py-10 lg:py-14">
        <section className="mt-10" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="text-xl font-semibold">
            How it works
          </h2>
          <ol className="mt-5 grid gap-6 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <p className="text-accent-text text-sm font-semibold">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className="mt-2 text-base font-semibold">{step.title}</h3>
                <p className="text-foreground-muted mt-1 text-sm">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12 max-w-3xl" aria-labelledby="start-request">
          <h2 id="start-request" className="text-xl font-semibold">
            Start a repair request
          </h2>
          <p className="text-foreground-muted mt-2 text-sm">
            This is a request, not a booking. No work is carried out and no payment is made until
            you approve an estimate.
          </p>
          <div className="mt-6">
            <RepairForm />
          </div>
        </section>
      </div>
    </main>
  );
}
