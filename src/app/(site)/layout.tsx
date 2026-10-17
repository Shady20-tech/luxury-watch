import type { ReactNode } from 'react';

import { AgeGateDialog } from '@/components/chrome/age-gate';
import { SiteFooter } from '@/components/chrome/site-footer';
import { SiteHeader } from '@/components/chrome/site-header';
import { getChrome } from '@/server/services/chrome-service';

/**
 * Public site shell.
 *
 * Every public route lives under this group, so the header and footer are
 * rendered once and the chrome query runs once per request (it is wrapped in
 * `cache()`). Admin routes will live outside this group and get their own shell.
 *
 * This is a Server Component: `getChrome()` reads from the database on the
 * server, and only the genuinely interactive pieces of chrome are Client
 * Components.
 *
 * `revalidate` is the honest trade-off for the chrome. The layout reads the
 * database, so without it every public page would be fully dynamic and each
 * request would pay for six navigation queries. With it, pages are prerendered
 * and the chrome is refreshed at most every five minutes.
 *
 * The consequence to be aware of: a navigation change made in the admin is
 * visible within five minutes, not instantly. That is the right trade for a
 * menu and a footer. Anything that must be instant — stock levels, a product's
 * price — belongs in a dynamic route that opts out of this, not in the chrome.
 * When the admin is built (Phase 10), editing navigation should call
 * `revalidatePath('/', 'layout')` so a change is immediate for the editor.
 */
export const revalidate = 300;

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const chrome = await getChrome();

  return (
    <div className="flex min-h-dvh flex-col">
      {/* The skip link lives in the root layout and targets `#main-content`,
          which is why this <main> uses that id. */}
      <SiteHeader data={chrome} />

      <main id="main-content" className="flex-1">
        {children}
      </main>

      <SiteFooter data={chrome} />

      {/* The gate is a Client Component because the visitor's answer lives in
          `localStorage`, which the server cannot read. It renders nothing until
          that answer is known, so it is not in the first paint and a returning
          visitor never sees it flash. */}
      <AgeGateDialog ageGate={chrome.ageGate} />
    </div>
  );
}
