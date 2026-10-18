'use client';

import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { CartContents } from '@/components/cart/cart-contents';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { emptyCartView, type CartView } from '@/lib/cart/types';
import { onCountsChanged } from '@/lib/cart/events';
import { readCartView } from '@/server/actions/cart-view-actions';

/**
 * Cart drawer.
 *
 * -----------------------------------------------------------------------------
 * WHY IT FETCHES ITS OWN CONTENTS
 * -----------------------------------------------------------------------------
 *
 * The drawer is opened from a button in the header on every page. Rendering the
 * cart into every page's HTML so the drawer could be instant would mean pricing
 * the cart on every request — including pages nobody opens it from — and would
 * make those pages dynamic. Instead the contents are fetched when the drawer is
 * opened, from the same server action the cart page uses, so the two show
 * identical numbers from one code path.
 *
 * The fetch is guarded by a loading state and an error state, so a slow or
 * failed load says so rather than showing an empty cart. An empty cart and an
 * unloaded one must not look alike: the first means the customer has nothing
 * saved, and telling them that when it is not true is the failure this avoids.
 *
 * The contents are re-fetched on every open, so a piece removed on the cart page
 * cannot linger here, and a price changed in the meantime is shown at its
 * current value.
 */
export function CartDrawer() {
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState<CartView | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const view = await readCartView();
      setCart(view);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // A mutation elsewhere (the product page, the cart page) refreshes the drawer
  // contents if it is open, so the two cannot disagree while both are on screen.
  useEffect(() => {
    if (!open) return;
    return onCountsChanged(() => void load());
  }, [open, load]);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <ShoppingBag aria-hidden="true" className="h-5 w-5" />
          <span className="sr-only">Cart</span>
        </Button>
      </DrawerTrigger>

      <DrawerContent title="Your cart" description="Pieces you have set aside.">
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {status === 'loading' || status === 'idle' ? (
            <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
              <span className="sr-only">Loading your cart…</span>
              {[0, 1].map((index) => (
                <div key={index} className="flex gap-4">
                  <Skeleton className="h-24 w-20" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : status === 'error' ? (
            <div role="alert" className="flex flex-col items-start gap-3">
              <p className="text-sm">We could not load your cart just now.</p>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          ) : (
            <CartContents cart={cart ?? emptyCartView('database')} className="lg:grid-cols-1" />
          )}
        </div>

        <div className="border-line-200 border-t px-5 py-4">
          {/* `DrawerClose` wrapping the link closes the drawer on navigation, so
              the drawer is not left open behind the cart page. A plain link
              would navigate and leave the sheet open on top of it. */}
          <DrawerClose asChild>
            <Link
              href="/cart"
              className="border-line-300 bg-surface-0 hover:border-ink-900 focus-visible:outline-gold-700 flex h-11 w-full items-center justify-center rounded-sm border px-5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              View full cart
            </Link>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
