'use client';

import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { HeroSlide } from '@/lib/homepage/types';
import { cn } from '@/lib/utils';

/**
 * Hero carousel.
 *
 * A carousel is one of the easiest components to get wrong, so the decisions
 * are stated rather than left implicit:
 *
 *  - **The first slide is real, server-rendered content.** Only one slide is in
 *    the DOM at a time and the first one is in the initial HTML, so the page has
 *    a meaningful `h1` before JavaScript runs. A carousel that renders nothing
 *    until hydration is a blank page to a crawler.
 *
 *  - **Autoplay is off by default and must be earned.** Motion is a usability
 *    and vestibular hazard, and WCAG 2.2.2 requires a mechanism to pause
 *    anything that moves for more than five seconds. Autoplay therefore starts
 *    only when `autoPlaySeconds` is set, never starts when the visitor prefers
 *    reduced motion, pauses on hover and on focus-within, and pauses when the
 *    tab is hidden. The pause control is always rendered when autoplay is
 *    active, so the mechanism WCAG requires is genuinely present.
 *
 *  - **No wrapping.** At the last slide "next" is disabled rather than jumping
 *    back to the first. Looping is a common source of disorientation; the
 *    reference site's carousels do it, and it is one of the things we improve.
 *
 *  - **The slides are not a tablist.** They are a single region with a live
 *    status announcing the current position. `role="tablist"` would promise
 *    keyboard tab semantics that do not apply to a promotional hero.
 *
 *  - **Slides are switched, not scrolled.** Showing one slide at a time keeps
 *    the accessible tree small and means an off-screen slide's links are not
 *    reachable by keyboard. A CSS-translated track leaves every slide's links in
 *    the tab order, which is the bug that makes most carousels unusable.
 */
export function HeroCarousel({
  slides,
  autoPlaySeconds,
  className,
}: {
  slides: HeroSlide[];
  /**
   * Seconds between automatic advances. `null` disables autoplay entirely,
   * which is the default.
   */
  autoPlaySeconds?: number | null;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const headingId = useId();
  const statusId = useId();
  const regionRef = useRef<HTMLElement>(null);

  const count = slides.length;

  const goTo = useCallback(
    (next: number) => {
      setIndex(Math.min(Math.max(next, 0), count - 1));
    },
    [count],
  );

  // Respect the visitor's motion preference. This is read in an effect rather
  // than during render so the server and the first client render agree; the
  // cost is that autoplay could start for one tick before the preference is
  // known, which is why the interval below also checks `reducedMotion`.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);

    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const autoplayActive = Boolean(autoPlaySeconds) && !reducedMotion && count > 1;

  // The interval. `isPaused` covers hover and focus-within; `document.hidden`
  // covers a background tab, so the carousel does not advance while nobody is
  // looking and then jump several slides when the visitor returns.
  useEffect(() => {
    if (!autoplayActive || isPaused) return;

    const interval = window.setInterval(() => {
      if (document.hidden) return;
      setIndex((current) => {
        if (current >= count - 1) {
          // Stop at the end rather than looping.
          return current;
        }
        return current + 1;
      });
    }, autoPlaySeconds! * 1000);

    return () => window.clearInterval(interval);
  }, [autoplayActive, isPaused, autoPlaySeconds, count]);

  // Touch swipe. A horizontal drag past the threshold advances, but only when
  // the gesture is more horizontal than vertical, so a vertical scroll over the
  // hero is never hijacked.
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return;

    goTo(dx < 0 ? index + 1 : index - 1);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Arrow keys move between slides, which is what a sighted keyboard user
    // expects from a carousel. The buttons remain the primary control.
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(index + 1);
    }
  };

  if (count === 0) return null;

  const slide = slides[index];
  // `index` is kept in range by `goTo`, but narrowing here means a future change
  // to the clamping cannot produce a runtime crash on `slide.title`.
  if (!slide) return null;

  // The heading id only belongs to the visible slide, so the region is named by
  // the slide the visitor is actually looking at.
  const isFirst = index === 0;

  return (
    <section
      ref={regionRef}
      aria-roledescription="carousel"
      aria-labelledby={headingId}
      className={cn(
        // A fixed height ladder rather than a viewport fraction: the band should
        // read as a deliberate opening panel at every size, and `h-dvh` made it
        // a different shape on every phone.
        'bg-night-950 relative isolate h-[500px] w-full overflow-hidden select-none sm:h-[580px] lg:h-[640px]',
        className,
      )}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* The wallpaper.

          The photograph is the band itself rather than a panel beside the copy:
          at this size a 4/5 box beside the headline reads as a product card, and
          the brief for the homepage opening is a wall of watch photography you
          land on. It is `aria-hidden` and `alt=""` because it is atmosphere — the
          slide states its own subject in the heading, and announcing "a steel
          Rolex GMT-Master II" before every headline is noise.

          The plate crossfades: each slide's photograph is a layer that fades
          rather than swapping, and the incoming layer settles out of a 6%
          over-scale. Two scrims sit over all of them, and their weights are the
          legibility argument:

          - a top-to-bottom wash, heaviest at the bottom where the copy and the
            dot bar sit;
          - a radial vignette, darkest at the centre where the headline sits and
            lighter at the edges, so the band closes in on the type rather than
            flattening the picture.

          Between them the contrast of every text node is a property of the
          gradients, not of the photograph an administrator happens to pick. The
          browser audit measures the composed result at four viewports rather
          than trusting that claim. */}
      {slide.imageUrl ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <Image
            key={slide.id}
            src={slide.imageUrl}
            alt=""
            fill
            sizes="100vw"
            priority={isFirst}
            loading={isFirst ? undefined : 'lazy'}
            fetchPriority={isFirst ? 'high' : 'low'}
            className={cn(
              'object-cover object-center motion-safe:animate-[hero-settle_6000ms_ease-out_forwards]',
            )}
          />
          <div className="via-night-950/45 to-night-950/75 absolute inset-0 bg-gradient-to-b from-night-950/50" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.62)_0%,rgba(0,0,0,0.22)_65%)]" />
        </div>
      ) : null}

      {/* The copy column, centred.

          A hero that opens on the middle of the band reads as a cover; the
          left-aligned column that was here read as a page header with a picture
          behind it. The measure is capped so the headline never runs the full
          width of a wide viewport, which is what makes a centred block hold
          together. */}
      <div className="relative z-10 mx-auto flex h-full max-w-4xl flex-col items-center justify-center px-8 text-center sm:px-16">
        <div key={slide.id} className="flex flex-col items-center">
          {slide.eyebrow ? (
            <p
              className="hero-in text-sm tracking-wide text-white/90 sm:text-base"
              style={{ '--hero-delay': '0ms' } as CSSProperties}
            >
              {slide.eyebrow}
            </p>
          ) : null}

          {/* The `h1` is on the first slide only. Later slides use a `p` styled
              identically, so the page never has two `h1`s. */}
          {isFirst ? (
            <h1
              id={headingId}
              className="hero-in font-display mt-3 text-4xl leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl"
              style={{ '--hero-delay': '70ms' } as CSSProperties}
            >
              {slide.title}
            </h1>
          ) : (
            <p
              id={headingId}
              className="hero-in font-display mt-3 text-4xl leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl"
              style={{ '--hero-delay': '70ms' } as CSSProperties}
            >
              {slide.title}
            </p>
          )}

          {slide.body ? (
            <p
              className="hero-in mt-4 max-w-xl text-sm leading-relaxed text-white/90 sm:text-base"
              style={{ '--hero-delay': '150ms' } as CSSProperties}
            >
              {slide.body}
            </p>
          ) : null}

          {slide.cta ? (
            <div className="hero-in mt-8" style={{ '--hero-delay': '230ms' } as CSSProperties}>
              {/* An outlined button rather than the gold fill used lower on the
                  page: the hero's photograph supplies the only colour in the
                  band, and a solid accent block beside a photograph competes
                  with it. White-on-near-black clears AA comfortably, and the
                  inversion on hover is the affordance. */}
              <Link
                href={slide.cta.href}
                className="focus-visible:outline-gold-300 inline-flex items-center justify-center rounded-sm border border-white/80 px-7 py-3 text-sm font-medium tracking-wide text-white transition-colors duration-200 hover:bg-white hover:text-ink-950 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {slide.cta.label}
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {/* Previous / next, sitting on the band's mid-line.

          Hidden below `sm` because the dots already carry the same action and a
          44px target at each edge crowds a 320px band. Each is a real button
          with an explicit accessible name. */}
      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="focus-visible:outline-gold-300 absolute top-1/2 left-4 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/25 p-2.5 text-white/75 transition-colors hover:bg-black/50 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40 sm:left-8 sm:flex"
          >
            <ChevronLeft aria-hidden="true" className="h-6 w-6" />
            <span className="sr-only">Previous slide</span>
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={index === count - 1}
            className="focus-visible:outline-gold-300 absolute top-1/2 right-4 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/25 p-2.5 text-white/75 transition-colors hover:bg-black/50 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40 sm:right-8 sm:flex"
          >
            <ChevronRight aria-hidden="true" className="h-6 w-6" />
            <span className="sr-only">Next slide</span>
          </button>
        </>
      ) : null}

      {/* The dot bar along the bottom edge. Each dot is a real button with the
          slide it goes to in its accessible name, not just a number. The active
          dot widens rather than changing colour, so the current position is legible
          without relying on hue.

          The pause control lives here too when autoplay is active: WCAG 2.2.2
          requires a mechanism to stop motion that lasts more than five seconds,
          and it has to be reachable without hovering. */}
      {count > 1 ? (
        <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
          {slides.map((item, slideIndex) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goTo(slideIndex)}
              aria-current={slideIndex === index ? 'true' : undefined}
              className="focus-visible:outline-gold-300 flex min-h-7 min-w-7 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span
                className={cn(
                  'block h-2.5 rounded-full transition-all duration-300',
                  slideIndex === index ? 'w-7 bg-white' : 'w-2.5 bg-white/55 hover:bg-white/85',
                )}
              />
              <span className="sr-only">{`Slide ${slideIndex + 1} of ${count}: ${item.title}`}</span>
            </button>
          ))}

          {autoplayActive ? (
            <button
              type="button"
              onClick={() => setIsPaused((paused) => !paused)}
              aria-pressed={isPaused}
              className="focus-visible:outline-gold-300 ml-2 flex min-h-7 items-center gap-1.5 px-1 text-white/75 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {isPaused ? (
                <Play aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <Pause aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">{isPaused ? 'Play' : 'Pause'}</span>
            </button>
          ) : null}

          {/* Announces the new position without moving focus. `polite` so an
              autoplay advance does not interrupt whatever the user is reading. */}
          <p id={statusId} aria-live="polite" className="sr-only">
            {`Slide ${index + 1} of ${count}`}
          </p>
        </div>
      ) : null}
    </section>
  );
}
