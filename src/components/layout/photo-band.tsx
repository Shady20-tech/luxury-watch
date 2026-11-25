import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { SitePhotograph } from '@/lib/images/site-photography';
import { cn } from '@/lib/utils';

/**
 * Editorial photography bands for the middle of a page.
 *
 * The hero opens a page; these keep the rest of it from becoming a column of
 * text on white. Three shapes cover every use on the site, and they are one
 * component so the masking, the credit and the accessibility behaviour cannot
 * drift between pages.
 *
 * -----------------------------------------------------------------------------
 * THE MASK IS NOT DECORATION
 * -----------------------------------------------------------------------------
 *
 * Each shape puts its text on a surface that is guaranteed readable whatever the
 * photograph does: `overlay` and `panel` place text over a `night`-toned scrim,
 * and `split` puts it on the page ground entirely. None of them sets text
 * directly on an uncontrolled image, because a photograph's luminance varies
 * across the frame and a token that passes AA against one region can fail
 * against another. The browser audit checks the mounted result, but the
 * component does not rely on the audit to be safe.
 *
 * -----------------------------------------------------------------------------
 * CREDIT
 * -----------------------------------------------------------------------------
 *
 * CC BY and CC BY-SA require the author to be named. `credit` defaults to true
 * and renders a small line on the band; turning it off is only correct when the
 * same photograph's credit appears immediately beside the crop, which is not the
 * case on any current page. `tests/site-photography.test.ts` keeps the licences
 * valid; this component makes sure they are actually displayed.
 */
export function PhotoBand({
  photograph,
  eyebrow,
  title,
  body,
  action,
  shape = 'overlay',
  accent = 'gold',
  credit = true,
  className,
}: {
  photograph: SitePhotograph;
  eyebrow?: string | null;
  title: string;
  body?: string | null;
  action?: { href: string; label: string } | null;
  /** `overlay`: text on the image. `split`: image beside text. `panel`: image behind a card. */
  shape?: 'overlay' | 'split' | 'panel';
  accent?: 'gold' | 'emerald' | 'burgundy' | 'sapphire';
  credit?: boolean;
  className?: string;
}) {
  const accentText = {
    gold: 'text-gold-300',
    emerald: 'text-emerald-300',
    burgundy: 'text-burgundy-300',
    sapphire: 'text-sapphire-300',
  }[accent];

  const accentButton = {
    gold: 'bg-gold-300 text-night-950 hover:bg-gold-bright',
    emerald: 'bg-emerald-300 text-night-950 hover:bg-emerald-300/85',
    burgundy: 'bg-burgundy-300 text-night-950 hover:bg-burgundy-300/85',
    sapphire: 'bg-sapphire-300 text-night-950 hover:bg-sapphire-300/85',
  }[accent];

  const creditLine =
    credit && photograph.credit ? (
      <p className="text-on-night-muted/80 mt-4 text-[0.6875rem]">
        Photograph: {photograph.credit} ({photograph.licence})
      </p>
    ) : null;

  if (shape === 'split') {
    return (
      <section className={cn('bg-surface-warm', className)}>
        <div className="container-page grid items-center gap-8 py-14 lg:grid-cols-2 lg:gap-16 lg:py-20">
          <div className="relative order-2 aspect-4/5 overflow-hidden rounded-sm lg:order-1">
            <Image
              src={photograph.src}
              alt={photograph.alt}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>

          <div className="order-1 lg:order-2">
            {eyebrow ? <p className="eyebrow text-ink-500">{eyebrow}</p> : null}
            <h2 className={cn('mt-3 text-2xl sm:text-3xl', eyebrow && 'mt-3')}>{title}</h2>
            {body ? <p className="text-foreground-muted mt-4 max-w-prose">{body}</p> : null}
            {action ? (
              <p className="mt-7">
                <Link
                  href={action.href}
                  className="text-ink-900 focus-visible:outline-gold-700 inline-flex items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {action.label}
                  <span aria-hidden="true">→</span>
                </Link>
              </p>
            ) : null}
            <p className="text-ink-500 mt-4 text-[0.6875rem]">
              Photograph: {photograph.credit} ({photograph.licence})
            </p>
          </div>
        </div>
      </section>
    );
  }

  // `overlay` and `panel` share the image treatment and differ only in how much
  // of the frame the text block covers.
  return (
    <section className={cn('relative isolate overflow-hidden bg-night-950', className)}>
      <Image
        src={photograph.src}
        alt=""
        aria-hidden="true"
        fill
        sizes="100vw"
        className="object-cover object-center opacity-60"
      />
      <div
        className={cn(
          'absolute inset-0',
          shape === 'overlay'
            ? 'from-night-950 via-night-950/80 to-night-950/30 bg-gradient-to-r'
            : 'from-night-950/95 via-night-950/85 to-night-950/70 bg-gradient-to-r',
        )}
      />

      <div className="container-page relative py-16 lg:py-24">
        <div
          className={cn(shape === 'panel' && 'glass-panel-night-strong max-w-lg rounded-sm p-8')}
        >
          {eyebrow ? (
            <p
              className={cn(
                'text-[0.6875rem] font-semibold tracking-[0.28em] uppercase',
                accentText,
              )}
            >
              {eyebrow}
            </p>
          ) : null}
          <h2 className={cn('text-on-night text-2xl sm:text-3xl', eyebrow && 'mt-4')}>{title}</h2>
          {body ? <p className="text-on-night-muted mt-4 max-w-prose">{body}</p> : null}
          {action ? (
            <Link
              href={action.href}
              className={cn(
                'focus-visible:outline-gold-300 mt-8 inline-flex items-center gap-2 rounded-sm px-6 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2',
                accentButton,
              )}
            >
              {action.label}
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}
          {creditLine}
        </div>
      </div>
    </section>
  );
}

/**
 * A small strip of photographs used as a divider or a texture.
 *
 * Deliberately not a carousel: these are three stills that sit beside each other
 * and hold still. Motion here would be decoration for its own sake, and the
 * homepage already carries the one moving element the design wants.
 */
export function PhotoStrip({
  photographs,
  className,
}: {
  photographs: SitePhotograph[];
  className?: string;
}) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-3', className)}>
      {photographs.map((photo) => (
        <figure key={photo.src} className="relative aspect-square overflow-hidden rounded-sm">
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="(min-width: 640px) 33vw, 100vw"
            className="object-cover"
          />
          <figcaption className="text-ink-500 mt-2 text-[0.625rem]">
            {photo.credit} ({photo.licence})
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Text block used beside decoration, so pages do not repeat the same markup. */
export function EditorialPanel({
  eyebrow,
  title,
  children,
  accent = 'gold',
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  accent?: 'gold' | 'emerald' | 'burgundy' | 'sapphire';
}) {
  const rule = {
    gold: 'bg-gold-500',
    emerald: 'bg-emerald-600',
    burgundy: 'bg-burgundy-700',
    sapphire: 'bg-sapphire-700',
  }[accent];

  return (
    <div>
      <div className={cn('h-0.5 w-12', rule)} aria-hidden="true" />
      {eyebrow ? <p className="eyebrow mt-5">{eyebrow}</p> : null}
      <h2 className="mt-2 text-2xl sm:text-3xl">{title}</h2>
      <div className="text-foreground-muted mt-4 space-y-4">{children}</div>
    </div>
  );
}
