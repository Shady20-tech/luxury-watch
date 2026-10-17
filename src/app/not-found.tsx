import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Global not-found UI. Rendered for unmatched routes and for `notFound()` calls
 * in Server Components. Status 404 is set by Next.js.
 *
 * The CTAs use the shared `Button` variants rather than hand-rolled classes:
 * `bg-accent` is the brand gold (gold-500, 3.7:1 on white) and is documented as
 * safe only for large text, so a normal-size white label on it fails WCAG AA.
 * The primary variant uses gold-700, which is contrast-checked.
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
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/collections/all">Browse the catalogue</Link>
        </Button>
      </nav>
    </main>
  );
}
