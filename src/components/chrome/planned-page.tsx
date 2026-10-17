import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/**
 * A route that exists but whose content arrives in a later phase.
 *
 * Several links in the navigation point at routes that Phase 3 does not build —
 * the catalogue, a product page, the service flows. The alternatives were to
 * leave the links out (making the navigation an inaccurate picture of the site)
 * or to point them at a 404. Neither is honest: the link is real and the route
 * *is* planned.
 *
 * So each route resolves to a real page that says exactly what it is and what
 * phase will fill it. Nothing is faked, nothing 404s, and the sitemap can
 * exclude these routes until they have real content. `noindex` is set on the
 * page metadata so a thin placeholder is never indexed.
 */
export function PlannedPage({
  eyebrow,
  title,
  intro,
  phase,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  /** The phase that will build this route, so the state is unambiguous. */
  phase: string;
  children?: ReactNode;
}) {
  return (
    <div className="container-narrow py-20 lg:py-28">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-4 text-3xl sm:text-4xl">{title}</h1>
      <p className="text-foreground-muted mt-6 text-base leading-relaxed sm:text-lg">{intro}</p>

      <p className="border-line-200 text-foreground-muted mt-8 rounded-sm border-l-2 py-1 pl-4 text-sm">
        This page is scheduled for{' '}
        <strong className="text-foreground font-semibold">{phase}</strong>. It is shown here so the
        navigation is complete and no link leads to a dead end.
      </p>

      {children ? <div className="mt-10">{children}</div> : null}

      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild variant="secondary">
          <Link href="/">Return to the home page</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/contact">Contact the boutique</Link>
        </Button>
      </div>
    </div>
  );
}
