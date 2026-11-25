import Link from 'next/link';

import { cn } from '@/lib/utils';
import type { SiteIdentity } from '@/lib/navigation/types';

/**
 * Wordmark.
 *
 * The crest is the supplied brand mark, served from `public/brand/crest.png`
 * and paired with the business name and tagline that come from the database.
 *
 * -----------------------------------------------------------------------------
 * WHY THE CREST IS NOT THE DATABASE ASSET, AND WHY THE NAME IS NOT IN THE IMAGE
 * -----------------------------------------------------------------------------
 *
 * `site_settings.logo_url` remains the *operator's* logo slot: an admin can point
 * it at their own file and the header uses it unmodified. The crest shipped here
 * is the supplied house mark, and it is the fallback when that slot is empty —
 * so the header never renders a blank space, and swapping the branding is still
 * a database edit rather than a deploy.
 *
 * The supplied artwork includes the words "CARBON WATCH COMPANY" beneath the
 * crest (`public/brand/lockup.png`). That lockup is *not* what the header draws:
 * baked-in text cannot follow the business name in `site_settings`, cannot be
 * re-flowed at 320px, and would put the name in the accessible name twice. The
 * header composes crest + live text instead. The lockup is kept for the social
 * card, where an image that already carries the name is exactly right.
 *
 * `tone` names the ground rather than a colour. The crest is gold with a
 * transparent background, so it reads on both the dark header and the dark
 * footer; the text colour is what actually changes.
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
  /** The ground the wordmark sits on. */
  tone?: 'light' | 'dark';
}) {
  const textClass = size === 'lg' ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl';
  const isLight = tone === 'light';

  // Only the height is set; `w-auto` keeps the crest's 1.24:1 proportions. The
  // header tier is larger because the crest is the site's only mark there and it
  // has to read at a glance next to 16px action icons.
  const crestClass = size === 'lg' ? 'h-11 sm:h-12' : 'h-9 sm:h-10';

  // An operator upload wins; the supplied crest is the fallback.
  const crestSrc = identity.logoUrl ?? '/brand/crest.png';

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
      {/*
       * The crest sits *beside* the business name. The image carries empty `alt`
       * because the name is right next to it: `alt={businessName}` would announce
       * it twice, and `aria-label` on the link would drop the visible text and
       * fail WCAG 2.5.3.
       *
       * A plain <img> rather than next/image: the logo is an operator upload
       * whose dimensions are unknown at build time, and the header needs it at a
       * fixed height without a layout shift.
       */}
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={crestSrc}
          alt=""
          aria-hidden="true"
          width={178}
          height={144}
          className={cn('w-auto shrink-0', crestClass)}
        />
        <span
          className={cn('flex min-w-0 flex-col leading-none', size === 'lg' ? 'pl-3' : 'pl-2.5')}
        >
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
