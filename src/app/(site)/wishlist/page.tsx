import { Heart } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CatalogueCard } from '@/components/catalogue/catalogue-card';
import { MoveToCartButton } from '@/components/wishlist/move-to-cart-button';
import { WishlistRemoveButton } from '@/components/wishlist/wishlist-remove-button';
import { GuestWishlist } from '@/components/wishlist/guest-wishlist';
import { WishlistMerge } from '@/components/wishlist/wishlist-merge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { getViewerState } from '@/server/services/viewer-service';
import { getWishlist } from '@/server/services/wishlist-service';

/**
 * Wishlist page.
 *
 * -----------------------------------------------------------------------------
 * TWO RENDERERS, ONE PAGE
 * -----------------------------------------------------------------------------
 *
 * A signed-in visitor's list is in the database, so it is rendered on the server
 * and is the source of truth — nothing about it is read from the browser. A
 * guest's list is in `localStorage`, which the server cannot read, so it is
 * rendered by `GuestWishlist`, a Client Component.
 *
 * The two are never mixed. A signed-in visitor does not see the browser list,
 * because after sign-in the database is the truth; the browser copy is merged
 * once by `WishlistMerge` and then cleared. This is the brief's rule made
 * concrete: "Treat the database as the source of truth after sign-in."
 *
 * -----------------------------------------------------------------------------
 * WHY THIS ROUTE IS DYNAMIC
 * -----------------------------------------------------------------------------
 *
 * `getViewerState()` reads the session through a cookie-aware client, so the
 * route is dynamic whether or not it says so. Stating it explicitly avoids the
 * production-only 500 described on the product page: a cookie-reading route that
 * Next.js classifies as static fails at request time with "Page changed from
 * static to dynamic at runtime".
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Your Wishlist');

export default async function Page() {
  const viewer = await getViewerState();

  return (
    <main id="main-content" className="container-page py-10 lg:py-14">
      <header className="mb-8">
        <p className="eyebrow">Account</p>
        <h1 className="mt-3 text-3xl sm:text-4xl">Your wishlist</h1>
        <p className="text-foreground-muted mt-3 max-w-prose text-base">
          {viewer.signedIn
            ? 'Pieces you have saved to your account. Availability is confirmed from the catalogue each time you view this page.'
            : 'Pieces you have saved on this device. Sign in to keep them in your account.'}
        </p>
      </header>

      {viewer.signedIn && viewer.userId ? (
        <SignedInWishlist userId={viewer.userId} />
      ) : (
        <GuestWishlist />
      )}
    </main>
  );
}

/** The database-backed wishlist for a signed-in visitor. */
async function SignedInWishlist({ userId }: { userId: string }) {
  const wishlist = await getWishlist(userId);

  // Moves a guest list into the account, once. Renders nothing.
  return (
    <>
      <WishlistMerge />

      {wishlist.source === 'unavailable' ? (
        <ErrorState
          title="We could not load your wishlist"
          description="Your saved pieces have not been lost. The store is briefly unavailable — please try again in a moment."
        />
      ) : wishlist.isEmpty ? (
        <EmptyState
          icon={Heart}
          title="Your wishlist is empty"
          description="Save pieces as you browse and they will be kept in your account."
          action={
            <Button asChild>
              <Link href="/shop">Browse the collection</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-10">
          <section aria-labelledby="saved-heading">
            <h2 id="saved-heading" className="sr-only">
              Saved pieces
            </h2>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {wishlist.products.map((product, index) => (
                <li key={product.id} className="flex flex-col gap-3">
                  <CatalogueCard product={product} priority={index < 4} className="w-full" />
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Move-to-cart is offered only for a piece that can actually
                        be requested. A card for a reserved watch still shows —
                        the customer saved it and it may come back — but offering
                        to move it would promise a cart entry that cannot proceed
                        to an order request. */}
                    {product.available ? (
                      <MoveToCartButton
                        productId={product.id}
                        productTitle={product.title}
                        signedIn
                      />
                    ) : (
                      <p className="text-foreground-muted text-xs">
                        Currently reserved, so it cannot be moved to a cart yet.
                      </p>
                    )}
                    <WishlistRemoveButton productId={product.id} productTitle={product.title} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {wishlist.unavailable.length > 0 ? (
            <section
              aria-labelledby="unavailable-heading"
              className="border-line-200 rounded-md border p-5"
            >
              <h2 id="unavailable-heading" className="text-base font-semibold">
                No longer available
              </h2>
              <p className="text-foreground-muted mt-1 text-sm">
                These saved pieces are no longer listed, so they cannot be shown. You can remove
                them from your list.
              </p>
              <ul className="mt-4 flex flex-col gap-2">
                {wishlist.unavailable.map((item) => (
                  <li key={item.productId} className="flex items-center justify-between gap-4">
                    <span className="text-foreground-muted text-sm">
                      A saved piece that is no longer listed
                    </span>
                    <WishlistRemoveButton productId={item.productId} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
