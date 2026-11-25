'use client';

import { useEffect } from 'react';

/**
 * The error boundary for routes under the public shell.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS EXISTS IN ADDITION TO `src/app/error.tsx`
 * -----------------------------------------------------------------------------
 *
 * The root boundary sits outside the `(site)` group, so when a public page
 * throws, the boundary replaces the layout and the visitor loses the header and
 * footer. An error page that strips every navigation link strands the visitor on
 * the one page where they most need a way out.
 *
 * This boundary is declared inside the group, so it catches the same errors and
 * renders inside the normal chrome. The root boundary stays as the fallback for
 * failures that happen before the group is reached.
 *
 * It has to be a Client Component — `reset` is a client callback and error
 * boundaries only work on the client — but that is fine: the chrome around it is
 * server-rendered by the layout, and this component only owns the message.
 */
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server has already logged the full error. This records the client side
    // so the two can be correlated by digest. The message is not logged: it can
    // carry data a visitor should not have echoed back to a console.
    console.error('Site error boundary caught an error', {
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
        className="bg-gold-700 text-surface-0 hover:bg-ink-900 focus-visible:outline-gold-700 mt-8 rounded-sm px-6 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Try again
      </button>
    </main>
  );
}
