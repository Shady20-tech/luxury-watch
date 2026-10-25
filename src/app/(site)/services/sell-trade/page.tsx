import type { Metadata } from 'next';

import { SellTradeForm } from '@/components/service/sell-trade-form';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * The sell / trade service page.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS PAGE IS STATIC
 * -----------------------------------------------------------------------------
 *
 * It renders no per-visitor data: the form is a client component and its server
 * action runs on submit. Nothing here reads cookies, so the route stays
 * prerendered and is not caught by the "changed from static to dynamic" failure
 * that bit the product page.
 *
 * The process is described in the order the customer experiences it, so the form
 * below is the last step rather than the first thing they meet.
 */
export const metadata: Metadata = buildMetadata({
  title: 'Sell or Trade',
  description:
    'Sell us your watch or trade it against another. Send us the details and a member of the team will come back with a valuation.',
  path: '/services/sell-trade',
});

const STEPS = [
  {
    title: 'Tell us about the watch',
    body: 'Brand, model, reference and condition. Photographs help, and we will ask for them if we need them.',
  },
  {
    title: 'We value it',
    body: 'A specialist reviews the details and comes back to you with a figure and the reasoning behind it.',
  },
  {
    title: 'You decide',
    body: 'Nothing is agreed until you accept. If you are trading, we will discuss the piece you want in the same conversation.',
  },
];

export default function Page() {
  return (
    <main id="main-content" className="container-page py-10 lg:py-14">
      <header className="max-w-prose">
        <p className="eyebrow">Services</p>
        <h1 className="mt-3 text-3xl sm:text-4xl">Sell or trade</h1>
        <p className="text-foreground-muted mt-3 text-base">
          We buy pre-owned luxury watches outright and take trades against pieces in our collection.
          Send us the details and a member of the team will come back with a valuation.
        </p>
      </header>

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
          Start a request
        </h2>
        <p className="text-foreground-muted mt-2 text-sm">
          This is a request, not a sale. Nothing is agreed and no payment is made until you accept a
          valuation.
        </p>
        <div className="mt-6">
          <SellTradeForm />
        </div>
      </section>
    </main>
  );
}
