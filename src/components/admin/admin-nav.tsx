'use client';

import {
  ArrowUpRight,
  Boxes,
  CalendarClock,
  ChevronDown,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  Store,
  Tag,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * The administration sidebar.
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
 * -----------------------------------------------------------------------------
 * THREE MODES, ONE COMPONENT
 * -----------------------------------------------------------------------------
 *
 *   - Expanded rail (default)  A labelled column, 15rem wide, on a dark ground.
 *   - Collapsed rail           Icons only, 4.5rem wide. The label is still the
 *                              accessible name (an `sr-only` span, plus a
 *                              `title` for a mouse), so collapsing hides the
 *                              text but never the meaning.
 *   - Mobile drawer            Below `lg` the rail is replaced by a toggle. The
 *                              drawer is a modal panel with a backdrop, Escape
 *                              to close, and no page scroll behind it.
 *
 * The collapse preference is remembered in `localStorage` and read in an effect,
 * never during render, so the server markup and the first client render agree —
 * reading storage during render is the classic way to produce a hydration
 * mismatch, and a sidebar that flickers between two widths on every navigation
 * is worse than one that starts expanded.
 *
 * -----------------------------------------------------------------------------
 * WHY THE ACTIVE ITEM IS BOTH A FILL AND AN ATTRIBUTE
 * -----------------------------------------------------------------------------
 *
 * `aria-current="page"` is the machine-readable part; the filled row and the gold
 * rule are the human-readable part. Both are needed: colour alone is invisible to
 * a screen reader and to anyone with a colour-vision difference, and the
 * attribute alone gives no visual anchor in a list of ten links.
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
  '/admin/account': UserRound,
};

const STORAGE_KEY = 'lw.admin.sidebar.collapsed';

/** `/admin` would otherwise match every route as a prefix. */
function isActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
}

function navLinkClass(active: boolean, collapsed: boolean): string {
  return cn(
    'focus-visible:outline-gold-300 group relative flex items-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
    collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
    active
      ? 'text-on-night bg-white/10 font-medium'
      : 'text-on-night-muted hover:text-on-night hover:bg-white/5',
  );
}

function NavItems({
  groups,
  pathname,
  collapsed,
  onNavigate,
}: {
  groups: AdminNavGroup[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.heading} className="mb-5 last:mb-0">
          {collapsed ? (
            /* A collapsed rail still needs its group boundaries, or eleven icons
               in a column read as one undifferentiated list. */
            <div aria-hidden="true" className="mx-auto mb-2 h-px w-6 bg-white/10" />
          ) : (
            <h2 className="text-on-night-muted mb-1.5 px-3 text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              {group.heading}
            </h2>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = ICONS[item.href] ?? LayoutDashboard;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    className={navLinkClass(active, collapsed)}
                  >
                    {/* The rule earns its place only when collapsed, where the
                        fill alone is easy to miss at a glance. */}
                    {collapsed && active ? (
                      <span
                        aria-hidden="true"
                        className="bg-gold-300 absolute top-1/2 -left-2 h-6 w-0.5 -translate-y-1/2 rounded-full"
                      />
                    ) : null}
                    <Icon
                      aria-hidden="true"
                      className={cn(
                        'h-[1.125rem] w-[1.125rem] shrink-0',
                        active && 'text-gold-300',
                      )}
                    />
                    <span className={cn('min-w-0 flex-1 truncate', collapsed && 'sr-only')}>
                      {item.label}
                    </span>
                    {item.badge ? (
                      <span
                        className={cn(
                          'bg-gold-300 text-night-950 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                          collapsed && 'sr-only',
                        )}
                      >
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
    </>
  );
}

/** The route back to the storefront. Shared by both rails and the drawer. */
function StoreLink({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/"
      title={collapsed ? 'View the storefront' : undefined}
      className={cn(
        'focus-visible:outline-gold-300 text-on-night flex items-center rounded-md border border-white/15 transition-colors hover:border-white/40 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2',
        collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2.5',
      )}
    >
      <Store aria-hidden="true" className="h-[1.125rem] w-[1.125rem] shrink-0" />
      <span className={cn('min-w-0 flex-1 text-sm font-medium', collapsed && 'sr-only')}>
        View the storefront
      </span>
      {collapsed ? null : (
        <ArrowUpRight aria-hidden="true" className="text-on-night-muted h-3.5 w-3.5 shrink-0" />
      )}
    </Link>
  );
}

export function AdminNav({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Read the preference after mount. Reading it during render would make the
  // first client render disagree with the server's, which is a hydration error
  // rather than a cosmetic flicker.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* Storage can be disabled; the expanded default is correct then. */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* The in-memory state is still right for this session. */
      }
      return next;
    });
  }, []);

  return (
    <nav
      aria-label="Administration"
      className={cn(
        'bg-night-900 flex h-full flex-col rounded-lg p-3 transition-[width] duration-200',
        collapsed ? 'w-[4.5rem]' : 'w-[15rem]',
      )}
    >
      <div className={cn('mb-4', collapsed ? 'flex justify-center' : 'px-1')}>
        <span className={cn('text-on-night text-sm font-semibold', collapsed && 'sr-only')}>
          Administration
        </span>
        {collapsed ? (
          <span aria-hidden="true" className="text-gold-300 text-lg font-semibold">
            A
          </span>
        ) : null}
      </div>

      <div className="mb-5">
        <StoreLink collapsed={collapsed} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <NavItems groups={groups} pathname={pathname} collapsed={collapsed} />
      </div>

      <div className="mt-4 border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-pressed={collapsed}
          title={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
          className={cn(
            'focus-visible:outline-gold-300 text-on-night-muted hover:text-on-night flex w-full items-center rounded-md transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2',
            collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2.5',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" />
          ) : (
            <PanelLeftClose aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" />
          )}
          <span className={cn('text-sm', collapsed && 'sr-only')}>Collapse</span>
        </button>
      </div>
    </nav>
  );
}

/**
 * The section navigation on a narrow viewport.
 *
 * A separate export rather than a branch inside `AdminNav`, because the two live
 * in different places in the shell: the rail is the page's left edge and the
 * toggle sits in the content flow below the header. Rendering one component in
 * both positions would duplicate its state and its DOM.
 */
export function AdminMobileNav({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  // Escape closes the drawer and the page must not scroll behind it. Both are
  // bound only while it is open, so a closed drawer leaves no global listeners.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="admin-mobile-nav"
        className="border-line-300 bg-surface-0 text-ink-900 focus-visible:outline-gold-700 flex w-full items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        <Menu aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Sections</span>
        <ChevronDown aria-hidden="true" className="text-ink-500 h-4 w-4 shrink-0" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="bg-scrim absolute inset-0" onClick={close} aria-hidden="true" />
          <div
            id="admin-mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Administration"
            className="bg-night-900 shadow-lg absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col overflow-y-auto p-3"
          >
            <div className="mb-4 flex items-center justify-between px-1">
              <span className="text-on-night text-sm font-semibold">Administration</span>
              <button
                type="button"
                onClick={close}
                className="text-on-night-muted hover:text-on-night focus-visible:outline-gold-300 rounded-sm p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <X aria-hidden="true" className="h-4 w-4" />
                <span className="sr-only">Close navigation</span>
              </button>
            </div>

            <div className="mb-5">
              <StoreLink collapsed={false} />
            </div>

            <nav aria-label="Administration">
              <NavItems groups={groups} pathname={pathname} collapsed={false} onNavigate={close} />
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
