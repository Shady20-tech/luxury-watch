'use client';

import { useEffect } from 'react';

/**
 * Route-level error boundary.
 *
 * Next.js passes a `reset` function that re-renders the segment. The digest is
 * shown rather than the message, because the message can contain internal
 * detail; the digest is what an operator uses to find the matching server log.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server has already logged the full error. This records the client
    // side so the two can be correlated by digest.
    console.error('Route error boundary caught an error', {
      digest: error.digest,
      name: error.name,
    });
  }, [error]);

  return (
    <main
      id="main-content"
      className="container-page flex flex-1 flex-col items-center justify-center py-24 text-center"
    >
      <p className="text-danger-600 text-sm font-semibold tracking-[0.2em] uppercase">
        Something went wrong
      </p>
      <h1 className="mt-4 text-4xl sm:text-5xl">We could not load this page</h1>
      <p className="text-foreground-muted mt-4 max-w-prose">
        An unexpected error occurred. You can try again, and if it keeps happening please contact us
        and quote the reference below.
      </p>

      {error.digest ? (
        <p className="text-foreground-muted mt-6 font-mono text-xs">
          Reference: <span className="text-foreground">{error.digest}</span>
        </p>
      ) : null}

      <button
        type="button"
        onClick={reset}
        className="bg-gold-700 text-surface-0 hover:bg-ink-900 focus-visible:bg-ink-900 mt-8 rounded-sm px-6 py-3 text-sm font-semibold transition-colors"
      >
        Try again
      </button>
    </main>
  );
}
