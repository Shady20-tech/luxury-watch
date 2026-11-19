import Link from 'next/link';

import type { ProductPolicy } from '@/lib/product/types';
import { cn } from '@/lib/utils';

/**
 * Buying-assurance summaries beside a product.
 *
 * -----------------------------------------------------------------------------
 * EVERY SENTENCE COMES FROM THE OWNER'S OWN POLICY PAGES
 * -----------------------------------------------------------------------------
 *
 * The phase requires authenticity, warranty, shipping and returns information,
 * and it forbids inventing promises. Those two requirements together decide the
 * whole shape of this component: each entry is a published `pages` row, the
 * title is that row's title and the sentence is that row's excerpt. Nothing is
 * composed here.
 *
 * The alternative — a hand-written "12-month warranty, 14-day returns" block —
 * would be a promise made by a component, which nobody can edit and which would
 * silently contradict the warranty page the moment the owner changed it. A
 * warranty term is a contractual statement, so it belongs in the CMS.
 *
 * -----------------------------------------------------------------------------
 * WHY EACH ENTRY LINKS OUT RATHER THAN EXPANDING
 * -----------------------------------------------------------------------------
 *
 * The excerpt is a summary; the page is the policy. Reproducing the full text
 * here would create a second copy that drifts from the first, and the product
 * page would then be the authority on a warranty — which it is not.
 *
 * -----------------------------------------------------------------------------
 * WHEN NOTHING IS PUBLISHED
 * -----------------------------------------------------------------------------
 *
 * `policies` is empty and the component renders nothing at all. A visible box
 * saying "no policies available" would be worse than its absence: it advertises
 * a gap to every visitor on every product. The absence is recorded as a known
 * issue instead, where the owner will see it.
 */
export function TrustPanel({
  policies,
  className,
}: {
  policies: ProductPolicy[];
  className?: string;
}) {
  if (policies.length === 0) return null;

  return (
    <section
      aria-labelledby="assurance-heading"
      className={cn('border-line-200 border-t pt-6', className)}
    >
      <h2 id="assurance-heading" className="text-sm font-semibold tracking-wide uppercase">
        Buying with confidence
      </h2>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {policies.map((policy) => (
          <div key={policy.slug}>
            <dt className="text-foreground text-sm font-semibold">
              {/* The link text is the policy's own title, so a screen-reader user
                  hears the same words a sighted visitor reads. */}
              <Link
                href={`/pages/${policy.slug}`}
                className="text-accent-text underline underline-offset-4"
              >
                {policy.title}
              </Link>
            </dt>
            {policy.excerpt ? (
              <dd className="text-ink-500 mt-1 text-sm leading-relaxed">{policy.excerpt}</dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
