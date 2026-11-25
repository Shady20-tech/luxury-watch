import Link from 'next/link';

/**
 * Not-found page for the administration area.
 *
 * Declared here rather than relying on the root `not-found.tsx`, because the
 * root one renders outside every layout and would give an admin a bare page with
 * no way back into the console. More importantly, the public shell's 404 renders
 * the storefront header and footer — an administrator who mistypes an admin URL
 * should land back inside the console, not on the shop.
 *
 * A guard is unnecessary: the admin layout has already run and redirected an
 * unauthorised visitor before this page can render.
 */
export default function AdminNotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start py-20">
      <p className="text-sm font-semibold tracking-[0.2em] uppercase">Error 404</p>
      <h1 className="mt-3 text-3xl">That admin page does not exist</h1>
      <p className="mt-3 text-sm">
        The address may be mistyped, or the section may have been renamed. Nothing has changed in
        the database.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/admin"
          className="rounded-sm px-5 py-2.5 text-sm font-semibold transition-colors"
        >
          Back to the dashboard
        </Link>
        <Link href="/" className="rounded-sm border px-5 py-2.5 text-sm font-semibold">
          View the storefront
        </Link>
      </div>
    </div>
  );
}
