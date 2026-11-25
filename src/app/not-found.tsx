import Link from 'next/link';

import { SiteFooter } from '@/components/chrome/site-footer';
import { SiteHeader } from '@/components/chrome/site-header';
import { getChrome } from '@/server/services/chrome-service';

/**
 * Global not-found UI for a URL that matched no route at all.
 *
 * It renders the site chrome itself because it sits outside the `(site)` group
 * and therefore outside that group's layout: without this, an unmatched URL
 * would answer with a bare page and no navigation. Routes *inside* the group
 * that call `notFound()` are handled by `src/app/(site)/not-found.tsx`, and the
 * admin area by `src/app/admin/not-found.tsx`, so those keep their own shells.
 *
 * Status 404 is set by Next.js, not here.
 */
export default async function NotFound() {
  const chrome = await getChrome();

  return (
    <>
      <SiteHeader data={chrome} />

      <main
        id="main-content"
        className="container-page flex flex-1 flex-col items-center justify-center py-24 text-center"
      >
        <p className="text-accent-text text-sm font-semibold tracking-[0.2em] uppercase">
          Error 404
        </p>
        <h1 className="mt-4 text-4xl sm:text-5xl">Page not found</h1>
        <p className="text-foreground-muted mt-4 max-w-prose">
          The page you are looking for does not exist, or it may have moved. Check the address, or
          start again from the home page.
        </p>

        <nav aria-label="Helpful links" className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="bg-gold-700 text-surface-0 hover:bg-ink-900 focus-visible:outline-gold-700 rounded-sm px-6 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Back to home
          </Link>
          <Link
            href="/shop"
            className="border-line-300 text-ink-900 hover:border-line-400 focus-visible:outline-gold-700 rounded-sm border px-6 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Browse the catalogue
          </Link>
        </nav>
      </main>

      <SiteFooter data={chrome} />
    </>
  );
}
