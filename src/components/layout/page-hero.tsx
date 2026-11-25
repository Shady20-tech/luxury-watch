import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';

import type { SitePhotograph } from '@/lib/images/site-photography';
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
 *
 * -----------------------------------------------------------------------------
 * PHOTOGRAPHY
 * -----------------------------------------------------------------------------
 *
 * A band with no photograph is a black rectangle, and a site where every page
 * opens with the same black rectangle reads as unfinished. Passing `photograph`
 * lays an editorial image across the whole band — a wallpaper, not an inset
 * panel — masked so the column the text occupies stays near-black.
 *
 * Three rules make that safe:
 *
 *  - The image is `aria-hidden` with empty `alt`. It is decoration; the page
 *    already names itself in the `h1`, and announcing "a watch" before every
 *    heading is noise for a screen-reader user.
 *  - It is masked with gradients rather than dimmed with opacity alone: a
 *    left-to-right `night-900` wash under the headline and a bottom-up fade
 *    under the supporting copy. Text contrast is then a property of the
 *    gradients, not of whichever photograph is passed. The browser audit
 *    measures the composed result instead of trusting that claim.
 *  - It is prioritised, because it **is** the LCP element. An earlier revision
 *    left it lazy on the assumption that the `h1` text would win LCP; Lighthouse
 *    measured the photograph instead, on mobile and on desktop, and reported a
 *    0.57 LCP score with `lcp-discovery-insight` failing on "lazy load not
 *    applied" and "fetchpriority=high should be applied". `priority` makes
 *    next/image emit a preload link with `fetchpriority="high"`, which is the
 *    signal the browser needed. The band is above the fold on every route that
 *    uses it, so there is no route where preloading it is wasteful.
 *
 * -----------------------------------------------------------------------------
 * SECTION COLOUR
 * -----------------------------------------------------------------------------
 *
 * Each section of the site carries its own accent, so a visitor moving between
 * the catalogue, the journal, service and the account area sees a different
 * colour temperature on arrival. That identity is the eyebrow colour *and* a
 * soft radial glow in the same hue behind the band, never a fill: `-500` as a
 * background under a heading fails contrast on the left where the text sits, and
 * `-900` as a fill is an unreadable black anyway. The glow is placed to the right
 * of the headline column for exactly that reason.
 *
 * Every accent is a `-300` token for the eyebrow, which is the only end of those
 * families legible on the night ground, and `tests/design-tokens.test.ts`
 * already pins every `-300`/`-900` pair.
 */
export type PageHeroTone = 'gold' | 'emerald' | 'burgundy' | 'sapphire';

/** Accent class fragments, written out so Tailwind can see every literal. */
const ACCENTS: Record<PageHeroTone, { eyebrow: string; glow: string; rule: string }> = {
  gold: {
    eyebrow: 'text-gold-300',
    glow: 'from-gold-700/35',
    rule: 'bg-gold-300/30',
  },
  emerald: {
    eyebrow: 'text-emerald-300',
    glow: 'from-emerald-700/35',
    rule: 'bg-emerald-300/30',
  },
  burgundy: {
    eyebrow: 'text-burgundy-300',
    glow: 'from-burgundy-700/35',
    rule: 'bg-burgundy-300/30',
  },
  sapphire: {
    eyebrow: 'text-sapphire-300',
    glow: 'from-sapphire-700/35',
    rule: 'bg-sapphire-300/30',
  },
};

export function PageHero({
  eyebrow,
  title,
  intro,
  actions,
  breadcrumbs,
  photograph,
  eyebrowTone = 'gold',
  tone = 'night',
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
  /** Editorial image laid across the band. Decorative only. */
  photograph?: SitePhotograph;
  /**
   * The section's accent. `gold` is the default; a brand, collection or section
   * page carries its own so the site does not open in one colour everywhere.
   * Each is a `-300` token for the eyebrow and a `-900` for the glow.
   */
  eyebrowTone?: PageHeroTone;
  /** `night` is the standard band. `deep` is a richer near-black. */
  tone?: 'night' | 'deep';
}) {
  const accent = ACCENTS[eyebrowTone];

  return (
    <>
      <section
        className={cn(
          'relative isolate overflow-hidden',
          tone === 'deep' ? 'bg-night-950' : 'bg-night-900',
        )}
      >
        {photograph ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <Image
              src={photograph.src}
              alt=""
              fill
              priority
              // Next 15.5's `priority` emits the preload link but no longer sets
              // `fetchpriority` on the `<img>` itself, so the element still
              // competed at the browser's default priority and Lighthouse
              // reported "fetchpriority=high should be applied" on the LCP node.
              // Passing it explicitly is what actually raises the hint.
              fetchPriority="high"
              sizes="100vw"
              className="object-cover object-center brightness-110 saturate-105"
            />
            {/* The wash, tuned by where the copy actually is.

                The `h1` and its intro occupy the left of the band, up to about
                55% of the width on a wide screen. The wash is therefore opaque
                there and clears across the last third, so the subject on the
                right is a photograph rather than a suggestion of one. An earlier
                revision held `night-900/75` until the halfway mark, which left
                the photo side at roughly 90/255 mean luminance — visible in the
                DOM, unreadable on screen.

                The stops are written as an arbitrary gradient rather than
                `from/via/to` because Tailwind's three-stop form cannot express a
                curve this shape: it needs to stay flat, drop late, and reach
                zero.

                On a phone there is no "photo side" — the copy spans the band — so
                a second, vertical wash carries the contrast there. It is opaque
                enough for white text over a white-background product shot, and
                it is scoped below `lg` so it never dims the desktop photograph.

                Both washes are measured by `npm run audit:a11y`, which
                composites the gradient and the image the way a browser does.
                jsdom cannot, which is why this cannot be asserted in a unit
                test. */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(8,8,8,0.97)_0%,rgba(8,8,8,0.95)_38%,rgba(8,8,8,0.82)_52%,rgba(8,8,8,0.38)_66%,rgba(8,8,8,0.08)_80%,rgba(8,8,8,0)_100%)]" />
            <div className="bg-night-900/72 absolute inset-0 lg:hidden" />
          </div>
        ) : null}

        {/* The section's colour identity, as a corner glow. Sits above the
            photograph so the accent survives whatever image is passed, and is
            kept to the right half so it never reaches the headline. */}
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 bg-gradient-to-bl via-transparent to-transparent',
            accent.glow,
          )}
        />

        <div className="container-page relative py-14 sm:py-20 lg:py-28">
          <div
            className={cn(
              'flex flex-col gap-6',
              actions && 'sm:flex-row sm:items-end sm:justify-between',
            )}
          >
            <div className={cn('max-w-prose', photograph && 'lg:max-w-2xl')}>
              {eyebrow ? (
                <p
                  className={cn('eyebrow hero-in flex items-center gap-3', accent.eyebrow)}
                  style={{ '--hero-delay': '0ms' } as CSSProperties}
                >
                  <span aria-hidden="true" className={cn('h-px w-6', accent.rule)} />
                  {eyebrow}
                </p>
              ) : null}
              <h1
                className={cn('text-on-night hero-in text-4xl sm:text-5xl', eyebrow && 'mt-3')}
                style={{ '--hero-delay': '70ms' } as CSSProperties}
              >
                {title}
              </h1>
              {intro ? (
                <p
                  className="text-on-night-muted hero-in mt-4 max-w-prose text-base"
                  style={{ '--hero-delay': '150ms' } as CSSProperties}
                >
                  {intro}
                </p>
              ) : null}
            </div>

            {actions ? <div className="flex shrink-0 gap-3">{actions}</div> : null}
          </div>
        </div>
      </section>

      {breadcrumbs ? <div className="container-page pt-6">{breadcrumbs}</div> : null}
    </>
  );
}
