'use client';

import {
  Bell,
  CalendarClock,
  Heart,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquare,
  Package,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  Wrench,
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
/**
 * Grouped so thirteen destinations read as four short lists rather than one
 * long one. Each group is a labelled list inside the same `<nav>`, which keeps a
 * single landmark while giving a screen-reader user the same structure a sighted
 * user sees.
 */
const GROUPS: { label: string; links: NavLink[] }[] = [
  {
    label: 'Shopping',
    links: [
      { href: '/account', label: 'Overview', Icon: LayoutDashboard, exact: true },
      { href: '/account/notifications', label: 'Notifications', Icon: Bell },
      { href: '/account/orders', label: 'Orders', Icon: Package },
      { href: '/account/wishlist', label: 'Saved pieces', Icon: Heart },
    ],
  },
  {
    label: 'Requests',
    links: [
      { href: '/account/sell-trade', label: 'Sell or trade', Icon: Package },
      { href: '/account/sourcing', label: 'Sourcing', Icon: Search },
      { href: '/account/repairs', label: 'Repairs', Icon: Wrench },
      { href: '/account/appointments', label: 'Appointments', Icon: CalendarClock },
      { href: '/account/messages', label: 'Messages', Icon: MessageSquare },
    ],
  },
  {
    label: 'Details',
    links: [
      { href: '/account/profile', label: 'Profile', Icon: UserRound },
      { href: '/account/addresses', label: 'Addresses', Icon: MapPin },
      { href: '/account/security', label: 'Security', Icon: ShieldCheck },
      { href: '/account/settings', label: 'Settings', Icon: Settings },
    ],
  },
];

type NavLink = {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  exact?: boolean;
};

export function AccountNav({ unreadNotifications = 0 }: { unreadNotifications?: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Account" className="lg:sticky lg:top-24 lg:self-start">
      {GROUPS.map((group, index) => (
        <div key={group.label} className={index > 0 ? 'mt-4' : undefined}>
          <p className="text-foreground-muted px-3 pb-1 text-xs font-semibold tracking-wide uppercase">
            {group.label}
          </p>
          <ul className="flex flex-wrap gap-1 lg:flex-col lg:gap-0.5">
            {group.links.map(({ href, label, Icon, exact }) => {
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
                    {href === '/account/notifications' && unreadNotifications > 0 ? (
                      <>
                        {/* The count is announced as text rather than added to an
                            `aria-label`: an `aria-label` replaces the visible name,
                            and the link's visible text would then be missing from
                            the accessible name — a WCAG 2.5.3 failure the browser
                            audit catches and jsdom does not. */}
                        <span className="sr-only">, {unreadNotifications} unread</span>
                        <span
                          aria-hidden="true"
                          className="bg-gold-700 text-ink-900 ml-auto rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums"
                        >
                          {unreadNotifications > 99 ? '99+' : unreadNotifications}
                        </span>
                      </>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="border-line-300 mt-4 border-t pt-2">
        <form action={logoutAction}>
          <button
            type="submit"
            className="text-foreground-muted hover:bg-surface-100 hover:text-foreground focus-visible:outline-gold-700 flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
