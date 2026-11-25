import Image from 'next/image';

import type { SitePhotograph } from '@/lib/images/site-photography';

/**
 * The photographic band above the sign-in, registration and password forms.
 *
 * The auth pages deliberately do **not** use `PageHero`. `PageHero` carries the
 * page's `h1`, and every form here renders its own `h1` inside `AuthPanel`, so
 * using the shared band would put two `h1`s on the page and the browser audit
 * does not catch that.
 *
 * What these pages needed was not a title band but a sense of arrival — a
 * dark strip of watch photography above a narrow white form, which is the
 * register the rest of the site opens in. So this is a pure decoration band: no
 * heading, no copy, `aria-hidden`, fixed height. The form below still owns the
 * `h1` and the page's semantic structure is unchanged.
 */
export function AuthBand({ photograph }: { photograph: SitePhotograph }) {
  return (
    <div aria-hidden="true" className="relative isolate h-40 overflow-hidden bg-night-900 sm:h-56">
      <Image
        src={photograph.src}
        alt=""
        fill
        loading="lazy"
        sizes="100vw"
        className="object-cover object-center opacity-60"
      />
      <div className="from-night-900 via-night-900/70 absolute inset-0 bg-gradient-to-t to-night-900/10" />
      {/* The gold hairline is the one piece of the site's accent that appears on
          these pages, so the band reads as part of the same design rather than a
          stock photo above a form. */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-gold-300/40" />
    </div>
  );
}
