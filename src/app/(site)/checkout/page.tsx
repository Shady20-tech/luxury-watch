import type { Metadata } from 'next';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';

import { CheckoutForm } from '@/components/checkout/checkout-form';
import { OrderSummary } from '@/components/checkout/order-summary';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { ORDER_COPY } from '@/lib/orders/copy';
import { getCheckout } from '@/server/services/checkout-service';

/**
 * The order-request page.
 *
 * -----------------------------------------------------------------------------
 * WHAT THIS PAGE IS
 * -----------------------------------------------------------------------------
 *
 * It is not a checkout in the payment sense. There is no card field, no gateway
 * and no charge. It collects who the customer is, how they want to receive the
 * piece and how they intend to settle, then sends an order *request* that an
 * administrator reviews. The copy repeats that on the page, because a page that
 * looks like every other checkout must say plainly that nothing is being paid.
 *
 * -----------------------------------------------------------------------------
 * EXPLICITLY DYNAMIC
 * -----------------------------------------------------------------------------
 *
 * The cart, the configuration and the viewer state all read cookies, so the
 * route is dynamic whether or not it says so — and a cookie-reading route that
 * Next.js classifies as static fails at request time in a production build with
 * "Page changed from static to dynamic at runtime", returning a 500. The product
 * page was bitten by exactly this in Phase 6, so the export is stated rather
 * than left to inference.
 *
 * `noindex` because a checkout is per visitor.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata(ORDER_COPY.pageTitle);

export default async function Page() {
  const checkout = await getCheckout();
  const { cart, options } = checkout;

  // A cart that could not be read is not an empty cart, and a checkout built on
  // one would invite a request for nothing. The two are answered differently,
  // exactly as on the cart page.
  if (cart.source === 'unavailable') {
    return (
      <main id="main-content" className="container-page py-10 lg:py-14">
        <ErrorState
          title="We could not load your order"
          description="Your cart has not been lost. The store is briefly unavailable — please try again in a moment."
          action={
            <Button asChild variant="secondary">
              <Link href="/checkout">Try again</Link>
            </Button>
          }
        />
      </main>
    );
  }

  if (cart.isEmpty) {
    return (
      <main id="main-content" className="container-page py-10 lg:py-14">
        <EmptyState
          icon={ShoppingBag}
          title="There is nothing to request yet"
          description="Your cart is empty. Browse the collection and set aside the pieces you would like us to hold for you."
          action={
            <Button asChild>
              <Link href="/shop">Browse the collection</Link>
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <main id="main-content" className="container-page py-10 lg:py-14">
      <header className="mb-8 max-w-prose">
        <p className="eyebrow">Shop</p>
        <h1 className="mt-3 text-3xl sm:text-4xl">{ORDER_COPY.pageTitle}</h1>
        <p className="text-foreground-muted mt-3 text-base">{ORDER_COPY.intro}</p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <CheckoutForm checkout={checkout} />
        <OrderSummary
          cart={cart}
          options={options}
          currency={checkout.currency}
          confirmationNote={checkout.confirmationNote}
          signedIn={checkout.signedIn}
        />
      </div>
    </main>
  );
}
