import type { Metadata } from 'next';

import { CartContents } from '@/components/cart/cart-contents';
import { PageHero } from '@/components/layout/page-hero';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { getCart } from '@/server/services/cart-service';

/**
 * Cart page.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS ROUTE IS EXPLICITLY DYNAMIC
 * -----------------------------------------------------------------------------
 *
 * The cart is per visitor and must reflect the current price and stock of every
 * line on every request. `getCart()` reads through `createSupabaseServerClient`,
 * which is cookie-aware, so the route is dynamic whether or not it says so — and
 * a cookie-reading route that Next.js classifies as static fails at request time
 * in a production build with "Page changed from static to dynamic at runtime",
 * returning a 500. The product page was bitten by exactly this in Phase 6, so the
 * export is stated rather than left to inference.
 *
 * -----------------------------------------------------------------------------
 * THE NUMBERS ARE DISPLAY DATA
 * -----------------------------------------------------------------------------
 *
 * Every figure on this page comes from `cart_pricing` and is re-derived on each
 * read. Nothing here is submitted anywhere, and nothing here is trusted: the
 * order path recomputes from the product rows. The page is a view of the
 * database's answer, not a source of truth.
 *
 * `noindex` because a cart is per visitor and has no business in a search index,
 * the same reason `/account` is excluded.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Your Cart');

export default async function Page() {
  const cart = await getCart();

  return (
    <main id="main-content">
      <PageHero
        eyebrow="Shop"
        title="Your cart"
        intro="Pieces you have set aside. Prices and availability are confirmed from the catalogue every time this page loads."
      />

      <div className="container-page py-10 lg:py-14">
        <CartContents cart={cart} />
      </div>
    </main>
  );
}
