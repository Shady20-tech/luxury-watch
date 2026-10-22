import Image from 'next/image';

import { WatchIllustration } from '@/components/ui/watch-illustration';
import { cn } from '@/lib/utils';

/**
 * Editorial media frame.
 *
 * Luxury retail photography is presented, not decorated: a consistent aspect
 * ratio, generous surrounding space, and no busy chrome around the image. This
 * component enforces the presentation rules in one place so a card, a hero and a
 * gallery cannot drift apart.
 *
 * Two decisions worth stating:
 *
 *  - The image sits on a neutral panel with `object-contain`, because a watch is
 *    a tall object and `cover` crops the lugs and the crown off. The letterboxing
 *    is part of the look, not a compromise.
 *  - When there is no image yet, something deliberate renders instead of a
 *    broken-image icon or a stock photograph. Which something depends on the
 *    caller: a *product* passes `dialColor`/`caseMaterial` and gets original
 *    drawn artwork derived from those attributes, while anything else gets the
 *    labelled placeholder. Both are honest about not being photography, and
 *    `products` rows exist before their media does, so this state is real.
 */
export function MediaFrame({
  src,
  alt,
  ratio = '4/5',
  sizes = '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw',
  priority = false,
  dialColor,
  caseMaterial,
  className,
  imageClassName,
}: {
  /** `null` renders the fallback rather than an empty box. */
  src: string | null;
  alt: string;
  ratio?: '1/1' | '4/5' | '3/4' | '16/9';
  sizes?: string;
  priority?: boolean;
  /**
   * When set (even to `null`), the caller is presenting a watch and the fallback
   * is drawn artwork. Omitted, the fallback is the neutral placeholder — which is
   * what non-product media such as a hero or an editorial section wants.
   */
  dialColor?: string | null;
  caseMaterial?: string | null;
  className?: string;
  imageClassName?: string;
}) {
  const ratioClass = {
    '1/1': 'aspect-square',
    '4/5': 'aspect-4/5',
    '3/4': 'aspect-3/4',
    '16/9': 'aspect-video',
  }[ratio];

  const showsIllustration = src === null && (dialColor !== undefined || caseMaterial !== undefined);

  return (
    <div
      className={cn(
        'bg-surface-100 border-line-200 relative overflow-hidden rounded-sm border',
        ratioClass,
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className={cn('object-contain p-6', imageClassName)}
        />
      ) : showsIllustration ? (
        <div className="absolute inset-0">
          <WatchIllustration dialColor={dialColor} caseMaterial={caseMaterial} />
          {/* The drawing is decorative and carries no product detail, so the
              caption says what it is. `text-ink-500` rather than `ink-400`: this
              sits on `surface-100`, where `ink-400` is only 4.17:1 and fails
              WCAG AA for normal text, while `ink-500` reaches 5.27:1. */}
          <p className="text-ink-500 absolute inset-x-0 bottom-0 bg-surface-0/85 px-2 py-1 text-center text-[0.625rem] tracking-[0.12em] uppercase">
            Illustration &middot; photography to follow
          </p>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <p className="text-ink-500 text-center text-xs tracking-[0.14em] uppercase">
            Photography to follow
          </p>
        </div>
      )}
    </div>
  );
}
