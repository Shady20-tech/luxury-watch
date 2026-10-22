'use client';

import {
  Heart,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { logoutAction } from '@/server/actions/auth-actions';
import { cn } from '@/lib/utils';

/**
 * Navigation for the account area.
 *
 * A Client Component only because it needs `usePathname` to mark the current
 * page. It renders no customer data and fetches nothing, so moving it to the
 * client costs nothing in privacy or performance.
 *
 * -----------------------------------------------------------------------------
 * ACCESSIBILITY
 * -----------------------------------------------------------------------------
 *
 * `<nav>` with an accessible name, so a screen-reader user can tell it apart from
 * the site header navigation. The current page carries `aria-current="page"` as
 * well as a visual weight change: colour alone is not a sufficient indicator, and
 * the two must agree.
 *
 * The sign-out control is a real `<form>` posting to the server action, not a
 * link. A link would be followed by a prefetch or a crawler, and signing out is a
 * state change that must not happen on a GET.
 */
const LINKS = [
  { href: '/account', label: 'Overview', Icon: LayoutDashboard, exact: true },
  { href: '/account/orders', label: 'Orders', Icon: Package },
  { href: '/account/wishlist', label: 'Saved pieces', Icon: Heart },
  { href: '/account/profile', label: 'Profile', Icon: UserRound },
  { href: '/account/addresses', label: 'Addresses', Icon: MapPin },
  { href: '/account/security', label: 'Security', Icon: ShieldCheck },
];

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account" className="lg:sticky lg:top-24 lg:self-start">
      <ul className="flex flex-wrap gap-1 lg:flex-col lg:gap-0.5">
        {LINKS.map(({ href, label, Icon, exact }) => {
          const isCurrent = exact ? pathname === href : pathname.startsWith(href);

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  'focus-visible:outline-gold-700 flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2',
                  isCurrent
                    ? 'bg-surface-100 text-foreground font-semibold'
                    : 'text-foreground-muted hover:bg-surface-100 hover:text-foreground',
                )}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}

        <li className="lg:mt-2 lg:border-line-300 lg:border-t lg:pt-2">
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-foreground-muted hover:bg-surface-100 hover:text-foreground focus-visible:outline-gold-700 flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
              Sign out
            </button>
          </form>
        </li>
      </ul>
    </nav>
  );
}
