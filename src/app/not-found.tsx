import Link from 'next/link';

/**
 * Global not-found UI. Rendered for unmatched routes and for `notFound()` calls
 * in Server Components. Status 404 is set by Next.js.
 */
export default function NotFound() {
  return (
    <main
      id="main-content"
      className="container-page flex flex-1 flex-col items-center justify-center py-24 text-center"
    >
      <p className="text-accent-text text-sm font-semibold tracking-[0.2em] uppercase">Error 404</p>
      <h1 className="mt-4 text-4xl sm:text-5xl">Page not found</h1>
      <p className="text-foreground-muted mt-4 max-w-prose">
        The page you are looking for does not exist, or it may have moved. Check the address, or
        start again from the home page.
      </p>

      <nav aria-label="Helpful links" className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="bg-accent text-on-accent hover:bg-ink-900 focus-visible:bg-ink-900 rounded-sm px-6 py-3 text-sm font-semibold transition-colors"
        >
          Back to home
        </Link>
        <Link
          href="/collections"
          className="border-border hover:border-accent-text hover:text-accent-text rounded-sm border px-6 py-3 text-sm font-semibold transition-colors"
        >
          Browse the catalogue
        </Link>
      </nav>
    </main>
  );
}
