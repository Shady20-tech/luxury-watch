'use client';

import {
  Boxes,
  CalendarClock,
  LayoutDashboard,
  MessageSquare,
  Package,
  ScrollText,
  Settings,
  Tag,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

/**
 * The admin navigation.
 *
 * -----------------------------------------------------------------------------
 * WHY ITEMS ARE FILTERED BY PERMISSION
 * -----------------------------------------------------------------------------
 *
 * A link to a page the person cannot open is worse than no link: it reads as an
 * offer, and following it produces a refusal. The filter happens on the server,
 * using the same permission set the pages check, so the navigation and the guard
 * cannot disagree.
 *
 * The filter is presentation only. It is not a security control — every page and
 * every action checks for itself. Removing an item from this list would not open
 * a route, and adding one would not close it.
 *
 * A Client Component because it needs `usePathname` to mark the current page. It
 * receives the already-filtered groups as a prop; it fetches nothing.
 */

export type AdminNavItem = {
  href: string;
  label: string;
  /** Shown beside the label when the count is non-zero and known. */
  badge?: number;
};

export type AdminNavGroup = {
  heading: string;
  items: AdminNavItem[];
};

const ICONS: Record<string, typeof LayoutDashboard> = {
  '/admin': LayoutDashboard,
  '/admin/orders': Package,
  '/admin/products': Tag,
  '/admin/inventory': Boxes,
  '/admin/inquiries': MessageSquare,
  '/admin/appointments': CalendarClock,
  '/admin/customers': Users,
  '/admin/settings': Settings,
  '/admin/audit': ScrollText,
};

export function AdminNav({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Administration" className="text-sm">
      {groups.map((group) => (
        <div key={group.heading} className="mb-6">
          <h2 className="text-ink-500 mb-2 text-xs font-semibold tracking-wide uppercase">
            {group.heading}
          </h2>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              // `/admin` would otherwise match every route as a prefix.
              const active =
                item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
              const Icon = ICONS[item.href];

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'focus-visible:outline-gold-700 flex items-center gap-2.5 rounded-sm px-2.5 py-2 focus-visible:outline-2 focus-visible:-outline-offset-2',
                      active
                        ? 'bg-surface-100 text-ink-900 font-medium'
                        : 'text-ink-700 hover:bg-surface-50',
                    )}
                  >
                    {Icon ? <Icon aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="bg-ink-900 text-surface-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                        {item.badge}
                        <span className="sr-only"> pending</span>
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
