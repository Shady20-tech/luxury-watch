'use client';

import { Heart } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { CatalogueCard } from '@/components/catalogue/catalogue-card';
import { MoveToCartButton } from '@/components/wishlist/move-to-cart-button';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { announceCountsChanged } from '@/lib/cart/events';
import type { CatalogueProduct } from '@/lib/catalogue/types';
import {
  GUEST_WISHLIST_KEY,
  MAX_GUEST_WISHLIST_ITEMS,
  clearGuestWishlist,
  readGuestWishlist,
  removeFromGuestWishlist,
} from '@/lib/wishlist/guest';
import { readWishlistProductsByIds } from '@/server/actions/wishlist-view-actions';

/**
 * The guest wishlist page.
 *
 * A Client Component because the list lives in `localStorage`, which the server
 * cannot read. It renders three states honestly:
 *
 *   1. **Loading** — skeletons, and an `aria-busy` region so a screen reader
 *      hears "loading" rather than a list of empty boxes.
 *   2. **Empty** — a real, confirmed empty list, with a route back to the shop.
 *   3. **Has saved pieces** — a grid of products fetched from the database by id,
 *      plus a clearly separated note for any saved id that is no longer
 *      displayable.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS FETCHED, AND WHY NOTHING IS STORED
 * -----------------------------------------------------------------------------
 *
 * Only the ids are in the browser. The products themselves — title, price, image,
 * availability — are fetched from the database on every load. A price cached in
 * `localStorage` would be a price from whenever the visitor last looked, and
 * showing it would be showing a figure the business may not honour. So the list
 * is always rendered from the current rows, and a saved piece that is no longer
 * published is reported as unavailable rather than silently dropped.
 */
export function GuestWishlist() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [unavailableIds, setUnavailableIds] = useState<string[]>([]);
  const [hasAny, setHasAny] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    const ids = readGuestWishlist();
    setHasAny(ids.length > 0);

    if (ids.length === 0) {
      setProducts([]);
      setUnavailableIds([]);
      setStatus('ready');
      return;
    }

    try {
      const result = await readWishlistProductsByIds(ids);
      setProducts(result.products);
      setUnavailableIds(result.unavailableIds);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Another tab editing the same list should update this one.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === GUEST_WISHLIST_KEY || event.key === null) void load();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [load]);

  const remove = (productId: string) => {
    removeFromGuestWishlist(productId, readGuestWishlist());
    announceCountsChanged();
    // Re-resolve rather than filtering locally: the removal is local, but the
    // remaining products should still be current.
    void load();
  };

  if (status === 'loading') {
    return (
      <div aria-busy="true" aria-live="polite" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <span className="sr-only">Loading your saved pieces…</span>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="space-y-3">
            <Skeleton className="aspect-4/5 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="We could not load your saved pieces"
        description="Your list is still saved on this device. The catalogue could not be reached just now — please try again."
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!hasAny && products.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="You have not saved anything yet"
        description="Save pieces as you browse and they will appear here. Your list is kept on this device and moves into your account when you sign in."
        action={
          <Button asChild>
            <Link href="/shop">Browse the collection</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {products.length > 0 ? (
        <section aria-labelledby="saved-heading">
          <h2 id="saved-heading" className="sr-only">
            Saved pieces
          </h2>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product, index) => (
              <li key={product.id} className="flex flex-col gap-3">
                <CatalogueCard product={product} priority={index < 4} className="w-full" />
                <div className="flex flex-wrap items-center gap-2">
                  {product.available ? (
                    <MoveToCartButton
                      productId={product.id}
                      productTitle={product.title}
                      signedIn={false}
                    />
                  ) : (
                    <p className="text-foreground-muted text-xs">
                      Currently reserved, so it cannot be moved to a cart yet.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => remove(product.id)}
                  >
                    <Heart aria-hidden="true" className="mr-2 h-4 w-4 fill-current" />
                    Remove
                    <span className="sr-only"> {product.title} from your wishlist</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {unavailableIds.length > 0 ? (
        <section
          aria-labelledby="unavailable-heading"
          className="border-line-200 rounded-md border p-5"
        >
          <h2 id="unavailable-heading" className="text-base font-semibold">
            No longer available
          </h2>
          <p className="text-foreground-muted mt-1 text-sm">
            These pieces are no longer listed, so they cannot be shown. You can remove them from
            your list.
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {unavailableIds.map((id) => (
              <li key={id} className="flex items-center justify-between gap-4">
                <span className="text-foreground-muted text-sm">A saved piece</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => remove(id)}>
                  Remove
                  <span className="sr-only"> this piece from your wishlist</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="border-line-200 border-t pt-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (window.confirm('Remove every piece from your saved list on this device?')) {
              clearGuestWishlist();
              announceCountsChanged();
              void load();
            }
          }}
        >
          Clear saved list
          <span className="sr-only"> ({MAX_GUEST_WISHLIST_ITEMS} items maximum)</span>
        </Button>
      </div>
    </div>
  );
}
