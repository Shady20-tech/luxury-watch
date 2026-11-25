import { notFound } from 'next/navigation';

/**
 * Catch-all for an address under `/admin` that matches no page.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS NEEDED AT ALL
 * -----------------------------------------------------------------------------
 *
 * `src/app/admin/not-found.tsx` only renders when a page *calls* `notFound()`.
 * A URL that matches no route at all — `/admin/typo`, or a section that was
 * renamed — is resolved by Next.js against the root instead, so before this file
 * existed it rendered the storefront's 404: shop header, shop footer and all. An
 * administrator who mistyped a console URL landed on a page that looked like the
 * public site, and a signed-out visitor was shown the public chrome for a path
 * that was never public.
 *
 * A catch-all segment claims those addresses first, so they resolve *inside* the
 * admin layout: the guard runs (a signed-out visitor is sent to sign in exactly
 * as they would be for `/admin`), and a signed-in staff member gets the console
 * shell with its sidebar. The page body then raises `notFound()`, which renders
 * the existing admin 404 in place of the content — one 404 component, two ways to
 * reach it, and both inside the console.
 *
 * The static segments under `/admin` take precedence over this catch-all, so no
 * real section is shadowed. The status code is 404: `notFound()` sets it.
 */
export default function AdminCatchAllPage(): never {
  notFound();
}
