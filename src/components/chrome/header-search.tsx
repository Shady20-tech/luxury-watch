import { Search } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Header search field.
 *
 * A plain `GET` form posting to `/search`, exactly like `SearchForm` on the
 * search page. That matters more than it looks: it works with JavaScript
 * disabled, it produces a real shareable URL, and there is no client state to
 * drift from the query string. The search page already reads `q` through
 * `parseCatalogueParams`, so this needs no server work at all.
 *
 * The reference puts a full-width "Search products" field directly under the
 * wordmark, and it is the most prominent control in the header. It is kept
 * prominent here, but the label is a real `<label>` rather than a placeholder
 * alone: a placeholder is not an accessible name, and it disappears the moment
 * someone types.
 *
 * The `tone` prop follows the same convention as the rest of the chrome: it
 * describes the ground the control sits on, so a light field on the dark header
 * cannot be composed by accident.
 */
export function HeaderSearch({
  className,
  id = 'header-search',
}: {
  className?: string;
  id?: string;
}) {
  return (
    <form
      method="get"
      action="/search"
      role="search"
      className={cn('relative', className)}
      // The header is sticky and the field is inside it. Submitting scrolls to
      // the results on the search page, so nothing here needs to manage focus.
    >
      <label htmlFor={id} className="sr-only">
        Search the catalogue
      </label>
      <Search
        aria-hidden="true"
        className="text-on-night-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
      />
      <input
        id={id}
        type="search"
        name="q"
        placeholder="Search products"
        autoComplete="off"
        className={cn(
          // `bg-white/10` over the dark glass reads as a recessed field without
          // introducing a second glass layer. The focus ring is the global one.
          'h-11 w-full rounded-sm border border-white/20 bg-white/10 pr-3 pl-10 text-sm text-on-night',
          'placeholder:text-on-night-muted',
          'focus-visible:border-white/50 focus-visible:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300',
        )}
      />
    </form>
  );
}
