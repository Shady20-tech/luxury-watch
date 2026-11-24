import Link from 'next/link';

import { AddToCartButton } from '@/components/cart/add-to-cart-button';
import { WishlistToggle } from '@/components/product/wishlist-toggle';
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
 * -----------------------------------------------------------------------------
 * THE CONTROLS, AND WHY THE CARD IS NO LONGER ONE BIG LINK
 * -----------------------------------------------------------------------------
 *
 * The card used to be a single link with an `after:inset-0` overlay, on the
 * argument that a wishlist or cart control belonged to a later phase. Both
 * phases are live now, so the card carries them: a save toggle and, when the
 * piece is available, an add-to-cart.
 *
 * That forces the overlay away. A `<button>` inside a link's overlay is an
 * interactive element nested in an interactive element, which is invalid markup
 * and unusable by keyboard — the button cannot be reached without activating the
 * link. So the link wraps only the title, and the media gets its own link with
 * the image's alt text as its accessible name. The result is still one obvious
 * click target for the piece, plus real buttons that are separate tab stops.
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
  signedIn = false,
  saved = false,
  className,
}: {
  product: CatalogueProduct;
  /** Set on the first cards of the first page so they are not lazy-loaded. */
  priority?: boolean;
  /**
   * Whether the visitor is signed in, for the wishlist control.
   *
   * A guest is not shown a dead button: the guest toggle keeps the list in
   * `localStorage` and offers to move it into an account on sign-in. The default
   * `false` is the honest assumption when a caller does not know.
   */
  signedIn?: boolean;
  /** Whether this piece is already in the visitor's list. */
  saved?: boolean;
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
        {/* The media is its own link rather than a stretched overlay, so the
            controls below are not nested inside it. It is a duplicate of the
            title link for pointer users, so it is hidden from the accessibility
            tree and removed from the tab order — a keyboard or screen-reader
            user meets each piece once, at the title, instead of twice. */}
        <Link
          href={product.href}
          aria-hidden="true"
          tabIndex={-1}
          className="focus-visible:outline-gold-700 block focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <MediaFrame
            src={product.imageUrl}
            alt={product.imageAlt}
            ratio="4/5"
            priority={priority}
            dialColor={product.dialColor}
            caseMaterial={product.caseMaterial}
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
          />
        </Link>
        {/* Badges sit over the media but are not interactive, so they are marked
            presentational and the same facts are repeated as text below. */}
        <div aria-hidden="true" className="absolute top-3 left-3 flex flex-wrap gap-2">
          {!product.available ? <Badge variant="soldOut">Reserved</Badge> : null}
          {product.isNew && product.available ? <Badge variant="accent">New</Badge> : null}
          {!product.price && product.available ? (
            <Badge variant="neutral">Price on request</Badge>
          ) : null}
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
            className="focus-visible:outline-gold-700 focus-visible:outline-2 focus-visible:outline-offset-4"
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

          {/* A reserved piece offers no add-to-cart: the action would reject it,
              and a button that always fails is worse than no button. It can
              still be saved to the wishlist, which is how a visitor keeps track
              of a piece that may return. */}
          <div className="mt-4 flex items-center gap-2">
            {product.available ? (
              <AddToCartButton
                productId={product.id}
                productTitle={product.title}
                compact
                className="min-w-0 flex-1"
              />
            ) : null}
            <WishlistToggle
              productId={product.id}
              signedIn={signedIn}
              initiallySaved={saved}
              compact
            />
          </div>
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
  signedIn = false,
  savedProductIds = [],
  className,
  headingId,
  label = 'Watches',
}: {
  products: CatalogueProduct[];
  /** Whether the visitor is signed in, so a card's save toggle knows its store. */
  signedIn?: boolean;
  /** The ids the visitor has already saved, so a card's toggle starts correct. */
  savedProductIds?: string[];
  className?: string;
  /**
   * The id of the grid's own `h2`. Pass `null` when the caller already renders a
   * heading directly above the grid — the product page's "Related timepieces"
   * does — so a second heading is not stacked on top of it.
   */
  headingId?: string | null;
  label?: string;
}) {
  const resolvedHeadingId = headingId === undefined ? 'catalogue-grid-heading' : headingId;

  return (
    <section aria-labelledby={resolvedHeadingId ?? undefined}>
      {/*
        The grid needs its own `h2`. Without it every card's `h3` follows the
        page `h1` directly on a narrow screen, because the sidebar's "Filter"
        `h2` is `hidden` below `lg` and a `display:none` heading is absent from
        the accessibility tree. The browser audit flagged the jump as
        `heading-order` on mobile only, which is exactly that mechanism: the
        same markup passed on a wide screen where the sidebar is visible.
      */}
      {resolvedHeadingId ? (
        <h2 id={resolvedHeadingId} className="sr-only">
          {label}
        </h2>
      ) : null}
      <ul className={cn('grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', className)}>
        {products.map((product, index) => (
          <li key={product.id} className="flex">
            <CatalogueCard
              product={product}
              // Only the first row is prioritised; everything below the fold is
              // lazy-loaded by default.
              priority={index < 4}
              signedIn={signedIn}
              saved={savedProductIds.includes(product.id)}
              className="w-full"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
