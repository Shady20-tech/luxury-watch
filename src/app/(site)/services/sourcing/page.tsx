import type { Metadata } from 'next';

import { PageHero } from '@/components/layout/page-hero';
import { SITE_PHOTOGRAPHY } from '@/lib/images/site-photography';
import { SourcingForm } from '@/components/service/sourcing-form';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * The sourcing service page.
 *
 * Static, like the other service pages: the form is a client component and the
 * server action runs on submit, so nothing here reads cookies.
 */
export const metadata: Metadata = buildMetadata({
  title: 'Watch Sourcing',
  description:
    'Looking for a specific reference? Tell us what you want and we will search our stock and trade network for it.',
  path: '/services/sourcing',
});

const STEPS = [
  {
    title: 'Describe the piece',
    body: 'Brand, model, reference and the details that matter to you — dial, bracelet, box and papers.',
  },
  {
    title: 'We search',
    body: 'We look across our stock and our trade network for a piece that matches your criteria.',
  },
  {
    title: 'You decide',
    body: 'If we find one, we send you the details and photographs. Nothing is ordered until you say so.',
  },
];

export default function Page() {
  return (
    <div>
      <PageHero
        eyebrow="Services"
        title="Watch sourcing"
        intro="Not everything is on the shelf. Tell us what you are looking for and we will search our stock and our trade network for it."
        photograph={SITE_PHOTOGRAPHY.omegaCalibre1861}
        eyebrowTone="sapphire"
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
            Start a search
          </h2>
          <p className="text-foreground-muted mt-2 text-sm">
            This is a request, not an order. Nothing is ordered and no payment is made until you
            agree to a piece we offer you.
          </p>
          <div className="mt-6">
            <SourcingForm />
          </div>
        </section>
      </div>
    </div>
  );
}
