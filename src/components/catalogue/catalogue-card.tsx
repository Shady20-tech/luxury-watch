import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { MediaFrame } from '@/components/ui/media-frame';
import type { CatalogueProduct } from '@/lib/catalogue/types';
import { CONDITION_LABELS } from '@/lib/catalogue/params';
import { cn } from '@/lib/utils';

/**
 * Catalogue product card.
 *
 * Every value is rendered from the database row. Two states are load-bearing,
 * and both are about not misleading a buyer:
 *
 *  - **Price.** `price` is `null` for a price-on-request piece, which is the
 *    norm for this catalogue. The card then shows "Request pricing &
 *    availability" rather than a number. Printing a made-up figure would be the
 *    single most damaging thing a storefront could do.
 *  - **Availability.** `available: false` renders a "Reserved" badge. It does
 *    not hide the card and it does not claim the piece is sold — a reserved
 *    watch is genuinely spoken for, and the badge says exactly that.
 *
 * The card carries no wishlist or add-to-cart control. Both belong to phases
 * that have a real store to write to, and a button that looks live but discards
 * the click is worse than no button. The whole card is a single link to the
 * product, which also keeps it usable by keyboard: one tab stop per card.
 */

/**
 * The condition label for a value, read from the shared table so the card and
 * the filter sidebar cannot disagree.
 */
function conditionLabel(condition: CatalogueProduct['condition']): string | null {
  return condition ? CONDITION_LABELS[condition] : null;
}

/** A compact spec line for the card: the attributes a buyer compares. */
function specLine(product: CatalogueProduct): string | null {
  const parts = [
    product.reference ? `Ref. ${product.reference}` : null,
    product.year ? String(product.year) : null,
    product.caseSize,
    product.movement,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(' · ') : null;
}

export function CatalogueCard({
  product,
  priority = false,
  className,
}: {
  product: CatalogueProduct;
  /** Set on the first cards of the first page so they are not lazy-loaded. */
  priority?: boolean;
  className?: string;
}) {
  const condition = conditionLabel(product.condition);
  const specs = specLine(product);
  const boxAndPapers =
    product.boxAndPapers === null
      ? null
      : product.boxAndPapers
        ? 'Box & papers'
        : 'No box & papers';

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
          sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
        {/* Badges sit over the media but are not interactive, so they are marked
            presentational and the same facts are repeated as text below. */}
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
            className="focus-visible:outline-gold-700 after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {product.title}
          </Link>
        </h3>

        {specs ? <p className="text-foreground-muted mt-2 text-sm">{specs}</p> : null}

        {/* Condition, box and papers are the two facts a buyer weighs most, so
            they get their own line rather than being buried in the spec run. */}
        {condition || boxAndPapers ? (
          <p className="text-foreground-muted mt-2 text-xs">
            {[condition, boxAndPapers].filter(Boolean).join(' · ')}
          </p>
        ) : null}

        <div className="mt-auto pt-4">
          {product.price ? (
            <p className="text-foreground text-sm font-semibold">{product.price}</p>
          ) : (
            <p className="text-accent-text text-sm font-medium">
              Request pricing &amp; availability
            </p>
          )}

          {/* The badges above convey availability visually. Repeating the state
              as text gives the same information to a screen reader, which
              cannot see an `aria-hidden` badge. */}
          <p className="sr-only">
            {condition ? `${condition}. ` : ''}
            {product.available ? 'Available.' : 'Currently reserved.'}
          </p>
        </div>
      </div>
    </article>
  );
}

/**
 * A responsive grid of catalogue cards.
 *
 * `columns` lets a caller choose the density: the shop grid is four across on a
 * wide screen, while a narrower sidebar layout is three.
 */
export function CatalogueGrid({
  products,
  className,
}: {
  products: CatalogueProduct[];
  className?: string;
}) {
  return (
    <ul className={cn('grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', className)}>
      {products.map((product, index) => (
        <li key={product.id} className="flex">
          <CatalogueCard
            product={product}
            // Only the first row is prioritised; everything below the fold is
            // lazy-loaded by default.
            priority={index < 4}
            className="w-full"
          />
        </li>
      ))}
    </ul>
  );
}
