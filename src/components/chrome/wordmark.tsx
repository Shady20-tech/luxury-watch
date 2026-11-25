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
  tone = 'dark',
}: {
  identity: SiteIdentity;
  className?: string;
  size?: 'md' | 'lg';
  /**
   * The ground the wordmark sits on. `light` is for the dark header, where the
   * near-black ink would be invisible; `dark` is for the light footer. Naming
   * the ground rather than a colour keeps the two call sites consistent and
   * means a token change cannot make one of them unreadable.
   */
  tone?: 'light' | 'dark';
}) {
  const textClass = size === 'lg' ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl';
  const isLight = tone === 'light';

  return (
    <Link
      href="/"
      className={cn(
        // `min-w-0` lets this shrink inside the header flex row. The business
        // name comes from the database and its length is not known at build
        // time, so the text is allowed to truncate rather than push the action
        // icons off the edge of a narrow screen.
        'focus-visible:outline-2 focus-visible:outline-offset-4 inline-flex min-w-0 items-center',
        isLight ? 'focus-visible:outline-gold-300' : 'focus-visible:outline-gold-700',
        className,
      )}
    >
      {identity.logoUrl ? (
        // The crest sits *beside* the business name rather than replacing it.
        // A lone 32px mark in the header leaves a storefront unnamed, and the
        // name is what a visitor uses to confirm they are where they meant to
        // be. The image carries empty `alt` because the name is right next to
        // it: giving the image `alt={businessName}` too would announce the name
        // twice, and `aria-label` on the link would drop the visible text and
        // fail WCAG 2.5.3.
        //
        // A plain <img> rather than next/image: the logo is an operator upload
        // whose dimensions are unknown at build time, and the header needs it at
        // a fixed height without a layout shift.
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={identity.logoUrl}
            alt=""
            aria-hidden="true"
            className={cn('w-auto shrink-0', size === 'lg' ? 'h-10 sm:h-11' : 'h-8 sm:h-9')}
          />
          <span className="flex min-w-0 flex-col leading-none pl-3">
            <span
              className={cn(
                'font-display truncate tracking-[0.02em]',
                isLight ? 'text-on-night' : 'text-ink-950',
                textClass,
              )}
            >
              {identity.businessName}
            </span>
            {identity.tagline ? (
              <span
                className={cn(
                  'mt-1 truncate text-[0.75rem] tracking-[0.18em] uppercase',
                  isLight ? 'text-on-night-muted' : 'text-ink-500',
                )}
              >
                {identity.tagline}
              </span>
            ) : null}
          </span>
        </>
      ) : (
        <span className="flex min-w-0 flex-col leading-none">
          <span
            className={cn(
              'font-display truncate tracking-[0.02em]',
              isLight ? 'text-on-night' : 'text-ink-950',
              textClass,
            )}
          >
            {identity.businessName}
          </span>
          {identity.tagline ? (
            <span
              className={cn(
                'mt-1 truncate text-[0.75rem] tracking-[0.18em] uppercase',
                isLight ? 'text-on-night-muted' : 'text-ink-500',
              )}
            >
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
