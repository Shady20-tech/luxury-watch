'use client';

import { useCallback, useEffect, useState } from 'react';

import { HeaderActions } from '@/components/chrome/header-actions';
import { onCountsChanged } from '@/lib/cart/events';
import { readGuestWishlist } from '@/lib/wishlist/guest';
import { readHeaderCounts } from '@/server/actions/counts-actions';

/**
 * Header actions with live counts.
 *
 * -----------------------------------------------------------------------------
 * WHY THE COUNT IS FETCHED ON THE CLIENT
 * -----------------------------------------------------------------------------
 *
 * The site layout is prerendered with `revalidate = 300` (see
 * `src/app/(site)/layout.tsx`), so a count rendered on the server would be baked
 * into a static page and could be five minutes out of date. Reading the cart in
 * the layout instead would make every public page dynamic and cost a cart query
 * on every request.
 *
 * So the badge is fetched after mount. The page stays static, the badge is right
 * within one request, and a visitor without JavaScript sees no badge at all —
 * which is the honest state, because without JavaScript the interactive cart does
 * not exist either.
 *
 * -----------------------------------------------------------------------------
 * THE WISHLIST COUNT HAS TWO SOURCES
 * -----------------------------------------------------------------------------
 *
 * A signed-in wishlist is in the database and the server reports its size. A
 * guest's wishlist is in `localStorage`, which the server cannot read, so the
 * island counts it itself. The server tells the island which case applies
 * through `signedIn`, rather than the island guessing from a cookie it cannot
 * see.
 *
 * Nothing here is a source of truth: the counts are decoration on two links. A
 * failure to fetch them leaves the badges empty and the links working, which is
 * the correct degradation.
 */
export function HeaderActionsLive({ className }: { className?: string }) {
  const [cartCount, setCartCount] = useState(0);
  const [wishlistCount, setWishlistCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const counts = await readHeaderCounts();
      setCartCount(counts.cartCount);
      setWishlistCount(counts.signedIn ? counts.wishlistCount : readGuestWishlist().length);
    } catch {
      // A failed count leaves the badges as they were. The links still work, and
      // no invented number is shown.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Cart and wishlist mutations run in other components (the product page, the
  // cart page, the drawer) and announce themselves with this event, so the badge
  // updates without those components needing a reference to this one. The
  // `storage` case is covered too, so a second tab editing the same guest
  // wishlist updates this one.
  useEffect(() => onCountsChanged(() => void load()), [load]);

  return (
    <HeaderActions cartCount={cartCount} wishlistCount={wishlistCount} className={className} />
  );
}
