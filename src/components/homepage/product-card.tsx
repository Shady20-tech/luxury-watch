import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { MediaFrame } from '@/components/ui/media-frame';
import type { ProductCard as ProductCardModel } from '@/lib/homepage/types';
import { cn } from '@/lib/utils';

/**
 * Product card.
 *
 * Every value is rendered from the database row — there is no placeholder
 * product anywhere in this component. Two states are load-bearing:
 *
 *  - **Price.** `price` is `null` for a price-on-request piece, which is the
 *    norm for this catalogue. The card then shows "Request pricing" rather than
 *    a number. Printing "£0" or a made-up figure would be the single most
 *    damaging thing a storefront could do.
 *  - **Availability.** `available: false` renders a "Reserved" badge. It does
 *    not hide the card and it does not claim the piece is sold — a reserved
 *    watch is genuinely spoken for, and the badge says exactly that.
 *
 * The whole card is one link. The secondary actions (wishlist, add to cart)
 * belong to the catalogue phase, which is why they are absent rather than
 * rendered as dead buttons.
 */

/** Condition labels, keyed by the database vocabulary. */
const CONDITION_LABEL: Record<NonNullable<ProductCardModel['condition']>, string> = {
  new: 'New',
  unworn: 'Unworn',
  pre_owned: 'Pre-owned',
  vintage: 'Vintage',
};

export function ProductCard({
  product,
  priority = false,
  className,
}: {
  product: ProductCardModel;
  /** Set on the first card of the first rail so it is not lazy-loaded. */
  priority?: boolean;
  className?: string;
}) {
  const conditionLabel = product.condition ? CONDITION_LABEL[product.condition] : null;

  return (
    <article
      className={cn(
        'group border-line-200 bg-surface-0 hover:border-ink-300 relative flex h-full flex-col rounded-md border transition-[border-color,box-shadow] duration-200 focus-within:border-ink-300 hover:shadow-sm',
        className,
      )}
    >
      <div className="relative">
        <MediaFrame
          src={product.imageUrl}
          alt={product.imageAlt}
          ratio="4/5"
          priority={priority}
          dialColor={product.dialColor}
          caseMaterial={product.caseMaterial}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
        />
        {/* Badges sit over the media but are not interactive, so they are
            marked presentational and the text is repeated in the accessible
            name below. */}
        <div aria-hidden="true" className="absolute top-3 left-3 flex flex-wrap gap-2">
          {!product.available ? <Badge variant="soldOut">Reserved</Badge> : null}
          {product.isNew && product.available ? <Badge variant="accent">New</Badge> : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        {product.brandName ? (
          <p className="text-ink-500 text-xs font-semibold tracking-[0.14em] uppercase">
            {product.brandName}
          </p>
        ) : null}

        <h3 className="font-display mt-2 text-base leading-snug">
          <Link
            href={product.href}
            className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-700 after:absolute after:inset-0 after:content-['']"
          >
            {product.title}
          </Link>
        </h3>

        {product.summary ? (
          <p className="text-foreground-muted mt-2 line-clamp-2 text-sm">{product.summary}</p>
        ) : null}

        <div className="mt-auto pt-4">
          {product.price ? (
            <p className="text-foreground text-sm font-semibold">{product.price}</p>
          ) : (
            <p className="text-accent-text text-sm font-medium">
              Request pricing &amp; availability
            </p>
          )}

          {/* The states above are conveyed visually by the badges. Repeating them
              as text gives the same information to a screen reader, which cannot
              see a badge that is `aria-hidden`. */}
          <p className="sr-only">
            {conditionLabel ? `${conditionLabel}. ` : ''}
            {product.available ? 'Available.' : 'Currently reserved.'}
          </p>
        </div>
      </div>
    </article>
  );
}

/** A responsive grid of product cards. */
export function ProductGrid({
  products,
  className,
}: {
  products: ProductCardModel[];
  className?: string;
}) {
  return (
    <ul
      className={cn('grid gap-6 sm:grid-cols-2 lg:grid-cols-4', className)}
      // A list of products is a list; the announcement is left to the section.
    >
      {products.map((product, index) => (
        <li key={product.id} className="flex">
          <ProductCard
            product={product}
            // Only the very first card is prioritised, and only within the
            // first rail that renders it.
            priority={index === 0}
            className="w-full"
          />
        </li>
      ))}
    </ul>
  );
}
