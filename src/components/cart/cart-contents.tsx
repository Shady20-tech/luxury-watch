import { AlertTriangle, ShoppingBag } from 'lucide-react';
import Link from 'next/link';

import { CartLineControls } from '@/components/cart/cart-line-controls';
import { DiscountCodeForm } from '@/components/cart/discount-code-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MediaFrame } from '@/components/ui/media-frame';
import { EmptyState, ErrorState } from '@/components/ui/states';
import type { CartLine, CartView } from '@/lib/cart/types';
import { cn } from '@/lib/utils';

/**
 * The cart's contents: lines, summary and the two states that are not "has
 * items".
 *
 * Shared by the cart page and the cart drawer, so the two cannot disagree about
 * a price, a quantity or a warning. It is a Server Component; only the controls
 * inside a line and the discount form are Client Components, because those are
 * the only parts that need to be interactive.
 *
 * -----------------------------------------------------------------------------
 * THE THREE STATES
 * -----------------------------------------------------------------------------
 *
 *  1. **Empty** — a real, confirmed empty cart. "Your cart is empty", with a way
 *     back to the shop.
 *  2. **Unavailable** — the database could not be read. This is *not* shown as an
 *     empty cart, because a customer who saw "empty" would believe their items
 *     had been lost. It says the cart could not be loaded and offers a retry.
 *  3. **Has lines** — the cart, with any problem stated per line.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS SAID, AND WHAT IS NOT
 * -----------------------------------------------------------------------------
 *
 * The copy never says a piece is "reserved", "held" or "secured" by being in the
 * cart. It is not: stock is held when an order request is submitted, which is
 * the next step from here. The summary says the pieces are "set aside in your
 * cart" and that an order request comes next, which is what is actually true.
 */
export function CartContents({ cart, className }: { cart: CartView; className?: string }) {
  if (cart.source === 'unavailable') {
    return (
      <ErrorState
        className={className}
        title="We could not load your cart"
        description="Your cart has not been lost. The store is briefly unavailable — please try again in a moment."
        action={
          <Button asChild variant="secondary">
            <Link href="/cart">Try again</Link>
          </Button>
        }
      />
    );
  }

  if (cart.isEmpty) {
    return (
      <EmptyState
        className={className}
        icon={ShoppingBag}
        title="Your cart is empty"
        description="Browse the collection and set aside the pieces you would like us to hold for you."
        action={
          <Button asChild>
            <Link href="/shop">Browse the collection</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className={cn('grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start', className)}>
      <ul className="divide-line-200 border-line-200 divide-y border-y">
        {cart.lines.map((line) => (
          <li key={line.productId}>
            <CartLineRow line={line} />
          </li>
        ))}
      </ul>

      <CartSummary cart={cart} />
    </div>
  );
}

/** One line: media, description, controls and any availability warning. */
function CartLineRow({ line }: { line: CartLine }) {
  return (
    <article className="flex gap-4 py-5">
      <div className="w-20 shrink-0 sm:w-24">
        <MediaFrame
          src={line.imageUrl}
          alt={line.imageAlt}
          ratio="4/5"
          sizes="96px"
          dialColor={line.dialColor}
          caseMaterial={line.caseMaterial}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          {line.brandName ? (
            <p className="text-ink-500 text-xs font-semibold tracking-[0.14em] uppercase">
              {line.brandName}
            </p>
          ) : null}
          <h3 className="font-display mt-1 text-base leading-snug">
            <Link
              href={line.href}
              className="focus-visible:outline-gold-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              {line.title}
            </Link>
          </h3>
          {line.sku ? <p className="text-ink-500 mt-1 text-xs">Ref. {line.sku}</p> : null}
        </div>

        {!line.purchasable ? <LineWarning line={line} /> : null}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <CartLineControls line={line} />
          <div className="text-right">
            {line.unitPrice ? (
              <p className="text-foreground text-sm font-semibold">{line.lineTotal}</p>
            ) : (
              <p className="text-accent-text text-sm font-medium">
                Request pricing &amp; availability
              </p>
            )}
            {line.unitPrice && line.quantity > 1 ? (
              <p className="text-ink-500 mt-0.5 text-xs">{line.unitPrice} each</p>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * Why a line cannot be bought as it stands.
 *
 * Two distinct facts, stated differently because they call for different
 * responses. A product that is no longer published has been withdrawn from the
 * shop and the customer should remove it; a product that is out of stock is real
 * and may come back, so the customer is told to contact us rather than being
 * silently blocked. Neither is dropped from the cart.
 */
function LineWarning({ line }: { line: CartLine }) {
  if (line.status === 'unpublished') {
    return (
      <p className="border-line-300 bg-surface-100 text-foreground-muted flex items-start gap-2 rounded-sm border px-3 py-2 text-xs">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          This piece is no longer listed. It has been left in your cart so you can remove it
          yourself.
        </span>
      </p>
    );
  }

  return (
    <p className="border-line-300 bg-surface-100 text-foreground-muted flex items-start gap-2 rounded-sm border px-3 py-2 text-xs">
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        This piece is currently reserved by someone else. It is not held for you, and it will not be
        included in an order request until it is available again.
      </span>
    </p>
  );
}

/**
 * The summary: subtotal, discount, total, and what happens next.
 *
 * `aria-live="polite"` on the totals block, because the discount form can change
 * the figures without a full page load, and a screen reader user should hear the
 * new total rather than having to hunt for it.
 */
function CartSummary({ cart }: { cart: CartView }) {
  const hasUnavailable = cart.hasUnavailable;

  return (
    <aside
      aria-labelledby="cart-summary-heading"
      className="border-line-200 bg-surface-50 sticky top-24 rounded-md border p-5"
    >
      <h2 id="cart-summary-heading" className="text-lg">
        Summary
      </h2>

      <dl aria-live="polite" className="mt-4 flex flex-col gap-2 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-foreground-muted">
            Subtotal
            <span className="sr-only">
              {' '}
              — {cart.itemCount} item{cart.itemCount === 1 ? '' : 's'}
            </span>
          </dt>
          <dd className="font-medium">{cart.subtotal}</dd>
        </div>

        {cart.discountCents > 0 ? (
          <div className="text-success-600 flex items-baseline justify-between gap-4">
            <dt>Discount{cart.discountCode ? ` (${cart.discountCode.code})` : ''}</dt>
            <dd className="font-medium">−{cart.discount}</dd>
          </div>
        ) : null}

        {cart.freeDelivery ? (
          <div className="text-success-600 flex items-baseline justify-between gap-4">
            <dt>Delivery</dt>
            <dd className="font-medium">Free</dd>
          </div>
        ) : null}

        <div className="border-line-200 mt-2 flex items-baseline justify-between gap-4 border-t pt-3">
          <dt className="font-semibold">Total</dt>
          <dd className="text-lg font-semibold">{cart.total}</dd>
        </div>
      </dl>

      {cart.hasPriceOnRequest ? (
        <p className="text-foreground-muted mt-3 text-xs">
          One or more pieces are priced on request. Their price is not included in the total shown
          and will be confirmed with you.
        </p>
      ) : null}

      {hasUnavailable ? (
        <p className="text-foreground-muted mt-3 flex items-start gap-2 text-xs">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Unavailable pieces are not included in the total. Remove them, or contact us to ask
            about them.
          </span>
        </p>
      ) : null}

      <div className="mt-5">
        <DiscountCodeForm applied={cart.discountCode} />
      </div>

      <div className="border-line-200 mt-5 border-t pt-5">
        {/* The order request is the next step. It is offered only when at least
            one line can actually be requested; the button is not a promise that
            the request will be accepted, and the copy says so. */}
        {cart.hasUnavailable || cart.itemCount === 0 ? (
          <>
            <Button block disabled aria-disabled="true">
              Continue to order request
            </Button>
            <p className="text-foreground-muted mt-3 text-xs">
              Resolve the unavailable pieces above before continuing. Nothing is charged on this
              site at any point; sending an order request holds the available pieces for you, and we
              release them again if the request is declined.
            </p>
          </>
        ) : (
          <Button asChild block>
            <Link href="/checkout">Continue to order request</Link>
          </Button>
        )}
        <p className="text-foreground-muted mt-3 text-xs">
          The next step is not a payment. Nothing is charged now — you will review your details and
          send us an order request; an administrator will confirm availability and arrange payment
          separately.
        </p>
        <Button asChild variant="ghost" block className="mt-2">
          <Link href="/shop">Continue shopping</Link>
        </Button>
      </div>
    </aside>
  );
}

/** A small badge describing a line's state, for compact surfaces. */
export function CartLineBadge({ line }: { line: CartLine }) {
  if (line.status === 'unpublished') return <Badge variant="neutral">No longer listed</Badge>;
  if (!line.isAvailable) return <Badge variant="soldOut">Reserved</Badge>;
  return <Badge variant="success">Available</Badge>;
}
