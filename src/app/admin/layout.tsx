import type { ReactNode } from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LogOut, ShieldAlert } from 'lucide-react';

import { AdminMobileNav, AdminNav, type AdminNavGroup } from '@/components/admin/admin-nav';
import { UserAvatar } from '@/components/account/user-avatar';
import { heldBy, landingSectionFor, mayEnterSection, maySeeOverview } from '@/lib/admin/sections';
import { logoutAction } from '@/server/actions/auth-actions';
import { fetchAvatarUrl } from '@/server/repositories/auth-repository';
import { getAccountAccess, loginPathFor } from '@/server/services/authorization-service';
import { getAdminIdentity, type AdminIdentity } from '@/server/services/admin-authorization';

/**
 * The administration shell, and the guard that protects every route inside it.
 *
 * -----------------------------------------------------------------------------
 * WHY THE GUARD IS IN THE LAYOUT
 * -----------------------------------------------------------------------------
 *
 * A Next.js layout wraps every page beneath it, so a check here runs for every
 * `/admin/*` route — including ones added later. A guard copied into each page
 * would work until someone added a page and forgot, and the failure mode of that
 * omission is a page that renders administrative data to anybody. The layout
 * cannot be forgotten.
 *
 * This matters more here than in the account area, because the admin pages read
 * through the service-role client, which bypasses RLS entirely. The layout is the
 * only thing standing between an anonymous request and the full table.
 *
 * -----------------------------------------------------------------------------
 * THREE OUTCOMES, NOT TWO
 * -----------------------------------------------------------------------------
 *
 *   - Not signed in          → sign in, then come back to the page they wanted.
 *   - Signed in, not staff   → a 404-shaped refusal. Not a redirect to the
 *                              storefront: telling a customer "you are not an
 *                              administrator" confirms the section exists and
 *                              is theirs to probe. `notFound()` renders the same
 *                              page as a URL that was never real.
 *   - Signed in as staff     → the shell, with only the sections they may use.
 *
 * -----------------------------------------------------------------------------
 * WHY `force-dynamic`
 * -----------------------------------------------------------------------------
 *
 * This route reads cookies to resolve the session. A cookie-reading route that
 * Next.js treats as static fails at request time in a production build with
 * "Page changed from static to dynamic at runtime" and returns a 500. `next dev`
 * does not reproduce it. Declaring the route dynamic is the documented fix (see
 * AGENTS.md), and it is honest here: every admin page is per-session and must
 * never be cached or shared.
 */
export const dynamic = 'force-dynamic';

/** Build the navigation from what the caller may actually use.
 *
 * Counts are deliberately not passed in: this layout renders for every admin
 * page, and running eight count queries on every one of them to put a number
 * beside a link would make every page pay for the dashboard's figures. The
 * dashboard shows the counts; the navigation shows the sections.
 *
 * The permission map is imported rather than duplicated, so a link and the guard
 * that protects its target cannot disagree about who may follow it.
 */
function buildNav(identity: AdminIdentity): AdminNavGroup[] {
  const held = heldBy(identity);
  const may = (href: string): boolean => mayEnterSection(href, held);

  const groups: AdminNavGroup[] = [
    // The overview reports across every section, which is an administrator's
    // page. A single-section manager is offered their own section instead, so the
    // link is shown only to an administrator — the same rule the page applies.
    ...(maySeeOverview(identity.isAdmin)
      ? [{ heading: 'Overview', items: [{ href: '/admin', label: 'Dashboard' }] }]
      : []),
  ];

  const catalogue = [
    { href: '/admin/products', label: 'Products' },
    { href: '/admin/inventory', label: 'Inventory' },
  ].filter((i) => may(i.href));

  const customers = [
    { href: '/admin/orders', label: 'Order requests' },
    { href: '/admin/inquiries', label: 'Enquiries' },
    { href: '/admin/appointments', label: 'Appointments' },
    { href: '/admin/customers', label: 'Customers' },
  ].filter((i) => may(i.href));

  // The content section is one entry rather than ten. Its own index decides
  // which editors this account may use, so the sidebar stays short and a
  // content manager still reaches every screen they hold.
  const system = [
    { href: '/admin/settings', label: 'Content & settings' },
    { href: '/admin/audit', label: 'Audit trail' },
    // The staff screen is gated on the SUPER_ADMIN role, not on a permission,
    // and `may` applies exactly that rule — so the entry appears only for a role
    // that can use it, with no second copy of the rule here.
    { href: '/admin/staff', label: 'Staff & roles' },
  ].filter((i) => may(i.href));

  if (catalogue.length > 0) groups.push({ heading: 'Catalogue', items: catalogue });
  if (customers.length > 0) groups.push({ heading: 'Customers', items: customers });
  if (system.length > 0) groups.push({ heading: 'System', items: system });

  // Always present: every staff member has a profile and a password, whatever
  // their role, so this item needs no permission check.
  groups.push({ heading: 'Account', items: [{ href: '/admin/account', label: 'Your account' }] });

  return groups;
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const identity = await getAdminIdentity();

  if (!identity) {
    // Distinguish "not signed in" from "signed in but not staff". A signed-out
    // visitor is sent to sign in with the destination preserved; a signed-in
    // customer is refused here, because sending them to sign in would bounce
    // them straight back into this layout and loop.
    const access = await getAccountAccess();

    if (!access) {
      const headerList = await headers();
      const requestedPath = headerList.get('x-pathname') ?? '/admin';
      // Only a path under `/admin` is trusted as a return destination. The
      // header is set by our own middleware, but a value that arrived another
      // way must not become a redirect target; the sign-in action validates it
      // again before navigating.
      const returnTo = requestedPath.startsWith('/admin') ? requestedPath : '/admin';
      redirect(loginPathFor(returnTo));
    }

    // Signed in, but holds no staff role. Refusing here rather than redirecting
    // keeps the section's existence out of the response for a customer who
    // guessed the URL.
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-24">
        <div className="border-line-300 rounded-md border p-8 text-center">
          <ShieldAlert aria-hidden="true" className="text-ink-300 mx-auto mb-4 h-8 w-8" />
          <h1 className="text-xl">Not available</h1>
          <p className="text-foreground-muted mt-3 text-sm">
            This page is not available to your account. If you believe you should have access,
            contact the site administrator.
          </p>
          <p className="mt-6">
            <Link
              href="/"
              className="text-accent-text text-sm font-medium underline-offset-4 hover:underline"
            >
              Return to the store
            </Link>
          </p>
        </div>
      </main>
    );
  }

  // The avatar is the only profile field this shell needs. A missing row is not
  // an error here — the layout's job is to render the page, and an initial is a
  // correct fallback.
  const avatarUrl = await fetchAvatarUrl(identity.userId);

  const headerList = await headers();
  const requestedPath = headerList.get('x-pathname') ?? '';

  // ---------------------------------------------------------------------------
  // THE SECTION GUARD
  // ---------------------------------------------------------------------------
  //
  // A staff member may hold a role that does not include this section — a
  // CONTENT_MANAGER has no business in inventory, an INVENTORY_MANAGER none in
  // the audit trail. Each page asserts its own permission, but that assertion
  // *throws*, and an uncaught throw in a Server Component becomes the generic
  // error page with a 500. That is the wrong answer twice over: it is a server
  // error for a perfectly ordinary refusal, and it tells the caller their
  // request failed rather than that it was never theirs to make.
  //
  // This branch is the *presentation* half of the refusal, not the security
  // half. Next.js renders a layout and its page segment concurrently, so not
  // placing `children` in the tree does not stop the page function running — the
  // page's own `requirePermission` is what actually denies access, and every
  // admin page checks it before reading any row. What this branch adds is a
  // clean, in-shell "not available" panel instead of a 500, with the sidebar
  // still offering the sections the caller can use. A bare error page would
  // strand them on a dead end.
  //
  // The path comes from `x-pathname`, set by our middleware. It is attacker
  // influenced in principle, so it is only used to *narrow* what is rendered:
  // an unknown or malformed path matches no section and is treated as open, and
  // the page's own check still stands behind this one.
  const held = heldBy(identity);
  const sectionRefused =
    requestedPath.startsWith('/admin') && !mayEnterSection(requestedPath, held);

  return (
    <div className="bg-surface-50 min-h-dvh lg:flex">
      <a
        href="#admin-content"
        className="focus:bg-ink-900 focus:text-surface-0 sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {/* The rail is the shell's left edge on a wide viewport: full height, dark,
          and sticky, so the section list stays put while a long table scrolls.
          Below `lg` it collapses to a toggle inside the header area and becomes a
          drawer. The dark ground is what makes the admin read as a different
          place from the storefront rather than a page of it. */}
      <aside className="bg-night-900 hidden w-auto shrink-0 p-3 lg:sticky lg:top-0 lg:block lg:h-dvh lg:w-auto">
        <AdminNav groups={buildNav(identity)} />
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-line-300 bg-surface-0/90 sticky top-0 z-30 border-b backdrop-blur">
          <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-baseline gap-3">
              <Link href="/admin" className="text-base font-semibold">
                Administration
              </Link>
              <Link
                href="/"
                className="text-foreground-muted hover:text-ink-900 text-xs underline-offset-4 hover:underline"
              >
                View store
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/admin/account"
                className="focus-visible:outline-gold-700 flex items-center gap-2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <UserAvatar url={avatarUrl} name={identity.email} size="sm" />
                <span className="text-foreground-muted hidden text-xs sm:block">
                  {identity.email ?? 'Signed in'}
                  {identity.roles.length > 0 ? (
                    <span className="text-ink-500"> · {identity.roles.join(', ')}</span>
                  ) : null}
                </span>
                <span className="sr-only">Your account</span>
              </Link>
              {/* A real form, not a link: signing out is a state change, and a
                  link would be followed by a prefetch or a crawler. */}
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="text-ink-700 hover:text-ink-900 focus-visible:outline-gold-700 inline-flex items-center gap-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          {/* The mobile section toggle lives here, above the page content, so it
              is the first thing above a table on a phone. On desktop the rail is
              already visible and the component renders nothing at `lg`. */}
          <div className="mb-5 lg:hidden">
            <AdminMobileNav groups={buildNav(identity)} />
          </div>

          {/* `min-w-0` lets the content column shrink below its content width, so
              a wide table cannot force the page to scroll sideways on a narrow
              viewport. */}
          <main id="admin-content" className="min-w-0">
            {sectionRefused ? (
              <div className="border-line-300 mx-auto max-w-lg rounded-md border p-8 text-center">
                <ShieldAlert aria-hidden="true" className="text-ink-300 mx-auto mb-4 h-8 w-8" />
                <h1 className="text-xl">Not available</h1>
                <p className="text-foreground-muted mt-3 text-sm">
                  This section is not part of your role
                  {identity.roles.length > 0
                    ? ` (${identity.roles.join(', ').toLowerCase().replace(/_/g, ' ')})`
                    : ''}
                  . If you need access, ask a super administrator to review your role.
                </p>
                <p className="mt-6">
                  <Link
                    href={landingSectionFor(held)}
                    className="text-accent-text text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Go to a section you can use
                  </Link>
                </p>
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
