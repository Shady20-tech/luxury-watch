import Link from 'next/link';

/**
 * The not-found page for every route under the public shell.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS EXISTS IN ADDITION TO `src/app/not-found.tsx`
 * -----------------------------------------------------------------------------
 *
 * A `notFound()` thrown by a page inside the `(site)` group is rendered by the
 * nearest `not-found` boundary. The root one sits *outside* this group, so it
 * replaces the whole layout — header, footer and all — with a bare page. A
 * visitor who mistyped a product slug then loses every way back into the site
 * except the two buttons on the error page, which is a worse answer than a 404
 * inside the normal chrome.
 *
 * Declaring the boundary here means the refusal keeps the header and footer and
 * the visitor keeps their bearings. The status is still 404: this file changes
 * what a not-found looks like, not what it means.
 *
 * This file deliberately renders neither `SiteHeader`/`SiteFooter` nor a
 * `<main>`: it is rendered *inside* `(site)/layout.tsx`, which supplies both.
 * Rendering them here as well produced two headers and two footers on every
 * unmatched route, and a `<main>` inside the layout's own `<main>` — a duplicate
 * landmark that a screen reader announces twice. The browser check caught it;
 * reading this file in isolation would not.
 */
export default function SiteNotFound() {
  return (
    <div className="container-page flex flex-col items-center justify-center py-24 text-center">
      <p className="text-accent-text text-sm font-semibold tracking-[0.2em] uppercase">Error 404</p>
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
    </div>
  );
}
