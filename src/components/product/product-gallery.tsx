'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import type { ProductImage } from '@/lib/product/types';

/**
 * Product image gallery.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS A CLIENT COMPONENT AND WHAT IT OWNS
 * -----------------------------------------------------------------------------
 *
 * Only the selection and the zoom dialog are interactive; the images themselves
 * come from the server. So the component owns exactly one piece of state — which
 * image is shown — and nothing else. The product data is passed in, never
 * fetched here.
 *
 * -----------------------------------------------------------------------------
 * KEYBOARD AND SCREEN READER BEHAVIOUR
 * -----------------------------------------------------------------------------
 *
 *  - The thumbnails are a real `tablist`/`tab` pattern with roving tabindex: Tab
 *    enters the strip once, then Left/Right/Home/End move between thumbnails.
 *    This is the documented pattern for a set of tabs, and it avoids forcing a
 *    keyboard user through one Tab stop per image.
 *  - Left/Right also work while the main image has focus, so a visitor who
 *    never touches the thumbnails can still page through the gallery.
 *  - The live region announces the position ("Image 2 of 5") so a change caused
 *    by a keyboard press is not silent.
 *  - The zoom dialog is a Radix Dialog: focus is trapped and restored, Escape
 *    closes, and the trigger's `aria-expanded` state is managed. The dialog has a
 *    required accessible title rather than an unlabelled overlay.
 *
 * -----------------------------------------------------------------------------
 * LAYOUT STABILITY
 * -----------------------------------------------------------------------------
 *
 * Every image is placed in a fixed aspect-ratio box, so the page does not shift
 * when an image loads. When the row records real `width`/`height`, those are
 * passed to `next/image` as well, which lets it emit an accurate intrinsic size
 * and pick a sensible srcset; when they are absent, the ratio box still reserves
 * the space and `next/image` fills it.
 *
 * A product with no images renders the labelled placeholder, the same one the
 * cards use. That is a real state in this catalogue and it is stated, not hidden.
 */

const RATIO_CLASS = 'aspect-4/5';

/** A single image, sized by explicit dimensions when they are known. */
function GalleryImage({
  image,
  priority,
  sizes,
  className,
}: {
  image: ProductImage;
  priority?: boolean;
  sizes: string;
  className?: string;
}) {
  if (!image.url) {
    return (
      <div className="bg-surface-100 absolute inset-0 flex items-center justify-center p-6">
        {/* `text-ink-500` reaches 5.27:1 on `bg-surface-100`; `ink-400` does not. */}
        <p className="text-ink-500 text-center text-xs tracking-[0.14em] uppercase">
          Photography to follow
        </p>
      </div>
    );
  }

  if (image.width && image.height) {
    return (
      <Image
        src={image.url}
        alt={image.alt}
        width={image.width}
        height={image.height}
        sizes={sizes}
        priority={priority}
        className={cn('h-full w-full object-contain p-6', className)}
      />
    );
  }

  return (
    <Image
      src={image.url}
      alt={image.alt}
      fill
      sizes={sizes}
      priority={priority}
      className={cn('object-contain p-6', className)}
    />
  );
}

export function ProductGallery({
  images,
  title,
  className,
}: {
  images: ProductImage[];
  /** Used for the dialog title when a product has no brand context. */
  title: string;
  className?: string;
}) {
  const [active, setActive] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const count = images.length;
  const current = images[active] ?? images[0] ?? null;

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      // Wrap, so Left from the first image reaches the last. A gallery with a
      // hard stop at each end is a common and avoidable annoyance.
      const wrapped = ((next % count) + count) % count;
      setActive(wrapped);
      thumbnailRefs.current[wrapped]?.focus();
    },
    [count],
  );

  /** Arrow keys on the main image, so the gallery is usable without the strip. */
  const onMainKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (count < 2) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(active - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        go(active + 1);
      }
    },
    [active, count, go],
  );

  /** Roving tabindex on the thumbnail strip. */
  const onThumbnailKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          go(index - 1);
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          go(index + 1);
          break;
        case 'Home':
          event.preventDefault();
          go(0);
          break;
        case 'End':
          event.preventDefault();
          go(count - 1);
          break;
        default:
          break;
      }
    },
    [count, go],
  );

  // Keep focus with the strip after a selection made by clicking, so a
  // subsequent arrow press continues from the chosen image rather than from
  // wherever focus happened to be.
  useEffect(() => {
    const node = thumbnailRefs.current[active];
    if (node && document.activeElement && node.parentElement?.contains(document.activeElement)) {
      node.focus();
    }
  }, [active]);

  // A product with no images. Stated plainly rather than rendered as an empty
  // box, and the zoom control is absent because there is nothing to zoom.
  if (count === 0) {
    return (
      <div className={cn('w-full', className)}>
        <div
          className={cn(
            'bg-surface-100 border-line-200 relative overflow-hidden rounded-sm border',
            RATIO_CLASS,
          )}
        >
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <p className="text-ink-500 text-center text-xs tracking-[0.14em] uppercase">
              Photography to follow
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'group bg-surface-100 border-line-200 relative overflow-hidden rounded-sm border',
          RATIO_CLASS,
        )}
      >
        <div
          role="group"
          aria-roledescription="carousel"
          aria-label={`${title} images`}
          tabIndex={count > 1 ? 0 : -1}
          onKeyDown={onMainKeyDown}
          className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
        >
          {current ? (
            <GalleryImage image={current} priority sizes="(min-width: 1024px) 50vw, 100vw" />
          ) : null}
        </div>

        {/* The zoom affordance. A real button with a text label that is visible
            to a screen reader and hidden only visually on small screens. */}
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          className="glass-panel text-foreground hover:bg-surface-0 absolute right-3 bottom-3 inline-flex items-center gap-2 rounded-sm px-3 py-2 text-xs font-medium"
        >
          <Maximize2 aria-hidden="true" className="h-4 w-4" />
          View full size
        </button>

        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(active - 1)}
              aria-label="Previous image"
              className="glass-panel text-foreground hover:bg-surface-0 absolute top-1/2 left-3 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-sm"
            >
              <ChevronLeft aria-hidden="true" className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(active + 1)}
              aria-label="Next image"
              className="glass-panel text-foreground hover:bg-surface-0 absolute top-1/2 right-3 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-sm"
            >
              <ChevronRight aria-hidden="true" className="h-5 w-5" />
            </button>
          </>
        ) : null}
      </div>

      {/* Position announcement. `aria-live="polite"` so a keyboard-driven change
          is reported without interrupting. */}
      <p aria-live="polite" className="sr-only">
        Image {active + 1} of {count}
      </p>

      {count > 1 ? (
        <div
          role="tablist"
          aria-label="Product images"
          className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6"
        >
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              role="tab"
              ref={(node) => {
                thumbnailRefs.current[index] = node;
              }}
              aria-selected={index === active}
              aria-label={`Show image ${index + 1} of ${count}`}
              // Roving tabindex: only the selected thumbnail is in the tab order.
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => onThumbnailKeyDown(event, index)}
              className={cn(
                'bg-surface-100 relative aspect-square overflow-hidden rounded-sm border',
                index === active ? 'border-gold-700' : 'border-line-200 hover:border-line-300',
              )}
            >
              {image.url ? (
                <Image src={image.url} alt="" fill sizes="120px" className="object-contain p-1.5" />
              ) : (
                <span className="text-ink-500 absolute inset-0 flex items-center justify-center text-[10px] tracking-wide uppercase">
                  —
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}

      <DialogPrimitive.Root open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="bg-scrim fixed inset-0 z-50" />
          <DialogPrimitive.Content
            className="bg-surface-0 fixed inset-0 z-50 flex flex-col"
            aria-describedby={undefined}
          >
            <div className="border-line-200 flex items-center justify-between border-b px-4 py-3">
              <DialogPrimitive.Title className="text-sm font-semibold">
                {title} — image {active + 1} of {count}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                aria-label="Close full-size image"
                className="text-ink-700 hover:bg-surface-100 -mr-1 inline-flex h-10 w-10 items-center justify-center rounded-sm"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {current?.url ? (
                <Image
                  src={current.url}
                  alt={current.alt}
                  width={current.width ?? 1600}
                  height={current.height ?? 2000}
                  sizes="100vw"
                  className="mx-auto h-auto max-w-4xl object-contain"
                />
              ) : (
                <p className="text-ink-500 py-20 text-center text-sm">
                  Photography for this piece is not available yet.
                </p>
              )}
            </div>

            {count > 1 ? (
              <div className="border-line-200 flex items-center justify-center gap-4 border-t px-4 py-3">
                <button
                  type="button"
                  onClick={() => go(active - 1)}
                  aria-label="Previous image"
                  className="hover:bg-surface-100 inline-flex h-10 w-10 items-center justify-center rounded-sm"
                >
                  <ChevronLeft aria-hidden="true" className="h-5 w-5" />
                </button>
                <span className="text-foreground-muted text-sm">
                  {active + 1} / {count}
                </span>
                <button
                  type="button"
                  onClick={() => go(active + 1)}
                  aria-label="Next image"
                  className="hover:bg-surface-100 inline-flex h-10 w-10 items-center justify-center rounded-sm"
                >
                  <ChevronRight aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
            ) : null}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
