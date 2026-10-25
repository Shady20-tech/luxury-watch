import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The dark band that opens an interior page.
 *
 * Every non-homepage template in the reference opens with the same shape: a
 * near-black band carrying a small gold eyebrow, the page title in the serif
 * face and an optional line of supporting copy, then the page content on the
 * light ground below. It is the counterpart to the homepage's dark hero and the
 * reason an interior page does not read as a different site.
 *
 * The band is full-bleed and the *contents* are constrained, rather than the
 * band sitting inside the page container. A dark panel that stopped short of the
 * viewport edges would read as a card, not as the page's opening.
 *
 * The heading is an `h1` because this band carries the page title on every
 * template that uses it. A page that needs a different level should not use this
 * component.
 */
export function PageHero({
  eyebrow,
  title,
  intro,
  actions,
  breadcrumbs,
}: {
  eyebrow?: string | null;
  title: string;
  intro?: string | null;
  /** Controls that belong with the title, aligned to the end on wide screens. */
  actions?: ReactNode;
  /**
   * Breadcrumbs sit *below* the band, on the light ground, rather than inside
   * it: a trail on the dark ground competes with the title for the same
   * attention, and the breadcrumb component's link colours are tuned for the
   * light ground.
   */
  breadcrumbs?: ReactNode;
}) {
  return (
    <>
      <section className="bg-night-900">
        <div className="container-page py-12 sm:py-16 lg:py-20">
          <div
            className={cn(
              'flex flex-col gap-6',
              actions && 'sm:flex-row sm:items-end sm:justify-between',
            )}
          >
            <div className="max-w-prose">
              {eyebrow ? <p className="eyebrow text-gold-300">{eyebrow}</p> : null}
              <h1 className={cn('text-on-night text-3xl sm:text-4xl', eyebrow && 'mt-3')}>
                {title}
              </h1>
              {intro ? <p className="text-on-night-muted mt-4 text-base">{intro}</p> : null}
            </div>

            {actions ? <div className="flex shrink-0 gap-3">{actions}</div> : null}
          </div>
        </div>
      </section>

      {breadcrumbs ? <div className="container-page pt-6">{breadcrumbs}</div> : null}
    </>
  );
}
