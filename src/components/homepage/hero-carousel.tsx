'use client';

import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { MediaFrame } from '@/components/ui/media-frame';
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
      className={cn('border-line-200 bg-surface-50 border-b', className)}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="container-page grid gap-12 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
        <div>
          {slide.eyebrow ? <p className="eyebrow">{slide.eyebrow}</p> : null}

          {/* The `h1` is on the first slide only. Later slides use a `p` styled
              identically, so the page never has two `h1`s. */}
          {isFirst ? (
            <h1 id={headingId} className="mt-5 text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
              {slide.title}
            </h1>
          ) : (
            <p id={headingId} className="mt-5 text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
              {slide.title}
            </p>
          )}

          {slide.body ? (
            <p className="text-foreground-muted mt-6 max-w-prose text-lg">{slide.body}</p>
          ) : null}

          {slide.cta ? (
            <div className="mt-9">
              <Button asChild size="lg">
                <Link href={slide.cta.href}>{slide.cta.label}</Link>
              </Button>
            </div>
          ) : null}

          {count > 1 ? (
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="icon"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                <span className="sr-only">Previous slide</span>
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => goTo(index + 1)}
                disabled={index === count - 1}
              >
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
                <span className="sr-only">Next slide</span>
              </Button>

              {autoplayActive ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsPaused((paused) => !paused)}
                  aria-pressed={isPaused}
                >
                  {isPaused ? (
                    <Play aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <Pause aria-hidden="true" className="h-4 w-4" />
                  )}
                  {isPaused ? 'Play' : 'Pause'}
                </Button>
              ) : null}

              {/* Dot controls. Each is a real button with an accessible name
                  naming the slide it goes to, not just a number. */}
              <ul className="ml-1 flex items-center gap-1">
                {slides.map((item, slideIndex) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => goTo(slideIndex)}
                      aria-current={slideIndex === index ? 'true' : undefined}
                      className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 group flex h-11 w-6 items-center justify-center"
                    >
                      <span
                        className={cn(
                          'block h-1.5 rounded-full transition-colors',
                          slideIndex === index
                            ? 'bg-ink-900 w-5'
                            : 'bg-ink-300 group-hover:bg-ink-500 w-1.5',
                        )}
                      />
                      <span className="sr-only">{`Slide ${slideIndex + 1} of ${count}: ${item.title}`}</span>
                    </button>
                  </li>
                ))}
              </ul>

              {/* Announces the new position without moving focus. `polite` so
                  an autoplay advance does not interrupt whatever the user is
                  reading. */}
              <p id={statusId} aria-live="polite" className="sr-only">
                {`Slide ${index + 1} of ${count}`}
              </p>
            </div>
          ) : null}
        </div>

        <MediaFrame
          src={slide.imageUrl}
          alt={slide.imageUrl ? slide.imageAlt : ''}
          ratio="4/5"
          sizes="(min-width: 1024px) 50vw, 100vw"
          priority
        />
      </div>
    </section>
  );
}
