import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { AccountNav } from '@/components/account/account-nav';
import { getAccountAccess, loginPathFor } from '@/server/services/authorization-service';

/**
 * The account area shell, and the guard that protects every route inside it.
 *
 * -----------------------------------------------------------------------------
 * WHY THE GUARD IS IN THE LAYOUT
 * -----------------------------------------------------------------------------
 *
 * A Next.js layout wraps every page beneath it, so a check here runs for every
 * `/account/*` route — including ones added later. A guard on each page would
 * work until someone added a page and forgot, and the failure mode of that
 * omission is a page that renders another customer's data. The layout cannot be
 * forgotten.
 *
 * It is a Server Component, so the check happens before any of the page's data
 * fetching begins. The redirect short-circuits the render; the child page never
 * runs.
 *
 * -----------------------------------------------------------------------------
 * WHY `force-dynamic`
 * -----------------------------------------------------------------------------
 *
 * This route reads cookies (through the Supabase server client) to resolve the
 * session. Under a production build, a route that reads cookies *and* is treated
 * as static fails at request time with "Page changed from static to dynamic at
 * runtime" and returns a 500 — `next dev` does not reproduce it. Declaring the
 * route dynamic is the documented fix (see AGENTS.md), and it is honest here:
 * account pages are per-customer and must never be cached or shared.
 *
 * -----------------------------------------------------------------------------
 * THE REDIRECT PRESERVES THE DESTINATION, SAFELY
 * -----------------------------------------------------------------------------
 *
 * A signed-out visitor is sent to sign-in with `next` set to the page they
 * wanted, so they land there afterwards. The value is URL-encoded and validated
 * again by the sign-in action before it is navigated to, so it cannot be used as
 * an open redirect.
 *
 * This layout does not redirect a *signed-in* customer anywhere, and it performs
 * no role check. `/account` is for customers; staff standing is only relevant to
 * `/admin`, which has its own guard. Requiring staff here would lock a customer
 * out of their own orders.
 */
export const dynamic = 'force-dynamic';

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const access = await getAccountAccess();

  if (!access) {
    // Middleware forwards the pathname as `x-pathname`. Falling back to
    // `/account` covers a request that somehow skipped middleware, which is
    // possible when the matcher does not apply — better a generic destination
    // than an undefined one.
    const headerList = await headers();
    const requestedPath = headerList.get('x-pathname') ?? '/account';

    // Only a path under `/account` is trusted as a return destination. The
    // header is set by our own middleware, but a value that arrives some other
    // way must not become a redirect target; the sign-in action validates it
    // again before navigating.
    const returnTo = requestedPath.startsWith('/account') ? requestedPath : '/account';
    redirect(loginPathFor(returnTo));
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <p className="eyebrow">Account</p>
        <h1 className="mt-3 text-3xl">Your account</h1>
        <p className="text-foreground-muted mt-3 max-w-prose text-sm">
          {access.user.email ? `Signed in as ${access.user.email}` : 'Signed in.'}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr] lg:gap-12">
        <AccountNav />

        {/* `min-w-0` lets the content column shrink below its content width, so a
            long order reference or a wide table cannot force the page to scroll
            sideways on a narrow viewport. */}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
