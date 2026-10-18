import { Search } from 'lucide-react';

import { catalogueHiddenInputs, type CatalogueParams } from '@/lib/catalogue/params';

/**
 * The search form.
 *
 * A plain `GET` form, for the same reasons as the sort control: it works without
 * JavaScript, it produces a real shareable URL, and there is no client state to
 * drift from the query string.
 *
 * The active filters travel as hidden inputs so that searching from a filtered
 * listing narrows the results rather than silently discarding the filters the
 * visitor had already set. `q` and `page` are excluded because the form supplies
 * them itself.
 */
export function SearchForm({
  params,
  defaultQuery,
}: {
  params?: CatalogueParams;
  defaultQuery: string;
}) {
  const hidden = params ? catalogueHiddenInputs(params, ['q', 'page']) : [];

  return (
    <form method="get" action="/search" role="search" className="flex max-w-xl gap-2">
      {hidden.map((input) => (
        <input key={input.name} type="hidden" name={input.name} value={input.value} />
      ))}

      <label htmlFor="catalogue-search" className="sr-only">
        Search the catalogue
      </label>
      <input
        id="catalogue-search"
        type="search"
        name="q"
        defaultValue={defaultQuery}
        placeholder="Reference number, brand, model…"
        autoComplete="off"
        className="border-line-300 bg-surface-0 focus-visible:border-ink-900 h-11 min-w-0 flex-1 rounded-sm border px-3 text-sm"
      />
      <button
        type="submit"
        className="bg-gold-700 text-surface-0 hover:bg-ink-900 inline-flex h-11 items-center gap-2 rounded-sm px-5 text-sm font-medium"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
        Search
      </button>
    </form>
  );
}
