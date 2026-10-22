'use client';

import { Heart, Search, ShoppingBag, User } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

/**
 * Header utility actions: search, account, wishlist, cart.
 *
 * Presentational and stateless: the counts arrive as props. The callers are
 * `HeaderActionsLive` (which reads them from the cart/wishlist surfaces) and the
 * component tests (which pass a fixture). Keeping this component free of data
 * fetching is what lets the accessibility wiring be tested against a real DOM
 * without a database.
 *
 * A badge renders **only when the count is above zero**, so the header never
 * shows an invented number, and the links themselves are real routes, so they
 * are never dead.
 */
export function HeaderActions({
  cartCount = 0,
  wishlistCount = 0,
  signedIn = true,
  className,
}: {
  cartCount?: number;
  wishlistCount?: number;
  /**
   * Whether the visitor is signed in.
   *
   * The account link points at `/account` when they are and `/login` when they
   * are not, so a signed-out visitor is not bounced through a redirect to reach
   * the sign-in form. `signedIn` defaults to `true` so a caller that does not
   * know renders the neutral case rather than an incorrect "Sign in" prompt.
   */
  signedIn?: boolean;
  className?: string;
}) {
  const actions = [
    { href: '/search', label: 'Search', Icon: Search, count: 0 },
    // Account and Wishlist are hidden below `sm` and reachable from the mobile
    // drawer instead. Four 44px targets plus the wordmark and the menu button
    // overflow a 320px viewport, and truncating the business name to make room
    // would be the wrong thing to sacrifice. Search and Cart are the two that
    // earn their place on the smallest screen.
    {
      href: signedIn ? '/account' : '/login',
      label: signedIn ? 'Account' : 'Sign in',
      Icon: User,
      count: 0,
      hideBelowSm: true,
    },
    { href: '/wishlist', label: 'Wishlist', Icon: Heart, count: wishlistCount, hideBelowSm: true },
    { href: '/cart', label: 'Cart', Icon: ShoppingBag, count: cartCount },
  ];

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {actions.map(({ href, label, Icon, count, hideBelowSm }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'text-foreground hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm',
            hideBelowSm && 'hidden sm:inline-flex',
          )}
        >
          <Icon aria-hidden="true" className="h-5 w-5" />
          {/* The label is visually hidden but is the accessible name, so a
              screen reader hears "Cart, 3 items" rather than "button". */}
          <span className="sr-only">
            {label}
            {count > 0 ? `, ${count} item${count === 1 ? '' : 's'}` : ''}
          </span>
          {count > 0 ? (
            <span
              aria-hidden="true"
              className="bg-gold-700 text-surface-0 absolute top-1.5 right-1 min-w-4 rounded-full px-1 text-[0.625rem] leading-4 font-semibold"
            >
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
