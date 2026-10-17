'use client';

/**
 * Last-resort error boundary, used when the root layout itself fails.
 *
 * This component replaces the entire document, so it must render its own
 * `<html>` and `<body>` and cannot rely on anything from the layout — including
 * the Tailwind stylesheet, which is imported by the layout. Styling is
 * therefore inline.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          color: '#222222',
          backgroundColor: '#ffffff',
          padding: '2rem',
        }}
      >
        <main style={{ maxWidth: '36rem', textAlign: 'center' }}>
          <p
            style={{
              margin: 0,
              fontSize: '0.875rem',
              fontWeight: 600,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#b3261e',
            }}
          >
            Critical error
          </p>
          <h1 style={{ marginTop: '1rem', fontSize: '2rem', fontWeight: 400 }}>
            The site could not be loaded
          </h1>
          <p style={{ marginTop: '1rem', color: '#666666', lineHeight: 1.6 }}>
            Something went wrong before the page could render. Please try again. If the problem
            continues, contact us and quote the reference below.
          </p>
          {error.digest ? (
            <p
              style={{
                marginTop: '1.5rem',
                fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                fontSize: '0.75rem',
                color: '#666666',
              }}
            >
              Reference: <span style={{ color: '#222222' }}>{error.digest}</span>
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '2rem',
              padding: '0.75rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#ffffff',
              backgroundColor: '#a18040',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
