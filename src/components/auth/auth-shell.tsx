import type { ReactNode } from 'react';

/**
 * The frame the sign-in, registration and password forms sit in.
 *
 * -----------------------------------------------------------------------------
 * NO PHOTOGRAPH, BY DESIGN
 * -----------------------------------------------------------------------------
 *
 * This replaced a photographic band that opened every auth page. The brief is
 * explicit that the account screens carry no hero: a customer arriving here has
 * one job, and a wall of watch photography above a form pushes the fields below
 * the fold on a laptop. The reference register is kept by other means — the
 * serif title, a warm ground, a gold hairline and a lot of air — rather than by
 * an image.
 *
 * -----------------------------------------------------------------------------
 * WHY THE `h1` LIVES IN THE PANEL
 * -----------------------------------------------------------------------------
 *
 * `AuthPanel` renders the page's only `h1`. The decorative pieces here are
 * `aria-hidden` and carry no heading, so the page never has two titles, and the
 * document outline starts with the form's own name.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface-page relative isolate min-h-[calc(100dvh-4rem)] overflow-hidden">
      {/* A very soft gold wash in the corner, so the empty ground reads as a lit
          room rather than a blank page. It is a gradient, not a fill: no text is
          ever placed on the saturated part, so it cannot affect contrast. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,var(--color-gold-100)_0%,transparent_55%),radial-gradient(ellipse_at_bottom_left,var(--color-surface-warm)_0%,transparent_50%)]"
      />
      {/* A single hairline down the left edge of the content column echoes the
          rules used in the page heroes, so the auth screens read as part of the
          site without borrowing a hero. */}
      <div className="container-page flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center py-14 sm:py-20">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
