import Link from 'next/link';

import { cn } from '@/lib/utils';
import type { SiteIdentity } from '@/lib/navigation/types';

/**
 * Wordmark.
 *
 * When `site_settings.logo_url` is set, the real asset is used. Until then a
 * text wordmark renders, built from the business name in the database, so the
 * header is never blank and never shows a placeholder image box. Swapping in the
 * approved asset is a database edit, not a code change.
 */
export function Wordmark({
  identity,
  className,
  size = 'md',
}: {
  identity: SiteIdentity;
  className?: string;
  size?: 'md' | 'lg';
}) {
  const textClass = size === 'lg' ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl';

  return (
    <Link
      href="/"
      className={cn(
        // `min-w-0` lets this shrink inside the header flex row. The business
        // name comes from the database and its length is not known at build
        // time, so the text is allowed to truncate rather than push the action
        // icons off the edge of a narrow screen.
        'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-700 inline-flex min-w-0 items-center',
        className,
      )}
    >
      {identity.logoUrl ? (
        // A plain <img> is used rather than next/image: the logo is an operator
        // upload whose dimensions are unknown at build time, and the header
        // needs it at a fixed height without a layout shift.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={identity.logoUrl}
          alt={identity.businessName}
          className={size === 'lg' ? 'h-9 w-auto' : 'h-8 w-auto'}
        />
      ) : (
        <span className="flex min-w-0 flex-col leading-none">
          <span className={cn('font-display text-ink-950 truncate tracking-[0.02em]', textClass)}>
            {identity.businessName}
          </span>
          {identity.tagline ? (
            <span className="text-ink-500 mt-1 truncate text-[0.625rem] tracking-[0.18em] uppercase">
              {identity.tagline}
            </span>
          ) : null}
        </span>
      )}
      {/*
       * The "home" hint is added as text rather than as an `aria-label` on the
       * link. An `aria-label` replaces the accessible name computed from the
       * contents, so labelling the link "Business — home" while the link also
       * shows the business name *and* the tagline leaves the visible text
       * outside the accessible name — a WCAG 2.5.3 (Label in Name) failure that
       * axe reports as `label-content-name-mismatch`. Appending the hint keeps
       * the visible text inside the accessible name, which is what the rule
       * requires. `sr-only` is positioned out of flow, so it cannot affect the
       * header layout or the truncation above.
       */}
      <span className="sr-only">— Home</span>
    </Link>
  );
}
